/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as docode from 'docode';
import * as cp from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as net from 'net';
import * as http from 'http';
import * as crypto from 'crypto';
import { downloadAndUnzipVSCodeServer } from './download';
import { terminateProcess } from './util/processes';

let extHostProcess: cp.ChildProcess | undefined;
const enum CharCode {
	Backspace = 8,
	LineFeed = 10
}

let outputChannel: docode.OutputChannel;

const SLOWED_DOWN_CONNECTION_DELAY = 800;
const agentHostBridgeConnectionTokenEnvironmentVariable = 'DOCODE_AGENT_HOST_BRIDGE_CONNECTION_TOKEN';

function isExpectedSocketCloseError(error: NodeJS.ErrnoException): boolean {
	return error.code === 'ECONNRESET' || error.code === 'EPIPE' || error.code === 'ECONNABORTED';
}

export function activate(context: docode.ExtensionContext) {

	let connectionPaused = false;
	const connectionPausedEvent = new docode.EventEmitter<boolean>();

	let connectionSlowedDown = false;
	const connectionSlowedDownEvent = new docode.EventEmitter<boolean>();
	const slowedDownConnections = new Set<Function>();
	connectionSlowedDownEvent.event(slowed => {
		if (!slowed) {
			for (const cb of slowedDownConnections) {
				cb();
			}
			slowedDownConnections.clear();
		}
	});

	function getTunnelFeatures(): docode.TunnelInformation['tunnelFeatures'] {
		return {
			elevation: true,
			privacyOptions: docode.workspace.getConfiguration('testresolver').get('supportPublicPorts') ? [
				{
					id: 'public',
					label: 'Public',
					themeIcon: 'eye'
				},
				{
					id: 'other',
					label: 'Other',
					themeIcon: 'circuit-board'
				},
				{
					id: 'private',
					label: 'Private',
					themeIcon: 'eye-closed'
				}
			] : []
		};
	}

	function maybeSlowdown(): Promise<void> | void {
		if (connectionSlowedDown) {
			return new Promise(resolve => {
				const handle = setTimeout(() => {
					resolve();
					slowedDownConnections.delete(resolve);
				}, SLOWED_DOWN_CONNECTION_DELAY);

				slowedDownConnections.add(() => {
					resolve();
					clearTimeout(handle);
				});
			});
		}
	}

	function doResolve(authority: string, progress: docode.Progress<{ message?: string; increment?: number }>): Promise<docode.ResolverResult> {
		if (connectionPaused) {
			throw docode.RemoteAuthorityResolverError.TemporarilyNotAvailable('Not available right now');
		}
		const connectionToken = String(crypto.randomInt(0xffffffffff));

		// eslint-disable-next-line no-async-promise-executor
		const serverPromise = new Promise<docode.ResolvedAuthority>(async (res, rej) => {
			progress.report({ message: 'Starting Test Resolver' });
			outputChannel = docode.window.createOutputChannel('TestResolver');

			let isResolved = false;
			async function processError(message: string) {
				outputChannel.appendLine(message);
				if (!isResolved) {
					isResolved = true;
					outputChannel.show();

					const result = await docode.window.showErrorMessage(message, { modal: true }, ...getActions());
					if (result) {
						await result.execute();
					}
					rej(docode.RemoteAuthorityResolverError.NotAvailable(message, true));
				}
			}

			let lastProgressLine = '';
			function processOutput(output: string) {
				outputChannel.append(output);
				for (let i = 0; i < output.length; i++) {
					const chr = output.charCodeAt(i);
					if (chr === CharCode.LineFeed) {
						const match = lastProgressLine.match(/Extension host agent listening on (\d+)/);
						if (match) {
							isResolved = true;
							res(new docode.ResolvedAuthority('127.0.0.1', parseInt(match[1], 10), connectionToken)); // success!
						}
						lastProgressLine = '';
					} else if (chr === CharCode.Backspace) {
						lastProgressLine = lastProgressLine.substr(0, lastProgressLine.length - 1);
					} else {
						lastProgressLine += output.charAt(i);
					}
				}
			}
			const delay = getConfiguration('startupDelay');
			if (typeof delay === 'number') {
				let remaining = Math.ceil(delay);
				outputChannel.append(`Delaying startup by ${remaining} seconds (configured by "testresolver.startupDelay").`);
				while (remaining > 0) {
					progress.report({ message: `Delayed resolving: Remaining ${remaining}s` });
					await (sleep(1000));
					remaining--;
				}
			}

			if (getConfiguration('startupError') === true) {
				processError('Test Resolver failed for testing purposes (configured by "testresolver.startupError").');
				return;
			}

			const { updateUrl, commit, quality, serverDataFolderName, serverApplicationName, dataFolderName } = getProductConfiguration();
			const commandArgs = ['--host=127.0.0.1', '--port=0', '--disable-telemetry', '--disable-experiments', '--use-host-proxy', '--accept-server-license-terms', '--force-disable-user-env'];
			const env = getNewEnv();
			const remoteDataDir = process.env['TESTRESOLVER_DATA_FOLDER'] || path.join(os.homedir(), `${serverDataFolderName || dataFolderName}-testresolver`);
			const logsDir = process.env['TESTRESOLVER_LOGS_FOLDER'];
			if (logsDir) {
				commandArgs.push('--logsPath', logsDir);
			}
			const logLevel = process.env['TESTRESOLVER_LOG_LEVEL'];
			if (logLevel) {
				commandArgs.push('--log', logLevel);
			}
			outputChannel.appendLine(`Using data folder at ${remoteDataDir}`);
			commandArgs.push('--server-data-dir', remoteDataDir);

			commandArgs.push('--connection-token', connectionToken);

			const agentHostPort = getConfiguration('agentHostPort');
			const agentHostBridgePort = getConfiguration('agentHostBridgePort');
			if (
				typeof agentHostPort === 'number' && agentHostPort > 0 &&
				typeof agentHostBridgePort === 'number' && agentHostBridgePort > 0
			) {
				// `agentHostPort` spawns an agent host inside the server;
				// `agentHostBridgePort` bridges the renderer to an
				// externally-running one. They contradict each other —
				// reject up front so the user notices instead of getting
				// two agent hosts and silently confusing failure modes.
				throw new Error(
					`testResolver: 'agentHostPort' and 'agentHostBridgePort' are mutually exclusive. ` +
					`Configure at most one (got port=${agentHostPort}, bridge=${agentHostBridgePort}).`
				);
			}
			if (typeof agentHostPort === 'number' && agentHostPort > 0) {
				commandArgs.push('--agent-host-port', String(agentHostPort));
			}

			// Bridge to an externally-running agent host (e.g. one started
			// by `code agent host`). Mutually exclusive with `agentHostPort`
			// — that one spawns its own agent host.
			if (typeof agentHostBridgePort === 'number' && agentHostBridgePort > 0) {
				commandArgs.push('--agent-host-bridge-port', String(agentHostBridgePort));
			}
			const agentHostBridgeToken = getConfiguration('agentHostBridgeConnectionToken');
			if (typeof agentHostBridgeToken === 'string' && agentHostBridgeToken) {
				env[agentHostBridgeConnectionTokenEnvironmentVariable] = agentHostBridgeToken;
			}

			if (!commit) { // dev mode
				const serverCommand = process.platform === 'win32' ? 'code-server.bat' : 'code-server.sh';
				const docodePath = path.resolve(path.join(context.extensionPath, '..', '..'));
				const serverCommandPath = path.join(docodePath, 'scripts', serverCommand);

				outputChannel.appendLine(`Launching server: "${serverCommandPath}" ${commandArgs.join(' ')}`);
				const shell = (process.platform === 'win32');
				// Skip prelaunch to avoid redownloading electron while it may be in use
				env['DOCODE_SKIP_PRELAUNCH'] = '1';
				extHostProcess = cp.spawn(serverCommandPath, commandArgs, { env, cwd: docodePath, shell });
			} else {
				const extensionToInstall = process.env['TESTRESOLVER_INSTALL_BUILTIN_EXTENSION'];
				if (extensionToInstall) {
					commandArgs.push('--install-builtin-extension', extensionToInstall);
					commandArgs.push('--start-server');
				}
				const serverCommand = `${serverApplicationName}${process.platform === 'win32' ? '.cmd' : ''}`;
				let serverLocation = env['DOCODE_REMOTE_SERVER_PATH']; // support environment variable to specify location of server on disk
				if (!serverLocation) {
					const serverBin = path.join(remoteDataDir, 'bin');
					progress.report({ message: 'Installing DoCode Server' });
					serverLocation = await downloadAndUnzipVSCodeServer(updateUrl, commit, quality, serverBin, m => outputChannel.appendLine(m));
				}

				outputChannel.appendLine(`Using server build at ${serverLocation}`);
				outputChannel.appendLine(`Server arguments ${commandArgs.join(' ')}`);
				const shell = (process.platform === 'win32');
				extHostProcess = cp.spawn(path.join(serverLocation, 'bin', serverCommand), commandArgs, { env, cwd: serverLocation, shell });
			}
			extHostProcess.stdout!.on('data', (data: Buffer) => processOutput(data.toString()));
			extHostProcess.stderr!.on('data', (data: Buffer) => processOutput(data.toString()));
			extHostProcess.on('error', (error: Error) => {
				processError(`server failed with error:\n${error.message}`);
				extHostProcess = undefined;
			});
			extHostProcess.on('exit', (code: number | null, signal: NodeJS.Signals | null) => {
				// Logged separately from 'close' so we capture the signal (if any)
				// that terminated the server. A non-null signal indicates the
				// server was killed externally rather than exiting on its own.
				outputChannel.appendLine(`[${new Date().toISOString()}] server process exited (code: ${code}, signal: ${signal}).`);
			});
			extHostProcess.on('close', (code: number | null, signal: NodeJS.Signals | null) => {
				processError(`server closed unexpectedly.\nError code: ${code}, signal: ${signal}`);
				extHostProcess = undefined;
			});
			context.subscriptions.push({
				dispose: () => {
					if (extHostProcess) {
						terminateProcess(extHostProcess, context.extensionPath);
					}
				}
			});
		});

		return serverPromise.then((serverAddr): Promise<docode.ResolverResult> => {
			if (authority.includes('managed')) {
				console.log('Connecting via a managed authority');
				return Promise.resolve(new docode.ManagedResolvedAuthority(async () => {
					const remoteSocket = net.createConnection({ port: serverAddr.port });
					const dataEmitter = new docode.EventEmitter<Uint8Array<ArrayBuffer>>();
					const closeEmitter = new docode.EventEmitter<Error | undefined>();
					const endEmitter = new docode.EventEmitter<void>();

					await new Promise((res, rej) => {
						remoteSocket.on('data', d => dataEmitter.fire(d as Uint8Array<ArrayBuffer>))
							.on('error', err => { rej(); closeEmitter.fire(err); })
							.on('close', () => endEmitter.fire())
							.on('end', () => endEmitter.fire())
							.on('connect', res);
					});


					return {
						onDidReceiveMessage: dataEmitter.event,
						onDidClose: closeEmitter.event,
						onDidEnd: endEmitter.event,
						send: d => remoteSocket.write(d),
						end: () => remoteSocket.end(),
					};
				}, connectionToken));
			}

			return new Promise<docode.ResolvedAuthority>((res, _rej) => {
				const proxyServer = net.createServer(proxySocket => {
					outputChannel.appendLine(`Proxy connection accepted`);
					let remoteReady = true, localReady = true;
					const remoteSocket = net.createConnection({ port: serverAddr.port });
					const onSocketError = (error: NodeJS.ErrnoException) => {
						if (!isExpectedSocketCloseError(error)) {
							outputChannel.appendLine(`Socket error: ${error.message}`);
						}
					};

					let isDisconnected = false;
					const handleConnectionPause = () => {
						const newIsDisconnected = connectionPaused;
						if (isDisconnected !== newIsDisconnected) {
							outputChannel.appendLine(`Connection state: ${newIsDisconnected ? 'open' : 'paused'}`);
							isDisconnected = newIsDisconnected;
							if (!isDisconnected) {
								outputChannel.appendLine(`Resume remote and proxy sockets.`);
								if (remoteSocket.isPaused() && localReady) {
									remoteSocket.resume();
								}
								if (proxySocket.isPaused() && remoteReady) {
									proxySocket.resume();
								}
							} else {
								outputChannel.appendLine(`Pausing remote and proxy sockets.`);
								if (!remoteSocket.isPaused()) {
									remoteSocket.pause();
								}
								if (!proxySocket.isPaused()) {
									proxySocket.pause();
								}
							}
						}
					};

					connectionPausedEvent.event(_ => handleConnectionPause());
					handleConnectionPause();

					proxySocket.on('data', async (data) => {
						await maybeSlowdown();
						remoteReady = remoteSocket.write(data);
						if (!remoteReady) {
							proxySocket.pause();
						}
					});
					remoteSocket.on('data', async (data) => {
						await maybeSlowdown();
						localReady = proxySocket.write(data);
						if (!localReady) {
							remoteSocket.pause();
						}
					});
					proxySocket.on('drain', () => {
						localReady = true;
						if (!isDisconnected) {
							remoteSocket.resume();
						}
					});
					remoteSocket.on('drain', () => {
						remoteReady = true;
						if (!isDisconnected) {
							proxySocket.resume();
						}
					});
					proxySocket.on('error', onSocketError);
					remoteSocket.on('error', onSocketError);
					proxySocket.on('close', () => {
						outputChannel.appendLine(`Proxy socket closed, closing remote socket.`);
						remoteSocket.end();
					});
					remoteSocket.on('close', () => {
						outputChannel.appendLine(`Remote socket closed, closing proxy socket.`);
						proxySocket.end();
					});
					context.subscriptions.push({
						dispose: () => {
							proxySocket.end();
							remoteSocket.end();
						}
					});
				});
				proxyServer.listen(0, '127.0.0.1', () => {
					const port = (<net.AddressInfo>proxyServer.address()).port;
					outputChannel.appendLine(`Going through proxy at port ${port}`);
					res(new docode.ResolvedAuthority('127.0.0.1', port, connectionToken));
				});
				context.subscriptions.push({
					dispose: () => {
						proxyServer.close();
					}
				});
			});
		});
	}

	const authorityResolverDisposable = docode.workspace.registerRemoteAuthorityResolver('test', {
		async getCanonicalURI(uri: docode.Uri): Promise<docode.Uri> {
			return docode.Uri.file(uri.path);
		},
		resolve(_authority: string): Thenable<docode.ResolverResult> {
			return docode.window.withProgress({
				location: docode.ProgressLocation.Notification,
				title: 'Open TestResolver Remote ([details](command:docode-testresolver.showLog))',
				cancellable: false
			}, async (progress) => {
				const rr = await doResolve(_authority, progress);
				rr.tunnelFeatures = getTunnelFeatures();
				return rr;
			});
		},
		tunnelFactory,
		showCandidatePort
	});
	context.subscriptions.push(authorityResolverDisposable);

	context.subscriptions.push(docode.commands.registerCommand('docode-testresolver.newWindow', () => {
		return docode.commands.executeCommand('docode.newWindow', { remoteAuthority: 'test+test' });
	}));
	context.subscriptions.push(docode.commands.registerCommand('docode-testresolver.currentWindow', () => {
		return docode.commands.executeCommand('docode.newWindow', { remoteAuthority: 'test+test', reuseWindow: true });
	}));
	context.subscriptions.push(docode.commands.registerCommand('docode-testresolver.currentWindowManaged', () => {
		return docode.commands.executeCommand('docode.newWindow', { remoteAuthority: 'test+managed', reuseWindow: true });
	}));
	context.subscriptions.push(docode.commands.registerCommand('docode-testresolver.newWindowWithError', () => {
		return docode.commands.executeCommand('docode.newWindow', { remoteAuthority: 'test+error' });
	}));
	context.subscriptions.push(docode.commands.registerCommand('docode-testresolver.killServerAndTriggerHandledError', () => {
		authorityResolverDisposable.dispose();
		if (extHostProcess) {
			terminateProcess(extHostProcess, context.extensionPath);
		}
		docode.workspace.registerRemoteAuthorityResolver('test', {
			async resolve(_authority: string): Promise<docode.ResolvedAuthority> {
				setTimeout(async () => {
					await docode.window.showErrorMessage('Just a custom message.', { modal: true, useCustom: true }, 'OK', 'Great');
				}, 2000);
				throw docode.RemoteAuthorityResolverError.NotAvailable('Intentional Error', true);
			}
		});
	}));
	context.subscriptions.push(docode.commands.registerCommand('docode-testresolver.showLog', () => {
		if (outputChannel) {
			outputChannel.show();
		}
	}));

	const pauseStatusBarEntry = docode.window.createStatusBarItem(docode.StatusBarAlignment.Left);
	pauseStatusBarEntry.text = 'Remote connection paused. Click to undo';
	pauseStatusBarEntry.command = 'docode-testresolver.toggleConnectionPause';
	pauseStatusBarEntry.backgroundColor = new docode.ThemeColor('statusBarItem.errorBackground');

	context.subscriptions.push(docode.commands.registerCommand('docode-testresolver.toggleConnectionPause', () => {
		if (!connectionPaused) {
			connectionPaused = true;
			pauseStatusBarEntry.show();
		} else {
			connectionPaused = false;
			pauseStatusBarEntry.hide();
		}
		connectionPausedEvent.fire(connectionPaused);
	}));

	const slowdownStatusBarEntry = docode.window.createStatusBarItem(docode.StatusBarAlignment.Left);
	slowdownStatusBarEntry.text = 'Remote connection slowed down. Click to undo';
	slowdownStatusBarEntry.command = 'docode-testresolver.toggleConnectionSlowdown';
	slowdownStatusBarEntry.backgroundColor = new docode.ThemeColor('statusBarItem.errorBackground');

	context.subscriptions.push(docode.commands.registerCommand('docode-testresolver.toggleConnectionSlowdown', () => {
		if (!connectionSlowedDown) {
			connectionSlowedDown = true;
			slowdownStatusBarEntry.show();
		} else {
			connectionSlowedDown = false;
			slowdownStatusBarEntry.hide();
		}
		connectionSlowedDownEvent.fire(connectionSlowedDown);
	}));

	context.subscriptions.push(docode.commands.registerCommand('docode-testresolver.openTunnel', async () => {
		const result = await docode.window.showInputBox({
			prompt: 'Enter the remote port for the tunnel',
			value: '5000',
			validateInput: input => /^[\d]+$/.test(input) ? undefined : 'Not a valid number'
		});
		if (result) {
			const port = Number.parseInt(result);
			docode.workspace.openTunnel({
				remoteAddress: {
					host: '127.0.0.1',
					port: port
				},
				localAddressPort: port + 1
			});
		}

	}));
	context.subscriptions.push(docode.commands.registerCommand('docode-testresolver.startRemoteServer', async () => {
		const result = await docode.window.showInputBox({
			prompt: 'Enter the port for the remote server',
			value: '5000',
			validateInput: input => /^[\d]+$/.test(input) ? undefined : 'Not a valid number'
		});
		if (result) {
			runHTTPTestServer(Number.parseInt(result));
		}

	}));
	docode.commands.executeCommand('setContext', 'forwardedPortsViewEnabled', true);
}

type ActionItem = (docode.MessageItem & { execute: () => void });

function getActions(): ActionItem[] {
	const actions: ActionItem[] = [];
	const isDirty = docode.workspace.textDocuments.some(d => d.isDirty) || docode.workspace.workspaceFile && docode.workspace.workspaceFile.scheme === 'untitled';

	actions.push({
		title: 'Retry',
		execute: async () => {
			await docode.commands.executeCommand('workbench.action.reloadWindow');
		}
	});
	if (!isDirty) {
		actions.push({
			title: 'Close Remote',
			execute: async () => {
				await docode.commands.executeCommand('docode.newWindow', { reuseWindow: true, remoteAuthority: null });
			}
		});
	}
	actions.push({
		title: 'Ignore',
		isCloseAffordance: true,
		execute: async () => {
			docode.commands.executeCommand('docode-testresolver.showLog'); // no need to wait
		}
	});
	return actions;
}

export interface IProductConfiguration {
	updateUrl: string;
	commit: string;
	quality: string;
	dataFolderName: string;
	serverApplicationName?: string;
	serverDataFolderName?: string;
}

function getProductConfiguration(): IProductConfiguration {
	const content = fs.readFileSync(path.join(docode.env.appRoot, 'product.json')).toString();
	return JSON.parse(content) as IProductConfiguration;
}

function getNewEnv(): { [x: string]: string | undefined } {
	const env = { ...process.env };
	delete env['ELECTRON_RUN_AS_NODE'];
	return env;
}

function sleep(ms: number): Promise<void> {
	return new Promise(resolve => {
		setTimeout(resolve, ms);
	});
}

function getConfiguration<T>(id: string): T | undefined {
	return docode.workspace.getConfiguration('testresolver').get<T>(id);
}

const remoteServers: number[] = [];

async function showCandidatePort(_host: string, port: number, _detail: string): Promise<boolean> {
	return remoteServers.includes(port) || port === 100;
}

async function tunnelFactory(tunnelOptions: docode.TunnelOptions, tunnelCreationOptions: docode.TunnelCreationOptions): Promise<docode.Tunnel> {
	outputChannel.appendLine(`Tunnel factory request: Remote ${tunnelOptions.remoteAddress.port} -> local ${tunnelOptions.localAddressPort}`);
	if (tunnelCreationOptions.elevationRequired) {
		await docode.window.showInformationMessage('This is a fake elevation message. A real resolver would show a native elevation prompt.', { modal: true }, 'Ok');
	}

	return createTunnelService();

	function newTunnel(localAddress: { host: string; port: number }): docode.Tunnel {
		const onDidDispose: docode.EventEmitter<void> = new docode.EventEmitter();
		let isDisposed = false;
		return {
			localAddress,
			remoteAddress: tunnelOptions.remoteAddress,
			public: !!docode.workspace.getConfiguration('testresolver').get('supportPublicPorts') && tunnelOptions.public,
			privacy: tunnelOptions.privacy,
			protocol: tunnelOptions.protocol,
			onDidDispose: onDidDispose.event,
			dispose: () => {
				if (!isDisposed) {
					isDisposed = true;
					onDidDispose.fire();
				}
			}
		};
	}

	function createTunnelService(): Promise<docode.Tunnel> {
		return new Promise<docode.Tunnel>((res, rej) => {
			const proxyServer = net.createServer(proxySocket => {
				const remoteSocket = net.createConnection({ host: tunnelOptions.remoteAddress.host, port: tunnelOptions.remoteAddress.port });
				remoteSocket.pipe(proxySocket);
				proxySocket.pipe(remoteSocket);
			});
			let localPort = 0;

			if (tunnelOptions.localAddressPort) {
				// When the tunnelOptions include a localAddressPort, we should use that.
				// However, the test resolver all runs on one machine, so if the localAddressPort is the same as the remote port,
				// then we must use a different port number.
				localPort = tunnelOptions.localAddressPort;
			} else {
				localPort = tunnelOptions.remoteAddress.port;
			}

			if (localPort === tunnelOptions.remoteAddress.port) {
				// The adjacent port may be occupied or excluded by Windows. Let the OS pick a free port.
				localPort = 0;
			}

			// The test resolver can't actually handle privileged ports, it only pretends to.
			if (localPort < 1024 && process.platform !== 'win32') {
				localPort = 0;
			}
			proxyServer.once('error', rej);
			proxyServer.listen(localPort, '127.0.0.1', () => {
				proxyServer.off('error', rej);
				const localPort = (<net.AddressInfo>proxyServer.address()).port;
				outputChannel.appendLine(`New test resolver tunnel service: Remote ${tunnelOptions.remoteAddress.port} -> local ${localPort}`);
				const tunnel = newTunnel({ host: '127.0.0.1', port: localPort });
				tunnel.onDidDispose(() => proxyServer.close());
				res(tunnel);
			});
		});
	}
}

function runHTTPTestServer(port: number): docode.Disposable {
	const server = http.createServer((_req, res) => {
		res.writeHead(200);
		res.end(`Hello, World from test server running on port ${port}!`);
	});
	remoteServers.push(port);
	server.listen(port, '127.0.0.1');
	const message = `Opened HTTP server on http://127.0.0.1:${port}`;
	console.log(message);
	outputChannel.appendLine(message);
	return {
		dispose: () => {
			server.close();
			const index = remoteServers.indexOf(port);
			if (index !== -1) {
				remoteServers.splice(index, 1);
			}
		}
	};
}
