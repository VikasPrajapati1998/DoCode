/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'docode' {

	export namespace interactive {
		export function transferActiveChat(toWorkspace: Uri): Thenable<void>;
	}
}
