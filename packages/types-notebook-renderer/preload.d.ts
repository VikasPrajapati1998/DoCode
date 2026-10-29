import { DoCodeEvent } from "./events";

declare global {
    const onDidReceiveKernelMessage: DoCodeEvent<any>;
    function postKernelMessage(data: unknown): void;
}
