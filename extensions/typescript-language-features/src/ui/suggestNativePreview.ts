/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as docode from 'docode';
import { getTsNativeExtension, tsNativeExtensionOldId } from '../commands/useTsgo';
import { ExperimentationService } from '../experimentationService';
import type { PluginManager } from '../tsServer/plugins.js';
import { copilotChatExtensionId } from '../typescriptServiceClient.js';
import { hasModifiedUnifiedConfig } from '../utils/configuration';

const suggestTS7NoPluginsStorageKey = 'typescript.suggestTS7NoPlugins.dismissed';

export async function suggestNativePreview(
	context: docode.ExtensionContext,
	experimentationService: ExperimentationService,
	pluginManager: PluginManager
): Promise<void> {
	if (context.globalState.get<boolean>(suggestTS7NoPluginsStorageKey)) {
		return;
	}

	// Only show when the window is active
	if (!docode.window.state.active) {
		return;
	}

	// Don't show if the TypeScript 7 extension is already installed,
	// or if we have any settings indicating it was installed previously.
	if (getTsNativeExtension() || hasModifiedUnifiedConfig('experimental.useTsgo', { fallbackSection: 'typescript' })) {
		// Also don't prompt in the future.
		await context.globalState.update(suggestTS7NoPluginsStorageKey, true);
		return;
	}

	// TSServer plugins are not supported by TypeScript 7
	if (pluginManager.plugins.some(plugin => plugin.extension.id.toLowerCase() !== copilotChatExtensionId)) {
		return;
	}

	const inExperiment = await experimentationService.getTreatmentVariable('suggestTS7IfNoPlugins', false);
	if (!inExperiment) {
		return;
	}

	const install: docode.MessageItem = { title: docode.l10n.t("Install") };
	const learnMore: docode.MessageItem = { title: docode.l10n.t("Learn More") };
	const dismiss: docode.MessageItem = { title: docode.l10n.t("Don't Show Again") };

	const selection = await docode.window.showInformationMessage(
		docode.l10n.t("Try TypeScript 7 for significantly faster type checking and language features."),
		{ notificationId: 'typescript.nativePreview' },
		install,
		learnMore,
		dismiss,
	);
	// Don't show again
	await context.globalState.update(suggestTS7NoPluginsStorageKey, true);

	if (selection === install) {
		await docode.commands.executeCommand('workbench.extensions.installExtension', tsNativeExtensionOldId);
	} else if (selection === learnMore) {
		await docode.env.openExternal(docode.Uri.parse('https://aka.ms/typescript7'));
	}
}
