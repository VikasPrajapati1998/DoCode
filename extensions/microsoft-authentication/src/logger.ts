/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as docode from 'docode';

const Logger = docode.window.createOutputChannel(docode.l10n.t('Microsoft Authentication'), { log: true });
export default Logger;
