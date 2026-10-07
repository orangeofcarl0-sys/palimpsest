/** R3-L0B mutations module type declarations (harness-only). */
export declare const ATTEMPT_IDS: readonly string[];
export declare function probeTargets(input: any): Promise<any>;
export declare function canaryLivenessControl(input: any): Promise<any>;
export declare function sharedParentMutation(input: any): Promise<any>;
export declare function layoutSharesParent(root: string, unitIds: readonly string[]): boolean;
export declare function oracleExposureMutation(input: any): Promise<any>;
export declare function oracleInsideWorld(root: string, unitIds: readonly string[], oracleRoot: string): boolean;
export declare const buildIsolatedLayout: any;
export declare const buildSharedParentLayout: any;
export declare const runContainmentGate: any;
export declare const runOutcomeBlindnessGate: any;
export declare const writeCanaries: any;
export declare const canaryTargets: any;
export declare const ISOLATED_LAYOUT: any;
