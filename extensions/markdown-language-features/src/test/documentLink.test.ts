/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import * as docode from 'docode';
import { joinLines } from './util';

const testFileA = workspaceFile('a.md');

const debug = false;

function debugLog(...args: any[]) {
	if (debug) {
		console.log(...args);
	}
}

function workspaceFile(...segments: string[]) {
	return docode.Uri.joinPath(docode.workspace.workspaceFolders![0].uri, ...segments);
}

async function getLinksForFile(file: docode.Uri): Promise<docode.DocumentLink[]> {
	debugLog('getting links', file.toString(), Date.now());
	const r = (await docode.commands.executeCommand<docode.DocumentLink[]>('docode.executeLinkProvider', file, /*linkResolveCount*/ 100))!;
	debugLog('got links', file.toString(), Date.now());
	return r;
}

(docode.env.uiKind === docode.UIKind.Web ? suite.skip : suite)('Markdown Document links', () => {

	setup(async () => {
		// the tests make the assumption that link providers are already registered
		await docode.extensions.getExtension('docode.markdown-language-features')!.activate();
	});

	teardown(async () => {
		await docode.commands.executeCommand('workbench.action.closeAllEditors');
	});

	test('Should navigate to markdown file', async () => {
		await withFileContents(testFileA, '[b](b.md)');

		const [link] = await getLinksForFile(testFileA);
		await executeLink(link);

		assertActiveDocumentUri(workspaceFile('b.md'));
	});

	test('Should navigate to markdown file with leading ./', async () => {
		await withFileContents(testFileA, '[b](./b.md)');

		const [link] = await getLinksForFile(testFileA);
		await executeLink(link);

		assertActiveDocumentUri(workspaceFile('b.md'));
	});

	test('Should navigate to markdown file with leading /', async () => {
		await withFileContents(testFileA, '[b](./b.md)');

		const [link] = await getLinksForFile(testFileA);
		await executeLink(link);

		assertActiveDocumentUri(workspaceFile('b.md'));
	});

	test('Should navigate to markdown file without file extension', async () => {
		await withFileContents(testFileA, '[b](b)');

		const [link] = await getLinksForFile(testFileA);
		await executeLink(link);

		assertActiveDocumentUri(workspaceFile('b.md'));
	});

	test('Should navigate to markdown file in directory', async () => {
		await withFileContents(testFileA, '[b](sub/c)');

		const [link] = await getLinksForFile(testFileA);
		await executeLink(link);

		assertActiveDocumentUri(workspaceFile('sub', 'c.md'));
	});

	test('Should navigate to fragment by title in file', async () => {
		await withFileContents(testFileA, '[b](sub/c#second)');

		const [link] = await getLinksForFile(testFileA);
		await executeLink(link);

		assertActiveDocumentUri(workspaceFile('sub', 'c.md'));
		assert.strictEqual(docode.window.activeTextEditor!.selection.start.line, 1);
	});

	test('Should navigate to fragment by line', async () => {
		await withFileContents(testFileA, '[b](sub/c#L2)');

		const [link] = await getLinksForFile(testFileA);
		await executeLink(link);

		assertActiveDocumentUri(workspaceFile('sub', 'c.md'));
		assert.strictEqual(docode.window.activeTextEditor!.selection.start.line, 1);
	});

	test('Should navigate to line number within non-md file', async () => {
		await withFileContents(testFileA, '[b](sub/foo.txt#L3)');

		const [link] = await getLinksForFile(testFileA);
		await executeLink(link);

		assertActiveDocumentUri(workspaceFile('sub', 'foo.txt'));
		assert.strictEqual(docode.window.activeTextEditor!.selection.start.line, 2);
	});

	test('Should navigate to fragment within current file', async () => {
		await withFileContents(testFileA, joinLines(
			'[](a#header)',
			'[](#header)',
			'# Header'));

		const links = await getLinksForFile(testFileA);
		{
			await executeLink(links[0]);
			assertActiveDocumentUri(workspaceFile('a.md'));
			assert.strictEqual(docode.window.activeTextEditor!.selection.start.line, 2);
		}
		{
			await executeLink(links[1]);
			assertActiveDocumentUri(workspaceFile('a.md'));
			assert.strictEqual(docode.window.activeTextEditor!.selection.start.line, 2);
		}
	});

	test.skip('Should navigate to fragment within current untitled file', async () => { // TODO: skip for now for ls migration
		const testFile = workspaceFile('x.md').with({ scheme: 'untitled' });
		await withFileContents(testFile, joinLines(
			'[](#second)',
			'# Second'));

		const [link] = await getLinksForFile(testFile);
		await executeLink(link);

		assertActiveDocumentUri(testFile);
		assert.strictEqual(docode.window.activeTextEditor!.selection.start.line, 1);
	});
});


function assertActiveDocumentUri(expectedUri: docode.Uri) {
	assert.strictEqual(
		docode.window.activeTextEditor!.document.uri.fsPath,
		expectedUri.fsPath
	);
}

async function withFileContents(file: docode.Uri, contents: string): Promise<void> {
	debugLog('openTextDocument', file.toString(), Date.now());
	const document = await docode.workspace.openTextDocument(file);
	debugLog('showTextDocument', file.toString(), Date.now());
	const editor = await docode.window.showTextDocument(document);
	debugLog('editTextDocument', file.toString(), Date.now());
	await editor.edit(edit => {
		edit.replace(new docode.Range(0, 0, 1000, 0), contents);
	});
	debugLog('opened done', docode.window.activeTextEditor?.document.toString(), Date.now());
}

async function executeLink(link: docode.DocumentLink) {
	debugLog('executingLink', link.target?.toString(), Date.now());

	await docode.commands.executeCommand('docode.open', link.target!);
	debugLog('executedLink', docode.window.activeTextEditor?.document.toString(), Date.now());
}
