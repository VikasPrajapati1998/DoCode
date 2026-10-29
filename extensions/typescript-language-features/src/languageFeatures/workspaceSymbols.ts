/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as docode from 'docode';
import * as fileSchemes from '../configuration/fileSchemes';
import { doesResourceLookLikeAJavaScriptFile, doesResourceLookLikeATypeScriptFile } from '../configuration/languageDescription';
import { API } from '../tsServer/api';
import { parseKindModifier } from '../tsServer/protocol/modifiers';
import type * as Proto from '../tsServer/protocol/protocol';
import * as PConst from '../tsServer/protocol/protocol.const';
import * as typeConverters from '../typeConverters';
import { ITypeScriptServiceClient } from '../typescriptService';
import { coalesce } from '../utils/arrays';
import { readUnifiedConfig } from '../utils/configuration';

function getSymbolKind(item: Proto.NavtoItem): docode.SymbolKind {
	switch (item.kind) {
		case PConst.Kind.method: return docode.SymbolKind.Method;
		case PConst.Kind.enum: return docode.SymbolKind.Enum;
		case PConst.Kind.enumMember: return docode.SymbolKind.EnumMember;
		case PConst.Kind.function: return docode.SymbolKind.Function;
		case PConst.Kind.class: return docode.SymbolKind.Class;
		case PConst.Kind.interface: return docode.SymbolKind.Interface;
		case PConst.Kind.type: return docode.SymbolKind.Class;
		case PConst.Kind.memberVariable: return docode.SymbolKind.Field;
		case PConst.Kind.memberGetAccessor: return docode.SymbolKind.Field;
		case PConst.Kind.memberSetAccessor: return docode.SymbolKind.Field;
		case PConst.Kind.variable: return docode.SymbolKind.Variable;
		default: return docode.SymbolKind.Variable;
	}
}

class TypeScriptWorkspaceSymbolProvider implements docode.WorkspaceSymbolProvider {

	public constructor(
		private readonly client: ITypeScriptServiceClient,
		private readonly modeIds: readonly string[],
	) { }

	public async provideWorkspaceSymbols(
		search: string,
		token: docode.CancellationToken
	): Promise<docode.SymbolInformation[]> {
		let file: string | undefined;
		if (this.searchAllOpenProjects) {
			file = undefined;
		} else {
			const document = this.getDocument();
			file = document ? await this.toOpenedFiledPath(document) : undefined;

			if (!file && this.client.apiVersion.lt(API.v390)) {
				return [];
			}
		}

		const args: Proto.NavtoRequestArgs = {
			file,
			searchValue: search,
			maxResultCount: 256,
		};

		const response = await this.client.execute('navto', args, token);
		if (response.type !== 'response' || !response.body) {
			return [];
		}

		return coalesce(response.body.map(item => this.toSymbolInformation(item)));
	}

	private get searchAllOpenProjects() {
		return this.client.apiVersion.gte(API.v390)
			&& readUnifiedConfig<string>('workspaceSymbols.scope', 'allOpenProjects', { scope: null, fallbackSection: 'typescript' }) === 'allOpenProjects';
	}

	private async toOpenedFiledPath(document: docode.TextDocument) {
		if (document.uri.scheme === fileSchemes.git) {
			try {
				const path = docode.Uri.file(JSON.parse(document.uri.query)?.path);
				if (doesResourceLookLikeATypeScriptFile(path) || doesResourceLookLikeAJavaScriptFile(path)) {
					const document = await docode.workspace.openTextDocument(path);
					return this.client.toOpenTsFilePath(document);
				}
			} catch {
				// noop
			}
		}
		return this.client.toOpenTsFilePath(document);
	}

	private toSymbolInformation(item: Proto.NavtoItem): docode.SymbolInformation | undefined {
		if (item.kind === 'alias' && !item.containerName) {
			return;
		}

		const uri = this.client.toResource(item.file);
		if (fileSchemes.isOfScheme(uri, fileSchemes.chatCodeBlock)) {
			return;
		}

		const label = TypeScriptWorkspaceSymbolProvider.getLabel(item);
		const info = new docode.SymbolInformation(
			label,
			getSymbolKind(item),
			item.containerName || '',
			typeConverters.Location.fromTextSpan(uri, item));
		const kindModifiers = item.kindModifiers ? parseKindModifier(item.kindModifiers) : undefined;
		if (kindModifiers?.has(PConst.KindModifiers.deprecated)) {
			info.tags = [docode.SymbolTag.Deprecated];
		}
		return info;
	}

	private static getLabel(item: Proto.NavtoItem) {
		const label = item.name;
		if (item.kind === 'method' || item.kind === 'function') {
			return label + '()';
		}
		return label;
	}

	private getDocument(): docode.TextDocument | undefined {
		// typescript wants to have a resource even when asking
		// general questions so we check the active editor. If this
		// doesn't match we take the first TS document.

		const activeDocument = docode.window.activeTextEditor?.document;
		if (activeDocument) {
			if (this.modeIds.includes(activeDocument.languageId)) {
				return activeDocument;
			}
		}

		const documents = docode.workspace.textDocuments;
		for (const document of documents) {
			if (this.modeIds.includes(document.languageId)) {
				return document;
			}
		}
		return undefined;
	}
}

export function register(
	client: ITypeScriptServiceClient,
	modeIds: readonly string[],
) {
	return docode.languages.registerWorkspaceSymbolProvider(
		new TypeScriptWorkspaceSymbolProvider(client, modeIds));
}
