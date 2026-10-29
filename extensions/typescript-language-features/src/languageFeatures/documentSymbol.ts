/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as docode from 'docode';
import { DocumentSelector } from '../configuration/documentSelector';
import { CachedResponse } from '../tsServer/cachedResponse';
import { parseKindModifier } from '../tsServer/protocol/modifiers';
import type * as Proto from '../tsServer/protocol/protocol';
import * as PConst from '../tsServer/protocol/protocol.const';
import * as typeConverters from '../typeConverters';
import { ITypeScriptServiceClient } from '../typescriptService';

const getSymbolKind = (kind: string): docode.SymbolKind => {
	switch (kind) {
		case PConst.Kind.module: return docode.SymbolKind.Module;
		case PConst.Kind.class: return docode.SymbolKind.Class;
		case PConst.Kind.enum: return docode.SymbolKind.Enum;
		case PConst.Kind.interface: return docode.SymbolKind.Interface;
		case PConst.Kind.method: return docode.SymbolKind.Method;
		case PConst.Kind.memberVariable: return docode.SymbolKind.Property;
		case PConst.Kind.memberGetAccessor: return docode.SymbolKind.Property;
		case PConst.Kind.memberSetAccessor: return docode.SymbolKind.Property;
		case PConst.Kind.variable: return docode.SymbolKind.Variable;
		case PConst.Kind.const: return docode.SymbolKind.Variable;
		case PConst.Kind.localVariable: return docode.SymbolKind.Variable;
		case PConst.Kind.function: return docode.SymbolKind.Function;
		case PConst.Kind.localFunction: return docode.SymbolKind.Function;
		case PConst.Kind.constructSignature: return docode.SymbolKind.Constructor;
		case PConst.Kind.constructorImplementation: return docode.SymbolKind.Constructor;
	}
	return docode.SymbolKind.Variable;
};

class TypeScriptDocumentSymbolProvider implements docode.DocumentSymbolProvider {

	public constructor(
		private readonly client: ITypeScriptServiceClient,
		private readonly cachedResponse: CachedResponse<Proto.NavTreeResponse>,
	) { }

	public async provideDocumentSymbols(document: docode.TextDocument, token: docode.CancellationToken): Promise<docode.DocumentSymbol[] | undefined> {
		const file = this.client.toOpenTsFilePath(document);
		if (!file) {
			return undefined;
		}

		const args: Proto.FileRequestArgs = { file };
		const response = await this.cachedResponse.execute(document, () => this.client.execute('navtree', args, token));
		if (response.type !== 'response' || !response.body?.childItems) {
			return undefined;
		}

		// The root represents the file. Ignore this when showing in the UI
		const result: docode.DocumentSymbol[] = [];
		for (const item of response.body.childItems) {
			TypeScriptDocumentSymbolProvider.convertNavTree(document.uri, result, item);
		}
		return result;
	}

	private static convertNavTree(
		resource: docode.Uri,
		output: docode.DocumentSymbol[],
		item: Proto.NavigationTree,
	): boolean {
		let shouldInclude = TypeScriptDocumentSymbolProvider.shouldInclueEntry(item);
		if (!shouldInclude && !item.childItems?.length) {
			return false;
		}

		const children = new Set(item.childItems || []);
		for (const span of item.spans) {
			const range = typeConverters.Range.fromTextSpan(span);
			const symbolInfo = TypeScriptDocumentSymbolProvider.convertSymbol(item, range);

			for (const child of children) {
				if (child.spans.some(span => !!range.intersection(typeConverters.Range.fromTextSpan(span)))) {
					const includedChild = TypeScriptDocumentSymbolProvider.convertNavTree(resource, symbolInfo.children, child);
					shouldInclude = shouldInclude || includedChild;
					children.delete(child);
				}
			}

			if (shouldInclude) {
				output.push(symbolInfo);
			}
		}

		return shouldInclude;
	}

	private static convertSymbol(item: Proto.NavigationTree, range: docode.Range): docode.DocumentSymbol {
		const selectionRange = item.nameSpan ? typeConverters.Range.fromTextSpan(item.nameSpan) : range;
		let label = item.text;

		switch (item.kind) {
			case PConst.Kind.memberGetAccessor: label = `(get) ${label}`; break;
			case PConst.Kind.memberSetAccessor: label = `(set) ${label}`; break;
		}

		const symbolInfo = new docode.DocumentSymbol(
			label,
			'',
			getSymbolKind(item.kind),
			range,
			range.contains(selectionRange) ? selectionRange : range);


		const kindModifiers = parseKindModifier(item.kindModifiers);
		if (kindModifiers.has(PConst.KindModifiers.deprecated)) {
			symbolInfo.tags = [docode.SymbolTag.Deprecated];
		}

		return symbolInfo;
	}

	private static shouldInclueEntry(item: Proto.NavigationTree | Proto.NavigationBarItem): boolean {
		if (item.kind === PConst.Kind.alias) {
			return false;
		}
		return !!(item.text && item.text !== '<function>' && item.text !== '<class>');
	}
}

export function register(
	selector: DocumentSelector,
	client: ITypeScriptServiceClient,
	cachedResponse: CachedResponse<Proto.NavTreeResponse>,
) {
	return docode.languages.registerDocumentSymbolProvider(selector.syntax,
		new TypeScriptDocumentSymbolProvider(client, cachedResponse), { label: 'TypeScript' });
}
