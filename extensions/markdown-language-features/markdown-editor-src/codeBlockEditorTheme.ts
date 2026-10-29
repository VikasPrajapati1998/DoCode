/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { VirtualizedIframeEmbeddedEditorOptions } from '@docode/markdown-editor/web-editors';

export function codeBlockEditorTheme(document: Document): Pick<VirtualizedIframeEmbeddedEditorOptions, 'themeCss' | 'onDidChangeTheme'> {
	return {
		themeCss: () => {
			const kind = document.body.dataset.docodeThemeKind;
			const colorScheme = kind === 'docode-dark' || kind === 'docode-high-contrast' ? 'dark' : 'light';
			return `html:root { ${document.documentElement.style.cssText} color-scheme: ${colorScheme}; }`;
		},
		onDidChangeTheme: listener => {
			const observer = new MutationObserver(listener);
			observer.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
			observer.observe(document.body, { attributes: true, attributeFilter: ['data-docode-theme-kind'] });
			return { dispose: () => observer.disconnect() };
		},
	};
}
