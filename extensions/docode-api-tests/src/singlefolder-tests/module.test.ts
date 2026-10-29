/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import * as docode from 'docode';
import * as fs from 'fs';
import * as path from 'path';

suite('docode API - Module Interception', () => {

	test('import and require(docode) return the same API instance in ESM', async function () {
		// This file CANNOT be written to the OS temp directory.
		// The VS Code API module interceptor looks up the extension by associating
		// the parent URL via path containment. If the file is placed outside the
		// extension's directory, the interceptor will fail to provide the 'docode' module.
		const testFile = path.join(__dirname, 'esm-test.mjs');
		try {
			try {
				fs.writeFileSync(testFile, `
// THIS IS A TEMPORARY FILE CREATED BY DOCODE-API-TESTS (module.test.ts)
// IT SHOULD BE AUTO-DELETED. IF YOU SEE THIS, IT IS SAFE TO REMOVE.
import * as docode1 from 'docode';
import { createRequire } from 'node:module';
import * as assert from 'assert';

export function runTest() {
	const docode2 = createRequire(import.meta.url)('docode');
	assert.ok(Object.keys(docode1).length > 0);
	for (const key of Object.keys(docode1)) {
		assert.strictEqual(docode1[key], docode2[key], "Mismatch at " + key);
	}
	return true;
}
`);
			} catch (err) {
				this.skip();
			}

			const asyncImport = new Function('url', 'return import(url)');
			const m = await asyncImport(docode.Uri.file(testFile).toString(true));
			assert.strictEqual(m.runTest(), true);
		} finally {
			try { fs.unlinkSync(testFile); } catch (err) { /* ignore */ }
		}
	});

});
