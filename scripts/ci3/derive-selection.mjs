#!/usr/bin/env node
/**
 * CI3 — derive the authorized non-gate selection from the filesystem.
 *
 * The selection rule is the one CI1 and CI2 used, and it is derived from the actual test tree rather
 * than restated from a previous report:
 *
 *   every recursive test/ ** / *.test.ts
 *     minus the historically forbidden destructive suites   (r3l0*)
 *     minus the Trajectory suites                           (trajectory_*)
 *
 * Printing the four counts lets a reader verify that the manifest and the run agree.
 */
import { readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const root = process.cwd();
const testRoot = join(root, "test");

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(full));
    } else if (entry.isFile() && entry.name.endsWith(".test.ts")) {
      out.push(relative(root, full).split(sep).join("/"));
    }
  }
  return out;
}

const all = walk(testRoot).sort();
const isR3l0 = (path) => /(^|\/)r3l0[^/]*\.test\.ts$/u.test(path);
const isTrajectory = (path) => /(^|\/)trajectory_[^/]*\.test\.ts$/u.test(path);

const excludedR3l0 = all.filter(isR3l0);
const excludedTrajectory = all.filter(isTrajectory);
const included = all.filter((path) => !isR3l0(path) && !isTrajectory(path));

if (process.argv.includes("--json")) {
  process.stdout.write(
    `${JSON.stringify(
      {
        allTestFiles: all.length,
        excludedR3l0: excludedR3l0.length,
        excludedTrajectory: excludedTrajectory.length,
        includedFiles: included.length,
        included,
      },
      null,
      2,
    )}\n`,
  );
} else {
  process.stdout.write(
    [
      `all test files         ${all.length}`,
      `excluded r3l0*         ${excludedR3l0.length}`,
      `excluded trajectory_*  ${excludedTrajectory.length}`,
      `authorized selection   ${included.length}`,
      "",
      ...included,
    ].join("\n") + "\n",
  );
}

void statSync;
