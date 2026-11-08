/**
 * ODPE-B — OUTCOME READINESS and the bounded mechanical finalization.
 *
 * Two real-model failures motivated this module:
 *
 *   PREMATURE SETTLEMENT  a principal settles a draft that predates a measured input;
 *   MISSING SETTLEMENT    a correct commit exists, the world is clean, and the agent keeps polling
 *                         until the budget stops the session.
 *
 * The answer is not a new finisher agent or a second state machine. It is the ORDINARY product entry
 * reporting what the existing owners already know, in the three action classes a principal can act
 * on, plus ONE bounded operation that performs the mechanical steps a human would perform — after
 * re-observing every fact the decision rested on.
 *
 *     Observation ≠ Permission ≠ Acceptance
 *
 * `finalizeOutcome` settles and advances the existing scheduler. It cannot promote, cannot accept an
 * operator decision, and cannot record an episode conclusion. The freshness digest covers the exact
 * facts the readiness was derived from, so a decision made on a moved world is refused, not applied.
 */
import { createHash } from "node:crypto";
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";

import { gitTextRunner } from "../work/path_reuse.js";
import { observeCanonicalBasis, observeProjectInputs } from "../work/unseen_inputs.js";
import type {
  FinalizeOutcome,
  OutcomeAction,
  OutcomeReadiness,
  OutcomeReadinessArtifact,
  WorkApplicationSurface,
  WorkRuntimeDeps,
} from "./work_contract.js";

interface Snapshot {
  readonly readiness: OutcomeReadiness;
  readonly taskId: string | null;
  readonly attemptId: string | null;
  readonly runningAttemptIds: readonly string[];
}

function digestOf(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function taskRowOf(status: unknown, taskId: string | null): { task_id: string; state: string; objective?: string } | null {
  const tasks = (status as { tasks?: Array<{ task_id: string; state: string }> }).tasks ?? [];
  return tasks.find((task) => task.task_id === taskId) ?? null;
}

/** A clean HEAD alone is ordinary project state. Use the retired plan's declared artifacts. */
async function retiredDelivery(
  deps: WorkRuntimeDeps,
  status: ReturnType<WorkRuntimeDeps["controller"]["status"]>,
  requested: string | null,
): Promise<{ reasons: string[]; next: string[] } | null> {
  const { controller, deliveryPulse } = deps;
  const direct = status.directOutcome;
  const head = direct?.repositoryHead;
  const repository = controller.effects.git.repository;
  if (
    deliveryPulse === undefined || repository === undefined || !head ||
    (direct.relation !== "IN_SYNC" && direct.relation !== "DIRECT_AHEAD") ||
    status.attempts.some((attempt) => attempt.orphaned === true)
  ) return null;

  const plannedIds = new Set(controller.work.project().tasks.map((task) => task.task_id));
  const retired = status.tasks.filter((task) => task.state === "STALE" && !plannedIds.has(task.task_id));
  if (retired.length === 0 || (requested !== null && !retired.some((task) => task.task_id === requested))) return null;
  const artifacts = new Set<string>();
  for (const task of retired) {
    const envelope = controller.taskEnvelopeOrNull(task.task_id);
    if (envelope === null) return null;
    for (const path of envelope.required_artifacts) artifacts.add(path);
  }
  if (artifacts.size === 0) return null;

  const pulse = await deliveryPulse.pulse().catch(() => null);
  if (
    pulse === null || pulse.basis.projectRevision !== status.revision || pulse.basis.headCommit !== status.headCommit ||
    pulse.episode.readiness.deliveryBlockers.length > 0 || pulse.episode.readiness.failedOrBlockedTasks.length > 0 ||
    pulse.execution.jobs.some((job) => job.phase === "QUEUED" || job.phase === "RUNNING")
  ) return null;

  // Re-observe Git after the asynchronous episode read. An unobservable worktree cannot prove a clean basis.
  const basis = observeCanonicalBasis(repository);
  if (basis?.head !== head || basis.uncommittedPaths?.length !== 0) return null;
  const git = gitTextRunner(repository);
  const paths = [...artifacts];
  try {
    if (!paths.every((path) => statSync(join(repository, path), { throwIfNoEntry: false })?.isFile() === true &&
      git(["cat-file", "-t", `${head}:${path}`])?.trim() === "blob")) return null;
  } catch {
    return null;
  }

  const reason = `the retired plan's declared artifacts (${paths.join(", ")}) are committed at repository HEAD ${head}`;
  if (pulse.episode.current && pulse.episode.state === "DELIVERED") {
    return { reasons: [reason, "this episode has a current recorded DELIVER conclusion"], next: ["reply using the recorded conclusion"] };
  }
  return {
    reasons: [reason, "the episode has no mechanical delivery blockers; decide whether the committed artifacts satisfy the user's goal"],
    next: ["if the committed artifacts satisfy the goal, call palimpsest_work action=conclude intent=DELIVER with your statement and the artifact paths"],
  };
}

/**
 * Derive the current outcome facts. `acknowledgeInputs` is the principal's semantic declaration; it
 * changes only the classification (a fact it has confronted), never the underlying observation.
 */
export function deriveOutcomeReadiness(
  deps: WorkRuntimeDeps,
  input: { readonly taskId?: string | undefined; readonly acknowledgeInputs?: boolean | undefined } = {},
): Promise<Snapshot> {
  return snapshot(deps, input);
}

async function snapshot(
  deps: WorkRuntimeDeps,
  input: { readonly taskId?: string | undefined; readonly acknowledgeInputs?: boolean | undefined },
): Promise<Snapshot> {
  const status = deps.controller.status();
  const attempts = status.attempts ?? [];
  const directOutcome = status.directOutcome ?? null;
  const running = attempts.filter((attempt) => {
    const record = deps.controller.attemptWorkRecord(attempt.attempt_id) as { state?: string } | null;
    return record?.state === "RUNNING";
  });
  const requested = input.taskId ?? null;
  const runningForTask = requested === null ? running : running.filter((attempt) => attempt.task_id === requested);
  const taskId =
    requested ??
    (running.length === 1 ? running[0]!.task_id : null) ??
    (status.tasks ?? []).find((task) => task.state === "VERIFYING")?.task_id ??
    null;
  const task = taskId === null ? null : taskRowOf(status, taskId);
  const taskAttempts = taskId === null ? [] : attempts.filter((attempt) => attempt.task_id === taskId);
  const runningForThisTask = taskAttempts.filter((attempt) => {
    const record = deps.controller.attemptWorkRecord(attempt.attempt_id) as { state?: string } | null;
    return record?.state === "RUNNING";
  });
  const completedForThisTask = taskAttempts.filter((attempt) => {
    const record = deps.controller.attemptWorkRecord(attempt.attempt_id) as { state?: string } | null;
    return record?.state === "COMPLETED";
  });
  const chosen =
    runningForThisTask.length === 1
      ? runningForThisTask[0]!
      : runningForThisTask.length === 0 && completedForThisTask.length > 0
        ? completedForThisTask[completedForThisTask.length - 1]!
        : null;
  const record = chosen === null ? null : (deps.controller.attemptWorkRecord(chosen.attempt_id) as {
    state?: string;
    envelope?: { base_commit?: string; required_artifacts?: readonly string[] };
  } | null);
  const attemptId = chosen?.attempt_id ?? null;
  const selectedExecution =
    chosen === null
      ? null
      : ((status.attempts ?? []).find((attempt) => attempt.attempt_id === chosen.attempt_id)?.execution ?? null);
  const attemptLiveness = selectedExecution?.liveness ?? "UNKNOWN";
  const baseCommit = record?.envelope?.base_commit ?? "";
  const requiredArtifacts = record?.envelope?.required_artifacts ?? [];

  let world: { observedHead: string; uncommittedChanges: readonly string[]; workDir: string } | null = null;
  try {
    world = attemptId === null ? null : deps.controller.observeAttemptResult(attemptId);
  } catch {
    world = null;
  }
  let canonicalResultCommit: string | null = null;
  try {
    canonicalResultCommit = attemptId === null ? null : deps.controller.promotions.canonicalAttemptResultCommit(attemptId);
  } catch {
    canonicalResultCommit = null;
  }

  const jobs = deps.workDelegation === undefined ? [] : await deps.workDelegation.jobs();
  const job =
    taskId === null
      ? undefined
      : jobs.find((candidate) => candidate.taskId === taskId && (candidate.phase === "QUEUED" || candidate.phase === "RUNNING")) ??
        jobs.find((candidate) => candidate.taskId === taskId);
  const active = job !== undefined && (job.phase === "QUEUED" || job.phase === "RUNNING");
  const invocations = attemptId === null ? [] : deps.controller.executionInvocations.list(attemptId);
  const lastInvocation = invocations.length === 0 ? null : invocations[invocations.length - 1]!;
  const processExit: "OBSERVED" | "UNCONFIRMED" | "UNKNOWN" =
    lastInvocation === null || lastInvocation.outcome === "OPEN"
      ? "UNKNOWN"
      : lastInvocation.outcome === "ENDED"
        ? "OBSERVED"
        : "UNCONFIRMED";

  const repositoryPath = deps.controller.effects.git.repository;
  const inputObservation =
    baseCommit === "" || repositoryPath === undefined
      ? null
      : observeProjectInputs({ repository: repositoryPath, baseCommit });
  const inputState: "OBSERVED" | "UNAVAILABLE" | "NOT_CONFIGURED" =
    inputObservation?.state ?? (repositoryPath === undefined ? "NOT_CONFIGURED" : "UNAVAILABLE");
  const inputPaths = inputObservation?.inputs.map((entry) => entry.path) ?? [];
  const unreadable = inputObservation?.unreadable.map((entry) => entry.path) ?? [];

  const worldHead = world?.observedHead ?? null;
  // A RUNNING attempt's candidate is the world head, not a settled canonical result.
  const candidateCommit = worldHead !== null && baseCommit !== "" && worldHead !== baseCommit ? worldHead : null;
  const resultCommit = canonicalResultCommit ?? candidateCommit;
  const uncommittedChanges = world?.uncommittedChanges ?? [];
  const resultCommitted =
    runningForThisTask.length === 1 &&
    worldHead !== null &&
    baseCommit !== "" &&
    worldHead !== baseCommit &&
    uncommittedChanges.length === 0;

  const artifacts: OutcomeReadinessArtifact[] = requiredArtifacts.map((path) => {
    const present = world === null ? false : existsSync(join(world.workDir, path));
    const committed =
      resultCommitted && world !== null
        ? gitTextRunner(world.workDir)(["cat-file", "-e", `${world.observedHead}:${path}`]) !== null
        : false;
    return Object.freeze({ path, present, committed });
  });
  const missing = artifacts.filter((artifact) => !artifact.present || (resultCommitted && !artifact.committed));

  const readiness = deps.controller.completionReadiness(attemptId ?? undefined);
  const contract = attemptId === null ? null : deps.controller.completionContract(attemptId);
  const verificationRequired = contract?.verification.required === true;
  const verificationSatisfiable = readiness.task?.verificationSatisfiable ?? false;

  const reasons: string[] = [];
  const acknowledged =
    input.acknowledgeInputs === true && inputState === "OBSERVED" && (inputPaths.length > 0 || unreadable.length > 0);
  const delivery = (task === null && requested === null) || task?.state === "STALE"
    ? await retiredDelivery(deps, status, requested)
    : null;
  let action: OutcomeAction;
  if (delivery !== null) {
    action = "SEMANTIC_JUDGEMENT";
    reasons.push(...delivery.reasons);
  } else if (task === null) {
    action = "CONTINUE_WORK";
    reasons.push("no task is currently addressable; plan or begin work before a finalization can be considered");
  } else if (runningForThisTask.length > 1) {
    action = "CONTINUE_WORK";
    reasons.push(`${String(runningForThisTask.length)} attempts are RUNNING for this task; pass the taskId the decision is about`);
  } else if (runningForThisTask.length === 0) {
    if (task.state === "VERIFYING") {
      action = "SEMANTIC_JUDGEMENT";
      reasons.push("a candidate is settled and awaits operator acceptance; the episode decision (WAIT_FOR_OPERATOR) is the principal's");
    } else if (task.state === "SATISFIED") {
      action = "SEMANTIC_JUDGEMENT";
      reasons.push("the task is accepted; decide what the project still needs instead of finalizing it again");
    } else {
      action = "CONTINUE_WORK";
      reasons.push(`the task is ${task.state} with no RUNNING attempt; prepare or delegate the next work`);
    }
  } else if (active) {
    action = "CONTINUE_WORK";
    reasons.push(`this host still observes a ${job?.phase ?? "live"} worker job; wait for its observed exit before any settlement`);
  } else if (processExit === "UNCONFIRMED") {
    action = "SEMANTIC_JUDGEMENT";
    reasons.push(
      "the last worker invocation ended without a confirmed process exit; the world may still have a writer. Use `relay` with an explicit takeover declaration (or a successor), not a silent settlement",
    );
  } else if (world === null || worldHead === null) {
    action = "CONTINUE_WORK";
    reasons.push("the attempt's world cannot be observed; the result cannot be inspected yet");
  } else if (uncommittedChanges.length > 0) {
    /**
     * PNWF-CQ-A §3.3: this check must come BEFORE the zero-delta check. A world at its base with
     * uncommitted edits is not "no work": there is real, unsettled work in front of the principal.
     * The old order described that world as having nothing beyond the basis, which is false.
     */
    action = "CONTINUE_WORK";
    reasons.push(
      `the world still has uncommitted changes (${uncommittedChanges.join(", ")}); commit them or discard them before finalizing. The world HEAD being at the basis does not mean there is no work`,
    );
  } else if (worldHead === baseCommit) {
    /**
     * PNWF-CQ-A §3.2: report the formal fact, not a judgement about the user's business goal.
     * No settleable candidate delta means FORMAL COMPLETION is not ready. Whether the actual
     * outcome is complete is a separate assessment the principal makes from the repository.
     */
    action = directOutcome?.relation === "DIRECT_AHEAD" ? "SEMANTIC_JUDGEMENT" : "CONTINUE_WORK";
    reasons.push(
      "the world has no commit beyond the attempt's basis, so there is no settleable candidate delta and formal completion is not ready",
    );
    reasons.push(
      "this does not establish that the user's actual outcome is incomplete; assess the repository outcome and the task's objective separately",
    );
    if (directOutcome?.relation === "DIRECT_AHEAD") {
      reasons.push(
        `a direct commit exists at ${directOutcome.repositoryHead?.slice(0, 12) ?? "unknown"} (repository ahead of the canonical head ${directOutcome.projectHead.slice(0, 12)}); it is not a governed result and this readiness does not accept it`,
      );
    } else if (directOutcome?.relation === "IN_SYNC") {
      reasons.push(
        "the repository and the canonical head agree; any outcome already in the basis is a direct outcome, not a new delta of this attempt",
      );
    }
    if (attemptLiveness === "UNOBSERVED") {
      reasons.push(
        "this host observed no worker invocation for the attempt; that is not proof a worker never started, and it is not an observed exit",
      );
    }
  } else if (missing.length > 0) {
    action = "CONTINUE_WORK";
    reasons.push(`required artifacts are missing from the candidate (${missing.map((entry) => entry.path).join(", ")})`);
  } else if (inputState === "UNAVAILABLE") {
    action = "SEMANTIC_JUDGEMENT";
    reasons.push(`the project's current inputs could not be observed (${inputObservation?.detail ?? "no observation"}); UNKNOWN is not an absence of change`);
  } else if (unreadable.length > 0 && !acknowledged) {
    /**
     * An OBSERVED repository can still hold a path whose bytes were not read (over the budget, a
     * permission failure, an unreadable link). `state === "OBSERVED"` is about the repository walk,
     * not about every file in it: treating this as "no input" is how an unreadable measured fact
     * becomes a silent absence. It is a SEMANTIC item — the content is UNKNOWN, so no mechanical
     * chain can claim it does not bear on the candidate — and the principal's explicit declaration
     * is what moves it to the mechanical class.
     */
    action = "SEMANTIC_JUDGEMENT";
    reasons.push(
      `the project observation could not read ${unreadable.join(", ")} — the content is UNKNOWN, not an absent input. Decide whether it bears on the candidate, then finalize with acknowledgeInputs=true if it does not`,
    );
  } else if (inputPaths.length > 0 && !acknowledged) {
    action = "SEMANTIC_JUDGEMENT";
    reasons.push(
      `current inputs arrived after the attempt's basis (${inputPaths.join(", ")}); decide whether the candidate still holds, then finalize with acknowledgeInputs=true if it does`,
    );
  } else if (verificationRequired && !verificationSatisfiable) {
    action = "SEMANTIC_JUDGEMENT";
    reasons.push("the completion contract requires independent verification this deployment cannot provide; a settlement cannot claim it");
  } else {
    action = "MECHANICAL_FINALIZATION";
    reasons.push(
      "the candidate commit exists, the required artifacts are in it, no writer is observed, and the remaining step is the ordinary settlement",
    );
    if (attemptLiveness === "UNOBSERVED") {
      reasons.push(
        "this host has no invocation record for the attempt. The settlement is a principal act, will be attributed UNATTRIBUTED, and is not proof that an earlier writer stopped; if you did not author this world, use `relay` successor instead",
      );
    }
    if (acknowledged) reasons.push("the principal acknowledged the inputs that arrived after the basis");
  }

  const observationDigest = digestOf({
    taskId,
    taskState: task?.state ?? null,
    attemptId,
    attemptState: record?.state ?? null,
    baseCommit,
    worldHead,
    uncommittedChanges: [...uncommittedChanges].sort(),
    resultCommit,
    artifacts,
    inputState,
    inputs: (inputObservation?.inputs ?? []).map((entry) => ({ path: entry.path, digest: entry.digest, identity: entry.identity })),
    unreadable: [...unreadable].sort(),
    revision: status.revision ?? null,
    headCommit: status.headCommit ?? null,
    verificationRequired,
    attemptLiveness,
    directOutcome:
      directOutcome === null
        ? null
        : {
            repositoryHead: directOutcome.repositoryHead,
            projectHead: directOutcome.projectHead,
            relation: directOutcome.relation,
          },
  });

  return Object.freeze({
    taskId,
    attemptId,
    runningAttemptIds: Object.freeze(runningForTask.map((attempt) => attempt.attempt_id)),
    readiness: Object.freeze({
      schema: "odpe-outcome-readiness/v1" as const,
      action,
      reasons: Object.freeze(reasons),
      observationDigest,
      task: task === null ? null : Object.freeze({ taskId: task.task_id, state: task.state, objective: task.objective ?? null }),
      attempt:
        attemptId === null
          ? null
          : Object.freeze({
              attemptId,
              state: record?.state ?? chosen?.state ?? "UNKNOWN",
              baseCommit,
              worldPath: world?.workDir ?? null,
              worldHead,
              uncommittedChanges: Object.freeze([...uncommittedChanges]),
              resultCommit,
              resultCommitted,
            }),
      execution:
        taskId === null
          ? null
          : Object.freeze({
              jobPhase: job?.phase ?? null,
              active,
              stopRequested: job?.stopRequested ?? false,
              processExit,
              liveness: attemptLiveness,
            }),
      directOutcome:
        directOutcome === null
          ? null
          : Object.freeze({
              repositoryHead: directOutcome.repositoryHead,
              projectHead: directOutcome.projectHead,
              relation: directOutcome.relation,
              uncommittedPaths: Object.freeze([...directOutcome.uncommittedPaths]),
            }),
      artifacts: Object.freeze(artifacts),
      inputs: Object.freeze({
        state: inputState,
        paths: Object.freeze(inputPaths),
        unreadable: Object.freeze(unreadable),
        relevance: inputPaths.length === 0 && unreadable.length === 0 ? ("NONE_OBSERVED" as const) : ("NEEDS_SEMANTIC_ASSESSMENT" as const),
        detail:
          inputObservation?.detail ??
          (repositoryPath === undefined
            ? "this deployment composes no canonical repository, so current inputs are UNKNOWN"
            : "current inputs could not be observed"),
      }),
      completion: Object.freeze({
        mechanicalChecksEvaluable: contract !== null,
        readinessState: readiness.task?.state ?? null,
        blockers: Object.freeze([...(readiness.task?.blockers ?? [])]),
        verificationRequired,
        verificationSatisfiable,
      }),
      next: Object.freeze(
        delivery?.next ?? (action === "MECHANICAL_FINALIZATION"
          ? ["call further action=finalize with this observationDigest"]
          : action === "SEMANTIC_JUDGEMENT"
            ? ["inspect the named facts", "decide, then either finalize with the digest or conclude the episode"]
            : ["continue the actual work", "re-read readiness after the world moves"]),
      ),
    }),
  });
}

export function makeWorkOutcomeSurface(
  deps: WorkRuntimeDeps,
  settlement: Pick<WorkApplicationSurface, "completeTask">,
): Pick<WorkApplicationSurface, "outcomeReadiness" | "finalizeOutcome"> {
  const finalizeOutcome = async (input: {
    readonly taskId: string;
    readonly expectedObservationDigest: string;
    readonly acknowledgeInputs?: boolean | undefined;
    readonly summary?: string | undefined;
  }): Promise<FinalizeOutcome> => {
    const fresh = await snapshot(deps, { taskId: input.taskId, ...(input.acknowledgeInputs === undefined ? {} : { acknowledgeInputs: input.acknowledgeInputs }) });
    const readiness = fresh.readiness;
    const notReady = (state: FinalizeOutcome["state"], detail: string): FinalizeOutcome =>
      Object.freeze({ state, taskId: input.taskId, detail, resultCommit: null, attribution: null, taskState: readiness.task?.state ?? null, readiness });

    if (readiness.observationDigest !== input.expectedObservationDigest) {
      return notReady(
        "STALE_OBSERVATION",
        "the attempt, the world, the inputs or the project moved after that readiness was read; re-read `readiness` and decide again on the current facts",
      );
    }
    if (readiness.task?.state === "VERIFYING" && readiness.attempt?.state === "COMPLETED" && readiness.attempt.resultCommit !== null) {
      return Object.freeze({
        state: "ALREADY_SETTLED" as const,
        taskId: input.taskId,
        detail: `the attempt is already COMPLETED at ${readiness.attempt.resultCommit.slice(0, 12)}; no second settlement was recorded. The remaining step is operator acceptance`,
        resultCommit: readiness.attempt.resultCommit,
        attribution: null,
        taskState: readiness.task.state,
        readiness,
      });
    }
    if (readiness.action !== "MECHANICAL_FINALIZATION") {
      return notReady("NOT_READY", readiness.reasons.join("; "));
    }
    const settled = await settlement.completeTask({
      taskId: input.taskId,
      ...(input.summary === undefined ? {} : { summary: input.summary }),
      ...(input.acknowledgeInputs === true ? { acknowledgeInputs: true } : {}),
    });
    const after = await snapshot(deps, { taskId: input.taskId });
    if (settled.state !== "SETTLED") {
      /**
       * `NO_RUNNING_ATTEMPT` means the attempt disappeared between the fresh observation and the
       * settlement — another actor cancelled it, or a concurrent settlement won. It is NOT evidence
       * that a result exists. Only a re-observed COMPLETED attempt with a result commit may be
       * reported as already settled; anything else is the current, unsettled state.
       */
      const completed = after.readiness.attempt?.state === "COMPLETED" && after.readiness.attempt.resultCommit !== null;
      return Object.freeze({
        state: settled.state === "NO_RUNNING_ATTEMPT" && completed ? ("ALREADY_SETTLED" as const) : ("NOT_READY" as const),
        taskId: input.taskId,
        detail: settled.detail,
        resultCommit: completed ? (after.readiness.attempt?.resultCommit ?? settled.resultCommit) : settled.resultCommit,
        attribution: settled.attribution ?? null,
        taskState: after.readiness.task?.state ?? null,
        readiness: after.readiness,
      });
    }
    return Object.freeze({
      state: "SETTLED" as const,
      taskId: input.taskId,
      detail:
        `${settled.detail}. The mechanical chain stopped here: the task is ${after.readiness.task?.state ?? "unknown"}. ` +
        "An operator must accept the result, and the episode conclusion remains the principal's judgement",
      resultCommit: settled.resultCommit,
      attribution: settled.attribution ?? null,
      taskState: after.readiness.task?.state ?? null,
      readiness: after.readiness,
    });
  };

  return Object.freeze({
    outcomeReadiness: async (input) => (await snapshot(deps, input ?? {})).readiness,
    finalizeOutcome,
  });
}
