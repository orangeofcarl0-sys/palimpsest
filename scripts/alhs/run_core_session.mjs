/**
 * ALHS-C core per-session adapter.
 *
 * One real DSH host session in a matched world, under the existing real-usage guard with a one-message
 * reserve. Session 1 receives the measured constraint at T+60s and is killed at T+240s if still alive;
 * session 2 is a NEW principal session on the same durable project state. The adapter does not score,
 * does not read evaluator material and never fabricates a natural ending.
 */
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/u, "").split("=");
    return [key, rest.join("=")];
  }),
);
const SESSION_ARG = args.get("session");
const CORE_RUN = resolve(String(process.env.ALHS_CORE_RUN ?? ""));
if (SESSION_ARG === undefined || CORE_RUN === "") {
  process.stderr.write("ALHS_CORE_RUN and --session=<path> are required\n");
  process.exit(2);
}
const sessionFile = resolve(String(SESSION_ARG));
if (!existsSync(sessionFile)) {
  process.stderr.write(`session file not found: ${sessionFile}\n`);
  process.exit(2);
}
const sessionRef = JSON.parse(readFileSync(sessionFile, "utf8"));
const core = JSON.parse(readFileSync(join(CORE_RUN, "core.json"), "utf8"));
const session = core.sessions.find((entry) => entry.id === sessionRef.sessionId);
if (session === undefined) {
  process.stderr.write(`no prepared core session for "${String(sessionRef.sessionId)}"\n`);
  process.exit(2);
}

const repository = process.env.ALHS_REPOSITORY ?? process.cwd();
const dshBin = process.env.ALHS_DSH_BIN ?? "C:/Users/66494/AppData/Roaming/npm/node_modules/@deepseek-ai/dsh/lib/bin.js";
const dshRoot = process.env.ALHS_DSH_ROOT ?? join(CORE_RUN, "..", "seam");
const prompt = readFileSync(session.promptPath, "utf8").trim();
const world = session.world;
const home = session.home;
const out = session.out;
mkdirSync(out, { recursive: true });
mkdirSync(home, { recursive: true });
mkdirSync(join(CORE_RUN, "tmp"), { recursive: true });

const plain = session.condition === "F";
const profile = "alhs-core";
const patch = join(home, "profiles", profile, "cordis.patch.yml");
const hostArgs = plain
  ? [dshBin, "--profile", "headless", "--patch", patch, prompt]
  : [dshBin, "--profile", profile, "--once", prompt];

const env = {
  ...process.env,
  DSH_HOME: home,
  TMP: join(CORE_RUN, "tmp"),
  TEMP: join(CORE_RUN, "tmp"),
  TMPDIR: join(CORE_RUN, "tmp"),
  PALIMPSEST_DSH_BIN: dshBin,
  PALIMPSEST_DSH_ROOT: dshRoot,
  PALIMPSEST_HOST_CAPACITY_ROOT: join(CORE_RUN, `capacity-${session.id}`),
  C6R_PLACEHOLDER: process.env.C6R_PLACEHOLDER ?? "c6r-placeholder-not-a-credential",
};

const startedAt = new Date().toISOString();
writeFileSync(join(out, "started-at.txt"), `${startedAt}\n`);
const host = spawn(process.execPath, hostArgs, { cwd: world, env, stdio: ["ignore", "pipe", "pipe"] });
const stdout = [];
const stderr = [];
host.stdout.on("data", (chunk) => stdout.push(chunk.toString()));
host.stderr.on("data", (chunk) => stderr.push(chunk.toString()));

const ledger = join(out, "budget.json");
const stoppedPath = join(out, "STOPPED.json");
const guard = spawn(
  process.execPath,
  [
    join(repository, "scripts", "aps", "budget_guard.mjs"),
    `--session-root=${join(home, "sessions")}`,
    `--max-tokens=${String(session.maxTokens)}`,
    `--reserve-tokens=${String(session.reserveTokens)}`,
    `--target-pid=${String(host.pid)}`,
    `--ledger=${ledger}`,
    `--stopped=${stoppedPath}`,
  ],
  { stdio: "ignore" },
);

const marker = session.index === 1 ? `ALHS_CORE_${session.condition}` : `ALHS_CORE_${session.condition}_S2`;
function windowsPidOfMarker(text) {
  const script =
    `(Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -like '*${text}*' } | Select-Object -First 1).ProcessId`;
  try {
    const value = execFileSync("powershell", ["-NoProfile", "-Command", script], { encoding: "utf8" }).trim();
    const pid = Number(value);
    return Number.isSafeInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

let killedAt = null;
let killPid = null;
let killedBy = null;
function killHostTree(reason) {
  if (killedAt !== null || host.exitCode !== null) return;
  const pid = windowsPidOfMarker(marker);
  killedAt = new Date().toISOString();
  killPid = pid;
  killedBy = reason;
  if (pid !== null) {
    try {
      execFileSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
    } catch {
      /* the process may have exited between resolution and kill */
    }
  }
  try {
    host.kill("SIGKILL");
  } catch {
    /* already gone */
  }
  writeFileSync(join(out, "killed-at.txt"), `${killedAt}\n`);
}

let injectedAt = null;
const injectionTimer =
  session.injectAtMs === null
    ? null
    : setTimeout(() => {
        const path = join(world, String(session.injectionRel ?? "inbox/2026-11-03/corridor-measurement.md"));
        mkdirSync(join(path, ".."), { recursive: true });
        writeFileSync(path, readFileSync(core.constraint, "utf8"));
        injectedAt = new Date().toISOString();
        writeFileSync(join(out, "constraint-injected-at.txt"), `${injectedAt}\n`);
      }, session.injectAtMs);

const killTimer = setTimeout(() => killHostTree("scenario_kill"), session.killAfterMs);

/**
 * ALHS-C repeat: a TOKEN-MILESTONE interruption. The fixed-wall-clock kill in the core gave the two
 * conditions different amounts of work before the interruption; a milestone at the same reported
 * usage gives them the same budget. The wall-clock timer above stays as a backstop.
 */
let tokenPoll = null;
if (Number.isSafeInteger(session.killAtTokens) && session.killAtTokens > 0) {
  tokenPoll = setInterval(() => {
    try {
      const ledgerNow = JSON.parse(readFileSync(ledger, "utf8"));
      if ((ledgerNow.totalTokens ?? 0) >= session.killAtTokens) {
        if (tokenPoll !== null) clearInterval(tokenPoll);
        killHostTree("token_milestone");
      }
    } catch {
      /* the ledger may not exist yet */
    }
  }, 1_000);
}

const outcome = await new Promise((resolve) => {
  host.on("error", (error) => resolve({ code: null, signal: null, error: error.message }));
  host.on("exit", (code, signal) => resolve({ code, signal, error: null }));
});
if (injectionTimer !== null) clearTimeout(injectionTimer);
clearTimeout(killTimer);
if (tokenPoll !== null) clearInterval(tokenPoll);
try {
  guard.kill("SIGTERM");
} catch {
  /* already gone */
}
// Give the guard a moment to write its final ledger before reading it.
await new Promise((resolve) => setTimeout(resolve, 300));

writeFileSync(join(out, "run.log"), stdout.join(""));
writeFileSync(join(out, "run.err"), stderr.join(""));
let usage = null;
try {
  usage = JSON.parse(readFileSync(ledger, "utf8"));
} catch {
  usage = null;
}
const stopped = existsSync(stoppedPath);
const record = {
  schema: "alhs-core-session-run/v1",
  cohortId: core.cohortId,
  sessionId: session.id,
  condition: session.condition,
  index: session.index,
  world,
  home,
  profile: plain ? "headless" : profile,
  startedAt,
  injectedAt,
  endedAt: new Date().toISOString(),
  exitCode: outcome.code,
  signal: outcome.signal,
  error: outcome.error,
  killedAt,
  killPid,
  killedBy,
  stopped,
  usage,
  maxTokens: session.maxTokens,
  reserveTokens: session.reserveTokens,
  softStopAt: session.maxTokens - session.reserveTokens,
  killAtTokens: session.killAtTokens ?? null,
  natural: outcome.code === 0 && !stopped && killedAt === null,
};
writeFileSync(join(out, "run.json"), `${JSON.stringify(record, null, 2)}\n`);
process.exit(outcome.error === null ? 0 : 1);
