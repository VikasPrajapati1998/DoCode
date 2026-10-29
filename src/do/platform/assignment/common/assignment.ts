/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import * as platform from '../../../base/common/platform.js';
import type { IExperimentationFilterProvider } from 'tas-client';

export const ASSIGNMENT_STORAGE_KEY = 'DoCode.ABExp.FeatureData';
export const ASSIGNMENT_REFETCH_INTERVAL = 60 * 60 * 1000; // 1 hour

export interface IAssignmentService {
	readonly _serviceBrand: undefined;

	readonly onDidRefetchAssignments: Event<void>;
	getTreatment<T extends string | number | boolean>(name: string): Promise<T | undefined>;
}

export enum TargetPopulation {
	Insiders = 'insider',
	Public = 'public',
	Exploration = 'exploration'
}

/*
Based upon the official DoCode currently existing filters in the
ExP backend for the DoCode cluster.
https://experimentation.visualstudio.com/Analysis%20and%20Experimentation/_git/AnE.ExP.TAS.TachyonHost.Configuration?path=%2FConfigurations%2Fvscode%2Fvscode.json&version=GBmaster
"X-MSEdge-Market": "detection.market",
"X-FD-Corpnet": "detection.corpnet",
"X-DoCode-AppVersion": "appversion",
"X-DoCode-Build": "build",
"X-MSEdge-ClientId": "clientid",
"X-DoCode-ExtensionName": "extensionname",
"X-DoCode-ExtensionVersion": "extensionversion",
"X-DoCode-TargetPopulation": "targetpopulation",
"X-DoCode-Language": "language",
"X-DoCode-Platform": "platform",
"X-DoCode-ReleaseDate": "releasedate",
"X-DoCode-WindowKind": "windowkind"
*/
export enum Filters {
	/**
	 * The market in which the extension is distributed.
	 */
	Market = 'X-MSEdge-Market',

	/**
	 * The corporation network.
	 */
	CorpNet = 'X-FD-Corpnet',

	/**
	 * Version of the application which uses experimentation service.
	 */
	ApplicationVersion = 'X-DoCode-AppVersion',

	/**
	 * Insiders vs Stable.
	 */
	Build = 'X-DoCode-Build',

	/**
	 * Client Id which is used as primary unit for the experimentation.
	 */
	ClientId = 'X-MSEdge-ClientId',

	/**
	 * Developer Device Id which can be used as an alternate unit for experimentation.
	 */
	DeveloperDeviceId = 'X-DoCode-DevDeviceId',

	/**
	 * Extension header.
	 */
	ExtensionName = 'X-DoCode-ExtensionName',

	/**
	 * The version of the extension.
	 */
	ExtensionVersion = 'X-DoCode-ExtensionVersion',

	/**
	 * The language in use by VS Code
	 */
	Language = 'X-DoCode-Language',

	/**
	 * The target population.
	 * This is used to separate internal, early preview, GA, etc.
	 */
	TargetPopulation = 'X-DoCode-TargetPopulation',

	/**
	 * The platform (OS) on which VS Code is running.
	 */
	Platform = 'X-DoCode-Platform',

	/**
	 * The release/build date of VS Code (UTC) in the format yyyymmddHH.
	 */
	ReleaseDate = 'X-DoCode-ReleaseDate',

	/**
	 * The kind of window VS Code is running in (`editor` or `agents`).
	 */
	WindowKind = 'X-DoCode-WindowKind',
}

export const enum WindowKind {
	Editor = 'editor',
	Agents = 'agents',
}

export class AssignmentFilterProvider implements IExperimentationFilterProvider {
	constructor(
		private version: string,
		private appName: string,
		private machineId: string,
		private devDeviceId: string,
		private targetPopulation: TargetPopulation,
		private releaseDate: string,
		private windowKind: WindowKind
	) { }

	getFilterValue(filter: string): string | null {
		switch (filter) {
			case Filters.ApplicationVersion:
				return trimVersionSuffix(this.version); // productService.version
			case Filters.Build:
				return this.appName; // productService.nameLong
			case Filters.ClientId:
				return this.machineId;
			case Filters.DeveloperDeviceId:
				return this.devDeviceId;
			case Filters.Language:
				return platform.language;
			case Filters.ExtensionName:
				return 'docode-core'; // always return docode-core for exp service
			case Filters.ExtensionVersion:
				return '999999.0'; // always return a very large number for cross-extension experimentation
			case Filters.TargetPopulation:
				return this.targetPopulation;
			case Filters.Platform:
				return platform.PlatformToString(platform.platform);
			case Filters.ReleaseDate:
				return formatReleaseDate(this.releaseDate);
			case Filters.WindowKind:
				return this.windowKind;
			default:
				return '';
		}
	}

	getFilters(): Map<string, unknown> {
		const filters: Map<string, unknown> = new Map<string, unknown>();
		const filterValues = Object.values(Filters);
		for (const value of filterValues) {
			filters.set(value, this.getFilterValue(value));
		}

		return filters;
	}
}

/**
 * Trims a TAS-incompatible version suffix (e.g. `-insider`) so the value can be parsed
 * into a .NET Build object by the experimentation backend.
 */
function trimVersionSuffix(version: string): string {
	return version.split(/\-[a-zA-Z0-9]+$/)[0];
}

/**
 * Formats an ISO release date into the `yyyymmddHH` form the experimentation backend
 * expects (10 digits: yyyymmddHH). Returns an empty string when unavailable.
 */
function formatReleaseDate(iso: string): string {
	if (!iso) {
		return '';
	}
	const match = /^([0-9]{4})-([0-9]{2})-([0-9]{2})T([0-9]{2})/.exec(iso);
	if (!match) {
		return '';
	}
	return match.slice(1, 5).join('');
}

/**
 * userParam names for the new TAS assignments API (POST /api/v1/assignments), emitted by
 * {@link DoCodeCoreAssignmentsFilterProvider}. These replace the legacy header keys and
 * are sent only to the new endpoint.
 */
export enum AssignmentsFilters {
	ApplicationVersion = 'docode_core_appversion',
	Build = 'docode_core_build',
	DeveloperDeviceId = 'devdeviceid',
	ExtensionName = 'docode_core_extensionname',
	ExtensionNameShort = 'extensionname',
	TargetPopulation = 'docode_core_targetpopulation',
	Platform = 'docode_core_platform',
	ReleaseDate = 'docode_core_releasedate',
	WindowKind = 'docode_core_windowkind',
}

/**
 * Emits the generic VS Code core filters for the new TAS assignments API using the new
 * userParam key names, so the assignments endpoint never receives the legacy header keys.
 */
export class DoCodeCoreAssignmentsFilterProvider implements IExperimentationFilterProvider {
	constructor(
		private version: string,
		private appName: string,
		private devDeviceId: string,
		private targetPopulation: TargetPopulation,
		private releaseDate: string,
		private windowKind: WindowKind
	) { }

	getFilterValue(filter: string): string | null {
		switch (filter) {
			case AssignmentsFilters.ApplicationVersion:
				return trimVersionSuffix(this.version);
			case AssignmentsFilters.Build:
				return this.appName;
			case AssignmentsFilters.DeveloperDeviceId:
				return this.devDeviceId;
			case AssignmentsFilters.ExtensionName:
			case AssignmentsFilters.ExtensionNameShort:
				return 'docode-core';
			case AssignmentsFilters.TargetPopulation:
				return this.targetPopulation;
			case AssignmentsFilters.Platform:
				return platform.PlatformToString(platform.platform);
			case AssignmentsFilters.ReleaseDate:
				return formatReleaseDate(this.releaseDate);
			case AssignmentsFilters.WindowKind:
				return this.windowKind;
			default:
				return null;
		}
	}

	getFilters(): Map<string, unknown> {
		const filters: Map<string, unknown> = new Map<string, unknown>();
		for (const value of Object.values(AssignmentsFilters)) {
			filters.set(value, this.getFilterValue(value));
		}

		return filters;
	}
}

export function getInternalOrg(organisations: readonly string[] | undefined): 'docode' | 'github' | 'microsoft' | undefined {
	const isDoCodeInternal = organisations?.includes('Visual-Studio-Code');
	const isGitHubInternal = organisations?.includes('github');
	const isMicrosoftInternal = organisations?.includes('microsoft') || organisations?.includes('ms-copilot') || organisations?.includes('MicrosoftCopilot');
	return isDoCodeInternal ? 'docode' : isGitHubInternal ? 'github' : isMicrosoftInternal ? 'microsoft' : undefined;
}

/** Whether the account is staff or belongs to an internal org; the machine half is `verifyMicrosoftInternalDomain`. */
export function isInternalAccount(isStaff: boolean | undefined, organisations: readonly string[] | undefined): boolean {
	return isStaff === true || getInternalOrg(organisations) !== undefined;
}
