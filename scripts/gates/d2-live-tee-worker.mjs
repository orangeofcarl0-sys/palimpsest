#!/usr/bin/env node
/**
 * Rig harness for §D2-LIVE. NOT a product component.
 *
 * It exists so the live gate can drive the SHIPPED worker port
 * (`dshSubprocessWorkWorkerPort`) completely unchanged and still
 *   (a) read the worker process's own output, and
 *   (b) hold the worker PARKED, so "async start really returned before the work ran" is proven by a
 *       barrier rather than by a wall-clock threshold (a loaded machine would make the latter lie).
 *
 * The port spawns `node <dshBin> --profile P --work <contextFile>` with cwd = the execution world; the
 * gate passes THIS file as `dshBin`, so the wrapper receives those exact argv tokens, re-spawns the
 * real DSH bin with them, and exits with the child's code. The port therefore sees exactly what it
 * would have seen, including the `PALIMPSEST_WORK_RESULT` line it parses strictly on the way back.
 *
 * Barrier protocol (all through the environment, so the product knows nothing about it):
 *   PALIMPSEST_REAL_DSH_BIN            the real DSH bin to re-exec
 *   PALIMPSEST_LIVE_GATE_TRANSCRIPT    where to tee stdout+stderr
 *   PALIMPSEST_LIVE_GATE_SPAWNED       marker written the instant this wrapper starts
 *   PALIMPSEST_LIVE_GATE_BARRIER       if set, wait for this path to EXIST before spawning
 */
import { spawn } from "node:child_process";
import { appendFileSync, existsSync, writeFileSync } from "node:fs";

const real = process.env.PALIMPSEST_REAL_DSH_BIN;
if (typeof real !== "string" || real === "") {
  process.stderr.write("d2live-tee-worker: PALIMPSEST_REAL_DSH_BIN is not set\n");
  process.exit(2);
}
const transcript = process.env.PALIMPSEST_LIVE_GATE_TRANSCRIPT;
const tee = typeof transcript === "string" && transcript !== "" ? transcript : null;
if (tee !== null) writeFileSync(tee, "");

const spawnedMarker = process.env.PALIMPSEST_LIVE_GATE_SPAWNED;
if (typeof spawnedMarker === "string" && spawnedMarker !== "") {
  writeFileSync(spawnedMarker, new Date().toISOString());
}

const barrier = process.env.PALIMPSEST_LIVE_GATE_BARRIER;
if (typeof barrier === "string" && barrier !== "") {
  // Park here until the gate releases us. Polling a file keeps this harness free of IPC the product
  // would otherwise have to know about.
  while (!existsSync(barrier)) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

const child = spawn(process.execPath, [real, ...process.argv.slice(2)], {
  cwd: process.cwd(),
  env: process.env,
  stdio: ["ignore", "pipe", "pipe"],
});
const relay = (chunk, out) => {
  out.write(chunk);
  if (tee !== null) appendFileSync(tee, chunk);
};
child.stdout.on("data", (chunk) => relay(chunk, process.stdout));
child.stderr.on("data", (chunk) => relay(chunk, process.stderr));
child.on("close", (code) => process.exit(code === null ? 1 : code));
