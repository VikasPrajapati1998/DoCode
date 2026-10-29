/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as docode from 'docode';
import { MdLanguageClient } from '../client/client';
import { Mime } from '../util/mimes';

class UpdatePastedLinksEditProvider implements docode.DocumentPasteEditProvider {

	public static readonly kind = docode.DocumentDropOrPasteEditKind.Text.append('updateLinks', 'markdown');

	public static readonly metadataMime = 'application/vnd.docode.markdown.updatelinks.metadata';

	readonly #client: MdLanguageClient;

	constructor(
		client: MdLanguageClient,
	) {
		this.#client = client;
	}

	async prepareDocumentPaste(document: docode.TextDocument, ranges: readonly docode.Range[], dataTransfer: docode.DataTransfer, token: docode.CancellationToken): Promise<void> {
		if (!this.#isEnabled(document)) {
			return;
		}

		const metadata = await this.#client.prepareUpdatePastedLinks(document.uri, ranges, token);
		if (token.isCancellationRequested) {
			return;
		}

		dataTransfer.set(UpdatePastedLinksEditProvider.metadataMime, new docode.DataTransferItem(metadata));
	}

	async provideDocumentPasteEdits(
		document: docode.TextDocument,
		ranges: readonly docode.Range[],
		dataTransfer: docode.DataTransfer,
		context: docode.DocumentPasteEditContext,
		token: docode.CancellationToken,
	): Promise<docode.DocumentPasteEdit[] | undefined> {
		if (!this.#isEnabled(document)) {
			return;
		}

		const metadata = dataTransfer.get(UpdatePastedLinksEditProvider.metadataMime)?.value;
		if (!metadata) {
			return;
		}

		const textItem = dataTransfer.get(Mime.textPlain);
		const text = await textItem?.asString();
		if (!text || token.isCancellationRequested) {
			return;
		}

		// TODO: Handle cases such as:
		// - copy empty line
		// - Copy with multiple cursors and paste into multiple locations
		// - ...
		const edits = await this.#client.getUpdatePastedLinksEdit(document.uri, ranges.map(x => new docode.TextEdit(x, text)), metadata, token);
		if (!edits?.length || token.isCancellationRequested) {
			return;
		}

		const pasteEdit = new docode.DocumentPasteEdit('', docode.l10n.t("Paste and update pasted links"), UpdatePastedLinksEditProvider.kind);
		const workspaceEdit = new docode.WorkspaceEdit();
		workspaceEdit.set(document.uri, edits.map(x => new docode.TextEdit(new docode.Range(x.range.start.line, x.range.start.character, x.range.end.line, x.range.end.character,), x.newText)));
		pasteEdit.additionalEdit = workspaceEdit;

		if (!context.only || !UpdatePastedLinksEditProvider.kind.contains(context.only)) {
			pasteEdit.yieldTo = [docode.DocumentDropOrPasteEditKind.Text];
		}

		return [pasteEdit];
	}

	#isEnabled(document: docode.TextDocument): boolean {
		return docode.workspace.getConfiguration('markdown', document.uri).get<boolean>('editor.updateLinksOnPaste.enabled', true);
	}
}

export function registerUpdatePastedLinks(selector: docode.DocumentSelector, client: MdLanguageClient) {
	return docode.languages.registerDocumentPasteEditProvider(selector, new UpdatePastedLinksEditProvider(client), {
		copyMimeTypes: [UpdatePastedLinksEditProvider.metadataMime],
		providedPasteEditKinds: [UpdatePastedLinksEditProvider.kind],
		pasteMimeTypes: [UpdatePastedLinksEditProvider.metadataMime],
	});
}
