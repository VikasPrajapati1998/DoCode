/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as docode from 'docode';
import { readUnifiedConfig, unifiedConfigSection } from '../utils/configuration';
import { Command } from './commandManager';

export const tsNativeExtensionOldId = 'typescriptteam.native-preview';
export const tsNativeExtensionIds = [
	'typescriptteam.docode-typescript',
	'typescriptteam.docode-typescript-nightly',
	tsNativeExtensionOldId
] as const;

export function getTsNativeExtension(): docode.Extension<unknown> | undefined {
	for (const extensionId of tsNativeExtensionIds) {
		const extension = docode.extensions.getExtension(extensionId);
		if (extension) {
			return extension;
		}
	}

	return undefined;
}

export class EnableTsgoCommand implements Command {
	public readonly id = 'typescript.experimental.enableTsgo';

	public async execute(): Promise<void> {
		await updateTsgoSetting(true);
	}
}

export class DisableTsgoCommand implements Command {
	public readonly id = 'typescript.experimental.disableTsgo';

	public async execute(): Promise<void> {
		await updateTsgoSetting(false);
	}
}

/**
 * Updates the TypeScript Go setting and reloads extension host.
 * @param enable Whether to enable or disable TypeScript Go
 */
async function updateTsgoSetting(enable: boolean): Promise<void> {
	const tsgoExtension = getTsNativeExtension();
	// Error if the TypeScript Go extension is not installed with a button to open the GitHub repo
	if (!tsgoExtension) {
		const selection = await docode.window.showErrorMessage(
			docode.l10n.t('The TypeScript Go extension is not installed.'),
			{
				title: docode.l10n.t('Open on GitHub'),
				isCloseAffordance: true,
			}
		);

		if (selection) {
			await docode.env.openExternal(docode.Uri.parse('https://github.com/microsoft/typescript-go'));
		}
	}

	const currentValue = readUnifiedConfig<boolean>('experimental.useTsgo', false, { fallbackSection: 'typescript' });
	if (currentValue === enable) {
		return;
	}

	// Determine the target scope for the configuration update
	let target = docode.ConfigurationTarget.Global;
	const unifiedConfig = docode.workspace.getConfiguration(unifiedConfigSection);
	const inspect = unifiedConfig.inspect<boolean>('experimental.useTsgo');
	const legacyInspect = docode.workspace.getConfiguration('typescript').inspect<boolean>('experimental.useTsgo');
	if (inspect?.workspaceValue !== undefined || legacyInspect?.workspaceValue !== undefined) {
		target = docode.ConfigurationTarget.Workspace;
	} else if (inspect?.workspaceFolderValue !== undefined || legacyInspect?.workspaceFolderValue !== undefined) {
		target = docode.ConfigurationTarget.WorkspaceFolder;
	} else {
		// If setting is not defined yet, use the same scope as typescript-go.executablePath
		const tsgoConfig = docode.workspace.getConfiguration('typescript-go');
		const tsgoInspect = tsgoConfig.inspect<string>('executablePath');

		if (tsgoInspect?.workspaceValue !== undefined) {
			target = docode.ConfigurationTarget.Workspace;
		} else if (tsgoInspect?.workspaceFolderValue !== undefined) {
			target = docode.ConfigurationTarget.WorkspaceFolder;
		}
	}

	await unifiedConfig.update('experimental.useTsgo', enable, target);
}
