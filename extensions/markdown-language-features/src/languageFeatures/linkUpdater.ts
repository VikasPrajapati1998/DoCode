/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as picomatch from 'picomatch';
import * as docode from 'docode';
import { TextDocumentEdit } from 'vscode-languageclient';
import { Utils } from 'vscode-uri';
import { MdLanguageClient } from '../client/client';
import { Delayer } from '../util/async';
import { noopToken } from '../util/cancellation';
import { Disposable } from '../util/dispose';
import { convertRange } from './fileReferences';


const settingNames = Object.freeze({
	enabled: 'updateLinksOnFileMove.enabled',
	include: 'updateLinksOnFileMove.include',
	enableForDirectories: 'updateLinksOnFileMove.enableForDirectories',
});

const enum UpdateLinksOnFileMoveSetting {
	Prompt = 'prompt',
	Always = 'always',
	Never = 'never',
}

interface RenameAction {
	readonly oldUri: docode.Uri;
	readonly newUri: docode.Uri;
}

class UpdateLinksOnFileRenameHandler extends Disposable {

	readonly #delayer = new Delayer(50);
	readonly #pendingRenames = new Set<RenameAction>();
	readonly #client: MdLanguageClient;

	public constructor(
		client: MdLanguageClient,
	) {
		super();
		this.#client = client;

		this._register(docode.workspace.onDidRenameFiles(async (e) => {
			await Promise.all(e.files.map(async (rename) => {
				if (await this.#shouldParticipateInLinkUpdate(rename.newUri)) {
					this.#pendingRenames.add(rename);
				}
			}));

			if (this.#pendingRenames.size) {
				this.#delayer.trigger(() => {
					docode.window.withProgress({
						location: docode.ProgressLocation.Window,
						title: docode.l10n.t("Checking for Markdown links to update")
					}, () => this.#flushRenames());
				});
			}
		}));
	}

	async #flushRenames(): Promise<void> {
		const renames = Array.from(this.#pendingRenames);
		this.#pendingRenames.clear();

		const result = await this.#getEditsForFileRename(renames, noopToken);

		if (result?.edit.size) {
			if (await this.#confirmActionWithUser(result.resourcesBeingRenamed)) {
				await docode.workspace.applyEdit(result.edit);
			}
		}
	}

	async #confirmActionWithUser(newResources: readonly docode.Uri[]): Promise<boolean> {
		if (!newResources.length) {
			return false;
		}

		const config = docode.workspace.getConfiguration('markdown', newResources[0]);
		const setting = config.get<UpdateLinksOnFileMoveSetting>(settingNames.enabled);
		switch (setting) {
			case UpdateLinksOnFileMoveSetting.Prompt:
				return this.#promptUser(newResources);
			case UpdateLinksOnFileMoveSetting.Always:
				return true;
			case UpdateLinksOnFileMoveSetting.Never:
			default:
				return false;
		}
	}
	async #shouldParticipateInLinkUpdate(newUri: docode.Uri): Promise<boolean> {
		const config = docode.workspace.getConfiguration('markdown', newUri);
		const setting = config.get<UpdateLinksOnFileMoveSetting>(settingNames.enabled);
		if (setting === UpdateLinksOnFileMoveSetting.Never) {
			return false;
		}

		const externalGlob = config.get<string[]>(settingNames.include);
		if (externalGlob) {
			for (const glob of externalGlob) {
				if (picomatch.isMatch(newUri.fsPath, glob)) {
					return true;
				}
			}
		}

		const stat = await docode.workspace.fs.stat(newUri);
		if (stat.type === docode.FileType.Directory) {
			return config.get<boolean>(settingNames.enableForDirectories, true);
		}

		return false;
	}

	async #promptUser(newResources: readonly docode.Uri[]): Promise<boolean> {
		if (!newResources.length) {
			return false;
		}

		const rejectItem: docode.MessageItem = {
			title: docode.l10n.t("No"),
			isCloseAffordance: true,
		};

		const acceptItem: docode.MessageItem = {
			title: docode.l10n.t("Yes"),
		};

		const alwaysItem: docode.MessageItem = {
			title: docode.l10n.t("Always"),
		};

		const neverItem: docode.MessageItem = {
			title: docode.l10n.t("Never"),
		};

		const choice = await docode.window.showInformationMessage(
			newResources.length === 1
				? docode.l10n.t("Update Markdown links for '{0}'?", Utils.basename(newResources[0]))
				: this.#getConfirmMessage(docode.l10n.t("Update Markdown links for the following {0} files?", newResources.length), newResources), {
			modal: true,
		}, rejectItem, acceptItem, alwaysItem, neverItem);

		switch (choice) {
			case acceptItem: {
				return true;
			}
			case rejectItem: {
				return false;
			}
			case alwaysItem: {
				const config = docode.workspace.getConfiguration('markdown', newResources[0]);
				config.update(
					settingNames.enabled,
					UpdateLinksOnFileMoveSetting.Always,
					this.#getConfigTargetScope(config, settingNames.enabled));
				return true;
			}
			case neverItem: {
				const config = docode.workspace.getConfiguration('markdown', newResources[0]);
				config.update(
					settingNames.enabled,
					UpdateLinksOnFileMoveSetting.Never,
					this.#getConfigTargetScope(config, settingNames.enabled));
				return false;
			}
			default: {
				return false;
			}
		}
	}

	async #getEditsForFileRename(renames: readonly RenameAction[], token: docode.CancellationToken): Promise<{ edit: docode.WorkspaceEdit; resourcesBeingRenamed: docode.Uri[] } | undefined> {
		const result = await this.#client.getEditForFileRenames(renames.map(rename => ({ oldUri: rename.oldUri.toString(), newUri: rename.newUri.toString() })), token);
		if (!result?.edit.documentChanges?.length) {
			return undefined;
		}

		const workspaceEdit = new docode.WorkspaceEdit();

		for (const change of result.edit.documentChanges as TextDocumentEdit[]) {
			const uri = docode.Uri.parse(change.textDocument.uri);
			for (const edit of change.edits) {
				workspaceEdit.replace(uri, convertRange(edit.range), edit.newText);
			}
		}

		return {
			edit: workspaceEdit,
			resourcesBeingRenamed: result.participatingRenames.map(x => docode.Uri.parse(x.newUri)),
		};
	}

	#getConfirmMessage(start: string, resourcesToConfirm: readonly docode.Uri[]): string {
		const MAX_CONFIRM_FILES = 10;

		const paths = [start];
		paths.push('');
		paths.push(...resourcesToConfirm.slice(0, MAX_CONFIRM_FILES).map(r => Utils.basename(r)));

		if (resourcesToConfirm.length > MAX_CONFIRM_FILES) {
			if (resourcesToConfirm.length - MAX_CONFIRM_FILES === 1) {
				paths.push(docode.l10n.t("...1 additional file not shown"));
			} else {
				paths.push(docode.l10n.t("...{0} additional files not shown", resourcesToConfirm.length - MAX_CONFIRM_FILES));
			}
		}

		paths.push('');
		return paths.join('\n');
	}

	#getConfigTargetScope(config: docode.WorkspaceConfiguration, settingsName: string): docode.ConfigurationTarget {
		const inspected = config.inspect(settingsName);
		if (inspected?.workspaceFolderValue) {
			return docode.ConfigurationTarget.WorkspaceFolder;
		}

		if (inspected?.workspaceValue) {
			return docode.ConfigurationTarget.Workspace;
		}

		return docode.ConfigurationTarget.Global;
	}
}

export function registerUpdateLinksOnRename(client: MdLanguageClient): docode.Disposable {
	return new UpdateLinksOnFileRenameHandler(client);
}
