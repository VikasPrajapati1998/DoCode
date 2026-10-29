/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const SharedProcessLifecycle = {
	exit: 'docode:electron-main->shared-process=exit',
	ipcReady: 'docode:shared-process->electron-main=ipc-ready',
	initDone: 'docode:shared-process->electron-main=init-done'
};

export const SharedProcessChannelConnection = {
	request: 'docode:createSharedProcessChannelConnection',
	response: 'docode:createSharedProcessChannelConnectionResult'
};

export const SharedProcessRawConnection = {
	request: 'docode:createSharedProcessRawConnection',
	response: 'docode:createSharedProcessRawConnectionResult'
};
