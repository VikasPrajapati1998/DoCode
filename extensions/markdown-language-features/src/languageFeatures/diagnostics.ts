/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as docode from 'docode';
import { CommandManager } from '../commandManager';
import { isMarkdownFile } from '../util/file';


// Copied from markdown language service
export enum DiagnosticCode {
	link_noSuchReferences = 'link.no-such-reference',
	link_noSuchHeaderInOwnFile = 'link.no-such-header-in-own-file',
	link_noSuchFile = 'link.no-such-file',
	link_noSuchHeaderInFile = 'link.no-such-header-in-file',
}


class AddToIgnoreLinksQuickFixProvider implements docode.CodeActionProvider {

	static readonly #addToIgnoreLinksCommandId = '_markdown.addToIgnoreLinks';

	static readonly #metadata: docode.CodeActionProviderMetadata = {
		providedCodeActionKinds: [
			docode.CodeActionKind.QuickFix
		],
	};

	public static register(selector: docode.DocumentSelector, commandManager: CommandManager): docode.Disposable {
		const reg = docode.languages.registerCodeActionsProvider(selector, new AddToIgnoreLinksQuickFixProvider(), AddToIgnoreLinksQuickFixProvider.#metadata);
		const commandReg = commandManager.register({
			id: AddToIgnoreLinksQuickFixProvider.#addToIgnoreLinksCommandId,
			execute(resource: docode.Uri, path: string) {
				const settingId = 'validate.ignoredLinks';
				const config = docode.workspace.getConfiguration('markdown', resource);
				const paths = new Set(config.get<string[]>(settingId, []));
				paths.add(path);
				config.update(settingId, [...paths], docode.ConfigurationTarget.WorkspaceFolder);
			}
		});
		return docode.Disposable.from(reg, commandReg);
	}

	provideCodeActions(document: docode.TextDocument, _range: docode.Range | docode.Selection, context: docode.CodeActionContext, _token: docode.CancellationToken): docode.ProviderResult<(docode.CodeAction | docode.Command)[]> {
		const fixes: docode.CodeAction[] = [];

		for (const diagnostic of context.diagnostics) {
			switch (diagnostic.code) {
				case DiagnosticCode.link_noSuchReferences:
				case DiagnosticCode.link_noSuchHeaderInOwnFile:
				case DiagnosticCode.link_noSuchFile:
				case DiagnosticCode.link_noSuchHeaderInFile: {
					const hrefText = (diagnostic as unknown as Record<string, any>).data?.hrefText;
					if (hrefText) {
						const fix = new docode.CodeAction(
							docode.l10n.t("Exclude '{0}' from link validation.", hrefText),
							docode.CodeActionKind.QuickFix);

						fix.command = {
							command: AddToIgnoreLinksQuickFixProvider.#addToIgnoreLinksCommandId,
							title: '',
							arguments: [document.uri, hrefText],
						};
						fixes.push(fix);
					}
					break;
				}
			}
		}

		return fixes;
	}
}

function registerMarkdownStatusItem(selector: docode.DocumentSelector, commandManager: CommandManager): docode.Disposable {
	const statusItem = docode.languages.createLanguageStatusItem('markdownStatus', selector);

	const enabledSettingId = 'validate.enabled';
	const commandId = '_markdown.toggleValidation';

	const commandSub = commandManager.register({
		id: commandId,
		execute: (enabled: boolean) => {
			docode.workspace.getConfiguration('markdown').update(enabledSettingId, enabled);
		}
	});

	const update = () => {
		const activeDoc = docode.window.activeTextEditor?.document;
		const markdownDoc = activeDoc && isMarkdownFile(activeDoc) ? activeDoc : undefined;

		const enabled = docode.workspace.getConfiguration('markdown', markdownDoc).get(enabledSettingId);
		if (enabled) {
			statusItem.text = docode.l10n.t('Markdown link validation enabled');
			statusItem.command = {
				command: commandId,
				arguments: [false],
				title: docode.l10n.t('Disable'),
				tooltip: docode.l10n.t('Disable validation of Markdown links'),
			};
		} else {
			statusItem.text = docode.l10n.t('Markdown link validation disabled');
			statusItem.command = {
				command: commandId,
				arguments: [true],
				title: docode.l10n.t('Enable'),
				tooltip: docode.l10n.t('Enable validation of Markdown links'),
			};
		}
	};
	update();

	return docode.Disposable.from(
		statusItem,
		commandSub,
		docode.workspace.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('markdown.' + enabledSettingId)) {
				update();
			}
		}),
	);
}

export function registerDiagnosticSupport(
	selector: docode.DocumentSelector,
	commandManager: CommandManager,
): docode.Disposable {
	return docode.Disposable.from(
		AddToIgnoreLinksQuickFixProvider.register(selector, commandManager),
		registerMarkdownStatusItem(selector, commandManager),
	);
}
