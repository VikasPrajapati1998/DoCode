/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as docode from 'docode';
import { DocumentSelector } from '../configuration/documentSelector';
import type * as Proto from '../tsServer/protocol/protocol';
import * as typeConverters from '../typeConverters';
import { ClientCapability, ITypeScriptServiceClient } from '../typescriptService';
import { SignatureHelpState } from './signatureHelpState';
import { conditionalRegistration, requireSomeCapability } from './util/dependentRegistration';
import * as Previewer from './util/textRendering';

class TypeScriptSignatureHelpProvider implements docode.SignatureHelpProvider {

	public static readonly triggerCharacters = ['(', ',', '<'];
	public static readonly retriggerCharacters = [')'];

	private readonly state = new SignatureHelpState();

	public constructor(
		private readonly client: ITypeScriptServiceClient
	) { }

	public async provideSignatureHelp(
		document: docode.TextDocument,
		position: docode.Position,
		token: docode.CancellationToken,
		context: docode.SignatureHelpContext,
	): Promise<docode.SignatureHelp | undefined> {
		const filepath = this.client.toOpenTsFilePath(document);
		if (!filepath) {
			return undefined;
		}
		const requestId = this.state.startRequest(document);

		const args: Proto.SignatureHelpRequestArgs = {
			...typeConverters.Position.toFileLocationRequestArgs(filepath, position),
			triggerReason: toTsTriggerReason(context)
		};
		const response = await this.client.interruptGetErr(() => this.client.execute('signatureHelp', args, token));
		if (response.type !== 'response' || !response.body) {
			return undefined;
		}

		const info = response.body;
		const result = new docode.SignatureHelp();
		result.signatures = info.items.map(signature => this.convertSignature(signature, document.uri));
		result.activeSignature = this.state.getActiveSignature(document, requestId, context, info.selectedItemIndex, result.signatures);
		result.activeParameter = this.getActiveParameter(info, result.activeSignature);

		return result;
	}

	private getActiveParameter(info: Proto.SignatureHelpItems, activeSignatureIndex: number): number {
		const activeSignature = info.items[activeSignatureIndex];
		if (activeSignature?.isVariadic) {
			return Math.min(info.argumentIndex, activeSignature.parameters.length - 1);
		}
		return info.argumentIndex;
	}

	private convertSignature(item: Proto.SignatureHelpItem, baseUri: docode.Uri) {
		const signature = new docode.SignatureInformation(
			Previewer.asPlainTextWithLinks(item.prefixDisplayParts, this.client),
			Previewer.documentationToMarkdown(item.documentation, item.tags.filter(x => x.name !== 'param'), this.client, baseUri));

		let textIndex = signature.label.length;
		const separatorLabel = Previewer.asPlainTextWithLinks(item.separatorDisplayParts, this.client);
		for (let i = 0; i < item.parameters.length; ++i) {
			const parameter = item.parameters[i];
			const label = Previewer.asPlainTextWithLinks(parameter.displayParts, this.client);

			signature.parameters.push(
				new docode.ParameterInformation(
					[textIndex, textIndex + label.length],
					Previewer.documentationToMarkdown(parameter.documentation, [], this.client, baseUri)));

			textIndex += label.length;
			signature.label += label;

			if (i !== item.parameters.length - 1) {
				signature.label += separatorLabel;
				textIndex += separatorLabel.length;
			}
		}

		signature.label += Previewer.asPlainTextWithLinks(item.suffixDisplayParts, this.client);
		return signature;
	}
}

function toTsTriggerReason(context: docode.SignatureHelpContext): Proto.SignatureHelpTriggerReason {
	switch (context.triggerKind) {
		case docode.SignatureHelpTriggerKind.TriggerCharacter:
			if (context.triggerCharacter) {
				if (context.isRetrigger) {
					return { kind: 'retrigger', triggerCharacter: context.triggerCharacter as Proto.SignatureHelpRetriggerCharacter };
				} else {
					return { kind: 'characterTyped', triggerCharacter: context.triggerCharacter as Proto.SignatureHelpTriggerCharacter };
				}
			} else {
				return { kind: 'invoked' };
			}

		case docode.SignatureHelpTriggerKind.ContentChange:
			return context.isRetrigger ? { kind: 'retrigger' } : { kind: 'invoked' };

		case docode.SignatureHelpTriggerKind.Invoke:
		default:
			return { kind: 'invoked' };
	}
}
export function register(
	selector: DocumentSelector,
	client: ITypeScriptServiceClient,
) {
	return conditionalRegistration([
		requireSomeCapability(client, ClientCapability.EnhancedSyntax, ClientCapability.Semantic),
	], () => {
		return docode.languages.registerSignatureHelpProvider(selector.syntax,
			new TypeScriptSignatureHelpProvider(client), {
			triggerCharacters: TypeScriptSignatureHelpProvider.triggerCharacters,
			retriggerCharacters: TypeScriptSignatureHelpProvider.retriggerCharacters
		});
	});
}
