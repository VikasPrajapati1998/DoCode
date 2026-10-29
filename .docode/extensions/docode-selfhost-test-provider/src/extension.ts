/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { randomBytes } from 'crypto';
import { tmpdir } from 'os';
import * as path from 'path';
import * as docode from 'docode';
import { V8CoverageFile } from './coverageProvider';
import { FailingDeepStrictEqualAssertFixer } from './failingDeepStrictEqualAssertFixer';
import { FailureTracker } from './failureTracker';
import { registerSnapshotUpdate } from './snapshot';
import { scanTestOutput } from './testOutputScanner';
import {
	TestCase,
	TestFile,
	clearFileDiagnostics,
	guessWorkspaceFolder,
	itemData,
} from './testTree';
import { BrowserTestRunner, PlatformTestRunner, DoCodeTestRunner } from './docodeTestRunner';
import { ImportGraph } from './importGraph';

const TEST_FILE_PATTERN = 'src/vs/**/*.{test,integrationTest}.ts';

const getWorkspaceFolderForTestFile = (uri: docode.Uri) =>
	(uri.path.endsWith('.test.ts') || uri.path.endsWith('.integrationTest.ts')) &&
		uri.path.includes('/src/vs/')
		? docode.workspace.getWorkspaceFolder(uri)
		: undefined;

const browserArgs: [name: string, arg: string][] = [
	['Chrome', 'chromium'],
	['Firefox', 'firefox'],
	['Webkit', 'webkit'],
];

type FileChangeEvent = { uri: docode.Uri; removed: boolean };

export async function activate(context: docode.ExtensionContext) {
	const ctrl = docode.tests.createTestController('selfhost-test-controller', 'DoCode Tests');
	const fileChangedEmitter = new docode.EventEmitter<FileChangeEvent>();

	context.subscriptions.push(docode.tests.registerTestFollowupProvider({
		async provideFollowup(_result, test, taskIndex, messageIndex, _token) {
			return [{
				title: '$(sparkle) Fix',
				command: 'github.copilot.tests.fixTestFailure',
				arguments: [{ source: 'peekFollowup', test, message: test.taskStates[taskIndex].messages[messageIndex] }]
			}];
		},
	}));

	let initialWatchPromise: Promise<docode.Disposable> | undefined;
	const resolveHandler = async (test?: docode.TestItem) => {
		if (!test) {
			if (!initialWatchPromise) {
				initialWatchPromise = startWatchingWorkspace(ctrl, fileChangedEmitter);
				context.subscriptions.push(await initialWatchPromise);
			} else {
				await initialWatchPromise;
			}
			return;
		}

		const data = itemData.get(test);
		if (data instanceof TestFile) {
			// No need to watch this, updates will be triggered on file changes
			// either by the text document or file watcher.
			await data.updateFromDisk(ctrl, test);
		}
	};

	ctrl.resolveHandler = resolveHandler;

	guessWorkspaceFolder().then(folder => {
		if (!folder) {
			return;
		}

		const graph = new ImportGraph(
			folder.uri, async () => {
				await resolveHandler();
				return [...ctrl.items].map(([, item]) => item);
			}, uri => ctrl.items.get(uri.toString().toLowerCase()));
		ctrl.relatedCodeProvider = graph;

		if (context.storageUri) {
			context.subscriptions.push(new FailureTracker(context.storageUri.fsPath, folder.uri.fsPath));
		}

		context.subscriptions.push(fileChangedEmitter.event(e => graph.didChange(e.uri, e.removed)));
	});

	const createRunHandler = (
		runnerCtor: { new(folder: docode.WorkspaceFolder): DoCodeTestRunner },
		kind: docode.TestRunProfileKind,
		args: string[] = []
	) => {
		const doTestRun = async (
			req: docode.TestRunRequest,
			cancellationToken: docode.CancellationToken
		) => {
			const folder = await guessWorkspaceFolder();
			if (!folder) {
				return;
			}

			const runner = new runnerCtor(folder);
			const map = await getPendingTestMap(ctrl, req.include ?? gatherTestItems(ctrl.items));
			const task = ctrl.createTestRun(req);
			for (const test of map.values()) {
				task.enqueued(test);
			}

			let coverageDir: string | undefined;
			let currentArgs = args;
			if (kind === docode.TestRunProfileKind.Coverage) {
				// todo: browser runs currently don't support per-test coverage
				if (args.includes('--browser')) {
					coverageDir = path.join(
						tmpdir(),
						`docode-test-coverage-${randomBytes(8).toString('hex')}`
					);
					currentArgs = [
						...currentArgs,
						'--coverage',
						'--coveragePath',
						coverageDir,
						'--coverageFormats',
						'json',
					];
				} else {
					currentArgs = [...currentArgs, '--per-test-coverage'];
				}
			}

			return await scanTestOutput(
				map,
				task,
				kind === docode.TestRunProfileKind.Debug
					? await runner.debug(task, currentArgs, req.include)
					: await runner.run(currentArgs, req.include),
				coverageDir,
				cancellationToken
			);
		};

		return async (req: docode.TestRunRequest, cancellationToken: docode.CancellationToken) => {
			if (!req.continuous) {
				return doTestRun(req, cancellationToken);
			}

			const queuedFiles = new Set<string>();
			let debounced: NodeJS.Timeout | undefined;

			const listener = fileChangedEmitter.event(({ uri, removed }) => {
				clearTimeout(debounced);

				if (req.include && !req.include.some(i => i.uri?.toString() === uri.toString())) {
					return;
				}

				if (removed) {
					queuedFiles.delete(uri.toString());
				} else {
					queuedFiles.add(uri.toString());
				}

				debounced = setTimeout(() => {
					const include =
						req.include?.filter(t => t.uri && queuedFiles.has(t.uri?.toString())) ??
						[...queuedFiles]
							.map(f => getOrCreateFile(ctrl, docode.Uri.parse(f)))
							.filter((f): f is docode.TestItem => !!f);
					queuedFiles.clear();

					doTestRun(
						new docode.TestRunRequest(include, req.exclude, req.profile, true),
						cancellationToken
					);
				}, 1000);
			});

			cancellationToken.onCancellationRequested(() => {
				clearTimeout(debounced);
				listener.dispose();
			});
		};
	};

	ctrl.createRunProfile(
		'Run in Electron',
		docode.TestRunProfileKind.Run,
		createRunHandler(PlatformTestRunner, docode.TestRunProfileKind.Run),
		true,
		undefined,
		true
	);

	ctrl.createRunProfile(
		'Debug in Electron',
		docode.TestRunProfileKind.Debug,
		createRunHandler(PlatformTestRunner, docode.TestRunProfileKind.Debug),
		true,
		undefined,
		true
	);

	const coverage = ctrl.createRunProfile(
		'Coverage in Electron',
		docode.TestRunProfileKind.Coverage,
		createRunHandler(PlatformTestRunner, docode.TestRunProfileKind.Coverage),
		true,
		undefined,
		true
	);

	coverage.loadDetailedCoverage = async (_run, coverage) => coverage instanceof V8CoverageFile ? coverage.details : [];
	coverage.loadDetailedCoverageForTest = async (_run, coverage, test) => coverage instanceof V8CoverageFile ? coverage.testDetails(test) : [];

	for (const [name, arg] of browserArgs) {
		const cfg = ctrl.createRunProfile(
			`Run in ${name}`,
			docode.TestRunProfileKind.Run,
			createRunHandler(BrowserTestRunner, docode.TestRunProfileKind.Run, [' --browser', arg]),
			undefined,
			undefined,
			true
		);

		cfg.configureHandler = () => docode.window.showInformationMessage(`Configuring ${name}`);

		ctrl.createRunProfile(
			`Debug in ${name}`,
			docode.TestRunProfileKind.Debug,
			createRunHandler(BrowserTestRunner, docode.TestRunProfileKind.Debug, [
				'--browser',
				arg,
				'--debug-browser',
			]),
			undefined,
			undefined,
			true
		);
	}

	function updateNodeForDocument(e: docode.TextDocument) {
		const node = getOrCreateFile(ctrl, e.uri);
		const data = node && itemData.get(node);
		if (data instanceof TestFile) {
			data.updateFromContents(ctrl, e.getText(), node!);
		}
	}

	for (const document of docode.workspace.textDocuments) {
		updateNodeForDocument(document);
	}

	context.subscriptions.push(
		ctrl,
		fileChangedEmitter.event(({ uri, removed }) => {
			if (!removed) {
				const node = getOrCreateFile(ctrl, uri);
				if (node) {
					ctrl.invalidateTestResults();
				}
			}
		}),
		docode.workspace.onDidOpenTextDocument(updateNodeForDocument),
		docode.workspace.onDidChangeTextDocument(e => updateNodeForDocument(e.document)),
		registerSnapshotUpdate(ctrl),
		new FailingDeepStrictEqualAssertFixer()
	);
}

export function deactivate() {
	// no-op
}

function getOrCreateFile(
	controller: docode.TestController,
	uri: docode.Uri
): docode.TestItem | undefined {
	const folder = getWorkspaceFolderForTestFile(uri);
	if (!folder) {
		return undefined;
	}

	const data = new TestFile(uri, folder);
	const existing = controller.items.get(data.getId());
	if (existing) {
		return existing;
	}

	const file = controller.createTestItem(data.getId(), data.getLabel(), uri);
	controller.items.add(file);
	file.canResolveChildren = true;
	itemData.set(file, data);

	return file;
}

function gatherTestItems(collection: docode.TestItemCollection) {
	const items: docode.TestItem[] = [];
	collection.forEach(item => items.push(item));
	return items;
}

async function startWatchingWorkspace(
	controller: docode.TestController,
	fileChangedEmitter: docode.EventEmitter<FileChangeEvent>
) {
	const workspaceFolder = await guessWorkspaceFolder();
	if (!workspaceFolder) {
		return new docode.Disposable(() => undefined);
	}

	const pattern = new docode.RelativePattern(workspaceFolder, TEST_FILE_PATTERN);
	const watcher = docode.workspace.createFileSystemWatcher(pattern);

	watcher.onDidCreate(uri => {
		getOrCreateFile(controller, uri);
		fileChangedEmitter.fire({ removed: false, uri });
	});
	watcher.onDidChange(uri => fileChangedEmitter.fire({ removed: false, uri }));
	watcher.onDidDelete(uri => {
		fileChangedEmitter.fire({ removed: true, uri });
		clearFileDiagnostics(uri);
		controller.items.delete(uri.toString());
	});

	for (const file of await docode.workspace.findFiles(pattern)) {
		getOrCreateFile(controller, file);
	}

	return watcher;
}

async function getPendingTestMap(ctrl: docode.TestController, tests: Iterable<docode.TestItem>) {
	const queue = [tests];
	const titleMap = new Map<string, docode.TestItem>();
	while (queue.length) {
		for (const item of queue.pop()!) {
			const data = itemData.get(item);
			if (data instanceof TestFile) {
				if (!data.hasBeenRead) {
					await data.updateFromDisk(ctrl, item);
				}
				queue.push(gatherTestItems(item.children));
			} else if (data instanceof TestCase) {
				titleMap.set(data.fullName, item);
			} else {
				queue.push(gatherTestItems(item.children));
			}
		}
	}

	return titleMap;
}
