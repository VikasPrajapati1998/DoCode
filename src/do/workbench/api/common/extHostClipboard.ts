/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IMainContext, MainContext } from './extHost.protocol.js';
import type * as docode from 'docode';

export class ExtHostClipboard {

	readonly value: docode.Clipboard;

	constructor(mainContext: IMainContext) {
		const proxy = mainContext.getProxy(MainContext.MainThreadClipboard);
		this.value = Object.freeze({
			readText() {
				return proxy.$readText();
			},
			writeText(value: string) {
				return proxy.$writeText(value);
			}
		});
	}
}
