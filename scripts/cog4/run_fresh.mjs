#!/usr/bin/env node
/**
 * COG-4.2/4.3 — the scored fresh-Session trial.
 *
 *   node scripts/cog4/run_fresh.mjs --run=<mechanism run> --condition=P|F
 *
 * P: the shipped Palimpsest host in a NEW DSH home with an EMPTY session store, pointed at the durable
 *    project state of the deterministic run. No previous conversation is copied.
 * F: the same native DSH cognition in a NEW DSH home, over a git clone of the same repository with
 *    `.palimpsest/` removed and a Markdown HANDOFF.md plus the two deliverables added.
 *
 * The task is identical. The budget monitor polls real session usage and stops the process at the
 * per-session wall-clock or the hard ceiling. No deliverable is fabricated.
 */
import { execFileSync, spawn } from "node:child_process";
import { appendFileSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { ensureSharedModules, launchPrincipal, writeHeadlessProfile } from "../cog3/rig3.mjs";
import { createBudgetMonitor } from "./budget.mjs";
import { DSH_BIN, REPO, apiKey, ensureDir, observeHomeUsage, readJson, sessionTelemetry, writeJson } from "./rig4.mjs";

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/u, "").split("=");
    return [key, rest.join("=")];
  }),
);
const RUN = resolve(String(args.get("run") ?? ".cog4-rig/cross-basis"));
const CONDITION = String(args.get("condition") ?? "");
if (!["P", "F"].includes(CONDITION)) throw new Error("--condition=P|F is required");
const SMOKE = process.env.COG4_SMOKE === "1";
const MECH = readJson(join(RUN, "run.json"));
const P_WORK = join(RUN, "work");
const P_STATE = join(RUN, "state");
const OUT = join(RUN, CONDITION === "P" ? "fresh-p" : "fresh-f");
const HOME = join(OUT, "home");
const F_WORK = join(RUN, "f-native-work");
const TASK =
  "You are continuing the Sablewick Community Energy programme in this repository. Earlier work is recorded in the project's durable state and in the repository. Inspect what has been completed, what remains valid, and what is now unresolved or changed. Produce deliverables/continuation-note.md with exactly three sections: ## Prior work, ## Current status, and ## Next action. State what you would do next and why. If the next action would require substantial execution or an approval, describe it rather than starting it. Do not invent facts.";

ensureDir(OUT);
rmSync(HOME, { recursive: true, force: true });
ensureDir(HOME);

const BASH_PATCH = `
- id: bash-sandbox
  disabled: true
- insert:
    - id: bash-local
      name: '@deepseek-ai/dsh-bash-local'
  config:
    timeoutMs: 60000
- id: pwsh-sandbox
  disabled: true
- id: tool-bash
  disabled: false
- id: tool-pwsh
  disabled: true
`;

function writeFreshPalimpsestProfile(unit) {
  const dir = join(HOME, "profiles", unit);
  ensureDir(dir);
  const bundleHome = join(dir, "node_modules");
  ensureDir(bundleHome);
  for (const [source, name] of [
    [join(REPO, "host", "dsh"), "palimpsest-dsh-host"],
    [join(REPO, "host", "deployment"), "palimpsest-host-deployment"],
  ]) {
    cpSync(source, join(bundleHome, name), { recursive: true });
  }
  const deploymentPath = join(OUT, "deployment.json");
  writeFileSync(
    deploymentPath,
    JSON.stringify(
      {
        schemaVersion: 1,
        profileId: unit,
        projectId: "sablewick",
        localPeer: "peer-sablewick-fresh",
        persistentPoint: "pp-sablewick-fresh",
        repository: P_WORK,
        execution: "worktree",
        standard: {
          statement: "The package.json test script must pass and every change must stay inside the declared write scope.",
        },
        policy: { allowed_commands: [{ executable: "node", argv_prefix: ["verify.mjs"] }] },
        transport: { namespace: unit, databasePath: join(OUT, "transport.sqlite") },
        databases: {
          orchestration: join(P_STATE, "palimpsest.sqlite"),
          ordarium: join(P_STATE, "ordarium.sqlite"),
          coordination: join(OUT, "coordination.sqlite"),
          transportCursors: join(OUT, "cursors.sqlite"),
          boundaryMemory: join(OUT, "boundary.sqlite"),
          runtimeScope: join(OUT, "runtime.sqlite"),
          attentionMarks: join(OUT, "attention.sqlite"),
          projectAssociations: join(P_STATE, "associations.sqlite"),
          projectJournal: join(P_STATE, "journal.sqlite"),
        },
        reasoning: {},
        attention: { policyId: `${unit}-attention`, cooldownMs: 0, activation: "dsh" },
      },
      null,
      2,
    ),
  );
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify(
      {
        name: `dsh-profile-${unit}`,
        private: true,
        dependencies: {},
        dsh: { profile: { bundles: ["@deepseek-ai/dsh-base", "palimpsest-dsh-host"], patchReload: "startup" } },
      },
      null,
      2,
    ),
  );
  writeFileSync(
    join(dir, "cordis.patch.yml"),
    `${BASH_PATCH}
- id: palimpsest-tools
  config:
    palimpsestEntry: '${REPO}/dist/src/advanced.js'
    deploymentProfile: '${deploymentPath}'
    serve: false
`,
  );
  return { dir, deploymentPath };
}

function prepareFWorld() {
  if (existsSync(F_WORK)) rmSync(F_WORK, { recursive: true, force: true });
  /**
   * The P session commits its own continuation note on top of the mechanism head. Cloning the live P
   * repository directly would hand F the P answer, which is not an independent trial. Rebuild from the
   * mechanism head through a scratch clone whose branch is reset there; the clone into F then carries
   * only reachable history.
   */
  const seed = join(OUT, "seed-repo");
  if (existsSync(seed)) rmSync(seed, { recursive: true, force: true });
  execFileSync("git", ["clone", "--quiet", "--no-local", P_WORK, seed], { encoding: "utf8" });
  const cleanHead = MECH.finalHead;
  if (typeof cleanHead !== "string" || cleanHead === "") throw new Error("the mechanism run has no final head to rebuild F from");
  execFileSync("git", ["-C", seed, "reset", "--hard", cleanHead], { encoding: "utf8" });
  execFileSync("git", ["clone", "--quiet", "--no-local", seed, F_WORK], { encoding: "utf8" });
  rmSync(seed, { recursive: true, force: true });
  rmSync(join(F_WORK, ".palimpsest"), { recursive: true, force: true });
  rmSync(join(F_WORK, "deliverables", "continuation-note.md"), { force: true });
  const technical = MECH.results?.["technical-fit"]?.content ?? "";
  const cost = MECH.promotions?.costContentInTree ?? MECH.results?.["cost-schedule"]?.content ?? "";
  execFileSync("git", ["-C", F_WORK, "config", "user.email", "programme@example.invalid"]);
  execFileSync("git", ["-C", F_WORK, "config", "user.name", "programme"]);
  writeFileSync(join(F_WORK, "deliverables", "technical-fit.md"), technical);
  writeFileSync(
    join(F_WORK, "HANDOFF.md"),
    [
      "# Sablewick Community Energy — programme handoff",
      "",
      "## Project",
      "",
      "Three community sites, a £120,000 grant, a local-installer condition, a coastal-warranty condition at Site B, an 800 mm width limit at Site C, and an 8% contingency requirement. All work must finish by 30 June 2026.",
      "",
      "## Prior work",
      "",
      "### Technical fit — completed, not accepted",
      "",
      "The technical fit file is `deliverables/technical-fit.md`. It was produced before the vendor change described below and has not been re-issued.",
      "",
      "### Cost and schedule — accepted",
      "",
      "The cost/schedule file is `deliverables/cost-schedule.md`. It was promoted on the project head.",
      "",
      "## Changes after the work",
      "",
      "- **2026-02-10:** `sources/vendor-capabilities.csv` was updated. The Solaris V3 minimum operating temperature changed from -10 °C to 0 °C.",
      "- **2026-02-12:** `sources/newsletter.md` was updated with a spring volunteer-day note. It is a communications note, not a programme constraint.",
      "",
      "## Open items",
      "",
      "- The Solaris V3 cold-weather certificate is promised but not on file.",
      "- Site B requires a coastal-rated warranty and a design minimum of -4 °C.",
      "",
      "## Git",
      "",
      "The repository history contains the prior work commit, the accepted cost/schedule commit, and both updates. Use `git log` and `git diff` to inspect them.",
      "",
    ].join("\n"),
  );
  execFileSync("git", ["-C", F_WORK, "add", "--", "HANDOFF.md", "deliverables/technical-fit.md"]);
  execFileSync("git", ["-C", F_WORK, "commit", "-q", "-m", "handoff: prior work and project changes"], { encoding: "utf8" });
  return { workDir: F_WORK, head: execFileSync("git", ["-C", F_WORK, "rev-parse", "HEAD"], { encoding: "utf8" }).trim() };
}

function launchHeadless({ profileUnit, homeDir, workDir, task, logPath, timeoutMs, onTick }) {
  const env = { ...process.env, DEEPSEEK_API_KEY: apiKey(), DSH_HOME: homeDir, runtime_HOME: homeDir };
  delete env.PALIMPSEST_DSH_BIN;
  const child = spawn(process.execPath, [DSH_BIN, "--profile", profileUnit, task], { cwd: workDir, env, stdio: ["ignore", "pipe", "pipe"] });
  ensureDir(dirname(logPath));
  writeFileSync(logPath, "");
  let stdout = "";
  let stderr = "";
  let stopped = false;
  const started = Date.now();
  child.stdout.on("data", (chunk) => {
    stdout += chunk.toString();
    appendFileSync(logPath, chunk.toString());
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
    appendFileSync(logPath, `[STDERR] ${chunk.toString()}`);
  });
  const timer = setInterval(() => {
    if (onTick !== undefined) onTick();
  }, 2000);
  return new Promise((done) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearInterval(timer);
      clearTimeout(killer);
      done(value);
    };
    const killer = setTimeout(() => {
      stopped = true;
      try {
        if (process.platform === "win32") execFileSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
        else child.kill("SIGTERM");
      } catch {
        /* gone */
      }
      finish({ code: null, timedOut: true, stoppedByBudget: stopped, stdout, stderr, ms: Date.now() - started });
    }, timeoutMs);
    child.on("exit", (code) => finish({ code, timedOut: false, stoppedByBudget: stopped, stdout, stderr, ms: Date.now() - started }));
  });
}

const monitor = createBudgetMonitor();
const record = {
  schema: "cog4-fresh-run/v1",
  condition: CONDITION,
  startedAt: new Date().toISOString(),
  task: TASK,
  runtime: { dsh: DSH_BIN, node: process.version, platform: process.platform },
  mechanismRun: join(RUN, "run.json"),
  freshSession: true,
  previousSessionCopied: false,
  note: null,
  telemetry: null,
  budget: null,
  exit: null,
  stdoutTail: "",
  stderrTail: "",
};

try {
  if (CONDITION === "P") {
    const unit = "cog4-fresh-p";
    ensureSharedModules(HOME);
    const profile = writeFreshPalimpsestProfile(unit);
    record.profile = profile;
    record.world = { kind: "palimpsest", repository: P_WORK, state: P_STATE };
    const startedAt = Date.now();
    const principal = launchPrincipal({
      profileUnit: unit,
      homeDir: HOME,
      workDir: P_WORK,
      message: SMOKE ? "" : TASK,
      logPath: join(OUT, "principal.log"),
    });
    const tick = () => {
      observeHomeUsage(HOME, monitor, "principal", null, startedAt);
      const snap = monitor.snapshot();
      if ((snap.overWallClock.length > 0 || snap.stopRequested) && principal.exited === null) {
        void principal.stop("budget");
      }
    };
    const poll = setInterval(tick, 2000);
    try {
      await principal.waitFor((line) => line.startsWith("PALIMPSEST_HOST_READY "), { label: "PALIMPSEST_HOST_READY", timeoutMs: 180_000 });
      if (SMOKE) {
        record.smoke = true;
        record.ready = JSON.parse(principal.lines.find((entry) => entry.line.startsWith("PALIMPSEST_HOST_READY ")).line.slice("PALIMPSEST_HOST_READY ".length));
      } else {
        const turn = await principal.waitFor((line) => line.startsWith("PALIMPSEST_TURN "), { label: "the continuation turn", timeoutMs: 480_000 });
        record.turn = JSON.parse(turn.line.slice("PALIMPSEST_TURN ".length));
      }
    } catch (error) {
      record.exit = { error: error instanceof Error ? error.message : String(error) };
    } finally {
      clearInterval(poll);
      const stopped = await principal.stop("finished");
      record.exit = record.exit ?? { code: stopped?.code ?? null, signal: stopped?.signal ?? null, ms: stopped?.ms ?? null };
      record.stdoutTail = principal.stdout.slice(-30_000);
      record.stderrTail = principal.stderr.slice(-10_000);
    }
  } else {
    const unit = "cog4-fresh-f";
    const world = prepareFWorld();
    record.world = { kind: "native", repository: world.workDir, head: world.head };
    ensureSharedModules(HOME);
    writeHeadlessProfile(HOME, unit, { subagents: true });
    const startedAt = Date.now();
    const result = await launchHeadless({
      profileUnit: unit,
      homeDir: HOME,
      workDir: world.workDir,
      task: TASK,
      logPath: join(OUT, "headless.log"),
      timeoutMs: 480_000,
      onTick: () => {
        observeHomeUsage(HOME, monitor, "principal", null, startedAt);
        const snap = monitor.snapshot();
        if (snap.stopRequested) {
          // The launcher's own timeout is the hard bound; stopRequested is recorded for the report.
          record.budgetStopRequested = true;
        }
      },
    });
    record.exit = { code: result.code, timedOut: result.timedOut, stoppedByBudget: result.stoppedByBudget, ms: result.ms };
    record.stdoutTail = result.stdout.slice(-30_000);
    record.stderrTail = result.stderr.slice(-10_000);
  }

  observeHomeUsage(HOME, monitor, "principal", null, Date.now() - 1);
  record.budget = monitor.snapshot();
  record.telemetry = sessionTelemetry(HOME);
  const notePath = join(CONDITION === "P" ? P_WORK : F_WORK, "deliverables", "continuation-note.md");
  record.note = existsSync(notePath)
    ? { path: notePath, text: readFileSync(notePath, "utf8"), bytes: readFileSync(notePath).length }
    : null;
  record.gitStatus = execFileSync("git", ["status", "--short"], { cwd: CONDITION === "P" ? P_WORK : F_WORK, encoding: "utf8" }).trim();
} finally {
  record.finishedAt = new Date().toISOString();
  writeJson(join(OUT, "run.json"), record);
  writeFileSync(join(OUT, "note.md"), record.note?.text ?? "");
}

console.log(
  JSON.stringify({
    condition: CONDITION,
    exit: record.exit,
    note: record.note === null ? null : { bytes: record.note.bytes },
    sessions: record.telemetry?.length ?? 0,
    tokens: record.budget?.observedTokens ?? null,
    sessionsStarted: record.budget?.sessionsStarted ?? null,
    stopRequested: record.budget?.stopRequested ?? null,
    out: OUT,
  }),
);
