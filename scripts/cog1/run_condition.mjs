#!/usr/bin/env node
/**
 * COG-1 — run ONE condition for ONE round.
 *
 *   node scripts/cog1/run_condition.mjs --condition A|B|C --round 1|2 --rig <dir>
 *
 * A, B and C share: the same model, the same source pack, the same task text, the
 * same working directory shape and the same wall-clock budget. They differ only in
 * the agent architecture:
 *
 *   A  STRONG SINGLE AGENT   headless DSH app; subagent/workflow tools DISABLED
 *   B  LEAD + WORKERS        headless DSH app; subagent/workflow tools ENABLED
 *   C  PALIMPSEST PRINCIPAL  palimpsest-dsh-host bundle; the ordinary product path
 *
 * Nothing here decides what to think. It prepares a world, launches one agent,
 * records what happened, and stops.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { appendFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { zstdDecompressSync } from "node:zlib";
import { roundOneTask, roundTwoTask, DELIVERABLES } from "./task_text.mjs";

const REPO = resolve(import.meta.dirname, "..", "..");
const SCENARIO = join(import.meta.dirname, "scenario");
const args = new Map(process.argv.slice(2).map((a) => {
  const [k, ...rest] = a.replace(/^--/u, "").split("=");
  return [k, rest.join("=")];
}));
const CONDITION = String(args.get("condition") ?? "").toUpperCase();
const ROUND = Number(args.get("round") ?? "0");
const RIG = String(args.get("rig") ?? "");
if (!["A", "B", "C"].includes(CONDITION)) throw new Error("--condition=A|B|C is required");
if (![1, 2].includes(ROUND)) throw new Error("--round=1|2 is required");
if (RIG === "") throw new Error("--rig=<dir> is required");

const TIMEOUT_MS = Number(process.env.COG1_TIMEOUT_MS ?? 1_500_000);
const DIR = join(RIG, CONDITION.toLowerCase());
const WORK = join(DIR, "work");
const HOME_DIR = join(DIR, "home");
const STATE = join(DIR, "state");
const PROFILES = join(HOME_DIR, "profiles");
const PROFILE_UNIT = `cog1-${CONDITION.toLowerCase()}`;
const LOG = join(DIR, `round-${ROUND}.log`);
const DSH_BIN = "C:/Users/66494/AppData/Roaming/npm/node_modules/@deepseek-ai/dsh/lib/bin.js";

/* --------------------------------------------------------------- credentials */

function apiKey() {
  const yaml = readFileSync(`${homedir()}/.dsh/.credentials.yaml`, "utf8");
  const match = yaml.match(/^\s{2}DEEPSEEK_API_KEY:\s*(\S+)\s*$/m);
  if (match === null) throw new Error("the owner's credential store has no DEEPSEEK_API_KEY");
  return match[1];
}

/* --------------------------------------------------------------- world build */

function buildWorld() {
  if (existsSync(join(WORK, "sources"))) return;
  mkdirSync(WORK, { recursive: true });
  cpSync(join(SCENARIO, "sources"), join(WORK, "sources"), { recursive: true });
  const git = (a) => execFileSync("git", a, { cwd: WORK, encoding: "utf8" });
  git(["init", "-q"]);
  git(["-c", "user.email=planning@example.invalid", "-c", "user.name=planning", "add", "-A"]);
  git(["-c", "user.email=planning@example.invalid", "-c", "user.name=planning", "commit", "-qm", "seed: Riversdale planning pack"]);
}

function releaseUpdates() {
  const target = join(WORK, "updates");
  if (existsSync(target)) return;
  cpSync(join(SCENARIO, "updates"), target, { recursive: true });
  const git = (a) => execFileSync("git", a, { cwd: WORK, encoding: "utf8" });
  git(["add", "-A"]);
  git(["-c", "user.email=planning@example.invalid", "-c", "user.name=planning", "commit", "-qm", "round 2: release update pack"]);
}

/* --------------------------------------------------------------- profiles */

function ensureSharedModules() {
  const shared = join(PROFILES, "node_modules");
  if (existsSync(shared)) return;
  mkdirSync(PROFILES, { recursive: true });
  symlinkSync(`${homedir().replaceAll(String.fromCharCode(92), "/")}/.dsh/profiles/node_modules`, shared, "junction");
}

function headlessProfile(enableSubagents) {
  const dir = join(PROFILES, PROFILE_UNIT);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "package.json"), JSON.stringify({
    name: `dsh-profile-${PROFILE_UNIT}`,
    private: true,
    dependencies: {},
    dsh: { profile: { bundles: ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-headless"], patchReload: "startup" } },
  }, null, 2));
  const disable = enableSubagents
    ? ""
    : `
- id: tool-subagent
  disabled: true
- id: tool-subagent-fork
  disabled: true
- id: tool-subagent-control
  disabled: true
- id: tool-workflow
  disabled: true
- id: subagent
  disabled: true
- id: subagent-spawn-in-process
  disabled: true
- id: subagent-fork-in-process
  disabled: true
- id: workflow-ptc
  disabled: true
`;
  writeFileSync(join(dir, "cordis.patch.yml"), `
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
${disable}`);
  return dir;
}

function palimpsestProfile() {
  const dir = join(PROFILES, PROFILE_UNIT);
  rmSync(dir, { recursive: true, force: true });
  const bundleHome = join(dir, "node_modules");
  mkdirSync(bundleHome, { recursive: true });
  for (const [source, name] of [[`${REPO}/host/dsh`, "palimpsest-dsh-host"], [`${REPO}/host/deployment`, "palimpsest-host-deployment"]]) {
    cpSync(source, join(bundleHome, name), { recursive: true });
  }
  mkdirSync(STATE, { recursive: true });
  const deploymentPath = join(STATE, "deployment.json");
  writeFileSync(deploymentPath, JSON.stringify({
    schemaVersion: 1,
    profileId: `cog1-${CONDITION.toLowerCase()}`,
    projectId: "riversdale",
    localPeer: "peer-riversdale",
    persistentPoint: "pp-riversdale",
    repository: WORK,
    transport: { namespace: `cog1-${CONDITION.toLowerCase()}-${ROUND}`, databasePath: join(STATE, "transport.sqlite") },
    databases: {
      orchestration: join(STATE, "orchestration.sqlite"),
      ordarium: join(STATE, "ordarium.sqlite"),
      coordination: join(STATE, "coordination.sqlite"),
      transportCursors: join(STATE, "cursors.sqlite"),
      boundaryMemory: join(STATE, "boundary.sqlite"),
      runtimeScope: join(STATE, "runtime.sqlite"),
      attentionMarks: join(STATE, "attention.sqlite"),
      projectAssociations: join(STATE, "associations.sqlite"),
      projectJournal: join(STATE, "journal.sqlite"),
    },
    reasoning: {},
    attention: { policyId: "cog1-attention-v1", cooldownMs: 0, activation: "none" },
  }, null, 2));
  writeFileSync(join(dir, "package.json"), JSON.stringify({
    name: `dsh-profile-${PROFILE_UNIT}`,
    private: true,
    dependencies: {},
    dsh: { profile: { bundles: ["@deepseek-ai/dsh-base", "palimpsest-dsh-host"], patchReload: "startup" } },
  }, null, 2));
  writeFileSync(join(dir, "cordis.patch.yml"), `
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
- id: palimpsest-tools
  config:
    palimpsestEntry: '${REPO}/dist/src/advanced.js'
    deploymentProfile: '${deploymentPath}'
    serve: false
`);
  return dir;
}

/* --------------------------------------------------------------- launch */

function launch(task) {
  const env = { ...process.env, DEEPSEEK_API_KEY: apiKey(), DSH_HOME: HOME_DIR, runtime_HOME: HOME_DIR };
  delete env.PALIMPSEST_DSH_BIN;
  const argv = CONDITION === "C"
    ? [DSH_BIN, "--profile", PROFILE_UNIT, "--once", task]
    : [DSH_BIN, "--profile", PROFILE_UNIT, task];
  const child = spawn(process.execPath, argv, { cwd: WORK, env, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (c) => { const t = c.toString(); stdout += t; appendFileSync(LOG, t); });
  child.stderr.on("data", (c) => { const t = c.toString(); stderr += t; appendFileSync(LOG, "[STDERR] " + t); });
  const started = Date.now();
  return Promise.race([
    new Promise((r) => child.on("exit", (code) => r({ code, timedOut: false, stdout, stderr, ms: Date.now() - started }))),
    new Promise((r) => setTimeout(() => {
      try { child.kill(); } catch { /* gone */ }
      r({ code: null, timedOut: true, stdout, stderr, ms: Date.now() - started });
    }, TIMEOUT_MS)),
  ]);
}

/* --------------------------------------------------------------- record */

function digestOf(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function deliverableState() {
  const out = {};
  for (const rel of DELIVERABLES) {
    const path = join(WORK, rel);
    out[rel] = existsSync(path)
      ? { present: true, bytes: readFileSync(path).length, digest: digestOf(readFileSync(path)) }
      : { present: false };
  }
  return out;
}

function sessionTelemetry() {
  const root = join(HOME_DIR, "sessions");
  if (!existsSync(root)) return null;
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name === "session.v4.jsonl.zstd" || entry.name === "session.v3.jsonl.zstd") files.push(path);
    }
  };
  walk(root);
  const sessions = [];
  for (const file of files) {
    try {
      const text = zstdDecompressSync(readFileSync(file)).toString("utf8");
      const events = text.split("\n").filter((l) => l.trim() !== "").map((l) => { try { return JSON.parse(l); } catch { return undefined; } }).filter(Boolean);
      let toolStarts = 0;
      const tools = {};
      let assistantMessages = 0;
      let promptChars = 0;
      for (const event of events) {
        const type = String(event.type ?? "");
        if (type === "tool/start") {
          toolStarts += 1;
          const name = event.data?.name ?? event.data?.call?.name ?? "?";
          tools[name] = (tools[name] ?? 0) + 1;
        }
        if (type === "assistant/message") assistantMessages += 1;
        if (type === "user/message") promptChars += JSON.stringify(event.data ?? {}).length;
      }
      sessions.push({ file: file.slice(root.length), events: events.length, toolStarts, tools, assistantMessages, promptChars, bytes: readFileSync(file).length });
    } catch (error) {
      sessions.push({ file, error: String(error) });
    }
  }
  return sessions;
}

async function main() {
  mkdirSync(DIR, { recursive: true });
  mkdirSync(HOME_DIR, { recursive: true });
  ensureSharedModules();
  buildWorld();
  if (ROUND === 2) releaseUpdates();
  if (CONDITION === "C") palimpsestProfile();
  else headlessProfile(CONDITION === "B");

  appendFileSync(LOG, `\n===== COG-1 condition ${CONDITION} round ${ROUND} =====\n`);
  const task = ROUND === 1 ? roundOneTask() : roundTwoTask();
  const result = await launch(task);
  const record = {
    condition: CONDITION,
    round: ROUND,
    finishedAt: new Date().toISOString(),
    wallClockMs: result.ms,
    exitCode: result.code,
    timedOut: result.timedOut,
    ready: result.stdout.split("\n").filter((l) => l.startsWith("PALIMPSEST_HOST_READY")).map((l) => { try { return JSON.parse(l.slice("PALIMPSEST_HOST_READY ".length)); } catch { return null; } })[0] ?? null,
    turns: result.stdout.split("\n").filter((l) => l.startsWith("PALIMPSEST_TURN")).map((l) => { try { return JSON.parse(l.slice("PALIMPSEST_TURN ".length)); } catch { return null; } }),
    deliverables: deliverableState(),
    sessions: sessionTelemetry(),
    stdoutTail: result.stdout.slice(-6000),
    stderrTail: result.stderr.slice(-4000),
  };
  writeFileSync(join(DIR, `round-${ROUND}.json`), JSON.stringify(record, null, 2));
  console.log(`condition=${CONDITION} round=${ROUND} exit=${record.exitCode} timeout=${record.timedOut} ms=${record.wallClockMs}`);
  for (const [rel, state] of Object.entries(record.deliverables)) console.log(`  ${state.present ? "OK " : "MISSING"} ${rel}${state.present ? ` (${state.bytes} bytes)` : ""}`);
  if (record.ready !== null) console.log(`  tools=${record.ready.toolNames?.length ?? 0} collaboration=${JSON.stringify(record.ready.collaboration)}`);
}

await main();
