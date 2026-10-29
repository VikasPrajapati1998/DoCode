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
exports.writeFile = void 0;
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
/**
 * @param {string} outputFile
 * @param {string} contents
 * @returns {Promise}
 */
async function writeFile(outputFile, contents) {
    const directory = path.dirname(outputFile);
    return mkdirp(directory).then(() => {
        return new Promise((resolve, reject) => {
            fs.writeFile(outputFile, contents, { encoding: 'utf8' }, (err) => {
                if (err) {
                    reject(err);
                }
                else {
                    resolve();
                }
            });
        });
    });
}
exports.writeFile = writeFile;
// copied from https://github.com/Microsoft/vscode/blob/master/src/main.js#L139
async function mkdirp(dir) {
    return mkdir(dir)
        .then(null, function (err) {
        if (err && err.code === 'ENOENT') {
            const parent = path.dirname(dir);
            if (parent !== dir) { // if not arrived at root
                return mkdirp(parent)
                    .then(function () {
                    return mkdir(dir);
                });
            }
        }
        throw err;
    });
}
// copied from https://github.com/Microsoft/vscode/blob/master/src/main.js#L155
async function mkdir(dir) {
    return new Promise(function (resolve, reject) {
        fs.mkdir(dir, function (err) {
            if (err && err.code !== 'EEXIST') {
                reject(err);
            }
            else {
                resolve(dir);
            }
        });
    });
}
//# sourceMappingURL=file-writer.js.map