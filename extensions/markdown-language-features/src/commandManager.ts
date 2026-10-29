/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as docode from 'docode';

export interface Command {
	readonly id: string;

	execute(...args: any[]): void;
}

export class CommandManager {
	readonly #commands = new Map<string, docode.Disposable>();

	public dispose() {
		for (const registration of this.#commands.values()) {
			registration.dispose();
		}
		this.#commands.clear();
	}

	public register<T extends Command>(command: T): docode.Disposable {
		this.#registerCommand(command.id, command.execute, command);
		return new docode.Disposable(() => {
			this.#commands.delete(command.id);
		});
	}

	#registerCommand(id: string, impl: (...args: any[]) => void, thisArg?: any) {
		if (this.#commands.has(id)) {
			return;
		}

		this.#commands.set(id, docode.commands.registerCommand(id, impl, thisArg));
	}
}
