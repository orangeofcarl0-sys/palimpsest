/**
 * Host-S1RA-E4 §D — TWO-RUN ASYNCHRONOUS SMOKE.
 *
 * The single-run vertical slice is established by `scripts/trajectory_p2b/level-b-first-party-gate.mjs` passing
 * `qualified: true` against rc.3. This script asks the NEXT question, and only that one:
 *
 *   can two INDEPENDENT run-owned execution contexts overlap in time and deliver correctly, with results attributed
 *   to the right run and neither cleanup touching the other's resources?
 *
 * WHAT IT DELIBERATELY DOES NOT DO. It is not a multi-writer test. Two runs writing the same asset, cross-owner
 * negotiation, and Trajectory causal reconstruction are all out of scope, and a pass here says nothing about them.
 *
 * HOW CONCURRENCY IS ESTABLISHED RATHER THAN ASSUMED. Two `setTimeout`s racing is not evidence. Each run records a
 * monotonic START and END timestamp taken in its own child process, and the script computes the OVERLAP INTERVAL from
 * those timestamps. If the intervals do not intersect, the arm reports `SEQUENTIAL` and the concurrency claim is
 * refused — a sequential pair must not be able to pass this control.
 *
 * HOW ATTRIBUTION IS ESTABLISHED. Each run writes a result file containing its own run id, and the reader verifies
 * that run A's result names run A. Out-of-order completion is arranged by giving run A a longer task, so B finishes
 * first; the check is that B's early completion did not disturb A.
 *
 * SAFETY. Two private gate roots, two private homes, no shared writable state. Cleanup goes through the E3 quarantine
 * path. Nothing touches the real runtime installation, and no model is called.
 *
 * Usage:
 *   node scripts/host_s1rae4/two-run-smoke.mjs [--json=<path>]
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/u, "").split("=");
    return [key, rest.join("=")];
  }),
);

const REPO = resolve(import.meta.dirname, "..", "..");
const owned = await import("../trajectory_p2b/owned-resource.mjs");

/**
 * TWO PRIVATE GATE ROOTS. Not the shared `~/.palimpsest-gates`: E4-A established that shared-root observation makes
 * attribution impossible, and the same reasoning applies to attribution between two runs.
 */
const BASE = mkdtempSync(join(tmpdir(), "s1rae4-two-run-"));

/**
 * THE RUN BODY, executed in its own child process.
 *
 * It allocates an owned root, writes a payload, holds it for a run-specific duration, records monotonic timestamps,
 * and disposes through the quarantine path. The hold is what creates a REAL overlap rather than an assumed one.
 */
const RUN_BODY = `
import { writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
const owned = await import(${JSON.stringify(new URL("../trajectory_p2b/owned-resource.mjs", import.meta.url).href)});

/**
 * ARGUMENTS ARRIVE THROUGH THE ENVIRONMENT, NOT argv.
 *
 * A first version read them from argv positions, which is wrong when node runs a -e SCRIPT: the -e script shifts the
 * argv layout, so run A received the HOLD value as its gate root and the allocation failed with ENOENT on a nonsense
 * path. Passing them through named variables removes the dependence on argv layout entirely.
 *
 * (No backticks or template delimiters in this comment: it lives INSIDE a template literal.)
 */
const runId = process.env.E4_RUN_ID;
const gateRoot = process.env.E4_GATE_ROOT;
const holdMs = Number(process.env.E4_HOLD_MS);
const resultPath = process.env.E4_RESULT_PATH;

const allocated = owned.allocateOwnedRoot(gateRoot, "e4-two-" + runId + "-");
const lifetime = owned.ownedRootLifetime(allocated);
const startedAt = performance.now();
const wallStart = Date.now();

/** A deterministic task whose result cannot be mistaken for a static response. */
const task = { runId, root: allocated.root, generation: allocated.generation, payloadDigest: null };
const payload = runId + ":" + String(allocated.generation) + ":" + allocated.root;
writeFileSync(allocated.root + "/payload.txt", payload, "utf8");
task.payloadDigest = payload;

/** The hold. This is the interval that must OVERLAP with the other run's. */
await new Promise((done) => setTimeout(done, holdMs));

const wallEnd = Date.now();
const endedAt = performance.now();
const disposal = lifetime.dispose();
const { existsSync } = await import("node:fs");

writeFileSync(resultPath, JSON.stringify({
  runId,
  task,
  startedAt,
  endedAt,
  wallStart,
  wallEnd,
  holdMs,
  disposal,
  rootStillPresent: existsSync(allocated.root),
}, null, 2), "utf8");
process.exit(disposal.cleaned === true ? 0 : 1);
`;

const gateRootA = join(BASE, "gate-a");
const gateRootB = join(BASE, "gate-b");
mkdirSync(gateRootA, { recursive: true });
mkdirSync(gateRootB, { recursive: true });
const resultA = join(BASE, "result-a.json");
const resultB = join(BASE, "result-b.json");

/**
 * RUN A HOLDS LONGER THAN RUN B, so B completes first. That is the out-of-order completion the ruling asks for, and it
 * is arranged rather than hoped for.
 */
const HOLD_A = 2500;
const HOLD_B = 600;

const launch = (runId, gateRoot, holdMs, resultPath) =>
  new Promise((done) => {
    const child = spawn(process.execPath, ["--input-type=module", "-e", RUN_BODY], {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, E4_RUN_ID: runId, E4_GATE_ROOT: gateRoot, E4_HOLD_MS: String(holdMs), E4_RESULT_PATH: resultPath },
    });
    const stderr = [];
    child.stderr.on("data", (chunk) => stderr.push(String(chunk)));
    child.on("exit", (code) => done({ runId, exit: code, stderr: stderr.join("").slice(0, 600) }));
  });

/** BOTH ARE LAUNCHED BEFORE EITHER IS AWAITED, which is what makes them concurrent rather than sequential. */
const pendingA = launch("A", gateRootA, HOLD_A, resultA);
const pendingB = launch("B", gateRootB, HOLD_B, resultB);
const [outcomeA, outcomeB] = await Promise.all([pendingA, pendingB]);
const readResult = (path) => {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
};
const a = readResult(resultA);
const b = readResult(resultB);

/**
 * THE OVERLAP, COMPUTED FROM THE RUNS' OWN TIMESTAMPS. Wall clock is used because the two runs are separate
 * processes; `performance.now()` is not comparable across them, so it is recorded for within-run detail only.
 */
const overlap = (() => {
  if (a === null || b === null) return { computable: false };
  const start = Math.max(a.wallStart, b.wallStart);
  const end = Math.min(a.wallEnd, b.wallEnd);
  return { computable: true, start, end, overlapMs: Math.max(0, end - start), aStart: a.wallStart, aEnd: a.wallEnd, bStart: b.wallStart, bEnd: b.wallEnd };
})();

const results = {
  runA: a === null ? { missing: true, outcome: outcomeA } : { runId: a.runId, generation: a.task.generation, disposal: a.disposal, rootStillPresent: a.rootStillPresent, outcome: outcomeA },
  runB: b === null ? { missing: true, outcome: outcomeB } : { runId: b.runId, generation: b.task.generation, disposal: b.disposal, rootStillPresent: b.rootStillPresent, outcome: outcomeB },
};

/** ATTRIBUTION: each result must name its own run, and the two must be different runs. */
const attribution = {
  aNamesItself: a !== null && a.runId === "A",
  bNamesItself: b !== null && b.runId === "B",
  distinctRoots: a !== null && b !== null && a.task.root !== b.task.root,
  distinctPayloads: a !== null && b !== null && a.task.payloadDigest !== b.task.payloadDigest,
  /**
   * GENERATIONS ARE DELIBERATELY NOT COMPARED FOR INEQUALITY.
   *
   * `generation` is a PER-PROCESS monotonic counter (E3-B), so two independent processes each allocate their first
   * root at generation 1. Requiring them to differ would demand a global counter, which is exactly the kind of shared
   * durable state E3 declined to add. What matters for attribution is that each run's own record authorises only its
   * own root, and that is what the disposal receipts and the distinct roots above establish.
   */
  generationIsPerProcess: a !== null && b !== null && typeof a.task.generation === "number" && typeof b.task.generation === "number",
  generationValues: { a: a?.task.generation ?? null, b: b?.task.generation ?? null },
};

/** OUT-OF-ORDER COMPLETION: B must have finished before A. */
const completionOrder = {
  aWallEnd: a?.wallEnd ?? null,
  bWallEnd: b?.wallEnd ?? null,
  bFinishedFirst: a !== null && b !== null && b.wallEnd < a.wallEnd,
};

/** ISOLATION: neither disposal may have touched the other run's root, and each must report its own cleanup. */
const normalise = (value) => String(value).replace(/\\/gu, "/").toLowerCase();
const isolation = {
  aCleaned: a?.disposal?.cleaned === true,
  bCleaned: b?.disposal?.cleaned === true,
  aRootGone: a?.rootStillPresent === false,
  bRootGone: b?.rootStillPresent === false,
  /**
   * A's root must be inside A's gate root and NOT inside B's. Both sides are resolved and lowercased before the
   * comparison: `mkdtemp` returns a REALPATH, and on this platform the temp directory is reached through a junction,
   * so a plain string prefix test against the unresolved gate root fails for a reason that has nothing to do with
   * isolation. The first version of this check made exactly that mistake and reported `false` for both runs.
   */
  aRootInAGate: a !== null ? normalise(a.task.root).startsWith(normalise(gateRootA) + "/") : false,
  aRootNotInBGate: a !== null ? !normalise(a.task.root).startsWith(normalise(gateRootB) + "/") : false,
  bRootInBGate: b !== null ? normalise(b.task.root).startsWith(normalise(gateRootB) + "/") : false,
  bRootNotInAGate: b !== null ? !normalise(b.task.root).startsWith(normalise(gateRootA) + "/") : false,
};

/**
 * THE SEQUENTIAL NEGATIVE CONTROL.
 *
 * A concurrency verdict is only meaningful if a SEQUENTIAL pair cannot produce it. This arm runs the same two bodies
 * but AWAITS each in turn, so their intervals cannot intersect, and applies the SAME overlap test. If the test reports
 * an overlap here, the test is broken and the positive result above means nothing.
 */
const seqRootA = join(BASE, "gate-seq-a");
const seqRootB = join(BASE, "gate-seq-b");
mkdirSync(seqRootA, { recursive: true });
mkdirSync(seqRootB, { recursive: true });
const seqResultA = join(BASE, "seq-a.json");
const seqResultB = join(BASE, "seq-b.json");
const seqOutcomeA = await launch("SA", seqRootA, 400, seqResultA);
const seqOutcomeB = await launch("SB", seqRootB, 200, seqResultB);
const seqA = readResult(seqResultA);
const seqB = readResult(seqResultB);
const sequentialOverlap = (() => {
  if (seqA === null || seqB === null) return { computable: false, overlapMs: 0 };
  const start = Math.max(seqA.wallStart, seqB.wallStart);
  const end = Math.min(seqA.wallEnd, seqB.wallEnd);
  return { computable: true, overlapMs: Math.max(0, end - start) };
})();
const sequentialControl = {
  method: "the same two bodies, each AWAITED before the next is launched, so their intervals cannot intersect",
  outcomes: [seqOutcomeA, seqOutcomeB],
  overlapMs: sequentialOverlap.overlapMs,
  wouldPassTheConcurrencyTest: sequentialOverlap.computable === true && sequentialOverlap.overlapMs > 0,
  verdict:
    sequentialOverlap.overlapMs > 0
      ? "BROKEN CONTROL: a sequential pair produced an overlap, so the concurrency test does not discriminate"
      : "HOLDS: a sequential pair produces no overlap, so the positive result above is not an artefact of the test",
};
const concurrent = overlap.computable === true && overlap.overlapMs > 0;
const passed =
  concurrent &&
  attribution.aNamesItself &&
  attribution.bNamesItself &&
  attribution.distinctRoots &&
  attribution.distinctPayloads &&
  isolation.aCleaned &&
  isolation.bCleaned &&
  isolation.aRootGone &&
  isolation.bRootGone &&
  isolation.aRootInAGate &&
  isolation.aRootNotInBGate &&
  isolation.bRootInBGate &&
  isolation.bRootNotInAGate &&
  completionOrder.bFinishedFirst;

/** Remove the sandbox. It is ours; nothing else writes there. */
let removed = false;
try {
  rmSync(BASE, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  removed = true;
} catch {
  removed = false;
}

const report = {
  schemaVersion: 1,
  kind: "HOST_S1RAE4_TWO_RUN_SMOKE",
  stage: "Palimpsest Host-S1RA-E4",
  measuredAt: new Date().toISOString(),
  method:
    "two child processes are launched before either is awaited; each allocates its own owned root under its own gate root, holds it for a run-specific interval, and records wall-clock start/end. Overlap is COMPUTED from those timestamps",
  design: { holdMsA: HOLD_A, holdMsB: HOLD_B, whyBShorter: "so B completes first, which is the out-of-order completion the control requires" },
  runs: results,
  overlap,
  attribution,
  completionOrder,
  isolation,
  sequentialControl,
  verdict: passed && !sequentialControl.wouldPassTheConcurrencyTest
    ? "TWO_RUNS_OVERLAPPED_AND_ATTRIBUTED"
    : passed
      ? "BROKEN_CONCURRENCY_CONTROL"
      : concurrent
        ? "OVERLAPPED_BUT_NOT_FULLY_ATTRIBUTED"
        : "SEQUENTIAL",
  scope: {
    establishes: "two independent, isolated real execution contexts can overlap and deliver correctly under the tested conditions",
    doesNotEstablish: [
      "multiple agents can safely write the same asset",
      "arbitrary shared-resource concurrency is safe",
      "autonomous cross-owner negotiation works",
      "Trajectory fully reconstructs cross-owner causality",
      "production L2 adversarial isolation exists",
    ],
  },
  sandboxRemoved: removed,
  modelCallsMade: 0,
};

const jsonPath = args.get("json");
if (jsonPath !== undefined) writeFileSync(resolve(jsonPath), `${JSON.stringify(report, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
process.exit(passed ? 0 : 2);
