/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as docode from 'docode';

/**
 * Minimal version of {@link docode.TextDocument}.
 */
export interface ITextDocument {
	readonly uri: docode.Uri;
	readonly version: number;

	getText(range?: docode.Range): string;

	positionAt(offset: number): docode.Position;
}

