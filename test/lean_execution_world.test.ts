/**
 * PLMP-LEAN-1 §D2-cR — the EXECUTION WORLD contract: lifecycle, recovery honesty, and result export.
 *
 * The D2-c live gate measured one sentence and this file pins its consequences:
 *
 *     Work Execution World must own its mutable execution state.
 *
 * A linked worktree does not — its HEAD, refs and index live in the canonical repository, outside the
 * world — so a confined worker could not commit. The world here is a repository of its own that BORROWS
 * the canonical object store read-only and owns everything it must write.
 *
 * The rest of the file is about what a world must NOT do: it must not be re-created when it is missing
 * (the work may have existed), it must not be deleted because a process exited, and exporting its result
 * must not change the canonical project by a single byte.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

// Imported from the module rather than the effects barrel: the barrel's export list is frozen, and
// these two constants are internal vocabulary, not a new public name.
import { WORKER_COMMIT_EMAIL, WORKER_COMMIT_NAME } from "../src/effects/git_port.js";
import { gitRepositoryWorldPort } from "../src/deployment/execution_world.js";

const cleanups: Array<() => void> = [];
afterAll(() => {
  for (const fn of cleanups) fn();
});

const git = (cwd: string, args: readonly string[]): string =>
  execFileSync("git", [...args], { cwd, encoding: "utf8" }).trim();

function canonicalRepo(): { repo: string; worldsRoot: string; head: string } {
  const root = mkdtempSync(join(tmpdir(), "palimpsest-world-"));
  const repo = join(root, "repo");
  mkdirSync(join(repo, "src"), { recursive: true });
  writeFileSync(join(repo, "src", "a.ts"), "export const a = 1;\n");
  execFileSync("git", ["init", "-q"], { cwd: repo });
  execFileSync("git", ["add", "-A"], { cwd: repo });
  execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "H0"], { cwd: repo });
  cleanups.push(() => {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      // Windows keeps the directory busy while a git handle is open; the OS reaps it.
    }
  });
  return { repo, worldsRoot: join(repo, ".palimpsest", "worlds"), head: git(repo, ["rev-parse", "HEAD"]) };
}

/** Materialize a world the way the product does: through the git port's own `createWorld`. */
async function materialize(repo: string, worldsRoot: string, attemptId: string, basisCommit: string): Promise<string> {
  const { GitCliPort } = await import("../src/effects/index.js");
  const port = new GitCliPort(repo, worldsRoot);
  const created = await port.createWorld({ worktreeId: attemptId, baseCommit: basisCommit });
  return created.worldPath;
}

describe("§D2-cR 1. the world owns what it must write", () => {
  it("materializes a repository whose mutable git state is INSIDE it, borrowing the base read-only", async () => {
    const { repo, worldsRoot, head } = canonicalRepo();
    const worldDir = await materialize(repo, worldsRoot, "attempt-1", head);

    // Mutable state inside: HEAD, refs, index, config.
    for (const inside of [".git", join(".git", "HEAD"), join(".git", "config")]) {
      expect(existsSync(join(worldDir, inside)), `${inside} must be inside the world`).toBe(true);
    }
    // The immutable base is BORROWED, not copied: that is what makes this a "self-contained MUTABLE
    // repository world" rather than a full clone, and the naming has to be exact about it.
    expect(existsSync(join(worldDir, ".git", "objects", "info", "alternates"))).toBe(true);
    // …and the canonical object store is genuinely the borrowed half: the world reads a commit it does
    // not have objects for.
    expect(git(worldDir, ["cat-file", "-e", `${head}^{commit}`])).toBe("");
    // …and it is at the exact basis.
    expect(git(worldDir, ["rev-parse", "HEAD"])).toBe(head);
    // No path back into the canonical project.
    expect(git(worldDir, ["remote"])).toBe("");
    // Operational identity, never the user's and never a durable agent's.
    expect(git(worldDir, ["config", "user.name"])).toBe(WORKER_COMMIT_NAME);
    expect(git(worldDir, ["config", "user.email"])).toBe(WORKER_COMMIT_EMAIL);
    // The canonical repository does not know this world as a linked worktree — the shape that could not
    // commit is not what was materialized.
    expect(git(repo, ["worktree", "list"])).not.toContain("attempt-1");
  });

  it("a worker commits inside the world, and the canonical repository is untouched", async () => {
    const { repo, worldsRoot, head } = canonicalRepo();
    const worldDir = await materialize(repo, worldsRoot, "attempt-2", head);

    writeFileSync(join(worldDir, "src", "a.ts"), "export const a = 2;\n");
    execFileSync("git", ["add", "-A"], { cwd: worldDir });
    execFileSync("git", ["commit", "-qm", "the worker's own commit"], { cwd: worldDir });
    const result = git(worldDir, ["rev-parse", "HEAD"]);
    expect(result).not.toBe(head);
    expect(git(worldDir, ["log", "-1", "--format=%an <%ae>"])).toBe(`${WORKER_COMMIT_NAME} <${WORKER_COMMIT_EMAIL}>`);
    expect(git(worldDir, ["status", "--porcelain"])).toBe("");
    // The canonical world still holds nothing of it.
    expect(git(repo, ["rev-parse", "HEAD"])).toBe(head);
    expect(git(repo, ["status", "--porcelain"]).trim()).toBe("?? .palimpsest/");
    expect(git(repo, ["show", "HEAD:src/a.ts"])).toContain("export const a = 1;");
  });
});

describe("§D2-cR 2. an absent world is never re-created", () => {
  it("open() fails closed on a missing world instead of materializing a fresh one", async () => {
    const { repo, worldsRoot, head } = canonicalRepo();
    const port = gitRepositoryWorldPort({ repository: repo, worldsRoot });
    const attemptId = "attempt-3";
    await materialize(repo, worldsRoot, attemptId, head);

    // A world that should exist and does not may have held hours of uncommitted work. Re-cloning at
    // the basis would discard it silently, so the answer is a refusal.
    rmSync(port.worldDir(attemptId), { recursive: true, force: true });
    const opened = port.open(attemptId);
    expect(opened.ok).toBe(false);
    if (opened.ok) return;
    expect(opened.detail).toContain("WORLD_MISSING");
    expect(opened.detail).toContain("not re-created");
    expect(existsSync(port.worldDir(attemptId))).toBe(false);
  });

  it("reopening an existing world is stable across a restart (no second world, no new basis)", async () => {
    const { repo, worldsRoot, head } = canonicalRepo();
    const attemptId = "attempt-4";
    const worldDir = await materialize(repo, worldsRoot, attemptId, head);
    writeFileSync(join(worldDir, "src", "a.ts"), "export const a = 3;\n");
    execFileSync("git", ["add", "-A"], { cwd: worldDir });
    execFileSync("git", ["commit", "-qm", "work in progress"], { cwd: worldDir });
    const result = git(worldDir, ["rev-parse", "HEAD"]);

    // A restart is a NEW reader of the same world, not a reason to make another one.
    const port = gitRepositoryWorldPort({ repository: repo, worldsRoot });
    const reopened = port.open(attemptId);
    expect(reopened.ok).toBe(true);
    if (!reopened.ok) return;
    expect(reopened.world.worldDir).toBe(worldDir);
    expect(reopened.world.head).toBe(result);
    expect(git(worldDir, ["status", "--porcelain"])).toBe("");
  });
});

describe("§D2-cR 3. result export is object availability, not project state", () => {
  it("imports the world's result into the canonical object database and changes nothing else", async () => {
    const { repo, worldsRoot, head } = canonicalRepo();
    const attemptId = "attempt-5";
    const worldDir = await materialize(repo, worldsRoot, attemptId, head);
    writeFileSync(join(worldDir, "src", "a.ts"), "export const a = 4;\n");
    execFileSync("git", ["add", "-A"], { cwd: worldDir });
    execFileSync("git", ["commit", "-qm", "candidate"], { cwd: worldDir });
    const result = git(worldDir, ["rev-parse", "HEAD"]);

    const before = {
      head: git(repo, ["rev-parse", "HEAD"]),
      dirty: git(repo, ["status", "--porcelain"]),
      refs: git(repo, ["for-each-ref", "--format=%(refname)"]),
      file: git(repo, ["show", "HEAD:src/a.ts"]),
    };
    const port = gitRepositoryWorldPort({ repository: repo, worldsRoot });
    const exported = await port.exportResultCommit({ attemptId, commit: result });
    expect(exported.imported, exported.detail).toBe(true);
    expect(exported.detail).toContain("no ref, working tree or project revision changed");

    // The objects are READABLE now…
    expect(git(repo, ["cat-file", "-e", `${result}^{commit}`])).toBe("");
    expect(git(repo, ["show", `${result}:src/a.ts`])).toContain("export const a = 4;");
    // …and nothing about the project moved: no ref, no working tree, no revision.
    expect(git(repo, ["rev-parse", "HEAD"])).toBe(before.head);
    expect(git(repo, ["status", "--porcelain"])).toBe(before.dirty);
    expect(git(repo, ["for-each-ref", "--format=%(refname)"])).toBe(before.refs);
    expect(git(repo, ["show", "HEAD:src/a.ts"])).toBe(before.file);
  });

  it("refuses to export from a world that is gone", async () => {
    const { repo, worldsRoot, head } = canonicalRepo();
    const port = gitRepositoryWorldPort({ repository: repo, worldsRoot });
    await materialize(repo, worldsRoot, "attempt-6", head);
    rmSync(port.worldDir("attempt-6"), { recursive: true, force: true });
    const exported = await port.exportResultCommit({ attemptId: "attempt-6", commit: head });
    expect(exported.imported).toBe(false);
    expect(exported.detail).toContain("WORLD_MISSING");
  });
});

describe("§D2-cR 4. release is explicit, never a side effect of a process ending", () => {
  it("keeps the world after its worker is gone, and only release() removes it", async () => {
    const { repo, worldsRoot, head } = canonicalRepo();
    const attemptId = "attempt-7";
    const worldDir = await materialize(repo, worldsRoot, attemptId, head);
    writeFileSync(join(worldDir, "src", "a.ts"), "export const a = 5;\n");

    // The worker process ended (or never started) — and the world, with its uncommitted work, is still
    // there. Nothing in this layer deletes it, because nothing here knows whether that work matters.
    const port = gitRepositoryWorldPort({ repository: repo, worldsRoot });
    expect(port.open(attemptId).ok).toBe(true);
    expect(existsSync(join(worldDir, "src", "a.ts"))).toBe(true);

    await port.release(attemptId);
    expect(existsSync(worldDir)).toBe(false);
    // Releasing twice is not an error: a caller that already released cannot corrupt anything.
    await port.release(attemptId);
  });
});
