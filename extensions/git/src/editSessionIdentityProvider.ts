/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as docode from 'docode';
import { RefType } from './api/git.constants';
import { Model } from './model';

export class GitEditSessionIdentityProvider implements docode.EditSessionIdentityProvider, docode.Disposable {

	private providerRegistration: docode.Disposable;

	constructor(private model: Model) {
		this.providerRegistration = docode.Disposable.from(
			docode.workspace.registerEditSessionIdentityProvider('file', this),
			docode.workspace.onWillCreateEditSessionIdentity((e) => {
				e.waitUntil(
					this._onWillCreateEditSessionIdentity(e.workspaceFolder).catch(err => {
						if (err instanceof docode.CancellationError) {
							throw err;
						}
					})
				);
			})
		);
	}

	dispose() {
		this.providerRegistration.dispose();
	}

	async provideEditSessionIdentity(workspaceFolder: docode.WorkspaceFolder, token: docode.CancellationToken): Promise<string | undefined> {
		await this.model.openRepository(path.dirname(workspaceFolder.uri.fsPath));

		const repository = this.model.getRepository(workspaceFolder.uri);
		await repository?.status();

		if (!repository || !repository?.HEAD?.upstream) {
			return undefined;
		}

		const remoteUrl = repository.remotes.find((remote) => remote.name === repository.HEAD?.upstream?.remote)?.pushUrl?.replace(/^(git@[^\/:]+)(:)/i, 'ssh://$1/');
		const remote = remoteUrl ? await docode.workspace.getCanonicalUri(docode.Uri.parse(remoteUrl), { targetScheme: 'https' }, token) : null;

		return JSON.stringify({
			remote: remote?.toString() ?? remoteUrl,
			ref: repository.HEAD?.upstream?.name ?? null,
			sha: repository.HEAD?.commit ?? null,
		});
	}

	provideEditSessionIdentityMatch(identity1: string, identity2: string): docode.EditSessionIdentityMatch {
		try {
			const normalizedIdentity1 = normalizeEditSessionIdentity(identity1);
			const normalizedIdentity2 = normalizeEditSessionIdentity(identity2);

			if (normalizedIdentity1.remote === normalizedIdentity2.remote &&
				normalizedIdentity1.ref === normalizedIdentity2.ref &&
				normalizedIdentity1.sha === normalizedIdentity2.sha) {
				// This is a perfect match
				return docode.EditSessionIdentityMatch.Complete;
			} else if (normalizedIdentity1.remote === normalizedIdentity2.remote &&
				normalizedIdentity1.ref === normalizedIdentity2.ref &&
				normalizedIdentity1.sha !== normalizedIdentity2.sha) {
				// Same branch and remote but different SHA
				return docode.EditSessionIdentityMatch.Partial;
			} else {
				return docode.EditSessionIdentityMatch.None;
			}
		} catch (ex) {
			return docode.EditSessionIdentityMatch.Partial;
		}
	}

	private async _onWillCreateEditSessionIdentity(workspaceFolder: docode.WorkspaceFolder): Promise<void> {
		await this._doPublish(workspaceFolder);
	}

	private async _doPublish(workspaceFolder: docode.WorkspaceFolder) {
		await this.model.openRepository(path.dirname(workspaceFolder.uri.fsPath));

		const repository = this.model.getRepository(workspaceFolder.uri);
		if (!repository) {
			return;
		}

		await repository.status();

		if (!repository.HEAD?.commit) {
			// Handle publishing empty repository with no commits

			const yes = docode.l10n.t('Yes');
			const selection = await docode.window.showInformationMessage(
				docode.l10n.t('Would you like to publish this repository to continue working on it elsewhere?'),
				{ modal: true },
				yes
			);
			if (selection !== yes) {
				throw new docode.CancellationError();
			}
			await repository.commit('Initial commit', { all: true });
			await docode.commands.executeCommand('git.publish');
		} else if (!repository.HEAD?.upstream && repository.HEAD?.type === RefType.Head) {
			// If this branch hasn't been published to the remote yet,
			// ensure that it is published before Continue On is invoked

			const publishBranch = docode.l10n.t('Publish Branch');
			const selection = await docode.window.showInformationMessage(
				docode.l10n.t('The current branch is not published to the remote. Would you like to publish it to access your changes elsewhere?'),
				{ modal: true },
				publishBranch
			);
			if (selection !== publishBranch) {
				throw new docode.CancellationError();
			}

			await docode.commands.executeCommand('git.publish');
		}
	}
}

function normalizeEditSessionIdentity(identity: string) {
	let { remote, ref, sha } = JSON.parse(identity);

	if (typeof remote === 'string' && remote.endsWith('.git')) {
		remote = remote.slice(0, remote.length - 4);
	}

	return {
		remote,
		ref,
		sha
	};
}
