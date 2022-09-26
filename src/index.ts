import * as ts from "typescript/lib/tsserverlibrary"
import { ApiClient, APIRequests, FileType } from '@vscode/sync-api-client';
import { ClientConnection, DTOs } from '@vscode/sync-api-common/browser';
import { Utils } from 'vscode-uri';

// To test this, I'll need to follow Matt's local testing instructions
// modified with localtunnal and serve to enable forwarding to allow SharedArray to work
// since it's backing the watsa
export function createServerHost(apiClient: ApiClient, args: string[]): ts.server.ServerHost {
    const root = apiClient.vscode.workspace.workspaceFolders[0].uri // TODO: Might need to be a thunk
    return {
        /**
         * @param pollingInterval ignored in native filewatchers; only used in polling watchers
         */
        watchFile(path: string, callback: ts.FileWatcherCallback, pollingInterval?: number, options?: ts.WatchOptions): ts.FileWatcher {
            // I don't think this works yet
            return null as never
        },
        watchDirectory(path: string, callback: ts.DirectoryWatcherCallback, recursive?: boolean, options?: ts.WatchOptions): ts.FileWatcher {
            // same
            return null as never
        },
        setTimeout(callback: (...args: any[]) => void, ms: number, ...args: any[]): any {
            return setTimeout(callback, ms, ...args)
        },
        clearTimeout(timeoutId: any): void {
            clearTimeout(timeoutId)
        },
        setImmediate(callback: (...args: any[]) => void, ...args: any[]): any {
            // TODO: This isn't actually in the DOM?
            // MDN gives a few ways to emulate it: https://developer.mozilla.org/en-US/docs/Web/API/Window/setImmediate#notes
            // setImmediate(callback, ...args)
            return this.setTimeout(callback, 0, ...args)
        },
        clearImmediate(timeoutId: any): void {
            // TODO: This isn't actually in the DOM?
            // clearImmediate(timeoutId)
            this.clearTimeout(timeoutId)
        },
        // gc?(): void {}, // afaict this isn't available in the browser
        trace: console.log,
        // require?(initialPath: string, moduleName: string): ModuleImportResult {},
        // TODO: This definitely needs to be imlemented
        // importServicePlugin?(root: string, moduleName: string): Promise<ModuleImportResult> {},
        // System
        args,
        newLine: '\n',
        useCaseSensitiveFileNames: true,
        write: apiClient.vscode.terminal.write, // TODO: MAYBE
        writeOutputIsTTY(): boolean { return true }, // TODO: Maybe
        // getWidthOfTerminal?(): number {},
        readFile(path): string | undefined {
            const uri = Utils.joinPath(root, path)
            const bytes = apiClient.vscode.workspace.fileSystem.readFile(uri)
            return new TextDecoder().decode(new Uint8Array(bytes).slice()) // TODO: Not sure why `bytes` or `bytes.slice()` isn't as good as `new Uint8Array(bytes).slice()`
        },
        getFileSize(path: string): number {
            const uri = Utils.joinPath(root, path)
            const stat = apiClient.vscode.workspace.fileSystem.stat(uri)
            return stat.size
        },
        writeFile(path: string, data: string): void {
            const uri = Utils.joinPath(root, path)
            apiClient.vscode.workspace.fileSystem.writeFile(uri, new TextEncoder().encode(data))
        },
        // TODO: base this on WebSErverHost version (webserver/webserver.ts)
        // 
        resolvePath(path: string): string {
            return path
        },
        fileExists(path: string): boolean {
            const uri = Utils.joinPath(root, path)
            const stat = apiClient.vscode.workspace.fileSystem.stat(uri)
            return stat.type === FileType.File // TODO: Might be correct! (need to read the code to figure out how to use it)
        },
        directoryExists(path: string): boolean {
            const uri = Utils.joinPath(root, path)
            const stat = apiClient.vscode.workspace.fileSystem.stat(uri)
            return stat.type === FileType.Directory // TODO: Might be correct! (need to read the code to figure out how to use it)
        },
        createDirectory(path: string): void {
            const uri = Utils.joinPath(root, path)
            apiClient.vscode.workspace.fileSystem.createDirectory(uri)
        },
        getExecutingFilePath(): string {
            return root.toString() // TODO: Might be correct!
        },
        getCurrentDirectory(): string {
            return root.toString() // TODO: Might be correct!
        },
        getDirectories(path: string): string[] {
            const uri = Utils.joinPath(root, path)
            const entries = apiClient.vscode.workspace.fileSystem.readDirectory(uri)
            // TODO: FileType is from sync-api-client and *happens* to be the same as DTOs.FileType from sync-api-common/browser. Not sure how reliable that correspondence is though.
            return entries.filter(([_,type]) => type === FileType.Directory).map(([f,_]) => f)
        },
        /**
         * TODO: A lot of this code is made-up and should be copied from a known-good implementation
         * For example, I have NO idea how to easily support `depth`
        */
        readDirectory(path: string, extensions?: readonly string[], exclude?: readonly string[], include?: readonly string[], depth?: number): string[] {
            const uri = Utils.joinPath(root, path)
            const entries = apiClient.vscode.workspace.fileSystem.readDirectory(uri)
            return entries
                .filter(([f,type]) => type === FileType.File && (!extensions || extensions.some(ext => f.endsWith(ext))) && (!exclude || !exclude.includes(f)))
                .map(([e,_]) => e)
        },
        getModifiedTime(path: string): Date | undefined {
            const uri = Utils.joinPath(root, path)
            const stat = apiClient.vscode.workspace.fileSystem.stat(uri)
            return new Date(stat.mtime)
        },
        // setModifiedTime?(path: string, time: Date): void {}, // TODO: This seems like a bad idea!
        deleteFile(path: string): void {
            const uri = Utils.joinPath(root, path)
            apiClient.vscode.workspace.fileSystem.delete(uri)
        },
        /**
         * A good implementation is node.js' `crypto.createHash`. (https://nodejs.org/api/crypto.html#crypto_crypto_createhash_algorithm)
         */
        // createHash?(data: string): string {},
        /** This must be cryptographically secure. Only implement this method using `crypto.createHash("sha256")`. */
        // createSHA256Hash?(data: string): string { },
        // getMemoryUsage?(): number {},
        exit(exitCode?: number): void {
            console.log("EXCITING!" + exitCode) // TODO: I don't know what exit means in the browser. Just leave, right?
        },
        // realpath?(path: string): string {}, // TODO: Find out what this is supposed to do
        // clearScreen?(): void { },
        // base64decode?(input: string): string {},
        // base64encode?(input: string): string {},
    }
}

// TODO: Probably also need one that starts a host in a new worker
export function createFromScratch() {
    return createServerHost(new ApiClient(new ClientConnection<APIRequests>(new MessageChannel().port2)), [])
}

// copied from webserver/webserver.ts
const indentStr = "\n    ";
function indent(str: string): string {
    return indentStr + str.replace(/\n/g, indentStr);
}
type StartSessionOptions = Pick<ts.server.SessionOptions, "globalPlugins" | "pluginProbeLocations" | "allowLocalPluginLoads" | "useSingleInferredProject" | "useInferredProjectPerProjectRoot" | "suppressDiagnosticEvents" | "noGetErrOnBackgroundUpdate" | "syntaxOnly" | "serverMode">
class WorkerSession extends ts.server.Session<{}> {
    constructor(
        host: ts.server.ServerHost,
        private webHost: { writeMessage(s: any): void },
        options: StartSessionOptions,
        logger: ts.server.Logger,
        cancellationToken: ts.server.ServerCancellationToken,
        hrtime: ts.server.SessionOptions["hrtime"]
    ) {
        super({
            host,
            cancellationToken,
            ...options,
            typingsInstaller: ts.server.nullTypingsInstaller, // TODO: Someday!
            byteLength: () => { throw new Error("Not implemented") }, // Formats the message text in send of Session which is overriden in this class so not needed
            hrtime,
            logger,
            canUseEvents: true,
        });
    }

    // according to Sheetal,
    // session needs onMessage and writeMessage to handle requests and responses
    public send(msg: ts.server.protocol.Message) {
        if (msg.type === "event" && !this.canUseEvents) {
            if (this.logger.hasLevel(ts.server.LogLevel.verbose)) {
                this.logger.info(`Session does not support events: ignored event: ${JSON.stringify(msg)}`);
            }
            return;
        }
        if (this.logger.hasLevel(ts.server.LogLevel.verbose)) {
            this.logger.info(`${msg.type}:${indent(JSON.stringify(msg))}`);
        }
        this.webHost.writeMessage(msg);
    }

    protected parseMessage(message: {}): ts.server.protocol.Request {
        return message as ts.server.protocol.Request;
    }

    protected toStringMessage(message: {}) {
        return JSON.stringify(message, undefined, 2);
    }

    exit() {
        this.logger.info("Exiting...");
        this.projectService.closeLog();
        close();
    }

    listen() {
        addEventListener("message", (message: any) => {
            this.onMessage(message.data);
        });
    }
}

function hrtime(previous?: number[]) {
    const now = self.performance.now() * 1e-3;
    let seconds = Math.floor(now);
    let nanoseconds = Math.floor((now % 1) * 1e9);
    if (previous) {
        seconds = seconds - previous[0];
        nanoseconds = nanoseconds - previous[1];
        if (nanoseconds < 0) {
            seconds--;
            nanoseconds += 1e9;
        }
    }
    return [seconds, nanoseconds];
}
export function startSession(options: StartSessionOptions, logger: ts.server.Logger, cancellationToken: ts.server.ServerCancellationToken) {
    // TODO: Provide something that has a writeMessage method, probably a messagechannel with a host at the other end?
    new WorkerSession(createFromScratch(), { writeMessage: (x: any) => postMessage(x) }, options, logger, cancellationToken, hrtime)
        .listen()
}
 // TODO: better logger
// the better logger will also need the webhost because it will post messages to vscode for logging purposes
// beasicaly the same as our existing web logger
const trivialLogger: ts.server.Logger = {
    close: () => {},
    hasLevel: () => false,
    loggingEnabled: () => true,
    perftrc: () => {},
    info: console.log,
    msg: console.log,
    startGroup: () => {},
    endGroup: () => {},
    getLogFileName: () => undefined,
}
function initializeSession(args: string[], platform: string): void {
    const cancellationToken = ts.server.nullCancellationToken // TODO: Switch to real cancellation when it's done
    const serverMode = ts.LanguageServiceMode.Semantic // TODO: First test this as PartialSemantic -- realpath, modifiedtime, resolvepath needed for Sematnic
    const unknownServerMode = undefined
    trivialLogger.info(`Starting TS Server`);
    trivialLogger.info(`Version: 0.0.0`);
    trivialLogger.info(`Arguments: ${args.join(" ")}`);
    trivialLogger.info(`Platform: ${platform} CaseSensitive: true`);
    trivialLogger.info(`ServerMode: ${serverMode} syntaxOnly: false hasUnknownServerMode: ${unknownServerMode}`);
    startSession({
            globalPlugins: findArgumentStringArray(args, "--globalPlugins"),
            pluginProbeLocations: findArgumentStringArray(args, "--pluginProbeLocations"),
            allowLocalPluginLoads: hasArgument(args, "--allowLocalPluginLoads"),
            useSingleInferredProject: hasArgument(args, "--useSingleInferredProject"),
            useInferredProjectPerProjectRoot: hasArgument(args, "--useInferredProjectPerProjectRoot"),
            suppressDiagnosticEvents: hasArgument(args, "--suppressDiagnosticEvents"),
            noGetErrOnBackgroundUpdate: hasArgument(args, "--noGetErrOnBackgroundUpdate"),
            syntaxOnly: false,
            serverMode
        },
        trivialLogger,
        cancellationToken);
}
function findArgumentStringArray(args: readonly string[], name: string): readonly string[] {
    const arg = findArgument(args, name)
    return arg === undefined ? [] : arg.split(",").filter(name => name !== "");
}
function hasArgument(args: readonly string[], name: string): boolean {
    return args.indexOf(name) >= 0;
}
function findArgument(args: readonly string[], name: string): string | undefined {
    const index = args.indexOf(name);
    return 0 <= index && index < args.length - 1
        ? args[index + 1]
        : undefined;
}
// TODO: Disabled for now while I make sure that requiring all this code in tsserver.web.js doesn't break anything.
// const listener = (e: any) => {
//     removeEventListener("message", listener)
//     const args = e.data
//     initializeSession(args, "web-sync-api")
// }
// addEventListener("message", listener) // this is *probably* wrong? but maybe not since vs code will want to invoke us the same way as normal tsserver

// 1. add an event listener named "message", has to do with webworkers
// 2. when vscode calls postMessage (DedicatedWorkerGlobalScope.postMessage? some channel.postMessage?), pass its data as args to initialiseSession
// 3. initSession creates a logger, cancellation token and calls startSession
// 4. startSession creates a host and a webhost (which currently calls window.postMessage, should be some specific channel maybe) and passes them to
//    a new WorkerSession and then calls its .listen
// 5. WorkerSession's constructor calls super. Listen adds *another* event listener to 'message' which passes the message on to .onMessage, which handles the message as usual.

// I need to look at how vscode starts the web session; directly calling startSession might be the right thing

