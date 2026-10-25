/**
 * CI2 §20 — derive the authorized non-gate selection and record it.
 *
 * The selection is the one E3/E4 froze and CI1 reused: every recursive `*.test.ts`, minus the 39
 * historical `r3l0*` gate files (the forbidden destructive suites) and minus `trajectory_*` (excluded
 * by that same freeze). This script derives it from the filesystem rather than from memory, so the
 * count it reports is a measurement.
 */
import { readdirSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const NL = String.fromCharCode(10);
const REPO = process.cwd();

function walk(dir, out) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      walk(full, out);
    } else if (entry.name.endsWith(".test.ts")) {
      out.push(relative(REPO, full).split("\\").join("/"));
    }
  }
  return out;
}

const all = walk(join(REPO, "test"), []).sort();
const r3l0 = all.filter((file) => /(^|\/)r3l0/u.test(file));
const trajectory = all.filter((file) => /(^|\/)trajectory_/u.test(file));
const included = all.filter((file) => !/(^|\/)r3l0/u.test(file) && !/(^|\/)trajectory_/u.test(file));

const outPath = process.argv[2];
if (outPath === undefined) throw new Error("usage: derive-selection.mjs <out-file>");
writeFileSync(outPath, included.join(NL), "utf8");
process.stdout.write(
  JSON.stringify(
    {
      allTestFiles: all.length,
      excludedR3l0: r3l0.length,
      excludedTrajectory: trajectory.length,
      included: included.length,
      formulaHolds: all.length - r3l0.length - trajectory.length === included.length,
      selectionFile: outPath,
    },
    null,
    2,
  ) + NL,
);
