#!/usr/bin/env node
/**
 * Host-S1RA §2.2 — A BOUNDED DEPENDENCY-INTEGRITY MANIFEST.
 *
 * WHAT THIS IS FOR. A Gate damaged the repository's shared installation during Host-S1R: removing a parent
 * worktree deleted `node_modules/.bin` (twice), and a fixture-preparation step wrote into the module graph. This
 * tool produces a SMALL, COMPARABLE record of the properties that actually broke, so FB-0 can be re-verified
 * after every high-risk phase without hashing gigabytes of package contents.
 *
 * WHAT IT MEASURES, and why each item is here rather than a content digest:
 *
 *   lockfile           the declared dependency graph — a change here means the install contract moved.
 *   topLevelEntries    the set of names directly resolvable from the repository. A pnpm relink or a deleted
 *                      entry changes this set; it is exactly what `worktree remove --force` damaged.
 *   binEntries         `node_modules/.bin` file names AND their byte sizes. The observed damage was the whole
 *                      `.bin` directory disappearing, then coming back EMPTY — a name-only check would have
 *                      called the empty directory "intact", so sizes are included.
 *   moduleTargets      the resolved realpath of each top-level entry. A link retargeted at another checkout is
 *                      a shared-installation change even when the name is unchanged.
 *   workspaceState     pnpm's own metadata files, by size and mtime — cheap evidence that the installer ran.
 *   runtimePackage     the installed runtime package manifest version and its resolved path.
 *
 * DELIBERATELY NOT MEASURED: recursive hashes of every dependency file. That would take minutes, produce a
 * digest nobody can act on, and still not detect the damage classes above any better.
 *
 * READ-ONLY. This tool never writes inside the repository, the runtime home, or any dependency directory.
 *
 * Usage:
 *   node scripts/host_s1ra/dependency-manifest.mjs [--json-out <path>] [--repo <path>]
 */
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runtimeHomePath } from "../gates/runtime-home.mjs";

const NL = String.fromCharCode(10);
const HERE = dirname(fileURLToPath(import.meta.url));
const ARGV = process.argv.slice(2);
const argOf = (name) => {
  const index = ARGV.indexOf(name);
  return index === -1 ? null : (ARGV[index + 1] ?? null);
};

const REPO = resolve(argOf("--repo") ?? join(HERE, "..", ".."));
const JSON_OUT = argOf("--json-out");

/** The real runtime home, read the same way the gate scripts read it. */
const runtimeHome = runtimeHomePath();

const digest = (value) => `sha256-${createHash("sha256").update(value).digest("hex")}`;
const rel = (path) => String(path).replace(/\\/gu, "/");

/**
 * Resolve a path WITHOUT throwing. `realpathSync` fails on a dangling junction, which is itself a finding —
 * a dangling top-level dependency entry is broken resolution, not an absent one.
 */
function resolveOrNull(path) {
  try {
    return rel(realpathSync(path));
  } catch (error) {
    return `UNRESOLVED(${error?.code ?? "error"})`;
  }
}

/** `lstat` the path object itself; never follows. */
function objectKind(path) {
  try {
    const stats = lstatSync(path);
    if (stats.isSymbolicLink()) return "reparse";
    if (stats.isDirectory()) return "directory";
    if (stats.isFile()) return "file";
    return "other";
  } catch (error) {
    return `MISSING(${error?.code ?? "error"})`;
  }
}

function safeReaddir(path) {
  try {
    return readdirSync(path).sort();
  } catch {
    return null;
  }
}

function fileIdentity(path) {
  try {
    const stats = statSync(path);
    return { bytes: stats.size, digest: digest(readFileSync(path)) };
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ the repository install ---- */
const nodeModules = join(REPO, "node_modules");
const lockfilePath = join(REPO, "pnpm-lock.yaml");
const lockfile = fileIdentity(lockfilePath);

const topLevelNames = safeReaddir(nodeModules);
const topLevelEntries =
  topLevelNames === null
    ? null
    : topLevelNames.map((name) => {
        const path = join(nodeModules, name);
        return { name, kind: objectKind(path), target: resolveOrNull(path) };
      });

/**
 * `.bin` ENTRIES WITH SIZES. The measured failure was a `.bin` directory that existed but was EMPTY after a
 * worktree removal, so a name-only inventory would have reported the damaged state as healthy.
 */
const binPath = join(nodeModules, ".bin");
const binNames = safeReaddir(binPath);
const binEntries =
  binNames === null
    ? null
    : binNames.map((name) => {
        try {
          return { name, bytes: statSync(join(binPath, name)).size };
        } catch {
          return { name, bytes: -1 };
        }
      });

const workspaceState = ["pnpm-lock.yaml", ".modules.yaml", ".pnpm-workspace-state-v1.json"]
  .map((name) => {
    const path = name === "pnpm-lock.yaml" ? lockfilePath : join(nodeModules, name);
    try {
      const stats = statSync(path);
      return { name, bytes: stats.size, mtimeMs: Math.round(stats.mtimeMs) };
    } catch {
      return { name, bytes: null, mtimeMs: null };
    }
  });

/* ------------------------------------------------------------------ the runtime install ---- */
const runtimeModules = join(runtimeHome, "profiles", "node_modules");
const runtimePackageManifest = join(runtimeModules, "@deepseek-ai", "dsh", "package.json");
let runtimePackage = { manifest: rel(runtimePackageManifest), version: null, resolved: resolveOrNull(join(runtimeModules, "@deepseek-ai", "dsh")) };
try {
  runtimePackage.version = String(JSON.parse(readFileSync(runtimePackageManifest, "utf8")).version);
} catch {
  runtimePackage.version = null;
}

/**
 * THE RUNTIME HOME'S OWN PATH RELATIONSHIP.
 *
 * `~/.dsh` is a junction to `D:\dsh` on this machine. That is recorded here rather than treated as damage: it
 * predates this stage, it is the installer's own layout, and §7 adjudicates what it means for confidentiality.
 * Recording it makes a LATER change visible — if the home stops being a junction, that is a different host.
 */
const runtimeHomeKind = objectKind(runtimeHome);
const runtimeHomeResolved = resolveOrNull(runtimeHome);

/** The native sandbox packages the first-party Gates load. Absent means the Gate cannot run at all. */
const sandboxPackages = ["dsh-sandbox-windows-acl", "dsh-session"].map((name) => {
  const path = join(runtimeModules, "@deepseek-ai", name);
  return { name, kind: objectKind(path), target: resolveOrNull(path), present: existsSync(join(path, "package.json")) };
});

const manifest = {
  schemaVersion: 1,
  kind: "HOST_S1RA_DEPENDENCY_INTEGRITY_MANIFEST",
  stage: "Palimpsest Host-S1RA",
  purpose:
    "A bounded record of the shared-dependency properties that were actually damaged during Host-S1R. Re-verify before and after every potentially destructive phase; a mismatch is a stop condition.",
  measuredAt: new Date().toISOString(),
  repository: { path: rel(REPO), nodeModules: rel(nodeModules) },
  repositoryInstall: {
    lockfile: lockfile === null ? null : { path: rel(lockfilePath), ...lockfile },
    topLevelEntryCount: topLevelEntries === null ? null : topLevelEntries.length,
    topLevelEntries,
    binEntryCount: binEntries === null ? null : binEntries.length,
    binEntries,
    workspaceState,
  },
  runtimeInstall: {
    home: rel(runtimeHome),
    homeKind: runtimeHomeKind,
    homeResolved: runtimeHomeResolved,
    isJunction: runtimeHomeKind === "reparse",
    modules: rel(runtimeModules),
    package: runtimePackage,
    sandboxPackages,
  },
  /**
   * THE COMPARABLE CORE. Two manifests are "the same installation" when these agree. Kept separate from the
   * detail above so a comparison does not have to re-derive which fields matter.
   */
  invariants: {
    lockfileDigest: lockfile?.digest ?? null,
    topLevelNames: topLevelNames,
    binNames,
    binSizes: binEntries === null ? null : Object.fromEntries(binEntries.map((entry) => [entry.name, entry.bytes])),
    topLevelTargets: topLevelEntries === null ? null : Object.fromEntries(topLevelEntries.map((entry) => [entry.name, entry.target])),
    runtimeVersion: runtimePackage.version,
    runtimeHomeResolved,
    sandboxPackagesPresent: sandboxPackages.map((entry) => ({ name: entry.name, present: entry.present })),
  },
};

const emitted = `${JSON.stringify(manifest, null, 2)}${NL}`;
process.stdout.write(emitted);
if (JSON_OUT !== null) {
  writeFileSync(resolve(JSON_OUT), emitted, "utf8");
}

/**
 * EXIT STATUS IS A CLAIM. A manifest missing `.bin`, or one whose runtime package cannot be resolved, is not a
 * usable baseline — the caller must see that as a failure rather than as a written file.
 */
const usable =
  manifest.invariants.lockfileDigest !== null &&
  manifest.invariants.binNames !== null &&
  manifest.invariants.binNames.length > 0 &&
  manifest.invariants.runtimeVersion !== null &&
  sandboxPackages.every((entry) => entry.present);
process.exit(usable ? 0 : 4);
