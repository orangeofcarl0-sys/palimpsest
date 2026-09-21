/**
 * PLMP-LEAN-1 phase 2A-B — the begin protocol, acceptance LEAN-A27..A32 and A34.
 *
 * The 2A final live gate measured the gap this closes: there was a FINISH protocol and no BEGIN
 * protocol, so an agent that worked correctly and called `finish` was told "no attempt is running" —
 * reaching a claimable attempt still meant operating the scheduler by hand. An honest agent refuses
 * to mint that governance state itself, and it was right to.
 *
 * The state machine is S0-S3 (appendix E §E.16). These tests pin the properties that would otherwise
 * go green for the wrong reason:
 *
 *   - the PROSPECTIVE basis must equal the CANONICAL basis byte for byte (A27) — aligning the head is
 *     not enough, because ProjectIR's digest includes committedAt and the envelope's identity
 *     includes the project digest;
 *   - a refusal must append NOTHING (A29) — asserted as an event delta, not as "no PROJECT_CREATED";
 *   - a retry at the ATTEMPT_CREATED landing point must claim THAT attempt (A30) — the scheduler
 *     returns null once a task occupies the stage, so stepping again would deadlock;
 *   - pre-claim HEAD drift must fail closed (A34).
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { installPalimpsest, trustedDefaultPolicy } from "../src/install.js";
import { defineWorkTools } from "../src/adapters/dsh/work.js";
import { GitCliPort } from "../src/effects/index.js";
import type { ProjectController } from "../src/tools/controller.js";
import type { ProjectStandard } from "../src/domain/standard.js";

const cleanups: Array<() => void> = [];
afterAll(() => {
  for (const fn of cleanups) fn();
});

const PASSING = ["node", "-e", "process.exit(0)"];
const ALLOWED = [{ executable: "node", argv_prefix: ["-e", "process.exit(0)"] }];
const GOAL = "rewrite dedupe with a Set";
const SCOPE = ["src/dedupe.ts"];

function standardWith(clauses: ProjectStandard["clauses"], confirmed = true): ProjectStandard {
  return Object.freeze({
    statement: "tests pass and scope respected",
    clauses: Object.freeze(clauses),
    derivedFrom: Object.freeze(["test fixture"]),
    confirmed,
    notes: Object.freeze([]),
  });
}

/** One command clause and no boundary path, so nothing REQUIRES verification. */
const PLAIN_STANDARD = standardWith([
  Object.freeze({ kind: "command_succeeds" as const, command: Object.freeze([...PASSING]), predicate: "tests_pass" as const }),
  Object.freeze({ kind: "scope_respected" as const }),
]);

/** A boundary write path, so `contract_boundary` makes verification REQUIRED. */
const BOUNDARY_STANDARD = standardWith([
  Object.freeze({ kind: "command_succeeds" as const, command: Object.freeze([...PASSING]), predicate: "tests_pass" as const }),
  Object.freeze({ kind: "command_succeeds" as const, command: Object.freeze(["node", "--version"]), predicate: "lint_pass" as const }),
  Object.freeze({ kind: "scope_respected" as const }),
]);

interface Connection {
  prepare: (sql: string) => {
    get: (...args: never[]) => unknown;
    all: (...args: never[]) => unknown[];
    run: (...args: never[]) => unknown;
  };
}

function workspace(): { repo: string; head: string } {
  const root = mkdtempSync(join(tmpdir(), "palimpsest-begin-"));
  const repo = join(root, "repo");
  mkdirSync(join(repo, "src"), { recursive: true });
  writeFileSync(join(repo, "src", "dedupe.ts"), "export const dedupe = (v: number[]) => [...new Set(v)];\n");
  execFileSync("git", ["init", "-q"], { cwd: repo });
  execFileSync("git", ["add", "-A"], { cwd: repo });
  execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "init"], { cwd: repo });
  cleanups.push(() => {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      // Windows keeps the directory busy while a sqlite handle is open; the OS reaps it.
    }
  });
  return { repo, head: execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo }).toString().trim() };
}

function makeStack(
  repo: string,
  options: { standard?: ProjectStandard; execution?: "in-place" | "worktree"; policy?: typeof ALLOWED } = {},
) {
  const git = new GitCliPort(repo, join(repo, ".palimpsest", "worktrees"));
  const installed = installPalimpsest(
    { tools: { register: () => () => undefined } } as never,
    {
      projectId: "begin",
      databasePath: join(repo, ".palimpsest", "p.sqlite"),
      ordariumDatabasePath: join(repo, ".palimpsest", "o.sqlite"),
      repository: repo,
      git,
      execution: options.execution ?? "in-place",
      standard: options.standard ?? PLAIN_STANDARD,
      policy: trustedDefaultPolicy({ allowed_commands: options.policy ?? ALLOWED }),
    } as never,
  );
  cleanups.push(() => void installed.dispose());
  const connection = installed.controller.store.connection as unknown as Connection;
  const beginTool = defineWorkTools(installed.application as never).find((entry) => entry.name === "palimpsest_begin");
  if (beginTool === undefined) throw new Error("palimpsest_begin is not composed");
  const begin = async (args: Record<string, unknown>): Promise<Record<string, unknown>> =>
    (await beginTool.execute({ action: "run", ...args }, {
      callId: "c-begin",
      rootCallId: "r-begin",
      name: "palimpsest_begin",
      arguments: { action: "run", ...args },
      signal: new AbortController().signal,
    })) as Record<string, unknown>;
  return { installed, begin, connection };
}

function eventCount(connection: Connection): number {
  return (connection.prepare("SELECT COUNT(*) AS c FROM events").get() as { c: number }).c;
}

function attemptRows(connection: Connection): { attempt_id: string; state: string }[] {
  return connection.prepare("SELECT attempt_id, state FROM attempts ORDER BY attempt_id").all() as {
    attempt_id: string;
    state: string;
  }[];
}

function projectCount(connection: Connection): number {
  return (connection.prepare("SELECT COUNT(*) AS c FROM events WHERE event_type='PROJECT_CREATED'").get() as { c: number }).c;
}

function headCommitOfProject(connection: Connection): string | null {
  const row = connection
    .prepare("SELECT payload_json FROM events WHERE event_type='PROJECT_CREATED' ORDER BY event_id LIMIT 1")
    .get() as { payload_json: Uint8Array } | undefined;
  if (row === undefined) return null;
  const payload = JSON.parse(new TextDecoder().decode(row.payload_json)) as {
    project_ir: { head_commit: string; digest: string };
  };
  return payload.project_ir.head_commit;
}

function projectDigest(connection: Connection): string | null {
  const row = connection
    .prepare("SELECT payload_json FROM events WHERE event_type='PROJECT_CREATED' ORDER BY event_id LIMIT 1")
    .get() as { payload_json: Uint8Array } | undefined;
  if (row === undefined) return null;
  const payload = JSON.parse(new TextDecoder().decode(row.payload_json)) as { project_ir: { digest: string } };
  return payload.project_ir.digest;
}

function envelopeOfTaskCreated(connection: Connection): { project_digest: string; envelope_id: string } | null {
  const row = connection
    .prepare("SELECT payload_json FROM events WHERE event_type='TASK_CREATED' ORDER BY event_id LIMIT 1")
    .get() as { payload_json: Uint8Array } | undefined;
  if (row === undefined) return null;
  const payload = JSON.parse(new TextDecoder().decode(row.payload_json)) as {
    task_envelope: { project_digest: string; envelope_id: string };
  };
  return payload.task_envelope;
}

describe("LEAN-A27..A32, A34: the begin protocol establishes the managed work position", () => {
  it("A27 one call bootstraps a claimable attempt, and the prospective basis IS the canonical basis", async () => {
    const { repo, head } = workspace();
    const { begin, connection } = makeStack(repo);

    const before = eventCount(connection);
    const result = await begin({ goal: GOAL, writePaths: SCOPE });

    expect(result.state).toBe("READY");
    expect(result.goal).toBe(GOAL);
    expect(result.writeScope).toEqual(SCOPE);
    expect(result.completion).toHaveProperty("mechanicalChecks");
    expect(result.completion).toHaveProperty("independentVerificationRequired");

    // The work position exists: one project, one task, one RUNNING attempt.
    expect(projectCount(connection)).toBe(1);
    const attempts = attemptRows(connection);
    expect(attempts).toHaveLength(1);
    expect(attempts[0]!.state).toBe("RUNNING");
    expect(eventCount(connection)).toBeGreaterThan(before);

    // The prospective basis equals the canonical one. Aligning the HEAD is NOT enough: ProjectIR's
    // digest includes committedAt, and the envelope's identity includes the project digest, so a
    // basis built at one instant and one built at another would differ even with an identical head.
    expect(headCommitOfProject(connection)).toBe(head);
    const envelope = envelopeOfTaskCreated(connection);
    expect(envelope).not.toBeNull();
    expect(envelope!.project_digest).toBe(projectDigest(connection));

    // The principal projection carries no orchestration state.
    for (const forbidden of ["attemptId", "projectId", "taskId", "gateId", "eventType", "lease"]) {
      expect(result).not.toHaveProperty(forbidden);
    }
  });

  it("A28 begin does no work — no changes, no evidence, no report", async () => {
    const { repo } = workspace();
    const { begin, connection } = makeStack(repo);
    await begin({ goal: GOAL, writePaths: SCOPE });

    const evidence = (connection.prepare("SELECT COUNT(*) AS c FROM evidence").get() as { c: number }).c;
    expect(evidence).toBe(0);
    const reports = connection.prepare("SELECT report_json FROM attempts").all() as { report_json: Uint8Array | null }[];
    expect(reports.every((row) => row.report_json === null)).toBe(true);
    // And the tree is untouched: begin prepares a work position, it never works.
    const dirty = execFileSync("git", ["status", "--porcelain"], { cwd: repo })
      .toString()
      .split("\n")
      .filter((line) => line.trim() !== "" && !line.includes(".palimpsest/"));
    expect(dirty).toEqual([]);
  });

  it("A29 every refusal writes NOTHING — asserted as an event delta", async () => {
    const { repo } = workspace();

    // (a) an empty write scope is a provably uncompletable task
    {
      const { begin, connection } = makeStack(repo);
      const before = eventCount(connection);
      await expect(begin({ goal: GOAL, writePaths: [] })).rejects.toThrow(/non-empty write scope/);
      expect(eventCount(connection)).toBe(before);
    }
    // (b) worktree execution cannot be walked to the end by the direct path
    {
      const { begin, connection } = makeStack(repo, { execution: "worktree" });
      const before = eventCount(connection);
      await expect(begin({ goal: GOAL, writePaths: SCOPE })).rejects.toThrow(/in-place execution only/);
      expect(eventCount(connection)).toBe(before);
    }
    // (c) no confirmed standard — and begin may not mint one
    {
      const { begin, connection } = makeStack(repo, { standard: standardWith([], false) });
      const before = eventCount(connection);
      await expect(begin({ goal: GOAL, writePaths: SCOPE })).rejects.toThrow(/NEEDS_STANDARD_CONFIRMATION/);
      expect(eventCount(connection)).toBe(before);
    }
    // (d) changes that belong to no attempt
    {
      const { begin, connection } = makeStack(repo);
      writeFileSync(join(repo, "src", "stray.ts"), "export const stray = true;\n");
      const before = eventCount(connection);
      await expect(begin({ goal: GOAL, writePaths: SCOPE })).rejects.toThrow(/belong to no attempt/);
      expect(eventCount(connection)).toBe(before);
      rmSync(join(repo, "src", "stray.ts"));
    }
    // (e) a required command the envelope does not authorize is surfaced BEFORE any write
    {
      const { begin, connection } = makeStack(repo, { policy: [{ executable: "python", argv_prefix: ["-m", "pytest"] }] });
      const before = eventCount(connection);
      await expect(begin({ goal: GOAL, writePaths: SCOPE })).rejects.toThrow(/does not authorize it/);
      expect(eventCount(connection)).toBe(before);
    }
  });

  it("A29 a task requiring verification this deployment cannot perform refuses before writing", async () => {
    const { repo } = workspace();
    const { begin, connection } = makeStack(repo, {
      standard: BOUNDARY_STANDARD,
      policy: [...ALLOWED, { executable: "node", argv_prefix: ["--version"] }],
    });
    const before = eventCount(connection);
    // A schema/contract path makes `contract_boundary` a REQUIRED verification, and before phase 2B
    // the composed verifier only understands CURRENT_PROJECT_HEAD — it must not stand in.
    await expect(begin({ goal: GOAL, writePaths: ["src/schema/models.ts"] })).rejects.toThrow(
      /ATTEMPT_RESULT_VERIFICATION_UNAVAILABLE/,
    );
    expect(eventCount(connection)).toBe(before);
  });

  it("A30 restart converges: a retry claims the SAME attempt, never a second one", async () => {
    const { repo } = workspace();
    const { begin, connection } = makeStack(repo);
    await begin({ goal: GOAL, writePaths: SCOPE });

    const attempts = attemptRows(connection);
    expect(attempts).toHaveLength(1);
    const projects = projectCount(connection);

    // Retry while the attempt is RUNNING: S2 — RESUMED, no re-claim, no scheduler mutation.
    const resumed = await begin({ goal: GOAL, writePaths: SCOPE });
    expect(resumed.state).toBe("RESUMED");
    expect(attemptRows(connection)).toHaveLength(1);
    expect(projectCount(connection)).toBe(projects);
  });

  it("A30 a crash at the ATTEMPT_CREATED landing point converges instead of deadlocking", async () => {
    const { repo, head } = workspace();
    const { installed, begin, connection } = makeStack(repo);

    // Build the crash state FAITHFULLY: the project exists and an attempt was CREATED but never
    // claimed — where a crash between `step()` and `claim()` would leave it. (Updating the attempts
    // row by hand would desynchronise the ledger from its projection, which is not a state the
    // product can reach; the retry would then fail on an idempotency-key mismatch instead of
    // exercising the path under test.)
    driveToUnclaimedAttempt(installed, head);
    const created = attemptRows(connection);
    expect(created).toHaveLength(1);
    expect(created[0]!.state).toBe("CREATED");

    // The scheduler returns null once a task occupies the stage, so a retry that merely stepped again
    // would deadlock here — exactly the landing point this case claims to cover. S1 must READ the
    // attempt and claim it.
    const retried = await begin({ goal: GOAL, writePaths: SCOPE });
    expect(retried.state).toBe("READY");
    const after = attemptRows(connection);
    expect(after).toHaveLength(1);
    expect(after[0]!.attempt_id).toBe(created[0]!.attempt_id);
    expect(after[0]!.state).toBe("RUNNING");
  });

  it("A30 the S2 tree may be dirty and carry new commits — they belong to the running attempt", async () => {
    const { repo } = workspace();
    const { begin } = makeStack(repo);
    await begin({ goal: GOAL, writePaths: SCOPE });

    // The principal works: edits without committing. On a retry this must NOT be mistaken for
    // unowned work — the RUNNING attempt owns it.
    writeFileSync(join(repo, "src", "dedupe.ts"), "export const dedupe = (v: number[]) => [...new Set(v)].sort();\n");
    const resumed = await begin({ goal: GOAL, writePaths: SCOPE });
    expect(resumed.state).toBe("RESUMED");
  });

  it("A31 a different existing plan is a CONFLICT with zero writes", async () => {
    const { repo } = workspace();
    const { begin, connection } = makeStack(repo);
    await begin({ goal: GOAL, writePaths: SCOPE });
    const before = eventCount(connection);

    await expect(begin({ goal: "something else entirely", writePaths: SCOPE })).rejects.toThrow(/CONFLICT/);
    await expect(begin({ goal: GOAL, writePaths: ["src/other.ts"] })).rejects.toThrow(/CONFLICT/);
    expect(eventCount(connection)).toBe(before);
  });

  it("A34 pre-claim HEAD drift fails closed rather than adopting the new head", async () => {
    const { repo, head } = workspace();
    const { installed, begin, connection } = makeStack(repo);

    // The project exists at H0 with an unclaimed attempt, then something OUTSIDE this task moves the
    // head to HX. If begin adopted HX, `finish`'s Diff(H0, resultCommit) would later attribute that
    // external change to this task.
    driveToUnclaimedAttempt(installed, head);
    writeFileSync(join(repo, "src", "elsewhere.ts"), "export const elsewhere = 1;\n");
    execFileSync("git", ["add", "-A"], { cwd: repo });
    execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "external"], { cwd: repo });
    const moved = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo }).toString().trim();
    expect(moved).not.toBe(head);

    await expect(begin({ goal: GOAL, writePaths: SCOPE })).rejects.toThrow(/HEAD_CONFLICT/);
    // The attempt was NOT claimed, and the new head was NOT adopted as the project's.
    expect(attemptRows(connection)[0]!.state).toBe("CREATED");
    expect(headCommitOfProject(connection)).toBe(head);
  });
});

/**
 * Drive the controller to the state a crash between `step()` and `claim()` would leave: the project
 * exists and one attempt is CREATED but unclaimed. Built from public lifecycle primitives, so the
 * ledger and its projection stay consistent — the state is real, not manufactured.
 */
function driveToUnclaimedAttempt(installed: { controller: ProjectController }, head: string): void {
  installed.controller.start({
    projectId: "begin",
    goal: GOAL,
    tasks: [{ task_id: "direct-1", objective: GOAL, depends_on: [], write_paths: SCOPE, required_artifacts: [] }],
    headCommit: head,
  });
  for (let i = 0; i < 16; i += 1) {
    const preview = installed.controller.preview();
    if (preview.decision !== "next") break;
    installed.controller.step();
    // Stop the moment ATTEMPT_CREATED has been committed — claim never runs.
    if (preview.eventType === "ATTEMPT_CREATED") break;
  }
}
