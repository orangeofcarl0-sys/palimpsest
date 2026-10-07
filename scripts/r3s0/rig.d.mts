/** R3-S0 shared deterministic rig type declarations (harness-only). */
export declare const REPO_ROOT: string;
export declare const DIST: string;
export declare function rigRoot(name: string): string;
export declare function freshRig(name: string): string;
export declare function load(relative: string): Promise<any>;
export declare function sha256(text: string): string;
export declare function git(cwd: string, args: readonly string[]): string;
export declare function makeProject(dir: string, input?: any): string;
export declare function standardFor(statement?: string): any;
export declare function storePaths(rig: string): any;
export declare function installOver(input: any): Promise<any>;
export declare function completionWorker(input?: any): any;
export declare function committingWorker(input: any): any;
export declare function driveJob(service: any, input?: any): Promise<any>;
export declare function restartInChildProcess(input: any): Promise<any>;
export declare function advanceToReady(controller: any): string | null;
export declare function settleScheduler(controller: any, limit?: number): string | null;
export declare function closeTask(rig: any, attemptId: string, input?: any): Promise<any>;
