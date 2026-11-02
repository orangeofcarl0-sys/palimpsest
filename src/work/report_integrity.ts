/**
 * PC1 S01 — result-object export and structural gate observation, extracted from `ProjectController`
 * to keep the measured Work façade under its LOC ratchet.
 *
 * These are pure host-side helpers over ports the controller already owns. They add no authority:
 * the export moves object availability only, and the structural observation records an atom only
 * when the fact actually holds.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { DomainValidationError } from "../domain/index.js";

export interface ExportAndResolveInput {
  readonly attemptId: string;
  readonly commit: string;
  readonly repository: string | undefined;
  readonly execution: "in-place" | "worktree";
  readonly exportResultCommitSync?:
    | ((input: { readonly attemptId: string; readonly commit: string }) => { readonly imported: boolean; readonly detail: string })
    | undefined;
  readonly workDir: () => string | null;
  readonly canonicalRepository: () => string;
}

export function exportAndResolveResultCommit(input: ExportAndResolveInput): string {
  if (input.repository === undefined || input.repository === "") return input.commit;
  if (input.execution !== "in-place") {
    const sync = input.exportResultCommitSync;
    if (sync !== undefined) {
      const outcome = sync({ attemptId: input.attemptId, commit: input.commit });
      if (!outcome.imported) {
        throw new DomainValidationError(
          `RESULT_NOT_EXPORTED: attempt ${input.attemptId}'s result commit ${input.commit.slice(0, 12)} cannot be made readable in the canonical object database (${outcome.detail}); recording it would name a commit the project cannot materialize`,
        );
      }
    } else {
      const workDir = input.workDir();
      if (workDir === null) {
        throw new DomainValidationError(
          `RESULT_NOT_EXPORTED: attempt ${input.attemptId} has no readable execution world to export its result from`,
        );
      }
      try {
        execFileSync("git", ["fetch", "--no-tags", workDir, "HEAD"], { cwd: input.canonicalRepository(), encoding: "utf8" });
      } catch (error) {
        throw new DomainValidationError(
          `RESULT_NOT_EXPORTED: attempt ${input.attemptId}'s result commit ${input.commit.slice(0, 12)} could not be imported from its world (${error instanceof Error ? error.message : String(error)})`,
        );
      }
    }
  }
  try {
    return execFileSync("git", ["rev-parse", "--verify", `${input.commit}^{commit}`], {
      cwd: input.canonicalRepository(),
      encoding: "utf8",
    }).trim();
  } catch (error) {
    throw new DomainValidationError(
      `RESULT_NOT_EXPORTED: the canonical repository cannot resolve attempt ${input.attemptId}'s result commit ${input.commit.slice(0, 12)} (${error instanceof Error ? error.message : String(error)})`,
    );
  }
}

export interface ObservedAttemptLike {
  readonly changedFiles: readonly string[];
}

export interface StructuralGateInput {
  readonly attemptId: string;
  readonly predicate: "write_scope_valid" | "expected_files_exist";
  readonly writePaths: readonly string[];
  readonly requiredArtifacts: readonly string[];
  readonly observedArtifacts?: readonly string[] | undefined;
  readonly workDir: string;
  readonly observed: ObservedAttemptLike | null;
  readonly record: (
    predicate: "write_scope_valid" | "expected_files_exist",
    value: Record<string, unknown>,
  ) => unknown;
}

export function observeStructuralGate(input: StructuralGateInput): unknown {
  if (input.predicate === "write_scope_valid") {
    if (input.observed === null) {
      throw new DomainValidationError(
        `attempt ${input.attemptId}'s result cannot be observed, so write scope cannot be qualified`,
      );
    }
    const outOfScope = input.observed.changedFiles.filter(
      (path) => !input.writePaths.some((allowed) => path === allowed || path.startsWith(`${allowed}/`)),
    );
    if (outOfScope.length > 0) {
      throw new DomainValidationError(
        `STRUCTURAL_OBSERVATION_FAILED: attempt ${input.attemptId} changed paths outside write_paths [${input.writePaths.join(", ")}]: ${outOfScope.join(", ")} — no write_scope_valid atom is recorded for a scope that is not valid`,
      );
    }
    return input.record("write_scope_valid", {
      changed_files: [...input.observed.changedFiles],
      write_paths: [...input.writePaths],
      out_of_scope: [],
    });
  }
  const paths = input.observedArtifacts ?? input.requiredArtifacts;
  const missing = paths.filter((path) => !existsSync(join(input.workDir, path)));
  if (missing.length > 0) {
    throw new DomainValidationError(
      `STRUCTURAL_OBSERVATION_FAILED: attempt ${input.attemptId} is missing required artifacts: ${missing.join(", ")} — no expected_files_exist atom is recorded for files that do not exist`,
    );
  }
  return input.record("expected_files_exist", { paths: [...paths], missing: [] });
}
