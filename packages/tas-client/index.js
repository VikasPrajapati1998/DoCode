"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.TargetPopulation = exports.getExperimentationServiceAsync = exports.getExperimentationService = void 0;
var DoCodeTasClient_1 = require("./docode-tas-client/DoCodeTasClient");
Object.defineProperty(exports, "getExperimentationService", { enumerable: true, get: function () { return DoCodeTasClient_1.getExperimentationService; } });
Object.defineProperty(exports, "getExperimentationServiceAsync", { enumerable: true, get: function () { return DoCodeTasClient_1.getExperimentationServiceAsync; } });
var DoCodeFilterProvider_1 = require("./docode-tas-client/DoCodeFilterProvider");
Object.defineProperty(exports, "TargetPopulation", { enumerable: true, get: function () { return DoCodeFilterProvider_1.TargetPopulation; } });
//# sourceMappingURL=index.js.map