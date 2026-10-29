/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import * as docode from 'docode';

suite('Markdown editor pull diagnostics', () => {
	test('validates and clears diagnostics with only a custom-editor tab open', async function () {
		this.timeout(30000);
		const folder = docode.workspace.workspaceFolders?.[0];
		assert.ok(folder, 'The integration test requires a workspace folder');
		const uri = docode.Uri.joinPath(folder.uri, `markdown-rich-diagnostics-${Date.now()}.md`);
		const config = docode.workspace.getConfiguration('markdown', uri);
		const previousEnabled = config.inspect<boolean>('validate.enabled')?.workspaceValue;
		const previousFragments = config.inspect<string>('validate.fragmentLinks.enabled')?.workspaceValue;
		await docode.workspace.fs.writeFile(uri, new TextEncoder().encode('# Heading\n\n[broken](#missing)\n'));
		try {
			await config.update('validate.enabled', true, docode.ConfigurationTarget.Workspace);
			await config.update('validate.fragmentLinks.enabled', 'warning', docode.ConfigurationTarget.Workspace);
			await docode.commands.executeCommand('docode.openWith', uri, 'docode.markdown.editor');

			const document = await docode.workspace.openTextDocument(uri);
			const assertCustomOnly = () => {
				const tabs = docode.window.tabGroups.all.flatMap(group => group.tabs);
				assert.ok(tabs.some(tab => tab.input instanceof docode.TabInputCustom && tab.input.uri.toString() === uri.toString()));
				assert.ok(!tabs.some(tab => tab.input instanceof docode.TabInputText && tab.input.uri.toString() === uri.toString()));
				assert.ok(!docode.window.visibleTextEditors.some(editor => editor.document.uri.toString() === uri.toString()));
			};
			assertCustomOnly();
			await waitForDiagnostics(uri, items => items.some(item => item.range.start.line === 2 && item.severity === docode.DiagnosticSeverity.Warning));

			const edit = new docode.WorkspaceEdit();
			edit.replace(uri, new docode.Range(2, 0, 2, document.lineAt(2).text.length), '[fixed](#heading)');
			assert.ok(await docode.workspace.applyEdit(edit));
			await waitForDiagnostics(uri, items => items.length === 0);
			assertCustomOnly();
		} finally {
			const document = docode.workspace.textDocuments.find(document => document.uri.toString() === uri.toString());
			if (document?.isDirty) {
				await document.save();
			}
			const tabs = docode.window.tabGroups.all.flatMap(group => group.tabs)
				.filter(tab => tab.input instanceof docode.TabInputCustom && tab.input.uri.toString() === uri.toString());
			await docode.window.tabGroups.close(tabs);
			await docode.workspace.fs.delete(uri);
			await config.update('validate.enabled', previousEnabled, docode.ConfigurationTarget.Workspace);
			await config.update('validate.fragmentLinks.enabled', previousFragments, docode.ConfigurationTarget.Workspace);
		}
	});
});

async function waitForDiagnostics(uri: docode.Uri, matches: (items: readonly docode.Diagnostic[]) => boolean): Promise<void> {
	const deadline = Date.now() + 10000;
	while (Date.now() < deadline) {
		if (matches(docode.languages.getDiagnostics(uri))) {
			return;
		}
		await new Promise(resolve => setTimeout(resolve, 50));
	}
	assert.fail(`Timed out waiting for diagnostics: ${JSON.stringify(docode.languages.getDiagnostics(uri))}`);
}
