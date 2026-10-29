import { IKeyValueStorage } from 'tas-client';
import * as docode from 'docode';
export declare class MementoKeyValueStorage implements IKeyValueStorage {
    private mementoGlobalStorage;
    constructor(mementoGlobalStorage: docode.Memento);
    getValue<T>(key: string, defaultValue?: T | undefined): Promise<T | undefined>;
    setValue<T>(key: string, value: T): void;
}
