/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as docode from 'docode';
import { asPromise, assertNoRpc, closeAllEditors } from '../utils';

suite('docode - automatic language detection', () => {

	teardown(async function () {
		assertNoRpc();
		await closeAllEditors();
	});

	// TODO@TylerLeonhardt https://github.com/microsoft/vscode/issues/135157
	test.skip('test automatic language detection works', async () => {
		const receivedEvent = asPromise(docode.workspace.onDidOpenTextDocument, 5000);
		const doc = await docode.workspace.openTextDocument();
		const editor = await docode.window.showTextDocument(doc);
		await receivedEvent;

		assert.strictEqual(editor.document.languageId, 'plaintext');

		const settingResult = docode.workspace.getConfiguration().get<boolean>('workbench.editor.languageDetection');
		assert.ok(settingResult);

		const result = await editor.edit(editBuilder => {
			editBuilder.insert(new docode.Position(0, 0), `{
	"extends": "./tsconfig.base.json",
	"compilerOptions": {
		"removeComments": false,
		"preserveConstEnums": true,
		"sourceMap": false,
		"outDir": "../out/do",
		"target": "es2020",
		"types": [
			"mocha",
			"semver",
			"sinon",
			"winreg",
			"trusted-types",
			"wicg-file-system-access"
		],
		"plugins": [
			{
				"name": "tsec",
				"exemptionConfig": "./tsec.exemptions.json"
			}
		]
	},
	"include": [
		"./typings",
		"./do"
	]
}`);
		});

		assert.ok(result);

		// Changing the language triggers a file to be closed and opened again so wait for that event to happen.
		let newDoc;
		do {
			newDoc = await asPromise(docode.workspace.onDidOpenTextDocument, 5000);
		} while (doc.uri.toString() !== newDoc.uri.toString());

		assert.strictEqual(newDoc.languageId, 'json');
	});
});
