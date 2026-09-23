/**
 * PLMP-LEAN-1 §C.11 principle ② — the delegation-time project snapshot. Acceptance DEL-A05 (basis half).
 *
 * The property is not "a checkout happened". It is that the worker's READ BASIS is frozen while the
 * canonical project stays untouched — including when the worker writes into the thing it was handed.
 *
 *     WriteSet_canonical_project(worker) = ∅
 *
 * and, equally important, the basis is the COMMITTED head: an uncommitted principal change is
 * deliberately not copied, because reading a moving dirty tree would be less honest than saying which
 * commit the finding was computed against.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import {
  DelegationSnapshotError,
  gitDelegationSnapshotPort,
} from "../src/deployment/delegation_snapshot.js";

const cleanups: Array<() => void> = [];
afterAll(() => {
  for (const fn of cleanups) fn();
});

function repo(): { dir: string; head: string } {
  const root = mkdtempSync(join(tmpdir(), "palimpsest-snap-"));
  const dir = join(root, "repo");
  mkdirSync(join(dir, "src"), { recursive: true });
  writeFileSync(join(dir, "src", "a.ts"), "export const a = 1;\n");
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
  return { dir, head: execFileSync("git", ["rev-parse", "HEAD"], { cwd: dir }).toString().trim() };
}

const gitIn = (cwd: string, args: readonly string[]): string =>
  execFileSync("git", [...args], { cwd, encoding: "utf8" });

describe("DEL-A05: the research basis is frozen, and the canonical project stays untouched", () => {
  it("freezes the committed head, ignores uncommitted changes, and isolates writes", async () => {
    const { dir, head } = repo();
    const port = gitDelegationSnapshotPort({ repository: dir });

    // An UNCOMMITTED principal change: the target scenario ("delegate B, then start editing A") means
    // this is normal, and the basis must not silently include it.
    writeFileSync(join(dir, "src", "a.ts"), "export const a = 2; // uncommitted\n");

    const snapshot = await port.freeze();
    try {
      expect(snapshot.basisCommit).toBe(head);
      // The basis IS that commit, and only that commit.
      expect(gitIn(snapshot.workDir, ["rev-parse", "HEAD"]).trim()).toBe(head);
      expect(gitIn(snapshot.workDir, ["status", "--porcelain"]).trim()).toBe("");
      expect(gitIn(snapshot.workDir, ["show", "HEAD:src/a.ts"])).toContain("export const a = 1;");
      expect(gitIn(snapshot.workDir, ["show", "HEAD:src/a.ts"])).not.toContain("uncommitted");

      // The worker does the thing we are protecting against: it writes into what it was handed.
      writeFileSync(join(snapshot.workDir, "src", "a.ts"), "export const a = 999; // worker scribble\n");
      writeFileSync(join(snapshot.workDir, "src", "worker.ts"), "export const worker = true;\n");

      // The CANONICAL project is unmoved: same head, and the worker's new file is not there.
      expect(gitIn(dir, ["rev-parse", "HEAD"]).trim()).toBe(head);
      expect(existsSync(join(dir, "src", "worker.ts"))).toBe(false);
      // The principal's own uncommitted edit is still exactly what they left. (`git show :path`
      // would read the INDEX, which was never touched — the working tree is the thing to check.)
      expect(readFileSync(join(dir, "src", "a.ts"), "utf8")).toContain("uncommitted");
    } finally {
      await snapshot.release();
    }

    // Released: gone from disk and from git's worktree list.
    expect(existsSync(snapshot.workDir)).toBe(false);
    expect(gitIn(dir, ["worktree", "list"])).not.toContain(snapshot.workDir.replace(/\\/g, "/"));
  });

  it("release runs even when the caller throws, and a second freeze is independent", async () => {
    const { dir, head } = repo();
    const port = gitDelegationSnapshotPort({ repository: dir });
    let path = "";
    await expect(
      (async () => {
        const snapshot = await port.freeze();
        path = snapshot.workDir;
        try {
          throw new Error("research exploded");
        } finally {
          await snapshot.release();
        }
      })(),
    ).rejects.toThrow(/research exploded/);
    expect(existsSync(path)).toBe(false);

    const a = await port.freeze();
    const b = await port.freeze();
    try {
      expect(a.workDir).not.toBe(b.workDir);
      expect(a.basisCommit).toBe(head);
      expect(b.basisCommit).toBe(head);
    } finally {
      await a.release();
      await b.release();
    }
  });

  it("an unreadable repository fails closed rather than handing the worker a live tree", async () => {
    const notARepo = mkdtempSync(join(tmpdir(), "palimpsest-notrepo-"));
    cleanups.push(() => {
      try {
        rmSync(notARepo, { recursive: true, force: true });
      } catch {
        /* windows handle */
      }
    });
    const port = gitDelegationSnapshotPort({ repository: notARepo });
    await expect(port.freeze()).rejects.toBeInstanceOf(DelegationSnapshotError);
  });
});
