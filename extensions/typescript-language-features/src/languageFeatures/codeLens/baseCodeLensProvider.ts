/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as docode from 'docode';
import { CachedResponse } from '../../tsServer/cachedResponse';
import type * as Proto from '../../tsServer/protocol/protocol';
import * as typeConverters from '../../typeConverters';
import { ITypeScriptServiceClient } from '../../typescriptService';
import { escapeRegExp } from '../../utils/regexp';
import { Disposable } from '../../utils/dispose';


export class ReferencesCodeLens extends docode.CodeLens {
	constructor(
		public document: docode.Uri,
		public file: string,
		range: docode.Range
	) {
		super(range);
	}
}

export abstract class TypeScriptBaseCodeLensProvider extends Disposable implements docode.CodeLensProvider<ReferencesCodeLens> {
	protected changeEmitter = this._register(new docode.EventEmitter<void>());
	public onDidChangeCodeLenses = this.changeEmitter.event;

	public static readonly cancelledCommand: docode.Command = {
		// Cancellation is not an error. Just show nothing until we can properly re-compute the code lens
		title: '',
		command: ''
	};

	public static readonly errorCommand: docode.Command = {
		title: docode.l10n.t("Could not determine references"),
		command: ''
	};

	public constructor(
		protected client: ITypeScriptServiceClient,
		private readonly cachedResponse: CachedResponse<Proto.NavTreeResponse>
	) {
		super();
	}

	async provideCodeLenses(document: docode.TextDocument, token: docode.CancellationToken): Promise<ReferencesCodeLens[]> {
		const filepath = this.client.toOpenTsFilePath(document);
		if (!filepath) {
			return [];
		}

		const response = await this.cachedResponse.execute(document, () => this.client.execute('navtree', { file: filepath }, token));
		if (response.type !== 'response') {
			return [];
		}

		const referenceableSpans: docode.Range[] = [];
		response.body?.childItems?.forEach(item => this.walkNavTree(document, item, undefined, referenceableSpans));
		return referenceableSpans.map(span => new ReferencesCodeLens(document.uri, filepath, span));
	}

	protected abstract extractSymbol(
		document: docode.TextDocument,
		item: Proto.NavigationTree,
		parent: Proto.NavigationTree | undefined
	): docode.Range | undefined;

	private walkNavTree(
		document: docode.TextDocument,
		item: Proto.NavigationTree,
		parent: Proto.NavigationTree | undefined,
		results: docode.Range[]
	): void {
		const range = this.extractSymbol(document, item, parent);
		if (range) {
			results.push(range);
		}

		item.childItems?.forEach(child => this.walkNavTree(document, child, item, results));
	}
}

export function getSymbolRange(
	document: docode.TextDocument,
	item: Proto.NavigationTree
): docode.Range | undefined {
	if (item.nameSpan) {
		return typeConverters.Range.fromTextSpan(item.nameSpan);
	}

	// In older versions, we have to calculate this manually. See #23924
	const span = item.spans?.[0];
	if (!span) {
		return undefined;
	}

	const range = typeConverters.Range.fromTextSpan(span);
	const text = document.getText(range);

	const identifierMatch = new RegExp(`^(.*?(\\b|\\W))${escapeRegExp(item.text || '')}(\\b|\\W)`, 'gm');
	const match = identifierMatch.exec(text);
	const prefixLength = match ? match.index + match[1].length : 0;
	const startOffset = document.offsetAt(new docode.Position(range.start.line, range.start.character)) + prefixLength;
	return new docode.Range(
		document.positionAt(startOffset),
		document.positionAt(startOffset + item.text.length));
}
