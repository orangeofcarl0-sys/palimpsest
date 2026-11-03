/**
 * PC1-V1 R1 — completion and release must be the same bar.
 *
 * These tests use the real controller, the real Git tree and the standard-derived release gate. No
 * caller-supplied exit code or predicate is used as evidence.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { installProduct } from "../src/product.js";
import { parseGateDefinition } from "../src/evidence/gate_dsl.js";
import { commandDigest } from "../src/domain/command_identity.js";
import type { ProjectStandard } from "../src/domain/standard.js";
import { trustedDefaultPolicy } from "../src/install.js";

const cleanups: Array<() => void> = [];
afterAll(() => {
  for (const fn of cleanups) fn();
});

const PASS_A = ["node", "-e", "process.exit(0)"];
const PASS_B = ["node", "-e", "const x = 1; process.exit(x - 1)"];

function workspace(): { root: string; repo: string; head: string; stateDir: string } {
  const root = mkdtempSync(join(tmpdir(), "palimpsest-pc1v1-r1-"));
  const repo = join(root, "repo");
  mkdirSync(join(repo, "src"), { recursive: true });
  mkdirSync(join(repo, "docs"), { recursive: true });
  writeFileSync(join(repo, "src", "app.ts"), "export const value = 1;\n");
  writeFileSync(join(repo, "docs", "base.md"), "# base\n");
  execFileSync("git", ["init", "-q"], { cwd: repo });
  execFileSync("git", ["add", "-A"], { cwd: repo });
  execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "init"], { cwd: repo });
  cleanups.push(() => {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      // sqlite handles may outlive the test process on Windows
    }
  });
  return { root, repo, head: execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo }).toString().trim(), stateDir: join(root, "state") };
}

function standard(clauses: ProjectStandard["clauses"]): ProjectStandard {
  return Object.freeze({
    statement: "the declared checks and scope hold",
    clauses: Object.freeze([...clauses]),
    derivedFrom: Object.freeze(["PC1-V1 R1 fixture"]),
    confirmed: true,
    notes: Object.freeze([]),
  });
}

function install(repo: string, stateDir: string, projectStandard: ProjectStandard, allowed = [PASS_A, PASS_B]) {
  const installed = installProduct(
    { tools: { register: () => () => undefined } } as never,
    {
      projectId: "pc1v1",
      repository: repo,
      stateDir,
      execution: "in-place",
      standard: projectStandard,
      policy: trustedDefaultPolicy({
        allowed_commands: allowed.map((command) => ({ executable: command[0]!, argv_prefix: command.slice(1) })),
      }),
      toolProfile: "normal",
    },
  );
  cleanups.push(() => void installed.dispose());
  return installed;
}

function startAndClaim(installed: ReturnType<typeof install>, head: string, writePaths: string[], artifacts: string[]): string {
  installed.controller.start({
    projectId: "pc1v1",
    goal: "deliver an honestly qualified result",
    headCommit: head,
    tasks: [{ task_id: "deliver", objective: "deliver", depends_on: [], write_paths: writePaths, required_artifacts: artifacts }],
  });
  installed.controller.step();
  const created = installed.controller.step();
  if (created === null || created.event_type !== "ATTEMPT_CREATED") throw new Error("the fixture did not create an attempt");
  return created.entity_id;
}

function commit(repo: string, files: Record<string, string>, message = "work"): string {
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(join(repo, path, ".."), { recursive: true });
    writeFileSync(join(repo, path), content);
  }
  execFileSync("git", ["add", "-A"], { cwd: repo });
  execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", message], { cwd: repo });
  return execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim();
}

describe("PC1-V1 R1: a documentation result is complete and promotable under one bar", () => {
  it("finish skips the inapplicable command, records no fake tests_pass, and the release gate passes", async () => {
    const { repo, head, stateDir } = workspace();
    const installed = install(
      repo,
      stateDir,
      standard([
        { kind: "command_succeeds", command: PASS_A, predicate: "tests_pass" },
        { kind: "scope_respected" },
      ]),
    );
    const attemptId = startAndClaim(installed, head, ["docs/note.md"], ["docs/note.md"]);
    await installed.controller.claim(attemptId);
    commit(repo, { "docs/note.md": "# note\n" });

    const finished = await installed.controller.finish({ summary: "documented" });
    expect(finished.evidenceRecorded).not.toContain("tests_pass");
    expect(finished.nextEvidenceNeeded).toEqual([]);
    installed.controller.step();
    expect(installed.controller.status().tasks.find((task) => task.task_id === "deliver")?.state).toBe("VERIFYING");

    const verdict = installed.controller.evaluateGate("gate-release", "attempt", attemptId);
    expect(verdict.verdict).toBe("PASS");
    expect(verdict.unresolved).toEqual([]);
    const eligibility = installed.controller.promotionEligibility(attemptId, "gate-release");
    expect(eligibility.eligible).toBe(true);

    const promoted = await installed.controller.promoteAttempt({ attemptId, gateId: "gate-release" });
    expect(promoted.resultingHeadCommit).not.toBe(head);
    installed.controller.step();
    await installed.controller.reconcileProjectHead();
    expect(installed.controller.status().tasks.find((task) => task.task_id === "deliver")?.state).toBe("SATISFIED");
  });

  it("a missing applicable command still blocks: before finish the same gate is INCOMPLETE", () => {
    const { repo, head, stateDir } = workspace();
    const installed = install(
      repo,
      stateDir,
      standard([{ kind: "command_succeeds", command: PASS_A, predicate: "tests_pass" }]),
    );
    const attemptId = startAndClaim(installed, head, ["src/app.ts"], ["src/app.ts"]);
    const verdict = installed.controller.evaluateGate("gate-release", "attempt", attemptId);
    expect(verdict.verdict).toBe("INCOMPLETE");
    expect(verdict.next_evidence_needed.length).toBeGreaterThan(0);
    expect(verdict.next_evidence_needed.join(" ")).toContain("tests_pass");
  });
});

describe("PC1-V1 R1: two commands with one predicate are two obligations", () => {
  it("one successful command does not satisfy both; the exact command digest does", async () => {
    const { repo, head, stateDir } = workspace();
    const installed = install(
      repo,
      stateDir,
      standard([
        { kind: "command_succeeds", command: PASS_A, predicate: "tests_pass" },
        { kind: "command_succeeds", command: PASS_B, predicate: "tests_pass" },
      ]),
    );
    const attemptId = startAndClaim(installed, head, ["src/app.ts"], []);
    await installed.controller.claim(attemptId);
    await installed.controller.gate({ attemptId, predicate: "write_scope_valid", command: [] });
    await installed.controller.gate({ attemptId, predicate: "tests_pass", command: PASS_A });

    const partial = installed.controller.evaluateGate("gate-release", "attempt", attemptId);
    expect(partial.verdict).toBe("INCOMPLETE");
    expect(partial.unresolved.join(" ")).toContain("tests_pass");

    await installed.controller.gate({ attemptId, predicate: "tests_pass", command: PASS_B });
    const complete = installed.controller.evaluateGate("gate-release", "attempt", attemptId);
    expect(complete.verdict).toBe("PASS");

    const atoms = installed.controller.store.connection
      .prepare("SELECT evidence_json FROM evidence WHERE project_id=? AND status='active'")
      .all("pc1v1") as Array<{ evidence_json: Uint8Array }>;
    const digests = atoms
      .map((row) => JSON.parse(new TextDecoder().decode(row.evidence_json)) as { predicate: string; value: Record<string, unknown> })
      .filter((atom) => atom.predicate === "tests_pass")
      .map((atom) => atom.value.command_digest);
    expect(digests).toEqual(expect.arrayContaining([commandDigest(PASS_A), commandDigest(PASS_B)]));
    expect(new Set(digests).size).toBe(2);
  });
});

describe("PC1-V1 R1: an unauthorized command is a named early blocker, never a silent skip", () => {
  it("finish refuses with the exact policy requirement and leaves the attempt RUNNING", async () => {
    const { repo, head, stateDir } = workspace();
    const installed = install(
      repo,
      stateDir,
      standard([{ kind: "command_succeeds", command: PASS_B, predicate: "tests_pass" }]),
      [PASS_A],
    );
    const attemptId = startAndClaim(installed, head, ["src/app.ts"], ["src/app.ts"]);
    await installed.controller.claim(attemptId);
    commit(repo, { "src/app.ts": "export const value = 2;\n" });

    await expect(installed.controller.finish()).rejects.toThrow(/does not authorize|authorized/iu);
    expect(installed.controller.status().attempts.find((attempt) => attempt.attempt_id === attemptId)?.state).toBe("RUNNING");
    const readiness = installed.controller.completionReadiness();
    expect(JSON.stringify(readiness)).toMatch(/does not authorize|policy\.allowed_commands/iu);
  });
});

describe("PC1-V1 R1: historical gate declarations keep their original interpretation", () => {
  it("a manually declared unqualified release gate is not silently re-derived for a docs task", () => {
    const { repo, head, stateDir } = workspace();
    const installed = install(
      repo,
      stateDir,
      standard([{ kind: "command_succeeds", command: PASS_A, predicate: "tests_pass" }]),
    );
    const attemptId = startAndClaim(installed, head, ["docs/note.md"], ["docs/note.md"]);
    installed.controller.declareGate(
      parseGateDefinition({
        gate_id: "gate-release",
        version: 9,
        subject_type: "attempt",
        require: { all: [{ exists: { predicate: "tests_pass" } }] },
      }),
      "legacy-project-gate",
    );
    const verdict = installed.controller.evaluateGate("gate-release", "attempt", attemptId);
    expect(verdict.verdict).toBe("INCOMPLETE");
    expect(verdict.next_evidence_needed).toContain("exists(tests_pass)");
  });
});
