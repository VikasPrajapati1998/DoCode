/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { getRepositoryRootFromWorktree } from '../../common/worktreePaths.js';

suite('worktreePaths', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('derives the repository of a VS Code-created worktree from its path', () => {
		const derive = (uri: URI) => getRepositoryRootFromWorktree(uri)?.toString();

		assert.deepStrictEqual({
			local: derive(URI.file('/src/docode.worktrees/task')),
			remote: derive(URI.parse('docode-agent-host://remote/home/me/app.worktrees/task')),
			notAWorktree: derive(URI.file('/src/docode')),
			nested: derive(URI.file('/src/docode.worktrees/task/packages')),
			unnamed: derive(URI.file('/src/.worktrees/task')),
		}, {
			local: URI.file('/src/docode').toString(),
			remote: 'docode-agent-host://remote/home/me/app',
			notAWorktree: undefined,
			nested: undefined,
			unnamed: undefined,
		});
	});
});
