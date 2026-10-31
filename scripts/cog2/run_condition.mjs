#!/usr/bin/env node
/**
 * COG-2 — run ONE condition for ONE round.
 *
 *   node scripts/cog2/run_condition.mjs --condition A|B|C|D|NEGATIVE|POSITIVE --dir <run dir>
 *
 * Every condition runs one model session of the same model with the same wall-clock cap. DSH
 * subagent/workflow tools are disabled everywhere so the comparison is about the Palimpsest
 * surface and the knowledge carrier, not about extra harness agents.
 *
 * A  files only, ordinary PRIOR-NOTES.md                 (no Palimpsest profile)
 * B  Palimpsest tools, no ProjectIR, ordinary PRIOR-NOTES.md
 * C  project-ready: ProjectIR + journal, no ordinary notes
 * D  C + one short task-shaped invitation
 * NEGATIVE  C world, a self-contained rewrite task (no plan, no lookup needed)
 * POSITIVE  C world, an explicit mechanism check (labelled diagnostic, never natural use)
 */
import { join } from "node:path";
import {
  PLAN_TASK,
  POSITIVE_CONTROL_TASK,
  NEGATIVE_CONTROL_TASK,
  TASK_SHAPED_INVITATION,
} from "./task_text.mjs";
import {
  buildWorld,
  deliverableState,
  ensureSharedModules,
  launch,
  sessionTelemetry,
  writeHeadlessProfile,
  writePalimpsestProfile,
} from "./rig.mjs";
import { readFileSync, writeFileSync } from "node:fs";

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/u, "").split("=");
    return [key, rest.join("=")];
  }),
);
const CONDITION = String(args.get("condition") ?? "").toUpperCase();
const DIR = String(args.get("dir") ?? "");
if (!["A", "B", "C", "D", "NEGATIVE", "POSITIVE"].includes(CONDITION)) {
  throw new Error("--condition=A|B|C|D|NEGATIVE|POSITIVE is required");
}
if (DIR === "") throw new Error("--dir=<run dir> is required");

const HOME = join(DIR, "home");
const STATE = join(DIR, "state");
const WORK = join(DIR, "work");
const UNIT = `cog2-${CONDITION.toLowerCase()}`;
const PALIMPSEST = CONDITION !== "A";
const NOTES = ["A", "B"].includes(CONDITION);

buildWorld(WORK, { withNotes: NOTES });
ensureSharedModules(HOME);

if (PALIMPSEST) {
  writePalimpsestProfile(HOME, { unit: UNIT, stateDir: STATE, workDir: WORK, projectId: "harrowgate", activation: "none" });
} else {
  writeHeadlessProfile(HOME, UNIT, { subagents: false });
}

const task =
  CONDITION === "POSITIVE"
    ? POSITIVE_CONTROL_TASK
    : CONDITION === "NEGATIVE"
      ? NEGATIVE_CONTROL_TASK
      : CONDITION === "D"
        ? `${TASK_SHAPED_INVITATION}\n\n${PLAN_TASK}`
        : PLAN_TASK;

const logPath = join(DIR, `run-${CONDITION.toLowerCase()}.log`);
const result = await launch({
  profileUnit: UNIT,
  homeDir: HOME,
  workDir: WORK,
  task,
  logPath,
  palimpsest: PALIMPSEST,
});

const telemetry = sessionTelemetry(HOME, WORK);
const deliverable = deliverableState(WORK, "deliverables/plan.md");
let seed = null;
try {
  seed = JSON.parse(readFileSync(join(DIR, "seed.json"), "utf8"));
} catch {
  seed = null;
}

const record = {
  schema: "cog2-run/v1",
  condition: CONDITION,
  finishedAt: new Date().toISOString(),
  task,
  carrier: NOTES ? "ordinary-file" : "palimpsest-project-journal",
  palimpsestToolsAvailable: PALIMPSEST,
  projectInitialized: seed !== null,
  exitCode: result.code,
  timedOut: result.timedOut,
  wallClockMs: result.ms,
  stdoutTail: result.stdout.slice(-6000),
  stderrTail: result.stderr.slice(-4000),
  telemetry,
  deliverable: {
    present: deliverable.present,
    bytes: deliverable.present ? deliverable.bytes : null,
    digest: deliverable.present ? deliverable.digest : null,
    text: deliverable.present ? deliverable.text : null,
  },
  seed,
};

writeFileSync(join(DIR, "run.json"), JSON.stringify(record, null, 2));
console.log(
  JSON.stringify({
    condition: CONDITION,
    exit: record.exitCode,
    timeout: record.timedOut,
    ms: record.wallClockMs,
    model: telemetry.model,
    sessions: telemetry.sessionCount,
    toolCalls: telemetry.mainSession?.toolCalls ?? 0,
    palimpsestCalls: telemetry.mainSession?.palimpsestCalls ?? 0,
    deliverable: record.deliverable.present,
  }),
);
