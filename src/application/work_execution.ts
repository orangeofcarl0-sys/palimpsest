/**
 * SR-1 §26 / ODPE — the work EXECUTION methods.
 *
 * Observation and transport, not settlement: start a real worker, report what this host can see,
 * request a stop (a request is not an observation), inspect a delivered result and choose a
 * continuation route. None of these accepts or promotes anything.
 */
import type { WorkApplicationSurface, WorkRuntimeDeps } from "./work_contract.js";
import { observeProjectInputs } from "../work/unseen_inputs.js";

export function makeWorkExecutionSurface(
  deps: WorkRuntimeDeps,
): Pick<WorkApplicationSurface, "startWorker" | "stopWorker" | "workers" | "results" | "continueResult"> {
  return {
    startWorker: async (input) => {
      if (deps.workDelegation === undefined) {
        return {
          state: "UNAVAILABLE" as const,
          taskId: input?.taskId ?? null,
          jobId: null,
          resumed: false,
          detail:
            "this deployment composes no work-worker transport, so no real worker can start; the canonical Work path remains available",
        };
      }
      try {
        const started = await deps.workDelegation.start(
          input?.taskId === undefined ? {} : { expectedTaskId: input.taskId },
        );
        /**
         * Do not return until the POSITION is canonical (or the job already failed). This is what
         * makes two sequential `delegate` calls deterministic: the first task is ACTIVE before the
         * scheduler is asked for the next one. It still returns while the worker RUNS — the wait is
         * bounded preparation observation, never completion.
         */
        for (let attempt = 0; attempt < 600; attempt += 1) {
          const current = (await deps.workDelegation.jobs()).find((job) => job.jobId === started.jobId);
          if (current === undefined) break;
          if (current.phase === "HOST_ERROR") {
            return {
              state: "REFUSED" as const,
              taskId: current.taskId,
              jobId: current.jobId,
              resumed: started.resumed,
              detail: current.hostError ?? "the worker host failed before the execution position became observable",
            };
          }
          if (current.attemptId !== null) {
            return {
              state: "STARTED" as const,
              taskId: current.taskId,
              jobId: current.jobId,
              resumed: started.resumed,
              detail:
                current.phase === "FINISHED"
                  ? "the worker finished and the product settled its result before this reply"
                  : `the execution position is prepared and the worker is ${current.phase}; the task is canonical before this reply`,
            };
          }
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
        return {
          state: "STARTED" as const,
          taskId: started.taskId,
          jobId: started.jobId,
          resumed: started.resumed,
          detail: `${started.detail} (this reply did not observe the prepared position within its bounded wait)`,
        };
      } catch (error) {
        return {
          state: "REFUSED" as const,
          taskId: input?.taskId ?? null,
          jobId: null,
          resumed: false,
          detail: error instanceof Error ? error.message : String(error),
        };
      }
    },
    workers: async () => {
      const status = deps.controller.status() as {
        attempts?: Array<{ attempt_id: string; task_id: string | null; state: string; orphaned?: boolean; task_state?: string }>;
        tasks?: Array<{ task_id: string; state: string }>;
      };
      const taskStates = new Map((status.tasks ?? []).map((task) => [task.task_id, task.state]));
      const jobs = deps.workDelegation === undefined ? [] : await deps.workDelegation.jobs();
      const activeJobs = jobs.filter((job) => job.phase === "QUEUED" || job.phase === "RUNNING");
      const attempts = (status.attempts ?? []).map((attempt) => {
        let worldPath: string | null = null;
        let worldHead: string | null = null;
        let dirty = false;
        try {
          const observed = deps.controller.observeAttemptResult(attempt.attempt_id);
          worldPath = observed?.workDir ?? null;
          worldHead = observed?.observedHead ?? null;
          dirty = (observed?.uncommittedChanges.length ?? 0) > 0;
        } catch {
          worldPath = null;
        }
        let resultCommit: string | null = null;
        try {
          resultCommit = deps.controller.promotions.canonicalAttemptResultCommit(attempt.attempt_id);
        } catch {
          resultCommit = null;
        }
        const historical = ["COMPLETED", "FAILED", "CANCELLED", "EXPIRED", "STALE"].includes(attempt.state);
        const baseCommit = deps.controller.attemptWorkRecord(attempt.attempt_id)?.envelope?.base_commit ?? "";
        const repositoryPath = deps.controller.effects.git.repository;
        const inputObservation =
          baseCommit === "" || repositoryPath === undefined
            ? null
            : observeProjectInputs({ repository: repositoryPath, baseCommit });
        return {
          taskId: attempt.task_id,
          state: attempt.state,
          taskState: attempt.task_state ?? (attempt.task_id === null ? null : taskStates.get(attempt.task_id) ?? null),
          orphaned: attempt.orphaned === true,
          hostObserved:
            attempt.task_id !== null && activeJobs.some((job) => job.taskId === attempt.task_id),
          worldPath,
          worldState: historical ? ("HISTORICAL" as const) : ("LIVE" as const),
          worldHead,
          worldMovedAfterResult: historical && (dirty || resultCommit === null || worldHead !== resultCommit),
          resultCommit,
          inputsNotInBasis: Object.freeze(inputObservation?.inputs.map((entry) => entry.path) ?? []),
          inputsState: inputObservation?.state ?? ("UNAVAILABLE" as const),
          inputsDetail:
            inputObservation?.detail ?? "no repository is observable for this deployment, so current inputs are UNKNOWN",
        };
      });
      return {
        placement: deps.controller.execution,
        jobs: jobs.map((job) => ({
          jobId: job.jobId,
          taskId: job.taskId,
          phase: job.phase,
          settlementState:
            typeof job.settlement === "object" && job.settlement !== null && "state" in job.settlement
              ? String((job.settlement as { state: unknown }).state)
              : null,
          hostError: job.hostError,
          stopRequested: job.stopRequested,
        })),
        attempts,
        detail:
          deps.workDelegation === undefined
            ? "no worker transport is composed in this deployment; only canonical attempt state is observable"
            : "host jobs are local to THIS process and are not durable; a canonical attempt with no active job is NOT proven to be running",
      };
    },
    stopWorker: async (input) => {
      if (deps.workDelegation === undefined) {
        return { state: "UNAVAILABLE" as const, taskId: input.taskId, detail: "this deployment composes no work-worker transport" };
      }
      const stopped = await deps.workDelegation.stop({ taskId: input.taskId });
      return { state: stopped.state, taskId: stopped.taskId === "" ? input.taskId : stopped.taskId, detail: stopped.detail };
    },
    results: async (input) => {
      if (deps.continuation === undefined) {
        return {
          state: "UNAVAILABLE" as const,
          results: [],
          detail: "this deployment composes no result-continuation authority, so no result can be inspected",
        };
      }
      const status = deps.controller.status() as {
        attempts?: Array<{ attempt_id: string; task_id: string | null; state: string }>;
        tasks?: Array<{ task_id: string; state: string }>;
      };
      const taskStates = new Map((status.tasks ?? []).map((task) => [task.task_id, task.state]));
      const latest = new Map<string, string>();
      for (const attempt of status.attempts ?? []) {
        if (attempt.state !== "COMPLETED" || attempt.task_id === null) continue;
        latest.set(attempt.task_id, attempt.attempt_id);
      }
      const taskIds =
        input?.taskId === undefined
          ? [...latest.keys()].sort()
          : latest.has(input.taskId)
            ? [input.taskId]
            : [];
      const results = taskIds.map((taskId) => {
        const attemptId = latest.get(taskId)!;
        const inspection = deps.continuation!.inspect({
          result: { kind: "ATTEMPT_RESULT" as const, ref: attemptId },
        });
        let resultCommit: string | null = null;
        try {
          resultCommit = deps.controller.promotions.canonicalAttemptResultCommit(attemptId);
        } catch {
          resultCommit = null;
        }
        return {
          taskId,
          taskState: taskStates.get(taskId) ?? null,
          resolved: inspection.resolved,
          compatibility: inspection.compatibility.outcome,
          currentness: inspection.assessment?.currentness ?? null,
          exactCurrent: inspection.assessment?.reuse.exactCurrent ?? false,
          actions: inspection.availableActions,
          assessmentDigest: inspection.assessment?.assessmentDigest ?? null,
          resultCommit: inspection.resultCommit ?? resultCommit,
          reuse: inspection.reuse ?? null,
          detail: inspection.detail,
        };
      });
      return {
        state: "OK" as const,
        results,
        detail:
          results.length === 0
            ? "no COMPLETED attempt result exists for that task in this project"
            : "each result is historical until an authorized Promotion accepts it; the digest is the freshness fence for a continuation route",
      };
    },
    continueResult: async (input) => {
      if (deps.continuation === undefined) {
        return {
          state: "UNAVAILABLE" as const,
          taskId: input.taskId,
          detail: "this deployment composes no result-continuation authority",
          candidateRef: null,
          jobId: null,
        };
      }
      const status = deps.controller.status() as {
        attempts?: Array<{ attempt_id: string; task_id: string | null; state: string }>;
      };
      const completed = (status.attempts ?? []).filter(
        (attempt) => attempt.task_id === input.taskId && attempt.state === "COMPLETED",
      );
      const latest = completed[completed.length - 1];
      if (latest === undefined) {
        return {
          state: "REFUSED" as const,
          taskId: input.taskId,
          detail: "this task has no COMPLETED attempt result to continue",
          candidateRef: null,
          jobId: null,
        };
      }
      const result = { kind: "ATTEMPT_RESULT" as const, ref: latest.attempt_id };
      try {
        if (input.route === "rematerialize") {
          const outcome = await deps.continuation.rematerialize({
            result,
            expectedAssessmentDigest: input.expectedAssessmentDigest,
          });
          return {
            state: outcome.state,
            taskId: outcome.taskId === "" ? input.taskId : outcome.taskId,
            detail: outcome.detail,
            candidateRef: outcome.candidateRef,
            jobId: null,
          };
        }
        const outcome = await deps.continuation.startRework({
          result,
          expectedAssessmentDigest: input.expectedAssessmentDigest,
        });
        return {
          state: outcome.state,
          taskId: outcome.taskId === "" ? input.taskId : outcome.taskId,
          detail: outcome.detail,
          candidateRef: null,
          jobId: outcome.jobId,
        };
      } catch (error) {
        return {
          state: "REFUSED" as const,
          taskId: input.taskId,
          detail: error instanceof Error ? error.message : String(error),
          candidateRef: null,
          jobId: null,
        };
      }
    },
  };
}
