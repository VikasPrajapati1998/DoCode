/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import * as docode from 'docode';
import { getMarkdownLocalResourceRoots } from '../util/resources';

suite('Markdown local resource roots', () => {
	const mediaRoot = docode.Uri.parse('test:/extension/media');
	const workspaceRootA = docode.Uri.parse('test:/workspace/a');
	const workspaceRootB = docode.Uri.parse('test:/workspace/b');
	const workspaceFolders: readonly docode.WorkspaceFolder[] = [
		{ index: 0, name: 'a', uri: workspaceRootA },
		{ index: 1, name: 'b', uri: workspaceRootB },
	];

	test('Uses all workspace roots for a workspace resource', () => {
		const resource = docode.Uri.parse('test:/workspace/a/docs/readme.md');
		const workspaceContext = {
			workspaceFolders,
			getWorkspaceFolder: () => workspaceFolders[0],
		};

		assert.deepStrictEqual(
			getMarkdownLocalResourceRoots(resource, [mediaRoot], { workspaceContext }),
			[mediaRoot, workspaceRootA, workspaceRootB],
		);
	});

	test('Uses the document directory outside a workspace', () => {
		const resource = docode.Uri.parse('test:/outside/docs/readme.md');
		const workspaceContext = {
			workspaceFolders,
			getWorkspaceFolder: () => undefined,
		};

		assert.deepStrictEqual(
			getMarkdownLocalResourceRoots(resource, [mediaRoot], { workspaceContext }),
			[mediaRoot, docode.Uri.parse('test:/outside/docs')],
		);
	});

	test('Does not include workspace resources when disabled', () => {
		const resource = docode.Uri.parse('test:/workspace/a/docs/readme.md');
		const workspaceContext = {
			workspaceFolders,
			getWorkspaceFolder: () => workspaceFolders[0],
		};

		assert.deepStrictEqual(
			getMarkdownLocalResourceRoots(resource, [mediaRoot], {
				includeWorkspaceResources: false,
				workspaceContext,
			}),
			[mediaRoot],
		);
	});
});
