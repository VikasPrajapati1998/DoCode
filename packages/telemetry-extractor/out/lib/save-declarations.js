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
exports.extractAndResolveDeclarations = exports.getResolvedDeclaration = exports.writeToFile = void 0;
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
const path = __importStar(require("path"));
const parser_1 = require("./parser");
const fileWriter = __importStar(require("./file-writer"));
const declarations_1 = require("./declarations");
const object_converter_1 = require("./object-converter");
const events_1 = require("./events");
const common_properties_1 = require("./common-properties");
const ts_parser_1 = require("./ts-parser");
const debug_patch_1 = require("./debug-patch");
const logger_1 = require("./logger");
const fragments_1 = require("./fragments");
function deepSortKeys(obj) {
    if (Array.isArray(obj)) {
        return obj.map(deepSortKeys);
    }
    if (obj !== null && typeof obj === 'object') {
        const sorted = Object.create(null);
        for (const key of Object.keys(obj).sort()) {
            sorted[key] = deepSortKeys(obj[key]);
        }
        return sorted;
    }
    return obj;
}
function writeToFile(outputDir, contents, fileName, emitProgressMessage) {
    if (Object.keys(contents).length === 0) {
        (0, logger_1.logMessage)(`...no events found, skipping file emmision!`, !emitProgressMessage);
        return;
    }
    const json = JSON.stringify(contents);
    const outputFile = path.resolve(outputDir, `${fileName}.json`);
    (0, logger_1.logMessage)(`...writing ${outputFile}`, !emitProgressMessage);
    return fileWriter.writeFile(outputFile, json);
}
exports.writeToFile = writeToFile;
async function getResolvedDeclaration(sourceDirs, excludedDirs, options) {
    (0, logger_1.logMessage)('...extracting', options.silenceOutput);
    const parser = new parser_1.Parser(sourceDirs, excludedDirs, options.applyEndpoints, options.lowerCaseEvents);
    let declarations = await parser.extractDeclarations();
    declarations = (0, declarations_1.resolveDeclarations)(declarations, options.verbose);
    return declarations;
}
exports.getResolvedDeclaration = getResolvedDeclaration;
/**
 * Validate the outputted declaration. Looks to ensure that an event property isn't overloaded by a common property
 * @param declarations The declaration output
 */
function validateOutputtedDeclarations(declarations) {
    const commonProperties = declarations.commonProperties;
    const events = declarations.events;
    let failedValidation = false;
    for (const event in events) {
        for (const property in events[event]) {
            if (commonProperties[property]) {
                failedValidation = true;
                console.error(`Property ${property} on event ${event} is overloaded by a common property`);
            }
        }
    }
    if (failedValidation) {
        return true;
    }
    return false;
}
function mergeEventDefinitions(target, definitions, source, prefix = '') {
    for (const [eventName, entries] of definitions.entries()) {
        const prefixedName = `${prefix}${eventName}`;
        const existing = target.get(prefixedName) ?? [];
        existing.push(...entries.map((entry) => ({ ...entry, source })));
        target.set(prefixedName, existing);
    }
}
function reportDuplicateEventConflicts(definitions) {
    let hasConflicts = false;
    for (const [eventName, entries] of definitions.entries()) {
        if (entries.length <= 1) {
            continue;
        }
        // Compatible declarations may add properties, but must agree on every overlapping output field.
        let eventHasConflict = false;
        for (let i = 0; i < entries.length && !eventHasConflict; i++) {
            for (let j = i + 1; j < entries.length && !eventHasConflict; j++) {
                for (const propName of Object.keys(entries[i].properties)) {
                    if (propName in entries[j].properties) {
                        const a = entries[i].properties[propName];
                        const b = entries[j].properties[propName];
                        if (JSON.stringify(deepSortKeys(a)) !== JSON.stringify(deepSortKeys(b))) {
                            eventHasConflict = true;
                            break;
                        }
                    }
                }
            }
        }
        if (eventHasConflict) {
            hasConflicts = true;
            const uniqueLocations = [...new Set(entries.map(entry => `${entry.location.replace(/\\/g, '/')} (${entry.source})`))];
            console.error(`Duplicate telemetry event declaration '${eventName}' has conflicting details at:`);
            uniqueLocations.forEach(location => console.error(` - ${location}`));
        }
    }
    return hasConflicts;
}
async function extractAndResolveDeclarations(sourceSpecs) {
    try {
        const allDeclarations = { events: new events_1.Events(), commonProperties: new common_properties_1.CommonProperties(), fragments: new fragments_1.Fragments() };
        const allTypeScriptDeclarations = Object.create(null);
        const allEventDefinitions = new Map();
        for (const spec of sourceSpecs) {
            (0, logger_1.logMessage)('...extracting', spec.parserOptions.silenceOutput);
            const parser = new parser_1.Parser(spec.sourceDirs, spec.excludedDirs, spec.parserOptions.applyEndpoints, spec.parserOptions.lowerCaseEvents);
            let declarations = await parser.extractDeclarations();
            declarations = (0, declarations_1.resolveDeclarations)(declarations, spec.parserOptions.verbose);
            let typescriptDeclarations = Object.create(null);
            // The parser does not know how to handle multiple source directories due to different TS configs, so we manually have to parse each source dir
            for (const dir of spec.sourceDirs) {
                const tsParser = new ts_parser_1.TsParser(dir, spec.excludedDirs, spec.parserOptions.applyEndpoints, spec.parserOptions.lowerCaseEvents);
                Object.assign(typescriptDeclarations, await tsParser.parseFiles());
                mergeEventDefinitions(allEventDefinitions, tsParser.getEventDefinitions(), 'TS', spec.parserOptions.eventPrefix);
            }
            if (spec.parserOptions.eventPrefix !== '') {
                declarations.events.dataPoints = declarations.events.dataPoints.map((event) => {
                    event.name = spec.parserOptions.eventPrefix + event.name;
                    return event;
                });
                const modifiedDeclartions = Object.create(null);
                // Modify the object keys to be prefixed with the specified prefix
                for (const key in typescriptDeclarations) {
                    modifiedDeclartions[spec.parserOptions.eventPrefix + key] = typescriptDeclarations[key];
                }
                typescriptDeclarations = modifiedDeclartions;
            }
            if (spec.parserOptions.patchDebugEvents) {
                (0, debug_patch_1.patchDebugEvents)(declarations.events, spec.parserOptions.eventPrefix);
            }
            // We concatenate each extensions properties into a central one
            // Throwing out fragments as they have already been used to resolve that extensions declarations
            allDeclarations.commonProperties.properties = allDeclarations.commonProperties.properties.concat(declarations.commonProperties.properties);
            allDeclarations.events.dataPoints = allDeclarations.events.dataPoints.concat(declarations.events.dataPoints);
            Object.assign(allTypeScriptDeclarations, typescriptDeclarations);
            mergeEventDefinitions(allEventDefinitions, parser.getEventDefinitions(), 'GDPR', spec.parserOptions.eventPrefix);
        }
        const hasDuplicateEventConflicts = reportDuplicateEventConflicts(allEventDefinitions);
        const formattedDeclarations = await (0, object_converter_1.transformOutput)(allDeclarations);
        for (const dec in allTypeScriptDeclarations) {
            // If there's typescript declarations but we returned a null object
            // We must add the event container to the declarations object
            if (formattedDeclarations.events === undefined) {
                formattedDeclarations.events = Object.create(null);
            }
            const transformed = (0, object_converter_1.transformTypeScriptDeclaration)(allTypeScriptDeclarations[dec]);
            formattedDeclarations.events[dec] = transformed.declaration;
            if (transformed.tableInfo) {
                const tableInfo = transformed.tableInfo;
                formattedDeclarations.tableInfos[tableInfo.name] = tableInfo;
            }
        }
        const hasPropertyValidationErrors = validateOutputtedDeclarations(formattedDeclarations);
        if (hasDuplicateEventConflicts || hasPropertyValidationErrors || process.exitCode === 1) {
            throw new Error('Validation failed, please see logs for more information');
        }
        return Promise.resolve(deepSortKeys(formattedDeclarations));
    }
    catch (error) {
        console.error(`Error: ${error}`);
        return Promise.reject(error);
    }
}
exports.extractAndResolveDeclarations = extractAndResolveDeclarations;
//# sourceMappingURL=save-declarations.js.map