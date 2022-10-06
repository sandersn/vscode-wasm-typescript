import * as ts from "typescript/lib/tsserverlibrary"
import { ApiClient, APIRequests, FileType } from '@vscode/sync-api-client';
import { ClientConnection, DTOs } from '@vscode/sync-api-common/browser';
import { Utils, URI } from 'vscode-uri';
let listener: (e: any) => Promise<void>;
export function createServerHost(logger: ts.server.Logger & ((x: any) => void), apiClient: ApiClient, args: string[]): ts.server.ServerHost {
    logger.info('starting to create serverhost...')
    const root = apiClient.vscode.workspace.workspaceFolders[0].uri
    logger.info('successfully read ' + root + " uri from apiClient's workspace folders")
    return {
        /**
         * @param pollingInterval ignored in native filewatchers; only used in polling watchers
         */
        watchFile(path: string, callback: ts.FileWatcherCallback, pollingInterval?: number, options?: ts.WatchOptions): ts.FileWatcher {
            // I don't think this works yet
            logger.info('calling watchFile')
            return null as never
        },
        watchDirectory(path: string, callback: ts.DirectoryWatcherCallback, recursive?: boolean, options?: ts.WatchOptions): ts.FileWatcher {
            // same
            logger.info('calling watchDirectory')
            return null as never
        },
        setTimeout(callback: (...args: any[]) => void, ms: number, ...args: any[]): any {
            logger.info('calling setTimeout')
            return setTimeout(callback, ms, ...args)
        },
        clearTimeout(timeoutId: any): void {
            logger.info('calling clearTimeout')
            clearTimeout(timeoutId)
        },
        setImmediate(callback: (...args: any[]) => void, ...args: any[]): any {
            logger.info('calling setImmediate')
            // TODO: This isn't actually in the DOM?
            // MDN gives a few ways to emulate it: https://developer.mozilla.org/en-US/docs/Web/API/Window/setImmediate#notes
            // setImmediate(callback, ...args)
            return this.setTimeout(callback, 0, ...args)
        },
        clearImmediate(timeoutId: any): void {
            logger.info('calling clearImmediate')
            // TODO: This isn't actually in the DOM?
            // clearImmediate(timeoutId)
            this.clearTimeout(timeoutId)
        },
        // gc?(): void {}, // afaict this isn't available in the browser
        trace: logger.info,
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
        readFile(path) {
            logger.info('calling readFile')
            // [x] need to use the settings recommended by Sheetal
            // [x] ProjectService always requests a typesMap.json at the cwd
            // [ ] sync-api-client says fs is rooted at memfs:/sample-folder; the protocol 'memfs:' is confusing our file parsing I think
            // [x] messages aren't actually coming through, just the message from the first request
            //     - fixed by simplifying the listener setup for now
            // [x] once messages work, you can probably log by postMessage({ type: 'log', body: "some logging text" })
            // [ ] implement methods Sheetal says are needed for semantic mode, then turn semantic mode on
            // [ ] maybe implement all the others?
            try {
                const uri = URI.file(path) // Utils.joinPath(root, path)
                try {
                    const bytes = apiClient.vscode.workspace.fileSystem.readFile(uri)
                    try {
                        return new TextDecoder().decode(new Uint8Array(bytes).slice()) // TODO: Not sure why `bytes.slice()` isn't as good as `new Uint8Array(bytes).slice()`
                        // (common/connection.ts says that Uint8Array is only a view on the bytes which could change, which is why the slice exists)
                    }
                    catch (e) {
                        logger.info(`Error new TextDecoder().decode: ${e}`)
                        logger(e)
                    }
                }
                catch (e) {
                    logger.info(`Error apiClient...readFile: ${e}`)
                    logger(e)
                }
            }
            catch (e) {
                logger.info(`Error Utils.joinPath(root(), path): ${e}`)
                logger(e)
            }
        },
        getFileSize(path) {
            logger.info('calling getFileSize')
            const uri = Utils.joinPath(root, path)
            const stat = apiClient.vscode.workspace.fileSystem.stat(uri)
            return stat.size
        },
        writeFile(path, data) {
            logger.info('calling writeFile')
            const uri = Utils.joinPath(root, path)
            apiClient.vscode.workspace.fileSystem.writeFile(uri, new TextEncoder().encode(data))
        },
        // TODO: base this on WebSErverHost version (webserver/webserver.ts)
        // 
        resolvePath(path: string): string {
            logger.info('calling resolvePath')
            return path
        },
        fileExists(path: string): boolean {
            logger.info('calling fileExists')
            const uri = Utils.joinPath(root, path)
            const stat = apiClient.vscode.workspace.fileSystem.stat(uri)
            return stat.type === FileType.File // TODO: Might be correct! (need to read the code to figure out how to use it)
        },
        directoryExists(path: string): boolean {
            logger.info('calling directoryExists')
            const uri = Utils.joinPath(root, path)
            const stat = apiClient.vscode.workspace.fileSystem.stat(uri)
            return stat.type === FileType.Directory // TODO: Might be correct! (need to read the code to figure out how to use it)
        },
        createDirectory(path: string): void {
            logger.info('calling createDirectory')
            const uri = Utils.joinPath(root, path)
            apiClient.vscode.workspace.fileSystem.createDirectory(uri)
        },
        getExecutingFilePath(): string {
            logger.info('calling getExecutingFilePath')
            return root.toString() // TODO: Might be correct!
        },
        getCurrentDirectory(): string {
            logger.info('calling getCurrentDirectory')
            return root.toString() // TODO: Might be correct!
        },
        getDirectories(path: string): string[] {
            logger.info('calling getDirectories')
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
            logger.info('calling readDirectory')
            const uri = Utils.joinPath(root, path)
            const entries = apiClient.vscode.workspace.fileSystem.readDirectory(uri)
            return entries
                .filter(([f,type]) => type === FileType.File && (!extensions || extensions.some(ext => f.endsWith(ext))) && (!exclude || !exclude.includes(f)))
                .map(([e,_]) => e)
        },
        getModifiedTime(path: string): Date | undefined {
            logger.info('calling getModifiedTime')
            const uri = Utils.joinPath(root, path)
            const stat = apiClient.vscode.workspace.fileSystem.stat(uri)
            return new Date(stat.mtime)
        },
        // setModifiedTime?(path: string, time: Date): void {}, // TODO: This seems like a bad idea!
        deleteFile(path: string): void {
            logger.info('calling deleteFile')
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
            logger.info("EXCITING!" + exitCode)
            removeEventListener("message", listener) // TODO: Not sure this is right (and there might be other cleanup)
        },
        // realpath?(path: string): string {}, // TODO: Find out what this is supposed to do
        // clearScreen?(): void { },
        // base64decode?(input: string): string {},
        // base64encode?(input: string): string {},
    }
}

export function createWebSystem(connection: ClientConnection<APIRequests>, logger: ts.server.Logger & ((x: any) => void)) {
    logger.info("in createWebSystem")
    const sys = createServerHost(logger, new ApiClient(connection), [])
    ;(ts as any).setSys(sys)
    logger.info("finished creating web system")
    return sys
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
        this.logger.info('done constructing WorkerSession')
    }
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
        postMessage(msg);
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
    // TODO: Unused right now, but maybe someday
    listen(port: MessagePort) {
        this.logger.info('SHOULD BE UNUSED: starting to listen for messages on "message"...')
        port.addEventListener("message", (message: any) => {
            this.logger.info(`got message ${JSON.stringify(message.data)}`)
            this.onMessage(message.data);
        });
    }
}
let session: WorkerSession | undefined;

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
export function startSession(options: StartSessionOptions, connection: ClientConnection<APIRequests>, logger: ts.server.Logger & ((x: any) => void), cancellationToken: ts.server.ServerCancellationToken) {
    session = new WorkerSession(createWebSystem(connection, logger), options, logger, cancellationToken, hrtime)
}
// Note: unused because I'm not looking at the console that much right now
const doubleLogger: ts.server.Logger = {
    close: () => {},
    hasLevel: () => false,
    loggingEnabled: () => true,
    perftrc: () => {},
    info(s) {
        console.log(s)
        postMessage({ type: "log", body: s + '\n' })
    },
    msg(s) {
        console.log(s)
        postMessage({ type: "log", body: s + '\n' })
    },
    startGroup: () => {},
    endGroup: () => {},
    getLogFileName: () => undefined,
}

const serverLogger: ts.server.Logger & ((x: any) => void) = (x: any) => postMessage({ type: "log", body: JSON.stringify(x) + '\n' }) as any
serverLogger.close = () => {}
serverLogger.hasLevel = () => false
serverLogger.loggingEnabled = () => true
serverLogger.perftrc = () => {}
serverLogger.info = s => postMessage({ type: "log", body: s + '\n' })
serverLogger.msg = s => postMessage({ type: "log", body: s + '\n' })
serverLogger.startGroup = () => {}
serverLogger.endGroup = () => {}
serverLogger.getLogFileName = () => "tsserver.log"
function initializeSession(args: string[], platform: string, connection: ClientConnection<APIRequests>): void {
    const cancellationToken = ts.server.nullCancellationToken // TODO: Switch to real cancellation when it's done
    const serverMode = ts.LanguageServiceMode.PartialSemantic // TODO: Later test this as Semantic -- realpath, modifiedtime, resolvepath needed for Semantic
    const unknownServerMode = undefined
    serverLogger.info(`Starting TS Server`);
    serverLogger.info(`Version: 0.0.0`);
    serverLogger.info(`Arguments: ${args.join(" ")}`);
    serverLogger.info(`Platform: ${platform} CaseSensitive: true`);
    serverLogger.info(`ServerMode: ${serverMode} syntaxOnly: false hasUnknownServerMode: ${unknownServerMode}`);
    startSession({
            globalPlugins: findArgumentStringArray(args, "--globalPlugins"),
            pluginProbeLocations: findArgumentStringArray(args, "--pluginProbeLocations"),
            allowLocalPluginLoads: hasArgument(args, "--allowLocalPluginLoads"),
            useSingleInferredProject: hasArgument(args, "--useSingleInferredProject"),
            useInferredProjectPerProjectRoot: hasArgument(args, "--useInferredProjectPerProjectRoot"),
            suppressDiagnosticEvents: hasArgument(args, "--suppressDiagnosticEvents"),
            noGetErrOnBackgroundUpdate: hasArgument(args, "--noGetErrOnBackgroundUpdate"),
            syntaxOnly: true, // TODO: Later test this as false,
            serverMode
        },
        connection,
        serverLogger,
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
let init: Promise<any> | undefined;
listener = async (e: any) => {
    if (!init) {
        if ('args' in e.data && 'port' in e.data) {
            const connection = new ClientConnection<APIRequests>(e.data.port);
            init = connection.serviceReady().then(() => initializeSession(e.data.args, "web-sync-api", connection))
        }
        else {
            console.error('init message not yet received, got ' + JSON.stringify(e.data))
        }
        return
    }
    await init // TODO: Not strictly necessary since I can check session instead
    // TODO: Instead of reusing this listener and passing its messages on to session.onMessage, I could receive another port
    // in the setup message and have session listen on that instead. Might make it easier to disconnect an existing tsserver's web host.
    if (!!session) {
        serverLogger.info(`got message ${JSON.stringify(e.data)}`)
        session.onMessage(e.data)
    }
    else {
        console.error('Init is done, but session is not available yet')
    }
}
addEventListener("message", listener)
