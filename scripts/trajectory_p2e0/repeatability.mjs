/**
 * Trajectory-P2-E0 §7.3/§7.5 — REPEATED SAFE INTEGRATION + REPEATABILITY MEASUREMENT.
 *
 * Proves the repaired owned-root lifecycle is repeatable: it runs a bounded, SAFE workload several times and
 * measures pre-run free space, peak additional disk, post-run free space, remaining owned roots, open-handle
 * cleanup and the main dependency-root identity. It does NOT stand up a DSH runtime (§4.7: no heavy gate
 * before the lifecycle is qualified) — the DSH-home construction cost is measured SEPARATELY and honestly.
 *
 * Usage:  node scripts/trajectory_p2e0/repeatability.mjs [runs]
 */
import { existsSync, mkdirSync, readdirSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { GATE_ROOT, allocateOwnedRoot, freeBytesAt, isOwnedByThisStage, safeCleanup, snapshotDependencyRoot } from "./owned-root.mjs";

const RUNS = Number(process.argv[2] ?? "4");
const REPO = realpathSync(join(process.cwd()));

function countOwnedRoots() {
  if (!existsSync(GATE_ROOT)) return 0;
  let count = 0;
  for (const entry of readdirSync(GATE_ROOT)) {
    const path = join(GATE_ROOT, entry);
    try {
      if (statSync(path).isDirectory() && isOwnedByThisStage(path)) count += 1;
    } catch {
      /* vanished */
    }
  }
  return count;
}

const depRoot = join(REPO, "node_modules");
const depBefore = snapshotDependencyRoot(depRoot);
const rootsBefore = countOwnedRoots();
const freeBefore = freeBytesAt(GATE_ROOT);

const perRun = [];
let peakAdditional = 0;
for (let index = 0; index < RUNS; index += 1) {
  const owned = allocateOwnedRoot("p2e0-repeat-", `repeatability-${String(index)}`);
  const freeAtStart = freeBytesAt(GATE_ROOT);
  // A bounded, representative workload: write a few MB, then dispose.
  const payloadDir = join(owned.root, "payload");
  mkdirSync(payloadDir, { recursive: true });
  const chunk = "z".repeat(256 * 1024);
  for (let file = 0; file < 8; file += 1) writeFileSync(join(payloadDir, `chunk-${String(file)}.bin`), chunk, "utf8");
  const freeAtPeak = freeBytesAt(GATE_ROOT);
  const additional = freeAtStart !== null && freeAtPeak !== null ? freeAtStart - freeAtPeak : null;
  if (additional !== null && additional > peakAdditional) peakAdditional = additional;
  const cleanup = await safeCleanup(owned);
  const freeAfter = freeBytesAt(GATE_ROOT);
  perRun.push({
    run: index,
    root: owned.root,
    freeAtStart,
    freeAtPeak,
    freeAfter,
    additionalBytesAtPeak: additional,
    cleanup,
    rootGoneAfterCleanup: !existsSync(owned.root),
    ownedRootsAfterRun: countOwnedRoots(),
  });
}

const rootsAfter = countOwnedRoots();
const freeAfter = freeBytesAt(GATE_ROOT);
const depAfter = snapshotDependencyRoot(depRoot);

const out = {
  schemaVersion: 1,
  kind: "TRAJECTORY_P2E0_CLEANUP_REPEATABILITY",
  stage: "Trajectory-P2-E0",
  baseline: "8ba9ca3df4399eabc686fd23c24c7c0b2ba61290",
  modelCallsMade: 0,
  heavyDshGateRun: false,
  runs: RUNS,
  gateRoot: GATE_ROOT.replace(/\\/gu, "/"),
  preRun: { freeBytes: freeBefore, ownedRootsOwnedByThisStage: rootsBefore },
  postRun: { freeBytes: freeAfter, ownedRootsOwnedByThisStage: rootsAfter },
  peakAdditionalBytesObserved: peakAdditional,
  ownedRootsDidNotGrow: rootsAfter <= rootsBefore,
  dependencyRootPreserved: {
    before: depBefore,
    after: depAfter,
    canonicalUnchanged: depBefore.canonical === depAfter.canonical,
    entryCountUnchanged: depBefore.entries === depAfter.entries,
    entrypointsUnchanged: JSON.stringify(depBefore.entrypoints) === JSON.stringify(depAfter.entrypoints),
  },
  perRun,
  verdict: rootsAfter <= rootsBefore && depBefore.canonical === depAfter.canonical ? "REPEATABLE_NO_LEAK" : "LEAK_OR_DEPENDENCY_CHANGE_DETECTED",
  note: "§4.7: this is a SAFE bounded workload, not a DSH gate. The DSH-home construction cost is measured separately in disk-and-resource-budget.json and is NOT inferred from this run.",
};

process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
