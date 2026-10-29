/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../base/common/codicons.js';
import { getWindowId } from '../../../base/browser/dom.js';
import { mainWindow } from '../../../base/browser/window.js';
import { URI } from '../../../base/common/uri.js';
import { Schemas } from '../../../base/common/network.js';
import { ServicesAccessor } from '../../../editor/browser/editorExtensions.js';
import { EditorContextKeys } from '../../../editor/common/editorContextKeys.js';
import { localize2 } from '../../../nls.js';
import { Action2 } from '../../../platform/actions/common/actions.js';
import { IRemoteAgentHostService } from '../../../platform/agentHost/common/remoteAgentHostService.js';
import { KeyCode, KeyMod } from '../../../base/common/keyCodes.js';
import { ContextKeyExpr } from '../../../platform/contextkey/common/contextkey.js';
import { IsLinuxContext } from '../../../platform/contextkey/common/contextkeys.js';
import { KeybindingWeight } from '../../../platform/keybinding/common/keybindingsRegistry.js';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry.js';
import { EditorAreaFocusContext, IsAuxiliaryWindowContext } from '../../../workbench/common/contextkeys.js';
import { IsPhoneLayoutContext, SessionsWelcomeVisibleContext } from '../../common/contextkeys.js';
import { logSessionsInteraction } from '../../common/sessionsTelemetry.js';
import { Menus } from '../../browser/menus.js';
import { ISessionsService } from '../../services/sessions/browser/sessionsService.js';
import { ISessionsProvidersService } from '../../services/sessions/browser/sessionsProvidersService.js';
import { IWorkbenchContribution } from '../../../workbench/common/contributions.js';
import { OpenInDoCodeTitleBarWidget } from '../../browser/widget/openInDoCodeWidget.js';
import { IActionViewItemService } from '../../../platform/actions/browser/actionViewItemService.js';
import { IInstantiationService } from '../../../platform/instantiation/common/instantiation.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { resolveRemoteFolderUri } from '../../browser/openInDoCodeUtils.js';
import { INativeHostService } from '../../../platform/native/common/native.js';
import { IFolderToOpen, IOpenedMainWindow } from '../../../platform/window/common/window.js';
import { ILabelService, Verbosity } from '../../../platform/label/common/label.js';
import { OPEN_DOCODE_WINDOW_COMMAND_ID, RETURN_TO_DOCODE_EDITOR_COMMAND_ID, SHOULD_SHOW_RETURN_TO_DOCODE_EDITOR_COMMAND_ID } from '../../common/sessionCommands.js';
import { IActiveSession } from '../../services/sessions/common/sessionsManagement.js';

export class OpenSessionInDoCodeAction extends Action2 {
	static readonly ID = 'agents.openSessionInDoCode';

	constructor() {
		super({
			id: OpenSessionInDoCodeAction.ID,
			title: localize2('openInDoCode', 'Open in Editor'),
			icon: Codicon.docodeInsiders,
			precondition: ContextKeyExpr.and(IsAuxiliaryWindowContext.toNegated(), SessionsWelcomeVisibleContext.toNegated()),
			menu: [{
				id: Menus.TitleBarCenterRight,
				group: 'navigation',
				order: 7,
				when: ContextKeyExpr.and(IsAuxiliaryWindowContext.toNegated(), SessionsWelcomeVisibleContext.toNegated(), IsPhoneLayoutContext.negate()),
			}]
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const telemetryService = accessor.get(ITelemetryService);
		logSessionsInteraction(telemetryService, 'openInDoCode');

		const sessionsService = accessor.get(ISessionsService);
		const instantiationService = accessor.get(IInstantiationService);

		return instantiationService.invokeFunction(openSessionInDoCode, sessionsService.activeSession.get());
	}
}

export async function openSessionInDoCode(accessor: ServicesAccessor, session: IActiveSession | undefined): Promise<void> {
	const nativeHostService = accessor.get(INativeHostService);
	const sessionsProvidersService = accessor.get(ISessionsProvidersService);
	const remoteAgentHostService = accessor.get(IRemoteAgentHostService);
	const labelService = accessor.get(ILabelService);

	const folders = session?.activeChat.get().workspace.get()?.folders;
	if (!session || !folders?.length) {
		return nativeHostService.openWindow();
	}

	const foldersToOpen: IFolderToOpen[] = [];
	for (const folder of folders) {
		const folderUri = resolveRemoteFolderUri(folder.workingDirectory, session.providerId, sessionsProvidersService, remoteAgentHostService);
		if (!folderUri) {
			return nativeHostService.openWindow({ remoteAuthority: null });
		}
		foldersToOpen.push({
			folderUri,
			label: folderUri.scheme === Schemas.docodeRemote ? labelService.getWorkspaceLabel(folder.workingDirectory, { verbose: Verbosity.LONG }) : undefined,
		});
	}

	const chatSessionToOpen = getChatSessionToOpenInEditor(session);
	return nativeHostService.openWindow(foldersToOpen, { forceNewWindow: true, chatSessionToOpen });
}

/**
 * Provisional sessions remain owned by the Agents composer and may be replaced or disposed, so only materialized sessions are safe to share across windows.
 */
export function getChatSessionToOpenInEditor(session: IActiveSession | undefined): URI | undefined {
	return session?.isCreated.get() ? session.resource : undefined;
}

export class OpenDoCodeWindowAction extends Action2 {
	static readonly ID = OPEN_DOCODE_WINDOW_COMMAND_ID;

	constructor() {
		super({
			id: OpenDoCodeWindowAction.ID,
			title: localize2('openDoCodeWindow', 'Open DoCode Window'),
			f1: true,
			keybinding: {
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyA,
				weight: KeybindingWeight.WorkbenchContrib,
				// On Linux, Ctrl+Shift+A is Toggle Block Comment, so defer to it in a focused writable editor.
				when: ContextKeyExpr.or(IsLinuxContext.toNegated(), EditorAreaFocusContext.toNegated(), EditorContextKeys.readOnly),
			},
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const nativeHostService = accessor.get(INativeHostService);

		const windows = await nativeHostService.getWindows({ includeAuxiliaryWindows: false });
		const currentWindowId = getWindowId(mainWindow);
		const docodeWindow = windows.find(w => w.id !== currentWindowId);

		if (docodeWindow) {
			await nativeHostService.focusWindow({ targetWindowId: docodeWindow.id });
		} else {
			await nativeHostService.openWindow();
		}
	}
}

export class ReturnToDoCodeEditorAction extends Action2 {

	constructor() {
		super({
			id: RETURN_TO_DOCODE_EDITOR_COMMAND_ID,
			title: localize2('returnToDoCodeEditor', 'Return to DoCode Editor'),
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const nativeHostService = accessor.get(INativeHostService);
		await returnToDoCodeEditor(nativeHostService, getWindowId(mainWindow));
	}
}

export class ShouldShowReturnToDoCodeEditorAction extends Action2 {

	constructor() {
		super({
			id: SHOULD_SHOW_RETURN_TO_DOCODE_EDITOR_COMMAND_ID,
			title: localize2('shouldShowReturnToDoCodeEditor', 'Check Whether to Show Return to DoCode Editor'),
		});
	}

	override async run(accessor: ServicesAccessor): Promise<boolean> {
		const nativeHostService = accessor.get(INativeHostService);
		const windows = await nativeHostService.getWindows({ includeAuxiliaryWindows: false });
		return shouldShowReturnToDoCodeEditor(windows, getWindowId(mainWindow));
	}
}

export function shouldShowReturnToDoCodeEditor(windows: readonly IOpenedMainWindow[], currentWindowId: number): boolean {
	return !windows.some(window => window.id !== currentWindowId);
}

export async function returnToDoCodeEditor(nativeHostService: INativeHostService, currentWindowId: number): Promise<void> {
	await nativeHostService.openWindow();
	await nativeHostService.closeWindow({ targetWindowId: currentWindowId });
}

export class OpenInDoCodeWidgetContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.openInDoCode.widget';

	constructor(
		@IActionViewItemService actionViewItemService: IActionViewItemService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		this._register(actionViewItemService.register(Menus.TitleBarCenterRight, OpenSessionInDoCodeAction.ID, (action, options) => {
			return instantiationService.createInstance(OpenInDoCodeTitleBarWidget, action, options, OpenDoCodeWindowAction.ID);
		}, undefined));
	}
}
