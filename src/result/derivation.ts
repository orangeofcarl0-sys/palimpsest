/**
 * PLMP-LEAN-1 §D3-d1 — RESULT DERIVATION: the ontology of an effect that produces a CANDIDATE.
 *
 *     D3-d Effect  ≠  Canonical Effect
 *
 * This is the first slice where an effect exists, so the boundary is the whole design:
 *
 *     origin result R0 @ basis B0
 *       → compatibility proof  → cross-basis admission  → target basis B1
 *       → ISOLATED rematerialization  → new candidate result R1 @ B1
 *       → verification  → the EXISTING promotion eligibility  → (eventually) Promotion authority
 *
 * A cross-basis admission grants permission to ATTEMPT A REMATERIALIZATION. It does not grant permission
 * to mutate canonical state, and this slice never does: canonical source is still changed only by
 * Promotion authority. Collapsing those two would make `Assessment ≠ Admission ≠ Effect ≠ Promotion`
 * into one layer again, and verification, expected-head discipline and current-state admission would all
 * become after-the-fact checks — contradicting `admissibility precedes canonicalization`.
 *
 * WHY THIS IS NOT A NEW ATTEMPT. `Attempt A → worker executed → result R0` is real history. Rematerializing
 * R0 onto B1 runs NO worker: no Work is executed a second time. So fabricating `ATTEMPT_STARTED` /
 * `ATTEMPT_COMPLETED` would make the execution history lie. A derivation is therefore its own concept,
 * with `REMATERIALIZATION` as its first kind — leaving room for asset rematerialization, deterministic
 * conversion, format migration and result composition, none of which are Work execution either.
 *
 * WHY THE UPPER CONCEPT IS NOT "TRANSPLANT". `GitSourceRematerializer` is ONE first-party implementation
 * of one facet. Naming the concept after the git mechanism would lock `Project result == Git commit` back
 * in at the very layer built to escape it.
 *
 * Layer: L2 (`src/project_world/`). Not re-exported from the domain barrel.
 */
import { canonicalDigest } from "../schema/canonical.js";

export const RESULT_DERIVATION_KINDS = [
  /**
   * Re-materializing an existing result's admitted source delta onto a different basis. The first kind,
   * and deliberately not the only shape the concept admits.
   */
  "REMATERIALIZATION",
] as const;
export type ResultDerivationKind = (typeof RESULT_DERIVATION_KINDS)[number];

/**
 * ONE derivation attempt, identified by its OPERATION identity rather than by its output.
 *
 *     (originResult, targetBasis, admission, mechanismVersion)
 *
 * The same operation identity MUST yield the same canonical derivation record. It is deliberately NOT
 * "the same output commit hash": D2-d already measured that two independent executions producing
 * byte-identical commits is legitimate, and requiring a stable hash would be asserting something about
 * git's deduplication rather than about this product's promise.
 */
export interface ResultDerivation {
  readonly schemaVersion: 1;
  readonly derivationId: string;
  readonly kind: ResultDerivationKind;
  /** Which implementation performed it — a name for provenance, never an authority. */
  readonly mechanism: string;
  readonly mechanismVersion: string;
  /** WHICH result was rematerialized. */
  readonly originResultManifestDigest: string;
  /** WHICH basis it came from. */
  readonly originBasisDigest: string;
  /** WHICH basis it was rematerialized onto. */
  readonly targetBasisDigest: string;
  /** The compatibility certificate that authorized the attempt. */
  readonly admissionRef: string;
}

const DERIVATION_ID_DOMAIN = "palimpsest.result-derivation.v1";

export function resultDerivationIdOf(input: Omit<ResultDerivation, "schemaVersion" | "derivationId">): string {
  return `deriv-${canonicalDigest({ domain: DERIVATION_ID_DOMAIN, ...input }).slice(0, 32)}`;
}

export function materializeResultDerivation(
  input: Omit<ResultDerivation, "schemaVersion" | "derivationId">,
): ResultDerivation {
  return Object.freeze({ schemaVersion: 1 as const, ...input, derivationId: resultDerivationIdOf(input) });
}

/**
 * A candidate result: a NEW result identity produced by a derivation.
 *
 *     R_1 is a new result identity
 *
 * The origin attempt is untouched — `A.basis = B0` and `A.result = R0` stay exactly as they were. That is
 * provenance immutability carried one stage further: a later stage's effect cannot rewrite an earlier
 * stage's facts.
 */
export interface DerivedResultCandidate {
  readonly schemaVersion: 1;
  readonly candidateId: string;
  readonly projectId: string;
  readonly taskId: string;
  readonly derivation: ResultDerivation;
  /**
   * The candidate's source facet. `baseRevision` is the TARGET basis, which is what makes the candidate
   * an ordinary same-basis candidate for everything downstream.
   */
  readonly sourceResult: {
    readonly backend: string;
    readonly baseRevision: string;
    readonly resultRevision: string;
  } | null;
  /** Authoritative outputs. A derivation that declares none carries none — it never guesses. */
  readonly producedAssetRefs: readonly string[];
  readonly resultManifestDigest: string;
  readonly derivedAt: string;
}

const CANDIDATE_MANIFEST_DOMAIN = "palimpsest.derived-result-candidate.v1";

export function derivedResultManifestDigest(
  input: Omit<DerivedResultCandidate, "schemaVersion" | "candidateId" | "resultManifestDigest" | "derivedAt">,
): string {
  return canonicalDigest({
    domain: CANDIDATE_MANIFEST_DOMAIN,
    projectId: input.projectId,
    taskId: input.taskId,
    derivationId: input.derivation.derivationId,
    sourceResult: input.sourceResult,
    producedAssetRefs: [...input.producedAssetRefs].sort(),
  });
}

export function materializeDerivedResultCandidate(
  input: Omit<DerivedResultCandidate, "schemaVersion" | "candidateId" | "resultManifestDigest">,
): DerivedResultCandidate {
  const body = {
    schemaVersion: 1 as const,
    projectId: input.projectId,
    taskId: input.taskId,
    derivation: input.derivation,
    sourceResult: input.sourceResult,
    producedAssetRefs: Object.freeze([...input.producedAssetRefs].sort()),
    derivedAt: input.derivedAt,
  };
  const resultManifestDigest = derivedResultManifestDigest(body);
  return Object.freeze({
    ...body,
    candidateId: `candidate-${resultManifestDigest.slice(0, 32)}`,
    resultManifestDigest,
  });
}
