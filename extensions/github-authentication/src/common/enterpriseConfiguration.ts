/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as docode from 'docode';
import { enterpriseUriSetting } from './enterpriseStorage';

export const enterpriseUrisSetting = 'github-enterprise.uris';

export function getEnterpriseUris(configuration: docode.WorkspaceConfiguration, isWorkspaceTrusted: boolean): docode.Uri[] {
	const inspected = configuration.inspect<string[]>(enterpriseUrisSetting);
	const hasPluralValue = inspected && (inspected.globalValue !== undefined || (isWorkspaceTrusted && (inspected.workspaceValue !== undefined || inspected.workspaceFolderValue !== undefined)));
	const legacy = configuration.get<string>(enterpriseUriSetting);
	const values = hasPluralValue ? configuration.get<string[]>(enterpriseUrisSetting) : legacy ? [legacy] : [];
	if (!Array.isArray(values)) {
		throw new Error(docode.l10n.t('GitHub Enterprise URIs must be an array of instance URLs.'));
	}
	return values.map(parseEnterpriseUri);
}

function parseEnterpriseUri(value: string): docode.Uri {
	try {
		if (typeof value !== 'string' || !value) {
			throw new Error('Expected a non-empty URI');
		}
		const uri = docode.Uri.parse(value, true);
		const url = new URL(uri.toString());
		const hostname = url.hostname.replace(/\.$/, '');
		const path = uri.path.replace(/\/+$/, '');
		if (!['http:', 'https:'].includes(url.protocol)
			|| !uri.authority || url.username || url.password || uri.query || uri.fragment
			|| ['github.com', 'www.github.com', 'api.github.com'].includes(hostname)
			|| path.includes('//') || path.split('/').some(part => part === '.' || part === '..')) {
			throw new Error('Expected a GitHub Enterprise instance URL');
		}
		return uri;
	} catch {
		throw new Error(docode.l10n.t('Invalid GitHub Enterprise instance URI: {0}', String(value)));
	}
}
