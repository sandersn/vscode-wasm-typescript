import * as ts from "typescript/lib/tsserverlibrary"
import { ApiClient, APIRequests, FileType } from '@vscode/sync-api-client';
import { ClientConnection, DTOs } from '@vscode/sync-api-common/browser';
import { Utils } from 'vscode-uri';

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
        // TODO: Find out what this is supposed to do
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

export function createFromScratch() {
    return createServerHost(new ApiClient(new ClientConnection<APIRequests>(new MessageChannel().port2)), [])
}
