/**
 * LHAPE-C one real-model condition session.
 *
 * Starts the real DSH host in the condition's world, starts the existing real-usage budget guard,
 * injects the measured constraint while the session is running, and records the outcome. It does not
 * score and does not read evaluator material.
 */
import { spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/u, "").split("=");
    return [key, rest.join("=")];
  }),
);
const condition = String(args.get("condition") ?? "");
if (!["F", "L", "G"].includes(condition)) {
  process.stderr.write("condition must be F, L or G\n");
  process.exit(2);
}
const run = String(args.get("run") ?? process.env.LHAPE_PILOT_RUN ?? "");
if (run === "" || !existsSync(join(run, "pilot.json"))) {
  process.stderr.write("a prepared pilot.json path is required (--run or LHAPE_PILOT_RUN)\n");
  process.exit(2);
}
const pilot = JSON.parse(readFileSync(join(run, "pilot.json"), "utf8"));
const repo = process.cwd();
const world = pilot.worlds[condition];
const home = pilot.homes[condition];
const out = join(run, "out", condition);
const dshBin = process.env.LHAPE_DSH_BIN;
const dshRoot = process.env.LHAPE_DSH_ROOT;
if (![dshBin, dshRoot].every((value) => typeof value === "string" && value.trim() !== "")) {
  process.stderr.write("LHAPE_DSH_BIN and LHAPE_DSH_ROOT are required\n");
  process.exit(2);
}
const prompt = readFileSync(join(run, "prompts", `${condition}.txt`), "utf8").trim();
const constraint = readFileSync(join(run, "constraint.md"), "utf8");
const session = pilot.sessions.find((entry) => entry.condition === condition);
if (session === undefined) {
  process.stderr.write("the prepared pilot has no session for this condition\n");
  process.exit(2);
}
const maxTokens = session.maxTokens;
/**
 * F is PLAIN DSH: it has no Palimpsest host bundle and therefore no `--once` runner plugin. It uses
 * the shipped `headless` profile with the same model/permission patch. L/G use the Palimpsest host
 * bundle's `--once` runner.
 */
const plain = condition === "F";
const profile = plain ? "headless" : "lhape-pilot";
const hostArgs = plain
  ? [dshBin, "--profile", "headless", "--patch", join(home, "profiles", "lhape-pilot", "cordis.patch.yml"), prompt]
  : [dshBin, "--profile", "lhape-pilot", "--once", prompt];
mkdirSync(out, { recursive: true });
mkdirSync(join(world, "inbox", "2026-11-03"), { recursive: true });
mkdirSync(join(run, "tmp"), { recursive: true });

const env = {
  ...process.env,
  DSH_HOME: home,
  TMP: join(run, "tmp"),
  TEMP: join(run, "tmp"),
  TMPDIR: join(run, "tmp"),
  PALIMPSEST_DSH_BIN: dshBin,
  PALIMPSEST_DSH_ROOT: dshRoot,
  PALIMPSEST_HOST_CAPACITY_ROOT: join(run, `capacity-${condition}`),
  /**
   * The provider proxy injects the real credential; DSH only needs a non-empty placeholder for the
   * route. The runner sets it itself so a recovered condition run cannot accidentally omit it.
   */
  C6R_PLACEHOLDER: process.env.C6R_PLACEHOLDER ?? "c6r-placeholder-not-a-credential",
};

const host = spawn(process.execPath, hostArgs, {
  cwd: world,
  env,
  stdio: ["ignore", "pipe", "pipe"],
});
const stdout = [];
const stderr = [];
host.stdout.on("data", (chunk) => stdout.push(chunk.toString()));
host.stderr.on("data", (chunk) => stderr.push(chunk.toString()));

const ledger = join(out, "budget.json");
const stoppedPath = join(out, "STOPPED.json");
const guard = spawn(process.execPath, [
  join(repo, "scripts", "aps", "budget_guard.mjs"),
  `--session-root=${join(home, "sessions")}`,
  `--max-tokens=${String(maxTokens)}`,
  `--target-pid=${String(host.pid)}`,
  `--ledger=${ledger}`,
  `--stopped=${stoppedPath}`,
], { stdio: "ignore" });

const startedAt = new Date().toISOString();
writeFileSync(join(out, "started-at.txt"), `${startedAt}\n`);
let injectedAt = null;
const injection = setTimeout(() => {
  const path = join(world, "inbox", "2026-11-03", "corridor-measurement.md");
  writeFileSync(path, constraint);
  injectedAt = new Date().toISOString();
  writeFileSync(join(out, "constraint-injected-at.txt"), `${injectedAt}\n`);
}, 45_000);

const outcome = await new Promise((resolve) => {
  host.on("error", (error) => resolve({ code: null, signal: null, error: error.message }));
  host.on("exit", (code, signal) => resolve({ code, signal, error: null }));
});
clearTimeout(injection);
try {
  guard.kill("SIGTERM");
} catch {
  /* already gone */
}
writeFileSync(join(out, "run.log"), stdout.join(""));
writeFileSync(join(out, "run.err"), stderr.join(""));
let usage = null;
try {
  usage = JSON.parse(readFileSync(ledger, "utf8"));
} catch {
  usage = null;
}
const record = {
  schema: "lhape-pilot-condition-run/v1",
  condition,
  cohortId: pilot.cohortId,
  codeFreeze: pilot.codeFreeze,
  world,
  profile,
  startedAt,
  injectedAt,
  endedAt: new Date().toISOString(),
  exitCode: outcome.code,
  signal: outcome.signal,
  error: outcome.error,
  stopped: existsSync(stoppedPath),
  usage,
  maxTokens,
};
writeFileSync(join(out, "run.json"), `${JSON.stringify(record, null, 2)}\n`);
process.exit(outcome.code === 0 && !record.stopped ? 0 : 1);
