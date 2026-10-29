/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'mocha';
import * as docode from 'docode';
import { disposeAll } from '../../utils/dispose';
import { acceptFirstSuggestion } from '../suggestTestHelpers';
import { assertEditorContents, Config, createTestEditor, CURSOR, enumerateConfig, insertModesValues, joinLines, updateConfig, VsCodeConfiguration } from '../testUtils';

const testDocumentUri = docode.Uri.parse('untitled:test.ts');

suite('JSDoc Completions', () => {
	const _disposables: docode.Disposable[] = [];

	const configDefaults = Object.freeze<VsCodeConfiguration>({
		[Config.snippetSuggestions]: 'inline',
	});

	let oldConfig: { [key: string]: any } = {};

	setup(async () => {
		// the tests assume that typescript features are registered
		await docode.extensions.getExtension('docode.typescript-language-features')!.activate();

		// Save off config and apply defaults
		oldConfig = await updateConfig(testDocumentUri, configDefaults);
	});

	teardown(async () => {
		disposeAll(_disposables);

		// Restore config
		await updateConfig(testDocumentUri, oldConfig);

		return docode.commands.executeCommand('workbench.action.closeAllEditors');
	});

	test('Should complete jsdoc inside single line comment', async () => {
		await enumerateConfig(testDocumentUri, Config.insertMode, insertModesValues, async config => {

			const editor = await createTestEditor(testDocumentUri,
				`/**$0 */`,
				`function abcdef(x, y) { }`,
			);

			await acceptFirstSuggestion(testDocumentUri, _disposables);

			assertEditorContents(editor,
				joinLines(
					`/**`,
					` * `,
					` * @param x ${CURSOR}`,
					` * @param y `,
					` */`,
					`function abcdef(x, y) { }`,
				),
				`Config: ${config}`);
		});
	});
});
