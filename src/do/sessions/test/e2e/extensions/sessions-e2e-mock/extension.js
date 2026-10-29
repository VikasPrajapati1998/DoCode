/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// @ts-check

/// <reference types="docode" />

/**
 * Mock extension for Sessions E2E testing.
 *
 * Provides:
 * - A fake GitHub authentication provider (skips sign-in)
 * - Mock command handlers for Code Review, Create PR, Open PR, and Merge
 *
 * The mock-fs:// FileSystemProvider and chat agents are registered
 * directly in the workbench (web.test.ts), not here.
 */

// ---------------------------------------------------------------------------
// Activation
// ---------------------------------------------------------------------------

/**
 * @param {import('docode').ExtensionContext} context
 */
function activate(context) {
	const docode = require('docode');

	console.log('[sessions-e2e-mock] Activating mock extension');

	// 1. Mock GitHub Authentication Provider
	context.subscriptions.push(registerMockAuth(docode));

	// 2. Mock command handlers for Code Review and PR actions
	context.subscriptions.push(...registerMockCommands(docode));

	// Note: The mock-fs:// FileSystemProvider is registered directly in the
	// workbench (web.test.ts → registerMockFileSystemProvider) so it is
	// available before any service tries to resolve workspace files.
	// Do NOT register it here — it would cause a duplicate provider error.

	console.log('[sessions-e2e-mock] All mocks registered');
}

// ---------------------------------------------------------------------------
// Mock Authentication Provider
// ---------------------------------------------------------------------------

/**
 * @param {typeof import('docode')} docode
 * @returns {import('docode').Disposable}
 */
function registerMockAuth(docode) {
	const sessionChangeEmitter = new docode.EventEmitter();

	/** @type {import('docode').AuthenticationSession} */
	const mockSession = {
		id: 'mock-session-1',
		accessToken: 'gho_mock_e2e_test_token_00000000000000000000',
		account: {
			id: 'e2e-test-user',
			label: 'E2E Test User',
		},
		scopes: ['read:user', 'repo', 'workflow'],
	};

	/** @type {import('docode').AuthenticationProvider} */
	const provider = {
		onDidChangeSessions: sessionChangeEmitter.event,
		async getSessions(_scopes, _options) {
			return [mockSession];
		},
		async createSession(_scopes, _options) {
			sessionChangeEmitter.fire({ added: [mockSession], removed: [], changed: [] });
			return mockSession;
		},
		async removeSession(_sessionId) {
			sessionChangeEmitter.fire({ added: [], removed: [mockSession], changed: [] });
		},
	};

	console.log('[sessions-e2e-mock] Registering mock GitHub auth provider');
	return docode.authentication.registerAuthenticationProvider('github', 'GitHub (Mock)', provider, {
		supportsMultipleAccounts: false,
	});
}

// ---------------------------------------------------------------------------
// Mock Command Handlers (Code Review + PR Actions)
// ---------------------------------------------------------------------------

/**
 * Registers mock command handlers that stand in for the real GitHub Copilot
 * extension commands. These allow the Code Review and Create PR buttons to
 * function in the e2e test environment.
 *
 * @param {typeof import('docode')} docode
 * @returns {import('docode').Disposable[]}
 */
function registerMockCommands(docode) {
	const disposables = [];

	// Mock create PR — simulates successful PR creation
	disposables.push(docode.commands.registerCommand(
		'github.copilot.chat.createPullRequestCopilotCLIAgentSession.createPR',
		() => {
			console.log('[sessions-e2e-mock] Mock Create PR invoked');
			docode.window.showInformationMessage('Mock: Pull request created successfully');
		}
	));

	// Mock open PR — simulates opening a PR URL
	disposables.push(docode.commands.registerCommand(
		'github.copilot.chat.openPullRequestCopilotCLIAgentSession.openPR',
		() => {
			console.log('[sessions-e2e-mock] Mock Open PR invoked');
			docode.window.showInformationMessage('Mock: Opening pull request');
		}
	));

	// Mock merge — simulates merging changes
	disposables.push(docode.commands.registerCommand(
		'github.copilot.chat.mergeCopilotCLIAgentSessionChanges.merge',
		() => {
			console.log('[sessions-e2e-mock] Mock Merge invoked');
			docode.window.showInformationMessage('Mock: Changes merged successfully');
		}
	));

	// Mock merge and sync — simulates merging and syncing
	disposables.push(docode.commands.registerCommand(
		'github.copilot.chat.mergeCopilotCLIAgentSessionChanges.mergeAndSync',
		() => {
			console.log('[sessions-e2e-mock] Mock Merge and Sync invoked');
			docode.window.showInformationMessage('Mock: Changes merged and synced successfully');
		}
	));

	// Mock apply changes — simulates applying session changes
	disposables.push(docode.commands.registerCommand(
		'github.copilot.chat.applyCopilotCLIAgentSessionChanges.apply',
		() => {
			console.log('[sessions-e2e-mock] Mock Apply Changes invoked');
			docode.window.showInformationMessage('Mock: Changes applied successfully');
		}
	));

	// Mock checkout PR reroute — simulates checkout PR flow
	disposables.push(docode.commands.registerCommand(
		'github.copilot.chat.checkoutPullRequestReroute',
		() => {
			console.log('[sessions-e2e-mock] Mock Checkout PR Reroute invoked');
			docode.window.showInformationMessage('Mock: Checking out pull request');
		}
	));

	// Mock update changes — simulates updating session changes
	disposables.push(docode.commands.registerCommand(
		'github.copilot.chat.updateCopilotCLIAgentSessionChanges.update',
		() => {
			console.log('[sessions-e2e-mock] Mock Update Changes invoked');
			docode.window.showInformationMessage('Mock: Changes updated successfully',);
		}
	));

	console.log('[sessions-e2e-mock] Registered mock Code Review and PR command handlers');
	return disposables;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = { activate };
