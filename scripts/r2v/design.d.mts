/** R2-V design module type declarations (harness-only; consumed by the TypeScript tests). */
export interface R2VArm { readonly id: string; readonly bundles: readonly string[]; readonly label: string }
export declare const PROTOCOL_SEED: number;
export declare const SCENARIO_IDS: readonly string[];
/** The four arms are declared by NAME so a consumer cannot read an arm that does not exist. */
export declare const ARMS: { readonly V0: R2VArm; readonly V1: R2VArm; readonly V2: R2VArm; readonly V3: R2VArm };
export declare const CONDITIONS: readonly string[];
export declare const ADDED_BUNDLES: { readonly V1: readonly string[]; readonly V2: readonly string[]; readonly V3: readonly string[] };
export declare const REPETITIONS: number;
export declare const EXPECTED_TRIALS: number;
export declare const BUNDLE_IDS: readonly string[];
export declare const CONSUMPTION_MECHANISM: string;
export declare const UTILITY_CLASSIFICATIONS: Readonly<{ POSITIVE_SIGNAL: string; NO_CLEAR_SIGNAL: string; ADVERSE_SIGNAL: string }>;
export declare function blockOrder(blocks?: number, scenarioId?: string): readonly { readonly block: number; readonly order: readonly string[] }[];
export declare function trialPlan(repetitions?: number, scenarioIds?: readonly string[]): readonly any[];
export declare function armUtility(trials: readonly any[]): any;
export declare function marginalSignal(arm: { id: string; bundles: readonly string[] }, baseline: any, treatment: any): any;
export declare function analyseUtility(byArm: Record<string, any>): any;
