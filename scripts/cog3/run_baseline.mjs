#!/usr/bin/env node
/**
 * COG-3 baselines over the SAME world and task.
 *
 *   node scripts/cog3/run_baseline.mjs --run=<dir> --condition=S|F
 *
 * S  strong single-agent file baseline: ordinary DSH tools, prior conclusions in sources/prior-notes.md,
 *    native subagents/workflow disabled.
 * F  native DSH collaboration baseline: the SAME headless agent with the installed subagent/workflow
 *    tools enabled. Nothing Palimpsest-specific is present.
 *
 * Both run one headless session. F's spawned subagents are separate model sessions and are counted.
 */
import { join } from "node:path";
import {
  RUNTIME,
  deliverableState,
  ensureSharedModules,
  launchOnce,
  readJson,
  sessionTelemetry,
  writeHeadlessProfile,
  writeJson,
  worldHead,
} from "./rig3.mjs";
import { PLAN_TASK } from "./task_text.mjs";

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/u, "").split("=");
    return [key, rest.join("=")];
  }),
);
const DIR = String(args.get("run") ?? "");
const CONDITION = String(args.get("condition") ?? "");
if (DIR === "") throw new Error("--run=<dir> is required");
if (!["S", "F"].includes(CONDITION)) throw new Error("--condition=S|F is required");

const HOME = join(DIR, "home");
const WORK = join(DIR, "work");
const UNIT = CONDITION === "S" ? "cog3-single" : "cog3-native";
const seed = readJson(join(DIR, "seed.json"));
if (seed.carrier !== "file") throw new Error("the baselines require the file carrier world");
if (seed.worldHead !== worldHead(WORK)) throw new Error("the world head changed since seeding");

ensureSharedModules(HOME);
writeHeadlessProfile(HOME, UNIT, { subagents: CONDITION === "F" });

const before = deliverableState(WORK, "deliverables/plan.md");
const result = await launchOnce({
  profileUnit: UNIT,
  homeDir: HOME,
  workDir: WORK,
  task: PLAN_TASK,
  logPath: join(DIR, `baseline-${CONDITION}.log`),
});
const after = deliverableState(WORK, "deliverables/plan.md");
const telemetry = sessionTelemetry(HOME);

const record = {
  schema: "cog3-baseline-run/v1",
  condition: CONDITION,
  startedAt: new Date().toISOString(),
  runtime: RUNTIME,
  seed: { carrier: seed.carrier, worldHead: seed.worldHead },
  head: worldHead(WORK),
  exit: { code: result.code, timedOut: result.timedOut, ms: result.ms },
  planBefore: { present: before.present, bytes: before.bytes ?? 0, digest: before.digest ?? null },
  planAfter: { present: after.present, bytes: after.bytes ?? 0, digest: after.digest ?? null, text: after.text ?? null },
  stdoutTail: result.stdout.slice(-20_000),
  stderrTail: result.stderr.slice(-20_000),
  telemetry,
};
writeJson(join(DIR, "run.json"), record);

console.log(
  JSON.stringify({
    condition: CONDITION,
    exit: record.exit,
    sessions: telemetry.sessionCount,
    tools: telemetry.mainSession?.tools ?? null,
    plan: { present: after.present, bytes: after.bytes ?? 0 },
    tokens: telemetry.totalUsage.totalTokens,
    model: telemetry.model,
    provider: telemetry.provider,
  }),
);
