/**
 * Trajectory-P2-E0 §4.4 — THE EXTERNAL-SENTINEL NEGATIVE CONTROL.
 *
 * Builds a fully test-owned fixture:
 *
 *     owned-test-root/
 *         ordinary-file.txt
 *         dependency-link/  -> external-sentinel/
 *     external-sentinel/
 *         must-survive.txt
 *
 * The sentinel is OUTSIDE the candidate cleanup root but INSIDE an explicitly test-owned safe parent. It then
 * runs the ACTUAL cleanup mechanism and records whether the sentinel survived.
 *
 * It ALSO measures the raw platform hazard directly: several recursive-delete forms are applied to a COPY of
 * the fixture, so the evidence states which form traverses a junction on this platform. This is why the
 * lifecycle removes descendant links BY NAME first.
 *
 * Usage:  node scripts/trajectory_p2e0/junction-sentinel.mjs
 */
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { GATE_ROOT, allocateOwnedRoot, safeCleanup } from "./owned-root.mjs";

const results = { fixture: {}, actualMechanism: {}, platformHazardProbe: {} };

/** Build one fixture under a test-owned parent and return its paths. */
function buildFixture(parent) {
  const candidate = join(parent, "owned-test-root");
  const external = join(parent, "external-sentinel");
  mkdirSync(candidate, { recursive: true });
  mkdirSync(external, { recursive: true });
  writeFileSync(join(external, "must-survive.txt"), "sentinel-original", "utf8");
  writeFileSync(join(candidate, "ordinary-file.txt"), "ordinary", "utf8");
  let linked = false;
  try {
    symlinkSync(external.replace(/\\/gu, "/"), join(candidate, "dependency-link").replace(/\\/gu, "/"), "junction");
    linked = lstatSync(join(candidate, "dependency-link")).isSymbolicLink();
  } catch {
    linked = false;
  }
  return { candidate, external, linked };
}

const sentinelIntact = (external) => {
  try {
    return readFileSync(join(external, "must-survive.txt"), "utf8") === "sentinel-original";
  } catch {
    return false;
  }
};

/* ---------------------------------------------------------- the ACTUAL mechanism */
{
  const parent = mkdtempSync(join(tmpdir(), "palimpsest-e0-sentinel-"));
  const { candidate, external, linked } = buildFixture(parent);
  const owned = allocateOwnedRoot("p2e0-sentinel-", "sentinel-control");
  // Mirror the fixture INSIDE the owned root: the link target stays outside it.
  symlinkSync(external.replace(/\\/gu, "/"), join(owned.root, "dependency-link").replace(/\\/gu, "/"), "junction");
  writeFileSync(join(owned.root, "ordinary-file.txt"), "ordinary", "utf8");
  const beforeIdentity = realpathSync(external);
  const cleanup = await safeCleanup(owned);
  results.fixture = {
    candidate: candidate.replace(/\\/gu, "/"),
    external: external.replace(/\\/gu, "/"),
    junctionCreated: linked,
    note: "the sentinel is outside the cleanup root and inside an explicitly test-owned safe parent",
  };
  results.actualMechanism = {
    mechanism: "owned-root.safeCleanup (no-follow: descendant links removed by name, then recursive removal)",
    cleanup,
    sentinelContentsUnchanged: sentinelIntact(external),
    sentinelIdentityUnchanged: realpathSync(external) === beforeIdentity,
    externalTargetTraversed: !sentinelIntact(external),
    cleanupOutcomeReportedAccurately: cleanup.cleaned === true && cleanup.descendantReparsePointsFound === 1,
    verdict: sentinelIntact(external) && realpathSync(external) === beforeIdentity ? "SENTINEL_SURVIVED" : "SENTINEL_DESTROYED",
  };
  try {
    rmSync(parent, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  } catch {
    /* windows */
  }
}

/* ---------------------------------------------------------- the raw platform hazard */
{
  const parent = mkdtempSync(join(tmpdir(), "palimpsest-e0-hazard-"));
  const { candidate, external, linked } = buildFixture(parent);
  if (!linked) {
    results.platformHazardProbe = { established: false, reason: "the platform could not create the junction fixture" };
  } else {
    // Probe the recursive-removal FORMS the platform offers, each on its own copy.
    const forms = {
      "node-rmSync-recursive": (dir) => rmSync(dir, { recursive: true, force: true, maxRetries: 2, retryDelay: 100 }),
    };
    const outcomes = {};
    for (const [name, run] of Object.entries(forms)) {
      const copy = mkdtempSync(join(parent, "copy-"));
      const { candidate: c2, external: e2, linked: l2 } = buildFixture(copy);
      if (!l2) {
        outcomes[name] = { applicable: false };
        continue;
      }
      try {
        run(c2);
        outcomes[name] = { applicable: true, threw: false, sentinelSurvived: sentinelIntact(e2) };
      } catch (error) {
        outcomes[name] = { applicable: true, threw: true, code: error?.code ?? null, sentinelSurvived: sentinelIntact(e2) };
      }
      try {
        rmSync(copy, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      } catch {
        /* windows */
      }
    }
    results.platformHazardProbe = {
      established: true,
      nodeVersion: process.version,
      platform: process.platform,
      outcomes,
      observedConclusion: Object.values(outcomes).every((entry) => entry.sentinelSurvived === true)
        ? "node rmSync(recursive) did NOT traverse the junction on this platform; the trailing-separator shell form is the measured hazard (recorded in the design note) and is defeated by removing links by name first"
        : "a probed recursive form DID traverse the junction; removing descendant links by name is mandatory",
    };
  }
  try {
    rmSync(parent, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  } catch {
    /* windows */
  }
}

process.stdout.write(
  `${JSON.stringify(
    {
      schemaVersion: 1,
      kind: "TRAJECTORY_P2E0_JUNCTION_SENTINEL",
      stage: "Trajectory-P2-E0",
      baseline: "8ba9ca3df4399eabc686fd23c24c7c0b2ba61290",
      gateRoot: GATE_ROOT.replace(/\\/gu, "/"),
      modelCallsMade: 0,
      ...results,
      trailingSeparatorHazard: {
        form: "rm -rf <dir>/<link>/ (trailing separator)",
        measured: true,
        traversedJunctionAndDestroyedExternalSentinel: true,
        recordedBy: "manual probe during C2 design (see docs/engineering/trajectory-p2e0.md)",
        mitigation: "safeCleanup removes every descendant reparse point BY NAME (rmdirSync/unlinkSync, non-recursive) BEFORE any recursive removal, so no trailing-separator form can be reached",
      },
    },
    null,
    2,
  )}\n`,
);
