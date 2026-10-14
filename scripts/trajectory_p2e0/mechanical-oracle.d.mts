/**
 * Trajectory-P2-E0 §12 — TYPE SURFACE for the `.mjs` mechanical oracle.
 *
 * `tsc` under `noImplicitAny` refuses an untyped `.mjs` import; the repository's convention for a bare-node
 * `.mjs` helper is a sibling `.d.mts` declaration (see `scripts/trajectory_p2b/rig.d.mts`).
 */
export declare const ORACLE_DIMENSIONS: readonly ["historicalUnderstanding", "decisionQuality", "operationalBehavior"];
export declare const ANSWER_FIELDS: readonly ["factsReliedUpon", "knownUnknowns", "proposedNextAction", "verificationRequired", "sourceReferences", "confidence"];

export interface StructuredAnswer {
  readonly factsReliedUpon: readonly string[];
  readonly knownUnknowns: readonly string[];
  readonly proposedNextAction: string;
  readonly verificationRequired: boolean;
  readonly sourceReferences: readonly string[];
  readonly confidence: "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";
}

export interface GroundTruthKey {
  readonly requiredFacts: readonly { readonly id: string; readonly mustMention: readonly string[]; readonly weight: number }[];
  readonly requiredUnknowns: readonly { readonly id: string; readonly mustMention: readonly string[]; readonly weight: number }[];
  readonly forbiddenClaims: readonly { readonly id: string; readonly tokens: readonly string[]; readonly why: string }[];
  readonly decision: {
    readonly acceptableActions: readonly { readonly mustMention: readonly string[] }[];
    readonly forbidden: readonly { readonly mustMention: readonly string[]; readonly why: string }[];
  };
  readonly operational: { readonly mustNotRepeat?: readonly string[] };
}

export interface OracleVerdict {
  readonly historicalUnderstanding: boolean;
  readonly decisionQuality: boolean;
  readonly operationalBehavior: boolean;
}

export interface OracleResult {
  readonly ok: true;
  readonly refusalWithoutSubstance: boolean;
  readonly historicalUnderstanding: {
    readonly factScore: number;
    readonly unknownScore: number;
    readonly forbiddenViolations: readonly { readonly id: string; readonly why: string }[];
    readonly pass: boolean;
    readonly detail: { readonly factHits: readonly { readonly id: string; readonly hit: boolean }[]; readonly unknownHits: readonly { readonly id: string; readonly hit: boolean }[] };
  };
  readonly decisionQuality: { readonly acceptableAction: boolean; readonly violations: readonly { readonly why: string }[]; readonly pass: boolean; readonly refusalWithoutSubstance: boolean };
  readonly operationalBehavior: { readonly applicable: boolean; readonly repeated: readonly string[]; readonly pass: boolean };
  readonly verdict: OracleVerdict;
}

export declare function validateAnswer(raw: unknown): { readonly ok: true; readonly answer: StructuredAnswer } | { readonly ok: false; readonly detail: string };
export declare function detectRefusalWithoutSubstance(answer: { readonly factsReliedUpon: readonly string[]; readonly knownUnknowns: readonly string[]; readonly proposedNextAction: string }): { readonly refusalWithoutSubstance: boolean };
export declare function judgeAnswer(key: GroundTruthKey, answer: unknown): OracleResult | { readonly ok: false; readonly detail: string };
