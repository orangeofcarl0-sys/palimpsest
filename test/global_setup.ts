/**
 * Global test temp hygiene (release-track fix).
 *
 * WHY THIS EXISTS: the suites create real temp directories (`mkdtempSync(join(tmpdir(),
 * "palimpsest-…"))`, 294 call sites across 118 files) because durability is never mocked
 * — every store is a real SQLite file. Most suites remove their own directory, but the
 * removal is a `finally`-swallowed `rmSync` that Windows refuses with EPERM while a
 * SQLite handle is still open, and dozens of suites never remove anything at all. Across
 * enough full-suite runs that leaked ~60k directories and ~11 GB into `%TEMP%`.
 *
 * WHAT THIS DOES: one sweep for the whole run. It records which `palimpsest-*` temp
 * directories existed BEFORE the run and removes the ones that appeared during it, after
 * every test process has exited (so handles are closed). That covers all 294 call sites,
 * including the helper-based ones, with no per-suite edit.
 *
 * P2-E1 §9.7 (F20) FAIL-CLOSED CORRECTION. The E0 sweep used `statSync` (which FOLLOWS a reparse
 * point) to decide an entry was a directory, then `rmSync(recursive)` with NO link check and no
 * ownership proof. A `palimpsest-*` entry that is a JUNCTION to an external target would be selected
 * and swept. This version:
 *   · lists with `lstatSync` and NEVER descends through or follows a link;
 *   · treats any `palimpsest-*` entry that is itself a reparse point as OFF-LIMITS and reports it
 *     rather than deleting it (a junction's target is not this run's to remove);
 *   · checks the entry for descendant reparse points and refuses to delete one that contains them,
 *     because a recursive delete is exactly the P2-D2 hazard.
 * The `palimpsest-` prefix is still the only thing considered; nothing else in `%TEMP%` is touched.
 *
 * LIMITS, stated rather than hidden:
 *   - It deletes only the `palimpsest-` prefix, never anything else in the temp dir.
 *   - Two suites running CONCURRENTLY would each sweep the other's directories. This repo
 *     runs one suite at a time (vitest workers are children of this run, and their dirs
 *     are exactly what we want gone), so the assumption is documented and acceptable; a
 *     per-run root would be the stricter fix if that ever changes.
 *   - A directory that is still locked after the retries is left in place and reported,
 *     never silently ignored.
 */

import { existsSync, lstatSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PREFIX = "palimpsest-";

/** §9.7: does this directory contain a descendant reparse point, WITHOUT following any link? */
function containsReparsePoint(root: string): boolean {
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop()!;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      // An unreadable subtree could hide a link; treat it as unsafe rather than assuming it is clean.
      return true;
    }
    for (const entry of entries) {
      const full = join(dir, entry);
      let stat;
      try {
        stat = lstatSync(full);
      } catch {
        return true; // a vanished/!stat-able entry: refuse rather than guess
      }
      if (stat.isSymbolicLink()) return true; // NEVER descend through a link
      if (stat.isDirectory()) stack.push(full);
    }
  }
  return false;
}

/** §9.7: the sweep candidates — the appeared `palimpsest-*` entries that are SAFE to consider. */
function listLeaked(): { readonly safe: readonly string[]; readonly refused: readonly { readonly path: string; readonly why: string }[] } {
  const root = tmpdir();
  if (!existsSync(root)) return { safe: [], refused: [] };
  const safe: string[] = [];
  const refused: { path: string; why: string }[] = [];
  for (const entry of readdirSync(root)) {
    if (!entry.startsWith(PREFIX)) continue;
    const full = join(root, entry);
    let stat;
    try {
      stat = lstatSync(full);
    } catch {
      continue; // Vanished mid-scan: nothing to do.
    }
    /** §9.7: a `palimpsest-*` entry that is ITSELF a reparse point is off-limits — its target is not ours. */
    if (stat.isSymbolicLink()) {
      refused.push({ path: full, why: "the entry is itself a reparse point; its target is outside this run's ownership" });
      continue;
    }
    if (!stat.isDirectory()) continue;
    /** §9.7: a directory containing a descendant link is refused — a recursive delete is the P2-D2 hazard. */
    if (containsReparsePoint(full)) {
      refused.push({ path: full, why: "the directory contains a descendant reparse point; refusing a recursive delete" });
      continue;
    }
    safe.push(full);
  }
  return { safe, refused };
}

/** Windows releases a SQLite file handle slightly after `close()`; retry rather than give up. */
function removeWithRetries(target: string, attempts = 5): boolean {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      rmSync(target, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      return true;
    } catch {
      // Busy: wait briefly and try again (the last attempt decides).
      const until = Date.now() + 250;
      while (Date.now() < until) {
        // Small synchronous backoff keeps the teardown self-contained.
      }
    }
  }
  return !existsSync(target);
}

export default function setup(): () => void {
  const before = new Set(listLeaked().safe);
  return () => {
    const after = listLeaked();
    const appeared = after.safe.filter((directory) => !before.has(directory));
    let removed = 0;
    const stubborn: string[] = [];
    for (const directory of appeared) {
      if (removeWithRetries(directory)) removed += 1;
      else stubborn.push(directory);
    }
    if (removed > 0 || stubborn.length > 0 || after.refused.length > 0) {
      process.stdout.write(
        `\n[test temp hygiene] removed ${removed} leaked temp dir(s)` +
          (stubborn.length === 0 ? "\n" : `; ${stubborn.length} still locked (left in place): ${stubborn.slice(0, 3).join(", ")}\n`) +
          (after.refused.length === 0 ? "" : `; ${after.refused.length} refused (link safety): ${after.refused.slice(0, 3).map((entry) => entry.path).join(", ")}\n`),
      );
    }
  };
}
