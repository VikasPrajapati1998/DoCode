/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// @ts-check
import { fixupPluginRules } from '@eslint/compat';
import { defineConfig } from 'eslint/config';
import fs from 'fs';
import { builtinModules } from 'module';
import path from 'path';
import tseslint from 'typescript-eslint';

import stylistic from '@stylistic/eslint-plugin';
import * as pluginLocal from './.eslint-plugin-local/index.ts';
import pluginImport from 'eslint-plugin-import';
import pluginJsdoc from 'eslint-plugin-jsdoc';

import pluginHeader from 'eslint-plugin-header';
pluginHeader.rules.header.meta.schema = false;

const ignores = fs.readFileSync(path.join(import.meta.dirname, '.eslint-ignore'), 'utf8')
	.toString()
	.split(/\r\n|\n/)
	.filter(line => line && !line.startsWith('#'));

const allowedJavaScriptFiles = fs.readFileSync(path.join(import.meta.dirname, '.eslint-allowed-javascript-files'), 'utf8')
	.toString()
	.split(/\r\n|\n/)
	.map(line => line.trim())
	.filter(line => line && !line.startsWith('#'));

const allowedBracketNotationFiles = fs.readFileSync(path.join(import.meta.dirname, '.eslint-allowed-bracket-notation-files'), 'utf8')
	.toString()
	.split(/\r\n|\n/)
	.map(line => line.trim())
	.filter(line => line && !line.startsWith('#'));

export default defineConfig(
	// Global ignores
	{
		ignores: [
			...ignores,
			'!**/.eslint-plugin-local/**/*'
		],
	},
	// All files (JS and TS)
	{
		languageOptions: {
			parser: tseslint.parser,
		},
		plugins: {
			'local': pluginLocal,
			'header': fixupPluginRules(/** @type {any} */ (pluginHeader)),
		},
		rules: {
			'constructor-super': 'warn',
			'curly': 'warn',
			'eqeqeq': 'warn',
			'prefer-const': [
				'warn',
				{
					'destructuring': 'all'
				}
			],
			'no-buffer-constructor': 'warn',
			'no-caller': 'warn',
			'no-case-declarations': 'warn',
			'no-debugger': 'warn',
			'no-duplicate-case': 'warn',
			'no-duplicate-imports': 'warn',
			'no-eval': 'warn',
			'no-async-promise-executor': 'warn',
			'no-extra-semi': 'warn',
			'no-new-wrappers': 'warn',
			'no-redeclare': 'off',
			'no-sparse-arrays': 'warn',
			'no-throw-literal': 'warn',
			'no-unsafe-finally': 'warn',
			'no-unused-labels': 'warn',
			'no-misleading-character-class': 'warn',
			'no-restricted-globals': [
				'warn',
				'name',
				'length',
				'event',
				'closed',
				'external',
				'status',
				'origin',
				'orientation',
				'context'
			], // non-complete list of globals that are easy to access unintentionally
			'no-var': 'warn',
			'semi': 'warn',
			'local/code-translation-remind': 'warn',
			'local/code-no-declare-const-enum': 'warn',
			'local/code-parameter-properties-must-have-explicit-accessibility': 'warn',
			'local/code-no-nls-in-standalone-editor': 'warn',
			'local/code-no-potentially-unsafe-disposables': 'warn',
			'local/code-no-dangerous-type-assertions': 'warn',
			'local/code-no-any-casts': 'warn',
			'local/code-no-standalone-editor': 'warn',
			'local/code-no-unexternalized-strings': 'warn',
			'local/code-must-use-super-dispose': 'warn',
			'local/code-declare-service-brand': 'warn',
			'local/code-no-reader-after-await': 'warn',
			'local/code-no-accessor-after-await': 'warn',
			'local/code-no-observable-get-in-reactive-context': 'warn',
			'local/code-no-localized-model-description': 'warn',
			'local/code-policy-localization-key-match': 'warn',
			'local/code-no-localization-template-literals': 'error',
			'local/code-no-icons-in-localized-strings': 'warn',
			'local/code-no-http-import': ['warn', { target: 'src/do/**' }],
			'local/code-no-deep-import-of-internal': ['error', { '.*Internal': true, 'searchExtTypesInternal': false }],
			'local/code-no-private-agent-host-meta-import': 'error',
			'local/code-layering': [
				'warn',
				{
					'common': [],
					'node': [
						'common'
					],
					'browser': [
						'common'
					],
					'electron-browser': [
						'common',
						'browser'
					],
					'electron-utility': [
						'common',
						'node'
					],
					'electron-main': [
						'common',
						'node',
						'electron-utility'
					]
				}
			],
			'header/header': [
				2,
				'block',
				[
					'---------------------------------------------------------------------------------------------',
					' *  Copyright (c) Microsoft Corporation. All rights reserved.',
					' *  Licensed under the MIT License. See License.txt in the project root for license information.',
					' *--------------------------------------------------------------------------------------------'
				]
			]
		},
	},
	// Production filesystem operations must not block the event loop.
	{
		files: [
			'src/**/*.{ts,tsx,js,jsx,mjs,cjs,mts,cts}',
			'extensions/**/src/**/*.{ts,tsx,js,jsx,mjs,cjs,mts,cts}',
		],
		ignores: [
			// Bootstrap entry points and the AMD loader retain their startup I/O.
			'src/*',
			'src/do/amdX.ts',
			'src/do/code/electron-main/main.ts',
			// Core synchronous helpers and startup/shutdown infrastructure.
			'src/do/base/node/pfs.ts',
			'src/do/platform/environment/node/wait.ts',
			'src/do/server/node/remoteExtensionHostAgentServer.ts',
			'src/do/server/node/server.main.ts',
			'src/do/workbench/api/node/extHostCLIServer.ts',
			'src/do/workbench/api/node/extHostExtensionService.ts',
			'src/do/workbench/api/node/extHostStoragePaths.ts',
			'**/test/**',
			'**/tests/**',
			'**/fixtures/**',
			'**/*.{test,spec,stest,integrationTest}.{ts,tsx,js,jsx,mts,cts,mjs,cjs}',
			'**/scripts/**',
			'**/script/**',
			'**/build/**',
			'extensions/docode-test-resolver/**',
			'extensions/docode-api-tests/**',
			// These isolated CLI/askpass processes do not share the application's event loop.
			'src/do/code/node/cli.ts',
			'src/do/server/node/server.cli.ts',
			'extensions/git/src/askpass-main.ts',
		],
		rules: {
			'local/code-no-sync-fs': 'error',
		},
	},
	// Disallow bracket notation for property names that can use dot notation.
	{
		files: [
			'**/*.{js,cjs,mjs,ts,tsx,mts,cts}',
			'.eslint-plugin-local/**/*.ts',
		],
		ignores: allowedBracketNotationFiles,
		plugins: {
			'local': pluginLocal,
		},
		rules: {
			'local/code-no-bracket-notation-for-identifiers': 'warn',
		},
	},
	// TS
	{
		files: [
			'**/*.{ts,tsx,mts,cts}',
		],
		languageOptions: {
			parser: tseslint.parser,
		},
		plugins: {
			'@stylistic': stylistic,
			'@typescript-eslint': tseslint.plugin,
			'local': pluginLocal,
			'jsdoc': pluginJsdoc,
		},
		rules: {
			// Disable built-in semi rules in favor of stylistic
			'semi': 'off',
			'@stylistic/semi': 'warn',
			'@stylistic/member-delimiter-style': 'warn',
			'local/code-no-unused-expressions': [
				'warn',
				{
					'allowTernary': true
				}
			],
			'jsdoc/no-types': 'warn',
			'local/code-no-static-self-ref': 'warn',
			'@typescript-eslint/naming-convention': [
				'warn',
				{
					'selector': 'class',
					'format': [
						'PascalCase'
					]
				}
			]
		}
	},
	{
		files: [
			'src/do/platform/agentHost/test/**/missionControl*.test.ts',
			'src/do/platform/agentHost/test/**/protocolServerHandler.test.ts',
			'src/do/platform/agentHost/test/**/agentHostProtocolClient.test.ts',
			'src/do/platform/agentHost/test/**/webPubSubRelayTransport.test.ts',
			'src/do/platform/agentHost/test/common/webPubSub/*.test.ts',
			'src/do/workbench/contrib/chat/test/browser/remoteAgentHost/cloudSandbox*.test.ts',
			'src/do/sessions/contrib/providers/remoteAgentHost/test/browser/remoteAgentHost.contribution.test.ts',
		],
		plugins: {
			'agent-host-test': {
				rules: {
					'no-nested-tests': {
						meta: {
							type: 'problem',
							schema: [],
							messages: { nested: 'Declare tests in the suite, not inside another test; Mocha does not execute nested declarations.' },
						},
						create(context) {
							return {
								'CallExpression[callee.name="test"] CallExpression[callee.name="test"]'(node) {
									context.report({ node, messageId: 'nested' });
								},
							};
						},
					},
				},
			},
		},
		rules: {
			'agent-host-test/no-nested-tests': 'error',
		},
	},
	// Disallow common telemetry properties in event data
	{
		files: [
			'src/**/*.ts',
		],
		plugins: {
			'local': pluginLocal,
		},
		rules: {
			'local/code-no-telemetry-common-property': 'warn',
		}
	},
	// Force all gulp imports under build/ to go through the gulp facade
	{
		files: [
			'build/**/*.ts',
		],
		plugins: {
			'local': pluginLocal,
		},
		rules: {
			'local/code-no-direct-gulp-import': 'warn',
		}
	},
	// Disallow 'in' operator except in type predicates
	{
		files: [
			'**/*.ts',
			'.eslint-plugin-local/**/*.ts', // Explicitly include files under dot directories
		],
		ignores: [
			'src/bootstrap-node.ts',
			'build/lib/extensions.ts',
			'build/lib/test/render.test.ts',
			'extensions/debug-auto-launch/src/extension.ts',
			'extensions/emmet/src/updateImageSize.ts',
			'extensions/emmet/src/util.ts',
			'extensions/github-authentication/src/node/fetch.ts',
			'extensions/tunnel-forwarding/src/extension.ts',
			'extensions/typescript-language-features/src/utils/platform.ts',
			'extensions/typescript-language-features/web/src/webServer.ts',
			'src/do/base/browser/broadcast.ts',
			'src/do/base/browser/canIUse.ts',
			'src/do/base/browser/dom.ts',
			'src/do/base/browser/markdownRenderer.ts',
			'src/do/base/browser/touch.ts',
			'src/do/base/common/async.ts',
			'src/do/base/common/desktopEnvironmentInfo.ts',
			'src/do/base/common/objects.ts',
			'src/do/base/common/observableInternal/logging/consoleObservableLogger.ts',
			'src/do/base/common/observableInternal/logging/debugger/devToolsLogger.ts',
			'src/do/base/test/common/snapshot.ts',
			'src/do/base/test/common/timeTravelScheduler.ts',
			'src/do/editor/browser/controller/editContext/native/debugEditContext.ts',
			'src/do/editor/browser/gpu/gpuUtils.ts',
			'src/do/editor/browser/gpu/taskQueue.ts',
			'src/do/editor/browser/view.ts',
			'src/do/editor/browser/widget/diffEditor/diffEditorWidget.ts',
			'src/do/editor/browser/widget/diffEditor/utils.ts',
			'src/do/editor/browser/widget/multiDiffEditor/multiDiffEditorWidgetImpl.ts',
			'src/do/editor/common/config/editorOptions.ts',
			'src/do/editor/contrib/dropOrPasteInto/browser/copyPasteContribution.ts',
			'src/do/editor/contrib/dropOrPasteInto/browser/copyPasteController.ts',
			'src/do/editor/contrib/dropOrPasteInto/browser/edit.ts',
			'src/do/editor/contrib/inlineCompletions/browser/model/provideInlineCompletions.ts',
			'src/do/editor/contrib/inlineCompletions/browser/view/ghostText/ghostTextView.ts',
			'src/do/editor/contrib/inlineCompletions/browser/view/inlineEdits/inlineEditsViews/debugVisualization.ts',
			'src/do/platform/accessibilitySignal/browser/accessibilitySignalService.ts',
			'src/do/platform/configuration/common/configuration.ts',
			'src/do/platform/configuration/common/configurationModels.ts',
			'src/do/platform/contextkey/browser/contextKeyService.ts',
			'src/do/platform/contextkey/test/common/scanner.test.ts',
			'src/do/platform/dataChannel/browser/forwardingTelemetryService.ts',
			'src/do/platform/hover/browser/hoverService.ts',
			'src/do/platform/hover/browser/hoverWidget.ts',
			'src/do/platform/instantiation/common/instantiationService.ts',
			'src/do/platform/mcp/common/mcpManagementCli.ts',
			'src/do/workbench/api/browser/mainThreadChatSessions.ts',
			'src/do/workbench/api/browser/mainThreadDebugService.ts',
			'src/do/workbench/api/browser/mainThreadTesting.ts',
			'src/do/workbench/api/common/extHost.api.impl.ts',
			'src/do/workbench/api/common/extHostChatAgents2.ts',
			'src/do/workbench/api/common/extHostChatSessions.ts',
			'src/do/workbench/api/common/extHostDebugService.ts',
			'src/do/workbench/api/common/extHostNotebookKernels.ts',
			'src/do/workbench/api/common/extHostQuickOpen.ts',
			'src/do/workbench/api/common/extHostRequireInterceptor.ts',
			'src/do/workbench/api/common/extHostTypeConverters.ts',
			'src/do/workbench/api/common/extHostTypes.ts',
			'src/do/workbench/api/node/loopbackServer.ts',
			'src/do/workbench/api/node/proxyResolver.ts',
			'src/do/workbench/api/test/common/extHostTypeConverters.test.ts',
			'src/do/workbench/api/test/common/testRPCProtocol.ts',
			'src/do/workbench/api/worker/extHostExtensionService.ts',
			'src/do/workbench/browser/parts/paneCompositeBar.ts',
			'src/do/workbench/browser/parts/titlebar/titlebarPart.ts',
			'src/do/workbench/browser/workbench.ts',
			'src/do/workbench/common/notifications.ts',
			'src/do/workbench/contrib/accessibility/browser/accessibleView.ts',
			'src/do/workbench/contrib/chat/browser/attachments/chatAttachmentResolveService.ts',
			'src/do/workbench/contrib/chat/browser/widget/chatContentParts/chatAttachmentsContentPart.ts',
			'src/do/workbench/contrib/chat/browser/widget/chatContentParts/chatConfirmationWidget.ts',
			'src/do/workbench/contrib/chat/browser/widget/chatContentParts/chatElicitationContentPart.ts',
			'src/do/workbench/contrib/chat/browser/widget/chatContentParts/chatReferencesContentPart.ts',
			'src/do/workbench/contrib/chat/browser/widget/chatContentParts/chatTreeContentPart.ts',
			'src/do/workbench/contrib/chat/browser/widget/chatContentParts/toolInvocationParts/abstractToolConfirmationSubPart.ts',
			'src/do/workbench/contrib/chat/browser/chatEditing/chatEditingSession.ts',
			'src/do/workbench/contrib/chat/browser/chatEditing/chatEditingSessionStorage.ts',
			'src/do/workbench/contrib/chat/browser/widget/chatContentParts/chatInlineAnchorWidget.ts',
			'src/do/workbench/contrib/chat/browser/accessibility/chatResponseAccessibleView.ts',
			'src/do/workbench/contrib/chat/browser/widget/input/editor/chatInputCompletions.ts',
			'src/do/workbench/contrib/chat/common/model/chatModel.ts',
			'src/do/workbench/contrib/chat/test/common/promptSyntax/testUtils/mockFilesystem.test.ts',
			'src/do/workbench/contrib/chat/test/common/promptSyntax/testUtils/mockFilesystem.ts',
			'src/do/workbench/contrib/chat/test/common/tools/builtinTools/manageTodoListTool.test.ts',
			'src/do/workbench/contrib/debug/browser/debugAdapterManager.ts',
			'src/do/workbench/contrib/debug/browser/variablesView.ts',
			'src/do/workbench/contrib/debug/browser/watchExpressionsView.ts',
			'src/do/workbench/contrib/debug/common/debugModel.ts',
			'src/do/workbench/contrib/debug/common/debugger.ts',
			'src/do/workbench/contrib/debug/common/replAccessibilityAnnouncer.ts',
			'src/do/workbench/contrib/editSessions/browser/editSessionsStorageService.ts',
			'src/do/workbench/contrib/editTelemetry/browser/helpers/documentWithAnnotatedEdits.ts',
			'src/do/workbench/contrib/extensions/common/extensionQuery.ts',
			'src/do/workbench/contrib/interactive/browser/interactiveEditorInput.ts',
			'src/do/workbench/contrib/issue/browser/issueFormService.ts',
			'src/do/workbench/contrib/issue/browser/issueQuickAccess.ts',
			'src/do/workbench/contrib/markers/browser/markersView.ts',
			'src/do/workbench/contrib/mcp/browser/mcpElicitationService.ts',
			'src/do/workbench/contrib/mcp/common/mcpLanguageModelToolContribution.ts',
			'src/do/workbench/contrib/mcp/common/mcpResourceFilesystem.ts',
			'src/do/workbench/contrib/mcp/common/mcpSamplingLog.ts',
			'src/do/workbench/contrib/mcp/common/mcpServer.ts',
			'src/do/workbench/contrib/mcp/common/mcpServerRequestHandler.ts',
			'src/do/workbench/contrib/mcp/test/common/mcpRegistryTypes.ts',
			'src/do/workbench/contrib/mcp/test/common/mcpServerRequestHandler.test.ts',
			'src/do/workbench/contrib/notebook/browser/controller/cellOutputActions.ts',
			'src/do/workbench/contrib/notebook/browser/controller/chat/notebook.chat.contribution.ts',
			'src/do/workbench/contrib/notebook/browser/controller/coreActions.ts',
			'src/do/workbench/contrib/notebook/browser/view/renderers/backLayerWebView.ts',
			'src/do/workbench/contrib/notebook/browser/viewParts/notebookKernelView.ts',
			'src/do/workbench/contrib/output/browser/outputView.ts',
			'src/do/workbench/contrib/preferences/browser/settingsTree.ts',
			'src/do/workbench/contrib/remoteTunnel/electron-browser/remoteTunnel.contribution.ts',
			'src/do/workbench/contrib/testing/browser/explorerProjections/listProjection.ts',
			'src/do/workbench/contrib/testing/browser/explorerProjections/treeProjection.ts',
			'src/do/workbench/contrib/testing/browser/testCoverageBars.ts',
			'src/do/workbench/contrib/testing/browser/testExplorerActions.ts',
			'src/do/workbench/contrib/testing/browser/testingOutputPeek.ts',
			'src/do/workbench/contrib/testing/browser/testingProgressUiService.ts',
			'src/do/workbench/contrib/testing/browser/testResultsView/testResultsTree.ts',
			'src/do/workbench/contrib/testing/common/testCoverageService.ts',
			'src/do/workbench/contrib/testing/common/testResultService.ts',
			'src/do/workbench/contrib/testing/common/testingChatAgentTool.ts',
			'src/do/workbench/contrib/testing/test/browser/testObjectTree.ts',
			'src/do/workbench/contrib/themes/browser/themes.contribution.ts',
			'src/do/workbench/contrib/welcomeGettingStarted/browser/gettingStarted.contribution.ts',
			'src/do/workbench/services/environment/electron-browser/environmentService.ts',
			'src/do/workbench/services/keybinding/common/keybindingIO.ts',
			'src/do/workbench/services/preferences/common/preferencesValidation.ts',
			'src/do/workbench/services/remote/common/tunnelModel.ts',
			'src/do/workbench/services/search/common/textSearchManager.ts',
			'src/do/workbench/test/browser/workbenchTestServices.ts',
			'src/do/platform/agentHost/common/state/protocol/**',
			'test/automation/src/playwrightDriver.ts',
			'.eslint-plugin-local/**/*',
		],
		plugins: {
			'local': pluginLocal,
		},
		rules: {
			'local/code-no-in-operator': 'warn',
		}
	},
	// Guard the agent host protocol `_meta` bag: no untyped field access or casts.
	{
		files: [
			'src/do/platform/agentHost/**/*.ts',
			'src/do/workbench/contrib/chat/browser/agentSessions/**/*.ts',
			'src/do/workbench/services/agentHost/**/*.ts',
			'src/do/sessions/**/*.ts',
		],
		ignores: [
			// Tests assert on the raw `_meta` wire shape on purpose (verifying
			// producers); routing them through readers would weaken them.
			'**/test/**',
			'**/*.test.ts',
			'**/*.integrationTest.ts',
			// This directory is the validation boundary for typed metadata
			// readers. Callers elsewhere must consume those readers.
			'src/do/platform/agentHost/common/meta/**',
			// Copilot SDK metadata is already typed and is not an AHP `_meta`
			// bag. Keep its access isolated in one adapter.
			'src/do/platform/agentHost/node/copilot/copilotSdkMeta.ts',
			// Codex's own generated app-server protocol (not AHP `_meta`).
			'src/do/platform/agentHost/node/codex/protocol/**',
		],
		plugins: {
			'local': pluginLocal,
		},
		rules: {
			'local/code-no-untyped-meta-access': 'warn',
		}
	},
	// Strict no explicit `any`
	{
		files: [
			// Extensions
			'extensions/git/src/**/*.ts',
			'extensions/git-base/src/**/*.ts',
			'extensions/github/src/**/*.ts',
			// docode
			'src/**/*.ts',
		],
		ignores: [
			// Extensions
			'extensions/git/src/commands.ts',
			'extensions/git/src/decorators.ts',
			'extensions/git/src/git.ts',
			'extensions/git/src/util.ts',
			'extensions/git-base/src/decorators.ts',
			'extensions/github/src/util.ts',
			// docode d.ts
			'src/do/amdX.ts',
			'src/do/monaco.d.ts',
			'src/docode-dts/**',
			// Base
			'src/do/base/browser/dom.ts',
			'src/do/base/browser/mouseEvent.ts',
			'src/do/base/node/processes.ts',
			'src/do/base/common/arrays.ts',
			'src/do/base/common/async.ts',
			'src/do/base/common/console.ts',
			'src/do/base/common/decorators.ts',
			'src/do/base/common/errorMessage.ts',
			'src/do/base/common/errors.ts',
			'src/do/base/common/event.ts',
			'src/do/base/common/hotReload.ts',
			'src/do/base/common/hotReloadHelpers.ts',
			'src/do/base/common/json.ts',
			'src/do/base/common/jsonSchema.ts',
			'src/do/base/common/lifecycle.ts',
			'src/do/base/common/map.ts',
			'src/do/base/common/marshalling.ts',
			'src/do/base/common/objects.ts',
			'src/do/base/common/performance.ts',
			'src/do/base/common/platform.ts',
			'src/do/base/common/processes.ts',
			'src/do/base/common/types.ts',
			'src/do/base/common/uriIpc.ts',
			'src/do/base/common/verifier.ts',
			'src/do/base/common/observableInternal/base.ts',
			'src/do/base/common/observableInternal/changeTracker.ts',
			'src/do/base/common/observableInternal/set.ts',
			'src/do/base/common/observableInternal/transaction.ts',
			'src/do/base/common/worker/webWorkerBootstrap.ts',
			'src/do/base/test/common/mock.ts',
			'src/do/base/test/common/snapshot.ts',
			'src/do/base/test/common/timeTravelScheduler.ts',
			'src/do/base/test/common/troubleshooting.ts',
			'src/do/base/test/common/utils.ts',
			'src/do/base/browser/ui/breadcrumbs/breadcrumbsWidget.ts',
			'src/do/base/browser/ui/grid/grid.ts',
			'src/do/base/browser/ui/grid/gridview.ts',
			'src/do/base/browser/ui/list/listPaging.ts',
			'src/do/base/browser/ui/list/listView.ts',
			'src/do/base/browser/ui/list/listWidget.ts',
			'src/do/base/browser/ui/list/rowCache.ts',
			'src/do/base/browser/ui/sash/sash.ts',
			'src/do/base/browser/ui/table/tableWidget.ts',
			'src/do/base/parts/ipc/common/ipc.net.ts',
			'src/do/base/parts/ipc/common/ipc.ts',
			'src/do/base/parts/ipc/electron-main/ipcMain.ts',
			'src/do/base/parts/ipc/node/ipc.cp.ts',
			'src/do/base/common/observableInternal/experimental/reducer.ts',
			'src/do/base/common/observableInternal/experimental/utils.ts',
			'src/do/base/common/observableInternal/logging/consoleObservableLogger.ts',
			'src/do/base/common/observableInternal/logging/debugGetDependencyGraph.ts',
			'src/do/base/common/observableInternal/logging/logging.ts',
			'src/do/base/common/observableInternal/observables/baseObservable.ts',
			'src/do/base/common/observableInternal/observables/derived.ts',
			'src/do/base/common/observableInternal/observables/derivedImpl.ts',
			'src/do/base/common/observableInternal/observables/observableFromEvent.ts',
			'src/do/base/common/observableInternal/observables/observableSignalFromEvent.ts',
			'src/do/base/common/observableInternal/reactions/autorunImpl.ts',
			'src/do/base/common/observableInternal/utils/utils.ts',
			'src/do/base/common/observableInternal/utils/utilsCancellation.ts',
			'src/do/base/parts/ipc/test/node/testService.ts',
			'src/do/base/common/observableInternal/logging/debugger/debuggerRpc.ts',
			'src/do/base/common/observableInternal/logging/debugger/devToolsLogger.ts',
			'src/do/base/common/observableInternal/logging/debugger/rpc.ts',
			'src/do/base/test/browser/ui/grid/util.ts',
			// Platform
			'src/do/platform/commands/common/commands.ts',
			'src/do/platform/contextkey/browser/contextKeyService.ts',
			'src/do/platform/contextkey/common/contextkey.ts',
			'src/do/platform/contextview/browser/contextView.ts',
			'src/do/platform/debug/common/extensionHostDebugIpc.ts',
			'src/do/platform/debug/electron-main/extensionHostDebugIpc.ts',
			'src/do/platform/diagnostics/common/diagnostics.ts',
			'src/do/platform/download/common/downloadIpc.ts',
			'src/do/platform/extensions/common/extensions.ts',
			'src/do/platform/instantiation/common/descriptors.ts',
			'src/do/platform/instantiation/common/extensions.ts',
			'src/do/platform/instantiation/common/instantiation.ts',
			'src/do/platform/instantiation/common/instantiationService.ts',
			'src/do/platform/instantiation/common/serviceCollection.ts',
			'src/do/platform/keybinding/common/keybinding.ts',
			'src/do/platform/keybinding/common/keybindingResolver.ts',
			'src/do/platform/keybinding/common/keybindingsRegistry.ts',
			'src/do/platform/keybinding/common/resolvedKeybindingItem.ts',
			'src/do/platform/languagePacks/node/languagePacks.ts',
			'src/do/platform/list/browser/listService.ts',
			'src/do/platform/log/browser/log.ts',
			'src/do/platform/log/common/log.ts',
			'src/do/platform/log/common/logIpc.ts',
			'src/do/platform/log/electron-main/logIpc.ts',
			'src/do/platform/meteredConnection/electron-main/meteredConnectionChannel.ts',
			'src/do/platform/observable/common/wrapInHotClass.ts',
			'src/do/platform/observable/common/wrapInReloadableClass.ts',
			'src/do/platform/policy/common/policyIpc.ts',
			'src/do/platform/profiling/common/profilingTelemetrySpec.ts',
			'src/do/platform/quickinput/browser/quickInputActions.ts',
			'src/do/platform/quickinput/common/quickInput.ts',
			'src/do/platform/registry/common/platform.ts',
			'src/do/platform/remote/browser/browserSocketFactory.ts',
			'src/do/platform/remote/browser/remoteAuthorityResolverService.ts',
			'src/do/platform/remote/common/remoteAgentConnection.ts',
			'src/do/platform/remote/common/remoteAuthorityResolver.ts',
			'src/do/platform/remote/electron-browser/electronRemoteResourceLoader.ts',
			'src/do/platform/remote/electron-browser/remoteAuthorityResolverService.ts',
			'src/do/platform/remoteTunnel/node/remoteTunnelService.ts',
			'src/do/platform/request/common/request.ts',
			'src/do/platform/request/common/requestIpc.ts',
			'src/do/platform/request/electron-utility/requestService.ts',
			'src/do/platform/request/node/proxy.ts',
			'src/do/platform/telemetry/browser/errorTelemetry.ts',
			'src/do/platform/telemetry/common/errorTelemetry.ts',
			'src/do/platform/telemetry/common/remoteTelemetryChannel.ts',
			'src/do/platform/telemetry/node/errorTelemetry.ts',
			'src/do/platform/theme/common/iconRegistry.ts',
			'src/do/platform/theme/common/tokenClassificationRegistry.ts',
			'src/do/platform/update/common/updateIpc.ts',
			'src/do/platform/update/electron-main/updateService.snap.ts',
			'src/do/platform/url/common/urlIpc.ts',
			'src/do/platform/userDataProfile/common/userDataProfileIpc.ts',
			'src/do/platform/userDataProfile/electron-main/userDataProfileStorageIpc.ts',
			'src/do/platform/userDataSync/common/abstractSynchronizer.ts',
			'src/do/platform/userDataSync/common/extensionsMerge.ts',
			'src/do/platform/userDataSync/common/extensionsSync.ts',
			'src/do/platform/userDataSync/common/globalStateMerge.ts',
			'src/do/platform/userDataSync/common/globalStateSync.ts',
			'src/do/platform/userDataSync/common/settingsMerge.ts',
			'src/do/platform/userDataSync/common/settingsSync.ts',
			'src/do/platform/userDataSync/common/userDataSync.ts',
			'src/do/platform/userDataSync/common/userDataSyncIpc.ts',
			'src/do/platform/userDataSync/common/userDataSyncServiceIpc.ts',
			'src/do/platform/webview/common/webviewManagerService.ts',
			'src/do/platform/instantiation/test/common/instantiationServiceMock.ts',
			'src/do/platform/keybinding/test/common/mockKeybindingService.ts',
			// Editor
			'src/do/editor/standalone/browser/standaloneEditor.ts',
			'src/do/editor/standalone/browser/standaloneLanguages.ts',
			'src/do/editor/standalone/browser/standaloneServices.ts',
			'src/do/editor/test/browser/testCodeEditor.ts',
			'src/do/editor/test/common/testTextModel.ts',
			'src/do/editor/contrib/bracketMatching/browser/bracketMatching.ts',
			'src/do/editor/contrib/codeAction/browser/codeAction.ts',
			'src/do/editor/contrib/codeAction/browser/codeActionCommands.ts',
			'src/do/editor/contrib/codeAction/common/types.ts',
			'src/do/editor/contrib/colorPicker/browser/colorDetector.ts',
			'src/do/editor/contrib/diffEditorBreadcrumbs/browser/contribution.ts',
			'src/do/editor/contrib/dropOrPasteInto/browser/dropIntoEditorContribution.ts',
			'src/do/editor/contrib/find/browser/findController.ts',
			'src/do/editor/contrib/find/browser/findModel.ts',
			'src/do/editor/contrib/gotoSymbol/browser/goToCommands.ts',
			'src/do/editor/contrib/gotoSymbol/browser/symbolNavigation.ts',
			'src/do/editor/contrib/hover/browser/hoverActions.ts',
			'src/do/editor/contrib/inlineCompletions/browser/structuredLogger.ts',
			'src/do/editor/contrib/inlineCompletions/browser/utils.ts',
			'src/do/editor/contrib/smartSelect/browser/smartSelect.ts',
			'src/do/editor/contrib/stickyScroll/browser/stickyScrollModelProvider.ts',
			'src/do/editor/contrib/unicodeHighlighter/browser/unicodeHighlighter.ts',
			'src/do/editor/contrib/wordHighlighter/browser/wordHighlighter.ts',
			'src/do/editor/standalone/common/monarch/monarchCommon.ts',
			'src/do/editor/standalone/common/monarch/monarchCompile.ts',
			'src/do/editor/standalone/common/monarch/monarchLexer.ts',
			'src/do/editor/standalone/common/monarch/monarchTypes.ts',
			'src/do/editor/contrib/inlineCompletions/browser/controller/commands.ts',
			'src/do/editor/contrib/inlineCompletions/browser/model/inlineCompletionsModel.ts',
			'src/do/editor/contrib/inlineCompletions/browser/model/typingSpeed.ts',
			'src/do/editor/contrib/inlineCompletions/test/browser/utils.ts',
			'src/do/editor/contrib/inlineCompletions/browser/view/ghostText/ghostTextView.ts',
			'src/do/editor/contrib/inlineCompletions/browser/view/inlineEdits/components/gutterIndicatorView.ts',
			'src/do/editor/contrib/inlineCompletions/browser/view/inlineEdits/inlineEditsViews/debugVisualization.ts',
			'src/do/editor/contrib/inlineCompletions/browser/view/inlineEdits/utils/utils.ts',
			// Workbench
			'src/do/workbench/api/browser/mainThreadChatSessions.ts',
			'src/do/workbench/api/common/extHost.api.impl.ts',
			'src/do/workbench/api/common/extHost.protocol.ts',
			'src/do/workbench/api/common/extHostChatSessions.ts',
			'src/do/workbench/api/common/extHostCodeInsets.ts',
			'src/do/workbench/api/common/extHostCommands.ts',
			'src/do/workbench/api/common/extHostConsoleForwarder.ts',
			'src/do/workbench/api/common/extHostDataChannels.ts',
			'src/do/workbench/api/common/extHostDebugService.ts',
			'src/do/workbench/api/common/extHostExtensionActivator.ts',
			'src/do/workbench/api/common/extHostExtensionService.ts',
			'src/do/workbench/api/common/extHostFileSystemConsumer.ts',
			'src/do/workbench/api/common/extHostFileSystemEventService.ts',
			'src/do/workbench/api/common/extHostLanguageFeatures.ts',
			'src/do/workbench/api/common/extHostLanguageModelTools.ts',
			'src/do/workbench/api/common/extHostMcp.ts',
			'src/do/workbench/api/common/extHostMemento.ts',
			'src/do/workbench/api/common/extHostMessageService.ts',
			'src/do/workbench/api/common/extHostNotebookDocument.ts',
			'src/do/workbench/api/common/extHostNotebookDocumentSaveParticipant.ts',
			'src/do/workbench/api/common/extHostRequireInterceptor.ts',
			'src/do/workbench/api/common/extHostRpcService.ts',
			'src/do/workbench/api/common/extHostSCM.ts',
			'src/do/workbench/api/common/extHostSearch.ts',
			'src/do/workbench/api/common/extHostStatusBar.ts',
			'src/do/workbench/api/common/extHostStoragePaths.ts',
			'src/do/workbench/api/common/extHostTelemetry.ts',
			'src/do/workbench/api/common/extHostTesting.ts',
			'src/do/workbench/api/common/extHostTextEditor.ts',
			'src/do/workbench/api/common/extHostTimeline.ts',
			'src/do/workbench/api/common/extHostTreeViews.ts',
			'src/do/workbench/api/common/extHostTypeConverters.ts',
			'src/do/workbench/api/common/extHostTypes.ts',
			'src/do/workbench/api/common/extHostTypes/es5ClassCompat.ts',
			'src/do/workbench/api/common/extHostTypes/location.ts',
			'src/do/workbench/api/common/extHostWebview.ts',
			'src/do/workbench/api/common/extHostWebviewMessaging.ts',
			'src/do/workbench/api/common/extHostWebviewPanels.ts',
			'src/do/workbench/api/common/extHostWebviewView.ts',
			'src/do/workbench/api/common/extHostWorkspace.ts',
			'src/do/workbench/api/common/extensionHostMain.ts',
			'src/do/workbench/api/node/extHostAuthentication.ts',
			'src/do/workbench/api/node/extHostCLIServer.ts',
			'src/do/workbench/api/node/extHostConsoleForwarder.ts',
			'src/do/workbench/api/node/extHostDownloadService.ts',
			'src/do/workbench/api/node/extHostExtensionService.ts',
			'src/do/workbench/api/node/extHostMcpNode.ts',
			'src/do/workbench/api/node/extensionHostProcess.ts',
			'src/do/workbench/api/node/proxyResolver.ts',
			'src/do/workbench/api/test/common/testRPCProtocol.ts',
			'src/do/workbench/api/worker/extHostConsoleForwarder.ts',
			'src/do/workbench/api/worker/extHostExtensionService.ts',
			'src/do/workbench/api/worker/extensionHostWorker.ts',
			'src/do/workbench/contrib/accessibility/browser/accessibilityConfiguration.ts',
			'src/do/workbench/contrib/accessibilitySignals/browser/commands.ts',
			'src/do/workbench/contrib/authentication/browser/actions/manageTrustedMcpServersForAccountAction.ts',
			'src/do/workbench/contrib/bulkEdit/browser/bulkTextEdits.ts',
			'src/do/workbench/contrib/bulkEdit/browser/preview/bulkEditPane.ts',
			'src/do/workbench/contrib/bulkEdit/browser/preview/bulkEditPreview.ts',
			'src/do/workbench/contrib/codeEditor/browser/inspectEditorTokens/inspectEditorTokens.ts',
			'src/do/workbench/contrib/codeEditor/browser/outline/documentSymbolsOutline.ts',
			'src/do/workbench/contrib/codeEditor/electron-browser/selectionClipboard.ts',
			'src/do/workbench/contrib/commands/common/commands.contribution.ts',
			'src/do/workbench/contrib/comments/browser/commentsTreeViewer.ts',
			'src/do/workbench/contrib/comments/browser/commentsView.ts',
			'src/do/workbench/contrib/comments/browser/reactionsAction.ts',
			'src/do/workbench/contrib/customEditor/browser/customEditorInputFactory.ts',
			'src/do/workbench/contrib/customEditor/browser/customEditors.ts',
			'src/do/workbench/contrib/customEditor/common/customEditor.ts',
			'src/do/workbench/contrib/debug/browser/debugActionViewItems.ts',
			'src/do/workbench/contrib/debug/browser/debugAdapterManager.ts',
			'src/do/workbench/contrib/debug/browser/debugCommands.ts',
			'src/do/workbench/contrib/debug/browser/debugConfigurationManager.ts',
			'src/do/workbench/contrib/debug/browser/debugEditorActions.ts',
			'src/do/workbench/contrib/debug/browser/debugEditorContribution.ts',
			'src/do/workbench/contrib/debug/browser/debugHover.ts',
			'src/do/workbench/contrib/debug/browser/debugService.ts',
			'src/do/workbench/contrib/debug/browser/debugSession.ts',
			'src/do/workbench/contrib/debug/browser/rawDebugSession.ts',
			'src/do/workbench/contrib/debug/browser/repl.ts',
			'src/do/workbench/contrib/debug/browser/replViewer.ts',
			'src/do/workbench/contrib/debug/browser/variablesView.ts',
			'src/do/workbench/contrib/debug/browser/watchExpressionsView.ts',
			'src/do/workbench/contrib/debug/common/abstractDebugAdapter.ts',
			'src/do/workbench/contrib/debug/common/debugger.ts',
			'src/do/workbench/contrib/debug/common/replModel.ts',
			'src/do/workbench/contrib/debug/test/common/mockDebug.ts',
			'src/do/workbench/contrib/editSessions/common/workspaceStateSync.ts',
			'src/do/workbench/contrib/editTelemetry/browser/helpers/documentWithAnnotatedEdits.ts',
			'src/do/workbench/contrib/editTelemetry/browser/helpers/utils.ts',
			'src/do/workbench/contrib/editTelemetry/browser/telemetry/arcTelemetrySender.ts',
			'src/do/workbench/contrib/extensions/browser/extensionEditor.ts',
			'src/do/workbench/contrib/extensions/browser/extensionRecommendationNotificationService.ts',
			'src/do/workbench/contrib/extensions/browser/extensions.contribution.ts',
			'src/do/workbench/contrib/extensions/browser/extensionsActions.ts',
			'src/do/workbench/contrib/extensions/browser/extensionsActivationProgress.ts',
			'src/do/workbench/contrib/extensions/browser/extensionsViewer.ts',
			'src/do/workbench/contrib/extensions/browser/extensionsViews.ts',
			'src/do/workbench/contrib/extensions/browser/extensionsWorkbenchService.ts',
			'src/do/workbench/contrib/extensions/common/extensions.ts',
			'src/do/workbench/contrib/extensions/electron-browser/runtimeExtensionsEditor.ts',
			'src/do/workbench/contrib/inlineChat/browser/inlineChatActions.ts',
			'src/do/workbench/contrib/inlineChat/browser/inlineChatController.ts',
			'src/do/workbench/contrib/inlineChat/browser/inlineChatStrategies.ts',
			'src/do/workbench/contrib/markdown/browser/markdownDocumentRenderer.ts',
			'src/do/workbench/contrib/markers/browser/markers.contribution.ts',
			'src/do/workbench/contrib/markers/browser/markersView.ts',
			'src/do/workbench/contrib/mergeEditor/browser/commands/commands.ts',
			'src/do/workbench/contrib/mergeEditor/browser/utils.ts',
			'src/do/workbench/contrib/mergeEditor/browser/view/editorGutter.ts',
			'src/do/workbench/contrib/mergeEditor/browser/view/mergeEditor.ts',
			'src/do/workbench/contrib/notebook/browser/contrib/clipboard/notebookClipboard.ts',
			'src/do/workbench/contrib/notebook/browser/contrib/find/notebookFind.ts',
			'src/do/workbench/contrib/notebook/browser/contrib/layout/layoutActions.ts',
			'src/do/workbench/contrib/notebook/browser/contrib/profile/notebookProfile.ts',
			'src/do/workbench/contrib/notebook/browser/contrib/troubleshoot/layout.ts',
			'src/do/workbench/contrib/notebook/browser/controller/chat/cellChatActions.ts',
			'src/do/workbench/contrib/notebook/browser/controller/coreActions.ts',
			'src/do/workbench/contrib/notebook/browser/controller/editActions.ts',
			'src/do/workbench/contrib/notebook/browser/controller/notebookIndentationActions.ts',
			'src/do/workbench/contrib/notebook/browser/controller/sectionActions.ts',
			'src/do/workbench/contrib/notebook/browser/diff/diffComponents.ts',
			'src/do/workbench/contrib/notebook/browser/diff/inlineDiff/notebookDeletedCellDecorator.ts',
			'src/do/workbench/contrib/notebook/browser/notebookBrowser.ts',
			'src/do/workbench/contrib/notebook/browser/outputEditor/notebookOutputEditor.ts',
			'src/do/workbench/contrib/notebook/browser/services/notebookEditorServiceImpl.ts',
			'src/do/workbench/contrib/notebook/browser/view/notebookCellList.ts',
			'src/do/workbench/contrib/notebook/browser/view/renderers/backLayerWebView.ts',
			'src/do/workbench/contrib/notebook/browser/view/renderers/webviewMessages.ts',
			'src/do/workbench/contrib/notebook/browser/view/renderers/webviewPreloads.ts',
			'src/do/workbench/contrib/notebook/browser/viewModel/markupCellViewModel.ts',
			'src/do/workbench/contrib/notebook/browser/viewParts/notebookEditorStickyScroll.ts',
			'src/do/workbench/contrib/notebook/browser/viewParts/notebookHorizontalTracker.ts',
			'src/do/workbench/contrib/notebook/browser/viewParts/notebookKernelQuickPickStrategy.ts',
			'src/do/workbench/contrib/notebook/common/model/notebookCellTextModel.ts',
			'src/do/workbench/contrib/notebook/common/model/notebookMetadataTextModel.ts',
			'src/do/workbench/contrib/notebook/common/model/notebookTextModel.ts',
			'src/do/workbench/contrib/notebook/common/notebookCommon.ts',
			'src/do/workbench/contrib/notebook/common/notebookEditorModelResolverServiceImpl.ts',
			'src/do/workbench/contrib/notebook/test/browser/testNotebookEditor.ts',
			'src/do/workbench/contrib/performance/electron-browser/startupProfiler.ts',
			'src/do/workbench/contrib/preferences/browser/preferences.contribution.ts',
			'src/do/workbench/contrib/preferences/browser/preferencesRenderers.ts',
			'src/do/workbench/contrib/preferences/browser/settingsEditor2.ts',
			'src/do/workbench/contrib/preferences/browser/settingsTree.ts',
			'src/do/workbench/contrib/preferences/browser/settingsTreeModels.ts',
			'src/do/workbench/contrib/remote/browser/tunnelView.ts',
			'src/do/workbench/contrib/search/browser/AISearch/aiSearchModel.ts',
			'src/do/workbench/contrib/search/browser/AISearch/aiSearchModelBase.ts',
			'src/do/workbench/contrib/search/browser/notebookSearch/notebookSearchModel.ts',
			'src/do/workbench/contrib/search/browser/notebookSearch/notebookSearchModelBase.ts',
			'src/do/workbench/contrib/search/browser/notebookSearch/searchNotebookHelpers.ts',
			'src/do/workbench/contrib/search/browser/replace.ts',
			'src/do/workbench/contrib/search/browser/replaceService.ts',
			'src/do/workbench/contrib/search/browser/searchActionsCopy.ts',
			'src/do/workbench/contrib/search/browser/searchActionsBase.ts',
			'src/do/workbench/contrib/search/browser/searchActionsFind.ts',
			'src/do/workbench/contrib/search/browser/searchActionsNav.ts',
			'src/do/workbench/contrib/search/browser/searchActionsRemoveReplace.ts',
			'src/do/workbench/contrib/search/browser/searchActionsTextQuickAccess.ts',
			'src/do/workbench/contrib/search/browser/searchActionsTopBar.ts',
			'src/do/workbench/contrib/search/browser/searchMessage.ts',
			'src/do/workbench/contrib/search/browser/searchResultsView.ts',
			'src/do/workbench/contrib/search/browser/searchTreeModel/fileMatch.ts',
			'src/do/workbench/contrib/search/browser/searchTreeModel/folderMatch.ts',
			'src/do/workbench/contrib/search/browser/searchTreeModel/searchModel.ts',
			'src/do/workbench/contrib/search/browser/searchTreeModel/searchResult.ts',
			'src/do/workbench/contrib/search/browser/searchTreeModel/searchTreeCommon.ts',
			'src/do/workbench/contrib/search/browser/searchTreeModel/textSearchHeading.ts',
			'src/do/workbench/contrib/search/browser/searchView.ts',
			'src/do/workbench/contrib/search/test/browser/mockSearchTree.ts',
			'src/do/workbench/contrib/searchEditor/browser/searchEditor.contribution.ts',
			'src/do/workbench/contrib/searchEditor/browser/searchEditorActions.ts',
			'src/do/workbench/contrib/searchEditor/browser/searchEditorInput.ts',
			'src/do/workbench/contrib/snippets/browser/commands/configureSnippets.ts',
			'src/do/workbench/contrib/snippets/browser/commands/insertSnippet.ts',
			'src/do/workbench/contrib/snippets/browser/snippetsService.ts',
			'src/do/workbench/contrib/testing/common/storedValue.ts',
			'src/do/workbench/contrib/testing/test/browser/testObjectTree.ts',
			'src/do/workbench/contrib/typeHierarchy/browser/typeHierarchy.contribution.ts',
			'src/do/workbench/contrib/typeHierarchy/common/typeHierarchy.ts',
			'src/do/workbench/contrib/webview/browser/overlayWebview.ts',
			'src/do/workbench/contrib/webview/browser/webview.ts',
			'src/do/workbench/contrib/webview/browser/webviewElement.ts',
			'src/do/workbench/contrib/webviewPanel/browser/webviewEditor.ts',
			'src/do/workbench/contrib/webviewPanel/browser/webviewEditorInputSerializer.ts',
			'src/do/workbench/contrib/webviewPanel/browser/webviewWorkbenchService.ts',
			'src/do/workbench/contrib/welcomeGettingStarted/browser/gettingStartedService.ts',
			'src/do/workbench/contrib/welcomeWalkthrough/browser/walkThroughPart.ts',
			'src/do/workbench/services/authentication/common/authentication.ts',
			'src/do/workbench/services/authentication/test/browser/authenticationQueryServiceMocks.ts',
			'src/do/workbench/services/commands/common/commandService.ts',
			'src/do/workbench/services/configurationResolver/common/configurationResolver.ts',
			'src/do/workbench/services/configurationResolver/common/configurationResolverExpression.ts',
			'src/do/workbench/services/extensions/common/extensionHostManager.ts',
			'src/do/workbench/services/extensions/common/extensionsRegistry.ts',
			'src/do/workbench/services/extensions/common/lazyPromise.ts',
			'src/do/workbench/services/extensions/common/polyfillNestedWorker.protocol.ts',
			'src/do/workbench/services/extensions/common/rpcProtocol.ts',
			'src/do/workbench/services/extensions/worker/polyfillNestedWorker.ts',
			'src/do/workbench/services/keybinding/browser/keybindingService.ts',
			'src/do/workbench/services/keybinding/browser/keyboardLayoutService.ts',
			'src/do/workbench/services/keybinding/common/keybindingEditing.ts',
			'src/do/workbench/services/keybinding/common/keymapInfo.ts',
			'src/do/workbench/services/language/common/languageService.ts',
			'src/do/workbench/services/outline/browser/outline.ts',
			'src/do/workbench/services/outline/browser/outlineService.ts',
			'src/do/workbench/services/preferences/common/preferences.ts',
			'src/do/workbench/services/preferences/common/preferencesModels.ts',
			'src/do/workbench/services/preferences/common/preferencesValidation.ts',
			'src/do/workbench/services/remote/common/tunnelModel.ts',
			'src/do/workbench/services/search/common/replace.ts',
			'src/do/workbench/services/search/common/search.ts',
			'src/do/workbench/services/search/common/searchExtConversionTypes.ts',
			'src/do/workbench/services/search/common/searchExtTypes.ts',
			'src/do/workbench/services/search/node/fileSearch.ts',
			'src/do/workbench/services/search/node/rawSearchService.ts',
			'src/do/workbench/services/search/node/ripgrepTextSearchEngine.ts',
			'src/do/workbench/services/textMate/common/TMGrammarFactory.ts',
			'src/do/workbench/services/themes/browser/fileIconThemeData.ts',
			'src/do/workbench/services/themes/browser/productIconThemeData.ts',
			'src/do/workbench/services/themes/common/colorThemeData.ts',
			'src/do/workbench/services/themes/common/plistParser.ts',
			'src/do/workbench/services/themes/common/themeExtensionPoints.ts',
			'src/do/workbench/services/themes/common/workbenchThemeService.ts',
			'src/do/workbench/test/browser/workbenchTestServices.ts',
			'src/do/workbench/test/common/workbenchTestServices.ts',
			'src/do/workbench/test/electron-browser/workbenchTestServices.ts',
			// Server
			'src/do/server/node/remoteAgentEnvironmentImpl.ts',
			'src/do/server/node/remoteExtensionHostAgentServer.ts',
			'src/do/server/node/remoteExtensionsScanner.ts',
			// Tests
			'**/*.test.ts',
			'**/*.integrationTest.ts'
		],
		languageOptions: {
			parser: tseslint.parser,
		},
		plugins: {
			'@typescript-eslint': tseslint.plugin,
		},
		rules: {
			'@typescript-eslint/no-explicit-any': [
				'warn',
				{
					'fixToUnknown': false
				}
			]
		}
	},
	// Tests
	{
		files: [
			'**/*.test.ts'
		],
		languageOptions: {
			parser: tseslint.parser,
		},
		plugins: {
			'local': pluginLocal,
		},
		rules: {
			'local/code-no-dangerous-type-assertions': 'off',
			'local/code-must-use-super-dispose': 'off',
			'local/code-no-test-only': 'error',
			'local/code-no-test-async-suite': 'warn',
			'local/code-no-nested-test': 'error',
			'local/code-must-use-result': [
				'warn',
				[
					{
						'message': 'Expression must be awaited',
						'functions': [
							'assertSnapshot',
							'assertHeap'
						]
					}
				]
			]
		}
	},
	// docode tests specific rules
	{
		files: [
			'src/do/**/*.test.ts'
		],
		languageOptions: {
			parser: tseslint.parser,
		},
		plugins: {
			'local': pluginLocal,
		},
		rules: {
			'local/code-ensure-no-disposables-leak-in-test': [
				'warn',
				{
					// Files should (only) be removed from the list they adopt the leak detector
					'exclude': [
						'src/do/workbench/services/userActivity/test/browser/domActivityTracker.test.ts',
					]
				}
			],
			'local/code-run-with-faked-timers-whole-test': 'warn',
			'local/code-no-timeout-polling-loop': [
				'warn',
				{
					// Files should (only) be removed from the list once they no longer poll
					'exclude': [
						'src/do/sessions/contrib/layout/test/browser/chatLayoutOwnership.test.ts',
						'src/do/sessions/contrib/layout/test/browser/desktopLayoutController.test.ts',
					]
				}
			]
		}
	},
	// git extension - ban non-type imports from git.d.ts (use git.constants for runtime values)
	{
		files: [
			'extensions/git/src/**/*.ts',
		],
		ignores: [
			'extensions/git/src/api/git.constants.ts',
		],
		languageOptions: {
			parser: tseslint.parser,
		},
		plugins: {
			'@typescript-eslint': tseslint.plugin,
		},
		rules: {
			'no-restricted-imports': 'off',
			'@typescript-eslint/no-restricted-imports': [
				'warn',
				{
					'patterns': [
						{
							'group': ['*/api/git'],
							'allowTypeImports': true,
							'message': 'Use \'import type\' for types from git.d.ts and import runtime const enum values from git.constants instead'
						},
					]
				}
			]
		}
	},
	// docode API
	{
		files: [
			'**/docode.d.ts',
			'**/docode.proposed.*.d.ts'
		],
		languageOptions: {
			parser: tseslint.parser,
		},
		plugins: {
			'local': pluginLocal,
		},
		rules: {
			'no-restricted-syntax': [
				'warn',
				{
					'selector': `TSArrayType > TSUnionType`,
					'message': 'Use Array<...> for arrays of union types.'
				},
			],
			'local/docode-dts-create-func': 'warn',
			'local/docode-dts-literal-or-types': 'warn',
			'local/docode-dts-string-type-literals': 'warn',
			'local/docode-dts-interface-naming': 'warn',
			'local/docode-dts-cancellation': 'warn',
			'local/docode-dts-use-export': 'warn',
			'local/docode-dts-use-thenable': 'warn',
			'local/docode-dts-docode-in-comments': 'warn',
			'local/docode-dts-provider-naming': [
				'warn',
				{
					'allowed': [
						'FileSystemProvider',
						'TreeDataProvider',
						'TestProvider',
						'CustomEditorProvider',
						'CustomReadonlyEditorProvider',
						'TerminalLinkProvider',
						'AuthenticationProvider',
						'NotebookContentProvider'
					]
				}
			],
			'local/docode-dts-event-naming': [
				'warn',
				{
					'allowed': [
						'onCancellationRequested',
						'event'
					],
					'verbs': [
						'accept',
						'archive',
						'change',
						'close',
						'collapse',
						'create',
						'delete',
						'lock',
						'resume',
						'shutdown',
						'suspend',
						'unlock',
						'discover',
						'dispose',
						'drop',
						'edit',
						'end',
						'execute',
						'expand',
						'grant',
						'hide',
						'invalidate',
						'open',
						'override',
						'perform',
						'receive',
						'register',
						'remove',
						'rename',
						'reveal',
						'save',
						'send',
						'start',
						'terminate',
						'trigger',
						'unregister',
						'write',
						'commit'
					]
				}
			]
		}
	},
	// docode.d.ts
	{
		files: [
			'**/docode.d.ts'
		],
		languageOptions: {
			parser: tseslint.parser,
		},
		rules: {
			'jsdoc/tag-lines': 'off',
			'jsdoc/valid-types': 'off',
			'jsdoc/no-multi-asterisks': [
				'warn',
				{
					'allowWhitespace': true
				}
			],
			'jsdoc/require-jsdoc': [
				'warn',
				{
					'enableFixer': false,
					'contexts': [
						'TSInterfaceDeclaration',
						'TSPropertySignature',
						'TSMethodSignature',
						'TSDeclareFunction',
						'ClassDeclaration',
						'MethodDefinition',
						'PropertyDeclaration',
						'TSEnumDeclaration',
						'TSEnumMember',
						'ExportNamedDeclaration'
					]
				}
			],
			'jsdoc/check-param-names': [
				'warn',
				{
					'enableFixer': false,
					'checkDestructured': false
				}
			],
			'jsdoc/require-returns': 'warn'
		}
	},
	// common/browser layer
	{
		files: [
			'src/**/{common,browser}/**/*.ts'
		],
		languageOptions: {
			parser: tseslint.parser,
		},
		plugins: {
			'local': pluginLocal,
		},
		rules: {
			'local/code-amd-node-module': 'warn'
		}
	},
	// node/electron layer
	{
		files: [
			'src/*.ts',
			'src/**/{node,electron-main,electron-utility}/**/*.ts'
		],
		languageOptions: {
			parser: tseslint.parser,
		},
		plugins: {
			'local': pluginLocal,
		},
		rules: {
			'no-restricted-globals': [
				'warn',
				'name',
				'length',
				'event',
				'closed',
				'external',
				'status',
				'origin',
				'orientation',
				'context',
				// Below are globals that are unsupported in ESM
				'__dirname',
				'__filename',
				'require'
			]
		}
	},
	// electron-main layer: prevent static imports of heavy node_modules
	// that would be synchronously loaded on startup
	{
		files: [
			'src/do/code/electron-main/**/*.ts',
			'src/do/code/node/**/*.ts',
			'src/do/platform/*/electron-main/**/*.ts',
			'src/do/platform/*/node/**/*.ts',
		],
		languageOptions: {
			parser: tseslint.parser,
		},
		plugins: {
			'local': pluginLocal,
		},
		rules: {
			'local/code-no-static-node-module-import': [
				'error',
				// Files that run in separate processes, not on the electron-main startup path
				'src/do/platform/agentHost/node/**/*.ts',
				'src/do/platform/files/node/watcher/**/*.ts',
				'src/do/platform/terminal/node/**/*.ts',
				// Files that use small, safe modules
				'src/do/platform/environment/node/argv.ts',
			]
		}
	},
	// browser/electron-browser layer
	{
		files: [
			'src/**/{browser,electron-browser}/**/*.ts'
		],
		languageOptions: {
			parser: tseslint.parser,
		},
		plugins: {
			'local': pluginLocal,
		},
		rules: {
			'local/code-no-global-document-listener': 'warn',
			'no-restricted-syntax': [
				'warn',
				{
					'selector': `NewExpression[callee.object.name='Intl']`,
					'message': 'Use safeIntl helper instead for safe and lazy use of potentially expensive Intl methods.'
				},
				{
					'selector': `BinaryExpression[operator='instanceof'][right.name='MouseEvent']`,
					'message': 'Use DOM.isMouseEvent() to support multi-window scenarios.'
				},
				{
					'selector': `BinaryExpression[operator='instanceof'][right.name=/^HTML\\w+/]`,
					'message': 'Use DOM.isHTMLElement() and related methods to support multi-window scenarios.'
				},
				{
					'selector': `BinaryExpression[operator='instanceof'][right.name=/^SVG\\w+/]`,
					'message': 'Use DOM.isSVGElement() and related methods to support multi-window scenarios.'
				},
				{
					'selector': `BinaryExpression[operator='instanceof'][right.name='KeyboardEvent']`,
					'message': 'Use DOM.isKeyboardEvent() to support multi-window scenarios.'
				},
				{
					'selector': `BinaryExpression[operator='instanceof'][right.name='PointerEvent']`,
					'message': 'Use DOM.isPointerEvent() to support multi-window scenarios.'
				},
				{
					'selector': `BinaryExpression[operator='instanceof'][right.name='DragEvent']`,
					'message': 'Use DOM.isDragEvent() to support multi-window scenarios.'
				},
				{
					'selector': `MemberExpression[object.name='document'][property.name='activeElement']`,
					'message': 'Use <targetWindow>.document.activeElement to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'selector': `MemberExpression[object.name='document'][property.name='contains']`,
					'message': 'Use <targetWindow>.document.contains to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'selector': `MemberExpression[object.name='document'][property.name='styleSheets']`,
					'message': 'Use <targetWindow>.document.styleSheets to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'selector': `MemberExpression[object.name='document'][property.name='fullscreenElement']`,
					'message': 'Use <targetWindow>.document.fullscreenElement to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'selector': `MemberExpression[object.name='document'][property.name='body']`,
					'message': 'Use <targetWindow>.document.body to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'selector': `MemberExpression[object.name='document'][property.name='addEventListener']`,
					'message': 'Use <targetWindow>.document.addEventListener to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'selector': `MemberExpression[object.name='document'][property.name='removeEventListener']`,
					'message': 'Use <targetWindow>.document.removeEventListener to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'selector': `MemberExpression[object.name='document'][property.name='hasFocus']`,
					'message': 'Use <targetWindow>.document.hasFocus to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'selector': `MemberExpression[object.name='document'][property.name='head']`,
					'message': 'Use <targetWindow>.document.head to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'selector': `MemberExpression[object.name='document'][property.name='exitFullscreen']`,
					'message': 'Use <targetWindow>.document.exitFullscreen to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'selector': `MemberExpression[object.name='document'][property.name='getElementById']`,
					'message': 'Use <targetWindow>.document.getElementById to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'selector': `MemberExpression[object.name='document'][property.name='getElementsByClassName']`,
					'message': 'Use <targetWindow>.document.getElementsByClassName to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'selector': `MemberExpression[object.name='document'][property.name='getElementsByName']`,
					'message': 'Use <targetWindow>.document.getElementsByName to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'selector': `MemberExpression[object.name='document'][property.name='getElementsByTagName']`,
					'message': 'Use <targetWindow>.document.getElementsByTagName to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'selector': `MemberExpression[object.name='document'][property.name='getElementsByTagNameNS']`,
					'message': 'Use <targetWindow>.document.getElementsByTagNameNS to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'selector': `MemberExpression[object.name='document'][property.name='getSelection']`,
					'message': 'Use <targetWindow>.document.getSelection to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'selector': `MemberExpression[object.name='document'][property.name='open']`,
					'message': 'Use <targetWindow>.document.open to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'selector': `MemberExpression[object.name='document'][property.name='close']`,
					'message': 'Use <targetWindow>.document.close to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'selector': `MemberExpression[object.name='document'][property.name='documentElement']`,
					'message': 'Use <targetWindow>.document.documentElement to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'selector': `MemberExpression[object.name='document'][property.name='visibilityState']`,
					'message': 'Use <targetWindow>.document.visibilityState to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'selector': `MemberExpression[object.name='document'][property.name='querySelector']`,
					'message': 'Use <targetWindow>.document.querySelector to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'selector': `MemberExpression[object.name='document'][property.name='querySelectorAll']`,
					'message': 'Use <targetWindow>.document.querySelectorAll to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'selector': `MemberExpression[object.name='document'][property.name='elementFromPoint']`,
					'message': 'Use <targetWindow>.document.elementFromPoint to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'selector': `MemberExpression[object.name='document'][property.name='elementsFromPoint']`,
					'message': 'Use <targetWindow>.document.elementsFromPoint to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'selector': `MemberExpression[object.name='document'][property.name='onkeydown']`,
					'message': 'Use <targetWindow>.document.onkeydown to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'selector': `MemberExpression[object.name='document'][property.name='onkeyup']`,
					'message': 'Use <targetWindow>.document.onkeyup to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'selector': `MemberExpression[object.name='document'][property.name='onmousedown']`,
					'message': 'Use <targetWindow>.document.onmousedown to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'selector': `MemberExpression[object.name='document'][property.name='onmouseup']`,
					'message': 'Use <targetWindow>.document.onmouseup to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'selector': `MemberExpression[object.name='document'][property.name='execCommand']`,
					'message': 'Use <targetWindow>.document.execCommand to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'selector': 'CallExpression[callee.property.name=\'querySelector\']',
					'message': 'querySelector should not be used as relying on selectors is very fragile. Use dom.ts h() to build your elements and access them directly.'
				},
				{
					'selector': 'CallExpression[callee.property.name=\'querySelectorAll\']',
					'message': 'querySelectorAll should not be used as relying on selectors is very fragile. Use dom.ts h() to build your elements and access them directly.'
				},
				{
					'selector': 'CallExpression[callee.property.name=\'getElementById\']',
					'message': 'getElementById should not be used as relying on selectors is very fragile. Use dom.ts h() to build your elements and access them directly.'
				},
				{
					'selector': 'CallExpression[callee.property.name=\'getElementsByClassName\']',
					'message': 'getElementsByClassName should not be used as relying on selectors is very fragile. Use dom.ts h() to build your elements and access them directly.'
				},
				{
					'selector': 'CallExpression[callee.property.name=\'getElementsByTagName\']',
					'message': 'getElementsByTagName should not be used as relying on selectors is very fragile. Use dom.ts h() to build your elements and access them directly.'
				},
				{
					'selector': 'CallExpression[callee.property.name=\'getElementsByName\']',
					'message': 'getElementsByName should not be used as relying on selectors is very fragile. Use dom.ts h() to build your elements and access them directly.'
				},
				{
					'selector': 'CallExpression[callee.property.name=\'getElementsByTagNameNS\']',
					'message': 'getElementsByTagNameNS should not be used as relying on selectors is very fragile. Use dom.ts h() to build your elements and access them directly.'
				}
			],
			'no-restricted-globals': [
				'warn',
				'name',
				'length',
				'event',
				'closed',
				'external',
				'status',
				'origin',
				'orientation',
				'context',
				{
					'name': 'setInterval',
					'message': 'Use <targetWindow>.setInterval to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'name': 'clearInterval',
					'message': 'Use <targetWindow>.clearInterval to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'name': 'requestAnimationFrame',
					'message': 'Use <targetWindow>.requestAnimationFrame to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'name': 'cancelAnimationFrame',
					'message': 'Use <targetWindow>.cancelAnimationFrame to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'name': 'requestIdleCallback',
					'message': 'Use <targetWindow>.requestIdleCallback to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'name': 'cancelIdleCallback',
					'message': 'Use <targetWindow>.cancelIdleCallback to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'name': 'window',
					'message': 'Use <targetWindow> to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'name': 'addEventListener',
					'message': 'Use <targetWindow>.addEventListener to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'name': 'removeEventListener',
					'message': 'Use <targetWindow>.removeEventListener to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'name': 'getComputedStyle',
					'message': 'Use <targetWindow>.getComputedStyle to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'name': 'focus',
					'message': 'Use <targetWindow>.focus to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'name': 'blur',
					'message': 'Use <targetWindow>.blur to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'name': 'close',
					'message': 'Use <targetWindow>.close to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'name': 'dispatchEvent',
					'message': 'Use <targetWindow>.dispatchEvent to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'name': 'getSelection',
					'message': 'Use <targetWindow>.getSelection to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'name': 'matchMedia',
					'message': 'Use <targetWindow>.matchMedia to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'name': 'open',
					'message': 'Use <targetWindow>.open to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'name': 'parent',
					'message': 'Use <targetWindow>.parent to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'name': 'postMessage',
					'message': 'Use <targetWindow>.postMessage to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'name': 'devicePixelRatio',
					'message': 'Use <targetWindow>.devicePixelRatio to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'name': 'frames',
					'message': 'Use <targetWindow>.frames to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'name': 'frameElement',
					'message': 'Use <targetWindow>.frameElement to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'name': 'innerHeight',
					'message': 'Use <targetWindow>.innerHeight to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'name': 'innerWidth',
					'message': 'Use <targetWindow>.innerWidth to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'name': 'outerHeight',
					'message': 'Use <targetWindow>.outerHeight to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'name': 'outerWidth',
					'message': 'Use <targetWindow>.outerWidth to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'name': 'opener',
					'message': 'Use <targetWindow>.opener to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'name': 'origin',
					'message': 'Use <targetWindow>.origin to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'name': 'screen',
					'message': 'Use <targetWindow>.screen to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'name': 'screenLeft',
					'message': 'Use <targetWindow>.screenLeft to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'name': 'screenTop',
					'message': 'Use <targetWindow>.screenTop to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'name': 'screenX',
					'message': 'Use <targetWindow>.screenX to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'name': 'screenY',
					'message': 'Use <targetWindow>.screenY to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'name': 'scrollX',
					'message': 'Use <targetWindow>.scrollX to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'name': 'scrollY',
					'message': 'Use <targetWindow>.scrollY to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'name': 'top',
					'message': 'Use <targetWindow>.top to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				},
				{
					'name': 'visualViewport',
					'message': 'Use <targetWindow>.visualViewport to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.'
				}
			]
		}
	},
	// electron-utility layer
	{
		files: [
			'src/**/electron-utility/**/*.ts'
		],
		languageOptions: {
			parser: tseslint.parser,
		},
		rules: {
			'no-restricted-imports': [
				'warn',
				{
					'paths': [
						{
							'name': 'electron',
							'allowImportNames': [
								'net',
								'system-preferences',
							],
							'message': 'Only net and system-preferences are allowed to be imported from electron'
						}
					]
				}
			]
		}
	},
	{
		files: [
			'src/**/*.ts'
		],
		languageOptions: {
			parser: tseslint.parser,
		},
		plugins: {
			'local': pluginLocal,
		},
		rules: {
			'no-restricted-imports': [
				'warn',
				{
					'patterns': [
						{
							'group': ['dompurify*'],
							'message': 'Use domSanitize instead of dompurify directly'
						},
					]
				}
			],
			'local/code-import-patterns': [
				'warn',
				{
					// imports that are allowed in all files of layers:
					// - browser
					// - electron-browser
					'when': 'hasBrowser',
					'allow': []
				},
				{
					// imports that are allowed in all files of layers:
					// - node
					// - electron-utility
					// - electron-main
					'when': 'hasNode',
					'allow': [
						'@github/copilot-sdk',
						'zod',
						'@microsoft/dev-tunnels-contracts',
						'@microsoft/dev-tunnels-management',
						'@parcel/watcher',
						'@docode/sqlite3',
						'@docode/languagedetection',
						'@docode/ripgrep-universal',
						'@docode/iconv-lite-umd',
						'@vscode/native-watchdog',
						'@vscode/policy-watcher',
						'@docode/proxy-agent',
						'@vscode/spdlog',
						'@vscode/windows-process-tree',
						'assert',
						'child_process',
						'console',
						'cookie',
						'crypto',
						'detect-libc',
						'dns',
						'events',
						'fs',
						'fs/promises',
						'http',
						'https',
						'inspector',
						'minimist',
						'node:module',
						'node:url',
						'node:v8',
						'native-keymap',
						'net',
						'node-pty',
						'os',
						// 'path', NOT allowed: use src/do/base/common/path.ts instead
						'perf_hooks',
						'readline',
						'ssh2',
						'stream',
						'string_decoder',
						'tar',
						'tas-client',
						'tls',
						'undici',
						'undici-types',
						'url',
						'module',
						'util',
						'@docode/regexpp',
						'vscode-textmate',
						'worker_threads',
						'ws',
						'@xterm/addon-clipboard',
						'@xterm/addon-image',
						'@xterm/addon-ligatures',
						'@xterm/addon-search',
						'@xterm/addon-serialize',
						'@xterm/addon-unicode11',
						'@xterm/addon-webgl',
						'@xterm/headless',
						'@xterm/xterm',
						'yauzl',
						'yazl',
						'zlib',
						'chrome-remote-interface'
					]
				},
				{
					// imports that are allowed in all files of layers:
					// - electron-utility
					// - electron-main
					'when': 'hasElectron',
					'allow': [
						'electron'
					]
				},
				{
					// imports that are allowed in all /test/ files
					'when': 'test',
					'allow': [
						'assert',
						'sinon',
						'sinon-test'
					]
				},
				// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
				// !!! Do not relax these rules !!!
				// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
				//
				// A path ending in /~ has a special meaning. It indicates a template position
				// which will be substituted with one or more layers.
				//
				// When /~ is used in the target, the rule will be expanded to 14 distinct rules.
				// e.g. 'src/do/base/~' will be expanded to:
				//  - src/do/base/common
				//  - src/do/base/worker
				//  - src/do/base/browser
				//  - src/do/base/electron-browser
				//  - src/do/base/node
				//  - src/do/base/electron-main
				//  - src/do/base/test/common
				//  - src/do/base/test/worker
				//  - src/do/base/test/browser
				//  - src/do/base/test/electron-browser
				//  - src/do/base/test/node
				//  - src/do/base/test/electron-main
				//
				// When /~ is used in the restrictions, it will be replaced with the correct
				// layers that can be used e.g. 'src/do/base/electron-browser' will be able
				// to import '{common,browser,electron-sanbox}', etc.
				//
				// It is possible to use /~ in the restrictions property even without using it in
				// the target property by adding a layer property.
				{
					'target': 'src/do/base/~',
					'restrictions': [
						'do/base/~'
					]
				},
				{
					'target': 'src/do/base/parts/*/~',
					'restrictions': [
						'do/base/~',
						'do/base/parts/*/~'
					]
				},
				{
					'target': 'src/do/platform/agentHost/node/diffWorkerMain.ts',
					'layer': 'node',
					'restrictions': [
						'do/base/~',
						'do/base/parts/*/~',
						'do/platform/*/~',
						'do/editor/common/diff/**', // diffing logic used by the agent host
					]
				},
				{
					'target': 'src/do/platform/agentHost/~',
					'restrictions': [
						'do/base/~',
						'do/base/parts/*/~',
						'do/platform/*/~',
						'tas-client', // node module allowed even in /common/
						'@microsoft/1ds-core-js', // node module allowed even in /common/
						'@microsoft/1ds-post-js', // node module allowed even in /common/
						'@xterm/headless', // node module allowed even in /common/
						'@vscode/fs-copyfile', // used by agentHost for file copying after worktree creation
						'@docode/tree-sitter-wasm', // used by agentHost for command auto-approval
						'@vscode/copilot-api', // used by agentHost for Copilot API requests
						'@anthropic-ai/sdk', // used by agentHost for Anthropic API requests
						'@anthropic-ai/claude-agent-sdk', // used by agentHost for Claude Agent SDK session enumeration / queries
						'@modelcontextprotocol/sdk/**/*', // used by agentHost for Claude client-tool MCP result types (Phase 10)
						'@github/copilot-sdk',
						'zod', // used by agentHost for Claude client-tool MCP input schemas
						{ 'when': 'hasNode', 'pattern': 'libsodium-wrappers' },
						{ 'when': 'hasNode', 'pattern': '@hpke/core' },
					]
				},
				{
					'target': 'src/do/platform/*/~',
					'restrictions': [
						'do/base/~',
						'do/base/parts/*/~',
						'do/platform/*/~',
						'tas-client', // node module allowed even in /common/
						'@microsoft/1ds-core-js', // node module allowed even in /common/
						'@microsoft/1ds-post-js', // node module allowed even in /common/
						'@xterm/headless', // node module allowed even in /common/
						'@docode/tree-sitter-wasm' // used by agentHost for command auto-approval
					]
				},
				{
					'target': 'src/do/editor/~',
					'restrictions': [
						'do/base/~',
						'do/base/parts/*/~',
						'do/platform/*/~',
						'do/editor/~',
						'@docode/tree-sitter-wasm', // node module allowed even in /common/
						'@vscode/diff' // type import (loaded at runtime via resolveAmdNodeModulePath)
					]
				},
				{
					'target': 'src/do/editor/contrib/*/~',
					'restrictions': [
						'do/base/~',
						'do/base/parts/*/~',
						'do/platform/*/~',
						'do/editor/~',
						'do/editor/contrib/*/~'
					]
				},
				{
					'target': 'src/do/editor/standalone/~',
					'restrictions': [
						'do/base/~',
						'do/base/parts/*/~',
						'do/platform/*/~',
						'do/editor/~',
						'do/editor/contrib/*/~',
						'do/editor/standalone/~',
						'@docode/tree-sitter-wasm' // type import
					]
				},
				{
					'target': 'src/do/editor/editor.all.ts',
					'layer': 'browser',
					'restrictions': [
						'do/base/~',
						'do/base/parts/*/~',
						'do/platform/*/~',
						'do/editor/~',
						'do/editor/contrib/*/~'
					]
				},
				{
					'target': 'src/do/editor/editor.worker.start.ts',
					'layer': 'worker',
					'restrictions': [
						'do/base/~',
						'do/base/parts/*/~',
						'do/platform/*/~',
						'do/editor/~'
					]
				},
				{
					'target': 'src/do/editor/{editor.api.ts,editor.main.ts}',
					'layer': 'browser',
					'restrictions': [
						'do/base/~',
						'do/base/parts/*/~',
						'do/editor/~',
						'do/editor/contrib/*/~',
						'do/editor/standalone/~',
						'do/editor/*'
					]
				},
				{
					'target': 'src/do/workbench/~',
					'restrictions': [
						'do/base/~',
						'do/base/parts/*/~',
						'do/platform/*/~',
						'do/editor/~',
						'do/editor/contrib/*/~',
						'do/workbench/~',
						'do/workbench/services/*/~',
						'assert',
						{
							'when': 'test',
							'pattern': 'do/workbench/contrib/*/~'
						} // TODO@layers
					]
				},
				{
					'target': 'src/do/workbench/api/~',
					'restrictions': [
						'docode',
						'do/base/~',
						'do/base/parts/*/~',
						'do/platform/*/~',
						'do/editor/~',
						'do/editor/contrib/*/~',
						'do/workbench/api/~',
						'do/workbench/~',
						'do/workbench/services/*/~',
						'do/workbench/contrib/*/~',
						'do/workbench/contrib/terminalContrib/*/~'
					]
				},
				{
					'target': 'src/do/workbench/services/*/~',
					'restrictions': [
						'do/base/~',
						'do/base/parts/*/~',
						'do/platform/*/~',
						'do/editor/~',
						'do/editor/contrib/*/~',
						'do/workbench/~',
						'do/workbench/services/*/~',
						{
							'when': 'test',
							'pattern': 'do/workbench/contrib/*/~'
						}, // TODO@layers
						'tas-client', // node module allowed even in /common/
						'vscode-textmate', // node module allowed even in /common/
						'@docode/languagedetection', // node module allowed even in /common/
						'@docode/tree-sitter-wasm', // type import
						{
							'when': 'hasBrowser',
							'pattern': '@xterm/xterm'
						} // node module allowed even in /browser/
					]
				},
				{
					'target': 'src/do/workbench/contrib/*/~',
					'restrictions': [
						'do/base/~',
						'do/base/parts/*/~',
						'do/platform/*/~',
						'do/editor/~',
						'do/editor/contrib/*/~',
						'do/workbench/~',
						'do/workbench/services/*/~',
						'do/workbench/contrib/*/~',
						'do/sessions/~',
						'do/workbench/contrib/terminal/terminalContribChatExports*',
						'do/workbench/contrib/terminal/terminalContribExports*',
						'docode-notebook-renderer', // Type only import
						'@docode/tree-sitter-wasm', // type import
						{
							'when': 'hasBrowser',
							'pattern': '@xterm/xterm'
						}, // node module allowed even in /browser/
						{
							'when': 'hasBrowser',
							'pattern': '@xterm/addon-*'
						}, // node module allowed even in /browser/
						{
							'when': 'hasBrowser',
							'pattern': 'vscode-textmate'
						} // node module allowed even in /browser/
					]
				},
				{
					'target': 'src/do/workbench/contrib/terminalContrib/*/~',
					'restrictions': [
						'do/base/~',
						'do/base/parts/*/~',
						'do/platform/*/~',
						'do/editor/~',
						'do/editor/contrib/*/~',
						'do/workbench/~',
						'do/workbench/services/*/~',
						'do/workbench/contrib/*/~',
						// Only allow terminalContrib to import from itself, this works because
						// terminalContrib is one extra folder deep
						'do/workbench/contrib/terminalContrib/*/~',
						'docode-notebook-renderer', // Type only import
						'@docode/tree-sitter-wasm', // type import
						{
							'when': 'hasBrowser',
							'pattern': '@xterm/xterm'
						}, // node module allowed even in /browser/
						{
							'when': 'hasBrowser',
							'pattern': '@xterm/addon-*'
						}, // node module allowed even in /browser/
						{
							'when': 'hasBrowser',
							'pattern': 'vscode-textmate'
						}, // node module allowed even in /browser/
						'@xterm/headless' // node module allowed even in /common/ and /browser/
					]
				},
				{
					'target': 'src/do/code/~',
					'restrictions': [
						'do/base/~',
						'do/base/parts/*/~',
						'do/platform/*/~',
						'do/editor/~',
						'do/editor/contrib/*/~',
						'do/code/~',
						{
							'when': 'hasBrowser',
							'pattern': 'do/workbench/workbench.web.main.js'
						},
						{
							'when': 'hasBrowser',
							'pattern': 'do/workbench/workbench.web.main.internal.js'
						},
						{
							'when': 'hasBrowser',
							'pattern': 'do/workbench/~'
						},
						{
							'when': 'hasBrowser',
							'pattern': 'do/workbench/services/*/~'
						}
					]
				},
				{
					'target': 'src/do/sessions/electron-browser/sessions.ts',
					'layer': 'electron-browser',
					'restrictions': [
						'do/base/~',
						'do/base/parts/*/~',
						'do/platform/*/~',
						'do/sessions/~',
						'do/sessions/sessions.desktop.main.js'
					]
				},
				{
					'target': 'src/do/server/~',
					'restrictions': [
						'do/base/~',
						'do/base/parts/*/~',
						'do/platform/*/~',
						'do/workbench/~',
						'do/workbench/api/~',
						'do/workbench/services/*/~',
						'do/workbench/contrib/*/~',
						'do/server/~'
					]
				},
				{
					'target': 'src/do/workbench/contrib/terminal/terminal.all.ts',
					'layer': 'browser',
					'restrictions': [
						'do/workbench/contrib/**'
					]
				},
				{
					'target': 'src/do/workbench/contrib/terminal/terminalContribChatExports.ts',
					'layer': 'browser',
					'restrictions': [
						'do/workbench/contrib/terminalContrib/*/~'
					]
				},
				{
					'target': 'src/do/workbench/contrib/terminal/terminalContribExports.ts',
					'layer': 'browser',
					'restrictions': [
						'do/platform/*/~',
						'do/workbench/contrib/terminalContrib/*/~'
					]
				},
				{
					'target': 'src/do/workbench/workbench.common.main.ts',
					'layer': 'browser',
					'restrictions': [
						'do/base/~',
						'do/base/parts/*/~',
						'do/platform/*/~',
						'do/editor/~',
						'do/editor/contrib/*/~',
						'do/editor/editor.all.js',
						'do/workbench/~',
						'do/workbench/api/~',
						'do/workbench/services/*/~',
						'do/workbench/contrib/*/~',
						'do/workbench/contrib/terminal/terminal.all.js',
					]
				},
				{
					'target': 'src/do/workbench/workbench.web.main.ts',
					'layer': 'browser',
					'restrictions': [
						'do/base/~',
						'do/base/parts/*/~',
						'do/platform/*/~',
						'do/editor/~',
						'do/editor/contrib/*/~',
						'do/editor/editor.all.js',
						'do/workbench/~',
						'do/workbench/api/~',
						'do/workbench/services/*/~',
						'do/workbench/contrib/*/~',
						'do/workbench/workbench.common.main.js'
					]
				},
				{
					'target': 'src/do/workbench/workbench.web.main.internal.ts',
					'layer': 'browser',
					'restrictions': [
						'do/base/~',
						'do/base/parts/*/~',
						'do/platform/*/~',
						'do/editor/~',
						'do/editor/contrib/*/~',
						'do/editor/editor.all.js',
						'do/workbench/~',
						'do/workbench/api/~',
						'do/workbench/services/*/~',
						'do/workbench/contrib/*/~',
						'do/workbench/workbench.web.main.js'
					]
				},
				{
					'target': 'src/do/workbench/workbench.desktop.main.ts',
					'layer': 'electron-browser',
					'restrictions': [
						'do/base/*/~',
						'do/base/parts/*/~',
						'do/platform/*/~',
						'do/editor/~',
						'do/editor/contrib/*/~',
						'do/editor/editor.all.js',
						'do/workbench/~',
						'do/workbench/api/~',
						'do/workbench/services/*/~',
						'do/workbench/contrib/*/~',
						'do/workbench/workbench.common.main.js'
					]
				},
				{
					'target': 'src/do/amdX.ts',
					'restrictions': [
						'do/base/common/*'
					]
				},
				{
					'target': 'src/do/{monaco.d.ts,nls.ts}',
					'restrictions': []
				},
				{
					'target': 'src/docode-dts/**',
					'restrictions': []
				},
				{
					'target': 'src/do/nls.ts',
					'restrictions': [
						'do/*'
					]
				},
				{
					'target': 'src/{bootstrap-cli.ts,bootstrap-esm.ts,bootstrap-fork.ts,bootstrap-import.ts,bootstrap-meta.ts,bootstrap-node.ts,bootstrap-server.ts,cli.ts,main.ts,mainImpl.ts,server-cli.ts,server-main.ts}',
					'restrictions': [
						'do/**/common/*',
						'do/**/node/*',
						'do/nls.js',
						'src/*.js',
						'*' // node.js
					]
				},
				{
					'target': 'src/do/sessions/sessions.common.main.ts',
					'layer': 'browser',
					'restrictions': [
						'do/base/~',
						'do/base/parts/*/~',
						'do/platform/*/~',
						'do/editor/~',
						'do/editor/contrib/*/~',
						'do/editor/editor.all.js',
						'do/sessions/~',
						'do/sessions/services/*/~',
						'do/sessions/contrib/*/~',
						'do/sessions/contrib/providers/*/~',
						'do/workbench/~',
						'do/workbench/api/~',
						'do/workbench/services/*/~',
						'do/workbench/contrib/*/~',
						'do/workbench/contrib/terminal/terminal.all.js',
					]
				},
				{
					'target': 'src/do/sessions/sessions.desktop.main.ts',
					'layer': 'electron-browser',
					'restrictions': [
						'do/base/*/~',
						'do/base/parts/*/~',
						'do/platform/*/~',
						'do/editor/~',
						'do/editor/contrib/*/~',
						'do/editor/editor.all.js',
						'do/sessions/~',
						'do/sessions/services/*/~',
						'do/sessions/contrib/*/~',
						'do/sessions/contrib/providers/*/~',
						'do/workbench/~',
						'do/workbench/api/~',
						'do/workbench/services/*/~',
						'do/workbench/contrib/*/~',
						'do/sessions/sessions.common.main.js'
					]
				},
				{
					'target': 'src/do/sessions/sessions.web.main.ts',
					'layer': 'browser',
					'restrictions': [
						'do/base/~',
						'do/base/parts/*/~',
						'do/platform/*/~',
						'do/editor/~',
						'do/editor/contrib/*/~',
						'do/editor/editor.all.js',
						'do/sessions/~',
						'do/sessions/services/*/~',
						'do/sessions/contrib/*/~',
						'do/sessions/contrib/providers/*/~',
						'do/workbench/~',
						'do/workbench/api/~',
						'do/workbench/services/*/~',
						'do/workbench/contrib/*/~',
						'do/sessions/sessions.common.main.js'
					]
				},
				{
					'target': 'src/do/sessions/sessions.web.main.internal.ts',
					'layer': 'browser',
					'restrictions': [
						'do/base/~',
						'do/base/parts/*/~',
						'do/platform/*/~',
						'do/sessions/~',
						'do/sessions/contrib/*/~',
						'do/sessions/contrib/providers/*/~',
						'do/workbench/~',
						'do/workbench/browser/**',
						'do/workbench/services/*/~',
						'do/workbench/contrib/*/~',
						'do/sessions/sessions.web.main.js'
					]
				},
				{
					'target': 'src/do/sessions/test/sessions.web.test.internal.ts',
					'layer': 'browser',
					'restrictions': [
						'do/base/~',
						'do/base/parts/*/~',
						'do/platform/*/~',
						'do/sessions/~',
						'do/sessions/test/**',
						'do/sessions/contrib/*/~',
						'do/sessions/contrib/providers/*/~',
						'do/workbench/~',
						'do/workbench/browser/**',
						'do/workbench/services/*/~',
						'do/workbench/contrib/*/~',
						'do/sessions/sessions.web.main.js'
					]
				},
				{
					'target': 'src/do/sessions/test/{web.test.ts,web.test.factory.ts}',
					'layer': 'browser',
					'restrictions': [
						'do/base/~',
						'do/base/parts/*/~',
						'do/platform/*/~',
						'do/sessions/~',
						'do/sessions/test/**',
						'do/sessions/contrib/*/~',
						'do/workbench/~',
						'do/workbench/browser/**',
						'do/workbench/services/*/~',
						'do/workbench/contrib/*/~'
					]
				},
				{
					'target': 'src/do/sessions/~',
					'restrictions': [
						'do/base/~',
						'do/base/parts/*/~',
						'do/platform/*/~',
						'do/editor/~',
						'do/editor/contrib/*/~',
						'do/workbench/~',
						'do/workbench/browser/**',
						'do/workbench/services/*/~',
						'do/sessions/~',
						'do/sessions/services/*/~'
					]
				},
				{
					'target': 'src/do/sessions/contrib/providers/*/~',
					'restrictions': [
						'do/base/~',
						'do/base/parts/*/~',
						'do/platform/*/~',
						'do/editor/~',
						'do/editor/contrib/*/~',
						'do/workbench/~',
						'do/workbench/browser/**',
						'do/workbench/services/*/~',
						'do/workbench/contrib/*/~',
						'do/sessions/~',
						'do/sessions/contrib/*/~',
						'do/sessions/contrib/providers/*/~',
						'do/sessions/services/*/~',
						'@microsoft/dev-tunnels-connections', // type-only browser bundle conformance check
						'@microsoft/dev-tunnels-management', // type-only browser bundle conformance check
					]
				},
				{
					'target': 'src/do/sessions/contrib/*/~',
					'restrictions': [
						'do/base/~',
						'do/base/parts/*/~',
						'do/platform/*/~',
						'do/editor/~',
						'do/editor/contrib/*/~',
						'do/workbench/~',
						'do/workbench/browser/**',
						'do/workbench/services/*/~',
						'do/workbench/contrib/*/~',
						'do/sessions/~',
						'do/sessions/contrib/*/~',
						'do/sessions/services/*/~',
					]
				},
				{
					'target': 'src/do/sessions/services/*/~',
					'restrictions': [
						'do/base/~',
						'do/base/parts/*/~',
						'do/platform/*/~',
						'do/editor/~',
						'do/editor/contrib/*/~',
						'do/workbench/~',
						'do/workbench/services/*/~',
						'do/sessions/~',
						'do/sessions/services/*/~',
						'do/workbench/contrib/*/~',
						{
							'when': 'test',
							'pattern': 'do/workbench/contrib/*/~'
						}, // TODO@layers
						'tas-client', // node module allowed even in /common/
						'vscode-textmate', // node module allowed even in /common/
						'@docode/languagedetection', // node module allowed even in /common/
						'@docode/tree-sitter-wasm', // type import
						{
							'when': 'hasBrowser',
							'pattern': '@xterm/xterm'
						} // node module allowed even in /browser/
					]
				},
			]
		}
	},
	{
		files: [
			'test/**/*.ts'
		],
		languageOptions: {
			parser: tseslint.parser,
		},
		plugins: {
			'local': pluginLocal,
		},
		rules: {
			'local/code-import-patterns': [
				'warn',
				{
					'target': 'test/smoke/**',
					'restrictions': [
						'test/automation',
						'test/smoke/**',
						'@docode/*',
						'@parcel/*',
						'@playwright/*',
						'*' // node modules
					]
				},
				{
					'target': 'test/sanity/**',
					'restrictions': [
						'test/sanity/**',
						'*' // node modules
					]
				},
				{
					'target': 'test/automation/**',
					'restrictions': [
						'test/automation/**',
						'@docode/*',
						'@parcel/*',
						'playwright-core/**',
						'@playwright/*',
						'*' // node modules
					]
				},
				{
					'target': 'test/integration/**',
					'restrictions': [
						'test/integration/**',
						'@docode/*',
						'@parcel/*',
						'@playwright/*',
						'*' // node modules
					]
				},
				{
					'target': 'test/monaco/**',
					'restrictions': [
						'test/monaco/**',
						'@docode/*',
						'@parcel/*',
						'@playwright/*',
						'*' // node modules
					]
				},
				{
					'target': 'test/scenario/**',
					'restrictions': [
						'test/automation',
						'test/scenario/**',
						'@docode/*',
						'@parcel/*',
						'@playwright/*',
						'*' // node modules
					]
				},
				{
					'target': 'test/componentFixtures/playwright/**',
					'restrictions': [
						'test/componentFixtures/playwright/**',
						'@playwright/*',
						'*' // node modules
					]
				}
			]
		}
	},
	{
		files: ['src/do/**/*.ts'],
		rules: {
			'local/code-no-legacy-notification-parsing': ['error', {
				allowedFiles: [
					'src/do/workbench/api/browser/mainThreadMessageService.ts',
					'src/do/workbench/api/browser/mainThreadProgress.ts',
					'src/do/platform/notification/test/common/notificationMessage.test.ts',
					'src/do/workbench/test/common/notifications.test.ts',
					'src/do/workbench/test/browser/notificationsList.test.ts',
					'src/do/workbench/services/progress/test/browser/progressService.test.ts',
				],
			}],
		},
	},
	{
		// `IAgentSessionsService` and the agent sessions model are provider-internal
		// to Copilot. Only the Copilot chat sessions provider may consume them; the
		// rest of the Agents window (sessions workbench) must stay provider-agnostic.
		// See src/do/sessions/SESSIONS.md.
		files: [
			'src/do/sessions/**/*.ts'
		],
		ignores: [
			'src/do/sessions/contrib/providers/copilotChatSessions/**/*.ts'
		],
		languageOptions: {
			parser: tseslint.parser,
		},
		rules: {
			'no-restricted-imports': [
				'warn',
				{
					'patterns': [
						{
							'group': ['dompurify*'],
							'message': 'Use domSanitize instead of dompurify directly'
						},
						{
							'group': ['**/agentSessions/agentSessionsService', '**/agentSessions/agentSessionsService.js'],
							'message': 'IAgentSessionsService is provider-internal to Copilot. Only contrib/providers/copilotChatSessions may import it; the rest of the Agents window must stay provider-agnostic. See src/do/sessions/SESSIONS.md.'
						}
					]
				}
			]
		}
	},
	{
		files: [
			'src/do/workbench/contrib/notebook/browser/view/renderers/*.ts'
		],
		languageOptions: {
			parser: tseslint.parser,
		},
		plugins: {
			'local': pluginLocal,
		},
		rules: {
			'local/code-no-runtime-import': [
				'error',
				{
					'src/do/workbench/contrib/notebook/browser/view/renderers/webviewPreloads.ts': [
						'**/*'
					]
				}
			],
			'local/code-limited-top-functions': [
				'error',
				{
					'src/do/workbench/contrib/notebook/browser/view/renderers/webviewPreloads.ts': [
						'webviewPreloads',
						'preloadsScriptStr'
					]
				}
			]
		}
	},
	// Terminal
	{
		files: [
			'src/do/workbench/contrib/terminal/**/*.ts',
			'src/do/workbench/contrib/terminalContrib/**/*.ts',
		],
		languageOptions: {
			parser: tseslint.parser,
		},
		rules: {
			'@typescript-eslint/naming-convention': [
				'warn',
				// variableLike
				{ 'selector': 'variable', 'format': ['camelCase', 'UPPER_CASE', 'PascalCase'] },
				{ 'selector': 'variable', 'filter': '^I.+Service$', 'format': ['PascalCase'], 'prefix': ['I'] },
				// memberLike
				{ 'selector': 'memberLike', 'modifiers': ['private'], 'format': ['camelCase'], 'leadingUnderscore': 'require' },
				{ 'selector': 'memberLike', 'modifiers': ['protected'], 'format': ['camelCase'], 'leadingUnderscore': 'require' },
				{ 'selector': 'enumMember', 'format': ['PascalCase'] },
				// memberLike - Allow enum-like objects to use UPPER_CASE
				{ 'selector': 'method', 'modifiers': ['public'], 'format': ['camelCase', 'UPPER_CASE'] },
				// typeLike
				{ 'selector': 'typeLike', 'format': ['PascalCase'] },
				{ 'selector': 'interface', 'format': ['PascalCase'] }
			],
			'comma-dangle': ['warn', 'only-multiline']
		}
	},
	// Ban dynamic require() and import() calls in extensions to ensure tree-shaking works
	{
		files: [
			'extensions/**/*.{ts,tsx}',
		],
		ignores: [
			'extensions/**/*.test.ts',
		],
		rules: {
			'no-restricted-syntax': [
				'warn',
				{
					'selector': `CallExpression[callee.name='require'][arguments.0.type!='Literal']`,
					'message': 'Use static imports instead of dynamic require() calls to enable tree-shaking.'
				},
				{
					'selector': `ImportExpression[source.type!='Literal']`,
					'message': 'Use static imports instead of dynamic import() calls to enable tree-shaking.'
				},
			],
		}
	},
	// markdown-language-features
	{
		files: [
			'extensions/markdown-language-features/**/*.ts',
		],
		languageOptions: {
			parser: tseslint.parser,
		},
		plugins: {
			'@typescript-eslint': tseslint.plugin,
		},
		rules: {
			'no-restricted-syntax': [
				'warn',
				{
					selector: ':matches(PropertyDefinition, TSParameterProperty, MethodDefinition[key.name!="constructor"])[accessibility="private"]',
					message: 'Use #private instead',
				},
			],
		}
	},
	// Additional extension strictness rules
	{
		files: [
			'extensions/markdown-language-features/src/**/*.ts',
			'extensions/markdown-language-features/notebook/**/*.ts',
			'extensions/markdown-language-features/preview-src/**/*.ts',
			'extensions/mermaid-markdown-features/preview-src/chat/**/*.ts',
			'extensions/mermaid-markdown-features/src/**/*.ts',
			'extensions/simple-browser/**/*.ts',
			'extensions/typescript-language-features/**/*.ts',
		],
		languageOptions: {
			parser: tseslint.parser,
			parserOptions: {
				project: [
					// Markdown
					'extensions/markdown-language-features/tsconfig.json',
					'extensions/markdown-language-features/notebook/tsconfig.json',
					'extensions/markdown-language-features/preview-src/tsconfig.json',

					// Simple browser
					'extensions/simple-browser/tsconfig.json',
					'extensions/simple-browser/preview-src/tsconfig.json',

					// Mermaid markdown features
					'extensions/mermaid-markdown-features/tsconfig.json',
					'extensions/mermaid-markdown-features/preview-src/chat/tsconfig.json',

					// TypeScript
					'extensions/typescript-language-features/tsconfig.json',
					'extensions/typescript-language-features/web/tsconfig.json',
				],
			}
		},
		plugins: {
			'@typescript-eslint': tseslint.plugin,
		},
		rules: {
			'@typescript-eslint/prefer-optional-chain': 'warn',
			'@typescript-eslint/prefer-readonly': 'warn',
			'@typescript-eslint/consistent-generic-constructors': ['warn', 'constructor'],
		}
	},
	// Allow querySelector/querySelectorAll in test files - it's acceptable for test assertions
	{
		files: [
			'src/**/test/**/*.ts',
			'extensions/**/test/**/*.ts',
		],
		rules: {
			'no-restricted-syntax': [
				'warn',
				// Keep the Intl helper restriction even in tests
				{
					'selector': `NewExpression[callee.object.name='Intl']`,
					'message': 'Use safeIntl helper instead for safe and lazy use of potentially expensive Intl methods.'
				},
				{
					'selector': 'TSAsExpression[typeAnnotation.type="TSTypeReference"][typeAnnotation.typeName.type="TSQualifiedName"][typeAnnotation.typeName.left.type="Identifier"][typeAnnotation.typeName.left.name="sinon"][typeAnnotation.typeName.right.name="SinonStub"]',
					'message': `Avoid casting with 'as sinon.SinonStub'. Prefer typed stubs from 'sinon.stub(...)' or capture the stub in a typed variable.`
				},
			],
		}
	},
	// Forbid new JavaScript files - use TypeScript instead.
	// The allowlist of pre-existing JS/CJS/MJS files lives in
	// `.eslint-allowed-javascript-files`, which is gated by CODEOWNERS.
	// Do NOT add new entries; convert your file to TypeScript instead.
	{
		files: [
			'**/*.js',
			'**/*.cjs',
			'**/*.mjs',
		],
		ignores: allowedJavaScriptFiles,
		plugins: {
			'local': pluginLocal,
		},
		rules: {
			'local/code-no-new-javascript-files': 'error',
		},
	});
