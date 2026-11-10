import { execFileSync } from "node:child_process";
import {
  assertObligationScope, isFullCommit, revisionError, revisionReceiptId, WorkRevisionError,
  type WorkRevisionBinding, type WorkRevisionCheck, type WorkRevisionReceipt,
} from "../schema/work_revision.js";

type Entry = { readonly mode: string; readonly blob: string };

function git(repository: string, ...args: string[]): string {
  return execFileSync("git", ["--no-optional-locks", "--literal-pathspecs", "-C", repository, ...args], {
    encoding: "utf8", maxBuffer: 8 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, GIT_NO_REPLACE_OBJECTS: "1" },
  });
}

function entries(repository: string, commit: string, paths: readonly string[]): Map<string, Entry> {
  const result = new Map<string, Entry>();
  if (paths.length === 0) return result;
  for (const line of git(repository, "ls-tree", "-z", commit, "--", ...paths).split("\0").filter(Boolean)) {
    const row = /^(100644|100755) blob ([0-9a-f]+)\t([\s\S]+)$/u.exec(line);
    if (row && isFullCommit(row[2]) && row[1] !== undefined && row[3] !== undefined) {
      result.set(row[3], { mode: row[1], blob: row[2] });
    }
  }
  return result;
}

export function assertRevisionBasis(repository: string, binding: Pick<WorkRevisionBinding, "basis" | "obligations" | "writePaths">): void {
  const { basis, obligations, writePaths } = binding;
  assertObligationScope(obligations, writePaths);
  if (!isFullCommit(basis)) throw revisionError("HEAD_BASIS_MISMATCH", "Use the full authorized basis commit.", "REOBSERVE");
  let preserved: Map<string, Entry>;
  try {
    if (git(repository, "rev-parse", "--verify", `${basis}^{commit}`).trim() !== basis) throw new Error("not a commit");
    preserved = entries(repository, basis, obligations.rules.mustPreserve);
    for (const entry of preserved.values()) git(repository, "cat-file", "-e", `${entry.blob}^{blob}`);
  } catch {
    throw revisionError("HEAD_BASIS_MISMATCH", "The authorized basis or its protected blobs cannot be read.", "REOBSERVE");
  }
  const missing = obligations.rules.mustPreserve.filter(path => !preserved.has(path));
  if (missing.length) throw revisionError("PROTECTED_BASIS_MISSING", "The basis lacks a protected regular file.", "REQUEST_OPERATOR", missing);
}

/** Only Git facts enter the receipt. The Worker can preview them in its own world. */
export function inspectWorkRevision(repository: string, binding: WorkRevisionBinding, expectedCandidate?: string): WorkRevisionReceipt {
  assertRevisionBasis(repository, binding);
  const { basis, writePaths, obligations, taskId, attemptId, envelopeId } = binding;
  const { mustChange, mustExist, mustPreserve } = obligations.rules;
  let candidate: string | null = null;
  try {
    candidate = git(repository, "rev-parse", "--verify", "HEAD^{commit}").trim();
    if (!isFullCommit(candidate) || (expectedCandidate !== undefined && candidate !== expectedCandidate)) {
      throw revisionError("RESULT_DRIFT", "Re-observe HEAD before submitting the candidate again.", "REOBSERVE", [], candidate);
    }
    if (candidate === basis || git(repository, "merge-base", basis, candidate).trim() !== basis) {
      throw revisionError("RESULT_BASIS_MISMATCH", "Commit the revision on top of the authorized basis.", "FIX_CANDIDATE", [], candidate);
    }
    const changed = git(repository, "diff", "--no-ext-diff", "--no-renames", "--name-only", "-z", basis, candidate, "--")
      .split("\0").filter(Boolean).sort();
    const paths = [...new Set([...changed, ...mustChange, ...mustExist, ...mustPreserve])];
    const before = entries(repository, basis, paths);
    const after = entries(repository, candidate, paths);
    const check = (kind: WorkRevisionCheck["kind"], path: string, passed: boolean): WorkRevisionCheck => ({
      kind, path, passed, basisBlob: before.get(path)?.blob ?? null, candidateBlob: after.get(path)?.blob ?? null,
    });
    const checks = [
      ...changed.map(path => check("WRITE_SCOPE", path, writePaths.includes(path))),
      ...mustChange.map(path => check("MUST_CHANGE", path, before.get(path)?.blob !== after.get(path)?.blob)),
      ...mustExist.map(path => check("MUST_EXIST", path, after.has(path))),
      ...mustPreserve.map(path => check("MUST_PRESERVE", path,
        before.get(path)?.blob === after.get(path)?.blob && before.get(path)?.mode === after.get(path)?.mode)),
    ];
    if (git(repository, "status", "--porcelain", "--untracked-files=all").trim() !== "") {
      throw revisionError("UNCOMMITTED_WORK", "Commit or revert uncommitted changes before submitting.", "FIX_CANDIDATE", [], candidate);
    }
    if (git(repository, "rev-parse", "--verify", "HEAD^{commit}").trim() !== candidate) {
      throw revisionError("RESULT_DRIFT", "HEAD moved during inspection. Inspect the new candidate.", "REOBSERVE", [], candidate);
    }
    const identity = { taskId, attemptId, envelopeId, basis, candidate, obligationsDigest: obligations.digest };
    return { schemaVersion: 1, phase: "PREVIEW", ...identity, receiptId: revisionReceiptId(identity), checks };
  } catch (error) {
    if (error instanceof WorkRevisionError) throw error;
    throw revisionError("CANDIDATE_UNOBSERVABLE", "Read the candidate Git objects and try again.", "REOBSERVE", [], candidate);
  }
}

export function requireWorkRevision(receipt: WorkRevisionReceipt): void {
  const failures = receipt.checks.filter(check => !check.passed);
  if (failures.length) {
    const reason = failures.some(check => check.kind === "MUST_PRESERVE") ? "PROTECTED_FILE_CHANGED"
      : failures.some(check => check.kind === "WRITE_SCOPE") ? "OUT_OF_SCOPE"
      : failures.some(check => check.kind === "MUST_EXIST") ? "REQUIRED_FILE_MISSING" : "REQUIRED_FILE_UNCHANGED";
    throw revisionError(reason, "Correct the failed candidate checks and commit again.", "FIX_CANDIDATE",
      [...new Set(failures.map(check => check.path))].sort(), receipt.candidate);
  }
}
