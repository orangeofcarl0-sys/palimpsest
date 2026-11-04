/**
 * PC1 S03/S06 — the continuity/outcome composition.
 *
 * It is the ONE place that adapts the existing Work owner, the derived workspace/journal and the
 * promotion facts into the read-only continuity facade and the explicit domain-outcome service.
 * It owns no store and decides no authority; install.ts only decides to compose it.
 */
import { execFileSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";

import { makeProjectContinuityService } from "../project_continuity/index.js";
import type { ProjectContinuityService } from "../project_continuity/index.js";
import {
  episodeArtifactWarnings,
  episodeConclusionBody,
  makeEpisodeConclusion,
  validateEpisodeConclusion,
  type EpisodeArtifactState,
  type EpisodeConclusionInput,
  type EpisodeConclusionResult,
  type EpisodeService,
} from "../project_continuity/index.js";
import { makeDomainOutcomeService } from "../domain_outcome/index.js";
import type { DomainOutcomeService } from "../domain_outcome/index.js";
import { makeContributionService } from "../project_contribution/index.js";
import type {
  ContributionChangeClass,
  ContributionDelegationPort,
  ContributionPlanChange,
  ContributionService,
} from "../project_contribution/index.js";
import { makeProjectPulseService } from "../project_pulse/index.js";
import type { ProjectPulseService, PulseDelegationPort } from "../project_pulse/index.js";
import type { ProjectWorkspaceService } from "../project_workspace/index.js";
import type { Decision, ProjectIr, Requirement, TaskSpec } from "../schema/models.js";

interface ContinuityWorkOwner {
  project(): ProjectIr;
  status(): {
    revision: number;
    headCommit: string;
    schedulerState: string;
    tasks: readonly { task_id: string; state: string }[];
    attempts: readonly {
      attempt_id: string;
      task_id: string | null;
      state: string;
      orphaned?: boolean;
      task_state?: string;
    }[];
    evidence: readonly { evidence_id: string; status: string }[];
    promotions: readonly { promotion_id: string; state: string }[];
    promotionFence: readonly { promotion_id: string; attempt_id: string; task_id: string; state: string }[];
  };
  plan(input: {
    goal: string;
    requirements: readonly Requirement[];
    decisions: readonly Decision[];
    tasks: readonly TaskSpec[];
    reason?: string | undefined;
    changeClass?: ContributionChangeClass | undefined;
    changedIds?: readonly string[] | undefined;
  }): unknown;
  promotionFacts(): readonly {
    promotionId: string;
    attemptId: string;
    sourceCommit: string;
    expectedHeadCommit: string;
    resultingHeadCommit: string;
  }[];
  /** LHAPE-B: the canonical ProjectIR revisions in ascending order, for crash reconciliation. */
  revisionHistory?(): readonly ProjectIr[];
}

export interface ContinuityCompositionInput {
  readonly projectId: string;
  readonly controller: ContinuityWorkOwner;
  readonly projectWorkspace: ProjectWorkspaceService | undefined;
  /** APS: the async delegation runtime, when this deployment composes one. */
  readonly delegation?: (ContributionDelegationPort & PulseDelegationPort) | undefined;
  /** LHAPE-A: this host's work-worker jobs, so the pulse can separate observed from unobserved. */
  readonly workDelegation?: {
    jobs(): Promise<
      readonly {
        jobId: string;
        taskId: string;
        phase: string;
        stopRequested: boolean;
        settlement: unknown;
      }[]
    >;
  } | undefined;
  /** LHAPE-A: where Work is placed, for the execution projection. */
  readonly executionPlacement?: "in-place" | "worktree" | undefined;
  readonly repository?: string | undefined;
  readonly clock?: (() => string) | undefined;
  readonly operatorIntentAdmission: boolean;
}

export interface ContinuityComposition {
  readonly continuity: ProjectContinuityService;
  readonly domainOutcome: DomainOutcomeService | undefined;
  /** APS-A/B: present only when a durable project journal is composed. */
  readonly contribution: ContributionService | undefined;
  /** APS-A: the derived continuation view, present with the contribution chain. */
  readonly pulse: ProjectPulseService | undefined;
  /** ALHS-A: record an episode conclusion over the same journal and pulse, never an acceptance. */
  readonly episode: EpisodeService | undefined;
}

/**
 * Reconstruct the change a decision's already-committed plan revision made.
 *
 * The canonical decision id is embedded in the ProjectIR revision's `decisions`, so a crash after
 * `PROJECT_REVISED` and before the Journal note leaves enough durable evidence to recover the
 * association WITHOUT revising the plan again.
 */
export function appliedDecisionFromHistory(
  history: readonly ProjectIr[],
  decisionId: string,
): { readonly planChange: ContributionPlanChange } | null {
  const index = history.findIndex((project) => project.decisions.some((decision) => decision.decision_id === decisionId));
  if (index < 0) return null;
  const after = history[index]!;
  const before = index === 0 ? null : history[index - 1]!;
  const beforeTasks = before === null ? [] : [...before.tasks];
  const afterTasks = [...after.tasks];
  const beforeById = new Map(beforeTasks.map((task) => [task.task_id, task]));
  const afterById = new Map(afterTasks.map((task) => [task.task_id, task]));
  const addedTaskIds = afterTasks.filter((task) => !beforeById.has(task.task_id)).map((task) => task.task_id);
  const removedTaskIds = beforeTasks.filter((task) => !afterById.has(task.task_id)).map((task) => task.task_id);
  const changedTaskIds = afterTasks
    .filter((task) => {
      const previous = beforeById.get(task.task_id);
      if (previous === undefined) return false;
      return (
        previous.objective !== task.objective ||
        JSON.stringify(previous.depends_on) !== JSON.stringify(task.depends_on) ||
        JSON.stringify(previous.write_paths) !== JSON.stringify(task.write_paths) ||
        JSON.stringify(previous.required_artifacts) !== JSON.stringify(task.required_artifacts)
      );
    })
    .map((task) => task.task_id);
  return {
    planChange: Object.freeze({
      fromRevision: before?.revision ?? after.revision - 1,
      toRevision: after.revision,
      addedTaskIds: Object.freeze(addedTaskIds),
      removedTaskIds: Object.freeze(removedTaskIds),
      changedTaskIds: Object.freeze(changedTaskIds),
      changeClass: null,
      changedIds: Object.freeze([]),
      reason:
        "recovered from the canonical ProjectIR revision that already carries this decision; the journal record was missing, so no second plan revision was applied",
    }),
  };
}

/**
 * ALHS-A: the episode-conclusion service. It records the principal's convergence judgement as an
 * ordinary journal note and never accepts, promotes or approves. The product only refuses a
 * conclusion whose own mechanical facts contradict it.
 */
function makeEpisodeService(input: {
  readonly projectId: string;
  readonly workspace: Pick<ProjectWorkspaceService, "recordJournalEntry">;
  readonly pulse: Pick<ProjectPulseService, "pulse">;
  readonly repository?: string | undefined;
  readonly clock?: (() => string) | undefined;
}): EpisodeService {
  const now = (): string => (input.clock ?? (() => new Date().toISOString()))();
  const artifactExists =
    input.repository === undefined
      ? undefined
      : (path: string): boolean => {
          try {
            const absolute = isAbsolute(path) ? path : resolve(input.repository!, path);
            return existsSync(absolute) && statSync(absolute).isFile();
          } catch {
            return false;
          }
        };

  /**
   * ALHS-C follow-up: a DELIVER is a judgement, but the reader is entitled to know whether the final
   * bytes are in Git. These are facts, not a refusal: an untracked artifact warns, it does not block.
   */
  const artifactState = (path: string): EpisodeArtifactState => {
    if (input.repository === undefined) {
      return { path, present: false, tracked: false, committed: false, detail: "repository not observable" };
    }
    const repository = input.repository;
    const absolute = isAbsolute(path) ? path : resolve(repository, path);
    if (!existsSync(absolute) || !statSync(absolute).isFile()) {
      return { path, present: false, tracked: false, committed: false, detail: "not found" };
    }
    const rel = relative(repository, absolute).replaceAll("\\", "/");
    if (rel.startsWith("..")) {
      return { path, present: true, tracked: false, committed: false, detail: "outside the repository" };
    }
    let tracked = false;
    try {
      execFileSync("git", ["-C", repository, "ls-files", "--error-unmatch", "--", rel], { stdio: "ignore" });
      tracked = true;
    } catch {
      tracked = false;
    }
    let inHead = false;
    try {
      execFileSync("git", ["-C", repository, "cat-file", "-e", `HEAD:${rel}`], { stdio: "ignore" });
      inHead = true;
    } catch {
      inHead = false;
    }
    let dirty = true;
    try {
      dirty = execFileSync("git", ["-C", repository, "status", "--porcelain", "--", rel], { encoding: "utf8" }).trim() !== "";
    } catch {
      dirty = true;
    }
    return {
      path,
      present: true,
      tracked,
      committed: inHead && !dirty,
      detail: !tracked
        ? "not tracked by Git"
        : !inHead
          ? "tracked but not in HEAD"
          : dirty
            ? "tracked with uncommitted changes"
            : "committed at HEAD",
    };
  };

  const provenance = (conclusionInput: EpisodeConclusionInput): {
    readonly states: readonly EpisodeArtifactState[];
    readonly warnings: readonly string[];
  } => {
    if (input.repository === undefined) {
      const requested = (conclusionInput.artifacts ?? []).filter((path) => path.trim() !== "");
      return {
        states: Object.freeze([]),
        warnings:
          requested.length === 0
            ? Object.freeze([])
            : Object.freeze(["the repository is not observable, so artifact provenance was not checked"]),
      };
    }
    const states = Object.freeze(
      (conclusionInput.artifacts ?? [])
        .map((path) => path.trim())
        .filter((path) => path !== "")
        .map(artifactState),
    );
    return { states, warnings: episodeArtifactWarnings(states) };
  };

  return Object.freeze({
    async conclude(conclusionInput: EpisodeConclusionInput): Promise<EpisodeConclusionResult> {
      const current = await input.pulse.pulse();
      const readiness = current.episode.readiness;
      const validation = validateEpisodeConclusion({ conclusion: conclusionInput, readiness, artifactExists });
      const artifactProvenance = provenance(conclusionInput);
      if (!validation.ok) {
        return Object.freeze({
          state: "REFUSED" as const,
          conclusion: null,
          episode: current.episode,
          detail: `the episode conclusion was refused: ${validation.blockers.join("; ")}`,
          blockers: validation.blockers,
          readiness,
          warnings: artifactProvenance.warnings,
          session: Object.freeze({
            mayEnd: false,
            detail:
              "the episode stays open. Resolve the named blockers, or record the intent that matches the actual state (WAIT_FOR_OPERATOR / WAIT_FOR_EXTERNAL_EVENT / CHECKPOINT / CONTINUE)",
          }),
        });
      }
      const conclusion = makeEpisodeConclusion({
        conclusion: conclusionInput,
        readiness,
        basis: {
          projectRevision: current.basis.projectRevision,
          projectDigest: current.basis.projectDigest,
          headCommit: current.basis.headCommit,
        },
        recordedAt: now(),
        artifactStates: artifactProvenance.states,
      });
      await input.workspace.recordJournalEntry({
        projectId: input.projectId,
        kind: "REFERENCE_NOTE",
        title: `Episode conclusion: ${conclusionInput.intent}`,
        body: episodeConclusionBody(conclusion),
        provenance: `episode:${conclusion.conclusionId}`,
      });
      const after = await input.pulse.pulse();
      const mayEnd = conclusionInput.intent !== "CONTINUE";
      return Object.freeze({
        state: "RECORDED" as const,
        conclusion,
        episode: after.episode,
        detail:
          `${conclusionInput.intent} recorded at revision ${String(conclusion.basis.projectRevision)}. ` +
          "This is an advisory episode judgement: it accepts no artifact, promotes no result and approves no expenditure. The operator retains authority." +
          (artifactProvenance.warnings.length === 0 ? "" : ` Provenance: ${artifactProvenance.warnings.join("; ")}.`),
        blockers: Object.freeze([]),
        readiness,
        warnings: artifactProvenance.warnings,
        session: Object.freeze({
          mayEnd,
          detail: mayEnd
            ? "the episode has a recorded stopping state. If nothing contradicts it, reply to the user and stop calling tools; a new session resumes from the same project state"
            : "CONTINUE is recorded, so the episode has not ended. Take the named next step, then conclude again when the state changes",
        }),
      });
    },
  });
}

export function composeContinuityCapability(input: ContinuityCompositionInput): ContinuityComposition {
  const workspace = input.projectWorkspace;
  const domainOutcome =
    workspace === undefined
      ? undefined
      : makeDomainOutcomeService({
          workspace: {
            journal: (projectId?: string) => workspace.journal(projectId),
            recordJournalEntry: (entry) => workspace.recordJournalEntry({ ...entry, projectId: input.projectId }),
          },
          ...(input.repository === undefined ? {} : { repository: input.repository }),
          ...(input.clock === undefined ? {} : { clock: input.clock }),
        });

  const continuity = makeProjectContinuityService({
    work: {
      project: () => input.controller.project(),
      status: () => input.controller.status(),
      promotionFacts: () => input.controller.promotionFacts(),
    },
    ...(workspace === undefined
      ? {}
      : {
          workspace: {
            journal: (projectId?: string) => workspace.journal(projectId),
            openLoops: () => workspace.openLoops(),
          },
        }),
    ...(domainOutcome === undefined
      ? {}
      : {
          outcomes: async () =>
            (await domainOutcome.project()).map((evaluation) => ({
              taskId: evaluation.taskId,
              businessOutcome: evaluation.status,
              investigationComplete: evaluation.investigationComplete,
              unmetRequirements: evaluation.unmetRequirements,
              detail: evaluation.detail,
            })),
        }),
    authority: {
      operatorIntentAdmission: input.operatorIntentAdmission,
      sourceIntake: "operator_only",
      promotion: "operator_only",
    },
    ...(input.clock === undefined ? {} : { clock: input.clock }),
  });

  const contribution =
    workspace === undefined
      ? undefined
      : makeContributionService({
          projectId: input.projectId,
          controller: {
            projectId: input.projectId,
            work: { project: () => input.controller.project() },
            status: () => input.controller.status(),
            plan: (planInput) => input.controller.plan(planInput),
          },
          workspace: {
            journal: (projectId?: string) => workspace.journal(projectId),
            recordJournalEntry: (entry) => workspace.recordJournalEntry(entry),
          },
          ...(input.delegation === undefined ? {} : { delegation: input.delegation }),
          ...(input.controller.revisionHistory === undefined
            ? {}
            : {
                appliedDecision: (decisionId: string) =>
                  appliedDecisionFromHistory(input.controller.revisionHistory!(), decisionId),
              }),
          ...(input.clock === undefined ? {} : { clock: input.clock }),
        });

  const pulse =
    workspace === undefined || contribution === undefined
      ? undefined
      : makeProjectPulseService({
          projectId: input.projectId,
          continuity,
          contributions: contribution,
          workspace: { journal: (projectId?: string) => workspace.journal(projectId) },
          ...(input.delegation === undefined ? {} : { delegation: input.delegation }),
          execution: {
            view: async () => {
              const status = input.controller.status();
              const taskStates = new Map(status.tasks.map((task) => [task.task_id, task.state]));
              const jobs = input.workDelegation === undefined ? [] : await input.workDelegation.jobs();
              const activeJobs = jobs.filter((job) => job.phase === "QUEUED" || job.phase === "RUNNING");
              return Object.freeze({
                placement: input.executionPlacement ?? ("UNKNOWN" as const),
                attempts: Object.freeze(
                  status.attempts.map((attempt) =>
                    Object.freeze({
                      taskId: attempt.task_id,
                      state: attempt.state,
                      taskState:
                        attempt.task_id === null
                          ? null
                          : attempt.task_state ?? taskStates.get(attempt.task_id) ?? null,
                      orphaned: attempt.orphaned === true,
                      hostObserved:
                        attempt.task_id !== null &&
                        activeJobs.some((job) => job.taskId === attempt.task_id),
                    }),
                  ),
                ),
                jobs: Object.freeze(
                  jobs.map((job) => {
                    const settlement = job.settlement;
                    const settlementState =
                      typeof settlement === "object" && settlement !== null && "state" in settlement
                        ? String((settlement as { state: unknown }).state)
                        : null;
                    return Object.freeze({
                      taskId: job.taskId,
                      phase: job.phase,
                      settlementState,
                      stopRequested: job.stopRequested,
                    });
                  }),
                ),
                detail:
                  input.workDelegation === undefined
                    ? "this deployment composes no work-worker transport; canonical attempts are visible but no host job can be observed"
                    : "host jobs are local to THIS process; a canonical attempt with no active job is NOT proven to be running",
              });
            },
          },
          ...(input.clock === undefined ? {} : { clock: input.clock }),
        });

  const episode =
    workspace === undefined || pulse === undefined
      ? undefined
      : makeEpisodeService({
          projectId: input.projectId,
          workspace,
          pulse,
          ...(input.repository === undefined ? {} : { repository: input.repository }),
          ...(input.clock === undefined ? {} : { clock: input.clock }),
        });

  return Object.freeze({ continuity, domainOutcome, contribution, pulse, episode });
}
