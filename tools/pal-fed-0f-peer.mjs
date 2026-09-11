#!/usr/bin/env node
/**
 * PAL-FED-0F peer host (EXPERIMENTAL).
 *
 * One DSH host process for one peer, loading the FROZEN treatment artifact
 * (C0/C1). Used by the behavioral runner; real model, no scripting.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { boot, loadOverlayPatches } from "@deepseek-ai/dsh-app-boot";

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

mkdirSync(dir, { recursive: true });
const configPath = join(dir, "cordis.yml");
writeFileSync(configPath, "[]\n");

const pluginPath = join(artifact, "package/dist/src/federation/dsh/plugin.js");
const patches = loadOverlayPatches("pal-fed-0f", require.resolve("@deepseek-ai/dsh-sdk-minimal/cordis.patch.yml"));
for (const id of ["sdk-jsonrpc-server", "sdk-app-startup", "terminal-bash", "terminal-pwsh", "persistent-bash", "persistent-pwsh"]) {
  patches.push({ id, disabled: true });
}
patches.push({ id: "sessions", config: { root: join(dir, "sessions"), compression: "none" } });
patches.push({ insert: [
  {
    id: "pal-fed-repo-tools",
    name: pathToFileURL(join(import.meta.dirname, "pal-fed-0f-repo-tools.mjs")).href,
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
  },
}]});

const ctx = await boot(`pal-fed-0f-${peer.replace(/\W+/g, "-")}`, configPath, patches);
const mod = await import(pathToFileURL(pluginPath).href);
const runtime = await mod.palFedReadyOf(ctx);
console.log(`PAL_FED_READY ${JSON.stringify({ peer, session, agentId: runtime.agent.id })}`);

const keepAlive = setInterval(() => {}, 1 << 30);
const reporter = setInterval(() => {
  const s = runtime.watcher.status();
  console.log(`PAL_FED_STATUS ${JSON.stringify({ peer, wakeCount: s.wakeCount, lastWakeAt: s.lastWakeAt ?? null })}`);
}, statusMs);

const shutdown = async () => {
  clearInterval(reporter);
  clearInterval(keepAlive);
  console.log(`PAL_FED_FINAL ${JSON.stringify({ peer, session })}`);
  try { await ctx.fiber.dispose(); } catch {}
  process.exit(0);
};
process.once("SIGTERM", () => { void shutdown(); });
process.once("SIGINT", () => { void shutdown(); });
