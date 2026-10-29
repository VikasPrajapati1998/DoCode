#!/usr/bin/env node
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
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
const cli_options_1 = require("./cli-options");
const path = __importStar(require("path"));
const process_1 = require("process");
const save_declarations_1 = require("./lib/save-declarations");
const source_spec_1 = require("./lib/source-spec");
const logger_1 = require("./lib/logger");
if (cli_options_1.options.config) {
    const sourceSpecs = (0, source_spec_1.convertConfigToSourceSpecs)(cli_options_1.options.config);
    (0, save_declarations_1.extractAndResolveDeclarations)(sourceSpecs).then((declarations) => {
        if (cli_options_1.options.outputDir) {
            (0, save_declarations_1.writeToFile)(cli_options_1.options.outputDir, declarations, cli_options_1.options.fileName || 'config-resolved', !cli_options_1.options.silent);
        }
        else {
            console.log(JSON.stringify(declarations));
        }
    });
}
else if (cli_options_1.options.help || !cli_options_1.options.sourceDir) {
    Promise.resolve().then(() => __importStar(require('./cli-help')));
}
else {
    const parserOptions = {
        eventPrefix: cli_options_1.options.eventPrefix,
        applyEndpoints: cli_options_1.options.applyEndpoints,
        patchDebugEvents: false,
        lowerCaseEvents: cli_options_1.options.lowerCaseEvents,
        silenceOutput: cli_options_1.options.silenceOutput,
        verbose: cli_options_1.options.verbose
    };
    (0, logger_1.logMessage)('....running.', parserOptions.silenceOutput);
    const sourceSpec = {
        sourceDirs: resolveDirectories(cli_options_1.options.sourceDir),
        excludedDirs: cli_options_1.options.excludedDir ? resolveDirectories(cli_options_1.options.excludedDir) : [],
        parserOptions: parserOptions
    };
    (0, save_declarations_1.extractAndResolveDeclarations)([sourceSpec]).then((declarations) => {
        if (cli_options_1.options.outputDir) {
            const tableInfos = declarations.tableInfos;
            const gdprDeclarations = { ...declarations };
            delete gdprDeclarations.tableInfos;
            (0, save_declarations_1.writeToFile)(cli_options_1.options.outputDir, gdprDeclarations, cli_options_1.options.fileName || 'declarations-resolved', !cli_options_1.options.silent);
            if (cli_options_1.options.tableInfo) {
                (0, save_declarations_1.writeToFile)(cli_options_1.options.outputDir, tableInfos, cli_options_1.options.fileName ? cli_options_1.options.fileName + '-tableInfo' : 'tableInfo', !cli_options_1.options.silent);
            }
        }
        else {
            console.log(JSON.stringify(declarations));
        }
    });
}
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
//# sourceMappingURL=extractor.js.map