/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import { TextDecoder } from 'util';
import * as docode from 'docode';
import { asPromise, assertNoRpc, closeAllEditors, createRandomFile, DeferredPromise, disposeAll, revertAllDirty, saveAllEditors } from '../utils';

async function createRandomNotebookFile() {
	return createRandomFile('', undefined, '.vsctestnb');
}

async function openRandomNotebookDocument() {
	const uri = await createRandomNotebookFile();
	return docode.workspace.openNotebookDocument(uri);
}

export async function saveAllFilesAndCloseAll() {
	await saveAllEditors();
	await closeAllEditors();
}

async function withEvent<T>(event: docode.Event<T>, callback: (e: Promise<T>) => Promise<void>) {
	const e = asPromise<T>(event);
	await callback(e);
}


function sleep(ms: number): Promise<void> {
	return new Promise(resolve => {
		setTimeout(resolve, ms);
	});
}

export class Kernel {

	readonly controller: docode.NotebookController;

	readonly associatedNotebooks = new Set<string>();

	constructor(id: string, label: string, viewType: string = 'notebookCoreTest') {
		this.controller = docode.notebooks.createNotebookController(id, viewType, label);
		this.controller.executeHandler = this._execute.bind(this);
		this.controller.supportsExecutionOrder = true;
		this.controller.supportedLanguages = ['typescript', 'javascript'];
		this.controller.onDidChangeSelectedNotebooks(e => {
			if (e.selected) {
				this.associatedNotebooks.add(e.notebook.uri.toString());
			} else {
				this.associatedNotebooks.delete(e.notebook.uri.toString());
			}
		});
	}

	protected async _execute(cells: docode.NotebookCell[]): Promise<void> {
		for (const cell of cells) {
			await this._runCell(cell);
		}
	}

	protected async _runCell(cell: docode.NotebookCell) {
		// create a single output with exec order 1 and output is plain/text
		// of either the cell itself or (iff empty) the cell's document's uri
		const task = this.controller.createNotebookCellExecution(cell);
		task.start(Date.now());
		task.executionOrder = 1;
		await sleep(10); // Force to be take some time
		await task.replaceOutput([new docode.NotebookCellOutput([
			docode.NotebookCellOutputItem.text(cell.document.getText() || cell.document.uri.toString(), 'text/plain')
		])]);
		task.end(true);
	}
}


async function assertKernel(kernel: Kernel, notebook: docode.NotebookDocument): Promise<void> {
	const success = await docode.commands.executeCommand('notebook.selectKernel', {
		extension: 'docode.docode-api-tests',
		id: kernel.controller.id
	});
	assert.ok(success, `expected selected kernel to be ${kernel.controller.id}`);
	assert.ok(kernel.associatedNotebooks.has(notebook.uri.toString()));
}

const apiTestSerializer: docode.NotebookSerializer = {
	serializeNotebook(_data, _token) {
		return new Uint8Array();
	},
	deserializeNotebook(_content, _token) {
		const dto: docode.NotebookData = {
			metadata: { testMetadata: false },
			cells: [
				{
					value: 'test',
					languageId: 'typescript',
					kind: docode.NotebookCellKind.Code,
					outputs: [],
					metadata: { testCellMetadata: 123 },
					executionSummary: { timing: { startTime: 10, endTime: 20 } }
				},
				{
					value: 'test2',
					languageId: 'typescript',
					kind: docode.NotebookCellKind.Code,
					outputs: [
						new docode.NotebookCellOutput([
							docode.NotebookCellOutputItem.text('Hello World', 'text/plain')
						],
							{
								testOutputMetadata: true,
								['text/plain']: { testOutputItemMetadata: true }
							})
					],
					executionSummary: { executionOrder: 5, success: true },
					metadata: { testCellMetadata: 456 }
				}
			]
		};
		return dto;
	}
};

(docode.env.uiKind === docode.UIKind.Web ? suite.skip : suite)('Notebook Kernel API tests', function () {

	const testDisposables: docode.Disposable[] = [];
	const suiteDisposables: docode.Disposable[] = [];

	suiteTeardown(async function () {

		assertNoRpc();

		await revertAllDirty();
		await closeAllEditors();

		disposeAll(suiteDisposables);
		suiteDisposables.length = 0;
	});

	suiteSetup(() => {
		suiteDisposables.push(docode.workspace.registerNotebookSerializer('notebookCoreTest', apiTestSerializer));
	});

	let defaultKernel: Kernel;

	setup(async function () {
		// there should be ONE default kernel in this suite
		defaultKernel = new Kernel('mainKernel', 'Notebook Default Kernel');
		testDisposables.push(defaultKernel.controller);
		await saveAllFilesAndCloseAll();
	});

	teardown(async function () {
		disposeAll(testDisposables);
		testDisposables.length = 0;
		await saveAllFilesAndCloseAll();
	});

	test('cell execute command takes arguments', async () => {
		console.log('Step1.cell execute command takes arguments');
		const notebook = await openRandomNotebookDocument();
		console.log('Step2.cell execute command takes arguments');
		await docode.window.showNotebookDocument(notebook);
		console.log('Step3.cell execute command takes arguments');
		assert.strictEqual(docode.window.activeNotebookEditor !== undefined, true, 'notebook first');
		const editor = docode.window.activeNotebookEditor!;
		const cell = editor.notebook.cellAt(0);

		console.log('Step4.cell execute command takes arguments');
		await withEvent(docode.workspace.onDidChangeNotebookDocument, async event => {
			console.log('Step5.cell execute command takes arguments');
			await docode.commands.executeCommand('notebook.execute');
			console.log('Step6.cell execute command takes arguments');
			await event;
			console.log('Step7.cell execute command takes arguments');
			assert.strictEqual(cell.outputs.length, 1, 'should execute'); // runnable, it worked
		});

		console.log('Step8.cell execute command takes arguments');
		await withEvent(docode.workspace.onDidChangeNotebookDocument, async event => {
			console.log('Step9.cell execute command takes arguments');
			await docode.commands.executeCommand('notebook.cell.clearOutputs');
			console.log('Step10.cell execute command takes arguments');
			await event;
			console.log('Step11.cell execute command takes arguments');
			assert.strictEqual(cell.outputs.length, 0, 'should clear');
		});

		console.log('Step12.cell execute command takes arguments');
		const secondResource = await createRandomNotebookFile();
		console.log('Step13.cell execute command takes arguments');
		const secondDocument = await docode.workspace.openNotebookDocument(secondResource);
		console.log('Step14.cell execute command takes arguments');
		await docode.window.showNotebookDocument(secondDocument);
		console.log('Step15.cell execute command takes arguments');

		await withEvent<docode.NotebookDocumentChangeEvent>(docode.workspace.onDidChangeNotebookDocument, async event => {
			console.log('Step16.cell execute command takes arguments');
			await docode.commands.executeCommand('notebook.cell.execute', { start: 0, end: 1 }, notebook.uri);
			console.log('Step17.cell execute command takes arguments');
			await event;
			console.log('Step18.cell execute command takes arguments');
			assert.strictEqual(cell.outputs.length, 1, 'should execute'); // runnable, it worked
			assert.strictEqual(docode.window.activeNotebookEditor?.notebook.uri.fsPath, secondResource.fsPath);
		});
		console.log('Step19.cell execute command takes arguments');
	});

	test('cell execute command takes arguments 2', async () => {
		console.log('Step1.cell execute command takes arguments 2');
		const notebook = await openRandomNotebookDocument();
		console.log('Step2.cell execute command takes arguments 2');
		await docode.window.showNotebookDocument(notebook);
		console.log('Step3.cell execute command takes arguments 2');

		let firstCellExecuted = false;
		let secondCellExecuted = false;

		const def = new DeferredPromise<void>();
		testDisposables.push(docode.workspace.onDidChangeNotebookDocument(e => {
			e.cellChanges.forEach(change => {
				if (change.cell.index === 0 && change.executionSummary) {
					firstCellExecuted = true;
				}

				if (change.cell.index === 1 && change.executionSummary) {
					secondCellExecuted = true;
				}
			});

			if (firstCellExecuted && secondCellExecuted) {
				def.complete();
			}
		}));

		await docode.commands.executeCommand('notebook.cell.execute', { document: notebook.uri, ranges: [{ start: 0, end: 1 }, { start: 1, end: 2 }] });

		await def.p;
		await saveAllFilesAndCloseAll();
	});

	test('document execute command takes arguments', async () => {
		const notebook = await openRandomNotebookDocument();
		await docode.window.showNotebookDocument(notebook);
		assert.strictEqual(docode.window.activeNotebookEditor !== undefined, true, 'notebook first');
		const editor = docode.window.activeNotebookEditor!;
		const cell = editor.notebook.cellAt(0);

		await withEvent<docode.NotebookDocumentChangeEvent>(docode.workspace.onDidChangeNotebookDocument, async (event) => {
			await docode.commands.executeCommand('notebook.execute', notebook.uri);
			await event;
			assert.strictEqual(cell.outputs.length, 1, 'should execute'); // runnable, it worked
		});
	});

	test('cell execute and select kernel', async function () {
		const notebook = await openRandomNotebookDocument();
		const editor = await docode.window.showNotebookDocument(notebook);
		assert.strictEqual(docode.window.activeNotebookEditor === editor, true, 'notebook first');

		const cell = editor.notebook.cellAt(0);

		const alternativeKernel = new class extends Kernel {
			constructor() {
				super('secondaryKernel', 'Notebook Secondary Test Kernel');
				this.controller.supportsExecutionOrder = false;
			}

			override async _runCell(cell: docode.NotebookCell) {
				const task = this.controller.createNotebookCellExecution(cell);
				task.start();
				await task.replaceOutput([new docode.NotebookCellOutput([
					docode.NotebookCellOutputItem.text('my second output', 'text/plain')
				])]);
				task.end(true);
			}
		};
		testDisposables.push(alternativeKernel.controller);

		await withEvent<docode.NotebookDocumentChangeEvent>(docode.workspace.onDidChangeNotebookDocument, async (event) => {
			await assertKernel(defaultKernel, notebook);
			await docode.commands.executeCommand('notebook.cell.execute');
			await event;
			assert.strictEqual(cell.outputs.length, 1, 'should execute'); // runnable, it worked
			assert.strictEqual(cell.outputs[0].items.length, 1);
			assert.strictEqual(cell.outputs[0].items[0].mime, 'text/plain');
			assert.deepStrictEqual(new TextDecoder().decode(cell.outputs[0].items[0].data), cell.document.getText());
		});

		await withEvent<docode.NotebookDocumentChangeEvent>(docode.workspace.onDidChangeNotebookDocument, async (event) => {
			await assertKernel(alternativeKernel, notebook);
			await docode.commands.executeCommand('notebook.cell.execute');
			await event;
			assert.strictEqual(cell.outputs.length, 1, 'should execute'); // runnable, it worked
			assert.strictEqual(cell.outputs[0].items.length, 1);
			assert.strictEqual(cell.outputs[0].items[0].mime, 'text/plain');
			assert.deepStrictEqual(new TextDecoder().decode(cell.outputs[0].items[0].data), 'my second output');
		});
	});

	test('Output changes are applied once the promise resolves', async function () {

		let called = false;

		const verifyOutputSyncKernel = new class extends Kernel {

			constructor() {
				super('verifyOutputSyncKernel', '');
			}

			override async _execute(cells: docode.NotebookCell[]) {
				const [cell] = cells;
				const task = this.controller.createNotebookCellExecution(cell);
				task.start();
				await task.replaceOutput([new docode.NotebookCellOutput([
					docode.NotebookCellOutputItem.text('Some output', 'text/plain')
				])]);
				assert.strictEqual(cell.notebook.cellAt(0).outputs.length, 1);
				assert.deepStrictEqual(new TextDecoder().decode(cell.notebook.cellAt(0).outputs[0].items[0].data), 'Some output');
				task.end(undefined);
				called = true;
			}
		};

		const notebook = await openRandomNotebookDocument();
		await docode.window.showNotebookDocument(notebook);
		await assertKernel(verifyOutputSyncKernel, notebook);
		await docode.commands.executeCommand('notebook.cell.execute');
		assert.strictEqual(called, true);
		verifyOutputSyncKernel.controller.dispose();
	});

	test('executionSummary', async () => {
		const notebook = await openRandomNotebookDocument();
		const editor = await docode.window.showNotebookDocument(notebook);
		const cell = editor.notebook.cellAt(0);

		assert.strictEqual(cell.executionSummary?.success, undefined);
		assert.strictEqual(cell.executionSummary?.executionOrder, undefined);
		await docode.commands.executeCommand('notebook.cell.execute');
		assert.strictEqual(cell.outputs.length, 1, 'should execute');
		assert.ok(cell.executionSummary);
		assert.strictEqual(cell.executionSummary!.success, true);
		assert.strictEqual(typeof cell.executionSummary!.executionOrder, 'number');
	});

	test('initialize executionSummary', async () => {

		const document = await openRandomNotebookDocument();
		const cell = document.cellAt(0);

		assert.strictEqual(cell.executionSummary?.success, undefined);
		assert.strictEqual(cell.executionSummary?.timing?.startTime, 10);
		assert.strictEqual(cell.executionSummary?.timing?.endTime, 20);

	});

	test('execution cancelled when delete while executing', async () => {
		const document = await openRandomNotebookDocument();
		const cell = document.cellAt(0);

		let executionWasCancelled = false;
		const cancelledKernel = new class extends Kernel {
			constructor() {
				super('cancelledKernel', '');
			}

			override async _execute(cells: docode.NotebookCell[]) {
				const [cell] = cells;
				const exe = this.controller.createNotebookCellExecution(cell);
				exe.token.onCancellationRequested(() => executionWasCancelled = true);
			}
		};
		testDisposables.push(cancelledKernel.controller);

		await docode.window.showNotebookDocument(document);
		await assertKernel(cancelledKernel, document);
		await docode.commands.executeCommand('notebook.cell.execute');

		// Delete executing cell
		const edit = new docode.WorkspaceEdit();
		edit.set(cell!.notebook.uri, [docode.NotebookEdit.replaceCells(new docode.NotebookRange(cell!.index, cell!.index + 1), [])]);
		await docode.workspace.applyEdit(edit);

		assert.strictEqual(executionWasCancelled, true);
	});

	test('appendOutput to different cell', async function () {
		const notebook = await openRandomNotebookDocument();
		const editor = await docode.window.showNotebookDocument(notebook);
		const cell0 = editor.notebook.cellAt(0);
		const notebookEdit = new docode.NotebookEdit(new docode.NotebookRange(1, 1), [new docode.NotebookCellData(docode.NotebookCellKind.Code, 'test 2', 'javascript')]);
		const edit = new docode.WorkspaceEdit();
		edit.set(notebook.uri, [notebookEdit]);
		await docode.workspace.applyEdit(edit);
		const cell1 = editor.notebook.cellAt(1);

		const nextCellKernel = new class extends Kernel {
			constructor() {
				super('nextCellKernel', 'Append to cell kernel');
			}

			override async _runCell(cell: docode.NotebookCell) {
				const task = this.controller.createNotebookCellExecution(cell);
				task.start();
				await task.appendOutput([new docode.NotebookCellOutput([
					docode.NotebookCellOutputItem.text('my output')
				])], cell1);
				await task.appendOutput([new docode.NotebookCellOutput([
					docode.NotebookCellOutputItem.text('my output 2')
				])], cell1);
				task.end(true);
			}
		};
		testDisposables.push(nextCellKernel.controller);

		await withEvent<docode.NotebookDocumentChangeEvent>(docode.workspace.onDidChangeNotebookDocument, async (event) => {
			await assertKernel(nextCellKernel, notebook);
			await docode.commands.executeCommand('notebook.cell.execute');
			await event;
			assert.strictEqual(cell0.outputs.length, 0, 'should not change cell 0');
			assert.strictEqual(cell1.outputs.length, 2, 'should update cell 1');
			assert.strictEqual(cell1.outputs[0].items.length, 1);
			assert.deepStrictEqual(new TextDecoder().decode(cell1.outputs[0].items[0].data), 'my output');
		});
	});

	test('replaceOutput to different cell', async function () {
		const notebook = await openRandomNotebookDocument();
		const editor = await docode.window.showNotebookDocument(notebook);
		const cell0 = editor.notebook.cellAt(0);
		const notebookEdit = new docode.NotebookEdit(new docode.NotebookRange(1, 1), [new docode.NotebookCellData(docode.NotebookCellKind.Code, 'test 2', 'javascript')]);
		const edit = new docode.WorkspaceEdit();
		edit.set(notebook.uri, [notebookEdit]);
		await docode.workspace.applyEdit(edit);
		const cell1 = editor.notebook.cellAt(1);

		const nextCellKernel = new class extends Kernel {
			constructor() {
				super('nextCellKernel', 'Replace to cell kernel');
			}

			override async _runCell(cell: docode.NotebookCell) {
				const task = this.controller.createNotebookCellExecution(cell);
				task.start();
				await task.replaceOutput([new docode.NotebookCellOutput([
					docode.NotebookCellOutputItem.text('my output')
				])], cell1);
				await task.replaceOutput([new docode.NotebookCellOutput([
					docode.NotebookCellOutputItem.text('my output 2')
				])], cell1);
				task.end(true);
			}
		};
		testDisposables.push(nextCellKernel.controller);

		await withEvent<docode.NotebookDocumentChangeEvent>(docode.workspace.onDidChangeNotebookDocument, async (event) => {
			await assertKernel(nextCellKernel, notebook);
			await docode.commands.executeCommand('notebook.cell.execute');
			await event;
			assert.strictEqual(cell0.outputs.length, 0, 'should not change cell 0');
			assert.strictEqual(cell1.outputs.length, 1, 'should update cell 1');
			assert.strictEqual(cell1.outputs[0].items.length, 1);
			assert.deepStrictEqual(new TextDecoder().decode(cell1.outputs[0].items[0].data), 'my output 2');
		});
	});
});
