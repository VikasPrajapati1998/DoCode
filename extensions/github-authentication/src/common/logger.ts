/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as docode from 'docode';
import { AuthProviderType } from '../github';

export class Log implements docode.Disposable {
	private output: docode.LogOutputChannel | undefined;

	constructor(private readonly type: AuthProviderType, instance?: docode.Uri) {
		const friendlyName = this.type === AuthProviderType.github ? 'GitHub' : 'GitHub Enterprise';
		this.output = docode.window.createOutputChannel(`${friendlyName} Authentication${instance ? ` (${instance.toString(true)})` : ''}`, { log: true });
	}

	public trace(message: string): void {
		this.output?.trace(message);
	}

	public debug(message: string): void {
		this.output?.debug(message);
	}

	public info(message: string): void {
		this.output?.info(message);
	}

	public error(message: string): void {
		this.output?.error(message);
	}

	public warn(message: string): void {
		this.output?.warn(message);
	}

	dispose(): void {
		this.output?.dispose();
		this.output = undefined;
	}
}
