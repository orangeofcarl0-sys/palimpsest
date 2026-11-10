import { DomainValidationError } from "../domain/index.js";
import type { AttemptReport, EventType, SchedulerEvent, TaskEnvelope } from "../schema/index.js";
import { revisionError, workRevisionBinding, type WorkRevisionReceipt } from "../schema/work_revision.js";
import { inspectWorkRevision, requireWorkRevision } from "./revision.js";

interface ReportObservation {
  readonly placement: string;
  readonly workDir: string;
  readonly observedHead: string;
  readonly changedFiles: readonly string[];
  readonly uncommittedChanges: readonly string[];
}

/** Observed Git facts replace the callback's claims before the canonical append. */
export function recordWorkReport<Input extends {
  workerStatus: AttemptReport["worker_status"];
  resultCommit?: string | null | undefined;
  changedFiles?: readonly string[] | undefined;
}>(ports: {
  readonly state: unknown;
  readonly observe: () => ReportObservation | null;
  readonly basisCurrent: () => boolean;
  readonly assertMaterialized: (paths: readonly string[]) => void;
  readonly assertHasWork: (paths: readonly string[]) => void;
  readonly exportResult: (commit: string) => string;
  readonly build: (input: Input) => AttemptReport;
  readonly record: (type: EventType, report: AttemptReport) => SchedulerEvent;
  readonly replay: (expected?: string) => SchedulerEvent;
}, attemptId: string, envelope: TaskEnvelope, input: Input, expectedResultCommit?: string): SchedulerEvent {
  const binding = input.workerStatus === "completed" ? workRevisionBinding(envelope, attemptId) : undefined;
  if (binding && ports.state === "COMPLETED") {
    return ports.replay(expectedResultCommit ?? input.resultCommit ?? undefined);
  }
  let receipt: WorkRevisionReceipt | undefined;
  const terminal: Record<AttemptReport["worker_status"], EventType> = {
    completed: "ATTEMPT_COMPLETED",
    failed: "ATTEMPT_FAILED",
    cancelled: "ATTEMPT_CANCELLED",
    expired: "ATTEMPT_EXPIRED",
  };
  // The product observes the tree itself, synchronously, whatever the execution PLACEMENT is. The
  // caller's changed_files and result_commit are overwritten by what `git status`/HEAD actually
  // say, so the report records an observation, not a claim — the SAME rule for an in-place attempt
  // and for one that ran in its own isolated worktree (§D2-a). The envelope's write_paths are then
  // the CONTRACT the observation is checked against: an out-of-scope change fails here, at the
  // moment it can be named, instead of surfacing later as a gate that can only count evidence
  // atoms.
  const observed = ports.observe();
  if (binding) {
    if (!observed || (expectedResultCommit !== undefined && observed.observedHead !== expectedResultCommit)) {
      throw revisionError("RESULT_DRIFT", "Re-observe the candidate before writing its completion report.",
        "REOBSERVE", [], observed?.observedHead || null);
    }
    if (!ports.basisCurrent()) {
      throw revisionError("BASE_DRIFT", "Replan from the current accepted basis.", "REOBSERVE", [], observed.observedHead);
    }
    const preview = inspectWorkRevision(observed.workDir, binding, observed.observedHead);
    requireWorkRevision(preview);
    receipt = { ...preview, phase: "SETTLED" };
  }
  if (observed !== null) {
    const scope = envelope.write_paths;
    const outOfScope = observed.changedFiles.filter(
      (path) => !scope.some((allowed) => path === allowed || path.startsWith(`${allowed}/`)),
    );
    if (outOfScope.length > 0) {
      throw new DomainValidationError(
        `${observed.placement} attempt ${attemptId} changed paths outside the task envelope's write_paths [${scope.join(", ")}]: ${outOfScope.join(", ")} — revert them or revise the plan with palimpsest_plan`,
      );
    }
    // §2.6: a COMPLETED attempt must have materialized its work as a commit, in EITHER placement.
    // Only completion is held to this — a failed or cancelled attempt is allowed to stop
    // mid-edit, and its report is still worth observing.
    if (input.workerStatus === "completed") {
      ports.assertMaterialized(observed.uncommittedChanges);
      // §3.3: and it must have left observable work at all. Enforced HERE, on the report path, so
      // the automatic pump cannot mint the zero-work COMPLETED attempt that `finish` refuses —
      // which is exactly what the 2A live gate measured it doing.
      ports.assertHasWork(observed.changedFiles);
    }
    input = {
      ...input,
      changedFiles: observed.changedFiles,
      // The observed HEAD is the tree's result commit: a placed worktree starts at the base and
      // moves only when the worker commits inside it.
      ...(observed.observedHead === "" ? {} : { resultCommit: observed.observedHead }),
    };
    if (input.workerStatus === "completed" && observed.observedHead !== "") {
      input = {
        ...input,
        resultCommit: ports.exportResult(observed.observedHead),
      };
    }
  }
  if (receipt) {
    const final = ports.observe();
    if (input.resultCommit !== receipt.candidate || final?.observedHead !== receipt.candidate ||
        final.uncommittedChanges.length > 0 || !ports.basisCurrent()) {
      throw revisionError("RESULT_DRIFT", "The world changed before the validated candidate could be recorded.", "REOBSERVE",
        final?.uncommittedChanges ?? [], final?.observedHead || null);
    }
  }
  const report = { ...ports.build(input), ...(receipt ? { revision_receipt: receipt } : {}) };
  return ports.record(terminal[input.workerStatus], report);

}

export function replayWorkReport(event: SchedulerEvent | undefined, observed: string | undefined, expected?: string): SchedulerEvent {
  const receipt = (event?.payload.attempt_report as AttemptReport | undefined)?.revision_receipt;
  if (!event || !receipt || (expected ?? (observed || receipt.candidate)) !== receipt.candidate) {
    throw revisionError("RESULT_ALREADY_RECORDED", "Read the existing receipt or start a new Attempt for a different commit.",
      "REOBSERVE", [], expected ?? (observed || null));
  }
  return event;
}
