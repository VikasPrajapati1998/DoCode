/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as docode from 'docode';
import { PackageDocument } from './packageDocumentHelper';
import { PackageDocumentL10nSupport } from './packageDocumentL10nSupport';

export function activate(context: docode.ExtensionContext) {
	//package.json suggestions
	context.subscriptions.push(registerPackageDocumentCompletions());

	//package.json go to definition for NLS strings
	context.subscriptions.push(new PackageDocumentL10nSupport());
}

function registerPackageDocumentCompletions(): docode.Disposable {
	return docode.languages.registerCompletionItemProvider({ language: 'json', pattern: '**/package.json' }, {
		provideCompletionItems(document, position, token) {
			return new PackageDocument(document).provideCompletionItems(position, token);
		}
	});
}
