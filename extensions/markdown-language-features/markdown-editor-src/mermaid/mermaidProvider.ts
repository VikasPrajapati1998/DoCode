/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IframeEmbeddedEditorProvider } from '@docode/markdown-editor/web-editors';

export const mermaidProvider: IframeEmbeddedEditorProvider = {
	id: 'docode.markdown.mermaid',
	selector: { language: 'mermaid' },
	resolve: async () => ({
		html: (await import('./mermaid.html')).default,
		runtimeKey: 'docode.markdown.mermaid',
		contentType: 'text',
		initialHeight: 200,
		presentation: { resizable: true, fullWidth: true, fullView: true, minHeight: 120 },
	}),
};
