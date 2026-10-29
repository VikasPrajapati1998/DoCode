/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as docode from 'docode';
import { SymbolItemEditorHighlights } from './references-view';

export class EditorHighlights<T> {

	private readonly _decorationType: docode.TextEditorDecorationType;

	private readonly disposables: docode.Disposable[] = [];
	private readonly _ignore = new Set<string>();

	constructor(private readonly _view: docode.TreeView<T>, private readonly _delegate: SymbolItemEditorHighlights<T>) {
		this._decorationType = docode.window.createTextEditorDecorationType({
			backgroundColor: new docode.ThemeColor('editor.findMatchHighlightBackground'),
			rangeBehavior: docode.DecorationRangeBehavior.ClosedClosed,
			overviewRulerLane: docode.OverviewRulerLane.Center,
			overviewRulerColor: new docode.ThemeColor('editor.findMatchHighlightBackground'),
		});
		this.disposables.push(
			this._decorationType,
			docode.workspace.onDidChangeTextDocument(e => this._ignore.add(e.document.uri.toString())),
			docode.window.onDidChangeActiveTextEditor(() => _view.visible && this.update()),
			_view.onDidChangeVisibility(e => e.visible ? this._show() : this._hide()),
			_view.onDidChangeSelection(() => {
				if (_view.visible) {
					this.update();
				}
			})
		);
		this._show();
	}

	dispose() {
		docode.Disposable.from(...this.disposables).dispose();
	}

	private _show(): void {
		const { activeTextEditor: editor } = docode.window;
		if (!editor || !editor.viewColumn) {
			return;
		}
		if (this._ignore.has(editor.document.uri.toString())) {
			return;
		}
		const [anchor] = this._view.selection;
		if (!anchor) {
			return;
		}
		const ranges = this._delegate.getEditorHighlights(anchor, editor.document.uri);
		if (ranges) {
			editor.setDecorations(this._decorationType, ranges);
		}
	}

	private _hide(): void {
		for (const editor of docode.window.visibleTextEditors) {
			editor.setDecorations(this._decorationType, []);
		}
	}

	update(): void {
		this._hide();
		this._show();
	}
}
