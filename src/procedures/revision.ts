/**
 * E5-P §12/§13/§18 — the IMMUTABLE PROCEDURE REVISION, its stable ref and its DERIVED standing.
 *
 *     HistoricalProcedure  ≠  CurrentProcedure
 *     An admitted revision is never edited. A later revision supersedes it.
 *
 * ## Why standing is DERIVED rather than stored (§12)
 *
 * Storing `standing` on the revision would make an admitted procedure MUTABLE: publishing P@2
 * would have to rewrite P@1's row, and the historical record of what P@1 said when it was
 * admitted would be lost. Instead the chain is append-only — a revision is published once with
 * its `supersedes` link, and a retirement is its own event — and the CURRENT standing is
 * computed by folding that chain. The old body stays byte-identical forever.
 *
 * That is also what makes §18 work: an attempt compiled against `P@1 ACTIVE` keeps that
 * compile-time fact in its manifest, while a pull may additionally report
 * `CURRENT = SUPERSEDED`. Two different questions, two different answers, neither overwriting
 * the other.
 *
 * ## §13: a digest-bound ref, never a bare name
 *
 * `ProcedureRef` always carries `revision` AND `digest`. A caller can therefore never say
 * "procedure X" and silently receive a different revision than the one it observed; a stale
 * ref fails to resolve instead.
 *
 * Layer: L2 (`src/procedures/`).
 */

import { canonicalDigest } from "../schema/canonical.js";
import { canonicalDatetime } from "../schema/datetime.js";
import { isStableIdentifier, normalizeStableIdentifier } from "../schema/identifier.js";
import { canonicalGrounds, parseProcedureProvenance, type ProcedureGround, type ProcedureProvenance } from "./candidate.js";
import { parseProcedureContent, procedureDigest, procedureFail, procedureKeys, procedureObject, procedureText, type ProcedureContent } from "./content.js";
import { parseProcedureAdmissionProvenance, type ProcedureAdmissionProvenance } from "./admission.js";

export const PROCEDURE_REVISION_DOMAIN = "palimpsest.procedures.revision.v1";
export const PROCEDURE_REF_DOMAIN = "palimpsest.procedures.ref.v1";

/** §12: the minimum useful lifecycle. There is deliberately no `DRAFT` — a revision exists only once admitted. */
export const PROCEDURE_STANDINGS = ["ACTIVE", "SUPERSEDED", "RETIRED"] as const;
export type ProcedureStanding = (typeof PROCEDURE_STANDINGS)[number];

export function procedureStableId(value: unknown, what: string): string {
  if (typeof value !== "string") procedureFail("invalid_value", `${what} must be a string`);
  const normalized = normalizeStableIdentifier(value);
  if (!isStableIdentifier(normalized)) procedureFail("invalid_value", `${what} must be a stable identifier`);
  return normalized;
}

export function procedureTimestamp(value: unknown, what: string): string {
  const text = procedureText(value, what);
  try {
    return canonicalDatetime(text);
  } catch (error) {
    return procedureFail("invalid_value", `${what} must be an ISO-8601 datetime: ${error instanceof Error ? error.message : String(error)}`);
  }
}
/* ------------------------------------------------------------------ *
 * ProcedureRef (§13)
 * ------------------------------------------------------------------ */

export interface ProcedureRef {
  readonly procedureId: string;
  readonly revision: number;
  readonly digest: string;
}

export const PROCEDURE_REF_KEYS = ["procedureId", "revision", "digest"] as const;

export function parseProcedureRef(raw: unknown, what = "ProcedureRef"): ProcedureRef {
  const object = procedureObject(raw, what);
  procedureKeys(object, PROCEDURE_REF_KEYS, PROCEDURE_REF_KEYS, what);
  const revision = object.revision;
  if (typeof revision !== "number" || !Number.isInteger(revision) || revision < 0) {
    procedureFail("invalid_value", `${what}.revision must be a non-negative integer`);
  }
  return Object.freeze({
    procedureId: procedureStableId(object.procedureId, `${what}.procedureId`),
    revision,
    digest: procedureDigest(object.digest, `${what}.digest`),
  });
}

export function procedureRefKey(ref: ProcedureRef): string {
  return `${ref.procedureId}@${ref.revision}#${ref.digest}`;
}

export function sameProcedureRef(left: ProcedureRef, right: ProcedureRef): boolean {
  return left.procedureId === right.procedureId && left.revision === right.revision && left.digest === right.digest;
}

/**
 * §17: the semantically explicit PULL namespace. Procedures get their OWN namespace — never
 * `@ctx/proof/*`, `@ctx/reasoning/*` or `@ctx/knowledge/*` — so a handle can never be confused
 * with another plane's, and an unknown prefix still fails closed.
 */
export const PROCEDURE_HANDLE_PREFIX = "@ctx/procedure/";

export function procedureHandle(ref: ProcedureRef): string {
  return `${PROCEDURE_HANDLE_PREFIX}${ref.procedureId}/${ref.revision}`;
}

/* ------------------------------------------------------------------ *
 * ProcedureRevision (§12)
 * ------------------------------------------------------------------ */

/**
 * One admitted, immutable method revision.
 *
 * `empiricalGrounds` and `provenance` are COPIED from the admitted candidate rather than
 * referenced by candidate id: §11 requires admission to preserve the source experience and
 * scope, and a revision that merely pointed at a candidate would lose its grounding the moment
 * the candidate value was gone (a candidate is not stored anywhere).
 */
export interface ProcedureRevision {
  readonly schemaVersion: 1;
  readonly procedureId: string;
  readonly revision: number;
  readonly candidateId: string;
  readonly candidateDigest: string;
  readonly content: ProcedureContent;
  readonly empiricalGrounds: readonly ProcedureGround[];
  readonly provenance: ProcedureProvenance;
  readonly admission: ProcedureAdmissionProvenance;
  /** §12/§25: the revision this one replaces. Absent for a first publication. */
  readonly supersedes?: ProcedureRef | undefined;
  readonly publishedAt: string;
  readonly digest: string;
}

type RevisionIdentity = Omit<ProcedureRevision, "digest">;

export function procedureRevisionDigestOf(identity: RevisionIdentity): string {
  return canonicalDigest({ domain: PROCEDURE_REVISION_DOMAIN, revision: identity });
}

export function procedureRefOf(revision: ProcedureRevision): ProcedureRef {
  return Object.freeze({ procedureId: revision.procedureId, revision: revision.revision, digest: revision.digest });
}

export const PROCEDURE_REVISION_KEYS = [
  "schemaVersion",
  "procedureId",
  "revision",
  "candidateId",
  "candidateDigest",
  "content",
  "empiricalGrounds",
  "provenance",
  "admission",
  "supersedes",
  "publishedAt",
  "digest",
] as const;

/** §12: `supersedes` is the ONE optional key — a first publication replaces nothing. */
const PROCEDURE_REVISION_REQUIRED_KEYS = PROCEDURE_REVISION_KEYS.filter((key) => key !== "supersedes");

export interface MaterializeProcedureRevisionInput {
  readonly procedureId: string;
  readonly revision: number;
  readonly candidateId: string;
  readonly candidateDigest: string;
  readonly content: unknown;
  readonly empiricalGrounds: unknown;
  readonly provenance: unknown;
  readonly admission: unknown;
  readonly supersedes?: unknown;
  readonly publishedAt: string;
}

export function materializeProcedureRevision(input: MaterializeProcedureRevisionInput): ProcedureRevision {
  if (!Number.isInteger(input.revision) || input.revision < 0) {
    procedureFail("invalid_value", "ProcedureRevision.revision must be a non-negative integer");
  }
  const content = parseProcedureContent(input.content, "ProcedureRevision.content");
  const empiricalGrounds = canonicalGrounds(input.empiricalGrounds, "ProcedureRevision.empiricalGrounds");
  if (empiricalGrounds.length === 0) {
    procedureFail("invalid_value", "ProcedureRevision requires at least one empirical ground");
  }
  const supersedes = input.supersedes === undefined ? undefined : parseProcedureRef(input.supersedes, "ProcedureRevision.supersedes");
  const identity: RevisionIdentity = Object.freeze({
    schemaVersion: 1,
    procedureId: procedureStableId(input.procedureId, "ProcedureRevision.procedureId"),
    revision: input.revision,
    candidateId: procedureText(input.candidateId, "ProcedureRevision.candidateId"),
    candidateDigest: procedureDigest(input.candidateDigest, "ProcedureRevision.candidateDigest"),
    content,
    empiricalGrounds,
    provenance: parseProcedureProvenance(input.provenance, "ProcedureRevision.provenance"),
    admission: parseProcedureAdmissionProvenance(input.admission, "ProcedureRevision.admission"),
    ...(supersedes === undefined ? {} : { supersedes }),
    publishedAt: procedureTimestamp(input.publishedAt, "ProcedureRevision.publishedAt"),
  });
  return Object.freeze({ ...identity, digest: procedureRevisionDigestOf(identity) });
}

export function parseProcedureRevision(raw: unknown, what = "ProcedureRevision"): ProcedureRevision {
  const object = procedureObject(raw, what);
  procedureKeys(object, PROCEDURE_REVISION_KEYS, PROCEDURE_REVISION_REQUIRED_KEYS, what);
  if (object.schemaVersion !== 1) procedureFail("unknown_schema_version", `${what}.schemaVersion must be 1`);
  const revision = object.revision;
  if (typeof revision !== "number" || !Number.isInteger(revision) || revision < 0) {
    procedureFail("invalid_value", `${what}.revision must be a non-negative integer`);
  }
  const content = parseProcedureContent(object.content, `${what}.content`);
  const empiricalGrounds = canonicalGrounds(object.empiricalGrounds, `${what}.empiricalGrounds`);
  if (empiricalGrounds.length === 0) procedureFail("invalid_value", `${what} carries no empirical ground`);
  const supersedes = object.supersedes === undefined ? undefined : parseProcedureRef(object.supersedes, `${what}.supersedes`);
  const identity: RevisionIdentity = Object.freeze({
    schemaVersion: 1,
    procedureId: procedureStableId(object.procedureId, `${what}.procedureId`),
    revision,
    candidateId: procedureText(object.candidateId, `${what}.candidateId`),
    candidateDigest: procedureDigest(object.candidateDigest, `${what}.candidateDigest`),
    content,
    empiricalGrounds,
    provenance: parseProcedureProvenance(object.provenance, `${what}.provenance`),
    admission: parseProcedureAdmissionProvenance(object.admission, `${what}.admission`),
    ...(supersedes === undefined ? {} : { supersedes }),
    publishedAt: procedureTimestamp(object.publishedAt, `${what}.publishedAt`),
  });
  const digest = procedureDigest(object.digest, `${what}.digest`);
  if (procedureRevisionDigestOf(identity) !== digest) {
    procedureFail("invalid_value", `${what}.digest does not match its content`);
  }
  return Object.freeze({ ...identity, digest });
}

/* ------------------------------------------------------------------ *
 * Standing — DERIVED from the append-only chain (§12/§18)
 * ------------------------------------------------------------------ */

export interface ProcedureStandingView {
  readonly ref: ProcedureRef;
  readonly standing: ProcedureStanding;
  /** Present iff a LATER published revision names this one as `supersedes`. */
  readonly supersededBy?: ProcedureRef | undefined;
  /** Present iff this revision was explicitly retired. */
  readonly retiredReason?: string | undefined;
}

/**
 * Fold the published chain into per-revision standing.
 *
 * Precedence is deliberate: an explicit RETIREMENT outranks supersession, because an operator
 * who retires a method is stating something stronger than "a newer one exists". Both are
 * recorded, and neither rewrites the revision.
 */
export function deriveProcedureStandings(
  revisions: readonly ProcedureRevision[],
  retirements: readonly { readonly ref: ProcedureRef; readonly reason: string }[],
): readonly ProcedureStandingView[] {
  const supersededBy = new Map<string, ProcedureRef>();
  for (const revision of revisions) {
    if (revision.supersedes !== undefined) {
      supersededBy.set(procedureRefKey(revision.supersedes), procedureRefOf(revision));
    }
  }
  const retired = new Map<string, string>();
  for (const retirement of retirements) retired.set(procedureRefKey(retirement.ref), retirement.reason);

  return Object.freeze(
    revisions.map((revision) => {
      const ref = procedureRefOf(revision);
      const key = procedureRefKey(ref);
      const retirement = retired.get(key);
      const successor = supersededBy.get(key);
      const standing: ProcedureStanding = retirement !== undefined ? "RETIRED" : successor !== undefined ? "SUPERSEDED" : "ACTIVE";
      return Object.freeze({
        ref,
        standing,
        ...(successor === undefined ? {} : { supersededBy: successor }),
        ...(retirement === undefined ? {} : { retiredReason: retirement }),
      });
    }),
  );
}

/** §12: the CURRENT revision of a procedure — the highest ACTIVE revision, or undefined. */
export function currentProcedureRevision(
  revisions: readonly ProcedureRevision[],
  standings: readonly ProcedureStandingView[],
): ProcedureStandingView | undefined {
  const active = standings.filter((view) => view.standing === "ACTIVE");
  if (active.length === 0) return undefined;
  const highest = active.reduce((best, candidate) => (candidate.ref.revision > best.ref.revision ? candidate : best));
  // The standing view names the revision; resolve it so the caller can read the body.
  const revision = revisions.find((candidate) => sameProcedureRef(procedureRefOf(candidate), highest.ref));
  return revision === undefined ? undefined : highest;
}
