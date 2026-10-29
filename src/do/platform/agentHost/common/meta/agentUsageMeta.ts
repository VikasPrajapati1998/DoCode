/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SessionState, UsageInfo } from '../state/protocol/state.js';
import { LOCAL_MODEL_META_KEY } from '../localModel.js';
import { hasAgentMetadata } from './metadata.js';
import { readUsageInfoMeta as readDoCodeUsage, type UsageInfoMeta as DoCodeUsage } from './docode/agentUsageMeta.js';
import { readCopilotContextUsage, readCopilotUsageDetail } from './copilotd/copilotdMetadataReader.js';

export { compactAutoModeResolved, compactContextAttribution, createLocalModelTurnExecutionMeta, isAiCreditsStatus, readChatUsage, readLocalModelTurnExecution, withChatUsage, type AiCreditsStatus, type IAgentChatUsage } from './docode/agentUsageMeta.js';

export interface IAgentLatestModelCall {
	readonly cost?: number;
	readonly cacheWriteTokens?: number;
	readonly cacheExpiresAt?: string;
	readonly reasoningTokens?: number;
	readonly reasoningEffort?: string;
	readonly finishReason?: string;
	readonly initiator?: string;
	readonly apiEndpoint?: string;
	readonly apiCallId?: string;
	readonly providerCallId?: string;
	readonly serviceRequestId?: string;
	readonly contentFilterTriggered?: boolean;
	readonly duration?: number;
	readonly interTokenLatencyMs?: number;
	readonly timeToFirstTokenMs?: number;
	readonly copilotUsage?: { readonly totalNanoAiu?: number; readonly [key: string]: unknown };
}

export interface UsageInfoMeta extends DoCodeUsage {
	readonly latestModelCall?: IAgentLatestModelCall;
}

export interface IAgentContextUsage {
	readonly currentTokens: number;
	readonly tokenLimit: number;
	readonly messagesLength: number;
	readonly conversationTokens?: number;
	readonly systemTokens?: number;
	readonly toolDefinitionsTokens?: number;
}

const docodeUsageKeys = ['cost', 'autoModeResolved', 'copilotUsage', 'quotaSnapshots', 'contextAttribution', 'turnTokenTotals', 'directTurnTokenTotals', 'directCopilotUsage', 'docode.modelCall', LOCAL_MODEL_META_KEY] as const;

export function readUsageInfoMeta(usage: UsageInfo | undefined): UsageInfoMeta {
	if (hasAgentMetadata(usage, docodeUsageKeys)) {
		return readDoCodeUsage(usage);
	}
	const latestModelCall = usage && readCopilotUsageDetail(usage);
	return latestModelCall ? { latestModelCall } : {};
}

export function readAgentContextUsage(session: Pick<SessionState, '_meta'>, usage: UsageInfo | undefined): IAgentContextUsage | undefined {
	return hasAgentMetadata(usage, ['contextAttribution']) ? undefined : readCopilotContextUsage(session);
}
