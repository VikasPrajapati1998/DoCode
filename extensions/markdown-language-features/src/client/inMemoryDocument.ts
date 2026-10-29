/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TextDocument } from 'vscode-languageserver-textdocument';
import * as docode from 'docode';
import { ITextDocument } from '../types/textDocument';

export class InMemoryDocument implements ITextDocument {

	readonly #doc: TextDocument;

	public readonly uri: docode.Uri;
	public readonly version: number;

	constructor(
		uri: docode.Uri,
		contents: string,
		version: number = 0,
	) {
		this.uri = uri;
		this.version = version;
		this.#doc = TextDocument.create(this.uri.toString(), 'markdown', 0, contents);
	}

	getText(range?: docode.Range): string {
		return this.#doc.getText(range);
	}

	positionAt(offset: number): docode.Position {
		const pos = this.#doc.positionAt(offset);
		return new docode.Position(pos.line, pos.character);
	}
}
