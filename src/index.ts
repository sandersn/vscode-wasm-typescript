import * as ts from "typescript/lib/tsserverlibrary"
import { ApiClient, FileType, Requests } from '@vscode/sync-api-client';
import { ClientConnection, DTOs } from '@vscode/sync-api-common/browser';
import { Utils, URI } from 'vscode-uri';
let listener: (e: any) => Promise<void>;
let watchFiles: Map<string, { path: string, callback: ts.FileWatcherCallback, pollingInterval?: number, options?: ts.WatchOptions }> = new Map();
let watchDirectories: Map<string, { path: string, callback: ts.DirectoryWatcherCallback, recursive?: boolean, options?: ts.WatchOptions }> = new Map();
export function createServerHost(logger: ts.server.Logger & ((x: any) => void), apiClient: ApiClient, args: string[]): ts.server.ServerHost {
    logger.info('starting to create serverhost...')
    const root = apiClient.vscode.workspace.workspaceFolders[0].uri
    const fs = apiClient.vscode.workspace.fileSystem
    logger.info('successfully read ' + root + " uri from apiClient's workspace folders")
    return {
        /**
         * @param pollingInterval ignored in native filewatchers; only used in polling watchers
         */
        watchFile(path: string, callback: ts.FileWatcherCallback, pollingInterval?: number, options?: ts.WatchOptions): ts.FileWatcher {
            logger.info('calling watchFile on ' + path + (watchFiles.has(path) ? ' (OLD)' : ' (new)'))
            watchFiles.set(path, { path, callback, pollingInterval, options })
            return { close() {
                watchFiles.delete(path)
            } }
        },
        watchDirectory(path: string, callback: ts.DirectoryWatcherCallback, recursive?: boolean, options?: ts.WatchOptions): ts.FileWatcher {
            logger.info('calling watchDirectory on ' + path + (watchDirectories.has(path) ? ' (OLD)' : ' (new)'))
            watchDirectories.set(path, { path, callback, recursive, options })
            return {
                close() {
                    watchDirectories.delete(path)
                }
            }
        },
        setTimeout(callback: (...args: any[]) => void, ms: number, ...args: any[]): any {
            const timeoutId = setTimeout(callback, ms, ...args)
            logger.info(`calling setTimeout, got ${timeoutId}`)
            return timeoutId
        },
        clearTimeout(timeoutId: any): void {
            logger.info(`calling clearTimeout on ${timeoutId}`)
            clearTimeout(timeoutId)
        },
        /** MDN gives a few ways to emulate setImmediate: https://developer.mozilla.org/en-US/docs/Web/API/Window/setImmediate#notes */
        setImmediate(callback: (...args: any[]) => void, ...args: any[]): any {
            const timeoutId = this.setTimeout(callback, 0, ...args)
            logger.info(`calling setImmediate, got ${timeoutId}`)
            return timeoutId
        },
        clearImmediate(timeoutId: any): void {
            logger.info(`calling clearImmediate on ${timeoutId}`)
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
            logger.info('calling readFile on ' + path)
            // [ ] need to update 0.2 -> 0.7.* API (once it's working properly)
            // [ ] including reshuffling the webpack hack if needed
            // [x] need to use the settings recommended by Sheetal
            // [x] ProjectService always requests a typesMap.json at the cwd
            // [ ] sync-api-client says fs is rooted at memfs:/sample-folder; the protocol 'memfs:' is confusing our file parsing I think
            // [x] messages aren't actually coming through, just the message from the first request
            //     - fixed by simplifying the listener setup for now
            // [x] once messages work, you can probably log by postMessage({ type: 'log', body: "some logging text" })
            // [x] implement realpath, modifiedtime, resolvepath, then turn semantic mode on
            // [ ] maybe implement all the others?
            // [ ] cancellation
            // [ ] file watching implemented with saved map of filename to callback, and forwarding

            // messages received by extension AND host use paths like ^/memfs/ts-nul-authority/sample-folder/file.ts
            // - problem: pretty sure the extension doesn't know what to do with that: it's not putting down error spans in file.ts
            // - question: why is the extension requesting quickinfo in that URI format? And it works! (probably because the result is a tooltip, not an in-file span)
            // - problem: weird concatenations with memfs:/ in the middle
            // - problem: weird concatenations with ^/memfs/ts-nul-authority in the middle

            // question: where is the population of sample-folder with a bunch of files happening?
            // question: Is that location writable while it's running?
            // but readFile is getting called with things like memfs:/sample-folder/memfs:/typesMap.json
            //     directoryExists with /sample-folder/node_modules/@types and /node_modules/@types
            //     same for watchDirectory
            //     watchDirectory with /sample-folder/^ and directoryExists with /sample-folder/^/memfs/ts-nul-authority/sample-folder/workspaces/
            //     watchFile with /sample-folder/memfs:/sample-folder/memfs:/lib.es2020.full.d.ts
            try {
                const bytes = fs.readFile(URI.from({ scheme: "memfs", path }))
                return new TextDecoder().decode(new Uint8Array(bytes).slice()) // TODO: Not sure why `bytes.slice()` isn't as good as `new Uint8Array(bytes).slice()`
                // (common/connection.ts says that Uint8Array is only a view on the bytes which could change, which is why the slice exists)
            }
            catch (e) {
                logger.info(`Error fs.readFile`)
                logger(e)
            }
        },
        getFileSize(path) {
            logger.info('calling getFileSize on ' + path)
            try {
                return fs.stat(URI.from({ scheme: "memfs", path })).size
            }
            catch (e) {
                logger.info(`Error fs.getFileSize`)
                logger(e)
                return -1 // TODO: Find out what the failure return value is in the normal host.
            }
        },
        writeFile(path, data) {
            logger.info('calling writeFile on ' + path)
            try {
                fs.writeFile(URI.from({ scheme: "memfs", path }), new TextEncoder().encode(data))
            }
            catch (e) {
                logger.info(`Error fs.writeFile`)
                logger(e)
            }
        },
        /** If TS' webServer/webServer.ts is good enough to copy here, this is just identity */
        resolvePath(path: string): string {
            logger.info('calling resolvePath on ' + path)
            return path
        },
        fileExists(path: string): boolean {
            logger.info('calling fileExists on ' + path)
            try {
                // TODO: FileType.File might be correct! (need to learn about vscode's FileSystem.stat)
                return fs.stat(URI.from({ scheme: "memfs", path })).type === FileType.File
            }
            catch (e) {
                logger.info(`Error fs.fileExists`)
                logger(e)
                return false
            }
        },
        directoryExists(path: string): boolean {
            logger.info('calling directoryExists on ' + path)
            try {
                // TODO: FileType.Directory might be correct! (need to learn about vscode's FileSystem.stat)
                return fs.stat(URI.from({ scheme: "memfs", path })).type === FileType.Directory
            }
            catch (e) {
                logger.info(`Error fs.directoryExists`)
                logger(e)
                return false
            }
        },
        createDirectory(path: string): void {
            logger.info('calling createDirectory on ' + path)
            try {
                // TODO: FileType.Directory might be correct! (need to learn about vscode's FileSystem.stat)
                fs.createDirectory(URI.from({ scheme: "memfs", path }))
            }
            catch (e) {
                logger.info(`Error fs.createDirectory`)
                logger(e)
            }
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
            logger.info('calling getDirectories on ' + path)
            try {
                const entries = fs.readDirectory(URI.from({ scheme: "memfs", path }))
                return entries.filter(([_,type]) => type === FileType.Directory).map(([f,_]) => f)
            }
            catch (e) {
                logger.info(`Error fs.getDirectory`)
                logger(e)
                return []
            }
        },
        /**
         * TODO: A lot of this code is made-up and should be copied from a known-good implementation
         * For example, I have NO idea how to easily support `depth`
         * Note: webServer.ts comments say this is used for configured project and typing installer.
         */
        readDirectory(path: string, extensions?: readonly string[], exclude?: readonly string[], include?: readonly string[], depth?: number): string[] {
            logger.info('calling readDirectory on ' + path)
            try {
            const entries = fs.readDirectory(URI.from({ scheme: "memfs", path }))
            return entries
                .filter(([f,type]) => type === FileType.File && (!extensions || extensions.some(ext => f.endsWith(ext))) && (!exclude || !exclude.includes(f)))
                .map(([e,_]) => e)
            }
            catch (e) {
                logger.info(`Error fs.readDirectory`)
                logger(e)
                return []
            }
        },
        getModifiedTime(path: string): Date | undefined {
            logger.info('calling getModifiedTime on ' + path)
            try {
                return new Date(fs.stat(URI.from({ scheme: "memfs", path })).mtime)
            }
            catch (e) {
                logger.info(`Error fs.getModifiedTime`)
                logger(e)
                return undefined
            }
        },
        setModifiedTime(path: string, time: Date): void {
            logger.info('calling setModifiedTime on ' + path)
            // But I don't have any idea of how to set the modified time to an arbitrary date!
        },
        deleteFile(path: string): void {
            const uri = URI.from({ scheme: "memfs", path })
            logger.info(`calling deleteFile on ${uri}`)
            try {
                fs.delete(uri)
            }
            catch (e) {
                logger.info(`Error fs.deleteFile`)
                logger(e)
            }
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
        /** webServer comments this out and says "module resolution, symlinks"
         * I don't think we support symlinks yet but module resolution should work */
        realpath(path: string): string {
            const parts = [...root.path.split('/'), ...path.split('/')]
            const out = []
            for (const part of parts) {
                switch (part) {
                    case '.':
                        break;
                    case '..':
                        //delete if there is something there to delete
                        out.pop()
                        break;
                    default:
                        out.push(part)
                }
            }
            return out.join('/')
        },
        // clearScreen?(): void { },
        // base64decode?(input: string): string {},
        // base64encode?(input: string): string {},
    }
}

export function createWebSystem(connection: ClientConnection<Requests>, logger: ts.server.Logger & ((x: any) => void)) {
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
            this.logger.info(`host msg: ${JSON.stringify(message.data)}`)
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
export function startSession(options: StartSessionOptions, connection: ClientConnection<Requests>, logger: ts.server.Logger & ((x: any) => void), cancellationToken: ts.server.ServerCancellationToken) {
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
function initializeSession(args: string[], platform: string, connection: ClientConnection<Requests>): void {
    const cancellationToken = ts.server.nullCancellationToken // TODO: Switch to real cancellation when it's ready
    const serverMode = ts.LanguageServiceMode.Semantic
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
            const connection = new ClientConnection<Requests>(e.data.port);
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
        serverLogger.info(`host got: ${JSON.stringify(e.data)}`)
        // TODO: for file watching, intercept the messages here and call the stored callback in an async way
        session.onMessage(e.data)
    }
    else {
        console.error('Init is done, but session is not available yet')
    }
}
addEventListener("message", listener)
