/**
 * G10-G2 hypothesis branches, EvidenceHistory observations, and
 * CurrentBeliefState (§63–§85).
 *
 *   Hypothesis ≠ Evidence claim        (§65)
 *   EvidenceHistory ≠ CurrentBeliefState (§5)
 *   WorkerReport ≠ Evidence            (§6/§83)
 *
 * A `CampaignHypothesis` is the Campaign's working branch; it REFERENCES an
 * Evidence-plane claim by `EvidenceClaimRef` (association, not identity).
 * `CampaignEvidenceObservation` is a HISTORICAL observation of the
 * authoritative Evidence plane's standing — never an evidence body.
 *
 * CurrentBeliefState is a DERIVED, non-monotonic projection: belief revisions
 * are only ever produced from an evidence observation, and there is no
 * `setBelief` API. The Campaign module imports neither Work nor the Evidence
 * implementation — the authoritative plane is reached through a read-only
 * `CampaignEvidencePort`.
 */

import { canonicalDigest } from "../schema/canonical.js";
import { isStableIdentifier, normalizeStableIdentifier } from "../schema/identifier.js";
import type { CampaignEventParsers } from "./artifacts.js";

export type HypothesisId = string;

export const CLAIM_STANDING_DIGEST_DOMAIN = "palimpsest.claim-standing.v1";
export const BELIEF_STATE_DIGEST_DOMAIN = "palimpsest.campaign-belief-state.v1";

export class CampaignEpistemicError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CampaignEpistemicError";
  }
}

function fail(message: string): never {
  throw new CampaignEpistemicError(message);
}

function asObject(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail(`${what} must be an object`);
  return value as Record<string, unknown>;
}

function exactKeys(object: Record<string, unknown>, keys: readonly string[], what: string): void {
  for (const key of Object.keys(object)) {
    if (!keys.includes(key)) fail(`unknown ${what} field "${key}"`);
  }
  for (const key of keys) {
    if (!Object.hasOwn(object, key)) fail(`${what}: field "${key}" is required`);
  }
}

function stableId(value: unknown, what: string): string {
  if (typeof value !== "string") fail(`${what} must be a string`);
  const normalized = normalizeStableIdentifier(value);
  if (!isStableIdentifier(normalized)) fail(`${what} must be a stable identifier`);
  return normalized;
}

function nonEmpty(value: unknown, what: string): string {
  if (typeof value !== "string" || value.trim() === "") fail(`${what} must be a non-empty string`);
  return value;
}

/* ------------------------------------------------------------------ *
 * Evidence-plane read bridge (§38–§40)
 * ------------------------------------------------------------------ */

export interface EvidenceClaimRef {
  readonly claimId: string;
}

export type EvidenceKnowledge<T> =
  | { readonly state: "known"; readonly value: T }
  | { readonly state: "unknown"; readonly detail: string }
  | { readonly state: "error"; readonly detail: string };

/** The canonical claim-standing vocabulary, reused verbatim (§13/§72). */
export type CampaignClaimStatus =
  | "SUPPORTED"
  | "PARTIALLY_SUPPORTED"
  | "CONTRADICTED"
  | "INCONCLUSIVE"
  | "STALE";

export interface ClaimStandingSnapshot {
  readonly claim: EvidenceClaimRef;
  readonly status: CampaignClaimStatus;
  readonly supportingEvidenceIds: readonly string[];
  readonly contradictingEvidenceIds: readonly string[];
  readonly provenanceDigest: string;
  readonly digest: string;
}

export interface CampaignEvidencePort {
  inspectClaim(claim: EvidenceClaimRef): Promise<EvidenceKnowledge<ClaimStandingSnapshot>>;
}

export function materializeEvidenceClaimRef(input: { readonly claimId: string }): EvidenceClaimRef {
  return Object.freeze({ claimId: stableId(input.claimId, "claimId") });
}

export function parseEvidenceClaimRef(raw: unknown, what = "EvidenceClaimRef"): EvidenceClaimRef {
  const object = asObject(raw, what);
  exactKeys(object, ["claimId"], what);
  return materializeEvidenceClaimRef({ claimId: object.claimId as string });
}

export function claimStandingDigestContent(input: {
  readonly claim: EvidenceClaimRef;
  readonly status: CampaignClaimStatus;
  readonly supportingEvidenceIds: readonly string[];
  readonly contradictingEvidenceIds: readonly string[];
  readonly provenanceDigest: string;
}): unknown {
  return {
    domain: CLAIM_STANDING_DIGEST_DOMAIN,
    claim: { claimId: input.claim.claimId },
    status: input.status,
    supportingEvidenceIds: [...new Set(input.supportingEvidenceIds)].sort(),
    contradictingEvidenceIds: [...new Set(input.contradictingEvidenceIds)].sort(),
    provenanceDigest: input.provenanceDigest,
  };
}

/** Materialize a standing snapshot; its digest is derived, never caller-chosen. */
export function materializeClaimStandingSnapshot(input: {
  readonly claim: EvidenceClaimRef;
  readonly status: CampaignClaimStatus;
  readonly supportingEvidenceIds: readonly string[];
  readonly contradictingEvidenceIds: readonly string[];
  readonly provenanceDigest: string;
}): ClaimStandingSnapshot {
  const claim = materializeEvidenceClaimRef(input.claim);
  const supporting = Object.freeze([...new Set(input.supportingEvidenceIds)].sort());
  const contradicting = Object.freeze([...new Set(input.contradictingEvidenceIds)].sort());
  const provenanceDigest = nonEmpty(input.provenanceDigest, "provenanceDigest");
  const digest = canonicalDigest(
    claimStandingDigestContent({ claim, status: input.status, supportingEvidenceIds: supporting, contradictingEvidenceIds: contradicting, provenanceDigest }),
  );
  return Object.freeze({ claim, status: input.status, supportingEvidenceIds: supporting, contradictingEvidenceIds: contradicting, provenanceDigest, digest });
}

/** Deterministic mapping from authoritative CampaignClaimStatus to Campaign standing (§78). */
export function beliefStandingOf(status: CampaignClaimStatus): CampaignBeliefStanding {
  switch (status) {
    case "SUPPORTED":
      return "supported";
    case "PARTIALLY_SUPPORTED":
      return "partially_supported";
    case "CONTRADICTED":
      return "contradicted";
    case "INCONCLUSIVE":
      return "inconclusive";
    case "STALE":
      return "stale";
    default:
      fail("unknown CampaignClaimStatus");
  }
}

/* ------------------------------------------------------------------ *
 * CampaignHypothesis (§64–§69)
 * ------------------------------------------------------------------ */

export interface CampaignHypothesis {
  readonly hypothesisId: HypothesisId;
  readonly campaignId: string;
  readonly statement: string;
  readonly claim: EvidenceClaimRef;
  readonly parentHypothesisId?: HypothesisId;
}

export function materializeCampaignHypothesis(input: {
  readonly hypothesisId: HypothesisId;
  readonly campaignId: string;
  readonly statement: string;
  readonly claim: EvidenceClaimRef;
  readonly parentHypothesisId?: HypothesisId | undefined;
}): CampaignHypothesis {
  const base = {
    hypothesisId: stableId(input.hypothesisId, "hypothesisId"),
    campaignId: stableId(input.campaignId, "campaignId"),
    statement: nonEmpty(input.statement, "statement"),
    claim: materializeEvidenceClaimRef(input.claim),
  };
  return Object.freeze(
    input.parentHypothesisId === undefined
      ? base
      : { ...base, parentHypothesisId: stableId(input.parentHypothesisId, "parentHypothesisId") },
  );
}

export function parseCampaignHypothesis(raw: unknown, what = "CampaignHypothesis"): CampaignHypothesis {
  const object = asObject(raw, what);
  const allowed = ["hypothesisId", "campaignId", "statement", "claim", "parentHypothesisId"];
  const required = ["hypothesisId", "campaignId", "statement", "claim"];
  for (const key of Object.keys(object)) {
    if (!allowed.includes(key)) fail(`unknown ${what} field "${key}"`);
  }
  for (const key of required) {
    if (!Object.hasOwn(object, key)) fail(`${what}: field "${key}" is required`);
  }
  const parent = object.parentHypothesisId;
  return materializeCampaignHypothesis({
    hypothesisId: object.hypothesisId as string,
    campaignId: object.campaignId as string,
    statement: object.statement as string,
    claim: parseEvidenceClaimRef(object.claim, `${what}.claim`),
    parentHypothesisId: parent === undefined || parent === null ? undefined : (parent as string),
  });
}

/* ------------------------------------------------------------------ *
 * Observations & belief revisions (§72–§80)
 * ------------------------------------------------------------------ */

export interface CampaignEvidenceObservation {
  readonly observationId: string;
  readonly campaignId: string;
  readonly hypothesisId: HypothesisId;
  readonly standing: ClaimStandingSnapshot;
}

export type CampaignBeliefStanding =
  | "supported"
  | "partially_supported"
  | "contradicted"
  | "inconclusive"
  | "stale";

export interface BeliefRevisionRef {
  readonly beliefRevisionId: string;
}

export interface BeliefRevision {
  readonly beliefRevisionId: string;
  readonly campaignId: string;
  readonly hypothesisId: HypothesisId;
  readonly previous: BeliefRevisionRef | null;
  readonly standing: CampaignBeliefStanding;
  readonly evidenceObservationId: string;
}

export function materializeObservation(input: {
  readonly observationId: string;
  readonly campaignId: string;
  readonly hypothesisId: HypothesisId;
  readonly standing: ClaimStandingSnapshot;
}): CampaignEvidenceObservation {
  return Object.freeze({
    observationId: stableId(input.observationId, "observationId"),
    campaignId: stableId(input.campaignId, "campaignId"),
    hypothesisId: stableId(input.hypothesisId, "hypothesisId"),
    standing: parseClaimStandingSnapshot(input.standing),
  });
}

export function parseClaimStandingSnapshot(raw: unknown, what = "ClaimStandingSnapshot"): ClaimStandingSnapshot {
  const object = asObject(raw, what);
  exactKeys(
    object,
    ["claim", "status", "supportingEvidenceIds", "contradictingEvidenceIds", "provenanceDigest", "digest"],
    what,
  );
  const status = object.status;
  if (status !== "SUPPORTED" && status !== "PARTIALLY_SUPPORTED" && status !== "CONTRADICTED" && status !== "INCONCLUSIVE" && status !== "STALE") {
    fail(`${what}.status must be a CampaignClaimStatus`);
  }
  const snapshot = materializeClaimStandingSnapshot({
    claim: parseEvidenceClaimRef(object.claim, `${what}.claim`),
    status,
    supportingEvidenceIds: object.supportingEvidenceIds as string[],
    contradictingEvidenceIds: object.contradictingEvidenceIds as string[],
    provenanceDigest: object.provenanceDigest as string,
  });
  if (snapshot.digest !== object.digest) fail(`${what}.digest does not match its content`);
  return snapshot;
}

export function parseObservation(raw: unknown, what = "CampaignEvidenceObservation"): CampaignEvidenceObservation {
  const object = asObject(raw, what);
  exactKeys(object, ["observationId", "campaignId", "hypothesisId", "standing"], what);
  return materializeObservation({
    observationId: object.observationId as string,
    campaignId: object.campaignId as string,
    hypothesisId: object.hypothesisId as string,
    standing: parseClaimStandingSnapshot(object.standing, `${what}.standing`),
  });
}

export function materializeBeliefRevision(input: {
  readonly beliefRevisionId: string;
  readonly campaignId: string;
  readonly hypothesisId: HypothesisId;
  readonly previous: BeliefRevisionRef | null;
  readonly standing: CampaignBeliefStanding;
  readonly evidenceObservationId: string;
}): BeliefRevision {
  const standing = input.standing;
  if (!["supported", "partially_supported", "contradicted", "inconclusive", "stale"].includes(standing)) {
    fail("standing must be a CampaignBeliefStanding");
  }
  return Object.freeze({
    beliefRevisionId: stableId(input.beliefRevisionId, "beliefRevisionId"),
    campaignId: stableId(input.campaignId, "campaignId"),
    hypothesisId: stableId(input.hypothesisId, "hypothesisId"),
    previous:
      input.previous === null
        ? null
        : Object.freeze({ beliefRevisionId: stableId(input.previous.beliefRevisionId, "previous.beliefRevisionId") }),
    standing,
    evidenceObservationId: stableId(input.evidenceObservationId, "evidenceObservationId"),
  });
}

export function parseBeliefRevision(raw: unknown, what = "BeliefRevision"): BeliefRevision {
  const object = asObject(raw, what);
  exactKeys(object, ["beliefRevisionId", "campaignId", "hypothesisId", "previous", "standing", "evidenceObservationId"], what);
  const previousRaw = object.previous;
  const previous =
    previousRaw === null || previousRaw === undefined
      ? null
      : { beliefRevisionId: asObject(previousRaw, `${what}.previous`).beliefRevisionId as string };
  return materializeBeliefRevision({
    beliefRevisionId: object.beliefRevisionId as string,
    campaignId: object.campaignId as string,
    hypothesisId: object.hypothesisId as string,
    previous,
    standing: object.standing as CampaignBeliefStanding,
    evidenceObservationId: object.evidenceObservationId as string,
  });
}

/* ------------------------------------------------------------------ *
 * Event parsers (§83 firewall: only admitted observations reach beliefs)
 * ------------------------------------------------------------------ */

export const CAMPAIGN_EPISTEMIC_EVENT_PARSERS: CampaignEventParsers = Object.freeze({
  HYPOTHESIS_PROPOSED: (payload: unknown) => {
    const object = asObject(payload, "HYPOTHESIS_PROPOSED");
    exactKeys(object, ["hypothesis"], "HYPOTHESIS_PROPOSED");
    return Object.freeze({ hypothesis: parseCampaignHypothesis(object.hypothesis) });
  },
  HYPOTHESIS_RETIRED: (payload: unknown) => {
    const object = asObject(payload, "HYPOTHESIS_RETIRED");
    exactKeys(object, ["hypothesisId", "reason"], "HYPOTHESIS_RETIRED");
    return Object.freeze({
      hypothesisId: stableId(object.hypothesisId, "hypothesisId"),
      reason: nonEmpty(object.reason, "reason"),
    });
  },
  EVIDENCE_OBSERVED: (payload: unknown) => {
    const object = asObject(payload, "EVIDENCE_OBSERVED");
    exactKeys(object, ["observation"], "EVIDENCE_OBSERVED");
    return Object.freeze({ observation: parseObservation(object.observation) });
  },
  BELIEF_REVISED: (payload: unknown) => {
    const object = asObject(payload, "BELIEF_REVISED");
    exactKeys(object, ["revision"], "BELIEF_REVISED");
    return Object.freeze({ revision: parseBeliefRevision(object.revision) });
  },
});

/* ------------------------------------------------------------------ *
 * Derived CurrentBeliefState (§75/§80)
 * ------------------------------------------------------------------ */

export interface CurrentBeliefEntry {
  readonly hypothesisId: HypothesisId;
  readonly beliefRevisionId: string;
  readonly standing: CampaignBeliefStanding;
}

export interface CurrentBeliefState {
  readonly campaignId: string;
  readonly entries: readonly CurrentBeliefEntry[];
  readonly digest: string;
}

export function currentBeliefStateOf(campaignId: string, revisions: readonly BeliefRevision[]): CurrentBeliefState {
  const latest = new Map<HypothesisId, BeliefRevision>();
  // Revisions are in append-only order; the last revision for a hypothesis is
  // current. No monotonicity is assumed — beliefs may move both ways (§79).
  for (const revision of revisions) {
    latest.set(revision.hypothesisId, revision);
  }
  const entries = Object.freeze(
    [...latest.values()]
      .map((revision) => Object.freeze({ hypothesisId: revision.hypothesisId, beliefRevisionId: revision.beliefRevisionId, standing: revision.standing }))
      .sort((a, b) => (a.hypothesisId < b.hypothesisId ? -1 : a.hypothesisId > b.hypothesisId ? 1 : 0)),
  );
  const digest = canonicalDigest({ domain: BELIEF_STATE_DIGEST_DOMAIN, campaignId, entries });
  return Object.freeze({ campaignId, entries, digest });
}
