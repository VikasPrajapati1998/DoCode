/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as docode from 'docode';
import { TestFS } from '../memfs';
import { assertNoRpc } from '../utils';

suite('docode API - workspace-watcher', () => {

	interface IWatchRequest {
		uri: docode.Uri;
		options: { recursive: boolean; excludes: string[] };
	}

	class WatcherTestFs extends TestFS {

		private _onDidWatch = new docode.EventEmitter<IWatchRequest>();
		readonly onDidWatch = this._onDidWatch.event;

		override watch(uri: docode.Uri, options: { recursive: boolean; excludes: string[] }): docode.Disposable {
			this._onDidWatch.fire({ uri, options });

			return super.watch(uri, options);
		}
	}

	let fs: WatcherTestFs;
	let disposable: docode.Disposable;

	function onDidWatchPromise() {
		const onDidWatchPromise = new Promise<IWatchRequest>(resolve => {
			fs.onDidWatch(request => resolve(request));
		});

		return onDidWatchPromise;
	}

	setup(() => {
		fs = new WatcherTestFs('watcherTest', false);
		disposable = docode.workspace.registerFileSystemProvider('watcherTest', fs);
	});

	teardown(() => {
		disposable.dispose();
		assertNoRpc();
	});

	test('createFileSystemWatcher', async function () {

		// Non-recursive
		let watchUri = docode.Uri.from({ scheme: 'watcherTest', path: '/somePath/folder' });
		const watcher = docode.workspace.createFileSystemWatcher(new docode.RelativePattern(watchUri, '*.txt'));
		let request = await onDidWatchPromise();

		assert.strictEqual(request.uri.toString(), watchUri.toString());
		assert.strictEqual(request.options.recursive, false);

		watcher.dispose();

		// Recursive
		watchUri = docode.Uri.from({ scheme: 'watcherTest', path: '/somePath/folder' });
		docode.workspace.createFileSystemWatcher(new docode.RelativePattern(watchUri, '**/*.txt'));
		request = await onDidWatchPromise();

		assert.strictEqual(request.uri.toString(), watchUri.toString());
		assert.strictEqual(request.options.recursive, true);
	});
});
