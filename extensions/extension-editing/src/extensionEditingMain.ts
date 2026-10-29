/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as docode from 'docode';
import { PackageDocument } from './packageDocumentHelper';
import { PackageDocumentL10nSupport } from './packageDocumentL10nSupport';
import { ExtensionLinter } from './extensionLinter';

export function activate(context: docode.ExtensionContext) {

	//package.json suggestions
	context.subscriptions.push(registerPackageDocumentCompletions());

	//package.json code actions for lint warnings
	context.subscriptions.push(registerCodeActionsProvider());

	// package.json l10n support
	context.subscriptions.push(new PackageDocumentL10nSupport());

	context.subscriptions.push(new ExtensionLinter());
}

function registerPackageDocumentCompletions(): docode.Disposable {
	return docode.languages.registerCompletionItemProvider({ language: 'json', pattern: '**/package.json' }, {
		provideCompletionItems(document, position, token) {
			return new PackageDocument(document).provideCompletionItems(position, token);
		}
	});
}

function registerCodeActionsProvider(): docode.Disposable {
	return docode.languages.registerCodeActionsProvider({ language: 'json', pattern: '**/package.json' }, {
		provideCodeActions(document, range, context, token) {
			return new PackageDocument(document).provideCodeActions(range, context, token);
		}
	});
}
