#!/usr/bin/env node
/**
 * PAL-FED-0D real two-Main dogfood launcher (EXPERIMENTAL, §42–§44).
 *
 * Spawns two SEPARATE DSH host processes (one per peer) against one shared
 * coordination DB, with the real model. The operator supplies only P's opening
 * boundary question; O is woken by the system, never by the user.
 */
import { spawn, execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const repo = resolve(import.meta.dirname, "..");
const argOf = (flag, fallback) => {
  const i = process.argv.indexOf(flag);
  return i === -1 ? fallback : process.argv[i + 1];
};
const artifact = resolve(argOf("--artifact", resolve(repo, "..", "pal-fed-runtime")));
const runDir = resolve(argOf("--run-dir", resolve(repo, "..", "pal-fed-0d-dogfood")));
const fabric = argOf("--fabric", "palimpsest-ordarium-0");
const db = join(runDir, "coordination.sqlite");
const minutes = Number(argOf("--minutes", "8"));
const peerScript = join(repo, "tools/pal-fed-dogfood-peer.mjs");
const palimpsestCwd = repo;
const ordariumCwd = resolve(argOf("--ordarium-cwd", "F:/Codex_Work_Space/DSH plugin/ordarium"));

const QUESTION = argOf("--question", null) ??
  "You are palimpsest.main, the persistent Main Agent of the Palimpsest project. A real cross-project " +
  "boundary question has arisen from ongoing work: checkpoint polling is currently the bootstrap mechanism " +
  "for peer collaboration. Determine whether future low-latency peer wake genuinely requires a generic " +
  "Ordarium wait/change-observation primitive, or whether wake should remain entirely a Palimpsest/DSH " +
  "concern. If this is a real external dependency on ordarium.main, contact it through the collaboration " +
  "surface (collab_post) and end your turn; do not implement any Ordarium change yourself.";

mkdirSync(runDir, { recursive: true });

// 1) Fabric init via the frozen CLI.
try {
  execFileSync(process.execPath, [join(repo, "dist/src/federation/cli.js"), "init", "--db", db, "--fabric", fabric], { stdio: "pipe" });
  console.log("fabric initialized");
} catch {
  console.log("fabric already initialized");
}

// 2) Real model credential from the DSH credentials document (never printed).
function deepseekKey() {
  const candidates = [process.env.DSH_CREDENTIALS, join(homedir(), ".dsh", ".credentials.yaml")].filter(Boolean);
  for (const file of candidates) {
    try {
      const text = readFileSync(file, "utf8");
      const match = text.match(/^\s*DEEPSEEK_API_KEY:\s*['"]?([^'"\s]+)/m);
      if (match) return match[1];
    } catch {}
  }
  return undefined;
}
const key = process.env.DEEPSEEK_API_KEY ?? deepseekKey();
if (key === undefined) {
  console.error("no DEEPSEEK_API_KEY available");
  process.exit(2);
}
const env = { ...process.env, DEEPSEEK_API_KEY: key };

const children = [];
function spawnPeer(peer, session, cwd, prompt) {
  const dir = join(runDir, peer.replace(/\W+/g, "-"));
  const args = [peerScript, "--peer", peer, "--dir", dir, "--db", db, "--fabric", fabric, "--session", session, "--cwd", cwd, "--artifact", artifact, "--watch-ms", "2000"];
  if (prompt !== undefined) args.push("--prompt", prompt);
  const child = spawn(process.execPath, args, { env, stdio: ["ignore", "pipe", "pipe"] });
  const tag = peer === "palimpsest.main" ? "P" : "O";
  child.stdout.on("data", (chunk) => {
    for (const line of String(chunk).split(/\r?\n/)) if (line.trim()) console.log(`[${tag}] ${line}`);
  });
  child.stderr.on("data", (chunk) => {
    for (const line of String(chunk).split(/\r?\n/)) if (line.trim() && !line.includes("ExperimentalWarning")) console.log(`[${tag}:err] ${line}`);
  });
  children.push(child);
  return child;
}

const deadline = Date.now() + minutes * 60_000;
const palimpsest = spawnPeer("palimpsest.main", "pal-fed-p-main", palimpsestCwd, QUESTION);
const ordarium = spawnPeer("ordarium.main", "pal-fed-o-main", ordariumCwd, undefined);

const eventsVia = () => {
  try {
    return JSON.parse(execFileSync(process.execPath, [join(repo, "dist/src/federation/cli.js"), "events", "--db", db, "--fabric", fabric], { encoding: "utf8" }));
  } catch { return []; }
};
const finalize = () => {
  for (const child of children) child.kill();
  const events = eventsVia();
  const summary = {
    fabric,
    db,
    buildId: (() => { try { return readFileSync(join(artifact, "build-id"), "utf8").trim(); } catch { return null; } })(),
    eventCount: events.length,
    events: events.map((e) => ({ from: e.from, to: e.to, kind: e.kind, threadId: e.threadId, body: e.body.slice(0, 200) })),
  };
  writeFileSync(join(runDir, "dogfood-summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  console.log(`PAL_FED_DOGFOOD_SUMMARY ${JSON.stringify(summary)}`);
  process.exit(0);
};
process.once("SIGTERM", finalize);
process.once("SIGINT", finalize);
setInterval(() => {
  const events = eventsVia();
  const fromOrdarium = events.filter((e) => e.from === "ordarium.main").length;
  const fromPalimpsest = events.filter((e) => e.from === "palimpsest.main").length;
  console.log(`[watch] events=${events.length} fromP=${fromPalimpsest} fromO=${fromOrdarium}`);
  if (events.length >= 2 && fromOrdarium >= 1) { console.log("bidirectional exchange observed"); finalize(); }
  if (Date.now() > deadline) { console.log("deadline reached"); finalize(); }
}, 5000);
