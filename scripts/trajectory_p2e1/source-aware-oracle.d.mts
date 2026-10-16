/**
 * Trajectory-P2-E1R §8 — TYPE SURFACE for the `.mjs` source-aware mechanical oracle.
 *
 * The repository's convention for a bare-node `.mjs` helper is a sibling `.d.mts` declaration.
 */
import type { FrozenAssayTruth } from "./experimental-truth.d.mts";

export declare const ORACLE_DIMENSIONS: readonly ["historicalUnderstanding", "decisionQuality", "operationalBehavior"];
export declare const ORACLE_VERSION: string;
export declare const ANSWER_FIELDS: readonly string[];
export declare const PROPOSED_ACTIONS: readonly string[];
export declare const OPERATIONAL_STATES: readonly string[];

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
  readonly workAccepted?: boolean;
}

export interface HistoricalUnderstandingResult {
  readonly perJudgment: readonly Readonly<Record<string, unknown>>[];
  readonly covered: number;
  readonly expectedCount: number;
  readonly coverage: number;
  readonly creditCount: number;
  readonly truthErrors: readonly string[];
  readonly sourceErrors: readonly Readonly<Record<string, unknown>>[];
  readonly referenceErrors: readonly Readonly<Record<string, unknown>>[];
  readonly criticalPropositions: readonly string[];
  readonly criticalMustCredit: readonly string[];
  readonly criticalMustNotAssert: readonly string[];
  readonly missingCritical: readonly string[];
  readonly falselyAsserted: readonly string[];
  readonly pass: boolean;
}

export interface DecisionQualityResult {
  readonly action: string;
  readonly permitted: boolean;
  readonly forbidden: boolean;
  readonly refusalWithoutSubstance: boolean;
  readonly justifiedDeferral: boolean;
  readonly contractRationale: string;
  readonly pass: boolean;
}

export interface OperationalBehaviorResult {
  readonly measured: boolean;
  readonly state: string;
  readonly toolActionCount?: number;
  readonly changedFileCount?: number;
  readonly committed?: boolean;
  readonly testsPassed?: boolean;
  readonly repeatedToolCalls?: readonly string[];
  readonly pass: boolean;
  readonly detail: string;
}

export interface OracleResult {
  readonly ok: true;
  readonly oracleVersion: string;
  readonly trialId: string;
  readonly assayTruthDigest: string;
  readonly arm: string;
  readonly refusalWithoutSubstance: boolean;
  readonly justifiedDeferral: boolean;
  readonly historicalUnderstanding: HistoricalUnderstandingResult;
  readonly decisionQuality: DecisionQualityResult;
  readonly operationalBehavior: OperationalBehaviorResult;
  readonly verdict: { readonly historicalUnderstanding: boolean; readonly decisionQuality: boolean; readonly operationalBehavior: boolean | null };
}

export declare function validateAnswer(raw: unknown): { readonly ok: true; readonly answer: StructuredAnswer } | { readonly ok: false; readonly detail: string };
export declare function detectRefusalWithoutSubstance(answer: { readonly judgments?: readonly StructuredJudgment[]; readonly proposedAction: string }): { readonly refusalWithoutSubstance: boolean; readonly justifiedDeferral: boolean; readonly namesNoProposition: boolean; readonly declaresNoUnknown: boolean };
export declare function judgeHistoricalUnderstanding(answer: StructuredAnswer, snapshot?: FrozenAssayTruth, armName?: string): HistoricalUnderstandingResult;
export declare function judgeDecisionQuality(answer: StructuredAnswer, snapshot?: FrozenAssayTruth): DecisionQualityResult;
export declare function judgeOperationalBehavior(observation: ExecutionObservation | null | undefined): OperationalBehaviorResult;
export declare function judgeAnswer(answer: unknown, options?: { readonly snapshot?: FrozenAssayTruth; readonly arm?: string; readonly observation?: ExecutionObservation | null }): OracleResult | { readonly ok: false; readonly detail: string; readonly oracleVersion: string };
