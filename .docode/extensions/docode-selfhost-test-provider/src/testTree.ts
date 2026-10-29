/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { join, relative } from 'path';
import * as ts from 'typescript';
import { TextDecoder } from 'util';
import * as docode from 'docode';
import { Action, extractTestFromNode } from './sourceUtils';

const textDecoder = new TextDecoder('utf-8');
const diagnosticCollection = docode.languages.createDiagnosticCollection('selfhostTestProvider');

type ContentGetter = (uri: docode.Uri) => Promise<string>;

export const itemData = new WeakMap<docode.TestItem, DoCodeTest>();

export const clearFileDiagnostics = (uri: docode.Uri) => diagnosticCollection.delete(uri);

/**
 * Tries to guess which workspace folder DoCode is in.
 */
export const guessWorkspaceFolder = async () => {
	if (!docode.workspace.workspaceFolders) {
		return undefined;
	}

	if (docode.workspace.workspaceFolders.length < 2) {
		return docode.workspace.workspaceFolders[0];
	}

	for (const folder of docode.workspace.workspaceFolders) {
		if (await isVsCodeWorkspaceFolder(folder)) {
			return folder;
		}
	}

	return undefined;
};

export async function isVsCodeWorkspaceFolder(folder: docode.WorkspaceFolder): Promise<boolean> {
	try {
		const buffer = await docode.workspace.fs.readFile(docode.Uri.joinPath(folder.uri, 'package.json'));
		const pkg = JSON.parse(textDecoder.decode(buffer));
		return pkg.name === 'code-oss-dev';
	} catch {
		return false;
	}
}

export const getContentFromFilesystem: ContentGetter = async uri => {
	try {
		const rawContent = await docode.workspace.fs.readFile(uri);
		return textDecoder.decode(rawContent);
	} catch (e) {
		console.warn(`Error providing tests for ${uri.fsPath}`, e);
		return '';
	}
};

export class TestFile {
	public hasBeenRead = false;

	constructor(
		public readonly uri: docode.Uri,
		public readonly workspaceFolder: docode.WorkspaceFolder
	) { }

	public getId() {
		return this.uri.toString().toLowerCase();
	}

	public getLabel() {
		return relative(join(this.workspaceFolder.uri.fsPath, 'src'), this.uri.fsPath);
	}

	public async updateFromDisk(controller: docode.TestController, item: docode.TestItem) {
		try {
			const content = await getContentFromFilesystem(item.uri!);
			item.error = undefined;
			this.updateFromContents(controller, content, item);
		} catch (e) {
			item.error = (e as Error).stack;
		}
	}

	/**
	 * Refreshes all tests in this file, `sourceReader` provided by the root.
	 */
	public updateFromContents(
		controller: docode.TestController,
		content: string,
		file: docode.TestItem
	) {
		try {
			const diagnostics: docode.Diagnostic[] = [];
			const ast = ts.createSourceFile(
				this.uri.path.split('/').pop()!,
				content,
				ts.ScriptTarget.ESNext,
				false,
				ts.ScriptKind.TS
			);

			const parents: { item: docode.TestItem; children: docode.TestItem[] }[] = [
				{ item: file, children: [] },
			];
			const traverse = (node: ts.Node) => {
				const parent = parents[parents.length - 1];
				const childData = extractTestFromNode(ast, node, itemData.get(parent.item)!);
				if (childData === Action.Skip) {
					return;
				}

				if (childData === Action.Recurse) {
					ts.forEachChild(node, traverse);
					return;
				}

				const id = `${file.uri}/${childData.fullName}`.toLowerCase();

				// Skip duplicated tests. They won't run correctly with the way
				// mocha reports them, and will error if we try to insert them.
				const existing = parent.children.find(c => c.id === id);
				if (existing) {
					const diagnostic = new docode.Diagnostic(
						childData.range,
						'Duplicate tests cannot be run individually and will not be reported correctly by the test framework. Please rename them.',
						docode.DiagnosticSeverity.Warning
					);

					diagnostic.relatedInformation = [
						new docode.DiagnosticRelatedInformation(
							new docode.Location(existing.uri!, existing.range!),
							'First declared here'
						),
					];

					diagnostics.push(diagnostic);
					return;
				}

				const item = controller.createTestItem(id, childData.name, file.uri);
				itemData.set(item, childData);
				item.range = childData.range;
				parent.children.push(item);

				if (childData instanceof TestSuite) {
					parents.push({ item: item, children: [] });
					ts.forEachChild(node, traverse);
					item.children.replace(parents.pop()!.children);
				}
			};

			ts.forEachChild(ast, traverse);
			file.error = undefined;
			file.children.replace(parents[0].children);
			diagnosticCollection.set(this.uri, diagnostics.length ? diagnostics : undefined);
			this.hasBeenRead = true;
		} catch (e) {
			file.error = String((e as Error).stack || (e as Error).message);
		}
	}
}

export abstract class TestConstruct {
	public fullName: string;

	constructor(
		public readonly name: string,
		public readonly range: docode.Range,
		parent?: TestConstruct
	) {
		this.fullName = parent ? `${parent.fullName} ${name}` : name;
	}
}

export class TestSuite extends TestConstruct { }

export class TestCase extends TestConstruct { }

export type DoCodeTest = TestFile | TestSuite | TestCase;
