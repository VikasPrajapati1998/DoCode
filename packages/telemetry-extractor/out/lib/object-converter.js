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
exports.transformTypeScriptDeclaration = exports.transformOutput = void 0;
const common_properties_1 = require("./common-properties");
const events_1 = require("./events");
const keywords = __importStar(require("./keywords"));
async function transformOutput(output) {
    // If there's no events or common properties, we emit a null object
    if (output.events.dataPoints.length === 0 && output.commonProperties.properties.length === 0) {
        return { events: Object.create(null), commonProperties: Object.create(null), tableInfos: {} };
    }
    const newEvents = Object.create(null);
    const oldEvents = output.events.dataPoints;
    const tableInfos = {};
    for (const event of oldEvents) {
        // Check if event.name ends with a number, if so throw an error because we don't support event names which end with numbers
        if (/\d$/.test(event.name)) {
            throw new Error(`Event name ${event.name} ends with a number. Event names cannot end with numbers.`);
        }
        newEvents[event.name] = Object.create(null);
        const tableInfo = event.tableInfo ? { ...event.tableInfo, columns: [] } : undefined;
        if (tableInfo) {
            tableInfos[tableInfo.name] = tableInfo;
        }
        //We know there won't be anymore includes or inlines because we have resolved them
        for (const property of event.properties) {
            if (property instanceof events_1.Wildcard) {
                newEvents[event.name][keywords.wildcard] = newEvents[event.name][keywords.wildcard] ? newEvents[event.name][keywords.wildcard] : [];
                for (const entry of property.entries) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const found = newEvents[event.name][keywords.wildcard].find((e) => {
                        return e[keywords.prefix] === entry.prefix.toLowerCase();
                    });
                    if (found)
                        continue;
                    const newEntry = Object.create(null);
                    newEntry[keywords.prefix] = entry.prefix.toLowerCase();
                    if (entry.endpoint) {
                        newEntry[keywords.classification] = { classification: entry.classification.classification, purpose: entry.classification.purpose, endPoint: "none" };
                    }
                    else {
                        newEntry[keywords.classification] = entry.classification;
                    }
                    newEvents[event.name][keywords.wildcard].push(newEntry);
                }
            }
            else if (property instanceof common_properties_1.Property) {
                // Check if property name is 'value' and throw an error if it is
                if (propetyNameChanger(property.name) === 'value') {
                    throw new Error(`Property name 'value' is reserved and cannot be used due to conflicts with the SDK. Please rename the property.`);
                }
                // Handles the case where the comments can be inconsistent
                // We want to ensure that if isMeasurement is ever flagged it gets propogated
                if (newEvents[event.name][propetyNameChanger(property.name)]) {
                    if (property.isMeasurement)
                        newEvents[event.name][propetyNameChanger(property.name)]['isMeasurement'] = property.isMeasurement;
                    continue;
                }
                newEvents[event.name][propetyNameChanger(property.name)] = { classification: property.classification, purpose: property.purpose };
                if (property.expiration) {
                    newEvents[event.name][propetyNameChanger(property.name)]['expiration'] = property.expiration;
                }
                if (property.owner) {
                    newEvents[event.name][propetyNameChanger(property.name)]['owner'] = property.owner;
                }
                if (property.comment) {
                    newEvents[event.name][propetyNameChanger(property.name)]['comment'] = property.comment;
                }
                if (property.endPoint) {
                    newEvents[event.name][propetyNameChanger(property.name)]['endPoint'] = property.endPoint;
                }
                if (property.isMeasurement) {
                    newEvents[event.name][propetyNameChanger(property.name)]['isMeasurement'] = property.isMeasurement;
                }
                if (tableInfo !== undefined && property.column) {
                    const name = property.column.name ?? property.name;
                    tableInfo.columns.push({ name, type: property.column.type, bag: { name: property.name.toLowerCase(), store: property.isMeasurement === true ? 'Measures' : 'Properties' } });
                }
            }
            else {
                // Comments, expiration, and owner metadata are handled here
                newEvents[event.name][propetyNameChanger(property.name)] = property.value;
            }
        }
        if (tableInfo !== undefined) {
            tableInfos[tableInfo.name] = tableInfo;
        }
    }
    const newCommonProperties = Object.create(null);
    const oldCommonProperties = output.commonProperties.properties;
    for (const property of oldCommonProperties) {
        // Handles the case where the comments can be incosistent
        // We want to ensure that if isMeasurement is ever flagged it gets propogated
        if (newCommonProperties[propetyNameChanger(property.name)]) {
            if (property.isMeasurement)
                newCommonProperties[propetyNameChanger(property.name)]['isMeasurement'] = property.isMeasurement;
            continue;
        }
        newCommonProperties[propetyNameChanger(property.name)] = { classification: property.classification, purpose: property.purpose };
        if (property.endPoint) {
            newCommonProperties[propetyNameChanger(property.name)]['endPoint'] = property.endPoint;
        }
        if (property.isMeasurement) {
            newCommonProperties[propetyNameChanger(property.name)]['isMeasurement'] = property.isMeasurement;
        }
    }
    return { events: newEvents, commonProperties: newCommonProperties, tableInfos };
}
exports.transformOutput = transformOutput;
function transformTypeScriptDeclaration(declaration) {
    // The property names in the TS events are already all lowercased.
    const tableInfoProperty = declaration['$tableinfo'];
    let tableInfo = undefined;
    if (tableInfoProperty !== undefined) {
        delete declaration['$tableinfo'];
        const json = events_1.TableInfo.fromObject(tableInfoProperty);
        if (json !== undefined) {
            tableInfo = { name: json.name, commonProperties: json.commonProperties, backfill: json.backfill, columns: [] };
        }
    }
    for (const name of Object.keys(declaration)) {
        if (name === '$tableinfo') {
            continue;
        }
        const property = declaration[name];
        if (!property || typeof property !== 'object') {
            continue;
        }
        if (tableInfo !== undefined) {
            if (property.column !== undefined) {
                if (common_properties_1.ColumnInfo.is(property.column)) {
                    const type = common_properties_1.ColumnType.fromString(property.column.type);
                    if (type !== undefined) {
                        const bag = { store: property.isMeasurement === true ? 'Measures' : 'Properties', name: name };
                        tableInfo.columns.push({ name: property.column.name ?? name, type: type, bag });
                    }
                }
            }
            else if (typeof property.type === 'string') {
                const columnType = common_properties_1.ColumnType.fromString(property.type);
                if (columnType) {
                    const bag = { store: property.isMeasurement === true ? 'Measures' : 'Properties', name: name };
                    tableInfo.columns.push({ name: name, type: columnType, bag });
                }
            }
        }
        delete property.type;
        delete property.column;
    }
    return { declaration, tableInfo };
}
exports.transformTypeScriptDeclaration = transformTypeScriptDeclaration;
function propetyNameChanger(name) {
    name = name.toLowerCase();
    if (name.includes('<number>')) {
        name = name.replace('<number>', '<NUMBER>');
    }
    return name;
}
//# sourceMappingURL=object-converter.js.map