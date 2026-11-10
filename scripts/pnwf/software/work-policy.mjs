import { checkScope, revisionResult, SCOPE, SCOPE_GUIDANCE } from "./contract.mjs";

const SCOPE_ERROR = "SOFTWARE_REVISION_SCOPE_MISMATCH";
const refusal = reason => ({ state: "REFUSED", reason, detail: reason + ". " + SCOPE_GUIDANCE });
const valid = (paths, required) => {
  try {
    checkScope(paths);
    return required === undefined || (Array.isArray(required) && required.every(path => SCOPE.includes(path)));
  } catch {
    return false;
  }
};

export function guardSoftwareWork(definition, controller) {
  return {
    ...definition,
    description: definition.description + " " + SCOPE_GUIDANCE +
      " For delegated Work jobs, use action=workers to inspect settlementReason and settlementDetail.",
    async execute(input, context) {
      if (input?.action === "plan" && Array.isArray(input.tasks) &&
          input.tasks.some(task => !valid(task?.write_paths, task?.required_artifacts))) return refusal(SCOPE_ERROR);
      if (input?.action === "begin" && !valid(input.writePaths, input.requiredArtifacts)) return refusal(SCOPE_ERROR);
      if (["delegate", "next", "run"].includes(input?.action)) {
        const tasks = controller().work.project().tasks;
        if (tasks.some(task => (input.action !== "delegate" || !input.taskId || input.taskId === task.task_id) &&
            !valid(task.write_paths, task.required_artifacts))) return refusal(SCOPE_ERROR);
      }
      return definition.execute(input, context);
    },
  };
}

export function guardSoftwareSettlement(controller) {
  const settle = controller.settleMutatingWork.bind(controller);
  controller.settleMutatingWork = async input => {
    if (input.workerOutcome.kind !== "READY_FOR_SETTLEMENT") return settle(input);
    const { attemptId } = input;
    const record = controller.attemptWorkRecord(attemptId);
    if (record?.state !== "RUNNING") return settle(input);
    const scope = record.envelope?.write_paths;
    const refused = reason => ({ ...refusal(reason), state: "NOT_READY", attemptId });
    if (!valid(scope)) return refused(SCOPE_ERROR);
    const observed = controller.observeAttemptResult(attemptId, record.envelope.base_commit);
    if (!observed) return settle(input);
    try {
      revisionResult(observed.workDir, record.envelope.base_commit, observed.observedHead, scope);
    } catch (error) {
      return refused(error.message);
    }
    // Canonical settlement independently re-observes the world, including dirty state and scope.
    return settle({ ...input, observation: { path: "WORKER", ...input.observation, expectedResultCommit: observed.observedHead } });
  };
}
