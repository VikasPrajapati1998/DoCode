import { URI } from 'vscode-uri';
import { ClientConnection, Requests, DTOs } from '@docode/sync-api-common';
import * as docode from './docode';
export interface Timer {
    sleep(ms: number): void;
}
export interface Process {
    procExit(rval: number): void;
}
export interface FileSystem {
    stat(uri: URI): docode.FileStat;
    readFile(uri: URI): Uint8Array;
    writeFile(uri: URI, content: Uint8Array): void;
    readDirectory(uri: URI): DTOs.DirectoryEntries;
    createDirectory(uri: URI): void;
    delete(uri: URI, options?: {
        recursive?: boolean;
        useTrash?: boolean;
    }): void;
    rename(source: URI, target: URI, options?: {
        overwrite?: boolean;
    }): void;
}
export interface Window {
    activeTextDocument: docode.TextDocument | undefined;
}
export interface Workspace {
    workspaceFolders: docode.WorkspaceFolder[];
    fileSystem: FileSystem;
}
export interface Terminal {
    write(value: string, encoding?: string): void;
    write(value: Uint8Array): void;
    read(): Uint8Array;
}
declare type ApiClientConnection = ClientConnection<Requests>;
export declare class ApiClient {
    private readonly connection;
    private readonly encoder;
    readonly timer: Timer;
    readonly process: Process;
    readonly docode: {
        readonly terminal: Terminal;
        readonly window: Window;
        readonly workspace: Workspace;
    };
    constructor(connection: ApiClientConnection);
}
export {};
