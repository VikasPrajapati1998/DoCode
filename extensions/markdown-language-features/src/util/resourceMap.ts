/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as docode from 'docode';

type ResourceToKey = (uri: docode.Uri) => string;

const defaultResourceToKey = (resource: docode.Uri): string => resource.toString();

export class ResourceMap<T> {

	readonly #map = new Map<string, { readonly uri: docode.Uri; readonly value: T }>();

	readonly #toKey: ResourceToKey;

	constructor(toKey: ResourceToKey = defaultResourceToKey) {
		this.#toKey = toKey;
	}

	public set(uri: docode.Uri, value: T): this {
		this.#map.set(this.#toKey(uri), { uri, value });
		return this;
	}

	public get(resource: docode.Uri): T | undefined {
		return this.#map.get(this.#toKey(resource))?.value;
	}

	public has(resource: docode.Uri): boolean {
		return this.#map.has(this.#toKey(resource));
	}

	public get size(): number {
		return this.#map.size;
	}

	public clear(): void {
		this.#map.clear();
	}

	public delete(resource: docode.Uri): boolean {
		return this.#map.delete(this.#toKey(resource));
	}

	public *values(): IterableIterator<T> {
		for (const entry of this.#map.values()) {
			yield entry.value;
		}
	}

	public *keys(): IterableIterator<docode.Uri> {
		for (const entry of this.#map.values()) {
			yield entry.uri;
		}
	}

	public *entries(): IterableIterator<[docode.Uri, T]> {
		for (const entry of this.#map.values()) {
			yield [entry.uri, entry.value];
		}
	}

	public [Symbol.iterator](): IterableIterator<[docode.Uri, T]> {
		return this.entries();
	}
}
