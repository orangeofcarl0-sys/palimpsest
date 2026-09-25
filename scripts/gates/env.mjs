/**
 * PLMP-LEAN-1 — where a LIVE GATE keeps its files.
 *
 * A live gate drives real DSH/PTC workers, so it needs three things a unit test does not: a fixture
 * repository, an isolated DSH home, and a directory for the rig's own markers. All three are derived from
 * the environment so that a fresh `checkout` can re-run the gate without editing paths:
 *
 *   PALIMPSEST_GATE_ROOT     where this run's fixture/home/state/output live
 *                            default: <user home>/.palimpsest-gates
 *   PALIMPSEST_GATE_REPO     the Palimpsest checkout to load `dist/src/**` from
 *                            default: this repository (the scripts/ parent)
 *   DSH_HOME                 the REAL DSH home, where credentials and profiles/node_modules live
 *                            default: ~/.dsh
 *   PALIMPSEST_DSH_BIN       the real DSH entry point to re-exec through the tee wrapper
 *                            default: resolved from `npm root -g`
 *
 * THE DEFAULT GATE ROOT IS INSIDE THE USER PROFILE, AND THAT IS A MEASURED HOST REQUIREMENT rather than a
 * preference. DSH's PTC sandbox (`dsh-sandbox-windows-acl`) grants a worker's write capability by calling
 * `SetNamedSecurityInfoW` on the workspace directory, which needs WRITE_DAC. Measured on the reference
 * machine: the user holds FullControl inside their own profile but only Modify (inherited, no WRITE_DAC) on
 * the `F:`/`E:` volumes and on `C:\`, so every PTC `run_code` aborts with
 * `SetNamedSecurityInfoW failed (Win32 5): grantWrite(<dir>)`. A fixture placed next to the repository would
 * therefore fail for a reason that has nothing to do with Palimpsest. See `README.md` in this directory for
 * the full constraint list.
 *
 * Nothing here is a product component: the gates are acceptance evidence, and the product must not depend
 * on them. They are in Git because a gate whose harness is lost cannot be re-run, and re-runnability is
 * most of what makes a gate evidence rather than an anecdote.
 *
 * PLAIN JAVASCRIPT (`.mjs`), like the gates that import it: these run under bare `node`, not through the
 * TypeScript build, so no annotations may appear here.
 */
import { execFileSync, execSync } from "node:child_process";
import { cpSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** This repository's root — `scripts/gates/` → the checkout. */
export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** The Palimpsest checkout whose `dist/src/**` the gates load. */
export function gateRepoRoot() {
  const explicit = process.env.PALIMPSEST_GATE_REPO?.trim();
  return explicit !== undefined && explicit !== "" ? explicit : REPO_ROOT;
}

/**
 * Where this run's fixture lives. Defaults INSIDE THE USER PROFILE for the measured WRITE_DAC reason above:
 * the PTC sandbox can grant a write boundary there and generally cannot outside it.
 */
export function gateRoot() {
  const explicit = process.env.PALIMPSEST_GATE_ROOT?.trim();
  return explicit !== undefined && explicit !== "" ? explicit : join(homedir(), ".palimpsest-gates");
}

/** The REAL DSH home: credentials and the shared `profiles/node_modules`. */
export function dshHome() {
  const explicit = process.env.DSH_HOME?.trim();
  return explicit !== undefined && explicit !== "" ? explicit : join(homedir(), ".dsh");
}

/**
 * The real DSH entry point.
 *
 * Resolved rather than hardcoded: the global npm prefix differs per machine, and a gate that silently
 * loaded a different DSH than the one installed would measure something other than what it claims.
 */
export function dshBin() {
  const explicit = process.env.PALIMPSEST_DSH_BIN?.trim();
  if (explicit !== undefined && explicit !== "") return explicit;
  return join(npmGlobalRoot(), "@deepseek-ai", "dsh", "lib", "bin.js");
}

function npmGlobalRoot() {
  /**
   * `npm` is a `.cmd` shim on Windows. Measured here: `execFile("npm")` fails ENOENT, `execFile("npm.cmd")`
   * fails EINVAL (a known Node/Windows spawn issue), and the same command through a shell works — the exact
   * trap the deployment's own `executableIsRunnable` documents. So the shell form is tried FIRST and the
   * direct forms after it.
   *
   * The command string is a LITERAL with no interpolation, so the shell form carries no injection risk.
   */
  try {
    return execSync("npm root -g", { encoding: "utf8" }).trim();
  } catch {
    /* fall through to the direct forms */
  }
  for (const executable of ["npm.cmd", "npm"]) {
    try {
      return execFileSync(executable, ["root", "-g"], { encoding: "utf8" }).trim();
    } catch {
      /* try the next form */
    }
  }
  // `<prefix>/bin/node` or `<prefix>\node.exe` → `<prefix>/lib/node_modules` or `<prefix>/node_modules`.
  const dir = dirname(process.execPath);
  return process.platform === "win32" ? join(dir, "node_modules") : join(dir, "..", "lib", "node_modules");
}

/**
 * The DSH version this gate was last run against, read from the installed package.
 *
 * The gate prints it, so an evidence table says WHICH DSH produced it — a gate's result is only meaningful
 * together with the host that ran it.
 */
export function dshVersion() {
  try {
    const manifest = join(npmGlobalRoot(), "@deepseek-ai", "dsh", "package.json");
    const text = execFileSync(process.execPath, ["-e", `process.stdout.write(require('node:fs').readFileSync(${JSON.stringify(manifest)},'utf8'))`], {
      encoding: "utf8",
    });
    return String(JSON.parse(text).version);
  } catch {
    return "(unknown)";
  }
}

/**
 * Copy the CURRENT host bundle where the DSH profile loader resolves it.
 *
 * A gate run against a stale bundle would be measuring a build nobody shipped, so this always refreshes it.
 */
export function installHostBundle(input) {
  const target = join(input.realDshHome, "profiles", "node_modules", "palimpsest-dsh-host");
  rmSync(target, { recursive: true, force: true });
  cpSync(join(input.repo, "host", "dsh"), target, { recursive: true });
}
