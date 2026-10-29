/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as docode from 'docode';
import { TestMemento } from './testMemento';
import { TestSecretStorage } from './testSecretStorage';

export function createTestExtensionContext(subscriptions: docode.Disposable[], secrets: TestSecretStorage, state = new TestMemento()): docode.ExtensionContext {
	const extension = docode.extensions.getExtension('docode.github-authentication');
	assert.ok(extension);
	const storageUri = docode.Uri.parse('test-storage:/github-authentication');
	return {
		subscriptions,
		workspaceState: state,
		globalState: Object.assign(state, { setKeysForSync: () => { } }),
		secrets,
		extension,
		extensionUri: extension.extensionUri,
		extensionPath: extension.extensionPath,
		extensionMode: docode.ExtensionMode.Test,
		storageUri: undefined,
		storagePath: undefined,
		globalStorageUri: storageUri,
		globalStoragePath: storageUri.fsPath,
		logUri: storageUri,
		logPath: storageUri.fsPath,
		asAbsolutePath: relativePath => docode.Uri.joinPath(extension.extensionUri, relativePath).fsPath,
		get environmentVariableCollection(): docode.GlobalEnvironmentVariableCollection { throw new Error('Unexpected environment access'); },
		get languageModelAccessInformation(): docode.LanguageModelAccessInformation { throw new Error('Unexpected language model access'); }
	};
}
