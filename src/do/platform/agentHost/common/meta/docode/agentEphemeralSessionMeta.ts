/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** VS Code-owned request metadata indicating a throwaway chat surface. */
export const DOCODE_EPHEMERAL_SESSION_META_KEY = 'docode.chat.ephemeralSession';

interface IHasEphemeralSessionMeta {
	readonly _meta?: Record<string, unknown>;
}

/** Typed view over VS Code's ephemeral-session request metadata. */
export interface IEphemeralSessionMeta {
	readonly isEphemeral?: boolean;
}

/** Reads recognized ephemeral-session metadata, dropping wrong-typed values. */
export function readEphemeralSessionMeta(source: IHasEphemeralSessionMeta): IEphemeralSessionMeta {
	const value = source._meta?.[DOCODE_EPHEMERAL_SESSION_META_KEY];
	return typeof value === 'boolean' ? { isEphemeral: value } : {};
}

/** Adds VS Code's ephemeral-session metadata to an open request metadata bag. */
export function withEphemeralSessionMeta(meta: Record<string, unknown> | undefined, isEphemeral: boolean | undefined): Record<string, unknown> | undefined {
	if (isEphemeral === undefined) {
		return meta;
	}
	return { ...(meta ?? {}), [DOCODE_EPHEMERAL_SESSION_META_KEY]: isEphemeral };
}
