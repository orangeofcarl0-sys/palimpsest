/** R3-L0C-F crash-matrix module type declarations (harness-only). */
export declare function twoGenerationSchedule(block?: number, arm?: string): readonly any[];
export declare function copyPrehistoryFor(caseRoot: string, prehistory: any, name: string): any;
export declare function runCrashCase(input: any): Promise<any>;
export declare function runCrashMatrix(input: any): Promise<any>;
export declare function provePreservation(input: any): Promise<any>;
export declare const CONTAINMENT_REQUIREMENTS: readonly string[];
export declare const CONTAINMENT_LAW: any;
export declare const NL: string;
export declare const REPO_ROOT: string;
