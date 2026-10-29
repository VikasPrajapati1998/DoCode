/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as docode from 'docode';
import { SimpleBrowserManager } from './simpleBrowserManager';
import { SimpleBrowserView } from './simpleBrowserView';

declare class URL {
	constructor(input: string, base?: string | URL);
	hostname: string;
}

const openApiCommand = 'simpleBrowser.api.open';
const showCommand = 'simpleBrowser.show';
const integratedBrowserCommand = 'workbench.action.browser.open';

const enabledHosts = new Set<string>([
	'localhost',
	// localhost IPv4
	'127.0.0.1',
	// localhost IPv6
	'[0:0:0:0:0:0:0:1]',
	'[::1]',
	// all interfaces IPv4
	'0.0.0.0',
	// all interfaces IPv6
	'[0:0:0:0:0:0:0:0]',
	'[::]'
]);

const openerId = 'simpleBrowser.open';

/**
 * Checks if the integrated browser should be used instead of the simple browser
 */
async function shouldUseIntegratedBrowser(): Promise<boolean> {
	const commands = await docode.commands.getCommands(true);
	return commands.includes(integratedBrowserCommand);
}

/**
 * Opens a URL in the integrated browser
 */
async function openInIntegratedBrowser(url?: string): Promise<void> {
	await docode.commands.executeCommand(integratedBrowserCommand, url);
}

export function activate(context: docode.ExtensionContext) {

	const manager = new SimpleBrowserManager(context.extensionUri);
	context.subscriptions.push(manager);

	context.subscriptions.push(docode.window.registerWebviewPanelSerializer(SimpleBrowserView.viewType, {
		deserializeWebviewPanel: async (panel, state) => {
			manager.restore(panel, state);
		}
	}));

	context.subscriptions.push(docode.commands.registerCommand(showCommand, async (url?: string) => {
		if (await shouldUseIntegratedBrowser()) {
			return openInIntegratedBrowser(url);
		}

		if (!url) {
			url = await docode.window.showInputBox({
				placeHolder: docode.l10n.t("https://example.com"),
				prompt: docode.l10n.t("Enter url to visit")
			});
		}

		if (url) {
			manager.show(url);
		}
	}));

	context.subscriptions.push(docode.commands.registerCommand(openApiCommand, async (url: docode.Uri, showOptions?: {
		preserveFocus?: boolean;
		viewColumn: docode.ViewColumn;
	}) => {
		if (await shouldUseIntegratedBrowser()) {
			await openInIntegratedBrowser(url.toString(true));
		} else {
			manager.show(url, showOptions);
		}
	}));

	context.subscriptions.push(docode.window.registerExternalUriOpener(openerId, {
		canOpenExternalUri(uri: docode.Uri) {
			// We have to replace the IPv6 hosts with IPv4 because URL can't handle IPv6.
			const originalUri = new URL(uri.toString(true));
			if (enabledHosts.has(originalUri.hostname)) {
				return isWeb()
					? docode.ExternalUriOpenerPriority.Default
					: docode.ExternalUriOpenerPriority.Option;
			}

			return docode.ExternalUriOpenerPriority.None;
		},
		async openExternalUri(resolveUri: docode.Uri) {
			if (await shouldUseIntegratedBrowser()) {
				await openInIntegratedBrowser(resolveUri.toString(true));
			} else {
				return manager.show(resolveUri, {
					viewColumn: docode.window.activeTextEditor ? docode.ViewColumn.Beside : docode.ViewColumn.Active
				});
			}
		}
	}, {
		schemes: ['http', 'https'],
		label: docode.l10n.t("Open in Simple Browser"),
	}));
}

function isWeb(): boolean {
	return !(typeof process === 'object' && !!process.versions.node) && docode.env.uiKind === docode.UIKind.Web;
}
