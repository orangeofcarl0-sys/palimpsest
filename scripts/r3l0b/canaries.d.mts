/** R3-L0B canaries module type declarations (harness-only). */
export declare function resolveSandbox(): any;
export declare function probeSource(targets: any, world: string): string;
export declare function nonApplicableSubstitutes(targets: any): string;
export declare function canaryTargets(root: string, unitIds: readonly string[]): any;
export declare function runCanarySuite(input: any): Promise<any>;
export declare function runConfined(input: any): any;
export declare function relativeFrom(world: string, target: string): string;
export declare const CANARY_ROOTS: readonly any[];
export declare const CANARY_ATTEMPTS: readonly any[];
export declare const CANARY_VERDICTS: { readonly UNREACHABLE: string; readonly REACHABLE: string; readonly NOT_APPLICABLE: string } & Readonly<Record<string, string>>;
export declare const tmpdir: () => string;
