#!/usr/bin/env node
/**
 * Host-S1RA §2.1 — THE EXECUTION-ENVIRONMENT BASELINE.
 *
 * FB-0 requires a recorded environment, and §8.5 requires re-verifying it after every high-risk phase. This
 * producer is what makes that possible: it MEASURES the environment rather than accepting a remembered one.
 *
 * TWO THINGS IT IS CAREFUL ABOUT.
 *
 *   1. It reports what it measured even when that contradicts the handoff. The handoff records runtime
 *      `0.2.1-rc.2`; the installed package is `0.2.1-rc.3`. A producer that printed the expected value would
 *      destroy the only evidence that the environment moved.
 *
 *   2. It separates DISK FACTS from DISK INTERPRETATION. Free bytes and the size of the gate root are facts.
 *      Whether the gate root is "too big" is not, so it is not asserted here.
 *
 * READ-ONLY with respect to everything it describes. It writes only its own output file.
 *
 * Usage:
 *   node scripts/host_s1ra/measure-environment.mjs [--json-out <path>] [--phase <label>]
 */
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runtimeHomePath } from "../gates/runtime-home.mjs";

const NL = String.fromCharCode(10);
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(join(HERE, "..", ".."));
const ARGV = process.argv.slice(2);
const argOf = (name) => {
  const index = ARGV.indexOf(name);
  return index === -1 ? null : (ARGV[index + 1] ?? null);
};
const JSON_OUT = argOf("--json-out");
const PHASE = argOf("--phase") ?? "FB-0";

const rel = (path) => String(path).replace(/\\/gu, "/");

/** Numeric version comparison, so `engines` is checked rather than string-matched. */
function nodeSatisfiesAtLeast(version, minimum) {
  const parts = String(version).replace(/^v/u, "").split(".").map((piece) => Number(piece.replace(/[^0-9].*$/u, "")));
  for (let index = 0; index < minimum.length; index += 1) {
    const actual = Number.isFinite(parts[index]) ? parts[index] : 0;
    if (actual > minimum[index]) return true;
    if (actual < minimum[index]) return false;
  }
  return true;
}

/**
 * Run a command and return its trimmed stdout, or null. Never throws, never inherits stdio.
 *
 * `pnpm` and `npm` are `.cmd` shims on Windows: spawning the bare name fails with ENOENT and spawning the
 * `.cmd` directly fails with EINVAL (the known Node/Windows spawn issue that `scripts/gates/env.mjs` documents).
 * The `shell` form is therefore tried as a fallback rather than reporting a missing toolchain.
 */
function capture(command, args, options = {}) {
  const attempts = [{ command, args, ...options }, { command, args, ...options, shell: true }];
  for (const attempt of attempts) {
    const result = spawnSync(attempt.command, attempt.args, {
      encoding: "utf8",
      timeout: options.timeout ?? 60_000,
      ...attempt,
    });
    if (result.status === 0) return String(result.stdout ?? "").trim();
  }
  return null;
}

/** Physical bytes under a root, counting a junction as ZERO and never following it. */
function physicalBytes(root) {
  let bytes = 0;
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
      const path = join(current, entry.name);
      let stats;
      try {
        stats = lstatSync(path);
      } catch {
        continue;
      }
      if (stats.isSymbolicLink()) continue;
      if (stats.isDirectory()) stack.push(path);
      else if (stats.isFile()) {
        bytes += stats.size;
        files += 1;
      }
    }
  }
  return { bytes, files };
}

/* ------------------------------------------------------------------ git ---- */
const git = (...args) => capture("git", args, { cwd: REPO });
const worktreePorcelain = git("worktree", "list", "--porcelain") ?? "";
const worktreeEntries = worktreePorcelain
  .split(NL)
  .filter((line) => line.startsWith("worktree "))
  .map((line) => line.slice("worktree ".length));
const prunableCount = worktreePorcelain.split(NL).filter((line) => line.startsWith("prunable")).length;
const lockedCount = worktreePorcelain.split(NL).filter((line) => line.startsWith("locked")).length;

/**
 * THE WORKTREE SET IS REPORTED, NOT CLEANED. 83 of the registrations point at directories that no longer exist.
 * Pruning them would be tidier, but it is a mutation of shared Git administrative state that this stage has no
 * authorization for — §6.1 forbids an indiscriminate prune, and §2 forbids "fixing" an FB-0 observation.
 */
const staleWorktreePaths = worktreePorcelain
  .split(`${NL}${NL}`)
  .filter((block) => block.includes("prunable"))
  .map((block) => {
    const line = block.split(NL).find((entry) => entry.startsWith("worktree "));
    return line === undefined ? null : rel(line.slice("worktree ".length));
  })
  .filter((path) => path !== null);

/* ------------------------------------------------------------------ runtime ---- */
const runtimeHome = runtimeHomePath();
const runtimeModules = join(runtimeHome, "profiles", "node_modules");
const runtimeManifestPath = join(runtimeModules, "@deepseek-ai", "dsh", "package.json");
let installedRuntime = null;
try {
  installedRuntime = String(JSON.parse(readFileSync(runtimeManifestPath, "utf8")).version);
} catch {
  installedRuntime = null;
}

/** A junction's own kind, measured on the object rather than through it. */
const kindOf = (path) => {
  try {
    const stats = lstatSync(path);
    return stats.isSymbolicLink() ? "reparse" : stats.isDirectory() ? "directory" : stats.isFile() ? "file" : "other";
  } catch (error) {
    return `MISSING(${error?.code ?? "error"})`;
  }
};
const resolveOrNull = (path) => {
  try {
    return rel(realpathSync(path));
  } catch (error) {
    return `UNRESOLVED(${error?.code ?? "error"})`;
  }
};

/* ------------------------------------------------------------------ gate root ---- */
const gateRoot = (process.env.PALIMPSEST_GATE_ROOT ?? join(homedir(), ".palimpsest-gates")).replace(/\\/gu, "/");
const gateRootExists = existsSync(gateRoot);
const gateRootEntries = gateRootExists ? readdirSync(gateRoot).sort() : [];
const gateRootBytes = gateRootExists ? physicalBytes(gateRoot) : { bytes: 0, files: 0 };

/* ------------------------------------------------------------------ disk ---- */
/**
 * FREE SPACE, PER VOLUME, MEASURED THROUGH NODE rather than parsed from `df`. The two failed runs both ended at
 * zero bytes free on the volume holding the gate root, so this number is a first-class observation.
 */
const volumes = [...new Set([REPO, gateRoot, runtimeHome].map((path) => resolve(path).slice(0, 2).toUpperCase()))];
const disk = volumes.map((volume) => {
  const script = "const s=require('node:fs').statfsSync(process.argv[1]);process.stdout.write(JSON.stringify({bavail:s.bavail,bsize:s.bsize,blocks:s.blocks}))";
  const raw = capture(process.execPath, ["-e", script, `${volume}\\`]);
  if (raw === null) return { volume, freeGiB: null, totalGiB: null };
  const stats = JSON.parse(raw);
  return {
    volume,
    freeGiB: Number(((stats.bavail * stats.bsize) / 1024 ** 3).toFixed(2)),
    totalGiB: Number(((stats.blocks * stats.bsize) / 1024 ** 3).toFixed(2)),
  };
});

/* ------------------------------------------------------------------ dependency manifest ---- */
/**
 * THE DEPENDENCY MANIFEST IS PRODUCED BY ITS OWN TOOL, not inlined. One producer means one definition of
 * "the same installation", and §8.5 compares like with like.
 */
const manifestRun = spawnSync(process.execPath, [join(HERE, "dependency-manifest.mjs")], { encoding: "utf8", timeout: 180_000 });
let dependencyManifest = null;
try {
  dependencyManifest = JSON.parse(manifestRun.stdout);
} catch {
  dependencyManifest = null;
}

const report = {
  schemaVersion: 1,
  kind: "HOST_S1RA_ENVIRONMENT_INTEGRITY_BASELINE",
  stage: "Palimpsest Host-S1RA",
  phase: PHASE,
  measuredAt: new Date().toISOString(),
  evidenceClass: "READ_ONLY_ENVIRONMENT_OBSERVATION",
  note:
    "Measured, not recalled. Where a value differs from the handoff's expected value it is reported as measured; see discrepancies.",
  repository: {
    path: rel(REPO),
    branch: git("branch", "--show-current"),
    head: git("rev-parse", "HEAD"),
    tree: git("rev-parse", "HEAD^{tree}"),
    indexAndWorktreeClean: (git("status", "--porcelain=v1", "--untracked-files=all") ?? "") === "",
    statusEntryCount: (git("status", "--porcelain=v1", "--untracked-files=all") ?? "").split(NL).filter((line) => line !== "").length,
  },
  toolchain: {
    node: process.version,
    nodeExecutable: rel(process.execPath),
    nodeSatisfiesEngines: nodeSatisfiesAtLeast(process.version, [24, 15, 0]),
    enginesRequired: ">=24.15.0",
    pnpm: capture("pnpm", ["--version"]),
    git: capture("git", ["--version"]),
  },
  runtimeInstall: {
    home: rel(runtimeHome),
    homeKind: kindOf(runtimeHome),
    homeResolved: resolveOrNull(runtimeHome),
    installedVersion: installedRuntime,
    expectedFromHandoff: "0.2.1-rc.2",
    sandboxAclPresent: existsSync(join(runtimeModules, "@deepseek-ai", "dsh-sandbox-windows-acl", "lib", "index.js")),
    sandboxRunnerPresent: existsSync(join(runtimeModules, "@deepseek-ai", "dsh-sandbox-windows-acl", "lib", "runner.js")),
  },
  worktrees: {
    registeredCount: worktreeEntries.length,
    prunableCount,
    lockedCount,
    stalePaths: staleWorktreePaths,
    note:
      "Reported, not cleaned. Pruning stale registrations is a mutation of shared Git administrative state and is out of scope for this stage.",
  },
  gateRoot: {
    path: rel(gateRoot),
    exists: gateRootExists,
    entryCount: gateRootEntries.length,
    entries: gateRootEntries,
    physicalMiB: Number((gateRootBytes.bytes / 1024 ** 2).toFixed(2)),
    physicalFileCount: gateRootBytes.files,
  },
  disk,
  dependencyManifest: {
    produced: dependencyManifest !== null,
    exitCode: manifestRun.status,
    invariants: dependencyManifest?.invariants ?? null,
  },
  /**
   * DISCREPANCIES ARE THE POINT. Each entry is a measured value that differs from what the handoff recorded, so
   * a reader can see that the environment moved without having to diff two documents by eye.
   */
  discrepancies: [],
};

if (installedRuntime !== null && installedRuntime !== report.runtimeInstall.expectedFromHandoff) {
  report.discrepancies.push({
    field: "runtimeInstall.installedVersion",
    expectedFromHandoff: report.runtimeInstall.expectedFromHandoff,
    measured: installedRuntime,
    severity: "record",
    consequence:
      "The runtime package changed between Host-S1R and this stage. Every first-party Gate result in this stage is therefore attributed to the MEASURED version, not to the handoff's.",
  });
}
if (report.toolchain.nodeSatisfiesEngines !== true) {
  report.discrepancies.push({
    field: "toolchain.node",
    expectedFromHandoff: ">=24.15.0",
    measured: process.version,
    severity: "blocking",
    consequence: "This interpreter cannot run the repository's test suite. Re-run under the pinned runtime.",
  });
}
if (dependencyManifest === null) {
  report.discrepancies.push({
    field: "dependencyManifest",
    expectedFromHandoff: "produced",
    measured: `exit ${String(manifestRun.status)}`,
    severity: "blocking",
    consequence: "Without a dependency baseline §8.5 cannot be evaluated, so no destructive phase may start.",
  });
}

const emitted = `${JSON.stringify(report, null, 2)}${NL}`;
process.stdout.write(emitted);
if (JSON_OUT !== null) {
  writeFileSync(resolve(JSON_OUT), emitted, "utf8");
}

const blocking = report.discrepancies.filter((entry) => entry.severity === "blocking");
process.exit(blocking.length === 0 ? 0 : 5);
