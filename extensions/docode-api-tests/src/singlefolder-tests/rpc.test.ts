/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as docode from 'docode';
import { assertNoRpc, assertNoRpcFromEntry, disposeAll } from '../utils';

suite('docode', function () {

	const dispo: docode.Disposable[] = [];

	teardown(() => {
		assertNoRpc();
		disposeAll(dispo);
	});

	test('no rpc', function () {
		assertNoRpc();
	});

	test('no rpc, createDiagnosticCollection()', function () {
		const item = docode.languages.createDiagnosticCollection();
		dispo.push(item);
		assertNoRpcFromEntry([item, 'DiagnosticCollection']);
	});

	test('no rpc, createTextEditorDecorationType(...)', function () {
		const item = docode.window.createTextEditorDecorationType({});
		dispo.push(item);
		assertNoRpcFromEntry([item, 'TextEditorDecorationType']);
	});

	test('no rpc, createOutputChannel(...)', function () {
		const item = docode.window.createOutputChannel('hello');
		dispo.push(item);
		assertNoRpcFromEntry([item, 'OutputChannel']);
	});

	test('no rpc, createDiagnosticCollection(...)', function () {
		const item = docode.languages.createDiagnosticCollection();
		dispo.push(item);
		assertNoRpcFromEntry([item, 'DiagnosticCollection']);
	});

	test('no rpc, createQuickPick(...)', function () {
		const item = docode.window.createQuickPick();
		dispo.push(item);
		assertNoRpcFromEntry([item, 'QuickPick']);
	});

	test('no rpc, createInputBox(...)', function () {
		const item = docode.window.createInputBox();
		dispo.push(item);
		assertNoRpcFromEntry([item, 'InputBox']);
	});

	test('no rpc, createStatusBarItem(...)', function () {
		const item = docode.window.createStatusBarItem();
		dispo.push(item);
		assertNoRpcFromEntry([item, 'StatusBarItem']);
	});

	test('no rpc, createSourceControl(...)', function () {
		const item = docode.scm.createSourceControl('foo', 'Hello');
		dispo.push(item);
		assertNoRpcFromEntry([item, 'SourceControl']);
	});

	test('no rpc, createCommentController(...)', function () {
		const item = docode.comments.createCommentController('foo', 'Hello');
		dispo.push(item);
		assertNoRpcFromEntry([item, 'CommentController']);
	});

	test('no rpc, createWebviewPanel(...)', function () {
		const item = docode.window.createWebviewPanel('webview', 'Hello', docode.ViewColumn.Active);
		dispo.push(item);
		assertNoRpcFromEntry([item, 'WebviewPanel']);
	});

	test('no rpc, createTreeView(...)', function () {
		const treeDataProvider = new class implements docode.TreeDataProvider<string> {
			getTreeItem(element: string): docode.TreeItem | Thenable<docode.TreeItem> {
				return new docode.TreeItem(element);
			}
			getChildren(_element?: string): docode.ProviderResult<string[]> {
				return ['foo', 'bar'];
			}
		};
		const item = docode.window.createTreeView('test.treeId', { treeDataProvider });
		dispo.push(item);
		assertNoRpcFromEntry([item, 'TreeView']);
	});


	test('no rpc, createNotebookController(...)', function () {
		const ctrl = docode.notebooks.createNotebookController('foo', 'bar', '');
		dispo.push(ctrl);
		assertNoRpcFromEntry([ctrl, 'NotebookController']);
	});

	test('no rpc, createTerminal(...)', function () {
		const ctrl = docode.window.createTerminal({ name: 'termi' });
		dispo.push(ctrl);
		assertNoRpcFromEntry([ctrl, 'Terminal']);
	});

	test('no rpc, createFileSystemWatcher(...)', function () {
		const item = docode.workspace.createFileSystemWatcher('**/*.ts');
		dispo.push(item);
		assertNoRpcFromEntry([item, 'FileSystemWatcher']);
	});

	test('no rpc, createTestController(...)', function () {
		const item = docode.tests.createTestController('iii', 'lll');
		dispo.push(item);
		assertNoRpcFromEntry([item, 'TestController']);
	});

	test('no rpc, createLanguageStatusItem(...)', function () {
		const item = docode.languages.createLanguageStatusItem('i', '*');
		dispo.push(item);
		assertNoRpcFromEntry([item, 'LanguageStatusItem']);
	});
});
