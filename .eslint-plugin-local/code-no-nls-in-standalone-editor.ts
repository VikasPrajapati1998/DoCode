/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as eslint from 'eslint';
import { join } from 'path';
import { createImportRuleListener } from './utils.ts';

export default new class NoNlsInStandaloneEditorRule implements eslint.Rule.RuleModule {

	readonly meta: eslint.Rule.RuleMetaData = {
		messages: {
			noNls: 'Not allowed to import do/nls in standalone editor modules. Use standaloneStrings.ts'
		},
		schema: false,
	};

	create(context: eslint.Rule.RuleContext): eslint.Rule.RuleListener {

		const fileName = context.filename;
		if (
			/do(\/|\\)editor(\/|\\)standalone(\/|\\)/.test(fileName)
			|| /do(\/|\\)editor(\/|\\)common(\/|\\)standalone(\/|\\)/.test(fileName)
			|| /do(\/|\\)editor(\/|\\)editor.api/.test(fileName)
			|| /do(\/|\\)editor(\/|\\)editor.main/.test(fileName)
			|| /do(\/|\\)editor(\/|\\)editor.worker.start/.test(fileName)
		) {
			return createImportRuleListener((node, path) => {
				// resolve relative paths
				if (path[0] === '.') {
					path = join(context.filename, path);
				}

				if (
					/do(\/|\\)nls/.test(path)
				) {
					context.report({
						loc: node.loc,
						messageId: 'noNls'
					});
				}
			});
		}

		return {};
	}
};

