/** R3-S0 trace/witness schema type declarations (harness-only; consumed by the TypeScript tests). */
export declare function canonicalJson(value: unknown): string;
export declare function digestOf(domain: string, value: unknown): string;
export declare const PROJECT_BEHAVIOR_TRACE_DOMAIN: string;
export declare const MECHANISM_WITNESS_DOMAIN: string;
export declare const PROJECT_BEHAVIOR_TRACE_FIELDS: readonly string[];
export declare function makeProjectBehaviorTrace(input?: any): any;
export declare function traceCoverage(trace: any): Readonly<{ populated: readonly string[]; empty: readonly string[]; populatedCount: number; declaredCount: number }>;
export declare function makeMechanismWitness(input?: any): any;
export declare function makeBypassWitness(input?: any): any;
export declare const EVIDENCE_DIGEST_KINDS: readonly string[];
export declare function makeEvidenceClosure(input?: any): any;
export { WITNESS_VERDICTS } from './contract.mjs';
