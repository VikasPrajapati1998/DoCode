/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as docode from 'docode';
import * as utils from '../utils';

(docode.env.uiKind === docode.UIKind.Web ? suite.skip : suite.skip)('Notebook Editor', function () {

	const contentSerializer = new class implements docode.NotebookSerializer {
		deserializeNotebook() {
			return new docode.NotebookData(
				[new docode.NotebookCellData(docode.NotebookCellKind.Code, '// code cell', 'javascript')],
			);
		}
		serializeNotebook() {
			return new Uint8Array();
		}
	};

	const onDidOpenNotebookEditor = (timeout = docode.env.uiKind === docode.UIKind.Desktop ? 5000 : 15000) => {
		return new Promise<boolean>((resolve, reject) => {

			const handle = setTimeout(() => {
				sub.dispose();
				reject(new Error('onDidOpenNotebookEditor TIMEOUT reached'));
			}, timeout);

			const sub = docode.window.onDidChangeActiveNotebookEditor(() => {
				if (docode.window.activeNotebookEditor === undefined) {
					// skip if there is no active notebook editor (e.g. when opening a new notebook)
					return;
				}

				clearTimeout(handle);
				sub.dispose();
				resolve(true);
			});
		});
	};

	const disposables: docode.Disposable[] = [];
	const testDisposables: docode.Disposable[] = [];

	suiteTeardown(async function () {
		utils.assertNoRpc();
		await utils.revertAllDirty();
		await utils.closeAllEditors();
		utils.disposeAll(disposables);
		disposables.length = 0;

		for (const doc of docode.workspace.notebookDocuments) {
			assert.strictEqual(doc.isDirty, false, doc.uri.toString());
		}
	});

	suiteSetup(function () {
		disposables.push(docode.workspace.registerNotebookSerializer('notebook.nbdtest', contentSerializer));
	});

	teardown(async function () {
		utils.disposeAll(testDisposables);
		testDisposables.length = 0;
	});

	// #138683
	// TODO@rebornix https://github.com/microsoft/vscode/issues/170072
	test.skip('Opening a notebook should fire activeNotebook event changed only once', utils.withVerboseLogs(async function () {
		const openedEditor = onDidOpenNotebookEditor();
		const resource = await utils.createRandomFile(undefined, undefined, '.nbdtest');
		const document = await docode.workspace.openNotebookDocument(resource);
		const editor = await docode.window.showNotebookDocument(document);
		assert.ok(await openedEditor);
		assert.strictEqual(editor.notebook.uri.toString(), resource.toString());
	}));

	// TODO@rebornix https://github.com/microsoft/vscode/issues/173125
	test.skip('Active/Visible Editor', async function () {
		const firstEditorOpen = onDidOpenNotebookEditor();
		const resource = await utils.createRandomFile(undefined, undefined, '.nbdtest');
		const document = await docode.workspace.openNotebookDocument(resource);

		const firstEditor = await docode.window.showNotebookDocument(document);
		await firstEditorOpen;
		assert.strictEqual(docode.window.activeNotebookEditor, firstEditor);
		assert.strictEqual(docode.window.visibleNotebookEditors.includes(firstEditor), true);

		const secondEditor = await docode.window.showNotebookDocument(document, { viewColumn: docode.ViewColumn.Beside });
		// There is no guarantee that when `showNotebookDocument` resolves, the active notebook editor is already updated correctly.
		// assert.strictEqual(secondEditor === docode.window.activeNotebookEditor, true);
		assert.notStrictEqual(firstEditor, secondEditor);
		assert.strictEqual(docode.window.visibleNotebookEditors.includes(secondEditor), true);
		assert.strictEqual(docode.window.visibleNotebookEditors.includes(firstEditor), true);
		assert.strictEqual(docode.window.visibleNotebookEditors.length, 2);
		await utils.closeAllEditors();
	});

	test('Notebook Editor Event - onDidChangeVisibleNotebookEditors on open/close', async function () {
		const openedEditor = utils.asPromise(docode.window.onDidChangeVisibleNotebookEditors);
		const resource = await utils.createRandomFile(undefined, undefined, '.nbdtest');
		const document = await docode.workspace.openNotebookDocument(resource);
		await docode.window.showNotebookDocument(document);
		assert.ok(await openedEditor);

		const firstEditorClose = utils.asPromise(docode.window.onDidChangeVisibleNotebookEditors);
		await utils.closeAllEditors();
		await firstEditorClose;
	});

	test('Notebook Editor Event - onDidChangeVisibleNotebookEditors on two editor groups', async function () {
		const resource = await utils.createRandomFile(undefined, undefined, '.nbdtest');
		const document = await docode.workspace.openNotebookDocument(resource);

		let count = 0;
		testDisposables.push(docode.window.onDidChangeVisibleNotebookEditors(() => {
			count = docode.window.visibleNotebookEditors.length;
		}));

		await docode.window.showNotebookDocument(document, { viewColumn: docode.ViewColumn.Active });
		assert.strictEqual(count, 1);

		await docode.window.showNotebookDocument(document, { viewColumn: docode.ViewColumn.Beside });
		assert.strictEqual(count, 2);

		await utils.closeAllEditors();
		assert.strictEqual(count, 0);
	});
});
