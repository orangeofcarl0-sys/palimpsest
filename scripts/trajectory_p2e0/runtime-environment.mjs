/**
 * Trajectory-P2-E0 §3.3 — ENVIRONMENT SNAPSHOT.
 *
 * READ-ONLY. Records the exact runtime the E0 stage ran under, so every later claim about a resource
 * limit, a Node version or a filesystem hazard is anchored to a measured fact rather than to memory.
 * It launches nothing, reads no session and contacts nothing.
 *
 * Usage:  node scripts/trajectory_p2e0/runtime-environment.mjs
 */
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DSH_HOME = process.env.DSH_HOME ?? join(homedir(), ".dsh");
const REAL_MODULES = join(DSH_HOME, "profiles", "node_modules");
const GATE_ROOT = process.env.PALIMPSEST_P2E0_GATE_ROOT ?? join(homedir(), ".palimpsest-gates");

function safe(run, fallback) {
  try {
    return run();
  } catch {
    return fallback;
  }
}
function sanitize(value) {
  if (typeof value !== "string") return value;
  return value.replace(/[A-Za-z]:\\[^\s"']*/gu, "<local-path>").replace(/[A-Za-z]:\/[^\s"']*/gu, "<local-path>").replace(/(?:\/Users|\/home)\/[^\s"']*/gu, "<local-path>");
}

const pkg = JSON.parse(safe(() => execFileSync("node", ["-p", `JSON.stringify(require('${join(REPO, "package.json").replace(/\\/gu, "/")}'))`], { encoding: "utf8" }), "{}"));
const dshPkgPath = join(REAL_MODULES, "@deepseek-ai", "dsh", "package.json");
const dshVersion = existsSync(dshPkgPath) ? safe(() => JSON.parse(execFileSync("node", ["-p", `JSON.stringify(require('${dshPkgPath.replace(/\\/gu, "/")}'))`], { encoding: "utf8" })).version, null) : null;

/** Count the junction/symlink entries of a directory — the P2-D2 incident's hazard class. */
function reparseProfile(root) {
  if (!existsSync(root)) return { present: false };
  let entries = 0;
  let reparse = 0;
  for (const entry of readdirSync(root)) {
    entries += 1;
    try {
      if (lstatSync(join(root, entry)).isSymbolicLink()) reparse += 1;
    } catch {
      /* vanished mid-scan */
    }
  }
  return { present: true, entries, reparsePoints: reparse };
}

/** Sum the size of the gate root's leaked owned roots, WITHOUT following reparse points. */
function ownedRootSweep(root) {
  if (!existsSync(root)) return { present: false, leakedRoots: 0, leakedBytes: 0, reparsePoints: 0 };
  const dirs = readdirSync(root).map((entry) => join(root, entry)).filter((path) => safe(() => statSync(path).isDirectory(), false));
  let bytes = 0;
  let reparsePoints = 0;
  const count = (path) => {
    for (const entry of readdirSync(path)) {
      const full = join(path, entry);
      let stat;
      try {
        stat = lstatSync(full);
      } catch {
        continue;
      }
      if (stat.isSymbolicLink()) {
        reparsePoints += 1;
        continue; // NEVER follow a reparse point when measuring
      }
      if (stat.isDirectory()) count(full);
      else bytes += stat.size;
    }
  };
  for (const dir of dirs) safe(() => count(dir), 0);
  return { present: true, leakedRoots: dirs.length, leakedBytes: bytes, reparsePoints };
}

const out = {
  schemaVersion: 1,
  kind: "TRAJECTORY_P2E0_RUNTIME_ENVIRONMENT",
  stage: "Trajectory-P2-E0",
  baseline: "8ba9ca3df4399eabc686fd23c24c7c0b2ba61290",
  readOnly: true,
  modelCallsMade: 0,
  os: { platform: process.platform, release: safe(() => execFileSync("uname", ["-a"], { encoding: "utf8" }).trim(), "unknown"), arch: process.arch },
  node: {
    version: process.version,
    execPath: sanitize(process.execPath),
    /** §3.3: the repository's declared engine, recorded so the mismatch is explicit rather than implied. */
    declaredEngine: pkg.engines?.node ?? null,
    meetsDeclaredEngine: safe(() => {
      const required = String(pkg.engines?.node ?? "").replace(/[^\d.]/gu, "");
      const [rmaj, rmin] = required.split(".").map(Number);
      const [maj, min] = process.version.replace(/^v/u, "").split(".").map(Number);
      return maj > rmaj || (maj === rmaj && min >= (rmin ?? 0));
    }, null),
    alternativesAvailable: {
      fnm: safe(() => execFileSync("which", ["fnm"], { encoding: "utf8" }).trim(), null),
      nvmDir: existsSync(join(process.env.APPDATA ?? "", "nvm")) ? "present" : "absent",
    },
  },
  pnpm: safe(() => execFileSync("pnpm", ["--version"], { encoding: "utf8", shell: true }).trim(), null),
  git: safe(() => execFileSync("git", ["--version"], { encoding: "utf8" }).trim(), null),
  dsh: { version: dshVersion, installedModules: sanitize(REAL_MODULES), present: existsSync(join(REAL_MODULES, "@deepseek-ai", "dsh-session")) },
  filesystem: {
    repoRoot: sanitize(REPO),
    /** The P2-D2 incident's exact hazard: the DSH profile's module tree is almost entirely junctions. */
    dshProfileModules: reparseProfile(REAL_MODULES),
    repoNodeModules: reparseProfile(join(REPO, "node_modules")),
    gateRoot: sanitize(GATE_ROOT),
    gateRootSweep: ownedRootSweep(GATE_ROOT),
  },
  disk: safe(
    () =>
      execFileSync("df", ["-Pk", REPO], { encoding: "utf8" })
        .split("\n")
        .slice(1)
        .filter(Boolean)
        .map((line) => {
          const parts = line.trim().split(/\s+/u);
          return { filesystem: parts[0], sizeKb: Number(parts[1]), usedKb: Number(parts[2]), availableKb: Number(parts[3]), usePercent: parts[4] };
        }),
    [],
  ),
  relevantEnv: Object.fromEntries(
    ["DSH_HOME", "PALIMPSEST_P2E0_GATE_ROOT", "PALIMPSEST_P2B_GATE_ROOT", "PALIMPSEST_DSH_BIN", "TEMP", "USERPROFILE"].map((key) => [key, key === "USERPROFILE" || key === "TEMP" ? sanitize(process.env[key] ?? null) : process.env[key] ?? null]),
  ),
  note: "§3.3: Node is below the declared engine minimum where that is true; no alternative runtime was installed (the ruling forbids modifying global user runtime configuration without authorization). The DSH profile module tree is almost entirely junctions — the exact hazard the P2-D2 cleanup followed.",
};

process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
