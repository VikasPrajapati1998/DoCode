/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as docode from 'docode';
import { isTypeScriptDocument } from '../configuration/languageIds';
import { Command } from './commandManager';

export class LearnMoreAboutRefactoringsCommand implements Command {
	public static readonly id = '_typescript.learnMoreAboutRefactorings';
	public readonly id = LearnMoreAboutRefactoringsCommand.id;

	public execute() {
		const docUrl = docode.window.activeTextEditor && isTypeScriptDocument(docode.window.activeTextEditor.document)
			? 'https://go.microsoft.com/fwlink/?linkid=2114477'
			: 'https://go.microsoft.com/fwlink/?linkid=2116761';

		docode.env.openExternal(docode.Uri.parse(docUrl));
	}
}
