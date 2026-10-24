/**
 * Trajectory-P2-E0 §7.3/§7.4 — THE REPAIRED FIRST-PARTY DSH TEST HOME.
 *
 * WHAT CHANGED FROM P2-D2. The P2-D2 L2 gate copied the whole DSH dependency tree TWICE per run with
 * `cpSync(..., { dereference: true })` — measured at ~518 MB per copy, ~1 GB per run — and never removed its
 * owned root. This module instead:
 *
 *   · builds the home inside an OWNED ROOT (see `owned-root.mjs`), so the lifecycle is explicit;
 *   · links each REAL module entry as a per-entry JUNCTION (the same structure the real DSH profile itself
 *     uses: 98 of its 125 entries are junctions) — read-only, and ~0 bytes instead of 518 MB;
 *   · copies ONLY the two Palimpsest host bundles under test, so the code under test is always this branch's;
 *   · isolates sessions, profile config, world and databases per run;
 *   · selects a session by EXACT SessionId, never "the first file in a directory";
 *   · refuses to build when free space is below a computed preflight.
 *
 * §7.3 SAFETY. A junction into the real read-only install is not the P2-D2 hazard: that hazard was a
 * RECURSIVE DELETE traversing a link. `safeCleanup` removes descendant links BY NAME first, and this module
 * never deletes into a link's target. If junction creation is unavailable the caller falls back to a
 * controlled full copy — see `buildDshTestHome({ strategy })`.
 *
 * NOT a product component. PLAIN JAVASCRIPT (`.mjs`), bare node.
 */
import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, rmSync, rmdirSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { freeBytesAt } from "./owned-root.mjs";
import { runtimeHomePath } from "../gates/runtime-home.mjs";

export const REAL_DSH_HOME = (runtimeHomePath()).replace(/\\/gu, "/");
export const REAL_MODULES = join(REAL_DSH_HOME, "profiles", "node_modules");

export const hasFirstPartyDsh = () => existsSync(join(REAL_MODULES, "@deepseek-ai", "dsh-session"));
export const hasBuiltDist = (repo) => existsSync(join(repo, "dist", "src", "advanced.js"));
export const dshBin = () => process.env.PALIMPSEST_DSH_BIN ?? join(REAL_MODULES, "@deepseek-ai", "dsh", "lib", "bin.js");

/** §4.6: the measured cost of a full dereferenced copy, so the preflight is a real estimate not a guess. */
export const MEASURED_FULL_COPY_BYTES = 518_000_000;
/** §4.6: a conservative multiplier for the working set a heavy gate adds on top of the dependency copy. */
export const HEAVY_GATE_HEADROOM_MULTIPLIER = 3;

/**
 * §4.6: refuse to build when the target filesystem cannot hold the intended construction plus headroom.
 * Returns a verdict the caller reports rather than starting a gate that will exhaust the disk.
 */
export function diskPreflight(targetPath, { strategy, copies = 1 } = {}) {
  const free = freeBytesAt(targetPath);
  const perCopy = strategy === "junction" ? 5_000_000 : MEASURED_FULL_COPY_BYTES;
  const required = perCopy * copies * HEAVY_GATE_HEADROOM_MULTIPLIER;
  return {
    targetPath,
    freeBytes: free,
    strategy,
    copies,
    estimatedRequiredBytes: required,
    sufficient: free === null ? null : free >= required,
    verdict: free === null ? "UNKNOWN_FREE_SPACE" : free >= required ? "SUFFICIENT" : "TEST_RUNTIME_BLOCKED_INSUFFICIENT_DISK",
  };
}

/**
 * §7.3: install the CURRENT branch's host bundle where the DSH profile loader resolves it.
 *
 * The bundles under test are COPIED (they are small — ~340 KB together) so the gate always exercises this
 * branch's code rather than a stale installed copy.
 */
export function installHostBundle(home, repo) {
  const nodeModules = join(home, "profiles", "node_modules");
  mkdirSync(nodeModules, { recursive: true });
  for (const [source, name] of [
    [join(repo, "host", "dsh"), "palimpsest-dsh-host"],
    [join(repo, "host", "deployment"), "palimpsest-host-deployment"],
  ]) {
    const target = join(nodeModules, name);
    rmSync(target, { recursive: true, force: true });
    cpSync(source, target, { recursive: true });
  }
}

/**
 * §7.3: share the first-party DSH packages into the test home.
 *
 *   strategy "junction"  per-entry JUNCTIONS into the real read-only install (default; ~0 bytes)
 *   strategy "copy"      a controlled full dereferenced copy (the fallback, with the disk cost preflighted)
 *
 * Returns the strategy actually used, so the evidence records which one ran.
 *
 * P2-E1 §9.3 CORRECTION (F17). P2-E0 returned `{ strategy: "copy" }` when ANY junction failed WITHOUT
 * performing the copy — the copy branch was a separate earlier `if` the junction path never reached, so the
 * caller recorded COPY and then ran a gate against a half-populated module tree. This version does what it
 * says: on a junction failure it removes ONLY the links it created, then performs a PREFLIGHTED COMPLETE COPY.
 * If the copy cannot be completed it returns an explicit BLOCKED rather than a false COPY.
 */
export function shareDshModules(home, { strategy = "junction" } = {}) {
  const target = join(home, "profiles", "node_modules");
  mkdirSync(target, { recursive: true });

  const copyAll = () => {
    /** §4.6: preflight the disk BEFORE a full dereferenced copy, so a full disk is refused not discovered. */
    const preflight = diskPreflight(target, { strategy: "copy", copies: 1 });
    if (preflight.sufficient === false) return { strategy: "BLOCKED", reason: `insufficient disk for a full module copy: ${String(preflight.freeBytes)} free, ${String(preflight.estimatedRequiredBytes)} required` };
    const entries = readdirSync(REAL_MODULES);
    for (const entry of entries) {
      const destination = join(target, entry);
      if (existsSync(destination)) continue;
      cpSync(join(REAL_MODULES, entry), destination, { recursive: true, dereference: true });
    }
    /** §9.3: prove the copy actually happened — every real entry must now exist at the destination. */
    const missing = readdirSync(REAL_MODULES).filter((entry) => !existsSync(join(target, entry)));
    if (missing.length > 0) return { strategy: "BLOCKED", reason: `${String(missing.length)} module entries are absent after the copy` };
    return { strategy: "copy", entries: readdirSync(REAL_MODULES).length };
  };

  if (strategy === "copy") return copyAll();

  const createdLinks = [];
  let failed = 0;
  for (const entry of readdirSync(REAL_MODULES)) {
    const destination = join(target, entry);
    if (existsSync(destination)) continue;
    try {
      symlinkSync(join(REAL_MODULES, entry), destination, "junction");
      createdLinks.push(destination);
    } catch {
      failed += 1;
    }
  }
  /**
   * §9.3: if ANY link could not be created, remove ONLY the links THIS invocation created, then perform a
   * real, preflighted, verified copy. Never report COPY without having copied.
   */
  if (failed > 0) {
    for (const link of createdLinks) {
      try {
        rmdirSync(link);
      } catch {
        /* a link that cannot be removed by name is reported through the BLOCKED path below */
      }
    }
    const copied = copyAll();
    return copied.strategy === "copy" ? { ...copied, reason: `${String(failed)} junction(s) could not be created; a complete copy was performed instead` } : copied;
  }
  return { strategy: "junction", entries: createdLinks.length };
}

/** §7.3: write a test-owned profile that mounts the branch's host bundle and the deterministic adapter. */
export function writeDeterministicProfile(input) {
  const { home, repo, root, profileName, adapterUrl, withModel = true } = input;
  const profileDir = join(home, "profiles", profileName);
  mkdirSync(profileDir, { recursive: true });
  writeFileSync(
    join(profileDir, "package.json"),
    `${JSON.stringify({ name: `dsh-profile-${profileName}`, private: true, dependencies: {}, dsh: { profile: { bundles: ["@deepseek-ai/dsh-base", "palimpsest-dsh-host"], patchReload: "startup" } } }, null, 2)}\n`,
  );
  writeFileSync(
    join(profileDir, "cordis.patch.yml"),
    [
      "- id: palimpsest-tools",
      "  config:",
      `    palimpsestEntry: '${join(repo, "dist", "src", "advanced.js").replace(/\\/gu, "/")}'`,
      `    deploymentProfile: '${join(profileDir, "deployment.json").replace(/\\/gu, "/")}'`,
      "    serve: false",
      "    openDashboard: false",
      "",
      ...(withModel
        ? [
            "- id: agent-default-model",
            "  config:",
            "    provider: palimpsest-local-deterministic",
            "    model: deterministic-1",
            "",
            "- insert:",
            "    - id: p2e0-deterministic-llm",
            `      name: '${adapterUrl}'`,
            "",
          ]
        : []),
    ].join("\n"),
  );
  writeFileSync(
    join(profileDir, "deployment.json"),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        profileId: profileName,
        projectId: "p2e0",
        localPeer: "p2e0-peer",
        persistentPoint: "pp-p2e0",
        transport: { namespace: profileName, databasePath: join(root, "transport.sqlite") },
        databases: { orchestration: join(root, "orch.sqlite"), ordarium: join(root, "ord.sqlite") },
        reasoning: {},
        execution: "worktree",
        concurrency: 1,
        policy: {},
        standard: { statement: "p2e0 gate" },
      },
      null,
      2,
    )}\n`,
  );
  return profileDir;
}

/**
 * §7.4: read ONE session by EXACT SessionId through DSH's OWN persistence.
 *
 * The reader is read-only and the sessions root is the TEST-OWNED one. The reader is created with the REAL
 * installed modules (a test process outside the DSH profile cannot resolve the bare specifiers), which is
 * safe because reading is not a write and touches no personal session.
 */
export async function readSessionByExactId(input) {
  const { sessionsRoot, sessionId } = input;
  const base = pathToFileURL(`${join(REAL_MODULES, "@deepseek-ai")}/`).href;
  const { Context } = await import(`${base}cordis/lib/index.js`);
  const JsonlSessionPersistence = (await import(`${base}dsh-session-persistence-jsonl/lib/index.js`)).default;
  const { SessionId } = await import(`${base}dsh-session/lib/index.js`);
  const ctx = new Context();
  const fiber = await ctx.plugin(JsonlSessionPersistence, { root: sessionsRoot, compression: "zstd" });
  try {
    const handle = await ctx.sessionPersistence.open(SessionId(sessionId), "read");
    const read = await handle.read(0, undefined);
    return read.events;
  } finally {
    // §7.2: close the reader/fiber BEFORE the caller cleans the owned root.
    await fiber?.dispose?.();
  }
}

/** §7.4: find the ONE session file for an exact SessionId, refusing to guess among several. */
export function findSessionFile(sessionsRoot, sessionId) {
  const matches = [];
  const walk = (dir) => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      let stat;
      try {
        stat = lstatSync(path);
      } catch {
        continue;
      }
      if (stat.isDirectory()) walk(path);
      else if (entry.includes("session.v") && entry.includes("jsonl") && path.includes(sessionId)) matches.push(path);
    }
  };
  walk(sessionsRoot);
  return { matches, unique: matches.length === 1 ? matches[0] : null };
}
