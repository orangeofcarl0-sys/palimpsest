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
 * LIMITS, stated rather than hidden:
 *   - It deletes only the `palimpsest-` prefix, never anything else in the temp dir.
 *   - Two suites running CONCURRENTLY would each sweep the other's directories. This repo
 *     runs one suite at a time (vitest workers are children of this run, and their dirs
 *     are exactly what we want gone), so the assumption is documented and acceptable; a
 *     per-run root would be the stricter fix if that ever changes.
 *   - A directory that is still locked after the retries is left in place and reported,
 *     never silently ignored.
 */

import { existsSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PREFIX = "palimpsest-";

function listLeaked(): readonly string[] {
  const root = tmpdir();
  if (!existsSync(root)) return [];
  const found: string[] = [];
  for (const entry of readdirSync(root)) {
    if (!entry.startsWith(PREFIX)) continue;
    const full = join(root, entry);
    try {
      if (statSync(full).isDirectory()) found.push(full);
    } catch {
      // Vanished mid-scan: nothing to do.
    }
  }
  return found;
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
  const before = new Set(listLeaked());
  return () => {
    const appeared = listLeaked().filter((directory) => !before.has(directory));
    let removed = 0;
    const stubborn: string[] = [];
    for (const directory of appeared) {
      if (removeWithRetries(directory)) removed += 1;
      else stubborn.push(directory);
    }
    if (removed > 0 || stubborn.length > 0) {
      process.stdout.write(
        `\n[test temp hygiene] removed ${removed} leaked temp dir(s)` +
          (stubborn.length === 0 ? "\n" : `; ${stubborn.length} still locked (left in place): ${stubborn.slice(0, 3).join(", ")}\n`),
      );
    }
  };
}
