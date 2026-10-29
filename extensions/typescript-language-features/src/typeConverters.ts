/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Helpers for converting FROM docode types TO ts types
 */

import * as docode from 'docode';
import type * as Proto from './tsServer/protocol/protocol';
import * as PConst from './tsServer/protocol/protocol.const';
import { ITypeScriptServiceClient } from './typescriptService';

export namespace Range {
	export const fromTextSpan = (span: Proto.TextSpan): docode.Range =>
		fromLocations(span.start, span.end);

	export const toTextSpan = (range: docode.Range): Proto.TextSpan => ({
		start: Position.toLocation(range.start),
		end: Position.toLocation(range.end)
	});

	export const fromLocations = (start: Proto.Location, end: Proto.Location): docode.Range =>
		new docode.Range(
			Math.max(0, start.line - 1), Math.max(start.offset - 1, 0),
			Math.max(0, end.line - 1), Math.max(0, end.offset - 1));

	export const toFileRange = (range: docode.Range): Proto.FileRange => ({
		startLine: range.start.line + 1,
		startOffset: range.start.character + 1,
		endLine: range.end.line + 1,
		endOffset: range.end.character + 1
	});

	export const toFileRangeRequestArgs = (file: string, range: docode.Range): Proto.FileRangeRequestArgs => ({
		file,
		...toFileRange(range)
	});

	export const toFileRangesRequestArgs = (file: string, ranges: docode.Range[]): Proto.FileRangesRequestArgs => ({
		file,
		ranges: ranges.map(toFileRange)
	});

	export const toFormattingRequestArgs = (file: string, range: docode.Range): Proto.FormatRequestArgs => ({
		file,
		line: range.start.line + 1,
		offset: range.start.character + 1,
		endLine: range.end.line + 1,
		endOffset: range.end.character + 1
	});
}

export namespace Position {
	export const fromLocation = (tslocation: Proto.Location): docode.Position =>
		new docode.Position(tslocation.line - 1, tslocation.offset - 1);

	export const toLocation = (vsPosition: docode.Position): Proto.Location => ({
		line: vsPosition.line + 1,
		offset: vsPosition.character + 1,
	});

	export const toFileLocationRequestArgs = (file: string, position: docode.Position): Proto.FileLocationRequestArgs => ({
		file,
		line: position.line + 1,
		offset: position.character + 1,
	});
}

export namespace Location {
	export const fromTextSpan = (resource: docode.Uri, tsTextSpan: Proto.TextSpan): docode.Location =>
		new docode.Location(resource, Range.fromTextSpan(tsTextSpan));
}

export namespace TextEdit {
	export const fromCodeEdit = (edit: Proto.CodeEdit): docode.TextEdit =>
		new docode.TextEdit(
			Range.fromTextSpan(edit),
			edit.newText);
}

export namespace WorkspaceEdit {
	export function fromFileCodeEdits(
		client: ITypeScriptServiceClient,
		edits: Iterable<Proto.FileCodeEdits>
	): docode.WorkspaceEdit {
		return withFileCodeEdits(new docode.WorkspaceEdit(), client, edits);
	}

	export function withFileCodeEdits(
		workspaceEdit: docode.WorkspaceEdit,
		client: ITypeScriptServiceClient,
		edits: Iterable<Proto.FileCodeEdits>
	): docode.WorkspaceEdit {
		for (const edit of edits) {
			const resource = client.toResource(edit.fileName);
			for (const textChange of edit.textChanges) {
				workspaceEdit.replace(resource,
					Range.fromTextSpan(textChange),
					textChange.newText);
			}
		}

		return workspaceEdit;
	}
}

export namespace SymbolKind {
	export function fromProtocolScriptElementKind(kind: Proto.ScriptElementKind) {
		switch (kind) {
			case PConst.Kind.module: return docode.SymbolKind.Module;
			case PConst.Kind.class: return docode.SymbolKind.Class;
			case PConst.Kind.enum: return docode.SymbolKind.Enum;
			case PConst.Kind.enumMember: return docode.SymbolKind.EnumMember;
			case PConst.Kind.interface: return docode.SymbolKind.Interface;
			case PConst.Kind.indexSignature: return docode.SymbolKind.Method;
			case PConst.Kind.callSignature: return docode.SymbolKind.Method;
			case PConst.Kind.method: return docode.SymbolKind.Method;
			case PConst.Kind.memberVariable: return docode.SymbolKind.Property;
			case PConst.Kind.memberGetAccessor: return docode.SymbolKind.Property;
			case PConst.Kind.memberSetAccessor: return docode.SymbolKind.Property;
			case PConst.Kind.variable: return docode.SymbolKind.Variable;
			case PConst.Kind.let: return docode.SymbolKind.Variable;
			case PConst.Kind.const: return docode.SymbolKind.Variable;
			case PConst.Kind.localVariable: return docode.SymbolKind.Variable;
			case PConst.Kind.alias: return docode.SymbolKind.Variable;
			case PConst.Kind.function: return docode.SymbolKind.Function;
			case PConst.Kind.localFunction: return docode.SymbolKind.Function;
			case PConst.Kind.constructSignature: return docode.SymbolKind.Constructor;
			case PConst.Kind.constructorImplementation: return docode.SymbolKind.Constructor;
			case PConst.Kind.typeParameter: return docode.SymbolKind.TypeParameter;
			case PConst.Kind.string: return docode.SymbolKind.String;
			default: return docode.SymbolKind.Variable;
		}
	}
}

export namespace CompletionTriggerKind {
	export function toProtocolCompletionTriggerKind(kind: docode.CompletionTriggerKind): Proto.CompletionTriggerKind {
		switch (kind) {
			case docode.CompletionTriggerKind.Invoke: return 1;
			case docode.CompletionTriggerKind.TriggerCharacter: return 2;
			case docode.CompletionTriggerKind.TriggerForIncompleteCompletions: return 3;
		}
	}
}

export namespace OrganizeImportsMode {
	export function toProtocolOrganizeImportsMode(mode: PConst.OrganizeImportsMode): Proto.OrganizeImportsMode {
		switch (mode) {
			case PConst.OrganizeImportsMode.All: return 'All' as Proto.OrganizeImportsMode.All;
			case PConst.OrganizeImportsMode.SortAndCombine: return 'SortAndCombine' as Proto.OrganizeImportsMode.SortAndCombine;
			case PConst.OrganizeImportsMode.RemoveUnused: return 'RemoveUnused' as Proto.OrganizeImportsMode.RemoveUnused;
		}
	}
}
