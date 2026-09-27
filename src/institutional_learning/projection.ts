/**
 * E4-L — GOVERNED INSTITUTIONAL LEARNING: the STRUCTURAL INTERVENTION PROJECTION.
 *
 * ## The equation this module turns on
 *
 *     existing evolution truth  ✕  existing empirical memory
 *
 * Both sides already exist and both already persist enough to answer "why did the structure change?".
 * The gap E4-L closes is the CONNECTION — and the connection must not become a merge:
 *
 *     InterventionRecord ≠ EvolutionAuthority        Intervention ≠ Causation
 *     Memory ≠ Structure mutation                     Evaluation ≠ Governance
 *
 * ## The two lanes (§5/§26)
 *
 * Organization and runtime structural evolution are DISTINCT owners with DISTINCT case identities, so
 * the projection uses a strict discriminated source ref rather than one interchangeable string. A
 * runtime case ref can never be mistaken for an organization case ref, even if a caller passes one.
 *
 * ## §6 proposal preservation
 *
 * `EVOLUTION_CASE_OPENED` carries only `proposalDigest + subjectKey`. E4-L adds an additive
 * `EVOLUTION_PROPOSAL_BOUND` / `RUNTIME_EVOLUTION_PROPOSAL_BOUND` event carrying the exact parsed
 * `OrganizationDynamicsProposal`, so `snapshotDigest`, `intent` and `basisDigest` are reconstructible
 * from durable history alone. Legacy cases without it are reported `LEGACY_PROVENANCE_INCOMPLETE` —
 * never guessed at (§27).
 *
 * Layer: L2 (`src/institutional_learning/`).
 */
import { canonicalDigest } from "../schema/canonical.js";
import type { OrganizationDynamicsProposal } from "../organization_dynamics/index.js";

/* ------------------------------------------------------------------ *
 * §5/§26 the structural source ref
 * ------------------------------------------------------------------ */

export const STRUCTURAL_LANES = ["organization_evolution", "runtime_evolution"] as const;
export type StructuralLane = (typeof STRUCTURAL_LANES)[number];

/**
 * §26: a strict discriminated source ref. The two case-ref domains are NOT interchangeable, so the lane
 * is carried explicitly rather than inferred from a prefix a caller could forge.
 */
export interface StructuralSourceRef {
  readonly lane: StructuralLane;
  readonly caseRef: string;
}

export function structuralSourceRefOf(lane: StructuralLane, caseRef: string): StructuralSourceRef {
  if (!(STRUCTURAL_LANES as readonly string[]).includes(lane)) {
    throw new Error(`unknown structural lane "${String(lane)}"`);
  }
  if (typeof caseRef !== "string" || caseRef.trim() === "") {
    throw new Error("a structural source ref needs a non-empty caseRef");
  }
  return Object.freeze({ lane, caseRef });
}

/** §26: the stable, prefixed key. Two lanes with the same case string are still two different cases. */
export function structuralSourceKey(ref: StructuralSourceRef): string {
  return `${ref.lane}:${ref.caseRef}`;
}

export function parseStructuralSourceKey(key: string): StructuralSourceRef {
  const separator = key.indexOf(":");
  if (separator <= 0) throw new Error(`"${key}" is not a structural source key`);
  const lane = key.slice(0, separator);
  const caseRef = key.slice(separator + 1);
  return structuralSourceRefOf(lane as StructuralLane, caseRef);
}

/* ------------------------------------------------------------------ *
 * §9 the projected intervention
 * ------------------------------------------------------------------ */

export const INTERVENTION_PROJECTION_DOMAIN = "palimpsest.institutional-learning.intervention-projection.v1";

/**
 * §9: what an ACTIVATED structural case projects into OrganizationMemory. It is NOT a new artifact: it
 * is the exact input to the EXISTING `materializeIntervention`.
 *
 * `afterRef` is `null` when no immediate post-observation exists (§19) — a legitimate, honest state, and
 * NOT a reason to invent one.
 */
export interface StructuralInterventionProjection {
  readonly source: StructuralSourceRef;
  readonly proposalDigest: string;
  readonly evolutionCaseRef: string;
  /** §9: the proposal's own snapshot digest — the "before" observation. */
  readonly beforeRef: string;
  /** §9/§19: `EVOLUTION_POST_OBSERVED.afterSnapshotDigest` when present, else null. */
  readonly afterRef: string | null;
  readonly rationale: string;
  readonly observationBasis: string;
  readonly subjectRefs: readonly string[];
}

/**
 * §27: a case that cannot be projected honestly. `LEGACY_PROVENANCE_INCOMPLETE` is a REPORTED state, not
 * an error: an activated case from before E4-L has no bound proposal body, and the learning layer says so
 * instead of reconstructing intent from a guess.
 */
export const INTERVENTION_PROJECTION_REFUSALS = [
  "LEGACY_PROVENANCE_INCOMPLETE",
  "CASE_NOT_ACTIVATED",
  "CASE_UNKNOWN",
] as const;
export type InterventionProjectionRefusal = (typeof INTERVENTION_PROJECTION_REFUSALS)[number];

export type InterventionProjectionOutcome =
  | { readonly status: "projected"; readonly projection: StructuralInterventionProjection }
  | { readonly status: "not_activated"; readonly refusal: "CASE_NOT_ACTIVATED"; readonly detail: string }
  | { readonly status: "incomplete"; readonly refusal: "LEGACY_PROVENANCE_INCOMPLETE"; readonly detail: string };

/**
 * §6/§9: derive the projection from an ACTIVATED case's durable events.
 *
 * The rules, in order:
 *
 *   1. the case must carry an activation event, else there is no structural change to record;
 *   2. the case must carry the bound proposal, else the provenance is incomplete (legacy) — §27;
 *   3. `proposalDigest` is the proposal's OWN digest, re-derived (never a caller's claim);
 *   4. `beforeRef` is the proposal's snapshot digest, `afterRef` is the post-observation when present.
 *
 * Pure and total: it reads events and returns an outcome. It writes nothing.
 */
export function projectActivatedCase(input: {
  readonly lane: StructuralLane;
  readonly caseRef: string;
  readonly events: readonly { readonly type: string; readonly payload: unknown }[];
}): InterventionProjectionOutcome {
  const source = structuralSourceRefOf(input.lane, input.caseRef);
  const activationType = input.lane === "organization_evolution" ? "EVOLUTION_ACTIVATED" : "RUNTIME_EVOLUTION_ACTIVATED";
  const proposalType = input.lane === "organization_evolution" ? "EVOLUTION_PROPOSAL_BOUND" : "RUNTIME_EVOLUTION_PROPOSAL_BOUND";
  const postType = input.lane === "organization_evolution" ? "EVOLUTION_POST_OBSERVED" : "RUNTIME_EVOLUTION_POST_OBSERVED";

  const activated = input.events.some((event) => event.type === activationType);
  if (!activated) {
    return Object.freeze({
      status: "not_activated" as const,
      refusal: "CASE_NOT_ACTIVATED" as const,
      detail: `case "${input.caseRef}" has no ${activationType} event — there is no structural change to record`,
    });
  }

  const bound = input.events.find((event) => event.type === proposalType);
  if (bound === undefined) {
    return Object.freeze({
      status: "incomplete" as const,
      refusal: "LEGACY_PROVENANCE_INCOMPLETE" as const,
      detail: `case "${input.caseRef}" was activated before its proposal was durably bound — the exact proposal body is not recoverable`,
    });
  }
  const proposal = (bound.payload as { readonly proposal: OrganizationDynamicsProposal }).proposal;

  const post = input.events.find((event) => event.type === postType);
  const afterRef =
    post === undefined
      ? null
      : ((post.payload as { readonly afterSnapshotDigest: string | null }).afterSnapshotDigest ?? null);

  return Object.freeze({
    status: "projected" as const,
    projection: Object.freeze({
      source,
      proposalDigest: proposal.digest,
      evolutionCaseRef: structuralSourceKey(source),
      beforeRef: proposal.snapshotDigest,
      afterRef,
      rationale: proposal.intent,
      observationBasis: proposal.basisDigest,
      subjectRefs: Object.freeze([subjectRefOf(source)]),
    }),
  });
}

/**
 * §9/§26: the subject ref an intervention is filed under. It names the LANE and the case, so
 * `structuralHistory(subjectRef)` groups a lane's changes without merging the two owners.
 */
export function subjectRefOf(source: StructuralSourceRef): string {
  return structuralSourceKey(source);
}

/**
 * §10: the content fingerprint of a projection. Reconciliation compares this, so "same case, same
 * expected content" is an exact equality rather than a heuristic — and a conflict is detectable.
 */
export function interventionContentDigest(projection: StructuralInterventionProjection): string {
  return canonicalDigest({
    domain: INTERVENTION_PROJECTION_DOMAIN,
    proposalDigest: projection.proposalDigest,
    evolutionCaseRef: projection.evolutionCaseRef,
    beforeRef: projection.beforeRef,
    afterRef: projection.afterRef,
    rationale: projection.rationale,
    observationBasis: projection.observationBasis,
    subjectRefs: projection.subjectRefs,
  });
}

/**
 * §10: the SAME fingerprint, computed from a STORED `InterventionRecord`'s fields.
 *
 * Reconciliation needs to compare "what durable evolution history implies" against "what empirical memory
 * already holds". The stored record carries every field the projection derives, so the comparison is an
 * equality on one canonical function rather than two parallel notions of sameness. `evolutionCaseRef`
 * embeds the lane (`lane:caseRef`), so the source is recoverable from the record itself.
 */
export function interventionContentDigestOfRecord(record: {
  readonly subjectRefs: readonly string[];
  readonly proposalDigest?: string | undefined;
  readonly evolutionCaseRef?: string | undefined;
  readonly beforeRef?: string | undefined;
  readonly afterRef?: string | undefined;
  readonly rationale: string;
  readonly observationBasis: string;
}): string {
  return canonicalDigest({
    domain: INTERVENTION_PROJECTION_DOMAIN,
    proposalDigest: record.proposalDigest ?? null,
    evolutionCaseRef: record.evolutionCaseRef ?? null,
    beforeRef: record.beforeRef ?? null,
    afterRef: record.afterRef ?? null,
    rationale: record.rationale,
    observationBasis: record.observationBasis,
    subjectRefs: record.subjectRefs,
  });
}
