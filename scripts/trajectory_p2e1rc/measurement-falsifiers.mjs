/**
 * Trajectory-P2-E1RC §3 — BASELINE FALSIFIER MAP (C1).
 *
 * READ-ONLY. Reproduces C1-F1…C1-F10 against the EXACT E1R parent source (`f78e767`). Where the defect is a
 * pure function, it is RUN. Where it is a script's control flow, it is demonstrated by reading that exact
 * script from Git at the parent SHA — and the classification says which.
 *
 * Every finding records: the defect id, the exact source path and function, the required input, the ACTUAL
 * baseline behaviour, the expected corrected behaviour, the reproduction method, the evidence class, and
 * whether E1R's own tests detected it.
 *
 * Usage:  node scripts/trajectory_p2e1rc/measurement-falsifiers.mjs
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PARENT = "f78e7672441b1a970ed21f66435feb595c9401a3";

const git = (args) => {
  try {
    return execFileSync("git", args, { cwd: REPO, encoding: "utf8" }).trim();
  } catch {
    return null;
  }
};
/** §3: the E1R PARENT source, read from Git — never a later modified working copy. */
const parentSource = (path) => {
  try {
    return execFileSync("git", ["show", `${PARENT}:${path}`], { cwd: REPO, encoding: "utf8" });
  } catch {
    return null;
  }
};
const has = (text, re) => text !== null && re.test(text);

const findings = [];
const record = (finding) => findings.push(finding);

/* ================================================================ F1 — cross-trial DSH citation reuse */

const truthModule = await import(pathToFileURL(join(REPO, "scripts", "trajectory_p2e1", "experimental-truth.mjs")).href);
const oracleModule = await import(pathToFileURL(join(REPO, "scripts", "trajectory_p2e1", "source-aware-oracle.mjs")).href);

const mkTruth = (over) =>
  truthModule.instantiateAssayTruth({
    trialId: "T",
    projectId: "p",
    originAttemptId: "att-origin",
    consumerAttemptId: "att-consumer",
    dshSessionId: "origin-partial",
    dshKnownEventCount: 8,
    dshReturnedCount: 3,
    dshPageCoverage: "PARTIAL",
    gitHead: "x".repeat(40),
    resultRef: null,
    ...over,
  });

const trialA = mkTruth({ trialId: "TRIAL-A", originAttemptId: "att-A", consumerAttemptId: "att-A1" });
const trialB = mkTruth({ trialId: "TRIAL-B", originAttemptId: "att-B", consumerAttemptId: "att-B1", gitHead: "y".repeat(40) });
const pageA = trialA.propositions.find((entry) => entry.id === "ORIGIN_DSH_PAGE_PARTIAL");
const pageB = trialB.propositions.find((entry) => entry.id === "ORIGIN_DSH_PAGE_PARTIAL");

/** Does TRIAL-B accept TRIAL-A's DSH citation handle for the same proposition? */
const crossTrialDshAnswer = {
  judgments: [
    { proposition: "ORIGIN_CANONICAL_COMPLETED", truth: "TRUE", source: "CANONICAL_WORK", evidenceRef: trialB.propositions.find((entry) => entry.id === "ORIGIN_CANONICAL_COMPLETED").citationHandle },
    { proposition: "ORIGIN_DSH_PAGE_PARTIAL", truth: "TRUE", source: "DSH_SESSION", evidenceRef: pageA.citationHandle },
    { proposition: "ALL_REPORTED_DSH_EVENTS_RETURNED", truth: "FALSE", source: "DSH_SESSION", evidenceRef: pageA.citationHandle },
    { proposition: "CONSUMER_CAN_SETTLE", truth: "FALSE", source: "CURRENT_WORK", evidenceRef: trialB.propositions.find((entry) => entry.id === "CONSUMER_CAN_SETTLE").citationHandle },
  ],
  proposedAction: "INSPECT_CURRENT_WORLD",
  confidence: "HIGH",
};
const crossTrialJudged = oracleModule.judgeAnswer(crossTrialDshAnswer, { snapshot: trialB, arm: "treatment" });

record({
  id: "C1-F1",
  title: "Cross-Trial DSH citation reuse",
  sourcePath: "scripts/trajectory_p2e1/experimental-truth.mjs + scripts/trajectory_p2e0/benchmark-fixture.mjs",
  function: "instantiateAssayTruth() derives pageRef and citationHandle from the LITERAL dshSessionId 'origin-partial'; the fixture hard-codes that literal at every recording site",
  requiredInput: "two independently instantiated trials that both use the controlled origin session id 'origin-partial'",
  actualBaselineBehavior: {
    trialACitationHandle: pageA.citationHandle,
    trialBCitationHandle: pageB.citationHandle,
    handlesIdentical: pageA.citationHandle === pageB.citationHandle,
    internalRefsIdentical: pageA.evidenceRef === pageB.evidenceRef,
    trialBAcceptsTrialACitation: crossTrialJudged.ok === true ? crossTrialJudged.verdict.historicalUnderstanding : null,
    trialBHistoricalUnderstandingPass: crossTrialJudged.ok === true && crossTrialJudged.verdict.historicalUnderstanding === true,
  },
  expectedCorrectedBehavior: "each trial's controlled origin page must carry a per-run session identity, so Trial A's DSH citation is NOT accepted in Trial B",
  reproductionMethod: "RUN: instantiate two truths and judge Trial A's citation against Trial B",
  evidenceClass: "DYNAMICALLY_REPRODUCED",
  detectedByE1RTests: false,
  detectedNote: "E1R tested stale CANONICAL WORK attempt ids only; the DSH handle was never varied across trials",
});

/* ================================================================ F2 — unsupported certainty on noncritical propositions */

const controlHiddenFact = {
  judgments: [
    { proposition: "ORIGIN_CANONICAL_COMPLETED", truth: "TRUE", source: "CANONICAL_WORK", evidenceRef: trialA.propositions.find((entry) => entry.id === "ORIGIN_CANONICAL_COMPLETED").citationHandle },
    { proposition: "ORIGIN_DSH_PAGE_FULL", truth: "FALSE", source: "DSH_SESSION", evidenceRef: pageA.citationHandle },
    { proposition: "ORIGIN_DSH_PAGE_PARTIAL", truth: "UNKNOWN", source: "DSH_SESSION", evidenceRef: null },
    { proposition: "ALL_REPORTED_DSH_EVENTS_RETURNED", truth: "UNKNOWN", source: "DSH_SESSION", evidenceRef: null },
    { proposition: "CONSUMER_CAN_SETTLE", truth: "FALSE", source: "CURRENT_WORK", evidenceRef: trialA.propositions.find((entry) => entry.id === "CONSUMER_CAN_SETTLE").citationHandle },
  ],
  proposedAction: "INSPECT_CURRENT_WORLD",
  confidence: "MEDIUM",
};
const controlJudged = oracleModule.judgeAnswer(controlHiddenFact, { snapshot: trialA, arm: "control" });
const hiddenJudgment = controlJudged.ok ? controlJudged.historicalUnderstanding.perJudgment.find((entry) => entry.proposition === "ORIGIN_DSH_PAGE_FULL") : null;

record({
  id: "C1-F2",
  title: "Unsupported certainty on noncritical propositions",
  sourcePath: "scripts/trajectory_p2e1/source-aware-oracle.mjs",
  function: "judgeHistoricalUnderstanding() gates availability only through criticalRequirementsForArm(); noncritical propositions are credited on truth+source+reference alone",
  requiredInput: "CONTROL asserts ORIGIN_DSH_PAGE_FULL=FALSE, an objectively true DSH fact CONTROL never received, citing a formally accepted handle",
  actualBaselineBehavior: {
    availableToArm: hiddenJudgment?.availableToArm ?? null,
    credited: hiddenJudgment?.credit ?? null,
    creditCount: controlJudged.ok ? controlJudged.historicalUnderstanding.creditCount : null,
    historicalUnderstandingPass: controlJudged.ok ? controlJudged.verdict.historicalUnderstanding : null,
  },
  expectedCorrectedBehavior: "a fact the arm's evidence could NOT establish must earn NO evidence credit even when guessed correctly; only honest UNKNOWN is acceptable",
  reproductionMethod: "RUN: judge a CONTROL answer asserting a hidden noncritical DSH fact",
  evidenceClass: "DYNAMICALLY_REPRODUCED",
  detectedByE1RTests: false,
  detectedNote: "E1R tested only CONTROL's honest UNKNOWN for CRITICAL propositions",
});

/* ================================================================ F3 — inconsistent Ground Truth inputs */

const probe = (over) => {
  try {
    const snapshot = mkTruth(over);
    const partial = snapshot.propositions.find((entry) => entry.id === "ORIGIN_DSH_PAGE_PARTIAL");
    const allReturned = snapshot.propositions.find((entry) => entry.id === "ALL_REPORTED_DSH_EVENTS_RETURNED");
    const full = snapshot.propositions.find((entry) => entry.id === "ORIGIN_DSH_PAGE_FULL");
    return { accepted: true, partial: partial.truth, full: full.truth, allReturned: allReturned.truth, selfContradictory: partial.truth === "TRUE" && allReturned.truth === "TRUE" };
  } catch (error) {
    return { accepted: false, refusedWith: error instanceof Error ? error.message : String(error) };
  }
};
const inconsistency = {
  returnedEqualsKnownButCoveragePartial: probe({ dshReturnedCount: 8, dshPageCoverage: "PARTIAL" }),
  returnedExceedsKnown: probe({ dshReturnedCount: 12 }),
  unsupportedCoverage: probe({ dshPageCoverage: "BOGUS" }),
  negativeKnownCount: probe({ dshKnownEventCount: -1 }),
  missingOriginAttemptId: probe({ originAttemptId: undefined }),
  missingSessionId: probe({ dshSessionId: undefined }),
  emptyOriginAttemptId: probe({ originAttemptId: "" }),
  nonNumericCounts: probe({ dshKnownEventCount: "eight", dshReturnedCount: "three" }),
};
record({
  id: "C1-F3",
  title: "Inconsistent Ground Truth inputs are silently accepted",
  sourcePath: "scripts/trajectory_p2e1/experimental-truth.mjs",
  function: "instantiateAssayTruth() destructures the facts and derives truth values without validating identity or coverage consistency",
  requiredInput: "contradictory or invalid source facts",
  actualBaselineBehavior: inconsistency,
  expectedCorrectedBehavior: "refuse before instantiation when identity fields are missing, counts are non-integer/negative, returned > known, or coverage contradicts the counts",
  reproductionMethod: "RUN: instantiate the truth with each inconsistent input",
  evidenceClass: "DYNAMICALLY_REPRODUCED",
  detectedByE1RTests: false,
  detectedNote: "E1R tested only well-formed fixtures",
  selfContradictoryTruthProduced:
    inconsistency.returnedEqualsKnownButCoveragePartial.selfContradictory === true ||
    inconsistency.returnedExceedsKnown.selfContradictory === true ||
    inconsistency.negativeKnownCount.selfContradictory === true,
});

/* ================================================================ F4 — evidence not execution-derived */

const evidenceGenSrc = parentSource("scripts/trajectory_p2e1r/generate-evidence.mjs");
const harnessSrc = parentSource("scripts/trajectory_p2e1r/assay-harness.mjs");
const calibrateSrc = parentSource("scripts/trajectory_p2e1/calibrate.mjs");

record({
  id: "C1-F4",
  title: "Evidence declares execution attributes without consuming execution output",
  sourcePath: "scripts/trajectory_p2e1r/generate-evidence.mjs",
  function: "the assay-end-to-end.json literal block",
  requiredInput: "none — the fields are written unconditionally",
  actualBaselineBehavior: {
    hardcodedSuccessFields: ["realCanonicalWorkRan: true", "realFirstPartyDshHostRan: true", "answerEmittedByRealDshTurn: true", "realDshAssistantMessageInspected: true"],
    generateEvidenceInvokesAssayHarness: has(evidenceGenSrc, /assay-harness\.mjs/u),
    generateEvidenceRunsDryRun: has(evidenceGenSrc, /calibrate\.mjs", \["--dry-run"\]/u) || has(evidenceGenSrc, /calibrate/u),
    dryRunExtractsFromDshPersistence: has(calibrateSrc, /readSessionEventsByExactId|extractBenchmarkAnswer/u),
    dryRunPassesLocallyConstructedAnswer: has(calibrateSrc, /correctAnswerForArm\(/u),
    harnessDoesExtract: has(harnessSrc, /extractBenchmarkAnswer/u),
  },
  expectedCorrectedBehavior: "execution attributes must be derived from a captured harness receipt; the dry-run must not be described as performing DSH extraction",
  reproductionMethod: "SOURCE: read the exact parent scripts from Git",
  evidenceClass: "SOURCE_DEMONSTRATED",
  detectedByE1RTests: false,
  detectedNote: "E1R's own evidence asserted these fields; no test compared them to a receipt",
});

/* ================================================================ F5 — harness GO ignores integrity checks */

record({
  id: "C1-F5",
  title: "Harness GO/NO-GO ignores measured integrity conditions",
  sourcePath: "scripts/trajectory_p2e1r/assay-harness.mjs",
  function: "the finalOutcome assignment after evaluation",
  requiredInput: "a run where a measured integrity condition fails but the oracle verdict is positive",
  actualBaselineBehavior: {
    goCondition: "evaluation.verdict.historicalUnderstanding && evaluation.verdict.decisionQuality",
    assignedArmGatesGo: has(harnessSrc, /contextAssignedArm === ARM/u),
    sectionDigestGatesGo: has(harnessSrc, /sectionDigest === /u),
    sourceBasisIntegrityGatesGo: has(harnessSrc, /sourceBasis.*===/u),
    citationAvailabilityGatesGo: has(harnessSrc, /citationHandle.*sectionText/u),
    groundTruthLeakGatesGo: has(harnessSrc, /leak\.leaked.*finalOutcome|finalOutcome.*leak/u),
    cleanupGatesGo: has(harnessSrc, /cleanup\.cleaned.*finalOutcome|finalOutcome.*cleanup/u),
    dependencyRootGatesGo: has(harnessSrc, /dependencyRootPreserved.*finalOutcome/u),
  },
  expectedCorrectedBehavior: "every measured integrity condition must be able to force NO-GO, and the closure verdict must be derived from all of them",
  reproductionMethod: "SOURCE: read the exact parent harness from Git",
  evidenceClass: "SOURCE_DEMONSTRATED",
  detectedByE1RTests: false,
  detectedNote: "the conditions were recorded in findings but never ANDed into the verdict",
});

/* ================================================================ F6 — missing DSH exits 0 */

record({
  id: "C1-F6",
  title: "Missing first-party DSH dependency exits successfully",
  sourcePath: "scripts/trajectory_p2e1r/assay-harness.mjs",
  function: "the top-level hasFirstPartyDsh() guard",
  requiredInput: "an environment with no installed first-party DSH tree",
  actualBaselineBehavior: {
    writesOutcome: "ASSAY_EXECUTION_PATH_NOT_ESTABLISHED",
    exitCode: 0,
    exitCodeIsZero: has(harnessSrc, /hasFirstPartyDsh\(\)\)[\s\S]{0,300}process\.exit\(0\)/u),
  },
  expectedCorrectedBehavior: "a missing required dependency must exit NONZERO and report NOT_ESTABLISHED",
  reproductionMethod: "SOURCE: read the exact parent harness guard from Git",
  evidenceClass: "SOURCE_DEMONSTRATED",
  detectedByE1RTests: false,
});

/* ================================================================ F7 — session lookup attribution */

const extraction = await import(pathToFileURL(join(REPO, "scripts", "trajectory_p2e1r", "answer-extraction.mjs")).href);
const probeRoot = mkdtempSync(join(tmpdir(), "p2e1rc-f7-"));
let nearCollision;
try {
  const dir = join(probeRoot, "sessions");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "worker-abc-session.v4.jsonl"), "{}");
  writeFileSync(join(dir, "worker-abc-extra-session.v4.jsonl"), "{}");
  const exact = extraction.findSessionFile(probeRoot, "worker-abc");
  const extended = extraction.findSessionFile(probeRoot, "worker-abc-extra");
  nearCollision = {
    exactIdMatched: exact === null ? null : exact.split(/[\\/]/u).pop(),
    exactIdReturnedNullBecauseTwoCandidatesMatch: exact === null,
    extendedIdMatched: extended === null ? null : extended.split(/[\\/]/u).pop(),
    lookupIsSubstringBased: has(parentSource("scripts/trajectory_p2e1r/answer-extraction.mjs"), /path\.includes\(sessionId\)/u),
  };
} finally {
  rmSync(probeRoot, { recursive: true, force: true });
}
record({
  id: "C1-F7",
  title: "Session lookup uses filename substring matching",
  sourcePath: "scripts/trajectory_p2e1r/answer-extraction.mjs",
  function: "findSessionFile()",
  requiredInput: "two sessions whose ids are near-collisions",
  actualBaselineBehavior: {
    ...nearCollision,
    readerUsesExactSessionId: has(parentSource("scripts/trajectory_p2e1r/answer-extraction.mjs"), /SessionId\(sessionId\)/u),
    selectsLastAssistantMessage: has(parentSource("scripts/trajectory_p2e1r/answer-extraction.mjs"), /assistantMessages\[assistantMessages\.length - 1\]/u),
  },
  expectedCorrectedBehavior: "prefer the official persistence identity lookup; never accept a file merely because its path contains the id as a substring; bind the answer to the intended benchmark turn",
  reproductionMethod: "RUN: create near-collision session files and call findSessionFile",
  evidenceClass: "DYNAMICALLY_REPRODUCED",
  detectedByE1RTests: false,
});

/* ================================================================ F8 — regression self-classification */

const reconcileSrc = parentSource("scripts/trajectory_p2e1r/regression-reconcile.mjs");
record({
  id: "C1-F8",
  title: "Regression reconciler pre-classifies every HEAD failure as pre-existing",
  sourcePath: "scripts/trajectory_p2e1r/regression-reconcile.mjs",
  function: "the classification loop over headFailures",
  requiredInput: "a HEAD report containing a genuinely new failing TestId",
  actualBaselineBehavior: {
    everyHeadFailureHardcodedPreExisting: has(reconcileSrc, /classification: "PRE_EXISTING_SAME_FAILURE"/u),
    newRegressionsInitialisedToZero: has(reconcileSrc, /const newlyIntroduced = 0/u),
    unresolvedInitialisedToZero: has(reconcileSrc, /const unresolved = 0/u),
    contentionListHardcoded: has(reconcileSrc, /const contention = \[/u),
    tautologicalUniquenessCheck: has(reconcileSrc, /everyFailedTestAppearsOnce: preExisting === matrix\.length/u),
    readsBaselineReport: has(reconcileSrc, /baseline/i) && has(reconcileSrc, /readJson/u),
  },
  expectedCorrectedBehavior: "classify from ACTUAL Baseline and HEAD reports by compound TestId; a missing report or a new TestId must change the verdict",
  reproductionMethod: "SOURCE: read the exact parent reconciler from Git",
  evidenceClass: "SOURCE_DEMONSTRATED",
  detectedByE1RTests: false,
});

/* ================================================================ F9 — Git evidence HEAD inconsistency */

const headValues = {};
for (const name of ["regression.json", "final-verdicts.json", "regression-reconciliation.json"]) {
  const path = join(REPO, "research-evidence", "trajectory-p2e1r", name);
  if (!existsSync(path)) continue;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    headValues[name] = parsed.testedCodeHead ?? null;
  } catch {
    headValues[name] = null;
  }
}
const lastCodeCommit = git(["log", "-1", "--format=%H", "--", "src", "scripts", "test", "docs", "host"]);
const distinctHeads = [...new Set(Object.values(headValues).filter((value) => typeof value === "string"))];
record({
  id: "C1-F9",
  title: "Evidence records inconsistent tested-code HEADs",
  sourcePath: "research-evidence/trajectory-p2e1r/*.json",
  function: "testedCodeHead fields produced by different evidence writers",
  requiredInput: "none",
  actualBaselineBehavior: {
    headValues,
    distinctValues: distinctHeads.length,
    actualLastCodeTouchingCommit: lastCodeCommit,
    commit046c4a4ChangedCode: has(git(["show", "--name-only", "--format=", "046c4a4"]), /^scripts\//mu),
    commit8779e48ChangedCode: has(git(["show", "--name-only", "--format=", "8779e48"]), /^scripts\//mu),
    explanation: "046c4a4 was computed by the generator as the last commit touching src/scripts/test/docs/host at generation time; 8779e48 then changed scripts/ AFTER that, so the recorded value became stale; and regression-reconciliation.json was written by a separate script that never received the field, so it retained an older 34544335 value",
  },
  expectedCorrectedBehavior: "one explicit freeze protocol: baselineHead, codeFreezeHead, executedCodeTree, evidenceInputHead and evidenceContentDigest, with no stale or divergent tested-code claims",
  reproductionMethod: "RUN: read the committed evidence and compare against git log",
  evidenceClass: "DYNAMICALLY_REPRODUCED",
  detectedByE1RTests: false,
});

/* ================================================================ F10 — adapter cannot establish consumption */

const adapterSrc = parentSource("scripts/trajectory_p2e1r/benchmark-answer-adapter.mjs");
record({
  id: "C1-F10",
  title: "Deterministic adapter receives its answer from configuration",
  sourcePath: "scripts/trajectory_p2e1r/benchmark-answer-adapter.mjs",
  function: "apply(ctx, config) -> makeAnswerAdapter(config.answerJson)",
  requiredInput: "none",
  actualBaselineBehavior: {
    answerComesFromConfig: has(adapterSrc, /config\?\.answerJson/u),
    adapterReadsCapsule: has(adapterSrc, /capsule/u),
    adapterPerformsReasoning: false,
    proves: "transport and persistence only",
    doesNotProve: "model interpretation, model consumption of the Capsule, or utility",
  },
  expectedCorrectedBehavior: "evidence must state that the answer is seeded test configuration, and must never imply MODEL_CONSUMED_CAPSULE",
  reproductionMethod: "SOURCE: read the exact parent adapter from Git",
  evidenceClass: "SOURCE_DEMONSTRATED",
  detectedByE1RTests: false,
});

/* ================================================================ report */

const counts = findings.reduce((acc, entry) => {
  acc[entry.evidenceClass] = (acc[entry.evidenceClass] ?? 0) + 1;
  return acc;
}, {});

const report = {
  schemaVersion: 1,
  kind: "TRAJECTORY_P2E1RC_MEASUREMENT_FALSIFIERS",
  stage: "Trajectory-P2-E1RC",
  parentHead: PARENT,
  branch: git(["branch", "--show-current"]),
  method: "pure functions RUN against the parent modules; script control flow SOURCE_DEMONSTRATED from the exact parent source read via git show",
  classificationCounts: counts,
  findings,
  externalModelRequestOccurred: false,
  stochasticTrialOccurred: false,
  modelCallsMade: 0,
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
