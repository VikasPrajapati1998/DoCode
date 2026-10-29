/*---------------------------------------------------------------------------------------------
 *  Copyright (c) DoCode contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

// @ts-check
'use strict';

const docode = require('docode');
const path = require('path');

const TERMINAL_NAME = 'DoCode Runner';
const isWindows = process.platform === 'win32';

/** Default run command per language id. `${...}` placeholders are expanded in `expand`. */
const defaultExecutors = {
	javascript: 'node ${file}',
	typescript: 'npx --yes tsx ${file}',
	python: isWindows ? 'python -u ${file}' : 'python3 -u ${file}',
	java: 'java ${file}',
	c: isWindows
		? 'gcc ${file} -o ${fileBaseName}.exe && ${fileBaseName}.exe'
		: 'gcc ${file} -o ${fileBaseName} && ./${fileBaseName}',
	cpp: isWindows
		? 'g++ ${file} -o ${fileBaseName}.exe && ${fileBaseName}.exe'
		: 'g++ ${file} -o ${fileBaseName} && ./${fileBaseName}',
	go: 'go run ${file}',
	rust: isWindows
		? 'rustc ${file} -o ${fileBaseName}.exe && ${fileBaseName}.exe'
		: 'rustc ${file} -o ${fileBaseName} && ./${fileBaseName}',
	php: 'php ${file}',
	ruby: 'ruby ${file}',
	perl: 'perl ${file}',
	lua: 'lua ${file}',
	r: 'Rscript ${file}',
	julia: 'julia ${file}',
	dart: 'dart run ${file}',
	swift: 'swift ${file}',
	groovy: 'groovy ${file}',
	coffeescript: 'coffee ${file}',
	shellscript: 'bash ${file}',
	powershell: 'powershell -ExecutionPolicy Bypass -File ${file}',
	bat: 'cmd /c ${file}',
	fsharp: 'dotnet fsi ${file}',
	clojure: 'clojure -M ${file}',
};

/** @type {docode.Terminal | undefined} */
let runnerTerminal;

/**
 * @param {string} value
 * @returns {string}
 */
function quote(value) {
	return `"${value.replace(/"/g, '\\"')}"`;
}

/**
 * Expands the `${file}`, `${fileName}`, `${fileBaseName}` and `${dir}` placeholders.
 * @param {string} template
 * @param {string} fsPath
 * @returns {string}
 */
function expand(template, fsPath) {
	const fileName = path.basename(fsPath);
	return template
		.replace(/\$\{file\}/g, quote(fsPath))
		.replace(/\$\{fileName\}/g, quote(fileName))
		.replace(/\$\{fileBaseName\}/g, path.parse(fileName).name)
		.replace(/\$\{dir\}/g, quote(path.dirname(fsPath)));
}

/**
 * @returns {docode.Terminal}
 */
function getTerminal(cwd) {
	if (!runnerTerminal || runnerTerminal.exitStatus !== undefined) {
		runnerTerminal = docode.window.createTerminal({ name: TERMINAL_NAME, cwd });
	}
	return runnerTerminal;
}

async function run() {
	const editor = docode.window.activeTextEditor;
	if (!editor) {
		docode.window.showWarningMessage('DoCode Runner: open a file to run.');
		return;
	}
	const document = editor.document;
	const config = docode.workspace.getConfiguration('docodeRunner');

	if (document.isUntitled) {
		if (!(await document.save())) {
			return;
		}
	} else if (config.get('saveBeforeRun', true) && document.isDirty) {
		await document.save();
	}
	if (document.uri.scheme !== 'file') {
		docode.window.showWarningMessage('DoCode Runner can only run files on disk.');
		return;
	}

	const executors = { ...defaultExecutors, ...config.get('executorMap', {}) };
	const template = executors[document.languageId];
	if (!template) {
		docode.window.showWarningMessage(
			`DoCode Runner: no command for language "${document.languageId}". Add one in the "docodeRunner.executorMap" setting.`);
		return;
	}

	const fsPath = document.uri.fsPath;
	const cwd = config.get('runInFileDirectory', true)
		? path.dirname(fsPath)
		: docode.workspace.getWorkspaceFolder(document.uri)?.uri.fsPath ?? path.dirname(fsPath);

	const terminal = getTerminal(cwd);
	terminal.show(true);
	if (config.get('clearTerminal', true)) {
		await docode.commands.executeCommand('workbench.action.terminal.clear');
	}
	terminal.sendText(`cd ${quote(cwd)}`);
	terminal.sendText(expand(template, fsPath));
}

function stop() {
	if (runnerTerminal && runnerTerminal.exitStatus === undefined) {
		runnerTerminal.sendText('\u0003', false); // Ctrl+C
	}
}

/**
 * @param {docode.ExtensionContext} context
 */
function activate(context) {
	context.subscriptions.push(
		docode.commands.registerCommand('docode-runner.run', run),
		docode.commands.registerCommand('docode-runner.stop', stop),
		docode.window.onDidCloseTerminal(terminal => {
			if (terminal === runnerTerminal) {
				runnerTerminal = undefined;
			}
		}),
	);
}

function deactivate() {
	runnerTerminal = undefined;
}

module.exports = { activate, deactivate };
