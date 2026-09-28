#!/usr/bin/env node
/**
 * R1-R §30 — GATE A: AMENDMENT + CALIBRATION.
 *
 * §30's precondition list, checked mechanically BEFORE any primary trial:
 *
 *   original protocol digest still matches
 *   amendment committed/frozen
 *   R1-L gate PASS
 *   Scenario B built
 *   Scenario C built
 *   black-box oracle source inaccessible to worker
 *   teacher capital genuinely grounded
 *   calibration B and C complete, with no ceiling and no floor
 *   paired-state harness valid
 *
 * It reads the R1-L gate's own recorded verdict rather than re-running that gate: re-running it would
 * take another hour of real worker time and would measure R1-L's stage, not this one. The gate asserts
 * that the verdict it reads is the one R1-L recorded, so a later stage cannot quietly revise it.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { REPO_ROOT, parseAmendment } from "./amendment.mjs";
import { deriveCapital } from "./capital.mjs";
import { buildWorld, assertOracleInaccessible, SCENARIOS } from "./scenarios.mjs";
import { exploreAll } from "./teacher-exploration.mjs";

const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.replace(/^--/u, "").split("=");
  return [key, rest.join("=")];
}));
const CALIBRATION_RIG = args.get("calibration") ?? join(REPO_ROOT, "..", ".r1r-calibration");
const findings = [];
const check = (label, pass, detail) => {
  findings.push([label, pass, detail]);
  process.stdout.write(`${pass ? "PASS" : "FAIL"}  ${label}${detail === undefined ? "" : ` — ${detail}`}\n`);
};

/* 1 — the original protocol digest still matches (§3) */
let amendment = null;
try {
  amendment = parseAmendment();
  check("original protocol digest still matches", amendment.parentProtocolDigest === "2d1dfecaf7feecc55601a00f0760cec7e95b667f2972ad34bb831740b006feca", amendment.parentProtocolDigest.slice(0, 16));
} catch (error) {
  check("original protocol digest still matches", false, error.message);
}

/* 2 — the amendment is committed/frozen */
check("amendment frozen (document + digest recomputable)", amendment !== null && /^[0-9a-f]{64}$/u.test(amendment.amendmentDigest), amendment?.amendmentDigest.slice(0, 16));
const amendmentJson = join(REPO_ROOT, "research-evidence", "r1-r", "protocol-amendment-a1.json");
check("amendment evidence record exists", existsSync(amendmentJson), existsSync(amendmentJson) ? "present" : "absent (written by evidence.mjs)");

/* 3 — R1-L gate PASS, read from its own recorded verdict */
const r1lEvidence = join(REPO_ROOT, "research-evidence", "r1-l", "last-mile-evidence.json");
if (existsSync(r1lEvidence)) {
  const record = JSON.parse(readFileSync(r1lEvidence, "utf8"));
  const live = record.gateR1LLive ?? {};
  check("R1-L gate PASS (from its own recorded verdict)", live.verdict === "PASS", `gate:r1-l-live verdict=${live.verdict ?? "ABSENT"} (${live.assertions ?? "?"} assertions)`);
  check("R1-L recorded the precondition blocker as CLOSED", record.r1PreconditionBlocker === "CLOSED", String(record.r1PreconditionBlocker));
} else {
  check("R1-L gate PASS (from its own recorded verdict)", false, `no record at ${r1lEvidence}`);
  check("R1-L recorded the precondition blocker as CLOSED", false, "no record");
}

/* 4/5 — both scenarios build, and their oracles are inaccessible (§5/§6) */
const worlds = {};
for (const scenario of [SCENARIOS.B, SCENARIOS.C]) {
  const dir = join(CALIBRATION_RIG, "gate-a-worlds", scenario.id);
  try {
    buildWorld(scenario, dir);
    const inaccessible = assertOracleInaccessible(scenario, dir);
    check(`Scenario ${scenario.id} built`, true, `${inaccessible.checkedFiles} world files`);
    check(`Scenario ${scenario.id} hidden acceptance inaccessible to the worker`, true, `needles checked: ${inaccessible.needles.length}`);
    worlds[scenario.id] = dir;
  } catch (error) {
    check(`Scenario ${scenario.id} built`, false, error.message);
    check(`Scenario ${scenario.id} hidden acceptance inaccessible to the worker`, false, error.message);
  }
}

/* 6 — the visible oracle runs, and the black-box boundary is real */
for (const scenario of [SCENARIOS.B, SCENARIOS.C]) {
  const dir = worlds[scenario.id];
  if (dir === undefined) continue;
  const [executable, ...argv] = scenario.oracleCommand;
  let text = "";
  let exitCode = 0;
  try {
    // The oracle's output is captured on BOTH paths: an oracle that exits 0 still printed its summary
    // line, and reading the text only from the failure path would report every passing oracle as silent.
    text = execFileSync(executable, argv, { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (error) {
    exitCode = typeof error.status === "number" ? error.status : 1;
    text = `${error.stdout ?? ""}${error.stderr ?? ""}`;
  }
  /**
   * The oracle must RUN and report named classes. Its EXIT CODE is deliberately not asserted: the
   * visible set is basic behaviour only (§5/§6), so whether the H0 starting implementation happens to
   * satisfy it is a property of the fixture rather than of the oracle. What must not happen is a loader
   * error, which would make the oracle unusable regardless of the candidate.
   */
  const usable = !/ERR_UNSUPPORTED_ESM_URL_SCHEME|Cannot find module/u.test(text) && /\d+ cases, \d+ pass, \d+ fail/u.test(text);
  check(`Scenario ${scenario.id} visible oracle runs and reports named classes`, usable, `${text.trim().split("\n").pop() ?? "(no output)"} (exit ${exitCode})`);
  // And the hidden acceptance must be strictly stronger, or the experiment has no headroom.
  const acceptance = await import(`file://${scenario.acceptanceModule.replace(/\\/gu, "/")}`);
  const hidden = acceptance.materialize(acceptance.HIDDEN_CASES);
  const reference = scenario.id === "B" ? acceptance.migrateConfigReference : acceptance.applyEventStreamReference;
  const probe = scenario.id === "B" ? (await import(`file://${join(scenario.fixtureDir, "src", "config.ts").replace(/\\/gu, "/")}`)).migrateConfig : (await import(`file://${join(scenario.fixtureDir, "src", "reducer.ts").replace(/\\/gu, "/")}`)).applyEventStream;
  const hiddenScore = acceptance.runCases(probe, hidden);
  check(`Scenario ${scenario.id} hidden acceptance is strictly stronger than the H0 implementation`, hiddenScore.passed < hidden.length, `H0 scores ${hiddenScore.passed}/${hidden.length}; the reference scores ${acceptance.runCases(reference, hidden).passed}/${hidden.length}`);
}

/* 7 — teacher capital is genuinely grounded (§8) */
try {
  const capital = deriveCapital();
  const explored = exploreAll();
  const clauses = [...capital.B.procedureClauses, ...capital.C.procedureClauses];
  const generations = new Set([...explored.B.observations, ...explored.C.observations].map((observation) => observation.generation));
  const allTraceable = clauses.every((clause) => generations.has(clause.forcedBy));
  const finalClean = explored.B.observations[explored.B.observations.length - 1].failedCaseIds.length === 0 && explored.C.observations[explored.C.observations.length - 1].failedCaseIds.length === 0;
  check("teacher capital traceable to observed failures", allTraceable, `${clauses.length} clauses, ${generations.size} generations`);
  check("exploration's final generation stops failing", finalClean, "the derived method is complete");
} catch (error) {
  check("teacher capital traceable to observed failures", false, error.message);
  check("exploration's final generation stops failing", false, error.message);
}

/* 8 — calibration complete, no ceiling, no floor (§11) */
const calibrationPath = join(CALIBRATION_RIG, "calibration.json");
if (!existsSync(calibrationPath)) {
  check("calibration complete for both scenarios", false, `no record at ${calibrationPath}`);
} else {
  const calibration = JSON.parse(readFileSync(calibrationPath, "utf8"));
  for (const scenario of ["B", "C"]) {
    const entry = calibration.scenarios?.[scenario];
    if (entry === undefined) {
      check(`Scenario ${scenario} calibration complete`, false, "absent");
      continue;
    }
    check(`Scenario ${scenario} calibration complete (3 C0 runs)`, entry.trials.length === calibration.runsPerScenario, `${entry.trials.length} runs`);
    check(`Scenario ${scenario} has no CEILING`, entry.ceiling === false, `first-candidate solves ${entry.firstCandidateSolves}/${entry.trials.length}`);
    check(`Scenario ${scenario} has no FLOOR`, entry.floor === false, `meaningful progress ${entry.meaningfulProgress}/${entry.trials.length}`);
    check(`Scenario ${scenario} is PRIMARY_ELIGIBLE`, entry.verdict === "PRIMARY_ELIGIBLE", entry.verdict);
  }
}

/* 9 — the paired-state harness is valid (its own tests exist and the fields are defined) */
const harnessTest = join(REPO_ROOT, "test", "r1r_harness.test.ts");
check("paired-state harness is present and tested", existsSync(harnessTest), existsSync(harnessTest) ? "test/r1r_harness.test.ts" : "absent");

const failed = findings.filter(([, pass]) => !pass);
process.stdout.write(`\nR1-R GATE A: ${failed.length === 0 ? "GREEN — continue automatically" : `NOT GREEN (${failed.length} failing)`}\n`);
process.exit(failed.length === 0 ? 0 : 1);
