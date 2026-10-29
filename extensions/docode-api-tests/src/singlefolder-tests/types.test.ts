/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import * as docode from 'docode';
import { assertNoRpc } from '../utils';

suite('docode API - types', () => {

	teardown(assertNoRpc);

	test('static properties, es5 compat class', function () {
		assert.ok(docode.ThemeIcon.File instanceof docode.ThemeIcon);
		assert.ok(docode.ThemeIcon.Folder instanceof docode.ThemeIcon);
		assert.ok(docode.CodeActionKind.Empty instanceof docode.CodeActionKind);
		assert.ok(docode.CodeActionKind.QuickFix instanceof docode.CodeActionKind);
		assert.ok(docode.CodeActionKind.Refactor instanceof docode.CodeActionKind);
		assert.ok(docode.CodeActionKind.RefactorExtract instanceof docode.CodeActionKind);
		assert.ok(docode.CodeActionKind.RefactorInline instanceof docode.CodeActionKind);
		assert.ok(docode.CodeActionKind.RefactorMove instanceof docode.CodeActionKind);
		assert.ok(docode.CodeActionKind.RefactorRewrite instanceof docode.CodeActionKind);
		assert.ok(docode.CodeActionKind.Source instanceof docode.CodeActionKind);
		assert.ok(docode.CodeActionKind.SourceOrganizeImports instanceof docode.CodeActionKind);
		assert.ok(docode.CodeActionKind.SourceFixAll instanceof docode.CodeActionKind);
		// assert.ok(docode.QuickInputButtons.Back instanceof docode.QuickInputButtons); never was an instance

	});
});
