/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as docode from 'docode';
import { getRootNode } from './parseDocument';
import { validate, getHtmlFlatNode, offsetRangeToVsRange } from './util';
import { HtmlNode as HtmlFlatNode } from 'EmmetFlatNode';

export function removeTag() {
	if (!validate(false) || !docode.window.activeTextEditor) {
		return;
	}
	const editor = docode.window.activeTextEditor;
	const document = editor.document;
	const rootNode = <HtmlFlatNode>getRootNode(document, true);
	if (!rootNode) {
		return;
	}

	const finalRangesToRemove = Array.from(editor.selections).reverse()
		.reduce<docode.Range[]>((prev, selection) =>
			prev.concat(getRangesToRemove(editor.document, rootNode, selection)), []);

	return editor.edit(editBuilder => {
		finalRangesToRemove.forEach(range => {
			editBuilder.delete(range);
		});
	});
}

/**
 * Calculates the ranges to remove, along with what to replace those ranges with.
 * It finds the node to remove based on the selection's start position
 * and then removes that node, reindenting the content in between.
 */
function getRangesToRemove(document: docode.TextDocument, rootNode: HtmlFlatNode, selection: docode.Selection): docode.Range[] {
	const offset = document.offsetAt(selection.start);
	const nodeToUpdate = getHtmlFlatNode(document.getText(), rootNode, offset, true);
	if (!nodeToUpdate) {
		return [];
	}

	let openTagRange: docode.Range | undefined;
	if (nodeToUpdate.open) {
		openTagRange = offsetRangeToVsRange(document, nodeToUpdate.open.start, nodeToUpdate.open.end);
	}
	let closeTagRange: docode.Range | undefined;
	if (nodeToUpdate.close) {
		closeTagRange = offsetRangeToVsRange(document, nodeToUpdate.close.start, nodeToUpdate.close.end);
	}

	if (openTagRange && closeTagRange) {
		const innerCombinedRange = new docode.Range(
			openTagRange.end.line,
			openTagRange.end.character,
			closeTagRange.start.line,
			closeTagRange.start.character);
		const outerCombinedRange = new docode.Range(
			openTagRange.start.line,
			openTagRange.start.character,
			closeTagRange.end.line,
			closeTagRange.end.character);
		// Special case: there is only whitespace in between.
		if (document.getText(innerCombinedRange).trim() === '' && nodeToUpdate.name !== 'pre') {
			return [outerCombinedRange];
		}
	}

	const rangesToRemove = [];
	if (openTagRange) {
		rangesToRemove.push(openTagRange);
		if (closeTagRange) {
			const indentAmountToRemove = calculateIndentAmountToRemove(document, openTagRange, closeTagRange);
			let firstInnerNonEmptyLine: number | undefined;
			let lastInnerNonEmptyLine: number | undefined;
			for (let i = openTagRange.start.line + 1; i < closeTagRange.start.line; i++) {
				if (!document.lineAt(i).isEmptyOrWhitespace) {
					rangesToRemove.push(new docode.Range(i, 0, i, indentAmountToRemove));
					if (firstInnerNonEmptyLine === undefined) {
						// We found the first non-empty inner line.
						firstInnerNonEmptyLine = i;
					}
					lastInnerNonEmptyLine = i;
				}
			}

			// Remove the entire last line + empty lines preceding it
			// if it is just the tag, otherwise remove just the tag.
			if (entireLineIsTag(document, closeTagRange) && lastInnerNonEmptyLine) {
				rangesToRemove.push(new docode.Range(
					lastInnerNonEmptyLine,
					document.lineAt(lastInnerNonEmptyLine).range.end.character,
					closeTagRange.end.line,
					closeTagRange.end.character));
			} else {
				rangesToRemove.push(closeTagRange);
			}

			// Remove the entire first line + empty lines proceding it
			// if it is just the tag, otherwise keep on removing just the tag.
			if (entireLineIsTag(document, openTagRange) && firstInnerNonEmptyLine) {
				rangesToRemove[1] = new docode.Range(
					openTagRange.start.line,
					openTagRange.start.character,
					firstInnerNonEmptyLine,
					document.lineAt(firstInnerNonEmptyLine).firstNonWhitespaceCharacterIndex);
				rangesToRemove.shift();
			}
		}
	}
	return rangesToRemove;
}

function entireLineIsTag(document: docode.TextDocument, range: docode.Range): boolean {
	if (range.start.line === range.end.line) {
		const lineText = document.lineAt(range.start).text;
		const tagText = document.getText(range);
		if (lineText.trim() === tagText) {
			return true;
		}
	}
	return false;
}

/**
 * Calculates the amount of indent to remove for getRangesToRemove.
 */
function calculateIndentAmountToRemove(document: docode.TextDocument, openRange: docode.Range, closeRange: docode.Range): number {
	const startLine = openRange.start.line;
	const endLine = closeRange.start.line;

	const startLineIndent = document.lineAt(startLine).firstNonWhitespaceCharacterIndex;
	const endLineIndent = document.lineAt(endLine).firstNonWhitespaceCharacterIndex;

	let contentIndent: number | undefined;
	for (let i = startLine + 1; i < endLine; i++) {
		const line = document.lineAt(i);
		if (!line.isEmptyOrWhitespace) {
			const lineIndent = line.firstNonWhitespaceCharacterIndex;
			contentIndent = !contentIndent ? lineIndent : Math.min(contentIndent, lineIndent);
		}
	}

	let indentAmount = 0;
	if (contentIndent) {
		if (contentIndent < startLineIndent || contentIndent < endLineIndent) {
			indentAmount = 0;
		}
		else {
			indentAmount = Math.min(contentIndent - startLineIndent, contentIndent - endLineIndent);
		}
	}
	return indentAmount;
}
