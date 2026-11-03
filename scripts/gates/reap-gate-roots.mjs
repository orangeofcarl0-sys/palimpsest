#!/usr/bin/env node
/**
 * Reclaim abandoned gate roots under `~/.palimpsest-gates`.
 *
 * WHY THIS EXISTS. The gate root reached 18.76 GiB and drove `C:` to 0 bytes free twice, because cleanup ran
 * only on each gate's happy path. The lifetime fix (`ownedRootLifetime`) stops NEW leaks; this reclaims the ones
 * already on disk, and gives an operator one command instead of a manual sweep.
 *
 * IT IS DELIBERATELY NARROW:
 *
 *   · only DIRECT children of the gate root;
 *   · only names matching a known gate prefix — never "everything here";
 *   · a reparse point is never a target, because removing it could reach outside the root;
 *   · a directory modified within the age floor is kept, so a concurrent run is never pulled out from under it;
 *   · the resolved path must be inside the resolved gate root;
 *   · AND the child must carry a recognisable ownership marker whose owner is not still running.
 *
 * RA-B — THE MARKER REQUIREMENT IS NEW, AND IT IS THE POINT. RA-0/F6 measured the superseded selection choosing a
 * directory on prefix and age alone, including one carrying ANOTHER run's marker and one with no marker at all.
 * A name and a timestamp are not ownership. A directory without a verifiable record is now PRESERVED, and this
 * command reports it so an operator can inspect it rather than lose it.
 *
 * CONSEQUENCE, STATED PLAINLY: roots created before the marker existed cannot be reclaimed by this command. They
 * are reported as `NO_OWNERSHIP_MARKER` and left alone. Reclaiming them requires a human decision, which is the
 * correct place for that decision — this tool cannot distinguish "abandoned by my own crashed run" from "someone
 * else's work" and must not guess.
 *
 * Usage:
 *   node scripts/gates/reap-gate-roots.mjs                  report only (default)
 *   node scripts/gates/reap-gate-roots.mjs --apply           actually remove
 *   node scripts/gates/reap-gate-roots.mjs --min-age-hours=6
 *   node scripts/gates/reap-gate-roots.mjs --keep=p2b-
 */
import { pathToFileURL } from "node:url";

import { GATE_ROOT, directoryBytes, reapAbandonedRoots } from "../trajectory_p2b/rig.mjs";

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/u, "").split("=");
    return [key, rest.join("=")];
  }),
);

const apply = process.argv.includes("--apply");
const minAgeHours = Number(args.get("min-age-hours") ?? "6");
const keep = new Set((args.get("keep") ?? "").split(",").map((entry) => entry.trim()).filter((entry) => entry !== ""));

/**
 * THE KNOWN GATE PREFIXES. A root whose name does not start with one of these is NEVER considered, so this
 * command cannot sweep an unrelated directory that happens to live in the gate root.
 */
const PREFIXES = [
  "p2a-",
  "p2b-",
  "p2c-",
  "p2d0-",
  "p2d1-",
  "p2d2-",
  "p2e0-",
  "p2e1-",
  "p2e1r-",
  "p2e1rd-",
  "p2e1re-",
  "p2e1rf-",
  "p2e1rg-",
  "p2e1rg0-",
  "p2e1rg1-",
  "p2e1rc-",
  "p2e1rf2-",
];

const prefixes = PREFIXES.filter((prefix) => !keep.has(prefix));
const result = reapAbandonedRoots({
  gateRoot: GATE_ROOT,
  prefixes,
  minAgeMs: Math.max(0, minAgeHours) * 60 * 60 * 1000,
  /** Report-only unless `--apply` was passed: `reapAbandonedRoots` defaults to a dry run. */
  dryRun: apply !== true,
});

const totalBefore = (() => {
  try {
    return directoryBytes(GATE_ROOT);
  } catch {
    return 0;
  }
})();

/**
 * THE KEPT LIST IS GROUPED BY REASON, so a reader can tell "young directory, a run may own it" apart from
 * "no ownership record" without reading every entry. The second group is the one that needs a human.
 */
const keptByReason = result.kept.reduce((accumulator, entry) => {
  const key = entry.reason.startsWith("NO_OWNERSHIP_MARKER") ? "NO_OWNERSHIP_MARKER" : entry.reason;
  accumulator[key] = (accumulator[key] ?? 0) + 1;
  return accumulator;
}, {});

const report = {
  schemaVersion: 2,
  kind: "GATE_ROOT_REAP",
  gateRoot: GATE_ROOT,
  mode: apply ? "APPLY" : "REPORT_ONLY",
  minAgeHours,
  keptPrefixes: [...keep],
  consideredPrefixes: prefixes,
  rootBytesBefore: totalBefore,
  rootGiBBefore: Number((totalBefore / 1024 ** 3).toFixed(2)),
  wouldReclaimGiB: Number((result.reclaimedBytes / 1024 ** 3).toFixed(2)),
  removed: result.removed.map((entry) => ({ name: entry.name, MiB: Number((entry.bytes / 1024 ** 2).toFixed(1)), marker: entry.marker ?? null })),
  kept: result.kept,
  keptByReason,
  note:
    apply === true
      ? "the listed roots were removed; the shared runtime install is untouched because a junction's target is never followed"
      : "report only; re-run with --apply to remove",
  markerPolicy:
    "a candidate without a readable ownership marker naming its own root is PRESERVED; age and a name prefix are not ownership",
};

process.stdout.write(`${JSON.stringify(report, null, 2)}${String.fromCharCode(10)}`);
