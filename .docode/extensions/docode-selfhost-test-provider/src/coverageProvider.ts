/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IstanbulCoverageContext } from 'istanbul-to-docode';
import * as docode from 'docode';
import { SearchStrategy, SourceLocationMapper, SourceMapStore } from './testOutputScanner';
import { IScriptCoverage, OffsetToPosition, RangeCoverageTracker } from './v8CoverageWrangling';

export const istanbulCoverageContext = new IstanbulCoverageContext();

/**
 * Tracks coverage in per-script coverage mode. There are two modes of coverage
 * in this extension: generic istanbul reports, and reports from the runtime
 * sent before and after each test case executes. This handles the latter.
 */
export class PerTestCoverageTracker {
	private readonly scripts = new Map</* script ID */ string, Script>();

	constructor(private readonly maps: SourceMapStore) { }

	public add(coverage: IScriptCoverage, test?: docode.TestItem) {
		const script = this.scripts.get(coverage.scriptId);
		if (script) {
			return script.add(coverage, test);
		}
		// ignore internals and node_modules
		if (!coverage.url.startsWith('file://') || coverage.url.includes('node_modules')) {
			return;
		}
		if (!coverage.source) {
			throw new Error('expected to have source the first time a script is seen');
		}

		const src = new Script(docode.Uri.parse(coverage.url), coverage.source, this.maps);
		this.scripts.set(coverage.scriptId, src);
		src.add(coverage, test);
	}

	public async report(run: docode.TestRun) {
		await Promise.all(Array.from(this.scripts.values()).map(s => s.report(run)));
	}
}

class Script {
	private converter: OffsetToPosition;

	/** Tracking the overall coverage for the file */
	private overall = new ScriptCoverageTracker();
	/** Range tracking per-test item */
	private readonly perItem = new Map<docode.TestItem, ScriptCoverageTracker>();

	constructor(
		public readonly uri: docode.Uri,
		source: string,
		private readonly maps: SourceMapStore
	) {
		this.converter = new OffsetToPosition(source);
	}

	public add(coverage: IScriptCoverage, test?: docode.TestItem) {
		this.overall.add(coverage);
		if (test) {
			const p = new ScriptCoverageTracker();
			p.add(coverage);
			this.perItem.set(test, p);
		}
	}

	public async report(run: docode.TestRun) {
		const mapper = await this.maps.getSourceLocationMapper(this.uri.toString());
		const originalUri = (await this.maps.getSourceFile(this.uri.toString())) || this.uri;
		run.addCoverage(this.overall.report(originalUri, this.converter, mapper, this.perItem));
	}
}

class ScriptCoverageTracker {
	private coverage = new RangeCoverageTracker();

	public add(coverage: IScriptCoverage) {
		for (const range of RangeCoverageTracker.initializeBlocks(coverage.functions)) {
			this.coverage.setCovered(range.start, range.end, range.covered);
		}
	}

	public *toDetails(
		uri: docode.Uri,
		convert: OffsetToPosition,
		mapper: SourceLocationMapper | undefined,
	) {
		for (const range of this.coverage) {
			if (range.start === range.end) {
				continue;
			}

			const startCov = convert.toLineColumn(range.start);
			let start = new docode.Position(startCov.line, startCov.column);

			const endCov = convert.toLineColumn(range.end);
			let end = new docode.Position(endCov.line, endCov.column);
			if (mapper) {
				const startMap = mapper(start.line, start.character, SearchStrategy.FirstAfter);
				const endMap = startMap && mapper(end.line, end.character, SearchStrategy.FirstBefore);
				if (!endMap || uri.toString().toLowerCase() !== endMap.uri.toString().toLowerCase()) {
					continue;
				}
				start = startMap.range.start;
				end = endMap.range.end;
			}

			for (let i = start.line; i <= end.line; i++) {
				yield new docode.StatementCoverage(
					range.covered,
					new docode.Range(
						new docode.Position(i, i === start.line ? start.character : 0),
						new docode.Position(i, i === end.line ? end.character : Number.MAX_SAFE_INTEGER)
					)
				);
			}
		}
	}

	/**
	 * Generates the script's coverage for the test run.
	 *
	 * If a source location mapper is given, it assumes the `uri` is the mapped
	 * URI, and that any unmapped locations/outside the URI should be ignored.
	 */
	public report(
		uri: docode.Uri,
		convert: OffsetToPosition,
		mapper: SourceLocationMapper | undefined,
		items: Map<docode.TestItem, ScriptCoverageTracker>,
	): V8CoverageFile {
		const file = new V8CoverageFile(uri, items, convert, mapper);
		for (const detail of this.toDetails(uri, convert, mapper)) {
			file.add(detail);
		}

		return file;
	}
}

export class V8CoverageFile extends docode.FileCoverage {
	public details: docode.StatementCoverage[] = [];

	constructor(
		uri: docode.Uri,
		private readonly perTest: Map<docode.TestItem, ScriptCoverageTracker>,
		private readonly convert: OffsetToPosition,
		private readonly mapper: SourceLocationMapper | undefined,
	) {
		super(uri, { covered: 0, total: 0 }, undefined, undefined, [...perTest.keys()]);
	}

	public add(detail: docode.StatementCoverage) {
		this.details.push(detail);
		this.statementCoverage.total++;
		if (detail.executed) {
			this.statementCoverage.covered++;
		}
	}

	public testDetails(test: docode.TestItem): docode.FileCoverageDetail[] {
		const t = this.perTest.get(test);
		return t ? [...t.toDetails(this.uri, this.convert, this.mapper)] : [];
	}
}
