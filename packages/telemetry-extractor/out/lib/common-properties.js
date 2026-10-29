"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Property = exports.ColumnInfo = exports.ColumnType = exports.CommonProperties = void 0;
class CommonProperties {
    properties;
    constructor() {
        this.properties = [];
    }
}
exports.CommonProperties = CommonProperties;
var ColumnType;
(function (ColumnType) {
    function fromString(type) {
        switch (type.toLowerCase()) {
            case 'bool':
            case 'boolean':
                return 'bool';
            case 'int':
                return 'int';
            case 'long':
                return 'long';
            case 'real':
            case 'double':
                return 'real';
            case 'decimal':
                return 'decimal';
            case 'dynamic':
                return 'dynamic';
            case 'guid':
            case 'uuid':
            case 'uniqueid':
                return 'guid';
            case 'string':
                return 'string';
            case 'datetime':
            case 'date':
                return 'datetime';
            case 'timespan':
            case 'time':
                return 'timespan';
            default:
                return undefined;
        }
    }
    ColumnType.fromString = fromString;
})(ColumnType || (exports.ColumnType = ColumnType = {}));
var ColumnInfo;
(function (ColumnInfo) {
    function is(obj) {
        const candidate = obj;
        return !!candidate &&
            (candidate.name === undefined || typeof candidate.name === 'string') &&
            typeof candidate.type === 'string' && ColumnType.fromString(candidate.type) !== undefined;
    }
    ColumnInfo.is = is;
})(ColumnInfo || (exports.ColumnInfo = ColumnInfo = {}));
class Property {
    name;
    classification;
    purpose;
    endPoint;
    isMeasurement;
    expiration;
    owner;
    comment;
    // The name and type of the property if mirrored into a flat table in Kusto.
    // Needs to be removed when generating the patch for the GDPR catalog as
    // flat table properties are not allowed in the catalog.
    column;
    constructor(name, classification, purpose, expiration, owner, comment, endpoint, isMeasurement) {
        this.name = name;
        this.classification = classification;
        this.purpose = purpose;
        this.endPoint = endpoint;
        this.isMeasurement = isMeasurement;
        this.expiration = expiration;
        this.owner = owner;
        this.comment = comment;
    }
}
exports.Property = Property;
//# sourceMappingURL=common-properties.js.map