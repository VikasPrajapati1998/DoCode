/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as docode from 'docode';
import { getDocumentDir, Mimes, Schemes } from './shared';
import { UriList } from './uriList';

class DropOrPasteResourceProvider implements docode.DocumentDropEditProvider, docode.DocumentPasteEditProvider {

	readonly kind = docode.DocumentDropOrPasteEditKind.Empty.append('css', 'link', 'url');

	async provideDocumentDropEdits(
		document: docode.TextDocument,
		position: docode.Position,
		dataTransfer: docode.DataTransfer,
		token: docode.CancellationToken,
	): Promise<docode.DocumentDropEdit | undefined> {
		const uriList = await this.getUriList(dataTransfer);
		if (!uriList.entries.length || token.isCancellationRequested) {
			return;
		}

		const snippet = await this.createUriListSnippet(document.uri, uriList);
		if (!snippet || token.isCancellationRequested) {
			return;
		}

		return {
			kind: this.kind,
			title: snippet.label,
			insertText: snippet.snippet.value,
			yieldTo: this.pasteAsCssUrlByDefault(document, position) ? [] : [docode.DocumentDropOrPasteEditKind.Empty.append('uri')]
		};
	}

	async provideDocumentPasteEdits(
		document: docode.TextDocument,
		ranges: readonly docode.Range[],
		dataTransfer: docode.DataTransfer,
		_context: docode.DocumentPasteEditContext,
		token: docode.CancellationToken
	): Promise<docode.DocumentPasteEdit[] | undefined> {
		const uriList = await this.getUriList(dataTransfer);
		if (!uriList.entries.length || token.isCancellationRequested) {
			return;
		}

		const snippet = await this.createUriListSnippet(document.uri, uriList);
		if (!snippet || token.isCancellationRequested) {
			return;
		}

		return [{
			kind: this.kind,
			title: snippet.label,
			insertText: snippet.snippet.value,
			yieldTo: this.pasteAsCssUrlByDefault(document, ranges[0].start) ? [] : [docode.DocumentDropOrPasteEditKind.Empty.append('uri')]
		}];
	}

	private async getUriList(dataTransfer: docode.DataTransfer): Promise<UriList> {
		const urlList = await dataTransfer.get(Mimes.uriList)?.asString();
		if (urlList) {
			return UriList.from(urlList);
		}

		// Find file entries
		const uris: docode.Uri[] = [];
		for (const [_, entry] of dataTransfer) {
			const file = entry.asFile();
			if (file?.uri) {
				uris.push(file.uri);
			}
		}

		return new UriList(uris.map(uri => ({ uri, str: uri.toString(true) })));
	}

	private async createUriListSnippet(docUri: docode.Uri, uriList: UriList): Promise<{ readonly snippet: docode.SnippetString; readonly label: string } | undefined> {
		if (!uriList.entries.length) {
			return;
		}

		const snippet = new docode.SnippetString();
		for (let i = 0; i < uriList.entries.length; i++) {
			const uri = uriList.entries[i];
			const relativePath = getRelativePath(getDocumentDir(docUri), uri.uri);
			const urlText = relativePath ?? uri.str;

			snippet.appendText(`url(${urlText})`);
			if (i !== uriList.entries.length - 1) {
				snippet.appendText(' ');
			}
		}

		return {
			snippet,
			label: uriList.entries.length > 1
				? docode.l10n.t('Insert url() Functions')
				: docode.l10n.t('Insert url() Function')
		};
	}

	private pasteAsCssUrlByDefault(document: docode.TextDocument, position: docode.Position): boolean {
		const regex = /url\(.+?\)/gi;
		for (const match of Array.from(document.lineAt(position.line).text.matchAll(regex))) {
			if (position.character > match.index && position.character < match.index + match[0].length) {
				return false;
			}
		}
		return true;
	}
}

function getRelativePath(fromFile: docode.Uri | undefined, toFile: docode.Uri): string | undefined {
	if (fromFile && fromFile.scheme === toFile.scheme && fromFile.authority === toFile.authority) {
		if (toFile.scheme === Schemes.file) {
			// On windows, we must use the native `path.relative` to generate the relative path
			// so that drive-letters are resolved cast insensitively. However we then want to
			// convert back to a posix path to insert in to the document
			const relativePath = path.relative(fromFile.fsPath, toFile.fsPath);
			return path.posix.normalize(relativePath.split(path.sep).join(path.posix.sep));
		}

		return path.posix.relative(fromFile.path, toFile.path);
	}

	return undefined;
}

export function registerDropOrPasteResourceSupport(selector: docode.DocumentSelector): docode.Disposable {
	const provider = new DropOrPasteResourceProvider();

	return docode.Disposable.from(
		docode.languages.registerDocumentDropEditProvider(selector, provider, {
			providedDropEditKinds: [provider.kind],
			dropMimeTypes: [
				Mimes.uriList,
				'files'
			]
		}),
		docode.languages.registerDocumentPasteEditProvider(selector, provider, {
			providedPasteEditKinds: [provider.kind],
			pasteMimeTypes: [
				Mimes.uriList,
				'files'
			]
		})
	);
}
