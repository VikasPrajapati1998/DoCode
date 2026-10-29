/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as docode from 'docode';
import { MarkdownItEngine } from '../markdownEngine';
import { MarkdownContributionProvider, MarkdownContributions } from '../markdownExtensions';
import { githubSlugifier } from '../slugify';
import { nulLogger } from './nulLogging';

const emptyContributions = new class implements MarkdownContributionProvider {
	readonly extensionUri = docode.Uri.file('/');
	readonly contributions = MarkdownContributions.Empty;

	readonly #onContributionsChanged = new docode.EventEmitter<this>();
	readonly onContributionsChanged = this.#onContributionsChanged.event;

	dispose() {
		this.#onContributionsChanged.dispose();
	}
};

export function createNewMarkdownEngine(): MarkdownItEngine {
	return new MarkdownItEngine(emptyContributions, githubSlugifier, nulLogger);
}
