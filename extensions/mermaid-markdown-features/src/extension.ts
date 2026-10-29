/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as docode from 'docode';
import { registerChatSupport } from './chatOutputRenderer';
import { MermaidEditorManager } from './editorManager';
import { configSection, injectMermaidConfig } from './markdownMermaid/config';
import { extendMarkdownItWithMermaid } from './markdownMermaid/markdownIt';
import { MermaidCommandContext, MermaidWebviewManager } from './webviewManager';
import type MarkdownIt from 'markdown-it';

export function activate(context: docode.ExtensionContext) {
	const webviewManager = new MermaidWebviewManager();

	const editorManager = new MermaidEditorManager(context.extensionUri, webviewManager);
	context.subscriptions.push(editorManager);

	// Register chat support
	context.subscriptions.push(registerChatSupport(context, webviewManager, editorManager));

	// Register commands
	context.subscriptions.push(
		docode.commands.registerCommand('_mermaid-markdown.resetPanZoom', (ctx?: { mermaidWebviewId?: string }) => {
			webviewManager.resetPanZoom(ctx?.mermaidWebviewId);
		})
	);

	context.subscriptions.push(
		docode.commands.registerCommand('_mermaid-markdown.copySource', (ctx?: MermaidCommandContext) => {
			if (typeof ctx?.mermaidSource === 'string') {
				void docode.env.clipboard.writeText(ctx.mermaidSource);
				return;
			}

			const webviewInfo = ctx?.mermaidWebviewId ? webviewManager.getWebview(ctx.mermaidWebviewId) : webviewManager.activeWebview;
			if (webviewInfo) {
				void docode.env.clipboard.writeText(webviewInfo.mermaidSource);
			}
		})
	);

	context.subscriptions.push(docode.workspace.onDidChangeConfiguration(e => {
		if (e.affectsConfiguration(`${configSection}.languages`)) {
			void docode.commands.executeCommand('markdown.api.reloadPlugins');
		}
		if (e.affectsConfiguration(configSection) || e.affectsConfiguration('workbench.colorTheme')) {
			void docode.commands.executeCommand('markdown.preview.refresh');
		}
	}));

	return {
		extendMarkdownIt(md: MarkdownIt) {
			extendMarkdownItWithMermaid(md, {
				languageIds: () => docode.workspace.getConfiguration(configSection).get<readonly string[]>('languages', ['mermaid'])
			});
			md.use(injectMermaidConfig);
			return md;
		}
	};
}
