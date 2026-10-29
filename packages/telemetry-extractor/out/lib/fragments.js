"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Fragment = exports.Fragments = void 0;
// Fragments are retrieved as an object of objects of objects. So this just makes it easier to see the structure.
class Fragments {
    dataPoints;
    constructor() {
        this.dataPoints = [];
    }
}
exports.Fragments = Fragments;
class Fragment {
    name;
    properties;
    constructor(name) {
        this.name = name;
        this.properties = [];
    }
}
exports.Fragment = Fragment;
//# sourceMappingURL=fragments.js.map