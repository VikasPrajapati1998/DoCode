/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { generateUuid } from '../../../base/common/uuid.js';
import { IExtHostRpcService } from '../common/extHostRpcService.js';
import { BaseExtHostTerminalService, ExtHostTerminal, ITerminalInternalOptions } from '../common/extHostTerminalService.js';
import type * as docode from 'docode';
import { IExtHostCommands } from '../common/extHostCommands.js';

export class ExtHostTerminalService extends BaseExtHostTerminalService {

	constructor(
		@IExtHostCommands extHostCommands: IExtHostCommands,
		@IExtHostRpcService extHostRpc: IExtHostRpcService
	) {
		super(true, extHostCommands, extHostRpc);
	}

	public createTerminal(name?: string, shellPath?: string, shellArgs?: string[] | string): docode.Terminal {
		return this.createTerminalFromOptions({ name, shellPath, shellArgs });
	}

	public createTerminalFromOptions(options: docode.TerminalOptions, internalOptions?: ITerminalInternalOptions): docode.Terminal {
		const terminal = new ExtHostTerminal(this._proxy, generateUuid(), options, options.name);
		this._terminals.push(terminal);
		terminal.create(options, this._serializeParentTerminal(options, internalOptions));
		return terminal.value;
	}
}
