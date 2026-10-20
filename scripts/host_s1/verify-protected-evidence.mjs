#!/usr/bin/env node
// FB-0: verify every protected research-evidence tree against its recorded Git tree OID.
//
// The stored keys are bare root names; the repository path is research-evidence/<name>.
// A name whose path does not exist as a directory is a mismatch, not a skip.
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const RECORD = join(REPO, "research-evidence", "trajectory-p2e1", "protected-evidence-identities.json");

const record = JSON.parse(readFileSync(RECORD, "utf8"));
const commit = process.argv[2] ?? "HEAD";

function treeOf(path) {
  return execFileSync("git", ["rev-parse", `${commit}:${path}`], { cwd: REPO, encoding: "utf8" }).trim();
}

const rows = [];
let mismatched = 0;
let missing = 0;

for (const [name, expected] of Object.entries(record.trees)) {
  const rel = `research-evidence/${name}`;
  let exists = true;
  try {
    statSync(join(REPO, rel)).isDirectory();
  } catch {
    exists = false;
  }
  let actual = null;
  let error = null;
  try {
    actual = treeOf(rel);
  } catch (e) {
    error = String(e?.stderr ?? e?.message ?? e).trim().split("\n")[0];
  }
  const matched = actual !== null && actual === expected;
  if (!exists) missing += 1;
  if (!matched) mismatched += 1;
  rows.push({ name, path: rel, expected, actual, exists, matched, error });
}

const summary = {
  kind: "HOST_S1_FB0_PROTECTED_EVIDENCE_VERIFICATION",
  commit,
  recordedCount: record.count,
  enumeratedCount: rows.length,
  countAgrees: record.count === rows.length,
  matched: rows.filter((r) => r.matched).length,
  mismatched,
  missingPaths: missing,
  verdict: mismatched === 0 && record.count === rows.length ? "ALL_PROTECTED_TREES_UNCHANGED" : "PROTECTED_TREES_DIFFER",
  rows,
};

process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
process.exit(summary.verdict === "ALL_PROTECTED_TREES_UNCHANGED" ? 0 : 1);
