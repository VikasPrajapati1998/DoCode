/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as docode from 'docode';
import { Command, CommandManager } from '../commands/commandManager';
import { isSupportedLanguageMode } from '../configuration/languageIds';
import { API } from '../tsServer/api';
import * as typeConverters from '../typeConverters';
import { ITypeScriptServiceClient } from '../typescriptService';


class SourceDefinitionCommand implements Command {

	public static readonly context = 'tsSupportsSourceDefinition';
	public static readonly minVersion = API.v470;

	public readonly id = 'typescript.goToSourceDefinition';

	public constructor(
		private readonly client: ITypeScriptServiceClient
	) { }

	public async execute() {
		if (this.client.apiVersion.lt(SourceDefinitionCommand.minVersion)) {
			docode.window.showErrorMessage(docode.l10n.t("Go to Source Definition failed. Requires TypeScript 4.7+."));
			return;
		}

		const activeEditor = docode.window.activeTextEditor;
		if (!activeEditor) {
			docode.window.showErrorMessage(docode.l10n.t("Go to Source Definition failed. No resource provided."));
			return;
		}

		const resource = activeEditor.document.uri;
		const document = await docode.workspace.openTextDocument(resource);
		if (!isSupportedLanguageMode(document)) {
			docode.window.showErrorMessage(docode.l10n.t("Go to Source Definition failed. Unsupported file type."));
			return;
		}

		const openedFiledPath = this.client.toOpenTsFilePath(document);
		if (!openedFiledPath) {
			docode.window.showErrorMessage(docode.l10n.t("Go to Source Definition failed. Unknown file type."));
			return;
		}

		await docode.window.withProgress({
			location: docode.ProgressLocation.Window,
			title: docode.l10n.t("Finding source definitions")
		}, async (_progress, token) => {

			const position = activeEditor.selection.anchor;
			const args = typeConverters.Position.toFileLocationRequestArgs(openedFiledPath, position);
			const response = await this.client.execute('findSourceDefinition', args, token);
			if (response.type === 'response' && response.body) {
				const locations: docode.Location[] = response.body.map(reference =>
					typeConverters.Location.fromTextSpan(this.client.toResource(reference.file), reference));

				if (locations.length) {
					if (locations.length === 1) {
						docode.commands.executeCommand('docode.open', locations[0].uri.with({
							fragment: `L${locations[0].range.start.line + 1},${locations[0].range.start.character + 1}`
						}));
					} else {
						docode.commands.executeCommand('editor.action.showReferences', resource, position, locations);
					}
					return;
				}
			}

			docode.window.showErrorMessage(docode.l10n.t("No source definitions found."));
		});
	}
}


export function register(
	client: ITypeScriptServiceClient,
	commandManager: CommandManager
): docode.Disposable {
	function updateContext(overrideValue?: boolean) {
		docode.commands.executeCommand('setContext', SourceDefinitionCommand.context, overrideValue ?? client.apiVersion.gte(SourceDefinitionCommand.minVersion));
	}
	updateContext();

	commandManager.register(new SourceDefinitionCommand(client));
	return docode.Disposable.from(
		client.onTsServerStarted(() => updateContext()),
		new docode.Disposable(() => updateContext(false)),
	);
}
