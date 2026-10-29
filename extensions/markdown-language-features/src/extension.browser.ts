/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as docode from 'docode';
import { LanguageClient, LanguageClientOptions } from 'vscode-languageclient/browser';
import { MdLanguageClient, startClient } from './client/client';
import { activateShared } from './extension.shared';
import { VsCodeOutputLogger } from './logging';
import { IMdParser, MarkdownItEngine } from './markdownEngine';
import { getMarkdownExtensionContributions } from './markdownExtensions';
import { githubSlugifier } from './slugify';

export async function activate(context: docode.ExtensionContext) {
	const contributions = getMarkdownExtensionContributions(context);
	context.subscriptions.push(contributions);

	const logger = new VsCodeOutputLogger();
	context.subscriptions.push(logger);

	const engine = new MarkdownItEngine(contributions, githubSlugifier, logger);

	const client = await startServer(context, engine);
	context.subscriptions.push(client);
	activateShared(context, client, engine, logger, contributions);
}

function startServer(context: docode.ExtensionContext, parser: IMdParser): Promise<MdLanguageClient> {
	const serverMain = docode.Uri.joinPath(context.extensionUri, 'dist', 'browser', 'serverWorkerMain.js');

	const worker = new Worker(serverMain.toString());
	worker.postMessage({ i10lLocation: docode.l10n.uri?.toString() ?? '' });

	return startClient((id: string, name: string, clientOptions: LanguageClientOptions) => {
		return new LanguageClient(id, name, clientOptions, worker);
	}, parser);
}
