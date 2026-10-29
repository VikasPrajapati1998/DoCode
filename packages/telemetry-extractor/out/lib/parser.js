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
exports.Parser = void 0;
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
const ripgrep_1 = require("@docode/ripgrep-universal");
const path = __importStar(require("path"));
const cp = __importStar(require("child_process"));
const fs = __importStar(require("fs"));
// Not importing 'process' as tsc claims `process.exitCode` is read-only when it actually is not.
const fragments_1 = require("./fragments");
const common_properties_1 = require("./common-properties");
const events_1 = require("./events");
const operations_1 = require("./operations");
const ripgrep_2 = require("./ripgrep");
class Parser {
    sourceDirs;
    excludedDirs;
    applyEndpoints;
    lowerCaseEvents;
    eventDefinitions;
    constructor(sourceDirs, excludedDirs, applyEndpoints, lowerCaseEvents) {
        this.sourceDirs = sourceDirs;
        this.excludedDirs = excludedDirs;
        this.applyEndpoints = applyEndpoints;
        this.lowerCaseEvents = lowerCaseEvents;
        this.eventDefinitions = new Map();
    }
    toRipGrepOption(dir) {
        while (dir.startsWith('/') || dir.startsWith('\\')) {
            dir = dir.substr(1);
        }
        return ['--glob', `!${dir}/**`];
    }
    extractComments(absoluteFilePaths, commentMatcher, collector) {
        absoluteFilePaths.forEach(absoluteFilePath => {
            if (absoluteFilePath) {
                const fileContents = fs.readFileSync(absoluteFilePath).toString();
                let match;
                while ((match = commentMatcher.exec(fileContents))) {
                    collector(absoluteFilePath, match, fileContents);
                }
            }
        });
    }
    // Converts relative paths to absolute utilizing the CWD
    asAbsoluteFilePaths(relativeFilePaths) {
        return relativeFilePaths.map(r => path.resolve(r));
    }
    // Finds all files containing common telemetry properties in the given directory
    findFilesWithCommonProperties(sourceDir) {
        const ripgrepPattern = '//\\s*__GDPR__COMMON__';
        return this.findFiles(ripgrepPattern, sourceDir);
    }
    findCommonProperties(sourceDir) {
        const filesWithCommonProperties = this.asAbsoluteFilePaths(this.findFilesWithCommonProperties(sourceDir));
        const commonPropertyMatcher = /\/\/\s*__GDPR__COMMON__(.*)$/mg;
        const commonPropertyDeclarations = new common_properties_1.CommonProperties();
        this.extractComments(filesWithCommonProperties, commonPropertyMatcher, (filePath, match) => {
            try {
                const commonPropertyDeclaration = JSON.parse(`{ ${match[1]} }`);
                const propertyName = Object.keys(commonPropertyDeclaration)[0];
                const properties = commonPropertyDeclaration[propertyName];
                // Add all the common properties to the common property object
                const prop = new common_properties_1.Property(propertyName, properties.classification, properties.purpose);
                if (this.applyEndpoints) {
                    const endpoint = properties.endPoint ? properties.endPoint : 'none';
                    prop.endPoint = endpoint;
                }
                if (properties.isMeasurement) {
                    prop.isMeasurement = properties.isMeasurement;
                }
                commonPropertyDeclarations.properties.push(prop);
            }
            catch (error) {
                console.error(`Common Property Declaration Error: ${error} in file ${filePath}`);
                console.error(`Source comment:\n${match[0]}`);
                process.exitCode = 1;
            }
        });
        return commonPropertyDeclarations;
    }
    // Finds all files containing event fragments in the given directory
    findFilesWithFragments(sourceDir) {
        const ripgrepPattern = '/\\*\\s*__GDPR__FRAGMENT__';
        return this.findFiles(ripgrepPattern, sourceDir);
    }
    ///
    findFragments(sourceDir) {
        const filesWithFragments = this.asAbsoluteFilePaths(this.findFilesWithFragments(sourceDir));
        // Using [\s\S]* instead of .* since the latter does not match when using /m option
        const fragmentMatcher = /\/\*\s*__GDPR__FRAGMENT__([\s\S]*?)\*\//mg;
        const fragmentDeclarations = new fragments_1.Fragments();
        this.extractComments(filesWithFragments, fragmentMatcher, (filePath, match) => {
            try {
                const fragmentDeclaration = JSON.parse(`{ ${match[1]} }`);
                // There's only ever one key per match
                const fragmentName = Object.keys(fragmentDeclaration)[0];
                // Checks to see if we have a fragment of the given name, else creates.
                const fragment = (0, operations_1.findOrCreate)(fragmentDeclarations, fragmentName);
                const fragmentProperties = fragmentDeclaration[fragmentName];
                (0, operations_1.populateProperties)(fragmentProperties, fragment, this.applyEndpoints);
            }
            catch (error) {
                console.error(`Fragment Declaration Error: ${error} in file ${filePath}`);
                console.error(`Source comment:\n${match[0]}`);
                process.exitCode = 1;
            }
        });
        return fragmentDeclarations;
    }
    // Find all files with complete events
    findFilesWithEvents(sourceDir) {
        const ripgrepPattern = '/\\*\\s*__GDPR__\\b';
        return this.findFiles(ripgrepPattern, sourceDir);
    }
    findEvents(sourceDir) {
        const filesWithEvents = this.asAbsoluteFilePaths(this.findFilesWithEvents(sourceDir));
        // Using [\s\S]* instead of .* since the latter does not match when using /m option
        const eventMatcher = /\/\*\s*__GDPR__\b([\s\S]*?)\*\//mg;
        const eventDeclarations = new events_1.Events();
        this.extractComments(filesWithEvents, eventMatcher, (filePath, match, fileContents) => {
            try {
                const eventDeclaration = JSON.parse(`{ ${match[1]} }`);
                let eventName = Object.keys(eventDeclaration)[0];
                eventName = this.lowerCaseEvents ? eventName.toLowerCase() : eventName;
                const eventProperties = eventDeclaration[Object.keys(eventDeclaration)[0]];
                const conflictProperties = this.extractConflictProperties(eventProperties);
                const lineNumber = this.getLineNumber(fileContents, match.index);
                this.addEventDefinition(eventName, conflictProperties, `${filePath}:${lineNumber}`);
                const event = new events_1.Event(eventName);
                if (event instanceof events_1.Event && eventProperties['$tableInfo'] !== undefined) {
                    const tableInfo = events_1.TableInfo.fromObject(eventProperties['$tableInfo']);
                    if (tableInfo) {
                        event.tableInfo = tableInfo;
                    }
                }
                // Get the propeties which the event possesses
                (0, operations_1.populateProperties)(eventProperties, event, this.applyEndpoints);
                const currentDeclaration = new events_1.Events();
                currentDeclaration.dataPoints.push(event);
                (0, operations_1.merge)(eventDeclarations, currentDeclaration);
            }
            catch (error) {
                console.error(`Event Declaration Error: ${error} in file ${filePath}`);
                console.error(`Source comment:\n${match[0]}`);
                process.exitCode = 1;
            }
        });
        return eventDeclarations;
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
    getLineNumber(fileContents, index) {
        if (index === undefined) {
            return 1;
        }
        return fileContents.slice(0, index).split(/\r\n|\r|\n/).length;
    }
    // Utilizes a regex to find the files containing the specific pattern
    findFiles(ripgrepPattern, sourceDir) {
        const relativeExclusions = (0, operations_1.makeExclusionsRelativeToSource)(sourceDir, this.excludedDirs);
        const exclusions = relativeExclusions.length === 0 || relativeExclusions[0] === '' ? [] : relativeExclusions.map(this.toRipGrepOption).flat();
        const ripgrepArgs = ['--files-with-matches', '--glob', '*.ts', '--glob', '*.tsx', '--glob', '*.cs', ...exclusions, '--regexp', ripgrepPattern, '--', sourceDir];
        try {
            const filePaths = cp.execFileSync(ripgrep_1.rgPath, ripgrepArgs, { encoding: 'ascii', cwd: `${sourceDir}` });
            return (0, ripgrep_2.parseRipgrepFilePaths)(filePaths);
        }
        catch {
            // ripgrep's return code != 0 if there are no matches
            return [];
        }
    }
    async parse(sourceDir) {
        const fragments = this.findFragments(sourceDir);
        const events = this.findEvents(sourceDir);
        const commonProperties = this.findCommonProperties(sourceDir);
        return { fragments: fragments, events: events, commonProperties: commonProperties };
    }
    extractDeclarations() {
        return new Promise((resolve) => {
            // Find all the properties for all files
            const promises = this.sourceDirs.map(sd => this.parse(sd));
            // Now we must merge them into one superset of all declarations
            Promise.all(promises).then(parseResult => {
                const declarations = { fragments: new fragments_1.Fragments(), events: new events_1.Events(), commonProperties: new common_properties_1.CommonProperties() };
                for (const currentResult of parseResult) {
                    (0, operations_1.merge)(declarations.fragments, currentResult.fragments);
                    (0, operations_1.merge)(declarations.events, currentResult.events);
                    // We just concatenate common properties
                    declarations.commonProperties.properties = declarations.commonProperties.properties.concat(currentResult.commonProperties.properties);
                }
                return resolve(declarations);
            });
        });
    }
}
exports.Parser = Parser;
//# sourceMappingURL=parser.js.map