/**
 * PC1 S09 — the ordinary-user CLI path. No private API, no SQLite query, no hand-written JS.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

const cleanups: Array<() => void> = [];
afterAll(() => {
  for (const fn of cleanups) fn();
});

function cli(args: string[], cwd = process.cwd()): { status: number; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, [join(process.cwd(), "dist", "src", "cli.js"), ...args], { cwd, encoding: "utf8" });
  return { status: result.status ?? -1, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

function repo(): { root: string; repo: string; profile: string } {
  const root = mkdtempSync(join(tmpdir(), "palimpsest-pc1-cli-"));
  const path = join(root, "repo");
  mkdirSync(path, { recursive: true });
  writeFileSync(join(path, "README.md"), "# project\n");
  execFileSync("git", ["init", "-q"], { cwd: path });
  execFileSync("git", ["add", "-A"], { cwd: path });
  execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "init"], { cwd: path });
  cleanups.push(() => {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      // sqlite handles may outlive the process on Windows
    }
  });
  return { root, repo: path, profile: join(root, "state", "product-profile.json") };
}

describe("PC1 S09: the product CLI", () => {
  it("doctor, init, continue, context-capsule, outcomes and review list all work from the shell", () => {
    const { repo: path, profile } = repo();
    const doctor = cli(["doctor", `--repo=${path}`]);
    expect(doctor.status).toBe(0);
    const doctorReport = JSON.parse(doctor.stdout) as { schema: string; liveModel: string; checks: Array<{ id: string; status: string }> };
    expect(doctorReport.schema).toBe("pc1-doctor/v1");
    expect(doctorReport.liveModel).toBe("BLOCKED");
    expect(doctor.stdout).not.toMatch(/api[_-]?key|bearer|sk-[a-z0-9]/iu);

    const init = cli([
      "init",
      `--repo=${path}`,
      "--project=cli-project",
      "--goal=Produce a reviewed plan",
      `--profile-file=${profile}`,
      "--operator=operator:alice",
      "--operator-purpose=review project changes",
    ]);
    expect(init.status).toBe(0);
    const initBody = JSON.parse(init.stdout) as { state: string; summary: { projectId: string; goal: string; basis: { projectRevision: number } } };
    expect(initBody.state).toBe("INITIALIZED");
    expect(initBody.summary.projectId).toBe("cli-project");
    expect(initBody.summary.goal).toBe("Produce a reviewed plan");

    const continuation = cli(["continue", `--profile-file=${profile}`]);
    expect(continuation.status).toBe(0);
    const continuationBody = JSON.parse(continuation.stdout) as { summary: { projectId: string }; next: unknown[] };
    expect(continuationBody.summary.projectId).toBe("cli-project");

    const capsule = cli(["context-capsule", `--profile-file=${profile}`, "--max-bytes=4096"]);
    expect(capsule.status).toBe(0);
    const capsuleBody = JSON.parse(capsule.stdout) as { schema: string; usedBytes: number };
    expect(capsuleBody.schema).toBe("pc1-context-capsule/v1");
    expect(capsuleBody.usedBytes).toBeLessThanOrEqual(4096);

    const outcomes = cli(["outcomes", "contracts", `--profile-file=${profile}`]);
    expect(outcomes.status).toBe(0);
    expect(JSON.parse(outcomes.stdout) as unknown[]).toEqual(expect.arrayContaining([expect.objectContaining({ contractId: "json-artifact" })]));

    const list = cli(["review", "list", `--profile-file=${profile}`]);
    expect(list.status).toBe(0);
    expect(JSON.parse(list.stdout)).toEqual([]);
  });

  it("a review decision without the configured operator is refused with a non-zero exit", () => {
    const { repo: path, profile } = repo();
    expect(cli(["init", `--repo=${path}`, "--project=cli-project", "--goal=Produce a plan", `--profile-file=${profile}`, "--operator=operator:alice", "--operator-purpose=review"]).status).toBe(0);
    const refused = cli(["review", "approve", "review-missing", `--profile-file=${profile}`, "--actor=operator:mallory"]);
    expect(refused.status).not.toBe(0);
    expect(refused.stderr).toMatch(/authorized operator|AUTHORITY_UNRESOLVED/u);
  });
});
