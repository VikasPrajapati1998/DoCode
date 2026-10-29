/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as docode from 'docode';

export async function exists(resource: docode.Uri): Promise<boolean> {
	try {
		const stat = await docode.workspace.fs.stat(resource);
		// stat.type is an enum flag
		return !!(stat.type & docode.FileType.File);
	} catch {
		return false;
	}
}

export function looksLikeAbsoluteWindowsPath(path: string): boolean {
	return /^[a-zA-Z]:[\/\\]/.test(path);
}
