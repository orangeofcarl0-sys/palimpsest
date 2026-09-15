/**
 * G10-AB §36 — Project Operating History.
 *
 * A DERIVED view that joins REFERENCES to:
 *
 *   Work Mode changes            (operator preference history)
 *   Management involvement changes (the existing append-only mode history)
 *   Management activity           (selected / executed / refused / interrupted)
 *   ProjectIR revision refs       (the canonical owner, referenced only)
 *   Campaign wake events          (the canonical Campaign owner, referenced only)
 *
 * ProjectIR remains the canonical owner of every revision, and the Campaign store
 * remains the canonical owner of every wake event. There is no universal
 * HistoryStore here: this view reads the owners and interleaves their references.
 * A missing canonical ref is shown as an incomplete/unresolved audit record,
 * never as a fact.
 */

import { projectLinkedProjects } from "../campaign/project.js";
import type { CampaignEvent, CampaignStore } from "../campaign/store.js";
import type { ManagementActivityRecord } from "./activity.js";
import type { ManagementActivityDecision } from "./activity.js";
import type { WorkModeHistoryEntry } from "./work_mode_profile.js";

export const OPERATING_HISTORY_ENTRY_KINDS = [
  "work_mode_change",
  "management_mode_change",
  "management_activity",
  "campaign_wake",
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

/**
 * G10-AC-R §13: the canonical Campaign wake events the project operating history
 * may REFERENCE. Only the four event types that describe the monitor's own
 * mechanical progression are admitted.
 */
export const CAMPAIGN_WAKE_EVENT_TYPES = [
  "WATCH_TRIGGERED",
  "WAKE_STARTED",
  "RECONCILIATION_COMMITTED",
  "WAKE_CYCLE_COMPLETED",
] as const;

export type CampaignWakeEventType = (typeof CAMPAIGN_WAKE_EVENT_TYPES)[number];

/**
 * ONE reference to a canonical Campaign event. It carries the minimum needed to
 * name it — the campaign, the canonical event id, the event type and an ordering
 * key. It copies NO Campaign payload (§13).
 */
export interface CampaignWakeEventRef {
  readonly campaignId: string;
  readonly campaignEventId: string;
  readonly eventType: CampaignWakeEventType;
  /**
   * The ordering key of the referenced event.
   *
   * HONEST: the Campaign plane records NO wall clock. A canonical `CampaignEvent`
   * carries only `(campaignId, seq, eventId, type, payload, chainDigest)`, and the
   * producing services never read a clock for a write (only a `not_before`
   * EVALUATION reads one, `src/campaign/prospective.ts:244`). No honest derived
   * entry can therefore claim an instant, and this module invents none: `at` is
   * the event's canonical CHAIN POSITION, rendered fixed-width and
   * lexicographically sortable by `campaignChainPositionOf` below. Read
   * `campaign-seq:<n>` as "at Campaign chain position <n>", never as a time.
   */
  readonly at: string;
  /**
   * The event's canonical chain basis (its `chainDigest`), when the caller can
   * read it. Accepted for provenance only; it is never rendered into the entry's
   * summary and never copied into the view as content.
   */
  readonly basis?: string | null | undefined;
}

/**
 * The canonical ordering key for a Campaign event: its chain position.
 *
 * Because it is deliberately NOT an ISO instant, these entries sort after every
 * dated entry in the shared chronological sort. That is an honest consequence of
 * the Campaign plane being clock-free, not an ordering claim about time; the UI
 * must label the value as a chain position.
 */
export function campaignChainPositionOf(seq: number): string {
  return `campaign-seq:${String(seq).padStart(12, "0")}`;
}

/**
 * The read-only seam onto the canonical Campaign wake events of ONE project's
 * scoped Campaigns. It owns no truth: it reads the Campaign store the way
 * `linkedCampaignMonitorScope` does (`src/monitor/scope.ts:52-71`) and returns
 * references only.
 */
export interface CampaignWakeEventSource {
  projectCampaignWakeEvents(projectId: string): Promise<readonly CampaignWakeEventRef[]>;
}

/**
 * The first-party source: exactly the linked-Campaign narrowing the monitor scope
 * uses. A Campaign that links NO project is excluded rather than defaulted in, and
 * a Campaign whose project projection is not `known` is skipped — an empty result
 * is a legitimate, honest answer.
 */
export function linkedCampaignWakeEventSource(input: {
  readonly store: CampaignStore;
}): CampaignWakeEventSource {
  return Object.freeze({
    async projectCampaignWakeEvents(projectId: string): Promise<readonly CampaignWakeEventRef[]> {
      const refs: CampaignWakeEventRef[] = [];
      for (const definition of await input.store.campaigns()) {
        const events: readonly CampaignEvent[] = await input.store.replay(definition.campaignId);
        const projection = projectLinkedProjects(events);
        if (projection.status !== "known") continue;
        if (!projection.projects.some((entry) => entry.project.projectId === projectId)) continue;
        for (const event of events) {
          const type = event.type;
          if (!(CAMPAIGN_WAKE_EVENT_TYPES as readonly string[]).includes(type)) continue;
          refs.push(
            Object.freeze({
              campaignId: definition.campaignId,
              campaignEventId: event.eventId,
              eventType: type as CampaignWakeEventType,
              at: campaignChainPositionOf(event.seq),
              basis: event.chainDigest,
            }),
          );
        }
      }
      // Deterministic: campaign, then canonical chain position. The event id
      // breaks a tie only to keep the order total (positions are unique per
      // campaign by construction).
      return Object.freeze(
        refs.sort(
          (left, right) =>
            left.campaignId.localeCompare(right.campaignId) ||
            left.at.localeCompare(right.at) ||
            left.campaignEventId.localeCompare(right.campaignEventId),
        ),
      );
    },
  });
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
    /**
     * G10-AC-R §13: how many canonical Campaign wake events this view references.
     * A count of references, never a count of wakes-or-actions.
     */
    readonly campaignWakeEvents: number;
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
  /**
   * G10-AC-R §13: canonical Campaign wake events the caller ALREADY read from the
   * canonical Campaign owner, for THIS project's scoped Campaigns. Absent or empty
   * is honest: this view never scans a Campaign store and never widens a scope.
   */
  readonly campaignWakeEvents?: readonly CampaignWakeEventRef[] | undefined;
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

  // G10-AC-R §13: canonical Campaign wake events, as REFERENCES only.
  //
  // COPY NOTHING: an entry carries only the campaign id, the canonical event id,
  // the event type and the ordering key. No Campaign payload is copied into this
  // view — no watch condition, no watch reason, no wake cause, no commitment, no
  // hypothesis, no reconciliation report and no admitted action. The canonical
  // owner of every one of those remains the Campaign store, and the entry names
  // it through `canonicalOutcomeRefs` alone.
  const campaignWakeEvents = input.campaignWakeEvents ?? [];
  for (const event of campaignWakeEvents) {
    const refs = Object.freeze([`campaign_event:${event.campaignEventId}`]);
    entries.push(
      Object.freeze({
        kind: "campaign_wake" as const,
        ref: `${event.campaignId}:${event.campaignEventId}`,
        at: event.at,
        actor: `campaign:${event.campaignId}`,
        summary: `${event.eventType} in Campaign ${event.campaignId}`,
        canonicalOutcomeRefs: refs,
        // The SAME resolvable-ref rule the other entries use: a reference the
        // caller cannot resolve is an incomplete audit record, not a fact.
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
      campaignWakeEvents: campaignWakeEvents.length,
    }),
    hasIncompleteAuditRecords: entries.some((entry) => entry.incompleteCanonicalRef),
  });
}
