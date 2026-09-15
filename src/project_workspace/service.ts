/**
 * G10-V Project Workspace — the project workspace service.
 *
 *   ProjectWorkspace ≠ CanonicalStore        Association ≠ AssetContent
 *   OpenLoop ≠ WorkTask                      Opportunity ≠ Task
 *   OrganizationMode orthogonal to management mode
 *   NegativeResult grants no truth           Explicit promotion, never automatic
 *
 * This service composes a DERIVED workspace view from read-only sources and owns
 * exactly three mutation paths: the association store it owns, the journal store it
 * owns, and `controller.plan(...)` for ProjectIR changes. It imports no other
 * subsystem's store for mutation, copies no existing truth, and keeps no second
 * history. `appendDecision` composes the next full decisions array and goes through
 * the existing ProjectIr validation and revision lineage — no new decision store.
 */

import { canonicalDigest } from "../schema/canonical.js";
import { parseProjectIr, type Decision, type ProjectIr, type SchedulerEvent, type TaskSpec } from "../schema/models.js";

import { decodeJsonBlob, type ProjectController } from "../tools/controller.js";
import type { ReasoningCellService } from "../reasoning_cell/service.js";

import {
  assetAssociatedEvent,
  associatedAssetsOf,
  materializeProjectAssetAssociation,
  projectWorkspaceOpenedEvent,
  SqliteProjectAssetAssociationStore,
  type CanonicalAssetRefInput,
  type ProjectAssetAssociation,
  type ProjectAssetKind,
  type AssociationKind,
  type ProjectWorkspaceEvent,
  type ProjectWorkspaceEventDraft,
  pwFail,
  pwString,
} from "./association.js";
import {
  journalEntryRecordedEvent,
  journalEntryResolvedEvent,
  journalOpenedEvent,
  materializeProjectJournalEntry,
  materializeProjectJournalResolution,
  projectJournalView,
  type ProjectJournalEntry,
  type ProjectJournalEvent,
  type ProjectJournalEventDraft,
  type ProjectJournalKind,
  type ProjectJournalRef,
  type ProjectJournalResolution,
  type ProjectJournalViewEntry,
  SqliteProjectJournalStore,
} from "./journal.js";
import {
  buildProjectWorkspaceView,
  type MemoryExperimentSnapshot,
  type OpenLoop,
  type ProofClaimSnapshot,
  type ProjectWorkspaceView,
  type ReasoningCellSnapshot,
  type WorkspaceHistoryEntry,
  type WorkspaceProjectRef,
} from "./view.js";

/* ------------------------------------------------------------------ *
 * Read-only ports (never a mutation path)
 * ------------------------------------------------------------------ */

export interface ProjectWorkspaceProofPort {
  publishedClaims(): Promise<readonly { readonly claimRef: { readonly claimId: string } }[]>;
  assetView(claimId: string): Promise<unknown>;
}

export interface ProjectWorkspaceMemoryPort {
  evaluations(experimentId: string): Promise<readonly unknown[]>;
}

export interface ProjectWorkspaceCampaignPort {
  projectRefs(): Promise<readonly { readonly projectId: string; readonly revision: number; readonly digest: string }[]>;
}

export interface ProjectWorkspaceServiceDeps {
  readonly controller: ProjectController;
  readonly associations?: SqliteProjectAssetAssociationStore | undefined;
  readonly journal?: SqliteProjectJournalStore | undefined;
  readonly proof?: ProjectWorkspaceProofPort | undefined;
  readonly memory?: ProjectWorkspaceMemoryPort | undefined;
  readonly campaigns?: ProjectWorkspaceCampaignPort | undefined;
  /** Read-only access to the reasoning plane (cellView/frontier/claimGraph). */
  readonly reasoning?: ReasoningCellService | undefined;
  readonly clock?: (() => string) | undefined;
}

/* ------------------------------------------------------------------ *
 * Write inputs / results
 * ------------------------------------------------------------------ */

export interface AssociateAssetInput {
  readonly projectId: string;
  readonly assetKind: ProjectAssetKind;
  readonly canonicalRef: CanonicalAssetRefInput;
  readonly associationKind: AssociationKind;
  readonly provenance: string;
}

export interface RecordJournalEntryInput {
  readonly projectId: string;
  readonly kind: ProjectJournalKind;
  readonly title: string;
  readonly body: string;
  readonly provenance: string;
  readonly relatedRefs?: readonly ProjectJournalRef[] | undefined;
}

export interface ResolveJournalEntryInput {
  readonly projectId: string;
  readonly entryId: string;
  readonly resolution: ProjectJournalResolution;
}

export interface AppendDecisionInput {
  readonly projectId: string;
  readonly statement: string;
  readonly rationale: string;
  readonly evidenceIds: readonly string[];
  readonly supersedes?: string | undefined;
}

export interface AppendDecisionResult {
  readonly revision: number;
  readonly decision: Decision;
}

export interface PromoteOpportunityInput {
  readonly projectId: string;
  readonly entryId: string;
  readonly taskSpec: TaskSpec;
}

export interface PromoteOpportunityResult {
  readonly revision: number;
  readonly entryId: string;
  readonly taskId: string;
}

export interface ProjectWorkspaceService {
  view(): Promise<ProjectWorkspaceView>;
  assets(): Promise<readonly ProjectAssetAssociation[]>;
  openLoops(): Promise<readonly OpenLoop[]>;
  history(): Promise<readonly WorkspaceHistoryEntry[]>;
  journal(projectId?: string): Promise<readonly ProjectJournalViewEntry[]>;
  projectScopedAssets(projectId: string): Promise<readonly ProjectAssetAssociation[]>;
  associateAsset(input: AssociateAssetInput): Promise<ProjectAssetAssociation>;
  recordJournalEntry(input: RecordJournalEntryInput): Promise<ProjectJournalEntry>;
  resolveJournalEntry(input: ResolveJournalEntryInput): Promise<ProjectJournalViewEntry>;
  appendDecision(input: AppendDecisionInput): Promise<AppendDecisionResult>;
  promoteOpportunity(input: PromoteOpportunityInput): Promise<PromoteOpportunityResult>;
}

export const DECISION_ID_DOMAIN = "palimpsest.project-workspace.decision-id.v1";

/* ------------------------------------------------------------------ *
 * Implementation
 * ------------------------------------------------------------------ */

export function makeProjectWorkspaceService(deps: ProjectWorkspaceServiceDeps): ProjectWorkspaceService {
  const controller = deps.controller;
  const now = (): string => (deps.clock ?? (() => new Date().toISOString()))();

  function assertScopedProject(projectId: string): void {
    if (projectId !== controller.projectId) {
      pwFail("invalid_registration", `project "${projectId}" is not this workspace's project "${controller.projectId}"`);
    }
  }

  function requireAssociations(): SqliteProjectAssetAssociationStore {
    if (deps.associations === undefined) {
      pwFail("invalid_registration", "project association store not configured");
    }
    return deps.associations;
  }

  function requireJournal(): SqliteProjectJournalStore {
    if (deps.journal === undefined) pwFail("invalid_registration", "project journal store not configured");
    return deps.journal;
  }

  /** Read the current ProjectIR (read-only; the controller owns the projection). */
  function readProject(): ProjectIr {
    const row = controller.store.connection
      .prepare("SELECT state_json FROM projects WHERE project_id=?")
      .get(controller.projectId) as { state_json: unknown } | undefined;
    if (row === undefined) {
      pwFail("unknown_project", `project "${controller.projectId}" has no ProjectIR`);
    }
    try {
      return parseProjectIr(decodeJsonBlob(row.state_json));
    } catch (error) {
      pwFail("malformed_record", `project "${controller.projectId}" ProjectIR is unreadable: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  function planRevisionOf(event: SchedulerEvent): number {
    const payload = event.payload.project_ir;
    if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
      pwFail("malformed_record", "the plan event did not carry a ProjectIR payload");
    }
    const revision = (payload as Record<string, unknown>).revision;
    if (typeof revision !== "number" || !Number.isSafeInteger(revision)) {
      pwFail("malformed_record", "the plan event ProjectIR has no safe integer revision");
    }
    return revision;
  }

  /* ----- association store append (opening the scope first when empty) ----- */

  async function appendAssociations(projectId: string, drafts: readonly ProjectWorkspaceEventDraft[]): Promise<readonly ProjectWorkspaceEvent[]> {
    const store = requireAssociations();
    const existing = await store.replay(projectId);
    const tail = existing[existing.length - 1];
    const basis = tail === undefined
      ? { scopeId: projectId, throughSeq: 0, chainDigest: "" }
      : { scopeId: projectId, throughSeq: tail.seq, chainDigest: tail.chainDigest };
    // Definition-first: an empty scope is opened by this very batch.
    const events = existing.length === 0
      ? [projectWorkspaceOpenedEvent(projectId), ...drafts]
      : [...drafts];
    return store.appendAtomic({ expectedBasis: basis, events });
  }

  async function appendJournal(projectId: string, drafts: readonly ProjectJournalEventDraft[]): Promise<readonly ProjectJournalEvent[]> {
    const store = requireJournal();
    const existing = await store.replay(projectId);
    const tail = existing[existing.length - 1];
    const basis = tail === undefined
      ? { scopeId: projectId, throughSeq: 0, chainDigest: "" }
      : { scopeId: projectId, throughSeq: tail.seq, chainDigest: tail.chainDigest };
    const events = existing.length === 0 ? [journalOpenedEvent(projectId), ...drafts] : [...drafts];
    return store.appendAtomic({ expectedBasis: basis, events });
  }

  /* ----- read-only source snapshots ----- */

  function proofSnapshotOf(claimId: string, raw: unknown): ProofClaimSnapshot {
    if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) {
      const record = raw as Record<string, unknown>;
      const standing = typeof record.effectiveStanding === "string" ? record.effectiveStanding : "UNKNOWN";
      const freshness = typeof record.freshness === "string" ? record.freshness : "unknown";
      return Object.freeze({ claimId, standing, freshness });
    }
    return Object.freeze({ claimId, standing: "UNKNOWN", freshness: "unknown" });
  }

  async function proofSnapshots(associations: readonly ProjectAssetAssociation[]): Promise<readonly ProofClaimSnapshot[] | undefined> {
    const proof = deps.proof;
    if (proof === undefined) return undefined;
    const wanted = new Set(associations.filter((association) => association.assetKind === "PROOF_CLAIM").map((association) => association.canonicalRef.id));
    const published = await proof.publishedClaims();
    const snapshots: ProofClaimSnapshot[] = [];
    for (const claim of published) {
      const claimId = claim.claimRef.claimId;
      if (!wanted.has(claimId)) continue;
      try {
        snapshots.push(proofSnapshotOf(claimId, await proof.assetView(claimId)));
      } catch {
        // The claim exists on the plane but its view is unavailable — say so, never guess.
        snapshots.push(Object.freeze({ claimId, standing: "UNAVAILABLE", freshness: "unknown" }));
      }
    }
    snapshots.sort((a, b) => (a.claimId < b.claimId ? -1 : a.claimId > b.claimId ? 1 : 0));
    return Object.freeze(snapshots);
  }

  async function reasoningSnapshots(associations: readonly ProjectAssetAssociation[]): Promise<readonly ReasoningCellSnapshot[] | undefined> {
    const reasoning = deps.reasoning;
    if (reasoning === undefined) return undefined;
    const cellIds = associations.filter((association) => association.assetKind === "REASONING_CELL").map((association) => association.canonicalRef.id);
    const snapshots: ReasoningCellSnapshot[] = [];
    for (const cellId of [...new Set(cellIds)].sort()) {
      try {
        const cell = await reasoning.cellView({ cellId });
        const unresolved = cell.candidates.filter((candidate) => candidate.status === "PENDING" || candidate.status === "UNRESOLVED").length;
        snapshots.push(
          Object.freeze({
            cellId,
            lifecycle: cell.lifecycle,
            unresolvedCandidateCount: unresolved,
            activeClaimCount: cell.activeClaimIds.length,
          }),
        );
      } catch {
        // Unreadable cells stay absent; the view warns about the associated id.
      }
    }
    return Object.freeze(snapshots);
  }

  async function memorySnapshots(associations: readonly ProjectAssetAssociation[]): Promise<readonly MemoryExperimentSnapshot[] | undefined> {
    const memory = deps.memory;
    if (memory === undefined) return undefined;
    const experimentIds = associations.filter((association) => association.assetKind === "EXPERIMENT").map((association) => association.canonicalRef.id);
    const snapshots: MemoryExperimentSnapshot[] = [];
    for (const experimentId of [...new Set(experimentIds)].sort()) {
      try {
        const evaluations = await memory.evaluations(experimentId);
        snapshots.push(Object.freeze({ experimentId, evaluationCount: evaluations.length }));
      } catch {
        // No observable memory for this experiment; the view warns instead.
      }
    }
    return Object.freeze(snapshots);
  }

  async function campaignRefs(): Promise<readonly WorkspaceProjectRef[] | undefined> {
    const campaigns = deps.campaigns;
    if (campaigns === undefined) return undefined;
    const refs = await campaigns.projectRefs();
    const scoped = refs
      .filter((ref) => ref.projectId === controller.projectId)
      .map((ref) => Object.freeze({ projectId: ref.projectId, revision: ref.revision, digest: ref.digest }));
    scoped.sort((a, b) => (a.revision !== b.revision ? a.revision - b.revision : a.digest < b.digest ? -1 : a.digest > b.digest ? 1 : 0));
    return Object.freeze(scoped);
  }

  /* ----- reads ----- */

  async function associationsFor(projectId: string): Promise<readonly ProjectAssetAssociation[] | undefined> {
    if (deps.associations === undefined) return undefined;
    return associatedAssetsOf(await deps.associations.replay(projectId));
  }

  async function journalFor(projectId: string): Promise<readonly ProjectJournalViewEntry[] | undefined> {
    if (deps.journal === undefined) return undefined;
    return projectJournalView(await deps.journal.replay(projectId));
  }

  async function view(): Promise<ProjectWorkspaceView> {
    const project = readProject();
    const status = controller.status();
    const graph = controller.orchestrationGraph();
    const associations = await associationsFor(project.project_id);
    const journal = await journalFor(project.project_id);
    const known = associations ?? [];
    const proofClaims = await proofSnapshots(known);
    const reasoningCells = await reasoningSnapshots(known);
    const memoryExperiments = await memorySnapshots(known);
    const campaignProjectRefs = await campaignRefs();
    return buildProjectWorkspaceView({
      project,
      status,
      graph,
      ...(associations === undefined ? {} : { associations }),
      ...(journal === undefined ? {} : { journal }),
      ...(proofClaims === undefined ? {} : { proofClaims }),
      ...(reasoningCells === undefined ? {} : { reasoningCells }),
      ...(memoryExperiments === undefined ? {} : { memoryExperiments }),
      ...(campaignProjectRefs === undefined ? {} : { campaignProjectRefs }),
    });
  }

  async function assets(): Promise<readonly ProjectAssetAssociation[]> {
    const store = deps.associations;
    if (store === undefined) return Object.freeze([]);
    const found: ProjectAssetAssociation[] = [];
    for (const projectId of await store.projects()) {
      found.push(...associatedAssetsOf(await store.replay(projectId)));
    }
    return Object.freeze(found);
  }

  async function journal(projectId?: string): Promise<readonly ProjectJournalViewEntry[]> {
    const store = deps.journal;
    if (store === undefined) return Object.freeze([]);
    const projectIds = projectId === undefined ? await store.projects() : [projectId];
    const found: ProjectJournalViewEntry[] = [];
    for (const id of projectIds) {
      found.push(...projectJournalView(await store.replay(id)));
    }
    return Object.freeze(found);
  }

  async function projectScopedAssets(projectId: string): Promise<readonly ProjectAssetAssociation[]> {
    const store = deps.associations;
    if (store === undefined) return Object.freeze([]);
    return associatedAssetsOf(await store.replay(projectId));
  }

  async function openLoops(): Promise<readonly OpenLoop[]> {
    return (await view()).openLoops;
  }

  async function history(): Promise<readonly WorkspaceHistoryEntry[]> {
    return (await view()).historySummary;
  }

  /* ----- scoped writes ----- */

  async function associateAsset(input: AssociateAssetInput): Promise<ProjectAssetAssociation> {
    assertScopedProject(input.projectId);
    const association = materializeProjectAssetAssociation({
      projectId: input.projectId,
      assetKind: input.assetKind,
      canonicalRef: input.canonicalRef,
      associationKind: input.associationKind,
      provenance: input.provenance,
      recordedAt: now(),
    });
    await appendAssociations(input.projectId, [assetAssociatedEvent(association)]);
    return association;
  }

  async function recordJournalEntry(input: RecordJournalEntryInput): Promise<ProjectJournalEntry> {
    assertScopedProject(input.projectId);
    const entry = materializeProjectJournalEntry({
      projectId: input.projectId,
      kind: input.kind,
      title: input.title,
      body: input.body,
      provenance: input.provenance,
      ...(input.relatedRefs === undefined ? {} : { relatedRefs: input.relatedRefs }),
      createdAt: now(),
    });
    await appendJournal(input.projectId, [journalEntryRecordedEvent(entry)]);
    return entry;
  }

  async function resolveJournalEntry(input: ResolveJournalEntryInput): Promise<ProjectJournalViewEntry> {
    assertScopedProject(input.projectId);
    const resolution = materializeProjectJournalResolution(input.resolution);
    await appendJournal(input.projectId, [
      journalEntryResolvedEvent({ projectId: input.projectId, entryId: input.entryId, resolution, resolvedAt: now() }),
    ]);
    const entries = projectJournalView(await requireJournal().replay(input.projectId));
    const resolved = entries.find((entry) => entry.entry.entryId === input.entryId);
    if (resolved === undefined) {
      pwFail("malformed_record", `journal entry "${input.entryId}" is not recorded in project "${input.projectId}"`);
    }
    return resolved;
  }

  async function appendDecision(input: AppendDecisionInput): Promise<AppendDecisionResult> {
    assertScopedProject(input.projectId);
    const current = readProject();
    const { decisions, decision } = composeNextDecisions(current, input);
    const event = controller.plan({
      goal: current.goal,
      requirements: current.requirements,
      tasks: current.tasks,
      decisions,
      reason: `append decision ${decision.decision_id}`,
    });
    return Object.freeze({ revision: planRevisionOf(event), decision });
  }

  /**
   * EXPLICIT promotion of a journal OPPORTUNITY into a task — never automatic.
   * The task graph goes through the existing `controller.plan(...)` validation
   * and revision lineage; only an explicit caller promotes an opportunity.
   */
  async function promoteOpportunity(input: PromoteOpportunityInput): Promise<PromoteOpportunityResult> {
    assertScopedProject(input.projectId);
    const entries = projectJournalView(await requireJournal().replay(input.projectId));
    const target = entries.find((entry) => entry.entry.entryId === input.entryId);
    if (target === undefined) {
      pwFail("invalid_registration", `journal entry "${input.entryId}" is not recorded in project "${input.projectId}"`);
    }
    if (target.entry.kind !== "OPPORTUNITY") {
      pwFail("invalid_registration", `journal entry "${input.entryId}" is ${target.entry.kind}, not an OPPORTUNITY`);
    }
    if (target.resolution !== undefined) {
      pwFail("invalid_registration", `journal entry "${input.entryId}" is already ${target.resolution.status}`);
    }
    const current = readProject();
    if (current.tasks.some((task) => task.task_id === input.taskSpec.task_id)) {
      pwFail("invalid_registration", `task "${input.taskSpec.task_id}" is already declared by the ProjectIR`);
    }
    // The task graph is validated by the existing ProjectIR contract first, so a
    // failed plan never records a false PROMOTED resolution.
    const event = controller.plan({
      goal: current.goal,
      requirements: current.requirements,
      decisions: current.decisions,
      tasks: [...current.tasks, input.taskSpec],
      reason: `promote opportunity ${input.entryId} to task ${input.taskSpec.task_id}`,
    });
    const revision = planRevisionOf(event);
    await appendJournal(input.projectId, [
      journalEntryResolvedEvent({
        projectId: input.projectId,
        entryId: input.entryId,
        resolution: materializeProjectJournalResolution({
          status: "PROMOTED",
          detail: `promoted to task ${input.taskSpec.task_id} at revision ${revision}`,
        }),
        resolvedAt: now(),
      }),
    ]);
    return Object.freeze({ revision, entryId: input.entryId, taskId: input.taskSpec.task_id });
  }

  return Object.freeze({
    view,
    assets,
    openLoops,
    history,
    journal,
    projectScopedAssets,
    associateAsset,
    recordJournalEntry,
    resolveJournalEntry,
    appendDecision,
    promoteOpportunity,
  });
}

/* ------------------------------------------------------------------ *
 * Decision composition (append-only lineage through controller.plan)
 * ------------------------------------------------------------------ */

/**
 * Compose the NEXT full decisions array for one appended decision.
 *
 * The new decision is appended (never replacing the array); when `supersedes`
 * names an existing decision, the NEW decision records that pointer (the
 * conventional reading of the field: "this decision supersedes X"). The old
 * decision record is left untouched and retained — `controller.plan` mints a NEW
 * ProjectIR revision, so nothing is edited in place and the full lineage stays
 * replayable.
 */
function composeNextDecisions(current: ProjectIr, input: AppendDecisionInput): { decisions: Decision[]; decision: Decision } {
  const decisions: Decision[] = current.decisions.map((decision) => ({
    ...decision,
    evidence_ids: [...decision.evidence_ids],
  }));
  const statement = pwString(input.statement, "statement");
  const rationale = pwString(input.rationale, "rationale");
  const evidenceIds = input.evidenceIds.map((id) => pwString(id, "evidenceIds[]"));
  const supersedes = input.supersedes === undefined ? undefined : pwString(input.supersedes, "supersedes");
  const decisionId = `dec-${canonicalDigest({
    domain: DECISION_ID_DOMAIN,
    projectId: current.project_id,
    statement,
    rationale,
    evidenceIds,
    supersedes: supersedes ?? null, // the NEW decision points at the one it replaces
  }).slice(0, 32)}`;
  if (decisions.some((decision) => decision.decision_id === decisionId)) {
    pwFail("invalid_registration", `decision "${decisionId}" is already declared`);
  }
  if (supersedes !== undefined) {
    const target = decisions.find((decision) => decision.decision_id === supersedes);
    if (target === undefined) {
      pwFail("invalid_registration", `decision "${supersedes}" is not declared by the ProjectIR`);
    }
    // Refuse to supersede a decision that is itself already superseded: every decision
    // has at most one successor, so the chain stays a lineage rather than a DAG.
    if (decisions.some((decision) => decision.supersedes === supersedes)) {
      pwFail("invalid_registration", `decision "${supersedes}" is already superseded`);
    }
  }
  const decision: Decision = {
    decision_id: decisionId,
    statement,
    rationale,
    evidence_ids: evidenceIds,
    // The NEW decision records the pointer; the superseded record is retained unchanged.
    supersedes: supersedes ?? null,
  };
  decisions.push(decision);
  return { decisions, decision };
}
