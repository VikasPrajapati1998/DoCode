"use strict";
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseRipgrepFilePaths = void 0;
function parseRipgrepFilePaths(output) {
    // Sorting after ripgrep exits preserves its parallel filesystem traversal.
    return output
        .split(/(?:\r\n|\r|\n)/g)
        .filter(filePath => filePath.length > 0)
        .sort();
}
exports.parseRipgrepFilePaths = parseRipgrepFilePaths;
//# sourceMappingURL=ripgrep.js.map