/**
 * PWRS-R per-session adapter wrapper.
 *
 * It runs the SAME `scripts/alhs/run_core_session.mjs` adapter (real host, real guard, same kill
 * mechanics) and, immediately AFTER session 1 of a condition exits, snapshots what the interruption
 * actually left behind: the canonical Git state, the package bytes if any, and every retained attempt
 * world's HEAD/status/deliverable bytes.
 *
 * The snapshot is taken OUTSIDE the worlds and is never injected into session 2. It exists so the
 * scorer can measure real content inheritance instead of inferring it from a commit reference.
 */
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/u, "").split("=");
    return [key, rest.join("=")];
  }),
);
const sessionPath = args.get("session");
const coreRun = process.env.ALHS_CORE_RUN;
if (sessionPath === undefined || coreRun === undefined) {
  process.stderr.write("ALHS_CORE_RUN and --session are required\n");
  process.exit(2);
}
const sessionFile = resolve(String(sessionPath));
const session = JSON.parse(readFileSync(sessionFile, "utf8"));
const core = JSON.parse(readFileSync(join(coreRun, "core.json"), "utf8"));
const prepared = core.sessions.find((entry) => entry.id === session.sessionId);
if (prepared === undefined) {
  process.stderr.write(`no prepared session "${String(session.sessionId)}"\n`);
  process.exit(2);
}

function git(cwd, argv) {
  try {
    return execFileSync("git", ["-C", cwd, ...argv], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 }).trim();
  } catch {
    return null;
  }
}

function fileIfPresent(path) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

function deliverablesOf(world) {
  const dir = join(world, "deliverables");
  if (!existsSync(dir)) return {};
  const files = {};
  for (const name of readdirSync(dir)) {
    const content = fileIfPresent(join(dir, name));
    if (content !== null) files[name] = content;
  }
  return files;
}

function snapshot() {
  const world = prepared.world;
  const worldsRoot = join(world, ".palimpsest", "worlds");
  const retained = [];
  if (existsSync(worldsRoot)) {
    for (const name of readdirSync(worldsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name.startsWith("attempt-"))
      .map((entry) => entry.name)) {
      const path = join(worldsRoot, name);
      retained.push({
        name,
        path,
        head: git(path, ["rev-parse", "HEAD"]),
        subject: git(path, ["log", "-1", "--format=%s"]),
        status: git(path, ["status", "--porcelain"]),
        log: git(path, ["log", "--format=%h %s", "-5"])?.split(/\r?\n/u) ?? [],
        deliverables: deliverablesOf(path),
      });
    }
  }
  const value = {
    schema: "pwrs-r-interruption/v1",
    condition: prepared.condition,
    sessionId: prepared.id,
    at: new Date().toISOString(),
    world,
    canonical: {
      head: git(world, ["rev-parse", "HEAD"]),
      subject: git(world, ["log", "-1", "--format=%s"]),
      status: git(world, ["status", "--porcelain"]),
      log: git(world, ["log", "--format=%h %s", "-8"])?.split(/\r?\n/u) ?? [],
      deliverables: deliverablesOf(world),
    },
    retainedWorlds: retained,
  };
  mkdirSync(join(coreRun, "out"), { recursive: true });
  writeFileSync(join(coreRun, "out", `interruption-${prepared.condition}.json`), `${JSON.stringify(value, null, 2)}\n`);
}

const child = spawn(
  process.execPath,
  [join(resolve(String(process.env.ALHS_REPOSITORY ?? ".")), "scripts", "alhs", "run_core_session.mjs"), ...process.argv.slice(2)],
  { stdio: "inherit", env: process.env },
);
const code = await new Promise((resolve) => {
  child.on("error", () => resolve(127));
  child.on("exit", (exitCode) => resolve(exitCode ?? 1));
});
if (session.index === 1) snapshot();
process.exit(code);
