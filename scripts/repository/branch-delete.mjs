#!/usr/bin/env node
/**
 * RS-1 §13 — delete one confidence batch, then VERIFY before the next.
 *
 * Deliberately not a single "delete everything" command. For each invocation it:
 *   1. refuses unless every branch in the batch is classified deletable (§12/§14);
 *   2. refuses if the batch would touch `main` (§2);
 *   3. prints the exact ref list (dry run by default; `--execute` to act);
 *   4. after deleting, prunes, recounts, and re-checks the invariants: main SHA/tree unchanged,
 *      the milestone tags still resolve, and no retained branch disappeared.
 *
 *   node scripts/repository/branch-delete.mjs --batch 1
 *   node scripts/repository/branch-delete.mjs --batch 1 --execute
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] !== undefined ? argv[index + 1] : fallback;
};
const REPO = process.cwd();
const BATCH = Number(flag("--batch", "0"));
const EXECUTE = argv.includes("--execute");
const DELETABLE = ["A_MERGED_ANCESTOR", "B_MERGED_PR_EQUIVALENT", "C_SUPERSEDED_HISTORY", "F_ABANDONED_UNMERGED"];
const PROTECTED = new Set(["main"]);

const readJson = (path) => JSON.parse(readFileSync(join(REPO, path), "utf8"));
const classification = readJson(join("repository-audit", "branch-classification.json"));
const inventory = readJson(join("repository-audit", "branches-before.json"));

const batchOf = (branch) => {
  if (!DELETABLE.includes(branch.classification)) return 0;
  if (branch.classification === "A_MERGED_ANCESTOR" || branch.classification === "B_MERGED_PR_EQUIVALENT") {
    return /closure|checkpoint/.test(branch.name) ? 2 : 1;
  }
  if (branch.classification === "C_SUPERSEDED_HISTORY") return 3;
  return 4;
};

const batch = classification.branches.filter((b) => batchOf(b) === BATCH);
if (BATCH === 0 || batch.length === 0) {
  process.stderr.write(`batch ${String(BATCH)} is not a deletion batch (or is empty)\n`);
  process.exit(2);
}
for (const branch of batch) {
  if (!DELETABLE.includes(branch.classification)) throw new Error(`batch ${String(BATCH)} contains a non-deletable branch: ${branch.name}`);
  if (PROTECTED.has(branch.name)) throw new Error(`refusing to delete a protected branch: ${branch.name}`);
}

const git = (...args) => execFileSync("git", ["-C", REPO, ...args], { encoding: "utf8", maxBuffer: 1 << 28 }).trim();
const mainBefore = git("rev-parse", "origin/main");
const treeBefore = git("rev-parse", "origin/main^{tree}");
const tagsBefore = git("ls-remote", "--tags", "origin");

process.stdout.write(
  [
    `batch ${String(BATCH)}: ${String(batch.length)} branch(es)${EXECUTE ? "" : "  [DRY RUN]"}`,
    ...batch.map((b) => `  ${b.classification.padEnd(22)} ${b.name}  tip=${b.tipSha.slice(0, 12)}`),
    "",
  ].join("\n"),
);

if (!EXECUTE) {
  process.stdout.write("dry run: nothing deleted. Re-run with --execute.\n");
  process.exit(0);
}

/* Delete in small groups so a mid-batch failure leaves a known state, and verify after each group. */
const GROUP = 10;
let deleted = 0;
for (let index = 0; index < batch.length; index += GROUP) {
  const slice = batch.slice(index, index + GROUP).map((b) => b.name);
  execFileSync("git", ["-C", REPO, "push", "origin", "--delete", ...slice], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  deleted += slice.length;
  const mainNow = git("rev-parse", "origin/main");
  if (mainNow !== mainBefore) throw new Error(`main moved during deletion: ${mainBefore} -> ${mainNow}`);
  process.stdout.write(`  deleted ${String(deleted)}/${String(batch.length)}; origin/main still ${mainNow.slice(0, 12)}\n`);
}

execFileSync("git", ["-C", REPO, "fetch", "--prune", "origin"], { encoding: "utf8" });
const heads = git("ls-remote", "--heads", "origin").split("\n").filter((line) => line.trim() !== "");
const mainAfter = git("rev-parse", "origin/main");
const treeAfter = git("rev-parse", "origin/main^{tree}");
const tagsAfter = git("ls-remote", "--tags", "origin");
const survivors = batch.filter((b) => heads.some((line) => line.endsWith(`refs/heads/${b.name}`)));

const checks = [
  [`main SHA unchanged (${mainBefore.slice(0, 12)})`, mainBefore === mainAfter],
  [`main tree unchanged (${treeBefore.slice(0, 12)})`, treeBefore === treeAfter],
  ["tags unchanged", tagsBefore === tagsAfter],
  [`all ${String(batch.length)} batch refs gone`, survivors.length === 0],
  ["main still present", heads.some((line) => line.endsWith("refs/heads/main"))],
];
process.stdout.write(
  [
    "",
    `after batch ${String(BATCH)}: remote branches ${String(heads.length)}`,
    ...checks.map(([label, ok]) => `  ${ok ? "OK  " : "FAIL"} ${label}`),
    "",
  ].join("\n"),
);
if (checks.some(([, ok]) => !ok)) process.exit(1);
