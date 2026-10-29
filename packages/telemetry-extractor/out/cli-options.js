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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.options = exports.optionDefinitions = void 0;
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
const command_line_args_1 = __importDefault(require("command-line-args"));
const path = __importStar(require("path"));
function resolveDirectories(options) {
    const cwd = process.cwd();
    if (options.sourceDir) {
        options.sourceDir = options.sourceDir.map(d => path.resolve(cwd, d));
    }
    if (options.outputDir) {
        options.outputDir = path.resolve(cwd, options.outputDir);
    }
    return options;
}
exports.optionDefinitions = [
    { name: 'sourceDir', alias: 's', description: 'The folder which you want to extract telemetry from (relative to the CWD)', type: String, multiple: true },
    { name: 'excludedDir', alias: 'x', description: 'A subdirectory which you would like to exclude from the extraction (relative to the CWD)', type: String, multiple: true, defaultValue: [] },
    { name: 'config', alias: 'c', description: 'A JSON Configuration file containing extraction details', type: String },
    { name: 'outputDir', alias: 'o', description: 'The directory which you would like the outputted JSON file to be placed in', type: String },
    { name: 'fileName', alias: 'f', description: 'The name of the outputted JSON file', type: String },
    { name: 'eventPrefix', alias: 'p', type: String, description: 'The string you wish to prepend to every telemetry event.', defaultValue: '' },
    { name: 'help', alias: 'h', type: Boolean, description: 'Displays the help dialog which provides more information on how to use the tool', defaultValue: false },
    { name: 'applyEndpoints', alias: 'e', type: Boolean, defaultValue: false },
    { name: 'silenceOutput', type: Boolean, description: 'Silences all progress messages.', defaultValue: false },
    { name: 'lowerCaseEvents', alias: 'l', type: Boolean, defaultValue: false },
    { name: 'verbose', alias: 'v', type: Boolean, defaultValue: false },
    { name: 'tableInfo', alias: 't', type: Boolean, description: 'Outputs Kusto table information. If no filename is specified the default file name with -tableInfo is used.', defaultValue: false }
];
exports.options = resolveDirectories((0, command_line_args_1.default)(exports.optionDefinitions, { partial: true }));
//# sourceMappingURL=cli-options.js.map