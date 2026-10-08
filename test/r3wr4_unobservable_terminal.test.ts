/**
 * R3-WR4 GATE B — UNOBSERVABLE-WORLD FAILURE AND THE TERMINAL VOCABULARY.
 *
 * These tests pin the measured facts Gate B's verdict rests on. They drive the REAL `installPalimpsest` stack,
 * because every answer depends on the actual report path, the actual admission rule and the actual store — a
 * description of those paths is not evidence about them.
 *
 * The failure is injected the way §5 requires: ONLY the world's borrowed Git object dependency is made
 * permanently unavailable, while the canonical Project repository is left healthy. That keeps "the world broke"
 * and "the project broke" separable, which the ruling requires.
 *
 * WHAT THESE TESTS DO NOT DO: they do not implement or invent a terminal authority. §7 and §9 forbid it, and the
 * stage's verdict for the authorized path is POLICY_REQUIRED. So the tests pin (a) that the defect is real, (b)
 * exactly what the existing vocabulary can and cannot carry, and (c) that the project genuinely recovers once an
 * admissible terminal event exists — leaving the authorization question where the ruling put it.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { afterAll, describe, expect, it } from "vitest";

const NL = String.fromCharCode(10);
const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = mkdtempSync(join(tmpdir(), "r3wr4-gateb-"));

afterAll(() => {
  try {
    rmSync(BASE, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    /* the temp hygiene sweep collects it */
  }
});

const git = (cwd: string, args: readonly string[]): string => {
  try {
    return execFileSync("git", [...args], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch (error) {
    return `ERR:${String((error as { stderr?: unknown }).stderr ?? error).trim().slice(0, 160)}`;
  }
};

/**
 * Drive ONE attempt to RUNNING with legitimate committed edits in its own world, then break ONLY the world's
 * borrowed object dependency. The canonical repository is never touched.
 */
async function driveToRunning(prefix: string, { unobservable, pending = true }: { unobservable: boolean; pending?: boolean }) {
  const { installPalimpsest, trustedDefaultPolicy } = await import(pathToFileURL(join(REPO, "dist", "src", "install.js")).href);
  const { GitCliPort } = await import(pathToFileURL(join(REPO, "dist", "src", "effects", "index.js")).href);

  const root = mkdtempSync(join(BASE, prefix));
  const repo = join(root, "canonical");
  mkdirSync(join(repo, "src"), { recursive: true });
  writeFileSync(join(repo, "src", "alpha.js"), `export const alpha = 1;${NL}`, "utf8");
  git(repo, ["init", "-q"]);
  git(repo, ["add", "-A"]);
  git(repo, ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "H0"]);
  const head = git(repo, ["rev-parse", "HEAD"]);

  const projectId = `r3wr4gb-${prefix.replace(/[^a-z0-9]/giu, "")}`;
  const installed = installPalimpsest(
    { tools: { register: () => () => undefined } },
    {
      projectId,
      databasePath: join(repo, ".palimpsest", "p.sqlite"),
      ordariumDatabasePath: join(repo, ".palimpsest", "o.sqlite"),
      repository: repo,
      git: new GitCliPort(repo, join(repo, ".palimpsest", "worlds")),
      execution: "worktree",
      standard: Object.freeze({
        statement: "the change is committed and in scope",
        clauses: Object.freeze([Object.freeze({ kind: "scope_respected" })]),
        derivedFrom: Object.freeze(["r3wr4 gate b fixture"]),
        confirmed: true,
        notes: Object.freeze([]),
      }),
      policy: trustedDefaultPolicy({ allowed_commands: [{ executable: "node", argv_prefix: ["-e", "process.exit(0)"] }] }),
    },
  );
  const controller = installed.controller;
  const call = async (name: string, args: unknown): Promise<unknown> => {
    const tool = installed.tools.find((entry: { name: string }) => entry.name === name);
    if (tool === undefined) throw new Error(`no core tool ${name}`);
    return await tool.execute(args, { callId: `c-${name}`, rootCallId: `r-${name}`, name, arguments: args, signal: new AbortController().signal });
  };
  const attemptRow = (): { attempt_id: string; state: string } | undefined =>
    controller.store.connection.prepare("SELECT attempt_id, state FROM attempts WHERE project_id=? ORDER BY rowid LIMIT 1").get(projectId) as
      | { attempt_id: string; state: string }
      | undefined;
  const events = (): string[] =>
    (controller.store.connection.prepare("SELECT event_type FROM events WHERE project_id=? AND entity_type='attempt' ORDER BY rowid").all(projectId) as Array<{ event_type: string }>).map((row) => String(row.event_type));

  await call("palimpsest_start", {
    projectId,
    goal: "one defect",
    headCommit: head,
    tasks: [{ task_id: "t1", objective: "fix alpha", depends_on: [], write_paths: ["src/alpha.js"], required_artifacts: [] }],
  });
  for (let index = 0; index < 12; index += 1) {
    if (controller.preview().decision !== "next") break;
    controller.step();
    if (attemptRow() !== undefined) break;
  }
  const attemptId = String(attemptRow()?.attempt_id);
  const claimed = await controller.claim(attemptId);
  const worldPath = claimed.worldPath;

  writeFileSync(join(worldPath, "src", "alpha.js"), `export const alpha = 2;${NL}`, "utf8");
  git(worldPath, ["add", "-A"]);
  git(worldPath, ["-c", "user.email=w@w.w", "-c", "user.name=w", "commit", "-qm", "candidate work"]);
  /**
   * An uncommitted edit, so the world holds BOTH a candidate and pending work. It stays INSIDE the envelope's
   * `write_paths` on purpose: a completion report is refused for out-of-scope changes, and the healthy control
   * must be able to reach COMPLETED rather than failing for an unrelated reason.
   */
  if (pending) writeFileSync(join(worldPath, "src", "alpha.js"), `export const alpha = 2; export const pending = 1;${NL}`, "utf8");

  if (unobservable) {
    /** ONLY the world's borrowed object dependency, permanently. */
    writeFileSync(join(worldPath, ".git", "objects", "info", "alternates"), `${join(root, "gone-for-good")}${NL}`, "utf8");
  }

  return {
    controller,
    projectId,
    repo,
    head,
    attemptId,
    worldPath,
    attemptRow,
    events,
    dispose: () => {
      try {
        installed.dispose();
      } catch {
        /* teardown is best-effort */
      }
    },
  };
}

describe("R3-WR4 Gate B. an unobservable world is a real, separable failure", () => {
  it("only the WORLD breaks: the attempt stays RUNNING and the canonical repository stays healthy", async () => {
    const run = await driveToRunning("unobs-", { unobservable: true });
    try {
      expect(run.attemptRow()?.state).toBe("RUNNING");
      /** Git observation THROUGH THE WORLD fails. */
      expect(String(git(run.worldPath, ["diff", "--name-only", run.head, "HEAD"]))).toMatch(/^ERR:/u);
      /** The canonical repository is NOT the thing that broke — §5 forbids conflating the two. */
      expect(git(run.repo, ["rev-parse", "--verify", "HEAD^{commit}"])).toBe(run.head);
      expect(run.events()).toEqual(["ATTEMPT_CREATED", "ATTEMPT_STARTED"]);
    } finally {
      run.dispose();
    }
  }, 120_000);

  it("`controller.report` THROWS for every terminal status and appends NO terminal event", async () => {
    const run = await driveToRunning("report-", { unobservable: true });
    try {
      const outcomes: Record<string, string> = {};
      for (const status of ["failed", "cancelled", "expired"] as const) {
        let error = "";
        try {
          run.controller.report(run.attemptId, { workerStatus: status, summary: `r3wr4 ${status}` });
        } catch (caught) {
          error = String((caught as Error)?.message ?? caught);
        }
        expect(error, `${status} must fail on the unobservable world`).not.toBe("");
        outcomes[status] = error;
      }
      /** The failure is an unguarded child-process error, not a named domain refusal. */
      for (const error of Object.values(outcomes)) {
        expect(error).toContain("Command failed: git");
      }
      /** And nothing was written: the attempt is still RUNNING with no Result and no Promotion. */
      expect(run.attemptRow()?.state).toBe("RUNNING");
      expect(run.events()).toEqual(["ATTEMPT_CREATED", "ATTEMPT_STARTED"]);
      const promotions = run.controller.store.connection
        .prepare("SELECT event_type FROM events WHERE project_id=? AND entity_type='promotion'")
        .all(run.projectId);
      expect(promotions).toEqual([]);
    } finally {
      run.dispose();
    }
  }, 120_000);

  it("a HEALTHY world reports normally — the control that keeps the failure meaningful", async () => {
    /**
     * `pending: false` because a COMPLETED report requires the work to be commit-materialized; the point of this
     * control is that the ORDINARY path works, so nothing else may be in the way.
     */
    const run = await driveToRunning("healthy-", { unobservable: false, pending: false });
    try {
      const event = run.controller.report(run.attemptId, { workerStatus: "completed", summary: "the work is done" });
      expect(String((event as { event_type?: string }).event_type)).toBe("ATTEMPT_COMPLETED");
      expect(run.attemptRow()?.state).toBe("COMPLETED");
    } finally {
      run.dispose();
    }
  }, 120_000);
});

describe("R3-WR4 Gate B. the existing terminal vocabulary, measured rather than assumed", () => {
  it("a NULL report is admitted for CANCELLED and EXPIRED, and refused for FAILED", async () => {
    const admitted: Record<string, boolean> = {};
    for (const [event, label] of [["ATTEMPT_CANCELLED", "CANCELLED"], ["ATTEMPT_EXPIRED", "EXPIRED"], ["ATTEMPT_FAILED", "FAILED"]] as const) {
      const run = await driveToRunning(`adm-${label.toLowerCase()}-`, { unobservable: true });
      try {
        try {
          run.controller.scheduler.recordCallback(run.attemptId, event as never, null);
          admitted[label] = true;
        } catch {
          admitted[label] = false;
        }
      } finally {
        run.dispose();
      }
    }
    /**
     * The vocabulary CAN carry a faithful "terminal, no Result" fact — `attempt_report: null` — but only for
     * CANCELLED and EXPIRED. FAILED requires a parseable report and so cannot express "failed with no observed
     * result" at all. That asymmetry is the measured blocker, not an assumption about it.
     */
    expect(admitted.CANCELLED).toBe(true);
    expect(admitted.EXPIRED).toBe(true);
    expect(admitted.FAILED).toBe(false);
  }, 180_000);

  it("an admissible terminal event releases the lane, resists duplicates, and lets a fresh attempt settle", async () => {
    const run = await driveToRunning("cont-", { unobservable: true });
    try {
      /** The ONE shape the existing vocabulary admits for a terminal-with-no-Result from RUNNING. */
      run.controller.scheduler.recordCallback(run.attemptId, "ATTEMPT_CANCELLED" as never, null);
      expect(run.attemptRow()?.state).toBe("CANCELLED");
      expect(run.events().filter((type) => type === "ATTEMPT_CANCELLED")).toHaveLength(1);

      /** A DUPLICATE is absorbed by the callback's idempotency key, never double-appended. */
      run.controller.scheduler.recordCallback(run.attemptId, "ATTEMPT_CANCELLED" as never, null);
      expect(run.events().filter((type) => type === "ATTEMPT_CANCELLED")).toHaveLength(1);

      /** A LATE result cannot overturn it. */
      let lateRefused = false;
      try {
        run.controller.reportLate(run.attemptId, { workerStatus: "completed", summary: "a late result" });
      } catch {
        lateRefused = true;
      }
      expect(lateRefused).toBe(true);
      expect(run.attemptRow()?.state).toBe("CANCELLED");

      /** The world and its remaining work are RETAINED — a terminal event deletes nothing. */
      expect(existsSync(run.worldPath)).toBe(true);
      expect(existsSync(join(run.worldPath, "src", "alpha.js"))).toBe(true);
      /** The candidate commit is still the world's HEAD: nothing was rewound or erased. */
      expect(git(run.worldPath, ["rev-parse", "HEAD"])).toMatch(/^[0-9a-f]{40}$/u);

      /** The canonical HEAD is unchanged. */
      expect(git(run.repo, ["rev-parse", "HEAD"])).toBe(run.head);

      /** And the project CAN continue: a fresh attempt opens and settles under ordinary rules. */
      for (let index = 0; index < 20; index += 1) {
        if (run.controller.preview().decision !== "next") break;
        run.controller.step();
      }
      const fresh = run.controller.store.connection
        .prepare("SELECT attempt_id, state FROM attempts WHERE project_id=? ORDER BY rowid")
        .all(run.projectId) as Array<{ attempt_id: string; state: string }>;
      const freshAttempt = fresh.find((row) => String(row.attempt_id) !== run.attemptId);
      expect(freshAttempt, "the scheduler must open a fresh position after a terminal event").toBeDefined();

      const claimed = await run.controller.claim(String(freshAttempt?.attempt_id));
      writeFileSync(join(claimed.worldPath, "src", "alpha.js"), `export const alpha = 3;${NL}`, "utf8");
      git(claimed.worldPath, ["add", "-A"]);
      git(claimed.worldPath, ["-c", "user.email=w@w.w", "-c", "user.name=w", "commit", "-qm", "recovered work"]);
      run.controller.report(String(freshAttempt?.attempt_id), { workerStatus: "completed", summary: "the recovered attempt settled" });
      const final = run.controller.store.connection
        .prepare("SELECT state FROM attempts WHERE project_id=? AND attempt_id=?")
        .get(run.projectId, String(freshAttempt?.attempt_id)) as { state: string } | undefined;
      expect(final?.state).toBe("COMPLETED");
    } finally {
      run.dispose();
    }
  }, 180_000);

  it("the stage does NOT invent a terminal authority — the requirement is recorded, not implemented", async () => {
    const contract = await import(pathToFileURL(join(REPO, "scripts", "r3wr4", "contract.mjs")).href);
    const requirement = contract.TERMINAL_CLASSIFICATION;
    expect(requirement.EVENT_KIND_EXISTS.answer).toBe("YES");
    expect(requirement.EVENT_ADMISSIBLE.answer).toBe("PARTIAL");
    expect(requirement.AUTHORITY_ESTABLISHED.answer).toBe("NO");
    expect(requirement.EXECUTABLE_WITH_UNOBSERVABLE_WORLD.answer).toBe("NO");
    expect(contract.VERDICTS.AUTHORIZED_TERMINAL_PATH).toBe("POLICY_REQUIRED");
    expect(contract.VERDICTS.PERMANENT_FAILURE_CONTINUATION).toBe("OPEN");
    /** The evidence discipline: an unavailable observation must never read as "no changes were observed". */
    expect(String(requirement.observationDiscipline.rule)).toContain("MUST NOT become");
  });
});
