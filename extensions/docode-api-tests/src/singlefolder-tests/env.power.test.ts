/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import * as docode from 'docode';

suite('docode API - env.power', () => {

	test('isOnBatteryPower returns a boolean', async () => {
		const result = await docode.env.power.isOnBatteryPower();
		assert.strictEqual(typeof result, 'boolean');
	});

	test('getSystemIdleState returns valid state', async () => {
		const state = await docode.env.power.getSystemIdleState(60);
		assert.ok(['active', 'idle', 'locked', 'unknown'].includes(state));
	});

	test('getSystemIdleTime returns a number', async () => {
		const idleTime = await docode.env.power.getSystemIdleTime();
		assert.strictEqual(typeof idleTime, 'number');
		assert.ok(idleTime >= 0);
	});

	test('getCurrentThermalState returns valid state', async () => {
		const state = await docode.env.power.getCurrentThermalState();
		assert.ok(['unknown', 'nominal', 'fair', 'serious', 'critical'].includes(state));
	});

	test('power save blocker can be started and disposed', async () => {
		const blocker = await docode.env.power.startPowerSaveBlocker('prevent-app-suspension');
		assert.strictEqual(typeof blocker.id, 'number');
		// Power save blocker is not supported in browser (id === -1), so isStarted will be false
		const isSupported = blocker.id >= 0;
		assert.strictEqual(blocker.isStarted, isSupported);

		blocker.dispose();
		assert.strictEqual(blocker.isStarted, false);
	});

	test('power save blocker with prevent-display-sleep type', async () => {
		const blocker = await docode.env.power.startPowerSaveBlocker('prevent-display-sleep');
		assert.strictEqual(typeof blocker.id, 'number');
		// Power save blocker is not supported in browser (id === -1), so isStarted will be false
		const isSupported = blocker.id >= 0;
		assert.strictEqual(blocker.isStarted, isSupported);

		blocker.dispose();
		assert.strictEqual(blocker.isStarted, false);
	});

	test('events are defined', () => {
		assert.ok(docode.env.power.onDidSuspend);
		assert.ok(docode.env.power.onDidResume);
		assert.ok(docode.env.power.onDidChangeOnBatteryPower);
		assert.ok(docode.env.power.onDidChangeThermalState);
		assert.ok(docode.env.power.onDidChangeSpeedLimit);
		assert.ok(docode.env.power.onWillShutdown);
		assert.ok(docode.env.power.onDidLockScreen);
		assert.ok(docode.env.power.onDidUnlockScreen);
	});

	test('event listeners can be registered and disposed', () => {
		const disposables: docode.Disposable[] = [];

		disposables.push(docode.env.power.onDidSuspend(() => { }));
		disposables.push(docode.env.power.onDidResume(() => { }));
		disposables.push(docode.env.power.onDidChangeOnBatteryPower(() => { }));
		disposables.push(docode.env.power.onDidChangeThermalState(() => { }));
		disposables.push(docode.env.power.onDidChangeSpeedLimit(() => { }));
		disposables.push(docode.env.power.onWillShutdown(() => { }));
		disposables.push(docode.env.power.onDidLockScreen(() => { }));
		disposables.push(docode.env.power.onDidUnlockScreen(() => { }));

		// Dispose all listeners
		disposables.forEach(d => d.dispose());
	});
});
