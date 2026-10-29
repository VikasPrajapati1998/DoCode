/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { WebviewApi } from 'docode-webview';
import type { FromWebviewMessage } from '../types/previewMessaging';
import { SettingsManager } from './settings';

export interface MessagePoster {
	/**
	 * Post a message to the markdown extension
	 */
	postMessage<T extends FromWebviewMessage.Type>(
		type: T['type'],
		body: Omit<T, 'source' | 'type'>
	): void;
}

export const createPosterForVsCode = (docode: WebviewApi<unknown>, settingsManager: SettingsManager): MessagePoster => {
	return {
		postMessage<T extends FromWebviewMessage.Type>(
			type: T['type'],
			body: Omit<T, 'source' | 'type'>
		): void {
			docode.postMessage({
				type,
				source: settingsManager.settings!.source,
				...body
			});
		}
	};
};

