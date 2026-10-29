/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as docode from 'docode';
import { getLocation, getNodeValue, parseTree, findNodeAtLocation, visit } from 'jsonc-parser';


const packageJsonSelector: docode.DocumentSelector = { language: 'json', pattern: '**/package.json' };
const packageNlsJsonSelector: docode.DocumentSelector = { language: 'json', pattern: '**/package.nls.json' };

export class PackageDocumentL10nSupport implements docode.DefinitionProvider, docode.ReferenceProvider, docode.Disposable {

	private readonly _disposables: docode.Disposable[] = [];

	constructor() {
		this._disposables.push(docode.languages.registerDefinitionProvider(packageJsonSelector, this));
		this._disposables.push(docode.languages.registerDefinitionProvider(packageNlsJsonSelector, this));

		this._disposables.push(docode.languages.registerReferenceProvider(packageNlsJsonSelector, this));
		this._disposables.push(docode.languages.registerReferenceProvider(packageJsonSelector, this));
	}

	dispose(): void {
		for (const d of this._disposables) {
			d.dispose();
		}
	}

	public async provideDefinition(document: docode.TextDocument, position: docode.Position, _token: docode.CancellationToken): Promise<docode.DefinitionLink[] | undefined> {
		const basename = document.uri.path.split('/').pop()?.toLowerCase();
		if (basename === 'package.json') {
			return this.provideNlsValueDefinition(document, position);
		}

		if (basename === 'package.nls.json') {
			return this.provideNlsKeyDefinition(document, position);
		}

		return undefined;
	}

	private async provideNlsValueDefinition(packageJsonDoc: docode.TextDocument, position: docode.Position): Promise<docode.DefinitionLink[] | undefined> {
		const nlsRef = this.getNlsReferenceAtPosition(packageJsonDoc, position);
		if (!nlsRef) {
			return undefined;
		}

		const nlsUri = docode.Uri.joinPath(packageJsonDoc.uri, '..', 'package.nls.json');
		return this.resolveNlsDefinition(nlsRef, nlsUri);
	}

	private async provideNlsKeyDefinition(nlsDoc: docode.TextDocument, position: docode.Position): Promise<docode.DefinitionLink[] | undefined> {
		const nlsKey = this.getNlsKeyDefinitionAtPosition(nlsDoc, position);
		if (!nlsKey) {
			return undefined;
		}
		return this.resolveNlsDefinition(nlsKey, nlsDoc.uri);
	}

	private async resolveNlsDefinition(origin: { key: string; range: docode.Range }, nlsUri: docode.Uri): Promise<docode.DefinitionLink[] | undefined> {
		const target = await this.findNlsKeyDeclaration(origin.key, nlsUri);
		if (!target) {
			return undefined;
		}

		return [{
			originSelectionRange: origin.range,
			targetUri: target.uri,
			targetRange: target.range,
		}];
	}

	private getNlsReferenceAtPosition(packageJsonDoc: docode.TextDocument, position: docode.Position): { key: string; range: docode.Range } | undefined {
		const location = getLocation(packageJsonDoc.getText(), packageJsonDoc.offsetAt(position));
		if (!location.previousNode || location.previousNode.type !== 'string') {
			return undefined;
		}

		const value = getNodeValue(location.previousNode);
		if (typeof value !== 'string') {
			return undefined;
		}

		const match = value.match(/^%(.+)%$/);
		if (!match) {
			return undefined;
		}

		const nodeStart = packageJsonDoc.positionAt(location.previousNode.offset);
		const nodeEnd = packageJsonDoc.positionAt(location.previousNode.offset + location.previousNode.length);
		return { key: match[1], range: new docode.Range(nodeStart, nodeEnd) };
	}

	public async provideReferences(document: docode.TextDocument, position: docode.Position, context: docode.ReferenceContext, _token: docode.CancellationToken): Promise<docode.Location[] | undefined> {
		const basename = document.uri.path.split('/').pop()?.toLowerCase();
		if (basename === 'package.nls.json') {
			return this.provideNlsKeyReferences(document, position, context);
		}
		if (basename === 'package.json') {
			return this.provideNlsValueReferences(document, position, context);
		}
		return undefined;
	}

	private async provideNlsKeyReferences(nlsDoc: docode.TextDocument, position: docode.Position, context: docode.ReferenceContext): Promise<docode.Location[] | undefined> {
		const nlsKey = this.getNlsKeyDefinitionAtPosition(nlsDoc, position);
		if (!nlsKey) {
			return undefined;
		}

		const packageJsonUri = docode.Uri.joinPath(nlsDoc.uri, '..', 'package.json');
		return this.findAllNlsReferences(nlsKey.key, packageJsonUri, nlsDoc.uri, context);
	}

	private async provideNlsValueReferences(packageJsonDoc: docode.TextDocument, position: docode.Position, context: docode.ReferenceContext): Promise<docode.Location[] | undefined> {
		const nlsRef = this.getNlsReferenceAtPosition(packageJsonDoc, position);
		if (!nlsRef) {
			return undefined;
		}

		const nlsUri = docode.Uri.joinPath(packageJsonDoc.uri, '..', 'package.nls.json');
		return this.findAllNlsReferences(nlsRef.key, packageJsonDoc.uri, nlsUri, context);
	}

	private async findAllNlsReferences(nlsKey: string, packageJsonUri: docode.Uri, nlsUri: docode.Uri, context: docode.ReferenceContext): Promise<docode.Location[]> {
		const locations = await this.findNlsReferencesInPackageJson(nlsKey, packageJsonUri);

		if (context.includeDeclaration) {
			const decl = await this.findNlsKeyDeclaration(nlsKey, nlsUri);
			if (decl) {
				locations.push(decl);
			}
		}

		return locations;
	}

	private async findNlsKeyDeclaration(nlsKey: string, nlsUri: docode.Uri): Promise<docode.Location | undefined> {
		try {
			const nlsDoc = await docode.workspace.openTextDocument(nlsUri);
			const nlsTree = parseTree(nlsDoc.getText());
			if (!nlsTree) {
				return undefined;
			}

			const node = findNodeAtLocation(nlsTree, [nlsKey]);
			if (!node?.parent) {
				return undefined;
			}

			const keyNode = node.parent.children?.[0];
			if (!keyNode) {
				return undefined;
			}

			const start = nlsDoc.positionAt(keyNode.offset);
			const end = nlsDoc.positionAt(keyNode.offset + keyNode.length);
			return new docode.Location(nlsUri, new docode.Range(start, end));
		} catch {
			return undefined;
		}
	}

	private async findNlsReferencesInPackageJson(nlsKey: string, packageJsonUri: docode.Uri): Promise<docode.Location[]> {
		let packageJsonDoc: docode.TextDocument;
		try {
			packageJsonDoc = await docode.workspace.openTextDocument(packageJsonUri);
		} catch {
			return [];
		}

		const text = packageJsonDoc.getText();
		const needle = `%${nlsKey}%`;
		const locations: docode.Location[] = [];

		visit(text, {
			onLiteralValue(value, offset, length) {
				if (value === needle) {
					const start = packageJsonDoc.positionAt(offset);
					const end = packageJsonDoc.positionAt(offset + length);
					locations.push(new docode.Location(packageJsonUri, new docode.Range(start, end)));
				}
			}
		});

		return locations;
	}

	private getNlsKeyDefinitionAtPosition(nlsDoc: docode.TextDocument, position: docode.Position): { key: string; range: docode.Range } | undefined {
		const location = getLocation(nlsDoc.getText(), nlsDoc.offsetAt(position));

		// Must be on a top-level property key
		if (location.path.length !== 1 || !location.isAtPropertyKey || !location.previousNode) {
			return undefined;
		}

		const key = location.path[0] as string;
		const start = nlsDoc.positionAt(location.previousNode.offset);
		const end = nlsDoc.positionAt(location.previousNode.offset + location.previousNode.length);
		return { key, range: new docode.Range(start, end) };
	}
}
