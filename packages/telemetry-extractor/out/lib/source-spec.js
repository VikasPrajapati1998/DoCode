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
exports.convertConfigToSourceSpecs = void 0;
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
const fs_1 = require("fs");
const path = __importStar(require("path"));
const process_1 = require("process");
;
function convertConfigToSourceSpecs(file) {
    try {
        const config = JSON.parse((0, fs_1.readFileSync)(file).toString());
        const sourceSpecs = [];
        for (const key in config) {
            const spec = config[key];
            // Some defaults
            spec.excludedDirs = spec.excludedDirs ? spec.excludedDirs : [];
            spec.workingDir = spec.workingDir ? spec.workingDir : (0, process_1.cwd)();
            spec.patchDebugEvents = spec.patchDebugEvents ? spec.patchDebugEvents : false;
            spec.lowerCaseEvents = spec.lowerCaseEvents ? spec.lowerCaseEvents : false;
            const parserOptions = {
                eventPrefix: spec.eventPrefix ? spec.eventPrefix : '',
                applyEndpoints: spec.applyEndpoints,
                patchDebugEvents: spec.patchDebugEvents,
                lowerCaseEvents: spec.lowerCaseEvents,
                silenceOutput: spec.silenceOuput,
                verbose: spec.verbose
            };
            const sourceSpec = {
                sourceDirs: resolveDirectories(spec.sourceDirs, spec.workingDir),
                excludedDirs: resolveDirectories(spec.excludedDirs, spec.workingDir),
                parserOptions: parserOptions
            };
            sourceSpecs.push(sourceSpec);
        }
        return sourceSpecs;
    }
    catch (err) {
        console.error(err);
        return [];
    }
}
exports.convertConfigToSourceSpecs = convertConfigToSourceSpecs;
// Resolves an array of paths
function resolveDirectories(dirs, workingDir) {
    if (workingDir) {
        if (path.isAbsolute(workingDir)) {
            return dirs.map(s => path.resolve(workingDir, s));
        }
        else {
            return dirs.map(s => path.resolve((0, process_1.cwd)(), workingDir, s));
        }
    }
    else {
        return dirs.map(s => path.resolve((0, process_1.cwd)(), s));
    }
}
//# sourceMappingURL=source-spec.js.map