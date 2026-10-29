/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as docode from 'docode';
import { basename } from 'path';

type GitHubApi = Pick<typeof docode.github, 'getClient' | 'getAnonymousClient'>;
type AuthenticationApi = Pick<typeof docode.authentication, 'getSession'>;

export class GitHubGistProfileContentHandler implements docode.ProfileContentHandler {

	readonly name = docode.l10n.t('GitHub');
	readonly description = docode.l10n.t('gist');

	constructor(
		private readonly github: GitHubApi = docode.github,
		private readonly authentication: AuthenticationApi = docode.authentication,
	) { }

	async saveProfile(name: string, content: string, token?: docode.CancellationToken): Promise<{ readonly id: string; readonly link: docode.Uri } | null> {
		this.throwIfCancelled(token);
		const session = await this.authentication.getSession('github', ['gist', 'user:email'], { createIfNone: true });
		this.throwIfCancelled(token);
		const client = await this.github.getClient(session.id, token);
		try {
			this.throwIfCancelled(token);
			const gist = await client.gists.create({
				public: false,
				files: { [name]: { content } }
			}, token);
			if (gist.id && gist.htmlUrl) {
				return { id: gist.id, link: gist.htmlUrl };
			}
			return null;
		} finally {
			client.dispose();
		}
	}

	async readProfile(idOrUri: string | docode.Uri, token?: docode.CancellationToken): Promise<string | null> {
		this.throwIfCancelled(token);
		const gistId = typeof idOrUri === 'string' ? idOrUri : basename(idOrUri.path);
		let client: docode.GitHubAnonymousClient | undefined;
		try {
			client = await this.github.getAnonymousClient(token);
			this.throwIfCancelled(token);
			const gist = await client.gists.get(gistId, token);
			const file = gist.files[0];
			// Truncated or binary inline content is not a usable profile.
			if (!file || file.truncated || file.isBinary) {
				return null;
			}
			return file.content;
		} catch (error) {
			if (error instanceof docode.CancellationError) {
				throw error;
			}
			// Other failures mean the gist cannot be read as a profile.
		} finally {
			client?.dispose();
		}
		return null;
	}

	private throwIfCancelled(token: docode.CancellationToken | undefined): void {
		if (token?.isCancellationRequested) {
			throw new docode.CancellationError();
		}
	}

}

export function registerGitHubGistProfileContentHandler(): docode.Disposable {
	return docode.window.registerProfileContentHandler('github', new GitHubGistProfileContentHandler());
}
