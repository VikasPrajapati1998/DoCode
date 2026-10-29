/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'mocha';
import * as docode from 'docode';
import { onChangedDocument, retryUntilDocumentChanges, wait } from './testUtils';

export async function acceptFirstSuggestion(uri: docode.Uri, _disposables: docode.Disposable[]) {
	return retryUntilDocumentChanges(uri, { retries: 10, timeout: 0 }, _disposables, async () => {
		await docode.commands.executeCommand('editor.action.triggerSuggest');
		await wait(1000);
		await docode.commands.executeCommand('acceptSelectedSuggestion');
	});
}

export async function typeCommitCharacter(uri: docode.Uri, character: string, _disposables: docode.Disposable[]) {
	const didChangeDocument = onChangedDocument(uri, _disposables);
	await docode.commands.executeCommand('editor.action.triggerSuggest');
	await wait(3000); // Give time for suggestions to show
	await docode.commands.executeCommand('type', { text: character });
	return await didChangeDocument;
}
