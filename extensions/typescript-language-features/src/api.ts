/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as docode from 'docode';
import { PluginManager } from './tsServer/plugins';

class ApiV0 {
	public constructor(
		public readonly onCompletionAccepted: docode.Event<docode.CompletionItem & { metadata?: any }>,
		private readonly _pluginManager: PluginManager,
	) { }

	configurePlugin(pluginId: string, configuration: {}): void {
		this._pluginManager.setConfiguration(pluginId, configuration);
	}
}

export interface Api {
	getAPI(version: 0): ApiV0 | undefined;
}

export function getExtensionApi(
	onCompletionAccepted: docode.Event<docode.CompletionItem>,
	pluginManager: PluginManager,
): Api {
	return {
		getAPI(version) {
			if (version === 0) {
				return new ApiV0(onCompletionAccepted, pluginManager);
			}
			return undefined;
		}
	};
}
