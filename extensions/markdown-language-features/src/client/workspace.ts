/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as docode from 'docode';
import { ITextDocument } from '../types/textDocument';
import { Disposable } from '../util/dispose';
import { isMarkdownFile, looksLikeMarkdownPath } from '../util/file';
import { InMemoryDocument } from './inMemoryDocument';
import { ResourceMap } from '../util/resourceMap';

/**
 * Provides set of markdown files known to VS Code.
 *
 * This includes both opened text documents and markdown files in the workspace.
 */
export class VsCodeMdWorkspace extends Disposable {

	readonly #watcher: docode.FileSystemWatcher | undefined;

	readonly #documentCache = new ResourceMap<ITextDocument>();

	readonly #utf8Decoder = new TextDecoder('utf-8');

	constructor() {
		super();

		this.#watcher = this._register(docode.workspace.createFileSystemWatcher('**/*.md'));

		this._register(this.#watcher.onDidChange(async resource => {
			this.#documentCache.delete(resource);
		}));

		this._register(this.#watcher.onDidDelete(resource => {
			this.#documentCache.delete(resource);
		}));

		this._register(docode.workspace.onDidOpenTextDocument(e => {
			this.#documentCache.delete(e.uri);
		}));

		this._register(docode.workspace.onDidCloseTextDocument(e => {
			this.#documentCache.delete(e.uri);
		}));
	}

	#isRelevantMarkdownDocument(doc: docode.TextDocument) {
		return isMarkdownFile(doc) && doc.uri.scheme !== 'docode-bulkeditpreview';
	}

	public async getOrLoadMarkdownDocument(resource: docode.Uri): Promise<ITextDocument | undefined> {
		const existing = this.#documentCache.get(resource);
		if (existing) {
			return existing;
		}

		const matchingDocument = docode.workspace.textDocuments.find((doc) => this.#isRelevantMarkdownDocument(doc) && doc.uri.toString() === resource.toString());
		if (matchingDocument) {
			this.#documentCache.set(resource, matchingDocument);
			return matchingDocument;
		}

		if (!looksLikeMarkdownPath(resource)) {
			return undefined;
		}

		try {
			const bytes = await docode.workspace.fs.readFile(resource);

			// We assume that markdown is in UTF-8
			const text = this.#utf8Decoder.decode(bytes);
			const doc = new InMemoryDocument(resource, text, 0);
			this.#documentCache.set(resource, doc);
			return doc;
		} catch {
			return undefined;
		}
	}
}
