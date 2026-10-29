/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as docode from 'docode';
import { Disposable } from '../util/dispose';
import { isMarkdownFile } from '../util/file';
import { ResourceMap } from '../util/resourceMap';

export interface LastScrollLocation {
	readonly line: number;
	readonly uri: docode.Uri;
}

export class TopmostLineMonitor extends Disposable {

	readonly #pendingUpdates = new ResourceMap<number>();
	readonly #throttle = 50;
	readonly #previousTextEditorInfo = new ResourceMap<LastScrollLocation>();
	readonly #previousStaticEditorInfo = new ResourceMap<LastScrollLocation>();

	constructor() {
		super();

		if (docode.window.activeTextEditor) {
			const line = getVisibleLine(docode.window.activeTextEditor);
			this.setPreviousTextEditorLine({ uri: docode.window.activeTextEditor.document.uri, line: line ?? 0 });
		}

		this._register(docode.window.onDidChangeTextEditorVisibleRanges(event => {
			if (isMarkdownFile(event.textEditor.document)) {
				const line = getVisibleLine(event.textEditor);
				if (typeof line === 'number') {
					this.updateLine(event.textEditor.document.uri, line);
					this.setPreviousTextEditorLine({ uri: event.textEditor.document.uri, line: line });
				}
			}
		}));
	}

	readonly #onChanged = this._register(new docode.EventEmitter<{ readonly resource: docode.Uri; readonly line: number }>());
	public readonly onDidChanged = this.#onChanged.event;

	public setPreviousStaticEditorLine(scrollLocation: LastScrollLocation): void {
		this.#previousStaticEditorInfo.set(scrollLocation.uri, scrollLocation);
	}

	public getPreviousStaticEditorLineByUri(resource: docode.Uri): number | undefined {
		return this.#previousStaticEditorInfo.get(resource)?.line;
	}


	public setPreviousTextEditorLine(scrollLocation: LastScrollLocation): void {
		this.#previousTextEditorInfo.set(scrollLocation.uri, scrollLocation);
	}

	public getPreviousTextEditorLineByUri(resource: docode.Uri): number | undefined {
		const scrollLoc = this.#previousTextEditorInfo.get(resource);
		this.#previousTextEditorInfo.delete(resource);
		return scrollLoc?.line;
	}
	public updateLine(
		resource: docode.Uri,
		line: number
	) {
		if (!this.#pendingUpdates.has(resource)) {
			// schedule update
			setTimeout(() => {
				if (this.#pendingUpdates.has(resource)) {
					this.#onChanged.fire({
						resource,
						line: this.#pendingUpdates.get(resource) as number
					});
					this.#pendingUpdates.delete(resource);
				}
			}, this.#throttle);
		}

		this.#pendingUpdates.set(resource, line);
	}
}

/**
 * Get the top-most visible range of `editor`.
 *
 * Returns a fractional line number based the visible character within the line.
 * Floor to get real line number
 */
export function getVisibleLine(
	editor: docode.TextEditor
): number | undefined {
	if (!editor.visibleRanges.length) {
		return undefined;
	}

	const firstVisiblePosition = editor.visibleRanges[0].start;
	const lineNumber = firstVisiblePosition.line;
	const line = editor.document.lineAt(lineNumber);
	const progress = firstVisiblePosition.character / (line.text.length + 2);
	return lineNumber + progress;
}
