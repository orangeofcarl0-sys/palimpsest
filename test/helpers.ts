import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { canonicalDigest } from "../src/schema/index.js";
import type { AttemptReport, ProjectIr, TaskSpec } from "../src/schema/index.js";
import { TaskPolicy } from "../src/domain/policy.js";
import { Scheduler } from "../src/scheduler/index.js";
import { EventStore } from "../src/state/index.js";

const COMMIT = "c".repeat(40);

/**
 * FakeClock equivalent of the Python conftest: returns the current instant,
 * then advances by 1s. The first call (consumed by migration applied_at) is
 * 00:00:00, so the first event is committed at 00:00:01 — exactly matching
 * the frozen fixture clock.
 */
export class FakeClock {
  #seconds = 0;

  /** Arrow property: auto-bound so a detached reference can be passed as a clock. */
  next = (): string => {
    const value = new Date(Date.UTC(2026, 7, 13, 0, 0, this.#seconds)).toISOString();
    this.#seconds += 1;
    return value;
  };
}

/** Same construction as Python conftest.make_project. */
export function makeProject(taskSpecs: readonly TaskSpec[], projectId = "scheduler-project"): ProjectIr {
  const data = {
    schema_version: 1 as const,
    project_id: projectId,
    revision: 0,
    parent_revision: null,
    parent_digest: null,
    goal: "Prove deterministic scheduler semantics.",
    requirements: [],
    decisions: [],
    tasks: [...taskSpecs],
    head_commit: COMMIT,
    committed_at: "2026-08-13T00:00:00Z",
  };
  return {
    ...data,
    digest: canonicalDigest({ ...data, committed_at: "2026-08-13T00:00:00.000000Z" }),
  } as ProjectIr;
}
export function taskSpec(taskId = "task-1", dependsOn: readonly string[] = []): TaskSpec {
  return {
    task_id: taskId,
    objective: `Complete ${taskId}.`,
    depends_on: [...dependsOn],
    write_paths: [`src/${taskId}.py`],
    required_artifacts: [`src/${taskId}.py`],
  };
}

export function trustedDefaultPolicy(
  override: Partial<ConstructorParameters<typeof TaskPolicy>[0]> = {},
): TaskPolicy {
  return new TaskPolicy({
    policy_id: "trusted-default",
    read_paths: ["src"],
    allowed_commands: [{ executable: "python", argv_prefix: ["-m", "pytest"] }],
    network_policy: "deny",
    network_allowlist: [],
    timeout_s: 60,
    lease_s: 10,
    attempt_limit: 2,
    candidate_limit: 1,
    ...override,
  });
}

export interface FixtureSetup {
  store: EventStore;
  clock: FakeClock;
  scheduler: Scheduler;
  project: ProjectIr;
}

/** Create EventStore + project + policy-registered Scheduler (Python setup_scheduler). */
export function setupScheduler(
  store: EventStore,
  project: ProjectIr,
  taskPolicy: TaskPolicy,
): Scheduler {
  createProject(store, project);
  const scheduler = new Scheduler(store, project.project_id);
  scheduler.registerPolicy(taskPolicy);
  return scheduler;
}

export function createProjectRequest(project: ProjectIr): Record<string, unknown> {
  return {
    schema_version: 1,
    project_id: project.project_id,
    event_type: "PROJECT_CREATED",
    payload_version: 1,
    entity_type: "project",
    entity_id: project.project_id,
    payload: { project_ir: project },
    causation_id: null,
    correlation_id: "scheduler-project-create",
    idempotency_key: canonicalDigest({
      purpose: "scheduler-project-create",
      project: project.project_id,
    }),
    expected_project_revision: null,
  };
}

function createProject(store: EventStore, project: ProjectIr): void {
  store.append(createProjectRequest(project) as never);
}

/** Same shape as the Python conftest.make_report. */
export function makeReport(
  store: EventStore,
  attemptId: string,
  workerStatus: AttemptReport["worker_status"],
): AttemptReport {
  const attempt = store.connection
    .prepare("SELECT * FROM attempts WHERE attempt_id=?")
    .get(attemptId) as { project_id: string; task_id: string } | undefined;
  if (attempt === undefined) throw new Error("attempt does not exist");
  const task = store.connection
    .prepare("SELECT envelope_json FROM tasks WHERE project_id=? AND task_id=?")
    .get(attempt.project_id, attempt.task_id) as { envelope_json: Uint8Array } | undefined;
  if (task === undefined) throw new Error("task does not exist");
  const envelope = JSON.parse(new TextDecoder().decode(task.envelope_json)) as {
    envelope_id: string;
    project_revision: number;
    project_digest: string;
    base_commit: string;
  };
  const completed = workerStatus === "completed";
  return {
    schema_version: 1,
    project_id: attempt.project_id,
    attempt_id: attemptId,
    task_id: attempt.task_id,
    envelope_id: envelope.envelope_id,
    input_project_revision: envelope.project_revision,
    input_project_digest: envelope.project_digest,
    base_commit: envelope.base_commit,
    worktree_id: `worktree-${attemptId.slice(-8)}`,
    result_commit: completed ? COMMIT : null,
    worker_status: workerStatus,
    summary: `mock ${workerStatus}`,
    changed_files: [],
    produced_artifacts: [],
    started_at: "2026-08-13T00:00:00Z",
    finished_at: "2026-08-13T00:00:01Z",
    runtime_metadata: {
      runner: "phase2-mock",
      runner_version: "1",
      argv: ["mock", workerStatus],
      exit_code: completed ? 0 : 1,
      duration_ms: 1,
      environment_digest: "e".repeat(64),
      stdout_artifact: null,
      stderr_artifact: null,
    },
  };
}

export function tempStatePath(): string {
  const directory = mkdtempSync(join(tmpdir(), "palimpsest-p1-"));
  return join(directory, "palimpsest.db");
}
