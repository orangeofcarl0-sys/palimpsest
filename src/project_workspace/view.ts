/**
 * G10-V Project Workspace — the DERIVED, read-only project workspace view.
 *
 *   ProjectWorkspaceView ≠ CanonicalStore    OpenLoop ≠ WorkTask
 *   Opportunity ≠ Task                       View ≠ Truth
 *   Association ≠ AssetContent               NegativeResult grants no truth
 *
 * The view is a pure re-arrangement of existing canonical truths (ProjectIr from
 * the Work ledger, the controller's scheduling projections, association and
 * journal records this layer owns, plus EXPLICITLY configured read-only planes).
 * It owns no history, copies no fact, and NEVER fabricates a source it does not
 * have: an absent plane produces a `knowledgeWarnings` entry, never a guessed
 * value. The whole result is deep-frozen typed data (not a store).
 */

import type { Decision, ProjectIr, Requirement } from "../schema/models.js";
import type { ControllerStatusView } from "../tools/controller.js";
import type { OrchestrationGraph } from "../tools/graph.js";

import type { ProjectAssetAssociation } from "./association.js";
import type { ProjectJournalEntry, ProjectJournalViewEntry } from "./journal.js";

/* ------------------------------------------------------------------ *
 * OpenLoop — a derived prompt to look, NEVER a work task
 * ------------------------------------------------------------------ */

export const OPEN_LOOP_KINDS = [
  "BLOCKED_WORK",
  "READY_WORK",
  "CAMPAIGN_WATCH",
  "REASONING_UNRESOLVED",
  "STALE_PROOF",
  "PENDING_COMMITMENT",
  "PENDING_BOUNDARY_DECISION",
  "JOURNAL_OPEN_QUESTION",
  "JOURNAL_OPPORTUNITY",
  // G10-X: the ProjectIR head is behind the canonically proven effect head, or
  // the promotion chain is broken. Derived from the controller's head status.
  "PROJECT_HEAD_DRIFT",
  "PROJECT_HEAD_CONFLICT",
  // G10-Z: a promotion intent still owns an external effect, or its effect
  // committed without ever admitting the owning Work. Derived from the canonical
  // promotion events - a prompt to look, never an automatic action.
  "PROMOTION_EFFECT_UNRESOLVED",
  "PROMOTION_AWAITING_SETTLEMENT",
] as const;
export type OpenLoopKind = (typeof OPEN_LOOP_KINDS)[number];

export interface OpenLoopSubjectRef {
  readonly kind: string;
  readonly id: string;
}

export interface OpenLoop {
  readonly id: string;
  readonly kind: OpenLoopKind;
  readonly detail: string;
  readonly subjectRef?: OpenLoopSubjectRef | undefined;
}

/* ------------------------------------------------------------------ *
 * View sub-shapes
 * ------------------------------------------------------------------ */

export interface WorkspaceProjectView {
  readonly goal: string;
  readonly revision: number;
  readonly digest: string;
  readonly headCommit: string;
  /**
   * G10-X: the DERIVED canonical head picture. `state` is the machine value and
   * `stateLabel` the human rendering (`in sync` / `sync required` / `conflict`);
   * `latestPromotion` is the provenance of the promotion that produced the head
   * (null when no promotion is chained). Everything here is copied from the
   * controller's derived status - the view owns no head of its own.
   */
  readonly head?: WorkspaceHeadView | undefined;
  readonly requirements: readonly Requirement[];
  readonly decisions: readonly Decision[];
}

export interface WorkspaceHeadView {
  readonly projectHeadCommit: string;
  readonly provenEffectHeadCommit: string;
  readonly state: "IN_SYNC" | "SYNC_REQUIRED" | "CONFLICT";
  readonly stateLabel: "in sync" | "sync required" | "conflict";
  readonly latestPromotion?:
    | {
        readonly promotionId: string;
        readonly attemptId: string;
        readonly sourceCommit: string;
        readonly fromHead: string;
        readonly toHead: string;
        readonly eventId: string;
      }
    | null
    | undefined;
}

export interface WorkspaceTaskView {
  readonly task_id: string;
  readonly state: string;
  readonly last_event_id: number;
  readonly role?: string | undefined;
}

export interface WorkspaceAttemptView {
  readonly attempt_id: string;
  readonly task_id: string | null;
  readonly state: string;
  readonly attempt_no: number | null;
}

export interface WorkspaceEvidenceView {
  readonly evidence_id: string;
  readonly status: string;
}

export interface WorkspacePromotionView {
  readonly promotion_id: string;
  readonly state: string;
}

export interface WorkspaceOpenTaskView {
  readonly task_id: string;
  readonly state: string;
}

export interface WorkspaceResumeView {
  readonly action: ControllerStatusView["resume"]["action"];
  readonly detail: string;
  readonly inFlightAttemptIds: readonly string[];
  readonly openTasks: readonly WorkspaceOpenTaskView[];
  readonly preparedPromotions: readonly string[];
}

export interface ProjectWorkspaceWorkView {
  readonly schedulerState: "RUNNING" | "PAUSED";
  readonly tasks: readonly WorkspaceTaskView[];
  readonly attempts: readonly WorkspaceAttemptView[];
  readonly evidence: readonly WorkspaceEvidenceView[];
  readonly promotions: readonly WorkspacePromotionView[];
  readonly resume: WorkspaceResumeView;
  readonly blockers: readonly string[];
}

export interface ProjectWorkspaceAssetsView {
  readonly associations: readonly ProjectAssetAssociation[];
  readonly byKind: Readonly<Record<string, number>>;
}

export interface WorkspaceProjectRef {
  readonly projectId: string;
  readonly revision: number;
  readonly digest: string;
}

export interface ProjectWorkspaceRelationsView {
  readonly campaignProjectRefs: readonly WorkspaceProjectRef[];
}

export interface WorkspaceHistoryEntry {
  readonly kind: string;
  readonly at: string;
  readonly detail: string;
}

export interface ProjectWorkspaceView {
  readonly schemaVersion: 1;
  readonly projectId: string;
  readonly project: WorkspaceProjectView;
  readonly work: ProjectWorkspaceWorkView;
  readonly assets: ProjectWorkspaceAssetsView;
  readonly openLoops: readonly OpenLoop[];
  readonly relations: ProjectWorkspaceRelationsView;
  readonly historySummary: readonly WorkspaceHistoryEntry[];
  readonly knowledgeWarnings: readonly string[];
}

/* ------------------------------------------------------------------ *
 * Read-only source snapshots (undefined ⇒ not configured, never empty-guessed)
 * ------------------------------------------------------------------ */

export interface ProofClaimSnapshot {
  readonly claimId: string;
  readonly standing: string;
  readonly freshness: string;
}

export interface ReasoningCellSnapshot {
  readonly cellId: string;
  readonly lifecycle: "OPEN" | "CLOSED";
  readonly unresolvedCandidateCount: number;
  readonly activeClaimCount: number;
}

export interface PendingKnowledgeRef {
  readonly id: string;
  readonly detail: string;
}

export interface MemoryExperimentSnapshot {
  readonly experimentId: string;
  readonly evaluationCount: number;
}

export interface ProjectWorkspaceViewSources {
  readonly project: ProjectIr;
  readonly status: ControllerStatusView;
  readonly graph: OrchestrationGraph;
  /** undefined ⇒ the association store is not configured (never confused with "none recorded"). */
  readonly associations?: readonly ProjectAssetAssociation[] | undefined;
  /** undefined ⇒ the journal store is not configured. */
  readonly journal?: readonly ProjectJournalViewEntry[] | undefined;
  readonly proofClaims?: readonly ProofClaimSnapshot[] | undefined;
  readonly reasoningCells?: readonly ReasoningCellSnapshot[] | undefined;
  readonly memoryExperiments?: readonly MemoryExperimentSnapshot[] | undefined;
  readonly campaignProjectRefs?: readonly WorkspaceProjectRef[] | undefined;
  readonly commitments?: readonly PendingKnowledgeRef[] | undefined;
  readonly boundaryDecisions?: readonly PendingKnowledgeRef[] | undefined;
}

/* ------------------------------------------------------------------ *
 * Builder
 * ------------------------------------------------------------------ */

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value as Record<string, unknown>)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }
  return value;
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function loopOf(kind: OpenLoopKind, detail: string, subjectRef?: OpenLoopSubjectRef): OpenLoop {
  const subject = subjectRef === undefined ? "" : `${subjectRef.kind}:${subjectRef.id}`;
  return {
    id: `${kind}${subject === "" ? "" : `:${subject}`}`,
    kind,
    detail,
    ...(subjectRef === undefined ? {} : { subjectRef }),
  };
}

/**
 * G10-X: re-render the controller's DERIVED head status as the workspace
 * overview shape. Undefined when the controller exposes no head view (a bare
 * controller without the additive field), never a guessed default.
 */
function headViewOf(status: ControllerStatusView): WorkspaceHeadView | undefined {
  const head = status.head;
  if (head === undefined) return undefined;
  return {
    projectHeadCommit: head.projectHeadCommit,
    provenEffectHeadCommit: head.provenEffectHeadCommit,
    state: head.state,
    stateLabel:
      head.state === "IN_SYNC"
        ? "in sync"
        : head.state === "SYNC_REQUIRED"
          ? "sync required"
          : "conflict",
    latestPromotion: head.latestPromotion,
  };
}

function byKindCounts(associations: readonly ProjectAssetAssociation[]): Readonly<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const association of associations) {
    counts[association.assetKind] = (counts[association.assetKind] ?? 0) + 1;
  }
  const sorted: Record<string, number> = {};
  for (const key of Object.keys(counts).sort(compareText)) sorted[key] = counts[key]!;
  return sorted;
}

function historyOf(
  associations: readonly ProjectAssetAssociation[],
  journal: readonly ProjectJournalViewEntry[],
): readonly WorkspaceHistoryEntry[] {
  const entries: WorkspaceHistoryEntry[] = [];
  for (const association of associations) {
    entries.push({
      kind: "ASSET_ASSOCIATED",
      at: association.recordedAt,
      detail: `${association.assetKind} (${association.associationKind}): ${association.canonicalRef.kind}:${association.canonicalRef.id}`,
    });
  }
  for (const view of journal) {
    entries.push({
      kind: `JOURNAL_${view.entry.kind}`,
      at: view.entry.createdAt,
      detail: `${view.entry.title}${view.resolution === undefined ? "" : ` [${view.resolution.status}]`}`,
    });
  }
  entries.sort((a, b) => {
    const at = compareText(a.at, b.at);
    if (at !== 0) return at;
    const kind = compareText(a.kind, b.kind);
    if (kind !== 0) return kind;
    return compareText(a.detail, b.detail);
  });
  return Object.freeze(entries);
}

function openLoopsOf(sources: ProjectWorkspaceViewSources): readonly OpenLoop[] {
  const loops: OpenLoop[] = [];
  const { status, graph, journal } = sources;
  const journalEntries = journal ?? [];

  // BLOCKED_WORK — the controller itself reports that the scheduler cannot advance.
  if (status.resume.action === "blocked") {
    loops.push(loopOf("BLOCKED_WORK", status.resume.detail));
  }

  // READY_WORK — unresolved work a worker could claim (a prompt, not a task).
  const objectiveOf = new Map(graph.tasks.map((task) => [task.taskId, task.objective]));
  for (const task of status.tasks) {
    if (task.state === "READY") {
      const objective = objectiveOf.get(task.task_id) ?? "";
      loops.push(
        loopOf("READY_WORK", objective === "" ? `task ${task.task_id} is ready` : `task ${task.task_id} is ready: ${objective}`, {
          kind: "task",
          id: task.task_id,
        }),
      );
    }
  }

  // CAMPAIGN_WATCH — a campaign references this exact project revision.
  if (sources.campaignProjectRefs !== undefined) {
    for (const ref of sources.campaignProjectRefs) {
      loops.push(
        loopOf("CAMPAIGN_WATCH", `campaign watches project revision ${ref.revision}`, { kind: "project", id: ref.projectId }),
      );
    }
  }

  // REASONING_UNRESOLVED — an associated cell still has unresolved candidates.
  if (sources.reasoningCells !== undefined) {
    for (const cell of sources.reasoningCells) {
      if (cell.lifecycle === "OPEN" && cell.unresolvedCandidateCount > 0) {
        loops.push(
          loopOf("REASONING_UNRESOLVED", `reasoning cell ${cell.cellId} has ${cell.unresolvedCandidateCount} unresolved candidate(s)`, {
            kind: "reasoning_cell",
            id: cell.cellId,
          }),
        );
      }
    }
  }

  // STALE_PROOF — an associated published claim has lost standing/freshness.
  if (sources.proofClaims !== undefined) {
    for (const claim of sources.proofClaims) {
      if (claim.standing === "STALE" || claim.freshness === "stale") {
        loops.push(
          loopOf("STALE_PROOF", `proof claim ${claim.claimId} is ${claim.standing === "STALE" ? "STALE" : "stale in freshness"}`, {
            kind: "proof_claim",
            id: claim.claimId,
          }),
        );
      }
    }
  }

  // PENDING_COMMITMENT / PENDING_BOUNDARY_DECISION — only from an explicit plane.
  for (const commitment of sources.commitments ?? []) {
    loops.push(loopOf("PENDING_COMMITMENT", commitment.detail, { kind: "commitment", id: commitment.id }));
  }
  for (const decision of sources.boundaryDecisions ?? []) {
    loops.push(loopOf("PENDING_BOUNDARY_DECISION", decision.detail, { kind: "boundary_decision", id: decision.id }));
  }

  // G10-Z: the promotion fence loops. An unresolved intent is why a revision
  // would be refused with `promotion_settlement_required`, so the operator can
  // see the reason without attempting a mutation.
  for (const row of status.promotionFence) {
    const subject: OpenLoopSubjectRef = { kind: "task", id: row.task_id };
    if (row.state === "PREPARED") {
      loops.push(
        loopOf(
          "PROMOTION_EFFECT_UNRESOLVED",
          `promotion ${row.promotion_id} prepared for task ${row.task_id} has an unresolved external effect; its Work cannot be retired until the effect resolves`,
          subject,
        ),
      );
    } else {
      loops.push(
        loopOf(
          "PROMOTION_AWAITING_SETTLEMENT",
          `promotion ${row.promotion_id} committed for task ${row.task_id} but its Work was never admitted; settle the Work before retiring it`,
          subject,
        ),
      );
    }
  }

  // G10-X: the canonical head drift/conflict loops. Derived from the
  // controller's head status only (never from git) - a prompt to look, never a
  // task and never an automatic head change.
  const head = status.head;
  if (head !== undefined && (head.state === "SYNC_REQUIRED" || head.state === "CONFLICT")) {
    const subject: OpenLoopSubjectRef = { kind: "project", id: sources.project.project_id };
    if (head.state === "SYNC_REQUIRED") {
      loops.push(
        loopOf(
          "PROJECT_HEAD_DRIFT",
          `project head ${head.projectHeadCommit} is behind the proven effect head ${head.provenEffectHeadCommit}`,
          subject,
        ),
      );
    } else {
      loops.push(
        loopOf(
          "PROJECT_HEAD_CONFLICT",
          `the promotion chain is broken at project head ${head.projectHeadCommit}; the head cannot be advanced automatically`,
          subject,
        ),
      );
    }
  }

  // Journal knowledge loops — an unresolved question / an unpromoted opportunity.
  for (const view of journalEntries) {
    const entry: ProjectJournalEntry = view.entry;
    if (view.resolution !== undefined) continue;
    if (entry.kind === "OPEN_QUESTION") {
      loops.push(loopOf("JOURNAL_OPEN_QUESTION", entry.title, { kind: "journal_entry", id: entry.entryId }));
    } else if (entry.kind === "OPPORTUNITY") {
      loops.push(loopOf("JOURNAL_OPPORTUNITY", entry.title, { kind: "journal_entry", id: entry.entryId }));
    }
  }

  // Deterministic order for a derived read model.
  loops.sort((a, b) => compareText(a.id, b.id));
  return Object.freeze(loops.map((loop) => Object.freeze(loop)));
}

function blockersOf(loops: readonly OpenLoop[], graph: OrchestrationGraph): readonly string[] {
  const blockers: string[] = [];
  for (const loop of loops) {
    if (loop.kind === "BLOCKED_WORK") blockers.push(loop.detail);
  }
  for (const hold of graph.runtime?.controls?.holds ?? []) {
    if (hold.status === "active") blockers.push(`task ${hold.taskId} is held: ${hold.reason}`);
  }
  blockers.sort(compareText);
  return Object.freeze(blockers);
}

function knowledgeWarningsOf(
  sources: ProjectWorkspaceViewSources,
  associations: readonly ProjectAssetAssociation[],
): readonly string[] {
  const warnings: string[] = [];
  if (sources.associations === undefined) {
    warnings.push("project association store not configured: project assets cannot be associated or read");
  } else if (associations.length === 0) {
    warnings.push("no project associations recorded");
  }
  if (sources.journal === undefined) {
    warnings.push("project journal store not configured: journal knowledge cannot be read");
  }

  const { proofClaims, reasoningCells, memoryExperiments, campaignProjectRefs, commitments, boundaryDecisions } = sources;

  if (proofClaims === undefined) {
    warnings.push("proof plane not configured: proof claims cannot be read or associated");
  } else {
    const available = new Set(proofClaims.map((claim) => claim.claimId));
    for (const association of associations) {
      if (association.assetKind === "PROOF_CLAIM" && !available.has(association.canonicalRef.id)) {
        warnings.push(`associated proof claim ${association.canonicalRef.id} is not available on the proof plane`);
      }
    }
  }

  if (reasoningCells === undefined) {
    warnings.push("reasoning plane not configured: reasoning cells cannot be read");
  } else {
    const available = new Set(reasoningCells.map((cell) => cell.cellId));
    for (const association of associations) {
      if (association.assetKind === "REASONING_CELL" && !available.has(association.canonicalRef.id)) {
        warnings.push(`associated reasoning cell ${association.canonicalRef.id} is not available`);
      }
    }
  }

  if (memoryExperiments === undefined) {
    warnings.push("organization memory not configured: experiment evaluations cannot be read");
  } else {
    const byId = new Map(memoryExperiments.map((experiment) => [experiment.experimentId, experiment]));
    for (const association of associations) {
      if (association.assetKind === "EXPERIMENT") {
        const experiment = byId.get(association.canonicalRef.id);
        if (experiment === undefined) {
          warnings.push(`associated experiment ${association.canonicalRef.id} has no observable memory`);
        } else if (experiment.evaluationCount === 0) {
          warnings.push(`associated experiment ${association.canonicalRef.id} has no recorded evaluations`);
        }
      }
    }
  }

  if (campaignProjectRefs === undefined) warnings.push("campaign plane not configured: campaign relations cannot be read");
  if (commitments === undefined) warnings.push("commitment plane not configured: PENDING_COMMITMENT loops are not evaluated");
  if (boundaryDecisions === undefined) warnings.push("boundary decision plane not configured: PENDING_BOUNDARY_DECISION loops are not evaluated");

  warnings.sort(compareText);
  return Object.freeze([...new Set(warnings)]);
}

/**
 * Build the deep-frozen, derived workspace view from read-only sources. Pure:
 * no source is mutated and no missing source is guessed.
 */
export function buildProjectWorkspaceView(sources: ProjectWorkspaceViewSources): ProjectWorkspaceView {
  const { project, status, graph } = sources;
  const associations = sources.associations ?? [];
  const journal = sources.journal ?? [];
  const loops = openLoopsOf(sources);
  const headView = headViewOf(status);
  const view: ProjectWorkspaceView = {
    schemaVersion: 1,
    projectId: project.project_id,
    project: {
      goal: project.goal,
      revision: project.revision,
      digest: project.digest,
      headCommit: project.head_commit,
      ...(headView === undefined ? {} : { head: headView }),
      requirements: project.requirements.map((requirement) => ({ ...requirement, acceptance_refs: [...requirement.acceptance_refs] })),
      decisions: project.decisions.map((decision) => ({ ...decision, evidence_ids: [...decision.evidence_ids] })),
    },
    work: {
      schedulerState: status.schedulerState,
      tasks: status.tasks.map((task) => ({ ...task })),
      attempts: status.attempts.map((attempt) => ({ ...attempt })),
      evidence: status.evidence.map((entry) => ({ ...entry })),
      promotions: status.promotions.map((promotion) => ({ ...promotion })),
      resume: {
        action: status.resume.action,
        detail: status.resume.detail,
        inFlightAttemptIds: [...status.resume.inFlightAttemptIds],
        openTasks: status.resume.openTasks.map((task) => ({ ...task })),
        preparedPromotions: [...status.resume.preparedPromotions],
      },
      blockers: blockersOf(loops, graph),
    },
    assets: {
      associations: [...associations],
      byKind: byKindCounts(associations),
    },
    openLoops: loops,
    relations: {
      campaignProjectRefs: (sources.campaignProjectRefs ?? []).map((ref) => ({ ...ref })),
    },
    historySummary: historyOf(associations, journal),
    knowledgeWarnings: knowledgeWarningsOf(sources, associations),
  };
  return deepFreeze(view);
}
