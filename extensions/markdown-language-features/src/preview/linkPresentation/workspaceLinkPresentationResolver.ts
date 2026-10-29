/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { LinkPresentation } from '@docode/markdown-editor';
import type { IObservable } from '@docode/observables';
import * as docode from 'docode';
import { buildLoadingLinkPresentation, buildWorkspaceLookupFailurePresentation, buildWorkspaceResourcePresentation } from './linkPresentationBuilders';
import { createAsyncLinkPresentation, type LinkPresentationResolver, type LinkPresentationResolverContext } from './linkPresentationResolver';

export class WorkspaceLinkPresentationResolver implements LinkPresentationResolver {
	readonly refreshOnInterval = true;
	readonly #onDidChangeWorkspaceResource = new docode.EventEmitter<void>();
	readonly #subscriptions: docode.Disposable;
	#gitApi: Promise<GitApi | undefined> | undefined;

	constructor() {
		const refresh = () => this.#onDidChangeWorkspaceResource.fire();
		this.#subscriptions = docode.Disposable.from(
			docode.workspace.onDidCreateFiles(refresh),
			docode.workspace.onDidDeleteFiles(refresh),
			docode.workspace.onDidRenameFiles(refresh),
			docode.workspace.onDidSaveTextDocument(refresh),
		);
	}

	resolve(href: string, context: LinkPresentationResolverContext): IObservable<LinkPresentation> | undefined {
		if (!isWorkspaceResourceLink(href)) {
			return undefined;
		}
		return createAsyncLinkPresentation(
			href,
			buildLoadingLinkPresentation('file', docode.l10n.t("Loading")),
			context,
			() => this.#resolve(href),
			error => buildWorkspaceLookupFailurePresentation(
				'file',
				docode.l10n.t("Not found"),
				error instanceof Error ? error.message : docode.l10n.t("The workspace resource could not be resolved."),
				docode.l10n.t("Workspace resource could not be resolved: {0}", href),
			),
			[context.onDidRequestRefresh, this.#onDidChangeWorkspaceResource.event],
		);
	}

	dispose(): void {
		this.#subscriptions.dispose();
		this.#onDidChangeWorkspaceResource.dispose();
	}

	async #resolve(href: string): Promise<LinkPresentation> {
		const uri = docode.Uri.parse(href);
		await docode.workspace.fs.stat(uri);
		const label = docode.workspace.asRelativePath(uri, false);
		const repository = await this.#getGitApi().then(api => api?.getRepository(uri) ?? undefined);
		const branch = repository?.state.HEAD?.name;
		return buildWorkspaceResourcePresentation({
			kind: 'file',
			label,
			href: uri.toString(true),
			branch,
			modified: !!repository && repositoryContainsChange(repository, uri),
		});
	}

	#getGitApi(): Promise<GitApi | undefined> {
		this.#gitApi ??= (async () => {
			const extension = docode.extensions.getExtension<GitExtension>('docode.git');
			const git = await extension?.activate();
			return git?.enabled ? git.getAPI(1) : undefined;
		})();
		return this.#gitApi;
	}
}

function isWorkspaceResourceLink(href: string): boolean {
	return /^(?:file|docode-remote|docode-vfs):/i.test(href);
}

interface GitExtension {
	readonly enabled: boolean;
	getAPI(version: 1): GitApi;
}

interface GitApi {
	getRepository(uri: docode.Uri): GitRepository | null;
}

interface GitRepository {
	readonly rootUri: docode.Uri;
	readonly state: {
		readonly HEAD?: { readonly name?: string };
		readonly mergeChanges: readonly GitChange[];
		readonly indexChanges: readonly GitChange[];
		readonly workingTreeChanges: readonly GitChange[];
		readonly untrackedChanges: readonly GitChange[];
	};
}

interface GitChange {
	readonly uri: docode.Uri;
}

function repositoryContainsChange(repository: GitRepository, uri: docode.Uri): boolean {
	const key = uri.toString();
	const state = repository.state;
	return [
		...state.mergeChanges,
		...state.indexChanges,
		...state.workingTreeChanges,
		...state.untrackedChanges,
	].some(change => change.uri.toString() === key);
}
