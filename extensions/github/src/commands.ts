/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as docode from 'docode';
import { RefType } from './typings/git.constants.js';
import type { API as GitAPI, Repository } from './typings/git.d.ts';
import { publishRepository } from './publish.js';
import { DisposableStore, getRepositoryFromUrl } from './util.js';
import { LinkContext, getCommitLink, getLink, getDocodeDevHost } from './links.js';
import { getOctokit } from './auth.js';

async function copyDocodeDevLink(gitAPI: GitAPI, useSelection: boolean, context: LinkContext, includeRange = true) {
	try {
		const permalink = await getLink(gitAPI, useSelection, true, getDocodeDevHost(), 'headlink', context, includeRange);
		if (permalink) {
			return docode.env.clipboard.writeText(permalink);
		}
	} catch (err) {
		if (!(err instanceof docode.CancellationError)) {
			docode.window.showErrorMessage(err.message);
		}
	}
}

async function openDocodeDevLink(gitAPI: GitAPI): Promise<docode.Uri | undefined> {
	try {
		const headlink = await getLink(gitAPI, true, false, getDocodeDevHost(), 'headlink');
		return headlink ? docode.Uri.parse(headlink) : undefined;
	} catch (err) {
		if (!(err instanceof docode.CancellationError)) {
			docode.window.showErrorMessage(err.message);
		}
		return undefined;
	}
}

interface ResolvedSessionRepo {
	repository: Repository;
	remoteInfo: { owner: string; repo: string };
	gitRemote: { name: string; fetchUrl: string };
	head: { name: string; upstream?: { name: string; remote: string; commit: string } };
}

function resolveSessionRepo(gitAPI: GitAPI, sessionMetadata: { worktreePath?: string } | undefined, showErrors: boolean): ResolvedSessionRepo | undefined {
	if (!sessionMetadata?.worktreePath) {
		return undefined;
	}

	const worktreeUri = docode.Uri.file(sessionMetadata.worktreePath);
	const repository = gitAPI.getRepository(worktreeUri);

	if (!repository) {
		if (showErrors) {
			docode.window.showErrorMessage(docode.l10n.t('Could not find a git repository for the session worktree.'));
		}
		return undefined;
	}

	const remotes = repository.state.remotes
		.filter(remote => remote.fetchUrl && getRepositoryFromUrl(remote.fetchUrl));

	if (remotes.length === 0) {
		if (showErrors) {
			docode.window.showErrorMessage(docode.l10n.t('Could not find a GitHub remote for this repository.'));
		}
		return undefined;
	}

	const gitRemote = remotes.find(r => r.name === 'upstream')
		?? remotes.find(r => r.name === 'origin')
		?? remotes[0];

	const remoteInfo = getRepositoryFromUrl(gitRemote.fetchUrl!);
	if (!remoteInfo) {
		if (showErrors) {
			docode.window.showErrorMessage(docode.l10n.t('Could not parse GitHub remote URL.'));
		}
		return undefined;
	}

	const head = repository.state.HEAD;
	if (!head?.name) {
		if (showErrors) {
			docode.window.showErrorMessage(docode.l10n.t('Could not determine the current branch.'));
		}
		return undefined;
	}

	return { repository, remoteInfo, gitRemote: { name: gitRemote.name, fetchUrl: gitRemote.fetchUrl! }, head: head as ResolvedSessionRepo['head'] };
}

async function createPullRequest(gitAPI: GitAPI, sessionResource: docode.Uri | undefined, sessionMetadata: { worktreePath?: string } | undefined): Promise<void> {
	if (!sessionResource) {
		return;
	}

	const resolved = resolveSessionRepo(gitAPI, sessionMetadata, true);
	if (!resolved) {
		return;
	}

	const { repository, remoteInfo, gitRemote, head } = resolved;

	// Ensure the branch is published to the remote
	if (!head.upstream) {
		try {
			await docode.window.withProgress(
				{ location: docode.ProgressLocation.Notification, title: docode.l10n.t('Publishing branch to {0}...', gitRemote.name) },
				async () => {
					await repository.push(gitRemote.name, head.name, true);
				}
			);
		} catch (err) {
			docode.window.showErrorMessage(docode.l10n.t('Failed to publish branch: {0}', err instanceof Error ? err.message : String(err)));
			return;
		}
	}

	// Build the GitHub PR creation URL
	// Format: https://github.com/owner/repo/compare/base...head
	const prUrl = `https://github.com/${remoteInfo.owner}/${remoteInfo.repo}/compare/${head.name}?expand=1`;

	docode.env.openExternal(docode.Uri.parse(prUrl));
}

async function openPullRequest(gitAPI: GitAPI, _sessionResource: docode.Uri | undefined, sessionMetadata: { worktreePath?: string } | undefined): Promise<void> {
	const resolved = resolveSessionRepo(gitAPI, sessionMetadata, true);
	if (!resolved) {
		return;
	}

	try {
		const octokit = await getOctokit();
		const { data: pullRequests } = await octokit.pulls.list({
			owner: resolved.remoteInfo.owner,
			repo: resolved.remoteInfo.repo,
			head: `${resolved.remoteInfo.owner}:${resolved.head.name}`,
			state: 'all',
		});

		if (pullRequests.length > 0) {
			docode.env.openExternal(docode.Uri.parse(pullRequests[0].html_url));
			return;
		}
	} catch {
		// If the API call fails, fall through to open the repo page
	}

	// Fallback: open the repository page
	const { remoteInfo } = resolved;
	docode.env.openExternal(docode.Uri.parse(`https://github.com/${remoteInfo.owner}/${remoteInfo.repo}`));
}

async function openOnGitHub(repository: Repository, commit: string): Promise<void> {
	// Get the unique remotes that contain the commit
	const branches = await repository.getBranches({ contains: commit, remote: true });
	const remoteNames = new Set(branches.filter(b => b.type === RefType.RemoteHead && b.remote).map(b => b.remote!));

	// GitHub remotes that contain the commit
	const remotes = repository.state.remotes
		.filter(r => remoteNames.has(r.name) && r.fetchUrl && getRepositoryFromUrl(r.fetchUrl));

	if (remotes.length === 0) {
		docode.window.showInformationMessage(docode.l10n.t('No GitHub remotes found that contain this commit.'));
		return;
	}

	// upstream -> origin -> first
	const remote = remotes.find(r => r.name === 'upstream')
		?? remotes.find(r => r.name === 'origin')
		?? remotes[0];

	const link = getCommitLink(remote.fetchUrl!, commit);
	docode.env.openExternal(docode.Uri.parse(link));
}

export function registerCommands(gitAPI: GitAPI): docode.Disposable {
	const disposables = new DisposableStore();

	disposables.add(docode.commands.registerCommand('github.publish', async () => {
		try {
			publishRepository(gitAPI);
		} catch (err) {
			docode.window.showErrorMessage(err.message);
		}
	}));

	disposables.add(docode.commands.registerCommand('github.copyDocodeDevLink', async (context: LinkContext) => {
		return copyDocodeDevLink(gitAPI, true, context);
	}));

	disposables.add(docode.commands.registerCommand('github.copyDocodeDevLinkFile', async (context: LinkContext) => {
		return copyDocodeDevLink(gitAPI, false, context);
	}));

	disposables.add(docode.commands.registerCommand('github.copyDocodeDevLinkWithoutRange', async (context: LinkContext) => {
		return copyDocodeDevLink(gitAPI, true, context, false);
	}));

	disposables.add(docode.commands.registerCommand('github.openOnGitHub', async (url: string, historyItemId: string) => {
		const link = getCommitLink(url, historyItemId);
		docode.env.openExternal(docode.Uri.parse(link));
	}));

	disposables.add(docode.commands.registerCommand('github.graph.openOnGitHub', async (repository: docode.SourceControl, historyItem: docode.SourceControlHistoryItem) => {
		if (!repository || !historyItem) {
			return;
		}

		const apiRepository = gitAPI.repositories.find(r => r.rootUri.fsPath === repository.rootUri?.fsPath);
		if (!apiRepository) {
			return;
		}

		await openOnGitHub(apiRepository, historyItem.id);
	}));

	disposables.add(docode.commands.registerCommand('github.timeline.openOnGitHub', async (item: docode.TimelineItem, uri: docode.Uri) => {
		if (!item.id || !uri) {
			return;
		}

		const apiRepository = gitAPI.getRepository(uri);
		if (!apiRepository) {
			return;
		}

		await openOnGitHub(apiRepository, item.id);
	}));

	disposables.add(docode.commands.registerCommand('github.openOnDocodeDev', async () => {
		return openDocodeDevLink(gitAPI);
	}));

	disposables.add(docode.commands.registerCommand('github.createPullRequest', async (sessionResource: docode.Uri | undefined, sessionMetadata: { worktreePath?: string } | undefined) => {
		return createPullRequest(gitAPI, sessionResource, sessionMetadata);
	}));

	disposables.add(docode.commands.registerCommand('github.openPullRequest', async (sessionResource: docode.Uri | undefined, sessionMetadata: { worktreePath?: string } | undefined) => {
		return openPullRequest(gitAPI, sessionResource, sessionMetadata);
	}));

	return disposables;
}
