/**
 * PLMP-LEAN-1 §D5-b — the TASK LIFECYCLE AUDIT, as machine proofs.
 *
 * The review made this audit D5-b's first step, with one stop condition attached:
 *
 *   if `TASK_REAUTHORIZED` cannot honestly express "the same Work re-executed on the current basis", AND a
 *   new canonical lifecycle event would be required, STOP before adding one.
 *
 * The audit's answer is NEGATIVE, and the reason is deeper than the review anticipated. These tests pin the
 * three measured facts, so a later slice cannot quietly build rework on a foundation that violates D5 §1.
 *
 *   A  TASK_REAUTHORIZED refuses a VERIFYING task — measured against the real aggregate validator
 *   B  that refusal is LOAD-BEARING, not incidental: the envelope is bound per TASK, not per ATTEMPT
 *   C  therefore rebinding a task's envelope DESTROYS a historical attempt's verifiability
 *   D  the state machine already permits `verifying → ready`; only the DECLARED graph lacks it — so the
 *      tempting minimal fix (declare the transition, then reauthorize) is available and WOULD violate C
 *
 * The consequence is stated in the appendix rather than encoded here: rework needs an attempt-scoped
 * envelope binding, which is an architecture change to the attempt record rather than a new event type.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, describe, expect, it } from "vitest";

import { installPalimpsest, trustedDefaultPolicy } from "../src/install.js";
import { GitCliPort } from "../src/effects/index.js";
import { makeWorkDelegationService } from "../src/interaction/work_delegation.js";
import { firstPartyAttemptResultVerificationSource } from "../src/project_verification/index.js";
import { canonicalDigest } from "../src/schema/canonical.js";
import { parseNewEvent, parseTaskEnvelope } from "../src/schema/index.js";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = (relative: string): string =>
  execFileSync(process.execPath, ["-e", `process.stdout.write(require('node:fs').readFileSync(${JSON.stringify(join(REPO, relative))},'utf8'))`], {
    encoding: "utf8",
  });

const cleanups: Array<() => void> = [];
afterAll(() => {
  for (const fn of cleanups) fn();
});

const git = (cwd: string, args: readonly string[]): string =>
  execFileSync("git", [...args], { cwd, encoding: "utf8" }).trim();

/** A minimal Work fixture with ONE task, so the audit's state is reachable quickly. */
function scenario(): { repo: string; head: string } {
  const root = mkdtempSync(join(tmpdir(), "palimpsest-d5b-audit-"));
  const repo = join(root, "repo");
  mkdirSync(join(repo, "src"), { recursive: true });
  writeFileSync(join(repo, "src", "alpha.js"), "export const a = 1;\n");
  execFileSync("git", ["init", "-q"], { cwd: repo });
  execFileSync("git", ["add", "-A"], { cwd: repo });
  execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "H0"], { cwd: repo });
  const head = git(repo, ["rev-parse", "HEAD"]);
  cleanups.push(() => {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      // Windows keeps the directory busy while a git handle is open; the OS reaps it.
    }
  });
  return { repo, head };
}

function stack(repo: string) {
  const installed = installPalimpsest(
    { tools: { register: () => () => undefined } } as never,
    {
      projectId: "d5baudit",
      databasePath: join(repo, ".palimpsest", "p.sqlite"),
      ordariumDatabasePath: join(repo, ".palimpsest", "o.sqlite"),
      repository: repo,
      git: new GitCliPort(repo, join(repo, ".palimpsest", "worlds")),
      execution: "worktree",
      standard: Object.freeze({
        statement: "tests pass and scope respected",
        clauses: Object.freeze([
          Object.freeze({ kind: "command_succeeds" as const, command: Object.freeze(["node", "-e", "process.exit(0)"]), predicate: "tests_pass" as const }),
          Object.freeze({ kind: "scope_respected" as const }),
        ]),
        derivedFrom: Object.freeze(["audit fixture"]),
        confirmed: true,
        notes: Object.freeze([]),
      }),
      policy: trustedDefaultPolicy({ allowed_commands: [{ executable: "node", argv_prefix: ["-e", "process.exit(0)"] }] }),
    } as never,
  );
  cleanups.push(() => void installed.dispose());
  const call = async (name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> => {
    const tool = installed.tools.find((entry) => entry.name === name);
    if (tool === undefined) throw new Error(`no core tool ${name}`);
    return (await tool.execute(args, {
      callId: `c-${name}`,
      rootCallId: `r-${name}`,
      name,
      arguments: args,
      signal: new AbortController().signal,
    })) as Record<string, unknown>;
  };
  return { installed, controller: installed.controller, call };
}

/** Drive one task to COMPLETED + VERIFYING with a real (fake-worker) execution. */
async function completeOneTask(repo: string, head: string) {
  const { installed, controller, call } = stack(repo);
  await call("palimpsest_start", {
    projectId: "d5baudit",
    goal: "one defect",
    headCommit: head,
    tasks: [{ task_id: "t1", objective: "fix alpha", depends_on: [], write_paths: ["src/alpha.js"], required_artifacts: [] }],
  });
  const gates = new Map<string, () => void>();
  const service = makeWorkDelegationService({
    controller,
    workerFor: () => ({
      adapterId: "audit-fake-worker",
      async run({ workDir }) {
        await new Promise<void>((resolve) => gates.set(workDir, resolve));
        writeFileSync(join(workDir, "src", "alpha.js"), "export const a = 2;\n");
        execFileSync("git", ["add", "-A"], { cwd: workDir });
        execFileSync("git", ["-c", "user.email=w@w.w", "-c", "user.name=w", "commit", "-qm", "worker"], { cwd: workDir });
        return { kind: "READY_FOR_SETTLEMENT" as const };
      },
    }),
  });
  await service.start({ expectedTaskId: "t1" });
  for (let i = 0; i < 400 && gates.size === 0; i += 1) await new Promise((resolve) => setTimeout(resolve, 25));
  for (const release of gates.values()) release();
  for (let i = 0; i < 600; i += 1) {
    const rows = controller.store.connection.prepare("SELECT state FROM attempts WHERE project_id=?").all("d5baudit") as unknown as readonly { state: string }[];
    if (rows.length === 1 && rows[0]!.state === "COMPLETED") break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  for (let i = 0; i < 12; i += 1) {
    if (controller.preview().decision !== "next") break;
    controller.step();
  }
  const attempt = controller.store.connection
    .prepare("SELECT attempt_id FROM attempts WHERE project_id=?")
    .get("d5baudit") as unknown as { attempt_id: string };
  return { installed, controller, call, attemptId: attempt.attempt_id };
}

/* ================================================================== *
 * A. TASK_REAUTHORIZED refuses a VERIFYING task
 * ================================================================== */

describe("§D5-b A. TASK_REAUTHORIZED cannot express rework for a stale completed result", () => {
  it("a fresh-envelope reauthorization for a VERIFYING task is REFUSED, by name", async () => {
    const { repo, head } = scenario();
    const { controller } = await completeOneTask(repo, head);

    // The state the case actually produces: a COMPLETED candidate sitting in VERIFYING.
    const taskRow = controller.store.connection
      .prepare("SELECT state, envelope_json FROM tasks WHERE project_id=? AND task_id=?")
      .get("d5baudit", "t1") as unknown as { state: string; envelope_json: Uint8Array };
    expect(taskRow.state).toBe("VERIFYING");
    const oldEnvelope = parseTaskEnvelope(JSON.parse(new TextDecoder().decode(taskRow.envelope_json)));

    // Move canonical forward, exactly as a sibling promotion does, and build the envelope the rework would
    // need: identical SEMANTIC fields, fresh POSITIONAL ones at the new head.
    writeFileSync(join(repo, "src", "other.js"), "export const o = 1;\n");
    execFileSync("git", ["add", "-A"], { cwd: repo });
    execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "H1"], { cwd: repo });
    const newHead = git(repo, ["rev-parse", "HEAD"]);
    const project = controller.store.connection
      .prepare("SELECT revision, digest FROM projects WHERE project_id=?")
      .get("d5baudit") as unknown as { revision: number; digest: string };

    const fresh = {
      ...oldEnvelope,
      project_revision: Number(project.revision),
      project_digest: String(project.digest),
      base_commit: newHead,
      envelope_id: `env-${canonicalDigest({ domain: "audit.env", task: "t1", head: newHead }).slice(0, 32)}`,
      idempotency_key: canonicalDigest({ domain: "audit.key", task: "t1", head: newHead }),
    };

    const event = parseNewEvent({
      schema_version: 1,
      project_id: "d5baudit",
      event_type: "TASK_REAUTHORIZED",
      payload_version: 1,
      entity_type: "task",
      entity_id: "t1",
      payload: {
        task_envelope: fresh,
        policy_id: controller.policy.policy_id,
        policy_digest: controller.policy.digest,
      },
      causation_id: null,
      correlation_id: "task:t1:reauthorized",
      idempotency_key: fresh.idempotency_key,
      expected_project_revision: Number(project.revision),
    });

    /**
     * THE MEASUREMENT. Not "the type does not fit" — the SHIPPED validator refuses, and says why. Every
     * semantic field matches (same objective, same write paths, same artifacts); the only reason is STATE.
     */
    expect(() => controller.store.aggregateValidator.validate(controller.store.connection, event)).toThrow(
      /TASK_REAUTHORIZED requires a READY or BLOCKED task/u,
    );
  }, 180_000);
});

/* ================================================================== *
 * B. The refusal is LOAD-BEARING
 * ================================================================== */

describe("§D5-b B. the READY/BLOCKED restriction is load-bearing, not incidental", () => {
  it("the envelope is bound per TASK, not per ATTEMPT — so rebinding is retroactive", () => {
    /**
     * The structural fact that makes the restriction necessary. If the envelope were snapshotted per
     * attempt, rebinding a task would be harmless and the restriction could simply be relaxed. It is not:
     *
     *   `tasks.envelope_json`    one row per TASK — the CURRENT binding
     *   `attempts`               has NO envelope column at all
     */
    const schema = source("src/state/migration_files/0001_unified_baseline.sql");
    const tasksTable = schema.slice(schema.indexOf("CREATE TABLE tasks ("), schema.indexOf("CREATE TABLE attempts ("));
    const attemptsTable = schema.slice(schema.indexOf("CREATE TABLE attempts ("), schema.indexOf("CREATE TABLE evidence ("));
    expect(tasksTable).toContain("envelope_json");
    // The decisive assertion: an attempt does NOT carry its own envelope snapshot.
    expect(attemptsTable).not.toContain("envelope");
    // And the Work owner reads the CURRENT one, from the TASKS table, for any attempt it is asked about.
    const controller = source("src/tools/controller.ts");
    const reader = controller.slice(controller.indexOf("attemptWorkRecord(attemptId: string)"), controller.indexOf("attemptWorkRecord(attemptId: string)") + 900);
    expect(reader).toContain("SELECT envelope_json FROM tasks WHERE project_id=? AND task_id=?");
  });
});

/* ================================================================== *
 * C. Rebinding destroys a historical attempt's verifiability
 * ================================================================== */

describe("§D5-b C. rebinding a task's envelope rewrites a HISTORICAL attempt's provenance", () => {
  it("the historical attempt's envelope changes and its verification subject becomes underivable", async () => {
    const { repo, head } = scenario();
    const { controller, attemptId } = await completeOneTask(repo, head);

    const verificationSource = firstPartyAttemptResultVerificationSource({
      projectId: "d5baudit",
      attemptWorkRecord: (id: string) => {
        const record = controller.attemptWorkRecord(id);
        return record === null
          ? null
          : { state: record.state, taskId: record.taskId, report: record.report, envelope: record.envelope };
      },
    });

    const before = controller.attemptWorkRecord(attemptId);
    expect(before?.state).toBe("COMPLETED");
    expect(String(before?.envelope?.base_commit)).toBe(head);
    // BEFORE: the historical attempt is verifiable — the verification plane can name its subject.
    expect(verificationSource.materialize(attemptId).baseCommit).toBe(head);

    /**
     * Perform the rebinding the way plan reconciliation does — a direct write of the task's envelope — and
     * ask the SHIPPED readers what the historical attempt now claims about itself.
     *
     * This is not a hypothetical: it is what `TASK_REAUTHORIZED`'s projector does, and it is what the
     * tempting minimal fix (declare `verifying → ready`, then reauthorize) would do to a real attempt.
     */
    writeFileSync(join(repo, "src", "other.js"), "export const o = 1;\n");
    execFileSync("git", ["add", "-A"], { cwd: repo });
    execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "H1"], { cwd: repo });
    const newHead = git(repo, ["rev-parse", "HEAD"]);
    const row = controller.store.connection
      .prepare("SELECT envelope_json FROM tasks WHERE project_id=? AND task_id=?")
      .get("d5baudit", "t1") as unknown as { envelope_json: Uint8Array };
    const oldEnvelope = parseTaskEnvelope(JSON.parse(new TextDecoder().decode(row.envelope_json)));
    const fresh = {
      ...oldEnvelope,
      base_commit: newHead,
      envelope_id: `env-${canonicalDigest({ domain: "audit.env", task: "t1", head: newHead }).slice(0, 32)}`,
      idempotency_key: canonicalDigest({ domain: "audit.key", task: "t1", head: newHead }),
    };
    controller.store.connection
      .prepare("UPDATE tasks SET envelope_json=? WHERE project_id=? AND task_id=?")
      .run(new TextEncoder().encode(JSON.stringify(fresh)), "d5baudit", "t1");

    const after = controller.attemptWorkRecord(attemptId);
    // The attempt's own STATE is untouched — no failure was fabricated.
    expect(after?.state).toBe("COMPLETED");
    // But what it reports as its authorized envelope has MOVED, retroactively.
    expect(String(after?.envelope?.base_commit)).toBe(newHead);
    expect(String(after?.envelope?.base_commit)).not.toBe(head);

    /**
     * THE HARM, measured on the shipped verification path. The plane cross-checks the (immutable) report
     * against the (now rebound) envelope and refuses to name a subject — so the historical result stops
     * being verifiable at all.
     *
     *     HistoricalExecutionFact ≠ CurrentAcceptanceAuthority
     *
     * D5 §1 says the historical FACT must survive; this shows the current binding can destroy its
     * readability, which is the same violation one step earlier.
     */
    expect(() => verificationSource.materialize(attemptId)).toThrow(/inconsistent canonical record/u);
  }, 180_000);
});

/* ================================================================== *
 * D. The tempting minimal fix is available — and insufficient
 * ================================================================== */

describe("§D5-b D. the tempting minimal fix is reachable, which is exactly why it must be refused", () => {
  it("the state machine ALREADY permits verifying → ready; only the DECLARED graph lacks the transition", () => {
    /**
     * This is what makes the audit's answer non-obvious. A reader might expect the state machine to forbid
     * reopening VERIFYING work. It does not:
     *
     *     TASK_ALLOWED_SOURCES.TASK_READY = ["BLOCKED", "ACTIVE", "VERIFYING"]
     *
     * so declaring `verifying --TASK_READY--> ready` in a stage graph would be accepted by the table, and
     * the aggregate does not reject a VERIFYING row that HAS a completed candidate either. The only thing
     * missing is the DECLARATION.
     *
     * Meaning: the fix is a one-line stage-graph addition. That is precisely why the finding matters — the
     * cheap path exists, and following it would then require rebinding the envelope, which C measured to be
     * destructive. The cheap path is a trap rather than a solution.
     */
    const machine = source("src/domain/state_machine.ts");
    const readySources = machine.slice(machine.indexOf("TASK_READY: new Set"), machine.indexOf("TASK_READY: new Set") + 120);
    expect(readySources).toContain("VERIFYING");

    // The genesis graph declares exactly ONE transition out of `verifying`, and it is the forward one.
    const genesis = source("src/domain/stage_graph.ts");
    const declared = genesis.slice(
      genesis.indexOf("export const DEFAULT_STAGE_GRAPH"),
      genesis.indexOf('declared_by: "genesis"'),
    );
    const fromVerifying = declared.split("\n").filter((line) => line.includes('from: "verifying"'));
    expect(fromVerifying).toHaveLength(1);
    expect(fromVerifying[0]).toContain("TASK_SATISFIED");
    // No route back: `TASK_STALE` is a maintenance event the scheduler never emits, and STALE is terminal.
    expect(declared).not.toMatch(/from: "verifying", event: "TASK_READY"/u);
  });

  it("TASK_STALE can retire a VERIFYING task, but STALE is terminal — retirement is not reopening", () => {
    const machine = source("src/domain/state_machine.ts");
    const staleSources = machine.slice(machine.indexOf("TASK_STALE: new Set"), machine.indexOf("TASK_STALE: new Set") + 120);
    expect(staleSources).toContain("VERIFYING");
    // It is terminal, so it cannot be the way back.
    const terminal = machine.slice(machine.indexOf("TASK_TERMINAL_STATES"), machine.indexOf("TASK_ACTIVE_STATES"));
    expect(terminal).toContain('"STALE"');
    // And no transition declares STALE as a SOURCE.
    const genesis = source("src/domain/stage_graph.ts");
    const declared = genesis.slice(genesis.indexOf("export const DEFAULT_STAGE_GRAPH"), genesis.indexOf("declared_by: \"genesis\""));
    expect(declared).not.toMatch(/from: "stale"/u);
  });
});
