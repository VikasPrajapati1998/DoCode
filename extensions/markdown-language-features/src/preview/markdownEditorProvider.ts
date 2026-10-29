/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as docode from 'docode';
import { HubRpcConnection, type InterfaceHandlers } from '@docode/hubrpc';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Disposable } from '../util/dispose';
import { getRangeFromPositionOrRange, MdLinkOpener } from '../util/openDocumentLink';
import { areUrisEqual, getMarkdownLocalResourceRoots } from '../util/resources';
import { ChangedLineRange, MarkdownPreviewLineDiffProvider } from './lineDiff';
import { RecoveringTaskQueue } from './recoveringTaskQueue';
import { encodeWebviewInitialState } from './webviewInitialState';
import type { ILogger } from '../logging';
import type { ResolvedDocumentLinkTarget } from '../client/protocol';
import {
	codeBlockEditorPresentationEqual,
	type MarkdownCodeBlockEditorProvider,
	type MarkdownCodeBlockEditorSandbox,
	type MarkdownContributionProvider,
} from '../markdownExtensions';
import { generateUuid } from '../util/uuid';
import { MarkdownEditorRichLinkController } from './markdownEditorRichLinks';
import { codeBlockEditorPresentation, markdownEditorHost, markdownEditorRenderer, mergeCodeBlockEditorPresentation, type CodeBlockEditorProviderDefinition, type MarkdownEditorConfiguration, type ResolvedCodeBlockEditor } from './markdownEditorProtocol';
import { createMarkdownEditorRpcConnection, MarkdownEditorRpcTransport } from './markdownEditorRpc';
import { MarkdownEditorRename } from './markdownEditorRename';
import { MarkdownEditorLanguageFeatures } from './markdownEditorLanguageFeatures';
import { MarkdownEditorImagePaste } from './markdownEditorImagePaste';
import { MarkdownEditorNavigation } from './markdownEditorNavigation';

export interface MarkdownCodeBlockEditorApiV1 {
	getProvider(providerId: string): MarkdownCodeBlockEditorProviderApi | undefined;
}

export interface MarkdownCodeBlockEditorApiV2 {
	getProvider(providerId: string): MarkdownCodeBlockEditorProviderApi | undefined;
}

interface MarkdownCodeBlockEditorProviderApi {
	resolve(
		request: {
			readonly providerId: string;
			readonly language: string;
			readonly documentUri: docode.Uri;
		},
		token: docode.CancellationToken,
	): docode.ProviderResult<ProviderResolvedCodeBlockEditor>;
	createHostTransport?(
		transport: MarkdownCodeBlockEditorHostTransport,
		token: docode.CancellationToken,
	): docode.ProviderResult<docode.Disposable>;
}

interface ProviderResolvedCodeBlockEditor {
	readonly content:
	| { readonly html: string; readonly baseUri?: docode.Uri; readonly uri?: undefined }
	| { readonly html?: undefined; readonly uri: docode.Uri };
	readonly contentType?: 'text' | 'json';
	readonly cacheKey?: string;
	readonly runtimeKey?: string;
	readonly initialHeight?: number;
	readonly presentation?: ResolvedCodeBlockEditor['presentation'];
	readonly sandbox?: MarkdownCodeBlockEditorSandbox;
}

interface MarkdownCodeBlockEditorHostTransport {
	readonly runtimeKey: string;
	readonly onDidReceiveMessage: docode.Event<unknown>;
	readonly onDidDispose: docode.Event<void>;
	sendMessage(message: unknown): void;
}

export interface MarkdownEditorEdit {
	readonly start: number;
	readonly endExclusive: number;
	readonly text: string;
	/** The authoritative text baseline against which this edit was computed. */
	readonly editEpoch: number;
}

/**
 * Owns the private RPC connection for one webview, replacing it on each HTML reload.
 */
class AuthenticatedWebview implements docode.Disposable {

	#messageSecret = generateUuid();
	#connection: HubRpcConnection<undefined>;
	#handlers: InterfaceHandlers<typeof markdownEditorHost> | undefined;
	readonly #onReady = new docode.EventEmitter<void>();
	readonly onReady = this.#onReady.event;
	#ready = false;
	#publishedReady = false;
	#disposed = false;

	constructor(readonly webview: docode.Webview, readonly logger: ILogger) {
		this.#connection = this.#connect();
	}

	#connect(): HubRpcConnection<undefined> {
		return createMarkdownEditorRpcConnection(new MarkdownEditorRpcTransport(
			this.#messageSecret,
			message => this.webview.postMessage(message),
			listener => this.webview.onDidReceiveMessage(listener),
		), (operation, error) => {
			if (!this.#disposed) {
				this.logger.trace('Markdown editor RPC', operation, error);
			}
		});
	}

	get renderer() {
		return this.#connection.get(markdownEditorRenderer);
	}

	get ready(): boolean {
		return this.#ready;
	}

	async whenReady(token: docode.CancellationToken): Promise<void> {
		if (this.#disposed || token.isCancellationRequested) {
			throw new docode.CancellationError();
		}
		if (this.#publishedReady) {
			return;
		}
		const pending = Promise.withResolvers<void>();
		const ready = this.onReady(() => {
			if (this.#disposed) { pending.reject(new docode.CancellationError()); } else { pending.resolve(); }
		});
		const cancel = token.onCancellationRequested(() => pending.reject(new docode.CancellationError()));
		try {
			if (this.#disposed || token.isCancellationRequested) { pending.reject(new docode.CancellationError()); }
			else if (this.#publishedReady) { pending.resolve(); }
			await pending.promise;
		} finally {
			ready.dispose();
			cancel.dispose();
		}
	}

	setHandlers(handlers: InterfaceHandlers<typeof markdownEditorHost>): void {
		this.#handlers = handlers;
		this.#connection.register(markdownEditorHost, handlers);
	}

	acceptReady(): void {
		this.#ready = true;
	}

	publishReady(): void {
		this.#publishedReady = true;
		this.#onReady.fire();
	}

	reset(): void {
		this.#ready = false;
		this.#publishedReady = false;
		this.#connection.close();
		this.#messageSecret = generateUuid();
		this.#connection = this.#connect();
		if (this.#handlers) {
			this.#connection.register(markdownEditorHost, this.#handlers);
		}
	}

	get messageSecret(): string {
		return this.#messageSecret;
	}

	report(operation: string, request: Promise<void> | void): void {
		void request?.catch(error => {
			if (!this.#disposed) {
				this.logger.trace('Markdown editor RPC', operation, error);
			}
		});
	}

	dispose(): void {
		this.#disposed = true;
		this.#ready = false;
		this.#connection.close();
		this.#onReady.fire();
		this.#onReady.dispose();
	}
}

class CodeBlockEditorHostTransportState implements docode.Disposable {
	readonly #onDidReceiveMessage = new docode.EventEmitter<unknown>();
	readonly #onDidDispose = new docode.EventEmitter<void>();
	readonly #pendingMessages: unknown[] = [];
	#providerDisposable: docode.Disposable | undefined;
	#ready = false;
	#disposed = false;

	readonly transport: MarkdownCodeBlockEditorHostTransport;

	constructor(runtimeKey: string, sendMessage: (message: unknown) => void) {
		this.transport = Object.freeze({
			runtimeKey,
			onDidReceiveMessage: this.#onDidReceiveMessage.event,
			onDidDispose: this.#onDidDispose.event,
			sendMessage: (message: unknown) => {
				if (this.#disposed) {
					throw new Error('Code block editor host transport is disposed');
				}
				sendMessage(message);
			},
		});
	}

	acceptMessage(message: unknown): void {
		if (this.#disposed) {
			return;
		}
		if (!this.#ready) {
			this.#pendingMessages.push(message);
			return;
		}
		this.#onDidReceiveMessage.fire(message);
	}

	setReady(providerDisposable: docode.Disposable | undefined): void {
		if (this.#disposed) {
			providerDisposable?.dispose();
			return;
		}
		this.#providerDisposable = providerDisposable;
		this.#ready = true;
		for (const message of this.#pendingMessages.splice(0)) {
			this.#onDidReceiveMessage.fire(message);
		}
	}

	dispose(): void {
		if (this.#disposed) {
			return;
		}
		this.#disposed = true;
		this.#pendingMessages.length = 0;
		this.#onDidDispose.fire();
		this.#providerDisposable?.dispose();
		this.#onDidReceiveMessage.dispose();
		this.#onDidDispose.dispose();
	}
}

/**
 * Experimental hybrid (WYSIWYG) Markdown editor backed by the
 * `@docode/markdown-editor` component. The {@link docode.TextDocument} remains
 * the single source of truth, so native undo/redo, dirty state and hot-exit are
 * preserved.
 */
export class MarkdownEditorProvider extends Disposable implements docode.CustomTextEditorProvider {

	public static readonly viewType = 'docode.markdown.editor';

	/**
	 * Memento key under which the last chosen edit/read-only mode is remembered.
	 * The value is a single global default shared by every Markdown editor, so
	 * flipping the lock in one editor becomes the initial mode for the next.
	 */
	static readonly #readonlyStateKey = 'markdown.editor.readonly';

	readonly #mediaRoot: docode.Uri;
	readonly #extensionUri: docode.Uri;
	readonly #globalState: docode.Memento;
	readonly #linkOpener: MdLinkOpener;
	readonly #contributions: MarkdownContributionProvider;
	readonly #logger: ILogger;
	readonly #tryOpenLink: (href: string, fromResource: docode.Uri) => Promise<boolean>;
	readonly #webviewPanels = new Map<docode.WebviewPanel, AuthenticatedWebview>();
	readonly #navigation = new Map<docode.WebviewPanel, MarkdownEditorNavigation>();
	readonly #focusedWebviewPanels = new Set<docode.WebviewPanel>();
	readonly #providerApis = new Map<string, Promise<MarkdownCodeBlockEditorProviderApi | undefined>>();
	readonly #resolvedCodeBlockEditors = new Map<string, Promise<ResolvedCodeBlockEditor | undefined>>();
	readonly #resolvedCodeBlockEditorResources = new Set<string>();

	constructor(
		extensionUri: docode.Uri,
		globalState: docode.Memento,
		linkOpener: MdLinkOpener,
		contributions: MarkdownContributionProvider,
		logger: ILogger,
		tryOpenLink: (href: string, fromResource: docode.Uri) => Promise<boolean>,
	) {
		super();
		this.#extensionUri = extensionUri;
		this.#globalState = globalState;
		this.#linkOpener = linkOpener;
		this.#contributions = contributions;
		this.#logger = logger;
		this.#tryOpenLink = tryOpenLink;
		this.#mediaRoot = docode.Uri.joinPath(this.#extensionUri, 'markdown-editor-out');
		this._register(new docode.Disposable(() => {
			void docode.commands.executeCommand('setContext', 'markdownEditorFocus', false);
		}));
	}

	public async resolveCustomTextEditor(
		document: docode.TextDocument,
		webviewPanel: docode.WebviewPanel,
		token: docode.CancellationToken,
	): Promise<void> {
		await this.#resolveEditor(document, webviewPanel, token);
	}

	public async resolveCustomTextEditorInlineDiff(
		documents: docode.CustomEditorDiffDocuments<docode.TextDocument>,
		webviewPanel: docode.WebviewPanel,
		token: docode.CancellationToken,
	): Promise<void> {
		await this.#resolveEditor(documents.modified, webviewPanel, token, documents.original);
	}

	public resolveCustomTextEditorNavigation(
		_document: docode.TextDocument,
		webviewPanel: docode.WebviewPanel,
		token: docode.CancellationToken,
	): docode.CustomTextEditorNavigation {
		const navigation = this.#navigation.get(webviewPanel);
		if (!navigation || token.isCancellationRequested) {
			throw new docode.CancellationError();
		}
		return navigation;
	}

	async #resolveEditor(document: docode.TextDocument, webviewPanel: docode.WebviewPanel, token: docode.CancellationToken, originalDocument?: docode.TextDocument): Promise<void> {
		if (!docode.workspace.isTrusted) {
			const cancel = { title: docode.l10n.t("Cancel"), isCloseAffordance: true };
			const openAnyway = { title: docode.l10n.t("Open Anyway") };
			const choice = await docode.window.showWarningMessage(
				docode.l10n.t("This Markdown file is in an untrusted workspace. Do you want to open it anyway?"),
				{
					modal: true,
					detail: docode.l10n.t("For your security, only continue if you trust the source of this Markdown file."),
				},
				cancel,
				openAnyway,
			);
			if (choice !== openAnyway || token.isCancellationRequested) {
				webviewPanel.dispose();
				return;
			}
		}

		if (token.isCancellationRequested) {
			return;
		}
		const webview = new AuthenticatedWebview(webviewPanel.webview, this.#logger);
		this.#webviewPanels.set(webviewPanel, webview);
		const codeBlockEditorProviders = this.#loadCodeBlockEditorProviders(webviewPanel.webview);
		this.#wireSingle(document, webviewPanel, originalDocument, codeBlockEditorProviders, webview);
	}

	#configureWebview(document: docode.TextDocument, editorWebview: AuthenticatedWebview, editEpoch: number): void {
		const webview = editorWebview.webview;
		const codeBlockEditorResourceRoots = docode.workspace.isTrusted
			? this.#contributions.contributions.codeBlockEditorProviders.map(provider => provider.extension.extensionUri)
			: [];
		webview.options = {
			enableScripts: true,
			localResourceRoots: getMarkdownLocalResourceRoots(document.uri, [this.#mediaRoot, ...codeBlockEditorResourceRoots], {
				includeWorkspaceResources: docode.workspace.isTrusted,
			}),
		};
		webview.html = this.#getHtml(document, webview, editorWebview.messageSecret, editEpoch);
	}

	#wireSingle(
		document: docode.TextDocument,
		webviewPanel: docode.WebviewPanel,
		originalDocument: docode.TextDocument | undefined,
		initialCodeBlockEditorProviders: Promise<readonly CodeBlockEditorProviderDefinition[]>,
		editorWebview: AuthenticatedWebview,
	): void {
		let expectedWebviewContent: { readonly content: string; readonly epoch: number } | undefined;
		let webviewText = document.getText();
		let webviewReady = false;
		let readonly = this.#globalState.get(MarkdownEditorProvider.#readonlyStateKey, true);
		let codeBlockEditorProviders: readonly CodeBlockEditorProviderDefinition[] | undefined;
		let contributionUpdate = 0;
		const resolveCancellation = new docode.CancellationTokenSource();
		const hostTransports = new Map<string, CodeBlockEditorHostTransportState>();
		const disposeHostTransport = (runtimeId: string, expected?: CodeBlockEditorHostTransportState): void => {
			const transport = hostTransports.get(runtimeId);
			if (transport && (!expected || transport === expected)) {
				hostTransports.delete(runtimeId);
				transport.dispose();
			}
		};
		const disposeHostTransports = (): void => {
			for (const runtimeId of Array.from(hostTransports.keys())) {
				disposeHostTransport(runtimeId);
			}
		};
		const createHostTransport = (
			runtimeId: string,
			providerId: string,
			runtimeKey: string,
		): void => {
			disposeHostTransport(runtimeId);
			const contribution = this.#contributions.contributions.codeBlockEditorProviders.find(candidate => candidate.id === providerId);
			if (contribution?.source.kind !== 'exportApi' || contribution.source.apiVersion < 2 || !docode.workspace.isTrusted) {
				return;
			}
			const state = new CodeBlockEditorHostTransportState(
				runtimeKey,
				message => editorWebview.report('Publish code block editor message', editorWebview.renderer.codeBlockEditorHostTransportMessage({
					runtimeId,
					message,
				})),
			);
			hostTransports.set(runtimeId, state);
			void this.#initializeCodeBlockEditorHostTransport(contribution, state, resolveCancellation.token).then(initialized => {
				if (!initialized) {
					disposeHostTransport(runtimeId, state);
				}
			}, error => {
				if (!resolveCancellation.token.isCancellationRequested) {
					this.#logger.trace('Markdown code block editor', `Provider ${providerId} failed to initialize a host transport`, error);
				}
				disposeHostTransport(runtimeId, state);
			});
		};
		async function postAuthoritativeUpdate(epoch = editQueue.invalidate()): Promise<void> {
			const content = document.getText();
			webviewText = content;
			if (!editorWebview.ready) {
				return;
			}
			await editorWebview.renderer.update({
				content,
				editEpoch: epoch,
			});
		}
		const editQueue = new RecoveringTaskQueue(
			async (error, epoch) => {
				this.#logger.trace('Markdown editor', 'Failed to apply edit; restoring authoritative document content', error);
				await postAuthoritativeUpdate(epoch);
			},
			error => this.#logger.trace('Markdown editor', 'Failed to restore authoritative document content', error),
		);
		const richLinks = new MarkdownEditorRichLinkController(
			document,
			this.#linkOpener,
			this.#logger,
			params => editorWebview.renderer.richLinkPresentations(params),
		);
		const postConfiguration = (): void => {
			editorWebview.report('Update configuration', editorWebview.renderer.configurationChanged(this.#getEditorConfiguration(document.uri)));
		};
		const postCodeBlockEditorProviders = (): void => {
			if (webviewReady && codeBlockEditorProviders) {
				editorWebview.renderer.codeBlockEditorProviders({ codeBlockEditorProviders });
			}
		};
		const initialContributionUpdate = contributionUpdate;
		void initialCodeBlockEditorProviders.then(providers => {
			if (initialContributionUpdate !== contributionUpdate || resolveCancellation.token.isCancellationRequested) {
				return;
			}
			codeBlockEditorProviders = providers;
			postCodeBlockEditorProviders();
		}).catch(error => {
			if (!resolveCancellation.token.isCancellationRequested) {
				this.#logger.trace('Markdown code block editor', 'Failed to initialize contributed editors', error);
			}
		});

		const comments = this.#wireComments(document, editorWebview);
		const rename = new MarkdownEditorRename(document, () => editQueue.drain(),
			() => ({ text: webviewText, editEpoch: editQueue.epoch }),
			() => webviewPanel.active && !resolveCancellation.token.isCancellationRequested);
		const languageFeatures = new MarkdownEditorLanguageFeatures(document, () => editQueue.drain(),
			() => ({ text: webviewText, editEpoch: editQueue.epoch }),
			() => webviewPanel.active && !resolveCancellation.token.isCancellationRequested);
		const imagePaste = new MarkdownEditorImagePaste(document, () => editQueue.drain(),
			() => ({ text: webviewText, editEpoch: editQueue.epoch }),
			() => !readonly && webviewPanel.active && !resolveCancellation.token.isCancellationRequested,
			request => editorWebview.renderer.readClipboardMedia(request));
		const navigation = new MarkdownEditorNavigation(document, () => editQueue.drain(),
			() => ({ text: webviewText, editEpoch: editQueue.epoch }),
			() => editorWebview.renderer, token => editorWebview.whenReady(token));
		this.#navigation.set(webviewPanel, navigation);
		const diagnosticsChanged = (): void => {
			if (webviewReady && !resolveCancellation.token.isCancellationRequested) {
				void editorWebview.renderer.diagnosticsChanged({}).catch(error =>
					this.#logger.trace('Markdown editor', 'Failed to refresh diagnostics', error));
			}
		};
		const diagnosticListener = docode.languages.onDidChangeDiagnostics(event => {
			if (event.uris.some(uri => uri.toString() === document.uri.toString())) { diagnosticsChanged(); }
		});
		editorWebview.setHandlers({
			selectionChanged: message => navigation.acceptSelection(message),
			getDiagnostics: () => languageFeatures.diagnostics(),
			completions: message => languageFeatures.completions(message),
			acceptCompletion: message => languageFeatures.accept(message),
			cancelCompletions: message => languageFeatures.cancel(message.requestId),
			pasteImages: message => imagePaste.paste(message),
			prepareRename: message => rename.prepare(message),
			rename: message => rename.rename(message),
			cancelRename: message => rename.cancel(message.requestId),
			ready: async (message, _context, { signal }) => {
				richLinks.clear();
				webviewReady = true;
				editorWebview.acceptReady();
				if (message.documentVersion !== document.version || message.editEpoch !== editQueue.epoch) {
					await postAuthoritativeUpdate();
				}
				signal.throwIfAborted();
				editorWebview.publishReady();
				postConfiguration();
				postCodeBlockEditorProviders();
				diagnosticsChanged();
			},

			resolveCodeBlockEditor: async (message, _context, { signal }) => {
				const provider = this.#contributions.contributions.codeBlockEditorProviders.find(candidate => candidate.id === message.providerId);
				const descriptor = provider
					? await this.#resolveCodeBlockEditor(provider, document.uri, message.language, editorWebview.webview)
					: undefined;
				signal.throwIfAborted();
				return { descriptor };
			},

			createCodeBlockEditorHostTransport: message => {
				createHostTransport(message.runtimeId, message.providerId, message.runtimeKey);
			},

			codeBlockEditorHostTransportMessage: message => {
				hostTransports.get(message.runtimeId)?.acceptMessage(message.message);
			},

			disposeCodeBlockEditorHostTransport: message => {
				disposeHostTransport(message.runtimeId);
			},

			codeBlockEditorDiagnostic: message => {
				this.#logger.trace('Markdown code block editor', message.message);
			},

			richLinkSubscriptions: message => {
				richLinks.updateSubscriptions(message);
			},

			editorFocusChanged: async message => {
				if (message.focused) {
					this.#focusedWebviewPanels.add(webviewPanel);
				} else {
					this.#focusedWebviewPanels.delete(webviewPanel);
				}
				await this.#updateEditorFocusContext();
			},


			setReadonly: async message => {
				readonly = message.readonly;
				await this.#globalState.update(MarkdownEditorProvider.#readonlyStateKey, message.readonly);
			},
			history: async (message, _context, { signal }) => {
				// The TextDocument owns undo/redo, so route the chord to the built-in
				// command; the active custom editor input scopes it to this resource's
				// history, shared with the Edit menu and Command Palette. Drain any
				// in-flight edit first and only act while this panel is active, so the
				// chord cannot race a pending edit or land on a different document.
				await editQueue.drain();
				signal.throwIfAborted();
				if (webviewPanel.active && !resolveCancellation.token.isCancellationRequested) {
					await docode.commands.executeCommand(message.command);
				}
			},
			openLink: async (message, _context, { signal }) => {
				// Link targets resolve against the authoritative document. Drain
				// accepted edits so the resolved line/column belongs to this epoch.
				await editQueue.drain();
				signal.throwIfAborted();
				if (await this.#tryOpenLink(message.href, document.uri)) {
					return;
				}
				signal.throwIfAborted();
				const target = await this.#linkOpener.resolveDocumentLink(message.href, document.uri);
				signal.throwIfAborted();
				if (message.href.includes('#')) {
					const range = getInDocumentLinkTargetRange(document, target, webviewText);
					if (range) {
						await editorWebview.renderer.revealLinkTarget(range);
						return;
					}
				}
				await this.#linkOpener.openResolvedDocumentLink(message.href, document.uri, target);
			},
			edit: async message => {
				const messageEdit = readMarkdownEditorEdit(message);
				if (!messageEdit) {
					throw new Error('Invalid Markdown editor edit range');
				}
				if (messageEdit.editEpoch !== editQueue.epoch) {
					this.#logger.trace('Markdown editor', `Ignored edit from stale epoch ${messageEdit.editEpoch}; current epoch is ${editQueue.epoch}`);
					return;
				}
				await editQueue.enqueue(messageEdit.editEpoch, async () => {
					const documentText = document.getText();
					const computedEdit = computeMarkdownEditorEdit(document.uri, documentText, document.eol, webviewText, messageEdit);
					if (!computedEdit) {
						throw new Error(`Edit range ${messageEdit.start}-${messageEdit.endExclusive} is invalid for the current webview document`);
					}
					expectedWebviewContent = {
						content: computedEdit.expectedDocumentText,
						epoch: messageEdit.editEpoch,
					};
					const edit = new docode.WorkspaceEdit();
					edit.replace(
						document.uri,
						computedEdit.range,
						computedEdit.replacementText,
					);
					try {
						if (!await docode.workspace.applyEdit(edit)) {
							throw new Error('Workspace rejected Markdown editor edit');
						}
						if (messageEdit.editEpoch === editQueue.epoch) {
							webviewText = computedEdit.nextWebviewText;
						}
					} finally {
						expectedWebviewContent = undefined;
					}
				});
			},
			addComment: comments.addComment,
			deleteComment: comments.deleteComment,
			highlight: async ({ source, languageId }) => docode.languages.computeFullSyntaxHighlighting(source, languageId),
		});

		const onDocumentChange = docode.workspace.onDidChangeTextDocument((e) => {
			if (e.document.uri.toString() !== document.uri.toString()) {
				return;
			}
			diagnosticsChanged();
			if (
				e.document.getText() === expectedWebviewContent?.content
				&& expectedWebviewContent.epoch === editQueue.epoch
			) {
				expectedWebviewContent = undefined;
				return;
			}
			expectedWebviewContent = undefined;
			void postAuthoritativeUpdate().catch(error =>
				this.#logger.trace('Markdown editor', 'Failed to publish authoritative document change', error));
		});

		const highlight = this.#wireHighlight(editorWebview);
		const quickDiff = originalDocument
			? this.#wireDocumentDiff(originalDocument, document, editorWebview)
			: this.#wireQuickDiff(document, editorWebview);
		const reloadWebview = (): void => {
			navigation.reset();
			richLinks.clear();
			imagePaste.dispose();
			rename.cancel();
			languageFeatures.cancel();
			webviewReady = false;
			void editQueue.enqueueBarrier(async epoch => {
				if (resolveCancellation.token.isCancellationRequested) {
					return;
				}
				disposeHostTransports();
				expectedWebviewContent = undefined;
				webviewText = document.getText();
				editorWebview.reset();
				this.#configureWebview(document, editorWebview, epoch);
				await refreshCodeBlockEditorProviders(true, true);
			});
		};
		const onDidGrantWorkspaceTrust = docode.workspace.onDidGrantWorkspaceTrust(() => {
			reloadWebview();
		});
		const refreshCodeBlockEditorProviders = async (clearProviderApis: boolean, force: boolean): Promise<void> => {
			const update = ++contributionUpdate;
			if (clearProviderApis) {
				this.#clearCodeBlockEditorCaches();
			} else {
				this.#resolvedCodeBlockEditors.clear();
				this.#resolvedCodeBlockEditorResources.clear();
			}
			const updatedCodeBlockEditorProviders = await this.#loadCodeBlockEditorProviders(editorWebview.webview);
			if (
				update !== contributionUpdate
				|| (!force && codeBlockEditorProviders && codeBlockEditorDefinitionsEqual(codeBlockEditorProviders, updatedCodeBlockEditorProviders))
			) {
				return;
			}
			codeBlockEditorProviders = updatedCodeBlockEditorProviders;
			postCodeBlockEditorProviders();
		};
		const onContributionsChanged = this.#contributions.onContributionsChanged(() => {
			void refreshCodeBlockEditorProviders(true, false);
		});
		const invalidateResourceCache = (resources: readonly docode.Uri[]): void => {
			const resourceKeys = resources.map(resource => resource.toString());
			const dynamicResourceChanged = resourceKeys.some(resource => this.#resolvedCodeBlockEditorResources.has(resource));
			const staticResourceChanged = this.#contributions.contributions.codeBlockEditorProviders.some(provider =>
				provider.source.kind === 'static' && resourceKeys.includes(provider.source.resource.toString()));
			if (dynamicResourceChanged || staticResourceChanged) {
				void refreshCodeBlockEditorProviders(false, dynamicResourceChanged);
			}
		};
		const onDidSaveTextDocument = docode.workspace.onDidSaveTextDocument(document => invalidateResourceCache([document.uri]));
		const onDidCreateFiles = docode.workspace.onDidCreateFiles(event => invalidateResourceCache(event.files));
		const onDidDeleteFiles = docode.workspace.onDidDeleteFiles(event => invalidateResourceCache(event.files));
		const onDidRenameFiles = docode.workspace.onDidRenameFiles(event => invalidateResourceCache(
			event.files.flatMap(file => [file.oldUri, file.newUri])));
		const onDidChangeViewState = webviewPanel.onDidChangeViewState(() => this.#updateEditorFocusContext());
		const onDidChangeConfiguration = docode.workspace.onDidChangeConfiguration(event => {
			if (event.affectsConfiguration('markdown.experimental.richLinks.enabled', document.uri)) {
				reloadWebview();
			}
			if (event.affectsConfiguration('markdown.editor.highlightActiveBlock', document.uri) && editorWebview.ready) {
				postConfiguration();
			}
		});
		const onDidChangeLinkPresentationRules = docode.window.onDidChangeLinkPresentationRules(() => {
			reloadWebview();
		});

		this.#configureWebview(document, editorWebview, editQueue.epoch);

		webviewPanel.onDidDispose(() => {
			navigation.dispose();
			this.#navigation.delete(webviewPanel);
			imagePaste.dispose();
			rename.cancel();
			languageFeatures.cancel();
			diagnosticListener.dispose();
			contributionUpdate++;
			editQueue.invalidate();
			resolveCancellation.cancel();
			resolveCancellation.dispose();
			disposeHostTransports();
			this.#webviewPanels.delete(webviewPanel);
			this.#focusedWebviewPanels.delete(webviewPanel);
			this.#updateEditorFocusContext();
			editorWebview.dispose();
			onDocumentChange.dispose();
			highlight.dispose();
			quickDiff.dispose();
			comments.dispose();
			onDidGrantWorkspaceTrust.dispose();
			onContributionsChanged.dispose();
			onDidSaveTextDocument.dispose();
			onDidCreateFiles.dispose();
			onDidDeleteFiles.dispose();
			onDidRenameFiles.dispose();
			onDidChangeViewState.dispose();
			onDidChangeConfiguration.dispose();
			onDidChangeLinkPresentationRules.dispose();
			richLinks.dispose();
		});
	}

	public async executeCommand(command: string): Promise<void> {
		const activeWebview = Array.from(this.#webviewPanels).find(([panel]) => panel.active)?.[1];
		if (!activeWebview) {
			this.#logger.trace('Markdown editor command', `Ignored ${command} because no Markdown editor is active`);
			return;
		}
		await activeWebview.renderer.command({ command });
	}

	async #updateEditorFocusContext(): Promise<void> {
		const focused = Array.from(this.#focusedWebviewPanels).some(panel => panel.active);
		await docode.commands.executeCommand('setContext', 'markdownEditorFocus', focused);
	}

	async #loadCodeBlockEditorProviders(webview: docode.Webview): Promise<readonly CodeBlockEditorProviderDefinition[]> {
		if (!docode.workspace.isTrusted) {
			return [];
		}
		const result: CodeBlockEditorProviderDefinition[] = [];
		for (const provider of this.#contributions.contributions.codeBlockEditorProviders) {
			if (provider.source.kind === 'exportApi') {
				if (!isSupportedMarkdownCodeBlockEditorApiVersion(provider.source.apiVersion)) {
					this.#logger.trace('Markdown code block editor', `Ignoring provider ${provider.id} because API version ${provider.source.apiVersion} is not supported`);
					continue;
				}
				result.push({
					id: provider.id,
					selector: provider.selector,
					source: { kind: 'exportApi' },
				});
				continue;
			}
			try {
				const bytes = await docode.workspace.fs.readFile(provider.source.resource);
				result.push({
					id: provider.id,
					selector: provider.selector,
					source: {
						kind: 'static',
						descriptor: {
							html: new TextDecoder('utf-8', { fatal: true }).decode(bytes),
							runtimeKey: provider.runtimeKey ?? `${provider.id}@${provider.extensionVersion}`,
							resourceBaseUrl: getCodeBlockEditorResourceBaseUrl(webview, provider.source.resource),
							contentType: provider.contentType,
							initialHeight: provider.initialHeight,
							presentation: provider.presentation,
							sandbox: provider.sandbox,
						},
					},
				});
			} catch (error) {
				this.#logger.trace('Markdown code block editor', `Failed to load ${provider.id} from ${provider.source.resource.toString()}`, error);
			}
		}
		return result;
	}

	async #resolveCodeBlockEditor(
		contribution: MarkdownCodeBlockEditorProvider,
		documentUri: docode.Uri,
		language: string,
		webview: docode.Webview,
	): Promise<ResolvedCodeBlockEditor | undefined> {
		if (contribution.source.kind !== 'exportApi' || !docode.workspace.isTrusted) {
			return undefined;
		}
		const requestCacheKey = `${contribution.id}\0${documentUri.toString()}\0${language}`;
		let cached = this.#resolvedCodeBlockEditors.get(requestCacheKey);
		if (!cached) {
			cached = this.#doResolveCodeBlockEditor(contribution, documentUri, language, webview);
			this.#resolvedCodeBlockEditors.set(requestCacheKey, cached);
			cached.then(result => {
				if (!result) {
					if (this.#resolvedCodeBlockEditors.get(requestCacheKey) === cached) {
						this.#resolvedCodeBlockEditors.delete(requestCacheKey);
					}
				} else if (result.cacheKey) {
					this.#resolvedCodeBlockEditors.set(`${contribution.id}\0${result.cacheKey}`, Promise.resolve(result));
				}
			}, () => {
				this.#resolvedCodeBlockEditors.delete(requestCacheKey);
			});
		}
		return cached;
	}

	async #doResolveCodeBlockEditor(
		contribution: MarkdownCodeBlockEditorProvider,
		documentUri: docode.Uri,
		language: string,
		webview: docode.Webview,
	): Promise<ResolvedCodeBlockEditor | undefined> {
		const cancellation = new docode.CancellationTokenSource();
		let timedOut = false;
		const timeout = setTimeout(() => {
			timedOut = true;
			cancellation.cancel();
		}, 10_000);
		let cancellationListener: docode.Disposable | undefined;
		const cancelled = new Promise<undefined>(resolve => {
			cancellationListener = cancellation.token.onCancellationRequested(() => resolve(undefined));
		});
		try {
			const operation = async (): Promise<ResolvedCodeBlockEditor | undefined> => {
				const provider = await this.#getCodeBlockEditorProvider(contribution);
				if (!provider || cancellation.token.isCancellationRequested) {
					return undefined;
				}
				const value = await provider.resolve({
					providerId: contribution.providerId,
					language,
					documentUri,
				}, cancellation.token);
				if (!value || cancellation.token.isCancellationRequested) {
					return undefined;
				}
				if (value.content.uri !== undefined) {
					this.#resolvedCodeBlockEditorResources.add(value.content.uri.toString());
				}
				return await this.#readResolvedCodeBlockEditor(
					contribution,
					value,
					language,
					webview,
					typeof provider.createHostTransport === 'function',
				);
			};
			const result = await Promise.race([operation(), cancelled]);
			if (timedOut) {
				this.#logger.trace('Markdown code block editor', `Provider ${contribution.id} timed out resolving ${language}`);
				return undefined;
			}
			return result;
		} catch (error) {
			this.#logger.trace('Markdown code block editor', `Provider ${contribution.id} failed to resolve ${language}`, error);
			return undefined;
		} finally {
			clearTimeout(timeout);
			cancellationListener?.dispose();
			cancellation.dispose();
		}
	}

	async #getCodeBlockEditorProvider(contribution: MarkdownCodeBlockEditorProvider): Promise<MarkdownCodeBlockEditorProviderApi | undefined> {
		const source = contribution.source;
		if (source.kind !== 'exportApi' || !isSupportedMarkdownCodeBlockEditorApiVersion(source.apiVersion)) {
			return undefined;
		}
		let cached = this.#providerApis.get(contribution.id);
		if (!cached) {
			cached = (async () => {
				const exports = await contribution.extension.activate();
				const api = source.apiVersion === 1
					? getMarkdownCodeBlockEditorApiV1(exports)
					: getMarkdownCodeBlockEditorApiV2(exports);
				if (!api) {
					this.#logger.trace('Markdown code block editor', `Extension ${contribution.extension.id} does not export markdownCodeBlockEditors.apiV${source.apiVersion}`);
					return undefined;
				}
				const provider = api.getProvider(contribution.providerId);
				if (!isMarkdownCodeBlockEditorProviderApi(provider)) {
					this.#logger.trace('Markdown code block editor', `Extension ${contribution.extension.id} did not return provider ${contribution.providerId}`);
					return undefined;
				}
				return provider;
			})();
			this.#providerApis.set(contribution.id, cached);
		}
		return cached;
	}

	async #readResolvedCodeBlockEditor(
		contribution: MarkdownCodeBlockEditorProvider,
		value: ProviderResolvedCodeBlockEditor,
		language: string,
		webview: docode.Webview,
		hasHostTransport: boolean,
	): Promise<ResolvedCodeBlockEditor | undefined> {
		if (!isProviderResolvedCodeBlockEditor(value)) {
			this.#logger.trace('Markdown code block editor', `Provider ${contribution.id} returned an invalid descriptor`);
			return undefined;
		}
		let html: string;
		let baseUri: docode.Uri | undefined;
		if (value.content.html !== undefined) {
			html = value.content.html;
			baseUri = value.content.baseUri;
		} else {
			if (!isAllowedCodeBlockEditorResource(value.content.uri, contribution.extension.extensionUri)) {
				this.#logger.trace('Markdown code block editor', `Provider ${contribution.id} returned a resource outside its extension and the workspace`);
				return undefined;
			}
			const bytes = await docode.workspace.fs.readFile(value.content.uri);
			html = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
			baseUri = value.content.uri;
		}
		if (baseUri && !isAllowedCodeBlockEditorResource(baseUri, contribution.extension.extensionUri)) {
			this.#logger.trace('Markdown code block editor', `Provider ${contribution.id} returned a base URI outside its extension and the workspace`);
			return undefined;
		}
		return {
			cacheKey: value.cacheKey,
			html,
			runtimeKey: value.runtimeKey ?? contribution.runtimeKey ?? value.cacheKey ?? `${contribution.id}@${contribution.extensionVersion}:${language}`,
			resourceBaseUrl: baseUri ? getCodeBlockEditorResourceBaseUrl(webview, baseUri, value.content.html === undefined) : undefined,
			hostTransport: hasHostTransport && contribution.source.kind === 'exportApi' && contribution.source.apiVersion >= 2,
			contentType: value.contentType ?? contribution.contentType,
			initialHeight: value.initialHeight ?? contribution.initialHeight,
			presentation: mergeCodeBlockEditorPresentation(contribution.presentation, value.presentation),
			sandbox: intersectSandbox(contribution.sandbox, value.sandbox),
		};
	}

	async #initializeCodeBlockEditorHostTransport(
		contribution: MarkdownCodeBlockEditorProvider,
		state: CodeBlockEditorHostTransportState,
		token: docode.CancellationToken,
	): Promise<boolean> {
		const provider = await this.#getCodeBlockEditorProvider(contribution);
		if (!provider?.createHostTransport || token.isCancellationRequested) {
			return false;
		}
		const disposable = await provider.createHostTransport(state.transport, token);
		state.setReady(disposable ?? undefined);
		return !token.isCancellationRequested;
	}

	#clearCodeBlockEditorCaches(): void {
		this.#providerApis.clear();
		this.#resolvedCodeBlockEditors.clear();
		this.#resolvedCodeBlockEditorResources.clear();
	}

	/**
	 * Forwards the source-control change information for the document (the same
	 * added/modified/deleted line changes shown in the editor gutter) to the
	 * webview, where it is painted in the Markdown editor's gutter. Line ranges
	 * are converted to source character offsets here, since the webview works in
	 * offsets.
	 */
	#wireQuickDiff(document: docode.TextDocument, editorWebview: AuthenticatedWebview): docode.Disposable {
		const diffProvider = docode.window.createSourceControlDiffInformation(document.uri);

		const postMarkers = () => {
			const diffInformation = diffProvider.diffInformation;
			// The changes are computed asynchronously against a specific document
			// version. Only map them to offsets while that version still matches the
			// document we hold, otherwise the line positions could be stale. A newer
			// diff for the current version will arrive via onDidChange.
			if (!editorWebview.ready || !diffInformation || diffInformation.isStale) {
				return;
			}
			editorWebview.report('Publish quick diff', editorWebview.renderer.gutterMarkers({ markers: toGutterMarkers(document, diffInformation.changes) }));
		};

		const onChange = diffProvider.onDidChange(postMarkers);
		// Re-send once the webview has (re)initialized its model, and whenever the
		// document settles on the version the changes were computed for.
		const onReady = editorWebview.onReady(postMarkers);
		const onDocumentChange = docode.workspace.onDidChangeTextDocument((e) => {
			if (e.document.uri.toString() === document.uri.toString()) {
				postMarkers();
			}
		});

		return docode.Disposable.from(diffProvider, onChange, onReady, onDocumentChange);
	}

	#wireDocumentDiff(originalDocument: docode.TextDocument, modifiedDocument: docode.TextDocument, editorWebview: AuthenticatedWebview): docode.Disposable {
		const lineDiffProvider = new MarkdownPreviewLineDiffProvider(originalDocument, modifiedDocument);
		const postMarkers = async () => {
			if (!editorWebview.ready) {
				return;
			}
			const originalVersion = originalDocument.version;
			const modifiedVersion = modifiedDocument.version;
			const changes = await lineDiffProvider.getChangedLineRanges();
			if (originalVersion !== originalDocument.version || modifiedVersion !== modifiedDocument.version) {
				return;
			}
			editorWebview.renderer.gutterMarkers({ markers: lineRangesToGutterMarkers(modifiedDocument, changes) });
		};

		const publishMarkers = () => editorWebview.report('Publish document diff', postMarkers());
		const onReady = editorWebview.onReady(publishMarkers);
		const onDocumentChange = docode.workspace.onDidChangeTextDocument(event => {
			if (event.document.uri.toString() === originalDocument.uri.toString() || event.document.uri.toString() === modifiedDocument.uri.toString()) {
				publishMarkers();
			}
		});

		return docode.Disposable.from(onReady, onDocumentChange);
	}

	/**
	 * Bridges the workbench's agent/session comments (the same store the code
	 * editor renders its comments from) to the webview: existing comments are
	 * forwarded for rendering, and comments the user adds in the Markdown editor
	 * are written back to the shared store so they appear in the code editor too.
	 * Comment ranges are converted between {@link docode.Range} and the source
	 * character offsets the webview works in.
	 */
	#wireComments(document: docode.TextDocument, editorWebview: AuthenticatedWebview): docode.Disposable & Pick<InterfaceHandlers<typeof markdownEditorHost>, 'addComment' | 'deleteComment'> {
		const commentsProvider = docode.window.createAgentEditorComments(document.uri);
		let revealedCommentId: string | undefined;

		const postComments = () => {
			if (!editorWebview.ready) {
				return;
			}
			const comments = commentsProvider.comments.map(comment => ({
				id: comment.id,
				start: document.offsetAt(comment.range.start),
				endExclusive: document.offsetAt(comment.range.end),
				body: comment.body,
				author: comment.author,
			}));
			editorWebview.report('Publish comments', editorWebview.renderer.comments({ comments, acceptsComments: commentsProvider.acceptsComments }));
		};
		const postReveal = () => {
			if (editorWebview.ready && revealedCommentId) {
				editorWebview.report('Reveal comment', editorWebview.renderer.revealComment({ id: revealedCommentId }));
			}
		};

		const onChange = commentsProvider.onDidChange(postComments);
		const onDidRevealComment = commentsProvider.onDidRevealComment(id => {
			revealedCommentId = id;
			postReveal();
		});
		const onReady = editorWebview.onReady(() => {
			postComments();
			postReveal();
		});

		return {
			addComment: message => {
				if (message.endExclusive < message.start || message.endExclusive > document.getText().length) {
					throw new Error('Invalid Markdown editor comment range');
				}
				const range = new docode.Range(
					document.positionAt(message.start),
					document.positionAt(message.endExclusive),
				);
				commentsProvider.addComment(range, message.text);
			},
			deleteComment: message => {
				commentsProvider.deleteComment(message.id);
			},
			dispose: () => docode.Disposable.from(commentsProvider, onChange, onDidRevealComment, onReady).dispose(),
		};
	}


	/**
	 * Proxies the webview's syntax highlighting requests to the
	 * `documentSyntaxHighlighting` proposed API, since the webview cannot call
	 * it directly. Also forwards theme changes so the webview can re-highlight.
	 */
	#wireHighlight(editorWebview: AuthenticatedWebview): docode.Disposable {
		return docode.languages.onDidChangeSyntaxHighlighting(() => {
			if (editorWebview.ready) {
				editorWebview.report('Refresh highlighting', editorWebview.renderer.highlightThemeChanged({}));
			}
		});
	}

	#getHtml(document: docode.TextDocument, webview: docode.Webview, messageSecret: string, editEpoch: number): string {
		const scriptUri = webview.asWebviewUri(docode.Uri.joinPath(this.#mediaRoot, 'editor.js'));
		const styleUri = webview.asWebviewUri(docode.Uri.joinPath(this.#mediaRoot, 'editor.css'));
		const baseUri = webview.asWebviewUri(document.uri);
		const nonce = getNonce();
		const initialState = encodeWebviewInitialState({
			...this.#getEditorConfiguration(document.uri),
			taskProgressLabels: {
				title: docode.l10n.t("Task Progress"),
				summary: docode.l10n.t("{0} of {1} tasks completed"),
				language: docode.env.language,
			},
			content: document.getText(),
			documentVersion: document.version,
			editEpoch,
			readonly: this.#globalState.get(MarkdownEditorProvider.#readonlyStateKey, true),
			richLinksEnabled: docode.workspace.getConfiguration('markdown').get<boolean>('experimental.richLinks.enabled', true),
			linkPresentationRules: docode.window.linkPresentationRules.map(rule => ({
				id: rule.id,
				source: rule.uriPattern.source,
				flags: rule.uriPattern.flags,
				kind: rule.kind === 'chat' ? 'session' : rule.kind,
			})),
		});

		const body = /* html */ `
	<div id="editor"></div>`;

		return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<meta http-equiv="Content-Security-Policy"
		content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource}; img-src ${webview.cspSource} https: data:; media-src ${webview.cspSource} https: data:; script-src 'nonce-${nonce}' ${webview.cspSource}; worker-src ${webview.cspSource} blob:; connect-src ${webview.cspSource}; frame-src 'self';" />
	<meta name="docode-markdown-editor-script-nonce" content="${nonce}" />
	<meta name="docode-markdown-editor-message-secret" content="${messageSecret}" />
	<meta id="docode-markdown-editor-initial-state" content="${initialState}" />
	<base href="${baseUri}" />
	<link rel="stylesheet" href="${styleUri}" />
	<title>Markdown Editor</title>
</head>
<body>${body}
	<script nonce="${nonce}" type="module" src="${scriptUri}"></script>
</body>
</html>`;
	}

	#getEditorConfiguration(resource: docode.Uri): MarkdownEditorConfiguration {
		return {
			highlightActiveBlock: docode.workspace.getConfiguration('markdown.editor', resource).get<boolean>('highlightActiveBlock', true),
		};
	}
}

function codeBlockEditorDefinitionsEqual(
	a: readonly CodeBlockEditorProviderDefinition[],
	b: readonly CodeBlockEditorProviderDefinition[],
): boolean {
	return a.length === b.length && a.every((editor, index) => {
		const other = b[index];
		return editor.id === other.id
			&& editor.selector.language === other.selector.language
			&& editor.selector.languagePrefix === other.selector.languagePrefix
			&& editor.source.kind === other.source.kind
			&& (editor.source.kind !== 'static'
				|| (other.source.kind === 'static' && resolvedCodeBlockEditorsEqual(editor.source.descriptor, other.source.descriptor)));
	});
}

function resolvedCodeBlockEditorsEqual(a: ResolvedCodeBlockEditor, b: ResolvedCodeBlockEditor): boolean {
	return a.cacheKey === b.cacheKey
		&& a.html === b.html
		&& a.runtimeKey === b.runtimeKey
		&& a.resourceBaseUrl === b.resourceBaseUrl
		&& a.hostTransport === b.hostTransport
		&& a.contentType === b.contentType
		&& a.initialHeight === b.initialHeight
		&& codeBlockEditorPresentationEqual(a.presentation, b.presentation)
		&& a.sandbox?.forms === b.sandbox?.forms
		&& a.sandbox?.downloads === b.sandbox?.downloads
		&& a.sandbox?.pointerLock === b.sandbox?.pointerLock
		&& a.sandbox?.clipboardWrite === b.sandbox?.clipboardWrite;
}

export function getMarkdownCodeBlockEditorApiV1(value: unknown): MarkdownCodeBlockEditorApiV1 | undefined {
	return getMarkdownCodeBlockEditorApi(value, 1);
}

export function getMarkdownCodeBlockEditorApiV2(value: unknown): MarkdownCodeBlockEditorApiV2 | undefined {
	return getMarkdownCodeBlockEditorApi(value, 2);
}

function getMarkdownCodeBlockEditorApi(value: unknown, apiVersion: 1): MarkdownCodeBlockEditorApiV1 | undefined;
function getMarkdownCodeBlockEditorApi(value: unknown, apiVersion: 2): MarkdownCodeBlockEditorApiV2 | undefined;
function getMarkdownCodeBlockEditorApi(value: unknown, apiVersion: 1 | 2): MarkdownCodeBlockEditorApiV1 | MarkdownCodeBlockEditorApiV2 | undefined;
function getMarkdownCodeBlockEditorApi(value: unknown, apiVersion: 1 | 2): MarkdownCodeBlockEditorApiV1 | MarkdownCodeBlockEditorApiV2 | undefined {
	if (!value || typeof value !== 'object') {
		return undefined;
	}
	const namespace = (value as Record<string, unknown>).markdownCodeBlockEditors;
	if (!namespace || typeof namespace !== 'object') {
		return undefined;
	}
	const api = (namespace as Record<string, unknown>)[`apiV${apiVersion}`];
	return isMarkdownCodeBlockEditorApi(api) ? api : undefined;
}

export function isSupportedMarkdownCodeBlockEditorApiVersion(value: number): value is 1 | 2 {
	return value === 1 || value === 2;
}

function isMarkdownCodeBlockEditorApi(value: unknown): value is MarkdownCodeBlockEditorApiV1 | MarkdownCodeBlockEditorApiV2 {
	return typeof value === 'object'
		&& value !== null
		&& typeof (value as Record<string, unknown>).getProvider === 'function';
}

function isMarkdownCodeBlockEditorProviderApi(value: unknown): value is MarkdownCodeBlockEditorProviderApi {
	return typeof value === 'object'
		&& value !== null
		&& typeof (value as Record<string, unknown>).resolve === 'function';
}

function isProviderResolvedCodeBlockEditor(value: unknown): value is ProviderResolvedCodeBlockEditor {
	if (!value || typeof value !== 'object') {
		return false;
	}
	const descriptor = value as Record<string, unknown>;
	if (
		(descriptor.contentType !== undefined && descriptor.contentType !== 'text' && descriptor.contentType !== 'json')
		|| (descriptor.cacheKey !== undefined && typeof descriptor.cacheKey !== 'string')
		|| (descriptor.runtimeKey !== undefined && (typeof descriptor.runtimeKey !== 'string' || descriptor.runtimeKey.length === 0 || descriptor.runtimeKey.length > 256))
		|| (descriptor.initialHeight !== undefined && (!Number.isFinite(descriptor.initialHeight) || (descriptor.initialHeight as number) <= 0))
		|| (descriptor.presentation !== undefined && !codeBlockEditorPresentation.safeParse(descriptor.presentation).success)
		|| !isSandbox(descriptor.sandbox)
		|| !descriptor.content
		|| typeof descriptor.content !== 'object'
	) {
		return false;
	}
	const content = descriptor.content as Record<string, unknown>;
	return (typeof content.html === 'string' && content.uri === undefined && (content.baseUri === undefined || content.baseUri instanceof docode.Uri))
		|| (content.html === undefined && content.uri instanceof docode.Uri);
}

function isSandbox(value: unknown): value is MarkdownCodeBlockEditorSandbox | undefined {
	if (value === undefined) {
		return true;
	}
	if (!value || typeof value !== 'object') {
		return false;
	}
	const sandbox = value as Record<string, unknown>;
	return ['forms', 'downloads', 'pointerLock', 'clipboardWrite']
		.every(key => sandbox[key] === undefined || typeof sandbox[key] === 'boolean');
}

function intersectSandbox(
	maximum: MarkdownCodeBlockEditorSandbox | undefined,
	requested: MarkdownCodeBlockEditorSandbox | undefined,
): MarkdownCodeBlockEditorSandbox {
	return {
		forms: maximum?.forms === true && requested?.forms !== false,
		downloads: maximum?.downloads === true && requested?.downloads !== false,
		pointerLock: maximum?.pointerLock === true && requested?.pointerLock !== false,
		clipboardWrite: maximum?.clipboardWrite === true && requested?.clipboardWrite !== false,
	};
}

function isAllowedCodeBlockEditorResource(resource: docode.Uri, extensionUri: docode.Uri): boolean {
	if (docode.workspace.getWorkspaceFolder(resource)) {
		return true;
	}

	if (resource.scheme !== extensionUri.scheme || resource.authority !== extensionUri.authority) {
		return false;
	}
	const caseInsensitive = resource.scheme === 'file';
	const resourcePath = caseInsensitive ? resource.path.toLowerCase() : resource.path;
	const extensionPath = caseInsensitive ? extensionUri.path.toLowerCase() : extensionUri.path;
	const extensionPrefix = extensionPath.endsWith('/') ? extensionPath : `${extensionPath}/`;
	return resourcePath === extensionPath || resourcePath.startsWith(extensionPrefix);
}

function getCodeBlockEditorResourceBaseUrl(webview: docode.Webview, resource: docode.Uri, resourceIsEntrypoint = true): string {
	const path = resourceIsEntrypoint
		? resource.path.slice(0, resource.path.lastIndexOf('/') + 1)
		: resource.path.endsWith('/') ? resource.path : `${resource.path}/`;
	return webview.asWebviewUri(resource.with({ path, query: '', fragment: '' })).toString();
}

function getNonce(): string {
	let text = '';
	const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	for (let i = 0; i < 32; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
}

export function readMarkdownEditorEdit(message: unknown): MarkdownEditorEdit | undefined {
	if (typeof message !== 'object' || message === null) {
		return undefined;
	}
	const candidate = message as { readonly start?: unknown; readonly endExclusive?: unknown; readonly text?: unknown; readonly editEpoch?: unknown };
	if (
		typeof candidate.start !== 'number' || !Number.isInteger(candidate.start) || candidate.start < 0
		|| typeof candidate.endExclusive !== 'number' || !Number.isInteger(candidate.endExclusive) || candidate.endExclusive < candidate.start
		|| typeof candidate.text !== 'string'
		|| typeof candidate.editEpoch !== 'number' || !Number.isInteger(candidate.editEpoch) || candidate.editEpoch < 0
	) {
		return undefined;
	}
	return {
		start: candidate.start,
		endExclusive: candidate.endExclusive,
		text: candidate.text,
		editEpoch: candidate.editEpoch,
	};
}

export function computeMarkdownEditorEdit(
	resource: docode.Uri,
	documentText: string,
	documentEol: docode.EndOfLine,
	webviewText: string,
	edit: MarkdownEditorEdit,
): { readonly range: docode.Range; readonly replacementText: string; readonly expectedDocumentText: string; readonly nextWebviewText: string } | undefined {
	if (edit.endExclusive > webviewText.length) {
		return undefined;
	}
	const webviewDocument = TextDocument.create(resource.toString(), 'markdown', 0, webviewText);
	const start = webviewDocument.positionAt(edit.start);
	const end = webviewDocument.positionAt(edit.endExclusive);
	const document = TextDocument.create(resource.toString(), 'markdown', 0, documentText);
	if (start.line >= document.lineCount || end.line >= document.lineCount) {
		return undefined;
	}
	const range = new docode.Range(start.line, start.character, end.line, end.character);
	const replacementText = normalizeEol(edit.text, documentEol);
	return {
		range,
		replacementText,
		expectedDocumentText: documentText.slice(0, document.offsetAt(start)) + replacementText + documentText.slice(document.offsetAt(end)),
		nextWebviewText: webviewText.slice(0, edit.start) + edit.text + webviewText.slice(edit.endExclusive),
	};
}

function normalizeEol(value: string, eol: docode.EndOfLine): string {
	const lineEnding = eol === docode.EndOfLine.CRLF ? '\r\n' : '\n';
	return value.replace(/\r\n|\r|\n/g, lineEnding);
}

export function getInDocumentLinkTargetRange(
	document: docode.TextDocument,
	target: ResolvedDocumentLinkTarget | undefined,
	webviewText = document.getText(),
): { readonly start: number; readonly endExclusive: number; readonly selectionStart: number } | undefined {
	if (target?.kind !== 'file' || !areUrisEqual(document.uri, docode.Uri.from(target.uri))) {
		return undefined;
	}
	const targetRange = getRangeFromPositionOrRange(target.positionOrRange);
	if (!targetRange || targetRange.start.line >= document.lineCount || targetRange.end.line >= document.lineCount) {
		return undefined;
	}
	const webviewDocument = TextDocument.create(document.uri.toString(), 'markdown', 0, webviewText);
	if (targetRange.start.line >= webviewDocument.lineCount || targetRange.end.line >= webviewDocument.lineCount) {
		return undefined;
	}
	// Heading links resolve to the line start, whose Markdown marker is hidden while rendered.
	// Reveal the full line so the editor can map the target to visible content.
	let start = webviewDocument.offsetAt(targetRange.start);
	let endExclusive = webviewDocument.offsetAt(targetRange.end);
	if (targetRange.isEmpty) {
		start = webviewDocument.offsetAt({ line: targetRange.start.line, character: 0 });
		endExclusive = targetRange.start.line + 1 < webviewDocument.lineCount
			? webviewDocument.offsetAt({ line: targetRange.start.line + 1, character: 0 })
			: webviewText.length;
		while (endExclusive > start && (webviewText[endExclusive - 1] === '\n' || webviewText[endExclusive - 1] === '\r')) {
			endExclusive--;
		}
	}
	return {
		start,
		endExclusive,
		selectionStart: webviewDocument.offsetAt(targetRange.start),
	};
}

interface GutterMarkerMessage {
	readonly start: number;
	readonly endExclusive: number;
	readonly type: 'added' | 'modified' | 'deleted';
}

/**
 * Converts the line-based source control changes into source character offset
 * ranges understood by the Markdown editor's `gutterMarkers`. Added/modified
 * changes map to the offset span of their modified lines; deleted changes map to
 * an empty range at the boundary where the removed text used to be.
 *
 * Line ranges use {@link docode.TextEditorLineRange} semantics: 1-based
 * `startLineNumber` and exclusive `endLineNumberExclusive`.
 */
function toGutterMarkers(document: docode.TextDocument, changes: readonly docode.TextEditorChange[]): GutterMarkerMessage[] {
	const markers: GutterMarkerMessage[] = [];
	for (const change of changes) {
		if (change.kind === docode.TextEditorChangeKind.Deletion) {
			// The modified range is empty; place an empty marker at the start of the
			// line where the removed content used to be.
			const line = Math.max(0, change.modified.startLineNumber - 1);
			const offset = document.offsetAt(new docode.Position(line, 0));
			markers.push({ start: offset, endExclusive: offset, type: 'deleted' });
			continue;
		}

		const start = document.offsetAt(new docode.Position(change.modified.startLineNumber - 1, 0));
		const endExclusive = document.offsetAt(document.lineAt(change.modified.endLineNumberExclusive - 2).range.end);
		markers.push({
			start,
			endExclusive,
			type: change.kind === docode.TextEditorChangeKind.Addition ? 'added' : 'modified',
		});
	}
	return markers;
}

export function lineRangesToGutterMarkers(document: docode.TextDocument, changes: readonly ChangedLineRange[]): GutterMarkerMessage[] {
	return changes.map(change => {
		if (change.modifiedRange.isEmpty) {
			const offset = document.offsetAt(change.modifiedRange.start);
			return { start: offset, endExclusive: offset, type: 'deleted' };
		}

		const start = document.offsetAt(change.modifiedRange.start);
		const endExclusive = document.offsetAt(document.lineAt(change.modifiedRange.end.line - 1).range.end);
		return {
			start,
			endExclusive,
			type: change.originalRange.isEmpty ? 'added' : 'modified',
		};
	});
}
