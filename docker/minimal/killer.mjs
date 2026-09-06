/**
 * Real SIGKILL injector for the crash-recovery E2E (docker/minimal/recovery.sh).
 * Spawns `palimpsest promote`, watches the Ordarium operations ledger, and
 * SIGKILLs the process the moment the promote operation reaches `dispatched` -
 * i.e. while the git merge it wraps is in flight. No fault injector, no test
 * double: the kill is a real signal to a real process, leaving a real
 * non-terminal operation in the production-shaped ledger.
 *
 * Exit 0 = killed mid-operation; exit 3 = the operation terminalized before
 * the kill landed (window missed - widen the worktree payload and rerun).
 */
import { DatabaseSync } from "node:sqlite";
import { spawn } from "node:child_process";

const [opsPath, bin, ...args] = process.argv.slice(2);
const db = new DatabaseSync(opsPath, { readOnly: true });
// Only rows created AFTER the baseline belong to the promote we spawn; the
// latest row at startup is the previous operation's terminal record.
const baseline = db.prepare("SELECT COALESCE(MAX(rowid), 0) AS m FROM ordarium_operations").get().m;
const nextRow = db.prepare("SELECT state FROM ordarium_operations WHERE rowid > ? ORDER BY rowid ASC LIMIT 1");
const TERMINAL = new Set(["succeeded", "failed", "reconciled", "cancelled", "denied"]);

const child = spawn(bin, args, { stdio: ["ignore", "inherit", "inherit"] });
const t0 = Date.now();
let seen = null;
let killed = null;

for (;;) {
  let state = null;
  try {
    const row = nextRow.get(baseline);
    if (row !== undefined) state = row.state;
  } catch {
    // Writer holds the lock mid-transition; the next poll retries.
  }
  if (state !== null && state !== seen) {
    seen = state;
    console.error(`[killer] state=${state} at +${Date.now() - t0}ms`);
  }
  if (state === "dispatched") {
    child.kill("SIGKILL");
    killed = { state, elapsedMs: Date.now() - t0 };
    break;
  }
  if (state !== null && TERMINAL.has(state)) break;
  if (Date.now() - t0 > 60_000) break;
  await new Promise((resolve) => setTimeout(resolve, 1));
}

const exit = await new Promise((resolve) => {
  child.on("exit", (code, signal) => resolve({ code, signal }));
});
console.log(JSON.stringify({ observed: seen, killed, exit }));
process.exit(killed === null ? 3 : 0);
