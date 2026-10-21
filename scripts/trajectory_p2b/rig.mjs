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

export const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const REAL_DSH_HOME = (process.env.DSH_HOME ?? join(homedir(), ".dsh")).replace(/\\/g, "/");
export const REAL_MODULES = join(REAL_DSH_HOME, "profiles", "node_modules");
export const GATE_ROOT = (process.env.PALIMPSEST_P2B_GATE_ROOT ?? join(homedir(), ".palimpsest-gates")).replace(/\\/g, "/");

export const hasFirstPartyDsh = () => existsSync(join(REAL_MODULES, "@deepseek-ai", "dsh-session"));
export const hasBuiltDist = () => existsSync(join(REPO, "dist", "src", "advanced.js"));
export const dshBin = () => process.env.PALIMPSEST_DSH_BIN ?? join(REAL_MODULES, "@deepseek-ai", "dsh", "lib", "bin.js");

/** §5 B0-F3: allocate a UNIQUE per-run directory inside the gate root and PROVE containment. */
export function allocateOwnedRoot(prefix) {
  if (!existsSync(GATE_ROOT)) mkdirSync(GATE_ROOT, { recursive: true });
  const root = mkdtempSync(join(GATE_ROOT, prefix));
  const resolvedRoot = realpathSync(root);
  const resolvedGate = realpathSync(GATE_ROOT);
  const rel = relative(resolvedGate, resolvedRoot);
  const contained = rel !== "" && !rel.startsWith("..") && !rel.startsWith(sep);
  const isReparse = lstatSync(root).isSymbolicLink();
  return { root: resolvedRoot, contained, isReparse };
}

/**
 * Delete ONLY the directory this run created, after re-proving containment.
 *
 * ASYNC on purpose. Windows releases SQLite and DSH handles slightly AFTER `close()`/`dispose()` resolve,
 * and a synchronous sleep would BLOCK the event loop so those pending closes never run — the cause of the
 * first measured EPERM. Awaiting a real timer lets the loop drain them. Bounded retries are the
 * repository's established idiom (`test/global_setup.ts`). If every retry fails, the directory is
 * PRESERVED and the reason reported, rather than deleted with a wider sweep (§5 B0-F3).
 */
export async function safeCleanup(owned) {
  if (!owned.contained || owned.isReparse) return { cleaned: false, reason: "containment or reparse check failed; preserving the directory" };
  let lastReason = "";
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      rmSync(owned.root, { recursive: true, force: true, maxRetries: 2, retryDelay: 100 });
      return { cleaned: true };
    } catch (error) {
      lastReason = error?.message ?? String(error);
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  return { cleaned: false, reason: `preserved after retries: ${lastReason}`, preserved: true };
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
 * THE SAFETY RULES ARE UNCHANGED. Containment and reparse checks are re-proved before any deletion, a root that
 * fails them is PRESERVED, and the outcome is returned so a caller can record it. Nothing here widens the
 * deletion surface: it only guarantees the narrow deletion actually happens.
 *
 * Synchronous on the exit path BY NECESSITY: an exit handler cannot await. The retry loop is therefore a short
 * synchronous one; if it fails, the directory is preserved and named, exactly as `safeCleanup` does.
 *
 * @param {{ root: string, contained: boolean, isReparse: boolean }} owned
 * @returns {{ dispose: () => { cleaned: boolean, reason?: string }, status: () => { cleaned: boolean, reason?: string } | null }}
 */
export function ownedRootLifetime(owned) {
  let outcome = null;
  let disposed = false;

  const reclaim = () => {
    if (disposed) return outcome ?? { cleaned: false, reason: "already disposed" };
    disposed = true;
    if (!owned.contained || owned.isReparse) {
      outcome = { cleaned: false, reason: "containment or reparse check failed; preserving the directory" };
      return outcome;
    }
    let lastReason = "";
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        rmSync(owned.root, { recursive: true, force: true, maxRetries: 2, retryDelay: 100 });
        outcome = { cleaned: true };
        return outcome;
      } catch (error) {
        lastReason = error?.message ?? String(error);
      }
    }
    outcome = { cleaned: false, reason: `preserved after retries: ${lastReason}`, preserved: true };
    return outcome;
  };

  /** Every way out of the process reclaims. `process.once` keeps a repeated exit from re-entering. */
  process.once("exit", reclaim);
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.once(signal, () => {
      reclaim();
      process.exit(signal === "SIGINT" ? 130 : 143);
    });
  }

  return {
    /** The primary path: call this before reporting, and record the outcome. */
    dispose: () => {
      const result = reclaim();
      process.removeListener("exit", reclaim);
      return result;
    },
    /** What happened, for a receipt written after disposal. */
    status: () => outcome,
  };
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
 *   · the resolved child must be INSIDE the resolved gate root.
 *
 * Returns what was removed and what was kept, so the caller records the decision instead of a bare count.
 *
 * @param {{ gateRoot: string, prefixes: readonly string[], minAgeMs?: number, dryRun?: boolean }} input
 * @returns {{ removed: readonly { name: string, bytes: number }[], kept: readonly { name: string, reason: string }[], reclaimedBytes: number }}
 */
export function reapAbandonedRoots(input) {
  const gateRoot = resolve(input.gateRoot);
  const minAgeMs = input.minAgeMs ?? 6 * 60 * 60 * 1000;
  const removed = [];
  const kept = [];
  let reclaimedBytes = 0;
  if (!existsSync(gateRoot)) return { removed, kept, reclaimedBytes };

  const resolvedGate = realpathSync(gateRoot);
  const now = Date.now();
  for (const name of readdirSync(gateRoot)) {
    const child = join(gateRoot, name);
    if (!input.prefixes.some((prefix) => name.startsWith(prefix))) continue;
    let stats;
    try {
      stats = lstatSync(child);
    } catch {
      continue;
    }
    /** A reparse point is never a deletion target: removing it could reach outside the root. */
    if (stats.isSymbolicLink()) {
      kept.push({ name, reason: "reparse point" });
      continue;
    }
    if (!stats.isDirectory()) continue;
    const relativePath = relative(resolvedGate, realpathSync(child));
    if (relativePath === "" || relativePath.startsWith("..") || relativePath.startsWith(sep)) {
      kept.push({ name, reason: "resolves outside the gate root" });
      continue;
    }
    if (now - stats.mtimeMs < minAgeMs) {
      kept.push({ name, reason: `modified ${String(Math.round((now - stats.mtimeMs) / 60000))} min ago; a concurrent run may own it` });
      continue;
    }
    const bytes = directoryBytes(child);
    if (input.dryRun === true) {
      removed.push({ name, bytes });
      reclaimedBytes += bytes;
      continue;
    }
    try {
      rmSync(child, { recursive: true, force: true, maxRetries: 2, retryDelay: 100 });
      removed.push({ name, bytes });
      reclaimedBytes += bytes;
    } catch (error) {
      kept.push({ name, reason: `removal failed: ${String(error?.message ?? error)}` });
    }
  }
  return { removed, kept, reclaimedBytes };
}

/** Physical bytes under a directory, counting a junction as zero and never following one. */
export function directoryBytes(root) {
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
 * Returns the strategy actually used, so evidence records which one ran rather than assuming.
 *
 * @param {string} home
 * @param {{ strategy?: "junction" | "copy" }} [options]
 * @returns {{ strategy: string, entries?: number, linked?: number, junctionFailures?: number }}
 */
export function linkSharedModules(home, options = {}) {
  const strategy = options.strategy ?? "junction";
  const target = join(home, "profiles", "node_modules");
  mkdirSync(target, { recursive: true });

  /**
   * THE FALLBACK IS A REAL, COMPLETE COPY. Kept for a filesystem that refuses junctions; it REPORTS that it
   * copied, so a gigabyte is never spent silently.
   */
  const copyAll = () => {
    const entries = readdirSync(REAL_MODULES);
    for (const entry of entries) {
      const destination = join(target, entry);
      if (existsSync(destination)) continue;
      cpSync(join(REAL_MODULES, entry), destination, { recursive: true, dereference: true });
    }
    return { strategy: "copy", entries: entries.length };
  };
  if (strategy === "copy") return copyAll();

  let linked = 0;
  let failed = 0;
  for (const entry of readdirSync(REAL_MODULES)) {
    const destination = join(target, entry);
    if (existsSync(destination)) continue;
    try {
      symlinkSync(join(REAL_MODULES, entry), destination, "junction");
      linked += 1;
    } catch {
      failed += 1;
    }
  }
  /** If ANY junction failed the module graph is incomplete; a copy is the honest completion, not a silent gap. */
  if (failed > 0) return { ...copyAll(), junctionFailures: failed };
  return { strategy: "junction", linked };
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
