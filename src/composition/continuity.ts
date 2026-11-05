/**
 * PC1 S03/S06 — the continuity/outcome composition.
 *
 * It is the ONE place that adapts the existing Work owner, the derived workspace/journal and the
 * promotion facts into the read-only continuity facade and the explicit domain-outcome service.
 * It owns no store and decides no authority; install.ts only decides to compose it.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";

import { makeProjectContinuityService } from "../project_continuity/index.js";
import type { ProjectContinuityService } from "../project_continuity/index.js";
import {
  artifactChangeReasons,
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
import {
  executionRelayBody,
  makeExecutionRelayRecord,
  type ExecutionAttribution,
} from "../work/execution_relay.js";
import type { Decision, ProjectIr, Requirement, TaskSpec } from "../schema/models.js";
/** The canonical project revision this composition projects; re-exported for the install root. */
export type { ProjectIr } from "../schema/models.js";

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
  /**
   * PWRS-C: the result commit recorded for a COMPLETED attempt, or null when it has none. The
   * canonical object database can read it because settlement exported it; reading it here is how a
   * governed candidate becomes visible to the episode without pretending the canonical tree holds it.
   */
  attemptResultCommit?(attemptId: string): string | null;
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
/**
 * PWRS-C: observe ONE artifact's real bytes, wherever the current work path put them.
 *
 * The ALHS diagnostic measured the failure: a governed candidate lives in the attempt's RESULT
 * COMMIT and the canonical worktree has no such file, so the old check reported `not found` for a
 * candidate that existed. The order is therefore: live worktree → the latest completed attempt's
 * result commit (a candidate) → absent. Source and commit are recorded, so a reader can tell a
 * delivered file from an unaccepted candidate, and the digest lets a later read detect a real change
 * even when the project revision and HEAD did not move.
 */
function makeArtifactObserver(input: {
  readonly repository?: string | undefined;
  readonly candidates?: (() => readonly { attemptId: string; taskId: string | null; resultCommit: string }[]) | undefined;
}): (path: string) => EpisodeArtifactState {  const digestOf = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex");
  const absent = (path: string, detail: string): EpisodeArtifactState => ({
    path,
    present: false,
    tracked: false,
    committed: false,
    digest: null,
    source: "ABSENT" as const,
    commit: null,
    detail,
  });
  return (path: string): EpisodeArtifactState => {
    if (input.repository === undefined) return absent(path, "repository not observable");
    const repository = input.repository;
    const absolute = isAbsolute(path) ? path : resolve(repository, path);
    const rel = relative(repository, absolute).replaceAll("\\", "/");
    if (rel.startsWith("..")) return absent(path, "outside the repository");

    if (existsSync(absolute) && statSync(absolute).isFile()) {
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
      const committed = inHead && !dirty;
      /**
       * PWRS-C: a COMMITTED artifact is digested from its Git blob, not from the checked-out bytes.
       * The worktree may normalize line endings (CRLF on Windows) while the blob stores LF, and the
       * same artifact read from a result commit is a blob — hashing raw worktree bytes made the SAME
       * committed content look changed after a promotion. An uncommitted file is digested as it
       * actually is on disk, because that is the bytes a reader would get.
       */
      const blobDigest = ((): string | null => {
        if (!committed) return null;
        try {
          const bytes = execFileSync("git", ["-C", repository, "cat-file", "blob", `HEAD:${rel}`], { maxBuffer: 8 * 1024 * 1024 });
          return digestOf(bytes);
        } catch {
          return null;
        }
      })();
      return {
        path,
        present: true,
        tracked,
        committed,
        digest: blobDigest ?? digestOf(readFileSync(absolute)),
        source: "WORKTREE" as const,
        commit: null,
        detail: !tracked
          ? "not tracked by Git"
          : !inHead
            ? "tracked but not in HEAD"
            : dirty
              ? "tracked with uncommitted changes"
              : "committed at HEAD",
      };
    }

    /**
     * A governed candidate is NOT in the canonical worktree. Its bytes are in the attempt's exported
     * result commit, which is readable in the canonical object database — the same read the
     * continuation face performs. Newest first, so the current candidate wins over an older one.
     */
    const candidates = [...(input.candidates?.() ?? [])].reverse();
    for (const candidate of candidates) {
      try {
        const bytes = execFileSync("git", ["-C", repository, "cat-file", "blob", `${candidate.resultCommit}:${rel}`], {
          maxBuffer: 8 * 1024 * 1024,
        });
        return {
          path,
          present: true,
          tracked: true,
          committed: true,
          digest: digestOf(bytes),
          source: "RESULT_COMMIT" as const,
          commit: candidate.resultCommit,
          detail:
            `present in the result commit ${candidate.resultCommit.slice(0, 12)} of attempt ${candidate.attemptId}` +
            " — a governed candidate, not an accepted project asset",
        };
      } catch {
        continue;
      }
    }
    return absent(path, "not found in the worktree or in any completed attempt's result commit");
  };
}

function makeEpisodeService(input: {
  readonly projectId: string;
  readonly workspace: Pick<ProjectWorkspaceService, "recordJournalEntry">;
  readonly pulse: Pick<ProjectPulseService, "pulse">;
  readonly repositoryObservable: boolean;
  readonly artifactState: (path: string) => EpisodeArtifactState;
  readonly clock?: (() => string) | undefined;
}): EpisodeService {
  const now = (): string => (input.clock ?? (() => new Date().toISOString()))();
  const artifactExists =
    input.repositoryObservable ? (path: string): boolean => input.artifactState(path).present : undefined;

  const provenance = (conclusionInput: EpisodeConclusionInput): {
    readonly states: readonly EpisodeArtifactState[];
    readonly warnings: readonly string[];
  } => {
    if (!input.repositoryObservable) {
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
        .map(input.artifactState),
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

  /**
   * PWRS-C: the completed attempts whose result commits a candidate artifact may live in. A VERIFYING
   * task's candidate is preferred over older history; within each group the newest attempt wins.
   */
  const candidates = (): readonly { attemptId: string; taskId: string | null; resultCommit: string }[] => {
    if (input.controller.attemptResultCommit === undefined) return [];
    const status = input.controller.status();
    const taskStates = new Map(status.tasks.map((task) => [task.task_id, task.state]));
    const rows = [...status.attempts]
      .filter((attempt) => attempt.state === "COMPLETED")
      .reverse()
      .map((attempt) => {
        let resultCommit: string | null = null;
        try {
          resultCommit = input.controller.attemptResultCommit!(attempt.attempt_id);
        } catch {
          resultCommit = null;
        }
        if (resultCommit === null || resultCommit === "") return null;
        const taskState = attempt.task_id === null ? null : taskStates.get(attempt.task_id) ?? null;
        return { attemptId: attempt.attempt_id, taskId: attempt.task_id, taskState, resultCommit };
      })
      .filter((row): row is { attemptId: string; taskId: string | null; taskState: string | null; resultCommit: string } => row !== null);
    rows.sort((left, right) => (left.taskState === "VERIFYING" ? 0 : 1) - (right.taskState === "VERIFYING" ? 0 : 1));
    return Object.freeze(rows.map(({ attemptId, taskId, resultCommit }) => ({ attemptId, taskId, resultCommit })));
  };
  const artifactState = makeArtifactObserver({
    ...(input.repository === undefined ? {} : { repository: input.repository }),
    candidates,
  });

  /**
   * PWRS-C: the per-read artifact overlay. `buildPulseEpisode` already compares revisions, head and
   * basis-bearing journal records; this adds the fact those cannot see — the named bytes changed while
   * the project revision and HEAD stayed put. It never invents a change: unrecorded digests are not
   * compared.
   */
  const observedPulse: ProjectPulseService | undefined =
    pulse === undefined
      ? undefined
      : Object.freeze({
          async pulse() {
            const base = await pulse.pulse();
            if (input.repository === undefined || base.episode.conclusion === null) return base;
            const recorded = base.episode.conclusion.check.artifacts ?? [];
            if (recorded.length === 0) return base;
            const nowStates = recorded.map((state) => artifactState(state.path));
            const reasons = artifactChangeReasons(recorded, nowStates);
            if (reasons.length === 0) return base;
            const changedSince = [...base.episode.changedSince, ...reasons];
            return Object.freeze({
              ...base,
              episode: Object.freeze({
                ...base.episode,
                state: "REOPENED" as const,
                current: false,
                changedSince: Object.freeze(changedSince),
                detail: `the conclusion is REOPENED: ${changedSince.join("; ")}. Re-read the current state before relying on the earlier judgement`,
              }),
            });
          },
        });

  const episode =
    workspace === undefined || observedPulse === undefined
      ? undefined
      : makeEpisodeService({
          projectId: input.projectId,
          workspace,
          pulse: observedPulse,
          repositoryObservable: input.repository !== undefined,
          artifactState,
          ...(input.clock === undefined ? {} : { clock: input.clock }),
        });

  return Object.freeze({ continuity, domainOutcome, contribution, pulse: observedPulse, episode });
}


/**
 * PWRS-A — the DURABLE execution-relay record, written through the existing project journal.
 *
 * A settlement attribution must survive the host that observed it, and the repo already has exactly
 * one durable, derived, per-project record that survives sessions: the project journal. It carries
 * contribution records, decisions and episode conclusions the same way — as an ordinary
 * REFERENCE_NOTE with one structured marker. Creating a second table (an authorship ledger, a
 * result store) would duplicate an owner the product already has.
 *
 * A journal note is derived and advisory. It cannot settle an attempt, accept a result or promote
 * anything; the canonical attempt report remains the Work record.
 */
export interface ExecutionRelayRecorder {
  record(input: {
    readonly taskId: string;
    readonly attemptId: string;
    readonly baseCommit: string;
    readonly resultCommit: string;
    readonly attribution: ExecutionAttribution;
  }): Promise<void>;
}

export function makeExecutionRelayRecorder(input: {
  readonly projectId: string;
  readonly workspace: Pick<ProjectWorkspaceService, "recordJournalEntry">;
  readonly clock?: (() => string) | undefined;
}): ExecutionRelayRecorder {
  const now = input.clock ?? (() => new Date().toISOString());
  return Object.freeze({
    async record(entry: {
      readonly taskId: string;
      readonly attemptId: string;
      readonly baseCommit: string;
      readonly resultCommit: string;
      readonly attribution: ExecutionAttribution;
    }): Promise<void> {
      const record = makeExecutionRelayRecord({
        taskId: entry.taskId,
        attemptId: entry.attemptId,
        baseCommit: entry.baseCommit,
        resultCommit: entry.resultCommit,
        attribution: entry.attribution,
        recordedAt: now(),
      });
      await input.workspace.recordJournalEntry({
        projectId: input.projectId,
        kind: "REFERENCE_NOTE",
        title: `Execution relay: ${record.attribution.attribution}`,
        body: executionRelayBody(record),
        provenance: `relay:${record.recordId}`,
        relatedRefs: [
          { kind: "task", id: record.taskId },
          { kind: "attempt", id: record.attemptId },
        ],
      });
    },
  });
}
