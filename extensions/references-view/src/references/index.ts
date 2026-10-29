/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as docode from 'docode';
import { SymbolsTree } from '../tree';
import { FileItem, ReferenceItem, ReferencesModel, ReferencesTreeInput } from './model';

export function register(tree: SymbolsTree, context: docode.ExtensionContext): void {

	function findLocations(title: string, command: string) {
		if (docode.window.activeTextEditor) {
			const input = new ReferencesTreeInput(title, new docode.Location(docode.window.activeTextEditor.document.uri, docode.window.activeTextEditor.selection.active), command);
			tree.setInput(input);
		}
	}

	context.subscriptions.push(
		docode.commands.registerCommand('references-view.findReferences', () => findLocations('References', 'docode.executeReferenceProvider')),
		docode.commands.registerCommand('references-view.findImplementations', () => findLocations('Implementations', 'docode.executeImplementationProvider')),
		// --- legacy name
		docode.commands.registerCommand('references-view.find', (...args: any[]) => docode.commands.executeCommand('references-view.findReferences', ...args)),
		docode.commands.registerCommand('references-view.removeReferenceItem', removeReferenceItem),
		docode.commands.registerCommand('references-view.copy', copyCommand),
		docode.commands.registerCommand('references-view.copyAll', copyAllCommand),
		docode.commands.registerCommand('references-view.copyPath', copyPathCommand),
	);


	// --- references.preferredLocation setting

	let showReferencesDisposable: docode.Disposable | undefined;
	const config = 'references.preferredLocation';
	function updateShowReferences(event?: docode.ConfigurationChangeEvent) {
		if (event && !event.affectsConfiguration(config)) {
			return;
		}
		const value = docode.workspace.getConfiguration().get<string>(config);

		showReferencesDisposable?.dispose();
		showReferencesDisposable = undefined;

		if (value === 'view') {
			showReferencesDisposable = docode.commands.registerCommand('editor.action.showReferences', async (uri: docode.Uri, position: docode.Position, locations: docode.Location[]) => {
				const input = new ReferencesTreeInput(docode.l10n.t('References'), new docode.Location(uri, position), 'docode.executeReferenceProvider', locations);
				tree.setInput(input);
			});
		}
	}
	context.subscriptions.push(docode.workspace.onDidChangeConfiguration(updateShowReferences));
	context.subscriptions.push({ dispose: () => showReferencesDisposable?.dispose() });
	updateShowReferences();
}

const copyAllCommand = async (item: ReferenceItem | FileItem | unknown) => {
	if (item instanceof ReferenceItem) {
		copyCommand(item.file.model);
	} else if (item instanceof FileItem) {
		copyCommand(item.model);
	}
};

function removeReferenceItem(item: FileItem | ReferenceItem | unknown) {
	if (item instanceof FileItem) {
		item.remove();
	} else if (item instanceof ReferenceItem) {
		item.remove();
	}
}


async function copyCommand(item: ReferencesModel | ReferenceItem | FileItem | unknown) {
	let val: string | undefined;
	if (item instanceof ReferencesModel) {
		val = await item.asCopyText();
	} else if (item instanceof ReferenceItem) {
		val = await item.asCopyText();
	} else if (item instanceof FileItem) {
		val = await item.asCopyText();
	}
	if (val) {
		await docode.env.clipboard.writeText(val);
	}
}

async function copyPathCommand(item: FileItem | unknown) {
	if (item instanceof FileItem) {
		if (item.uri.scheme === 'file') {
			docode.env.clipboard.writeText(item.uri.fsPath);
		} else {
			docode.env.clipboard.writeText(item.uri.toString(true));
		}
	}
}
