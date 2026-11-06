/**
 * SR-1 §26 / ODPE — the work SETTLEMENT methods.
 *
 * The one place the principal-facing completion routes meet the Work owner. Every route settles
 * through `controller.settleMutatingWork`; this module never writes a result, a promotion or a
 * second state machine, and it records the observed attribution through the existing journal port.
 */
import { gitTextRunner, planPathReuse, type PathReuseFacts } from "../work/path_reuse.js";
import { observeProjectInputs } from "../work/unseen_inputs.js";
import type { WorkApplicationSurface, WorkController, WorkRuntimeDeps } from "./work_contract.js";

/**
 * PWRS-B: path-level reuse facts for a RETAINED attempt world.
 *
 * The same diff the continuation face runs for a COMPLETED result (`work/path_reuse.ts`), applied to
 * an attempt that never settled: a worker stopped, its world may still hold a commit, and a successor
 * needs to know what is still valid before it inherits or redoes. It is a READ — no ref moves, nothing
 * is promoted and no path is accepted.
 */
function relaySourceFacts(
  controller: WorkController,
  attemptId: string,
): {
  readonly attemptId: string;
  readonly worldPath: string | null;
  readonly resultRevision: string | null;
  readonly currentRevision: string | null;
  readonly facts: PathReuseFacts | null;
} {
  const currentRevision = (controller.status() as { headCommit?: string }).headCommit ?? null;
  let observed: ReturnType<WorkController["observeAttemptResult"]>;
  try {
    observed = controller.observeAttemptResult(attemptId);
  } catch {
    observed = null;
  }
  if (observed === null || currentRevision === null) {
    return { attemptId, worldPath: null, resultRevision: null, currentRevision, facts: null };
  }
  const baseCommit = controller.attemptWorkRecord(attemptId)?.envelope?.base_commit ?? "";
  return {
    attemptId,
    worldPath: observed.workDir,
    resultRevision: observed.observedHead,
    currentRevision,
    facts: planPathReuse({
      run: gitTextRunner(observed.workDir),
      baseRevision: baseCommit,
      resultRevision: observed.observedHead,
      currentRevision,
    }),
  };
}

export function makeWorkSettlementSurface(
  deps: WorkRuntimeDeps,
): Pick<WorkApplicationSurface, "finish" | "completePlaced" | "completeTask" | "relay"> {
  /**
   * PWRS-A: persist ONE settlement attribution as the durable relay record. The recorder is the
   * project journal (an ordinary REFERENCE_NOTE with one marker), not a new store. A recorder
   * failure is reported but never turns a completed settlement into a failure.
   */
  const recordRelay = async (
    surfaceDeps: WorkRuntimeDeps,
    attemptId: string,
    resultCommit: string,
    attribution: import("../work/execution_relay.js").ExecutionAttribution,
  ): Promise<void> => {
    if (surfaceDeps.executionRelay === undefined) return;
    const record = surfaceDeps.controller.attemptWorkRecord(attemptId);
    const taskId = record?.taskId ?? "";
    const baseCommit = record?.envelope?.base_commit ?? "";
    if (taskId === "") return;
    try {
      await surfaceDeps.executionRelay.record({ taskId, attemptId, baseCommit, resultCommit, attribution });
    } catch {
      /* the settlement is canonical; a derived record failure must not undo it */
    }
  };

  return {
    finish: async (input) => {
      // The WORK half first: once this returns, the attempt really is COMPLETED.
      const completed = await deps.controller.finish(input ?? {});
      // §B.15: the two owners meet HERE, in the product layer. `ProjectController` must not import
      // Verification, so the orchestration lives in the application composition instead.
      const contract = deps.controller.completionContract(completed.attemptId);
      if (contract === null || !contract.verification.required) {
        return {
          ...completed,
          verification: { required: false, satisfied: false, verdict: null, detail: null },
        };
      }
      if (deps.verification === undefined) {
        return {
          ...completed,
          verification: {
            required: true,
            satisfied: false,
            verdict: null,
            detail:
              "this attempt's contract requires independent verification and this deployment composes no runtime for it",
          },
        };
      }
      const outcome = await deps.verification.service.verifyAttemptResult({
        attemptId: completed.attemptId,
        requestedBy: "agent:palimpsest_finish",
      });
      const verdict = outcome.run?.verdict ?? null;
      return {
        ...completed,
        verification: {
          required: true,
          satisfied: verdict === "PASS",
          verdict,
          detail: outcome.detail,
        },
      };
    },
    completePlaced: async (input) => {
      const running = deps.controller.status().attempts.filter((attempt) => attempt.state === "RUNNING");
      if (running.length !== 1) {
        throw new Error(
          running.length === 0
            ? "no RUNNING attempt is available to complete; use `palimpsest_work action=run` to reach one"
            : `${String(running.length)} attempts are RUNNING; the product refuses to guess which one this completion closes`,
        );
      }
      const attemptId = running[0]!.attempt_id;
      const settled = await deps.controller.settleMutatingWork({
        attemptId,
        workerOutcome: { kind: "READY_FOR_SETTLEMENT", ...(input?.summary === undefined ? {} : { detail: input.summary }) },
        // PWRS-A: the principal path is named as such. The Work owner still attributes the bytes
        // from its own observations; naming the path cannot manufacture worker production.
        observation: {
          path: "PRINCIPAL",
          ...(input?.acknowledgeInputs === true ? { acknowledgeInputs: true } : {}),
        },
      });
      if (settled.state !== "SETTLED") {
        throw new Error(`${settled.state}: ${settled.detail}`);
      }
      deps.controller.step();
      await recordRelay(deps, attemptId, settled.resultCommit, settled.attribution);
      return {
        attemptId,
        state: "COMPLETED" as const,
        resultCommit: settled.resultCommit,
        changedFiles: settled.changedFiles,
        evidenceRecorded: settled.evidenceRecorded,
        nextEvidenceNeeded: Object.freeze([]),
        attribution: settled.attribution,
      };
    },
    completeTask: async (input) => {
      const status = deps.controller.status() as {
        attempts?: Array<{ attempt_id: string; task_id: string | null; state: string }>;
      };
      const rawRunning = (status.attempts ?? []).filter((attempt) => {
        if (attempt.task_id !== input.taskId) return false;
        const record = deps.controller.attemptWorkRecord(attempt.attempt_id) as { state?: string } | null;
        return record?.state === "RUNNING";
      });
      if (rawRunning.length === 0) {
        return {
          state: "NO_RUNNING_ATTEMPT" as const,
          taskId: input.taskId,
          detail:
            "this task has no canonically RUNNING attempt; nothing was observed or settled. If its result already settled, inspect `results` instead",
          resultCommit: null,
          changedFiles: Object.freeze([]),
        };
      }
      if (rawRunning.length > 1) {
        return {
          state: "MULTIPLE_ATTEMPTS" as const,
          taskId: input.taskId,
          detail: `${String(rawRunning.length)} RUNNING attempts exist for this task; the product refuses to guess which one owns the work`,
          resultCommit: null,
          changedFiles: Object.freeze([]),
        };
      }
      const jobs = deps.workDelegation === undefined ? [] : await deps.workDelegation.jobs();
      const active = jobs.find(
        (job) => job.taskId === input.taskId && (job.phase === "QUEUED" || job.phase === "RUNNING"),
      );
      if (active !== undefined) {
        return {
          state: "WORKER_ACTIVE" as const,
          taskId: input.taskId,
          detail: `this host still has an active worker job (${active.jobId}, ${active.phase}) for the task; stop it or wait for the host observation instead of racing it`,
          resultCommit: null,
          changedFiles: Object.freeze([]),
        };
      }
      const attemptId = rawRunning[0]!.attempt_id;
      try {
        const settled = await deps.controller.settleMutatingWork({
          attemptId,
          workerOutcome: { kind: "READY_FOR_SETTLEMENT", ...(input.summary === undefined ? {} : { detail: input.summary }) },
          observation: {
            path: "PRINCIPAL",
            ...(input.acknowledgeInputs === true ? { acknowledgeInputs: true } : {}),
          },
        });
        if (settled.state === "SETTLED") {
          deps.controller.step();
          await recordRelay(deps, attemptId, settled.resultCommit, settled.attribution);
          return {
            state: "SETTLED" as const,
            taskId: input.taskId,
            detail: `${settled.detail} — this host observed the world; attribution ${settled.attribution.attribution} (${settled.attribution.detail}). This is a principal settlement, not proof that an earlier writer stopped`,
            resultCommit: settled.resultCommit,
            changedFiles: settled.changedFiles,
            attribution: settled.attribution,
          };
        }
        return {
          state: settled.state,
          taskId: input.taskId,
          detail: settled.detail,
          resultCommit: settled.state === "BASE_DRIFT" ? settled.resultCommit : null,
          changedFiles: Object.freeze([]),
        };
      } catch (error) {
        return {
          state: "NOT_READY" as const,
          taskId: input.taskId,
          detail: error instanceof Error ? error.message : String(error),
          resultCommit: null,
          changedFiles: Object.freeze([]),
        };
      }
    },
    relay: async (input) => {
      const status = deps.controller.status() as {
        attempts?: Array<{ attempt_id: string; task_id: string | null; state: string }>;
        tasks?: Array<{ task_id: string; state: string }>;
      };
      const running = (status.attempts ?? []).filter((attempt) => {
        if (attempt.task_id !== input.taskId) return false;
        const record = deps.controller.attemptWorkRecord(attempt.attempt_id) as { state?: string } | null;
        return record?.state === "RUNNING";
      });
      const refused = (detail: string): Awaited<ReturnType<WorkApplicationSurface["relay"]>> => ({
        state: "REFUSED" as const,
        taskId: input.taskId,
        route: input.route,
        attemptId: running.length === 1 ? running[0]!.attempt_id : null,
        detail,
        resultCommit: null,
        changedFiles: Object.freeze([]),
        attribution: null,
        retainedWorldPath: null,
        reuse: null,
        inputsNotInBasis: Object.freeze([]),
        inputsState: "UNAVAILABLE" as const,
        inputsDetail: "the project inputs were not observed for this refusal",
        taskState: null,
      });
      if (running.length === 0) {
        return refused(
          "this task has no canonically RUNNING attempt; a relay continues an attempt that exists. If its result already settled, inspect `results` instead",
        );
      }
      if (running.length > 1) {
        return refused(`${String(running.length)} RUNNING attempts exist for this task; the product refuses to guess which one the relay continues`);
      }
      const attemptId = running[0]!.attempt_id;
      const jobs = deps.workDelegation === undefined ? [] : await deps.workDelegation.jobs();
      const active = jobs.find(
        (job) => job.taskId === input.taskId && (job.phase === "QUEUED" || job.phase === "RUNNING"),
      );
      if (active !== undefined) {
        return refused(
          `this host still observes an active worker job (${active.jobId}, ${active.phase}) for the task; a relay would race a writer it can see — stop it or wait for its observed exit`,
        );
      }
      const invocations = deps.controller.executionInvocations.list(attemptId);
      const open = invocations.find((invocation) => invocation.outcome === "OPEN");
      if (open !== undefined) {
        return refused(
          `this host still observes worker invocation ${open.invocationId} as OPEN; the world is being written, so no takeover or successor is recorded`,
        );
      }

      if (input.route === "takeover") {
        const last = invocations.length === 0 ? null : invocations[invocations.length - 1]!;
        const observedExit = last?.outcome === "ENDED";
        /**
         * PWRS-A §6.3: only an OBSERVED exit authorizes a same-world takeover without a statement.
         * No invocation at all (a restart, another host) and an UNCONFIRMED exit both mean the world
         * may still have a writer, so the principal must DECLARE the abandonment — recorded as
         * declared, never as observed — or choose the isolated successor route.
         */
        if (!observedExit && input.declareExecutorAbandoned !== true) {
          return refused(
            last?.outcome === "UNCONFIRMED"
              ? "this host's last worker invocation ended without a confirmed process exit. A same-world takeover needs an explicit `declareExecutorAbandoned=true` declaration (recorded as DECLARED, never as observed), or choose `relayRoute=successor` to continue in an isolated world"
              : "this host observed no worker invocation for the attempt, so its world may still have a writer. A same-world takeover needs an explicit `declareExecutorAbandoned=true` declaration (recorded as DECLARED, never as observed), or choose `relayRoute=successor` to continue in an isolated world",
          );
        }
        const declaration = observedExit
          ? { declaredAt: new Date().toISOString(), declaredBy: "PRINCIPAL" as const, livenessBasis: "OBSERVED_EXIT" as const }
          : { declaredAt: new Date().toISOString(), declaredBy: "PRINCIPAL" as const, livenessBasis: "DECLARED_ABANDONED" as const };
        try {
          const settled = await deps.controller.settleMutatingWork({
            attemptId,
            workerOutcome: { kind: "READY_FOR_SETTLEMENT", ...(input.summary === undefined ? {} : { detail: input.summary }) },
            observation: {
              path: "PRINCIPAL",
              takeover: declaration,
              ...(input.acknowledgeInputs === true ? { acknowledgeInputs: true } : {}),
            },
          });
          if (settled.state !== "SETTLED") {
            return {
              ...refused(`${settled.state}: ${settled.detail}`),
              state: "NOT_READY" as const,
              resultCommit: settled.state === "BASE_DRIFT" ? settled.resultCommit : null,
            };
          }
          deps.controller.step();
          await recordRelay(deps, attemptId, settled.resultCommit, settled.attribution);
          return {
            state: "TAKEOVER_SETTLED" as const,
            taskId: input.taskId,
            route: "takeover" as const,
            attemptId,
            detail:
              `${settled.detail} — the product observed the attempt's world and recorded ${settled.attribution.attribution} ` +
              `(liveness ${settled.attribution.liveness}); independenceEligible=${String(settled.attribution.independenceEligible)}. ` +
              "This is a settlement, not an acceptance or a promotion",
            resultCommit: settled.resultCommit,
            changedFiles: settled.changedFiles,
            attribution: settled.attribution,
            retainedWorldPath: null,
            reuse: null,
            inputsNotInBasis: settled.inputsNotInBasis,
            inputsState: settled.inputsState,
            inputsDetail: settled.inputsDetail,
            taskState: null,
          };
        } catch (error) {
          return refused(error instanceof Error ? error.message : String(error));
        }
      }

      /**
       * SUCCESSOR: close the unobserved/unconfirmed attempt and hand back the retained world's
       * path-level reuse facts. The next `delegate` opens a NEW attempt in a NEW world at the same
       * basis, so no second process is ever pointed at the old world.
       *
       * PWRS-E: a successor is a NEW basis decision, so it is held to the same unseen-input fact as
       * a settlement. The caller must acknowledge the paths first; the acknowledgement is a
       * declaration, not a content judgement.
       */
      const baseCommit = deps.controller.attemptWorkRecord(attemptId)?.envelope?.base_commit ?? "";
      const repositoryPath = deps.controller.effects.git.repository;
      const inputObservation =
        baseCommit === "" || repositoryPath === undefined
          ? null
          : observeProjectInputs({ repository: repositoryPath, baseCommit });
      const unseen: readonly string[] = Object.freeze(inputObservation?.inputs.map((entry) => entry.path) ?? []);
      if (unseen.length > 0 && input.acknowledgeInputs !== true) {
        return {
          ...refused(
            `INPUTS_CHANGED_SINCE_BASIS: the project holds inputs this attempt's base never contained: ${unseen.join(", ")} — ` +
              "read them first; if a new attempt should proceed on that basis, call again with acknowledgeInputs=true",
          ),
          inputsNotInBasis: unseen,
        };
      }
      const retained = relaySourceFacts(deps.controller, attemptId);
      try {
        deps.controller.report(attemptId, {
          workerStatus: "cancelled",
          summary: input.summary ?? "closed as a successor: the previous executor is not observed and a new world continues the work",
        });
        deps.controller.step();
      } catch (error) {
        return refused(error instanceof Error ? error.message : String(error));
      }
      const after = deps.controller.status() as { tasks?: Array<{ task_id: string; state: string }> };
      const taskState = (after.tasks ?? []).find((task) => task.task_id === input.taskId)?.state ?? null;
      if (deps.executionRelay !== undefined) {
        try {
          await deps.executionRelay.record({
            taskId: input.taskId,
            attemptId,
            baseCommit: retained.resultRevision ?? "",
            resultCommit: retained.resultRevision ?? "",
            attribution: {
              schema: "pc1-execution-attribution/v1" as const,
              attribution: "UNATTRIBUTED" as const,
              executor: "UNKNOWN" as const,
              settledBy: "PRINCIPAL" as const,
              workerInvocations: invocations.filter((invocation) => invocation.outcome === "ENDED").length,
              matchedInvocationId: null,
              liveness: "DECLARED_ABANDONED" as const,
              independenceEligible: false,
              evidence: "DECLARED" as const,
              detail:
                "the principal closed this attempt as a SUCCESSOR because no writer was observed; the retained world stays available for reuse, and no result was settled or accepted",
            },
          });
        } catch {
          /* the canonical cancellation stands; the derived record is best-effort */
        }
      }
      return {
        state: "SUCCESSOR_READY" as const,
        taskId: input.taskId,
        route: "successor" as const,
        attemptId,
        detail:
          `the attempt was closed as a successor (task is ${taskState ?? "unknown"}); the retained world is ${retained.worldPath ?? "not observable"} ` +
          `and its work is at ${(retained.resultRevision ?? "").slice(0, 12) || "no commit"}. ` +
          "Inherit only the paths the facts show as unaffected or already present, re-derive anything conflicted, then delegate the new attempt",
        resultCommit: null,
        changedFiles: Object.freeze([]),
        attribution: null,
        retainedWorldPath: retained.worldPath,
        reuse: retained.facts,
        inputsNotInBasis: unseen,
        inputsState: inputObservation?.state ?? ("UNAVAILABLE" as const),
        inputsDetail:
          inputObservation?.detail ?? "no repository is observable for this deployment, so current inputs are UNKNOWN",
        taskState,
      };
    },
  };
}
