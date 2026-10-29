export interface Disposable {
    dispose(): void;
}

export interface DoCodeEvent<T> {
    (listener: (e: T) => any, thisArgs?: any, disposables?: Disposable[]): Disposable;
}
