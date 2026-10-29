/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as docode from 'docode';
import * as interfaces from './interfaces';

export default class MergeConflictCodeLensProvider implements docode.CodeLensProvider, docode.Disposable {
	private codeLensRegistrationHandle?: docode.Disposable | null;
	private config?: interfaces.IExtensionConfiguration;
	private tracker: interfaces.IDocumentMergeConflictTracker;

	constructor(trackerService: interfaces.IDocumentMergeConflictTrackerService) {
		this.tracker = trackerService.createTracker('codelens');
	}

	begin(config: interfaces.IExtensionConfiguration) {
		this.config = config;

		if (this.config.enableCodeLens) {
			this.registerCodeLensProvider();
		}
	}

	configurationUpdated(updatedConfig: interfaces.IExtensionConfiguration) {

		if (updatedConfig.enableCodeLens === false && this.codeLensRegistrationHandle) {
			this.codeLensRegistrationHandle.dispose();
			this.codeLensRegistrationHandle = null;
		}
		else if (updatedConfig.enableCodeLens === true && !this.codeLensRegistrationHandle) {
			this.registerCodeLensProvider();
		}

		this.config = updatedConfig;
	}


	dispose() {
		if (this.codeLensRegistrationHandle) {
			this.codeLensRegistrationHandle.dispose();
			this.codeLensRegistrationHandle = null;
		}
	}

	async provideCodeLenses(document: docode.TextDocument, _token: docode.CancellationToken): Promise<docode.CodeLens[] | null> {

		if (!this.config || !this.config.enableCodeLens) {
			return null;
		}

		const conflicts = await this.tracker.getConflicts(document);
		const conflictsCount = conflicts?.length ?? 0;
		docode.commands.executeCommand('setContext', 'mergeConflictsCount', conflictsCount);

		if (!conflictsCount) {
			return null;
		}

		const items: docode.CodeLens[] = [];

		conflicts.forEach(conflict => {
			const acceptCurrentCommand: docode.Command = {
				command: 'merge-conflict.accept.current',
				title: docode.l10n.t("Accept Current Change"),
				arguments: ['known-conflict', conflict]
			};

			const acceptIncomingCommand: docode.Command = {
				command: 'merge-conflict.accept.incoming',
				title: docode.l10n.t("Accept Incoming Change"),
				arguments: ['known-conflict', conflict]
			};

			const acceptBothCommand: docode.Command = {
				command: 'merge-conflict.accept.both',
				title: docode.l10n.t("Accept Both Changes"),
				arguments: ['known-conflict', conflict]
			};

			const diffCommand: docode.Command = {
				command: 'merge-conflict.compare',
				title: docode.l10n.t("Compare Changes"),
				arguments: [conflict]
			};

			const range = document.lineAt(conflict.range.start.line).range;
			items.push(
				new docode.CodeLens(range, acceptCurrentCommand),
				new docode.CodeLens(range, acceptIncomingCommand),
				new docode.CodeLens(range, acceptBothCommand),
				new docode.CodeLens(range, diffCommand)
			);
		});

		return items;
	}

	private registerCodeLensProvider() {
		this.codeLensRegistrationHandle = docode.languages.registerCodeLensProvider([
			{ scheme: 'file' },
			{ scheme: 'docode-vfs' },
			{ scheme: 'untitled' },
			{ scheme: 'docode-userdata' },
		], this);
	}
}
