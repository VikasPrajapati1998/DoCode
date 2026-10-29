/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as docode from 'docode';

import {
	detectNpmScriptsForFolder,
	findScriptAtPosition,
	runScript,
	IFolderTaskItem
} from './tasks';


export function runSelectedScript(context: docode.ExtensionContext) {
	const editor = docode.window.activeTextEditor;
	if (!editor) {
		return;
	}
	const document = editor.document;
	const contents = document.getText();
	const script = findScriptAtPosition(editor.document, contents, editor.selection.anchor);
	if (script) {
		runScript(context, script, document);
	} else {
		const message = docode.l10n.t("Could not find a valid npm script at the selection.");
		docode.window.showErrorMessage(message);
	}
}

export async function selectAndRunScriptFromFolder(context: docode.ExtensionContext, selectedFolders: docode.Uri[]) {
	if (selectedFolders.length === 0) {
		return;
	}
	const selectedFolder = selectedFolders[0];

	const taskList: IFolderTaskItem[] = await detectNpmScriptsForFolder(context, selectedFolder);

	if (taskList && taskList.length > 0) {
		const quickPick = docode.window.createQuickPick<IFolderTaskItem>();
		quickPick.placeholder = 'Select an npm script to run in folder';
		quickPick.items = taskList;

		const toDispose: docode.Disposable[] = [];

		const pickPromise = new Promise<IFolderTaskItem | undefined>((c) => {
			toDispose.push(quickPick.onDidAccept(() => {
				toDispose.forEach(d => d.dispose());
				c(quickPick.selectedItems[0]);
			}));
			toDispose.push(quickPick.onDidHide(() => {
				toDispose.forEach(d => d.dispose());
				c(undefined);
			}));
		});
		quickPick.show();
		const result = await pickPromise;
		quickPick.dispose();
		if (result) {
			docode.tasks.executeTask(result.task);
		}
	}
	else {
		docode.window.showInformationMessage(`No npm scripts found in ${selectedFolder.fsPath}`, { modal: true });
	}
}
