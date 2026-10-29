"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TsProjectParser = exports.TsParser = exports.runParserWorker = void 0;
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
const ts_morph_1 = require("ts-morph");
const fs = __importStar(require("fs"));
const cp = __importStar(require("child_process"));
const path = __importStar(require("path"));
const worker_threads_1 = require("worker_threads");
const ripgrep_1 = require("@vscode/ripgrep");
const operations_1 = require("./operations");
const events_1 = require("./events");
const ripgrep_2 = require("./ripgrep");
const sourceFilesPerBatch = 64;
function runParserWorker(request) {
    return new Promise((resolve, reject) => {
        const worker = new worker_threads_1.Worker(path.join(__dirname, 'ts-parser-worker.js'), { workerData: request });
        let result;
        let error;
        worker.once('message', (message) => {
            result = message;
        });
        worker.once('error', workerError => {
            error = workerError;
        });
        // Do not start another compiler until this worker has released its heap.
        worker.once('exit', code => {
            if (error) {
                reject(error);
            }
            else if (code !== 0) {
                reject(new Error(`Telemetry parser worker exited with code ${code}`));
            }
            else if (!result) {
                reject(new Error('Telemetry parser worker exited without a result'));
            }
            else {
                resolve(result);
            }
        });
    });
}
exports.runParserWorker = runParserWorker;
function isMeasurement(type) {
    if (type.isNumber()) {
        return true;
    }
    if (type.isBoolean()) {
        return true;
    }
    if (type.isEnum()) {
        return getEnumType(type) === 'number';
    }
    if (type.isUnion()) {
        const unionTypes = type.getUnionTypes();
        return unionTypes.length === 2 &&
            (unionTypes.some(t => t.isNumber()) || unionTypes.some(t => t.isBoolean())) &&
            unionTypes.some(t => t.isUndefined());
    }
    return false;
}
function getEnumType(type) {
    if (!type.isEnum()) {
        return null;
    }
    const symbol = type.getSymbol();
    if (!symbol) {
        return null;
    }
    const declarations = symbol.getDeclarations();
    if (!declarations || declarations.length === 0) {
        return null;
    }
    let hasNumber = false;
    let hasString = false;
    // Get the enum declaration to examine its members
    for (const declaration of declarations) {
        if (declaration.getKind() === ts_morph_1.SyntaxKind.EnumDeclaration) {
            const enumDeclaration = declaration;
            const members = enumDeclaration.getChildrenOfKind(ts_morph_1.SyntaxKind.EnumMember);
            for (const member of members) {
                const initializer = member.getInitializer();
                if (initializer) {
                    // Has explicit initializer - check its type
                    const initializerType = initializer.getType();
                    if (initializerType.isStringLiteral()) {
                        hasString = true;
                    }
                    else if (initializerType.isNumber()) {
                        hasNumber = true;
                    }
                }
                else {
                    // No initializer means it's a numeric enum (auto-incremented)
                    hasNumber = true;
                }
            }
            break;
        }
    }
    if (hasNumber && hasString) {
        return 'mixed';
    }
    else if (hasNumber) {
        return 'number';
    }
    else if (hasString) {
        return 'string';
    }
    return null;
}
class NodeVisitor {
    pl_node;
    prop_name;
    inline = false;
    original_prop_name;
    applyEndpoints;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    properties = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolved_property = Object.create(null);
    constructor(callexpress_node, prop_name, applyEndpoints) {
        this.pl_node = callexpress_node;
        this.prop_name = prop_name;
        this.original_prop_name = prop_name;
        this.applyEndpoints = applyEndpoints;
    }
    visitNode(currentNode, previousNode) {
        let type = currentNode.getTypeAtLocation(this.pl_node);
        // If we mark a property as optional then it is nullable, however we want all properties
        // So we want its non nullable type tl;dr this chops off the | undefined
        if (type.isNullable()) {
            type = type.getNonNullableType();
        }
        if (type.isStringLiteral() || type.isBooleanLiteral()) {
            if (previousNode) {
                // This means it is an inline because we had to recurse deeper than the first level to find the properties
                if (this.prop_name !== previousNode.getEscapedName().toLowerCase() && !this.prop_name.includes(`.${previousNode.getEscapedName().toLowerCase()}`)) {
                    this.prop_name = `${this.prop_name}.${previousNode.getEscapedName().toLowerCase()}`;
                    this.inline = true;
                }
            }
            // If we don't want endpoints skip them
            if (currentNode.getEscapedName().toLowerCase() === "endpoint" && !this.applyEndpoints)
                return;
            const nodeName = currentNode.getEscapedName();
            // If it's a string we strip the quotes
            if (type.isStringLiteral()) {
                this.resolved_property[nodeName] = type.getText().substring(1, type.getText().length - 1);
            }
            else {
                this.resolved_property[nodeName] = type.getText() === 'true';
            }
            return;
        }
        const nodeName = currentNode.getEscapedName();
        if (nodeName !== 'column') {
            const properties = type.getProperties();
            properties.forEach((prop) => {
                this.visitNode(prop, currentNode);
            });
        }
        else {
            const properties = type.getProperties();
            const value = Object.create(null);
            properties.forEach((prop) => {
                const propType = prop.getTypeAtLocation(this.pl_node);
                if (propType.isStringLiteral()) {
                    value[prop.getEscapedName()] = propType.getText().substring(1, propType.getText().length - 1);
                }
            });
            this.resolved_property['column'] = value;
        }
        // 95% of the time there is only one property in this array but inlines allow
        // for the number of properties found to be unpredictable so we must return an array
        if (this.inline && this.prop_name === this.original_prop_name) {
            // This handles the case where the recursion will cause the inline to be counted one too many times
            return;
        }
        const resolved = Object.create(null);
        if (this.applyEndpoints) {
            this.resolved_property['endPoint'] = this.resolved_property['endPoint'] ? this.resolved_property['endPoint'] : 'none';
        }
        resolved[this.prop_name] = this.resolved_property;
        this.properties.push(resolved);
        this.prop_name = this.original_prop_name;
    }
    visitMetadataNode(currentNode) {
        let type = currentNode.getTypeAtLocation(this.pl_node);
        // If we mark a property as optional then it is nullable, however we want all properties
        // So we want its non nullable type tl;dr this chops off the | undefined
        if (type.isNullable()) {
            type = type.getNonNullableType();
        }
        if (type.isStringLiteral()) {
            const nodeName = currentNode.getEscapedName();
            this.resolved_property[nodeName] = type.getText().substring(1, type.getText().length - 1);
            if (nodeName === 'owner' || nodeName === 'comment' || nodeName === 'expiration') {
                this.properties.push(new events_1.Metadata(nodeName, this.resolved_property[nodeName]).simpleObject());
            }
        }
    }
    resolveProperties(currentNode) {
        // @lramos15 Actually this.properties is of type any[] and the property data pushing into
        // the array is not an instance of Property.
        // It could be a complex node with nested types or a simple node with a string literal
        // representing some kind of metadata, so we try both visitors.
        this.visitMetadataNode(currentNode);
        this.visitNode(currentNode);
        return this.properties;
    }
}
class TsParser {
    sourceDir;
    excludedDirs;
    applyEndpoints;
    lowerCaseEvents;
    project;
    sourceFiles = [];
    eventDefinitions;
    constructor(sourceDir, excludedDirs, applyEndpoints, lowerCaseEvents) {
        this.sourceDir = sourceDir;
        this.excludedDirs = excludedDirs;
        this.applyEndpoints = applyEndpoints;
        this.lowerCaseEvents = lowerCaseEvents;
        this.eventDefinitions = new Map();
        // We search for a TS config as that allows the language service to handle weird imports
        if (fs.existsSync(path.join(this.sourceDir, 'src/tsconfig.json'))) {
            this.project = new ts_morph_1.Project({
                tsConfigFilePath: path.join(this.sourceDir, 'src/tsconfig.json'),
                skipAddingFilesFromTsConfig: true
            });
        }
        else if (fs.existsSync(path.join(this.sourceDir, 'tsconfig.json'))) {
            this.project = new ts_morph_1.Project({
                tsConfigFilePath: path.join(this.sourceDir, 'tsconfig.json'),
                skipAddingFilesFromTsConfig: true
            });
        }
        else {
            this.project = new ts_morph_1.Project({});
        }
        const fileGlobs = [];
        fileGlobs.push(`**/*.ts`);
        // Excluded added lasts because order determines what takes effect
        this.excludedDirs = (0, operations_1.makeExclusionsRelativeToSource)(this.sourceDir, this.excludedDirs);
        this.excludedDirs.forEach((dir) => {
            fileGlobs.push(`!${dir}/**`);
        });
        const rgGlobs = [];
        for (const fg of fileGlobs) {
            rgGlobs.push('--glob');
            rgGlobs.push(fg);
        }
        const ripgrepArgs = ['--files-with-matches', ...rgGlobs, '--no-ignore', 'publicLog2|publicLogError2', this.sourceDir];
        try {
            const retrievedPaths = cp.execFileSync(ripgrep_1.rgPath, ripgrepArgs, { encoding: 'ascii' });
            this.sourceFiles = (0, ripgrep_2.parseRipgrepFilePaths)(retrievedPaths);
            // Empty catch because this fails when there are no typescript annotations which causes weird error messages
        }
        catch {
            // No-op
        }
    }
    async parseFiles() {
        if (this.sourceFiles.length <= sourceFilesPerBatch) {
            for (const file of this.sourceFiles) {
                this.project.addSourceFileAtPathIfExists(file);
            }
            const parser = new TsProjectParser(this.project, this.applyEndpoints, this.lowerCaseEvents, [...this.eventDefinitions]);
            const events = parser.parseFiles();
            this.eventDefinitions = parser.getEventDefinitions();
            return events;
        }
        const compilerOptions = this.project.getCompilerOptions();
        const prepared = await runParserWorker({ kind: 'prepare', sourceFiles: this.sourceFiles, compilerOptions });
        if (prepared.kind !== 'prepared') {
            throw new Error('Telemetry parser worker did not return call locations');
        }
        let events = Object.create(null);
        for (let index = 0; index < prepared.calls.length; index += sourceFilesPerBatch) {
            const parsed = await runParserWorker({
                kind: 'parse',
                calls: prepared.calls.slice(index, index + sourceFilesPerBatch),
                sharedSourceFiles: prepared.sharedSourceFiles,
                compilerOptions,
                applyEndpoints: this.applyEndpoints,
                lowerCaseEvents: this.lowerCaseEvents,
                events,
                definitions: [...this.eventDefinitions]
            });
            if (parsed.kind !== 'parsed') {
                throw new Error('Telemetry parser worker did not return declarations');
            }
            events = Object.assign(Object.create(null), parsed.events);
            this.eventDefinitions = new Map(parsed.definitions);
        }
        return events;
    }
    getEventDefinitions() {
        return new Map([...this.eventDefinitions].map(([event, entries]) => [event, [...entries]]));
    }
}
exports.TsParser = TsParser;
class TsProjectParser {
    project;
    applyEndpoints;
    lowerCaseEvents;
    eventDefinitions;
    constructor(project, applyEndpoints, lowerCaseEvents, definitions = []) {
        this.project = project;
        this.applyEndpoints = applyEndpoints;
        this.lowerCaseEvents = lowerCaseEvents;
        this.eventDefinitions = new Map(definitions);
    }
    getEventDefinitions() {
        const definitions = new Map();
        for (const [eventName, entries] of this.eventDefinitions.entries()) {
            definitions.set(eventName, [...entries]);
        }
        return definitions;
    }
    addEventDefinition(eventName, properties, location) {
        const existing = this.eventDefinitions.get(eventName) ?? [];
        existing.push({ properties, location });
        this.eventDefinitions.set(eventName, existing);
    }
    extractConflictProperties(eventProperties) {
        return { ...eventProperties };
    }
    collectCalls() {
        const publicLogCalls = [];
        const publicLogErrorCalls = [];
        this.project.getSourceFiles().forEach((source) => {
            const calls = [];
            const errorCalls = [];
            const sourceFile = source.compilerNode;
            const visit = (node) => {
                if (ts_morph_1.ts.isCallExpression(node) && node.arguments.length > 0) {
                    const expression = node.expression.getText(sourceFile);
                    const isPublicLog = expression.includes('publicLog2');
                    const isPublicLogError = expression.includes('publicLogError2');
                    if ((isPublicLog || isPublicLogError) && node.arguments[0].getText(sourceFile) !== 'eventName') {
                        const call = { start: node.getStart(sourceFile), width: node.getWidth(sourceFile) };
                        if (isPublicLog) {
                            calls.push(call);
                        }
                        if (isPublicLogError) {
                            errorCalls.push(call);
                        }
                    }
                }
                ts_morph_1.ts.forEachChild(node, visit);
            };
            ts_morph_1.ts.forEachChild(sourceFile, visit);
            if (calls.length > 0) {
                publicLogCalls.unshift({ filePath: source.getFilePath(), calls });
            }
            if (errorCalls.length > 0) {
                publicLogErrorCalls.push({ filePath: source.getFilePath(), calls: errorCalls });
            }
        });
        return publicLogCalls.concat(publicLogErrorCalls);
    }
    getSharedSourceFiles() {
        const program = this.project.getProgram().compilerObject;
        return program.getSourceFiles().filter(source => !ts_morph_1.ts.isExternalModule(source) || source.statements.some(statement => ts_morph_1.ts.isModuleDeclaration(statement) &&
            (ts_morph_1.ts.isStringLiteral(statement.name) || (statement.flags & ts_morph_1.ts.NodeFlags.GlobalAugmentation) !== 0))).map(source => source.fileName);
    }
    prepare() {
        const calls = this.collectCalls();
        return {
            kind: 'prepared',
            calls,
            sharedSourceFiles: calls.length > 0 ? this.getSharedSourceFiles() : []
        };
    }
    parseCalls(groups, parseCall) {
        for (const group of groups) {
            const source = this.project.getSourceFileOrThrow(group.filePath);
            for (const call of group.calls) {
                const node = source.getDescendantAtStartWithWidth(call.start, call.width);
                if (!node || !ts_morph_1.Node.isCallExpression(node)) {
                    throw new Error(`Could not locate telemetry call in ${group.filePath} at ${call.start}`);
                }
                parseCall(node);
            }
        }
    }
    parseFiles(calls = this.collectCalls(), previousEvents) {
        const events = Object.create(null);
        if (previousEvents) {
            // Structured cloning does not preserve dictionary prototypes.
            for (const [name, properties] of Object.entries(previousEvents)) {
                events[name] = Object.assign(Object.create(null), properties);
            }
        }
        const parseCall = (pl) => {
            try {
                const typeArgs = pl.getTypeArguments();
                if (typeArgs.length != 2) {
                    throw new Error(`Missing generic arguments on public log call ${pl}`);
                }
                if (pl.getArguments()[0].getText() === "eventName") {
                    return;
                }
                // Create an event from the name of the first argument passed in
                let event_name = pl.getArguments()[0].getType().isStringLiteral() ? pl.getArguments()[0].getType().getText() : '';
                // If we can't resolve the event_name there is no use continuing
                if (event_name === '') {
                    console.error(`Unable to resolve event name ${pl.getFullText().trim()}, skipping....`);
                    return;
                }
                else {
                    event_name = event_name.substring(1, event_name.length - 1);
                }
                event_name = this.lowerCaseEvents ? event_name.toLowerCase() : event_name;
                // Ensure there is at least an object available to assign props to
                if (events[event_name] === undefined) {
                    events[event_name] = Object.create(null);
                }
                const created_event = new events_1.Event(event_name);
                // We want the second one because public log is in the form <Event, Classification> and we care about the classification
                const type_properties = typeArgs[1].getType().getProperties();
                type_properties.forEach((prop) => {
                    const propName = prop.getEscapedName().toLowerCase();
                    const node_visitor = new NodeVisitor(pl, propName, this.applyEndpoints);
                    const resolved_properties = node_visitor.resolveProperties(prop);
                    for (const rp of resolved_properties) {
                        if (!(rp instanceof events_1.Metadata)) {
                            // This cast is necessary since rp is not of type Property although
                            // the resolveProperties claims it to be.
                            const propInfo = rp[propName];
                            if (propInfo !== undefined) {
                                this.captureOriginalPropNameForColumnInformation(prop.getEscapedName(), propInfo);
                            }
                        }
                    }
                    created_event.properties = created_event.properties.concat(resolved_properties);
                });
                created_event.properties.forEach((prop) => {
                    Object.assign(events[event_name], prop);
                });
                this.addEventDefinition(event_name, this.extractConflictProperties(events[event_name]), `${pl.getSourceFile().getFilePath()}:${pl.getStartLineNumber()}`);
                const eventProperties = typeArgs[0].getType().getProperties();
                // Find all eventProperties that have a number or boolean type
                eventProperties.forEach((prop) => {
                    const propName = prop.getEscapedName().toLowerCase();
                    const valueDeclaration = prop.getValueDeclaration();
                    if (valueDeclaration === undefined) {
                        return;
                    }
                    const propType = prop.getTypeAtLocation(valueDeclaration);
                    if (isMeasurement(propType)) {
                        const eventToUpdate = events[event_name][propName];
                        if (!eventToUpdate) {
                            return;
                        }
                        eventToUpdate.isMeasurement = true;
                    }
                });
            }
            catch {
                if (pl.getArguments()[0].getText() === "eventName") {
                    return;
                }
                // If the publicLog call isn't generic that means we're just sending an event name with no classifications
                // that are unique to that event (it just has common properties)
                let event_name = pl.getArguments()[0].getType().isStringLiteral() ? pl.getArguments()[0].getType().getText() : '';
                // If we can't resolve the event_name this is most likely because it is not a public log call and therefore we skip it
                if (event_name === '') {
                    return;
                }
                else {
                    event_name = event_name.substring(1, event_name.length - 1);
                }
                event_name = this.lowerCaseEvents ? event_name.toLowerCase() : event_name;
                events[event_name] = {};
                this.addEventDefinition(event_name, this.extractConflictProperties(events[event_name]), `${pl.getSourceFile().getFilePath()}:${pl.getStartLineNumber()}`);
            }
        };
        this.parseCalls(calls, parseCall);
        return events;
    }
    captureOriginalPropNameForColumnInformation(propName, property) {
        if (property.column && property.column.name === undefined) {
            property.column.name = propName;
        }
        else if (typeof property.type === 'string') {
            property.column = { name: propName, type: property.type };
            delete property.type;
        }
    }
}
exports.TsProjectParser = TsProjectParser;
//# sourceMappingURL=ts-parser.js.map