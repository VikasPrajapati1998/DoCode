/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as docode from 'docode';
import { DocumentSelector } from '../configuration/documentSelector';
import * as languageIds from '../configuration/languageIds';
import { API } from '../tsServer/api';
import type * as Proto from '../tsServer/protocol/protocol';
import * as typeConverters from '../typeConverters';
import { ClientCapability, ITypeScriptServiceClient } from '../typescriptService';
import { readUnifiedConfig } from '../utils/configuration';
import FileConfigurationManager from './fileConfigurationManager';
import { conditionalRegistration, requireSomeCapability } from './util/dependentRegistration';
import { LanguageDescription } from '../configuration/languageDescription';

type RenameResponse = {
	readonly type: 'rename';
	readonly body: Proto.RenameResponseBody;
} | {
	readonly type: 'jsxLinkedEditing';
	readonly spans: readonly Proto.TextSpan[];
};

class TypeScriptRenameProvider implements docode.RenameProvider {

	public constructor(
		private readonly language: LanguageDescription,
		private readonly client: ITypeScriptServiceClient,
		private readonly fileConfigurationManager: FileConfigurationManager
	) { }

	public async prepareRename(
		document: docode.TextDocument,
		position: docode.Position,
		token: docode.CancellationToken
	): Promise<docode.Range | undefined> {
		const response = await this.execRename(document, position, token);
		if (!response) {
			return undefined;
		}

		switch (response.type) {
			case 'rename': {
				const renameInfo = response.body.info;
				if (!renameInfo.canRename) {
					return Promise.reject<docode.Range>(renameInfo.localizedErrorMessage);
				}
				return typeConverters.Range.fromTextSpan(renameInfo.triggerSpan);
			}
			case 'jsxLinkedEditing': {
				return response.spans
					.map(typeConverters.Range.fromTextSpan)
					.find(range => range.contains(position));
			}
		}
	}

	public async provideRenameEdits(
		document: docode.TextDocument,
		position: docode.Position,
		newName: string,
		token: docode.CancellationToken
	): Promise<docode.WorkspaceEdit | undefined> {
		const file = this.client.toOpenTsFilePath(document);
		if (!file) {
			return undefined;
		}

		const response = await this.execRename(document, position, token);
		if (!response || token.isCancellationRequested) {
			return undefined;
		}

		switch (response.type) {
			case 'rename': {
				const renameInfo = response.body.info;
				if (!renameInfo.canRename) {
					return Promise.reject<docode.WorkspaceEdit>(renameInfo.localizedErrorMessage);
				}

				if (renameInfo.fileToRename) {
					const edits = await this.renameFile(renameInfo.fileToRename, renameInfo.fullDisplayName, newName, token);
					if (edits) {
						return edits;
					} else {
						return Promise.reject<docode.WorkspaceEdit>(docode.l10n.t("An error occurred while renaming file"));
					}
				}

				return this.updateLocs(response.body.locs, newName);
			}
			case 'jsxLinkedEditing': {
				return this.updateLocs([{
					file,
					locs: response.spans.map((span): Proto.RenameTextSpan => ({ ...span })),
				}], newName);
			}
		}
	}

	public async execRename(
		document: docode.TextDocument,
		position: docode.Position,
		token: docode.CancellationToken
	): Promise<RenameResponse | undefined> {
		const file = this.client.toOpenTsFilePath(document);
		if (!file) {
			return undefined;
		}

		// Prefer renaming matching jsx tag when available
		if (this.client.apiVersion.gte(API.v510) &&
			readUnifiedConfig<boolean>('preferences.renameMatchingJsxTags', true, { scope: document, fallbackSection: this.language.id }) &&
			this.looksLikePotentialJsxTagContext(document, position)
		) {
			const args = typeConverters.Position.toFileLocationRequestArgs(file, position);
			const response = await this.client.execute('linkedEditingRange', args, token);
			if (response.type !== 'response' || !response.body) {
				return undefined;
			}

			return { type: 'jsxLinkedEditing', spans: response.body.ranges };
		}

		const args: Proto.RenameRequestArgs = {
			...typeConverters.Position.toFileLocationRequestArgs(file, position),
			findInStrings: false,
			findInComments: false
		};

		return this.client.interruptGetErr(async () => {
			this.fileConfigurationManager.ensureConfigurationForDocument(document, token);
			const response = await this.client.execute('rename', args, token);
			if (response.type !== 'response' || !response.body) {
				return undefined;
			}
			return { type: 'rename', body: response.body };
		});
	}

	private looksLikePotentialJsxTagContext(document: docode.TextDocument, position: docode.Position): boolean {
		if (![languageIds.typescriptreact, languageIds.javascript, languageIds.javascriptreact].includes(document.languageId)) {
			return false;
		}

		const prefix = document.getText(new docode.Range(position.line, 0, position.line, position.character));
		return /\<\/?\s*[\w\d_$.]*$/.test(prefix);
	}

	private updateLocs(
		locations: ReadonlyArray<Proto.SpanGroup>,
		newName: string
	) {
		const edit = new docode.WorkspaceEdit();
		for (const spanGroup of locations) {
			const resource = this.client.toResource(spanGroup.file);
			for (const textSpan of spanGroup.locs) {
				edit.replace(resource, typeConverters.Range.fromTextSpan(textSpan),
					(textSpan.prefixText || '') + newName + (textSpan.suffixText || ''));
			}
		}
		return edit;
	}

	private async renameFile(
		fileToRename: string,
		fullDisplayName: string,
		newName: string,
		token: docode.CancellationToken,
	): Promise<docode.WorkspaceEdit | undefined> {
		// Make sure we preserve file extension if extension is unchanged or none provided
		if (!path.extname(newName)) {
			newName += path.extname(fileToRename);
		}
		else if (path.extname(newName) === path.extname(fullDisplayName)) {
			newName = newName.slice(0, newName.length - path.extname(newName).length) + path.extname(fileToRename);
		}

		const dirname = path.dirname(fileToRename);
		const newFilePath = path.join(dirname, newName);

		const args: Proto.GetEditsForFileRenameRequestArgs & { file: string } = {
			file: fileToRename,
			oldFilePath: fileToRename,
			newFilePath: newFilePath,
		};
		const response = await this.client.execute('getEditsForFileRename', args, token);
		if (response.type !== 'response' || !response.body) {
			return undefined;
		}

		const edits = typeConverters.WorkspaceEdit.fromFileCodeEdits(this.client, response.body);
		edits.renameFile(docode.Uri.file(fileToRename), docode.Uri.file(newFilePath));
		return edits;
	}
}

export function register(
	selector: DocumentSelector,
	language: LanguageDescription,
	client: ITypeScriptServiceClient,
	fileConfigurationManager: FileConfigurationManager,
) {
	return conditionalRegistration([
		requireSomeCapability(client, ClientCapability.Semantic),
	], () => {
		return docode.languages.registerRenameProvider(selector.semantic,
			new TypeScriptRenameProvider(language, client, fileConfigurationManager));
	});
}
