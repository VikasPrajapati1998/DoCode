/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as docode from 'docode';
import type * as Proto from '../../tsServer/protocol/protocol';
import * as typeConverters from '../../typeConverters';
import { ITypeScriptServiceClient } from '../../typescriptService';

export function getEditForCodeAction(
	client: ITypeScriptServiceClient,
	action: Proto.CodeAction
): docode.WorkspaceEdit | undefined {
	return action.changes?.length
		? typeConverters.WorkspaceEdit.fromFileCodeEdits(client, action.changes)
		: undefined;
}

export async function applyCodeAction(
	client: ITypeScriptServiceClient,
	action: Proto.CodeAction,
	token: docode.CancellationToken
): Promise<boolean> {
	const workspaceEdit = getEditForCodeAction(client, action);
	if (workspaceEdit) {
		if (!(await docode.workspace.applyEdit(workspaceEdit))) {
			return false;
		}
	}
	return applyCodeActionCommands(client, action.commands, token);
}

export async function applyCodeActionCommands(
	client: ITypeScriptServiceClient,
	commands: ReadonlyArray<{}> | undefined,
	token: docode.CancellationToken,
): Promise<boolean> {
	if (commands?.length) {
		for (const command of commands) {
			await client.execute('applyCodeActionCommand', { command }, token);
		}
	}
	return true;
}
