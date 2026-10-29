/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerAction2 } from '../../platform/actions/common/actions.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../workbench/common/contributions.js';
import { OpenInDoCodeAction, OpenInDoCodeWidgetContribution } from './actions/docodeActions.js';

// Actions
(function registerActions(): void {
	registerAction2(OpenInDoCodeAction);
})();

(function registerWorkbenchContributions(): void {
	registerWorkbenchContribution2(OpenInDoCodeWidgetContribution.ID, OpenInDoCodeWidgetContribution, WorkbenchPhase.BlockRestore);
})();
