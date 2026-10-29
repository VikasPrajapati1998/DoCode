/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as docode from 'docode';
import { isJsConfigOrTsConfigFileName } from '../configuration/languageDescription';
import { isSupportedLanguageMode } from '../configuration/languageIds';
import { Disposable } from '../utils/dispose';
import { coalesce } from '../utils/arrays';

/**
 * Tracks the active JS/TS editor.
 *
 * This tries to handle the case where the user focuses in the output view / debug console.
 * When this happens, we want to treat the last real focused editor as the active editor,
 * instead of using `docode.window.activeTextEditor`
 */
export class ActiveJsTsEditorTracker extends Disposable {

	private _activeJsTsEditor: docode.TextEditor | undefined;

	private readonly _onDidChangeActiveJsTsEditor = this._register(new docode.EventEmitter<docode.TextEditor | undefined>());
	public readonly onDidChangeActiveJsTsEditor = this._onDidChangeActiveJsTsEditor.event;

	public constructor() {
		super();

		this._register(docode.window.onDidChangeActiveTextEditor(_ => this.update()));
		this._register(docode.window.onDidChangeVisibleTextEditors(_ => this.update()));
		this._register(docode.window.tabGroups.onDidChangeTabGroups(_ => this.update()));

		this.update();
	}

	public get activeJsTsEditor(): docode.TextEditor | undefined {
		return this._activeJsTsEditor;
	}


	private update() {
		// Use tabs to find the active editor.
		// This correctly handles switching to the output view / debug console, which changes the activeEditor but not
		// the active tab.
		const editorCandidates = this.getEditorCandidatesForActiveTab();
		const managedEditors = editorCandidates.filter(editor => this.isManagedFile(editor));
		const newActiveJsTsEditor = managedEditors.at(0);
		if (this._activeJsTsEditor !== newActiveJsTsEditor) {
			this._activeJsTsEditor = newActiveJsTsEditor;
			this._onDidChangeActiveJsTsEditor.fire(this._activeJsTsEditor);
		}
	}

	private getEditorCandidatesForActiveTab(): docode.TextEditor[] {
		const tab = docode.window.tabGroups.activeTabGroup.activeTab;
		if (!tab) {
			return [];
		}

		// Basic text editor tab
		if (tab.input instanceof docode.TabInputText) {
			const inputUri = tab.input.uri;
			const editor = docode.window.visibleTextEditors.find(editor => {
				return editor.document.uri.toString() === inputUri.toString()
					&& editor.viewColumn === tab.group.viewColumn;
			});
			return editor ? [editor] : [];
		}

		// Diff editor tab. We could be focused on either side of the editor.
		if (tab.input instanceof docode.TabInputTextDiff) {
			const original = tab.input.original;
			const modified = tab.input.modified;
			// Check the active editor first. However if a non tab editor like the output view is focused,
			// we still need to check the visible text editors.
			// TODO: This may return incorrect editors incorrect as there does not seem to be a reliable way to map from an editor to the
			// view column of its parent diff editor. See https://github.com/microsoft/vscode/issues/201845
			return coalesce([docode.window.activeTextEditor, ...docode.window.visibleTextEditors]).filter(editor => {
				return (editor.document.uri.toString() === original.toString() || editor.document.uri.toString() === modified.toString())
					&& editor.viewColumn === undefined; // Editors in diff views have undefined view columns
			});
		}

		// Notebook editor. Find editor for notebook cell.
		if (tab.input instanceof docode.TabInputNotebook) {
			const activeEditor = docode.window.activeTextEditor;
			if (!activeEditor) {
				return [];
			}

			// Notebooks cell editors have undefined view columns.
			if (activeEditor.viewColumn !== undefined) {
				return [];
			}

			const notebook = docode.window.visibleNotebookEditors.find(editor =>
				editor.notebook.uri.toString() === (tab.input as docode.TabInputNotebook).uri.toString()
				&& editor.viewColumn === tab.group.viewColumn);

			return notebook?.notebook.getCells().some(cell => cell.document.uri.toString() === activeEditor.document.uri.toString()) ? [activeEditor] : [];
		}

		return [];
	}

	private isManagedFile(editor: docode.TextEditor): boolean {
		return this.isManagedScriptFile(editor) || this.isManagedConfigFile(editor);
	}

	private isManagedScriptFile(editor: docode.TextEditor): boolean {
		return isSupportedLanguageMode(editor.document);
	}

	private isManagedConfigFile(editor: docode.TextEditor): boolean {
		return isJsConfigOrTsConfigFileName(editor.document.fileName);
	}
}
