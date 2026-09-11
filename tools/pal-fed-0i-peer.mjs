#!/usr/bin/env node
/**
 * PAL-FED-0I peer host (EXPERIMENTAL).
 *
 * One DSH host process for one peer, loading the single frozen 0I artifact. The
 * FOCAL peer additionally receives an experiment-only admission binding (mode
 * A0/A1/A2, oracle ticket seed, resolution owner, append-only attempt log). The
 * responder gets no admission surface. A one-shot neutral completion reminder is
 * issued if the focal goes idle without an admitted disposition (§21).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { boot, loadOverlayPatches } from "@deepseek-ai/dsh-app-boot";
import { createUserMessage } from "@deepseek-ai/dsh-llm";

// Resolve the real model credential from the DSH credentials document (never
// printed); the provider adapter reads it from the child environment.
if (!process.env.DEEPSEEK_API_KEY) {
  for (const file of [process.env.DSH_CREDENTIALS, join(homedir(), ".dsh", ".credentials.yaml")].filter(Boolean)) {
    try {
      const match = readFileSync(file, "utf8").match(/^\s*DEEPSEEK_API_KEY:\s*['"]?([^'"\s]+)/m);
      if (match) { process.env.DEEPSEEK_API_KEY = match[1]; break; }
    } catch {}
  }
}

const require = createRequire(import.meta.url);
const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i], process.argv[i + 1]);
const peer = args.get("--peer");
const dir = resolve(args.get("--dir"));
const db = resolve(args.get("--db"));
const fabric = args.get("--fabric");
const session = args.get("--session");
const cwd = resolve(args.get("--cwd"));
const artifact = resolve(args.get("--artifact"));
const prompt = args.get("--prompt");
const watchMs = Number(args.get("--watch-ms") ?? 2000);
const statusMs = Number(args.get("--status-ms") ?? 1000);
const admissionMode = args.get("--admission-mode");
const admissionRun = args.get("--admission-run");
const ticketInitial = args.get("--ticket-initial");
const resolutionOwner = args.get("--resolution-owner");
const attemptLog = args.get("--attempt-log");

const COMPLETION_REMINDER =
  "Submit your task disposition through decision_submit to complete this run.";

mkdirSync(dir, { recursive: true });
const configPath = join(dir, "cordis.yml");
writeFileSync(configPath, "[]\n");

const pluginPath = join(artifact, "package/dist/src/federation/dsh/plugin.js");
const admissionJs = pathToFileURL(join(artifact, "package/dist/src/federation/dsh/admission.js")).href;
const { readAdmissionAttempts } = await import(admissionJs);
const admission =
  admissionMode === undefined
    ? undefined
    : {
        mode: admissionMode,
        runId: admissionRun,
        ticketInitial,
        resolutionOwner,
        attemptLogPath: resolve(attemptLog),
      };

const patches = loadOverlayPatches("pal-fed-0i", require.resolve("@deepseek-ai/dsh-sdk-minimal/cordis.patch.yml"));
for (const id of ["sdk-jsonrpc-server", "sdk-app-startup", "terminal-bash", "terminal-pwsh", "persistent-bash", "persistent-pwsh"]) {
  patches.push({ id, disabled: true });
}
patches.push({ id: "sessions", config: { root: join(dir, "sessions"), compression: "none" } });
patches.push({ insert: [
  {
    id: "pal-fed-repo-tools",
    name: pathToFileURL(join(import.meta.dirname, "pal-fed-0i-repo-tools.mjs")).href,
    config: { root: cwd },
  },
  {
    id: "pal-fed",
    name: pathToFileURL(pluginPath).href,
    config: {
      selfPeer: peer,
      fabricId: fabric,
      dbPath: db,
      sessionId: session,
      cwd,
      watchIntervalMs: watchMs,
      model: { provider: "deepseek-official", model: "deepseek-flash" },
      ...(prompt === undefined ? {} : { initialPrompt: prompt }),
      ...(admission === undefined ? {} : { admission }),
    },
  },
]});

const ctx = await boot(`pal-fed-0i-${peer.replace(/\W+/g, "-")}`, configPath, patches);
const mod = await import(pathToFileURL(pluginPath).href);
const runtime = await mod.palFedReadyOf(ctx);
console.log(`PAL_FED_READY ${JSON.stringify({ peer, session, agentId: runtime.agent.id })}`);

let completionReminderCount = 0;
let stopping = false;
let guardSettled = false;

// One neutral mechanical continuation if the agent goes idle without an admitted
// disposition. Same behaviour in every arm; never mentions conflict/peer/authority.
async function completionGuard() {
  if (admission === undefined) return;
  const agent = runtime.agent;
  for (;;) {
    try { await agent.whenIdle(); } catch { return; }
    if (stopping) return;
    let attempts = [];
    try { attempts = readAdmissionAttempts(resolve(attemptLog)); } catch { attempts = []; }
    if (attempts.some((a) => a.admissionOutcome !== "POLICY_BLOCKED")) return;
    if (completionReminderCount >= 1) return;
    completionReminderCount += 1;
    agent.followup(createUserMessage({ content: [{ type: "text", text: COMPLETION_REMINDER }], source: { kind: "user" } }));
    await new Promise((r) => setTimeout(r, 250));
  }
}
void completionGuard().finally(() => { guardSettled = true; });

const keepAlive = setInterval(() => {}, 1 << 30);
const reporter = setInterval(() => {
  const s = runtime.watcher.status();
  console.log(`PAL_FED_STATUS ${JSON.stringify({ peer, wakeCount: s.wakeCount, lastWakeAt: s.lastWakeAt ?? null, completionReminderCount, guardSettled })}`);
}, statusMs);

const shutdown = async () => {
  stopping = true;
  clearInterval(reporter);
  clearInterval(keepAlive);
  console.log(`PAL_FED_FINAL ${JSON.stringify({ peer, session })}`);
  try { await ctx.fiber.dispose(); } catch {}
  process.exit(0);
};
process.once("SIGTERM", () => { void shutdown(); });
process.once("SIGINT", () => { void shutdown(); });
