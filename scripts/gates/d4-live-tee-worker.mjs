#!/usr/bin/env node
/**
 * Rig harness for §D4-LIVE. NOT a product component.
 *
 * The D2-LIVE wrapper could assume ONE worker, so its transcript/spawned/barrier paths were fixed
 * environment variables. Two concurrent workers need one set EACH, and the world path is the only thing
 * that distinguishes them — so every marker here is derived from `process.cwd()`, which the shipped port
 * sets to the worker's own execution world. The port is otherwise driven completely unchanged: this
 * wrapper receives `--profile P --work <ctx>` and re-execs the real DSH bin with the same argv, so what
 * the port observes (including the `PALIMPSEST_WORK_RESULT` line it parses strictly) is exactly what it
 * would observe without the rig.
 *
 * Barrier protocol (all through the environment, so the product knows nothing about it):
 *   PALIMPSEST_REAL_DSH_BIN        the real DSH bin to re-exec
 *   PALIMPSEST_LIVE_GATE_OUT       directory the per-world markers are written into
 */
import { spawn } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

const real = process.env.PALIMPSEST_REAL_DSH_BIN;
if (typeof real !== "string" || real === "") {
  process.stderr.write("d4live-tee-worker: PALIMPSEST_REAL_DSH_BIN is not set\n");
  process.exit(2);
}

const out = process.env.PALIMPSEST_LIVE_GATE_OUT;
if (typeof out !== "string" || out === "") {
  process.stderr.write("d4live-tee-worker: PALIMPSEST_LIVE_GATE_OUT is not set\n");
  process.exit(2);
}
mkdirSync(out, { recursive: true });

/** The world directory name IS the attempt id, so it is the worker's identity for the whole rig. */
const key = basename(process.cwd());
const transcript = join(out, `${key}.transcript.txt`);
const spawnedMarker = join(out, `${key}.spawned`);
const barrier = join(out, `${key}.barrier`);

writeFileSync(transcript, "");
writeFileSync(spawnedMarker, new Date().toISOString());

// Park here until the gate releases THIS worker. Polling a file keeps the harness free of IPC the
// product would otherwise have to know about.
while (!existsSync(barrier)) {
  await new Promise((resolve) => setTimeout(resolve, 100));
}

const child = spawn(process.execPath, [real, ...process.argv.slice(2)], {
  cwd: process.cwd(),
  env: process.env,
  stdio: ["ignore", "pipe", "pipe"],
});
const relay = (chunk, stream) => {
  stream.write(chunk);
  appendFileSync(transcript, chunk);
};
child.stdout.on("data", (chunk) => relay(chunk, process.stdout));
child.stderr.on("data", (chunk) => relay(chunk, process.stderr));
child.on("close", (code) => process.exit(code === null ? 1 : code));
