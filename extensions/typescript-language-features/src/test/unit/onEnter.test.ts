/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import * as docode from 'docode';
import { CURSOR, joinLines, wait, withRandomFileEditor } from '../testUtils';

const onDocumentChange = (doc: docode.TextDocument): Promise<docode.TextDocument> => {
	return new Promise<docode.TextDocument>(resolve => {
		const sub = docode.workspace.onDidChangeTextDocument(e => {
			if (e.document !== doc) {
				return;
			}
			sub.dispose();
			resolve(e.document);
		});
	});
};

const type = async (document: docode.TextDocument, text: string): Promise<docode.TextDocument> => {
	const onChange = onDocumentChange(document);
	await docode.commands.executeCommand('type', { text });
	await onChange;
	return document;
};

suite.skip('OnEnter', () => {
	setup(async () => {
		// the tests make the assumption that language rules are registered
		await docode.extensions.getExtension('docode.typescript-language-features')!.activate();
	});

	test('should indent after if block with braces', () => {
		return withRandomFileEditor(`if (true) {${CURSOR}`, 'js', async (_editor, document) => {
			await type(document, '\nx');
			assert.strictEqual(
				document.getText(),
				joinLines(
					`if (true) {`,
					`    x`));
		});
	});

	test('should indent within empty object literal', () => {
		return withRandomFileEditor(`({${CURSOR}})`, 'js', async (_editor, document) => {
			await type(document, '\nx');
			await wait(500);

			assert.strictEqual(
				document.getText(),
				joinLines(`({`,
					`    x`,
					`})`));
		});
	});

	test('should indent after simple jsx tag with attributes', () => {
		return withRandomFileEditor(`const a = <div onclick={bla}>${CURSOR}`, 'jsx', async (_editor, document) => {
			await type(document, '\nx');
			assert.strictEqual(
				document.getText(),
				joinLines(
					`const a = <div onclick={bla}>`,
					`    x`));
		});
	});

	test('should not indent after a multi-line comment block 1', () => {
		return withRandomFileEditor(`/*-----\n * line 1\n * line 2\n *-----*/\n${CURSOR}`, 'js', async (_editor, document) => {
			await type(document, '\nx');
			assert.strictEqual(
				document.getText(),
				joinLines(
					`/*-----`,
					` * line 1`,
					` * line 2`,
					` *-----*/`,
					``,
					`x`));
		});
	});

	test('should not indent after a multi-line comment block 2', () => {
		return withRandomFileEditor(`/*-----\n * line 1\n * line 2\n */\n${CURSOR}`, 'js', async (_editor, document) => {
			await type(document, '\nx');
			assert.strictEqual(
				document.getText(),
				joinLines(
					`/*-----`,
					` * line 1`,
					` * line 2`,
					` */`,
					``,
					`x`));
		});
	});

	test('should indent within a multi-line comment block', () => {
		return withRandomFileEditor(`/*-----\n * line 1\n * line 2${CURSOR}`, 'js', async (_editor, document) => {
			await type(document, '\nx');
			assert.strictEqual(
				document.getText(),
				joinLines(
					`/*-----`,
					` * line 1`,
					` * line 2`,
					` * x`));
		});
	});

	test('should indent after if block followed by comment with quote', () => {
		return withRandomFileEditor(`if (true) { // '${CURSOR}`, 'js', async (_editor, document) => {
			await type(document, '\nx');
			assert.strictEqual(
				document.getText(),
				joinLines(
					`if (true) { // '`,
					`    x`));
		});
	});
});
