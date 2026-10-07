/** R3-L0C immutability module type declarations (harness-only). */
export declare const PROTECTED_ROOT: string;
export declare const BASELINE_REVISION: string;
export declare const STAGE_NAMESPACE: string;
export declare function protectedNamespaces(): readonly string[];
export declare function listBaselinePaths(revision?: string): readonly string[];
export declare function baselineBlobDigest(path: string, revision?: string): string | null;
export declare function workingDigest(path: string): string | null;
export declare function listWorkingPaths(): readonly string[];
export declare function checkImmutability(input?: any): any;
export declare function workingBlobDigest(path: string): string | null;
export declare function isStageOwned(path: string, stageNamespace?: string): boolean;
export declare function isPostBaselineDirectory(path: string, baselinePaths: readonly string[]): boolean;
