/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IExtensionDescription } from '../../../platform/extensions/common/extensions.js';
import { MainContext, MainThreadBulkEditsShape } from './extHost.protocol.js';
import { ExtHostDocumentsAndEditors } from './extHostDocumentsAndEditors.js';
import { IExtHostRpcService } from './extHostRpcService.js';
import { WorkspaceEdit } from './extHostTypeConverters.js';
import { SerializableObjectWithBuffers } from '../../services/extensions/common/proxyIdentifier.js';
import type * as docode from 'docode';

export class ExtHostBulkEdits {

	private readonly _proxy: MainThreadBulkEditsShape;
	private readonly _versionInformationProvider: WorkspaceEdit.IVersionInformationProvider;

	constructor(
		@IExtHostRpcService extHostRpc: IExtHostRpcService,
		extHostDocumentsAndEditors: ExtHostDocumentsAndEditors,
	) {
		this._proxy = extHostRpc.getProxy(MainContext.MainThreadBulkEdits);

		this._versionInformationProvider = {
			getTextDocumentVersion: uri => extHostDocumentsAndEditors.getDocument(uri)?.version,
			getNotebookDocumentVersion: () => undefined
		};
	}

	applyWorkspaceEdit(edit: docode.WorkspaceEdit, extension: IExtensionDescription, metadata: docode.WorkspaceEditMetadata | undefined): Promise<boolean> {
		const dto = new SerializableObjectWithBuffers(WorkspaceEdit.from(edit, this._versionInformationProvider));
		return this._proxy.$tryApplyWorkspaceEdit(dto, undefined, metadata?.isRefactoring ?? false);
	}
}
