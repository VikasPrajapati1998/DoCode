"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logMessage = void 0;
function logMessage(msg, silenceOutput = false) {
    if (!silenceOutput) {
        console.log(msg);
    }
}
exports.logMessage = logMessage;
//# sourceMappingURL=logger.js.map