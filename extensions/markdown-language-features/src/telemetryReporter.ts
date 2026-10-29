/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { default as DoCodeTelemetryReporter } from '@docode/extension-telemetry';
import * as docode from 'docode';

interface IPackageInfo {
	name: string;
	version: string;
	aiKey: string;
}

export interface TelemetryReporter {
	dispose(): void;
	sendTelemetryEvent(eventName: string, properties?: {
		[key: string]: string;
	}): void;
}

const nullReporter = new class NullTelemetryReporter implements TelemetryReporter {
	sendTelemetryEvent() { /** noop */ }
	dispose() { /** noop */ }
};

class ExtensionReporter implements TelemetryReporter {
	readonly #reporter: DoCodeTelemetryReporter;

	constructor(
		packageInfo: IPackageInfo
	) {
		this.#reporter = new DoCodeTelemetryReporter(packageInfo.aiKey);
	}
	sendTelemetryEvent(eventName: string, properties?: {
		[key: string]: string;
	}) {
		this.#reporter.sendTelemetryEvent(eventName, properties);
	}

	dispose() {
		this.#reporter.dispose();
	}
}

export function loadDefaultTelemetryReporter(): TelemetryReporter {
	const packageInfo = getPackageInfo();
	return packageInfo ? new ExtensionReporter(packageInfo) : nullReporter;
}

function getPackageInfo(): IPackageInfo | null {
	const extension = docode.extensions.getExtension('Microsoft.docode-markdown');
	if (extension?.packageJSON) {
		return {
			name: extension.packageJSON.name,
			version: extension.packageJSON.version,
			aiKey: extension.packageJSON.aiKey
		};
	}
	return null;
}
