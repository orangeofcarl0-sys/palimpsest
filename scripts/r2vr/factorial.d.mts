/** R2-VR factorial module type declarations (harness-only; consumed by the TypeScript tests). */
export declare const FACTORIAL_CELLS: Readonly<Record<string, { readonly B: boolean; readonly C: boolean }>>;
export declare const OUTCOME_DIMENSIONS: readonly string[];
export declare const INTERACTION_LABEL: string;
export declare const CALIBRATION_STATUSES: Readonly<{ SUPPORTED: string; MIXED: string; INCONCLUSIVE: string }>;
export declare const OUTCOME_MISMATCH_RULING: string;
export declare function armRate(trials: readonly any[], dimension: string): any;
export declare function factorialContrasts(trialsByArm: Record<string, readonly any[]>, dimension: string): any;
export declare function describeFactor(contrast: any, factor: string): any;
export declare function correctedCalibrationStatus(input: { interactions: number; saturatedDimensions: readonly string[]; factorsWithStableSignal: readonly string[]; outcomeMismatch: boolean }): string;
