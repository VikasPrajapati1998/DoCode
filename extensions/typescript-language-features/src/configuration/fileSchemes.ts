/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as docode from 'docode';
import { isWeb } from '../utils/platform';

export const file = 'file';
export const untitled = 'untitled';
export const git = 'git';
export const github = 'github';
export const azurerepos = 'azurerepos';
export const chatEditingTextModel = 'chat-editing-text-model';

/** Live share scheme */
export const vsls = 'vsls';
export const walkThroughSnippet = 'walkThroughSnippet';
export const docodeNotebookCell = 'docode-notebook-cell';
export const officeScript = 'office-script';

/** Used for code blocks in chat by vs code core */
export const chatCodeBlock = 'docode-chat-code-block';

export function getSemanticSupportedSchemes() {
	const alwaysSupportedSchemes = [
		untitled,
		walkThroughSnippet,
		docodeNotebookCell,
		chatCodeBlock,
	];

	if (isWeb()) {
		return [
			...(docode.workspace.workspaceFolders ?? []).map(folder => folder.uri.scheme),
			...alwaysSupportedSchemes,
		];
	}

	return [
		file,
		...alwaysSupportedSchemes,
	];
}

/**
 * File scheme for which JS/TS language feature should be disabled
 */
export const disabledSchemes = new Set([
	git,
	vsls,
	github,
	azurerepos,
	chatEditingTextModel,
]);

export function isOfScheme(uri: docode.Uri, ...schemes: string[]): boolean {
	const normalizedUriScheme = uri.scheme.toLowerCase();
	return schemes.some(scheme => normalizedUriScheme === scheme);
}
