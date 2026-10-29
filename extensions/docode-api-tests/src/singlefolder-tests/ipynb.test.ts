/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import * as docode from 'docode';
import { assertNoRpc, closeAllEditors, createRandomFile } from '../utils';

const ipynbContent = JSON.stringify({
	'cells': [
		{
			'cell_type': 'markdown',
			'source': ['## Header'],
			'metadata': {}
		},
		{
			'cell_type': 'code',
			'execution_count': 2,
			'source': [`print('hello 1')\n`, `print('hello 2')`],
			'outputs': [
				{
					'output_type': 'stream',
					'name': 'stdout',
					'text': ['hello 1\n', 'hello 2\n']
				}
			],
			'metadata': {}
		}
	]
});

suite('ipynb NotebookSerializer', function () {
	teardown(async function () {
		assertNoRpc();
		await closeAllEditors();
	});

	test.skip('Can open an ipynb notebook', async () => {
		const file = await createRandomFile(ipynbContent, undefined, '.ipynb');
		const notebook = await docode.workspace.openNotebookDocument(file);
		await docode.window.showNotebookDocument(notebook);

		const notebookEditor = docode.window.activeNotebookEditor;
		assert.ok(notebookEditor);

		assert.strictEqual(notebookEditor.notebook.cellCount, 2);
		assert.strictEqual(notebookEditor.notebook.cellAt(0).kind, docode.NotebookCellKind.Markup);
		assert.strictEqual(notebookEditor.notebook.cellAt(1).kind, docode.NotebookCellKind.Code);
		assert.strictEqual(notebookEditor.notebook.cellAt(1).outputs.length, 1);
	});
});
