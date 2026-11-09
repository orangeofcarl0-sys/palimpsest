/** The experiment's Work tool policy. The default product tool is unchanged. */
import { setTimeout as delay } from "node:timers/promises";
import { requireRevisionScope, REVISION_SCOPE_INSTRUCTIONS } from "./revision-scope.mjs";

export const REVISION_WORKER_WAIT_MS = 45_000;
const isActive = job => job?.phase === "QUEUED" || job?.phase === "RUNNING";
export const SETTLED_GUIDANCE = 'Worker settled. Call palimpsest_work with action "run", maxSteps 8. When the task is VERIFYING, record conclude WAIT_FOR_OPERATOR and end the session.';

async function observeWorker(execute, input, context, waitMs, pollMs) {
  let view = await execute(input, context);
  const jobs = view.jobs?.filter(job => input.taskId === undefined || job.taskId === input.taskId) ?? [];
  let job = jobs.find(isActive) ?? jobs.at(-1);
  if (!job) return view;
  const { jobId } = job;
  const deadline = performance.now() + waitMs;
  while (isActive(job) && performance.now() < deadline) {
    await delay(Math.min(pollMs, Math.max(0, deadline - performance.now())), undefined, { signal: context?.signal });
    view = await execute(input, context);
    job = view.jobs?.find(entry => entry.jobId === jobId);
  }
  if (job?.phase === "FINISHED" && job.settlementState === "SETTLED") return { ...view, guidance: SETTLED_GUIDANCE };
  if (isActive(job)) return { ...view, guidance: 'Worker is still active. Use palimpsest_work action "workers" to wait again.' };
  return view;
}

export function guardRevisionWork(definition, currentTasks, { waitMs = REVISION_WORKER_WAIT_MS, pollMs = 1_000 } = {}) {
  const execute = definition.execute.bind(definition);
  return {
    ...definition,
    timeoutMs: Math.max(definition.timeoutMs ?? 0, waitMs + 15_000),
    description: `${definition.description} For this revision, ${REVISION_SCOPE_INSTRUCTIONS} The workers action waits up to ${waitMs / 1_000} seconds for the observed job to settle, without another model request.`,
    async execute(input, context) {
      if (input?.action === "plan" && Array.isArray(input.tasks)) {
        for (const task of input.tasks) requireRevisionScope(task?.write_paths);
      }
      if (input?.action === "delegate" || input?.action === "run") {
        for (const task of currentTasks()) requireRevisionScope(task.write_paths);
      }
      if (input?.action === "workers") return observeWorker(execute, input, context, waitMs, pollMs);
      return execute(input, context);
    },
  };
}
