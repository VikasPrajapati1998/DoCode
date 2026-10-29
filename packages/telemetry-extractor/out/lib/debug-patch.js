"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.patchDebugEvents = void 0;
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
const events_1 = require("./events");
const common_properties_1 = require("./common-properties");
function patchDebugEvents(currentEvents, eventPrefix) {
    const debugProtocolErrorResponse = new events_1.Event(eventPrefix + 'debugProtocolErrorResponse');
    debugProtocolErrorResponse.properties.push(new common_properties_1.Property('error', 'CallstackOrException', 'PerformanceAndHealth'));
    const optin = new events_1.Event(eventPrefix + 'optinstatus');
    optin.properties.push(new common_properties_1.Property('optin', 'SystemMetaData', 'BusinessInsight', undefined, undefined, undefined, undefined, true));
    currentEvents.dataPoints.push(debugProtocolErrorResponse);
    currentEvents.dataPoints.push(optin);
}
exports.patchDebugEvents = patchDebugEvents;
//# sourceMappingURL=debug-patch.js.map