/** R3-L0C diagnostic module type declarations (harness-only). */
export declare const DIAGNOSTIC_CLASSES: readonly any[];
export declare const INVARIANT_EXPOSURES: Readonly<Record<string, readonly string[]>>;
export declare function eligibleClasses(generation: string): readonly string[];
export declare const DIAGNOSTIC_CASES: readonly any[];
export declare function classSummary(): readonly any[];
export declare function canonical(value: any): string;
export declare function judgeCase(candidate: any, testCase: any): any;
export declare function diagnosticVector(candidate: any): any;
export declare function instrumentedInvariants(): readonly string[];
export declare function uninstrumentedInvariants(): readonly string[];
