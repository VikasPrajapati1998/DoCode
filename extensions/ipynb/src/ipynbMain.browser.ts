/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as docode from 'docode';
import * as main from './ipynbMain';
import { NotebookSerializer } from './notebookSerializer.web';

export function activate(context: docode.ExtensionContext) {
	return main.activate(context, new NotebookSerializer(context));
}

export function deactivate() {
	return main.deactivate();
}
