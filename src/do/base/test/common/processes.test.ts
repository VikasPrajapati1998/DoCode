/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as processes from '../../common/processes.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from './utils.js';

suite('Processes', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('sanitizeProcessEnvironment', () => {
		const env = {
			FOO: 'bar',
			ELECTRON_ENABLE_STACK_DUMPING: 'x',
			ELECTRON_ENABLE_LOGGING: 'x',
			ELECTRON_NO_ASAR: 'x',
			ELECTRON_NO_ATTACH_CONSOLE: 'x',
			ELECTRON_RUN_AS_NODE: 'x',
			DOCODE_CLI: 'x',
			DOCODE_DEV: 'x',
			DOCODE_IPC_HOOK: 'x',
			DOCODE_NLS_CONFIG: 'x',
			DOCODE_PORTABLE: '3',
			DOCODE_PID: 'x',
			DOCODE_SHELL_LOGIN: '1',
			DOCODE_CODE_CACHE_PATH: 'x',
			DOCODE_NEW_VAR: 'x',
			GDK_PIXBUF_MODULE_FILE: 'x',
			GDK_PIXBUF_MODULEDIR: 'x',
			DOCODE_PYTHON_BASH_ACTIVATE: 'source /path/to/venv/bin/activate',
			DOCODE_PYTHON_ZSH_ACTIVATE: 'source /path/to/venv/bin/activate',
			DOCODE_PYTHON_PWSH_ACTIVATE: '. /path/to/venv/Scripts/Activate.ps1',
			DOCODE_PYTHON_FISH_ACTIVATE: 'source /path/to/venv/bin/activate.fish',
			DOCODE_PYTHON_AUTOACTIVATE_GUARD: '1'
		};
		processes.sanitizeProcessEnvironment(env);
		assert.strictEqual(env['FOO'], 'bar');
		assert.strictEqual(env['DOCODE_SHELL_LOGIN'], '1');
		assert.strictEqual(env['DOCODE_PORTABLE'], '3');
		assert.strictEqual(env['DOCODE_PYTHON_BASH_ACTIVATE'], undefined);
		assert.strictEqual(env['DOCODE_PYTHON_ZSH_ACTIVATE'], undefined);
		assert.strictEqual(env['DOCODE_PYTHON_PWSH_ACTIVATE'], undefined);
		assert.strictEqual(env['DOCODE_PYTHON_FISH_ACTIVATE'], undefined);
		assert.strictEqual(env['DOCODE_PYTHON_AUTOACTIVATE_GUARD'], undefined);
		assert.strictEqual(Object.keys(env).length, 3);
	});

	test('removeDangerousEnvVariables', () => {
		const env = {
			SAFE: 'value',
			DEBUG: 'value',
			debug: 'value',
			NODE_OPTIONS: '--import=data:text/javascript,',
			Node_Options: '--require=module',
			DOCODE_NODE_OPTIONS: '--import=data:text/javascript,',
			Docode_Node_Options: '--require=module',
			LD_PRELOAD: 'library',
			ld_preload: 'library',
			DYLD_INSERT_LIBRARIES: 'library',
			Dyld_Insert_Libraries: 'library'
		};

		processes.removeDangerousEnvVariables(env);

		assert.deepStrictEqual(env, { SAFE: 'value' });
	});
});
