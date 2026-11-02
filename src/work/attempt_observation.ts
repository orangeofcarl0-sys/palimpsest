/**
 * PC1 S01 — placement-aware attempt observation, extracted from `ProjectController` to keep the Work
 * façade under its measured LOC ratchet. The behaviour is unchanged: one observation over whatever
 * tree the deployment places work in, failing closed when a named world is absent.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { DomainValidationError } from "../domain/index.js";

export type AttemptPlacement = "in-place" | "worktree";

export interface AttemptObservation {
  readonly attemptId: string;
  readonly placement: AttemptPlacement;
  readonly workDir: string;
  readonly baseCommit: string;
  readonly observedHead: string;
  readonly committedChanges: readonly string[];
  readonly uncommittedChanges: readonly string[];
  readonly changedFiles: readonly string[];
  readonly requiredArtifacts: readonly { readonly path: string; readonly present: boolean }[];
}

export interface WorkDirInput {
  readonly attemptId: string;
  readonly execution: "in-place" | "worktree";
  readonly canonicalRepository: string;
  readonly worldPath: string | undefined;
}

export function attemptWorkDir(input: WorkDirInput): { readonly placement: AttemptPlacement; readonly workDir: string } | null {
  if (input.execution === "in-place") {
    return { placement: "in-place", workDir: input.canonicalRepository };
  }
  const workDir = input.worldPath;
  if (workDir === undefined || workDir === "") return null;
  if (!existsSync(workDir)) {
    throw new DomainValidationError(
      `attempt ${input.attemptId} has no work execution world at "${workDir}" — nothing can be observed there, and an absent tree is not an empty one`,
    );
  }
  return { placement: "worktree", workDir };
}

export function observeAttemptResult(input: {
  readonly attemptId: string;
  readonly baseCommit: string;
  readonly execution: "in-place" | "worktree";
  readonly canonicalRepository: string;
  readonly worldPath: string | undefined;
  readonly requiredArtifacts: readonly string[];
}): AttemptObservation | null {
  const target = attemptWorkDir(input);
  if (target === null) return null;
  const { placement, workDir } = target;
  const run = (args: string[]): string => execFileSync("git", args, { cwd: workDir, encoding: "utf8" });
  const committedChanges = run(["diff", "--name-only", input.baseCommit, "HEAD"])
    .split(String.fromCharCode(10))
    .map((path: string) => path.trim())
    .filter((path: string) => path !== "" && !path.startsWith(".palimpsest/"));
  const uncommittedChanges = run(["status", "--porcelain"])
    .split(String.fromCharCode(10))
    .filter((line: string) => line.trim() !== "")
    .map((line: string) => line.slice(3).trim())
    .filter((path: string) => !path.startsWith(".palimpsest/"));
  const changedFiles = [...new Set([...committedChanges, ...uncommittedChanges])].sort();
  const observedHead = run(["rev-parse", "HEAD"]).trim();
  const requiredArtifacts = input.requiredArtifacts.map((path) =>
    Object.freeze({ path, present: existsSync(join(workDir, path)) }),
  );
  return Object.freeze({
    attemptId: input.attemptId,
    placement,
    workDir,
    baseCommit: input.baseCommit,
    observedHead,
    committedChanges: Object.freeze(committedChanges),
    uncommittedChanges: Object.freeze(uncommittedChanges),
    changedFiles: Object.freeze(changedFiles),
    requiredArtifacts: Object.freeze(requiredArtifacts),
  });
}
