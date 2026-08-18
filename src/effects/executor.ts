/**
 * Attempt executor abstraction.
 *
 * A TaskEnvelope is claimed by an executor, executed in an isolated
 * worktree, and reported back as an AttemptReport whose claims are never
 * treated as Evidence (docs/01 §2). P1 ships three pluggable executors under
 * one interface, matching the revival decision: claim/report first, with the
 * command executor as the deterministic gate path.
 */

import type { AttemptReport, ProjectIr, TaskEnvelope } from "../schema/index.js";

export interface AttemptContext {
  readonly attemptId: string;
  readonly project: ProjectIr;
  readonly envelope: TaskEnvelope;
  /** Stable, resolvable path of the isolated worktree. */
  readonly worktreePath: string;
}

export interface AttemptExecution {
  readonly workerStatus: AttemptReport["worker_status"];
  readonly summary: string;
  readonly changedFiles: readonly string[];
  readonly producedArtifacts: readonly string[];
}

export interface AttemptExecutor {
  readonly kind: "claim-report" | "command" | "mock";
  /**
   * Claim the envelope for this attempt and execute it. For
   * claim-report executors this is the point the host (or sub-)agent takes
   * over; for command executors it runs the gate-deterministic path.
   */
  execute(context: AttemptContext): Promise<AttemptExecution>;
  /** Abort/handoff on lease expiry or cancellation (no-op default). */
  dispose?(): Promise<void> | void;
}

/** Deterministic fake used by tests and the scheduler parity suite. */
export class MockExecutor implements AttemptExecutor {
  readonly kind = "mock" as const;
  readonly #outcome: AttemptExecution;

  constructor(
    outcome: Partial<AttemptExecution> & { workerStatus: AttemptReport["worker_status"] },
  ) {
    this.#outcome = {
      summary: `mock ${outcome.workerStatus}`,
      changedFiles: [],
      producedArtifacts: [],
      ...outcome,
    };
  }

  async execute(context: AttemptContext): Promise<AttemptExecution> {
    void context;
    return this.#outcome;
  }
}

/**
 * Claim/report protocol executor. The scheduler claims a task, hands the
 * worktree to an external (DSH host) agent via callbacks, and waits for the
 * submitted AttemptReport. The report is exactly what the agent returned —
 * the scheduler and gates decide whether it may be accepted.
 */
export class ClaimReportExecutor implements AttemptExecutor {
  readonly kind = "claim-report" as const;
  readonly #onClaim: (context: AttemptContext) => void;
  readonly #onReport: (context: AttemptContext) => Promise<AttemptReport>;

  constructor(options: {
    onClaim?: (context: AttemptContext) => void;
    onReport: (context: AttemptContext) => Promise<AttemptReport>;
  }) {
    this.#onClaim = options.onClaim ?? (() => undefined);
    this.#onReport = options.onReport;
  }

  async execute(context: AttemptContext): Promise<AttemptExecution> {
    this.#onClaim(context);
    const report = await this.#onReport(context);
    return {
      workerStatus: report.worker_status,
      summary: report.summary,
      changedFiles: report.changed_files,
      producedArtifacts: report.produced_artifacts,
    };
  }
}

/** Runs the allowed gate command inside the worktree. */
export class CommandExecutor implements AttemptExecutor {
  readonly kind = "command" as const;
  readonly #git: {
    runGate(input: {
      worktreeId: string;
      executable: string;
      argv: readonly string[];
    }): Promise<{ exitCode: number | null }>;
  };

  constructor(git: {
    runGate(input: {
      worktreeId: string;
      executable: string;
      argv: readonly string[];
    }): Promise<{ exitCode: number | null }>;
  }) {
    this.#git = git;
  }

  async execute(context: AttemptContext): Promise<AttemptExecution> {
    const command = context.envelope.allowed_commands[0];
    if (command === undefined) {
      return {
        workerStatus: "completed",
        summary: "no gate command configured; accepted by policy",
        changedFiles: [],
        producedArtifacts: context.envelope.required_artifacts,
      };
    }
    const result = await this.#git.runGate({
      worktreeId: context.attemptId,
      executable: command.executable,
      argv: command.argv_prefix,
    });
    const passed = result.exitCode === 0;
    return {
      workerStatus: passed ? "completed" : "failed",
      summary: `${command.executable} ${command.argv_prefix.join(" ")} → exit ${String(result.exitCode)}`,
      changedFiles: [],
      producedArtifacts: context.envelope.required_artifacts,
    };
  }
}
