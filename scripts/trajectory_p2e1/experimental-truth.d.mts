/**
 * Trajectory-P2-E1R §7 — TYPE SURFACE for the `.mjs` source-grounded assay truth contract.
 *
 * The repository's convention for a bare-node `.mjs` helper is a sibling `.d.mts` declaration.
 */
export declare const TRUTH_PROPOSITIONS: readonly string[];
export declare const TRUTH_SOURCES: readonly string[];
export declare const TRUTH_VALUES: readonly string[];
export declare const AUTHORITATIVE_SOURCE_OF: Readonly<Record<string, string>>;
export declare const CRITICAL_PROPOSITIONS: readonly string[];

export interface AssayTruthTemplate {
  readonly scenarioId: string;
  readonly family: string;
  readonly dshKnownEventCount: number;
  readonly dshReturnedCount: number;
  readonly dshPageCoverage: string;
}

export interface GroundedProposition {
  readonly id: string;
  readonly truth: "TRUE" | "FALSE" | "UNKNOWN" | "NOT_APPLICABLE";
  readonly authoritativeSource: string;
  readonly evidenceRef: string | null;
  readonly citationHandle: string | null;
  readonly note: string;
}

export interface PropositionAvailability {
  readonly control: string;
  readonly treatment: string;
  readonly why: string;
}

export interface EvidenceBinding {
  readonly proposition: string;
  readonly evidenceRef: string;
  readonly evidenceClass: string;
}

export interface DecisionContract {
  readonly rationale: string;
  readonly permittedActions: readonly string[];
  readonly forbiddenActions: readonly string[];
  readonly deferralIsJustifiedWhen: string;
}

export interface FrozenAssayTruth {
  readonly schemaVersion: number;
  readonly scenarioId: string;
  readonly trialId: string;
  readonly sourceBasis: Readonly<Record<string, string | number>>;
  readonly propositions: readonly GroundedProposition[];
  readonly evidenceBindings: readonly EvidenceBinding[];
  readonly availability: Readonly<Record<string, PropositionAvailability>>;
  readonly decisionContract: DecisionContract;
  readonly digest: string;
}

export interface AssayTruthFacts {
  readonly trialId: string;
  readonly projectId: string;
  readonly originAttemptId: string;
  readonly consumerAttemptId: string;
  readonly dshSessionId: string;
  readonly dshKnownEventCount: number;
  readonly dshReturnedCount: number;
  readonly dshPageCoverage: string;
  readonly gitHead: string;
  readonly resultRef: string | null;
  readonly dshPageEvidenceClass?: string;
}

export declare const ASSAY_TRUTH_TEMPLATE: AssayTruthTemplate;
export declare const REFERENCE_ASSAY_TRUTH: FrozenAssayTruth;
export declare const OWNER_CONSISTENCY_SCENARIOS: readonly Readonly<Record<string, unknown>>[];

export declare function instantiateAssayTruth(facts: AssayTruthFacts): FrozenAssayTruth;
export declare function allowedRefsFor(snapshot: FrozenAssayTruth, propositionId: string): readonly string[];
export declare function assayTruthDigest(snapshot: Omit<FrozenAssayTruth, "digest">): string;
export declare function criticalRequirementsForArm(snapshot: FrozenAssayTruth, armName: string): { readonly mustCredit: readonly string[]; readonly mustNotAssert: readonly string[] };
export declare function detectGroundTruthLeak(renderedTexts: Readonly<Record<string, string>>, snapshot: FrozenAssayTruth): { readonly leaked: boolean; readonly leaks: readonly { readonly where: string; readonly token: string; readonly kind: string }[] };
