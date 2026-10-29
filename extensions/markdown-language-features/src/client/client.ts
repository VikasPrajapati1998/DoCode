/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as docode from 'docode';
import * as lsp from 'vscode-languageclient';
import { IMdParser } from '../markdownEngine';
import { IDisposable } from '../util/dispose';
import { looksLikeMarkdownPath, markdownFileExtensions, markdownLanguageIds } from '../util/file';
import { FileWatcherManager } from './fileWatchingManager';
import { InMemoryDocument } from './inMemoryDocument';
import * as proto from './protocol';
import { VsCodeMdWorkspace } from './workspace';

export type LanguageClientConstructor = (name: string, description: string, clientOptions: lsp.LanguageClientOptions) => lsp.BaseLanguageClient;

function toLspRange(range: docode.Range): lsp.Range {
	return lsp.Range.create(range.start.line, range.start.character, range.end.line, range.end.character);
}

export class MdLanguageClient implements IDisposable {

	readonly #client: lsp.BaseLanguageClient;
	readonly #workspace: VsCodeMdWorkspace;

	constructor(
		client: lsp.BaseLanguageClient,
		workspace: VsCodeMdWorkspace,
	) {
		this.#client = client;
		this.#workspace = workspace;
	}

	dispose(): void {
		this.#client.stop();
		this.#workspace.dispose();
	}

	resolveLinkTarget(linkText: string, uri: docode.Uri): Promise<proto.ResolvedDocumentLinkTarget | undefined> {
		return this.#client.sendRequest(proto.resolveLinkTarget, { linkText, uri: uri.toString() });
	}

	getEditForFileRenames(files: ReadonlyArray<{ oldUri: string; newUri: string }>, token: docode.CancellationToken) {
		return this.#client.sendRequest(proto.getEditForFileRenames, files, token);
	}

	getReferencesToFileInWorkspace(resource: docode.Uri, token: docode.CancellationToken) {
		return this.#client.sendRequest(proto.getReferencesToFileInWorkspace, { uri: resource.toString() }, token);
	}

	prepareUpdatePastedLinks(doc: docode.Uri, ranges: readonly docode.Range[], token: docode.CancellationToken) {
		return this.#client.sendRequest(proto.prepareUpdatePastedLinks, {
			uri: doc.toString(),
			ranges: ranges.map(toLspRange),
		}, token);
	}

	getUpdatePastedLinksEdit(pastingIntoDoc: docode.Uri, edits: readonly docode.TextEdit[], metadata: string, token: docode.CancellationToken) {
		return this.#client.sendRequest(proto.getUpdatePastedLinksEdit, {
			metadata,
			pasteIntoDoc: pastingIntoDoc.toString(),
			edits: edits.map(edit => lsp.TextEdit.replace(toLspRange(edit.range), edit.newText)),
		}, token);
	}
}

export async function startClient(factory: LanguageClientConstructor, parser: IMdParser): Promise<MdLanguageClient> {

	const mdFileGlob = `**/*.{${markdownFileExtensions.join(',')}}`;

	const clientOptions: lsp.LanguageClientOptions = {
		documentSelector: markdownLanguageIds,
		synchronize: {
			configurationSection: ['markdown'],
			fileEvents: docode.workspace.createFileSystemWatcher(mdFileGlob),
		},
		initializationOptions: {
			markdownFileExtensions,
			i10lLocation: docode.l10n.uri?.toJSON(),
		},
		diagnosticPullOptions: {
			onChange: true,
			onTabs: true,
			match(_documentSelector, resource) {
				return looksLikeMarkdownPath(resource);
			},
		},
		markdown: {
			supportHtml: true,
		}
	};

	const client = factory('markdown', docode.l10n.t("Markdown Language Server"), clientOptions);

	client.registerProposedFeatures();

	const notebookFeature = client.getFeature(lsp.NotebookDocumentSyncRegistrationType.method);
	if (notebookFeature !== undefined) {
		notebookFeature.register({
			id: String(Date.now()),
			registerOptions: {
				notebookSelector: [{
					notebook: '*',
					cells: [{ language: 'markdown' }]
				}]
			}
		});
	}

	const workspace = new VsCodeMdWorkspace();

	client.onRequest(proto.parse, async (e) => {
		const uri = docode.Uri.parse(e.uri);
		if (typeof e.text === 'string') {
			return parser.tokenize(new InMemoryDocument(uri, e.text, -1));
		} else {
			const doc = await workspace.getOrLoadMarkdownDocument(uri);
			if (doc) {
				return parser.tokenize(doc);
			} else {
				return [];
			}
		}
	});

	client.onRequest(proto.fs_readFile, async (e): Promise<number[]> => {
		const uri = docode.Uri.parse(e.uri);
		return Array.from(await docode.workspace.fs.readFile(uri));
	});

	client.onRequest(proto.fs_stat, async (e): Promise<{ isDirectory: boolean } | undefined> => {
		const uri = docode.Uri.parse(e.uri);
		try {
			const stat = await docode.workspace.fs.stat(uri);
			return { isDirectory: stat.type === docode.FileType.Directory };
		} catch {
			return undefined;
		}
	});

	client.onRequest(proto.fs_readDirectory, async (e): Promise<[string, { isDirectory: boolean }][]> => {
		const uri = docode.Uri.parse(e.uri);
		const result = await docode.workspace.fs.readDirectory(uri);
		return result.map(([name, type]) => [name, { isDirectory: type === docode.FileType.Directory }]);
	});

	client.onRequest(proto.findMarkdownFilesInWorkspace, async (): Promise<string[]> => {
		return (await docode.workspace.findFiles(mdFileGlob, '**/node_modules/**')).map(x => x.toString());
	});

	const watchers = new FileWatcherManager();

	client.onRequest(proto.fs_watcher_create, async (params): Promise<void> => {
		const id = params.id;
		const uri = docode.Uri.parse(params.uri);

		const sendWatcherChange = (kind: 'create' | 'change' | 'delete') => {
			client.sendRequest(proto.fs_watcher_onChange, { id, uri: params.uri, kind });
		};

		watchers.create(id, uri, params.watchParentDirs, {
			create: params.options.ignoreCreate ? undefined : () => sendWatcherChange('create'),
			change: params.options.ignoreChange ? undefined : () => sendWatcherChange('change'),
			delete: params.options.ignoreDelete ? undefined : () => sendWatcherChange('delete'),
		});
	});

	client.onRequest(proto.fs_watcher_delete, async (params): Promise<void> => {
		watchers.delete(params.id);
	});

	docode.commands.registerCommand('docodeMarkdownLanguageservice.open', (uri, args) => {
		return docode.commands.executeCommand('docode.open', uri, args);
	});

	docode.commands.registerCommand('docodeMarkdownLanguageservice.rename', (uri, pos) => {
		return docode.commands.executeCommand('editor.action.rename', [docode.Uri.from(uri), new docode.Position(pos.line, pos.character)]);
	});

	await client.start();

	return new MdLanguageClient(client, workspace);
}
