/**
 * COG-3 shared rig — normal DSH Host composition, isolated runtime homes, portable paths.
 *
 * COG-2 lessons applied:
 *   - no hardcoded DSH/zstd paths: detect, record, and fail loudly when absent (§13.2);
 *   - every run has its own directory and its own evidence; nothing overwrites (§13.1);
 *   - the principal runs LONG-LIVED through the shipped host, not a diagnostic launchDeployment call;
 *   - the model identity is read from the session stream, never assumed (§7.5).
 *
 * READ-ONLY with respect to the real runtime home and every non-test resource.
 */
import { appendFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { zstdDecompressSync } from "node:zlib";

export const REPO = resolve(import.meta.dirname, "..", "..");
export const RIG = process.env.COG3_RIG ?? join(REPO, "..", ".cog3-rig");
export const SCENARIO = join(import.meta.dirname, "scenario");
export const TIMEOUT_MS = Number(process.env.COG3_TIMEOUT_MS ?? 1_200_000);

function which(name) {
  try {
    const out = execFileSync(process.platform === "win32" ? "where" : "which", [name], { encoding: "utf8" });
    return out.split(/\r?\n/u).map((line) => line.trim()).filter((line) => line !== "");
  } catch {
    return [];
  }
}

/**
 * The real DSH CLI. The `dsh` on PATH is a launcher shim; the JS entry is the package's declared bin.
 * The detected path is recorded in every run record so the evidence names the exact runtime.
 */
export function detectDshBin() {
  const explicit = process.env.COG3_DSH_BIN;
  if (typeof explicit === "string" && explicit.trim() !== "" && existsSync(explicit)) return resolve(explicit);
  for (const line of which("dsh")) {
    const dir = dirname(line);
    for (const candidate of [
      join(dir, "node_modules", "@deepseek-ai", "dsh", "lib", "bin.js"),
      join(dir, "..", "node_modules", "@deepseek-ai", "dsh", "lib", "bin.js"),
    ]) {
      if (existsSync(candidate)) return resolve(candidate);
    }
  }
  const shared = join(homedir(), ".dsh", "profiles", "node_modules", "@deepseek-ai", "dsh");
  const pkg = join(shared, "package.json");
  if (existsSync(pkg)) {
    try {
      const parsed = JSON.parse(readFileSync(pkg, "utf8"));
      const bin = typeof parsed?.bin === "object" && parsed.bin !== null ? parsed.bin.dsh : parsed?.bin;
      if (typeof bin === "string") {
        const candidate = join(shared, bin);
        if (existsSync(candidate)) return resolve(candidate);
      }
    } catch {
      /* fall through to the explicit failure below */
    }
  }
  throw new Error(
    `COG-3 cannot locate the DSH CLI: probed PATH ${JSON.stringify(which("dsh"))}, the owner profile store ${pkg}, and COG3_DSH_BIN. Record the exact path or install dsh.`,
  );
}

/**
 * Optional external decoder. The session stream is normally decoded by Node's own zstd support
 * (multi-frame, below), so this is a fallback only and its absence is not an error.
 */
export function detectZstd() {
  const explicit = process.env.COG3_ZSTD;
  if (typeof explicit === "string" && explicit.trim() !== "" && existsSync(explicit)) return resolve(explicit);
  const found = which("zstd");
  if (found.length > 0) return resolve(found[0]);
  for (const candidate of [
    join(process.env.CONDA_PREFIX ?? "", "Library", "bin", "zstd.exe"),
    join(process.env.ProgramData ?? "", "anaconda3", "Library", "bin", "zstd.exe"),
  ]) {
    if (candidate !== "" && existsSync(candidate)) return resolve(candidate);
  }
  return null;
}

export const DSH_BIN = detectDshBin();
export const ZSTD = detectZstd();

export function apiKey() {
  const yaml = readFileSync(`${homedir()}/.dsh/.credentials.yaml`, "utf8");
  const match = yaml.match(/^\s{2}DEEPSEEK_API_KEY:\s*(\S+)\s*$/m);
  if (match === null) throw new Error("the owner's credential store has no DEEPSEEK_API_KEY");
  return match[1];
}

export function ensureDir(path) {
  mkdirSync(path, { recursive: true });
}

export function digest(text) {
  return createHash("sha256").update(text).digest("hex");
}

export function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function writeJson(path, value) {
  writeFileSync(path, JSON.stringify(value, null, 2));
}

export function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function git(args, cwd) {
  return execFileSync("git", ["-c", "user.email=planning@example.invalid", "-c", "user.name=planning", ...args], {
    cwd,
    encoding: "utf8",
  });
}

/** Build the test-owned world. `withNotes` chooses the ordinary-file carrier for the file conditions. */
export function buildWorld(workDir, { withNotes }) {
  if (existsSync(join(workDir, ".git"))) return;
  ensureDir(workDir);
  ensureDir(join(workDir, "sources"));
  for (const entry of readdirSync(join(SCENARIO, "sources"), { withFileTypes: true })) {
    if (!withNotes && entry.name === "prior-notes.md") continue;
    cpSync(join(SCENARIO, "sources", entry.name), join(workDir, "sources", entry.name), { recursive: true });
  }
  ensureDir(join(workDir, "deliverables"));
  git(["init", "-q"], workDir);
  git(["add", "-A"], workDir);
  git(["commit", "-qm", "seed: Wrenfield programme pack"], workDir);
}

/** Release the later project change as a committed file. The new commit is the new project reality. */
export function applyUpdate(workDir) {
  const target = join(workDir, "updates");
  if (existsSync(target)) return false;
  cpSync(join(SCENARIO, "updates"), target, { recursive: true });
  git(["add", "-A"], workDir);
  git(["commit", "-qm", "update 2026-01-20: Northgate inspection room booked"], workDir);
  return true;
}

export function ensureSharedModules(homeDir) {
  const profiles = join(homeDir, "profiles");
  ensureDir(profiles);
  const shared = join(profiles, "node_modules");
  if (!existsSync(shared)) {
    symlinkSync(`${homedir().replaceAll(String.fromCharCode(92), "/")}/.dsh/profiles/node_modules`, shared, "junction");
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
`;

function subagentPatch(enabled) {
  return enabled
    ? ""
    : `
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
}

/** Headless single agent: the S baseline (no subagents) and the F baseline (native subagents). */
export function writeHeadlessProfile(homeDir, unit, { subagents }) {
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
  writeFileSync(join(dir, "cordis.patch.yml"), `${BASH_PATCH}${subagentPatch(subagents)}`);
  return dir;
}

/**
 * The shipped Palimpsest host. `activation: "dsh"` is what composes the terminal delegation delivery;
 * `reasoning: {}` is what composes the reasoning store and the host-derived branch port.
 */
export function writePalimpsestProfile(homeDir, { unit, stateDir, workDir, projectId, activation = "dsh", subagents = false, reasoning = true }) {
  const dir = join(homeDir, "profiles", unit);
  rmSync(dir, { recursive: true, force: true });
  const bundleHome = join(dir, "node_modules");
  ensureDir(bundleHome);
  for (const [source, name] of [
    [`${REPO}/host/dsh`, "palimpsest-dsh-host"],
    [`${REPO}/host/deployment`, "palimpsest-host-deployment"],
  ]) {
    cpSync(source, join(bundleHome, name), { recursive: true });
  }
  ensureDir(stateDir);
  const deploymentPath = join(stateDir, "deployment.json");
  writeFileSync(
    deploymentPath,
    JSON.stringify(
      {
        schemaVersion: 1,
        profileId: unit,
        projectId,
        localPeer: `peer-${projectId}`,
        persistentPoint: `pp-${projectId}`,
        repository: workDir,
        transport: { namespace: unit, databasePath: join(stateDir, "transport.sqlite") },
        databases: {
          orchestration: join(stateDir, "orchestration.sqlite"),
          ordarium: join(stateDir, "ordarium.sqlite"),
          coordination: join(stateDir, "coordination.sqlite"),
          transportCursors: join(stateDir, "cursors.sqlite"),
          boundaryMemory: join(stateDir, "boundary.sqlite"),
          runtimeScope: join(stateDir, "runtime.sqlite"),
          attentionMarks: join(stateDir, "attention.sqlite"),
          projectAssociations: join(stateDir, "associations.sqlite"),
          projectJournal: join(stateDir, "journal.sqlite"),
        },
        reasoning: reasoning ? {} : undefined,
        attention: { policyId: `${unit}-attention`, cooldownMs: 0, activation },
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
    `${BASH_PATCH}${subagentPatch(subagents)}
- id: palimpsest-tools
  config:
    palimpsestEntry: '${REPO}/dist/src/advanced.js'
    deploymentProfile: '${deploymentPath}'
    serve: false
`,
  );
  return { dir, deploymentPath };
}

export function launchEnv(homeDir) {
  const env = { ...process.env, DEEPSEEK_API_KEY: apiKey(), DSH_HOME: homeDir, runtime_HOME: homeDir };
  delete env.PALIMPSEST_DSH_BIN;
  return env;
}

/**
 * Long-lived principal controller over the shipped host. It parses machine lines as they arrive so a
 * run can wait for a real terminal delivery instead of sleeping for a guessed interval.
 */
export function launchPrincipal({ profileUnit, homeDir, workDir, message, logPath, sessionFile, resumeSessionId }) {
  const env = launchEnv(homeDir);
  const args = [DSH_BIN, "--profile", profileUnit];
  if (typeof resumeSessionId === "string" && resumeSessionId !== "") args.push("--resume", resumeSessionId);
  else if (typeof sessionFile === "string" && sessionFile !== "") args.push("--session-file", sessionFile);
  args.push(message);

  ensureDir(dirname(logPath));
  writeFileSync(logPath, "");
  const child = spawn(process.execPath, args, { cwd: workDir, env, stdio: ["ignore", "pipe", "pipe"] });
  const started = Date.now();
  const lines = [];
  const waiters = [];
  let buffer = "";
  let stdout = "";
  let stderr = "";
  const push = (line) => {
    const entry = { at: new Date().toISOString(), ms: Date.now() - started, line };
    lines.push(entry);
    appendFileSync(logPath, `[${entry.at}] ${line}\n`);
    for (const waiter of [...waiters]) {
      if (waiter.predicate(line)) {
        waiter.resolve(entry);
        waiters.splice(waiters.indexOf(waiter), 1);
      }
    }
  };
  child.stdout.on("data", (chunk) => {
    const text = chunk.toString();
    stdout += text;
    buffer += text;
    let index;
    while ((index = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, index).replace(/\r$/u, "");
      buffer = buffer.slice(index + 1);
      if (line !== "") push(line);
    }
  });
  child.stderr.on("data", (chunk) => {
    const text = chunk.toString();
    stderr += text;
    appendFileSync(logPath, `[STDERR] ${text}`);
  });

  let exited = null;
  child.on("exit", (code, signal) => {
    exited = { code, signal, ms: Date.now() - started };
    for (const waiter of [...waiters]) {
      waiter.reject(new Error(`the principal exited (code ${code}) while waiting for ${waiter.label}`));
      waiters.splice(waiters.indexOf(waiter), 1);
    }
  });

  return {
    child,
    logPath,
    lines,
    started,
    get stdout() {
      return stdout;
    },
    get stderr() {
      return stderr;
    },
    get exited() {
      return exited;
    },
    waitFor(predicate, { label, timeoutMs }) {
      const existing = lines.find((entry) => predicate(entry.line));
      if (existing !== undefined) return Promise.resolve(existing);
      if (exited !== null) return Promise.reject(new Error(`the principal already exited while waiting for ${label}`));
      return new Promise((resolvePromise, rejectPromise) => {
        const waiter = { predicate, label, resolve: resolvePromise, reject: rejectPromise };
        waiters.push(waiter);
        const timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index !== -1) waiters.splice(index, 1);
          rejectPromise(new Error(`timed out after ${timeoutMs}ms waiting for ${label}`));
        }, timeoutMs);
        const originalResolve = waiter.resolve;
        const originalReject = waiter.reject;
        waiter.resolve = (value) => {
          clearTimeout(timer);
          originalResolve(value);
        };
        waiter.reject = (error) => {
          clearTimeout(timer);
          originalReject(error);
        };
      });
    },
    async stop(reason) {
      if (exited !== null) return exited;
      if (process.platform === "win32") {
        try {
          execFileSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
        } catch {
          try {
            child.kill();
          } catch {
            /* gone */
          }
        }
      } else {
        try {
          child.kill("SIGTERM");
        } catch {
          /* gone */
        }
      }
      const deadline = Date.now() + 20_000;
      while (exited === null && Date.now() < deadline) await new Promise((done) => setTimeout(done, 250));
      return exited ?? { code: null, signal: "forced", ms: Date.now() - started, reason };
    },
  };
}

/** One-shot headless run (S and F baselines). */
export function launchOnce({ profileUnit, homeDir, workDir, task, logPath }) {
  const env = launchEnv(homeDir);
  const argv = [DSH_BIN, "--profile", profileUnit, task];
  ensureDir(dirname(logPath));
  writeFileSync(logPath, "");
  const child = spawn(process.execPath, argv, { cwd: workDir, env, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  const started = Date.now();
  const write = (text) => {
    stdout += text;
    appendFileSync(logPath, text);
  };
  child.stdout.on("data", (chunk) => write(chunk.toString()));
  child.stderr.on("data", (chunk) => {
    const text = chunk.toString();
    stderr += text;
    appendFileSync(logPath, `[STDERR] ${text}`);
  });
  return new Promise((done) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      done(value);
    };
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        /* gone */
      }
      finish({ code: null, timedOut: true, stdout, stderr, ms: Date.now() - started });
    }, TIMEOUT_MS);
    timer.unref?.();
    child.on("exit", (code) => finish({ code, timedOut: false, stdout, stderr, ms: Date.now() - started }));
  });
}

function walkSessions(root) {
  const files = [];
  if (!existsSync(root)) return files;
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name === "session.v4.jsonl.zstd" || entry.name === "session.v3.jsonl.zstd") files.push(path);
    }
  };
  walk(root);
  return files;
}

const ZSTD_MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);

/**
 * The DSH session stream is a CONCATENATION of zstd frames. Node's decompressor stops after one
 * frame, so split on the frame magic and decode each frame. This removes the external `zstd`
 * dependency from the evidence path entirely; the CLI remains an optional fallback.
 */
function decodeZstdFrames(buffer) {
  const positions = [];
  let index = buffer.indexOf(ZSTD_MAGIC, 0);
  while (index !== -1) {
    positions.push(index);
    index = buffer.indexOf(ZSTD_MAGIC, index + 4);
  }
  if (positions.length === 0) throw new Error("no zstd frame magic found");
  const parts = [];
  for (let frame = 0; frame < positions.length; frame += 1) {
    const start = positions[frame];
    const end = frame + 1 < positions.length ? positions[frame + 1] : buffer.length;
    parts.push(zstdDecompressSync(buffer.subarray(start, end)));
  }
  return Buffer.concat(parts);
}

function decodeSession(file) {
  let text;
  try {
    text = decodeZstdFrames(readFileSync(file)).toString("utf8");
  } catch (nodeError) {
    if (ZSTD === null) {
      return { error: `node zstd decode failed (${nodeError instanceof Error ? nodeError.message : String(nodeError)}) and no external zstd is available` };
    }
    const result = spawnSync(ZSTD, ["-dc", file], { encoding: "buffer", maxBuffer: 128 * 1024 * 1024, timeout: 120_000 });
    if (result.error !== undefined && result.error !== null) return { error: String(result.error) };
    if (result.status !== 0) return { error: `zstd exit ${result.status}: ${String(result.stderr).slice(0, 300)}` };
    text = result.stdout.toString("utf8");
  }
  const events = [];
  for (const line of text.split(/\r?\n/u)) {
    if (line.trim() === "") continue;
    try {
      events.push(JSON.parse(line));
    } catch {
      /* a truncated final line is recorded by count below */
    }
  }
  return { events, bytes: Buffer.byteLength(text, "utf8"), lines: text.split(/\r?\n/u).filter(Boolean).length };
}

/** Decode every session under the run's isolated home and report what the model saw and did. */
export function sessionTelemetry(homeDir) {
  const root = join(homeDir, "sessions");
  const files = walkSessions(root);
  const sessions = [];
  for (const file of files) {
    const decoded = decodeSession(file);
    if (decoded.error !== undefined) {
      sessions.push({ file: file.slice(root.length), error: decoded.error });
      continue;
    }
    const toolCalls = [];
    const toolResults = [];
    const assistantTexts = [];
    const userTexts = [];
    let provider = null;
    let model = null;
    let cwd = null;
    let createdAt = null;
    let steps = 0;
    const usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: 0 };
    for (const event of decoded.events) {
      if (event.type === "session") {
        cwd = event.cwd ?? null;
        createdAt = event.createdAt ?? null;
      }
      if (event.type === "request/context") {
        provider ??= event.data?.provider ?? null;
        model ??= event.data?.model ?? null;
      }
      if (event.type === "request/header") {
        provider ??= event.data?.header?.config?.provider ?? null;
        model ??= event.data?.header?.config?.model ?? null;
      }
      if (event.type === "step/start") steps += 1;
      if (event.type === "tool/call") {
        const data = event.data ?? {};
        let args = data.arguments;
        if (typeof args === "string") {
          try {
            args = JSON.parse(args);
          } catch {
            /* keep the raw string */
          }
        }
        toolCalls.push({ name: data.name ?? "?", callId: data.callId ?? null, arguments: args, step: data.step ?? null });
      }
      if (event.type === "tool/result") {
        const data = event.data ?? {};
        toolResults.push({ callId: data.callId ?? null, text: JSON.stringify(data).slice(0, 3000) });
      }
      if (event.type === "assistant/message") {
        const data = event.data ?? {};
        const source = data.source ?? {};
        provider ??= source.provider ?? null;
        model ??= source.model ?? null;
        if (data.usage !== undefined && data.usage !== null) {
          usage.inputTokens += data.usage.inputTokens ?? 0;
          usage.outputTokens += data.usage.outputTokens ?? 0;
          usage.cacheReadTokens += data.usage.cacheReadTokens ?? 0;
          usage.cacheWriteTokens += data.usage.cacheWriteTokens ?? 0;
          usage.totalTokens += data.usage.totalTokens ?? 0;
        }
        for (const part of data.message?.content ?? []) {
          if (part?.type === "text" && typeof part.text === "string") assistantTexts.push(part.text);
        }
      }
      if (event.type === "user/message") {
        const content = event.data?.message?.content;
        if (typeof content === "string") userTexts.push(content);
        else if (Array.isArray(content)) {
          for (const part of content) if (part?.type === "text" && typeof part.text === "string") userTexts.push(part.text);
        }
      }
    }
    const palimpsestCalls = toolCalls.filter((call) => String(call.name).startsWith("palimpsest_"));
    sessions.push({
      file: file.slice(root.length),
      cwd,
      createdAt,
      events: decoded.events.length,
      bytes: decoded.bytes,
      steps,
      provider,
      model,
      toolCalls: toolCalls.length,
      tools: toolCalls.reduce((counts, call) => {
        counts[call.name] = (counts[call.name] ?? 0) + 1;
        return counts;
      }, {}),
      palimpsestCalls: palimpsestCalls.length,
      palimpsestToolNames: [...new Set(palimpsestCalls.map((call) => call.name))],
      toolCallDetails: toolCalls,
      toolResults: toolResults.slice(-200),
      userTexts,
      userChars: userTexts.reduce((sum, text) => sum + text.length, 0),
      assistantChars: assistantTexts.reduce((sum, text) => sum + text.length, 0),
      usage,
      finalAssistantText: assistantTexts.join("\n").slice(-12000),
    });
  }
  sessions.sort((a, b) => (b.events ?? 0) - (a.events ?? 0));
  return {
    home: homeDir,
    sessionCount: sessions.length,
    mainSession: sessions[0] ?? null,
    sessions,
    model: sessions.find((session) => session.model !== null)?.model ?? null,
    provider: sessions.find((session) => session.provider !== null)?.provider ?? null,
    totalUsage: sessions.reduce(
      (total, session) => {
        for (const key of Object.keys(total)) total[key] += session.usage?.[key] ?? 0;
        return total;
      },
      { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: 0 },
    ),
    tokenAccounting: "summed from assistant/message usage events in the session stream",
  };
}

export function deliverableState(workDir, rel) {
  const path = join(workDir, rel);
  if (!existsSync(path)) return { present: false };
  const text = readFileSync(path, "utf8");
  return { present: true, bytes: text.length, digest: digest(text), text };
}

/** Direct deployment handle for operator-side seeding (not a model tool). */
export async function withDeployment({ stateDir }, fn) {
  const { loadDeploymentProfile } = await import(pathToFileURL(join(REPO, "dist", "src", "deployment", "index.js")).href);
  const { launchDeployment } = await import(pathToFileURL(join(REPO, "dist", "src", "deployment", "launch.js")).href);
  const profile = loadDeploymentProfile(join(stateDir, "deployment.json"));
  const deployment = launchDeployment(profile);
  try {
    return await fn(deployment);
  } finally {
    await deployment.close();
  }
}

export function seedProject(deployment, { projectId, goal, headCommit }) {
  return deployment.installed.controller.start({
    projectId,
    goal,
    headCommit,
    tasks: [
      {
        task_id: "t1",
        objective: "produce the six-month digitisation programme plan",
        depends_on: [],
        write_paths: ["deliverables/**"],
        required_artifacts: [],
      },
    ],
  });
}

export function worldHead(workDir) {
  return execFileSync("git", ["rev-parse", "HEAD"], { cwd: workDir, encoding: "utf8" }).trim();
}

export function gitLog(workDir) {
  return execFileSync("git", ["log", "--oneline", "--decorate"], { cwd: workDir, encoding: "utf8" }).trim();
}

export const RUNTIME = Object.freeze({
  schema: "cog3-runtime/v1",
  dshBin: DSH_BIN,
  zstd: ZSTD ?? "node:zlib.zstdDecompressSync (multi-frame split)",
  repo: REPO,
  node: process.version,
  platform: process.platform,
});
