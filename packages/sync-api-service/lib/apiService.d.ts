import * as docode from 'docode';
import { ServiceConnection, Requests } from '@docode/sync-api-common';
declare type ApiServiceConnection = ServiceConnection<Requests>;
export declare enum TerminalMode {
    idle = 1,
    inUse = 2
}
export interface ServicePseudoTerminal<D = any> extends docode.Pseudoterminal {
    readonly onDidCtrlC: docode.Event<void>;
    readonly onDidClose: docode.Event<void>;
    readonly onAnyKey: docode.Event<void>;
    setMode(mode: TerminalMode): void;
    setName(name: string): void;
    write(str: string): void;
    readline(): Promise<string>;
    data: D;
}
export declare namespace ServicePseudoTerminal {
    function create<D = any>(mode: TerminalMode): ServicePseudoTerminal<D>;
}
export declare type Options = {
    /**
     * A handler that is called when the WASM exists
     */
    exitHandler?: (rval: number) => void;
    /**
     * Whether to echo the service name in the terminal
     */
    echoName?: boolean;
    /**
     * The pty to use. If not provided a very simple PTY implementation that
     * only supports backspace is used.
     */
    pty?: ServicePseudoTerminal;
};
export declare class ApiService {
    private readonly connection;
    private readonly options;
    private readonly textEncoder;
    private readonly textDecoder;
    private readonly pty;
    constructor(_name: string, receiver: ApiServiceConnection, options?: Options);
    getPty(): docode.Pseudoterminal;
    private asFileSystemError;
}
export {};
