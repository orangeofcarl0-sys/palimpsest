/** R3-L0B interference module type declarations (harness-only). */
export declare const CHECKOUT_MARKER: string;
export declare const TRAJECTORY_IDS: readonly string[];
export declare const CONTENT_SIGNATURES: Readonly<Record<string, readonly string[]>>;
export declare const HOST_PRIVATE_CONTENT_SIGNATURES: readonly string[];
export declare function contentTextOf(data: any): string;
export declare function contentReturnedOf(data: any): boolean;
export declare function namedPathsOf(data: any): readonly string[];
export declare function resolveAgainstWorld(path: string, worldRoot: string): string | null;
export declare function classifyPath(path: string, worldRoot: string, runDir: string, ownTrajectoryId: string | null): string | null;
export declare function operationOf(name: string, data: any): string;
export declare function reconstructSession(input: any): any;
export declare function reconstructGraph(runDir: string, matrix: any): readonly any[];
export declare function normalizeAttempt(attemptId: string): string;
export declare function adjudicateSpillovers(sessions: readonly any[], matrix: any): readonly any[];
export declare function spilloverSummary(rows: readonly any[]): any;
export declare function cleanMap(sessions: readonly any[]): any;
export declare function adjudicateOracleExposures(sessions: readonly any[]): readonly any[];
export declare function outcomeRelevantOracleExposures(rows: readonly any[]): readonly string[];
