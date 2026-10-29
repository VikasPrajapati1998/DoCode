/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as docode from 'docode';

declare global {
	var testExtensionContext: docode.ExtensionContext;
}

export function activate(_context: docode.ExtensionContext) {
	// Set context as a global as some tests depend on it
	global.testExtensionContext = _context;
}
