/**
 * E5-P §6/§8 — EMPIRICAL GROUNDS and the content-addressed PROCEDURE CANDIDATE.
 *
 *     ProcedureCandidate  ≠  PublishedProcedure
 *     a candidate is a VALUE  —  it is stored nowhere and grants nothing
 *
 * §6: a procedure must not appear from an ungrounded model prompt. Every candidate names at
 * least one empirical ground drawn from EXISTING durable experience — an
 * `OrganizationEvaluation`, a `RunResult` or an `InterventionRecord` — and each ground carries
 * the exact digest of the record it points at, so a later admission can prove the record still
 * resolves rather than trusting the reference.
 *
 * §6 also forbids inventing a confidence: there is deliberately no `confidence`, no `score`
 * and no `weight` field anywhere in this module. A number like `0.91` would be a fabricated
 * quantity with no owner behind it, which is precisely what the ruling rejects.
 *
 * §8: identity is content-addressed. `candidateId` derives from the digest of the content, the
 * grounds and the provenance — never from a random UUID, never from a wall-clock value, and
 * never from the order the grounds arrived in (`canonicalGrounds` sorts and deduplicates).
 *
 * Layer: L2 (`src/procedures/`). Depends on `src/schema/` and its own `content.ts`.
 */

import { canonicalDigest } from "../schema/canonical.js";
import {
  PROCEDURE_CONTENT_KEYS,
  canonicalProcedureList,
  materializeProcedureContent,
  procedureDigest,
  procedureFail,
  procedureKeys,
  procedureObject,
  procedureText,
  parseProcedureContent,
  procedureContentDigestOf,
  type ProcedureContent,
} from "./content.js";

export const PROCEDURE_CANDIDATE_DOMAIN = "palimpsest.procedures.candidate.v1";
export const PROCEDURE_CANDIDATE_ID_DOMAIN = "palimpsest.procedures.candidate-id.v1";
export const PROCEDURE_GROUND_DOMAIN = "palimpsest.procedures.ground.v1";
export const PROCEDURE_GROUND_KEY_DOMAIN = "palimpsest.procedures.ground-key.v1";

/**
 * §6: the CLOSED set of empirical grounds V1 supports. The three named kinds are the ones the
 * ruling prioritizes, and they already exist as durable records in `src/organization_memory/`.
 *
 * A fourth kind is not a convenience extension: an ungrounded or loosely-grounded procedure is
 * exactly what §6 exists to prevent, so an unknown kind fails closed.
 */
export const PROCEDURE_GROUND_KINDS = ["ORGANIZATION_EVALUATION", "RUN_RESULT", "INTERVENTION_RECORD"] as const;
export type ProcedureGroundKind = (typeof PROCEDURE_GROUND_KINDS)[number];

export interface ProcedureGround {
  readonly kind: ProcedureGroundKind;
  /** The owner's own ref (`eval-…`, `run-…`, `ivr-…`) — an opaque identity, never a body. */
  readonly ref: string;
  /** The exact digest of the referenced record, so admission can prove it still resolves. */
  readonly digest: string;
  /** The experiment the record belongs to, when the owner's ref alone does not name it. */
  readonly experimentRef?: string | undefined;
}

export const PROCEDURE_GROUND_KEYS = ["kind", "ref", "digest", "experimentRef"] as const;

/** A stable, sortable key for one ground — the ground's identity within a candidate. */
export function procedureGroundKey(ground: ProcedureGround): string {
  return canonicalDigest({ domain: PROCEDURE_GROUND_KEY_DOMAIN, ground });
}

export function parseProcedureGround(raw: unknown, what = "ProcedureGround"): ProcedureGround {
  const object = procedureObject(raw, what);
  procedureKeys(object, PROCEDURE_GROUND_KEYS, ["kind", "ref", "digest"], what);
  const kind = object.kind;
  if (typeof kind !== "string" || !(PROCEDURE_GROUND_KINDS as readonly string[]).includes(kind)) {
    procedureFail("invalid_value", `${what}.kind must be one of ${PROCEDURE_GROUND_KINDS.join(", ")}`);
  }
  const experimentRef = object.experimentRef === undefined ? undefined : procedureText(object.experimentRef, `${what}.experimentRef`);
  return Object.freeze({
    kind: kind as ProcedureGroundKind,
    ref: procedureText(object.ref, `${what}.ref`),
    digest: procedureDigest(object.digest, `${what}.digest`),
    ...(experimentRef === undefined ? {} : { experimentRef }),
  });
}

/**
 * §8: canonicalize the ground SET. Deduplicated by ground identity and sorted, so the same
 * evidence presented in a different order converges on the same candidate.
 */
export function canonicalGrounds(value: unknown, what: string): readonly ProcedureGround[] {
  if (!Array.isArray(value)) procedureFail("malformed_artifact", `${what} must be an array`);
  const byKey = new Map<string, ProcedureGround>();
  for (const [index, entry] of value.entries()) {
    const ground = parseProcedureGround(entry, `${what}[${index}]`);
    byKey.set(procedureGroundKey(ground), ground);
  }
  return Object.freeze([...byKey.entries()].sort((left, right) => (left[0] < right[0] ? -1 : left[0] > right[0] ? 1 : 0)).map(([, ground]) => ground));
}

/** §6: at least one empirical ground is REQUIRED. */
export const PROCEDURE_GROUNDING_REFUSALS = [
  "PROCEDURE_NO_EMPIRICAL_GROUND",
  "PROCEDURE_GROUND_UNKNOWN",
  "PROCEDURE_GROUND_DIGEST_MISMATCH",
  "PROCEDURE_GROUND_CAPABILITY_UNAVAILABLE",
] as const;
export type ProcedureGroundingRefusal = (typeof PROCEDURE_GROUNDING_REFUSALS)[number];

/**
 * §8: where the candidate came from. `authoringOrigin` names the UNTRUSTED seam that proposed
 * it (a model, a host, or the deterministic first-party default) — it is provenance for review,
 * never a claim of authority. `projectBasis` binds the candidate to the project revision it was
 * authored against, the same discipline E3-C §7 uses for a need candidate.
 */
export interface ProcedureProvenance {
  readonly authoringOrigin: string;
  readonly projectId: string;
  readonly projectRevision: number;
  readonly projectDigest: string;
}

export const PROCEDURE_PROVENANCE_KEYS = ["authoringOrigin", "projectId", "projectRevision", "projectDigest"] as const;

export function parseProcedureProvenance(raw: unknown, what = "ProcedureProvenance"): ProcedureProvenance {
  const object = procedureObject(raw, what);
  procedureKeys(object, PROCEDURE_PROVENANCE_KEYS, PROCEDURE_PROVENANCE_KEYS, what);
  const revision = object.projectRevision;
  if (typeof revision !== "number" || !Number.isInteger(revision) || revision < 0) {
    procedureFail("invalid_value", `${what}.projectRevision must be a non-negative integer`);
  }
  return Object.freeze({
    authoringOrigin: procedureText(object.authoringOrigin, `${what}.authoringOrigin`),
    projectId: procedureText(object.projectId, `${what}.projectId`),
    projectRevision: revision,
    projectDigest: procedureDigest(object.projectDigest, `${what}.projectDigest`),
  });
}

/* ------------------------------------------------------------------ *
 * ProcedureCandidate
 * ------------------------------------------------------------------ */

export interface ProcedureCandidate {
  readonly schemaVersion: 1;
  readonly candidateId: string;
  readonly content: ProcedureContent;
  readonly empiricalGrounds: readonly ProcedureGround[];
  readonly provenance: ProcedureProvenance;
  readonly digest: string;
}

type CandidateIdentity = Omit<ProcedureCandidate, "candidateId" | "digest">;

/** The semantic digest: content + grounds + provenance. Deliberately excludes nothing semantic. */
export function procedureCandidateDigestOf(identity: CandidateIdentity): string {
  return canonicalDigest({
    domain: PROCEDURE_CANDIDATE_DOMAIN,
    candidate: {
      schemaVersion: identity.schemaVersion,
      content: identity.content,
      empiricalGrounds: identity.empiricalGrounds,
      provenance: identity.provenance,
    },
  });
}

/** `prc-<32 hex>` — derived from the semantic digest, so it cannot be unbound from the content. */
export function procedureCandidateIdOf(contentDigest: string): string {
  return `prc-${contentDigest.slice(0, 32)}`;
}

export const PROCEDURE_CANDIDATE_KEYS = ["schemaVersion", "candidateId", "content", "empiricalGrounds", "provenance", "digest"] as const;

export interface MaterializeProcedureCandidateInput {
  readonly content: unknown;
  readonly empiricalGrounds: unknown;
  readonly provenance: unknown;
}

/**
 * §6/§8: materialize a candidate. The body is strict-parsed, the grounds canonicalized and the
 * provenance validated — and at least one empirical ground is required, so an ungrounded
 * method cannot even be expressed as a candidate.
 */
export function materializeProcedureCandidate(input: MaterializeProcedureCandidateInput): ProcedureCandidate {
  // §11: `materializeProcedureContent` (not the bare parse) enforces that a method STATES its scope
  // and its limitations. A candidate with no stated bounds cannot be reviewed, so it cannot exist.
  const content = materializeProcedureContent(input.content);
  const empiricalGrounds = canonicalGrounds(input.empiricalGrounds, "ProcedureCandidate.empiricalGrounds");
  if (empiricalGrounds.length === 0) {
    procedureFail("invalid_value", "ProcedureCandidate requires at least one empirical ground (§6): an ungrounded method cannot be authored");
  }
  const provenance = parseProcedureProvenance(input.provenance, "ProcedureCandidate.provenance");
  const identity: CandidateIdentity = Object.freeze({ schemaVersion: 1, content, empiricalGrounds, provenance });
  const digest = procedureCandidateDigestOf(identity);
  return Object.freeze({ ...identity, candidateId: procedureCandidateIdOf(digest), digest });
}

/** Strict parse + full re-derivation: a stored candidate whose id or digest drifted is refused. */
export function parseProcedureCandidate(raw: unknown, what = "ProcedureCandidate"): ProcedureCandidate {
  const object = procedureObject(raw, what);
  procedureKeys(object, PROCEDURE_CANDIDATE_KEYS, PROCEDURE_CANDIDATE_KEYS, what);
  if (object.schemaVersion !== 1) procedureFail("unknown_schema_version", `${what}.schemaVersion must be 1`);
  // A stored candidate is held to the SAME §11 bounds rule as a freshly authored one.
  const content = materializeProcedureContent(object.content);
  const empiricalGrounds = canonicalGrounds(object.empiricalGrounds, `${what}.empiricalGrounds`);
  if (empiricalGrounds.length === 0) {
    procedureFail("invalid_value", `${what} carries no empirical ground`);
  }
  const provenance = parseProcedureProvenance(object.provenance, `${what}.provenance`);
  const identity: CandidateIdentity = Object.freeze({ schemaVersion: 1, content, empiricalGrounds, provenance });
  const digest = procedureCandidateDigestOf(identity);
  const candidateId = procedureText(object.candidateId, `${what}.candidateId`);
  if (procedureCandidateIdOf(digest) !== candidateId) {
    procedureFail("invalid_value", `${what}.candidateId does not match its content`);
  }
  if (procedureDigest(object.digest, `${what}.digest`) !== digest) {
    procedureFail("invalid_value", `${what}.digest does not match its content`);
  }
  return Object.freeze({ ...identity, candidateId, digest });
}

/** The content digest a candidate's body hashes to — what a revision chain compares. */
export function candidateContentDigest(candidate: ProcedureCandidate): string {
  return procedureContentDigestOf(candidate.content);
}

/** §9: the content keys, re-exported so a test can pin that the schema did not silently grow. */
export const PROCEDURE_CONTENT_FIELDS = PROCEDURE_CONTENT_KEYS;

/** §9: the sorted, deduplicated list fields — pinned so a reviewer can see what is a SET. */
export const PROCEDURE_CONTENT_SET_FIELDS = [
  "applicability",
  "preconditions",
  "checks",
  "expectedOutputs",
  "limitations",
  "capabilityHints",
  "recommendedRecipeRefs",
] as const;

/** Re-exported so a caller has one import site for the content vocabulary. */
export { parseProcedureContent, procedureContentDigestOf, canonicalProcedureList };
export type { ProcedureContent };
