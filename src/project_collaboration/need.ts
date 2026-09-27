/**
 * E3-C §4–§7 — the COLLABORATION NEED CANDIDATE: a NON-CANONICAL, basis-bound proposal.
 *
 *     Project Reality Observation
 *             ↓  untrusted need authoring
 *     CollaborationNeedCandidate
 *
 * ## The equation this module turns on
 *
 *     NeedCandidate ≠ ContactNeed
 *
 * A candidate is content-addressed, project-basis-bound, non-canonical and non-authoritative. It exists
 * only as a value: there is deliberately NO candidate store. Turning one into a durable need requires an
 * INDEPENDENT admission authority (§8) and the EXISTING Federation declaration path (§11).
 *
 * ## What is NOT here
 *
 *   · no peer contact, no peer selection, no commitment, no authority grant — a candidate is a
 *     statement about a project condition, not an act;
 *   · no automatic derivation: a BLOCKED task or a FAILED attempt is PRESSURE, and §5 says explicitly
 *     that neither mechanically implies an external need. The authored proposal decides.
 *   · no clock and no random id in semantic identity: `candidateId` derives from content, and input
 *     ORDER cannot produce a distinct semantic candidate (§7).
 *
 * Layer: L2 (`src/project_collaboration/`).
 */
import { canonicalDigest } from "../schema/canonical.js";
import type { ContactNeedOrigin } from "../federation/peer.js";

export const COLLABORATION_NEED_CANDIDATE_DOMAIN = "palimpsest.project-collaboration.need-candidate.v1";
export const COLLABORATION_NEED_CANDIDATE_ID_DOMAIN = "palimpsest.project-collaboration.need-candidate-id.v1";

/** §5: the V1 project-reality grounds. The union is CLOSED; a new ground is an additive review. */
export const NEED_GROUND_KINDS = ["BLOCKED_TASK", "FAILED_ATTEMPT"] as const;
export type NeedGroundKind = (typeof NEED_GROUND_KINDS)[number];

/**
 * §5 `BLOCKED_TASK`: the canonical Work facts a blocked-task ground must carry.
 *
 * `declaredHints` are the hints the Work itself already declared, carried verbatim so the authored
 * proposal can be judged against what the project already knew rather than against a reconstruction.
 */
export interface BlockedTaskGround {
  readonly kind: "BLOCKED_TASK";
  readonly projectId: string;
  readonly taskId: string;
  readonly taskState: "BLOCKED";
  readonly objective: string;
  readonly dependsOn: readonly string[];
  readonly declaredHints: readonly string[];
}

/**
 * §5 `FAILED_ATTEMPT`: the attempt identity, its report digest and the observed worker status.
 *
 * The report digest — never the report body — is what makes this a checkable observation: a later
 * reader can tell whether the attempt it grounded on is still the one in history.
 */
export interface FailedAttemptGround {
  readonly kind: "FAILED_ATTEMPT";
  readonly projectId: string;
  readonly taskId: string;
  readonly attemptId: string;
  readonly reportDigest: string;
  readonly workerStatus: "failed";
  readonly objective: string;
}

export type NeedGround = BlockedTaskGround | FailedAttemptGround;

/* ------------------------------------------------------------------ *
 * Strict parsing
 * ------------------------------------------------------------------ */

export const NEED_REFUSAL_REASONS = [
  "NEED_CANDIDATE_INVALID",
  "NEED_GROUND_NOT_SUPPORTED",
  "NEED_GROUND_NOT_FOUND",
  "NEED_PROJECT_BASIS_STALE",
  "NEED_GROUND_STALE",
  "NEED_AUTHORING_UNRESOLVED",
  "NEED_ADMISSION_UNRESOLVED",
  "NEED_CAPABILITY_UNAVAILABLE",
  "NEED_NOT_PROJECT_ASSOCIATED",
] as const;
export type NeedRefusalReason = (typeof NEED_REFUSAL_REASONS)[number];

export class CollaborationNeedRefusal extends Error {
  constructor(
    readonly kind: NeedRefusalReason,
    readonly detail: string,
  ) {
    super(`${kind}: ${detail}`);
    this.name = "CollaborationNeedRefusal";
  }
}

export function needRefuse(kind: NeedRefusalReason, detail: string): never {
  throw new CollaborationNeedRefusal(kind, detail);
}

function asRecord(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    needRefuse("NEED_CANDIDATE_INVALID", `${what} must be an object`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(record: Record<string, unknown>, allowed: readonly string[], required: readonly string[], what: string): void {
  for (const key of Object.keys(record)) {
    if (!allowed.includes(key)) needRefuse("NEED_CANDIDATE_INVALID", `${what}: unknown field "${key}"`);
  }
  for (const key of required) {
    if (!Object.hasOwn(record, key) || record[key] === undefined) {
      needRefuse("NEED_CANDIDATE_INVALID", `${what}: field "${key}" is required`);
    }
  }
}

function requireNonEmpty(value: unknown, what: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    needRefuse("NEED_CANDIDATE_INVALID", `${what} must be a non-empty string`);
  }
  return value;
}

function requireStringArray(value: unknown, what: string): readonly string[] {
  if (!Array.isArray(value)) needRefuse("NEED_CANDIDATE_INVALID", `${what} must be an array`);
  return Object.freeze(value.map((entry, index) => requireNonEmpty(entry, `${what}[${index}]`)));
}

/**
 * §7: a canonical tag SET — duplicates rejected, order canonicalized. This is what makes input ORDER
 * unable to produce a distinct semantic candidate: `["a","b"]` and `["b","a"]` are the same candidate.
 */
function canonicalTagSet(value: unknown, what: string): readonly string[] {
  const tags = requireStringArray(value, what);
  const seen = new Set<string>();
  for (const tag of tags) {
    if (seen.has(tag)) needRefuse("NEED_CANDIDATE_INVALID", `${what}: duplicate tag "${tag}" (semantic set)`);
    seen.add(tag);
  }
  return Object.freeze([...seen].sort());
}

/** Strict NeedGround parser: exact fields per kind, never an unchecked cast. */
export function parseNeedGround(raw: unknown, what = "ground"): NeedGround {
  const record = asRecord(raw, what);
  if (record.kind === "BLOCKED_TASK") {
    exactKeys(
      record,
      ["kind", "projectId", "taskId", "taskState", "objective", "dependsOn", "declaredHints"],
      ["kind", "projectId", "taskId", "taskState", "objective", "dependsOn", "declaredHints"],
      what,
    );
    if (record.taskState !== "BLOCKED") needRefuse("NEED_GROUND_NOT_SUPPORTED", `${what}.taskState must be "BLOCKED"`);
    return Object.freeze({
      kind: "BLOCKED_TASK" as const,
      projectId: requireNonEmpty(record.projectId, `${what}.projectId`),
      taskId: requireNonEmpty(record.taskId, `${what}.taskId`),
      taskState: "BLOCKED" as const,
      objective: requireNonEmpty(record.objective, `${what}.objective`),
      // §7: the dependency and hint sets are canonical sets, so order carries no meaning.
      dependsOn: canonicalTagSet(record.dependsOn, `${what}.dependsOn`),
      declaredHints: canonicalTagSet(record.declaredHints, `${what}.declaredHints`),
    });
  }
  if (record.kind === "FAILED_ATTEMPT") {
    exactKeys(
      record,
      ["kind", "projectId", "taskId", "attemptId", "reportDigest", "workerStatus", "objective"],
      ["kind", "projectId", "taskId", "attemptId", "reportDigest", "workerStatus", "objective"],
      what,
    );
    if (record.workerStatus !== "failed") needRefuse("NEED_GROUND_NOT_SUPPORTED", `${what}.workerStatus must be "failed"`);
    return Object.freeze({
      kind: "FAILED_ATTEMPT" as const,
      projectId: requireNonEmpty(record.projectId, `${what}.projectId`),
      taskId: requireNonEmpty(record.taskId, `${what}.taskId`),
      attemptId: requireNonEmpty(record.attemptId, `${what}.attemptId`),
      reportDigest: requireNonEmpty(record.reportDigest, `${what}.reportDigest`),
      workerStatus: "failed" as const,
      objective: requireNonEmpty(record.objective, `${what}.objective`),
    });
  }
  needRefuse("NEED_GROUND_NOT_SUPPORTED", `${what}.kind must be one of ${NEED_GROUND_KINDS.join(", ")}`);
}

/* ------------------------------------------------------------------ *
 * The candidate
 * ------------------------------------------------------------------ */

/** The project revision a candidate is frozen against. Reuses the ProjectIR basis vocabulary. */
export interface CollaborationProjectBasis {
  readonly projectId: string;
  readonly revision: number;
  readonly digest: string;
  readonly headCommit: string;
}

export function parseCollaborationProjectBasis(raw: unknown, what = "projectBasis"): CollaborationProjectBasis {
  const record = asRecord(raw, what);
  exactKeys(record, ["projectId", "revision", "digest", "headCommit"], ["projectId", "revision", "digest", "headCommit"], what);
  if (typeof record.revision !== "number" || !Number.isSafeInteger(record.revision) || record.revision < 0) {
    needRefuse("NEED_CANDIDATE_INVALID", `${what}.revision must be a non-negative integer`);
  }
  return Object.freeze({
    projectId: requireNonEmpty(record.projectId, `${what}.projectId`),
    revision: record.revision,
    digest: requireNonEmpty(record.digest, `${what}.digest`),
    headCommit: requireNonEmpty(record.headCommit, `${what}.headCommit`),
  });
}

/**
 * §7: the candidate. `origin` records WHO authored it (the untrusted cognition), so a reader can tell an
 * authored candidate from an operator-supplied one without trusting either.
 */
export interface CollaborationNeedCandidate {
  readonly schemaVersion: 1;
  readonly candidateId: string;
  readonly projectBasis: CollaborationProjectBasis;
  readonly ground: NeedGround;
  readonly competenceTags: readonly string[];
  readonly reason: string;
  readonly origin: string;
  readonly digest: string;
}

type CandidateContent = Omit<CollaborationNeedCandidate, "candidateId" | "digest">;

export function collaborationNeedCandidateDigestOf(content: CandidateContent): string {
  return canonicalDigest({ domain: COLLABORATION_NEED_CANDIDATE_DOMAIN, candidate: content });
}

export function collaborationNeedCandidateIdOf(digest: string): string {
  return `cnc-${canonicalDigest({ domain: COLLABORATION_NEED_CANDIDATE_ID_DOMAIN, digest }).slice(0, 32)}`;
}

/**
 * §7: materialize a candidate. The id and digest derive from content, so the same observation authored
 * the same way is the SAME candidate — which is what makes §13's retry correlation work without a store.
 */
export function materializeCollaborationNeedCandidate(input: {
  readonly projectBasis: CollaborationProjectBasis;
  readonly ground: NeedGround;
  readonly competenceTags: readonly string[];
  readonly reason: string;
  readonly origin: string;
}): CollaborationNeedCandidate {
  const content: CandidateContent = Object.freeze({
    schemaVersion: 1 as const,
    projectBasis: parseCollaborationProjectBasis(input.projectBasis),
    ground: parseNeedGround(input.ground),
    competenceTags: canonicalTagSet(input.competenceTags, "competenceTags"),
    reason: requireNonEmpty(input.reason, "reason"),
    origin: requireNonEmpty(input.origin, "origin"),
  });
  const digest = collaborationNeedCandidateDigestOf(content);
  return Object.freeze({ ...content, candidateId: collaborationNeedCandidateIdOf(digest), digest });
}

/** Strict candidate parser; the digest and id are RE-DERIVED, so a tampered candidate is refused. */
export function parseCollaborationNeedCandidate(
  raw: unknown,
  what = "CollaborationNeedCandidate",
): CollaborationNeedCandidate {
  const record = asRecord(raw, what);
  exactKeys(
    record,
    ["schemaVersion", "candidateId", "projectBasis", "ground", "competenceTags", "reason", "origin", "digest"],
    ["schemaVersion", "candidateId", "projectBasis", "ground", "competenceTags", "reason", "origin", "digest"],
    what,
  );
  if (record.schemaVersion !== 1) needRefuse("NEED_CANDIDATE_INVALID", `${what}.schemaVersion must be 1`);
  const content: CandidateContent = Object.freeze({
    schemaVersion: 1 as const,
    projectBasis: parseCollaborationProjectBasis(record.projectBasis, `${what}.projectBasis`),
    ground: parseNeedGround(record.ground, `${what}.ground`),
    competenceTags: canonicalTagSet(record.competenceTags, `${what}.competenceTags`),
    reason: requireNonEmpty(record.reason, `${what}.reason`),
    origin: requireNonEmpty(record.origin, `${what}.origin`),
  });
  const digest = collaborationNeedCandidateDigestOf(content);
  if (requireNonEmpty(record.digest, `${what}.digest`) !== digest) {
    needRefuse("NEED_CANDIDATE_INVALID", `${what}.digest does not match its content`);
  }
  const candidateId = collaborationNeedCandidateIdOf(digest);
  if (requireNonEmpty(record.candidateId, `${what}.candidateId`) !== candidateId) {
    needRefuse("NEED_CANDIDATE_INVALID", `${what}.candidateId does not match its content`);
  }
  return Object.freeze({ ...content, candidateId, digest });
}

/**
 * §10: the ground → Federation origin mapping.
 *
 * A blocked-task need names the EXACT task and the project revision it was observed under; a
 * failed-attempt need names the attempt. Neither is expressed through `runtime_scope` or `activation`:
 * using those would be a lie about provenance. This is the ONE mapping, so a candidate can never
 * declare a durable need whose origin disagrees with its ground.
 */
export function contactNeedOriginOfCandidate(candidate: CollaborationNeedCandidate): ContactNeedOrigin {
  if (candidate.ground.kind === "BLOCKED_TASK") {
    return Object.freeze({
      kind: "task" as const,
      projectId: candidate.ground.projectId,
      taskId: candidate.ground.taskId,
      projectRevision: candidate.projectBasis.revision,
      projectDigest: candidate.projectBasis.digest,
    });
  }
  return Object.freeze({
    kind: "attempt" as const,
    attempt: Object.freeze({ projectId: candidate.ground.projectId, attemptId: candidate.ground.attemptId }),
  });
}

/** §5: the human-readable need reason. It names the ground, so a durable need explains itself. */
export function contactNeedReasonOfCandidate(candidate: CollaborationNeedCandidate): string {
  const ground = candidate.ground;
  const what = ground.kind === "BLOCKED_TASK" ? `blocked task "${ground.taskId}"` : `failed attempt "${ground.attemptId}"`;
  return `${candidate.reason} (${what}: ${ground.objective})`;
}
