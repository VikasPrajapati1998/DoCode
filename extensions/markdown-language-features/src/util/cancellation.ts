/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as docode from 'docode';

export const noopToken: docode.CancellationToken = new class implements docode.CancellationToken {
	readonly #onCancellationRequestedEmitter = new docode.EventEmitter<void>();
	onCancellationRequested = this.#onCancellationRequestedEmitter.event;

	get isCancellationRequested() { return false; }
};
