/**
 * APS-A/B — the project contribution service.
 *
 * It is a thin, non-authoritative appender over TWO existing owners:
 *
 *     project_workspace.journal   the durable, append-only project note
 *     controller.plan             the ONE canonical plan-revision path
 *
 * It owns no store, no scheduler, no Work task and no acceptance authority. A contribution is a
 * note; a decision is a note plus, optionally, a real plan revision. Nothing here accepts a result,
 * creates Evidence or promotes anything.
 */
import { canonicalDigest } from "../schema/canonical.js";
import type { Decision, ProjectIr, Requirement, TaskSpec } from "../schema/models.js";
import type { ProjectJournalViewEntry } from "../project_workspace/index.js";

import {
  contributionJournalEntries,
  decisionJournalEntries,
  contributionJournalBody,
  decisionJournalBody,
  delegationStartEntries,
  delegationStartJournalBody,
  type JournalRecordRow,
} from "./records.js";
import {
  CONTRIBUTION_DECISIONS,
  contributionDecisionIdOf,
  contributionIdOf,
  type ContributionBasis,
  type ContributionChainEntry,
  type ContributionDecisionKind,
  type ContributionDecisionRecord,
  type ContributionDownstream,
  type ContributionPlanChange,
  type ContributionRecord,
  type ContributionSourceKind,
  type ContributionStatus,
} from "./types.js";

export const CONTRIBUTION_CHANGE_CLASSES = [
  "metadata_only",
  "backward_compatible",
  "behavior_change",
  "contract_breaking",
] as const;
export type ContributionChangeClass = (typeof CONTRIBUTION_CHANGE_CLASSES)[number];

export interface ContributionControllerPort {
  readonly projectId: string;
  readonly work: { project(): ProjectIr };
  status(): { readonly tasks: readonly { readonly task_id: string; readonly state: string }[] };
  plan(input: {
    goal: string;
    requirements: readonly Requirement[];
    decisions: readonly Decision[];
    tasks: readonly TaskSpec[];
    reason?: string | undefined;
    changeClass?: ContributionChangeClass | undefined;
    changedIds?: readonly string[] | undefined;
  }): unknown;
}

export interface ContributionWorkspacePort {
  journal(projectId?: string | undefined): Promise<readonly ProjectJournalViewEntry[]>;
  recordJournalEntry(input: {
    readonly projectId: string;
    readonly kind: "REFERENCE_NOTE";
    readonly title: string;
    readonly body: string;
    readonly provenance: string;
    readonly relatedRefs?: readonly { readonly kind: string; readonly id: string }[] | undefined;
  }): Promise<{ readonly entryId: string; readonly digest: string }>;
}

export interface ContributionReceiptView {
  readonly receiptId: string;
  readonly readFootprint: readonly string[];
  readonly artifacts: readonly string[];
}

export interface ContributionDelegationPort {
  inspect(input: { readonly delegationRef: string }): Promise<{
    readonly state: string;
    readonly basisCommit: string | null;
    readonly question: string | null;
    readonly conclusion: string | null;
    readonly detail: string;
    readonly receipt: ContributionReceiptView | null;
  }>;
}

export interface ContributionServiceDeps {
  readonly projectId: string;
  readonly controller: ContributionControllerPort;
  readonly workspace: ContributionWorkspacePort;
  /** Present only when this deployment composes the async delegation runtime. */
  readonly delegation?: ContributionDelegationPort | undefined;
  readonly clock?: (() => string) | undefined;
}

export interface RecordContributionInput {
  readonly sourceKind: ContributionSourceKind;
  /** A delegation ref, or the principal's label for a native subagent. */
  readonly sourceRef: string;
  readonly task?: string | undefined;
  readonly finding?: string | undefined;
  readonly declaredReadFootprint?: readonly string[] | undefined;
  readonly artifacts?: readonly string[] | undefined;
}

export interface RecordContributionResult {
  readonly contribution: ContributionRecord;
  readonly journalEntryId: string;
  readonly alreadyRecorded: boolean;
}

export interface RecordDelegationStartInput {
  readonly delegationRef: string;
  readonly task: string;
  readonly basisCommit: string;
}

export interface RecordDelegationStartResult {
  readonly journalEntryId: string;
  readonly alreadyRecorded: boolean;
}

export interface DecideContributionInput {
  readonly contributionId: string;
  readonly decision: ContributionDecisionKind;
  readonly decisionNote: string;
  /** The COMPLETE new task graph. Required for REVISE_PLAN, refused otherwise. */
  readonly tasks?: readonly TaskSpec[] | undefined;
  readonly reason?: string | undefined;
  readonly changeClass?: ContributionChangeClass | undefined;
  readonly changedIds?: readonly string[] | undefined;
  readonly declaredChangedPlan?: boolean | undefined;
  /** An explicit acknowledgement that the contribution's basis is stale. */
  readonly allowStaleBasis?: boolean | undefined;
}

export interface DecideContributionResult {
  readonly decision: ContributionDecisionRecord;
  readonly journalEntryId: string;
  readonly alreadyRecorded: boolean;
  readonly contribution: ContributionChainEntry;
}

export class ContributionError extends Error {
  constructor(
    readonly code:
      | "INVALID_INPUT"
      | "UNKNOWN_CONTRIBUTION"
      | "DELEGATION_UNAVAILABLE"
      | "DELEGATION_NOT_TERMINAL"
      | "STALE_BASIS"
      | "PLAN_REQUIRED",
    message: string,
  ) {
    super(message);
    this.name = "ContributionError";
  }
}

function requireText(value: string | undefined, name: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ContributionError("INVALID_INPUT", `${name} must be a non-empty string`);
  }
  return value.trim();
}

function sameBasis(left: ContributionBasis, right: ContributionBasis): boolean {
  return (
    left.projectRevision === right.projectRevision &&
    left.projectDigest === right.projectDigest &&
    left.headCommit === right.headCommit
  );
}

function statusOf(decisions: readonly JournalRecordRow<ContributionDecisionRecord>[]): ContributionStatus {
  const latest = decisions[decisions.length - 1];
  if (latest === undefined) return "UNASSESSED";
  switch (latest.record.decision) {
    case "ACKNOWLEDGE":
      return "ACKNOWLEDGED";
    case "ACCEPT_AS_CANDIDATE":
      return "CANDIDATE";
    case "REJECT":
      return "REJECTED";
    case "NEEDS_MORE_EVIDENCE":
      return "NEEDS_MORE_EVIDENCE";
    case "REVISE_PLAN":
      return latest.record.planChange === null ? "ACKNOWLEDGED" : "PLAN_CHANGED";
  }
}

function taskDigest(task: TaskSpec): string {
  return canonicalDigest(task);
}

function taskDelta(
  before: readonly TaskSpec[],
  after: readonly TaskSpec[],
): { addedTaskIds: string[]; removedTaskIds: string[]; changedTaskIds: string[] } {
  const beforeById = new Map(before.map((task) => [task.task_id, task]));
  const afterById = new Map(after.map((task) => [task.task_id, task]));
  const addedTaskIds: string[] = [];
  const removedTaskIds: string[] = [];
  const changedTaskIds: string[] = [];
  for (const task of after) {
    const previous = beforeById.get(task.task_id);
    if (previous === undefined) addedTaskIds.push(task.task_id);
    else if (taskDigest(previous) !== taskDigest(task)) changedTaskIds.push(task.task_id);
  }
  for (const task of before) {
    if (!afterById.has(task.task_id)) removedTaskIds.push(task.task_id);
  }
  return { addedTaskIds, removedTaskIds, changedTaskIds };
}

export interface ContributionService {
  record(input: RecordContributionInput): Promise<RecordContributionResult>;
  /** Record the START of a delegation so a later Session can discover a late/unconsumed result. */
  recordDelegationStart(input: RecordDelegationStartInput): Promise<RecordDelegationStartResult>;
  decide(input: DecideContributionInput): Promise<DecideContributionResult>;
  list(): Promise<readonly ContributionChainEntry[]>;
  changeClasses(): readonly ContributionChangeClass[];
}

export function makeContributionService(deps: ContributionServiceDeps): ContributionService {
  const now = (): string => (deps.clock ?? (() => new Date().toISOString()))();

  function currentBasis(): ContributionBasis {
    const ir = deps.controller.work.project();
    return Object.freeze({
      projectRevision: ir.revision,
      projectDigest: ir.digest,
      headCommit: ir.head_commit,
    });
  }

  async function readEntries(): Promise<readonly ProjectJournalViewEntry[]> {
    return deps.workspace.journal(deps.projectId);
  }

  async function findContribution(
    entries: readonly ProjectJournalViewEntry[],
    contributionId: string,
  ): Promise<JournalRecordRow<ContributionRecord> | undefined> {
    return contributionJournalEntries(entries).find((row) => row.record.contributionId === contributionId);
  }

  async function record(input: RecordContributionInput): Promise<RecordContributionResult> {
    const sourceRef = requireText(input.sourceRef, "sourceRef");
    let task = input.task?.trim() ?? "";
    let finding = input.finding?.trim() ?? "";
    let declaredReadFootprint = [...(input.declaredReadFootprint ?? [])];
    let artifacts = [...(input.artifacts ?? [])];
    let observation: ContributionRecord["observation"] = "PRINCIPAL_DECLARED";
    let basis = currentBasis();

    const entries = await readEntries();

    if (input.sourceKind === "DELEGATION") {
      if (deps.delegation === undefined) {
        throw new ContributionError(
          "DELEGATION_UNAVAILABLE",
          "this deployment composes no delegation runtime, so a delegation result cannot be recorded here",
        );
      }
      const inspection = await deps.delegation.inspect({ delegationRef: sourceRef });
      if (inspection.state === "RUNNING" || inspection.state === "UNKNOWN") {
        throw new ContributionError(
          "DELEGATION_NOT_TERMINAL",
          `delegation ${sourceRef} is ${inspection.state}; only a terminal result can become a contribution`,
        );
      }
      if (inspection.receipt === null) {
        throw new ContributionError(
          "DELEGATION_NOT_TERMINAL",
          `delegation ${sourceRef} is terminal but produced no receipt to record`,
        );
      }
      observation = "PRODUCT_OBSERVED_TERMINAL";
      declaredReadFootprint = [...inspection.receipt.readFootprint];
      artifacts = [...inspection.receipt.artifacts];
      if (task === "") task = inspection.question ?? "delegated research";
      if (finding === "") finding = inspection.conclusion ?? inspection.detail;
      /**
       * The contribution's basis is the basis the DELEGATION was computed on, not the moment it was
       * finally recorded. The start record is the durable statement of that basis; when it is missing
       * (an older deployment), the ref's frozen commit is still a real fact, and the project
       * revision/digest stay at the recording basis rather than being invented.
       */
      const start = delegationStartEntries(entries).find((row) => row.record.delegationRef === sourceRef);
      if (start !== undefined && start.record.basis !== null) basis = start.record.basis;
      else if (inspection.basisCommit !== null) basis = { ...basis, headCommit: inspection.basisCommit };
    }

    if (task === "") throw new ContributionError("INVALID_INPUT", "task must be a non-empty string");
    if (finding === "") throw new ContributionError("INVALID_INPUT", "finding must be a non-empty string");

    const contribution: ContributionRecord = Object.freeze({
      schema: "pc1-contribution/v1" as const,
      contributionId: contributionIdOf({
        projectId: deps.projectId,
        sourceKind: input.sourceKind,
        sourceRef,
        task,
        finding,
        basis,
      }),
      projectId: deps.projectId,
      sourceKind: input.sourceKind,
      sourceRef,
      task,
      finding,
      basis,
      observation,
      declaredReadFootprint: Object.freeze(declaredReadFootprint),
      readFootprintObservation: declaredReadFootprint.length === 0 ? "NOT_OBSERVED" : "DECLARED",
      artifacts: Object.freeze(artifacts),
      independentVerification: false,
      createdAt: now(),
    });

    const existing = contributionJournalEntries(entries).find(
      (row) => row.record.contributionId === contribution.contributionId,
    );
    if (existing !== undefined) {
      return Object.freeze({
        contribution: existing.record,
        journalEntryId: existing.entry.entryId,
        alreadyRecorded: true,
      });
    }

    const entry = await deps.workspace.recordJournalEntry({
      projectId: deps.projectId,
      kind: "REFERENCE_NOTE",
      title: `Contribution: ${task.slice(0, 96)}`,
      body: contributionJournalBody(contribution),
      provenance: `contribution:${sourceRef}`,
      relatedRefs: [{ kind: input.sourceKind === "DELEGATION" ? "delegation" : "source", id: sourceRef }],
    });
    return Object.freeze({ contribution, journalEntryId: entry.entryId, alreadyRecorded: false });
  }

  async function recordDelegationStart(input: RecordDelegationStartInput): Promise<RecordDelegationStartResult> {
    const delegationRef = requireText(input.delegationRef, "delegationRef");
    const task = requireText(input.task, "task");
    const basisCommit = requireText(input.basisCommit, "basisCommit");
    const entries = await readEntries();
    const existing = delegationStartEntries(entries).find(
      (row) => row.record.delegationRef === delegationRef,
    );
    if (existing !== undefined) {
      return Object.freeze({ journalEntryId: existing.entry.entryId, alreadyRecorded: true });
    }
    const record = Object.freeze({
      schema: "pc1-delegation-start/v1" as const,
      projectId: deps.projectId,
      delegationRef,
      task,
      basisCommit,
      basis: currentBasis(),
      createdAt: now(),
    });
    const entry = await deps.workspace.recordJournalEntry({
      projectId: deps.projectId,
      kind: "REFERENCE_NOTE",
      title: `Delegation started: ${task.slice(0, 96)}`,
      body: delegationStartJournalBody(record),
      provenance: `delegation:${delegationRef}`,
      relatedRefs: [{ kind: "delegation", id: delegationRef }],
    });
    return Object.freeze({ journalEntryId: entry.entryId, alreadyRecorded: false });
  }

  async function decide(input: DecideContributionInput): Promise<DecideContributionResult> {
    const decisionNote = requireText(input.decisionNote, "decisionNote");
    if (!(CONTRIBUTION_DECISIONS as readonly string[]).includes(input.decision)) {
      throw new ContributionError("INVALID_INPUT", `decision must be one of ${CONTRIBUTION_DECISIONS.join(", ")}`);
    }
    const entries = await readEntries();
    const target = contributionJournalEntries(entries).find(
      (row) => row.record.contributionId === input.contributionId,
    );
    if (target === undefined) {
      throw new ContributionError(
        "UNKNOWN_CONTRIBUTION",
        `contribution ${input.contributionId} is not recorded in this project's journal`,
      );
    }

    const current = currentBasis();
    const basisState = sameBasis(target.record.basis, current) ? "CURRENT" : "STALE";
    const wantsPlan = input.tasks !== undefined;
    if (wantsPlan && input.decision !== "REVISE_PLAN") {
      throw new ContributionError(
        "INVALID_INPUT",
        "a task graph is accepted only with the REVISE_PLAN decision; other decisions cannot rewrite the plan",
      );
    }
    if (input.decision === "REVISE_PLAN" && !wantsPlan) {
      throw new ContributionError(
        "PLAN_REQUIRED",
        "REVISE_PLAN needs the COMPLETE new task graph; a decision note alone is not a plan revision",
      );
    }
    if (input.changeClass !== undefined && !(CONTRIBUTION_CHANGE_CLASSES as readonly string[]).includes(input.changeClass)) {
      throw new ContributionError(
        "INVALID_INPUT",
        `changeClass must be one of ${CONTRIBUTION_CHANGE_CLASSES.join(", ")}`,
      );
    }

    const declaredChangedPlan = input.declaredChangedPlan === true;
    const planFingerprint = canonicalDigest({
      tasks: input.tasks ?? null,
      reason: input.reason ?? null,
      changeClass: input.changeClass ?? null,
      changedIds: input.changedIds ?? null,
    });
    const decisionId = contributionDecisionIdOf({
      projectId: deps.projectId,
      contributionId: input.contributionId,
      decision: input.decision,
      decisionNote,
      declaredChangedPlan,
      planFingerprint,
    });
    const existingDecision = decisionJournalEntries(entries).find(
      (row) => row.record.decisionId === decisionId,
    );
    if (existingDecision !== undefined) {
      const listed = await list();
      const contribution = listed.find((row) => row.record.contributionId === input.contributionId)!;
      return Object.freeze({
        decision: existingDecision.record,
        journalEntryId: existingDecision.entry.entryId,
        alreadyRecorded: true,
        contribution,
      });
    }

    /**
     * The stale check runs AFTER the exact-decision idempotency check: replaying the SAME decision
     * must return the decision that was already applied rather than mistaking its own plan revision
     * for an unrelated stale basis. A DIFFERENT plan change from an old basis is still refused.
     */
    if (wantsPlan && basisState === "STALE" && input.allowStaleBasis !== true) {
      throw new ContributionError(
        "STALE_BASIS",
        `contribution ${input.contributionId} was recorded against revision ${String(target.record.basis.projectRevision)} (${target.record.basis.headCommit.slice(0, 12)}), which is not the current basis; an old result must not silently change the plan. Re-read the project and pass allowStaleBasis only if the finding is still informative on the new basis.`,
      );
    }

    let planChange: ContributionPlanChange | null = null;
    if (wantsPlan) {
      const before = deps.controller.work.project();
      const delta = taskDelta(before.tasks, input.tasks!);
      const decision: Decision = {
        decision_id: decisionId,
        statement: `Principal ${input.decision.toLowerCase().replaceAll("_", " ")}: ${target.record.task}`,
        rationale: `${decisionNote} [contribution ${input.contributionId}; source ${target.record.sourceKind}:${target.record.sourceRef}]`,
        evidence_ids: [],
        supersedes: null,
      };
      deps.controller.plan({
        goal: before.goal,
        requirements: before.requirements,
        decisions: [...before.decisions, decision],
        tasks: input.tasks!,
        reason: input.reason ?? `apply contribution decision ${decisionId}`,
        ...(input.changeClass === undefined ? {} : { changeClass: input.changeClass }),
        ...(input.changedIds === undefined ? {} : { changedIds: [...input.changedIds] }),
      });
      const after = deps.controller.work.project();
      planChange = Object.freeze({
        fromRevision: before.revision,
        toRevision: after.revision,
        addedTaskIds: Object.freeze(delta.addedTaskIds),
        removedTaskIds: Object.freeze(delta.removedTaskIds),
        changedTaskIds: Object.freeze(delta.changedTaskIds),
        changeClass: input.changeClass ?? null,
        changedIds: Object.freeze([...(input.changedIds ?? [])]),
        reason: input.reason ?? `apply contribution decision ${decisionId}`,
      });
    }

    const record: ContributionDecisionRecord = Object.freeze({
      schema: "pc1-contribution-decision/v1" as const,
      decisionId,
      projectId: deps.projectId,
      contributionId: input.contributionId,
      decision: input.decision,
      decisionNote,
      basisAtDecision: current,
      basisState,
      declaredChangedPlan,
      planChange,
      createdAt: now(),
    });
    const entry = await deps.workspace.recordJournalEntry({
      projectId: deps.projectId,
      kind: "REFERENCE_NOTE",
      title: `Contribution decision: ${input.decision}`,
      body: decisionJournalBody(record),
      provenance: `contribution:${input.contributionId}`,
      relatedRefs: [
        { kind: "contribution", id: input.contributionId },
        { kind: "journal", id: target.entry.entryId },
      ],
    });
    const listed = await list();
    const contribution = listed.find((row) => row.record.contributionId === input.contributionId)!;
    return Object.freeze({ decision: record, journalEntryId: entry.entryId, alreadyRecorded: false, contribution });
  }

  async function list(): Promise<readonly ContributionChainEntry[]> {
    const entries = await readEntries();
    const contributions = contributionJournalEntries(entries);
    const decisions = decisionJournalEntries(entries);
    const current = currentBasis();
    const taskStates = deps.controller.status().tasks;
    const stateById = new Map(taskStates.map((task) => [task.task_id, task.state]));

    const result: ContributionChainEntry[] = [];
    for (const row of contributions) {
      const own = decisions
        .filter((decision) => decision.record.contributionId === row.record.contributionId)
        .sort((left, right) => {
          const at = left.record.createdAt.localeCompare(right.record.createdAt);
          return at !== 0 ? at : left.entry.entryId.localeCompare(right.entry.entryId);
        });
      const latest = own[own.length - 1] ?? null;
      const change = latest?.record.planChange ?? null;
      const addedTaskIds = change?.addedTaskIds ?? [];
      const downstreamStates = addedTaskIds.map((taskId) => ({
        taskId,
        state: stateById.get(taskId) ?? "ABSENT",
      }));
      const acceptedTaskIds = downstreamStates
        .filter((task) => task.state === "SATISFIED")
        .map((task) => task.taskId);
      const downstream: ContributionDownstream = Object.freeze({
        planRevision: change?.toRevision ?? null,
        addedTaskIds: Object.freeze([...addedTaskIds]),
        taskStates: Object.freeze(downstreamStates),
        acceptedTaskIds: Object.freeze(acceptedTaskIds),
        observableOutcome: acceptedTaskIds.length > 0,
      });
      result.push(
        Object.freeze({
          record: row.record,
          journalEntryId: row.entry.entryId,
          decisions: Object.freeze(
            own.map((decision) => Object.freeze({ record: decision.record, journalEntryId: decision.entry.entryId })),
          ),
          latestDecision: latest === null ? null : Object.freeze({ record: latest.record, journalEntryId: latest.entry.entryId }),
          status: statusOf(own),
          basisState: sameBasis(row.record.basis, current) ? "CURRENT" : "STALE",
          downstream,
        }),
      );
    }
    result.sort((left, right) => {
      const at = left.record.createdAt.localeCompare(right.record.createdAt);
      return at !== 0 ? at : left.record.contributionId.localeCompare(right.record.contributionId);
    });
    return Object.freeze(result);
  }

  return Object.freeze({
    record,
    recordDelegationStart,
    decide,
    list,
    changeClasses: () => CONTRIBUTION_CHANGE_CLASSES,
  });
}
