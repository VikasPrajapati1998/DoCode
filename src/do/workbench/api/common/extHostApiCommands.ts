/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isFalsyOrEmpty } from '../../../base/common/arrays.js';
import { VSBuffer } from '../../../base/common/buffer.js';
import { Schemas, matchesSomeScheme } from '../../../base/common/network.js';
import { URI } from '../../../base/common/uri.js';
import { IPosition } from '../../../editor/common/core/position.js';
import { IRange } from '../../../editor/common/core/range.js';
import { ISelection } from '../../../editor/common/core/selection.js';
import * as languages from '../../../editor/common/languages.js';
import { decodeSemanticTokensDto } from '../../../editor/common/services/semanticTokensDto.js';
import { validateWhenClauses } from '../../../platform/contextkey/common/contextkey.js';
import { ITextEditorOptions } from '../../../platform/editor/common/editor.js';
import { ICallHierarchyItemDto, IIncomingCallDto, IInlineValueContextDto, IOutgoingCallDto, IRawColorInfo, ITypeHierarchyItemDto, IWorkspaceEditDto } from './extHost.protocol.js';
import { ApiCommand, ApiCommandArgument, ApiCommandResult, ExtHostCommands } from './extHostCommands.js';
import { CustomCodeAction } from './extHostLanguageFeatures.js';
import * as typeConverters from './extHostTypeConverters.js';
import * as types from './extHostTypes.js';
import { TransientCellMetadata, TransientDocumentMetadata } from '../../contrib/notebook/common/notebookCommon.js';
import * as search from '../../contrib/search/common/search.js';
import type * as docode from 'docode';
import { PromptsType } from '../../contrib/chat/common/promptSyntax/promptTypes.js';
import type { IExtensionPromptFileResult } from '../../contrib/chat/common/promptSyntax/chatPromptFilesContribution.js';

//#region --- NEW world

const newCommands: ApiCommand[] = [
	// -- document highlights
	new ApiCommand(
		'docode.executeDocumentHighlights', '_executeDocumentHighlights', 'Execute document highlight provider.',
		[ApiCommandArgument.Uri, ApiCommandArgument.Position],
		new ApiCommandResult<languages.DocumentHighlight[], types.DocumentHighlight[] | undefined>('A promise that resolves to an array of DocumentHighlight-instances.', tryMapWith(typeConverters.DocumentHighlight.to))
	),
	// -- document symbols
	new ApiCommand(
		'docode.executeDocumentSymbolProvider', '_executeDocumentSymbolProvider', 'Execute document symbol provider.',
		[ApiCommandArgument.Uri],
		new ApiCommandResult<languages.DocumentSymbol[], docode.SymbolInformation[] | undefined>('A promise that resolves to an array of SymbolInformation and DocumentSymbol instances.', (value, apiArgs) => {

			if (isFalsyOrEmpty(value)) {
				return undefined;
			}
			class MergedInfo extends types.SymbolInformation implements docode.DocumentSymbol {
				static to(symbol: languages.DocumentSymbol): MergedInfo {
					const res = new MergedInfo(
						symbol.name,
						typeConverters.SymbolKind.to(symbol.kind),
						symbol.containerName || '',
						new types.Location(apiArgs[0], typeConverters.Range.to(symbol.range))
					);
					res.detail = symbol.detail;
					res.range = res.location.range;
					res.selectionRange = typeConverters.Range.to(symbol.selectionRange);
					res.children = symbol.children ? symbol.children.map(MergedInfo.to) : [];
					return res;
				}

				detail!: string;
				range!: docode.Range;
				selectionRange!: docode.Range;
				children!: docode.DocumentSymbol[];
				override containerName: string = '';
			}
			return value.map(MergedInfo.to);

		})
	),
	// -- formatting
	new ApiCommand(
		'docode.executeFormatDocumentProvider', '_executeFormatDocumentProvider', 'Execute document format provider.',
		[ApiCommandArgument.Uri, new ApiCommandArgument('options', 'Formatting options', _ => true, v => v)],
		new ApiCommandResult<languages.TextEdit[], types.TextEdit[] | undefined>('A promise that resolves to an array of TextEdits.', tryMapWith(typeConverters.TextEdit.to))
	),
	new ApiCommand(
		'docode.executeFormatRangeProvider', '_executeFormatRangeProvider', 'Execute range format provider.',
		[ApiCommandArgument.Uri, ApiCommandArgument.Range, new ApiCommandArgument('options', 'Formatting options', _ => true, v => v)],
		new ApiCommandResult<languages.TextEdit[], types.TextEdit[] | undefined>('A promise that resolves to an array of TextEdits.', tryMapWith(typeConverters.TextEdit.to))
	),
	new ApiCommand(
		'docode.executeFormatOnTypeProvider', '_executeFormatOnTypeProvider', 'Execute format on type provider.',
		[ApiCommandArgument.Uri, ApiCommandArgument.Position, new ApiCommandArgument('ch', 'Trigger character', v => typeof v === 'string', v => v), new ApiCommandArgument('options', 'Formatting options', _ => true, v => v)],
		new ApiCommandResult<languages.TextEdit[], types.TextEdit[] | undefined>('A promise that resolves to an array of TextEdits.', tryMapWith(typeConverters.TextEdit.to))
	),
	// -- go to symbol (definition, type definition, declaration, impl, references)
	new ApiCommand(
		'docode.executeDefinitionProvider', '_executeDefinitionProvider', 'Execute all definition providers.',
		[ApiCommandArgument.Uri, ApiCommandArgument.Position],
		new ApiCommandResult<(languages.Location | languages.LocationLink)[], (types.Location | docode.LocationLink)[] | undefined>('A promise that resolves to an array of Location or LocationLink instances.', mapLocationOrLocationLink)
	),
	new ApiCommand(
		'docode.experimental.executeDefinitionProvider_recursive', '_executeDefinitionProvider_recursive', 'Execute all definition providers.',
		[ApiCommandArgument.Uri, ApiCommandArgument.Position],
		new ApiCommandResult<(languages.Location | languages.LocationLink)[], (types.Location | docode.LocationLink)[] | undefined>('A promise that resolves to an array of Location or LocationLink instances.', mapLocationOrLocationLink)
	),
	new ApiCommand(
		'docode.executeTypeDefinitionProvider', '_executeTypeDefinitionProvider', 'Execute all type definition providers.',
		[ApiCommandArgument.Uri, ApiCommandArgument.Position],
		new ApiCommandResult<(languages.Location | languages.LocationLink)[], (types.Location | docode.LocationLink)[] | undefined>('A promise that resolves to an array of Location or LocationLink instances.', mapLocationOrLocationLink)
	),
	new ApiCommand(
		'docode.experimental.executeTypeDefinitionProvider_recursive', '_executeTypeDefinitionProvider_recursive', 'Execute all type definition providers.',
		[ApiCommandArgument.Uri, ApiCommandArgument.Position],
		new ApiCommandResult<(languages.Location | languages.LocationLink)[], (types.Location | docode.LocationLink)[] | undefined>('A promise that resolves to an array of Location or LocationLink instances.', mapLocationOrLocationLink)
	),
	new ApiCommand(
		'docode.executeDeclarationProvider', '_executeDeclarationProvider', 'Execute all declaration providers.',
		[ApiCommandArgument.Uri, ApiCommandArgument.Position],
		new ApiCommandResult<(languages.Location | languages.LocationLink)[], (types.Location | docode.LocationLink)[] | undefined>('A promise that resolves to an array of Location or LocationLink instances.', mapLocationOrLocationLink)
	),
	new ApiCommand(
		'docode.experimental.executeDeclarationProvider_recursive', '_executeDeclarationProvider_recursive', 'Execute all declaration providers.',
		[ApiCommandArgument.Uri, ApiCommandArgument.Position],
		new ApiCommandResult<(languages.Location | languages.LocationLink)[], (types.Location | docode.LocationLink)[] | undefined>('A promise that resolves to an array of Location or LocationLink instances.', mapLocationOrLocationLink)
	),
	new ApiCommand(
		'docode.executeImplementationProvider', '_executeImplementationProvider', 'Execute all implementation providers.',
		[ApiCommandArgument.Uri, ApiCommandArgument.Position],
		new ApiCommandResult<(languages.Location | languages.LocationLink)[], (types.Location | docode.LocationLink)[] | undefined>('A promise that resolves to an array of Location or LocationLink instances.', mapLocationOrLocationLink)
	),
	new ApiCommand(
		'docode.experimental.executeImplementationProvider_recursive', '_executeImplementationProvider_recursive', 'Execute all implementation providers.',
		[ApiCommandArgument.Uri, ApiCommandArgument.Position],
		new ApiCommandResult<(languages.Location | languages.LocationLink)[], (types.Location | docode.LocationLink)[] | undefined>('A promise that resolves to an array of Location or LocationLink instances.', mapLocationOrLocationLink)
	),
	new ApiCommand(
		'docode.executeReferenceProvider', '_executeReferenceProvider', 'Execute all reference providers.',
		[ApiCommandArgument.Uri, ApiCommandArgument.Position],
		new ApiCommandResult<languages.Location[], types.Location[] | undefined>('A promise that resolves to an array of Location-instances.', tryMapWith(typeConverters.location.to))
	),
	new ApiCommand(
		'docode.experimental.executeReferenceProvider', '_executeReferenceProvider_recursive', 'Execute all reference providers.',
		[ApiCommandArgument.Uri, ApiCommandArgument.Position],
		new ApiCommandResult<languages.Location[], types.Location[] | undefined>('A promise that resolves to an array of Location-instances.', tryMapWith(typeConverters.location.to))
	),
	// -- hover
	new ApiCommand(
		'docode.executeHoverProvider', '_executeHoverProvider', 'Execute all hover providers.',
		[ApiCommandArgument.Uri, ApiCommandArgument.Position],
		new ApiCommandResult<languages.Hover[], types.Hover[] | undefined>('A promise that resolves to an array of Hover-instances.', tryMapWith(typeConverters.Hover.to))
	),
	new ApiCommand(
		'docode.experimental.executeHoverProvider_recursive', '_executeHoverProvider_recursive', 'Execute all hover providers.',
		[ApiCommandArgument.Uri, ApiCommandArgument.Position],
		new ApiCommandResult<languages.Hover[], types.Hover[] | undefined>('A promise that resolves to an array of Hover-instances.', tryMapWith(typeConverters.Hover.to))
	),
	// -- selection range
	new ApiCommand(
		'docode.executeSelectionRangeProvider', '_executeSelectionRangeProvider', 'Execute selection range provider.',
		[ApiCommandArgument.Uri, new ApiCommandArgument<types.Position[], IPosition[]>('position', 'A position in a text document', v => Array.isArray(v) && v.every(v => types.Position.isPosition(v)), v => v.map(typeConverters.Position.from))],
		new ApiCommandResult<IRange[][], types.SelectionRange[]>('A promise that resolves to an array of ranges.', result => {
			return result.map(ranges => {
				let node: types.SelectionRange | undefined;
				for (const range of ranges.reverse()) {
					node = new types.SelectionRange(typeConverters.Range.to(range), node);
				}
				return node!;
			});
		})
	),
	// -- symbol search
	new ApiCommand(
		'docode.executeWorkspaceSymbolProvider', '_executeWorkspaceSymbolProvider', 'Execute all workspace symbol providers.',
		[ApiCommandArgument.String.with('query', 'Search string')],
		new ApiCommandResult<search.IWorkspaceSymbol[], types.SymbolInformation[]>('A promise that resolves to an array of SymbolInformation-instances.', value => {
			return value.map(typeConverters.WorkspaceSymbol.to);
		})
	),
	// --- call hierarchy
	new ApiCommand(
		'docode.prepareCallHierarchy', '_executePrepareCallHierarchy', 'Prepare call hierarchy at a position inside a document',
		[ApiCommandArgument.Uri, ApiCommandArgument.Position],
		new ApiCommandResult<ICallHierarchyItemDto[], types.CallHierarchyItem[]>('A promise that resolves to an array of CallHierarchyItem-instances', v => v.map(typeConverters.CallHierarchyItem.to))
	),
	new ApiCommand(
		'docode.provideIncomingCalls', '_executeProvideIncomingCalls', 'Compute incoming calls for an item',
		[ApiCommandArgument.CallHierarchyItem],
		new ApiCommandResult<IIncomingCallDto[], types.CallHierarchyIncomingCall[]>('A promise that resolves to an array of CallHierarchyIncomingCall-instances', v => v.map(typeConverters.CallHierarchyIncomingCall.to))
	),
	new ApiCommand(
		'docode.provideOutgoingCalls', '_executeProvideOutgoingCalls', 'Compute outgoing calls for an item',
		[ApiCommandArgument.CallHierarchyItem],
		new ApiCommandResult<IOutgoingCallDto[], types.CallHierarchyOutgoingCall[]>('A promise that resolves to an array of CallHierarchyOutgoingCall-instances', v => v.map(typeConverters.CallHierarchyOutgoingCall.to))
	),
	// --- rename
	new ApiCommand(
		'docode.prepareRename', '_executePrepareRename', 'Execute the prepareRename of rename provider.',
		[ApiCommandArgument.Uri, ApiCommandArgument.Position],
		new ApiCommandResult<languages.RenameLocation, { range: types.Range; placeholder: string } | undefined>('A promise that resolves to a range and placeholder text.', value => {
			if (!value) {
				return undefined;
			}
			return {
				range: typeConverters.Range.to(value.range),
				placeholder: value.text
			};
		})
	),
	new ApiCommand(
		'docode.executeDocumentRenameProvider', '_executeDocumentRenameProvider', 'Execute rename provider.',
		[ApiCommandArgument.Uri, ApiCommandArgument.Position, ApiCommandArgument.String.with('newName', 'The new symbol name')],
		new ApiCommandResult<IWorkspaceEditDto & { rejectReason?: string }, types.WorkspaceEdit | undefined>('A promise that resolves to a WorkspaceEdit.', value => {
			if (!value) {
				return undefined;
			}
			if (value.rejectReason) {
				throw new Error(value.rejectReason);
			}
			return typeConverters.WorkspaceEdit.to(value);
		})
	),
	// --- links
	new ApiCommand(
		'docode.executeLinkProvider', '_executeLinkProvider', 'Execute document link provider.',
		[ApiCommandArgument.Uri, ApiCommandArgument.Number.with('linkResolveCount', 'Number of links that should be resolved, only when links are unresolved.').optional()],
		new ApiCommandResult<languages.ILink[], docode.DocumentLink[]>('A promise that resolves to an array of DocumentLink-instances.', value => value.map(typeConverters.DocumentLink.to))
	),
	// --- semantic tokens
	new ApiCommand(
		'docode.provideDocumentSemanticTokensLegend', '_provideDocumentSemanticTokensLegend', 'Provide semantic tokens legend for a document',
		[ApiCommandArgument.Uri],
		new ApiCommandResult<languages.SemanticTokensLegend, types.SemanticTokensLegend | undefined>('A promise that resolves to SemanticTokensLegend.', value => {
			if (!value) {
				return undefined;
			}
			return new types.SemanticTokensLegend(value.tokenTypes, value.tokenModifiers);
		})
	),
	new ApiCommand(
		'docode.provideDocumentSemanticTokens', '_provideDocumentSemanticTokens', 'Provide semantic tokens for a document',
		[ApiCommandArgument.Uri],
		new ApiCommandResult<VSBuffer, types.SemanticTokens | undefined>('A promise that resolves to SemanticTokens.', value => {
			if (!value) {
				return undefined;
			}
			const semanticTokensDto = decodeSemanticTokensDto(value);
			if (semanticTokensDto.type !== 'full') {
				// only accepting full semantic tokens from provideDocumentSemanticTokens
				return undefined;
			}
			return new types.SemanticTokens(semanticTokensDto.data, undefined);
		})
	),
	new ApiCommand(
		'docode.provideDocumentRangeSemanticTokensLegend', '_provideDocumentRangeSemanticTokensLegend', 'Provide semantic tokens legend for a document range',
		[ApiCommandArgument.Uri, ApiCommandArgument.Range.optional()],
		new ApiCommandResult<languages.SemanticTokensLegend, types.SemanticTokensLegend | undefined>('A promise that resolves to SemanticTokensLegend.', value => {
			if (!value) {
				return undefined;
			}
			return new types.SemanticTokensLegend(value.tokenTypes, value.tokenModifiers);
		})
	),
	new ApiCommand(
		'docode.provideDocumentRangeSemanticTokens', '_provideDocumentRangeSemanticTokens', 'Provide semantic tokens for a document range',
		[ApiCommandArgument.Uri, ApiCommandArgument.Range],
		new ApiCommandResult<VSBuffer, types.SemanticTokens | undefined>('A promise that resolves to SemanticTokens.', value => {
			if (!value) {
				return undefined;
			}
			const semanticTokensDto = decodeSemanticTokensDto(value);
			if (semanticTokensDto.type !== 'full') {
				// only accepting full semantic tokens from provideDocumentRangeSemanticTokens
				return undefined;
			}
			return new types.SemanticTokens(semanticTokensDto.data, undefined);
		})
	),
	// --- completions
	new ApiCommand(
		'docode.executeCompletionItemProvider', '_executeCompletionItemProvider', 'Execute completion item provider.',
		[
			ApiCommandArgument.Uri,
			ApiCommandArgument.Position,
			ApiCommandArgument.String.with('triggerCharacter', 'Trigger completion when the user types the character, like `,` or `(`').optional(),
			ApiCommandArgument.Number.with('itemResolveCount', 'Number of completions to resolve (too large numbers slow down completions)').optional()
		],
		new ApiCommandResult<languages.CompletionList, docode.CompletionList>('A promise that resolves to a CompletionList-instance.', (value, _args, converter) => {
			if (!value) {
				return new types.CompletionList([]);
			}
			const items = value.suggestions.map(suggestion => typeConverters.CompletionItem.to(suggestion, converter));
			return new types.CompletionList(items, value.incomplete);
		})
	),
	// --- signature help
	new ApiCommand(
		'docode.executeSignatureHelpProvider', '_executeSignatureHelpProvider', 'Execute signature help provider.',
		[ApiCommandArgument.Uri, ApiCommandArgument.Position, ApiCommandArgument.String.with('triggerCharacter', 'Trigger signature help when the user types the character, like `,` or `(`').optional()],
		new ApiCommandResult<languages.SignatureHelp, docode.SignatureHelp | undefined>('A promise that resolves to SignatureHelp.', value => {
			if (value) {
				return typeConverters.SignatureHelp.to(value);
			}
			return undefined;
		})
	),
	// --- code lens
	new ApiCommand(
		'docode.executeCodeLensProvider', '_executeCodeLensProvider', 'Execute code lens provider.',
		[ApiCommandArgument.Uri, ApiCommandArgument.Number.with('itemResolveCount', 'Number of lenses that should be resolved and returned. Will only return resolved lenses, will impact performance)').optional()],
		new ApiCommandResult<languages.CodeLens[], docode.CodeLens[] | undefined>('A promise that resolves to an array of CodeLens-instances.', (value, _args, converter) => {
			return tryMapWith<languages.CodeLens, docode.CodeLens>(item => {
				return new types.CodeLens(typeConverters.Range.to(item.range), item.command && converter.fromInternal(item.command));
			})(value);
		})
	),
	// --- code actions
	new ApiCommand(
		'docode.executeCodeActionProvider', '_executeCodeActionProvider', 'Execute code action provider.',
		[
			ApiCommandArgument.Uri,
			new ApiCommandArgument('rangeOrSelection', 'Range in a text document. Some refactoring provider requires Selection object.', v => types.Range.isRange(v), v => types.Selection.isSelection(v) ? typeConverters.Selection.from(v) : typeConverters.Range.from(v)),
			ApiCommandArgument.String.with('kind', 'Code action kind to return code actions for').optional(),
			ApiCommandArgument.Number.with('itemResolveCount', 'Number of code actions to resolve (too large numbers slow down code actions)').optional()
		],
		new ApiCommandResult<CustomCodeAction[], (docode.CodeAction | docode.Command | undefined)[] | undefined>('A promise that resolves to an array of Command-instances.', (value, _args, converter) => {
			return tryMapWith<CustomCodeAction, docode.CodeAction | docode.Command | undefined>((codeAction) => {
				if (codeAction._isSynthetic) {
					if (!codeAction.command) {
						throw new Error('Synthetic code actions must have a command');
					}
					return converter.fromInternal(codeAction.command);
				} else {
					const ret = new types.CodeAction(
						codeAction.title,
						codeAction.kind ? new types.CodeActionKind(codeAction.kind) : undefined
					);
					if (codeAction.edit) {
						ret.edit = typeConverters.WorkspaceEdit.to(codeAction.edit);
					}
					if (codeAction.command) {
						ret.command = converter.fromInternal(codeAction.command);
					}
					ret.isPreferred = codeAction.isPreferred;
					return ret;
				}
			})(value);
		})
	),
	// --- colors
	new ApiCommand(
		'docode.executeDocumentColorProvider', '_executeDocumentColorProvider', 'Execute document color provider.',
		[ApiCommandArgument.Uri],
		new ApiCommandResult<IRawColorInfo[], docode.ColorInformation[]>('A promise that resolves to an array of ColorInformation objects.', result => {
			if (result) {
				return result.map(ci => new types.ColorInformation(typeConverters.Range.to(ci.range), typeConverters.Color.to(ci.color)));
			}
			return [];
		})
	),
	new ApiCommand(
		'docode.executeColorPresentationProvider', '_executeColorPresentationProvider', 'Execute color presentation provider.',
		[
			new ApiCommandArgument<types.Color, [number, number, number, number]>('color', 'The color to show and insert', v => v instanceof types.Color, typeConverters.Color.from),
			new ApiCommandArgument<{ uri: URI; range: types.Range }, { uri: URI; range: IRange }>('context', 'Context object with uri and range', _v => true, v => ({ uri: v.uri, range: typeConverters.Range.from(v.range) })),
		],
		new ApiCommandResult<languages.IColorPresentation[], types.ColorPresentation[]>('A promise that resolves to an array of ColorPresentation objects.', result => {
			if (result) {
				return result.map(typeConverters.ColorPresentation.to);
			}
			return [];
		})
	),
	// --- inline hints
	new ApiCommand(
		'docode.executeInlayHintProvider', '_executeInlayHintProvider', 'Execute inlay hints provider',
		[ApiCommandArgument.Uri, ApiCommandArgument.Range],
		new ApiCommandResult<languages.InlayHint[], docode.InlayHint[]>('A promise that resolves to an array of Inlay objects', (result, args, converter) => {
			return result.map(typeConverters.InlayHint.to.bind(undefined, converter));
		})
	),
	// --- folding
	new ApiCommand(
		'docode.executeFoldingRangeProvider', '_executeFoldingRangeProvider', 'Execute folding range provider',
		[ApiCommandArgument.Uri],
		new ApiCommandResult<languages.FoldingRange[] | undefined, docode.FoldingRange[] | undefined>('A promise that resolves to an array of FoldingRange objects', (result, args) => {
			if (result) {
				return result.map(typeConverters.FoldingRange.to);
			}
			return undefined;
		})
	),

	// --- notebooks
	new ApiCommand(
		'docode.resolveNotebookContentProviders', '_resolveNotebookContentProvider', 'Resolve Notebook Content Providers',
		[
			// new ApiCommandArgument<string, string>('viewType', '', v => typeof v === 'string', v => v),
			// new ApiCommandArgument<string, string>('displayName', '', v => typeof v === 'string', v => v),
			// new ApiCommandArgument<object, object>('options', '', v => typeof v === 'object', v => v),
		],
		new ApiCommandResult<{
			viewType: string;
			displayName: string;
			options: { transientOutputs: boolean; transientCellMetadata: TransientCellMetadata; transientDocumentMetadata: TransientDocumentMetadata };
			filenamePattern: (docode.GlobPattern | { include: docode.GlobPattern; exclude: docode.GlobPattern })[];
		}[], {
			viewType: string;
			displayName: string;
			filenamePattern: (docode.GlobPattern | { include: docode.GlobPattern; exclude: docode.GlobPattern })[];
			options: docode.NotebookDocumentContentOptions;
		}[] | undefined>('A promise that resolves to an array of NotebookContentProvider static info objects.', tryMapWith(item => {
			return {
				viewType: item.viewType,
				displayName: item.displayName,
				options: {
					transientOutputs: item.options.transientOutputs,
					transientCellMetadata: item.options.transientCellMetadata,
					transientDocumentMetadata: item.options.transientDocumentMetadata
				},
				filenamePattern: item.filenamePattern.map(pattern => typeConverters.NotebookExclusiveDocumentPattern.to(pattern))
			};
		}))
	),
	// --- debug support
	new ApiCommand(
		'docode.executeInlineValueProvider', '_executeInlineValueProvider', 'Execute inline value provider',
		[
			ApiCommandArgument.Uri,
			ApiCommandArgument.Range,
			new ApiCommandArgument<types.InlineValueContext, IInlineValueContextDto>('context', 'An InlineValueContext', v => v && typeof v.frameId === 'number' && v.stoppedLocation instanceof types.Range, v => typeConverters.InlineValueContext.from(v))
		],
		new ApiCommandResult<languages.InlineValue[], docode.InlineValue[]>('A promise that resolves to an array of InlineValue objects', result => {
			return result.map(typeConverters.InlineValue.to);
		})
	),
	// --- open'ish commands
	new ApiCommand(
		'docode.open', '_workbench.open', 'Opens the provided resource in the editor. Can be a text or binary file, or an http(s) URL. If you need more control over the options for opening a text file, use docode.window.showTextDocument instead.',
		[
			new ApiCommandArgument<URI | string>('uriOrString', 'Uri-instance or string (only http/https)', v => URI.isUri(v) || (typeof v === 'string' && matchesSomeScheme(v, Schemas.http, Schemas.https)), v => v),
			new ApiCommandArgument<docode.ViewColumn | typeConverters.TextEditorOpenOptions | undefined, [docode.ViewColumn?, ITextEditorOptions?] | undefined>('columnOrOptions', 'Either the column in which to open or editor options, see docode.TextDocumentShowOptions',
				v => v === undefined || typeof v === 'number' || typeof v === 'object',
				v => !v ? v : typeof v === 'number' ? [typeConverters.ViewColumn.from(v), undefined] : [typeConverters.ViewColumn.from(v.viewColumn), typeConverters.TextEditorOpenOptions.from(v)]
			).optional(),
			ApiCommandArgument.String.with('label', '').optional()
		],
		ApiCommandResult.Void
	),
	new ApiCommand(
		'docode.openWith', '_workbench.openWith', 'Opens the provided resource with a specific editor.',
		[
			ApiCommandArgument.Uri.with('resource', 'Resource to open'),
			ApiCommandArgument.String.with('viewId', 'Custom editor view id. This should be the viewType string for custom editors or the notebookType string for notebooks. Use \'default\' to use VS Code\'s default text editor'),
			new ApiCommandArgument<docode.ViewColumn | typeConverters.TextEditorOpenOptions | undefined, [docode.ViewColumn?, ITextEditorOptions?] | undefined>('columnOrOptions', 'Either the column in which to open or editor options, see docode.TextDocumentShowOptions',
				v => v === undefined || typeof v === 'number' || typeof v === 'object',
				v => !v ? v : typeof v === 'number' ? [typeConverters.ViewColumn.from(v), undefined] : [typeConverters.ViewColumn.from(v.viewColumn), typeConverters.TextEditorOpenOptions.from(v)],
			).optional()
		],
		ApiCommandResult.Void
	),
	new ApiCommand(
		'docode.diff', '_workbench.diff', 'Opens the provided resources in the diff editor to compare their contents.',
		[
			ApiCommandArgument.Uri.with('left', 'Left-hand side resource of the diff editor'),
			ApiCommandArgument.Uri.with('right', 'Right-hand side resource of the diff editor'),
			ApiCommandArgument.String.with('title', 'Human readable title for the diff editor').optional(),
			new ApiCommandArgument<typeConverters.TextEditorOpenOptions | undefined, [number?, ITextEditorOptions?] | undefined>('columnOrOptions', 'Either the column in which to open or editor options, see docode.TextDocumentShowOptions',
				v => v === undefined || typeof v === 'object',
				v => v && [typeConverters.ViewColumn.from(v.viewColumn), typeConverters.TextEditorOpenOptions.from(v)]
			).optional(),
		],
		ApiCommandResult.Void
	),
	new ApiCommand(
		'docode.changes', '_workbench.changes', 'Opens a list of resources in the changes editor to compare their contents.',
		[
			ApiCommandArgument.String.with('title', 'Human readable title for the changes editor'),
			new ApiCommandArgument<[URI, URI?, URI?][]>('resourceList', 'List of resources to compare',
				resources => {
					for (const resource of resources) {
						if (resource.length !== 3) {
							return false;
						}

						const [label, left, right] = resource;
						if (!URI.isUri(label) ||
							(!URI.isUri(left) && left !== undefined && left !== null) ||
							(!URI.isUri(right) && right !== undefined && right !== null)) {
							return false;
						}
					}

					return true;
				},
				v => v)
		],
		ApiCommandResult.Void
	),
	// --- type hierarchy
	new ApiCommand(
		'docode.prepareTypeHierarchy', '_executePrepareTypeHierarchy', 'Prepare type hierarchy at a position inside a document',
		[ApiCommandArgument.Uri, ApiCommandArgument.Position],
		new ApiCommandResult<ITypeHierarchyItemDto[], types.TypeHierarchyItem[]>('A promise that resolves to an array of TypeHierarchyItem-instances', v => v.map(typeConverters.TypeHierarchyItem.to))
	),
	new ApiCommand(
		'docode.provideSupertypes', '_executeProvideSupertypes', 'Compute supertypes for an item',
		[ApiCommandArgument.TypeHierarchyItem],
		new ApiCommandResult<ITypeHierarchyItemDto[], types.TypeHierarchyItem[]>('A promise that resolves to an array of TypeHierarchyItem-instances', v => v.map(typeConverters.TypeHierarchyItem.to))
	),
	new ApiCommand(
		'docode.provideSubtypes', '_executeProvideSubtypes', 'Compute subtypes for an item',
		[ApiCommandArgument.TypeHierarchyItem],
		new ApiCommandResult<ITypeHierarchyItemDto[], types.TypeHierarchyItem[]>('A promise that resolves to an array of TypeHierarchyItem-instances', v => v.map(typeConverters.TypeHierarchyItem.to))
	),
	// --- testing
	new ApiCommand(
		'docode.revealTestInExplorer', '_revealTestInExplorer', 'Reveals a test instance in the explorer',
		[ApiCommandArgument.TestItem],
		ApiCommandResult.Void
	),
	new ApiCommand(
		'docode.startContinuousTestRun', 'testing.startContinuousRunFromExtension', 'Starts running the given tests with continuous run mode.',
		[ApiCommandArgument.TestProfile, ApiCommandArgument.Arr(ApiCommandArgument.TestItem)],
		ApiCommandResult.Void
	),
	new ApiCommand(
		'docode.stopContinuousTestRun', 'testing.stopContinuousRunFromExtension', 'Stops running the given tests with continuous run mode.',
		[ApiCommandArgument.Arr(ApiCommandArgument.TestItem)],
		ApiCommandResult.Void
	),
	// --- continue edit session
	new ApiCommand(
		'docode.experimental.editSession.continue', '_workbench.editSessions.actions.continueEditSession', 'Continue the current edit session in a different workspace',
		[ApiCommandArgument.Uri.with('workspaceUri', 'The target workspace to continue the current edit session in')],
		ApiCommandResult.Void
	),
	// --- context keys
	new ApiCommand(
		'setContext', '_setContext', 'Set a custom context key value that can be used in when clauses.',
		[
			ApiCommandArgument.String.with('name', 'The context key name'),
			new ApiCommandArgument('value', 'The context key value', () => true, v => v),
		],
		ApiCommandResult.Void
	),
	// --- inline chat
	new ApiCommand(
		'docode.editorChat.start', 'inlineChat.start', 'Invoke a new editor chat session',
		[new ApiCommandArgument<InlineChatEditorApiArg | undefined, InlineChatRunOptions | undefined>('Run arguments', '', _v => true, v => {

			if (!v) {
				return undefined;
			}

			return {
				initialRange: v.initialRange ? typeConverters.Range.from(v.initialRange) : undefined,
				initialSelection: types.Selection.isSelection(v.initialSelection) ? typeConverters.Selection.from(v.initialSelection) : undefined,
				message: v.message,
				attachments: v.attachments,
				autoSend: v.autoSend,
				position: v.position ? typeConverters.Position.from(v.position) : undefined,
				resolveOnResponse: v.resolveOnResponse
			};
		})],
		ApiCommandResult.Void
	),
	// --- extension prompt files
	new ApiCommand(
		'docode.extensionPromptFileProvider', '_listExtensionPromptFiles', 'Get all extension-contributed prompt files (custom agents, instructions, and prompt files).',
		[],
		new ApiCommandResult<IExtensionPromptFileResult[], { uri: docode.Uri; type: PromptsType; extensionId: string }[]>(
			'A promise that resolves to an array of objects containing uri, type, and extensionId.',
			(value) => {
				if (!value) {
					return [];
				}
				return value.map(item => ({
					uri: URI.revive(item.uri),
					type: item.type,
					extensionId: item.extensionId
				}));
			}
		)
	)
];

type InlineChatEditorApiArg = {
	initialRange?: docode.Range;
	initialSelection?: docode.Selection;
	message?: string;
	attachments?: docode.Uri[];
	autoSend?: boolean;
	position?: docode.Position;
	resolveOnResponse?: boolean;
};

type InlineChatRunOptions = {
	initialRange?: IRange;
	initialSelection?: ISelection;
	message?: string;
	attachments?: URI[];
	autoSend?: boolean;
	position?: IPosition;
	resolveOnResponse?: boolean;
};

//#endregion


//#region OLD world

export class ExtHostApiCommands {

	static register(commands: ExtHostCommands) {

		newCommands.forEach(commands.registerApiCommand, commands);

		this._registerValidateWhenClausesCommand(commands);
	}

	private static _registerValidateWhenClausesCommand(commands: ExtHostCommands) {
		commands.registerCommand(false, '_validateWhenClauses', validateWhenClauses);
	}
}

function tryMapWith<T, R>(f: (x: T) => R) {
	return (value: T[]) => {
		if (Array.isArray(value)) {
			return value.map(f);
		}
		return undefined;
	};
}

function mapLocationOrLocationLink(values: (languages.Location | languages.LocationLink)[]): (types.Location | docode.LocationLink)[] | undefined {
	if (!Array.isArray(values)) {
		return undefined;
	}
	const result: (types.Location | docode.LocationLink)[] = [];
	for (const item of values) {
		if (languages.isLocationLink(item)) {
			result.push(typeConverters.DefinitionLink.to(item));
		} else {
			result.push(typeConverters.location.to(item));
		}
	}
	return result;
}
