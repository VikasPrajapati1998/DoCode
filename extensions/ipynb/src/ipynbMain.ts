/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as docode from 'docode';
import { activate as keepNotebookModelStoreInSync } from './notebookModelStoreSync';
import { notebookImagePasteSetup } from './notebookImagePaste';
import { AttachmentCleaner } from './notebookAttachmentCleaner';
import { serializeNotebookToString } from './serializers';
import { defaultNotebookFormat } from './constants';

// From {nbformat.INotebookMetadata} in @jupyterlab/coreutils
type NotebookMetadata = {
	kernelspec?: {
		name: string;
		display_name: string;
		[propName: string]: unknown;
	};
	language_info?: {
		name: string;
		codemirror_mode?: string | {};
		file_extension?: string;
		mimetype?: string;
		pygments_lexer?: string;
		[propName: string]: unknown;
	};
	orig_nbformat?: number;
	[propName: string]: unknown;
};

type OptionsWithCellContentMetadata = docode.NotebookDocumentContentOptions & { cellContentMetadata: { attachments: boolean } };


export function activate(context: docode.ExtensionContext, serializer: docode.NotebookSerializer) {
	keepNotebookModelStoreInSync(context);
	const notebookSerializerOptions: OptionsWithCellContentMetadata = {
		transientOutputs: false,
		transientDocumentMetadata: {
			cells: true,
			indentAmount: true
		},
		transientCellMetadata: {
			breakpointMargin: true,
			id: false,
			metadata: false,
			attachments: false
		},
		cellContentMetadata: {
			attachments: true
		}
	};
	context.subscriptions.push(docode.workspace.registerNotebookSerializer('jupyter-notebook', serializer, notebookSerializerOptions));

	const interactiveSerializeOptions: OptionsWithCellContentMetadata = {
		transientOutputs: false,
		transientCellMetadata: {
			breakpointMargin: true,
			id: false,
			metadata: false,
			attachments: false
		},
		cellContentMetadata: {
			attachments: true
		}
	};
	context.subscriptions.push(docode.workspace.registerNotebookSerializer('interactive', serializer, interactiveSerializeOptions));

	docode.languages.registerCodeLensProvider({ pattern: '**/*.ipynb' }, {
		provideCodeLenses: (document) => {
			if (
				document.uri.scheme === 'docode-notebook-cell' ||
				document.uri.scheme === 'docode-notebook-cell-metadata' ||
				document.uri.scheme === 'docode-notebook-cell-output'
			) {
				return [];
			}
			const codelens = new docode.CodeLens(new docode.Range(0, 0, 0, 0), { title: 'Open in Notebook Editor', command: 'ipynb.openIpynbInNotebookEditor', arguments: [document.uri] });
			return [codelens];
		}
	});

	context.subscriptions.push(docode.commands.registerCommand('ipynb.newUntitledIpynb', async () => {
		const language = 'python';
		const cell = new docode.NotebookCellData(docode.NotebookCellKind.Code, '', language);
		const data = new docode.NotebookData([cell]);
		data.metadata = {
			cells: [],
			metadata: {},
			nbformat: defaultNotebookFormat.major,
			nbformat_minor: defaultNotebookFormat.minor,
		};
		const doc = await docode.workspace.openNotebookDocument('jupyter-notebook', data);
		await docode.window.showNotebookDocument(doc);
	}));

	context.subscriptions.push(docode.commands.registerCommand('ipynb.openIpynbInNotebookEditor', async (uri: docode.Uri) => {
		if (docode.window.activeTextEditor?.document.uri.toString() === uri.toString()) {
			await docode.commands.executeCommand('workbench.action.closeActiveEditor');
		}
		const document = await docode.workspace.openNotebookDocument(uri);
		await docode.window.showNotebookDocument(document);
	}));

	context.subscriptions.push(notebookImagePasteSetup());

	const enabled = docode.workspace.getConfiguration('ipynb').get('pasteImagesAsAttachments.enabled', false);
	if (enabled) {
		const cleaner = new AttachmentCleaner();
		context.subscriptions.push(cleaner);
	}

	return {
		get dropCustomMetadata() {
			return true;
		},
		exportNotebook: (notebook: docode.NotebookData): Promise<string> => {
			return Promise.resolve(serializeNotebookToString(notebook));
		},
		setNotebookMetadata: async (resource: docode.Uri, metadata: Partial<NotebookMetadata>): Promise<boolean> => {
			const document = docode.workspace.notebookDocuments.find(doc => doc.uri.toString() === resource.toString());
			if (!document) {
				return false;
			}

			const edit = new docode.WorkspaceEdit();
			edit.set(resource, [docode.NotebookEdit.updateNotebookMetadata({
				...document.metadata,
				metadata: {
					...(document.metadata.metadata ?? {}),
					...metadata
				} satisfies NotebookMetadata,
			})]);
			return docode.workspace.applyEdit(edit);
		},
	};
}

export function deactivate() { }
