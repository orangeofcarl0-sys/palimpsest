#!/usr/bin/env node
/**
 * R1-R §11/§30 — THE CALIBRATION PHASE.
 *
 * §11 requires, for each candidate primary scenario, THREE fresh C0 stochastic workers using the exact
 * intended worker/model/profile, and rejects a scenario that sits at either extreme:
 *
 *   CEILING  all 3 C0 runs solve the full hidden contract on the FIRST submitted implementation,
 *            with no known-failure recurrence
 *   FLOOR    none of the 3 C0 runs makes meaningful progress within the normal task budget
 *
 * Calibration is NOT part of the primary result (§11): its trials are recorded separately and are never
 * counted among the 30. Its only job is to decide whether the fixtures are usable, BEFORE any primary
 * trial exists to be tuned against.
 *
 * "Meaningful progress" is defined here, before the runs, as: the run's final candidate passes at least
 * a strict majority of the hidden acceptance cases. That threshold is stated in advance so the floor
 * decision cannot be made after seeing which runs it would reject.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { REPO_ROOT } from "./amendment.mjs";

const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.replace(/^--/u, "").split("=");
  return [key, rest.join("=")];
}));
const RIG = args.get("rig") ?? join(REPO_ROOT, "..", ".r1r-calibration");
const RUNS = Number(args.get("runs") ?? "3");
const SCENARIOS_TO_RUN = (args.get("scenarios") ?? "B,C").split(",").map((value) => value.trim().toUpperCase()).filter((value) => value !== "");

/** §11: "meaningful progress" — pre-registered BEFORE the runs, as a majority of hidden cases. */
const MEANINGFUL_PROGRESS_FRACTION = 0.5;

const run = (trialArgs) => {
  const result = execFileSync(process.execPath, [join(REPO_ROOT, "scripts", "r1r", "trial.mjs"), ...trialArgs], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 64 * 1024 * 1024,
  });
  return result.trim().split("\n").pop() ?? "";
};

const out = (line) => process.stdout.write(`${line}\n`);

async function main() {
  rmSync(RIG, { recursive: true, force: true });
  mkdirSync(RIG, { recursive: true });
  const calibration = { schemaVersion: 1, stage: "R1-R", phase: "CALIBRATION", runsPerScenario: RUNS, meaningfulProgressFraction: MEANINGFUL_PROGRESS_FRACTION, scenarios: {} };

  for (const scenario of SCENARIOS_TO_RUN) {
    out(`\n=========== calibration: scenario ${scenario} ===========`);
    const trials = [];
    for (let index = 0; index < RUNS; index += 1) {
      const block = 900 + index;
      const rigDir = join(RIG, "runs");
      mkdirSync(rigDir, { recursive: true });
      const line = run([`--scenario=${scenario}`, "--condition=C0", `--block=${block}`, "--repetition=0", `--rig=${rigDir}`]);
      const trialId = `${scenario}-C0-b${block}r0`;
      const recordPath = join(rigDir, trialId, "out", "trial.json");
      const record = existsSync(recordPath) ? JSON.parse(readFileSync(recordPath, "utf8")) : null;
      if (record === null) throw new Error(`calibration trial ${trialId} produced no record: ${line}`);
      trials.push(record);
      out(`  ${trialId}  final=${record.finalAcceptance.passed}/${record.finalAcceptance.total}  first=${record.firstCandidateAcceptance.passed}/${record.firstCandidateAcceptance.total}  knownFailure(first)=${record.knownFailureFirst.recurred}  oracleRuns=${record.visibleOracleInvocations}`);
    }

    const firstPassAll = trials.filter((trial) => trial.firstCandidateAcceptance.total > 0 && trial.firstCandidateAcceptance.passed === trial.firstCandidateAcceptance.total && trial.knownFailureFirst.recurred === false);
    const meaningful = trials.filter((trial) => trial.finalAcceptance.total > 0 && trial.finalAcceptance.passed / trial.finalAcceptance.total > MEANINGFUL_PROGRESS_FRACTION);
    const ceiling = firstPassAll.length === trials.length;
    const floor = meaningful.length === 0;
    calibration.scenarios[scenario] = {
      trials: trials.map((trial) => ({
        trialId: trial.trialId,
        finalAcceptance: trial.finalAcceptance,
        firstCandidateAcceptance: trial.firstCandidateAcceptance,
        knownFailureFirstRecurred: trial.knownFailureFirst.recurred,
        knownFailureFinalRecurred: trial.knownFailureFinal.recurred,
        visibleOracleInvocations: trial.visibleOracleInvocations,
        implementationRevisions: trial.implementationRevisions,
        elapsedMs: trial.elapsedMs,
        hostFailure: trial.hostFailure,
      })),
      firstCandidateSolves: firstPassAll.length,
      meaningfulProgress: meaningful.length,
      ceiling,
      floor,
      verdict: ceiling ? "REJECT_CEILING" : floor ? "REJECT_FLOOR" : "PRIMARY_ELIGIBLE",
    };
    out(`  => first-candidate solves ${firstPassAll.length}/${trials.length} · meaningful ${meaningful.length}/${trials.length} · verdict ${calibration.scenarios[scenario].verdict}`);
  }

  const allEligible = SCENARIOS_TO_RUN.every((scenario) => calibration.scenarios[scenario].verdict === "PRIMARY_ELIGIBLE");
  calibration.allEligible = allEligible;
  writeFileSync(join(RIG, "calibration.json"), JSON.stringify(calibration, null, 2), "utf8");
  out(`\nCALIBRATION ${allEligible ? "GREEN — both scenarios PRIMARY_ELIGIBLE" : "NOT GREEN"}`);
  out(`record: ${join(RIG, "calibration.json")}`);
  process.exit(0);
}

await main();
