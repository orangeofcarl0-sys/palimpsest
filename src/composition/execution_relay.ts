/**
 * PWRS-A — the DURABLE execution-relay record, written through the existing project journal.
 *
 * WHY THE JOURNAL. A settlement attribution must survive the host that observed it, and the repo
 * already has exactly one durable, derived, per-project record that survives sessions: the project
 * journal. It carries contribution records, decisions and episode conclusions the same way — as an
 * ordinary `REFERENCE_NOTE` with one structured marker. Creating a second table (an authorship
 * ledger, a result store) would duplicate an owner the product already has.
 *
 * WHAT IT IS NOT. A journal note is derived and advisory. It cannot settle an attempt, accept a
 * result or promote anything; the canonical attempt report remains the Work record. The note exists
 * so the NEXT principal can see which execution window the product observed — including the honest
 * `UNATTRIBUTED` case after a restart.
 *
 * Layer: composition (it wires the workspace to the Work settlement result).
 */
import type { ProjectWorkspaceService } from "../project_workspace/index.js";
import {
  executionRelayBody,
  makeExecutionRelayRecord,
  type ExecutionAttribution,
} from "../work/execution_relay.js";

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
