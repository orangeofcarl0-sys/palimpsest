/** R3-L0B root-cause module type declarations (harness-only). */
export declare const REPO_ROOT: string;
export declare const RUNTIME_CONTRACT_CLAIMS: readonly any[];
export declare function layoutFacts(runDir: string): any;
export declare function containmentHypothesis(runDir: string): any;
export declare function rootCauseVerdict(runDir: string): any;
export declare function fenceSourceEvidence(repoRoot?: string): any;
export declare function runDirMtime(runDir: string): number | null;
export declare function fold(text: string): string;
export declare function resolve(...parts: string[]): string;
