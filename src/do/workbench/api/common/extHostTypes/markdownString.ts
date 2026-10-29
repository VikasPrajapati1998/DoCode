/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as docode from 'docode';
import { MarkdownString as BaseMarkdownString, MarkdownStringTrustedOptions } from '../../../../base/common/htmlContent.js';
import { es5ClassCompat } from './es5ClassCompat.js';

@es5ClassCompat
export class MarkdownString implements docode.MarkdownString {

	readonly #delegate: BaseMarkdownString;

	static isMarkdownString(thing: unknown): thing is docode.MarkdownString {
		if (thing instanceof MarkdownString) {
			return true;
		}
		if (!thing || typeof thing !== 'object') {
			return false;
		}
		return (thing as docode.MarkdownString).appendCodeblock && (thing as docode.MarkdownString).appendMarkdown && (thing as docode.MarkdownString).appendText && ((thing as docode.MarkdownString).value !== undefined);
	}

	constructor(value?: string, supportThemeIcons: boolean = false) {
		this.#delegate = new BaseMarkdownString(value, { supportThemeIcons });
	}

	get value(): string {
		return this.#delegate.value;
	}
	set value(value: string) {
		this.#delegate.value = value;
	}

	get isTrusted(): boolean | MarkdownStringTrustedOptions | undefined {
		return this.#delegate.isTrusted;
	}

	set isTrusted(value: boolean | MarkdownStringTrustedOptions | undefined) {
		this.#delegate.isTrusted = value;
	}

	get supportThemeIcons(): boolean | undefined {
		return this.#delegate.supportThemeIcons;
	}

	set supportThemeIcons(value: boolean | undefined) {
		this.#delegate.supportThemeIcons = value;
	}

	get supportHtml(): boolean | undefined {
		return this.#delegate.supportHtml;
	}

	set supportHtml(value: boolean | undefined) {
		this.#delegate.supportHtml = value;
	}

	get supportAlertSyntax(): boolean | undefined {
		return this.#delegate.supportAlertSyntax;
	}

	set supportAlertSyntax(value: boolean | undefined) {
		this.#delegate.supportAlertSyntax = value;
	}

	get baseUri(): docode.Uri | undefined {
		return this.#delegate.baseUri;
	}

	set baseUri(value: docode.Uri | undefined) {
		this.#delegate.baseUri = value;
	}

	appendText(value: string): docode.MarkdownString {
		this.#delegate.appendText(value);
		return this;
	}

	appendMarkdown(value: string): docode.MarkdownString {
		this.#delegate.appendMarkdown(value);
		return this;
	}

	appendCodeblock(value: string, language?: string): docode.MarkdownString {
		this.#delegate.appendCodeblock(language ?? '', value);
		return this;
	}
}
