/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as docode from 'docode';
import { TextDocument } from 'vscode-languageserver-textdocument';
import type { MarkdownCompletion, MarkdownDiagnostic, MarkdownEditorHost } from './markdownEditorProtocol';

export class MarkdownEditorLanguageFeatures {
	#session: CompletionSession | undefined;
	readonly #document: docode.TextDocument;
	readonly #drain: () => Promise<void>;
	readonly #snapshot: () => { text: string; editEpoch: number };
	readonly #isActive: () => boolean;
	readonly #api: MarkdownCompletionApi;

	constructor(document: docode.TextDocument, drain: () => Promise<void>, snapshot: () => { text: string; editEpoch: number },
		isActive: () => boolean, api: MarkdownCompletionApi = completionApi) {
		this.#document = document;
		this.#drain = drain;
		this.#snapshot = snapshot;
		this.#isActive = isActive;
		this.#api = api;
	}

	async diagnostics(): ReturnType<MarkdownEditorHost['getDiagnostics']> {
		await this.#drain();
		const snapshot = this.#snapshot();
		return { editEpoch: snapshot.editEpoch, items: mapMarkdownDiagnostics(this.#document, snapshot.text, docode.languages.getDiagnostics(this.#document.uri)) };
	}

	async completions(request: Parameters<MarkdownEditorHost['completions']>[0]): ReturnType<MarkdownEditorHost['completions']> {
		const session: CompletionSession = { requestId: request.requestId };
		this.#session = session;
		await this.#drain();
		this.#checkCurrent(session);
		const snapshot = this.#snapshot();
		if (snapshot.editEpoch !== request.editEpoch || request.offset > snapshot.text.length) {
			throw new Error(docode.l10n.t('The document changed. Request suggestions again.'));
		}
		if (request.automatic) {
			if (!docode.workspace.getConfiguration('markdown.editor', this.#document).get<boolean>('quickSuggestions', false)) {
				return { items: [], incomplete: false };
			}
			const quick = docode.workspace.getConfiguration('editor', this.#document).get<boolean | { other?: boolean | string }>('quickSuggestions');
			if (quick === false || typeof quick === 'object' && (quick.other === false || quick.other === 'off' || quick.other === 'inline')) {
				return { items: [], incomplete: false };
			}
		}
		const mirror = TextDocument.create(this.#document.uri.toString(), 'markdown', 0, snapshot.text);
		const raw = mirror.positionAt(request.offset);
		const position = new docode.Position(raw.line, raw.character);
		const version = this.#document.version;
		const list = await this.#api.provide(this.#document.uri, position, 0);
		this.#checkCurrent(session, version, snapshot.editEpoch);
		session.prepared = { version, editEpoch: snapshot.editEpoch, position, items: list.items };
		const items: MarkdownCompletion[] = [];
		for (const [index, item] of list.items.entries()) {
			const label = typeof item.label === 'string' ? item.label : item.label.label;
			const range = completionRange(this.#document, position, item);
			const prefix = this.#document.getText(new docode.Range(range.start, position));
			const normalizedPrefix = prefix.toLowerCase();
			if (!(item.filterText ?? label).toLowerCase().startsWith(normalizedPrefix)) {
				continue;
			}
			items.push({
				id: String(index), label,
				highlightLength: label.toLowerCase().startsWith(normalizedPrefix) ? prefix.length : 0,
				detail: item.detail ?? (typeof item.label === 'string' ? undefined : item.label.description),
				type: item.kind === undefined ? undefined : docode.CompletionItemKind[item.kind],
				unsupported: item.insertText instanceof docode.SnippetString ? docode.l10n.t('Snippet editing is not supported in the rich editor yet.') : undefined,
			});
		}
		return { items, incomplete: !!list.isIncomplete };
	}

	async accept(request: Parameters<MarkdownEditorHost['acceptCompletion']>[0]): ReturnType<MarkdownEditorHost['acceptCompletion']> {
		const session = this.#session;
		if (session?.requestId !== request.requestId || !session.prepared || session.applying) {
			throw new Error(docode.l10n.t('Request suggestions again before accepting a completion.'));
		}
		const index = Number(request.id);
		const original = session.prepared.items[index];
		if (!Number.isInteger(index) || index < 0 || !original) {
			throw new Error(docode.l10n.t('Unknown completion item.'));
		}
		session.applying = true;
		try {
			await this.#drain();
			const { version, editEpoch, position } = session.prepared;
			this.#checkCurrent(session, version, editEpoch);
			// The public API resolves only a prefix of a freshly requested list, not a retained item.
			const resolved = await this.#api.provide(this.#document.uri, position, index + 1);
			await this.#drain();
			this.#checkCurrent(session, version, editEpoch);
			const item = resolved.items[index];
			if (!item || completionIdentity(this.#document, position, item) !== completionIdentity(this.#document, position, original)) {
				throw new Error(docode.l10n.t('The completion list changed. Request suggestions again.'));
			}
			if (item.insertText instanceof docode.SnippetString) {
				throw new Error(docode.l10n.t('Snippet editing is not supported in the rich editor yet.'));
			}
			const label = typeof item.label === 'string' ? item.label : item.label.label;
			const text = item.textEdit?.newText ?? item.insertText ?? label;
			const range = completionRange(this.#document, position, item);
			const edits = [docode.TextEdit.replace(range, text), ...(item.additionalTextEdits ?? [])];
			validateCompletionEdits(this.#document, edits);
			const start = this.#document.offsetAt(range.start);
			const eol = this.#document.eol === docode.EndOfLine.CRLF ? '\r\n' : '\n';
			const normalizedLength = (value: string) => value.replace(/\r\n|\r|\n/g, eol).length;
			let offset = start + normalizedLength(text);
			for (const edit of item.additionalTextEdits ?? []) {
				if (edit.range.end.isBeforeOrEqual(range.start)) {
					offset += normalizedLength(edit.newText) - (this.#document.offsetAt(edit.range.end) - this.#document.offsetAt(edit.range.start));
				}
			}
			const workspaceEdit = new docode.WorkspaceEdit();
			workspaceEdit.set(this.#document.uri, edits);
			if (!await this.#api.apply(workspaceEdit)) {
				throw new Error(docode.l10n.t('The workspace rejected the completion.'));
			}
			const appliedVersion = this.#document.version;
			let retrigger = false;
			let warning: string | undefined;
			if (item.command) {
				if (item.command.command === 'editor.action.triggerSuggest') {
					retrigger = true;
				} else {
					try {
						await this.#api.execute(item.command);
					} catch (error) {
						warning = docode.l10n.t('The completion was inserted, but its follow-up command failed: {0}', error instanceof Error ? error.message : String(error));
					}
				}
			}
			const snapshot = this.#snapshot();
			const mirror = TextDocument.create(this.#document.uri.toString(), 'markdown', 0, snapshot.text);
			const caret = this.#document.version === appliedVersion && this.#isActive()
				? mirror.offsetAt(this.#document.positionAt(offset)) : undefined;
			return { offset: caret, editEpoch: snapshot.editEpoch, retrigger, ...(warning ? { warning } : {}) };
		} finally {
			if (this.#session === session) { this.#session = undefined; }
		}
	}

	cancel(requestId?: number): void {
		if (requestId === undefined || this.#session?.requestId === requestId) { this.#session = undefined; }
	}

	#checkCurrent(session: CompletionSession, version?: number, editEpoch?: number): void {
		if (this.#session !== session || !this.#isActive() || this.#document.isClosed) { throw new docode.CancellationError(); }
		if (version !== undefined && (this.#document.version !== version || this.#snapshot().editEpoch !== editEpoch)) {
			throw new Error(docode.l10n.t('The document changed. Request suggestions again.'));
		}
	}
}

interface CompletionSession {
	readonly requestId: number;
	applying?: boolean;
	prepared?: { readonly version: number; readonly editEpoch: number; readonly position: docode.Position; readonly items: readonly docode.CompletionItem[] };
}

export interface MarkdownCompletionApi {
	provide(uri: docode.Uri, position: docode.Position, resolveCount: number): Promise<docode.CompletionList>;
	apply(edit: docode.WorkspaceEdit): Thenable<boolean>;
	execute(command: docode.Command): Thenable<unknown>;
}

const completionApi: MarkdownCompletionApi = {
	provide: async (uri, position, resolveCount) => docode.commands.executeCommand('docode.executeCompletionItemProvider', uri, position, undefined, resolveCount),
	apply: edit => docode.workspace.applyEdit(edit),
	execute: command => docode.commands.executeCommand(command.command, ...(command.arguments ?? [])),
};

function completionRange(document: docode.TextDocument, position: docode.Position, item: docode.CompletionItem): docode.Range {
	if (item.textEdit) { return item.textEdit.range; }
	if (item.range) { return item.range instanceof docode.Range ? item.range : item.range.replacing; }
	return document.getWordRangeAtPosition(position) ?? new docode.Range(position, position);
}

function completionIdentity(document: docode.TextDocument, position: docode.Position, item: docode.CompletionItem): string {
	const label = typeof item.label === 'string' ? item.label : item.label.label;
	return JSON.stringify([label, item.kind, item.sortText ?? label, item.filterText ?? label,
		completionRange(document, position, item), item.textEdit?.newText ?? item.insertText ?? label]);
}

function validateCompletionEdits(document: docode.TextDocument, edits: readonly docode.TextEdit[]): void {
	for (const edit of edits) {
		if (!document.validateRange(edit.range).isEqual(edit.range)) {
			throw new Error(docode.l10n.t('The completion provider returned an invalid edit range.'));
		}
	}
	const sorted = [...edits].sort((a, b) => a.range.start.compareTo(b.range.start));
	for (let i = 1; i < sorted.length; i++) {
		if (sorted[i].range.start.isBefore(sorted[i - 1].range.end) || sorted[i].range.start.isEqual(sorted[i - 1].range.start)) {
			throw new Error(docode.l10n.t('The completion provider returned overlapping edits.'));
		}
	}
}

export function mapMarkdownDiagnostics(document: docode.TextDocument, text: string, diagnostics: readonly docode.Diagnostic[]): MarkdownDiagnostic[] {
	const mirror = TextDocument.create(document.uri.toString(), 'markdown', 0, text);
	const severities = ['error', 'warning', 'info', 'hint'] as const;
	return diagnostics.map(diagnostic => {
		const range = document.validateRange(diagnostic.range);
		return {
			start: mirror.offsetAt(range.start), endExclusive: mirror.offsetAt(range.end),
			message: diagnostic.message, severity: severities[diagnostic.severity],
			source: diagnostic.source,
			code: diagnostic.code === undefined ? undefined : String(typeof diagnostic.code === 'object' ? diagnostic.code.value : diagnostic.code),
			codeTarget: typeof diagnostic.code === 'object' ? diagnostic.code.target.toString() : undefined,
		};
	});
}
