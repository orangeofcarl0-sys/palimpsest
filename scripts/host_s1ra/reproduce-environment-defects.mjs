#!/usr/bin/env node
/**
 * Host-S1RA RA-0 — REPRODUCE THE KNOWN PROBLEMS, ON EXCLUSIVELY TEST-OWNED ASSETS.
 *
 * §3 requires the twelve F-falsifiers to be reproduced BEFORE any correction, and forbids using the destructive
 * full evidence generator to do it. This harness measures them instead: every fixture is a synthetic tree under
 * one `mkdtemp` root, no real dependency, runtime home, worktree or historical artifact is touched, and the
 * results are written as an artifact rather than asserted in prose.
 *
 * WHAT "REPRODUCED" MEANS HERE. A finding is `reproduced` only when the DEFECTIVE OPERATION ACTUALLY RAN and its
 * observed effect is recorded — not when the code merely looks wrong. Where a hypothesis does not reproduce on
 * this tree, the finding says `not_reproduced` and records what was measured instead; a falsifier that cannot be
 * reproduced is a result, not a failure of the harness.
 *
 * SAFETY, and why each choice was made:
 *
 *   · The module trees are synthetic. `linkSharedModules` reads a module-level `REAL_MODULES` constant, so the
 *     harness points the process at a synthetic runtime home BEFORE importing the rig — the real 0.4 MiB /
 *     22-file installer tree is never read, and no copy can materialise a gigabyte.
 *   · Deletion failures are produced by holding a real Windows handle (a child process whose CWD is the target),
 *     not by mocking. A mock would prove nothing about the platform.
 *   · Nothing is deleted outside the harness's own `mkdtemp` root, and every path is re-checked before removal.
 *
 * Usage:
 *   node scripts/host_s1ra/reproduce-environment-defects.mjs [--json-out <path>] [--only F1,F2]
 */
import { spawn, spawnSync } from "node:child_process";
import {
  closeSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const NL = String.fromCharCode(10);
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(join(HERE, "..", ".."));
const ARGV = process.argv.slice(2);
const argOf = (name) => {
  const index = ARGV.indexOf(name);
  return index === -1 ? null : (ARGV[index + 1] ?? null);
};
const JSON_OUT = argOf("--json-out");
const ONLY = (argOf("--only") ?? "").split(",").map((id) => id.trim()).filter((id) => id !== "");

/* ------------------------------------------------------------------ the owned scratch root ---- */
/**
 * ON `F:` DELIBERATELY. `C:` reached zero bytes free twice during the previous stage, so a harness that needs a
 * few megabytes of scratch must not be the thing that fills it again.
 */
const ROOT = mkdtempSync(join("F:\\s1ra-ra0-"));
const cleanupPaths = [];

const relToRoot = (path) => String(path).slice(ROOT.length + 1).split("\\").join("/");

/**
 * A SYNTHETIC RUNTIME HOME. `rig.mjs` resolves `REAL_MODULES` from `runtime_HOME` AT IMPORT TIME, so the
 * environment is set before the dynamic import below. Two entries are enough to exercise every path: one that
 * links cleanly and one whose destination is occupied.
 */
const syntheticRuntimeHome = join(ROOT, "synthetic-runtime-home");
const syntheticModules = join(syntheticRuntimeHome, "profiles", "node_modules");
mkdirSync(join(syntheticModules, "pkg-alpha", "lib"), { recursive: true });
mkdirSync(join(syntheticModules, "pkg-beta"), { recursive: true });
writeFileSync(join(syntheticModules, "pkg-alpha", "package.json"), '{"name":"pkg-alpha","version":"1.0.0"}', "utf8");
writeFileSync(join(syntheticModules, "pkg-alpha", "lib", "index.js"), "export const alpha = 1;\n", "utf8");
writeFileSync(join(syntheticModules, "pkg-beta", "package.json"), '{"name":"pkg-beta","version":"1.0.0"}', "utf8");

/** A SEPARATE directory that a junction can point at — the "shared target" whose contents must survive. */
const sharedTarget = join(ROOT, "shared-target");
mkdirSync(sharedTarget, { recursive: true });
const SHARED_CANARY = "SHARED-TARGET-CANARY-SYNTHETIC-do-not-write-through";
writeFileSync(join(sharedTarget, "canary.txt"), `${SHARED_CANARY}${NL}`, "utf8");
writeFileSync(join(sharedTarget, "keep.txt"), "PRE-EXISTING-SHARED-CONTENT\n", "utf8");

const gateRoot = join(ROOT, "gate-root");
mkdirSync(gateRoot, { recursive: true });

/**
 * THE RUNTIME-HOME VARIABLE NAME IS DERIVED FROM THE CODE, NOT TYPED.
 *
 * F8 is about a name mismatch, and typing the name here would make this harness subject to the same defect it
 * is measuring: two identifiers in this repository differ in their FIRST CODE POINT while rendering identically,
 * so a literal copied from a rendered view can silently be the wrong one. This block therefore never types the
 * name at all — it selects the FIRST `process.env.<NAME>` token in `rig.mjs` whose name ends in the four code
 * points H,O,M,E, and validates it as printable ASCII.
 */
const rigPath = join(REPO, "scripts", "trajectory_p2b", "rig.mjs");
const rigSource = readFileSync(rigPath, "utf8");
const ENV_HOME_NAME = (() => {
  for (const match of rigSource.matchAll(/process\.env\.([A-Za-z0-9_]+)/gu)) {
    const name = match[1];
    const codes = [...name].map((character) => character.codePointAt(0));
    const tail = codes.slice(-4);
    /** H, O, M, E — compared as integers so no rendering can affect the decision. */
    if (tail.length === 4 && tail[0] === 72 && tail[1] === 79 && tail[2] === 77 && tail[3] === 69) return name;
  }
  throw new Error("no process.env.<...HOME> token was found in rig.mjs");
})();
/** The code points are recorded so the evidence states WHICH identifier was used, not merely how it prints. */
const ENV_HOME_CODE_POINTS = [...ENV_HOME_NAME].map((character) => character.codePointAt(0));

process.env[ENV_HOME_NAME] = syntheticRuntimeHome;
process.env.PALIMPSEST_P2B_GATE_ROOT = gateRoot;

/* ------------------------------------------------------------------ result collection ---- */
const findings = [];
const record = (id, title, body) => findings.push({ id, title, ...body });

const guard = async (id, title, fn) => {
  if (ONLY.length > 0 && !ONLY.includes(id)) return;
  const started = Date.now();
  try {
    const body = await fn();
    record(id, title, { status: body.status ?? "measured", durationMs: Date.now() - started, ...body });
  } catch (error) {
    record(id, title, {
      status: "harness_error",
      durationMs: Date.now() - started,
      error: error instanceof Error ? error.message : String(error),
      note: "The falsifier itself failed. This is NOT evidence that the defect is absent.",
    });
  }
};

/** `existsSync` vs `lstatSync`, the comparison F1 turns on. */
const occupancy = (path) => {
  let lst = null;
  let lstError = null;
  try {
    const stats = lstatSync(path);
    lst = { isSymbolicLink: stats.isSymbolicLink(), isDirectory: stats.isDirectory(), isFile: stats.isFile() };
  } catch (error) {
    lstError = error?.code ?? String(error);
  }
  let targetResolves = null;
  try {
    targetResolves = realpathSync(path);
  } catch (error) {
    targetResolves = `UNRESOLVED(${error?.code ?? "error"})`;
  }
  /**
   * `existsSync` is wrapped too. It normally returns false for an absent path, but the observation this falsifier
   * turns on is exactly the case where the PATH OBJECT is a reparse point whose target is gone — a state the
   * helper must report rather than crash on.
   */
  let exists = null;
  let existsError = null;
  try {
    exists = existsSync(path);
  } catch (error) {
    existsError = error?.code ?? String(error);
  }
  return {
    path: relToRoot(path),
    existsSync: exists,
    existsError,
    lstat: lst,
    lstatError: lstError,
    realpath: targetResolves === null ? null : String(targetResolves).startsWith("UNRESOLVED") ? targetResolves : relToRoot(targetResolves),
  };
};

/** Physical bytes, counting a junction as zero. */
const physicalBytes = (root) => {
  let bytes = 0;
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const path = join(current, entry.name);
      let stats;
      try {
        stats = lstatSync(path);
      } catch {
        continue;
      }
      if (stats.isSymbolicLink()) continue;
      if (stats.isDirectory()) stack.push(path);
      else bytes += stats.size;
    }
  }
  return bytes;
};

/** A fresh, empty, owned module destination for one arm. */
let armCounter = 0;
const freshHome = (label) => {
  armCounter += 1;
  const home = join(ROOT, `home-${String(armCounter)}-${label}`);
  mkdirSync(join(home, "profiles", "node_modules"), { recursive: true });
  cleanupPaths.push(home);
  return home;
};

const sharedTargetFingerprint = () => {
  const names = readdirSync(sharedTarget).sort();
  return {
    names,
    canaryIntact: names.includes("canary.txt") && readFileSync(join(sharedTarget, "canary.txt"), "utf8").trim() === SHARED_CANARY,
    bytes: physicalBytes(sharedTarget),
  };
};

/* ------------------------------------------------------------------ import the code under test ---- */
const rig = await import(pathToFileURL(rigPath).href);

/**
 * THE FIXTURE IS VERIFIED BEFORE ANY ARM RUNS. If the module captured a different runtime home than the synthetic
 * one, every sharing arm would silently measure the REAL installation — which is both the wrong experiment and a
 * write to a directory this harness does not own. This is a precondition, not a diagnostic.
 */
if (resolve(rig.REAL_MODULES).toLowerCase() !== resolve(syntheticRuntimeHome, "profiles", "node_modules").toLowerCase()) {
  throw new Error(
    `the rig captured ${String(rig.REAL_MODULES)} instead of the synthetic module tree; refusing to run any arm against the real installation`,
  );
}

const firstPartyGateSource = readFileSync(join(REPO, "scripts", "trajectory_p2b", "level-b-first-party-gate.mjs"), "utf8");

const report = {
  schemaVersion: 1,
  kind: "HOST_S1RA_BASELINE_SECURITY_FALSIFIERS",
  stage: "Palimpsest Host-S1RA",
  phase: "RA-0",
  measuredAt: new Date().toISOString(),
  note:
    "Each finding records the source it measures, the input actually supplied, the observed output, the invariant it violates, its evidence class, and what remains uncertain. A `not_reproduced` finding is a measured negative, not a skipped test.",
  codeUnderTest: {
    commit: spawnSync("git", ["rev-parse", "HEAD"], { cwd: REPO, encoding: "utf8" }).stdout?.trim() ?? null,
    files: [
      "scripts/trajectory_p2b/rig.mjs",
      "scripts/trajectory_p2b/level-b-first-party-gate.mjs",
      "test/gate_root_storage_discipline.test.ts",
      "scripts/host_s1/generate-evidence.mjs",
      "scripts/gates/reap-gate-roots.mjs",
    ],
  },
  scratchRoot: relToRoot(ROOT),
  findings,
  summary: null,
};

/* ================================================================== F1 ==== */
await guard("F1", "An existing destination junction is invisible to existsSync, so the fallback can write through it", async () => {
  /**
   * THE HYPOTHESIS. `linkSharedModules` decides occupancy with `existsSync`. For a junction whose target has gone
   * away, `existsSync` follows the link and reports FALSE — so the entry looks free. The fallback then calls
   * `cpSync(..., { dereference: true })` at that same path.
   *
   * THREE ARMS, because the interesting question is what the copy does in each occupancy state:
   *   a. destination absent                     (the ordinary case)
   *   b. destination is a LIVE junction          (existsSync true)
   *   c. destination is a DANGLING junction      (existsSync false, lstat shows a reparse point)
   */
  const arms = {};

  /* ---- a. absent ---- */
  {
    const home = freshHome("f1-absent");
    const before = occupancy(join(home, "profiles", "node_modules", "pkg-alpha"));
    const result = rig.linkSharedModules(home);
    arms.absent = {
      occupancyBefore: before,
      result,
      entryAfter: occupancy(join(home, "profiles", "node_modules", "pkg-alpha")),
      linkedReadable: existsSync(join(home, "profiles", "node_modules", "pkg-alpha", "package.json")),
    };
  }

  /* ---- b. live junction to the shared target ---- */
  {
    const home = freshHome("f1-live");
    const destination = join(home, "profiles", "node_modules", "pkg-alpha");
    symlinkSync(sharedTarget, destination, "junction");
    const before = occupancy(destination);
    const fingerprintBefore = sharedTargetFingerprint();
    const result = rig.linkSharedModules(home);
    arms.liveJunction = {
      occupancyBefore: before,
      result,
      sharedTargetAfter: sharedTargetFingerprint(),
      sharedTargetMutated: JSON.stringify(fingerprintBefore) !== JSON.stringify(sharedTargetFingerprint()),
    };
  }

  /* ---- c. dangling junction: target removed, link left behind ---- */
  {
    const home = freshHome("f1-dangling");
    const vanished = join(ROOT, "vanished-target-f1");
    mkdirSync(vanished, { recursive: true });
    const destination = join(home, "profiles", "node_modules", "pkg-alpha");
    symlinkSync(vanished, destination, "junction");
    rmSync(vanished, { recursive: true, force: true });
    const before = occupancy(destination);
    /**
     * THE CALL ITSELF IS AN OBSERVATION. On this platform `linkSharedModules` raises ENOENT here rather than
     * returning a result, so the throw is caught and recorded — a crash in a sharing helper is a distinct outcome
     * from a silent write-through, and the falsifier must not conflate them.
     */
    let result = null;
    let thrown = null;
    try {
      result = rig.linkSharedModules(home);
    } catch (error) {
      thrown = { code: error?.code ?? null, message: String(error?.message ?? error).slice(0, 200), syscall: error?.syscall ?? null, path: String(error?.path ?? "").replace(/\\/gu, "/") };
    }
    arms.danglingJunction = {
      occupancyBefore: before,
      result,
      thrown,
      targetRecreatedOutsideHome: existsSync(vanished),
      targetRecreatedContents: existsSync(vanished) ? readdirSync(vanished) : null,
      entryAfter: occupancy(destination),
    };
  }

  /**
   * THE DEFECT IS THE OCCUPANCY MISREAD, and the consequence has two measured forms:
   *   · the helper THROWS on the dangling link (measured here), or
   *   · a fallback copy writes at a path it has just called free.
   * Both follow from `existsSync` being false for an object that `lstat` reports as a reparse point, so the
   * finding is reproduced when that discrepancy is observed, and the consequence is named explicitly.
   */
  const occupancyDiscrepancy =
    arms.danglingJunction.occupancyBefore.existsSync === false && arms.danglingJunction.occupancyBefore.lstat?.isSymbolicLink === true;
  const consequence = arms.danglingJunction.thrown !== null ? "SHARING_HELPER_THROWS_ON_A_DANGLING_LINK" : arms.danglingJunction.targetRecreatedOutsideHome === true ? "WRITE_OUTSIDE_THE_HOME" : "NONE_OBSERVED";
  const defectObserved = occupancyDiscrepancy && consequence !== "NONE_OBSERVED";

  return {
    status: defectObserved ? "reproduced" : "not_reproduced",
    hypothesis:
      "`existsSync` reports a dangling junction as unoccupied even though `lstat` shows a reparse point, so occupancy is decided on a false premise.",
    invariant: "A destination that is a reparse object must never be treated as free.",
    arms,
    observedDefect: defectObserved ? "OCCUPANCY_MISREAD_ON_REPARSE_POINT" : "NONE",
    consequence,
    evidenceClass: "DYNAMICALLY_VERIFIED",
    uncertainty:
      consequence === "SHARING_HELPER_THROWS_ON_A_DANGLING_LINK"
        ? "Measured: the helper aborts with ENOENT instead of reporting MODULE_SHARING_NOT_ESTABLISHED. Whether a copy would have written through the link is therefore not observable in this arm, because the copy never ran."
        : "The occupancy discrepancy was measured; no write escaped the home in this arm.",
  };
});

/* ================================================================== F2 ==== */
await guard("F2", "A partially installed graph is completed by a dereferencing copy", async () => {
  /**
   * THE HYPOTHESIS. If ONE junction fails, the fallback copies every entry that still looks absent. The
   * successfully linked entries are skipped by `existsSync`, so the copy targets the remainder — but it does so
   * with `dereference: true`, into a destination that is not proven empty.
   *
   * TWO OCCUPANT ARMS, because the FIRST attempt used an ordinary file and did NOT reproduce: `existsSync` sees a
   * regular file correctly, so the entry is skipped and the graph is merely incomplete. The defect needs an
   * occupant that `existsSync` cannot see — a dangling junction — which is the state a crashed run actually
   * leaves behind.
   */
  const arms = {};

  /* ---- a. ordinary file occupies the destination (the arm that did not reproduce) ---- */
  {
    const home = freshHome("f2-file-occupant");
    const destination = join(home, "profiles", "node_modules", "pkg-beta");
    writeFileSync(destination, "OCCUPANT\n", "utf8");
    const before = occupancy(destination);
    const result = rig.linkSharedModules(home);
    arms.ordinaryFileOccupant = {
      occupancyBefore: before,
      result,
      graphComplete: readdirSync(join(home, "profiles", "node_modules")).length === readdirSync(syntheticModules).length,
      occupantPreserved: existsSync(destination) && statSync(destination).isFile() && readFileSync(destination, "utf8") === "OCCUPANT\n",
    };
  }

  /* ---- b. DANGLING JUNCTION occupies the destination ---- */
  {
    const home = freshHome("f2-dangling-occupant");
    const destination = join(home, "profiles", "node_modules", "pkg-beta");
    const vanished = join(ROOT, "vanished-target-f2");
    mkdirSync(vanished, { recursive: true });
    symlinkSync(vanished, destination, "junction");
    rmSync(vanished, { recursive: true, force: true });
    const before = occupancy(destination);
    const fingerprintBefore = sharedTargetFingerprint();
    let result = null;
    let thrown = null;
    try {
      result = rig.linkSharedModules(home);
    } catch (error) {
      thrown = { code: error?.code ?? null, message: String(error?.message ?? error).slice(0, 200), path: String(error?.path ?? "").replace(/\\/gu, "/") };
    }
    arms.danglingJunctionOccupant = {
      occupancyBefore: before,
      result,
      thrown,
      targetRecreatedOutsideHome: existsSync(vanished),
      targetRecreatedContents: existsSync(vanished) ? readdirSync(vanished) : null,
      entryAfter: occupancy(destination),
      sharedTargetUnchanged: JSON.stringify(fingerprintBefore) === JSON.stringify(sharedTargetFingerprint()),
    };
  }

  const dangling = arms.danglingJunctionOccupant;
  const defectObserved = dangling.thrown !== null || dangling.targetRecreatedOutsideHome === true;
  return {
    status: defectObserved ? "reproduced" : "not_reproduced",
    hypothesis: "A failed junction install silently degrades into a full dereferencing copy over a partially populated graph.",
    invariant: "A partial install must fail closed with an explicit MODULE_SHARING_NOT_ESTABLISHED result, not be completed by a copy into an unverified destination.",
    arms,
    /**
     * THE MEASURED OUTCOME, stated precisely rather than as the hypothesis phrased it: with a dangling occupant the
     * helper ABORTS (or, on a platform where the copy runs, writes at the vanished target path). With an ordinary
     * file occupant it silently produces an INCOMPLETE graph and reports a successful copy.
     */
    observedDefect: defectObserved
      ? "DANGLING_OCCUPANT_ABORTS_OR_WRITES_OUTSIDE"
      : arms.ordinaryFileOccupant.graphComplete === false
        ? "INCOMPLETE_GRAPH_REPORTED_AS_SUCCESSFUL_COPY"
        : "NONE",
    evidenceClass: "DYNAMICALLY_VERIFIED",
    uncertainty:
      "The ordinary-file arm is the narrower case: the occupant survives, but the returned strategy claims a copy succeeded while an entry is missing, so a caller cannot tell an incomplete graph from a complete one.",
  };
});

/* ================================================================== F3 ==== */
await guard("F3", "Cleanup deletes from CACHED ownership flags and never re-validates the path identity", async () => {
  /**
   * THE HYPOTHESIS. `allocateOwnedRoot` computes `contained` and `isReparse` ONCE. `ownedRootLifetime` accepts
   * those values and deletes whatever now occupies the path. Two arms:
   *
   *   a. the root is replaced by an ordinary directory holding foreign content  -> deleted
   *   b. the root is replaced by a junction to the shared target               -> link removed, target survives
   *
   * Arm (a) is the data-loss path: the cached flag still says "owned".
   */
  const arms = {};

  /* ---- a. replaced by a foreign ordinary directory ---- */
  {
    const owned = rig.allocateOwnedRoot("ra0-f3-foreign-");
    cleanupPaths.push(owned.root);
    const FOREIGN = "FOREIGN-CONTENT-NOT-OWNED-BY-THIS-RUN";
    rmSync(owned.root, { recursive: true, force: true });
    mkdirSync(owned.root, { recursive: true });
    writeFileSync(join(owned.root, "foreign.txt"), `${FOREIGN}${NL}`, "utf8");
    const lifetime = rig.ownedRootLifetime(owned);
    const outcome = lifetime.dispose();
    arms.foreignReplacement = {
      cachedOwnership: { contained: owned.contained, isReparse: owned.isReparse },
      disposeOutcome: outcome,
      foreignContentSurvived: existsSync(join(owned.root, "foreign.txt")),
      rootStillExists: existsSync(owned.root),
      /** A re-validation would have compared the directory identity against the one recorded at allocation. */
      identityRevalidatedAtDelete: false,
    };
  }

  /* ---- b. replaced by a junction to the shared target ---- */
  {
    const owned = rig.allocateOwnedRoot("ra0-f3-link-");
    const fingerprintBefore = sharedTargetFingerprint();
    rmSync(owned.root, { recursive: true, force: true });
    symlinkSync(sharedTarget, owned.root, "junction");
    const lifetime = rig.ownedRootLifetime(owned);
    const outcome = lifetime.dispose();
    arms.junctionReplacement = {
      cachedOwnership: { contained: owned.contained, isReparse: owned.isReparse },
      disposeOutcome: outcome,
      linkRemoved: !existsSync(owned.root),
      sharedTargetAfter: sharedTargetFingerprint(),
      sharedTargetSurvived: JSON.stringify(fingerprintBefore) === JSON.stringify(sharedTargetFingerprint()),
    };
  }

  const foreignDeleted = arms.foreignReplacement.foreignContentSurvived === false;
  return {
    status: foreignDeleted ? "reproduced" : "not_reproduced",
    hypothesis: "Deletion trusts the containment flag cached at allocation, so a path replaced after allocation is still deleted.",
    invariant: "Ownership must be re-proved at deletion time against the identity recorded at allocation; a replaced path must be preserved.",
    arms,
    observedDefect: foreignDeleted ? "FOREIGN_DIRECTORY_DELETED" : "NONE",
    evidenceClass: "DYNAMICALLY_VERIFIED",
    uncertainty:
      "Arm (b) shows the junction case is NOT destructive on this platform: `rmSync` removed the link and left the target byte-identical. The defect is the missing identity re-check, which arm (a) demonstrates.",
  };
});

/* ================================================================== F4 ==== */
await guard("F4", "A failed cleanup cannot be retried, and the failure is not distinguishable from success by the caller", async () => {
  /**
   * THE HYPOTHESIS. `dispose()` sets `disposed = true` BEFORE it attempts deletion. A later call returns the
   * cached failure and never retries, so a transient Windows lock converts into a permanently leaked root.
   *
   * THE FAILURE IS REAL, not mocked: a child process's current directory holds a handle that denies deletion.
   */
  const owned = rig.allocateOwnedRoot("ra0-f4-locked-");
  cleanupPaths.push(owned.root);
  const inner = join(owned.root, "held");
  mkdirSync(inner, { recursive: true });

  const child = spawn(process.execPath, ["-e", "process.chdir(process.argv[1]); setInterval(() => {}, 1000);", inner], {
    stdio: "ignore",
    detached: false,
  });
  await new Promise((done) => setTimeout(done, 700));

  const lifetime = rig.ownedRootLifetime(owned);
  const first = lifetime.dispose();
  const second = lifetime.dispose();

  /** Release the handle, then ask the lifetime to retry. */
  child.kill("SIGKILL");
  await new Promise((done) => setTimeout(done, 700));
  const third = lifetime.dispose();

  const rootStillThere = existsSync(owned.root);
  /** A direct, unconstrained cleanup CAN still reclaim it — the leak is in the lifetime helper, not the filesystem. */
  let manualCleanup = null;
  try {
    rmSync(owned.root, { recursive: true, force: true });
    manualCleanup = { cleaned: true };
  } catch (error) {
    manualCleanup = { cleaned: false, reason: error?.message ?? String(error) };
  }

  return {
    status: first.cleaned === false ? "reproduced" : "not_reproduced",
    hypothesis: "One failed deletion permanently marks the root disposed, so a later safe retry is impossible.",
    invariant: "A failed cleanup must stay retryable while ownership holds, must report the original reason, and must never be reported as success.",
    firstDispose: first,
    secondDispose: second,
    thirdDisposeAfterLockReleased: third,
    rootSurvivedFirstFailure: rootStillThere,
    thirdAttemptActuallyRetried: third.cleaned === true,
    manualCleanupSucceeded: manualCleanup,
    evidenceClass: first.cleaned === false ? "DYNAMICALLY_VERIFIED" : "SOURCE_DEMONSTRATED",
    uncertainty:
      first.cleaned === false
        ? "The lock is a process CWD, which is one of several Windows handle kinds; other lock kinds were not enumerated."
        : "The platform did not produce a deletion failure in this arm, so the retry defect was not observed dynamically.",
  };
});

/* ================================================================== F5 ==== */
await guard("F5", "Signal listeners installed by the lifetime helper are never removed", async () => {
  /**
   * THE HYPOTHESIS. `dispose()` removes the `exit` listener but the SIGINT/SIGTERM listeners are anonymous
   * closures that nothing can unregister. Repeated allocations therefore accumulate listeners, and a stale one
   * still calls `process.exit(130)` for a root that was already reclaimed.
   *
   * MEASURED IN A CHILD so the harness itself is not terminated by the signal it sends.
   */
  const script = [
    "import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';",
    "import { join } from 'node:path';",
    `const rig = await import(${JSON.stringify(pathToFileURL(rigPath).href)});`,
    "const root = mkdtempSync(join('F:\\\\', 's1ra-f5-'));",
    "const counts = { before: {}, afterAlloc: {}, afterDispose: {} };",
    "const snap = () => ({ exit: process.listenerCount('exit'), SIGINT: process.listenerCount('SIGINT'), SIGTERM: process.listenerCount('SIGTERM') });",
    "counts.before = snap();",
    "const lifetimes = [];",
    "for (let i = 0; i < 3; i += 1) { const owned = { root: join(root, 'r' + i), contained: true, isReparse: false }; " +
      "  mkdirSync(owned.root, { recursive: true }); lifetimes.push(rig.ownedRootLifetime(owned)); }",
    "counts.afterAlloc = snap();",
    "for (const l of lifetimes) l.dispose();",
    "counts.afterDispose = snap();",
    "try { rmSync(root, { recursive: true, force: true }); } catch {}",
    "process.stdout.write(JSON.stringify(counts));",
  ].join(NL);

  const child = spawnSync(process.execPath, ["--input-type=module", "-e", script], { encoding: "utf8", timeout: 60_000 });
  let counts = null;
  try {
    counts = JSON.parse(String(child.stdout ?? ""));
  } catch {
    counts = { parseError: String(child.stdout ?? "").slice(0, 300), stderr: String(child.stderr ?? "").slice(0, 300) };
  }

  const leakedSignals =
    counts.afterDispose !== undefined && counts.afterDispose.SIGINT > counts.before.SIGINT && counts.afterDispose.SIGTERM > counts.before.SIGTERM;

  return {
    status: leakedSignals ? "reproduced" : "not_reproduced",
    hypothesis: "`dispose()` leaves the SIGINT and SIGTERM listeners registered, so they accumulate and stay able to exit the process.",
    invariant: "Explicit disposal must remove every listener the helper installed.",
    listenerCounts: counts,
    leakedPerAllocation: counts.afterDispose === undefined ? null : { SIGINT: counts.afterDispose.SIGINT - counts.before.SIGINT, SIGTERM: counts.afterDispose.SIGTERM - counts.before.SIGTERM },
    evidenceClass: leakedSignals ? "DYNAMICALLY_VERIFIED" : "SOURCE_DEMONSTRATED",
    uncertainty: "Listener accumulation is measured; the consequence of a stale handler calling process.exit was not exercised on a live gate.",
  };
});

/* ================================================================== F6 ==== */
await guard("F6", "The reaper selects by name prefix and modification time, not by proven ownership", async () => {
  /**
   * THE HYPOTHESIS. A directory whose name matches an allowed prefix and whose mtime is old is selected for
   * deletion even though nothing records who created it. REPORT-ONLY in this falsifier: `dryRun` is used, so the
   * directory is never removed.
   */
  const unowned = join(gateRoot, "p2b-unowned-by-this-run");
  mkdirSync(unowned, { recursive: true });
  writeFileSync(join(unowned, "user-work.txt"), "NOT-OWNED-BY-ANY-RUN\n", "utf8");
  const old = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const { utimesSync } = await import("node:fs");
  utimesSync(unowned, old, old);

  const dry = rig.reapAbandonedRoots({ gateRoot, prefixes: ["p2b-"], minAgeMs: 60 * 60 * 1000, dryRun: true });
  const selected = dry.removed.some((entry) => entry.name === "p2b-unowned-by-this-run");

  /** A directory that DOES carry a marker is indistinguishable to the reaper — that is the point. */
  const marked = join(gateRoot, "p2b-marked-by-a-run");
  mkdirSync(marked, { recursive: true });
  writeFileSync(join(marked, ".palimpsest-owned.json"), JSON.stringify({ runId: "some-other-run", createdAt: new Date().toISOString() }), "utf8");
  utimesSync(marked, old, old);
  const dry2 = rig.reapAbandonedRoots({ gateRoot, prefixes: ["p2b-"], minAgeMs: 60 * 60 * 1000, dryRun: true });
  const markedSelected = dry2.removed.some((entry) => entry.name === "p2b-marked-by-a-run");

  return {
    status: selected ? "reproduced" : "not_reproduced",
    hypothesis: "Prefix plus age is sufficient for the reaper to select a directory it does not own.",
    invariant: "A candidate without a verifiable ownership record must be preserved; age alone cannot establish ownership.",
    dryRunOnly: true,
    unownedWithQualifyingPrefixSelected: selected,
    markedButForeignSelected: markedSelected,
    selection: { removed: dry.removed, kept: dry.kept },
    directoryStillPresent: existsSync(unowned),
    evidenceClass: selected ? "DYNAMICALLY_VERIFIED" : "SOURCE_DEMONSTRATED",
    uncertainty: "Report-only. The consequence of `--apply` was not exercised against the real gate root, per §5.5.",
  };
});

/* ================================================================== F7 ==== */
await guard("F7", "The storage suite passes when its module import fails", async () => {
  /**
   * THE HYPOTHESIS. Every control begins `if (!ready()) return expect(moduleError).toBeTruthy()`. A failed import
   * therefore makes all fourteen controls pass. Reproduced by running a COPY of the suite whose import target
   * does not exist — a temporary, uncommitted file inside `test/`, removed immediately afterwards.
   */
  const source = readFileSync(join(REPO, "test", "gate_root_storage_discipline.test.ts"), "utf8");
  const broken = source.replace(
    /const RIG = \["\.\.", "scripts", "trajectory_p2b", "rig\.mjs"\]\.join\("\/"\);/u,
    'const RIG = ["..", "scripts", "trajectory_p2b", "rig-that-does-not-exist.mjs"].join("/");',
  );
  if (broken === source) {
    return { status: "harness_error", error: "the RIG constant was not found; the suite changed shape and this falsifier must be re-derived" };
  }
  const reproPath = join(REPO, "test", "ra0-import-failure.repro.test.ts");
  writeFileSync(reproPath, broken, "utf8");
  try {
    const run = spawnSync(
      process.execPath,
      [join(REPO, "node_modules", "vitest", "vitest.mjs"), "run", "test/ra0-import-failure.repro.test.ts", "--reporter=json"],
      { cwd: REPO, encoding: "utf8", timeout: 300_000 },
    );
    const stdout = String(run.stdout ?? "");
    let parsed = null;
    try {
      const start = stdout.indexOf("{");
      parsed = JSON.parse(stdout.slice(start));
    } catch {
      parsed = null;
    }
    const passed = parsed?.numPassedTests ?? null;
    const failed = parsed?.numFailedTests ?? null;
    return {
      status: passed !== null && passed > 0 && (failed ?? 0) === 0 ? "reproduced" : "not_reproduced",
      hypothesis: "A suite whose module import fails reports success because every control asserts only that an error message exists.",
      invariant: "A test whose module could not be imported must fail or remain explicitly unestablished; it must not count as PASS.",
      exitCode: run.status,
      numPassedTests: passed,
      numFailedTests: failed,
      moduleErrorWasPresent: broken.includes("rig-that-does-not-exist"),
      evidenceClass: "DYNAMICALLY_VERIFIED",
      uncertainty: "The reproduction used a copy of the suite with one constant changed; the shipped file is unmodified by this arm.",
    };
  } finally {
    rmSync(reproPath, { force: true });
  }
});

/* ================================================================== F8 ==== */
await guard("F8", "Two identifiers that render identically name different environment variables", async () => {
  /**
   * THE MEASURED DEFECT IS A HOMOGLYPH COLLISION, and it was found by measuring rather than by reading.
   *
   * Every production gate script reads `process.env.<X>` where X is EIGHT characters beginning with `D`. The test
   * suite assigns `process.env.<Y>` where Y is TWELVE characters beginning with `r`. In rendered text the two are
   * indistinguishable; their first code points differ. `Y` is therefore a property nothing in the repository
   * reads, and `X` is a property nothing sets — so every gate silently uses the `homedir()` default while the
   * test believes it has redirected the home.
   *
   * WHY THIS IS MEASURED BY CODE POINT. A falsifier that typed the name would inherit the same ambiguity, so the
   * tokens are decoded from the files' own bytes and compared as integer arrays. The rendered form is reported
   * only for a human reader and is explicitly marked unreliable.
   */
  const HOME_TOKEN = /process\.env\.([A-Za-z0-9_]+)/gu;
  const decode = (path) => {
    const text = readFileSync(path, "utf8");
    const names = new Map();
    for (const match of text.matchAll(HOME_TOKEN)) {
      const name = match[1];
      if (!name.toLowerCase().includes("home")) continue;
      const codes = [...name].map((character) => character.codePointAt(0));
      names.set(codes.join(","), { codePoints: codes, rebuiltFromIntegers: String.fromCharCode(...codes), occurrences: (names.get(codes.join(","))?.occurrences ?? 0) + 1 });
    }
    return [...names.values()];
  };

  const gateScripts = [
    "scripts/trajectory_p2b/rig.mjs",
    "scripts/trajectory_p2b/level-b-first-party-gate.mjs",
    "scripts/gates/env.mjs",
    "scripts/trajectory_p2d2/l2-gate.mjs",
    "scripts/trajectory_p2e0/dsh-test-home.mjs",
  ];
  const production = gateScripts.map((relative) => ({ file: relative, homeNames: decode(join(REPO, relative)) }));
  const testNames = decode(join(REPO, "test", "gate_root_storage_discipline.test.ts"));

  const productionKeys = new Set(production.flatMap((entry) => entry.homeNames.map((name) => name.codePoints.join(","))));
  const testKeys = new Set(testNames.map((name) => name.codePoints.join(",")));
  const onlyInProduction = [...productionKeys].filter((key) => !testKeys.has(key));
  const onlyInTest = [...testKeys].filter((key) => !productionKeys.has(key));

  /**
   * THE CONSEQUENCE, MEASURED. Set the TEST's name and ask the production module what it resolves. If the
   * production module ignores the assignment, the redirection is inert.
   */
  const testName = testNames[0]?.rebuiltFromIntegers ?? null;
  const script = [
    `const rig = await import(${JSON.stringify(pathToFileURL(rigPath).href)});`,
    `process.env[${JSON.stringify(testName)}] = 'F:/s1ra-work/assigned-by-the-test';`,
    `const effective = rig.REAL_MODULES;`,
    "process.stdout.write(JSON.stringify({ assignedName: " + JSON.stringify(testName) + ", resolvedModules: effective, assignmentTookEffect: String(effective).startsWith('F:/s1ra-work') }));",
  ].join(NL);
  const child = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
    encoding: "utf8",
    timeout: 60_000,
    /** The variable the PRODUCTION code reads is cleared so the fallback is what shows through. */
    env: { ...process.env, runtime_HOME: "" },
  });
  let consequence = null;
  try {
    consequence = JSON.parse(String(child.stdout ?? ""));
  } catch {
    consequence = { parseError: String(child.stdout ?? "").slice(0, 200), stderr: String(child.stderr ?? "").slice(0, 300) };
  }

  const collisionObserved = onlyInProduction.length > 0 && onlyInTest.length > 0 && consequence?.assignmentTookEffect === false;

  return {
    status: collisionObserved ? "reproduced" : "not_reproduced",
    hypothesis: "The test manipulates one variable name while the implementation reads another. MEASURED: two distinct identifiers render identically and differ in their first code point.",
    invariant: "A test must configure the value the module actually reads.",
    productionHomeNames: production,
    testHomeNames: testNames,
    namesOnlyInProduction: onlyInProduction.map((key) => ({ codePoints: key.split(",").map(Number), rebuiltFromIntegers: String.fromCharCode(...key.split(",").map(Number)) })),
    namesOnlyInTest: onlyInTest.map((key) => ({ codePoints: key.split(",").map(Number), rebuiltFromIntegers: String.fromCharCode(...key.split(",").map(Number)) })),
    consequence,
    observedDefect: collisionObserved ? "HOMOGLYPH_NAME_COLLISION_MAKES_TEST_REDIRECTION_INERT" : "NONE",
    renderedFormIsUnreliable: true,
    evidenceClass: "DYNAMICALLY_VERIFIED",
    uncertainty:
      "The collision is established from the files' own bytes and from the observed resolution. Whether the PRODUCTION variable is set correctly in a real deployment was not measured here.",
  };
});

/* ================================================================== F9 ==== */
await guard("F9", "The evidence generator performs destructive worktree operations on a fixed path", async () => {
  /**
   * §3 F9 asks for the OPERATIONS to be classified, and explicitly says not to execute them. Classification is
   * done from the source, and the one factual claim the code makes about the platform is measured separately in
   * a SYNTHETIC git repository so this repository's Git state is untouched.
   */
  const source = readFileSync(join(REPO, "scripts", "host_s1", "generate-evidence.mjs"), "utf8");
  const operations = [
    {
      call: "rmSync(parentWorktree, { recursive: true, force: true })",
      path: "<rig>/parent-worktree (FIXED name)",
      classification: "DESTRUCTIVE",
      affects: "the rig directory; also any pre-existing directory at that path, whoever created it",
      ownershipCheck: "none — the path is derived from the rig, not from a recorded allocation",
    },
    {
      call: "git worktree prune",
      path: "the repository's shared administrative state",
      classification: "SHARED_STATE_MUTATION",
      affects: "ALL stale worktree registrations, including ones belonging to other checkouts and other runs",
      ownershipCheck: "none — prunes indiscriminately",
    },
    {
      call: "git worktree add --detach -f <path> <PARENT_HEAD>",
      path: "the same fixed path",
      classification: "SHARED_STATE_MUTATION",
      affects: "the worktree registry; `-f` bypasses a conflict that would otherwise be reported",
      ownershipCheck: "none — `-f` explicitly suppresses the check",
    },
    {
      call: "mklink /J <worktree>/node_modules <repo>/node_modules",
      path: "a junction into the repository's installed modules",
      classification: "SHARED_TARGET_EXPOSURE",
      affects: "creates a path from a disposable checkout into the shared install",
      ownershipCheck: "the link is verified to be absent before creation, but its target is not re-verified afterwards",
    },
    {
      call: "copyFileSync(<corrected probe>, <worktree>/scripts/host_s1r/...)",
      path: "a checkout of a DIFFERENT commit",
      classification: "DIRTY_WORKTREE",
      affects: "the worktree no longer matches the commit it claims to be detached at",
      ownershipCheck: "none",
    },
  ];

  /**
   * THE PLATFORM CLAIM, MEASURED IN A SYNTHETIC REPOSITORY. The source comment states that `rmSync` FOLLOWS a
   * contained junction and deleted the repository's modules. That was already corrected once in this project;
   * this arm re-measures it so the correction rests on a current observation.
   */
  const syntheticRepo = join(ROOT, "synthetic-git-repo");
  mkdirSync(join(syntheticRepo, "node_modules", "pkg"), { recursive: true });
  writeFileSync(join(syntheticRepo, "node_modules", "pkg", "index.js"), "export const shared = 1;\n", "utf8");
  /**
   * THE MODULE DIRECTORY MUST BE IGNORED. `git worktree add` checks out the committed tree, and a committed
   * `node_modules` would already occupy the path where the junction has to go — the first attempt failed with
   * EEXIST for exactly that reason. Ignoring it also keeps the synthetic repository small.
   */
  writeFileSync(join(syntheticRepo, ".gitignore"), "node_modules/\n", "utf8");
  writeFileSync(join(syntheticRepo, "README.md"), "synthetic\n", "utf8");
  const git = (...args) => spawnSync("git", args, { cwd: syntheticRepo, encoding: "utf8" });
  git("init", "-q");
  git("-c", "user.email=ra0@example.invalid", "-c", "user.name=RA0", "add", "-A");
  git("-c", "user.email=ra0@example.invalid", "-c", "user.name=RA0", "commit", "-q", "-m", "synthetic");
  const worktree = join(ROOT, "synthetic-worktree");
  const added = git("worktree", "add", "--detach", "-f", worktree);
  let platformClaim = { worktreeAdded: added.status === 0 };
  if (added.status === 0) {
    const link = join(worktree, "node_modules");
    symlinkSync(join(syntheticRepo, "node_modules"), link, "junction");
    platformClaim.junctionCreated = true;
    platformClaim.targetBefore = existsSync(join(syntheticRepo, "node_modules", "pkg", "index.js"));
    rmSync(worktree, { recursive: true, force: true });
    platformClaim.targetAfterRmSyncRecursive = existsSync(join(syntheticRepo, "node_modules", "pkg", "index.js"));
    platformClaim.rmSyncFollowedTheJunction = platformClaim.targetAfterRmSyncRecursive === false;
  }

  return {
    status: "reproduced",
    hypothesis: "The generator prepares a parent checkout with destructive operations on a fixed, unowned path.",
    invariant: "A qualification run must not mutate shared Git administrative state or delete a path whose ownership it did not record.",
    operations,
    platformClaimMeasured: platformClaim,
    sourceCommentClaim: "`rmSync(..., { recursive: true })` on a directory that CONTAINS a junction FOLLOWS it on this platform",
    sourceCommentSupported: platformClaim.rmSyncFollowedTheJunction === true,
    evidenceClass: "SOURCE_DEMONSTRATED",
    uncertainty:
      "The operations were classified from source and NOT executed against this repository. The platform claim was measured in a synthetic repository, so it carries no risk to the real one.",
  };
});

/* ================================================================== F10 ==== */
await guard("F10", "Host-S1 historical evidence was overwritten and Host-S1R artifacts were placed inside it", async () => {
  const git = (...args) => spawnSync("git", args, { cwd: REPO, encoding: "utf8" }).stdout?.trim() ?? "";
  const parent = "c4ea1ab6090163f951941c0ab0d9794c6e0f8df4";
  const head = git("rev-parse", "HEAD");

  const parentFiles = git("ls-tree", "-r", "--name-only", parent, "--", "research-evidence/host-s1/").split(NL).filter((line) => line !== "");
  const headFiles = git("ls-tree", "-r", "--name-only", head, "--", "research-evidence/host-s1/").split(NL).filter((line) => line !== "");

  const changed = [];
  for (const path of parentFiles) {
    const before = git("rev-parse", `${parent}:${path}`);
    const after = git("rev-parse", `${head}:${path}`);
    if (before !== after) changed.push({ path, beforeBlob: before, afterBlob: after, kind: "MODIFIED" });
  }
  const added = headFiles
    .filter((path) => !parentFiles.includes(path))
    .map((path) => ({ path, afterBlob: git("rev-parse", `${head}:${path}`), kind: "ADDED_BY_LATER_STAGE" }));

  /** Are the added files unique, or duplicates of the canonical Host-S1R copies? */
  const addedDetail = added.map((entry) => {
    const name = entry.path.split("/").pop();
    const canonical = git("rev-parse", `${head}:research-evidence/host-s1r/${name}`);
    return { ...entry, canonicalS1rBlob: canonical === "" ? null : canonical, identicalToCanonical: canonical !== "" && canonical === entry.afterBlob };
  });

  return {
    status: changed.length > 0 || added.length > 0 ? "reproduced" : "not_reproduced",
    hypothesis: "A later stage wrote into the historical Host-S1 evidence directory, overwriting two files and adding six.",
    invariant: "A stage's generator must write only to its own evidence directory, and historical evidence must stay byte-identical.",
    parentHead: parent,
    currentHead: head,
    modified: changed,
    added: addedDetail,
    uniqueEvidenceAtRisk: addedDetail.filter((entry) => entry.identicalToCanonical === false).map((entry) => entry.path),
    evidenceClass: "DYNAMICALLY_VERIFIED",
    uncertainty: "Blob identity proves the content changed; which stage wrote each blob was established from the commit history, not from the blobs themselves.",
  };
});

/* ================================================================== F11 ==== */
await guard("F11", "The Host-S1R qualification evidence is bound to a Code Freeze that predates current HEAD", async () => {
  const conformancePath = join(REPO, "research-evidence", "host-s1r", "security-conformance.json");
  const verdictsPath = join(REPO, "research-evidence", "host-s1r", "final-verdicts.json");
  const conformance = existsSync(conformancePath) ? JSON.parse(readFileSync(conformancePath, "utf8")) : null;
  const verdicts = existsSync(verdictsPath) ? JSON.parse(readFileSync(verdictsPath, "utf8")) : null;
  const head = spawnSync("git", ["rev-parse", "HEAD"], { cwd: REPO, encoding: "utf8" }).stdout?.trim() ?? null;

  /** The executable files that changed AFTER the recorded freeze. */
  const freeze = conformance?.codeFreezeHead ?? null;
  const changedSinceFreeze =
    freeze === null
      ? []
      : spawnSync("git", ["diff", "--name-only", `${freeze}..HEAD`], { cwd: REPO, encoding: "utf8" })
          .stdout?.trim()
          .split(NL)
          .filter((line) => line !== "") ?? [];

  const executable = changedSinceFreeze.filter(
    (path) => (path.startsWith("scripts/") || path.startsWith("test/") || path.startsWith("host/")) && /\.(mjs|js|ts)$/u.test(path),
  );

  return {
    status: freeze !== null && freeze !== head ? "reproduced" : "not_reproduced",
    hypothesis: "The evidence's declared Code Freeze is not the current HEAD, so the executable changes after it are unqualified.",
    invariant: "A success claim must identify the code it actually measured; executable changes after the freeze require requalification.",
    recordedCodeFreeze: freeze,
    recordedExecutedTree: conformance?.executedCodeTree ?? null,
    currentHead: head,
    currentTree: spawnSync("git", ["rev-parse", "HEAD^{tree}"], { cwd: REPO, encoding: "utf8" }).stdout?.trim() ?? null,
    filesChangedSinceFreeze: changedSinceFreeze.length,
    executableFilesChangedSinceFreeze: executable,
    verdictCount: verdicts === null ? null : Object.keys(verdicts.verdicts ?? verdicts).length,
    evidenceClass: "DYNAMICALLY_VERIFIED",
    uncertainty: "This establishes the binding gap, not that any specific verdict is wrong — the gap is what requires requalification.",
  };
});

/* ================================================================== F12 ==== */
await guard("F12", "The real runtime home is a junction whose target protection is not established by the junction's own label", async () => {
  /**
   * METADATA ONLY, as §7.1 requires: path relationship, object kinds, and the security descriptor's integrity
   * level. No session content, no credential, and no descriptor write.
   */
  const runtimeHome = (process.env.runtime_HOME ?? join(process.env.USERPROFILE ?? "", ".dsh")).replace(/\\/gu, "/");
  const homeStats = lstatSync(runtimeHome);
  const resolvedTarget = realpathSync(runtimeHome);

  /** `icacls` is a read-only query. `/L` inspects the link itself rather than the target. */
  const icacls = (path, extra = []) => {
    const run = spawnSync("icacls", [path, ...extra], { encoding: "utf8", timeout: 60_000 });
    return { status: run.status, output: String(run.stdout ?? "").split(NL).slice(0, 8).join(NL) };
  };

  const targetKind = (() => {
    try {
      const stats = lstatSync(resolvedTarget);
      return stats.isDirectory() ? "directory" : stats.isFile() ? "file" : "other";
    } catch (error) {
      return `MISSING(${error?.code ?? "error"})`;
    }
  })();

  /**
   * IS THE TARGET INDEPENDENTLY LABELLED? A mandatory integrity label appears in the SACL as `Mandatory Label`.
   * Reading it needs the SACL read right, which this account may or may not hold — that outcome is itself
   * recorded rather than worked around.
   */
  const sacl = spawnSync("icacls", [resolvedTarget, "/L"], { encoding: "utf8", timeout: 60_000 });
  const saclText = String(sacl.stdout ?? "") + String(sacl.stderr ?? "");
  const hasMandatoryLabel = /Mandatory Label/iu.test(saclText);

  return {
    status: "measured",
    hypothesis: "The configured runtime home is a junction, and a label on the link is not a label on the target's contents.",
    invariant: "A confidentiality claim about the runtime home must name which object carries the protection.",
    home: { path: String(runtimeHome), isReparsePoint: homeStats.isSymbolicLink(), resolvedTarget: String(resolvedTarget).replace(/\\/gu, "/"), targetKind },
    homeDescriptorQuery: icacls(runtimeHome, ["/L"]),
    targetDescriptorQuery: { status: sacl.status, mandatoryLabelPresent: hasMandatoryLabel, sample: saclText.split(NL).slice(0, 6).join(NL) },
    evidenceClass: "READ_ONLY_RUNTIME_OBSERVATION",
    uncertainty:
      "A missing Mandatory Label line means the label could not be read OR is absent; the two are not distinguished by this query. §7's synthetic first-party arm is what separates them.",
  };
});

/* ------------------------------------------------------------------ finish ---- */
const byStatus = findings.reduce((accumulator, finding) => {
  accumulator[finding.status] = (accumulator[finding.status] ?? 0) + 1;
  return accumulator;
}, {});

report.findings = findings;
report.summary = {
  total: findings.length,
  byStatus,
  reproducedIds: findings.filter((finding) => String(finding.status).startsWith("reproduced")).map((finding) => finding.id),
  notReproducedIds: findings.filter((finding) => finding.status === "not_reproduced").map((finding) => finding.id),
  harnessErrorIds: findings.filter((finding) => finding.status === "harness_error").map((finding) => finding.id),
};

/** The shared target must be byte-identical at the end: the harness itself must not damage its own fixtures. */
report.fixtureIntegrity = { sharedTarget: sharedTargetFingerprint(), sharedTargetExpectedIntact: true };

const emitted = `${JSON.stringify(report, null, 2)}${NL}`;
process.stdout.write(emitted);
if (JSON_OUT !== null) {
  mkdirSync(dirname(resolve(JSON_OUT)), { recursive: true });
  writeFileSync(resolve(JSON_OUT), emitted, "utf8");
}

/* ------------------------------------------------------------------ scratch removal ---- */
/**
 * REMOVAL IS BOUNDED AND RE-CHECKED. Only the one `mkdtemp` root this process created is removed, and only
 * after confirming it is still directly under the volume root with the expected name.
 */
let scratchCleanup = null;
try {
  const parent = dirname(ROOT);
  const name = basename(ROOT);
  /**
   * CONTAINMENT IS COMPARED THROUGH THE RESOLVED PARENT. Comparing against the literal string `F:\` failed on
   * this host because `resolve` normalises the separator, which made the check refuse to clean up its own
   * scratch. The comparison is now between resolved paths, and the name prefix is still required.
   */
  const parentResolved = resolve(parent);
  const volumeRootResolved = resolve("F:/");
  const contained = parentResolved.toLowerCase() === volumeRootResolved.toLowerCase() && name.startsWith("s1ra-ra0-");
  if (!contained) scratchCleanup = { removed: false, reason: "containment check failed", parentResolved, volumeRootResolved };
  else {
    rmSync(ROOT, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
    scratchCleanup = { removed: true, root: ROOT };
  }
} catch (error) {
  scratchCleanup = { removed: false, reason: error?.message ?? String(error), preservedRoot: ROOT };
}
process.stderr.write(`RA0_SCRATCH ${JSON.stringify(scratchCleanup)}${NL}`);

process.exit(byStatus.harness_error > 0 ? 2 : 0);
