/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as picomatch from 'picomatch';
import * as docode from 'docode';
import { Utils } from 'vscode-uri';
import { getParentDocumentUri } from '../../util/document';
import { CopyFileConfiguration, getCopyFileConfiguration, parseGlob, resolveCopyDestination } from './copyFiles';


export class NewFilePathGenerator {

	readonly #usedPaths = new Set<string>();

	async getNewFilePath(
		document: docode.TextDocument,
		file: docode.DataTransferFile,
		token: docode.CancellationToken
	): Promise<{ readonly uri: docode.Uri; readonly overwrite: boolean } | undefined> {
		const config = getCopyFileConfiguration(document);
		const desiredPath = getDesiredNewFilePath(config, document, file);

		const root = Utils.dirname(desiredPath);
		const ext = Utils.extname(desiredPath);
		let baseName = Utils.basename(desiredPath);
		baseName = baseName.slice(0, baseName.length - ext.length);
		for (let i = 0; ; ++i) {
			if (token.isCancellationRequested) {
				return undefined;
			}

			const name = i === 0 ? baseName : `${baseName}-${i}`;
			const uri = docode.Uri.joinPath(root, name + ext);
			if (this.#wasPathAlreadyUsed(uri)) {
				continue;
			}

			// Try overwriting if it already exists
			if (config.overwriteBehavior === 'overwrite') {
				this.#usedPaths.add(uri.toString());
				return { uri, overwrite: true };
			}

			// Otherwise we need to check the fs to see if it exists
			try {
				await docode.workspace.fs.stat(uri);
			} catch {
				if (!this.#wasPathAlreadyUsed(uri)) {
					// Does not exist
					this.#usedPaths.add(uri.toString());
					return { uri, overwrite: false };
				}
			}
		}
	}

	#wasPathAlreadyUsed(uri: docode.Uri) {
		return this.#usedPaths.has(uri.toString());
	}
}

export function getDesiredNewFilePath(config: CopyFileConfiguration, document: docode.TextDocument, file: docode.DataTransferFile): docode.Uri {
	const docUri = getParentDocumentUri(document.uri);
	for (const [rawGlob, rawDest] of Object.entries(config.destination)) {
		for (const glob of parseGlob(rawGlob)) {
			if (picomatch.isMatch(docUri.path, glob, { dot: true })) {
				return resolveCopyDestination(docUri, file.name, rawDest, uri => docode.workspace.getWorkspaceFolder(uri)?.uri);
			}
		}
	}

	// Default to next to current file
	return docode.Uri.joinPath(Utils.dirname(docUri), file.name);
}

