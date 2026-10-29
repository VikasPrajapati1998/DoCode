/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as docode from 'docode';

export interface TSConfig {
	readonly uri: docode.Uri;
	readonly fsPath: string;
	readonly posixPath: string;
	readonly workspaceFolder?: docode.WorkspaceFolder;
}

export class TsConfigProvider {
	public async getConfigsForWorkspace(token: docode.CancellationToken): Promise<Iterable<TSConfig>> {
		if (!docode.workspace.workspaceFolders) {
			return [];
		}

		const configs = new Map<string, TSConfig>();
		for (const config of await this.findConfigFiles(token)) {
			const root = docode.workspace.getWorkspaceFolder(config);
			if (root) {
				configs.set(config.fsPath, {
					uri: config,
					fsPath: config.fsPath,
					posixPath: config.path,
					workspaceFolder: root
				});
			}
		}
		return configs.values();
	}

	private async findConfigFiles(token: docode.CancellationToken): Promise<docode.Uri[]> {
		return await docode.workspace.findFiles('**/tsconfig*.json', '**/{node_modules,.*}/**', undefined, token);
	}
}
