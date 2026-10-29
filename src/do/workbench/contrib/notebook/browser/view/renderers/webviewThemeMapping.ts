/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WebviewStyles } from '../../../../webview/browser/webview.js';

const mapping: ReadonlyMap<string, string> = new Map([
	['theme-font-family', 'docode-font-family'],
	['theme-font-weight', 'docode-font-weight'],
	['theme-font-size', 'docode-font-size'],
	['theme-code-font-family', 'docode-editor-font-family'],
	['theme-code-font-weight', 'docode-editor-font-weight'],
	['theme-code-font-size', 'docode-editor-font-size'],
	['theme-scrollbar-background', 'docode-scrollbarSlider-background'],
	['theme-scrollbar-hover-background', 'docode-scrollbarSlider-hoverBackground'],
	['theme-scrollbar-active-background', 'docode-scrollbarSlider-activeBackground'],
	['theme-quote-background', 'docode-textBlockQuote-background'],
	['theme-quote-border', 'docode-textBlockQuote-border'],
	['theme-code-foreground', 'docode-textPreformat-foreground'],
	['theme-code-background', 'docode-textPreformat-background'],
	// Editor
	['theme-background', 'docode-editor-background'],
	['theme-foreground', 'docode-editor-foreground'],
	['theme-ui-foreground', 'docode-foreground'],
	['theme-link', 'docode-textLink-foreground'],
	['theme-link-active', 'docode-textLink-activeForeground'],
	// Buttons
	['theme-button-background', 'docode-button-background'],
	['theme-button-hover-background', 'docode-button-hoverBackground'],
	['theme-button-foreground', 'docode-button-foreground'],
	['theme-button-secondary-background', 'docode-button-secondaryBackground'],
	['theme-button-secondary-hover-background', 'docode-button-secondaryHoverBackground'],
	['theme-button-secondary-foreground', 'docode-button-secondaryForeground'],
	['theme-button-hover-foreground', 'docode-button-foreground'],
	['theme-button-focus-foreground', 'docode-button-foreground'],
	['theme-button-secondary-hover-foreground', 'docode-button-secondaryForeground'],
	['theme-button-secondary-focus-foreground', 'docode-button-secondaryForeground'],
	// Inputs
	['theme-input-background', 'docode-input-background'],
	['theme-input-foreground', 'docode-input-foreground'],
	['theme-input-placeholder-foreground', 'docode-input-placeholderForeground'],
	['theme-input-focus-border-color', 'docode-focusBorder'],
	// Menus
	['theme-menu-background', 'docode-menu-background'],
	['theme-menu-foreground', 'docode-menu-foreground'],
	['theme-menu-hover-background', 'docode-menu-selectionBackground'],
	['theme-menu-focus-background', 'docode-menu-selectionBackground'],
	['theme-menu-hover-foreground', 'docode-menu-selectionForeground'],
	['theme-menu-focus-foreground', 'docode-menu-selectionForeground'],
	// Errors
	['theme-error-background', 'docode-inputValidation-errorBackground'],
	['theme-error-foreground', 'docode-foreground'],
	['theme-warning-background', 'docode-inputValidation-warningBackground'],
	['theme-warning-foreground', 'docode-foreground'],
	['theme-info-background', 'docode-inputValidation-infoBackground'],
	['theme-info-foreground', 'docode-foreground'],
	// Notebook:
	['theme-notebook-output-background', 'docode-notebook-outputContainerBackgroundColor'],
	['theme-notebook-output-border', 'docode-notebook-outputContainerBorderColor'],
	['theme-notebook-cell-selected-background', 'docode-notebook-selectedCellBackground'],
	['theme-notebook-symbol-highlight-background', 'docode-notebook-symbolHighlightBackground'],
	['theme-notebook-diff-removed-background', 'docode-diffEditor-removedTextBackground'],
	['theme-notebook-diff-inserted-background', 'docode-diffEditor-insertedTextBackground'],
]);

const constants: Readonly<WebviewStyles> = {
	'theme-input-border-width': '1px',
	'theme-button-primary-hover-shadow': 'none',
	'theme-button-secondary-hover-shadow': 'none',
	'theme-input-border-color': 'transparent',
};

/**
 * Transforms base docode theme variables into generic variables for notebook
 * renderers.
 * @see https://github.com/microsoft/vscode/issues/107985 for context
 * @deprecated
 */
export const transformWebviewThemeVars = (s: Readonly<WebviewStyles>): WebviewStyles => {
	const result = { ...s, ...constants };
	for (const [target, src] of mapping) {
		result[target] = s[src];
	}

	return result;
};
