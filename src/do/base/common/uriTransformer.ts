/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { UriParts, IRawURITransformer, URITransformer, IURITransformer } from './uriIpc.js';

/**
 * ```
 * --------------------------------
 * |    UI SIDE    |  AGENT SIDE  |
 * |---------------|--------------|
 * | docode-remote | file         |
 * | file          | docode-local |
 * --------------------------------
 * ```
 */
function createRawURITransformer(remoteAuthority: string): IRawURITransformer {
	return {
		transformIncoming: (uri: UriParts): UriParts => {
			if (uri.scheme === 'docode-remote') {
				return { scheme: 'file', path: uri.path, query: uri.query, fragment: uri.fragment };
			}
			if (uri.scheme === 'file') {
				return { scheme: 'docode-local', path: uri.path, query: uri.query, fragment: uri.fragment };
			}
			return uri;
		},
		transformOutgoing: (uri: UriParts): UriParts => {
			if (uri.scheme === 'file') {
				return { scheme: 'docode-remote', authority: remoteAuthority, path: uri.path, query: uri.query, fragment: uri.fragment };
			}
			if (uri.scheme === 'docode-local') {
				return { scheme: 'file', path: uri.path, query: uri.query, fragment: uri.fragment };
			}
			return uri;
		},
		transformOutgoingScheme: (scheme: string): string => {
			if (scheme === 'file') {
				return 'docode-remote';
			} else if (scheme === 'docode-local') {
				return 'file';
			}
			return scheme;
		}
	};
}

export function createURITransformer(remoteAuthority: string): IURITransformer {
	return new URITransformer(createRawURITransformer(remoteAuthority));
}
