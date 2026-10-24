/**
 * Trajectory-P2-B §5 B0-F3 — the shared, safely-owned test rig.
 *
 * Both the corrected first-party gate and the canonical-correlation / cold-recovery gates need the same
 * three things: a UNIQUE owned directory, a test-owned DSH home carrying the CURRENT branch's host
 * bundle, and a bounded cleanup. They live here so the ownership rules are written once.
 *
 * NOT a product component. PLAIN JAVASCRIPT (`.mjs`), bare node.
 */
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import * as ownedResource from "./owned-resource.mjs";
import * as moduleSharing from "./module-sharing.mjs";
import { runtimeHomePath } from "../gates/runtime-home.mjs";

export const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const REAL_DSH_HOME = (runtimeHomePath()).replace(/\\/g, "/");
export const REAL_MODULES = join(REAL_DSH_HOME, "profiles", "node_modules");
export const GATE_ROOT = (process.env.PALIMPSEST_P2B_GATE_ROOT ?? join(homedir(), ".palimpsest-gates")).replace(/\\/g, "/");

export const hasFirstPartyDsh = () => existsSync(join(REAL_MODULES, "@deepseek-ai", "dsh-session"));
export const hasBuiltDist = () => existsSync(join(REPO, "dist", "src", "advanced.js"));
export const dshBin = () => process.env.PALIMPSEST_DSH_BIN ?? join(REAL_MODULES, "@deepseek-ai", "dsh", "lib", "bin.js");

/** §5 B0-F3: allocate a UNIQUE per-run directory inside the gate root and PROVE containment. */
export function allocateOwnedRoot(prefix, gateRoot = GATE_ROOT) {
  /**
   * RA-B — ALLOCATION NOW RECORDS AN IDENTITY AND A MARKER.
   *
   * The superseded version returned only `contained` and `isReparse`, both computed once. A later cleanup could
   * not tell "the directory I created" from "a directory now at the same path", and RA-0/F3 measured that a
   * foreign directory's contents were deleted as a result. The record now carries the object identity captured
   * here, plus a marker naming this run, so deletion can re-prove rather than trust.
   */
  return ownedResource.allocateOwnedRoot(gateRoot, prefix);
}

/**
 * Delete ONLY the directory this run created, after re-proving containment.
 *
 * ASYNC on purpose. Windows releases SQLite and runtime handles slightly AFTER `close()`/`dispose()` resolve,
 * and a synchronous sleep would BLOCK the event loop so those pending closes never run — the cause of the
 * first measured EPERM. Awaiting a real timer lets the loop drain them. Bounded retries are the
 * repository's established idiom (`test/global_setup.ts`). If every retry fails, the directory is
 * PRESERVED and the reason reported, rather than deleted with a wider sweep (§5 B0-F3).
 */
export async function safeCleanup(owned) {
  /**
   * RA-B — THE CHECKS ARE RE-PROVED, NOT READ FROM THE RECORD.
   *
   * `owned.contained` and `owned.isReparse` describe the path AT ALLOCATION. Consulting them here is what let a
   * replaced path be deleted. The revalidation below inspects the path now, and a record that cannot be
   * revalidated is preserved.
   */
  let proof = ownedResource.revalidateOwnership(owned);
  if (proof.owned !== true) {
    /** A record predating the identity model still gets the containment check, but never a silent deletion. */
    const legacyOk = owned?.contained === true && owned?.isReparse === false;
    if (!legacyOk) return { cleaned: false, reason: proof.reason, checks: proof.checks, preserved: true };
    proof = { owned: true, checks: [{ check: "legacyRecord", passed: true, detail: "no identity was recorded at allocation; containment only" }] };
  }
  let lastReason = "";
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      rmSync(owned.root, { recursive: true, force: true, maxRetries: 2, retryDelay: 100 });
      return { cleaned: true, checks: proof.checks };
    } catch (error) {
      lastReason = error?.message ?? String(error);
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  return { cleaned: false, reason: `preserved after retries: ${lastReason}`, preserved: true, checks: proof.checks };
}

/**
 * S1R-GATES — A RUN-OWNED ROOT THAT CLEANS UP ON EVERY EXIT PATH.
 *
 * WHY `safeCleanup` ALONE WAS NOT ENOUGH. Each gate called it exactly ONCE, at the end of its happy path, but
 * `finish()` calls `process.exit()` from up to ten earlier places. A run that hit `BLOCKED` (stale `dist`), a
 * refused precondition, or any thrown error therefore leaked its entire root — and the root contained a
 * ~1 GiB dereferenced module copy. Failure is the common case, which is how the gate root reached 18.76 GiB.
 *
 * WHAT THIS DOES. `dispose()` is registered for `exit`, `SIGINT` and `SIGTERM`, so every path out of the
 * process reclaims the directory: normal return, `process.exit()`, Ctrl-C, or a signal. It is idempotent, so an
 * explicit `dispose()` before `finish()` is still the primary path and the handlers become the backstop.
 *
 * THE SAFETY RULES ARE NOW RE-PROVED RATHER THAN TRUSTED. The superseded version deleted whatever occupied
 * `owned.root` as long as the booleans cached at allocation still said "contained" and "not a reparse point".
 * RA-0/F3 measured the consequence: a foreign directory placed at that path had its contents removed. The
 * implementation now lives in `owned-resource.mjs`, which re-checks containment, reparse status and object
 * identity immediately before deleting, keeps a failed attempt RETRYABLE (RA-0/F4), and removes every listener it
 * installed (RA-0/F5).
 *
 * Synchronous on the exit path BY NECESSITY: an exit handler cannot await.
 *
 * @param {{ root: string, gateRoot?: string, contained?: boolean, isReparse?: boolean, identity?: object, runId?: string }} owned
 * @returns {{ dispose: () => { cleaned: boolean, reason?: string }, retry: () => object, status: () => object | null, listenerCount: () => number }}
 */
export function ownedRootLifetime(owned) {
  /**
   * A LEGACY RECORD (one without `identity` or `gateRoot`) is upgraded here rather than silently trusted, so an
   * un-migrated caller still gets revalidation instead of the old cached-boolean deletion.
   */
  const record =
    owned?.gateRoot !== undefined && owned?.identity !== undefined
      ? owned
      : { ...owned, gateRoot: owned?.gateRoot ?? GATE_ROOT, identity: owned?.identity ?? null, runId: owned?.runId ?? `legacy-${String(process.pid)}` };
  return ownedResource.ownedRootLifetime(record);
}

/**
 * S1R-GATES — RECLAIM ABANDONED ROOTS UNDER THE GATE ROOT, WITH PROOF.
 *
 * A leak is not always this process's fault: a killed run, a crashed node, or a gate that predates
 * `ownedRootLifetime` leaves a directory behind. This reaps those, but only under rules that cannot widen:
 *
 *   · only DIRECT children of the gate root are considered;
 *   · a child must match one of the caller's own prefixes — never "everything in the directory";
 *   · a child that is a reparse point is SKIPPED, because deleting it could reach outside the root;
 *   · a child modified within `minAgeMs` is SKIPPED, so a concurrent run is never pulled out from under itself;
 *   · the resolved child must be INSIDE the resolved gate root;
 *   · AND the child must carry a recognisable ownership marker whose owner is not still running.
 *
 * RA-B — THE MARKER REQUIREMENT IS THE CORRECTION FOR RA-0/F6. The superseded version selected a directory on
 * prefix and age alone, and RA-0 measured it selecting a directory that carried ANOTHER run's marker — and one
 * with no marker at all. Age and a name are not ownership. A directory without a verifiable record is now
 * PRESERVED, and the reason is reported so an operator can inspect it instead of losing it.
 *
 * Report-only by DEFAULT: `dryRun` defaults to true, so a caller must ask explicitly before anything is removed.
 *
 * @param {{ gateRoot: string, prefixes: readonly string[], minAgeMs?: number, dryRun?: boolean }} input
 * @returns {{ removed: readonly { name: string, bytes: number }[], kept: readonly { name: string, reason: string }[], reclaimedBytes: number, dryRun: boolean }}
 */
export function reapAbandonedRoots(input) {
  return ownedResource.reapAbandonedRoots({ ...input, dryRun: input.dryRun !== false });
}

/** Physical bytes under a directory, counting a junction as zero and never following one. */
export function directoryBytes(root) {
  return ownedResource.directoryBytes(root);
}

/** §9.1: install the CURRENT branch's host bundle where the DSH profile loader resolves it. */
export function installHostBundle(home) {
  const nodeModules = join(home, "profiles", "node_modules");
  mkdirSync(nodeModules, { recursive: true });
  for (const [source, name] of [
    [join(REPO, "host", "dsh"), "palimpsest-dsh-host"],
    [join(REPO, "host", "deployment"), "palimpsest-host-deployment"],
  ]) {
    const target = join(nodeModules, name);
    rmSync(target, { recursive: true, force: true });
    cpSync(source, target, { recursive: true });
  }
}

/**
 * Share the SHARED first-party runtime packages into the test home.
 *
 * S1R-GATES — THIS USED TO DEEP-COPY, AND THAT IS WHAT FILLED `C:`.
 *
 * The function was always called `linkSharedModules`, but it performed
 * `cpSync(source, destination, { recursive: true, dereference: true })` for every entry. `dereference` follows
 * the installer's junctions, so the real tree's 0.4 MiB / 22 files expanded to 1,048.6 MiB / 112,512 files per
 * home. Measured on this host:
 *
 *     dereferenced copy      124 s   1,048.6 MiB   112,512 files
 *     junction per entry   0.068 s           0 MiB             0 files
 *
 * The dominant term was `@deepseek-ai/dsh/node_modules` — 461 MiB and 26,621 files, a nested tree that exists
 * only because dereferencing materialises it.
 *
 * A per-entry JUNCTION gives the same module identity for no bytes and no copy time: the runtime entry point,
 * the package manifests, `koffi`, and the nested dependency tree all resolve through it (verified). This is the
 * strategy `scripts/trajectory_p2e0/dsh-test-home.mjs` already defaults to; the P2-B rig predates it.
 *
 * The home is DISPOSABLE and junction removal does not touch the target: measured that `rmSync`, `rm -rf` and
 * `git clean` all leave a junction's target intact. The shared install therefore cannot be damaged by a
 * cleanup, which is the property that makes this strategy safe.
 *
 * RA-A — DESTINATION ADMISSION IS NOW PROVEN, AND A FAILED LINK IS NO LONGER "COMPLETED" BY A COPY.
 *
 * The superseded version decided occupancy with `existsSync`, which FOLLOWS a reparse point. RA-0/F1 measured the
 * consequence: a junction whose target had gone read as unoccupied, and the helper then ABORTED with ENOENT
 * instead of reporting a result. RA-0/F2 measured the second consequence: with an ordinary occupant the graph came
 * out INCOMPLETE while the return value still claimed a successful copy.
 *
 * The corrected contract, in `module-sharing.mjs`:
 *
 *   · every destination is classified with `lstat` (which never follows) before anything is written;
 *   · only a PROVABLY ABSENT destination is created;
 *   · an existing link is accepted only when its RESOLVED target is the intended source;
 *   · every other state is REFUSED, and one refusal fails the whole operation with
 *     `MODULE_SHARING_NOT_ESTABLISHED` — because a partially linked graph is not a usable module tree;
 *   · the dereferencing copy is available ONLY as an explicitly requested strategy, never as an automatic
 *     fallback, so an incomplete graph can never be reported as a complete one.
 *
 * Returns the strategy actually used, so evidence records which one ran rather than assuming.
 *
 * @param {string} home
 * @param {{ strategy?: "junction" | "copy" }} [options]
 * @returns {{ established?: boolean, strategy: string, entries?: number, linked?: number|string[], refused?: object[], reason?: string }}
 */
export function linkSharedModules(home, options = {}) {
  const strategy = options.strategy ?? "junction";
  if (strategy === "copy") return copyModuleGraph(home);
  const result = moduleSharing.linkModuleGraph(home, { sourceModules: REAL_MODULES });
  return {
    ...result,
    /** `linked` was a count before; a list is returned so evidence can name WHICH entries were linked. */
    linked: result.linked ?? [],
  };
}

/**
 * THE COPY STRATEGY, EXPLICIT ONLY.
 *
 * §4.3 permits a copy fallback only as a separate, explicitly selected path with a fresh empty destination, full
 * ownership verification, no pre-existing reparse objects, and an actual record of what was copied. This function
 * enforces those conditions instead of documenting them:
 *
 *   · the destination must be empty — a partially populated graph is refused, not completed;
 *   · the source and destination must not overlap;
 *   · the byte and file count actually copied is returned, so a gigabyte is never spent silently.
 *
 * It is NOT reachable from `linkSharedModules` unless the caller passes `{ strategy: "copy" }`.
 */
export function copyModuleGraph(home) {
  const target = join(home, "profiles", "node_modules");
  const prepared = moduleSharing.prepareModuleDirectory(home);
  if (prepared.prepared !== true) {
    return { established: false, strategy: "copy", reason: "MODULE_SHARING_NOT_ESTABLISHED", detail: prepared.reason };
  }

  const existing = readdirSync(target);
  if (existing.length > 0) {
    return {
      established: false,
      strategy: "copy",
      reason: "MODULE_SHARING_NOT_ESTABLISHED",
      detail: `the destination is not empty (${String(existing.length)} entries); a copy is not a repair for a partial graph`,
    };
  }

  /** Overlap would make the copy write into its own source. */
  const sourceResolved = resolve(REAL_MODULES).toLowerCase();
  const targetResolved = resolve(target).toLowerCase();
  if (sourceResolved === targetResolved || targetResolved.startsWith(`${sourceResolved}${sep}`) || sourceResolved.startsWith(`${targetResolved}${sep}`)) {
    return { established: false, strategy: "copy", reason: "MODULE_SHARING_NOT_ESTABLISHED", detail: "the source and destination overlap" };
  }

  const entries = readdirSync(REAL_MODULES);
  let bytes = 0;
  let files = 0;
  for (const entry of entries) {
    const source = join(REAL_MODULES, entry);
    const destination = join(target, entry);
    /**
     * `dereference: true` is KEPT here deliberately: a copy that preserved the installer's junctions would not be
     * an independent copy. Its cost is the reason this path is explicit rather than automatic.
     */
    cpSync(source, destination, { recursive: true, dereference: true });
    const measured = ownedResource.directoryBytes(destination);
    bytes += measured;
    files += countFiles(destination);
  }
  return { established: true, strategy: "copy", entries: entries.length, copiedBytes: bytes, copiedFiles: files, dereferenced: true };
}

/** File count under a root, counting a junction as zero. Used only to REPORT what a copy spent. */
function countFiles(root) {
  let files = 0;
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
      if (entry.isSymbolicLink()) continue;
      const path = join(current, entry.name);
      if (entry.isDirectory()) stack.push(path);
      else files += 1;
    }
  }
  return files;
}

/**
 * Write the test-owned profile: the CURRENT branch's host entry, and the test-owned refusal probe.
 *
 * The probe registers ONE deliberately unclassified tool so the SHIPPED fail-closed capability refusal
 * fires after `agents.create()` and before the first `agent.followup()` — the deterministic no-model
 * seam. It is unreachable in production: no shipped profile mounts it.
 */
export function writeProbeProfile(home, rig, profileName, projectId) {
  const profileDir = join(home, "profiles", profileName);
  mkdirSync(profileDir, { recursive: true });
  writeFileSync(
    join(profileDir, "package.json"),
    `${JSON.stringify(
      {
        name: `dsh-profile-${profileName}`,
        private: true,
        dependencies: {},
        dsh: { profile: { bundles: ["@deepseek-ai/dsh-base", "palimpsest-dsh-host"], patchReload: "startup" } },
      },
      null,
      2,
    )}\n`,
  );
  const probeUrl = pathToFileURL(join(REPO, "scripts", "trajectory_p2a", "refusal-probe-plugin.mjs")).href;
  writeFileSync(
    join(profileDir, "cordis.patch.yml"),
    [
      "- id: palimpsest-tools",
      "  config:",
      `    palimpsestEntry: '${join(REPO, "dist", "src", "advanced.js").replace(/\\/gu, "/")}'`,
      `    deploymentProfile: '${join(profileDir, "deployment.json").replace(/\\/gu, "/")}'`,
      "    serve: false",
      "    openDashboard: false",
      "",
      "- insert:",
      "    - id: p2b-refusal-probe",
      `      name: '${probeUrl}'`,
      "",
    ].join("\n"),
  );
  writeFileSync(
    join(profileDir, "deployment.json"),
    `${JSON.stringify({ schemaVersion: 1, profileId: profileName, projectId, localPeer: `${projectId}-peer`, persistentPoint: `pp-${projectId}`, transport: { namespace: profileName, databasePath: join(rig, "transport.sqlite") }, databases: { orchestration: join(rig, "orch.sqlite"), ordarium: join(rig, "ord.sqlite") }, reasoning: {}, execution: "worktree", concurrency: 1, policy: {}, standard: { statement: "p2b probe" } }, null, 2)}\n`,
  );
  return profileDir;
}

/** §5 B0-F1: read ONE session through the OFFICIAL reader and count logical events. */
export async function measureSessionThroughOfficialReader(sessionsRoot, sessionId) {
  const readerModule = await import(pathToFileURL(join(REPO, "scripts", "trajectory_v0", "dsh-session-reader.mjs")).href);
  const reader = await readerModule.makeRealDshSessionReader({ dshHomePath: REAL_DSH_HOME, sessionsRoot });
  if (reader === null) return { readState: "READER_UNAVAILABLE", counts: null };
  try {
    const page = await reader.readEvents({ sessionId, maxEvents: 200 });
    const counts = { total: page.events.length, turnStart: 0, stepStart: 0, requestHeader: 0 };
    for (const event of page.events) {
      if (event.type === "turn/start") counts.turnStart += 1;
      else if (event.type === "step/start") counts.stepStart += 1;
      else if (event.type === "request/header") counts.requestHeader += 1;
    }
    return { readState: page.readState, headerSessionId: page.header?.sessionId ?? null, persistedEventCount: page.persistedEventCount, counts };
  } finally {
    await reader.close?.();
  }
}
