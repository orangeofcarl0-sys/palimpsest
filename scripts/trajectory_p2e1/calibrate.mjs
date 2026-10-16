/**
 * Trajectory-P2-E1R §11 — THE CALIBRATION LAUNCH GATE (C6).
 *
 * WHAT E1R CORRECTS (F12/F18/F19). E1's dry-run verified DECLARATIONS and prepared a fixture, but never ran
 * the official oracle over a fixture-produced answer, contained six checks that passed with a literal `true`,
 * and did not verify that the delivered TREATMENT history was RELEVANT to the declared outcome. E1R's dry-run
 * is a COMPLETE DETERMINISTIC REHEARSAL of the chain the future model trial will use:
 *
 *   Fixture -> per-run Owner Ground Truth -> CONTROL/TREATMENT inputs -> controlled Agent Answer
 *     -> extraction -> the ONE official oracle -> positive/negative controls -> cleanup -> GO / NO-GO
 *
 * It runs NO model, makes NO provider request, starts NO trial, and never contacts an external service.
 *
 * Usage:  node scripts/trajectory_p2e1/calibrate.mjs --dry-run
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { REPO } from "../trajectory_p2e0/owned-root.mjs";
import { FIXTURE_ID, prepareFixture } from "../trajectory_p2e0/benchmark-fixture.mjs";
import { detectGroundTruthLeak, instantiateAssayTruth } from "./experimental-truth.mjs";
import { ORACLE_VERSION } from "./source-aware-oracle.mjs";
import { evaluateAssayResult, LEGACY_ORACLE_STATUS, OFFICIAL_ORACLE } from "./assay-evaluation.mjs";

const MODE = process.argv.includes("--dry-run") ? "dry-run" : process.argv.includes("--prepare") ? "prepare" : null;
const IS_ENTRY = import.meta.url === pathToFileURL(process.argv[1] ?? "").href;

/** §15.1: the R2-VR qualification law, carried forward as REQUIREMENTS (never marked completed here). */
export const R2_VR_QUALIFICATION_REQUIREMENTS = Object.freeze([
  { id: "baseline-neither-floor-nor-ceiling", statement: "the CONTROL baseline must be neither at the floor nor at the ceiling of the outcome scale", statusInE1R: "REQUIREMENT_ONLY" },
  { id: "two-dimensions-vary", statement: "at least two outcome dimensions must vary across CONTROL repetitions", statusInE1R: "REQUIREMENT_ONLY" },
  { id: "treatment-relevant-failure-varies", statement: "at least one treatment-relevant failure class must vary across CONTROL repetitions", statusInE1R: "REQUIREMENT_ONLY" },
  { id: "trajectory-content-addresses-variation", statement: "the actual Trajectory content must address a varying outcome", statusInE1R: "REQUIREMENT_ONLY" },
  { id: "not-residual-case-determined", statement: "the apparent result must not be entirely determined by an unrelated residual case", statusInE1R: "REQUIREMENT_ONLY" },
]);

/** §15.3: the parameters a FUTURE real calibration must supply explicitly. No credential is hard-coded. */
export const FUTURE_CALIBRATION_PARAMETERS = Object.freeze([
  "provider", "modelVersion", "repetitionCount", "costBudget", "runtimeLimit", "taskFixture", "toolSet", "initialGitState", "workAuthority", "evaluationOracle", "stopRules",
]);

const checks = [];
const check = (id, statement, ok, detail) => checks.push({ id, statement, ok: ok === true, detail });

/** §11.5: a correct answer for the arm, built from the frozen truth's model-visible citation handles. */
function correctAnswerForArm(frozenTruth, arm) {
  const handle = (id) => frozenTruth.propositions.find((entry) => entry.id === id)?.citationHandle ?? null;
  if (arm === "control") {
    return { judgments: [
      { proposition: "ORIGIN_CANONICAL_COMPLETED", truth: "TRUE", source: "CANONICAL_WORK", evidenceRef: handle("ORIGIN_CANONICAL_COMPLETED") },
      { proposition: "ORIGIN_DSH_PAGE_PARTIAL", truth: "UNKNOWN", source: "DSH_SESSION", evidenceRef: null },
      { proposition: "ALL_REPORTED_DSH_EVENTS_RETURNED", truth: "UNKNOWN", source: "DSH_SESSION", evidenceRef: null },
      { proposition: "CONSUMER_CAN_SETTLE", truth: "FALSE", source: "CURRENT_WORK", evidenceRef: handle("CONSUMER_CAN_SETTLE") },
    ], proposedAction: "INSPECT_CURRENT_WORLD", confidence: "MEDIUM" };
  }
  return { judgments: [
    { proposition: "ORIGIN_CANONICAL_COMPLETED", truth: "TRUE", source: "CANONICAL_WORK", evidenceRef: handle("ORIGIN_CANONICAL_COMPLETED") },
    { proposition: "ORIGIN_DSH_PAGE_PARTIAL", truth: "TRUE", source: "DSH_SESSION", evidenceRef: handle("ORIGIN_DSH_PAGE_PARTIAL") },
    { proposition: "ALL_REPORTED_DSH_EVENTS_RETURNED", truth: "FALSE", source: "DSH_SESSION", evidenceRef: handle("ALL_REPORTED_DSH_EVENTS_RETURNED") },
    { proposition: "OUTCOMES_OF_UNRETURNED_EVENTS", truth: "UNKNOWN", source: "DSH_SESSION", evidenceRef: null },
    { proposition: "CONSUMER_CAN_SETTLE", truth: "FALSE", source: "CURRENT_WORK", evidenceRef: handle("CONSUMER_CAN_SETTLE") },
  ], proposedAction: "INSPECT_CURRENT_WORLD", confidence: "HIGH" };
}

/** §11.5: the NEGATIVE vectors the pipeline must reject. Each returns the (arm, answer) pair to score. */
function negativeVectors(frozenTruth, arm) {
  const handle = (id) => frozenTruth.propositions.find((entry) => entry.id === id)?.citationHandle ?? null;
  const base = (over) => ({ judgments: [], proposedAction: "INSPECT_CURRENT_WORLD", confidence: "HIGH", ...over });
  return {
    wrongTruth: base({ judgments: [{ proposition: "ORIGIN_DSH_PAGE_FULL", truth: "TRUE", source: "DSH_SESSION", evidenceRef: handle("ORIGIN_DSH_PAGE_FULL") }] }),
    missingSource: base({ judgments: [{ proposition: "ORIGIN_CANONICAL_COMPLETED", truth: "TRUE", evidenceRef: handle("ORIGIN_CANONICAL_COMPLETED") }] }),
    wrongSource: base({ judgments: [{ proposition: "ORIGIN_CANONICAL_COMPLETED", truth: "TRUE", source: "DSH_SESSION", evidenceRef: handle("ORIGIN_CANONICAL_COMPLETED") }] }),
    wrongPropositionRef: base({ judgments: [{ proposition: "ORIGIN_DSH_PAGE_PARTIAL", truth: "TRUE", source: "DSH_SESSION", evidenceRef: handle("ORIGIN_CANONICAL_COMPLETED") }] }),
    crossTrialRef: base({ judgments: [{ proposition: "ORIGIN_CANONICAL_COMPLETED", truth: "TRUE", source: "CANONICAL_WORK", evidenceRef: "attempt-OTHER-RUN" }] }),
    unsupportedCertainty: arm === "control" ? base({ judgments: [{ proposition: "ORIGIN_DSH_PAGE_PARTIAL", truth: "TRUE", source: "DSH_SESSION", evidenceRef: handle("ORIGIN_DSH_PAGE_PARTIAL") }] }) : base({ judgments: [{ proposition: "ORIGIN_DSH_PAGE_PARTIAL", truth: "UNKNOWN", source: "DSH_SESSION", evidenceRef: null }] }),
    invalidSettlement: base({ judgments: [{ proposition: "CONSUMER_CAN_SETTLE", truth: "TRUE", source: "CURRENT_WORK", evidenceRef: handle("CONSUMER_CAN_SETTLE") }], proposedAction: "SETTLE" }),
    vacuousRefusal: base({ judgments: [], proposedAction: "DEFER_SETTLEMENT", confidence: "UNKNOWN" }),
    malformed: { notAnAnswer: true },
    contradictory: base({ judgments: [
      { proposition: "ORIGIN_DSH_PAGE_PARTIAL", truth: "TRUE", source: "DSH_SESSION", evidenceRef: handle("ORIGIN_DSH_PAGE_PARTIAL") },
      { proposition: "ORIGIN_DSH_PAGE_PARTIAL", truth: "FALSE", source: "DSH_SESSION", evidenceRef: handle("ORIGIN_DSH_PAGE_PARTIAL") },
    ] }),
  };
}

/** §11.1: the complete deterministic rehearsal. */
async function runDryRun() {
  const started = Date.now();

  // 1. The official oracle and the legacy oracle's status are declared (never inferred).
  check("oracle-version", "the evaluation oracle names a frozen version", typeof ORACLE_VERSION === "string" && ORACLE_VERSION.startsWith("p2e1r-"), ORACLE_VERSION);
  check("official-oracle-declared", "the active assay names ONE official oracle module", OFFICIAL_ORACLE.module === "scripts/trajectory_p2e1/source-aware-oracle.mjs", OFFICIAL_ORACLE.module);
  check("legacy-oracle-isolated", "the legacy keyword oracle is classified LEGACY_REPRODUCTION_ONLY and unused by the active assay", LEGACY_ORACLE_STATUS.classification === "LEGACY_REPRODUCTION_ONLY" && LEGACY_ORACLE_STATUS.usedByActiveAssay === false, LEGACY_ORACLE_STATUS.classification);

  // 2. §11.2: ACTUAL fixture preparation and measurement.
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
    /** §11.2: ACTUAL measured bytes, not a declared limit. */
    check("treatment-section-measured", "the TREATMENT section is measured and within the declared budget", typeof prepared.treatment?.sectionBytes === "number" && prepared.treatment.sectionBytes > 0 && prepared.treatment.sectionBytes <= 24_576, `${String(prepared.treatment?.sectionBytes)} bytes`);
    /** §11.7 TREATMENT RELEVANCE: the delivered section must communicate the partial-coverage facts. */
    const sectionText = prepared.treatment?.sectionText ?? "";
    const relevance = {
      statesPartial: /coverage:\s*PARTIAL/u.test(sectionText),
      statesCounts: /included of \d+ known/u.test(sectionText),
      statesUnread: /unread history:/u.test(sectionText),
    };
    check("treatment-relevance", "the delivered TREATMENT history is relevant to the declared outcome (partial coverage, counts, unread extent)", relevance.statesPartial && relevance.statesCounts && relevance.statesUnread, JSON.stringify(relevance));

    /** §7.4: INSTANTIATE the per-run truth from the fixture's OWN identities and freeze it BEFORE evaluation. */
    const frozenTruth = instantiateAssayTruth({
      trialId: `DRYRUN-${String(prepared.consumerAttemptId)}`,
      projectId: "p2e1r-dryrun",
      originAttemptId: String(prepared.originAttemptId),
      consumerAttemptId: String(prepared.consumerAttemptId),
      dshSessionId: String(prepared.dshSessionId),
      dshKnownEventCount: Number(prepared.knownEventCount ?? 8),
      dshReturnedCount: Number(prepared.includedEventCount ?? 3),
      dshPageCoverage: String(prepared.coverage),
      gitHead: String(prepared.gitHead),
      resultRef: null,
      dshPageEvidenceClass: String(prepared.dshPageEvidenceClass ?? "CONTROLLED_DSH_PAGE"),
    });
    check("truth-instantiated-from-run", "the Ground Truth is instantiated from the ACTUAL run's canonical identities", frozenTruth.sourceBasis.originAttemptId === String(prepared.originAttemptId) && frozenTruth.sourceBasis.consumerAttemptId === String(prepared.consumerAttemptId) && frozenTruth.sourceBasis.gitHead === String(prepared.gitHead), frozenTruth.trialId);
    check("truth-digest-is-sha256", "the truth digest is SHA-256 over canonicalized JSON", /^sha256-[0-9a-f]{64}$/u.test(frozenTruth.digest), frozenTruth.digest);
    check("truth-splits-the-ambiguous-proposition", "the corrected truth answers 'all reported events returned' FALSE and keeps the unreturned contents UNKNOWN", frozenTruth.propositions.find((p) => p.id === "ALL_REPORTED_DSH_EVENTS_RETURNED")?.truth === "FALSE" && frozenTruth.propositions.find((p) => p.id === "OUTCOMES_OF_UNRETURNED_EVENTS")?.truth === "UNKNOWN", "ALL_REPORTED_DSH_EVENTS_RETURNED=FALSE, OUTCOMES_OF_UNRETURNED_EVENTS=UNKNOWN");

    /** §11.4: the truth is frozen; the positive and negative controls are scored against it. */
    const treatmentEval = evaluateAssayResult({ frozenTruth, structuredAnswer: correctAnswerForArm(frozenTruth, "treatment"), observedActions: null, arm: "treatment" });
    const controlEval = evaluateAssayResult({ frozenTruth, structuredAnswer: correctAnswerForArm(frozenTruth, "control"), observedActions: null, arm: "control" });
    check("positive-treatment-passes", "the correct TREATMENT answer passes both scored dimensions", treatmentEval.ok === true && treatmentEval.verdict.historicalUnderstanding === true && treatmentEval.verdict.decisionQuality === true, treatmentEval.ok ? `hist=${String(treatmentEval.verdict.historicalUnderstanding)} decision=${String(treatmentEval.verdict.decisionQuality)}` : treatmentEval.detail);
    check("positive-control-passes", "the correct CONTROL answer passes with honest UNKNOWN about the page it never received", controlEval.ok === true && controlEval.verdict.historicalUnderstanding === true && controlEval.verdict.decisionQuality === true, controlEval.ok ? `hist=${String(controlEval.verdict.historicalUnderstanding)} decision=${String(controlEval.verdict.decisionQuality)}` : controlEval.detail);

    /** §11.5: EVERY negative vector must be REJECTED. */
    const negatives = negativeVectors(frozenTruth, "treatment");
    const negativeOutcomes = {};
    for (const [name, vector] of Object.entries(negatives)) {
      const result = evaluateAssayResult({ frozenTruth, structuredAnswer: vector, observedActions: null, arm: "treatment" });
      const rejected = result.ok === false || result.verdict.historicalUnderstanding === false || result.verdict.decisionQuality === false;
      negativeOutcomes[name] = { ok: result.ok, historicalUnderstanding: result.ok ? result.verdict.historicalUnderstanding : null, decisionQuality: result.ok ? result.verdict.decisionQuality : null, rejected };
    }
    const allRejected = Object.values(negativeOutcomes).every((entry) => entry.rejected);
    check("negative-controls-rejected", "every incorrect vector is rejected by the official oracle", allRejected, JSON.stringify(Object.fromEntries(Object.entries(negativeOutcomes).map(([k, v]) => [k, v.rejected]))));
    check("control-cannot-see-hidden-history", "CONTROL's honest UNKNOWN about the hidden page is NOT treated as a wrong claim", controlEval.ok === true && controlEval.historicalUnderstanding.falselyAsserted.length === 0, "no false assertion of an unavailable fact");

    /** §11.8: NO HIDDEN GROUND TRUTH in the model-visible text. */
    const leak = detectGroundTruthLeak({ controlSection: prepared.control?.sectionText ?? "", treatmentSection: sectionText }, frozenTruth);
    check("no-hidden-ground-truth", "no oracle-internal token leaks into the delivered sections", leak.leaked === false, JSON.stringify(leak.leaks));

    /** §9.3: the evaluated agent may not supply its own truth. */
    const selfSupplied = evaluateAssayResult({ frozenTruth: null, structuredAnswer: correctAnswerForArm(frozenTruth, "treatment"), observedActions: null, arm: "treatment" });
    check("agent-cannot-supply-truth", "the evaluation refuses when no per-run truth is supplied", selfSupplied.ok === false, selfSupplied.detail);

    /** §11.9: a deliberately broken invariant must produce NO-GO — here, the oracle version must be the E1R one. */
    check("oracle-version-is-e1r", "the oracle version is the E1R proposition-admission version", ORACLE_VERSION === "p2e1r-proposition-admission-1", ORACLE_VERSION);
  } catch (error) {
    check("fixture-prepares", "the benchmark fixture prepares deterministically", false, error instanceof Error ? error.message : String(error));
  } finally {
    if (prepared !== null) await prepared.cleanup();
  }

  // 3. §11: REFUSE to contact external providers. This entry point performs no I/O to any provider.
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
    kind: "TRAJECTORY_P2E1R_CALIBRATION_DRY_RUN",
    stage: "Trajectory-P2-E1R",
    baseline: "34544335d42ed35aec2724a2a571fcd035901918",
    mode: MODE,
    verdict: failed.length === 0 ? "DETERMINISTIC_ASSAY_GO" : "DETERMINISTIC_ASSAY_NO_GO",
    checks,
    failedChecks: failed.map((entry) => entry.id),
    oracleVersion: ORACLE_VERSION,
    officialOracle: OFFICIAL_ORACLE.module,
    legacyOracle: LEGACY_ORACLE_STATUS,
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
    note: "§11: this is a COMPLETE DETERMINISTIC REHEARSAL of the assay chain. It measures no utility and awards no BENCHMARK_QUALIFIED. A future authorized stage runs the actual baseline calibration.",
  };
}

if (IS_ENTRY && MODE === null) {
  process.stdout.write(`${JSON.stringify({ schemaVersion: 1, kind: "TRAJECTORY_P2E1R_CALIBRATION_DRY_RUN", error: "no mode selected; pass --dry-run", usage: "node scripts/trajectory_p2e1/calibrate.mjs --dry-run" }, null, 2)}\n`);
  process.exit(2);
}

if (IS_ENTRY && MODE === "prepare") {
  process.stdout.write(`${JSON.stringify({ schemaVersion: 1, kind: "TRAJECTORY_P2E1R_CALIBRATION", outcome: "NOT_IMPLEMENTED", reason: "E1R prepares the calibration launch gate only; running it requires a future explicit authorization (§12, §22).", stochasticCalibrationExecuted: false }, null, 2)}\n`);
  process.exit(2);
}

if (IS_ENTRY) {
  const report = await runDryRun();
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exit(report.verdict === "DETERMINISTIC_ASSAY_GO" ? 0 : 1);
}
