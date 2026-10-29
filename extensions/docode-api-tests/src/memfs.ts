/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import * as path from 'path';
import * as docode from 'docode';

class File implements docode.FileStat {

	type: docode.FileType;
	ctime: number;
	mtime: number;
	size: number;

	name: string;
	data?: Uint8Array;

	constructor(name: string) {
		this.type = docode.FileType.File;
		this.ctime = Date.now();
		this.mtime = Date.now();
		this.size = 0;
		this.name = name;
	}
}

class Directory implements docode.FileStat {

	type: docode.FileType;
	ctime: number;
	mtime: number;
	size: number;

	name: string;
	entries: Map<string, File | Directory>;

	constructor(name: string) {
		this.type = docode.FileType.Directory;
		this.ctime = Date.now();
		this.mtime = Date.now();
		this.size = 0;
		this.name = name;
		this.entries = new Map();
	}
}

export type Entry = File | Directory;

export class TestFS implements docode.FileSystemProvider {

	constructor(
		readonly scheme: string,
		readonly isCaseSensitive: boolean
	) { }

	readonly root = new Directory('');

	// --- manage file metadata

	stat(uri: docode.Uri): docode.FileStat {
		return this._lookup(uri, false);
	}

	readDirectory(uri: docode.Uri): [string, docode.FileType][] {
		const entry = this._lookupAsDirectory(uri, false);
		const result: [string, docode.FileType][] = [];
		for (const [name, child] of entry.entries) {
			result.push([name, child.type]);
		}
		return result;
	}

	// --- manage file contents

	readFile(uri: docode.Uri): Uint8Array {
		const data = this._lookupAsFile(uri, false).data;
		if (data) {
			return data;
		}
		throw docode.FileSystemError.FileNotFound();
	}

	writeFile(uri: docode.Uri, content: Uint8Array, options: { create: boolean; overwrite: boolean }): void {
		const basename = path.posix.basename(uri.path);
		const parent = this._lookupParentDirectory(uri);
		let entry = parent.entries.get(basename);
		if (entry instanceof Directory) {
			throw docode.FileSystemError.FileIsADirectory(uri);
		}
		if (!entry && !options.create) {
			throw docode.FileSystemError.FileNotFound(uri);
		}
		if (entry && options.create && !options.overwrite) {
			throw docode.FileSystemError.FileExists(uri);
		}
		if (!entry) {
			entry = new File(basename);
			parent.entries.set(basename, entry);
			this._fireSoon({ type: docode.FileChangeType.Created, uri });
		}
		entry.mtime = Date.now();
		entry.size = content.byteLength;
		entry.data = content;

		this._fireSoon({ type: docode.FileChangeType.Changed, uri });
	}

	// --- manage files/folders

	rename(oldUri: docode.Uri, newUri: docode.Uri, options: { overwrite: boolean }): void {

		if (!options.overwrite && this._lookup(newUri, true)) {
			throw docode.FileSystemError.FileExists(newUri);
		}

		const entry = this._lookup(oldUri, false);
		const oldParent = this._lookupParentDirectory(oldUri);

		const newParent = this._lookupParentDirectory(newUri);
		const newName = path.posix.basename(newUri.path);

		oldParent.entries.delete(entry.name);
		entry.name = newName;
		newParent.entries.set(newName, entry);

		this._fireSoon(
			{ type: docode.FileChangeType.Deleted, uri: oldUri },
			{ type: docode.FileChangeType.Created, uri: newUri }
		);
	}

	delete(uri: docode.Uri): void {
		const dirname = uri.with({ path: path.posix.dirname(uri.path) });
		const basename = path.posix.basename(uri.path);
		const parent = this._lookupAsDirectory(dirname, false);
		if (!parent.entries.has(basename)) {
			throw docode.FileSystemError.FileNotFound(uri);
		}
		parent.entries.delete(basename);
		parent.mtime = Date.now();
		parent.size -= 1;
		this._fireSoon({ type: docode.FileChangeType.Changed, uri: dirname }, { uri, type: docode.FileChangeType.Deleted });
	}

	createDirectory(uri: docode.Uri): void {
		const basename = path.posix.basename(uri.path);
		const dirname = uri.with({ path: path.posix.dirname(uri.path) });
		const parent = this._lookupAsDirectory(dirname, false);

		const entry = new Directory(basename);
		parent.entries.set(entry.name, entry);
		parent.mtime = Date.now();
		parent.size += 1;
		this._fireSoon({ type: docode.FileChangeType.Changed, uri: dirname }, { type: docode.FileChangeType.Created, uri });
	}

	// --- lookup

	private _lookup(uri: docode.Uri, silent: false): Entry;
	private _lookup(uri: docode.Uri, silent: boolean): Entry | undefined;
	private _lookup(uri: docode.Uri, silent: boolean): Entry | undefined {
		const parts = uri.path.split('/');
		let entry: Entry = this.root;
		for (const part of parts) {
			const partLow = part.toLowerCase();
			if (!part) {
				continue;
			}
			let child: Entry | undefined;
			if (entry instanceof Directory) {
				if (this.isCaseSensitive) {
					child = entry.entries.get(part);
				} else {
					for (const [key, value] of entry.entries) {
						if (key.toLowerCase() === partLow) {
							child = value;
							break;
						}
					}
				}
			}
			if (!child) {
				if (!silent) {
					throw docode.FileSystemError.FileNotFound(uri);
				} else {
					return undefined;
				}
			}
			entry = child;
		}
		return entry;
	}

	private _lookupAsDirectory(uri: docode.Uri, silent: boolean): Directory {
		const entry = this._lookup(uri, silent);
		if (entry instanceof Directory) {
			return entry;
		}
		throw docode.FileSystemError.FileNotADirectory(uri);
	}

	private _lookupAsFile(uri: docode.Uri, silent: boolean): File {
		const entry = this._lookup(uri, silent);
		if (entry instanceof File) {
			return entry;
		}
		throw docode.FileSystemError.FileIsADirectory(uri);
	}

	private _lookupParentDirectory(uri: docode.Uri): Directory {
		const dirname = uri.with({ path: path.posix.dirname(uri.path) });
		return this._lookupAsDirectory(dirname, false);
	}

	// --- manage file events

	private _emitter = new docode.EventEmitter<docode.FileChangeEvent[]>();
	private _bufferedEvents: docode.FileChangeEvent[] = [];
	private _fireSoonHandle?: NodeJS.Timeout;

	readonly onDidChangeFile: docode.Event<docode.FileChangeEvent[]> = this._emitter.event;

	watch(_resource: docode.Uri, _options: { recursive: boolean; excludes: string[] }): docode.Disposable {
		// ignore, fires for all changes...
		return new docode.Disposable(() => { });
	}

	private _fireSoon(...events: docode.FileChangeEvent[]): void {
		this._bufferedEvents.push(...events);

		if (this._fireSoonHandle) {
			clearTimeout(this._fireSoonHandle);
		}

		this._fireSoonHandle = setTimeout(() => {
			this._emitter.fire(this._bufferedEvents);
			this._bufferedEvents.length = 0;
		}, 5);
	}
}
