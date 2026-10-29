/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as docode from 'docode';
import * as interfaces from './interfaces';


export default class MergeDecorator implements docode.Disposable {

	private decorations: { [key: string]: docode.TextEditorDecorationType } = {};

	private decorationUsesWholeLine: boolean = true; // Useful for debugging, set to false to see exact match ranges

	private config?: interfaces.IExtensionConfiguration;
	private tracker: interfaces.IDocumentMergeConflictTracker;
	private updating = new Map<docode.TextEditor, boolean>();

	constructor(private context: docode.ExtensionContext, trackerService: interfaces.IDocumentMergeConflictTrackerService) {
		this.tracker = trackerService.createTracker('decorator');
	}

	begin(config: interfaces.IExtensionConfiguration) {
		this.config = config;
		this.registerDecorationTypes(config);

		// Check if we already have a set of active windows, attempt to track these.
		docode.window.visibleTextEditors.forEach(e => this.applyDecorations(e));

		docode.workspace.onDidOpenTextDocument(event => {
			this.applyDecorationsFromEvent(event);
		}, null, this.context.subscriptions);

		docode.workspace.onDidChangeTextDocument(event => {
			this.applyDecorationsFromEvent(event.document);
		}, null, this.context.subscriptions);

		docode.window.onDidChangeVisibleTextEditors((e) => {
			// Any of which could be new (not just the active one).
			e.forEach(e => this.applyDecorations(e));
		}, null, this.context.subscriptions);
	}

	configurationUpdated(config: interfaces.IExtensionConfiguration) {
		this.config = config;
		this.registerDecorationTypes(config);

		// Re-apply the decoration
		docode.window.visibleTextEditors.forEach(e => {
			this.removeDecorations(e);
			this.applyDecorations(e);
		});
	}

	private registerDecorationTypes(config: interfaces.IExtensionConfiguration) {

		// Dispose of existing decorations
		Object.keys(this.decorations).forEach(k => this.decorations[k].dispose());
		this.decorations = {};

		// None of our features are enabled
		if (!config.enableDecorations || !config.enableEditorOverview) {
			return;
		}

		// Create decorators
		if (config.enableDecorations || config.enableEditorOverview) {
			this.decorations['current.content'] = docode.window.createTextEditorDecorationType(
				this.generateBlockRenderOptions('merge.currentContentBackground', 'editorOverviewRuler.currentContentForeground', config)
			);

			this.decorations['incoming.content'] = docode.window.createTextEditorDecorationType(
				this.generateBlockRenderOptions('merge.incomingContentBackground', 'editorOverviewRuler.incomingContentForeground', config)
			);

			this.decorations['commonAncestors.content'] = docode.window.createTextEditorDecorationType(
				this.generateBlockRenderOptions('merge.commonContentBackground', 'editorOverviewRuler.commonContentForeground', config)
			);
		}

		if (config.enableDecorations) {
			this.decorations['current.header'] = docode.window.createTextEditorDecorationType({
				isWholeLine: this.decorationUsesWholeLine,
				backgroundColor: new docode.ThemeColor('merge.currentHeaderBackground'),
				color: new docode.ThemeColor('editor.foreground'),
				outlineStyle: 'solid',
				outlineWidth: '1pt',
				outlineColor: new docode.ThemeColor('merge.border'),
				after: {
					contentText: ' ' + docode.l10n.t("(Current Change)"),
					color: new docode.ThemeColor('descriptionForeground')
				}
			});

			this.decorations['commonAncestors.header'] = docode.window.createTextEditorDecorationType({
				isWholeLine: this.decorationUsesWholeLine,
				backgroundColor: new docode.ThemeColor('merge.commonHeaderBackground'),
				color: new docode.ThemeColor('editor.foreground'),
				outlineStyle: 'solid',
				outlineWidth: '1pt',
				outlineColor: new docode.ThemeColor('merge.border')
			});

			this.decorations.splitter = docode.window.createTextEditorDecorationType({
				color: new docode.ThemeColor('editor.foreground'),
				outlineStyle: 'solid',
				outlineWidth: '1pt',
				outlineColor: new docode.ThemeColor('merge.border'),
				isWholeLine: this.decorationUsesWholeLine,
			});

			this.decorations['incoming.header'] = docode.window.createTextEditorDecorationType({
				backgroundColor: new docode.ThemeColor('merge.incomingHeaderBackground'),
				color: new docode.ThemeColor('editor.foreground'),
				outlineStyle: 'solid',
				outlineWidth: '1pt',
				outlineColor: new docode.ThemeColor('merge.border'),
				isWholeLine: this.decorationUsesWholeLine,
				after: {
					contentText: ' ' + docode.l10n.t("(Incoming Change)"),
					color: new docode.ThemeColor('descriptionForeground')
				}
			});
		}
	}

	dispose() {

		// TODO: Replace with Map<string, T>
		Object.keys(this.decorations).forEach(name => {
			this.decorations[name].dispose();
		});

		this.decorations = {};
	}

	private generateBlockRenderOptions(backgroundColor: string, overviewRulerColor: string, config: interfaces.IExtensionConfiguration): docode.DecorationRenderOptions {

		const renderOptions: docode.DecorationRenderOptions = {};

		if (config.enableDecorations) {
			renderOptions.backgroundColor = new docode.ThemeColor(backgroundColor);
			renderOptions.isWholeLine = this.decorationUsesWholeLine;
		}

		if (config.enableEditorOverview) {
			renderOptions.overviewRulerColor = new docode.ThemeColor(overviewRulerColor);
			renderOptions.overviewRulerLane = docode.OverviewRulerLane.Full;
		}

		return renderOptions;
	}

	private applyDecorationsFromEvent(eventDocument: docode.TextDocument) {
		for (const editor of docode.window.visibleTextEditors) {
			if (editor.document === eventDocument) {
				// Attempt to apply
				this.applyDecorations(editor);
			}
		}
	}

	private async applyDecorations(editor: docode.TextEditor) {
		if (!editor || !editor.document) { return; }

		if (!this.config || (!this.config.enableDecorations && !this.config.enableEditorOverview)) {
			return;
		}

		// If we have a pending scan from the same origin, exit early. (Cannot use this.tracker.isPending() because decorations are per editor.)
		if (this.updating.get(editor)) {
			return;
		}

		try {
			this.updating.set(editor, true);

			const conflicts = await this.tracker.getConflicts(editor.document);
			if (docode.window.visibleTextEditors.indexOf(editor) === -1) {
				return;
			}

			if (conflicts.length === 0) {
				this.removeDecorations(editor);
				return;
			}

			// Store decorations keyed by the type of decoration, set decoration wants a "style"
			// to go with it, which will match this key (see constructor);
			const matchDecorations: { [key: string]: docode.Range[] } = {};

			const pushDecoration = (key: string, d: docode.Range) => {
				matchDecorations[key] = matchDecorations[key] || [];
				matchDecorations[key].push(d);
			};

			conflicts.forEach(conflict => {
				// TODO, this could be more effective, just call getMatchPositions once with a map of decoration to position
				if (!conflict.current.decoratorContent.isEmpty) {
					pushDecoration('current.content', conflict.current.decoratorContent);
				}
				if (!conflict.incoming.decoratorContent.isEmpty) {
					pushDecoration('incoming.content', conflict.incoming.decoratorContent);
				}

				conflict.commonAncestors.forEach(commonAncestorsRegion => {
					if (!commonAncestorsRegion.decoratorContent.isEmpty) {
						pushDecoration('commonAncestors.content', commonAncestorsRegion.decoratorContent);
					}
				});

				if (this.config!.enableDecorations) {
					pushDecoration('current.header', conflict.current.header);
					pushDecoration('splitter', conflict.splitter);
					pushDecoration('incoming.header', conflict.incoming.header);

					conflict.commonAncestors.forEach(commonAncestorsRegion => {
						pushDecoration('commonAncestors.header', commonAncestorsRegion.header);
					});
				}
			});

			// For each match we've generated, apply the generated decoration with the matching decoration type to the
			// editor instance. Keys in both matches and decorations should match.
			Object.keys(matchDecorations).forEach(decorationKey => {
				const decorationType = this.decorations[decorationKey];

				if (decorationType) {
					editor.setDecorations(decorationType, matchDecorations[decorationKey]);
				}
			});

		} finally {
			this.updating.delete(editor);
		}
	}

	private removeDecorations(editor: docode.TextEditor) {
		// Remove all decorations, there might be none
		Object.keys(this.decorations).forEach(decorationKey => {

			// Race condition, while editing the settings, it's possible to
			// generate regions before the configuration has been refreshed
			const decorationType = this.decorations[decorationKey];

			if (decorationType) {
				editor.setDecorations(decorationType, []);
			}
		});
	}
}
