/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { asPromise } from '../../../base/common/async.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { debounce } from '../../../base/common/decorators.js';
import { Emitter } from '../../../base/common/event.js';
import { DisposableStore, MutableDisposable } from '../../../base/common/lifecycle.js';
import { MarshalledId } from '../../../base/common/marshallingIds.js';
import { URI, UriComponents } from '../../../base/common/uri.js';
import { IRange } from '../../../editor/common/core/range.js';
import * as languages from '../../../editor/common/languages.js';
import { IExtensionDescription } from '../../../platform/extensions/common/extensions.js';
import { ExtHostDocuments } from './extHostDocuments.js';
import * as extHostTypeConverter from './extHostTypeConverters.js';
import * as types from './extHostTypes.js';
import type * as docode from 'docode';
import { ExtHostCommentsShape, IMainContext, MainContext, CommentThreadChanges, CommentChanges } from './extHost.protocol.js';
import { ExtHostCommands } from './extHostCommands.js';
import { checkProposedApiEnabled } from '../../services/extensions/common/extensions.js';
import { MarshalledCommentThread } from '../../common/comments.js';

type ProviderHandle = number;

interface ExtHostComments {
	createCommentController(extension: IExtensionDescription, id: string, label: string): docode.CommentController;
}

export function createExtHostComments(mainContext: IMainContext, commands: ExtHostCommands, documents: ExtHostDocuments): ExtHostCommentsShape & ExtHostComments {
	const proxy = mainContext.getProxy(MainContext.MainThreadComments);

	class ExtHostCommentsImpl implements ExtHostCommentsShape, ExtHostComments {

		private static handlePool = 0;


		private _commentControllers: Map<ProviderHandle, ExtHostCommentController> = new Map<ProviderHandle, ExtHostCommentController>();

		constructor(
		) {
			commands.registerArgumentProcessor({
				processArgument: arg => {
					if (arg && arg.$mid === MarshalledId.CommentController) {
						const commentController = this._commentControllers.get(arg.handle);

						if (!commentController) {
							return arg;
						}

						return commentController.value;
					} else if (arg && arg.$mid === MarshalledId.CommentThread) {
						const marshalledCommentThread: MarshalledCommentThread = arg;
						const commentController = this._commentControllers.get(marshalledCommentThread.commentControlHandle);

						if (!commentController) {
							return marshalledCommentThread;
						}

						const commentThread = commentController.getCommentThread(marshalledCommentThread.commentThreadHandle);

						if (!commentThread) {
							return marshalledCommentThread;
						}

						return commentThread.value;
					} else if (arg && (arg.$mid === MarshalledId.CommentThreadReply || arg.$mid === MarshalledId.CommentThreadInstance)) {
						const commentController = this._commentControllers.get(arg.thread.commentControlHandle);

						if (!commentController) {
							return arg;
						}

						const commentThread = commentController.getCommentThread(arg.thread.commentThreadHandle);

						if (!commentThread) {
							return arg;
						}

						if (arg.$mid === MarshalledId.CommentThreadInstance) {
							return commentThread.value;
						}

						return {
							thread: commentThread.value,
							text: arg.text
						};
					} else if (arg && arg.$mid === MarshalledId.CommentNode) {
						const commentController = this._commentControllers.get(arg.thread.commentControlHandle);

						if (!commentController) {
							return arg;
						}

						const commentThread = commentController.getCommentThread(arg.thread.commentThreadHandle);

						if (!commentThread) {
							return arg;
						}

						const commentUniqueId = arg.commentUniqueId;

						const comment = commentThread.getCommentByUniqueId(commentUniqueId);

						if (!comment) {
							return arg;
						}

						return comment;

					} else if (arg && arg.$mid === MarshalledId.CommentThreadNode) {
						const commentController = this._commentControllers.get(arg.thread.commentControlHandle);

						if (!commentController) {
							return arg;
						}

						const commentThread = commentController.getCommentThread(arg.thread.commentThreadHandle);

						if (!commentThread) {
							return arg;
						}

						const body: string = arg.text;
						const commentUniqueId = arg.commentUniqueId;

						const comment = commentThread.getCommentByUniqueId(commentUniqueId);

						if (!comment) {
							return arg;
						}

						// If the old comment body was a markdown string, use a markdown string here too.
						if (typeof comment.body === 'string') {
							comment.body = body;
						} else {
							comment.body = new types.MarkdownString(body);
						}
						return comment;
					}

					return arg;
				}
			});
		}

		createCommentController(extension: IExtensionDescription, id: string, label: string): docode.CommentController {
			const handle = ExtHostCommentsImpl.handlePool++;
			const commentController = new ExtHostCommentController(extension, handle, id, label, () => {
				this._commentControllers.delete(handle);
			});
			this._commentControllers.set(commentController.handle, commentController);

			return commentController.value;
		}

		async $createCommentThreadTemplate(commentControllerHandle: number, uriComponents: UriComponents, range: IRange | undefined, editorId?: string): Promise<void> {
			const commentController = this._commentControllers.get(commentControllerHandle);

			if (!commentController) {
				return;
			}

			commentController.$createCommentThreadTemplate(uriComponents, range, editorId);
		}

		async $setActiveComment(controllerHandle: number, commentInfo: { commentThreadHandle: number; uniqueIdInThread?: number }): Promise<void> {
			const commentController = this._commentControllers.get(controllerHandle);

			if (!commentController) {
				return;
			}

			commentController.$setActiveComment(commentInfo ?? undefined);
		}

		async $updateCommentThreadTemplate(commentControllerHandle: number, threadHandle: number, range: IRange) {
			const commentController = this._commentControllers.get(commentControllerHandle);

			if (!commentController) {
				return;
			}

			commentController.$updateCommentThreadTemplate(threadHandle, range);
		}

		$deleteCommentThread(commentControllerHandle: number, commentThreadHandle: number) {
			const commentController = this._commentControllers.get(commentControllerHandle);

			commentController?.$deleteCommentThread(commentThreadHandle);
		}

		async $updateCommentThread(commentControllerHandle: number, commentThreadHandle: number, changes: CommentThreadChanges) {
			const commentController = this._commentControllers.get(commentControllerHandle);

			commentController?.$updateCommentThread(commentThreadHandle, changes);
		}

		async $provideCommentingRanges(commentControllerHandle: number, uriComponents: UriComponents, token: CancellationToken): Promise<{ ranges: IRange[]; fileComments: boolean } | undefined> {
			const commentController = this._commentControllers.get(commentControllerHandle);

			if (!commentController || !commentController.commentingRangeProvider) {
				return Promise.resolve(undefined);
			}

			const document = await documents.ensureDocumentData(URI.revive(uriComponents));
			return asPromise(async () => {
				const rangesResult = await commentController.commentingRangeProvider?.provideCommentingRanges(document.document, token);
				let ranges: { ranges: docode.Range[]; fileComments: boolean } | undefined;
				if (Array.isArray(rangesResult)) {
					ranges = {
						ranges: rangesResult,
						fileComments: false
					};
				} else if (rangesResult) {
					ranges = {
						ranges: rangesResult.ranges || [],
						fileComments: rangesResult.enableFileComments || false
					};
				} else {
					ranges = rangesResult ?? undefined;
				}
				return ranges;
			}).then(ranges => {
				let convertedResult: { ranges: IRange[]; fileComments: boolean } | undefined = undefined;
				if (ranges) {
					convertedResult = {
						ranges: ranges.ranges.map(x => extHostTypeConverter.Range.from(x)),
						fileComments: ranges.fileComments
					};
				}
				return convertedResult;
			});
		}

		$toggleReaction(commentControllerHandle: number, threadHandle: number, uri: UriComponents, comment: languages.Comment, reaction: languages.CommentReaction): Promise<void> {
			const commentController = this._commentControllers.get(commentControllerHandle);

			if (!commentController || !commentController.reactionHandler) {
				return Promise.resolve(undefined);
			}

			return asPromise(() => {
				const commentThread = commentController.getCommentThread(threadHandle);
				if (commentThread) {
					const docodeComment = commentThread.getCommentByUniqueId(comment.uniqueIdInThread);

					if (commentController !== undefined && docodeComment) {
						if (commentController.reactionHandler) {
							return commentController.reactionHandler(docodeComment, convertFromReaction(reaction));
						}
					}
				}

				return Promise.resolve(undefined);
			});
		}
	}
	type CommentThreadModification = Partial<{
		range: docode.Range;
		label: string | undefined;
		contextValue: string | undefined;
		comments: docode.Comment[];
		collapsibleState: docode.CommentThreadCollapsibleState;
		canReply: boolean | docode.CommentAuthorInformation;
		state: docode.CommentThreadState;
		isTemplate: boolean;
		applicability: docode.CommentThreadApplicability;
	}>;

	class ExtHostCommentThread implements docode.CommentThread2 {
		private static _handlePool: number = 0;
		readonly handle = ExtHostCommentThread._handlePool++;
		public commentHandle: number = 0;

		private modifications: CommentThreadModification = Object.create(null);

		set threadId(id: string) {
			this._id = id;
		}

		get threadId(): string {
			return this._id!;
		}

		get id(): string {
			return this._id!;
		}

		get resource(): docode.Uri {
			return this._uri;
		}

		get uri(): docode.Uri {
			return this._uri;
		}

		private readonly _onDidUpdateCommentThread = new Emitter<void>();
		readonly onDidUpdateCommentThread = this._onDidUpdateCommentThread.event;

		set range(range: docode.Range | undefined) {
			if (((range === undefined) !== (this._range === undefined)) || (!range || !this._range || !range.isEqual(this._range))) {
				this._range = range;
				this.modifications.range = range;
				this._onDidUpdateCommentThread.fire();
			}
		}

		get range(): docode.Range | undefined {
			return this._range;
		}

		private _canReply: boolean | docode.CommentAuthorInformation = true;

		set canReply(state: boolean | docode.CommentAuthorInformation) {
			if (this._canReply !== state) {
				this._canReply = state;
				this.modifications.canReply = state;
				this._onDidUpdateCommentThread.fire();
			}
		}
		get canReply() {
			return this._canReply;
		}

		private _label: string | undefined;

		get label(): string | undefined {
			return this._label;
		}

		set label(label: string | undefined) {
			this._label = label;
			this.modifications.label = label;
			this._onDidUpdateCommentThread.fire();
		}

		private _contextValue: string | undefined;

		get contextValue(): string | undefined {
			return this._contextValue;
		}

		set contextValue(context: string | undefined) {
			this._contextValue = context;
			this.modifications.contextValue = context;
			this._onDidUpdateCommentThread.fire();
		}

		get comments(): docode.Comment[] {
			return this._comments;
		}

		set comments(newComments: docode.Comment[]) {
			this._comments = newComments;
			this.modifications.comments = newComments;
			this._onDidUpdateCommentThread.fire();
		}

		private _collapseState?: docode.CommentThreadCollapsibleState;

		get collapsibleState(): docode.CommentThreadCollapsibleState {
			return this._collapseState!;
		}

		set collapsibleState(newState: docode.CommentThreadCollapsibleState) {
			if (this._collapseState === newState) {
				return;
			}
			this._collapseState = newState;
			this.modifications.collapsibleState = newState;
			this._onDidUpdateCommentThread.fire();
		}

		private _state?: docode.CommentThreadState | { resolved?: docode.CommentThreadState; applicability?: docode.CommentThreadApplicability };

		get state(): docode.CommentThreadState | { resolved?: docode.CommentThreadState; applicability?: docode.CommentThreadApplicability } | undefined {
			return this._state!;
		}

		set state(newState: docode.CommentThreadState | { resolved?: docode.CommentThreadState; applicability?: docode.CommentThreadApplicability }) {
			this._state = newState;
			if (typeof newState === 'object') {
				checkProposedApiEnabled(this.extensionDescription, 'commentThreadApplicability');
				this.modifications.state = newState.resolved;
				this.modifications.applicability = newState.applicability;
			} else {
				this.modifications.state = newState;
			}
			this._onDidUpdateCommentThread.fire();
		}

		private _localDisposables: types.Disposable[];

		private _isDiposed: boolean;

		public get isDisposed(): boolean {
			return this._isDiposed;
		}

		private _commentsMap: Map<docode.Comment, number> = new Map<docode.Comment, number>();

		private readonly _acceptInputDisposables = new MutableDisposable<DisposableStore>();

		readonly value: docode.CommentThread2;

		constructor(
			commentControllerId: string,
			private _commentControllerHandle: number,
			private _id: string | undefined,
			private _uri: docode.Uri,
			private _range: docode.Range | undefined,
			private _comments: docode.Comment[],
			public readonly extensionDescription: IExtensionDescription,
			private _isTemplate: boolean,
			onDidDispose: () => void,
			editorId?: string
		) {
			this._acceptInputDisposables.value = new DisposableStore();

			if (this._id === undefined) {
				this._id = `${commentControllerId}.${this.handle}`;
			}

			proxy.$createCommentThread(
				_commentControllerHandle,
				this.handle,
				this._id,
				this._uri,
				extHostTypeConverter.Range.from(this._range),
				this._comments.map(cmt => convertToDTOComment(this, cmt, this._commentsMap, this.extensionDescription)),
				extensionDescription.identifier,
				this._isTemplate,
				editorId
			);

			this._localDisposables = [new types.Disposable(onDidDispose)];
			this._isDiposed = false;

			this._localDisposables.push(this.onDidUpdateCommentThread(() => {
				this.eventuallyUpdateCommentThread();
			}));

			this._localDisposables.push({
				dispose: () => {
					proxy.$deleteCommentThread(
						_commentControllerHandle,
						this.handle
					);
				}
			});

			const that = this;
			this.value = {
				get uri() { return that.uri; },
				get range() { return that.range; },
				set range(value: docode.Range | undefined) { that.range = value; },
				get comments() { return that.comments; },
				set comments(value: docode.Comment[]) { that.comments = value; },
				get collapsibleState() { return that.collapsibleState; },
				set collapsibleState(value: docode.CommentThreadCollapsibleState) { that.collapsibleState = value; },
				get canReply() { return that.canReply; },
				set canReply(state: boolean | docode.CommentAuthorInformation) { that.canReply = state; },
				get contextValue() { return that.contextValue; },
				set contextValue(value: string | undefined) { that.contextValue = value; },
				get label() { return that.label; },
				set label(value: string | undefined) { that.label = value; },
				get state(): docode.CommentThreadState | { resolved?: docode.CommentThreadState; applicability?: docode.CommentThreadApplicability } | undefined { return that.state; },
				set state(value: docode.CommentThreadState | { resolved?: docode.CommentThreadState; applicability?: docode.CommentThreadApplicability }) { that.state = value; },
				reveal: (comment?: docode.Comment | docode.CommentThreadRevealOptions, options?: docode.CommentThreadRevealOptions) => that.reveal(comment, options),
				hide: () => that.hide(),
				dispose: () => {
					that.dispose();
				}
			};
		}

		private updateIsTemplate() {
			if (this._isTemplate) {
				this._isTemplate = false;
				this.modifications.isTemplate = false;
			}
		}

		@debounce(100)
		eventuallyUpdateCommentThread(): void {
			if (this._isDiposed) {
				return;
			}
			this.updateIsTemplate();

			if (!this._acceptInputDisposables.value) {
				this._acceptInputDisposables.value = new DisposableStore();
			}

			const modified = (value: keyof CommentThreadModification): boolean =>
				Object.prototype.hasOwnProperty.call(this.modifications, value);

			const formattedModifications: CommentThreadChanges = {};
			if (modified('range')) {
				formattedModifications.range = extHostTypeConverter.Range.from(this._range);
			}
			if (modified('label')) {
				formattedModifications.label = this.label;
			}
			if (modified('contextValue')) {
				/*
				 * null -> cleared contextValue
				 * undefined -> no change
				 */
				formattedModifications.contextValue = this.contextValue ?? null;
			}
			if (modified('comments')) {
				formattedModifications.comments =
					this._comments.map(cmt => convertToDTOComment(this, cmt, this._commentsMap, this.extensionDescription));
			}
			if (modified('collapsibleState')) {
				formattedModifications.collapseState = convertToCollapsibleState(this._collapseState);
			}
			if (modified('canReply')) {
				formattedModifications.canReply = this.canReply;
			}
			if (modified('state')) {
				formattedModifications.state = convertToState(this._state);
			}
			if (modified('applicability')) {
				formattedModifications.applicability = convertToRelevance(this._state);
			}
			if (modified('isTemplate')) {
				formattedModifications.isTemplate = this._isTemplate;
			}
			this.modifications = {};

			proxy.$updateCommentThread(
				this._commentControllerHandle,
				this.handle,
				this._id!,
				this._uri,
				formattedModifications
			);
		}

		getCommentByUniqueId(uniqueId: number): docode.Comment | undefined {
			for (const key of this._commentsMap) {
				const comment = key[0];
				const id = key[1];
				if (uniqueId === id) {
					return comment;
				}
			}

			return;
		}

		async reveal(commentOrOptions?: docode.Comment | docode.CommentThreadRevealOptions, options?: docode.CommentThreadRevealOptions): Promise<void> {
			checkProposedApiEnabled(this.extensionDescription, 'commentReveal');
			let comment: docode.Comment | undefined;
			if (commentOrOptions && (commentOrOptions as docode.Comment).body !== undefined) {
				comment = commentOrOptions as docode.Comment;
			} else {
				options = options ?? commentOrOptions as docode.CommentThreadRevealOptions;
			}
			let commentToReveal = comment ? this._commentsMap.get(comment) : undefined;
			commentToReveal ??= this._commentsMap.get(this._comments[0])!;
			let preserveFocus: boolean = true;
			let focusReply: boolean = false;
			if (options?.focus === types.CommentThreadFocus.Reply) {
				focusReply = true;
				preserveFocus = false;
			} else if (options?.focus === types.CommentThreadFocus.Comment) {
				preserveFocus = false;
			}
			return proxy.$revealCommentThread(this._commentControllerHandle, this.handle, commentToReveal, { preserveFocus, focusReply });
		}

		async hide(): Promise<void> {
			return proxy.$hideCommentThread(this._commentControllerHandle, this.handle);
		}

		dispose() {
			if (this._isDiposed) {
				return;
			}
			this._isDiposed = true;
			this._acceptInputDisposables.dispose();
			this._onDidUpdateCommentThread.dispose();
			this._localDisposables.forEach(disposable => disposable.dispose());
		}
	}

	type ReactionHandler = (comment: docode.Comment, reaction: docode.CommentReaction) => Promise<void>;

	class ExtHostCommentController {
		get id(): string {
			return this._id;
		}

		get label(): string {
			return this._label;
		}

		public get handle(): number {
			return this._handle;
		}

		private _threads: Map<number, ExtHostCommentThread> = new Map<number, ExtHostCommentThread>();

		private _commentingRangeProvider?: docode.CommentingRangeProvider;
		get commentingRangeProvider(): docode.CommentingRangeProvider | undefined {
			return this._commentingRangeProvider;
		}

		set commentingRangeProvider(provider: docode.CommentingRangeProvider | undefined) {
			this._commentingRangeProvider = provider;
			if (provider?.resourceHints) {
				checkProposedApiEnabled(this._extension, 'commentingRangeHint');
			}
			proxy.$updateCommentingRanges(this.handle, provider?.resourceHints);
		}

		private _reactionHandler?: ReactionHandler;

		get reactionHandler(): ReactionHandler | undefined {
			return this._reactionHandler;
		}

		set reactionHandler(handler: ReactionHandler | undefined) {
			this._reactionHandler = handler;

			proxy.$updateCommentControllerFeatures(this.handle, { reactionHandler: !!handler });
		}

		private _options: languages.CommentOptions | undefined;

		get options() {
			return this._options;
		}

		set options(options: languages.CommentOptions | undefined) {
			this._options = options;

			proxy.$updateCommentControllerFeatures(this.handle, { options: this._options });
		}

		private _activeComment: docode.Comment | undefined;

		get activeComment(): docode.Comment | undefined {
			checkProposedApiEnabled(this._extension, 'activeComment');
			return this._activeComment;
		}

		private _activeThread: ExtHostCommentThread | undefined;

		get activeCommentThread(): docode.CommentThread2 | undefined {
			checkProposedApiEnabled(this._extension, 'activeComment');
			return this._activeThread?.value;
		}

		private _localDisposables: types.Disposable[];
		readonly value: docode.CommentController;

		constructor(
			private _extension: IExtensionDescription,
			private _handle: number,
			private _id: string,
			private _label: string,
			onDidDispose: () => void
		) {
			proxy.$registerCommentController(this.handle, _id, _label, this._extension.identifier.value);

			const that = this;
			this.value = Object.freeze({
				id: that.id,
				label: that.label,
				get options() { return that.options; },
				set options(options: docode.CommentOptions | undefined) { that.options = options; },
				get commentingRangeProvider(): docode.CommentingRangeProvider | undefined { return that.commentingRangeProvider; },
				set commentingRangeProvider(commentingRangeProvider: docode.CommentingRangeProvider | undefined) { that.commentingRangeProvider = commentingRangeProvider; },
				get reactionHandler(): ReactionHandler | undefined { return that.reactionHandler; },
				set reactionHandler(handler: ReactionHandler | undefined) { that.reactionHandler = handler; },
				// get activeComment(): docode.Comment | undefined { return that.activeComment; },
				get activeCommentThread(): docode.CommentThread | undefined { return that.activeCommentThread as docode.CommentThread | undefined; },
				createCommentThread(uri: docode.Uri, range: docode.Range | undefined, comments: docode.Comment[]): docode.CommentThread {
					return that.createCommentThread(uri, range, comments).value as docode.CommentThread;
				},
				dispose: () => { that.dispose(); },
			});

			this._localDisposables = [];
			this._localDisposables.push({
				dispose: () => {
					proxy.$unregisterCommentController(this.handle);
				}
			});
			this._localDisposables.push({ dispose: onDidDispose });
		}

		createCommentThread(resource: docode.Uri, range: docode.Range | undefined, comments: docode.Comment[]): ExtHostCommentThread {
			const commentThread = new ExtHostCommentThread(this.id, this.handle, undefined, resource, range, comments, this._extension, false, () => {
				this._threads.delete(commentThread.handle);
			});
			this._threads.set(commentThread.handle, commentThread);
			return commentThread;
		}

		$setActiveComment(commentInfo: { commentThreadHandle: number; uniqueIdInThread?: number } | undefined) {
			if (!commentInfo) {
				this._activeComment = undefined;
				this._activeThread = undefined;
				return;
			}
			const thread = this._threads.get(commentInfo.commentThreadHandle);
			if (thread) {
				this._activeComment = commentInfo.uniqueIdInThread ? thread.getCommentByUniqueId(commentInfo.uniqueIdInThread) : undefined;
				this._activeThread = thread;
			}
		}

		$createCommentThreadTemplate(uriComponents: UriComponents, range: IRange | undefined, editorId?: string): ExtHostCommentThread {
			const commentThread = new ExtHostCommentThread(this.id, this.handle, undefined, URI.revive(uriComponents), extHostTypeConverter.Range.to(range), [], this._extension, true, () => {
				this._threads.delete(commentThread.handle);
			}, editorId);
			commentThread.collapsibleState = languages.CommentThreadCollapsibleState.Expanded;
			this._threads.set(commentThread.handle, commentThread);
			return commentThread;
		}

		$updateCommentThreadTemplate(threadHandle: number, range: IRange): void {
			const thread = this._threads.get(threadHandle);
			if (thread) {
				thread.range = extHostTypeConverter.Range.to(range);
			}
		}

		$updateCommentThread(threadHandle: number, changes: CommentThreadChanges): void {
			const thread = this._threads.get(threadHandle);
			if (!thread) {
				return;
			}

			const modified = (value: keyof CommentThreadChanges): boolean =>
				Object.prototype.hasOwnProperty.call(changes, value);

			if (modified('collapseState')) {
				thread.collapsibleState = convertToCollapsibleState(changes.collapseState);
			}
		}

		$deleteCommentThread(threadHandle: number): void {
			const thread = this._threads.get(threadHandle);

			thread?.dispose();

			this._threads.delete(threadHandle);
		}

		getCommentThread(handle: number): ExtHostCommentThread | undefined {
			return this._threads.get(handle);
		}

		dispose(): void {
			this._threads.forEach(value => {
				value.dispose();
			});

			this._localDisposables.forEach(disposable => disposable.dispose());
		}
	}

	function convertToDTOComment(thread: ExtHostCommentThread, docodeComment: docode.Comment, commentsMap: Map<docode.Comment, number>, extension: IExtensionDescription): CommentChanges {
		let commentUniqueId = commentsMap.get(docodeComment)!;
		if (!commentUniqueId) {
			commentUniqueId = ++thread.commentHandle;
			commentsMap.set(docodeComment, commentUniqueId);
		}

		if (docodeComment.state !== undefined) {
			checkProposedApiEnabled(extension, 'commentsDraftState');
		}

		if (docodeComment.reactions?.some(reaction => reaction.reactors !== undefined)) {
			checkProposedApiEnabled(extension, 'commentReactor');
		}

		return {
			mode: docodeComment.mode,
			contextValue: docodeComment.contextValue,
			uniqueIdInThread: commentUniqueId,
			body: (typeof docodeComment.body === 'string') ? docodeComment.body : extHostTypeConverter.MarkdownString.from(docodeComment.body),
			userName: docodeComment.author.name,
			userIconPath: docodeComment.author.iconPath,
			label: docodeComment.label,
			commentReactions: docodeComment.reactions ? docodeComment.reactions.map(reaction => convertToReaction(reaction)) : undefined,
			state: docodeComment.state,
			timestamp: docodeComment.timestamp?.toJSON()
		};
	}

	function convertToReaction(reaction: docode.CommentReaction): languages.CommentReaction {
		return {
			label: reaction.label,
			iconPath: reaction.iconPath ? extHostTypeConverter.pathOrURIToURI(reaction.iconPath) : undefined,
			count: reaction.count,
			hasReacted: reaction.authorHasReacted,
			reactors: ((reaction.reactors && (reaction.reactors.length > 0) && (typeof reaction.reactors[0] !== 'string')) ? (reaction.reactors as languages.CommentAuthorInformation[]).map(reactor => reactor.name) : reaction.reactors) as string[]
		};
	}

	function convertFromReaction(reaction: languages.CommentReaction): docode.CommentReaction {
		return {
			label: reaction.label || '',
			count: reaction.count || 0,
			iconPath: reaction.iconPath ? URI.revive(reaction.iconPath) : '',
			authorHasReacted: reaction.hasReacted || false,
			reactors: reaction.reactors?.map(reactor => ({ name: reactor }))
		};
	}

	function convertToCollapsibleState(kind: docode.CommentThreadCollapsibleState | undefined): languages.CommentThreadCollapsibleState {
		if (kind !== undefined) {
			switch (kind) {
				case types.CommentThreadCollapsibleState.Expanded:
					return languages.CommentThreadCollapsibleState.Expanded;
				case types.CommentThreadCollapsibleState.Collapsed:
					return languages.CommentThreadCollapsibleState.Collapsed;
			}
		}
		return languages.CommentThreadCollapsibleState.Collapsed;
	}

	function convertToState(kind: docode.CommentThreadState | { resolved?: docode.CommentThreadState; applicability?: docode.CommentThreadApplicability } | undefined): languages.CommentThreadState {
		let resolvedKind: docode.CommentThreadState | undefined;
		if (typeof kind === 'object') {
			resolvedKind = kind.resolved;
		} else {
			resolvedKind = kind;
		}

		if (resolvedKind !== undefined) {
			switch (resolvedKind) {
				case types.CommentThreadState.Unresolved:
					return languages.CommentThreadState.Unresolved;
				case types.CommentThreadState.Resolved:
					return languages.CommentThreadState.Resolved;
			}
		}
		return languages.CommentThreadState.Unresolved;
	}

	function convertToRelevance(kind: docode.CommentThreadState | { resolved?: docode.CommentThreadState; applicability?: docode.CommentThreadApplicability } | undefined): languages.CommentThreadApplicability {
		let applicabilityKind: docode.CommentThreadApplicability | undefined = undefined;
		if (typeof kind === 'object') {
			applicabilityKind = kind.applicability;
		}

		if (applicabilityKind !== undefined) {
			switch (applicabilityKind) {
				case types.CommentThreadApplicability.Current:
					return languages.CommentThreadApplicability.Current;
				case types.CommentThreadApplicability.Outdated:
					return languages.CommentThreadApplicability.Outdated;
			}
		}
		return languages.CommentThreadApplicability.Current;
	}

	return new ExtHostCommentsImpl();
}
