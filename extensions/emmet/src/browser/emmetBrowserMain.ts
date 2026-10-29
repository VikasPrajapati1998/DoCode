/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as docode from 'docode';
import { activateEmmetExtension } from '../emmetCommon';

export function activate(context: docode.ExtensionContext) {
	activateEmmetExtension(context);
}
