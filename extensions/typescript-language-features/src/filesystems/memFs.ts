/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { basename, dirname } from 'path';
import * as docode from 'docode';
import { Logger } from '../logging/logger';

export class MemFs implements docode.FileSystemProvider {

	private readonly root = new FsDirectoryEntry(
		new Map(),
		0,
		0,
	);

	constructor(
		private readonly id: string,
		private readonly logger: Logger,
	) { }

	stat(uri: docode.Uri): docode.FileStat {
		this.logger.trace(`MemFs.stat ${this.id}. uri: ${uri}`);
		const entry = this.getEntry(uri);
		if (!entry) {
			throw docode.FileSystemError.FileNotFound();
		}

		return entry;
	}

	readDirectory(uri: docode.Uri): [string, docode.FileType][] {
		this.logger.trace(`MemFs.readDirectory ${this.id}. uri: ${uri}`);

		const entry = this.getEntry(uri);
		if (!entry) {
			throw docode.FileSystemError.FileNotFound();
		}
		if (!(entry instanceof FsDirectoryEntry)) {
			throw docode.FileSystemError.FileNotADirectory();
		}

		return Array.from(entry.contents.entries(), ([name, entry]) => [name, entry.type]);
	}

	readFile(uri: docode.Uri): Uint8Array {
		this.logger.trace(`MemFs.readFile ${this.id}. uri: ${uri}`);

		const entry = this.getEntry(uri);
		if (!entry) {
			throw docode.FileSystemError.FileNotFound();
		}

		if (!(entry instanceof FsFileEntry)) {
			throw docode.FileSystemError.FileIsADirectory(uri);
		}

		return entry.data;
	}

	writeFile(uri: docode.Uri, content: Uint8Array, { create, overwrite }: { create: boolean; overwrite: boolean }): void {
		this.logger.trace(`MemFs.writeFile ${this.id}. uri: ${uri}`);

		const dir = this.getParent(uri);

		const fileName = basename(uri.path);
		const dirContents = dir.contents;

		const time = Date.now() / 1000;
		const entry = dirContents.get(basename(uri.path));
		if (!entry) {
			if (create) {
				dirContents.set(fileName, new FsFileEntry(content, time, time));
				this._emitter.fire([{ type: docode.FileChangeType.Created, uri }]);
			} else {
				throw docode.FileSystemError.FileNotFound();
			}
		} else {
			if (entry instanceof FsDirectoryEntry) {
				throw docode.FileSystemError.FileIsADirectory(uri);
			}

			if (overwrite) {
				entry.mtime = time;
				entry.data = content;
				this._emitter.fire([{ type: docode.FileChangeType.Changed, uri }]);
			} else {
				throw docode.FileSystemError.NoPermissions('overwrite option was not passed in');
			}
		}
	}

	rename(_oldUri: docode.Uri, _newUri: docode.Uri, _options: { overwrite: boolean }): void {
		throw new Error('not implemented');
	}

	delete(uri: docode.Uri): void {
		try {
			const dir = this.getParent(uri);
			dir.contents.delete(basename(uri.path));
			this._emitter.fire([{ type: docode.FileChangeType.Deleted, uri }]);
		} catch (e) { }
	}

	createDirectory(uri: docode.Uri): void {
		this.logger.trace(`MemFs.createDirectory ${this.id}. uri: ${uri}`);

		const dir = this.getParent(uri);
		const now = Date.now() / 1000;
		dir.contents.set(basename(uri.path), new FsDirectoryEntry(new Map(), now, now));
	}

	private getEntry(uri: docode.Uri): FsEntry | undefined {
		// TODO: have this throw FileNotFound itself?
		// TODO: support configuring case sensitivity
		let node: FsEntry = this.root;
		for (const component of uri.path.split('/')) {
			if (!component) {
				// Skip empty components (root, stuff between double slashes,
				// trailing slashes)
				continue;
			}

			if (!(node instanceof FsDirectoryEntry)) {
				// We're looking at a File or such, so bail.
				return;
			}

			const next = node.contents.get(component);
			if (!next) {
				// not found!
				return;
			}

			node = next;
		}
		return node;
	}

	private getParent(uri: docode.Uri): FsDirectoryEntry {
		const dir = this.getEntry(uri.with({ path: dirname(uri.path) }));
		if (!dir) {
			throw docode.FileSystemError.FileNotFound();
		}
		if (!(dir instanceof FsDirectoryEntry)) {
			throw docode.FileSystemError.FileNotADirectory();
		}
		return dir;
	}

	// --- manage file events

	private readonly _emitter = new docode.EventEmitter<docode.FileChangeEvent[]>();

	readonly onDidChangeFile: docode.Event<docode.FileChangeEvent[]> = this._emitter.event;
	private readonly watchers = new Map<string, Set<Symbol>>;

	watch(resource: docode.Uri): docode.Disposable {
		if (!this.watchers.has(resource.path)) {
			this.watchers.set(resource.path, new Set());
		}
		const sy = Symbol(resource.path);
		return new docode.Disposable(() => {
			const watcher = this.watchers.get(resource.path);
			if (watcher) {
				watcher.delete(sy);
				if (!watcher.size) {
					this.watchers.delete(resource.path);
				}
			}
		});
	}
}

class FsFileEntry {
	readonly type = docode.FileType.File;

	get size(): number {
		return this.data.length;
	}

	constructor(
		public data: Uint8Array,
		public readonly ctime: number,
		public mtime: number,
	) { }
}

class FsDirectoryEntry {
	readonly type = docode.FileType.Directory;

	get size(): number {
		return [...this.contents.values()].reduce((acc: number, entry: FsEntry) => acc + entry.size, 0);
	}

	constructor(
		public readonly contents: Map<string, FsEntry>,
		public readonly ctime: number,
		public readonly mtime: number,
	) { }
}

type FsEntry = FsFileEntry | FsDirectoryEntry;
