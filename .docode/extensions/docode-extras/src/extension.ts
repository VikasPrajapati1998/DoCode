/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as docode from 'docode';
import { NpmUpToDateFeature } from './npmUpToDateFeature';

export class Extension extends docode.Disposable {
	private readonly _output: docode.LogOutputChannel;
	private _npmFeature: NpmUpToDateFeature | undefined;

	constructor(_context: docode.ExtensionContext) {
		const disposables: docode.Disposable[] = [];
		super(() => disposables.forEach(d => d.dispose()));

		this._output = docode.window.createOutputChannel('DoCode Extras', { log: true });
		disposables.push(this._output);

		this._updateNpmFeature();

		disposables.push(
			docode.workspace.onDidChangeConfiguration(e => {
				if (e.affectsConfiguration('docode-extras.npmUpToDateFeature.enabled')) {
					this._updateNpmFeature();
				}
			})
		);
	}

	private _updateNpmFeature(): void {
		const enabled = docode.workspace.getConfiguration('docode-extras').get<boolean>('npmUpToDateFeature.enabled', true);
		if (enabled && !this._npmFeature) {
			this._npmFeature = new NpmUpToDateFeature(this._output);
		} else if (!enabled && this._npmFeature) {
			this._npmFeature.dispose();
			this._npmFeature = undefined;
		}
	}
}

let extension: Extension | undefined;

export function activate(context: docode.ExtensionContext) {
	extension = new Extension(context);
	context.subscriptions.push(extension);
}

export function deactivate() {
	extension = undefined;
}
