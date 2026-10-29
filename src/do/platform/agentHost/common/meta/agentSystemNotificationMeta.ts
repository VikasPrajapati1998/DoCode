/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export type { AgentFusionProgressStatus, IAgentSystemNotificationMeta, IAgentWorkspaceTransitionRecord } from './docode/agentSystemNotificationMeta.js';
export { AgentSystemNotificationKind, AgentSystemNotificationWorkspaceKind, AgentSystemNotificationSeverity, readAgentSystemNotificationMeta, toAgentSystemNotificationMeta, serializeAgentWorkspaceTransition, parseAgentWorkspaceTransition } from './docode/agentSystemNotificationMeta.js';
