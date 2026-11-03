/**
 * LHAPE diagnostic wrapper. NOT a product component.
 *
 * The shipped worker port spawns `node <dshBin> --profile P --work <ctx>` and captures stdout/stderr
 * to parse the ONE result line. That is correct for the product, but it makes an early child failure
 * invisible to the run operator. This wrapper re-execs the REAL DSH bin with the same argv, prints
 * through, and also appends the child's own output to a per-process log under the run-owned DSH home.
 * It relays IPC in both directions, because the worker context-pull channel is a real capability.
 */
import { spawn } from "node:child_process";
import { appendFileSync, mkdirSync } from "node:fs";

const real = process.env.LHAPE_REAL_DSH_BIN;
if (typeof real !== "string" || real === "") {
  process.stderr.write("lhape-worker-tee: LHAPE_REAL_DSH_BIN is not set\n");
  process.exit(2);
}
const dir = process.env.LHAPE_WORKER_LOG_DIR ?? "/tmp";
mkdirSync(dir, { recursive: true });
const file = `${dir}/worker-${String(process.pid)}.log`;
appendFileSync(file, `argv=${JSON.stringify(process.argv.slice(2))}\ncwd=${process.cwd()}\n`);

const child = spawn(process.execPath, [real, ...process.argv.slice(2)], {
  cwd: process.cwd(),
  env: process.env,
  stdio: ["ignore", "pipe", "pipe", "ipc"],
});
const relay = (chunk, out) => {
  appendFileSync(file, chunk);
  out.write(chunk);
};
child.stdout.on("data", (chunk) => relay(chunk, process.stdout));
child.stderr.on("data", (chunk) => relay(chunk, process.stderr));
process.on("message", (message) => {
  try {
    child.send(message);
  } catch {
    /* the real child may have exited */
  }
});
child.on("message", (message) => {
  try {
    process.send?.(message);
  } catch {
    /* the parent may have exited */
  }
});
child.on("close", (code) => process.exit(code === null ? 1 : code));
process.on("disconnect", () => {
  try {
    child.disconnect();
  } catch {
    /* already gone */
  }
});
