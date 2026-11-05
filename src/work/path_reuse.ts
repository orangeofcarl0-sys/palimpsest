/**
 * PWRS-B — PATH-LEVEL REUSE FACTS, as ONE computation.
 *
 * ALHS-B introduced `unaffected` / `conflicted` / `already-present` for a COMPLETED result. PWRS-B
 * needs the same facts for a RETAINED attempt world (a worker that stopped before the task settled),
 * so the relay can show a successor what is still valid instead of forcing a from-scratch redo.
 *
 * The facts are path-level only. They narrow what must be inspected; they never prove a semantic
 * claim still holds (an unchanged vendor price can still be expired). The detail string says so on
 * every plan, and no caller is allowed to treat `unaffectedPaths` as accepted content.
 *
 * This module owns the DIFF, not the policy: composition/continuation uses it for completed results,
 * and the Work relay uses it for retained worlds. One implementation, two callers.
 *
 * Layer: L2 (`src/work/`).
 */
import { execFileSync } from "node:child_process";

export interface PathReuseFacts {
  readonly baseRevision: string;
  readonly resultRevision: string;
  readonly currentRevision: string;
  readonly resultPaths: readonly string[];
  readonly unaffectedPaths: readonly string[];
  readonly alreadyPresentPaths: readonly string[];
  readonly conflictedPaths: readonly string[];
  readonly complete: boolean;
  readonly detail: string;
}

/** Read git from one repository, returning null (not throwing) when the read fails. */
export function gitTextRunner(repository: string): (args: readonly string[]) => string | null {
  return (args: readonly string[]): string | null => {
    try {
      return execFileSync("git", ["-C", repository, ...args], {
        encoding: "utf8",
        maxBuffer: 8 * 1024 * 1024,
      });
    } catch {
      return null;
    }
  };
}

/**
 * Compute the path-level reuse facts between a base, a result and the current revision.
 *
 * A path is `already-present` when the current tree holds the SAME blob as the result; `conflicted`
 * when it differs; `unaffected` when the current tree never touched it since the base. A null return
 * means the diff could not be read, which is reported as "unknown", never as "nothing to reuse".
 */
export function planPathReuse(input: {
  readonly run: (args: readonly string[]) => string | null;
  readonly baseRevision: string;
  readonly resultRevision: string;
  readonly currentRevision: string;
}): PathReuseFacts | null {
  const { baseRevision, resultRevision, currentRevision } = input;
  if (baseRevision === "" || resultRevision === "" || currentRevision === "") return null;

  const nameOnly = (from: string, to: string): readonly string[] | null => {
    if (from === to) return [];
    const output = input.run(["diff", "--name-only", "--no-renames", from, to]);
    if (output === null) return null;
    return output
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter((line) => line !== "");
  };

  const resultPaths = nameOnly(baseRevision, resultRevision);
  const currentPaths = nameOnly(baseRevision, currentRevision);
  if (resultPaths === null || currentPaths === null) return null;

  const current = new Set(currentPaths);
  const conflicted: string[] = [];
  const alreadyPresent: string[] = [];
  for (const path of resultPaths) {
    if (!current.has(path)) continue;
    const blob = (revision: string): string | null => {
      const output = input.run(["rev-parse", `${revision}:${path}`]);
      return output === null ? null : output.trim();
    };
    const resultBlob = blob(resultRevision);
    const currentBlob = blob(currentRevision);
    if (resultBlob !== null && resultBlob === currentBlob) alreadyPresent.push(path);
    else conflicted.push(path);
  }
  const unaffected = resultPaths.filter((path) => !current.has(path));
  return Object.freeze({
    baseRevision,
    resultRevision,
    currentRevision,
    resultPaths: Object.freeze(resultPaths),
    unaffectedPaths: Object.freeze(unaffected),
    alreadyPresentPaths: Object.freeze(alreadyPresent),
    conflictedPaths: Object.freeze(conflicted),
    complete: true,
    detail:
      "read from the source tree diff at path granularity. `unaffectedPaths` may still be invalidated by a semantic change the tree diff cannot see; `conflictedPaths` must be recomputed, never overwritten from the old result",
  });
}
