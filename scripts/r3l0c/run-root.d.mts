/** R3-L0C run-root module type declarations (harness-only). */
export declare const RUN_ROOT_PREFIX: string;
export declare const LEASE_FILE: string;
export declare const HEARTBEAT_STALE_MS: number;
export declare function runRootParent(base?: string): string;
export declare function runRoot(runId: string, base?: string): string;
export declare function acquireLease(input: any): any;
export declare function readLease(root: string): any;
export declare function isProcessAlive(pid: number): boolean;
export declare function classifyRoot(root: string, now?: number): any;
export declare function listRunRoots(base?: string): readonly string[];
export declare function sweepRunRoots(input?: any): any;
export declare function rigPath(runRootPath: string, name: string): string;
export declare const tmpdir: () => string;
