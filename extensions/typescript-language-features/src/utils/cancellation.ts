/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as docode from 'docode';

const noopDisposable = docode.Disposable.from();

export const nulToken: docode.CancellationToken = {
	isCancellationRequested: false,
	onCancellationRequested: () => noopDisposable
};
