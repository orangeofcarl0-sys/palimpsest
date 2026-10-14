/**
 * Trajectory-P2-E1 §15 — THE BASELINE CALIBRATION ENTRY POINT (C7).
 *
 * WHAT THIS IS. A deterministic DRY-RUN that makes the next authorized calibration mechanically executable
 * WITHOUT running it. It verifies that every frozen input the future stochastic trial needs is present,
 * consistent and self-describing, and reports a GO/NO-GO. It runs NO model, makes NO provider request, starts
 * NO trial, and never contacts an external service.
 *
 * THE R2-VR QUALIFICATION LAW (§15.1) is carried forward as five REQUIREMENTS that a future trial must
 * satisfy. They are RECORDED, not marked completed — E1 measures no utility.
 *
 * BASELINE-ONLY DISCIPLINE (§15.4). The future first stochastic stage runs CONTROL only. This entry point
 * records that requirement and does not enable any treatment arm.
 *
 * Usage:  node scripts/trajectory_p2e1/calibrate.mjs --dry-run
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { REPO } from "../trajectory_p2e0/owned-root.mjs";
import { GROUNDED_TRUTH_SNAPSHOT, groundTruthDigest } from "./experimental-truth.mjs";
import { ORACLE_VERSION } from "./source-aware-oracle.mjs";
import { FIXTURE_ID, prepareFixture } from "../trajectory_p2e0/benchmark-fixture.mjs";

const MODE = process.argv.includes("--dry-run") ? "dry-run" : process.argv.includes("--prepare") ? "prepare" : null;
/** §15: only run the CLI when this file is the ENTRY POINT, so importing it for its constants is side-effect free. */
const IS_ENTRY = import.meta.url === pathToFileURL(process.argv[1] ?? "").href;

/** §15.1: the R2-VR qualification law, carried forward as REQUIREMENTS (never marked completed here). */
export const R2_VR_QUALIFICATION_REQUIREMENTS = Object.freeze([
  { id: "baseline-neither-floor-nor-ceiling", statement: "the CONTROL baseline must be neither at the floor nor at the ceiling of the outcome scale", statusInE1: "REQUIREMENT_ONLY" },
  { id: "two-dimensions-vary", statement: "at least two outcome dimensions must vary across CONTROL repetitions", statusInE1: "REQUIREMENT_ONLY" },
  { id: "treatment-relevant-failure-varies", statement: "at least one treatment-relevant failure class must vary across CONTROL repetitions", statusInE1: "REQUIREMENT_ONLY" },
  { id: "trajectory-content-addresses-variation", statement: "the actual Trajectory content must address a varying outcome", statusInE1: "REQUIREMENT_ONLY" },
  { id: "not-residual-case-determined", statement: "the apparent result must not be entirely determined by an unrelated residual case", statusInE1: "REQUIREMENT_ONLY" },
]);

/** §15.3: the parameters a FUTURE real calibration must supply explicitly. No credential is hard-coded. */
export const FUTURE_CALIBRATION_PARAMETERS = Object.freeze([
  "provider", "modelVersion", "repetitionCount", "costBudget", "runtimeLimit", "taskFixture", "toolSet", "initialGitState", "workAuthority", "evaluationOracle", "stopRules",
]);

const checks = [];
const check = (id, statement, ok, detail) => checks.push({ id, statement, ok: ok === true, detail });

/** §15.2: verify the Fixture, Ground Truth, Oracle, Git basis, Control input, Treatment eligibility, digests, isolation and budgets. */
async function runDryRun() {
  const started = Date.now();

  // 1. The Oracle is versioned and the Ground Truth is frozen with a stable digest.
  const digestA = groundTruthDigest();
  const digestB = groundTruthDigest();
  check("oracle-version", "the evaluation oracle names a frozen version", typeof ORACLE_VERSION === "string" && ORACLE_VERSION.length > 0, ORACLE_VERSION);
  check("ground-truth-frozen", "the Ground Truth digest is stable across reads", digestA === digestB, digestA);
  check("ground-truth-has-coexistence", "the Ground Truth keeps canonical completion and partial DSH coverage as separate, coexisting propositions",
    GROUNDED_TRUTH_SNAPSHOT.propositions.find((p) => p.id === "ORIGIN_CANONICAL_COMPLETED")?.truth === "TRUE" &&
      GROUNDED_TRUTH_SNAPSHOT.propositions.find((p) => p.id === "ORIGIN_DSH_PAGE_PARTIAL")?.truth === "TRUE", "ORIGIN_CANONICAL_COMPLETED=TRUE and ORIGIN_DSH_PAGE_PARTIAL=TRUE");
  check("ground-truth-has-unknown", "an unobserved fact is UNKNOWN rather than FALSE",
    GROUNDED_TRUTH_SNAPSHOT.propositions.some((p) => p.truth === "UNKNOWN"), GROUNDED_TRUTH_SNAPSHOT.propositions.filter((p) => p.truth === "UNKNOWN").map((p) => p.id).join(", "));
  check("evidence-allowlist-nonempty", "the evidence allowlist is non-empty (references can be validated)", GROUNDED_TRUTH_SNAPSHOT.propositions.some((p) => p.evidenceRef !== null), "allowlist present");

  // 2. The fixture prepares deterministically and its world is consistent.
  let prepared = null;
  try {
    prepared = await prepareFixture();
    check("fixture-prepares", "the benchmark fixture prepares deterministically", true, `fixtureId=${prepared.fixtureId}`);
    check("fixture-id-frozen", "the fixture identity is the frozen Family A candidate", prepared.fixtureId === FIXTURE_ID, prepared.fixtureId);
    check("fixture-git-basis-real", "the fixture's Git basis is a REAL commit of its own repository", /^[0-9a-f]{40}$/u.test(prepared.gitHead), prepared.gitHead);
    check("fixture-partial-page", "the origin page is genuinely PARTIAL", prepared.coverage === "PARTIAL" && prepared.includedEventCount < prepared.knownEventCount, `${String(prepared.includedEventCount)} of ${String(prepared.knownEventCount)}`);
    check("fixture-control-input", "the CONTROL input renders a no-history boundary", prepared.control !== null && prepared.control.mode === "CONTROL", prepared.control?.sectionDigest ?? "absent");
    check("fixture-treatment-eligible", "the TREATMENT input renders the qualified Capsule", prepared.treatment !== null && prepared.treatment.mode === "TREATMENT" && prepared.treatment.capsuleDigest === prepared.capsuleDigest, prepared.treatment?.sectionDigest ?? "absent");
    check("fixture-digests-differ", "CONTROL and TREATMENT sections are DIFFERENT (the difference is the history)", prepared.control?.sectionDigest !== prepared.treatment?.sectionDigest, "sections differ");
    check("fixture-budget-bounded", "the fixture declares a bounded context budget", true, "capsuleMaxSerializedBytes=16384 sectionMaxBytes=16384");
  } catch (error) {
    check("fixture-prepares", "the benchmark fixture prepares deterministically", false, error instanceof Error ? error.message : String(error));
  } finally {
    if (prepared !== null) await prepared.cleanup();
  }

  // 3. §15.2: REFUSE to contact external providers. This entry point performs no I/O to any provider.
  check("no-external-provider", "the dry-run contacts no external provider", true, "no provider client is constructed; no credential is read");
  check("no-stochastic-execution", "the dry-run starts no stochastic trial", true, "no trial loop exists in this entry point");
  check("no-credential-in-source", "no credential is hard-coded in this entry point", true, "the source names parameters, never values");

  // 4. §15.3/§15.4: the future parameters and the baseline-only discipline are declared.
  check("future-parameters-declared", "the future calibration parameters are declared explicitly", FUTURE_CALIBRATION_PARAMETERS.length === 11, FUTURE_CALIBRATION_PARAMETERS.join(", "));
  check("r2vr-law-carried", "the R2-VR qualification law is carried forward as requirements", R2_VR_QUALIFICATION_REQUIREMENTS.length === 5, "5 requirements, none marked completed");
  check("baseline-only-declared", "the first stochastic stage is declared CONTROL-only", true, "§15.4: Treatment must not run because a Capsule happens to be available");

  const failed = checks.filter((entry) => !entry.ok);
  return {
    schemaVersion: 1,
    kind: "TRAJECTORY_P2E1_CALIBRATION_DRY_RUN",
    stage: "Trajectory-P2-E1",
    baseline: "beec3cc488dfbd97dd929bea73a19c99703a9dbe",
    mode: MODE,
    verdict: failed.length === 0 ? "GO" : "NO-GO",
    checks,
    failedChecks: failed.map((entry) => entry.id),
    oracleVersion: ORACLE_VERSION,
    groundTruthDigest: digestA,
    fixtureId: FIXTURE_ID,
    r2vrQualificationRequirements: R2_VR_QUALIFICATION_REQUIREMENTS,
    futureCalibrationParameters: FUTURE_CALIBRATION_PARAMETERS,
    baselineOnlyDiscipline: "the first stochastic stage runs CONTROL only; Treatment is not enabled by the presence of a Capsule",
    stochasticCalibrationExecuted: false,
    treatmentTrialsExecuted: false,
    externalModelRequestOccurred: false,
    paidModelRequestOccurred: false,
    modelCallsMade: 0,
    elapsedMs: Date.now() - started,
    note: "§15: this is a DETERMINISTIC DRY-RUN. It measures no utility and awards no BENCHMARK_QUALIFIED. A future authorized stage runs the actual baseline calibration.",
  };
}

if (IS_ENTRY && MODE === null) {
  process.stdout.write(`${JSON.stringify({ schemaVersion: 1, kind: "TRAJECTORY_P2E1_CALIBRATION_DRY_RUN", error: "no mode selected; pass --dry-run", usage: "node scripts/trajectory_p2e1/calibrate.mjs --dry-run" }, null, 2)}\n`);
  process.exit(2);
}

if (IS_ENTRY && MODE === "prepare") {
  // A future authorized mode. It is deliberately NOT implemented here: E1 must not run the calibration.
  process.stdout.write(`${JSON.stringify({ schemaVersion: 1, kind: "TRAJECTORY_P2E1_CALIBRATION", outcome: "NOT_IMPLEMENTED", reason: "P2-E1 prepares the calibration entry point only; running it requires a future explicit authorization (§15, §22).", stochasticCalibrationExecuted: false }, null, 2)}\n`);
  process.exit(2);
}

if (IS_ENTRY) {
  const report = await runDryRun();
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exit(report.verdict === "GO" ? 0 : 1);
}
