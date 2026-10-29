/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as docode from 'docode';

export class UriEventHandler extends docode.EventEmitter<docode.Uri> implements docode.UriHandler {
	private _disposable = docode.window.registerUriHandler(this);

	handleUri(uri: docode.Uri) {
		this.fire(uri);
	}

	override dispose(): void {
		super.dispose();
		this._disposable.dispose();
	}
}
