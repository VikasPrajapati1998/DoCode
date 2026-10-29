/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerAction2 } from '../../platform/actions/common/actions.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../workbench/common/contributions.js';
import { OpenSessionInDoCodeAction, OpenInDoCodeWidgetContribution, OpenDoCodeWindowAction, ReturnToDoCodeEditorAction, ShouldShowReturnToDoCodeEditorAction } from './actions/docodeActions.js';

// Actions
(function registerActions(): void {
	registerAction2(OpenSessionInDoCodeAction);
	registerAction2(OpenDoCodeWindowAction);
	registerAction2(ReturnToDoCodeEditorAction);
	registerAction2(ShouldShowReturnToDoCodeEditorAction);
})();

(function registerWorkbenchContributions(): void {
	registerWorkbenchContribution2(OpenInDoCodeWidgetContribution.ID, OpenInDoCodeWidgetContribution, WorkbenchPhase.BlockRestore);
})();
