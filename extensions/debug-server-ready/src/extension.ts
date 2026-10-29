/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as docode from 'docode';
import * as util from 'util';
import { randomUUID } from 'crypto';

const PATTERN = 'listening on.* (https?://\\S+|[0-9]+)'; // matches "listening on port 3000" or "Now listening on: https://localhost:5001"
const URI_PORT_FORMAT = 'http://localhost:%s';
const URI_FORMAT = '%s';
const WEB_ROOT = '${workspaceFolder}';

interface ServerReadyAction {
	pattern: string;
	action?: 'openExternally' | 'openIntegratedBrowser' | 'debugWithChrome' | 'debugWithEdge' | 'startDebugging';
	uriFormat?: string;
	webRoot?: string;
	name?: string;
	config?: docode.DebugConfiguration;
	killOnServerStop?: boolean;
}

// From src/do/base/common/strings.ts
const CSI_SEQUENCE = /(?:\x1b\[|\x9b)[=?>!]?[\d;:]*["$#'* ]?[a-zA-Z@^`{}|~]/;
const OSC_SEQUENCE = /(?:\x1b\]|\x9d).*?(?:\x1b\\|\x07|\x9c)/;
const ESC_SEQUENCE = /\x1b(?:[ #%\(\)\*\+\-\.\/]?[a-zA-Z0-9\|}~@])/;
const CONTROL_SEQUENCES = new RegExp('(?:' + [
	CSI_SEQUENCE.source,
	OSC_SEQUENCE.source,
	ESC_SEQUENCE.source,
].join('|') + ')', 'g');

/**
 * Froms do/base/common/strings.ts in core
 * @see https://github.com/microsoft/vscode/blob/22a2a0e833175c32a2005b977d7fbd355582e416/src/vs/base/common/strings.ts#L736
 */
function removeAnsiEscapeCodes(str: string): string {
	if (str) {
		str = str.replace(CONTROL_SEQUENCES, '');
	}

	return str;
}

class Trigger {
	private _fired = false;

	public get hasFired() {
		return this._fired;
	}

	public fire() {
		this._fired = true;
	}
}

class ServerReadyDetector extends docode.Disposable {

	private static detectors = new Map<docode.DebugSession, ServerReadyDetector>();
	private static terminalDataListener: docode.Disposable | undefined;

	private readonly stoppedEmitter = new docode.EventEmitter<void>();
	private readonly onDidSessionStop = this.stoppedEmitter.event;
	private readonly disposables = new Set<docode.Disposable>([]);
	private trigger: Trigger;
	private shellPid?: number;
	private regexp: RegExp;

	static start(session: docode.DebugSession): ServerReadyDetector | undefined {
		if (session.configuration.serverReadyAction) {
			let detector = ServerReadyDetector.detectors.get(session);
			if (!detector) {
				detector = new ServerReadyDetector(session);
				ServerReadyDetector.detectors.set(session, detector);
			}
			return detector;
		}
		return undefined;
	}

	static stop(session: docode.DebugSession): void {
		const detector = ServerReadyDetector.detectors.get(session);
		if (detector) {
			ServerReadyDetector.detectors.delete(session);
			detector.sessionStopped();
			detector.dispose();
		}
	}

	static rememberShellPid(session: docode.DebugSession, pid: number) {
		const detector = ServerReadyDetector.detectors.get(session);
		if (detector) {
			detector.shellPid = pid;
		}
	}

	static async startListeningTerminalData() {
		if (!this.terminalDataListener) {
			this.terminalDataListener = docode.window.onDidWriteTerminalData(async e => {

				// first find the detector with a matching pid
				const pid = await e.terminal.processId;
				const str = removeAnsiEscapeCodes(e.data);
				for (const [, detector] of this.detectors) {
					if (detector.shellPid === pid) {
						detector.detectPattern(str);
						return;
					}
				}

				// if none found, try all detectors until one matches
				for (const [, detector] of this.detectors) {
					if (detector.detectPattern(str)) {
						return;
					}
				}
			});
		}
	}

	private constructor(private session: docode.DebugSession) {
		super(() => this.internalDispose());

		// Re-used the triggered of the parent session, if one exists
		if (session.parentSession) {
			this.trigger = ServerReadyDetector.start(session.parentSession)?.trigger ?? new Trigger();
		} else {
			this.trigger = new Trigger();
		}

		this.regexp = new RegExp(session.configuration.serverReadyAction.pattern || PATTERN, 'i');
	}

	private internalDispose() {
		this.disposables.forEach(d => d.dispose());
		this.disposables.clear();
	}

	public sessionStopped() {
		this.stoppedEmitter.fire();
	}

	detectPattern(s: string): boolean {
		if (!this.trigger.hasFired) {
			const matches = this.regexp.exec(s);
			if (matches && matches.length >= 1) {
				this.openExternalWithString(this.session, matches.length > 1 ? matches[1] : '');
				this.trigger.fire();
				return true;
			}
		}
		return false;
	}

	private openExternalWithString(session: docode.DebugSession, captureString: string) {
		const args: ServerReadyAction = session.configuration.serverReadyAction;

		let uri;
		if (captureString === '') {
			// nothing captured by reg exp -> use the uriFormat as the target uri without substitution
			// verify that format does not contain '%s'
			const format = args.uriFormat || '';
			if (format.indexOf('%s') >= 0) {
				const errMsg = docode.l10n.t("Format uri ('{0}') uses a substitution placeholder but pattern did not capture anything.", format);
				docode.window.showErrorMessage(errMsg, { modal: true }).then(_ => undefined);
				return;
			}
			uri = format;
		} else {
			// if no uriFormat is specified guess the appropriate format based on the captureString
			const format = args.uriFormat || (/^[0-9]+$/.test(captureString) ? URI_PORT_FORMAT : URI_FORMAT);
			// verify that format only contains a single '%s'
			const s = format.split('%s');
			if (s.length !== 2) {
				const errMsg = docode.l10n.t("Format uri ('{0}') must contain exactly one substitution placeholder.", format);
				docode.window.showErrorMessage(errMsg, { modal: true }).then(_ => undefined);
				return;
			}
			uri = util.format(format, captureString);
		}

		this.openExternalWithUri(session, uri);
	}

	private async openExternalWithUri(session: docode.DebugSession, uri: string) {

		const args: ServerReadyAction = session.configuration.serverReadyAction;
		switch (args.action || 'openExternally') {

			case 'openExternally':
				await docode.env.openExternal(docode.Uri.parse(uri));
				break;

			case 'openIntegratedBrowser':
				docode.commands.executeCommand('workbench.action.browser.open', uri);
				break;

			case 'debugWithChrome':
				await this.debugWithBrowser('pwa-chrome', session, uri);
				break;

			case 'debugWithEdge':
				await this.debugWithBrowser('pwa-msedge', session, uri);
				break;

			case 'startDebugging':
				if (args.config) {
					await this.startDebugSession(session, args.config.name, args.config);
				} else {
					await this.startDebugSession(session, args.name || 'unspecified');
				}
				break;

			default:
				// not supported
				break;
		}
	}

	private async debugWithBrowser(type: string, session: docode.DebugSession, uri: string) {
		const args = session.configuration.serverReadyAction as ServerReadyAction;
		if (!args.killOnServerStop) {
			await this.startBrowserDebugSession(type, session, uri);
			return;
		}

		const trackerId = randomUUID();
		const cts = new docode.CancellationTokenSource();
		const newSessionPromise = this.catchStartedDebugSession(session => session.configuration._debugServerReadySessionId === trackerId, cts.token);

		if (!await this.startBrowserDebugSession(type, session, uri, trackerId)) {
			cts.cancel();
			cts.dispose();
			return;
		}

		const createdSession = await newSessionPromise;
		cts.dispose();

		if (!createdSession) {
			return;
		}

		const stopListener = this.onDidSessionStop(async () => {
			stopListener.dispose();
			this.disposables.delete(stopListener);
			await docode.debug.stopDebugging(createdSession);
		});
		this.disposables.add(stopListener);
	}

	private startBrowserDebugSession(type: string, session: docode.DebugSession, uri: string, trackerId?: string) {
		return docode.debug.startDebugging(session.workspaceFolder, {
			type,
			name: 'Browser Debug',
			request: 'launch',
			url: uri,
			webRoot: session.configuration.serverReadyAction.webRoot || WEB_ROOT,
			_debugServerReadySessionId: trackerId,
		});
	}

	/**
	 * Starts a debug session given a debug configuration name (saved in launch.json) or a debug configuration object.
	 *
	 * @param session The parent debugSession
	 * @param name The name of the configuration to launch. If config it set, it assumes it is the same as config.name.
	 * @param config [Optional] Instead of starting a debug session by debug configuration name, use a debug configuration object instead.
	 */
	private async startDebugSession(session: docode.DebugSession, name: string, config?: docode.DebugConfiguration) {
		const args = session.configuration.serverReadyAction as ServerReadyAction;
		if (!args.killOnServerStop) {
			await docode.debug.startDebugging(session.workspaceFolder, config ?? name);
			return;
		}

		const cts = new docode.CancellationTokenSource();
		const newSessionPromise = this.catchStartedDebugSession(x => x.name === name, cts.token);

		if (!await docode.debug.startDebugging(session.workspaceFolder, config ?? name)) {
			cts.cancel();
			cts.dispose();
			return;
		}

		const createdSession = await newSessionPromise;
		cts.dispose();

		if (!createdSession) {
			return;
		}

		const stopListener = this.onDidSessionStop(async () => {
			stopListener.dispose();
			this.disposables.delete(stopListener);
			await docode.debug.stopDebugging(createdSession);
		});
		this.disposables.add(stopListener);
	}

	private catchStartedDebugSession(predicate: (session: docode.DebugSession) => boolean, cancellationToken: docode.CancellationToken): Promise<docode.DebugSession | undefined> {
		return new Promise<docode.DebugSession | undefined>(_resolve => {
			const done = (value?: docode.DebugSession) => {
				listener.dispose();
				cancellationListener.dispose();
				this.disposables.delete(listener);
				this.disposables.delete(cancellationListener);
				_resolve(value);
			};

			const cancellationListener = cancellationToken.onCancellationRequested(done);
			const listener = docode.debug.onDidStartDebugSession(session => {
				if (predicate(session)) {
					done(session);
				}
			});

			// In case the debug session of interest was never caught anyhow.
			this.disposables.add(listener);
			this.disposables.add(cancellationListener);
		});
	}
}

export function activate(context: docode.ExtensionContext) {

	context.subscriptions.push(docode.debug.onDidStartDebugSession(session => {
		if (session.configuration.serverReadyAction) {
			const detector = ServerReadyDetector.start(session);
			if (detector) {
				ServerReadyDetector.startListeningTerminalData();
			}
		}
	}));

	context.subscriptions.push(docode.debug.onDidTerminateDebugSession(session => {
		ServerReadyDetector.stop(session);
	}));

	const trackers = new Set<string>();

	context.subscriptions.push(docode.debug.registerDebugConfigurationProvider('*', {
		resolveDebugConfigurationWithSubstitutedVariables(_folder: docode.WorkspaceFolder | undefined, debugConfiguration: docode.DebugConfiguration) {
			if (debugConfiguration.type && debugConfiguration.serverReadyAction) {
				if (!trackers.has(debugConfiguration.type)) {
					trackers.add(debugConfiguration.type);
					startTrackerForType(context, debugConfiguration.type);
				}
			}
			return debugConfiguration;
		}
	}));
}

function startTrackerForType(context: docode.ExtensionContext, type: string) {

	// scan debug console output for a PORT message
	context.subscriptions.push(docode.debug.registerDebugAdapterTrackerFactory(type, {
		createDebugAdapterTracker(session: docode.DebugSession) {
			const detector = ServerReadyDetector.start(session);
			if (detector) {
				let runInTerminalRequestSeq: number | undefined;
				return {
					onDidSendMessage: m => {
						if (m.type === 'event' && m.event === 'output' && m.body) {
							switch (m.body.category) {
								case 'console':
								case 'stderr':
								case 'stdout':
									if (m.body.output) {
										detector.detectPattern(m.body.output);
									}
									break;
								default:
									break;
							}
						}
						if (m.type === 'request' && m.command === 'runInTerminal' && m.arguments) {
							if (m.arguments.kind === 'integrated') {
								runInTerminalRequestSeq = m.seq; // remember this to find matching response
							}
						}
					},
					onWillReceiveMessage: m => {
						if (runInTerminalRequestSeq && m.type === 'response' && m.command === 'runInTerminal' && m.body && runInTerminalRequestSeq === m.request_seq) {
							runInTerminalRequestSeq = undefined;
							ServerReadyDetector.rememberShellPid(session, m.body.shellProcessId);
						}
					}
				};
			}
			return undefined;
		}
	}));
}
