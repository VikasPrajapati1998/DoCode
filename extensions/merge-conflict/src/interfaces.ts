/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as docode from 'docode';

export interface IMergeRegion {
	name: string;
	header: docode.Range;
	content: docode.Range;
	decoratorContent: docode.Range;
}

export const enum CommitType {
	Current,
	Incoming,
	Both
}

export interface IExtensionConfiguration {
	enableCodeLens: boolean;
	enableDecorations: boolean;
	enableEditorOverview: boolean;
}

export interface IDocumentMergeConflict extends IDocumentMergeConflictDescriptor {
	commitEdit(type: CommitType, editor: docode.TextEditor, edit?: docode.TextEditorEdit): Thenable<boolean>;
	applyEdit(type: CommitType, document: docode.TextDocument, edit: { replace(range: docode.Range, newText: string): void }): void;
}

export interface IDocumentMergeConflictDescriptor {
	range: docode.Range;
	current: IMergeRegion;
	incoming: IMergeRegion;
	commonAncestors: IMergeRegion[];
	splitter: docode.Range;
}

export interface IDocumentMergeConflictTracker {
	getConflicts(document: docode.TextDocument): PromiseLike<IDocumentMergeConflict[]>;
	isPending(document: docode.TextDocument): boolean;
	forget(document: docode.TextDocument): void;
}

export interface IDocumentMergeConflictTrackerService {
	createTracker(origin: string): IDocumentMergeConflictTracker;
	forget(document: docode.TextDocument): void;
}
