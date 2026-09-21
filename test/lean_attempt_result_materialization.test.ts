/**
 * PLMP-LEAN-1 phase 2B / B-r1, slice 2 — the two bridges. Acceptance LEAN-A35 (materialization half).
 *
 *     canonical Work record  →  ATTEMPT_RESULT subject
 *     ATTEMPT_RESULT subject →  exact, ephemeral, releasable checkout
 *
 * The property A35 pins is not "a checkout happened" but that the materialized input IS the attempt's
 * immutable result and NOT the ambient repository: with HEAD moved on to RB, materializing the
 * subject still yields RA, a clean tree, RA's content, and none of RB's.
 *
 * The negative cases are the other half. A source that derives a subject from a record it should
 * refuse is worse than no source at all, so every inconsistency in canonical state is exercised —
 * and, separately, the owner split is proven: a subject whose commit the repository cannot produce
 * still DERIVES (Work history is canonical) and is refused by the MATERIALIZER.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { installPalimpsest, trustedDefaultPolicy } from "../src/install.js";
import { GitCliPort } from "../src/effects/index.js";
import {
  firstPartyAttemptResultVerificationSource,
  gitAttemptResultMaterializer,
  type AttemptResultVerificationSource,
} from "../src/project_verification/index.js";
import type { ProjectStandard } from "../src/domain/standard.js";

const cleanups: Array<() => void> = [];
afterAll(() => {
  for (const fn of cleanups) fn();
});

const PASSING = ["node", "-e", "process.exit(0)"];
const ALLOWED = [{ executable: "node", argv_prefix: ["-e", "process.exit(0)"] }];
const GOAL = "rewrite dedupe with a Set";
const SCOPE = ["src/dedupe.ts"];
const RA_EDIT = "export const dedupe = (v: number[]) => [...new Set(v)].sort((a, b) => a - b);\n";

function standard(): ProjectStandard {
  return Object.freeze({
    statement: "tests pass and scope respected",
    clauses: Object.freeze([
      Object.freeze({ kind: "command_succeeds" as const, command: Object.freeze([...PASSING]), predicate: "tests_pass" as const }),
      Object.freeze({ kind: "scope_respected" as const }),
    ]),
    derivedFrom: Object.freeze(["test fixture"]),
    confirmed: true,
    notes: Object.freeze([]),
  });
}

interface Connection {
  prepare: (sql: string) => {
    get: (...args: never[]) => unknown;
    all: (...args: never[]) => unknown[];
    run: (...args: never[]) => unknown;
  };
}

function makeStack(repo: string) {
  const installed = installPalimpsest(
    { tools: { register: () => () => undefined } } as never,
    {
      projectId: "ar",
      databasePath: join(repo, ".palimpsest", "p.sqlite"),
      ordariumDatabasePath: join(repo, ".palimpsest", "o.sqlite"),
      repository: repo,
      git: new GitCliPort(repo, join(repo, ".palimpsest", "worktrees")),
      execution: "in-place",
      standard: standard(),
      policy: trustedDefaultPolicy({ allowed_commands: ALLOWED }),
    } as never,
  );
  cleanups.push(() => void installed.dispose());
  return { installed, connection: installed.controller.store.connection as unknown as Connection };
}

function workspace(): { repo: string; base: string } {
  const root = mkdtempSync(join(tmpdir(), "palimpsest-ar-"));
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
  return { repo, base: execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo }).toString().trim() };
}

function commit(repo: string, message: string): string {
  execFileSync("git", ["add", "-A"], { cwd: repo });
  execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", message], { cwd: repo });
  return execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo }).toString().trim();
}

/** The real direct path: begin → work → commit → finish. */
async function completedVia(
  installed: { controller: unknown },
  repo: string,
): Promise<{ attemptId: string; result: string }> {
  const controller = installed.controller as {
    begin(input: unknown): Promise<unknown>;
    finish(input?: unknown): Promise<unknown>;
  };
  await controller.begin({ goal: GOAL, writePaths: SCOPE });
  writeFileSync(join(repo, "src", "dedupe.ts"), RA_EDIT);
  const result = commit(repo, "RA");
  await controller.finish({ summary: "done" });
  return { attemptId: "", result };
}

function attempts(connection: Connection): { attempt_id: string; state: string }[] {
  return connection.prepare("SELECT attempt_id, state FROM attempts ORDER BY attempt_id").all() as {
    attempt_id: string;
    state: string;
  }[];
}

describe("LEAN-A35: the materialized input IS the attempt's immutable result, not the ambient repository", () => {
  it("materializes RA exactly, with RA's content and none of the later RB content", async () => {
    const { repo, base } = workspace();
    const { installed, connection } = makeStack(repo);
    const source = firstPartyAttemptResultVerificationSource(installed.controller as never);

    await completedVia(installed as never, repo);
    const attemptId = attempts(connection)[0]!.attempt_id;
    const ra = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo }).toString().trim();

    // Move the ambient repository on: RB carries a file RA never had.
    writeFileSync(join(repo, "src", "later.ts"), "export const later = true;\n");
    const rb = commit(repo, "RB");
    expect(rb).not.toBe(ra);

    const subject = source.materialize(attemptId);
    expect(subject.resultCommit).toBe(ra);
    expect(subject.baseCommit).toBe(base);

    const materializer = gitAttemptResultMaterializer({ repository: repo });
    const materialized = await materializer.materialize(subject);
    try {
      expect(materialized.materializedCommit).toBe(ra);
      const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: materialized.repository }).toString().trim();
      expect(head).toBe(ra);
      // Clean: an exact commit checkout has nothing pending.
      const dirty = execFileSync("git", ["status", "--porcelain"], { cwd: materialized.repository }).toString().trim();
      expect(dirty).toBe("");
      // RA's content is present, RB's is not — the whole point.
      expect(existsSync(join(materialized.repository, "src", "dedupe.ts"))).toBe(true);
      expect(
        execFileSync("git", ["show", "HEAD:src/dedupe.ts"], { cwd: materialized.repository }).toString(),
      ).toContain(".sort(");
      expect(existsSync(join(materialized.repository, "src", "later.ts"))).toBe(false);
    } finally {
      await materialized.release();
    }

    // Released: the directory is gone and git no longer lists it.
    expect(existsSync(materialized.repository)).toBe(false);
    const listed = execFileSync("git", ["worktree", "list"], { cwd: repo }).toString();
    expect(listed).not.toContain(materialized.repository.replace(/\\/g, "/"));
  });

  it("release runs even when the protocol throws", async () => {
    const { repo } = workspace();
    const { installed, connection } = makeStack(repo);
    const source = firstPartyAttemptResultVerificationSource(installed.controller as never);
    await completedVia(installed as never, repo);
    const subject = source.materialize(attempts(connection)[0]!.attempt_id);

    const materializer = gitAttemptResultMaterializer({ repository: repo });
    let path = "";
    await expect(
      (async () => {
        const materialized = await materializer.materialize(subject);
        path = materialized.repository;
        try {
          throw new Error("protocol exploded");
        } finally {
          await materialized.release();
        }
      })(),
    ).rejects.toThrow(/protocol exploded/);
    expect(existsSync(path)).toBe(false);
  });
});

describe("LEAN-A35: the source refuses any canonical record it cannot trust", () => {
  it("refuses non-COMPLETED, missing, or null-result records", async () => {
    const { repo } = workspace();
    const { installed, connection } = makeStack(repo);
    const source = firstPartyAttemptResultVerificationSource(installed.controller as never);
    await completedVia(installed as never, repo);
    const attemptId = attempts(connection)[0]!.attempt_id;

    // A subject IS derivable from the healthy record.
    expect(source.materialize(attemptId).resultCommit).toBeTruthy();

    // Every refusal below is a canonical record that must not yield a verification subject.
    connection.prepare("UPDATE attempts SET state='RUNNING' WHERE attempt_id=?").run(attemptId as never);
    expect(() => source.materialize(attemptId)).toThrow(/not COMPLETED/);

    connection.prepare("UPDATE attempts SET state='FAILED' WHERE attempt_id=?").run(attemptId as never);
    expect(() => source.materialize(attemptId)).toThrow(/not COMPLETED/);

    connection.prepare("UPDATE attempts SET state='COMPLETED', report_json=NULL WHERE attempt_id=?").run(attemptId as never);
    expect(() => source.materialize(attemptId)).toThrow(/carries no report/);

    expect(() => source.materialize("attempt-does-not-exist")).toThrow(/does not exist/);
  });

  it("refuses a report whose identity disagrees with canonical state", async () => {
    const { repo } = workspace();
    const { installed, connection } = makeStack(repo);
    const source = firstPartyAttemptResultVerificationSource(installed.controller as never);
    await completedVia(installed as never, repo);
    const attemptId = attempts(connection)[0]!.attempt_id;

    const row = connection.prepare("SELECT report_json FROM attempts WHERE attempt_id=?").get(attemptId as never) as {
      report_json: Uint8Array;
    };
    const report = JSON.parse(new TextDecoder().decode(row.report_json)) as Record<string, unknown>;
    // A report that claims a different envelope is not a result to verify — it is a corrupted record.
    const tampered = { ...report, envelope_id: "env-not-this-one" };
    connection
      .prepare("UPDATE attempts SET report_json=? WHERE attempt_id=?")
      .run(new TextEncoder().encode(JSON.stringify(tampered)) as never, attemptId as never);
    expect(() => source.materialize(attemptId)).toThrow(/inconsistent canonical record/);

    // A result commit removed from the report is refused too.
    connection
      .prepare("UPDATE attempts SET report_json=? WHERE attempt_id=?")
      .run(new TextEncoder().encode(JSON.stringify({ ...report, result_commit: null })) as never, attemptId as never);
    expect(() => source.materialize(attemptId)).toThrow(/reports no result commit/);

    // And an unreadable blob fails closed with a named error rather than leaking a raw parse
    // failure — the Work owner rejects a canonical row it cannot read.
    connection
      .prepare("UPDATE attempts SET report_json=? WHERE attempt_id=?")
      .run(new TextEncoder().encode("{not json") as never, attemptId as never);
    expect(() => source.materialize(attemptId)).toThrow(/unreadable/);
  });

  it("derives the subject even when the repository can no longer produce the commit — and the MATERIALIZER refuses", async () => {
    const { repo } = workspace();
    const { installed, connection } = makeStack(repo);
    const source = firstPartyAttemptResultVerificationSource(installed.controller as never);
    await completedVia(installed as never, repo);
    const attemptId = attempts(connection)[0]!.attempt_id;
    const subject = source.materialize(attemptId);

    // The canonical record names a commit this repository cannot produce. Work history is unchanged
    // and still yields a subject; it is EXECUTION that fails closed. That is the owner split.
    const elsewhere = gitAttemptResultMaterializer({ repository: mkdtempSync(join(tmpdir(), "palimpsest-empty-")) });
    await expect(elsewhere.materialize(subject)).rejects.toThrow(/cannot produce commit/);
    expect(subject.resultCommit).toBeTruthy();
  });
});
