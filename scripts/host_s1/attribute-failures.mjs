#!/usr/bin/env node
/**
 * Palimpsest Host-S1 §11 — FAILURE ATTRIBUTION FOR THE FULL REPOSITORY SUITE.
 *
 * A whole-repository run reports failures in suites that predate this stage. §11 forbids modifying those suites
 * "merely to obtain a whole-repository green result", so the honest output is an ATTRIBUTION: for every failing
 * file, does it fail identically on the stage's parent commit?
 *
 * This tool does not run the suites itself — the comparison requires checking out two commits, which would
 * disturb the working tree. It consumes two captured JSON reports and compares them per file.
 *
 * Usage:  node scripts/host_s1/attribute-failures.mjs --parent <parent.json> --branch <branch.json> [--json-out <path>]
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const arg = (name) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
};
const parentPath = arg("--parent");
const branchPath = arg("--branch");
const jsonOut = arg("--json-out");
if (parentPath === null || branchPath === null) {
  process.stderr.write("usage: attribute-failures.mjs --parent <json> --branch <json> [--json-out <path>]\n");
  process.exit(2);
}

/** Normalise a vitest result file into { file, failed: string[] }. */
function normalise(reportPath) {
  const report = JSON.parse(readFileSync(resolve(reportPath), "utf8"));
  const rows = new Map();
  for (const file of report.testResults ?? []) {
    const name = String(file.name ?? "").replace(/\\/gu, "/").split("/").slice(-2).join("/");
    const failed = (file.assertionResults ?? [])
      .filter((entry) => entry.status === "failed")
      .map((entry) => String(entry.fullName ?? entry.title ?? ""));
    rows.set(name, failed);
  }
  return rows;
}

const parent = normalise(parentPath);
const branch = normalise(branchPath);

const files = new Set([...parent.keys(), ...branch.keys()]);
const rows = [];
for (const file of [...files].sort()) {
  const p = parent.get(file) ?? [];
  const b = branch.get(file) ?? [];
  /**
   * A failure is PRE_EXISTING when the same test failed on the parent. A failure is NEW when it only appears on
   * the branch. `RESOLVED` records the reverse, which is also worth knowing.
   */
  const preExisting = b.filter((name) => p.includes(name));
  const newFailures = b.filter((name) => !p.includes(name));
  const resolved = p.filter((name) => !b.includes(name));
  if (p.length === 0 && b.length === 0) continue;
  rows.push({
    file,
    parentFailed: p.length,
    branchFailed: b.length,
    preExisting,
    newFailures,
    resolved,
    classification:
      newFailures.length > 0 ? "NEW_FAILURE" : b.length > 0 ? "PRE_EXISTING" : "RESOLVED",
  });
}

const newFailures = rows.filter((entry) => entry.classification === "NEW_FAILURE");
const summary = {
  kind: "HOST_S1_FAILURE_ATTRIBUTION",
  stage: "Palimpsest Host-S1",
  note: "Compares two captured vitest JSON reports per test. A failure present on both commits is PRE_EXISTING; §11 forbids editing those suites to obtain a green whole-repository result.",
  parentReport: resolve(parentPath),
  branchReport: resolve(branchPath),
  filesCompared: rows.length,
  parentFailedTests: rows.reduce((sum, entry) => sum + entry.parentFailed, 0),
  branchFailedTests: rows.reduce((sum, entry) => sum + entry.branchFailed, 0),
  newFailureFiles: newFailures.map((entry) => entry.file),
  newFailureTests: newFailures.flatMap((entry) => entry.newFailures.map((name) => ({ file: entry.file, test: name }))),
  resolvedTests: rows.flatMap((entry) => entry.resolved.map((name) => ({ file: entry.file, test: name }))),
  verdict: newFailures.length === 0 ? "NO_NEW_FAILURES" : "NEW_FAILURES_PRESENT",
  rows,
};

const emitted = `${JSON.stringify(summary, null, 2)}\n`;
process.stdout.write(emitted);
if (jsonOut !== null) {
  mkdirSync(dirname(resolve(jsonOut)), { recursive: true });
  writeFileSync(resolve(jsonOut), emitted, "utf8");
}
process.exit(newFailures.length === 0 ? 0 : 1);
