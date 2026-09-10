#!/usr/bin/env node
/**
 * PAL-FED-0D real-model peer host (EXPERIMENTAL).
 *
 * One DSH host process for exactly one peer. It boots the real DSH agent tree
 * (sdk-minimal bundle, real DeepSeek provider) with the FROZEN PAL-FED plugin
 * loaded from the control-plane artifact, so the peer agent is a genuine DSH
 * Agent driven by the DSH loop with real model turns.
 *
 * This is a dogfood harness, not part of the runtime binding: it only supplies
 * the process lifetime and the operator's opening prompt.
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

mkdirSync(dir, { recursive: true });
const configPath = join(dir, "cordis.yml");
writeFileSync(configPath, "[]\n");

const patches = loadOverlayPatches("pal-fed-dogfood", require.resolve("@deepseek-ai/dsh-sdk-minimal/cordis.patch.yml"));
for (const id of ["sdk-jsonrpc-server", "sdk-app-startup", "terminal-bash", "terminal-pwsh", "persistent-bash", "persistent-pwsh"]) {
  patches.push({ id, disabled: true });
}
patches.push({ id: "sessions", config: { root: join(dir, "sessions"), compression: "none" } });
patches.push({ insert: [{
  id: "pal-fed",
  name: pathToFileURL(join(artifact, "package/dist/src/federation/dsh/plugin.js")).href,
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

const ctx = await boot(`pal-fed-${peer.replace(/\W+/g, "-")}`, configPath, patches);
const runtime = await (await import(pathToFileURL(join(artifact, "package/dist/src/federation/dsh/plugin.js")).href)).palFedReadyOf(ctx);
console.log(`PAL_FED_READY ${JSON.stringify({ peer, session, agentId: runtime.agent.id, tools: runtime.tools.map((t) => t.name) })}`);

const keepAlive = setInterval(() => {}, 1 << 30);
const report = () => {
  const status = runtime.watcher.status();
  console.log(`PAL_FED_STATUS ${JSON.stringify({ peer, wakeCount: status.wakeCount, lastWakeBatchId: status.lastWakeBatchId ?? null })}`);
};
const reporter = setInterval(report, 5000);

const shutdown = async () => {
  clearInterval(reporter);
  clearInterval(keepAlive);
  report();
  const events = (await runtime.service.listEvents()).length;
  console.log(`PAL_FED_FINAL ${JSON.stringify({ peer, session, events }) }`);
  try { await ctx.fiber.dispose(); } catch {}
  process.exit(0);
};
process.once("SIGTERM", () => { void shutdown(); });
process.once("SIGINT", () => { void shutdown(); });
