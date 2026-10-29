/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as docode from 'docode';
import { Command } from '../commandManager';
import { DynamicPreviewSettings, MarkdownPreviewManager } from '../preview/previewManager';
import { TelemetryReporter } from '../telemetryReporter';


interface ShowPreviewSettings {
	readonly sideBySide?: boolean;
	readonly locked?: boolean;
}

async function showPreview(
	webviewManager: MarkdownPreviewManager,
	telemetryReporter: TelemetryReporter,
	uri: docode.Uri | undefined,
	previewSettings: ShowPreviewSettings,
): Promise<any> {
	let resource = uri;
	if (!(resource instanceof docode.Uri)) {
		if (docode.window.activeTextEditor) {
			// we are relaxed and don't check for markdown files
			resource = docode.window.activeTextEditor.document.uri;
		}
	}

	if (!(resource instanceof docode.Uri)) {
		if (!docode.window.activeTextEditor) {
			// this is most likely toggling the preview
			return docode.commands.executeCommand('markdown.showSource');
		}
		// nothing found that could be shown or toggled
		return;
	}

	const resourceColumn = docode.window.activeTextEditor?.viewColumn || docode.ViewColumn.One;
	webviewManager.openDynamicPreview(resource, {
		resourceColumn: resourceColumn,
		previewColumn: previewSettings.sideBySide ? docode.ViewColumn.Beside : resourceColumn,
		locked: !!previewSettings.locked
	});

	telemetryReporter.sendTelemetryEvent('openPreview', {
		where: previewSettings.sideBySide ? 'sideBySide' : 'inPlace',
		how: (uri instanceof docode.Uri) ? 'action' : 'pallete'
	});
}

export class ShowPreviewCommand implements Command {
	public readonly id = 'markdown.showPreview';

	readonly #webviewManager: MarkdownPreviewManager;
	readonly #telemetryReporter: TelemetryReporter;

	public constructor(
		webviewManager: MarkdownPreviewManager,
		telemetryReporter: TelemetryReporter
	) {
		this.#webviewManager = webviewManager;
		this.#telemetryReporter = telemetryReporter;
	}

	public execute(mainUri?: docode.Uri, allUris?: docode.Uri[], previewSettings?: DynamicPreviewSettings) {
		for (const uri of Array.isArray(allUris) ? allUris : [mainUri]) {
			showPreview(this.#webviewManager, this.#telemetryReporter, uri, {
				sideBySide: false,
				locked: previewSettings?.locked
			});
		}
	}
}

export class ShowPreviewToSideCommand implements Command {
	public readonly id = 'markdown.showPreviewToSide';

	readonly #webviewManager: MarkdownPreviewManager;
	readonly #telemetryReporter: TelemetryReporter;

	public constructor(
		webviewManager: MarkdownPreviewManager,
		telemetryReporter: TelemetryReporter
	) {
		this.#webviewManager = webviewManager;
		this.#telemetryReporter = telemetryReporter;
	}

	public execute(uri?: docode.Uri, previewSettings?: DynamicPreviewSettings) {
		showPreview(this.#webviewManager, this.#telemetryReporter, uri, {
			sideBySide: true,
			locked: previewSettings?.locked
		});
	}
}


export class ShowLockedPreviewToSideCommand implements Command {
	public readonly id = 'markdown.showLockedPreviewToSide';

	readonly #webviewManager: MarkdownPreviewManager;
	readonly #telemetryReporter: TelemetryReporter;

	public constructor(
		webviewManager: MarkdownPreviewManager,
		telemetryReporter: TelemetryReporter
	) {
		this.#webviewManager = webviewManager;
		this.#telemetryReporter = telemetryReporter;
	}

	public execute(uri?: docode.Uri) {
		showPreview(this.#webviewManager, this.#telemetryReporter, uri, {
			sideBySide: true,
			locked: true
		});
	}
}
