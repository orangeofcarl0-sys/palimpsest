/**
 * R1 §33 — the type surface for `scripts/r1/outcomes.mjs`.
 *
 * Same reason as `protocol.d.mts`: the harness is `.mjs` (it runs under bare `node`), the tests are
 * TypeScript under `noImplicitAny`, and declaring the surface here is preferable to loosening the
 * compiler for test code.
 */

/** §24: the experiment-only reporting taxonomy. Never canonical ontology. */
export declare const FAILURE_TAXONOMY: readonly string[];

/** §23: the three verdicts, plus the harness-level BLOCKED which is none of them. */
export declare const VERDICTS: readonly string[];
export declare const BLOCKED: string;

export interface KnownFailureMarker {
  readonly id: string;
  readonly description: string;
  detect(source: string): boolean;
}

/** §20: the scenario-specific, mechanically observable previously-paid cognitive cost. */
export declare const KNOWN_FAILURE_MARKERS: Readonly<Record<string, KnownFailureMarker>>;

/** §20: classify submitted source. Returns UNKNOWN rather than guessing for an unregistered scenario. */
export declare function classifyKnownFailure(scenario: string, source: string): string;

export interface TrialResultInput {
  readonly condition: string;
  readonly scenario: string;
  readonly trialIndex?: number;
  readonly acceptancePass?: boolean;
  readonly firstSubmissionPass?: boolean;
  readonly failedValidationIterations?: number;
  readonly knownInvalidApproachAttempted?: boolean;
  readonly knownPrerequisiteRediscovered?: boolean;
  readonly knownFailureMarker?: string;
  readonly proofPulled?: boolean;
  readonly reasoningPulled?: boolean;
  readonly procedurePulled?: boolean;
  readonly procedureBehaviorallyReflected?: boolean;
  readonly attemptCount?: number;
  readonly workerActionCount?: number;
  readonly elapsedMs?: number;
  readonly tokensIn?: number;
  readonly tokensOut?: number;
  readonly hostInterventions?: number;
  readonly confounded?: boolean;
}

/** §19: normalized trial record. Absent fields are UNKNOWN, never zero and never false. */
export interface NormalizedTrialResult {
  readonly condition: string;
  readonly scenario: string;
  readonly finalAcceptancePass: boolean | string;
  readonly firstSubmissionPass: boolean | string;
  readonly knownFailureMarker: string;
  readonly proofPulled: boolean | string;
  readonly reasoningPulled: boolean | string;
  readonly procedurePulled: boolean | string;
  readonly procedureBehaviorallyReflected: boolean | string;
  readonly tokensIn: number | string;
  readonly tokensOut: number | string;
  readonly confounded: boolean;
  readonly excludedFromPrimary: boolean;
  readonly retainedInRawEvidence: boolean;
  readonly [field: string]: unknown;
}

export declare function normalizeTrialResult(input: TrialResultInput): NormalizedTrialResult;

export interface ScenarioEffect {
  readonly scenario: string;
  readonly effect: boolean;
  readonly outcomeNotWorse: boolean;
  readonly procedureLoadBearing: boolean;
}

export interface VerdictInput {
  readonly blocked?: boolean;
  readonly scenarioEffects: readonly ScenarioEffect[];
  readonly verdictsAvailable?: readonly string[];
}

/** §23: PASS requires BOTH scenarios; BLOCKED short-circuits and is never PASS/PARTIAL/NO_REPLICATION. */
export declare function verdictFor(input: VerdictInput): string;

export interface ConditionSummary {
  readonly n: number;
  readonly finalAcceptancePasses: number;
  readonly knownFailurePresent: number;
  readonly procedureBehaviorallyReflected: number;
  readonly unknownFinalAcceptance: number;
}

export interface TrialSummary {
  readonly trialsTotal: number;
  readonly trialsExcludedFromPrimary: number;
  readonly byCondition: Readonly<Record<string, ConditionSummary>>;
}

export declare function summarize(trials: readonly NormalizedTrialResult[]): TrialSummary;
