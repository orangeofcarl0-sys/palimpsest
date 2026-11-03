/**
 * PC1 S01 — result transfer and evidence-producer integrity.
 *
 * Two measured failures from the C6-R P1 session are reproduced here against the REAL first-party
 * execution-world port:
 *
 *   1. A completed attempt placed in its own world reported a full result commit that the canonical
 *      repository could not read, because the legacy `palimpsest_report` path never exported the
 *      object. A promotion then failed after dispatch and stayed uncertain.
 *   2. `palimpsest_gate` accepted `write_scope_valid` / `expected_files_exist` as labels on an
 *      unrelated exit-0 command (`node verify.mjs`), so a release gate passed on evidence that had
 *      observed neither scope nor artifacts.
 *
 * The tests are end-to-end through the registered DSH tools, not private helpers.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { installPalimpsest, trustedDefaultPolicy } from "../src/install.js";
import { GitCliPort } from "../src/effects/index.js";
import type { ProjectStandard } from "../src/domain/standard.js";
import type { DshToolDefinition } from "../src/tools/dsh_types.js";

const cleanups: Array<() => void> = [];
afterAll(() => {
  for (const fn of cleanups) fn();
});

const PASSING = ["node", "-e", "process.exit(0)"];

function standardOf(): ProjectStandard {
  return Object.freeze({
    statement: "tests pass and scope respected",
    clauses: Object.freeze([
      Object.freeze({ kind: "command_succeeds" as const, command: Object.freeze([...PASSING]), predicate: "tests_pass" as const }),
      Object.freeze({ kind: "scope_respected" as const }),
    ]),
    derivedFrom: Object.freeze(["PC1 S01 fixture"]),
    confirmed: true,
    notes: Object.freeze([]),
  });
}

function workspace(): { repo: string; head: string } {
  const root = mkdtempSync(join(tmpdir(), "palimpsest-pc1-s01-"));
  const repo = join(root, "repo");
  mkdirSync(join(repo, "src"), { recursive: true });
  writeFileSync(join(repo, "src", "app.ts"), "export const value = 1;\n");
  execFileSync("git", ["init", "-q"], { cwd: repo });
  execFileSync("git", ["add", "-A"], { cwd: repo });
  execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "init"], { cwd: repo });
  cleanups.push(() => {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      // Windows may keep sqlite handles busy; the OS reaps the directory.
    }
  });
  return { repo, head: execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo }).toString().trim() };
}

function makeStack(repo: string) {
  const git = new GitCliPort(repo, join(repo, ".palimpsest", "worlds"));
  const installed = installPalimpsest(
    { tools: { register: () => () => undefined } } as never,
    {
      projectId: "pc1",
      databasePath: join(repo, ".palimpsest", "p.sqlite"),
      ordariumDatabasePath: join(repo, ".palimpsest", "o.sqlite"),
      repository: repo,
      git,
      execution: "worktree",
      standard: standardOf(),
      policy: trustedDefaultPolicy({ allowed_commands: [{ executable: "node", argv_prefix: ["-e", "process.exit(0)"] }] }),
    } as never,
  );
  cleanups.push(() => void installed.dispose());
  const tool = (name: string): DshToolDefinition => {
    const found = installed.tools.find((entry) => entry.name === name);
    if (found === undefined) throw new Error(`missing tool ${name}`);
    return found;
  };
  const call = async (name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> =>
    (await tool(name).execute(args, {
      callId: `c-${name}`,
      rootCallId: `r-${name}`,
      name,
      arguments: args,
      signal: new AbortController().signal,
    })) as Record<string, unknown>;
  return { installed, call };
}

async function claimedAttempt(
  call: (name: string, args: Record<string, unknown>) => Promise<Record<string, unknown>>,
  head: string,
): Promise<{ attemptId: string; worldPath: string }> {
  await call("palimpsest_start", {
    projectId: "pc1",
    goal: "ship one deliverable",
    headCommit: head,
    tasks: [
      {
        task_id: "deliver",
        objective: "write the deliverable",
        depends_on: [],
        write_paths: ["deliverable.md"],
        required_artifacts: ["deliverable.md"],
      },
    ],
  });
  await call("palimpsest_next", {});
  const created = (await call("palimpsest_next", {})) as { entityId: string };
  const claimed = (await call("palimpsest_claim", { attemptId: created.entityId })) as { worldPath?: string; worktreePath?: string };
  const worldPath = claimed.worldPath ?? claimed.worktreePath;
  if (typeof worldPath !== "string" || worldPath === "") throw new Error("claim returned no world path");
  return { attemptId: created.entityId, worldPath };
}

function commitInWorld(world: string, message: string): string {
  execFileSync("git", ["add", "-A"], { cwd: world });
  execFileSync("git", ["-c", "user.email=w@w.w", "-c", "user.name=w", "commit", "-qm", message], { cwd: world });
  return execFileSync("git", ["rev-parse", "HEAD"], { cwd: world }).toString().trim();
}

function canonicalCanRead(repo: string, commit: string): boolean {
  try {
    execFileSync("git", ["cat-file", "-e", `${commit}^{commit}`], { cwd: repo });
    return true;
  } catch {
    return false;
  }
}

function canonicalHead(repo: string): string {
  return execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo }).toString().trim();
}

function recordedReport(installed: ReturnType<typeof makeStack>["installed"], attemptId: string): Record<string, unknown> {
  const row = installed.controller.store.connection
    .prepare("SELECT report_json FROM attempts WHERE attempt_id=?")
    .get(attemptId as never) as { report_json: Uint8Array | null };
  if (row.report_json === null) throw new Error("no report recorded");
  return JSON.parse(new TextDecoder().decode(row.report_json)) as Record<string, unknown>;
}

describe("PC1 S01-R02: the legacy report path exports the result object", () => {
  it("records the full OID, makes it readable in the canonical ODB, and leaves the canonical HEAD unmoved", async () => {
    const { repo, head } = workspace();
    const { installed, call } = makeStack(repo);
    const { attemptId, worldPath } = await claimedAttempt(call, head);

    writeFileSync(join(worldPath, "deliverable.md"), "# delivered\n");
    const full = commitInWorld(worldPath, "deliverable");

    // The caller supplies only a short spelling — exactly the C6-R P1 report input.
    const event = (await call("palimpsest_report", {
      attemptId,
      workerStatus: "completed",
      summary: "delivered",
      changedFiles: ["deliverable.md"],
      producedArtifacts: ["deliverable.md"],
      resultCommit: full.slice(0, 7),
    })) as { eventType: string };
    expect(event.eventType).toBe("ATTEMPT_COMPLETED");

    const report = recordedReport(installed, attemptId);
    expect(report.result_commit).toBe(full);
    expect(String(report.result_commit)).toHaveLength(40);
    expect(canonicalCanRead(repo, full)).toBe(true);
    // Object availability is not canonical state: no ref, working tree or project head moved.
    expect(canonicalHead(repo)).toBe(head);
  });

  it("the exported result can be promoted to the canonical head in the same session", async () => {
    const { repo, head } = workspace();
    const { installed, call } = makeStack(repo);
    const { attemptId, worldPath } = await claimedAttempt(call, head);

    writeFileSync(join(worldPath, "deliverable.md"), "# delivered\n");
    const full = commitInWorld(worldPath, "deliverable");
    await call("palimpsest_report", {
      attemptId,
      workerStatus: "completed",
      summary: "delivered",
      changedFiles: ["deliverable.md"],
      producedArtifacts: ["deliverable.md"],
      resultCommit: full.slice(0, 7),
    });

    // The report leaves the task ACTIVE until the next scheduling step; promotion requires VERIFYING.
    installed.controller.step();
    const promoted = await installed.controller.promotions.promoteAttempt({ attemptId });
    expect(promoted.resultingHeadCommit).not.toBe(head);
    expect(canonicalHead(repo)).toBe(promoted.resultingHeadCommit);
    // The promoted head contains the result commit.
    expect(() =>
      execFileSync("git", ["merge-base", "--is-ancestor", full, "HEAD"], { cwd: repo, stdio: "ignore" }),
    ).not.toThrow();
  });

  it("recovers an uncertain promotion once the result object is readable", async () => {
    const { repo, head } = workspace();
    const { installed, call } = makeStack(repo);
    const { attemptId, worldPath } = await claimedAttempt(call, head);

    writeFileSync(join(worldPath, "deliverable.md"), "# delivered\n");
    const full = commitInWorld(worldPath, "deliverable");
    await call("palimpsest_report", {
      attemptId,
      workerStatus: "completed",
      summary: "delivered",
      changedFiles: ["deliverable.md"],
      producedArtifacts: ["deliverable.md"],
      resultCommit: full.slice(0, 7),
    });
    installed.controller.step();

    // Recreate the EXACT C6-R shape: the report names a full OID, but the canonical ODB can no
    // longer read it (the world still has it). This is the condition the pre-fix report produced by
    // never exporting at all.
    const loose = join(repo, ".git", "objects", full.slice(0, 2), full.slice(2));
    rmSync(loose, { force: true });
    expect(canonicalCanRead(repo, full)).toBe(false);

    // The effect starts, the merge cannot resolve the object, and the operation is left UNCERTAIN.
    await expect(installed.controller.promotions.promoteAttempt({ attemptId })).rejects.toThrow();
    // The canonical head must not have moved, and the Work must not be silently satisfied.
    expect(canonicalHead(repo)).toBe(head);

    // Recovery prerequisite: make the object readable again (object-only, no ref or head move).
    execFileSync("git", ["fetch", "--no-tags", worldPath, "HEAD"], { cwd: repo });
    expect(canonicalCanRead(repo, full)).toBe(true);
    expect(canonicalHead(repo)).toBe(head);

    const recovery = await installed.controller.promotions.reconcileAll();
    expect(recovery.blocked).toEqual([]);
    expect(recovery.terminal.length).toBe(1);
    const terminal = recovery.terminal[0] as { outcome: string; resultingHeadCommit?: string };
    expect(terminal.outcome).toBe("committed");
    expect(canonicalHead(repo)).toBe(terminal.resultingHeadCommit);
    expect(canonicalHead(repo)).not.toBe(head);
  });

  it("refuses to record a completed result whose world cannot be exported", async () => {
    const { repo, head } = workspace();
    const { installed, call } = makeStack(repo);
    const { attemptId, worldPath } = await claimedAttempt(call, head);

    writeFileSync(join(worldPath, "deliverable.md"), "# delivered\n");
    commitInWorld(worldPath, "deliverable");
    // Break the world's Git directory after the commit: the observation still names a HEAD, but no
    // export can import it. The report must refuse rather than name an unreadable commit.
    rmSync(worldPath, { recursive: true, force: true });
    await expect(
      call("palimpsest_report", {
        attemptId,
        workerStatus: "completed",
        summary: "delivered",
        changedFiles: ["deliverable.md"],
        producedArtifacts: ["deliverable.md"],
      }),
    ).rejects.toThrow(/has no work execution world|not a readable repository|RESULT_NOT_EXPORTED/u);
    const row = installed.controller.store.connection
      .prepare("SELECT state FROM attempts WHERE attempt_id=?")
      .get(attemptId as never) as { state: string };
    expect(row.state).not.toBe("COMPLETED");
  });
});

describe("PC1 S01-R05: structural evidence is produced by the product", () => {
  it("a gate cannot label an unrelated command as write_scope_valid or expected_files_exist", async () => {
    const { repo, head } = workspace();
    const { installed, call } = makeStack(repo);
    const { attemptId, worldPath } = await claimedAttempt(call, head);

    writeFileSync(join(worldPath, "outside.txt"), "not in scope\n");
    await expect(
      call("palimpsest_gate", {
        attemptId,
        predicate: "write_scope_valid",
        command: ["node", "-e", "process.exit(0)"],
      }),
    ).rejects.toThrow(/STRUCTURAL_OBSERVATION_FAILED|outside write_paths/u);

    const evidence = installed.controller.store.connection
      .prepare("SELECT COUNT(*) AS c FROM evidence WHERE project_id=?")
      .get("pc1" as never) as { c: number };
    expect(evidence.c).toBe(0);

    writeFileSync(join(worldPath, "deliverable.md"), "# delivered\n");
    rmSync(join(worldPath, "outside.txt"));
    commitInWorld(worldPath, "deliverable");
    const gate = (await call("palimpsest_gate", {
      attemptId,
      predicate: "write_scope_valid",
      command: ["node", "-e", "process.exit(0)"],
    })) as { evidenceId: string; exitCode: number | null };
    expect(gate.exitCode).toBeNull();
    const atom = installed.controller.store.connection
      .prepare("SELECT json_extract(evidence_json,'$.predicate') AS predicate, json_extract(evidence_json,'$.producer') AS producer, json_extract(evidence_json,'$.command') AS command, json_extract(evidence_json,'$.exit_code') AS exit_code FROM evidence WHERE evidence_id=?")
      .get(gate.evidenceId as never) as { predicate: string; producer: string; command: string | null; exit_code: number | null };
    expect(atom.predicate).toBe("write_scope_valid");
    expect(atom.producer).toBe("palimpsest-gate");
    expect(atom.command).toBeNull();
    expect(atom.exit_code).toBeNull();
    // The observation names the actual tree, not the caller's command.
    const value = installed.controller.store.connection
      .prepare("SELECT json_extract(evidence_json,'$.value.changed_files') AS files FROM evidence WHERE evidence_id=?")
      .get(gate.evidenceId as never) as { files: string };
    expect(JSON.parse(value.files)).toContain("deliverable.md");

    // And the product-observed structural evidence can PASS a real gate: the gate is satisfied by
    // the observation, not by the caller's command.
    const { parseGateDefinition } = await import("../src/evidence/index.js");
    installed.controller.declareGate(
      parseGateDefinition({
        gate_id: "pc1-release",
        version: 1,
        subject_type: "attempt",
        require: {
          all: [
            { exists: { predicate: "write_scope_valid" } },
            { exists: { predicate: "expected_files_exist" } },
          ],
        },
      }),
      "PC1 S01 test",
    );
    await call("palimpsest_gate", { attemptId, predicate: "expected_files_exist" });
    const verdict = installed.controller.evaluateGate("pc1-release", "attempt", attemptId);
    expect(verdict.verdict).toBe("PASS");
  });

  it("a structural gate refuses to invent an artifact observation", async () => {
    const { repo, head } = workspace();
    const { call } = makeStack(repo);
    const { attemptId } = await claimedAttempt(call, head);
    await expect(
      call("palimpsest_gate", { attemptId, predicate: "expected_files_exist" }),
    ).rejects.toThrow(/missing required artifacts|STRUCTURAL_OBSERVATION_FAILED/u);
  });
});
