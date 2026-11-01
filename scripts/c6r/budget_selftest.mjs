/**
 * C6-R4 — process-tree termination self-test. RUNS INSIDE THE RUNTIME (WSL), NOT ON WINDOWS.
 *
 * It starts a shell in a new process group, that shell starts a grandchild, and the launcher kills
 * the group with SIGKILL. Both PIDs must be gone. This is the mechanism the budget uses; it does not
 * claim that killing a wsl.exe client terminates Linux children, which is why the launcher itself
 * lives in the runtime.
 *
 * No model, no provider request.
 */
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { BUDGET, budgetDecision, classifySession, killProcessGroup } from "./budget.mjs";

const OUT = process.argv[2] ?? "/tmp/c6r-budget-selftest.json";
const startedAt = Date.now();

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code !== "ESRCH";
  }
}

const child = spawn(
  "bash",
  ["-c", "sleep 300 & echo $! > /tmp/c6r-grandchild.pid; wait"],
  { detached: true, stdio: ["ignore", "ignore", "ignore"] },
);
child.unref();
await new Promise((resolvePromise) => setTimeout(resolvePromise, 300));
let grandchild = null;
try {
  grandchild = Number(readFileSync("/tmp/c6r-grandchild.pid", "utf8").trim());
} catch {
  grandchild = null;
}

const before = { child: alive(child.pid), grandchild: grandchild === null ? null : alive(grandchild) };
const killed = killProcessGroup(child.pid);
await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
const after = { child: alive(child.pid), grandchild: grandchild === null ? null : alive(grandchild) };

const decisions = {
  atZero: budgetDecision({ sessionsStarted: 0, totalTokens: 0, elapsedMs: 0 }),
  atFiveSessions: budgetDecision({ sessionsStarted: 5, totalTokens: 100, elapsedMs: 1_000 }),
  atSixSessions: budgetDecision({ sessionsStarted: 6, totalTokens: 100, elapsedMs: 1_000 }),
  atStopTokens: budgetDecision({ sessionsStarted: 1, totalTokens: BUDGET.stopStartTokens, elapsedMs: 1_000 }),
  atWallClock: budgetDecision({ sessionsStarted: 1, totalTokens: 100, elapsedMs: BUDGET.maxSessionMs }),
};
const classifications = {
  observed: classifySession({ sessionCount: 1, assistantMessages: 2, providerErrors: 0, complete: true }),
  blockedQuota: classifySession({ sessionCount: 1, assistantMessages: 0, providerErrors: 1, complete: false }),
  invalidStream: classifySession({ sessionCount: 1, assistantMessages: 2, providerErrors: 0, complete: false }),
  noSession: classifySession({ sessionCount: 0, assistantMessages: 0, providerErrors: 0, complete: false }),
};

const record = {
  schema: "c6r-budget-selftest/v1",
  at: new Date().toISOString(),
  label: "NO_MODEL",
  mechanism: "POSIX process group, SIGKILL via process.kill(-pid)",
  childPid: child.pid,
  grandchildPid: grandchild,
  before,
  killed,
  after,
  bothGone: before.child === true && before.grandchild === true && after.child === false && after.grandchild === false,
  decisions,
  classifications,
  elapsedMs: Date.now() - startedAt,
  note: "A local monitor is not a server-side token cap. This proves the launcher can terminate the tree it started.",
};
writeFileSync(OUT, JSON.stringify(record, null, 2));
process.stdout.write(`${JSON.stringify(record, null, 2)}\n`);
process.exit(record.bothGone ? 0 : 1);
