#!/usr/bin/env node
/**
 * COG-2C — cognitive inheritance across two separate processes.
 *
 *   node scripts/cog2/run_inheritance.mjs --condition P|F --round 1|2 --dir <run dir>
 *
 * P  Palimpsest project journal
 * F  ordinary PRIOR-NOTES.md
 *
 * Round 1 investigates and records. Round 2 is a NEW process with a NEW DSH home and the January
 * update pack; its prompt never names the carrier or the finding. The state databases (P) and the
 * world files (F) are the only bridge.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  ROUND_ONE_FILE_INSTRUCTION,
  ROUND_ONE_JOURNAL_INSTRUCTION,
  ROUND_ONE_TASK,
  ROUND_TWO_DELIVERABLE,
  ROUND_TWO_TASK,
} from "./task_text.mjs";
import {
  buildWorld,
  deliverableState,
  ensureSharedModules,
  launch,
  releaseUpdates,
  sessionTelemetry,
  withDeployment,
  writeHeadlessProfile,
  writePalimpsestProfile,
} from "./rig.mjs";

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/u, "").split("=");
    return [key, rest.join("=")];
  }),
);
const CONDITION = String(args.get("condition") ?? "").toUpperCase();
const ROUND = Number(args.get("round") ?? "0");
const DIR = String(args.get("dir") ?? "");
const TAG = String(args.get("tag") ?? "");
if (!["P", "F"].includes(CONDITION)) throw new Error("--condition=P|F is required");
if (![1, 2].includes(ROUND)) throw new Error("--round=1|2 is required");
if (DIR === "") throw new Error("--dir=<run dir> is required");

const HOME = join(DIR, ROUND === 1 ? `home-r1${TAG}` : `home-r2${TAG}`);
const STATE = join(DIR, "state");
const WORK = join(DIR, "work");
const UNIT = `cog2-inherit-${CONDITION.toLowerCase()}-r${ROUND}`;
const PALIMPSEST = CONDITION === "P";
const TRAP_NOTES = `# Prior programme notes (carried forward from earlier reviews)

These notes were kept by the programme team. They are not a formal evaluation and have not been
re-checked recently.

1. **The east hall is climate-controlled.** The 2019 building survey recorded the east hall as
   climate-controlled and suitable for sensitive textiles and paper. *(Source: 2019 building
   survey, as summarised in the programme notes.)*

2. **Members want evening events.** 61% of members say transport is the main barrier and 44% say
   they would attend an evening event if transport were available. This supports an evening series.
   *(Source: 2025 member survey headline.)*

3. **Website migration.** The website moved to a new domain in March 2024 and traffic rose 12%.
   *(Source: 2024 communications note.)*
`;

if (ROUND === 1) {
  if (CONDITION === "F") buildWorld(WORK, { withNotes: true, notesText: TRAP_NOTES });
  // P is seeded by scripts/cog2/seed.mjs --mode=inheritance before this script runs.
  if (CONDITION === "P" && !existsSync(join(DIR, "seed.json"))) {
    throw new Error("P round 1 needs seed.mjs --mode=inheritance first");
  }
} else {
  releaseUpdates(WORK);
}

ensureSharedModules(HOME);
if (PALIMPSEST) {
  writePalimpsestProfile(HOME, { unit: UNIT, stateDir: STATE, workDir: WORK, projectId: "harrowgate", activation: "none" });
} else {
  writeHeadlessProfile(HOME, UNIT, { subagents: false });
}

const task =
  ROUND === 1
    ? `${ROUND_ONE_TASK}\n\n${PALIMPSEST ? ROUND_ONE_JOURNAL_INSTRUCTION : ROUND_ONE_FILE_INSTRUCTION}`
    : ROUND_TWO_TASK;

const logPath = join(DIR, `round-${ROUND}${TAG}.log`);
const result = await launch({
  profileUnit: UNIT,
  homeDir: HOME,
  workDir: WORK,
  task,
  logPath,
  palimpsest: PALIMPSEST,
});

const telemetry = sessionTelemetry(HOME, WORK);
const deliverable = deliverableState(WORK, ROUND_TWO_DELIVERABLE);
const notesAfter = existsSync(join(WORK, "sources", "PRIOR-NOTES.md"))
  ? readFileSync(join(WORK, "sources", "PRIOR-NOTES.md"), "utf8")
  : null;

let journalAfter = null;
if (PALIMPSEST && ROUND === 2) {
  journalAfter = await withDeployment(
    { unit: UNIT, stateDir: STATE, workDir: WORK, projectId: "harrowgate" },
    async (deployment) => {
      const journal = deployment.installed.projectWorkspace;
      if (journal === undefined) return null;
      const entries = await journal.journal();
      return entries.map((view) => ({
        entryId: view.entry.entryId,
        kind: view.entry.kind,
        title: view.entry.title,
        provenance: view.entry.provenance,
        body: view.entry.body,
      }));
    },
  );
}

const record = {
  schema: "cog2-inheritance-run/v1",
  condition: CONDITION,
  round: ROUND,
  finishedAt: new Date().toISOString(),
  task,
  carrier: PALIMPSEST ? "palimpsest-project-journal" : "ordinary-file",
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
  notesAfter,
  journalAfter,
};

writeFileSync(join(DIR, `round-${ROUND}${TAG}.json`), JSON.stringify(record, null, 2));
console.log(
  JSON.stringify({
    condition: CONDITION,
    round: ROUND,
    exit: record.exitCode,
    timeout: record.timedOut,
    ms: record.wallClockMs,
    model: telemetry.model,
    provider: telemetry.provider,
    usage: telemetry.totalUsage,
    toolCalls: telemetry.mainSession?.toolCalls ?? 0,
    palimpsestCalls: telemetry.mainSession?.palimpsestCalls ?? 0,
    journalEntries: journalAfter?.length ?? null,
    deliverable: record.deliverable.present,
  }),
);
