#!/usr/bin/env node
/**
 * Host-S1 §7.5 — THE COST OF COMPLETE DESCENDANT VERIFICATION ON THE REAL LAYOUT.
 *
 * H1-B makes descendant verification an admission requirement. Before that is implemented, the actual cost on
 * the actual protected roots must be known, because a security control that makes every worker start take an
 * unbounded time is an outage, not a boundary (§7.5: "Do not create a Host startup path that is unbounded or
 * unpredictably expensive").
 *
 * This measures, for each root `deriveWorkerFence` would protect in a real deployment:
 *   · how many entries a complete walk examines;
 *   · how many of those are reparse points, and whether their targets are inside or outside the root;
 *   · whether a complete walk fits inside the shipped `MAX_TREE_ENTRIES` / `MAX_TREE_DEPTH`.
 *
 * It reads metadata only. No file content is read, no label is written, and nothing is modified.
 *
 * Usage:  node scripts/host_s1/verify-cost-probe.mjs [--root <path>]... [--json-out <path>]
 */
import { lstatSync, readdirSync, readlinkSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ARG_JSON_OUT = process.argv.includes("--json-out") ? process.argv[process.argv.indexOf("--json-out") + 1] : null;
const NL = String.fromCharCode(10);

/** The shipped bounds, so the measurement is compared against what the code actually enforces. */
const MAX_TREE_DEPTH = 12;
const MAX_TREE_ENTRIES = 20_000;

const explicit = [];
for (let index = 0; index < process.argv.length; index += 1) {
  if (process.argv[index] === "--root" && typeof process.argv[index + 1] === "string") explicit.push(process.argv[index + 1]);
}

const dshHome = (process.env.DSH_HOME ?? join(process.env.USERPROFILE ?? process.env.HOME ?? "", ".dsh")).replace(/\\/gu, "/");
const roots = explicit.length > 0 ? explicit.map((entry) => resolve(entry)) : [resolve(REPO), resolve(dshHome)];

/** Walk one root the way `verifyTree` would, counting what it would examine. */
function measure(root) {
  const outcome = {
    root,
    exists: true,
    entriesExamined: 0,
    directories: 0,
    files: 0,
    reparsePoints: 0,
    reparseInsideRoot: 0,
    reparseOutsideRoot: 0,
    reparseUnresolvable: 0,
    enumerationFailures: 0,
    maxDepthSeen: 0,
    stoppedAtEntryLimit: false,
    stoppedAtDepthLimit: false,
    elapsedMs: 0,
    reparseSamples: [],
  };
  const fold = (value) => value.toLowerCase();
  const rootFold = fold(root);
  const inside = (target) => fold(target) === rootFold || fold(target).startsWith(`${rootFold}\\`) || fold(target).startsWith(`${rootFold}/`);

  const started = Date.now();
  /** @param {string} path @param {number} depth */
  const visit = (path, depth) => {
    if (outcome.entriesExamined >= MAX_TREE_ENTRIES) {
      outcome.stoppedAtEntryLimit = true;
      return;
    }
    if (depth > MAX_TREE_DEPTH) {
      outcome.stoppedAtDepthLimit = true;
      return;
    }
    outcome.entriesExamined += 1;
    if (depth > outcome.maxDepthSeen) outcome.maxDepthSeen = depth;
    let link;
    try {
      link = lstatSync(path);
    } catch {
      outcome.enumerationFailures += 1;
      return;
    }
    if (link.isSymbolicLink()) {
      outcome.reparsePoints += 1;
      let target = null;
      try {
        target = resolve(path, "..", readlinkSync(path));
      } catch {
        target = null;
      }
      if (target === null) outcome.reparseUnresolvable += 1;
      else if (inside(target)) outcome.reparseInsideRoot += 1;
      else outcome.reparseOutsideRoot += 1;
      if (outcome.reparseSamples.length < 5) {
        outcome.reparseSamples.push({ path: path.slice(root.length + 1), target: target === null ? null : target.slice(0, 120), insideRoot: target === null ? null : inside(target) });
      }
      /** A reparse point is not walked — that is the shipped rule and it is preserved. */
      return;
    }
    if (link.isDirectory()) {
      outcome.directories += 1;
      let entries;
      try {
        entries = readdirSync(path);
      } catch {
        outcome.enumerationFailures += 1;
        return;
      }
      for (const entry of entries) visit(join(path, entry), depth + 1);
    } else {
      outcome.files += 1;
    }
  };

  try {
    lstatSync(root);
  } catch {
    outcome.exists = false;
    return outcome;
  }
  visit(root, 0);
  outcome.elapsedMs = Date.now() - started;
  outcome.fitsShippedLimits = !outcome.stoppedAtEntryLimit && !outcome.stoppedAtDepthLimit;
  return outcome;
}

const rows = roots.map(measure);
const report = {
  schemaVersion: 1,
  kind: "HOST_S1_VERIFY_COST_PROBE",
  stage: "Palimpsest Host-S1",
  evidenceClass: "DYNAMICALLY_VERIFIED",
  note: "Metadata-only walk of the real protected roots. Measures what a complete verifyTree() would examine, against the shipped MAX_TREE_ENTRIES and MAX_TREE_DEPTH. No content is read and no label is written.",
  runtime: { node: process.versions.node, platform: process.platform },
  shippedLimits: { maxDepth: MAX_TREE_DEPTH, maxEntries: MAX_TREE_ENTRIES },
  rows,
  summary: {
    roots: rows.length,
    anyOverEntryLimit: rows.some((row) => row.stoppedAtEntryLimit),
    anyOverDepthLimit: rows.some((row) => row.stoppedAtDepthLimit),
    totalEntries: rows.reduce((sum, row) => sum + row.entriesExamined, 0),
    totalElapsedMs: rows.reduce((sum, row) => sum + row.elapsedMs, 0),
    reparsePointsOutsideRoot: rows.reduce((sum, row) => sum + row.reparseOutsideRoot, 0),
  },
};

const emitted = `${JSON.stringify(report, null, 2)}${NL}`;
process.stdout.write(emitted);
if (ARG_JSON_OUT !== null) {
  const { mkdirSync, writeFileSync } = await import("node:fs");
  mkdirSync(dirname(resolve(ARG_JSON_OUT)), { recursive: true });
  writeFileSync(resolve(ARG_JSON_OUT), emitted, "utf8");
}
