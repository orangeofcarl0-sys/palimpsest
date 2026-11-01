/**
 * C6-R3 — the research run state machine.
 *
 * These labels belong ONLY to the research rig. They are not Palimpsest Work vocabulary.
 *
 * The machine exists for three reasons:
 *   1. a run id or output directory cannot be reused, so two observations can never share an identity;
 *   2. a provider/session failure (BLOCKED) is recorded differently from an unfavourable but valid
 *      cognitive result (OBSERVED), and a contaminated observation is INVALID rather than silently
 *      treated as data;
 *   3. every transition is timestamped in the immutable run record.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const RUN_STATES = Object.freeze([
  "P1_PREPARED",
  "P1_RUNNING",
  "P1_FINISHED",
  "F1_PREPARED",
  "F1_RUNNING",
  "F1_FINISHED",
  "AUTHORIZATION_REVIEW",
  "T1_EFFECTS",
  "T2_RELEASED",
  "P3_RUNNING",
  "F2_RUNNING",
  "EVALUATED",
  "BLOCKED",
  "INVALID",
]);

const TRANSITIONS = new Map([
  ["P1_PREPARED", ["P1_RUNNING", "BLOCKED", "INVALID"]],
  ["P1_RUNNING", ["P1_FINISHED", "BLOCKED", "INVALID"]],
  ["P1_FINISHED", ["AUTHORIZATION_REVIEW", "F1_PREPARED", "BLOCKED", "INVALID"]],
  ["F1_PREPARED", ["F1_RUNNING", "BLOCKED", "INVALID"]],
  ["F1_RUNNING", ["F1_FINISHED", "BLOCKED", "INVALID"]],
  ["F1_FINISHED", ["AUTHORIZATION_REVIEW", "T1_EFFECTS", "BLOCKED", "INVALID"]],
  ["AUTHORIZATION_REVIEW", ["T1_EFFECTS", "EVALUATED", "BLOCKED", "INVALID"]],
  ["T1_EFFECTS", ["T2_RELEASED", "EVALUATED", "BLOCKED", "INVALID"]],
  ["T2_RELEASED", ["P3_RUNNING", "F2_RUNNING", "EVALUATED", "BLOCKED", "INVALID"]],
  ["P3_RUNNING", ["F2_RUNNING", "EVALUATED", "BLOCKED", "INVALID"]],
  ["F2_RUNNING", ["EVALUATED", "BLOCKED", "INVALID"]],
  ["EVALUATED", []],
  ["BLOCKED", []],
  ["INVALID", []],
]);

const RUN_ID = /^[a-z0-9][a-z0-9._-]{2,63}$/;

export function validateRunId(runId) {
  if (typeof runId !== "string" || !RUN_ID.test(runId)) {
    throw new Error("run id must be 3–64 lowercase letters, digits, dot, dash or underscore");
  }
  return runId;
}

export function runDirFor(root, runId) {
  return join(root, validateRunId(runId));
}

/** Create a new run. An existing run id or directory is refused; nothing is overwritten. */
export function createRun(input) {
  const dir = runDirFor(input.root, input.runId);
  if (existsSync(dir)) throw new Error(`run id is already in use: ${input.runId}`);
  if (!/^[0-9a-f]{40}$/.test(input.codeFreeze)) throw new Error("codeFreeze must be a full commit id");
  if (!/^[0-9a-f]{40}$/.test(input.codeTree)) throw new Error("codeTree must be a full tree id");
  mkdirSync(dir, { recursive: true });
  const run = {
    schema: "c6r-run/v1",
    runId: validateRunId(input.runId),
    createdAt: new Date().toISOString(),
    dir,
    codeFreeze: { commit: input.codeFreeze, tree: input.codeTree },
    scenario: {
      t1: input.t1,
      t2: input.t2,
      visibleSetDigest: input.visibleSetDigest ?? null,
      source: input.scenarioSource ?? null,
    },
    state: "P1_PREPARED",
    history: [{ at: new Date().toISOString(), from: null, to: "P1_PREPARED", reason: "run created", detail: null }],
    conditions: {
      P1: { preparedAt: null, startedAt: null, finishedAt: null, sessionId: null, exit: null, usage: null, classification: null, evidence: null },
      F1: { preparedAt: null, startedAt: null, finishedAt: null, sessionId: null, exit: null, usage: null, classification: null, evidence: null },
      P3: { preparedAt: null, startedAt: null, finishedAt: null, sessionId: null, exit: null, usage: null, classification: null, evidence: null },
      F2: { preparedAt: null, startedAt: null, finishedAt: null, sessionId: null, exit: null, usage: null, classification: null, evidence: null },
    },
    authorization: null,
    effects: null,
    evaluation: null,
  };
  writeRun(run);
  return run;
}

export function writeRun(run) {
  writeFileSync(join(run.dir, "run.json"), JSON.stringify(run, null, 2));
  return run;
}

export function loadRun(dir) {
  const run = JSON.parse(readFileSync(join(dir, "run.json"), "utf8"));
  if (run.schema !== "c6r-run/v1") throw new Error(`unknown run schema: ${run.schema}`);
  return run;
}

export function transition(run, to, detail = {}) {
  if (!RUN_STATES.includes(to)) throw new Error(`unknown run state: ${to}`);
  const allowed = TRANSITIONS.get(run.state) ?? [];
  if (!allowed.includes(to)) throw new Error(`illegal transition ${run.state} -> ${to}`);
  const entry = {
    at: new Date().toISOString(),
    from: run.state,
    to,
    reason: detail.reason ?? null,
    detail: detail.detail ?? null,
  };
  run.state = to;
  run.history.push(entry);
  writeRun(run);
  return entry;
}

export function setCondition(run, condition, patch) {
  if (!["P1", "F1", "P3", "F2"].includes(condition)) throw new Error(`unknown condition: ${condition}`);
  run.conditions[condition] = { ...run.conditions[condition], ...patch };
  writeRun(run);
  return run.conditions[condition];
}

export function setAuthorization(run, record) {
  run.authorization = record;
  writeRun(run);
  return record;
}

export function setEffects(run, record) {
  run.effects = record;
  writeRun(run);
  return record;
}

export function setEvaluation(run, record) {
  run.evaluation = record;
  writeRun(run);
  return record;
}

export function allowedNext(run) {
  return TRANSITIONS.get(run.state) ?? [];
}
