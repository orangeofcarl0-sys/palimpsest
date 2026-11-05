/**
 * PSVR-C per-session adapter.
 *
 * Runs ONE prepared session through `scripts/alhs/run_core_session.mjs` (the proven real-host runner:
 * same guard, same token-milestone kill, same profile mechanics) and snapshots what the session left
 * behind AFTER it exits. The snapshot is taken outside the world and is not injected into session 2.
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
const CORE_RUN = resolve(String(process.env.ALHS_CORE_RUN ?? ""));
const SESSION_ID = args.get("session") === undefined ? null : String(args.get("session"));
if (CORE_RUN === "" || SESSION_ID === null) {
  process.stderr.write("ALHS_CORE_RUN and --session=<id> are required\n");
  process.exit(2);
}
const core = JSON.parse(readFileSync(join(CORE_RUN, "core.json"), "utf8"));
const prepared = core.sessions.find((entry) => entry.id === SESSION_ID);
if (prepared === undefined) {
  process.stderr.write(`no prepared session "${SESSION_ID}"\n`);
  process.exit(2);
}

mkdirSync(join(CORE_RUN, "out", SESSION_ID), { recursive: true });
const sessionFile = join(CORE_RUN, "out", SESSION_ID, "session.json");
writeFileSync(sessionFile, `${JSON.stringify({ sessionId: SESSION_ID }, null, 2)}\n`);

const child = spawn(process.execPath, [join(process.cwd(), "scripts", "alhs", "run_core_session.mjs"), `--session=${sessionFile}`], {
  cwd: process.cwd(),
  env: { ...process.env, ALHS_CORE_RUN: CORE_RUN },
  stdio: "inherit",
});
const code = await new Promise((resolveExit) => child.on("close", (value) => resolveExit(value ?? 1)));

function git(cwd, argv) {
  try {
    return execFileSync("git", ["-C", cwd, ...argv], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 }).trim();
  } catch {
    return null;
  }
}

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
      head: git(path, ["rev-parse", "HEAD"]),
      subject: git(path, ["log", "-1", "--format=%s"]),
      status: git(path, ["status", "--porcelain"]),
      log: git(path, ["log", "--format=%h %s", "-8"])?.split(/\r?\n/u) ?? [],
    });
  }
}

const tracked = git(world, ["ls-tree", "-r", "--name-only", "HEAD"])?.split(/\r?\n/u).filter(Boolean) ?? [];
const files = {};
for (const path of ["proto/energy.proto", "service/wire.js", "service/grpc_server.js", "service/grpc_client.js", "test/server.test.js", "test/integration.test.js", "MIGRATION.md"]) {
  if (tracked.includes(path)) files[path] = git(world, ["show", `HEAD:${path}`]);
}

writeFileSync(
  join(CORE_RUN, "out", SESSION_ID, "snapshot.json"),
  `${JSON.stringify(
    {
      schema: "psvr-c-session-snapshot/v1",
      sessionId: SESSION_ID,
      condition: prepared.condition,
      index: prepared.index,
      endedAt: new Date().toISOString(),
      world,
      head: git(world, ["rev-parse", "HEAD"]),
      subject: git(world, ["log", "-1", "--format=%s"]),
      status: git(world, ["status", "--porcelain"]),
      log: git(world, ["log", "--format=%h %s", "-20"])?.split(/\r?\n/u) ?? [],
      tracked,
      files,
      retained,
    },
    null,
    2,
  )}\n`,
);
process.exit(code);
