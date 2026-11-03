/**
 * Host-S1RA-E4 §C1.3 — RUNTIME SEAM RESOLUTION PROBE.
 *
 * Reads the shipped fence's own resolution logic and exercises it against the INSTALLED runtime, so the recorded
 * compatibility facts come from the code that will actually run rather than from a reimplementation of it.
 *
 * It records four separate things, because they are four separate questions:
 *
 *   1. Can the seam package be RESOLVED from a candidate base?
 *   2. Does it export the seam and the five helpers, AS FUNCTIONS?
 *   3. What version does the resolved manifest report?
 *   4. What does the shipped fence conclude (`dshCompatibilityReport`) for that same base?
 *
 * A successful `require` of the package is not the same as the fence being able to resolve it, and E4 must not report
 * the first as though it were the second.
 *
 * READ-ONLY. Nothing here writes to the runtime installation.
 *
 * Usage:
 *   node scripts/host_s1rae4/runtime-seam-probe.mjs [--json=<path>]
 */
import { existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/u, "").split("=");
    return [key, rest.join("=")];
  }),
);

const REPO = resolve(import.meta.dirname, "..", "..");
const FENCE = join(REPO, "host", "deployment", "runtime", "win32_label.js");

/** The candidate module trees, discovered rather than assumed. */
const HOME_JUNCTION = join(homedir(), ".dsh");
const candidates = [];
const addCandidate = (label, path) => {
  if (!existsSync(path)) return;
  let real = null;
  try {
    real = realpathSync(path);
  } catch {
    real = null;
  }
  candidates.push({ label, path: path.replace(/\\/gu, "/"), realpath: real === null ? null : real.replace(/\\/gu, "/"), exists: true });
};
addCandidate("runtime-home-profiles", join(HOME_JUNCTION, "profiles"));
addCandidate("runtime-home-profiles-node_modules", join(HOME_JUNCTION, "profiles", "node_modules"));
addCandidate("repo-node_modules", join(REPO, "node_modules"));

const SEAM = "@deepseek-ai/dsh-win32-process";
const REQUIRED = ["extendWin32ProcessBindings", "allocPtrSlot", "allocUint32", "decodePtr", "decodeUint32", "isNullPtr"];

/** For each candidate, ask the same three questions the fence asks. */
const resolutions = candidates.map((candidate) => {
  const base = `${candidate.path.replace(/\/+$/u, "")}/`;
  const out = { ...candidate, base, resolves: false, resolveError: null, entry: null, manifestVersion: null, exports: {}, koffiVersion: null };
  let requireFrom;
  try {
    requireFrom = createRequire(base);
  } catch (error) {
    out.resolveError = `createRequire failed: ${String(error?.message ?? error)}`;
    return out;
  }
  try {
    out.entry = requireFrom.resolve(SEAM);
    out.resolves = true;
  } catch (error) {
    out.resolveError = `${String(error?.code ?? "")} ${String(error?.message ?? error).slice(0, 200)}`;
    return out;
  }
  /** The manifest, read from the resolved entry's package directory. */
  try {
    const marker = `${SEAM.replace(/^@[^/]+\//u, "")}`;
    const packageDir = out.entry.slice(0, out.entry.lastIndexOf(marker) + marker.length);
    out.manifestVersion = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8")).version;
  } catch {
    out.manifestVersion = null;
  }
  /** The exported surface, by TYPE rather than by name presence. */
  try {
    const mod = requireFrom(SEAM);
    for (const name of REQUIRED) out.exports[name] = typeof mod[name];
  } catch (error) {
    out.exportsError = String(error?.message ?? error).slice(0, 200);
  }
  /** The FFI runtime, resolved from the seam package as the fence does. */
  try {
    const seamRequire = createRequire(out.entry);
    const koffiEntry = seamRequire.resolve("koffi");
    const koffiDir = koffiEntry.slice(0, koffiEntry.lastIndexOf("koffi") + "koffi".length);
    out.koffiVersion = JSON.parse(readFileSync(join(koffiDir, "package.json"), "utf8")).version;
  } catch {
    out.koffiVersion = null;
  }
  return out;
});

/**
 * THE SHIPPED FENCE'S OWN CONCLUSION. Imported once, with `PALIMPSEST_runtime_ROOT` unset so the probe measures the
 * default resolution path rather than a path this script arranged.
 */
const fenceReport = await (async () => {
  try {
    const module = await import(pathToFileURL(FENCE).href);
    return module.dshCompatibilityReport();
  } catch (error) {
    return { error: `import failed: ${String(error?.message ?? error)}` };
  }
})();

/** The contract as declared in source, read as text so no module state can affect it. */
const fenceSource = readFileSync(FENCE, "utf8");
const declaredQualified = /qualifiedVersion:\s*'([^']+)'/u.exec(fenceSource)?.[1] ?? null;
const declaredFfi = /FFI_RUNTIME_QUALIFIED\s*=\s*'([^']+)'/u.exec(fenceSource)?.[1] ?? null;
const resolutionBasesSource = /function resolutionBases\(\)[\s\S]{0,700}?\n\}/u.exec(fenceSource)?.[0] ?? null;

const report = {
  schemaVersion: 1,
  kind: "HOST_S1RAE4_RUNTIME_SEAM_PROBE",
  stage: "Palimpsest Host-S1RA-E4",
  measuredAt: new Date().toISOString(),
  node: { version: process.version, executable: process.execPath, argv1: process.argv[1] ?? null },
  platform: process.platform,
  arch: process.arch,
  fence: { path: FENCE.replace(/\\/gu, "/"), declaredQualifiedVersion: declaredQualified, declaredFfiQualified: declaredFfi },
  candidates,
  resolutions,
  fenceReport,
  /**
   * THE DISTINCTION THAT MATTERS. `resolvableSomewhere` and `fenceCanResolve` are different facts and are never
   * collapsed into one another.
   */
  verdict: {
    seamResolvableFromSomeCandidate: resolutions.some((entry) => entry.resolves),
    seamVersionsFound: [...new Set(resolutions.filter((entry) => entry.manifestVersion !== null).map((entry) => entry.manifestVersion))],
    allSixSymbolsAreFunctions: resolutions.some((entry) => REQUIRED.every((name) => entry.exports[name] === "function")),
    ffiVersionsFound: [...new Set(resolutions.filter((entry) => entry.koffiVersion !== null).map((entry) => entry.koffiVersion))],
    fenceResolvedVersion: fenceReport.resolvedVersion ?? null,
    fenceDrifted: fenceReport.drifted ?? null,
    fenceUsable: fenceReport.usable ?? null,
    fenceError: fenceReport.error ?? null,
  },
  resolutionBasesSource,
};

const jsonPath = args.get("json");
if (jsonPath !== undefined) writeFileSync(resolve(jsonPath), `${JSON.stringify(report, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
