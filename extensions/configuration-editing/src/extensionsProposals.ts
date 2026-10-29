/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as docode from 'docode';


export async function provideInstalledExtensionProposals(existing: string[], additionalText: string, range: docode.Range, includeBuiltinExtensions: boolean): Promise<docode.CompletionItem[] | docode.CompletionList> {
	if (Array.isArray(existing)) {
		const extensions = includeBuiltinExtensions ? docode.extensions.all : docode.extensions.all.filter(e => !(e.id.startsWith('docode.') || e.id === 'Microsoft.docode-markdown'));
		const knownExtensionProposals = extensions.filter(e => existing.indexOf(e.id) === -1);
		if (knownExtensionProposals.length) {
			return knownExtensionProposals.map(e => {
				const item = new docode.CompletionItem(e.id);
				const insertText = `"${e.id}"${additionalText}`;
				item.kind = docode.CompletionItemKind.Value;
				item.insertText = insertText;
				item.range = range;
				item.filterText = insertText;
				return item;
			});
		} else {
			const example = new docode.CompletionItem(docode.l10n.t("Example"));
			example.insertText = '"docode.csharp"';
			example.kind = docode.CompletionItemKind.Value;
			example.range = range;
			return [example];
		}
	}
	return [];
}
