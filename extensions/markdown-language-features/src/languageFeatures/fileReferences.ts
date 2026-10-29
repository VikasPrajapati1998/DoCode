/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as docode from 'docode';
import type * as lsp from 'vscode-languageserver-types';
import { MdLanguageClient } from '../client/client';
import { Command, CommandManager } from '../commandManager';


export class FindFileReferencesCommand implements Command {

	public readonly id = 'markdown.findAllFileReferences';

	readonly #client: MdLanguageClient;

	constructor(
		client: MdLanguageClient,
	) {
		this.#client = client;
	}

	public async execute(resource?: docode.Uri) {
		resource ??= docode.window.activeTextEditor?.document.uri;
		if (!resource) {
			docode.window.showErrorMessage(docode.l10n.t("Find file references failed. No resource provided."));
			return;
		}

		await docode.window.withProgress({
			location: docode.ProgressLocation.Window,
			title: docode.l10n.t("Finding file references")
		}, async (_progress, token) => {
			const locations = (await this.#client.getReferencesToFileInWorkspace(resource, token)).map(loc => {
				return new docode.Location(docode.Uri.parse(loc.uri), convertRange(loc.range));
			});

			const config = docode.workspace.getConfiguration('references');
			const existingSetting = config.inspect<string>('preferredLocation');

			await config.update('preferredLocation', 'view');
			try {
				await docode.commands.executeCommand('editor.action.showReferences', resource, new docode.Position(0, 0), locations);
			} finally {
				await config.update('preferredLocation', existingSetting?.workspaceFolderValue ?? existingSetting?.workspaceValue);
			}
		});
	}
}

export function convertRange(range: lsp.Range): docode.Range {
	return new docode.Range(range.start.line, range.start.character, range.end.line, range.end.character);
}

export function registerFindFileReferenceSupport(
	commandManager: CommandManager,
	client: MdLanguageClient,
): docode.Disposable {
	return commandManager.register(new FindFileReferencesCommand(client));
}
