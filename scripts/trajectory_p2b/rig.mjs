/**
 * Trajectory-P2-B §5 B0-F3 — the shared, safely-owned test rig.
 *
 * Both the corrected first-party gate and the canonical-correlation / cold-recovery gates need the same
 * three things: a UNIQUE owned directory, a test-owned DSH home carrying the CURRENT branch's host
 * bundle, and a bounded cleanup. They live here so the ownership rules are written once.
 *
 * NOT a product component. PLAIN JAVASCRIPT (`.mjs`), bare node.
 */
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
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

/** Link the SHARED first-party DSH packages into the test home (read-only deps; the home is disposable). */
export function linkSharedModules(home) {
  const target = join(home, "profiles", "node_modules");
  for (const entry of readdirSync(REAL_MODULES)) {
    const source = join(REAL_MODULES, entry);
    const destination = join(target, entry);
    if (existsSync(destination)) continue;
    cpSync(source, destination, { recursive: true, dereference: true });
  }
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
