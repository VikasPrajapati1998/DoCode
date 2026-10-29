/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as docode from 'docode';
import { MdLanguageClient } from './client/client';
import { CommandManager } from './commandManager';
import { registerMarkdownCommands } from './commands/index';
import { registerPasteUrlSupport } from './languageFeatures/copyFiles/pasteUrlProvider';
import { registerResourceDropOrPasteSupport } from './languageFeatures/copyFiles/dropOrPasteResource';
import { registerDiagnosticSupport } from './languageFeatures/diagnostics';
import { registerFindFileReferenceSupport } from './languageFeatures/fileReferences';
import { registerUpdateLinksOnRename } from './languageFeatures/linkUpdater';
import { ILogger } from './logging';
import { IMdParser, MarkdownItEngine } from './markdownEngine';
import { MarkdownContributionProvider } from './markdownExtensions';
import { MarkdownEditorProvider } from './preview/markdownEditorProvider';
import { createSharedLinkPresentationService, registerLinkPresentationProvider } from './preview/linkPresentation/linkPresentationService';
import { MdDocumentRenderer } from './preview/documentRenderer';
import { MarkdownPreviewManager } from './preview/previewManager';
import { ExtensionContentSecurityPolicyArbiter } from './preview/security';
import { loadDefaultTelemetryReporter } from './telemetryReporter';
import { MdLinkOpener } from './util/openDocumentLink';
import { registerUpdatePastedLinks } from './languageFeatures/updateLinksOnPaste';
import { markdownLanguageIds } from './util/file';

export function activateShared(
	context: docode.ExtensionContext,
	client: MdLanguageClient,
	engine: MarkdownItEngine,
	logger: ILogger,
	contributions: MarkdownContributionProvider,
) {
	const telemetryReporter = loadDefaultTelemetryReporter();
	context.subscriptions.push(telemetryReporter);

	const cspArbiter = new ExtensionContentSecurityPolicyArbiter(context.globalState, context.workspaceState);
	const commandManager = new CommandManager();

	const opener = new MdLinkOpener(client);

	const contentProvider = new MdDocumentRenderer(engine, context, cspArbiter, contributions, logger);
	const previewManager = new MarkdownPreviewManager(contentProvider, logger, contributions, opener, context.workspaceState);
	context.subscriptions.push(previewManager);

	context.subscriptions.push(registerMarkdownLanguageFeatures(client, commandManager, engine));
	context.subscriptions.push(registerMarkdownCommands(commandManager, previewManager, telemetryReporter, cspArbiter, engine));

	const linkPresentationService = createSharedLinkPresentationService(logger);
	context.subscriptions.push(
		linkPresentationService,
		registerLinkPresentationProvider(linkPresentationService),
		docode.window.onDidChangeWindowState(event => {
			if (event.focused) {
				linkPresentationService.refresh();
			}
		}),
	);

	const markdownEditorProvider = new MarkdownEditorProvider(
		context.extensionUri,
		context.globalState,
		opener,
		contributions,
		logger,
		(href, fromResource) => linkPresentationService.openLink(href, fromResource),
	);
	context.subscriptions.push(markdownEditorProvider);
	context.subscriptions.push(registerMarkdownEditorCommands(context, markdownEditorProvider));
	context.subscriptions.push(docode.window.registerCustomEditorProvider(
		MarkdownEditorProvider.viewType,
		markdownEditorProvider,
		{
			webviewOptions: { retainContextWhenHidden: true },
			supportsMultipleEditorsPerDocument: true,
		}));

	context.subscriptions.push(docode.workspace.onDidChangeConfiguration(() => {
		previewManager.updateConfiguration();
	}));
}

function registerMarkdownEditorCommands(
	context: docode.ExtensionContext,
	provider: MarkdownEditorProvider,
): docode.Disposable {
	const contributions = context.extension.packageJSON.contributes as {
		readonly commands?: readonly {
			readonly command?: unknown;
			readonly $generated?: unknown;
		}[];
	} | undefined;
	const registrations = (contributions?.commands ?? [])
		.filter(command => command.$generated === true)
		.map(command => {
			const commandId = command.command;
			if (typeof commandId !== 'string') {
				throw new TypeError('Generated Markdown editor command is missing its command identifier.');
			}
			return docode.commands.registerCommand(commandId, () => provider.executeCommand(commandId));
		});
	return docode.Disposable.from(...registrations,
		docode.commands.registerCommand('markdown.editor.rename', () => provider.executeCommand('markdown.editor.rename')),
		docode.commands.registerCommand('markdown.editor.triggerSuggest', () => provider.executeCommand('markdown.editor.triggerSuggest')));
}

function registerMarkdownLanguageFeatures(
	client: MdLanguageClient,
	commandManager: CommandManager,
	parser: IMdParser,
): docode.Disposable {
	const selector: docode.DocumentSelector = markdownLanguageIds;
	return docode.Disposable.from(
		// Language features
		registerDiagnosticSupport(selector, commandManager),
		registerFindFileReferenceSupport(commandManager, client),
		registerResourceDropOrPasteSupport(selector, parser),
		registerPasteUrlSupport(selector, parser),
		registerUpdateLinksOnRename(client),
		registerUpdatePastedLinks(selector, client),
	);
}
