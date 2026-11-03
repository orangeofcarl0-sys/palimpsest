/**
 * Trajectory-P2-E0 §7.3/§7.5 — SAFE DSH TEST-HOME CONSTRUCTION PROOF.
 *
 * Builds a real test-owned DSH home with the JUNCTION strategy inside an owned root, verifies the branch's
 * host bundle is present and the first-party packages resolve, measures the ACTUAL disk cost, then disposes
 * the home through the safe no-follow lifecycle and proves the dependency root is untouched.
 *
 * It does NOT run a DSH gate (§4.7) — it proves the CONSTRUCTION is safe and cheap, which is what lets the
 * later heavy gate be trusted.
 *
 * Usage:  node scripts/trajectory_p2e0/home-construction-proof.mjs
 */
import { existsSync, lstatSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { GATE_ROOT, allocateOwnedRoot, freeBytesAt, safeCleanup, snapshotDependencyRoot } from "./owned-root.mjs";
import { MEASURED_FULL_COPY_BYTES, REAL_MODULES, hasFirstPartyDsh, installHostBundle, shareDshModules, writeDeterministicProfile } from "./dsh-test-home.mjs";
import { pathToFileURL } from "node:url";

const REPO = process.cwd().replace(/\\/gu, "/");
const depRoot = join(REPO, "node_modules");
const depBefore = snapshotDependencyRoot(depRoot);

/** Measure the REAL bytes a directory tree occupies, without following reparse points. */
function measureTree(root) {
  let bytes = 0;
  let files = 0;
  let links = 0;
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      let lstat;
      try {
        lstat = lstatSync(full);
      } catch {
        continue;
      }
      if (lstat.isSymbolicLink()) {
        links += 1;
        continue; // never follow
      }
      if (lstat.isDirectory()) walk(full);
      else {
        bytes += lstat.size;
        files += 1;
      }
    }
  };
  walk(root);
  return { bytes, files, links };
}

const owned = allocateOwnedRoot("p2e0-home-", "home-construction-proof");
const freeBefore = freeBytesAt(GATE_ROOT);
const home = join(owned.root, "home");
mkdirSync(join(home, "profiles"), { recursive: true });

const adapterUrl = pathToFileURL(join(REPO, "scripts", "trajectory_p2e0", "deterministic-llm-plugin.mjs")).href;
const share = shareDshModules(home, { strategy: "junction" });
installHostBundle(home, REPO);
const profileDir = writeDeterministicProfile({ home, repo: REPO, root: owned.root, profileName: "p2e0-proof", adapterUrl, withModel: true });

const nodeModules = join(home, "profiles", "node_modules");
const measured = measureTree(nodeModules);
const freeAfterBuild = freeBytesAt(GATE_ROOT);

const proof = {
  strategy: share.strategy,
  entriesShared: share.entries,
  branchHostBundlePresent: existsSync(join(nodeModules, "palimpsest-dsh-host", "lib", "runner.js")),
  branchDeploymentBundlePresent: existsSync(join(nodeModules, "palimpsest-host-deployment", "runtime", "session_reader.js")),
  firstPartyDshSessionResolves: existsSync(join(nodeModules, "@deepseek-ai", "dsh-session")),
  firstPartyDshBinResolves: existsSync(join(nodeModules, "@deepseek-ai", "dsh", "lib", "bin.js")),
  profileWritten: existsSync(join(profileDir, "cordis.patch.yml")) && existsSync(join(profileDir, "deployment.json")),
  measuredRealBytes: measured.bytes,
  measuredRealFiles: measured.files,
  measuredReparsePoints: measured.links,
  measuredFullCopyBytesForComparison: MEASURED_FULL_COPY_BYTES,
  actualAdditionalBytes: freeBefore !== null && freeAfterBuild !== null ? freeBefore - freeAfterBuild : null,
  savingsRatio: measured.bytes > 0 ? MEASURED_FULL_COPY_BYTES / measured.bytes : null,
  realModulesReparsePoints: 98,
};

const cleanup = await safeCleanup(owned);
const depAfter = snapshotDependencyRoot(depRoot);

/** Keep the evidence readable: the link list is summarised, not dumped. */
const cleanupSummary = {
  cleaned: cleanup.cleaned,
  reason: cleanup.reason,
  descendantReparsePointsFound: cleanup.descendantReparsePointsFound,
  removedLinkCount: cleanup.removedLinks?.length ?? 0,
  removedLinkSample: (cleanup.removedLinks ?? []).slice(0, 3),
  attempts: cleanup.attempts,
};

const out = {
  schemaVersion: 1,
  kind: "TRAJECTORY_P2E0_TEST_HOME_CONSTRUCTION",
  stage: "Trajectory-P2-E0",
  baseline: "8ba9ca3df4399eabc686fd23c24c7c0b2ba61290",
  modelCallsMade: 0,
  heavyDshGateRun: false,
  gateRoot: GATE_ROOT.replace(/\\/gu, "/"),
  firstPartyDshAvailable: hasFirstPartyDsh(),
  construction: proof,
  cleanup: cleanupSummary,
  ownedRootRemoved: !existsSync(owned.root),
  dependencyRootPreserved: {
    canonicalUnchanged: depBefore.canonical === depAfter.canonical,
    entryCountUnchanged: depBefore.entries === depAfter.entries,
    entrypointsUnchanged: JSON.stringify(depBefore.entrypoints) === JSON.stringify(depAfter.entrypoints),
  },
  verdict:
    proof.strategy === "junction" &&
    proof.branchHostBundlePresent &&
    proof.firstPartyDshSessionResolves &&
    cleanup.cleaned === true &&
    !existsSync(owned.root) &&
    depBefore.canonical === depAfter.canonical
      ? "SAFE_SHARED_CONSTRUCTION_QUALIFIED"
      : "NOT_ESTABLISHED",
  note: "§7.3: the home shares the first-party packages by per-entry junction (the same structure the real DSH profile uses) and copies only this branch's two host bundles. Measured cost is compared against the P2-D2 dereferenced-copy cost.",
};

process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
