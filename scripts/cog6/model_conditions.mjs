/**
 * COG-6 model-condition harness and budget control.
 *
 * The provider gate is BLOCKED (QUOTA: Insufficient Balance). This module therefore:
 *   · implements the real launch path for a future authorised campaign;
 *   · refuses to start a scored session when the recorded gate says blocked;
 *   · tests that the budget controller can ACTUALLY terminate a running child, on a local dummy
 *     process with the same stdio/exit interface (no model is started by that test).
 *
 * It never logs credentials: the API key is read from the owner's credential store and passed through
 * the child environment only.
 */
import { spawn, spawnSync } from "node:child_process";
import { appendFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

export const REPO = resolve(import.meta.dirname, "..", "..");

export function ensureDir(path) {
  mkdirSync(path, { recursive: true });
}

export function writeJson(path, value) {
  ensureDir(resolve(path, ".."));
  writeFileSync(path, JSON.stringify(value, null, 2));
}

export function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function detectDshBin() {
  for (const line of (process.env.PATH ?? "").split(";")) {
    if (line.trim() === "") continue;
    for (const candidate of [
      join(line, "node_modules", "@deepseek-ai", "dsh", "lib", "bin.js"),
      join(line, "..", "node_modules", "@deepseek-ai", "dsh", "lib", "bin.js"),
    ]) {
      if (existsSync(candidate)) return resolve(candidate);
    }
  }
  const shared = join(homedir(), ".dsh", "profiles", "node_modules", "@deepseek-ai", "dsh");
  const pkg = join(shared, "package.json");
  if (existsSync(pkg)) {
    const parsed = JSON.parse(readFileSync(pkg, "utf8"));
    const bin = typeof parsed?.bin === "object" && parsed.bin !== null ? parsed.bin.dsh : parsed?.bin;
    if (typeof bin === "string") return resolve(join(shared, bin));
  }
  throw new Error("the DSH CLI could not be located");
}

/** Read the owner's key without printing it. */
function apiKey() {
  const yaml = readFileSync(join(homedir(), ".dsh", ".credentials.yaml"), "utf8");
  const match = yaml.match(/^\s{2}DEEPSEEK_API_KEY:\s*(\S+)\s*$/m);
  if (match === null) throw new Error("the owner's credential store has no DEEPSEEK_API_KEY");
  return match[1];
}

export function ensureSharedModules(homeDir) {
  const profiles = join(homeDir, "profiles");
  ensureDir(profiles);
  const shared = join(profiles, "node_modules");
  if (existsSync(shared)) return;
  const source = join(homedir(), ".dsh", "profiles", "node_modules");
  const result = spawnSync(
    process.platform === "win32" ? "cmd" : "ln",
    process.platform === "win32" ? ["/c", "mklink", "/J", shared, source] : ["-s", source, shared],
    { stdio: "ignore" },
  );
  if (result.status !== 0 || !existsSync(shared)) {
    throw new Error("the isolated DSH home could not link the shared profile modules");
  }
}

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
- id: tool-subagent
  disabled: true
- id: tool-subagent-fork
  disabled: true
- id: tool-subagent-control
  disabled: true
- id: tool-subagent-list-agents
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

export function writeHeadlessProfile(homeDir, unit) {
  const dir = join(homeDir, "profiles", unit);
  rmSync(dir, { recursive: true, force: true });
  ensureDir(dir);
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify(
      {
        name: `dsh-profile-${unit}`,
        private: true,
        dependencies: {},
        dsh: { profile: { bundles: ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-headless"], patchReload: "startup" } },
      },
      null,
      2,
    ),
  );
  writeFileSync(join(dir, "cordis.patch.yml"), BASH_PATCH);
  return dir;
}

/** The Palimpsest profile over an ALREADY-SEEDED deployment profile (world + state dirs). */
export function writePalimpsestProfile(homeDir, unit, deploymentProfilePath) {
  const dir = join(homeDir, "profiles", unit);
  rmSync(dir, { recursive: true, force: true });
  const bundleHome = join(dir, "node_modules");
  ensureDir(bundleHome);
  for (const [source, name] of [
    [join(REPO, "host", "dsh"), "palimpsest-dsh-host"],
    [join(REPO, "host", "deployment"), "palimpsest-host-deployment"],
  ]) {
    cpRecursive(source, join(bundleHome, name));
  }
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
    palimpsestEntry: '${join(REPO, "dist", "src", "advanced.js").replaceAll("\\", "/")}'
    deploymentProfile: '${deploymentProfilePath.replaceAll("\\", "/")}'
    serve: false
`,
  );
  return dir;
}

function cpRecursive(source, target) {
  cpSync(source, target, { recursive: true });
}

/**
 * The budget controller. It is deliberately independent of the model provider: it watches wall clock
 * and a reported-token counter, and it calls `child.kill('SIGKILL')` itself. A local monitor is not a
 * server-side hard cap; the evidence states that distinction.
 */
export function makeBudgetController({ maxWallClockMs, stopTokens, maxTokens, logPath }) {
  const started = Date.now();
  const state = { killedBy: null, reportedTokens: 0, usageEvents: 0 };
  let timer = null;
  const controller = {
    state,
    observe(line) {
      const match = line.match(/"?(?:total_?tokens|reported_?tokens|tokens_used|totalTokens)"?\s*[:=]\s*(\d+)/i);
      if (match !== null) {
        state.usageEvents += 1;
        state.reportedTokens = Math.max(state.reportedTokens, Number(match[1]));
      }
    },
    shouldStop() {
      if (Date.now() - started >= maxWallClockMs) return "wall_clock";
      if (state.reportedTokens >= stopTokens) return "token_stop_threshold";
      if (state.reportedTokens >= maxTokens) return "token_max";
      return null;
    },
    start(getChild) {
      timer = setInterval(() => {
        const reason = controller.shouldStop();
        if (reason === null) return;
        const child = getChild();
        if (child === null) return;
        state.killedBy = reason;
        try {
          child.kill("SIGKILL");
        } catch {
          /* the process may have exited between the check and the signal */
        }
        if (logPath !== undefined) appendFileSync(logPath, `[budget] killed by ${reason}\n`);
      }, 100);
      timer.unref?.();
    },
    stop() {
      if (timer !== null) clearInterval(timer);
      timer = null;
    },
    elapsedMs() {
      return Date.now() - started;
    },
  };
  return controller;
}

/** A local dummy child with the same stdio/exit interface — NO model, NO provider call. */
export function budgetSelfTest(root) {
  ensureDir(root);
  const script = join(root, "dummy-child.mjs");
  writeFileSync(
    script,
    `
let n = 0;
const timer = setInterval(() => {
  n += 1000;
  console.log(JSON.stringify({ total_tokens: n }));
}, 80);
setTimeout(() => { clearInterval(timer); process.exit(0); }, 30000);
`,
  );
  const logPath = join(root, "budget-self-test.log");
  writeFileSync(logPath, "");
  return new Promise((resolvePromise) => {
    const started = Date.now();
    const child = spawn(process.execPath, [script], { stdio: ["ignore", "pipe", "pipe"] });
    const budget = makeBudgetController({ maxWallClockMs: 20000, stopTokens: 3000, maxTokens: 8000, logPath });
    let output = "";
    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      output += text;
      for (const line of text.split(/\r?\n/)) budget.observe(line);
    });
    child.stderr.on("data", (chunk) => {
      output += chunk.toString();
    });
    budget.start(() => child);
    child.on("exit", (code, signal) => {
      budget.stop();
      resolvePromise({
        at: new Date().toISOString(),
        exitCode: code,
        signal,
        elapsedMs: Date.now() - started,
        killedBy: budget.state.killedBy,
        reportedTokensSeen: budget.state.reportedTokens,
        killed: budget.state.killedBy !== null,
        outputTail: output.slice(-500),
      });
    });
  });
}

/**
 * The recorded provider gate. It is never re-run automatically: a repeated quota probe spends
 * requests without producing new information. A future authorised campaign re-runs it explicitly.
 */
export function readProviderGate(path) {
  if (!existsSync(path)) return { state: "UNKNOWN", detail: "no provider gate result is recorded" };
  const result = readJson(path);
  const stderr = typeof result.stderrTail === "string" ? result.stderrTail : "";
  if (/QUOTA: Insufficient Balance/i.test(stderr)) {
    return { state: "BLOCKED", reason: "insufficient_balance", detail: stderr.slice(-800), result };
  }
  if (result.exit?.code === 0) return { state: "AVAILABLE", detail: "the probe exited 0", result };
  return { state: "UNKNOWN", detail: "the probe result does not establish availability", result };
}

/**
 * Launch one scored session. It refuses to start when the gate is not AVAILABLE, and it never
 * fabricates a transcript. The caller supplies the exact prompt from the frozen protocol.
 */
export async function runSession(input) {
  const gate = readProviderGate(input.providerGatePath);
  if (gate.state !== "AVAILABLE") {
    return {
      state: "BLOCKED",
      reason: gate.reason ?? "provider_unavailable",
      detail: gate.detail,
      started: false,
    };
  }
  ensureDir(input.homeDir);
  ensureDir(input.workDir);
  const env = { ...process.env, DEEPSEEK_API_KEY: apiKey(), DSH_HOME: input.homeDir, runtime_HOME: input.homeDir };
  delete env.PALIMPSEST_DSH_BIN;
  const args = [detectDshBin(), "--profile", input.unit];
  if (typeof input.resumeSessionId === "string" && input.resumeSessionId !== "") args.push("--resume", input.resumeSessionId);
  args.push(input.prompt);
  ensureDir(resolve(input.logPath, ".."));
  writeFileSync(input.logPath, "");
  const budget = makeBudgetController({
    maxWallClockMs: input.budget.maxWallClockMs,
    stopTokens: input.budget.stopTokens,
    maxTokens: input.budget.maxTokens,
    logPath: input.logPath,
  });
  const child = spawn(process.execPath, args, { cwd: input.workDir, env, stdio: ["ignore", "pipe", "pipe"] });
  budget.start(() => child);
  let stdout = "";
  let stderr = "";
  let buffer = "";
  const lines = [];
  child.stdout.on("data", (chunk) => {
    const text = chunk.toString();
    stdout += text;
    buffer += text;
    let index;
    while ((index = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, index).replace(/\r$/u, "");
      buffer = buffer.slice(index + 1);
      if (line === "") continue;
      lines.push({ at: new Date().toISOString(), line });
      budget.observe(line);
      appendFileSync(input.logPath, `[${new Date().toISOString()}] ${line}\n`);
    }
  });
  child.stderr.on("data", (chunk) => {
    const text = chunk.toString();
    stderr += text;
    appendFileSync(input.logPath, `[STDERR] ${text}`);
  });
  const exit = await new Promise((resolvePromise) => {
    child.on("exit", (code, signal) => resolvePromise({ code, signal }));
  });
  budget.stop();
  const sessionFiles = [];
  const walk = (dir) => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else sessionFiles.push(full);
    }
  };
  walk(join(input.homeDir, "sessions"));
  return {
    state: budget.state.killedBy === null ? "EXITED" : "STOPPED_BY_BUDGET",
    started: true,
    exit,
    elapsedMs: budget.elapsedMs(),
    killedBy: budget.state.killedBy,
    reportedTokensSeen: budget.state.reportedTokens,
    usageEvents: budget.state.usageEvents,
    stdoutTail: stdout.slice(-4000),
    stderrTail: stderr.slice(-4000),
    lines: lines.length,
    sessionFiles,
  };
}

/**
 * The campaign entry point. In the blocked state it writes a BLOCKED record and starts nothing.
 */
export async function runCampaign(input) {
  const gate = readProviderGate(input.providerGatePath);
  ensureDir(input.runDir);
  if (gate.state !== "AVAILABLE") {
    const record = {
      schema: "cog6-model-campaign/v1",
      at: new Date().toISOString(),
      state: "BLOCKED",
      gate,
      startedSessions: 0,
      note: "No scored P or F session was started. The provider gate did not establish availability.",
    };
    writeJson(join(input.runDir, "campaign.json"), record);
    return record;
  }
  throw new Error("the campaign launcher is implemented but a funded provider run has not been authorised in this stage");
}
