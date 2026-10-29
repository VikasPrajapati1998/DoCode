/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { suite, test } from 'node:test';
import * as i18n from '../i18n.ts';

suite('XLF Parser Tests', () => {
	const sampleXlf = '<?xml version="1.0" encoding="utf-8"?><xliff version="1.2" xmlns="urn:oasis:names:tc:xliff:document:1.2"><file original="do/base/common/keybinding" source-language="en" datatype="plaintext"><body><trans-unit id="key1"><source xml:lang="en">Key #1</source></trans-unit><trans-unit id="key2"><source xml:lang="en">Key #2 &amp;</source></trans-unit></body></file></xliff>';
	const sampleTranslatedXlf = '<?xml version="1.0" encoding="utf-8"?><xliff version="1.2" xmlns="urn:oasis:names:tc:xliff:document:1.2"><file original="do/base/common/keybinding" source-language="en" target-language="ru" datatype="plaintext"><body><trans-unit id="key1"><source xml:lang="en">Key #1</source><target>Кнопка #1</target></trans-unit><trans-unit id="key2"><source xml:lang="en">Key #2 &amp;</source><target>Кнопка #2 &amp;</target></trans-unit></body></file></xliff>';
	const name = 'do/base/common/keybinding';
	const keys = ['key1', 'key2'];
	const messages = ['Key #1', 'Key #2 &'];
	const translatedMessages = { key1: 'Кнопка #1', key2: 'Кнопка #2 &' };

	test('Keys & messages to XLF conversion', () => {
		const xlf = new i18n.XLF('docode-workbench');
		xlf.addFile(name, keys, messages);
		const xlfString = xlf.toString();

		assert.strictEqual(xlfString.replace(/\s{2,}/g, ''), sampleXlf);
	});

	test('XLF to keys & messages conversion', () => {
		i18n.XLF.parse(sampleTranslatedXlf).then(function (resolvedFiles) {
			assert.deepStrictEqual(resolvedFiles[0].messages, translatedMessages);
			assert.strictEqual(resolvedFiles[0].name, name);
		});
	});

	test('JSON file source path to Transifex resource match', () => {
		const editorProject: string = 'docode-editor',
			workbenchProject: string = 'docode-workbench',
			sessionsProject: string = 'docode-sessions';

		const platform: i18n.Resource = { name: 'do/platform', project: editorProject },
			editorContrib = { name: 'do/editor/contrib', project: editorProject },
			editor = { name: 'do/editor', project: editorProject },
			base = { name: 'do/base', project: editorProject },
			code = { name: 'do/code', project: workbenchProject },
			workbenchParts = { name: 'do/workbench/contrib/html', project: workbenchProject },
			workbenchServices = { name: 'do/workbench/services/textfile', project: workbenchProject },
			workbench = { name: 'do/workbench', project: workbenchProject },
			sessionsContrib = { name: 'do/sessions/contrib/chat', project: sessionsProject },
			sessions = { name: 'do/sessions', project: sessionsProject };

		assert.deepStrictEqual(i18n.getResource('do/platform/actions/browser/menusExtensionPoint'), platform);
		assert.deepStrictEqual(i18n.getResource('do/editor/contrib/clipboard/browser/clipboard'), editorContrib);
		assert.deepStrictEqual(i18n.getResource('do/editor/common/modes/modesRegistry'), editor);
		assert.deepStrictEqual(i18n.getResource('do/base/common/errorMessage'), base);
		assert.deepStrictEqual(i18n.getResource('do/code/electron-main/window'), code);
		assert.deepStrictEqual(i18n.getResource('do/workbench/contrib/html/browser/webview'), workbenchParts);
		assert.deepStrictEqual(i18n.getResource('do/workbench/services/textfile/node/testFileService'), workbenchServices);
		assert.deepStrictEqual(i18n.getResource('do/workbench/browser/parts/panel/panelActions'), workbench);
		assert.deepStrictEqual(i18n.getResource('do/sessions/contrib/chat/browser/chatWidget'), sessionsContrib);
		assert.deepStrictEqual(i18n.getResource('do/sessions/browser/layoutActions'), sessions);
	});
});
