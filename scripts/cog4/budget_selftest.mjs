#!/usr/bin/env node
/**
 * COG-4 budget-monitor self-test against TEST-OWNED SIMULATED usage records.
 *
 * This runs before any real-model trial. Its output is evidence that the monitor:
 *   - charges a duplicated observation once;
 *   - charges a delayed (post-completion) event once and records it as delayed;
 *   - counts a resumed Session once and appends its later events;
 *   - counts a child Session separately;
 *   - keeps cache-read distinct from input/output;
 *   - refuses a launch whose observed + reserve + estimate crosses the launch-stop threshold;
 *   - raises the hard stop at the ceiling;
 *   - records unavailable usage without estimating it;
 *   - marks a completed Session exactly once;
 *   - reports sessions past the wall-clock bound.
 *
 * No model is called. The usage values are simulated and the output says so.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { DEFAULT_BUDGET, createBudgetMonitor } from "./budget.mjs";

const OUT = resolve(import.meta.dirname, "..", "..", "research-evidence", "cog4", "measurement", "budget-selftest.json");

const cases = [];
function check(name, condition, detail) {
  cases.push({ name, passed: Boolean(condition), detail });
  if (!condition) throw new Error(`budget self-test failed: ${name} — ${JSON.stringify(detail)}`);
}

function usage(totalTokens, extra = {}) {
  return { totalTokens, inputTokens: extra.inputTokens ?? 10, outputTokens: extra.outputTokens ?? totalTokens - 10, cacheReadTokens: extra.cacheReadTokens ?? 0, cacheWriteTokens: 0 };
}

/* 1. duplicate observation */
{
  const monitor = createBudgetMonitor();
  const event = { sessionKey: "h1:s1", sessionId: "s1", home: "h1", role: "principal", seq: 1, usage: usage(1000) };
  monitor.observeUsage(event);
  const second = monitor.observeUsage(event);
  const snap = monitor.snapshot();
  check("duplicate observation is charged once", snap.observedTokens === 1000 && second.duplicate === true && snap.duplicateObservations === 1, { observed: snap.observedTokens, second, duplicates: snap.duplicateObservations });
}

/* 2. delayed event after completion */
{
  const monitor = createBudgetMonitor();
  monitor.observeUsage({ sessionKey: "h1:s2", sessionId: "s2", home: "h1", role: "principal", seq: 1, usage: usage(1000) });
  monitor.markCompleted({ sessionKey: "h1:s2", at: "T1" });
  const late = monitor.observeUsage({ sessionKey: "h1:s2", sessionId: "s2", home: "h1", role: "principal", seq: 2, usage: usage(500) });
  const snap = monitor.snapshot();
  check("delayed event is charged once and flagged", snap.observedTokens === 1500 && late.delayed === true && snap.delayedObservations === 1, { observed: snap.observedTokens, late, delayed: snap.delayedObservations });
}

/* 3. resumed Session keeps identity */
{
  const monitor = createBudgetMonitor();
  monitor.observeUsage({ sessionKey: "h1:s3", sessionId: "s3", home: "h1", role: "principal", seq: 1, usage: usage(1000) });
  monitor.markCompleted({ sessionKey: "h1:s3", at: "T1" });
  monitor.observeUsage({ sessionKey: "h1:s3", sessionId: "s3", home: "h1", role: "principal", seq: 2, usage: usage(700) });
  monitor.observeUsage({ sessionKey: "h1:s3", sessionId: "s3", home: "h1", role: "principal", seq: 3, usage: usage(300) });
  const snap = monitor.snapshot();
  check("a resumed Session is one Session and its events sum once", snap.sessionsStarted === 1 && snap.observedTokens === 2000, { sessions: snap.sessionsStarted, observed: snap.observedTokens });
}

/* 4. child Session is separate */
{
  const monitor = createBudgetMonitor();
  monitor.observeUsage({ sessionKey: "h1:parent", sessionId: "parent", home: "h1", role: "principal", seq: 1, usage: usage(1000) });
  monitor.observeUsage({ sessionKey: "h1:child", sessionId: "child", home: "h1", role: "child", parent: "parent", seq: 1, usage: usage(400) });
  const snap = monitor.snapshot();
  check("a child Session is counted separately", snap.sessionsStarted === 2 && snap.observedTokens === 1400, { sessions: snap.sessionsStarted, observed: snap.observedTokens });
}

/* 5. cache-read separation */
{
  const monitor = createBudgetMonitor();
  monitor.observeUsage({ sessionKey: "h1:s5", sessionId: "s5", home: "h1", role: "principal", seq: 1, usage: usage(1000, { inputTokens: 50, outputTokens: 100, cacheReadTokens: 850 }) });
  const snap = monitor.snapshot();
  check("cache-read is reported separately from input/output", snap.inputTokens === 50 && snap.outputTokens === 100 && snap.cacheReadTokens === 850 && snap.observedTokens === 1000, { input: snap.inputTokens, output: snap.outputTokens, cache: snap.cacheReadTokens, observed: snap.observedTokens });
}

/* 6. launch prevention with observed + reserve + estimate */
{
  const monitor = createBudgetMonitor({ tokenCap: 5_000_000, launchStopTokens: 1_000_000, principalReserveTokens: 200_000 });
  monitor.observeUsage({ sessionKey: "h1:live", sessionId: "live", home: "h1", role: "principal", seq: 1, usage: usage(500_000) });
  const refused = monitor.canLaunch({ estimatedTokens: 400_000 });
  monitor.markCompleted({ sessionKey: "h1:live", at: "T1" });
  monitor.observeUsage({ sessionKey: "h1:done", sessionId: "done", home: "h1", role: "principal", seq: 1, usage: usage(100_000) });
  monitor.markCompleted({ sessionKey: "h1:done", at: "T1" });
  const allowed = monitor.canLaunch({ estimatedTokens: 300_000 });
  check("launch is refused when observed + live reserve + estimate crosses the launch-stop threshold", refused.allowed === false && refused.reasons.length > 0, { refused });
  check("launch is allowed again after the live reserve is released and enough headroom remains", allowed.allowed === true, { allowed });
}

/* 7. hard stop at the ceiling */
{
  const monitor = createBudgetMonitor({ tokenCap: 1_000_000, launchStopTokens: 600_000 });
  monitor.observeUsage({ sessionKey: "h1:s7", sessionId: "s7", home: "h1", role: "principal", seq: 1, usage: usage(1_200_000) });
  const snap = monitor.snapshot();
  check("the hard stop is raised at the ceiling", snap.stopRequested === true && snap.remainingToCap < 0, { stopRequested: snap.stopRequested, remaining: snap.remainingToCap });
}

/* 8. unavailable usage is not estimated */
{
  const monitor = createBudgetMonitor();
  monitor.observeUsage({ sessionKey: "h1:s8", sessionId: "s8", home: "h1", role: "principal", seq: 1, usage: usage(1000) });
  monitor.recordUnavailable({ sessionKey: "h1:s8", reason: "the session stream could not be decoded" });
  const snap = monitor.snapshot();
  check("unavailable usage is recorded without inventing tokens", snap.observedTokens === 1000 && snap.sessions[0].unavailable.length === 1, { observed: snap.observedTokens, unavailable: snap.sessions[0].unavailable });
}

/* 9. completed Session is counted once */
{
  const monitor = createBudgetMonitor();
  monitor.observeUsage({ sessionKey: "h1:s9", sessionId: "s9", home: "h1", role: "principal", seq: 1, usage: usage(1000) });
  const first = monitor.markCompleted({ sessionKey: "h1:s9", at: "T1" });
  const second = monitor.markCompleted({ sessionKey: "h1:s9", at: "T2" });
  const snap = monitor.snapshot();
  check("a completed Session is accounted exactly once", first.newlyCompleted === true && second.newlyCompleted === false && snap.sessionsCompleted === 1, { first, second, completed: snap.sessionsCompleted });
}

/* 10. wall-clock detection */
{
  const monitor = createBudgetMonitor({ perSessionMinutes: 8 });
  const startedAt = Date.now() - 9 * 60_000;
  monitor.observeUsage({ sessionKey: "h1:s10", sessionId: "s10", home: "h1", role: "principal", seq: 1, usage: usage(1000), startedAt });
  const snap = monitor.snapshot();
  check("a Session past its wall-clock bound is reported", snap.overWallClock.length === 1, { overWallClock: snap.overWallClock });
}

const result = Object.freeze({
  schema: "cog4-budget-selftest/v1",
  at: new Date().toISOString(),
  simulated: true,
  note: "Usage values are simulated test-owned records. No model was called. This proves the monitor's accounting and launch policy, not any model behaviour.",
  limits: DEFAULT_BUDGET,
  cases,
  passed: cases.filter((entry) => entry.passed).length,
  failed: cases.filter((entry) => !entry.passed).length,
});
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(result, null, 2));
console.log(JSON.stringify({ passed: result.passed, failed: result.failed, out: OUT }));
