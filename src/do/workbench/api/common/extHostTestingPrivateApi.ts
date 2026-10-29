/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ExtHostTestItemEvent, InvalidTestItemError } from '../../contrib/testing/common/testItemCollection.js';
import * as docode from 'docode';

export interface IExtHostTestItemApi {
	controllerId: string;
	parent?: docode.TestItem;
	listener?: (evt: ExtHostTestItemEvent) => void;
}

const eventPrivateApis = new WeakMap<docode.TestItem, IExtHostTestItemApi>();

export const createPrivateApiFor = (impl: docode.TestItem, controllerId: string) => {
	const api: IExtHostTestItemApi = { controllerId };
	eventPrivateApis.set(impl, api);
	return api;
};

/**
 * Gets the private API for a test item implementation. This implementation
 * is a managed object, but we keep a weakmap to avoid exposing any of the
 * internals to extensions.
 */
export const getPrivateApiFor = (impl: docode.TestItem) => {
	const api = eventPrivateApis.get(impl);
	if (!api) {
		throw new InvalidTestItemError(impl?.id || '<unknown>');
	}

	return api;
};
