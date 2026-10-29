/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as docode from 'docode';
import { DocumentSelector } from '../configuration/documentSelector';
import { ClientCapability, ITypeScriptServiceClient } from '../typescriptService';
import DefinitionProviderBase from './definitionProviderBase';
import { conditionalRegistration, requireSomeCapability } from './util/dependentRegistration';

export default class TypeScriptTypeDefinitionProvider extends DefinitionProviderBase implements docode.TypeDefinitionProvider {
	public provideTypeDefinition(document: docode.TextDocument, position: docode.Position, token: docode.CancellationToken): Promise<docode.Definition | undefined> {
		return this.getSymbolLocations('typeDefinition', document, position, token);
	}
}

export function register(
	selector: DocumentSelector,
	client: ITypeScriptServiceClient,
) {
	return conditionalRegistration([
		requireSomeCapability(client, ClientCapability.EnhancedSyntax, ClientCapability.Semantic),
	], () => {
		return docode.languages.registerTypeDefinitionProvider(selector.syntax,
			new TypeScriptTypeDefinitionProvider(client));
	});
}
