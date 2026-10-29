/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../../nls.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { IJSONSchema } from '../../../../base/common/jsonSchema.js';
import Severity from '../../../../base/common/severity.js';
import { EXTENSION_IDENTIFIER_PATTERN } from '../../../../platform/extensionManagement/common/extensionManagement.js';
import { Extensions, IJSONContributionRegistry } from '../../../../platform/jsonschemas/common/jsonContributionRegistry.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IMessage } from './extensions.js';
import { IExtensionDescription, EXTENSION_CATEGORIES, ExtensionIdentifierSet } from '../../../../platform/extensions/common/extensions.js';
import { ExtensionKind } from '../../../../platform/environment/common/environment.js';
import { productSchemaId } from '../../../../platform/product/common/productService.js';
import { ImplicitActivationEvents, IActivationEventsGenerator } from '../../../../platform/extensionManagement/common/implicitActivationEvents.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { allApiProposals } from '../../../../platform/extensions/common/extensionsApiProposals.js';

const schemaRegistry = Registry.as<IJSONContributionRegistry>(Extensions.JSONContribution);

export class ExtensionMessageCollector {

	private readonly _messageHandler: (msg: IMessage) => void;
	private readonly _extension: IExtensionDescription;
	private readonly _extensionPointId: string;

	constructor(
		messageHandler: (msg: IMessage) => void,
		extension: IExtensionDescription,
		extensionPointId: string
	) {
		this._messageHandler = messageHandler;
		this._extension = extension;
		this._extensionPointId = extensionPointId;
	}

	private _msg(type: Severity, message: string): void {
		this._messageHandler({
			type: type,
			message: message,
			extensionId: this._extension.identifier,
			extensionPointId: this._extensionPointId
		});
	}

	public error(message: string): void {
		this._msg(Severity.Error, message);
	}

	public warn(message: string): void {
		this._msg(Severity.Warning, message);
	}

	public info(message: string): void {
		this._msg(Severity.Info, message);
	}
}

export interface IExtensionPointUser<T> {
	description: IExtensionDescription;
	value: T;
	collector: ExtensionMessageCollector;
}

export type IExtensionPointHandler<T> = (extensions: readonly IExtensionPointUser<T>[], delta: ExtensionPointUserDelta<T>) => void;

export interface IExtensionPoint<T> {
	readonly name: string;
	setHandler(handler: IExtensionPointHandler<T>): IDisposable;
	readonly defaultExtensionKind: ExtensionKind[] | undefined;
	readonly canHandleResolver?: boolean;
}

export class ExtensionPointUserDelta<T> {

	private static _toSet<T>(arr: readonly IExtensionPointUser<T>[]): ExtensionIdentifierSet {
		const result = new ExtensionIdentifierSet();
		for (let i = 0, len = arr.length; i < len; i++) {
			result.add(arr[i].description.identifier);
		}
		return result;
	}

	public static compute<T>(previous: readonly IExtensionPointUser<T>[] | null, current: readonly IExtensionPointUser<T>[]): ExtensionPointUserDelta<T> {
		if (!previous || !previous.length) {
			return new ExtensionPointUserDelta<T>(current, []);
		}
		if (!current || !current.length) {
			return new ExtensionPointUserDelta<T>([], previous);
		}

		const previousSet = this._toSet(previous);
		const currentSet = this._toSet(current);

		const added = current.filter(user => !previousSet.has(user.description.identifier));
		const removed = previous.filter(user => !currentSet.has(user.description.identifier));

		return new ExtensionPointUserDelta<T>(added, removed);
	}

	constructor(
		public readonly added: readonly IExtensionPointUser<T>[],
		public readonly removed: readonly IExtensionPointUser<T>[],
	) { }
}

export class ExtensionPoint<T> implements IExtensionPoint<T> {

	public readonly name: string;
	public readonly defaultExtensionKind: ExtensionKind[] | undefined;
	public readonly canHandleResolver?: boolean;

	private _handler: IExtensionPointHandler<T> | null;
	private _users: IExtensionPointUser<T>[] | null;
	private _delta: ExtensionPointUserDelta<T> | null;

	constructor(name: string, defaultExtensionKind: ExtensionKind[] | undefined, canHandleResolver?: boolean) {
		this.name = name;
		this.defaultExtensionKind = defaultExtensionKind;
		this.canHandleResolver = canHandleResolver;
		this._handler = null;
		this._users = null;
		this._delta = null;
	}

	setHandler(handler: IExtensionPointHandler<T>): IDisposable {
		if (this._handler !== null) {
			throw new Error('Handler already set!');
		}
		this._handler = handler;
		this._handle();

		return {
			dispose: () => {
				this._handler = null;
			}
		};
	}

	acceptUsers(users: IExtensionPointUser<T>[]): void {
		this._delta = ExtensionPointUserDelta.compute(this._users, users);
		this._users = users;
		this._handle();
	}

	private _handle(): void {
		if (this._handler === null || this._users === null || this._delta === null) {
			return;
		}

		try {
			this._handler(this._users, this._delta);
		} catch (err) {
			onUnexpectedError(err);
		}
	}
}

const extensionKindSchema: IJSONSchema = {
	type: 'string',
	enum: [
		'ui',
		'workspace'
	],
	enumDescriptions: [
		nls.localize('ui', "UI extension kind. In a remote window, such extensions are enabled only when available on the local machine."),
		nls.localize('workspace', "Workspace extension kind. In a remote window, such extensions are enabled only when available on the remote."),
	],
};

const schemaId = 'docode://schemas/docode-extensions';
export const schema: IJSONSchema = {
	properties: {
		engines: {
			type: 'object',
			description: nls.localize('docode.extension.engines', "Engine compatibility."),
			properties: {
				'docode': {
					type: 'string',
					description: nls.localize('docode.extension.engines.docode', 'For DoCode extensions, specifies the DoCode version that the extension is compatible with. Cannot be *. For example: ^1.105.0 indicates compatibility with a minimum DoCode version of 1.105.0.'),
					default: '^1.105.0',
				}
			}
		},
		publisher: {
			description: nls.localize('docode.extension.publisher', 'The publisher of the DoCode extension.'),
			type: 'string'
		},
		displayName: {
			description: nls.localize('docode.extension.displayName', 'The display name for the extension used in the DoCode gallery.'),
			type: 'string'
		},
		categories: {
			description: nls.localize('docode.extension.categories', 'The categories used by the DoCode gallery to categorize the extension.'),
			type: 'array',
			uniqueItems: true,
			items: {
				oneOf: [{
					type: 'string',
					enum: EXTENSION_CATEGORIES,
				},
				{
					type: 'string',
					const: 'Languages',
					deprecationMessage: nls.localize('docode.extension.category.languages.deprecated', 'Use \'Programming  Languages\' instead'),
				}]
			}
		},
		galleryBanner: {
			type: 'object',
			description: nls.localize('docode.extension.galleryBanner', 'Banner used in the DoCode marketplace.'),
			properties: {
				color: {
					description: nls.localize('docode.extension.galleryBanner.color', 'The banner color on the DoCode marketplace page header.'),
					type: 'string'
				},
				theme: {
					description: nls.localize('docode.extension.galleryBanner.theme', 'The color theme for the font used in the banner.'),
					type: 'string',
					enum: ['dark', 'light']
				}
			}
		},
		contributes: {
			description: nls.localize('docode.extension.contributes', 'All contributions of the DoCode extension represented by this package.'),
			type: 'object',
			// eslint-disable-next-line local/code-no-any-casts
			properties: {
				// extensions will fill in
			} as any as { [key: string]: any },
			default: {}
		},
		preview: {
			type: 'boolean',
			description: nls.localize('docode.extension.preview', 'Sets the extension to be flagged as a Preview in the Marketplace.'),
		},
		enableProposedApi: {
			type: 'boolean',
			deprecationMessage: nls.localize('docode.extension.enableProposedApi.deprecated', 'Use `enabledApiProposals` instead.'),
		},
		enabledApiProposals: {
			markdownDescription: nls.localize('docode.extension.enabledApiProposals', 'Enable API proposals to try them out. Only valid **during development**. Extensions **cannot be published** with this property. For more details visit: https://code.visualstudio.com/api/advanced-topics/using-proposed-api'),
			type: 'array',
			uniqueItems: true,
			items: {
				type: 'string',
				enum: Object.keys(allApiProposals).map(proposalName => proposalName),
				markdownEnumDescriptions: Object.values(allApiProposals).map(value => value.proposal)
			}
		},
		api: {
			markdownDescription: nls.localize('docode.extension.api', 'Describe the API provided by this extension. For more details visit: https://code.visualstudio.com/api/advanced-topics/remote-extensions#handling-dependencies-with-remote-extensions'),
			type: 'string',
			enum: ['none'],
			enumDescriptions: [
				nls.localize('docode.extension.api.none', "Give up entirely the ability to export any APIs. This allows other extensions that depend on this extension to run in a separate extension host process or in a remote machine.")
			]
		},
		activationEvents: {
			description: nls.localize('docode.extension.activationEvents', 'Activation events for the DoCode extension.'),
			type: 'array',
			items: {
				type: 'string',
				defaultSnippets: [
					{
						label: 'onWebviewPanel',
						description: nls.localize('docode.extension.activationEvents.onWebviewPanel', 'An activation event emitted when a webview is loaded of a certain viewType'),
						body: 'onWebviewPanel:viewType'
					},
					{
						label: 'onLanguage',
						description: nls.localize('docode.extension.activationEvents.onLanguage', 'An activation event emitted whenever a file that resolves to the specified language gets opened.'),
						body: 'onLanguage:${1:languageId}'
					},
					{
						label: 'onCommand',
						description: nls.localize('docode.extension.activationEvents.onCommand', 'An activation event emitted whenever the specified command gets invoked.'),
						body: 'onCommand:${2:commandId}'
					},
					{
						label: 'onDebug',
						description: nls.localize('docode.extension.activationEvents.onDebug', 'An activation event emitted whenever a user is about to start debugging or about to setup debug configurations.'),
						body: 'onDebug'
					},
					{
						label: 'onDebugInitialConfigurations',
						description: nls.localize('docode.extension.activationEvents.onDebugInitialConfigurations', 'An activation event emitted whenever a "launch.json" needs to be created (and all provideDebugConfigurations methods need to be called).'),
						body: 'onDebugInitialConfigurations'
					},
					{
						label: 'onDebugDynamicConfigurations',
						description: nls.localize('docode.extension.activationEvents.onDebugDynamicConfigurations', 'An activation event emitted whenever a list of all debug configurations needs to be created (and all provideDebugConfigurations methods for the "dynamic" scope need to be called).'),
						body: 'onDebugDynamicConfigurations'
					},
					{
						label: 'onDebugResolve',
						description: nls.localize('docode.extension.activationEvents.onDebugResolve', 'An activation event emitted whenever a debug session with the specific type is about to be launched (and a corresponding resolveDebugConfiguration method needs to be called).'),
						body: 'onDebugResolve:${6:type}'
					},
					{
						label: 'onDebugAdapterProtocolTracker',
						description: nls.localize('docode.extension.activationEvents.onDebugAdapterProtocolTracker', 'An activation event emitted whenever a debug session with the specific type is about to be launched and a debug protocol tracker might be needed.'),
						body: 'onDebugAdapterProtocolTracker:${6:type}'
					},
					{
						label: 'workspaceContains',
						description: nls.localize('docode.extension.activationEvents.workspaceContains', 'An activation event emitted whenever a folder is opened that contains at least a file matching the specified glob pattern.'),
						body: 'workspaceContains:${4:filePattern}'
					},
					{
						label: 'onStartupFinished',
						description: nls.localize('docode.extension.activationEvents.onStartupFinished', 'An activation event emitted after the start-up finished (after all `*` activated extensions have finished activating).'),
						body: 'onStartupFinished'
					},
					{
						label: 'onTaskType',
						description: nls.localize('docode.extension.activationEvents.onTaskType', 'An activation event emitted whenever tasks of a certain type need to be listed or resolved.'),
						body: 'onTaskType:${1:taskType}'
					},
					{
						label: 'onFileSystem',
						description: nls.localize('docode.extension.activationEvents.onFileSystem', 'An activation event emitted whenever a file or folder is accessed with the given scheme.'),
						body: 'onFileSystem:${1:scheme}'
					},
					{
						label: 'onEditSession',
						description: nls.localize('docode.extension.activationEvents.onEditSession', 'An activation event emitted whenever an edit session is accessed with the given scheme.'),
						body: 'onEditSession:${1:scheme}'
					},
					{
						label: 'onSearch',
						description: nls.localize('docode.extension.activationEvents.onSearch', 'An activation event emitted whenever a search is started in the folder with the given scheme.'),
						body: 'onSearch:${7:scheme}'
					},
					{
						label: 'onView',
						body: 'onView:${5:viewId}',
						description: nls.localize('docode.extension.activationEvents.onView', 'An activation event emitted whenever the specified view is expanded.'),
					},
					{
						label: 'onUri',
						body: 'onUri',
						description: nls.localize('docode.extension.activationEvents.onUri', 'An activation event emitted whenever a system-wide Uri directed towards this extension is open.'),
					},
					{
						label: 'onOpenExternalUri',
						body: 'onOpenExternalUri',
						description: nls.localize('docode.extension.activationEvents.onOpenExternalUri', 'An activation event emitted whenever a external uri (such as an http or https link) is being opened.'),
					},
					{
						label: 'onCustomEditor',
						body: 'onCustomEditor:${9:viewType}',
						description: nls.localize('docode.extension.activationEvents.onCustomEditor', 'An activation event emitted whenever the specified custom editor becomes visible.'),
					},
					{
						label: 'onNotebook',
						body: 'onNotebook:${1:type}',
						description: nls.localize('docode.extension.activationEvents.onNotebook', 'An activation event emitted whenever the specified notebook document is opened.'),
					},
					{
						label: 'onAuthenticationRequest',
						body: 'onAuthenticationRequest:${11:authenticationProviderId}',
						description: nls.localize('docode.extension.activationEvents.onAuthenticationRequest', 'An activation event emitted whenever sessions are requested from the specified authentication provider.')
					},
					{
						label: 'onRenderer',
						description: nls.localize('docode.extension.activationEvents.onRenderer', 'An activation event emitted whenever a notebook output renderer is used.'),
						body: 'onRenderer:${11:rendererId}'
					},
					{
						label: 'onTerminalProfile',
						body: 'onTerminalProfile:${1:terminalId}',
						description: nls.localize('docode.extension.activationEvents.onTerminalProfile', 'An activation event emitted when a specific terminal profile is launched.'),
					},
					{
						label: 'onTerminalQuickFixRequest',
						body: 'onTerminalQuickFixRequest:${1:quickFixId}',
						description: nls.localize('docode.extension.activationEvents.onTerminalQuickFixRequest', 'An activation event emitted when a command matches the selector associated with this ID'),
					},
					{
						label: 'onWalkthrough',
						body: 'onWalkthrough:${1:walkthroughID}',
						description: nls.localize('docode.extension.activationEvents.onWalkthrough', 'An activation event emitted when a specified walkthrough is opened.'),
					},
					{
						label: 'onIssueReporterOpened',
						body: 'onIssueReporterOpened',
						description: nls.localize('docode.extension.activationEvents.onIssueReporterOpened', 'An activation event emitted when the issue reporter is opened.'),
					},
					{
						label: 'onChatParticipant',
						body: 'onChatParticipant:${1:participantId}',
						description: nls.localize('docode.extension.activationEvents.onChatParticipant', 'An activation event emitted when the specified chat participant is invoked.'),
					},
					{
						label: 'onChatArtifactIntegration',
						body: 'onChatArtifactIntegration',
						description: nls.localize('docode.extension.activationEvents.onChatArtifactIntegration', 'An activation event emitted when recorded chat artifacts are observed or an agent host that can use artifact integrations connects.'),
					},
					{
						label: 'onChatContextProvider',
						body: 'onChatContextProvider:${1:contextProviderId}',
						description: nls.localize('docode.extension.activationEvents.onChatContextProvider', 'An activation event emitted when the specified chat context provider is invoked.'),
					},
					{
						label: 'onLanguageModelChatProvider',
						body: 'onLanguageModelChatProvider:${1:vendor}',
						description: nls.localize('docode.extension.activationEvents.onLanguageModelChatProvider', 'An activation event emitted when a chat model provider for the given vendor is requested.'),
					},
					{
						label: 'onLanguageModelTool',
						body: 'onLanguageModelTool:${1:toolId}',
						description: nls.localize('docode.extension.activationEvents.onLanguageModelTool', 'An activation event emitted when the specified language model tool is invoked.'),
					},
					{
						label: 'onTerminal',
						body: 'onTerminal:{1:shellType}',
						description: nls.localize('docode.extension.activationEvents.onTerminal', 'An activation event emitted when a terminal of the given shell type is opened.'),
					},
					{
						label: 'onTerminalShellIntegration',
						body: 'onTerminalShellIntegration:${1:shellType}',
						description: nls.localize('docode.extension.activationEvents.onTerminalShellIntegration', 'An activation event emitted when terminal shell integration is activated for the given shell type.'),
					},
					{
						label: 'onMcpCollection',
						description: nls.localize('docode.extension.activationEvents.onMcpCollection', 'An activation event emitted whenever a tool from the MCP server is requested.'),
						body: 'onMcpCollection:${2:collectionId}',
					},
					{
						label: '*',
						description: nls.localize('docode.extension.activationEvents.star', 'An activation event emitted on DoCode startup. To ensure a great end user experience, please use this activation event in your extension only when no other activation events combination works in your use-case.'),
						body: '*'
					}
				],
			}
		},
		badges: {
			type: 'array',
			description: nls.localize('docode.extension.badges', 'Array of badges to display in the sidebar of the Marketplace\'s extension page.'),
			items: {
				type: 'object',
				required: ['url', 'href', 'description'],
				properties: {
					url: {
						type: 'string',
						description: nls.localize('docode.extension.badges.url', 'Badge image URL.')
					},
					href: {
						type: 'string',
						description: nls.localize('docode.extension.badges.href', 'Badge link.')
					},
					description: {
						type: 'string',
						description: nls.localize('docode.extension.badges.description', 'Badge description.')
					}
				}
			}
		},
		markdown: {
			type: 'string',
			description: nls.localize('docode.extension.markdown', "Controls the Markdown rendering engine used in the Marketplace. Either github (default) or standard."),
			enum: ['github', 'standard'],
			default: 'github'
		},
		qna: {
			default: 'marketplace',
			description: nls.localize('docode.extension.qna', "Controls the Q&A link in the Marketplace. Set to marketplace to enable the default Marketplace Q & A site. Set to a string to provide the URL of a custom Q & A site. Set to false to disable Q & A altogether."),
			anyOf: [
				{
					type: ['string', 'boolean'],
					enum: ['marketplace', false]
				},
				{
					type: 'string'
				}
			]
		},
		extensionDependencies: {
			description: nls.localize('docode.extension.extensionDependencies', 'Dependencies to other extensions. The identifier of an extension is always ${publisher}.${name}. For example: docode.csharp.'),
			type: 'array',
			uniqueItems: true,
			items: {
				type: 'string',
				pattern: EXTENSION_IDENTIFIER_PATTERN
			}
		},
		extensionAffinity: {
			description: nls.localize('docode.extension.extensionAffinity', 'Extensions that this extension should be colocated with in the same extension host process if possible. The identifier of an extension is always ${publisher}.${name}. For example: docode.git.'),
			type: 'array',
			uniqueItems: true,
			items: {
				type: 'string',
				pattern: EXTENSION_IDENTIFIER_PATTERN
			}
		},
		extensionPack: {
			description: nls.localize('docode.extension.contributes.extensionPack', "A set of extensions that can be installed together. The identifier of an extension is always ${publisher}.${name}. For example: docode.csharp."),
			type: 'array',
			uniqueItems: true,
			items: {
				type: 'string',
				pattern: EXTENSION_IDENTIFIER_PATTERN
			}
		},
		extensionKind: {
			description: nls.localize('extensionKind', "Define the kind of an extension. `ui` extensions are installed and run on the local machine while `workspace` extensions run on the remote."),
			type: 'array',
			items: extensionKindSchema,
			default: ['workspace'],
			defaultSnippets: [
				{
					body: ['ui'],
					description: nls.localize('extensionKind.ui', "Define an extension which can run only on the local machine when connected to remote window.")
				},
				{
					body: ['workspace'],
					description: nls.localize('extensionKind.workspace', "Define an extension which can run only on the remote machine when connected remote window.")
				},
				{
					body: ['ui', 'workspace'],
					description: nls.localize('extensionKind.ui-workspace', "Define an extension which can run on either side, with a preference towards running on the local machine.")
				},
				{
					body: ['workspace', 'ui'],
					description: nls.localize('extensionKind.workspace-ui', "Define an extension which can run on either side, with a preference towards running on the remote machine.")
				},
				{
					body: [],
					description: nls.localize('extensionKind.empty', "Define an extension which cannot run in a remote context, neither on the local, nor on the remote machine.")
				}
			]
		},
		capabilities: {
			description: nls.localize('docode.extension.capabilities', "Declare the set of supported capabilities by the extension."),
			type: 'object',
			properties: {
				virtualWorkspaces: {
					description: nls.localize('docode.extension.capabilities.virtualWorkspaces', "Declares whether the extension should be enabled in virtual workspaces. A virtual workspace is a workspace which is not backed by any on-disk resources. When false, this extension will be automatically disabled in virtual workspaces. Default is true."),
					type: ['boolean', 'object'],
					defaultSnippets: [
						{ label: 'limited', body: { supported: '${1:limited}', description: '${2}' } },
						{ label: 'false', body: { supported: false, description: '${2}' } },
					],
					default: true.valueOf,
					properties: {
						supported: {
							markdownDescription: nls.localize('docode.extension.capabilities.virtualWorkspaces.supported', "Declares the level of support for virtual workspaces by the extension."),
							type: ['string', 'boolean'],
							enum: ['limited', true, false],
							enumDescriptions: [
								nls.localize('docode.extension.capabilities.virtualWorkspaces.supported.limited', "The extension will be enabled in virtual workspaces with some functionality disabled."),
								nls.localize('docode.extension.capabilities.virtualWorkspaces.supported.true', "The extension will be enabled in virtual workspaces with all functionality enabled."),
								nls.localize('docode.extension.capabilities.virtualWorkspaces.supported.false', "The extension will not be enabled in virtual workspaces."),
							]
						},
						description: {
							type: 'string',
							markdownDescription: nls.localize('docode.extension.capabilities.virtualWorkspaces.description', "A description of how virtual workspaces affects the extensions behavior and why it is needed. This only applies when `supported` is not `true`."),
						}
					}
				},
				untrustedWorkspaces: {
					description: nls.localize('docode.extension.capabilities.untrustedWorkspaces', 'Declares how the extension should be handled in untrusted workspaces.'),
					type: 'object',
					required: ['supported'],
					defaultSnippets: [
						{ body: { supported: '${1:limited}', description: '${2}' } },
					],
					properties: {
						supported: {
							markdownDescription: nls.localize('docode.extension.capabilities.untrustedWorkspaces.supported', "Declares the level of support for untrusted workspaces by the extension."),
							type: ['string', 'boolean'],
							enum: ['limited', true, false],
							enumDescriptions: [
								nls.localize('docode.extension.capabilities.untrustedWorkspaces.supported.limited', "The extension will be enabled in untrusted workspaces with some functionality disabled."),
								nls.localize('docode.extension.capabilities.untrustedWorkspaces.supported.true', "The extension will be enabled in untrusted workspaces with all functionality enabled."),
								nls.localize('docode.extension.capabilities.untrustedWorkspaces.supported.false', "The extension will not be enabled in untrusted workspaces."),
							]
						},
						restrictedConfigurations: {
							description: nls.localize('docode.extension.capabilities.untrustedWorkspaces.restrictedConfigurations', "A list of configuration keys contributed by the extension that should not use workspace values in untrusted workspaces."),
							type: 'array',
							items: {
								type: 'string'
							}
						},
						description: {
							type: 'string',
							markdownDescription: nls.localize('docode.extension.capabilities.untrustedWorkspaces.description', "A description of how workspace trust affects the extensions behavior and why it is needed. This only applies when `supported` is not `true`."),
						}
					}
				},
				agentsWindow: {
					description: nls.localize('docode.extension.capabilities.agentsWindow', "Declares whether the extension should be enabled in the Agents window."),
					type: 'object',
					required: ['supported'],
					defaultSnippets: [
						{ body: { supported: true } },
					],
					properties: {
						supported: {
							markdownDescription: nls.localize('docode.extension.capabilities.agentsWindow.supported', "Declares whether the extension supports running in the Agents window. For non-built-in extensions, this takes effect while the `extensions.experimental.enableAgentsWindowCapability` setting is enabled (the default)."),
							type: 'boolean'
						}
					}
				}
			}
		},
		sponsor: {
			description: nls.localize('docode.extension.contributes.sponsor', "Specify the location from where users can sponsor your extension."),
			type: 'object',
			defaultSnippets: [
				{ body: { url: '${1:https:}' } },
			],
			properties: {
				'url': {
					description: nls.localize('docode.extension.contributes.sponsor.url', "URL from where users can sponsor your extension. It must be a valid URL with a HTTP or HTTPS protocol. Example value: https://github.com/sponsors/nvaccess"),
					type: 'string',
				}
			}
		},
		scripts: {
			type: 'object',
			properties: {
				'docode:prepublish': {
					description: nls.localize('docode.extension.scripts.prepublish', 'Script executed before the package is published as a DoCode extension.'),
					type: 'string'
				},
				'docode:uninstall': {
					description: nls.localize('docode.extension.scripts.uninstall', 'Uninstall hook for DoCode extension. Script that gets executed when the extension is completely uninstalled from DoCode which is when DoCode is restarted (shutdown and start) after the extension is uninstalled. Only Node scripts are supported.'),
					type: 'string'
				}
			}
		},
		icon: {
			type: 'string',
			description: nls.localize('docode.extension.icon', 'The path to a 128x128 pixel icon.')
		},
		l10n: {
			type: 'string',
			description: nls.localize({
				key: 'docode.extension.l10n',
				comment: [
					'{Locked="bundle.l10n._locale_.json"}',
					'{Locked="docode.l10n API"}'
				]
			}, 'The relative path to a folder containing localization (bundle.l10n.*.json) files. Must be specified if you are using the docode.l10n API.')
		},
		pricing: {
			type: 'string',
			markdownDescription: nls.localize('docode.extension.pricing', 'The pricing information for the extension. Can be Free (default) or Trial. For more details visit: https://code.visualstudio.com/api/working-with-extensions/publishing-extension#extension-pricing-label'),
			enum: ['Free', 'Trial'],
			default: 'Free'
		}
	}
};

export type removeArray<T> = T extends Array<infer X> ? X : T;

export interface IExtensionPointDescriptor<T> {
	extensionPoint: string;
	deps?: IExtensionPoint<unknown>[];
	jsonSchema: IJSONSchema;
	defaultExtensionKind?: ExtensionKind[];
	canHandleResolver?: boolean;
	/**
	 * A function which runs before the extension point has been validated and which
	 * should collect automatic activation events from the contribution.
	 */
	activationEventsGenerator?: IActivationEventsGenerator<removeArray<T>>;
}

export class ExtensionsRegistryImpl {

	private readonly _extensionPoints = new Map<string, ExtensionPoint<any>>();

	public registerExtensionPoint<T>(desc: IExtensionPointDescriptor<T>): IExtensionPoint<T> {
		if (this._extensionPoints.has(desc.extensionPoint)) {
			throw new Error('Duplicate extension point: ' + desc.extensionPoint);
		}
		const result = new ExtensionPoint<T>(desc.extensionPoint, desc.defaultExtensionKind, desc.canHandleResolver);
		this._extensionPoints.set(desc.extensionPoint, result);
		if (desc.activationEventsGenerator) {
			ImplicitActivationEvents.register(desc.extensionPoint, desc.activationEventsGenerator);
		}

		schema.properties!['contributes'].properties![desc.extensionPoint] = desc.jsonSchema;
		schemaRegistry.registerSchema(schemaId, schema);

		return result;
	}

	public getExtensionPoints(): ExtensionPoint<unknown>[] {
		return Array.from(this._extensionPoints.values());
	}
}

const PRExtensions = {
	ExtensionsRegistry: 'ExtensionsRegistry'
};
Registry.add(PRExtensions.ExtensionsRegistry, new ExtensionsRegistryImpl());
export const ExtensionsRegistry: ExtensionsRegistryImpl = Registry.as(PRExtensions.ExtensionsRegistry);

schemaRegistry.registerSchema(schemaId, schema);


schemaRegistry.registerSchema(productSchemaId, {
	properties: {
		extensionEnabledApiProposals: {
			description: nls.localize('product.extensionEnabledApiProposals', "API proposals that the respective extensions can freely use."),
			type: 'object',
			properties: {},
			additionalProperties: {
				anyOf: [{
					type: 'array',
					uniqueItems: true,
					items: {
						type: 'string',
						enum: Object.keys(allApiProposals),
						markdownEnumDescriptions: Object.values(allApiProposals).map(value => value.proposal)
					}
				}]
			}
		}
	}
});
