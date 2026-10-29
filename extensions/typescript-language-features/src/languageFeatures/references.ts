/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as docode from 'docode';
import { DocumentSelector } from '../configuration/documentSelector';
import * as typeConverters from '../typeConverters';
import { ClientCapability, ITypeScriptServiceClient } from '../typescriptService';
import { conditionalRegistration, requireSomeCapability } from './util/dependentRegistration';

class TypeScriptReferenceSupport implements docode.ReferenceProvider {
	public constructor(
		private readonly client: ITypeScriptServiceClient) { }

	public async provideReferences(
		document: docode.TextDocument,
		position: docode.Position,
		options: docode.ReferenceContext,
		token: docode.CancellationToken
	): Promise<docode.Location[]> {
		const filepath = this.client.toOpenTsFilePath(document);
		if (!filepath) {
			return [];
		}

		const args = typeConverters.Position.toFileLocationRequestArgs(filepath, position);
		const response = await this.client.execute('references', args, token);
		if (response.type !== 'response' || !response.body) {
			return [];
		}

		const result: docode.Location[] = [];
		for (const ref of response.body.refs) {
			if (!options.includeDeclaration && ref.isDefinition) {
				continue;
			}
			const url = this.client.toResource(ref.file);
			const location = typeConverters.Location.fromTextSpan(url, ref);
			result.push(location);
		}
		return result;
	}
}

export function register(
	selector: DocumentSelector,
	client: ITypeScriptServiceClient
) {
	return conditionalRegistration([
		requireSomeCapability(client, ClientCapability.EnhancedSyntax, ClientCapability.Semantic),
	], () => {
		return docode.languages.registerReferenceProvider(selector.syntax,
			new TypeScriptReferenceSupport(client));
	});
}
