/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as docode from 'docode';
import { GitHubSessionEngine, UriEventHandler } from './github';
import { GitHubEnterpriseAuthenticationProvider } from './githubEnterprise';
import { enterpriseUrisSetting, getEnterpriseUris } from './common/enterpriseConfiguration';
import { enterpriseUriSetting } from './common/enterpriseStorage';
import { getSafeNotificationMessage } from './common/notification';

export async function activate(context: docode.ExtensionContext) {
	const uriHandler = new UriEventHandler();
	context.subscriptions.push(uriHandler);
	context.subscriptions.push(docode.window.registerUriHandler(uriHandler));

	const github = new GitHubSessionEngine(context, uriHandler);
	context.subscriptions.push(github);
	context.subscriptions.push(docode.authentication.registerAuthenticationProvider('github', 'GitHub', github, {
		supportsMultipleAccounts: true,
		supportedAuthorizationServers: [docode.Uri.parse('https://github.com/login/oauth')]
	}));

	const githubEnterpriseAuthProvider = new GitHubEnterpriseAuthenticationProvider(context, uriHandler);
	context.subscriptions.push(githubEnterpriseAuthProvider);
	const updateEnterpriseConfiguration = async () => {
		const configuration = docode.workspace.getConfiguration();
		let uris: docode.Uri[];
		try {
			uris = getEnterpriseUris(configuration, docode.workspace.isTrusted);
		} catch (error) {
			const safeMessage = getSafeNotificationMessage(
				error.message,
				docode.l10n.t('Invalid GitHub Enterprise instance URI.'),
			);
			await githubEnterpriseAuthProvider.update([], { error: safeMessage });
			void docode.window.showErrorMessage(safeMessage, { notificationId: 'githubAuthentication.enterprise.invalidUri' });
			return;
		}
		const legacy = configuration.get<string>(enterpriseUriSetting);
		const legacyUri = typeof legacy === 'string' && /^https?:\/\//i.test(legacy) ? docode.Uri.parse(legacy) : undefined;
		await githubEnterpriseAuthProvider.update(uris, { legacyUri });
	};
	const refreshEnterpriseConfiguration = async () => {
		try {
			await updateEnterpriseConfiguration();
		} catch (error) {
			void docode.window.showErrorMessage(getSafeNotificationMessage(
				docode.l10n.t('Could not update GitHub Enterprise authentication: {0}', error instanceof Error ? error.message : String(error)),
				docode.l10n.t('Could not update GitHub Enterprise authentication.'),
			), { notificationId: 'githubAuthentication.enterprise.updateFailed' });
		}
	};
	context.subscriptions.push(docode.workspace.onDidChangeConfiguration(e => {
		if (e.affectsConfiguration(enterpriseUrisSetting) || e.affectsConfiguration(enterpriseUriSetting)) {
			void refreshEnterpriseConfiguration();
		}
	}));
	context.subscriptions.push(docode.workspace.onDidGrantWorkspaceTrust(refreshEnterpriseConfiguration));
	try {
		await updateEnterpriseConfiguration();
	} catch (error) {
		void docode.window.showErrorMessage(getSafeNotificationMessage(
			docode.l10n.t('Could not initialize GitHub Enterprise authentication: {0}', error instanceof Error ? error.message : String(error)),
			docode.l10n.t('Could not initialize GitHub Enterprise authentication.'),
		), { notificationId: 'githubAuthentication.enterprise.initializationFailed' });
	}

	// Listener to prompt for reload when the fetch implementation setting changes
	const beforeFetchSetting = docode.workspace.getConfiguration().get<boolean>('github-authentication.useElectronFetch', true);
	context.subscriptions.push(docode.workspace.onDidChangeConfiguration(async e => {
		if (e.affectsConfiguration('github-authentication.useElectronFetch')) {
			const afterFetchSetting = docode.workspace.getConfiguration().get<boolean>('github-authentication.useElectronFetch', true);
			if (beforeFetchSetting !== afterFetchSetting) {
				const selection = await docode.window.showInformationMessage(
					docode.l10n.t('GitHub Authentication - Reload required'),
					{
						modal: true,
						detail: docode.l10n.t('A reload is required for the fetch setting change to take effect.')
					},
					docode.l10n.t('Reload Window')
				);
				if (selection) {
					await docode.commands.executeCommand('workbench.action.reloadWindow');
				}
			}
		}
	}));
}
