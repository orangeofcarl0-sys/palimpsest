/**
 * Trajectory-P2-E1 §8 — TYPE SURFACE for the `.mjs` source-aware mechanical oracle.
 *
 * The repository's convention for a bare-node `.mjs` helper is a sibling `.d.mts` declaration.
 */
import type { GroundedTruthSnapshot } from "./experimental-truth.d.mts";

export declare const ORACLE_DIMENSIONS: readonly ["historicalUnderstanding", "decisionQuality", "operationalBehavior"];
export declare const ORACLE_VERSION: string;
export declare const ANSWER_FIELDS: readonly string[];
export declare const PROPOSED_ACTIONS: readonly string[];

export interface StructuredJudgment {
  readonly proposition: string;
  readonly truth: "TRUE" | "FALSE" | "UNKNOWN" | "NOT_APPLICABLE";
  readonly source?: string;
  readonly evidenceRef?: string | null;
}

export interface StructuredAnswer {
  readonly judgments: readonly StructuredJudgment[];
  readonly proposedAction: string;
  readonly justification?: string;
  readonly uncertainty?: string;
  readonly sourceReferences?: readonly string[];
  readonly confidence: "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";
}

export interface ExecutionObservation {
  readonly executed: boolean;
  readonly toolActions?: readonly string[];
  readonly changedFiles?: readonly string[];
  readonly committed?: boolean;
  readonly testsPassed?: boolean;
  readonly repeatedToolCalls?: readonly string[];
}

export interface OracleResult {
  readonly ok: true;
  readonly oracleVersion: string;
  readonly refusalWithoutSubstance: boolean;
  readonly justifiedDeferral: boolean;
  readonly historicalUnderstanding: {
    readonly perJudgment: readonly Readonly<Record<string, unknown>>[];
    readonly covered: number;
    readonly expectedCount: number;
    readonly coverage: number;
    readonly creditCount: number;
    readonly truthErrors: readonly string[];
    readonly sourceErrors: readonly Readonly<Record<string, unknown>>[];
    readonly referenceErrors: readonly Readonly<Record<string, unknown>>[];
    readonly pass: boolean;
  };
  readonly decisionQuality: {
    readonly action: string;
    readonly permitted: boolean;
    readonly forbidden: boolean;
    readonly refusalWithoutSubstance: boolean;
    readonly justifiedDeferral: boolean;
    readonly pass: boolean;
  };
  readonly operationalBehavior: {
    readonly measured: boolean;
    readonly state: string;
    readonly pass: boolean;
    readonly detail: string;
  };
  readonly verdict: { readonly historicalUnderstanding: boolean; readonly decisionQuality: boolean; readonly operationalBehavior: boolean | null };
}

export declare function validateAnswer(raw: unknown): { readonly ok: true; readonly answer: StructuredAnswer } | { readonly ok: false; readonly detail: string };
export declare function detectRefusalWithoutSubstance(answer: { readonly judgments?: readonly StructuredJudgment[]; readonly proposedAction: string }): { readonly refusalWithoutSubstance: boolean; readonly justifiedDeferral: boolean; readonly namesNoProposition: boolean; readonly declaresNoUnknown: boolean };
export declare function judgeHistoricalUnderstanding(answer: StructuredAnswer, snapshot?: GroundedTruthSnapshot): OracleResult["historicalUnderstanding"];
export declare function judgeDecisionQuality(answer: StructuredAnswer): OracleResult["decisionQuality"];
export declare function judgeOperationalBehavior(observation: ExecutionObservation | null | undefined): OracleResult["operationalBehavior"];
export declare function judgeAnswer(answer: unknown, options?: { readonly snapshot?: GroundedTruthSnapshot; readonly observation?: ExecutionObservation | null }): OracleResult | { readonly ok: false; readonly detail: string; readonly oracleVersion: string };
