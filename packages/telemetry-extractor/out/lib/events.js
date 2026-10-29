"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Metadata = exports.WildcardEntry = exports.Wildcard = exports.Inline = exports.Include = exports.Event = exports.TableInfo = exports.Events = void 0;
class Events {
    dataPoints;
    constructor() {
        this.dataPoints = [];
    }
}
exports.Events = Events;
var TableInfo;
(function (TableInfo) {
    function fromObject(obj) {
        if (typeof obj !== 'object' || obj === null) {
            return undefined;
        }
        const candidate = obj;
        if (typeof candidate.name !== 'string') {
            return undefined;
        }
        const result = {
            name: candidate.name,
            commonProperties: 'standard',
            backfill: false
        };
        if (candidate.commonProperties === 'standard') {
            result.commonProperties = 'standard';
        }
        if (typeof candidate.backfill === 'boolean' || typeof candidate.backfill === 'string') {
            result.backfill = candidate.backfill;
        }
        return result;
    }
    TableInfo.fromObject = fromObject;
})(TableInfo || (exports.TableInfo = TableInfo = {}));
class Event {
    name;
    // It gets a little more complicated here as events can have a bunch of different things
    properties;
    tableInfo;
    constructor(name) {
        this.name = name;
        this.properties = [];
        this.tableInfo = undefined;
    }
}
exports.Event = Event;
class Include {
    includeNames;
    constructor(includeNames) {
        this.includeNames = includeNames;
    }
}
exports.Include = Include;
class Inline {
    inlineName;
    inlines;
    constructor(name, inlines) {
        this.inlineName = name;
        this.inlines = inlines;
    }
}
exports.Inline = Inline;
class Wildcard {
    entries;
    constructor() {
        this.entries = [];
    }
}
exports.Wildcard = Wildcard;
class WildcardEntry {
    prefix;
    classification;
    endpoint;
    constructor(prefix, classification, endPoint) {
        this.prefix = prefix;
        this.classification = classification;
        this.endpoint = endPoint;
    }
}
exports.WildcardEntry = WildcardEntry;
class Metadata {
    name;
    value;
    constructor(name, value) {
        this.name = name;
        this.value = value;
    }
    simpleObject() {
        const simple = Object.create(null);
        simple[this.name] = this.value;
        return simple;
    }
}
exports.Metadata = Metadata;
//# sourceMappingURL=events.js.map