/**
 * PLMP-LEAN-1 phase 2B / B-r1, slice 3b — the attempt-result verifier REF.
 * Acceptance LEAN-A19 (protocol half) and the core of B.11.
 *
 * B.11 is not tidiness, and this file demonstrates it rather than asserting it. The head protocol is
 * `git diff --check`, which inspects the WORKING-TREE diff — run inside a clean checkout of R it
 * finds nothing to check and PASSES trivially. So "extend the head verifier to support
 * ATTEMPT_RESULT" would have manufactured a verification that proves nothing, while also changing
 * that verifier's definition digest and staling every existing head verification.
 *
 * The test below shows exactly that: on a checkout of a commit range that DOES contain a whitespace
 * error, the head verifier passes and the attempt verifier fails. Same directory, same commit, two
 * different questions — and only one of them is about this patch.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import {
  FIRST_PARTY_ATTEMPT_RESULT_VERIFIER_REF,
  commandAttemptResultVerifier,
  commandProjectHeadVerifier,
  gitAttemptResultMaterializer,
  materializeAttemptResultVerificationSubject,
  materializeProjectHeadVerificationSubject,
  parseAttemptResultVerificationSubject,
  type ProjectVerifierPort,
} from "../src/project_verification/index.js";

const cleanups: Array<() => void> = [];
afterAll(() => {
  for (const fn of cleanups) fn();
});

function repo(): string {
  const root = mkdtempSync(join(tmpdir(), "palimpsest-arv-"));
  const dir = join(root, "repo");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "a.ts"), "export const a = 1;\n");
  execFileSync("git", ["init", "-q"], { cwd: dir });
  execFileSync("git", ["add", "-A"], { cwd: dir });
  execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "H0"], { cwd: dir });
  cleanups.push(() => {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      // Windows keeps the directory busy while a git handle is open; the OS reaps it.
    }
  });
  return dir;
}

function commit(dir: string, files: Record<string, string>, message: string): string {
  for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), body);
  execFileSync("git", ["add", "-A"], { cwd: dir });
  execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", message], { cwd: dir });
  return execFileSync("git", ["rev-parse", "HEAD"], { cwd: dir }).toString().trim();
}

function subjectFor(dir: string, base: string, result: string) {
  return materializeAttemptResultVerificationSubject({
    projectId: "p",
    taskId: "t1",
    attemptId: "attempt-1",
    envelopeId: "env-1",
    baseCommit: base,
    resultCommit: result,
    reportDigest: "d".repeat(64),
  });
}

async function run(port: ProjectVerifierPort, subject: ReturnType<typeof subjectFor>, dir: string) {
  const materializer = gitAttemptResultMaterializer({ repository: dir });
  const materialized = await materializer.materialize(subject);
  try {
    return await port.verify({ subject, repository: materialized.repository });
  } finally {
    await materialized.release();
  }
}

describe("LEAN-A19 / B.11: a SEPARATE attempt-result verifier, and the head verifier untouched", () => {
  it("is a different ref from the head verifier, and declares only ATTEMPT_RESULT", () => {
    const attempt = commandAttemptResultVerifier();
    const head = commandProjectHeadVerifier();
    expect(attempt.definition.verifierRef).toBe(FIRST_PARTY_ATTEMPT_RESULT_VERIFIER_REF);
    expect(attempt.definition.verifierRef).not.toBe(head.definition.verifierRef);
    expect([...attempt.definition.supportedSubjects]).toEqual(["ATTEMPT_RESULT"]);
    // The head verifier is untouched: still head-only, so widening it was never done.
    expect([...head.definition.supportedSubjects]).toEqual(["CURRENT_PROJECT_HEAD"]);
    // And the protocol is stated as a range over the attempt, not a working-tree diff.
    expect(attempt.definition.protocol).toContain("<baseCommit>..<resultCommit>");
  });

  it("the range it inspects is the attempt's OWN, and the head verifier would have proved nothing", async () => {
    const dir = repo();
    const base = execFileSync("git", ["rev-parse", "HEAD"], { cwd: dir }).toString().trim();
    // RA introduces a trailing-whitespace error: `git diff --check H0..RA` has something to say.
    const ra = commit(dir, { "a.ts": "export const a = 1;   \nexport const b = 2;\n" }, "RA with a whitespace error");
    // RB is clean.
    const rb = commit(dir, { "a.ts": "export const a = 1;\nexport const b = 2;\n" }, "RB clean");

    const attempt = commandAttemptResultVerifier();
    const head = commandProjectHeadVerifier();

    const onRa = await run(attempt, subjectFor(dir, base, ra), dir);
    expect(onRa.verdict).toBe("FAIL");

    const onRb = await run(attempt, subjectFor(dir, base, rb), dir);
    expect(onRb.verdict).toBe("PASS");

    // THE POINT: in the very same clean checkout of RA, the head protocol passes — because a clean
    // checkout has no working-tree diff to check. Extending the head verifier to ATTEMPT_RESULT would
    // have recorded exactly this PASS as "the attempt result was independently verified".
    const headOnRa = await run(head, subjectFor(dir, base, ra), dir);
    expect(headOnRa.verdict).toBe("PASS");
  });

  it("refuses a subject of the other kind rather than guessing", async () => {
    const dir = repo();
    const head = materializeProjectHeadVerificationSubject({
      projectId: "p",
      projectRevision: 0,
      projectDigest: "a".repeat(64),
      headCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: dir }).toString().trim(),
    });
    const attempt = commandAttemptResultVerifier();
    await expect(attempt.verify({ subject: head, repository: dir })).rejects.toThrow(/ATTEMPT_RESULT subjects only/);
  });

  it("needs the materialized checkout, and says so instead of running somewhere arbitrary", async () => {
    const dir = repo();
    const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: dir }).toString().trim();
    const subject = subjectFor(dir, head, head);
    const attempt = commandAttemptResultVerifier();
    await expect(attempt.verify({ subject })).rejects.toThrow(/needs the materialized checkout/);
  });

  it("the subject's commits are the only ones it can use — a caller cannot name a range", () => {
    // The definition carries a TEMPLATE, and the run-time range is read off the subject, so there is
    // no argument through which a caller could point the protocol at other commits.
    const attempt = commandAttemptResultVerifier();
    expect(attempt.definition.protocol).not.toMatch(/[0-9a-f]{40}/);
    const parsed = parseAttemptResultVerificationSubject(
      subjectFor(repo(), "b".repeat(40), "c".repeat(40)),
    );
    expect(parsed.baseCommit).toBe("b".repeat(40));
    expect(parsed.resultCommit).toBe("c".repeat(40));
  });
});
