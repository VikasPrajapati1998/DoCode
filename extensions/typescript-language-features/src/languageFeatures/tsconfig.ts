/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as jsonc from 'jsonc-parser';
import { isAbsolute, posix } from 'path';
import * as docode from 'docode';
import { Utils } from 'vscode-uri';
import { coalesce } from '../utils/arrays';
import { exists, looksLikeAbsoluteWindowsPath } from '../utils/fs';
import { getSafeNotificationMessage } from '../utils/notification';

function mapChildren<R>(node: jsonc.Node | undefined, f: (x: jsonc.Node) => R): R[] {
	return node?.type === 'array' && node.children
		? node.children.map(f)
		: [];
}

const openExtendsLinkCommandId = '_typescript.openExtendsLink';

enum TsConfigLinkType {
	Extends,
	References
}

type OpenExtendsLinkCommandArgs = {
	readonly resourceUri: docode.Uri;
	readonly extendsValue: string;
	readonly linkType: TsConfigLinkType;
};


class TsconfigLinkProvider implements docode.DocumentLinkProvider {

	public provideDocumentLinks(
		document: docode.TextDocument,
		_token: docode.CancellationToken
	): docode.DocumentLink[] {
		const root = jsonc.parseTree(document.getText());
		if (!root) {
			return [];
		}

		return coalesce([
			this.getExtendsLink(document, root),
			...this.getFilesLinks(document, root),
			...this.getReferencesLinks(document, root)
		]);
	}

	private getExtendsLink(document: docode.TextDocument, root: jsonc.Node): docode.DocumentLink | undefined {
		const node = jsonc.findNodeAtLocation(root, ['extends']);
		return node && this.tryCreateTsConfigLink(document, node, TsConfigLinkType.Extends);
	}

	private getReferencesLinks(document: docode.TextDocument, root: jsonc.Node) {
		return mapChildren(
			jsonc.findNodeAtLocation(root, ['references']),
			child => {
				const pathNode = jsonc.findNodeAtLocation(child, ['path']);
				return pathNode && this.tryCreateTsConfigLink(document, pathNode, TsConfigLinkType.References);
			});
	}

	private tryCreateTsConfigLink(document: docode.TextDocument, node: jsonc.Node, linkType: TsConfigLinkType): docode.DocumentLink | undefined {
		if (!this.isPathValue(node)) {
			return undefined;
		}

		const args: OpenExtendsLinkCommandArgs = {
			resourceUri: { ...document.uri.toJSON(), $mid: undefined },
			extendsValue: node.value,
			linkType
		};

		const link = new docode.DocumentLink(
			this.getRange(document, node),
			docode.Uri.parse(`command:${openExtendsLinkCommandId}?${JSON.stringify(args)}`));
		link.tooltip = docode.l10n.t("Follow link");
		return link;
	}

	private getFilesLinks(document: docode.TextDocument, root: jsonc.Node) {
		return mapChildren(
			jsonc.findNodeAtLocation(root, ['files']),
			child => this.pathNodeToLink(document, child));
	}

	private pathNodeToLink(
		document: docode.TextDocument,
		node: jsonc.Node | undefined
	): docode.DocumentLink | undefined {
		return this.isPathValue(node)
			? new docode.DocumentLink(this.getRange(document, node), this.getFileTarget(document, node))
			: undefined;
	}

	private isPathValue(node: jsonc.Node | undefined): node is jsonc.Node {
		return node?.type === 'string'
			&& node.value
			&& !(node.value as string).includes('*'); // don't treat globs as links.
	}

	private getFileTarget(document: docode.TextDocument, node: jsonc.Node): docode.Uri {
		if (isAbsolute(node.value)) {
			return docode.Uri.file(node.value);
		}

		return docode.Uri.joinPath(Utils.dirname(document.uri), node.value);
	}

	private getRange(document: docode.TextDocument, node: jsonc.Node) {
		const offset = node.offset;
		const start = document.positionAt(offset + 1);
		const end = document.positionAt(offset + (node.length - 1));
		return new docode.Range(start, end);
	}
}

async function resolveNodeModulesPath(baseDirUri: docode.Uri, pathCandidates: string[]): Promise<docode.Uri | undefined> {
	let currentUri = baseDirUri;
	const baseCandidate = pathCandidates[0];
	const sepIndex = baseCandidate.startsWith('@') ? 2 : 1;
	const moduleBasePath = baseCandidate.split(posix.sep).slice(0, sepIndex).join(posix.sep);
	while (true) {
		const moduleAbsoluteUrl = docode.Uri.joinPath(currentUri, 'node_modules', moduleBasePath);
		let moduleStat: docode.FileStat | undefined;
		try {
			moduleStat = await docode.workspace.fs.stat(moduleAbsoluteUrl);
		} catch (err) {
			// noop
		}

		if (moduleStat && (moduleStat.type & docode.FileType.Directory)) {
			for (const uriCandidate of pathCandidates
				.map((relativePath) => relativePath.split(posix.sep).slice(sepIndex).join(posix.sep))
				// skip empty paths within module
				.filter(Boolean)
				.map((relativeModulePath) => docode.Uri.joinPath(moduleAbsoluteUrl, relativeModulePath))
			) {
				if (await exists(uriCandidate)) {
					return uriCandidate;
				}
			}
			// Continue to looking for potentially another version
		}

		const oldUri = currentUri;
		currentUri = docode.Uri.joinPath(currentUri, '..');

		// Can't go next. Reached the system root
		if (oldUri.path === currentUri.path) {
			return;
		}
	}
}

// Reference Extends:https://github.com/microsoft/TypeScript/blob/febfd442cdba343771f478cf433b0892f213ad2f/src/compiler/commandLineParser.ts#L3005
// Reference Project References: https://github.com/microsoft/TypeScript/blob/7377f5cb9db19d79a6167065b323a45611c812b5/src/compiler/tsbuild.ts#L188C1-L194C2
/**
* @returns Returns undefined in case of lack of result while trying to resolve from node_modules
*/
async function getTsconfigPath(baseDirUri: docode.Uri, pathValue: string, linkType: TsConfigLinkType): Promise<docode.Uri | undefined> {
	async function resolve(absolutePath: docode.Uri): Promise<docode.Uri> {
		if (absolutePath.path.endsWith('.json') || await exists(absolutePath)) {
			return absolutePath;
		}
		return absolutePath.with({
			path: `${absolutePath.path}${linkType === TsConfigLinkType.References ? '/tsconfig.json' : '.json'}`
		});
	}

	const isRelativePath = ['./', '../'].some(str => pathValue.startsWith(str));
	if (isRelativePath) {
		return resolve(docode.Uri.joinPath(baseDirUri, pathValue));
	}

	if (pathValue.startsWith('/') || looksLikeAbsoluteWindowsPath(pathValue)) {
		return resolve(docode.Uri.file(pathValue));
	}

	// Otherwise resolve like a module
	return resolveNodeModulesPath(baseDirUri, [
		pathValue,
		...pathValue.endsWith('.json') ? [] : [
			`${pathValue}.json`,
			`${pathValue}/tsconfig.json`,
		]
	]);
}

export function register() {
	const patterns: docode.GlobPattern[] = [
		'**/[jt]sconfig.json',
		'**/[jt]sconfig.*.json',
	];

	const languages = ['json', 'jsonc'];

	const selector: docode.DocumentSelector =
		languages.map(language => patterns.map((pattern): docode.DocumentFilter => ({ language, pattern })))
			.flat();

	return docode.Disposable.from(
		docode.commands.registerCommand(openExtendsLinkCommandId, async ({ resourceUri, extendsValue, linkType }: OpenExtendsLinkCommandArgs) => {
			const tsconfigPath = await getTsconfigPath(Utils.dirname(docode.Uri.from(resourceUri)), extendsValue, linkType);
			if (tsconfigPath === undefined) {
				docode.window.showErrorMessage(getSafeNotificationMessage(
					docode.l10n.t("Failed to resolve {0} as module", extendsValue),
					docode.l10n.t("Failed to resolve the referenced configuration as a module."),
				));
				return;
			}
			// Will suggest to create a .json variant if it doesn't exist yet (but only for relative paths)
			await docode.commands.executeCommand('docode.open', tsconfigPath);
		}),
		docode.languages.registerDocumentLinkProvider(selector, new TsconfigLinkProvider()),
	);
}
