/** R3-L0 plan module type declarations (harness-only). */
export declare const PRIMARY_EXECUTOR: any;
export declare const ALTERNATIVE_EXECUTOR: any;
export declare const BLOCK_COUNT: number;
export declare const GENERATIONS_PER_TRAJECTORY: number;
export declare const TOTAL_SESSIONS: number;
export declare const RANDOMIZATION_SEED: number;
export declare const RUN_BUDGET: any;
export declare const UTILITY_VERDICT_RULES: any;
export declare const UPTAKE_VERDICT_RULES: any;
export declare const SESSION_SCHEMA: any;
export declare function armOrderPerBlock(): readonly (readonly string[])[];
export declare function schedule(): readonly any[];
export declare function buildPlan(): any;
