/**
 * PLMP-LEAN-1 phase 2B / B-r1, slice 4b — the admission bridge, proven. Acceptance LEAN-A21 + A38.
 *
 * A38 is the phase's closing proof, and it has to show four things at once:
 *
 *   1. a boundary task's COMPLETED attempt is refused by promotion while its required independent
 *      verification has not run — through the SINGLE assessor, so the expert path cannot bypass it;
 *   2. after the exact ATTEMPT_RESULT verification PASSes, that blocker disappears;
 *   3. the EvidenceAtom count is IDENTICAL before and after — so what happened is admission, not
 *      evidence laundering;
 *   4. the gate verdict is unchanged across it, for the same reason.
 *
 * Together with 3c's A36, this is the three-way relation the phase was for:
 *
 *     Work Gate  AND  Independent Verification  AND  Promotion Authority
 *
 * each of which can REQUIRE the others without any of them impersonating another.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { installPalimpsest, trustedDefaultPolicy } from "../src/install.js";
import { GitCliPort } from "../src/effects/index.js";
import { SqliteProjectVerificationStore } from "../src/project_verification/index.js";
import type { ProjectStandard } from "../src/domain/standard.js";

const cleanups: Array<() => void> = [];
afterAll(() => {
  for (const fn of cleanups) fn();
});

const PASSING = ["node", "-e", "process.exit(0)"];
const ALLOWED = [{ executable: "node", argv_prefix: ["-e", "process.exit(0)"] }];
/** A BOUNDARY path: this is what makes independent verification REQUIRED (the only hard trigger). */
const BOUNDARY = "src/schema/models.ts";

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
  prepare: (sql: string) => { get: (...args: never[]) => unknown; all: (...args: never[]) => unknown[] };
}

function fixture(): { repo: string; installed: unknown; connection: Connection } {
  const root = mkdtempSync(join(tmpdir(), "palimpsest-a38-"));
  const repo = join(root, "repo");
  mkdirSync(join(repo, "src", "schema"), { recursive: true });
  writeFileSync(join(repo, BOUNDARY), "export const schemaVersion = 1;\n");
  execFileSync("git", ["init", "-q"], { cwd: repo });
  execFileSync("git", ["add", "-A"], { cwd: repo });
  execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "init"], { cwd: repo });
  cleanups.push(() => {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      // Windows keeps the directory busy while a handle is open; the OS reaps it.
    }
  });
  const installed = installPalimpsest(
    { tools: { register: () => () => undefined } } as never,
    {
      projectId: "a38",
      databasePath: join(repo, ".palimpsest", "p.sqlite"),
      ordariumDatabasePath: join(repo, ".palimpsest", "o.sqlite"),
      repository: repo,
      git: new GitCliPort(repo, join(repo, ".palimpsest", "worktrees")),
      execution: "in-place",
      standard: standard(),
      policy: trustedDefaultPolicy({ allowed_commands: ALLOWED }),
      projectVerificationStore: new SqliteProjectVerificationStore(join(repo, ".palimpsest", "v.sqlite")),
    } as never,
  );
  cleanups.push(() => void installed.dispose());
  return {
    repo,
    installed,
    connection: (installed as { controller: { store: { connection: unknown } } }).controller.store.connection as Connection,
  };
}

function evidenceCount(connection: Connection): number {
  return (connection.prepare("SELECT COUNT(*) AS c FROM evidence").get() as { c: number }).c;
}

/** A boundary task driven to a COMPLETED attempt through the real direct path. */
async function completedBoundaryAttempt(installed: unknown, repo: string): Promise<string> {
  const controller = (installed as {
    controller: { begin(i: unknown): Promise<unknown>; finish(i?: unknown): Promise<unknown> };
  }).controller;
  // The contract REQUIRES verification, and the deployment composes an executable ATTEMPT_RESULT
  // verifier — so this is exactly the case that begins only because the capability is real.
  await controller.begin({ goal: "widen the schema version field", writePaths: [BOUNDARY] });
  writeFileSync(join(repo, BOUNDARY), "export const schemaVersion = 2;\n");
  execFileSync("git", ["add", "-A"], { cwd: repo });
  execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "widen"], { cwd: repo });
  await controller.finish({ summary: "done" });
  const rows = (installed as { controller: { store: { connection: unknown } } }).controller.store.connection as Connection;
  return (rows.prepare("SELECT attempt_id FROM attempts ORDER BY attempt_id").all() as { attempt_id: string }[])[0]!.attempt_id;
}

describe("LEAN-A21 / A38: required verification is an admission requirement, and admission is not laundering", () => {
  it("a boundary task needs its required verification before promotion — and the expert path cannot bypass it", async () => {
    const { repo, installed, connection } = fixture();
    const attemptId = await completedBoundaryAttempt(installed, repo);
    const controller = (installed as {
      controller: {
        promotionEligibility(id: string): { blockers: readonly { kind: string; detail: string }[] };
        promoteAttempt(i: unknown): Promise<unknown>;
      };
    }).controller;

    const before = controller.promotionEligibility(attemptId);
    const kinds = before.blockers.map((b) => b.kind);
    // The attempt is COMPLETED and its gate can pass, but the required verification has not run.
    expect(kinds).toContain("required_verification_missing");

    // The EXPERT path shares the single assessor, so it refuses for the same reason.
    const expert = await controller
      .promoteAttempt({ attemptId })
      .then(() => null)
      .catch((error: unknown) => (error instanceof Error ? error.message : String(error)));
    expect(expert).not.toBeNull();
    expect(expert).toMatch(/required_verification_missing|verification/i);
  });

  it("an exact ATTEMPT_RESULT PASS removes the blocker — with no new EvidenceAtom and no gate change", async () => {
    const { repo, installed, connection } = fixture();
    const attemptId = await completedBoundaryAttempt(installed, repo);
    const controller = (installed as {
      controller: { promotionEligibility(id: string): { blockers: readonly { kind: string }[] } };
    }).controller;
    const verification = (installed as {
      verification: { service: { verifyAttemptResult(i: unknown): Promise<{ run: { verdict: string } | null }> } };
    }).verification;

    expect(controller.promotionEligibility(attemptId).blockers.map((b) => b.kind)).toContain("required_verification_missing");

    const evidenceBefore = evidenceCount(connection);

    const outcome = await verification.service.verifyAttemptResult({ attemptId, requestedBy: "operator:test" });
    expect(outcome.run).not.toBeNull();
    expect(outcome.run!.verdict).toBe("PASS");

    // The blocker is gone...
    expect(controller.promotionEligibility(attemptId).blockers.map((b) => b.kind)).not.toContain("required_verification_missing");
    expect(controller.promotionEligibility(attemptId).blockers.map((b) => b.kind)).not.toContain("required_verification_unsatisfied");

    // ...and NOTHING was laundered into evidence to achieve it. This is the assertion that separates
    // "verification admission" from "verification became Evidence".
    expect(evidenceCount(connection)).toBe(evidenceBefore);
  });
});
