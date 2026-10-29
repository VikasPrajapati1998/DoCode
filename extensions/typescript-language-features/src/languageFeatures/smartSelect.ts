/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as docode from 'docode';
import { DocumentSelector } from '../configuration/documentSelector';
import type * as Proto from '../tsServer/protocol/protocol';
import * as typeConverters from '../typeConverters';
import { ITypeScriptServiceClient } from '../typescriptService';

class SmartSelection implements docode.SelectionRangeProvider {

	public constructor(
		private readonly client: ITypeScriptServiceClient
	) { }

	public async provideSelectionRanges(
		document: docode.TextDocument,
		positions: docode.Position[],
		token: docode.CancellationToken,
	): Promise<docode.SelectionRange[] | undefined> {
		const file = this.client.toOpenTsFilePath(document);
		if (!file) {
			return undefined;
		}

		const args: Proto.SelectionRangeRequestArgs = {
			file,
			locations: positions.map(typeConverters.Position.toLocation)
		};
		const response = await this.client.execute('selectionRange', args, token);
		if (response.type !== 'response' || !response.body) {
			return undefined;
		}
		return response.body.map(SmartSelection.convertSelectionRange);
	}

	private static convertSelectionRange(
		selectionRange: Proto.SelectionRange
	): docode.SelectionRange {
		return new docode.SelectionRange(
			typeConverters.Range.fromTextSpan(selectionRange.textSpan),
			selectionRange.parent ? SmartSelection.convertSelectionRange(selectionRange.parent) : undefined,
		);
	}
}

export function register(
	selector: DocumentSelector,
	client: ITypeScriptServiceClient,
) {
	return docode.languages.registerSelectionRangeProvider(selector.syntax, new SmartSelection(client));
}
