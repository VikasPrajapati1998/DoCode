"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
const worker_threads_1 = require("worker_threads");
const ts_morph_1 = require("ts-morph");
const ts_parser_1 = require("./ts-parser");
if (!worker_threads_1.parentPort) {
    throw new Error('Telemetry parser worker requires a parent');
}
const request = worker_threads_1.workerData;
const project = new ts_morph_1.Project({ compilerOptions: request.compilerOptions });
let result;
if (request.kind === 'prepare') {
    for (const file of request.sourceFiles) {
        project.addSourceFileAtPathIfExists(file);
    }
    result = new ts_parser_1.TsProjectParser(project, false, false).prepare();
}
else if (request.kind === 'parse') {
    // Keep global declarations and module augmentations visible in every batch.
    for (const file of request.sharedSourceFiles) {
        project.addSourceFileAtPath(file);
    }
    for (const group of request.calls) {
        project.addSourceFileAtPath(group.filePath);
    }
    const parser = new ts_parser_1.TsProjectParser(project, request.applyEndpoints, request.lowerCaseEvents, request.definitions);
    result = {
        kind: 'parsed',
        events: parser.parseFiles(request.calls, request.events),
        definitions: [...parser.getEventDefinitions()]
    };
}
else {
    throw new Error('Unknown telemetry parser worker request');
}
worker_threads_1.parentPort.postMessage(result);
//# sourceMappingURL=ts-parser-worker.js.map