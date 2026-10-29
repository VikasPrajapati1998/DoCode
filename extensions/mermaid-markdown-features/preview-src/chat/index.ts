/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { initializeMermaidWebview } from './mermaidWebview';
import { VsCodeApi } from './docodeApi';

declare function acquireVsCodeApi(): VsCodeApi;
const docode = acquireVsCodeApi();


async function main() {
	await initializeMermaidWebview(docode);

	// Set up the "Open in Editor" button
	const openBtn = document.querySelector('.open-in-editor-btn');
	if (openBtn) {
		openBtn.addEventListener('click', e => {
			e.stopPropagation();
			docode.postMessage({ type: 'openInEditor' });
		});
	}
}
main();
