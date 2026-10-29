/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getLocation, JSONPath, parse, visit, Location } from 'jsonc-parser';
import * as docode from 'docode';
import { SettingsDocument } from './settingsDocumentHelper';
import { provideInstalledExtensionProposals } from './extensionsProposals';
import { registerGitHubGistProfileContentHandler } from './importExportProfiles';

export function activate(context: docode.ExtensionContext): void {
	// GitHub gist profile import/export
	context.subscriptions.push(registerGitHubGistProfileContentHandler());

	//settings.json suggestions
	context.subscriptions.push(registerSettingsCompletions());

	//extensions suggestions
	context.subscriptions.push(...registerExtensionsCompletions());

	// launch.json variable suggestions
	context.subscriptions.push(registerVariableCompletions('**/launch.json'));

	// task.json variable suggestions
	context.subscriptions.push(registerVariableCompletions('**/tasks.json'));

	// Workspace file launch/tasks variable completions
	context.subscriptions.push(registerVariableCompletions('**/*.code-workspace'));

	// keybindings.json/package.json context key suggestions
	context.subscriptions.push(registerContextKeyCompletions());
}

function registerSettingsCompletions(): docode.Disposable {
	return docode.languages.registerCompletionItemProvider({ language: 'jsonc', pattern: '**/settings.json' }, {
		provideCompletionItems(document, position, token) {
			return new SettingsDocument(document).provideCompletionItems(position, token);
		}
	});
}

function registerVariableCompletions(pattern: string): docode.Disposable {
	return docode.languages.registerCompletionItemProvider({ language: 'jsonc', pattern }, {
		provideCompletionItems(document, position, _token) {
			const location = getLocation(document.getText(), document.offsetAt(position));
			if (isCompletingInsidePropertyStringValue(document, location, position)) {
				if (document.fileName.endsWith('.code-workspace') && !isLocationInsideTopLevelProperty(location, ['launch', 'tasks'])) {
					return [];
				}

				let range = document.getWordRangeAtPosition(position, /\$\{[^"\}]*\}?/);
				if (!range || range.start.isEqual(position) || range.end.isEqual(position) && document.getText(range).endsWith('}')) {
					range = new docode.Range(position, position);
				}

				return [
					{ label: 'workspaceFolder', detail: docode.l10n.t("The path of the folder opened in DoCode") },
					{ label: 'workspaceFolderBasename', detail: docode.l10n.t("The name of the folder opened in DoCode without any slashes (/)") },
					{ label: 'fileWorkspaceFolderBasename', detail: docode.l10n.t("The current opened file workspace folder name without any slashes (/)") },
					{ label: 'relativeFile', detail: docode.l10n.t("The current opened file relative to ${workspaceFolder}") },
					{ label: 'relativeFileDirname', detail: docode.l10n.t("The current opened file's dirname relative to ${workspaceFolder}") },
					{ label: 'file', detail: docode.l10n.t("The current opened file") },
					{ label: 'cwd', detail: docode.l10n.t("The task runner's current working directory on startup") },
					{ label: 'lineNumber', detail: docode.l10n.t("The current selected line number in the active file") },
					{ label: 'selectedText', detail: docode.l10n.t("The current selected text in the active file") },
					{ label: 'fileDirname', detail: docode.l10n.t("The current opened file's dirname") },
					{ label: 'fileDirnameBasename', detail: docode.l10n.t("The current opened file's folder name") },
					{ label: 'fileExtname', detail: docode.l10n.t("The current opened file's extension") },
					{ label: 'fileBasename', detail: docode.l10n.t("The current opened file's basename") },
					{ label: 'fileBasenameNoExtension', detail: docode.l10n.t("The current opened file's basename with no file extension") },
					{ label: 'defaultBuildTask', detail: docode.l10n.t("The name of the default build task. If there is not a single default build task then a quick pick is shown to choose the build task.") },
					{ label: 'pathSeparator', detail: docode.l10n.t("The character used by the operating system to separate components in file paths. Is also aliased to '/'.") },
					{ label: 'extensionInstallFolder', detail: docode.l10n.t("The path where an extension is installed."), param: 'publisher.extension' },
				].map(variable => ({
					label: `\${${variable.label}}`,
					range,
					insertText: variable.param ? new docode.SnippetString(`\${${variable.label}:`).appendPlaceholder(variable.param).appendText('}') : (`\${${variable.label}}`),
					detail: variable.detail
				}));
			}

			return [];
		}
	});
}

function isCompletingInsidePropertyStringValue(document: docode.TextDocument, location: Location, pos: docode.Position) {
	if (location.isAtPropertyKey) {
		return false;
	}
	const previousNode = location.previousNode;
	if (previousNode && previousNode.type === 'string') {
		const offset = document.offsetAt(pos);
		return offset > previousNode.offset && offset < previousNode.offset + previousNode.length;
	}
	return false;
}

function isLocationInsideTopLevelProperty(location: Location, values: string[]) {
	return values.includes(location.path[0] as string);
}

interface IExtensionsContent {
	recommendations: string[];
}

function registerExtensionsCompletions(): docode.Disposable[] {
	return [registerExtensionsCompletionsInExtensionsDocument(), registerExtensionsCompletionsInWorkspaceConfigurationDocument()];
}

function registerExtensionsCompletionsInExtensionsDocument(): docode.Disposable {
	return docode.languages.registerCompletionItemProvider({ pattern: '**/extensions.json' }, {
		provideCompletionItems(document, position, _token) {
			const location = getLocation(document.getText(), document.offsetAt(position));
			if (location.path[0] === 'recommendations') {
				const range = getReplaceRange(document, location, position);
				const extensionsContent = <IExtensionsContent>parse(document.getText());
				return provideInstalledExtensionProposals(extensionsContent && extensionsContent.recommendations || [], '', range, false);
			}
			return [];
		}
	});
}

function registerExtensionsCompletionsInWorkspaceConfigurationDocument(): docode.Disposable {
	return docode.languages.registerCompletionItemProvider({ pattern: '**/*.code-workspace' }, {
		provideCompletionItems(document, position, _token) {
			const location = getLocation(document.getText(), document.offsetAt(position));
			if (location.path[0] === 'extensions' && location.path[1] === 'recommendations') {
				const range = getReplaceRange(document, location, position);
				const extensionsContent = <IExtensionsContent>parse(document.getText())['extensions'];
				return provideInstalledExtensionProposals(extensionsContent && extensionsContent.recommendations || [], '', range, false);
			}
			return [];
		}
	});
}

function getReplaceRange(document: docode.TextDocument, location: Location, position: docode.Position) {
	const node = location.previousNode;
	if (node) {
		const nodeStart = document.positionAt(node.offset), nodeEnd = document.positionAt(node.offset + node.length);
		if (nodeStart.isBeforeOrEqual(position) && nodeEnd.isAfterOrEqual(position)) {
			return new docode.Range(nodeStart, nodeEnd);
		}
	}
	return new docode.Range(position, position);
}

docode.languages.registerDocumentSymbolProvider({ pattern: '**/launch.json', language: 'jsonc' }, {
	provideDocumentSymbols(document: docode.TextDocument, _token: docode.CancellationToken): docode.ProviderResult<docode.SymbolInformation[]> {
		const result: docode.SymbolInformation[] = [];
		let name: string = '';
		let lastProperty = '';
		let startOffset = 0;
		let depthInObjects = 0;

		visit(document.getText(), {
			onObjectProperty: (property, _offset, _length) => {
				lastProperty = property;
			},
			onLiteralValue: (value: any, _offset: number, _length: number) => {
				if (lastProperty === 'name') {
					name = value;
				}
			},
			onObjectBegin: (offset: number, _length: number) => {
				depthInObjects++;
				if (depthInObjects === 2) {
					startOffset = offset;
				}
			},
			onObjectEnd: (offset: number, _length: number) => {
				if (name && depthInObjects === 2) {
					result.push(new docode.SymbolInformation(name, docode.SymbolKind.Object, new docode.Range(document.positionAt(startOffset), document.positionAt(offset))));
				}
				depthInObjects--;
			},
		});

		return result;
	}
}, { label: 'Launch Targets' });

function registerContextKeyCompletions(): docode.Disposable {
	type ContextKeyInfo = { key: string; type?: string; description?: string };

	const paths = new Map<docode.DocumentFilter, JSONPath[]>([
		[{ language: 'jsonc', pattern: '**/keybindings.json' }, [
			['*', 'when']
		]],
		[{ language: 'json', pattern: '**/package.json' }, [
			['contributes', 'menus', '*', '*', 'when'],
			['contributes', 'views', '*', '*', 'when'],
			['contributes', 'viewsWelcome', '*', 'when'],
			['contributes', 'keybindings', '*', 'when'],
			['contributes', 'keybindings', 'when'],
		]]
	]);

	return docode.languages.registerCompletionItemProvider(
		[...paths.keys()],
		{
			async provideCompletionItems(document: docode.TextDocument, position: docode.Position, token: docode.CancellationToken) {

				const location = getLocation(document.getText(), document.offsetAt(position));

				if (location.isAtPropertyKey) {
					return;
				}

				let isValidLocation = false;
				for (const [key, value] of paths) {
					if (docode.languages.match(key, document)) {
						if (value.some(location.matches.bind(location))) {
							isValidLocation = true;
							break;
						}
					}
				}

				if (!isValidLocation || !isCompletingInsidePropertyStringValue(document, location, position)) {
					return;
				}

				const replacing = document.getWordRangeAtPosition(position, /[a-zA-Z.]+/) || new docode.Range(position, position);
				const inserting = replacing.with(undefined, position);

				const data = await docode.commands.executeCommand<ContextKeyInfo[]>('getContextKeyInfo');
				if (token.isCancellationRequested || !data) {
					return;
				}

				const result = new docode.CompletionList();
				for (const item of data) {
					const completion = new docode.CompletionItem(item.key, docode.CompletionItemKind.Constant);
					completion.detail = item.type;
					completion.range = { replacing, inserting };
					completion.documentation = item.description;
					result.items.push(completion);
				}
				return result;
			}
		}
	);
}
