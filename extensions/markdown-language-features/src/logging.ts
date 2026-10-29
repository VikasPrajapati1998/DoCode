/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as docode from 'docode';
import { Disposable } from './util/dispose';


export interface ILogger {
	trace(title: string, message: string, data?: unknown): void;
}

export class VsCodeOutputLogger extends Disposable implements ILogger {
	#outputChannelValue?: docode.LogOutputChannel;

	get #outputChannel() {
		this.#outputChannelValue ??= this._register(docode.window.createOutputChannel('Markdown', { log: true }));
		return this.#outputChannelValue;
	}

	constructor() {
		super();
	}

	public trace(title: string, message: string, data?: unknown): void {
		if (!this.#outputChannelValue && docode.env.logLevel !== docode.LogLevel.Trace) {
			return;
		}
		const outputChannel = this.#outputChannel;
		if (outputChannel.logLevel === docode.LogLevel.Trace) {
			outputChannel.trace(`${title}: ${message}`, ...(data ? [JSON.stringify(data, null, 4)] : []));
		}
	}
}
