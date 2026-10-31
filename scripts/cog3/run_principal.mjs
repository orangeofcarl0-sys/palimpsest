#!/usr/bin/env node
/**
 * COG-3 principal runner — the SHIPPED long-lived DSH host, not a diagnostic launchDeployment call.
 *
 *   node scripts/cog3/run_principal.mjs --run=<dir> --mode=scored|mechanism
 *
 * The run directory was seeded by seed3.mjs --carrier=journal. This script:
 *   1. starts the principal without --once (the real attention loop stays alive);
 *   2. records PALIMPSEST_HOST_READY (what the host composed and offered);
 *   3. waits for the launch turn, then commits the project update (scored mode) so the delegated
 *      finding is computed against the earlier basis and later has to be judged for currentness;
 *   4. waits for the real terminal delivery line(s) and the principal's own follow-up turn(s);
 *   5. stops the process tree and records the session telemetry and deliverable state;
 *   6. in scored mode, cold-resumes the SAME durable session with the update message and records the
 *      revised plan.
 *
 * Nothing here fabricates a delegation, a result or a delivery.
 */
import { join } from "node:path";
import {
  RUNTIME,
  RIG,
  applyUpdate,
  deliverableState,
  ensureDir,
  launchPrincipal,
  readJson,
  sessionTelemetry,
  writeJson,
  writePalimpsestProfile,
  worldHead,
} from "./rig3.mjs";
import { MECHANISM_TASK, PLAN_TASK, UPDATE_MESSAGE } from "./task_text.mjs";

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/u, "").split("=");
    return [key, rest.join("=")];
  }),
);
const DIR = String(args.get("run") ?? "");
const MODE = String(args.get("mode") ?? "scored");
const VARIANT = String(args.get("variant") ?? "delegation");
if (DIR === "") throw new Error("--run=<dir> is required");
if (!["scored", "mechanism"].includes(MODE)) throw new Error("--mode=scored|mechanism is required");
if (!["delegation", "no-delegation"].includes(VARIANT)) throw new Error("--variant=delegation|no-delegation is required");

const HOME = join(DIR, "home");
const WORK = join(DIR, "work");
const UNIT = "cog3-programme";
const SESSION_FILE = join(DIR, "session.id");
const seed = readJson(join(DIR, "seed.json"));

if (VARIANT === "no-delegation") {
  // P-minus: the same shipped host, but the delivery seam and the reasoning bundle are absent, so
  // `palimpsest_delegate` is not composed at all. Rewrite the profile BEFORE the principal starts.
  writePalimpsestProfile(HOME, {
    unit: UNIT,
    stateDir: join(DIR, "state"),
    workDir: WORK,
    projectId: String(seed.projectId ?? "wrenfield"),
    activation: "none",
    reasoning: false,
  });
}
const planBefore = deliverableState(WORK, "deliverables/plan.md");
const probeBefore = deliverableState(WORK, "deliverables/probe.md");
const startedAt = new Date().toISOString();

const phaseOne = launchPrincipal({
  profileUnit: UNIT,
  homeDir: HOME,
  workDir: WORK,
  message: MODE === "mechanism" ? MECHANISM_TASK : PLAN_TASK,
  logPath: join(DIR, "principal-one.log"),
  sessionFile: SESSION_FILE,
});

const record = {
  schema: "cog3-principal-run/v1",
  startedAt,
  mode: MODE,
  variant: VARIANT,
  runtime: RUNTIME,
  seed: { carrier: seed.carrier, worldHead: seed.worldHead, projectId: seed.projectId, journalCount: seed.readBack?.journalCount ?? null },
  initialHead: worldHead(WORK),
  planBefore: { present: planBefore.present, bytes: planBefore.bytes ?? 0, digest: planBefore.digest ?? null },
  probeBefore: { present: probeBefore.present, bytes: probeBefore.bytes ?? 0 },
  ready: null,
  launchTurn: null,
  updateCommittedAtHead: null,
  deliveries: [],
  deliveryTurns: [],
  stopped: null,
};

try {
  const ready = await phaseOne.waitFor((line) => line.startsWith("PALIMPSEST_HOST_READY "), {
    label: "PALIMPSEST_HOST_READY",
    timeoutMs: 180_000,
  });
  record.ready = JSON.parse(ready.line.slice("PALIMPSEST_HOST_READY ".length));

  const launchTurn = await phaseOne.waitFor((line) => line.startsWith("PALIMPSEST_TURN "), {
    label: "the launch turn",
    timeoutMs: 720_000,
  });
  record.launchTurn = JSON.parse(launchTurn.line.slice("PALIMPSEST_TURN ".length));

  // Wait until every delegation the principal actually STARTED has reached a terminal delivery, and
  // the principal has produced a consuming turn. The count is read from the real session stream, not
  // guessed from elapsed time. If nothing was delegated, the run records that.
  const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
  const sessionId = String(record.ready.sessionId ?? "");
  const countStarts = () => {
    const telemetry = sessionTelemetry(HOME);
    const main = telemetry.sessions.find((entry) => entry.file.includes(sessionId));
    if (main === undefined) return 0;
    return main.toolCallDetails.filter(
      (call) =>
        call.name === "palimpsest_delegate" &&
        call.arguments !== null &&
        typeof call.arguments === "object" &&
        !("delegationRef" in call.arguments),
    ).length;
  };
  const deliveryLines = () => phaseOne.lines.filter((entry) => entry.line.startsWith("PALIMPSEST_DELEGATION "));
  let starts = 0;
  try {
    await sleep(2_000);
    starts = countStarts();
    const startDeadline = Date.now() + 90_000;
    while (starts === 0 && Date.now() < startDeadline && phaseOne.exited === null) {
      await sleep(3_000);
      starts = countStarts();
    }
    if (starts > 0) {
      const deliveryDeadline = Date.now() + 480_000;
      while (Date.now() < deliveryDeadline && phaseOne.exited === null) {
        const deliveredCount = deliveryLines().length;
        const currentStarts = countStarts();
        if (currentStarts > starts) starts = currentStarts;
        if (deliveredCount >= starts) break;
        await sleep(2_000);
      }
      // The last delivery queues a turn on the same agent. Wait for a turn AFTER the deliveries.
      const turnsBefore = phaseOne.lines.filter((entry) => entry.line.startsWith("PALIMPSEST_TURN ")).length;
      const turnDeadline = Date.now() + 240_000;
      while (Date.now() < turnDeadline && phaseOne.exited === null) {
        const turnsNow = phaseOne.lines.filter((entry) => entry.line.startsWith("PALIMPSEST_TURN ")).length;
        if (turnsNow > turnsBefore) break;
        await sleep(1_000);
      }
    } else {
      record.deliveryWait = { waited: true, error: "the principal started no delegation within the observation window" };
      await sleep(10_000);
    }
  } catch (error) {
    record.deliveryWait = { waited: true, error: error instanceof Error ? error.message : String(error) };
  }
  record.delegationsStarted = starts;

  // The project change is released AFTER the delegated finding was produced and consumed, so the
  // finding is genuinely computed against the earlier basis. Phase two then has to judge it.
  if (MODE === "scored") {
    applyUpdate(WORK);
    record.updateCommittedAtHead = worldHead(WORK);
  }

  record.deliveryTurns = phaseOne.lines
    .filter((entry) => entry.line.startsWith("PALIMPSEST_TURN "))
    .slice(1)
    .map((entry) => JSON.parse(entry.line.slice("PALIMPSEST_TURN ".length)));
  for (const entry of phaseOne.lines) {
    if (entry.line.startsWith("PALIMPSEST_DELEGATION ")) {
      const parsed = JSON.parse(entry.line.slice("PALIMPSEST_DELEGATION ".length));
      if (!record.deliveries.some((existing) => JSON.stringify(existing) === JSON.stringify(parsed))) {
        record.deliveries.push(parsed);
      }
    }
  }
} finally {
  record.stopped = await phaseOne.stop("phase one complete");
  record.planAfterRoundOne = (() => {
    const state = deliverableState(WORK, "deliverables/plan.md");
    return { present: state.present, bytes: state.bytes ?? 0, digest: state.digest ?? null, text: state.text ?? null };
  })();
  record.probeAfter = (() => {
    const state = deliverableState(WORK, "deliverables/probe.md");
    return { present: state.present, bytes: state.bytes ?? 0, digest: state.digest ?? null, text: state.text ?? null };
  })();
  record.telemetry = sessionTelemetry(HOME);
  record.timeline = phaseOne.lines;
  record.stdoutTail = phaseOne.stdout.slice(-20_000);
  record.stderrTail = phaseOne.stderr.slice(-20_000);
  writeJson(join(DIR, "run-one.json"), record);
}

if (MODE === "mechanism") {
  console.log(
    JSON.stringify({
      mode: MODE,
      ready: record.ready,
      toolCalls: record.telemetry.mainSession?.toolCalls ?? null,
      palimpsestCalls: record.telemetry.mainSession?.palimpsestCalls ?? null,
      deliveries: record.deliveries,
      deliveryTurns: record.deliveryTurns.length,
      sessions: record.telemetry.sessionCount,
      tokens: record.telemetry.totalUsage.totalTokens,
    }),
  );
  process.exit(0);
}

// Phase two: cold-resume the SAME durable principal with the project update.
const sessionId = String(readJson(join(DIR, "run-one.json")).ready?.sessionId ?? "");
if (sessionId === "") throw new Error("phase one did not report a principal session id");
const phaseTwo = launchPrincipal({
  profileUnit: UNIT,
  homeDir: HOME,
  workDir: WORK,
  message: UPDATE_MESSAGE,
  logPath: join(DIR, "principal-two.log"),
  resumeSessionId: sessionId,
});
const second = {
  schema: "cog3-principal-resume/v1",
  startedAt: new Date().toISOString(),
  resumedSessionId: sessionId,
  head: worldHead(WORK),
  ready: null,
  turns: [],
  stopped: null,
};
try {
  const ready = await phaseTwo.waitFor((line) => line.startsWith("PALIMPSEST_HOST_READY "), {
    label: "PALIMPSEST_HOST_READY (resume)",
    timeoutMs: 180_000,
  });
  second.ready = JSON.parse(ready.line.slice("PALIMPSEST_HOST_READY ".length));
  await phaseTwo.waitFor((line) => line.startsWith("PALIMPSEST_TURN "), { label: "the resume turn", timeoutMs: 720_000 });
  await new Promise((done) => setTimeout(done, 10_000));
} finally {
  second.stopped = await phaseTwo.stop("phase two complete");
  const planAfter = deliverableState(WORK, "deliverables/plan.md");
  second.planAfterRoundTwo = { present: planAfter.present, bytes: planAfter.bytes ?? 0, digest: planAfter.digest ?? null, text: planAfter.text ?? null };
  second.telemetry = sessionTelemetry(HOME);
  second.timeline = phaseTwo.lines;
  second.stdoutTail = phaseTwo.stdout.slice(-20_000);
  second.stderrTail = phaseTwo.stderr.slice(-20_000);
  writeJson(join(DIR, "run-two.json"), second);
}

console.log(
  JSON.stringify({
    mode: MODE,
    ready: record.ready,
    launchTurn: record.launchTurn?.toolCalls ?? null,
    deliveries: record.deliveries.map((entry) => ({ delivered: entry.delivered, text: String(entry.text ?? "").slice(0, 300) })),
    deliveryTurns: record.deliveryTurns.length,
    planOne: { present: record.planAfterRoundOne.present, bytes: record.planAfterRoundOne.bytes },
    planTwo: { present: second.planAfterRoundTwo.present, bytes: second.planAfterRoundTwo.bytes },
    sessions: second.telemetry.sessionCount,
    tokens: second.telemetry.totalUsage.totalTokens,
  }),
);
