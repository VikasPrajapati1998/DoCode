/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as docode from 'docode';
import { conditionalRegistration, requireGlobalUnifiedConfig } from '../languageFeatures/util/dependentRegistration';
import { supportsReadableByteStreams } from '../utils/platform';
import { AutoInstallerFs } from './autoInstallerFs';
import { MemFs } from './memFs';
import { Logger } from '../logging/logger';

export function registerAtaSupport(logger: Logger): docode.Disposable {
	if (!supportsReadableByteStreams()) {
		return docode.Disposable.from();
	}

	return conditionalRegistration([
		requireGlobalUnifiedConfig('tsserver.web.typeAcquisition.enabled', { fallbackSection: 'typescript' }),
	], () => {
		return docode.Disposable.from(
			// Ata
			docode.workspace.registerFileSystemProvider('docode-global-typings', new MemFs('global-typings', logger), {
				isCaseSensitive: true,
				isReadonly: false,
			}),

			// Read accesses to node_modules
			docode.workspace.registerFileSystemProvider('docode-node-modules', new AutoInstallerFs(logger), {
				isCaseSensitive: true,
				isReadonly: false
			}));
	});
}
