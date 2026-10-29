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
exports.makeExclusionsRelativeToSource = exports.populateProperties = exports.mergeWildcards = exports.findOrCreate = exports.merge = void 0;
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
const fragments_1 = require("./fragments");
const events_1 = require("./events");
const common_properties_1 = require("./common-properties");
const keywords = __importStar(require("./keywords"));
const path = __importStar(require("path"));
function merge(target, source) {
    for (const item of source.dataPoints) {
        const found = target.dataPoints.find((f) => {
            return f.name == item.name;
        });
        // We combine their properties together if the event already exists
        if (found) {
            if (target instanceof events_1.Events && source instanceof events_1.Events && found instanceof events_1.Event && item instanceof events_1.Event) {
                if (!eventsAreCompatible(found, item)) {
                    continue;
                }
                if (found.tableInfo === undefined) {
                    found.tableInfo = item.tableInfo;
                }
                // Merge unique properties from source into target
                for (const prop of item.properties) {
                    if (prop instanceof common_properties_1.Property) {
                        const exists = found.properties.some(p => p instanceof common_properties_1.Property && p.name === prop.name);
                        if (!exists) {
                            found.properties.push(prop);
                        }
                    }
                    else if (prop instanceof events_1.Metadata) {
                        const exists = found.properties.some(p => p instanceof events_1.Metadata && p.name === prop.name);
                        if (!exists) {
                            found.properties.push(prop);
                        }
                    }
                    else if (prop instanceof events_1.Include) {
                        const existingInclude = found.properties.find(p => p instanceof events_1.Include);
                        if (existingInclude) {
                            for (const name of prop.includeNames) {
                                if (!existingInclude.includeNames.includes(name)) {
                                    existingInclude.includeNames.push(name);
                                }
                            }
                        }
                        else {
                            found.properties.push(new events_1.Include([...prop.includeNames]));
                        }
                    }
                    else if (prop instanceof events_1.Inline) {
                        const exists = found.properties.some(p => p instanceof events_1.Inline && p.inlineName === prop.inlineName);
                        if (!exists) {
                            found.properties.push(prop);
                        }
                    }
                    else if (prop instanceof events_1.Wildcard) {
                        const existingWildcard = found.properties.find(p => p instanceof events_1.Wildcard);
                        if (existingWildcard) {
                            for (const entry of prop.entries) {
                                const entryExists = existingWildcard.entries.some(e => e.prefix === entry.prefix);
                                if (!entryExists) {
                                    existingWildcard.entries.push(entry);
                                }
                            }
                        }
                        else {
                            found.properties.push(prop);
                        }
                    }
                }
                continue;
            }
            found.properties = found.properties.concat(item.properties);
        }
        else {
            target.dataPoints.push(item);
        }
    }
}
exports.merge = merge;
function eventsAreCompatible(left, right) {
    for (const leftProp of left.properties) {
        if (!(leftProp instanceof common_properties_1.Property))
            continue;
        for (const rightProp of right.properties) {
            if (!(rightProp instanceof common_properties_1.Property))
                continue;
            if (leftProp.name === rightProp.name) {
                if (leftProp.classification !== rightProp.classification || leftProp.purpose !== rightProp.purpose) {
                    return false;
                }
            }
        }
    }
    return true;
}
// Searches the object for an event or fragment of the specific name
// If found returns, if not found creates it, places it in the array, and then returns
function findOrCreate(searchTarget, name) {
    let found = searchTarget.dataPoints.find((item) => {
        return item.name === name;
    });
    if (!found) {
        if (searchTarget instanceof events_1.Events) {
            found = new events_1.Event(name);
        }
        else {
            found = new fragments_1.Fragment(name);
        }
    }
    searchTarget.dataPoints.push(found);
    return found;
}
exports.findOrCreate = findOrCreate;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mergeWildcards(wildcard, target, applyEndpoints) {
    let wildCard = target.properties.find((item) => {
        return item instanceof events_1.Wildcard;
    });
    // if we don't have a wildcard yet we make one
    if (!wildCard) {
        wildCard = new events_1.Wildcard();
        target.properties.push(wildCard);
    }
    wildcard.forEach(w => {
        if (applyEndpoints) {
            wildCard.entries.push(new events_1.WildcardEntry(w[keywords.prefix], w[keywords.classification], 'none'));
        }
        else {
            wildCard.entries.push(new events_1.WildcardEntry(w[keywords.prefix], w[keywords.classification]));
        }
    });
}
exports.mergeWildcards = mergeWildcards;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function populateProperties(properties, target, applyEndpoints = false) {
    for (const propertyName in properties) {
        // Skip the `$tableInfo` property since it is an artificial property for the flat table support.
        if (propertyName === '$tableInfo') {
            continue;
        }
        const currentProperty = properties[propertyName];
        if (propertyName === keywords.include) {
            target.properties.push(new events_1.Include(currentProperty));
        }
        else if (currentProperty[keywords.inline]) {
            // We consider the property name the inline name so when we resolve we can do prop.Inline for the new properties
            target.properties.push(new events_1.Inline(propertyName, currentProperty[keywords.inline]));
        }
        else if (propertyName === keywords.wildcard) {
            mergeWildcards(currentProperty, target, applyEndpoints);
        }
        else if (propertyName === 'owner' || propertyName === 'comment' || propertyName === 'expiration') {
            // This is the special case when the property name matches one of our metadata properties
            target.properties.push(new events_1.Metadata(propertyName, currentProperty));
        }
        else {
            const prop = new common_properties_1.Property(propertyName, currentProperty.classification, currentProperty.purpose, currentProperty.expiration, currentProperty.owner, currentProperty.comment);
            if (applyEndpoints) {
                const endpoint = currentProperty.endpoint ? currentProperty.endpoint : 'none';
                prop.endPoint = endpoint;
            }
            if (currentProperty.isMeasurement) {
                prop.isMeasurement = currentProperty.isMeasurement;
            }
            if (typeof currentProperty.type === 'string') {
                const columnType = common_properties_1.ColumnType.fromString(currentProperty.type);
                if (columnType) {
                    prop.column = { type: columnType };
                }
            }
            else if (common_properties_1.ColumnInfo.is(currentProperty.column)) {
                const columnType = common_properties_1.ColumnType.fromString(currentProperty.column.type);
                if (columnType) {
                    prop.column = { name: currentProperty.column.name, type: columnType };
                }
            }
            target.properties.push(prop);
        }
    }
}
exports.populateProperties = populateProperties;
function makeExclusionsRelativeToSource(sourceDir, excludedDirs) {
    const relativeExclusions = [];
    for (const excluded of excludedDirs) {
        const rel = path.relative(sourceDir, excluded);
        // Only include if the excluded dir is actually under sourceDir
        if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) {
            // Normalize to forward slashes for ripgrep glob compatibility
            relativeExclusions.push(rel.split(path.sep).join('/'));
        }
    }
    return relativeExclusions;
}
exports.makeExclusionsRelativeToSource = makeExclusionsRelativeToSource;
//# sourceMappingURL=operations.js.map