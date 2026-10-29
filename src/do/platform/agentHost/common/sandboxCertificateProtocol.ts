/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { vObj, vString } from '../../../base/common/validation.js';

export const InstallSandboxCertificateExtensionMethod = 'docode/installSandboxCertificate';
export const RotateSandboxCertificateExtensionMethod = 'docode/rotateSandboxCertificate';
export const RemoveSandboxCertificateExtensionMethod = 'docode/removeSandboxCertificate';
export const sandboxCertificateParamsValidator = vObj({ chat: vString(), scopeId: vString() });
