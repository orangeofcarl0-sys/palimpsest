/**
 * COG-2 shared rig.
 *
 * One world, one isolated runtime home per run, one model. The only difference between
 * conditions is the agent architecture and where the prior conclusions live:
 *
 *   A  strong file-native baseline (no Palimpsest tools, conclusions in PRIOR-NOTES.md)
 *   B  Palimpsest tools present, no ProjectIR (conclusions still in PRIOR-NOTES.md)
 *   C  project-ready Palimpsest (ProjectIR + journal; no PRIOR-NOTES.md)
 *   D  project-ready + a task-shaped invitation (same world as C)
 *
 * READ-ONLY with respect to the real runtime home and every non-test resource.
 */
import { appendFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const REPO = resolve(import.meta.dirname, "..", "..");
export const RIG = process.env.COG2_RIG ?? join(REPO, "..", ".cog2-rig");
export const SCENARIO = join(import.meta.dirname, "scenario");
export const DSH_BIN = "C:/Users/66494/AppData/Roaming/npm/node_modules/@deepseek-ai/dsh/lib/bin.js";
export const ZSTD = "D:/ProgramData/anaconda3/Library/bin/zstd.exe";
export const TIMEOUT_MS = Number(process.env.COG2_TIMEOUT_MS ?? 1_200_000);

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

function git(args, cwd) {
  return execFileSync("git", ["-c", "user.email=planning@example.invalid", "-c", "user.name=planning", ...args], {
    cwd,
    encoding: "utf8",
  });
}

/** Build the world once. `withNotes` decides whether the ordinary-file carrier exists. */
export function buildWorld(workDir, { withNotes, notesText = null }) {
  if (existsSync(join(workDir, ".git"))) return;
  ensureDir(workDir);
  ensureDir(join(workDir, "sources"));
  for (const entry of readdirSync(join(SCENARIO, "sources"), { withFileTypes: true })) {
    if (!withNotes && entry.name === "PRIOR-NOTES.md") continue;
    cpSync(join(SCENARIO, "sources", entry.name), join(workDir, "sources", entry.name), { recursive: true });
  }
  if (notesText !== null) writeFileSync(join(workDir, "sources", "PRIOR-NOTES.md"), notesText);
  ensureDir(join(workDir, "deliverables"));
  git(["init", "-q"], workDir);
  git(["add", "-A"], workDir);
  git(["commit", "-qm", "seed: Harrowgate programme pack"], workDir);
}

export function releaseUpdates(workDir) {
  const target = join(workDir, "updates");
  if (existsSync(target)) return;
  cpSync(join(SCENARIO, "updates"), target, { recursive: true });
  git(["add", "-A"], workDir);
  git(["commit", "-qm", "round 2: release the January update pack"], workDir);
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
  const disable = subagents
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
  writeFileSync(join(dir, "cordis.patch.yml"), `${BASH_PATCH}${disable}`);
  return dir;
}

export function writePalimpsestProfile(homeDir, { unit, stateDir, workDir, projectId, activation = "none" }) {
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
        reasoning: {},
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
    `${BASH_PATCH}
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
- id: palimpsest-tools
  config:
    palimpsestEntry: '${REPO}/dist/src/advanced.js'
    deploymentProfile: '${deploymentPath}'
    serve: false
`,
  );
  return { dir, deploymentPath };
}

/** Launch ONE one-turn model session. Both shapes answer one task and exit. */
export function launch({ profileUnit, homeDir, workDir, task, logPath, palimpsest }) {
  const env = { ...process.env, DEEPSEEK_API_KEY: apiKey(), DSH_HOME: homeDir, runtime_HOME: homeDir };
  delete env.PALIMPSEST_DSH_BIN;
  const argv = palimpsest
    ? [DSH_BIN, "--profile", profileUnit, "--once", task]
    : [DSH_BIN, "--profile", profileUnit, task];
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

function decodeSession(file) {
  const result = spawnSync(ZSTD, ["-dc", file], { encoding: "buffer", maxBuffer: 128 * 1024 * 1024, timeout: 120_000 });
  if (result.error !== undefined && result.error !== null) return { error: String(result.error) };
  if (result.status !== 0) return { error: `zstd exit ${result.status}: ${String(result.stderr).slice(0, 300)}` };
  const text = result.stdout.toString("utf8");
  const events = [];
  for (const line of text.split(/\r?\n/u)) {
    if (line.trim() === "") continue;
    try {
      events.push(JSON.parse(line));
    } catch {
      /* a truncated final line is recorded by count below */
    }
  }
  return { events, bytes: result.stdout.length, lines: text.split(/\r?\n/u).filter(Boolean).length };
}

/** Decode every session under the run's isolated home and report what the model saw and did. */
export function sessionTelemetry(homeDir, workDir) {
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
        toolResults.push({ callId: data.callId ?? null, text: JSON.stringify(data).slice(0, 2000) });
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
      userChars: userTexts.reduce((sum, text) => sum + text.length, 0),
      assistantChars: assistantTexts.reduce((sum, text) => sum + text.length, 0),
      usage,
      finalAssistantText: assistantTexts.join("\n").slice(-8000),
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
export async function withDeployment({ unit, stateDir, workDir, projectId }, fn) {
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
        objective: "produce the six-month programme plan",
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
