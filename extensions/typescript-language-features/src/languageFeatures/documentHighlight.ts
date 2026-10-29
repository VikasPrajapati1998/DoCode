/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as docode from 'docode';
import { DocumentSelector } from '../configuration/documentSelector';
import type * as Proto from '../tsServer/protocol/protocol';
import * as typeConverters from '../typeConverters';
import { ITypeScriptServiceClient } from '../typescriptService';

class TypeScriptDocumentHighlightProvider implements docode.DocumentHighlightProvider, docode.MultiDocumentHighlightProvider {
	public constructor(
		private readonly client: ITypeScriptServiceClient
	) { }

	public async provideMultiDocumentHighlights(
		document: docode.TextDocument,
		position: docode.Position,
		otherDocuments: docode.TextDocument[],
		token: docode.CancellationToken
	): Promise<docode.MultiDocumentHighlight[]> {
		const allFiles = [document, ...otherDocuments].map(doc => this.client.toOpenTsFilePath(doc)).filter(file => !!file) as string[];
		const file = this.client.toOpenTsFilePath(document);

		if (!file || allFiles.length === 0) {
			return [];
		}

		const args = {
			...typeConverters.Position.toFileLocationRequestArgs(file, position),
			filesToSearch: allFiles
		};
		const response = await this.client.execute('documentHighlights', args, token);
		if (response.type !== 'response' || !response.body) {
			return [];
		}

		const result = response.body.map(highlightItem =>
			new docode.MultiDocumentHighlight(
				docode.Uri.file(highlightItem.file),
				[...convertDocumentHighlight(highlightItem)]
			)
		);

		return result;
	}

	public async provideDocumentHighlights(
		document: docode.TextDocument,
		position: docode.Position,
		token: docode.CancellationToken
	): Promise<docode.DocumentHighlight[]> {
		const file = this.client.toOpenTsFilePath(document);
		if (!file) {
			return [];
		}

		const args = {
			...typeConverters.Position.toFileLocationRequestArgs(file, position),
			filesToSearch: [file]
		};
		const response = await this.client.execute('documentHighlights', args, token);
		if (response.type !== 'response' || !response.body) {
			return [];
		}

		return response.body.flatMap(convertDocumentHighlight);
	}
}

function convertDocumentHighlight(highlight: Proto.DocumentHighlightsItem): ReadonlyArray<docode.DocumentHighlight> {
	return highlight.highlightSpans.map(span =>
		new docode.DocumentHighlight(
			typeConverters.Range.fromTextSpan(span),
			span.kind === 'writtenReference' ? docode.DocumentHighlightKind.Write : docode.DocumentHighlightKind.Read));
}

export function register(
	selector: DocumentSelector,
	client: ITypeScriptServiceClient,
) {
	const provider = new TypeScriptDocumentHighlightProvider(client);

	return docode.Disposable.from(
		docode.languages.registerDocumentHighlightProvider(selector.syntax, provider),
		docode.languages.registerMultiDocumentHighlightProvider(selector.syntax, provider)
	);
}
