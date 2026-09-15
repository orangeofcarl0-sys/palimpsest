/**
 * G10-AB §36 — Project Operating History.
 *
 * A DERIVED view that joins REFERENCES to:
 *
 *   Work Mode changes            (operator preference history)
 *   Management involvement changes (the existing append-only mode history)
 *   Management activity           (selected / executed / refused / interrupted)
 *   ProjectIR revision refs       (the canonical owner, referenced only)
 *
 * ProjectIR remains the canonical owner of every revision. There is no universal
 * HistoryStore here: this view reads the owners and interleaves their references.
 * A missing canonical ref is shown as an incomplete/unresolved audit record,
 * never as a fact.
 */

import type { ManagementActivityRecord } from "./activity.js";
import type { ManagementActivityDecision } from "./activity.js";
import type { WorkModeHistoryEntry } from "./work_mode_profile.js";

export const OPERATING_HISTORY_ENTRY_KINDS = [
  "work_mode_change",
  "management_mode_change",
  "management_activity",
] as const;

export type OperatingHistoryEntryKind = (typeof OPERATING_HISTORY_ENTRY_KINDS)[number];

export interface OperatingHistoryEntry {
  readonly kind: OperatingHistoryEntryKind;
  /** Stable id of the entry in its OWNING plane. */
  readonly ref: string;
  readonly at: string;
  readonly actor: string;
  readonly summary: string;
  readonly decision?: ManagementActivityDecision | undefined;
  /** Canonical refs this entry points at, never copies. */
  readonly canonicalOutcomeRefs: readonly string[];
  /**
   * True when the entry points at canonical refs that could not be resolved.
   * The UI must show an incomplete audit record rather than a fact (§41).
   */
  readonly incompleteCanonicalRef: boolean;
}

export interface ManagementModeHistoryEntry {
  readonly projectId: string;
  readonly seq: number;
  readonly fromInvolvement: string;
  readonly toInvolvement: string;
  readonly updatedBy: string;
  readonly at: string;
}

export interface ProjectOperatingHistory {
  readonly projectId: string;
  readonly entries: readonly OperatingHistoryEntry[];
  readonly counts: {
    readonly workModeChanges: number;
    readonly managementModeChanges: number;
    readonly managementActivity: number;
    readonly unresolvedActivity: number;
    readonly incompleteCanonicalRefs: number;
  };
  /** True when at least one entry references a canonical owner that is missing. */
  readonly hasIncompleteAuditRecords: boolean;
}

export function buildProjectOperatingHistory(input: {
  readonly projectId: string;
  readonly workModeHistory: readonly WorkModeHistoryEntry[];
  readonly managementHistory: readonly ManagementModeHistoryEntry[];
  readonly activity: readonly ManagementActivityRecord[];
  readonly unresolvedRecordIds: readonly string[];
  /** Canonical refs the caller CAN resolve, as `kind:ref` strings. */
  readonly resolvableCanonicalRefs: readonly string[];
}): ProjectOperatingHistory {
  const resolvable = new Set(input.resolvableCanonicalRefs);
  const unresolved = new Set(input.unresolvedRecordIds);
  const entries: OperatingHistoryEntry[] = [];

  for (const entry of input.workModeHistory) {
    entries.push(
      Object.freeze({
        kind: "work_mode_change" as const,
        ref: `work-mode-history:${entry.projectId}:${entry.seq}`,
        at: entry.at,
        actor: entry.updatedBy,
        summary: `Work Mode ${entry.fromBaseMode} → ${entry.toBaseMode}${
          entry.toModifiers.length === 0 ? "" : ` + ${entry.toModifiers.join(" + ")}`
        }`,
        canonicalOutcomeRefs: Object.freeze([]),
        incompleteCanonicalRef: false,
      }),
    );
  }

  for (const entry of input.managementHistory) {
    entries.push(
      Object.freeze({
        kind: "management_mode_change" as const,
        ref: `management-mode-history:${entry.projectId}:${entry.seq}`,
        at: entry.at,
        actor: entry.updatedBy,
        summary: `Management involvement ${entry.fromInvolvement} → ${entry.toInvolvement}`,
        canonicalOutcomeRefs: Object.freeze([]),
        incompleteCanonicalRef: false,
      }),
    );
  }

  for (const record of input.activity) {
    const refs = record.canonicalOutcomeRefs.map((ref) => `${ref.kind}:${ref.ref}`);
    entries.push(
      Object.freeze({
        kind: "management_activity" as const,
        ref: record.recordId,
        at: record.startedAt,
        actor: record.managementProfileRef,
        summary: `${record.actionClass}: ${record.decision}${
          unresolved.has(record.recordId) ? " (unresolved)" : ""
        } — ${record.reason}`,
        decision: record.decision,
        canonicalOutcomeRefs: Object.freeze(refs),
        incompleteCanonicalRef: refs.some((ref) => !resolvable.has(ref)),
      }),
    );
  }

  entries.sort((left, right) => (left.at < right.at ? -1 : left.at > right.at ? 1 : 0));
  return Object.freeze({
    projectId: input.projectId,
    entries: Object.freeze(entries),
    counts: Object.freeze({
      workModeChanges: input.workModeHistory.length,
      managementModeChanges: input.managementHistory.length,
      managementActivity: input.activity.length,
      unresolvedActivity: input.unresolvedRecordIds.length,
      incompleteCanonicalRefs: entries.filter((entry) => entry.incompleteCanonicalRef).length,
    }),
    hasIncompleteAuditRecords: entries.some((entry) => entry.incompleteCanonicalRef),
  });
}
