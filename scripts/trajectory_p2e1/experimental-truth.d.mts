/**
 * Trajectory-P2-E1 §7 — TYPE SURFACE for the `.mjs` source-grounded experimental truth contract.
 *
 * The repository's convention for a bare-node `.mjs` helper is a sibling `.d.mts` declaration.
 */
export declare const TRUTH_PROPOSITIONS: readonly string[];
export declare const TRUTH_SOURCES: readonly string[];
export declare const TRUTH_VALUES: readonly string[];
export declare const AUTHORITATIVE_SOURCE_OF: Readonly<Record<string, string>>;

export interface GroundedProposition {
  readonly id: string;
  readonly truth: "TRUE" | "FALSE" | "UNKNOWN" | "NOT_APPLICABLE";
  readonly authoritativeSource: string;
  readonly evidenceRef: string | null;
  readonly note: string;
}

export interface PropositionAvailability {
  readonly control: string;
  readonly treatment: string;
  readonly why: string;
}

export interface GroundedTruthSnapshot {
  readonly fixtureId: string;
  readonly sourceBasis: Readonly<Record<string, string | number>>;
  readonly propositions: readonly GroundedProposition[];
  readonly digestNote: string;
  readonly availability: Readonly<Record<string, PropositionAvailability>>;
}

export interface DecisionContract {
  readonly rationale: string;
  readonly permittedActions: readonly string[];
  readonly forbiddenActions: readonly string[];
  readonly deferralIsJustifiedWhen: string;
}

export declare const GROUNDED_TRUTH_SNAPSHOT: GroundedTruthSnapshot;
export declare const DECISION_CONTRACT: DecisionContract;
export declare const EVIDENCE_ALLOWLIST: readonly string[];
export declare const OWNER_CONSISTENCY_SCENARIOS: readonly Readonly<Record<string, unknown>>[];

export declare function groundTruthDigest(snapshot?: GroundedTruthSnapshot): string;
export declare function detectGroundTruthLeak(renderedTexts: Readonly<Record<string, string>>): { readonly leaked: boolean; readonly leaks: readonly { readonly where: string; readonly token: string; readonly kind: string }[] };
