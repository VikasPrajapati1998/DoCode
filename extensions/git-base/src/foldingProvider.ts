/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as docode from 'docode';

export class GitCommitFoldingProvider implements docode.FoldingRangeProvider {

	provideFoldingRanges(
		document: docode.TextDocument,
		_context: docode.FoldingContext,
		_token: docode.CancellationToken
	): docode.ProviderResult<docode.FoldingRange[]> {
		const ranges: docode.FoldingRange[] = [];

		let commentBlockStart: number | undefined;
		let currentDiffStart: number | undefined;

		for (let i = 0; i < document.lineCount; i++) {
			const line = document.lineAt(i);
			const lineText = line.text;

			// Check for comment lines (lines starting with #)
			if (lineText.startsWith('#')) {
				// Close any active diff block when we encounter a comment
				if (currentDiffStart !== undefined) {
					// Only create fold if there are at least 2 lines
					if (i - currentDiffStart > 1) {
						ranges.push(new docode.FoldingRange(currentDiffStart, i - 1));
					}
					currentDiffStart = undefined;
				}

				if (commentBlockStart === undefined) {
					commentBlockStart = i;
				}
			} else {
				// End of comment block
				if (commentBlockStart !== undefined) {
					// Only create fold if there are at least 2 lines
					if (i - commentBlockStart > 1) {
						ranges.push(new docode.FoldingRange(
							commentBlockStart,
							i - 1,
							docode.FoldingRangeKind.Comment
						));
					}
					commentBlockStart = undefined;
				}
			}

			// Check for diff sections (lines starting with "diff --git")
			if (lineText.startsWith('diff --git ')) {
				// If there's a previous diff block, close it
				if (currentDiffStart !== undefined) {
					// Only create fold if there are at least 2 lines
					if (i - currentDiffStart > 1) {
						ranges.push(new docode.FoldingRange(currentDiffStart, i - 1));
					}
				}
				// Start new diff block
				currentDiffStart = i;
			}
		}

		// Handle end-of-document cases

		// If comment block extends to end of document
		if (commentBlockStart !== undefined) {
			if (document.lineCount - commentBlockStart > 1) {
				ranges.push(new docode.FoldingRange(
					commentBlockStart,
					document.lineCount - 1,
					docode.FoldingRangeKind.Comment
				));
			}
		}

		// If diff block extends to end of document
		if (currentDiffStart !== undefined) {
			if (document.lineCount - currentDiffStart > 1) {
				ranges.push(new docode.FoldingRange(
					currentDiffStart,
					document.lineCount - 1
				));
			}
		}

		return ranges;
	}
}
