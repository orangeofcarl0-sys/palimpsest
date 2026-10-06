/** R3-A0/R3-AE qualification module type declarations (harness-only; consumed by the TypeScript tests). */
export declare const QUALIFICATION_BOUNDS: Readonly<{ dimension: string; lower: number; upper: number; floorMeaning: string; ceilingMeaning: string; roomRequiredInBothDirections: boolean; frozenBefore: string }>;
export declare const MIN_CLASS_HEADROOM: Readonly<{ minVaryingDirectClasses: number; Nq: number }>;
export declare const PAIR_VERDICTS: Readonly<{ QUALIFIED: string; UNQUALIFIED: string; INFRASTRUCTURE_INVALID: string }>;
export declare function classSeries(trials: readonly any[], classIds: readonly string[]): Readonly<Record<string, readonly boolean[]>>;
export declare function groupClassesBySeries(seriesByClass: Readonly<Record<string, readonly boolean[]>>): readonly { readonly members: readonly string[]; readonly passes: number; readonly of: number; readonly raw: string; readonly variable: boolean; readonly invariant: boolean }[];
export declare function nonRedundantDimensions(vectors: readonly any[], dimensions: readonly string[]): readonly { readonly dimensions: readonly string[]; readonly redundant: boolean }[];
export declare function qualifyPair(input: any): any;
export declare function aToBGate(pairs: readonly any[]): any;
