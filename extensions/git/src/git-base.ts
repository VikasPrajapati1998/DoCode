/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { extensions } from 'docode';
import { API as GitBaseAPI, GitBaseExtension } from './typings/git-base';

export class GitBaseApi {

	private static _gitBaseApi: GitBaseAPI | undefined;

	static getAPI(): GitBaseAPI {
		if (!this._gitBaseApi) {
			const gitBaseExtension = extensions.getExtension<GitBaseExtension>('docode.git-base')!.exports;
			const onDidChangeGitBaseExtensionEnablement = (enabled: boolean) => {
				this._gitBaseApi = enabled ? gitBaseExtension.getAPI(1) : undefined;
			};

			gitBaseExtension.onDidChangeEnablement(onDidChangeGitBaseExtensionEnablement);
			onDidChangeGitBaseExtensionEnablement(gitBaseExtension.enabled);

			if (!this._gitBaseApi) {
				throw new Error('docode.git-base extension is not enabled.');
			}
		}

		return this._gitBaseApi;
	}
}
