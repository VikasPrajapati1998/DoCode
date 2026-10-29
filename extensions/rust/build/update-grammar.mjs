/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
//@ts-check

import * as docodeGrammarUpdater from 'vscode-grammar-updater';

docodeGrammarUpdater.update('dustypomerleau/rust-syntax', 'syntaxes/rust.tmLanguage.json', './syntaxes/rust.tmLanguage.json', undefined, 'main');
