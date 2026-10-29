/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Per-(docode-platform, arch) dictation-runtime producer. On publish builds it
 * assembles + uploads this target's tarball to the CDN, and on ANY pipeline
 * build it writes a small JSON results file that the gulpfile-side `packageTask`
 * reads to stamp `product.json`'s `dictationRuntime` field.
 *
 * Run as a CI step BEFORE the gulp packaging step on the same agent.
 *
 * Two independent axes:
 *
 *   - STAMP (`product.dictationRuntime = {version, urlTemplate}`): written for
 *     every build that can host dictation (`shouldStampRuntime`), regardless of
 *     `DOCODE_PUBLISH`. The stamp is target-agnostic (the runtime resolves
 *     `{target}` per launch), so packaged non-publish builds — whose native
 *     payload is stripped at packaging time — still get a usable CDN source, and
 *     the Universal macOS x64 slice carries the same config as its arm64 sibling.
 *     Only local dev-from-source (which never runs this script) ships without the
 *     stamp and falls back to the SDK's `node_modules` payload.
 *
 *   - PAYLOAD (the `<target>.tgz` on the CDN): built + uploaded only on publish
 *     runs (`DOCODE_PUBLISH=true`) and only for a build whose `(platform, arch)`
 *     has a real target (so `darwin-x64` stamps but uploads nothing — the
 *     `darwin-arm64` job publishes the shared Apple Silicon payload). Upload is
 *     idempotent (HEAD-then-decide), so re-runs and the once-per-version nature
 *     of the stamped URL stay consistent.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
	buildCdnUrlTemplate,
	getRuntimeTargetForBuild,
	getRuntimeVersion,
	type IDictationRuntimeResult,
	KNOWN_DOCODE_PLATFORMS,
	parseFlags,
	shouldStampRuntime,
} from './common.ts';
import { buildOne } from './package.ts';
import { uploadOne } from './upload.ts';

const SCRIPT = 'produce.ts';

interface IProduceArgs {
	readonly docodePlatform: string;
	readonly arch: string;
	readonly tarballsDir: string;
	readonly resultsFile: string;
	readonly upload: boolean;
}

async function main(): Promise<void> {
	const args = parseArgs();
	fs.mkdirSync(args.tarballsDir, { recursive: true });

	const version = getRuntimeVersion();
	const target = getRuntimeTargetForBuild(args.docodePlatform, args.arch);

	// PAYLOAD: build + upload this target's tarball on publish runs only.
	if (args.upload && target) {
		console.log(`[${SCRIPT}] producing payload for ${args.docodePlatform}/${args.arch} → ${target}`);
		const built = await buildOne({ target, outDir: args.tarballsDir });
		await uploadOne({ version: built.version, target, tgzPath: built.tgzPath, sha256: built.sha256 });
		console.log(`##vso[task.setvariable variable=DICTATION_RUNTIME_TARBALLS_PRODUCED]true`);
	} else if (target) {
		console.log(`[${SCRIPT}] upload=false — skipping payload build/upload for ${target} (publish-only).`);
	} else {
		console.log(`[${SCRIPT}] no CDN payload for ${args.docodePlatform}/${args.arch} (not a supported target).`);
	}

	// STAMP: written on every pipeline build that can host dictation, publish or
	// not — the stamp is target-agnostic and packaged builds have no other source.
	if (!shouldStampRuntime(args.docodePlatform, args.arch)) {
		console.log(`[${SCRIPT}] ${args.docodePlatform}/${args.arch} cannot host dictation; product.json ships without dictationRuntime.`);
		return;
	}

	const result: IDictationRuntimeResult = { version, urlTemplate: buildCdnUrlTemplate(version) };
	fs.mkdirSync(path.dirname(args.resultsFile), { recursive: true });
	fs.writeFileSync(args.resultsFile, JSON.stringify(result, null, 2) + '\n');
	console.log(`[${SCRIPT}] Wrote dictationRuntime entry to ${args.resultsFile}`);

	// Tell Azure Pipelines: subsequent steps in this job see
	// DICTATION_RUNTIME_RESULTS_FILE in their env (auto-injected from the variable).
	console.log(`##vso[task.setvariable variable=DICTATION_RUNTIME_RESULTS_FILE]${args.resultsFile}`);
}

function parseArgs(): IProduceArgs {
	const flags = parseFlags(process.argv.slice(2));
	const docodePlatform = flags.get('docode-platform');
	if (!docodePlatform || !KNOWN_DOCODE_PLATFORMS.has(docodePlatform)) {
		throw new Error(`--docode-platform must be one of ${[...KNOWN_DOCODE_PLATFORMS].join(', ')}; got '${docodePlatform}'`);
	}
	const arch = flags.get('arch');
	if (!arch) {
		throw new Error('--arch=<arch> is required');
	}
	// Fail loud on a bad pin before doing any work.
	getRuntimeVersion();

	const tarballsDir = path.resolve(process.cwd(), '.build', 'dictation-runtime', 'tarballs');
	const resultsFile = process.env.DICTATION_RUNTIME_RESULTS_FILE
		?? path.resolve(process.cwd(), '.build', 'dictation-runtime', `${docodePlatform}-${arch}.json`);
	const upload = (process.env.DOCODE_PUBLISH ?? '').toLowerCase() === 'true';
	return { docodePlatform, arch, tarballsDir, resultsFile, upload };
}

main().catch(err => {
	console.error(err);
	process.exit(1);
});
