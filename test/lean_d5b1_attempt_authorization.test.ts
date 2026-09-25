/**
 * PLMP-LEAN-1 §D5-b1 — ATTEMPT-SCOPED IMMUTABLE AUTHORIZATION, as machine proofs.
 *
 *     Every Attempt proves its own authorization.
 *
 * The binding was ALWAYS recorded — `ATTEMPT_CREATED` carries `(task_id, envelope_id, attempt_no)` and the
 * envelope's own text is in `TASK_CREATED` / `TASK_REAUTHORIZED` — but the read path resolved it through the
 * task's CURRENT envelope, which is a different fact. This file proves the fix, in the review's own order.
 *
 * The split the fix rests on, asserted here rather than assumed:
 *
 *     TaskCurrentEnvelope      `tasks.envelope_json`      — what authorizes the task NOW
 *     AttemptAuthorizedEnvelope  the Event Log            — what authorized THAT attempt
 *
 * The resolver tests are pure (they hand it events); the integration tests drive the shipped controller,
 * because the defect was in a read path rather than in a function.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, describe, expect, it } from "vitest";

import {
  AUTHORIZATION_FAILURES,
  authorizationEventsFrom,
  resolveAttemptAuthorization,
  type AuthorizationEventView,
} from "../src/state/attempt_authorization.js";
import { installPalimpsest, trustedDefaultPolicy } from "../src/install.js";
import { GitCliPort } from "../src/effects/index.js";
import { makeWorkDelegationService } from "../src/interaction/work_delegation.js";
import { firstPartyAttemptResultVerificationSource } from "../src/project_verification/index.js";
import { canonicalDigest } from "../src/schema/canonical.js";
import { parseTaskEnvelope } from "../src/schema/index.js";

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

/* ================================================================== *
 * Pure resolver proofs
 * ================================================================== */

const PROJECT = "p1";
const TASK = "t1";
/** A full git object id, because `parseTaskEnvelope` requires one — the fixture must satisfy the real grammar. */
const H0 = "0".repeat(39) + "1";
const H1 = "0".repeat(39) + "2";
/** A 64-character lowercase HEX digest, which is what "a digest" means here. Plain letters like "k" are not. */
const HEX64 = (digit: string): string => digit.repeat(64);

function envelopeOf(input: {
  readonly envelopeId: string;
  readonly baseCommit: string;
  readonly objective?: string | undefined;
}): Record<string, unknown> {
  return {
    schema_version: 1,
    project_id: PROJECT,
    task_id: TASK,
    envelope_id: input.envelopeId,
    project_revision: 1,
    project_digest: HEX64("d"),
    base_commit: input.baseCommit,
    objective: input.objective ?? "do the work",
    read_paths: [],
    write_paths: ["src/a.ts"],
    required_artifacts: [],
    suggested_skills: [],
    allowed_commands: [{ executable: "node", argv_prefix: ["-e", "process.exit(0)"] }],
    network_policy: "deny",
    network_allowlist: [],
    timeout_s: 600,
    lease_s: 600,
    attempt_limit: 3,
    candidate_limit: 1,
    idempotency_key: HEX64("e"),
  };
}

const attemptCreated = (eventId: number, attemptId: string, envelopeId: string): AuthorizationEventView => ({
  eventId,
  projectId: PROJECT,
  eventType: "ATTEMPT_CREATED",
  entityId: attemptId,
  payload: { task_id: TASK, envelope_id: envelopeId, attempt_no: 1 },
});

const taskEvent = (eventId: number, type: string, envelopeId: string, baseCommit: string): AuthorizationEventView => ({
  eventId,
  projectId: PROJECT,
  eventType: type,
  entityId: TASK,
  payload: { task_envelope: envelopeOf({ envelopeId, baseCommit }) },
});

describe("§D5-b1 the resolver reads the ATTEMPT's authorization out of the Event Log", () => {
  it("resolves `attempt → envelope_id → the envelope that carried that id`", () => {
    const resolution = resolveAttemptAuthorization({
      projectId: PROJECT,
      attemptId: "a0",
      events: [taskEvent(1, "TASK_CREATED", "E0", H0), attemptCreated(2, "a0", "E0")],
    });
    expect(resolution.state).toBe("RESOLVED");
    if (resolution.state !== "RESOLVED") throw new Error("unreachable");
    expect(resolution.authorization.envelopeId).toBe("E0");
    expect(resolution.authorization.envelope.base_commit).toBe(H0);
    expect(resolution.authorization.taskId).toBe(TASK);
    // Both event ids are carried, so a reader can point at the evidence rather than trust the verdict.
    expect(resolution.authorization.createdEventId).toBe(2);
    expect(resolution.authorization.authorizationEventId).toBe(1);
  });

  it("picks the envelope THAT ATTEMPT cites, even when the task has since been rebound", () => {
    /**
     * THE CORE CASE. `E0` authorized a0 at H0; the task was later rebound to `E1` at H1. Resolving a0 must
     * return E0 — the historical fact — and NOT the task's newer binding. This single assertion is the whole
     * defect the audit measured, expressed as a lookup.
     */
    const resolution = resolveAttemptAuthorization({
      projectId: PROJECT,
      attemptId: "a0",
      events: [
        taskEvent(1, "TASK_CREATED", "E0", H0),
        attemptCreated(2, "a0", "E0"),
        taskEvent(9, "TASK_REAUTHORIZED", "E1", H1),
      ],
    });
    expect(resolution.state).toBe("RESOLVED");
    if (resolution.state !== "RESOLVED") throw new Error("unreachable");
    expect(resolution.authorization.envelopeId).toBe("E0");
    expect(resolution.authorization.envelope.base_commit).toBe(H0);
  });

  it("two attempts on one task resolve to their OWN authorizations", () => {
    /**
     * The headline invariant: `AttemptAuthorization(A0) = E0` and `AttemptAuthorization(A1) = E1` while the
     * task's current envelope is E1. Same work, two attempts, two immutable provenances.
     */
    const events = [
      taskEvent(1, "TASK_CREATED", "E0", H0),
      attemptCreated(2, "a0", "E0"),
      taskEvent(9, "TASK_REAUTHORIZED", "E1", H1),
      attemptCreated(10, "a1", "E1"),
    ];
    const first = resolveAttemptAuthorization({ projectId: PROJECT, attemptId: "a0", events });
    const second = resolveAttemptAuthorization({ projectId: PROJECT, attemptId: "a1", events });
    expect(first.state === "RESOLVED" && first.authorization.envelope.base_commit).toBe(H0);
    expect(second.state === "RESOLVED" && second.authorization.envelope.base_commit).toBe(H1);
    expect(first.state === "RESOLVED" && first.authorization.envelopeId).not.toBe(
      second.state === "RESOLVED" ? second.authorization.envelopeId : null,
    );
  });
});

describe("§D5-b1 corrupt or absent history fails closed", () => {
  it("an attempt with no ATTEMPT_CREATED is ATTEMPT_NOT_RECORDED", () => {
    const resolution = resolveAttemptAuthorization({
      projectId: PROJECT,
      attemptId: "ghost",
      events: [taskEvent(1, "TASK_CREATED", "E0", H0)],
    });
    expect(resolution.state).toBe("UNRESOLVED");
    expect(resolution.state === "UNRESOLVED" && resolution.reason).toBe("ATTEMPT_NOT_RECORDED");
  });

  it("the most important negative: an envelope id with NO authorization event NEVER falls back", () => {
    /**
     * `ATTEMPT_CREATED` cites `E404`, which no task event ever supplied. The ONLY acceptable answers are a
     * refusal — never the current task envelope, and never a silent success. A fallback here would be exactly
     * the substitution that makes a corrupted history indistinguishable from a healthy one.
     */
    const resolution = resolveAttemptAuthorization({
      projectId: PROJECT,
      attemptId: "a0",
      events: [taskEvent(1, "TASK_CREATED", "E0", H0), attemptCreated(2, "a0", "E404")],
    });
    expect(resolution.state).toBe("UNRESOLVED");
    expect(resolution.state === "UNRESOLVED" && resolution.reason).toBe("AUTHORIZATION_NOT_FOUND");
    expect(resolution.state === "UNRESOLVED" && resolution.detail).toContain("nothing may be substituted");
  });

  it("two authorization events claiming ONE envelope id is AMBIGUOUS — never `ORDER BY ... LIMIT 1`", () => {
    /**
     * A duplicated envelope id makes "which envelope is E0" unanswerable. Picking the latest would be a guess
     * dressed as a lookup, and a guess about AUTHORIZATION is what this project refuses. The failure names
     * both event ids so an operator can see the corruption.
     */
    const resolution = resolveAttemptAuthorization({
      projectId: PROJECT,
      attemptId: "a0",
      events: [
        taskEvent(1, "TASK_CREATED", "E0", H0),
        attemptCreated(2, "a0", "E0"),
        taskEvent(7, "TASK_REAUTHORIZED", "E0", "0".repeat(39) + "9"),
      ],
    });
    expect(resolution.state).toBe("UNRESOLVED");
    expect(resolution.state === "UNRESOLVED" && resolution.reason).toBe("AUTHORIZATION_AMBIGUOUS");
    expect(resolution.state === "UNRESOLVED" && resolution.detail).toContain("1, 7");
    expect(source("src/state/attempt_authorization.ts")).not.toMatch(/LIMIT\s+1/u);
  });

  it("an authorization for a DIFFERENT task cannot be borrowed", () => {
    const resolution = resolveAttemptAuthorization({
      projectId: PROJECT,
      attemptId: "a0",
      events: [
        { eventId: 1, projectId: PROJECT, eventType: "TASK_CREATED", entityId: "other-task", payload: { task_envelope: { ...envelopeOf({ envelopeId: "E0", baseCommit: H0 }), task_id: "other-task" } } },
        attemptCreated(2, "a0", "E0"),
      ],
    });
    expect(resolution.state).toBe("UNRESOLVED");
    expect(resolution.state === "UNRESOLVED" && resolution.reason).toBe("AUTHORIZATION_WRONG_SUBJECT");
  });

  it("an attempt recorded WITHOUT a binding is BINDING_NOT_RECORDED, not repaired", () => {
    /**
     * Unreachable in the current schema — `ATTEMPT_CREATED`'s parser REQUIRES `envelope_id`, and `tail` of
     * the migration list shows exactly one baseline migration — which is precisely why the guard is worth
     * keeping: it is the branch that would otherwise become the silent fallback.
     */
    const resolution = resolveAttemptAuthorization({
      projectId: PROJECT,
      attemptId: "a0",
      events: [{ eventId: 2, projectId: PROJECT, eventType: "ATTEMPT_CREATED", entityId: "a0", payload: { task_id: TASK, attempt_no: 1 } }],
    });
    expect(resolution.state).toBe("UNRESOLVED");
    expect(resolution.state === "UNRESOLVED" && resolution.reason).toBe("BINDING_NOT_RECORDED");
  });

  it("every failure mode has a distinct name, so a caller never has to say just 'failed'", () => {
    expect(new Set(AUTHORIZATION_FAILURES).size).toBe(AUTHORIZATION_FAILURES.length);
    expect(AUTHORIZATION_FAILURES).toContain("AUTHORIZATION_NOT_FOUND");
    expect(AUTHORIZATION_FAILURES).toContain("AUTHORIZATION_AMBIGUOUS");
    expect(AUTHORIZATION_FAILURES).toContain("AUTHORIZATION_WRONG_SUBJECT");
  });

  it("NO LEGACY GUESS IS REQUIRED — the binding is required by the contract, on every recorded attempt", () => {
    /**
     * The review's prediction, checked mechanically: if `ATTEMPT_CREATED` has always carried `envelope_id`,
     * then an old D2 attempt's envelope is EXACTLY recoverable rather than unknown, so no
     * `UNKNOWN_LEGACY_ENVELOPE` state is needed. Two facts establish it: the contract lists the field, and
     * the payload parser REQUIRES it.
     */
    const models = source("src/schema/models.ts");
    expect(models).toContain('ATTEMPT_CREATED: ["task_id", "envelope_id", "attempt_no"]');
    const parser = models.slice(models.indexOf('case "ATTEMPT_CREATED"'), models.indexOf('case "ATTEMPT_LEASED"'));
    expect(parser).toContain('requireFields(raw, "task_id", "envelope_id", "attempt_no")');
  });

  it("the resolver is a read model, not a store: it holds no database and writes nothing", () => {
    const text = source("src/state/attempt_authorization.ts");
    for (const forbidden of ["DatabaseSync", "INSERT", "UPDATE", "DELETE", "randomUUID", "new Date"]) {
      expect(text, `attempt_authorization.ts must not contain "${forbidden}"`).not.toContain(forbidden);
    }
  });
});

/* ================================================================== *
 * Integration: the shipped read paths
 * ================================================================== */

function scenario(): { repo: string; head: string } {
  const root = mkdtempSync(join(tmpdir(), "palimpsest-d5b1-"));
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

async function completeOneTask(repo: string, head: string) {
  const installed = installPalimpsest(
    { tools: { register: () => () => undefined } } as never,
    {
      projectId: "d5b1",
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
        derivedFrom: Object.freeze(["d5b1 fixture"]),
        confirmed: true,
        notes: Object.freeze([]),
      }),
      policy: trustedDefaultPolicy({ allowed_commands: [{ executable: "node", argv_prefix: ["-e", "process.exit(0)"] }] }),
    } as never,
  );
  cleanups.push(() => void installed.dispose());
  const controller = installed.controller;
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
  await call("palimpsest_start", {
    projectId: "d5b1",
    goal: "one defect",
    headCommit: head,
    tasks: [{ task_id: "t1", objective: "fix alpha", depends_on: [], write_paths: ["src/alpha.js"], required_artifacts: [] }],
  });
  const gates = new Map<string, () => void>();
  const service = makeWorkDelegationService({
    controller,
    workerFor: () => ({
      adapterId: "d5b1-fake-worker",
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
    const rows = controller.store.connection.prepare("SELECT state FROM attempts WHERE project_id=?").all("d5b1") as unknown as readonly { state: string }[];
    if (rows.length === 1 && rows[0]!.state === "COMPLETED") break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  const attempt = controller.store.connection
    .prepare("SELECT attempt_id FROM attempts WHERE project_id=?")
    .get("d5b1") as unknown as { attempt_id: string };
  return { installed, controller, attemptId: attempt.attempt_id };
}

/** Move canonical forward, then rebind the task's envelope the way plan reconciliation does. */
function rebindTask(controller: ReturnType<typeof installPalimpsest>["controller"], repo: string): string {
  writeFileSync(join(repo, "src", "other.js"), "export const o = 1;\n");
  execFileSync("git", ["add", "-A"], { cwd: repo });
  execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "H1"], { cwd: repo });
  const newHead = git(repo, ["rev-parse", "HEAD"]);
  const row = controller.store.connection
    .prepare("SELECT envelope_json FROM tasks WHERE project_id=? AND task_id=?")
    .get("d5b1", "t1") as unknown as { envelope_json: Uint8Array };
  const oldEnvelope = parseTaskEnvelope(JSON.parse(new TextDecoder().decode(row.envelope_json)));
  const fresh = {
    ...oldEnvelope,
    base_commit: newHead,
    envelope_id: `env-${canonicalDigest({ domain: "d5b1.env", task: "t1", head: newHead }).slice(0, 32)}`,
    idempotency_key: canonicalDigest({ domain: "d5b1.key", task: "t1", head: newHead }),
  };
  controller.store.connection
    .prepare("UPDATE tasks SET envelope_json=? WHERE project_id=? AND task_id=?")
    .run(new TextEncoder().encode(JSON.stringify(fresh)), "d5b1", "t1");
  return fresh.envelope_id;
}

describe("§D5-b1 the SHIPPED read paths resolve the attempt's own authorization", () => {
  it("HISTORICAL IMMUTABILITY: `attemptWorkRecord` does not move when the task is rebound", async () => {
    const { repo, head } = scenario();
    const { controller, attemptId } = await completeOneTask(repo, head);

    const before = controller.attemptWorkRecord(attemptId);
    const beforeEnvelopeId = before?.envelope?.envelope_id;
    expect(String(before?.envelope?.base_commit)).toBe(head);

    const newEnvelopeId = rebindTask(controller, repo);
    expect(newEnvelopeId).not.toBe(beforeEnvelopeId);

    const after = controller.attemptWorkRecord(attemptId);
    // The attempt's provenance is IDENTICAL before and after: that is `AttemptAuthorization remains
    // immutable` while the task's current authorization evolved.
    expect(String(after?.envelope?.envelope_id)).toBe(beforeEnvelopeId);
    expect(String(after?.envelope?.base_commit)).toBe(head);
    expect(after?.envelope).toEqual(before?.envelope);
  }, 180_000);

  it("VERIFICATION CONTINUITY: the subject keeps its base commit, and its identity is unchanged", async () => {
    const { repo, head } = scenario();
    const { controller, attemptId } = await completeOneTask(repo, head);
    const verificationSource = firstPartyAttemptResultVerificationSource({
      projectId: "d5b1",
      attemptWorkRecord: (id: string) => {
        const record = controller.attemptWorkRecord(id);
        return record === null ? null : { state: record.state, taskId: record.taskId, report: record.report, envelope: record.envelope };
      },
    });
    const before = verificationSource.materialize(attemptId);
    expect(before.baseCommit).toBe(head);

    rebindTask(controller, repo);

    const after = verificationSource.materialize(attemptId);
    /**
     * At 2c32b97 this threw `inconsistent canonical record` — the exact harm the audit measured. Now the
     * subject is unchanged, including its digest, because the envelope it was cross-checked against is the
     * one that actually authorized the attempt.
     */
    expect(after.baseCommit).toBe(head);
    expect(after.digest).toBe(before.digest);
  }, 180_000);

  it("CURRENT TASK and HISTORICAL ATTEMPT diverge LEGITIMATELY — not an inconsistency", async () => {
    const { repo, head } = scenario();
    const { controller, attemptId } = await completeOneTask(repo, head);
    const newEnvelopeId = rebindTask(controller, repo);

    const currentRow = controller.store.connection
      .prepare("SELECT envelope_json FROM tasks WHERE project_id=? AND task_id=?")
      .get("d5b1", "t1") as unknown as { envelope_json: Uint8Array };
    const currentEnvelope = parseTaskEnvelope(JSON.parse(new TextDecoder().decode(currentRow.envelope_json)));

    // The task row says E1; the attempt's own authorization says E0. BOTH are correct.
    expect(currentEnvelope.envelope_id).toBe(newEnvelopeId);
    expect(currentEnvelope.base_commit).not.toBe(head);
    expect(String(controller.attemptWorkRecord(attemptId)?.envelope?.envelope_id)).not.toBe(newEnvelopeId);
    // And the task-current read still returns the CURRENT envelope, unchanged in meaning.
    expect(controller.taskEnvelopeOrNull("t1")?.envelope_id).toBe(newEnvelopeId);
  }, 180_000);

  it("ONE definition: both the Work owner and the scheduler resolve through the same resolver", () => {
    /**
     * Two modules reading "which envelope authorized this attempt" with two hand-written queries is how the
     * two answers start disagreeing. Both now call the resolver, and neither names the task's envelope column
     * in its attempt-scoped read.
     */
    for (const file of ["src/tools/controller.ts", "src/scheduler/scheduler.ts"]) {
      const text = source(file);
      expect(text, `${file} must use the resolver`).toContain("resolveAttemptAuthorization(");
      const context =
        file === "src/tools/controller.ts"
          ? text.slice(text.indexOf("#attemptContext(attemptId: string)"), text.indexOf("#attemptContext(attemptId: string)") + 700)
          : text.slice(text.indexOf("#attemptContext(attemptId: string)"), text.indexOf("#attemptContext(attemptId: string)") + 700);
      expect(context, `${file} #attemptContext must not read the task's envelope column`).not.toContain("SELECT envelope_json FROM tasks");
    }
  });

  it("NO SCHEMA FABRICATION: the attempts table still has no envelope column", () => {
    /**
     * The review's proof #5: the absence is not an unimplemented feature but the design — the fact already
     * lives in the Event Log, so duplicating it would create two authorities to keep in agreement.
     */
    const schema = source("src/state/migration_files/0001_unified_baseline.sql");
    const attemptsTable = schema.slice(schema.indexOf("CREATE TABLE attempts ("), schema.indexOf("CREATE TABLE evidence ("));
    expect(attemptsTable).not.toContain("envelope");
    // And no new durable store was introduced for this fact.
    expect(source("src/state/attempt_authorization.ts")).not.toContain("DatabaseSync");
  }, 60_000);
});
