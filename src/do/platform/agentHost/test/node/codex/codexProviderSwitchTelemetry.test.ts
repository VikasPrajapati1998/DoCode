/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import type { ITelemetryData } from '../../../../telemetry/common/telemetry.js';
import { NullTelemetryServiceShape } from '../../../../telemetry/common/telemetryUtils.js';
import { reportCodexProviderSwitch } from '../../../node/codex/codexProviderSwitchTelemetry.js';
import { getCodexAccountTelemetryContext } from '../../../node/codex/codexAccountTelemetry.js';

class TestTelemetryService extends NullTelemetryServiceShape {
	readonly events: { name: string | undefined; data: ITelemetryData | undefined }[] = [];

	override publicLog2(name?: string, data?: ITelemetryData): void {
		this.events.push({ name, data });
	}
}

suite('CodexProviderSwitchTelemetry', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const snapshotTestStartTime = 1_000_000;

	test('joins an accepted provider transition to its session, chat and turn', () => {
		const telemetry = new TestTelemetryService();
		const correlation = { agentSessionId: 'session', chatSessionId: 'chat', turnId: 'turn' };
		reportCodexProviderSwitch(telemetry, 'openai', 'docode-proxy', false, undefined, correlation);
		assert.deepStrictEqual(telemetry.events, [{ name: 'agentHost.codexProviderSwitch', data: { fromProvider: 'openai', toProvider: 'copilot', isDesktopThread: false, ...correlation } }]);
	});

	for (const isDesktopThread of [false, true]) {
		test(`reports both subscription directions with desktop origin ${isDesktopThread}`, () => {
			const telemetryService = new TestTelemetryService();

			reportCodexProviderSwitch(telemetryService, 'openai', 'docode-proxy', isDesktopThread);
			reportCodexProviderSwitch(telemetryService, 'docode-proxy', 'openai', isDesktopThread);

			assert.deepStrictEqual(telemetryService.events, [{
				name: 'agentHost.codexProviderSwitch',
				data: { fromProvider: 'openai', toProvider: 'copilot', isDesktopThread },
			}, {
				name: 'agentHost.codexProviderSwitch',
				data: { fromProvider: 'copilot', toProvider: 'openai', isDesktopThread },
			}]);
		});
	}

	test('reports the accepted turn snapshot after its observation window', async () => {
		await runWithFakedTimers({ useFakeTimers: true, startTime: snapshotTestStartTime }, async () => {
			const now = snapshotTestStartTime;
			const telemetryService = new TestTelemetryService();
			const snapshot = getCodexAccountTelemetryContext(
				{ usageSource: 'openai', status: 'signedIn', authType: 'chatgpt', planType: 'plus', email: 'person@example.com' },
				{ usedPercent: 42.4, windowDurationMins: 7 * 24 * 60, resetsAt: now / 1000 + 1 }, now);
			await timeout(5 * 60 * 1000 + 1);
			reportCodexProviderSwitch(telemetryService, 'openai', 'docode-proxy', true, snapshot);

			assert.deepStrictEqual(telemetryService.events, [{
				name: 'agentHost.codexProviderSwitch',
				data: {
					fromProvider: 'openai', toProvider: 'copilot', isDesktopThread: true,
					chatgptAccountState: 'signedIn', chatgptPlanTier: 'plus', chatgptWeeklyQuotaState: 'available', chatgptWeeklyUsedPercentBucket: 40,
					chatgptFiveHourQuotaState: 'missing',
				},
			}]);
		});
	});

	test('preserves unavailable context and emits only schema fields', () => {
		const telemetryService = new TestTelemetryService();
		const context = { ...getCodexAccountTelemetryContext(undefined, undefined, undefined), email: 'person@example.com', usedPercent: 42.4 };
		reportCodexProviderSwitch(telemetryService, 'docode-proxy', 'openai', false, context);

		assert.deepStrictEqual(telemetryService.events, [{
			name: 'agentHost.codexProviderSwitch',
			data: { fromProvider: 'copilot', toProvider: 'openai', isDesktopThread: false, chatgptAccountState: 'unknown', chatgptWeeklyQuotaState: 'unavailable', chatgptFiveHourQuotaState: 'unavailable' },
		}]);
	});

	test('never reports missing, custom, or unchanged providers', () => {
		const telemetryService = new TestTelemetryService();

		for (const [fromProvider, toProvider] of [
			[undefined, 'openai'],
			['docode-proxy', undefined],
			[undefined, undefined],
			['', 'docode-proxy'],
			['openai', ''],
			['custom-provider', 'docode-proxy'],
			['openai', 'https://private-provider.example/api'],
			['openai', 'openai'],
			['docode-proxy', 'docode-proxy'],
		]) {
			reportCodexProviderSwitch(telemetryService, fromProvider, toProvider, true);
		}

		assert.deepStrictEqual(telemetryService.events, []);
	});
});
