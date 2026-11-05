/**
 * PWRS-D — INPUTS THE ATTEMPT NEVER SAW.
 *
 * The PWRS-R run measured a real failure: a principal read a newly arrived measured source, then
 * committed and settled a draft that predated it. The product could not see the source because the
 * fixture had gitignored `inbox/`; and even when visible, nothing at the settlement boundary named
 * the fact "the project has inputs this attempt's basis never contained".
 *
 * This module answers exactly that question, generically:
 *
 *     untracked / modified paths in the canonical tree that do not exist in the attempt's base
 *
 * It is NOT a semantic judge. A new path may be irrelevant, or decisive; the product only establishes
 * that the attempt's basis did not contain it. A principal settlement must therefore ACKNOWLEDGE the
 * fact (a declaration) before closing the attempt; a worker's own settlement records the fact without
 * blocking, because no model is in that loop to act on a refusal.
 *
 * Layer: L2 (`src/work/`).
 */
import { execFileSync } from "node:child_process";

const STATUS_PREFIX = 3;

/**
 * The paths present in the canonical working tree that the base commit does not contain.
 *
 * `git status --porcelain -z` is used so spaces and quoting cannot silently drop a path. A rename's
 * new path is checked against the base; its old path is skipped. The product's own state root
 * (`.palimpsest/`) is excluded: it is deployment state, not project input.
 */
export function unseenInputs(input: {
  readonly repository: string;
  readonly baseCommit: string;
}): readonly string[] {
  const git = (args: readonly string[]): Buffer | null => {
    try {
      return execFileSync("git", ["-C", input.repository, ...args], {
        maxBuffer: 8 * 1024 * 1024,
        stdio: ["ignore", "pipe", "ignore"],
      });
    } catch {
      return null;
    }
  };
  const status = git(["status", "--porcelain", "-z", "--untracked-files=all"]);
  if (status === null) return Object.freeze([]);
  const entries = status.toString("utf8").split("\0").filter((entry) => entry !== "");
  const paths: string[] = [];
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index]!;
    if (entry.length < STATUS_PREFIX) continue;
    const code = entry.slice(0, 2);
    const path = entry.slice(STATUS_PREFIX);
    // A rename/copy entry carries the original path as the NEXT NUL field.
    if (code.startsWith("R") || code.startsWith("C")) index += 1;
    if (path === "" || path.startsWith(".palimpsest/")) continue;
    paths.push(path);
  }
  const unseen: string[] = [];
  for (const path of [...new Set(paths)].sort()) {
    const present = git(["cat-file", "-e", `${input.baseCommit}:${path}`]);
    if (present === null) unseen.push(path);
  }
  return Object.freeze(unseen);
}
