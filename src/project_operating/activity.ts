/**
 * G10-AB — Durable Management Activity.
 *
 * A durable, append-only, NON-AUTHORITATIVE record of management decisions that
 * were actually selected, attempted or executed. It answers:
 *
 *   What did Palimpsest choose to do?  Under which management profile?
 *   What confirmation boundary applied?  What happened?
 *   Which canonical mutation did it observe?  Why did it stop or refuse?
 *
 *   ManagementActivityRecord ≠ WorkEvent       ≠ Task
 *   ManagementActivityRecord ≠ ProjectDecision ≠ EffectReceipt
 *   ManagementActivityRecord ≠ Authority
 *
 * If management causes canonical Work mutation, the Work EventStore remains
 * authoritative; an activity record only REFERENCES it. An activity record
 * saying "project revision applied" does not prove it.
 *
 * Privacy (§40): ids, digests, typed summaries, policy reasons and canonical
 * refs only. Never full private source content, Proof Vault documents, hidden
 * scratchpad or chain-of-thought.
 */

import { canonicalDigest } from "../schema/canonical.js";

export const MANAGEMENT_ACTIVITY_DIGEST_DOMAIN = "palimpsest.management-activity.v1";

export const MANAGEMENT_ACTIVITY_DECISIONS = [
  /** The action was selected/attempted; the outcome is not yet recorded. */
  "selected",
  /** The action was selected and is waiting for an operator confirmation. */
  "needs_confirmation",
  /** The policy refused it; nothing was attempted. */
  "not_permitted",
  /** The governed action ran and its outcome was observed. */
  "executed",
  /** The governed action was attempted and failed. */
  "failed",
  /** The outcome could not be established; history stays honest. */
  "interrupted",
] as const;

export type ManagementActivityDecision = (typeof MANAGEMENT_ACTIVITY_DECISIONS)[number];

/** The decisions that CLOSE an activity. Anything else stays unresolved. */
export const TERMINAL_MANAGEMENT_DECISIONS: ReadonlySet<ManagementActivityDecision> = new Set([
  "not_permitted",
  "executed",
  "failed",
  "interrupted",
]);

export function isTerminalManagementDecision(decision: ManagementActivityDecision): boolean {
  return TERMINAL_MANAGEMENT_DECISIONS.has(decision);
}

/** Kinds of canonical owner an activity may reference. Never a copied body. */
export const CANONICAL_OUTCOME_KINDS = [
  "work_event",
  "project_revision",
  "head_reconciliation",
  "recipe_execution",
  "reasoning_cell",
  "promotion",
  /**
   * G10-AD §21: a durable Project Verification RUN. The reference is the canonical
   * product ref `project_verification:<runId>`; the run body stays owned by the
   * narrowly-owned append-only Project Verification history store and is never
   * copied into the management activity record.
   */
  "project_verification",
] as const;

export type CanonicalOutcomeKind = (typeof CANONICAL_OUTCOME_KINDS)[number];

export interface CanonicalOutcomeRef {
  readonly kind: CanonicalOutcomeKind;
  /** A stable id in the OWNING canonical plane (event id, revision, ref id). */
  readonly ref: string;
}

export interface ManagementActivitySubjectRef {
  readonly kind: string;
  readonly id: string;
}

export interface ProjectBasisRef {
  readonly revision: number;
  readonly digest: string;
  readonly headCommit: string;
}

export interface ManagementActivityRecord {
  readonly schemaVersion: 1;
  readonly recordId: string;
  readonly projectId: string;
  /** Per-project, monotonic, gapless. */
  readonly sequence: number;

  readonly candidateRef: string;
  readonly candidateDigest: string;
  readonly actionClass: string;
  readonly subjects: readonly ManagementActivitySubjectRef[];

  /** The management profile identity this decision was made under. */
  readonly managementProfileRef: string;
  /** The Work Mode preference identity in force, when one was read. */
  readonly workModePreferenceRef: string | null;
  readonly projectBasis: ProjectBasisRef;

  readonly decision: ManagementActivityDecision;
  readonly confirmed: boolean;
  readonly reason: string;
  /** A stable, checkable reason code (never the prose). */
  readonly typedReasonCode: string | null;

  readonly startedAt: string;
  readonly finishedAt: string | null;

  /** Stable refs into canonical owners. Bodies are never copied. */
  readonly canonicalOutcomeRefs: readonly CanonicalOutcomeRef[];
  /** A TYPED summary of a non-canonical result (counts/phase), never prose truth. */
  readonly noncanonicalOutcomeSummary: string | null;

  /** The activity this record closes, when it is a terminal record. */
  readonly supersedesRecordId: string | null;

  readonly previousRecordDigest: string;
  readonly recordDigest: string;
}

export type ManagementActivityInput = Omit<
  ManagementActivityRecord,
  "schemaVersion" | "recordId" | "recordDigest"
>;

/** The chain digest over one record's content (excluding its own digest). */
export function managementActivityDigestOf(input: ManagementActivityInput): string {
  return canonicalDigest({
    domain: MANAGEMENT_ACTIVITY_DIGEST_DOMAIN,
    projectId: input.projectId,
    sequence: input.sequence,
    candidateRef: input.candidateRef,
    candidateDigest: input.candidateDigest,
    actionClass: input.actionClass,
    subjects: input.subjects,
    managementProfileRef: input.managementProfileRef,
    workModePreferenceRef: input.workModePreferenceRef,
    projectBasis: input.projectBasis,
    decision: input.decision,
    confirmed: input.confirmed,
    reason: input.reason,
    typedReasonCode: input.typedReasonCode,
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
    canonicalOutcomeRefs: input.canonicalOutcomeRefs,
    noncanonicalOutcomeSummary: input.noncanonicalOutcomeSummary,
    supersedesRecordId: input.supersedesRecordId,
    previousRecordDigest: input.previousRecordDigest,
  });
}

export function managementActivityRecordIdOf(input: {
  readonly projectId: string;
  readonly sequence: number;
  readonly recordDigest: string;
}): string {
  return `management-activity-${canonicalDigest({
    domain: `${MANAGEMENT_ACTIVITY_DIGEST_DOMAIN}.id`,
    projectId: input.projectId,
    sequence: input.sequence,
    recordDigest: input.recordDigest,
  }).slice(0, 32)}`;
}

export function buildManagementActivityRecord(
  input: ManagementActivityInput,
): ManagementActivityRecord {
  const digest = managementActivityDigestOf(input);
  return Object.freeze({
    schemaVersion: 1 as const,
    ...input,
    subjects: Object.freeze(input.subjects.map((subject) => Object.freeze({ ...subject }))),
    projectBasis: Object.freeze({ ...input.projectBasis }),
    canonicalOutcomeRefs: Object.freeze(
      input.canonicalOutcomeRefs.map((ref) => Object.freeze({ ...ref })),
    ),
    recordId: managementActivityRecordIdOf({
      projectId: input.projectId,
      sequence: input.sequence,
      recordDigest: digest,
    }),
    recordDigest: digest,
  });
}

/* -------------------------------------------------------------------------- *
 * Crash-honest unresolved activity (§19/§20)
 * -------------------------------------------------------------------------- */

export const UNRESOLVED_ACTIVITY_CLASSES = [
  "UNRESOLVED",
  "OBSERVED_COMPLETED",
  "OBSERVED_NOT_APPLIED",
  "UNKNOWN",
] as const;

export type UnresolvedActivityClass = (typeof UNRESOLVED_ACTIVITY_CLASSES)[number];

/**
 * A MECHANICAL probe. Classification is only allowed from provable canonical
 * state, never from prose and never by inferring success.
 *
 *   canonicalOutcomePresent - the canonical mutation this activity referenced
 *                             exists in its owning plane
 *   canonicalMutationRefused - the owning plane has no such mutation and the
 *                              activity had a bounded set of intended refs
 */
export interface UnresolvedActivityProbe {
  readonly canonicalOutcomePresent: boolean;
  readonly canonicalMutationProvablyAbsent: boolean;
}

/**
 * Classify an UNRESOLVED activity record. Without a mechanical proof the honest
 * answer is UNKNOWN - never "succeeded".
 */
export function classifyUnresolvedActivity(
  record: ManagementActivityRecord,
  probe: UnresolvedActivityProbe,
): UnresolvedActivityClass {
  if (isTerminalManagementDecision(record.decision)) return "UNKNOWN";
  if (probe.canonicalOutcomePresent) return "OBSERVED_COMPLETED";
  if (probe.canonicalMutationProvablyAbsent) return "OBSERVED_NOT_APPLIED";
  return "UNKNOWN";
}

/** The reason text a terminalization uses. It never claims success. */
export function interruptedReasonOf(
  classification: UnresolvedActivityClass,
): string {
  switch (classification) {
    case "OBSERVED_COMPLETED":
      return "interrupted: the canonical outcome this activity referenced is present, but no terminal activity record was written; the canonical owner remains authoritative";
    case "OBSERVED_NOT_APPLIED":
      return "interrupted: the intended canonical mutation is provably absent";
    case "UNRESOLVED":
      return "interrupted: the outcome was never established";
    case "UNKNOWN":
      return "interrupted: the outcome could not be mechanically established; no success is claimed";
  }
}

/**
 * Does this record still need a terminal? A `selected`/`needs_confirmation`
 * record with no successor is unresolved by construction.
 */
export function isUnresolvedActivity(record: ManagementActivityRecord): boolean {
  return !isTerminalManagementDecision(record.decision);
}

/** Group records into chains: a terminal record closes the one it supersedes. */
export function unresolvedActivityOf(
  records: readonly ManagementActivityRecord[],
): readonly ManagementActivityRecord[] {
  const closed = new Set(
    records
      .map((record) => record.supersedesRecordId)
      .filter((id): id is string => id !== null),
  );
  return Object.freeze(
    records.filter((record) => isUnresolvedActivity(record) && !closed.has(record.recordId)),
  );
}

/** Human-facing explanation of a refusal (§23), derived, never hidden. */
export function explainActivityDecision(record: ManagementActivityRecord): string {
  return `${record.actionClass} under ${record.managementProfileRef}: ${record.decision}${
    record.typedReasonCode === null ? "" : ` (${record.typedReasonCode})`
  } — ${record.reason}`;
}
