/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as docode from 'docode';
import { EditorHighlights } from './highlights';
import { Navigation } from './navigation';
import { SymbolItemDragAndDrop, SymbolTreeInput } from './references-view';
import { ContextKey, isValidRequestPosition, WordAnchor } from './utils';


export class SymbolsTree {

	readonly viewId = 'references-view.tree';

	private readonly _ctxIsActive = new ContextKey<boolean>('reference-list.isActive');
	private readonly _ctxHasResult = new ContextKey<boolean>('reference-list.hasResult');
	private readonly _ctxInputSource = new ContextKey<string>('reference-list.source');

	private readonly _history = new TreeInputHistory(this);
	private readonly _provider = new TreeDataProviderDelegate();
	private readonly _dnd = new TreeDndDelegate();
	private readonly _tree: docode.TreeView<unknown>;
	private readonly _navigation: Navigation;

	private _input?: SymbolTreeInput<unknown>;
	private _sessionDisposable?: docode.Disposable;

	constructor() {
		this._tree = docode.window.createTreeView<unknown>(this.viewId, {
			treeDataProvider: this._provider,
			showCollapseAll: true,
			dragAndDropController: this._dnd
		});
		this._navigation = new Navigation(this._tree);
	}

	dispose(): void {
		this._history.dispose();
		this._tree.dispose();
		this._sessionDisposable?.dispose();
	}

	getInput(): SymbolTreeInput<unknown> | undefined {
		return this._input;
	}

	async setInput(input: SymbolTreeInput<unknown>) {

		if (!await isValidRequestPosition(input.location.uri, input.location.range.start)) {
			this.clearInput();
			return;
		}

		this._ctxInputSource.set(input.contextValue);
		this._ctxIsActive.set(true);
		this._ctxHasResult.set(true);
		docode.commands.executeCommand(`${this.viewId}.focus`);

		const newInputKind = !this._input || Object.getPrototypeOf(this._input) !== Object.getPrototypeOf(input);
		this._input = input;
		this._sessionDisposable?.dispose();

		this._tree.title = input.title;
		this._tree.message = newInputKind ? undefined : this._tree.message;

		const modelPromise = Promise.resolve(input.resolve());

		// set promise to tree data provider to trigger tree loading UI
		this._provider.update(modelPromise.then(model => model?.provider ?? this._history));
		this._dnd.update(modelPromise.then(model => model?.dnd));

		const model = await modelPromise;
		if (this._input !== input) {
			return;
		}

		if (!model) {
			this.clearInput();
			return;
		}

		this._history.add(input);
		this._tree.message = model.message;

		// navigation
		this._navigation.update(model.navigation);

		// reveal & select
		const selection = model.navigation?.nearest(input.location.uri, input.location.range.start);
		if (selection && this._tree.visible) {
			await this._tree.reveal(selection, { select: true, focus: true, expand: true });
		}

		const disposables: docode.Disposable[] = [];

		// editor highlights
		let highlights: EditorHighlights<unknown> | undefined;
		if (model.highlights) {
			highlights = new EditorHighlights(this._tree, model.highlights);
			disposables.push(highlights);
		}

		// listener
		if (model.provider.onDidChangeTreeData) {
			disposables.push(model.provider.onDidChangeTreeData(() => {
				this._tree.title = input.title;
				this._tree.message = model.message;
				highlights?.update();
			}));
		}
		if (typeof model.dispose === 'function') {
			disposables.push(new docode.Disposable(() => model.dispose!()));
		}
		this._sessionDisposable = docode.Disposable.from(...disposables);
	}

	clearInput(): void {
		this._sessionDisposable?.dispose();
		this._input = undefined;
		this._ctxHasResult.set(false);
		this._ctxInputSource.reset();
		this._tree.title = docode.l10n.t('References');
		this._tree.message = this._history.size === 0
			? docode.l10n.t('No results.')
			: docode.l10n.t('No results. Try running a previous search again:');
		this._provider.update(Promise.resolve(this._history));
	}
}

// --- tree data

interface ActiveTreeDataProviderWrapper {
	provider: Promise<docode.TreeDataProvider<any>>;
}

class TreeDataProviderDelegate implements docode.TreeDataProvider<undefined> {

	provider?: Promise<docode.TreeDataProvider<any>>;

	private _sessionDispoables?: docode.Disposable;
	private _onDidChange = new docode.EventEmitter<any>();

	readonly onDidChangeTreeData = this._onDidChange.event;

	update(provider: Promise<docode.TreeDataProvider<any>>) {

		this._sessionDispoables?.dispose();
		this._sessionDispoables = undefined;

		this._onDidChange.fire(undefined);

		this.provider = provider;

		provider.then(value => {
			if (this.provider === provider && value.onDidChangeTreeData) {
				this._sessionDispoables = value.onDidChangeTreeData(this._onDidChange.fire, this._onDidChange);
			}
		}).catch(err => {
			this.provider = undefined;
			console.error(err);
		});
	}

	async getTreeItem(element: unknown) {
		this._assertProvider();
		return (await this.provider).getTreeItem(element);
	}

	async getChildren(parent?: unknown | undefined) {
		this._assertProvider();
		return (await this.provider).getChildren(parent);
	}

	async getParent(element: unknown) {
		this._assertProvider();
		const provider = await this.provider;
		return provider.getParent ? provider.getParent(element) : undefined;
	}

	private _assertProvider(): asserts this is ActiveTreeDataProviderWrapper {
		if (!this.provider) {
			throw new Error('MISSING provider');
		}
	}
}

// --- tree dnd

class TreeDndDelegate implements docode.TreeDragAndDropController<undefined> {

	private _delegate: SymbolItemDragAndDrop<undefined> | undefined;

	readonly dropMimeTypes: string[] = [];

	readonly dragMimeTypes: string[] = ['text/uri-list'];

	update(delegate: Promise<SymbolItemDragAndDrop<unknown> | undefined>) {
		this._delegate = undefined;
		delegate.then(value => this._delegate = value);
	}

	handleDrag(source: undefined[], data: docode.DataTransfer) {
		if (this._delegate) {
			const urls: string[] = [];
			for (const item of source) {
				const uri = this._delegate.getDragUri(item);
				if (uri) {
					urls.push(uri.toString());
				}
			}
			if (urls.length > 0) {
				data.set('text/uri-list', new docode.DataTransferItem(urls.join('\r\n')));
			}
		}
	}

	handleDrop(): void | Thenable<void> {
		throw new Error('Method not implemented.');
	}
}

// --- history

class HistoryItem {

	readonly description: string;

	constructor(
		readonly key: string,
		readonly word: string,
		readonly anchor: WordAnchor,
		readonly input: SymbolTreeInput<unknown>,
	) {
		this.description = `${docode.workspace.asRelativePath(input.location.uri)} • ${input.title.toLocaleLowerCase()}`;
	}
}

class TreeInputHistory implements docode.TreeDataProvider<HistoryItem> {

	private readonly _onDidChangeTreeData = new docode.EventEmitter<HistoryItem | undefined>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

	private readonly _disposables: docode.Disposable[] = [];
	private readonly _ctxHasHistory = new ContextKey<boolean>('reference-list.hasHistory');
	private readonly _inputs = new Map<string, HistoryItem>();

	constructor(private readonly _tree: SymbolsTree) {

		this._disposables.push(
			docode.commands.registerCommand('references-view.clear', () => _tree.clearInput()),
			docode.commands.registerCommand('references-view.clearHistory', () => {
				this.clear();
				_tree.clearInput();
			}),
			docode.commands.registerCommand('references-view.refind', (item) => {
				if (item instanceof HistoryItem) {
					this._reRunHistoryItem(item);
				}
			}),
			docode.commands.registerCommand('references-view.refresh', () => {
				const item = Array.from(this._inputs.values()).pop();
				if (item) {
					this._reRunHistoryItem(item);
				}
			}),
			docode.commands.registerCommand('_references-view.showHistoryItem', async (item) => {
				if (item instanceof HistoryItem) {
					const position = item.anchor.guessedTrackedPosition() ?? item.input.location.range.start;
					await docode.commands.executeCommand('docode.open', item.input.location.uri, { selection: new docode.Range(position, position) });
				}
			}),
			docode.commands.registerCommand('references-view.pickFromHistory', async () => {
				interface HistoryPick extends docode.QuickPickItem {
					item: HistoryItem;
				}
				const entries = await this.getChildren();
				const picks = entries.map((item): HistoryPick => ({
					label: item.word,
					description: item.description,
					item
				}));
				const pick = await docode.window.showQuickPick(picks, { placeHolder: docode.l10n.t('Select previous reference search') });
				if (pick) {
					this._reRunHistoryItem(pick.item);
				}
			}),
		);
	}

	dispose(): void {
		docode.Disposable.from(...this._disposables).dispose();
		this._onDidChangeTreeData.dispose();
	}

	private _reRunHistoryItem(item: HistoryItem): void {
		this._inputs.delete(item.key);
		const newPosition = item.anchor.guessedTrackedPosition();
		let newInput = item.input;
		// create a new input when having a tracked position which is
		// different than the original position.
		if (newPosition && !item.input.location.range.start.isEqual(newPosition)) {
			newInput = item.input.with(new docode.Location(item.input.location.uri, newPosition));
		}
		this._tree.setInput(newInput);
	}

	async add(input: SymbolTreeInput<unknown>) {

		const doc = await docode.workspace.openTextDocument(input.location.uri);

		const anchor = new WordAnchor(doc, input.location.range.start);
		const range = doc.getWordRangeAtPosition(input.location.range.start) ?? doc.getWordRangeAtPosition(input.location.range.start, /[^\s]+/);
		const word = range ? doc.getText(range) : '???';

		const item = new HistoryItem(JSON.stringify([range?.start ?? input.location.range.start, input.location.uri, input.title]), word, anchor, input);
		// use filo-ordering of native maps
		this._inputs.delete(item.key);
		this._inputs.set(item.key, item);
		this._ctxHasHistory.set(true);
	}

	clear(): void {
		this._inputs.clear();
		this._ctxHasHistory.set(false);
		this._onDidChangeTreeData.fire(undefined);
	}

	get size() {
		return this._inputs.size;
	}

	// --- tree data provider

	getTreeItem(item: HistoryItem): docode.TreeItem {
		const result = new docode.TreeItem(item.word);
		result.description = item.description;
		result.command = { command: '_references-view.showHistoryItem', arguments: [item], title: docode.l10n.t('Rerun') };
		result.collapsibleState = docode.TreeItemCollapsibleState.None;
		result.contextValue = 'history-item';
		return result;
	}

	getChildren() {
		return Promise.all([...this._inputs.values()].reverse());
	}

	getParent() {
		return undefined;
	}
}
