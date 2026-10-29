/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as docode from 'docode';
import { Utils } from 'vscode-uri';

export const Schemes = Object.freeze({
	file: 'file',
	notebookCell: 'docode-notebook-cell',
	untitled: 'untitled',
});

export const Mimes = Object.freeze({
	plain: 'text/plain',
	uriList: 'text/uri-list',
});


export function getDocumentDir(uri: docode.Uri): docode.Uri | undefined {
	const docUri = getParentDocumentUri(uri);
	if (docUri.scheme === Schemes.untitled) {
		return docode.workspace.workspaceFolders?.[0]?.uri;
	}
	return Utils.dirname(docUri);
}

function getParentDocumentUri(uri: docode.Uri): docode.Uri {
	if (uri.scheme === Schemes.notebookCell) {
		// is notebook documents necessary?
		for (const notebook of docode.workspace.notebookDocuments) {
			for (const cell of notebook.getCells()) {
				if (cell.document.uri.toString() === uri.toString()) {
					return notebook.uri;
				}
			}
		}
	}

	return uri;
}
