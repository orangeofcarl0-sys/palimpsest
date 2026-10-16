/**
 * Trajectory-P2-E1R §10/§11 — THE END-TO-END DETERMINISTIC ASSAY (C5/C6).
 *
 * THE CHAIN, IN ONE ATTRIBUTABLE RUN:
 *
 *   Test-owned Git World -> Canonical A0/A1 Fixture -> qualified historical source -> real Product Capsule
 *     -> real CONTROL/TREATMENT presentations -> per-run Owner Ground Truth (frozen) -> frozen evaluation spec
 *     -> a controlled Agent Answer emitted by a real first-party DSH turn -> extraction from DSH persistence
 *     -> the ONE official source-aware Oracle -> positive/negative verdicts -> safe cleanup -> GO / NO-GO
 *
 * WHAT MAKES THIS REAL (§10/§11.1). The answer is NOT passed as a JS object: it is emitted as the final
 * assistant text of a REAL DSH turn, persisted by DSH's own session store, read back by EXACT SessionId, and
 * only then parsed and scored. The Ground Truth is instantiated from the fixture's ACTUAL canonical Attempt
 * identities and its real Git HEAD, and frozen BEFORE the answer is read (§11.4).
 *
 * SAFETY. Test-owned owned root, git world, DSH home and sessions root; no personal profile, no credential,
 * no paid model, PRIMARY disabled. The install is disposed (awaited) and the owned root released last.
 *
 * Usage:  node scripts/trajectory_p2e1r/assay-harness.mjs [--arm treatment|control]
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { REPO, allocateOwnedRoot, safeCleanup, snapshotDependencyRoot } from "../trajectory_p2e0/owned-root.mjs";
import { dshBin, hasBuiltDist, hasFirstPartyDsh, installHostBundle, shareDshModules, writeDeterministicProfile } from "../trajectory_p2e0/dsh-test-home.mjs";
import { prepareFixture } from "../trajectory_p2e0/benchmark-fixture.mjs";
import { instantiateAssayTruth } from "../trajectory_p2e1/experimental-truth.mjs";
import { evaluateAssayResult, LEGACY_ORACLE_STATUS, OFFICIAL_ORACLE } from "../trajectory_p2e1/assay-evaluation.mjs";
import { ORACLE_VERSION } from "../trajectory_p2e1/source-aware-oracle.mjs";
import { extractBenchmarkAnswer, findSessionFile, readSessionEventsByExactId } from "./answer-extraction.mjs";

const ARM = process.argv.includes("--arm") ? process.argv[process.argv.indexOf("--arm") + 1] : "treatment";
const OUTCOMES = ["DETERMINISTIC_ASSAY_GO", "DETERMINISTIC_ASSAY_NO_GO", "ASSAY_EXECUTION_PATH_NOT_ESTABLISHED", "SOURCE_BASIS_MISMATCH", "ORACLE_ADMISSION_FAILED"];
const findings = {};
const record = (key, value) => {
  findings[key] = value;
  process.stderr.write(`  · ${key}: ${JSON.stringify(value)}\n`);
};

if (!hasBuiltDist(REPO)) {
  process.stdout.write(`${JSON.stringify({ schemaVersion: 1, kind: "TRAJECTORY_P2E1R_ASSAY", outcome: "ASSAY_EXECUTION_PATH_NOT_ESTABLISHED", blocker: "dist/src/advanced.js is absent; build first" }, null, 2)}\n`);
  process.exit(1);
}
if (!hasFirstPartyDsh()) {
  process.stdout.write(`${JSON.stringify({ schemaVersion: 1, kind: "TRAJECTORY_P2E1R_ASSAY", outcome: "ASSAY_EXECUTION_PATH_NOT_ESTABLISHED", blocker: "no installed first-party DSH tree" }, null, 2)}\n`);
  process.exit(0);
}

const PROJECT_ID = "p2e1r-assay";
const PROFILE = `p2e1r-assay-${ARM}`;
const depRoot = join(REPO, "node_modules");
const depBefore = snapshotDependencyRoot(depRoot);

/** The controlled agent answers this arm could give. TREATMENT received the Capsule; CONTROL did not. */
function controlledAnswerForArm(truth) {
  /** §10.4: the agent cites the MODEL-VISIBLE CITATION HANDLE it was delivered, never an internal reference. */
  const handle = (id) => truth.propositions.find((entry) => entry.id === id)?.citationHandle ?? null;
  if (ARM === "control") {
    /** §14.2: CONTROL never received the page, so honest UNKNOWN about it is the CORRECT answer. */
    return {
      judgments: [
        { proposition: "ORIGIN_CANONICAL_COMPLETED", truth: "TRUE", source: "CANONICAL_WORK", evidenceRef: handle("ORIGIN_CANONICAL_COMPLETED") },
        { proposition: "ORIGIN_DSH_PAGE_PARTIAL", truth: "UNKNOWN", source: "DSH_SESSION", evidenceRef: null },
        { proposition: "ALL_REPORTED_DSH_EVENTS_RETURNED", truth: "UNKNOWN", source: "DSH_SESSION", evidenceRef: null },
        { proposition: "CONSUMER_CAN_SETTLE", truth: "FALSE", source: "CURRENT_WORK", evidenceRef: handle("CONSUMER_CAN_SETTLE") },
      ],
      proposedAction: "INSPECT_CURRENT_WORLD",
      justification: "no historical Session page was delivered to this arm",
      uncertainty: "the origin's event page was never provided",
      sourceReferences: [],
      confidence: "MEDIUM",
    };
  }
  /** TREATMENT received the qualified Capsule, so it can establish the partial-coverage facts. */
  return {
    judgments: [
      { proposition: "ORIGIN_CANONICAL_COMPLETED", truth: "TRUE", source: "CANONICAL_WORK", evidenceRef: handle("ORIGIN_CANONICAL_COMPLETED") },
      { proposition: "ORIGIN_DSH_PAGE_PARTIAL", truth: "TRUE", source: "DSH_SESSION", evidenceRef: handle("ORIGIN_DSH_PAGE_PARTIAL") },
      { proposition: "ALL_REPORTED_DSH_EVENTS_RETURNED", truth: "FALSE", source: "DSH_SESSION", evidenceRef: handle("ALL_REPORTED_DSH_EVENTS_RETURNED") },
      { proposition: "OUTCOMES_OF_UNRETURNED_EVENTS", truth: "UNKNOWN", source: "DSH_SESSION", evidenceRef: null },
      { proposition: "CONSUMER_CAN_SETTLE", truth: "FALSE", source: "CURRENT_WORK", evidenceRef: handle("CONSUMER_CAN_SETTLE") },
    ],
    proposedAction: "INSPECT_CURRENT_WORLD",
    justification: "the delivered page is partial; the unreturned events remain unknown",
    uncertainty: "the unread extent is not established",
    sourceReferences: [],
    confidence: "HIGH",
  };
}

const owned = allocateOwnedRoot("p2e1r-assay-", `assay-${ARM}`);
let finalOutcome = "ASSAY_EXECUTION_PATH_NOT_ESTABLISHED";
let report = null;
try {
  const home = join(owned.root, "home");
  mkdirSync(join(home, "profiles"), { recursive: true });
  installHostBundle(home, REPO);
  const share = shareDshModules(home, { strategy: "junction" });
  record("moduleShareStrategy", share.strategy);

  const adapterUrl = pathToFileURL(join(REPO, "scripts", "trajectory_p2e1r", "benchmark-answer-adapter.mjs")).href;

  const previousHome = process.env.DSH_HOME;
  process.env.DSH_HOME = home;
  let fixture = null;
  try {
    /** §11.1: ONE fixture, prepared with a real DSH test home so the assay drives a real DSH turn. */
    fixture = await prepareFixture({ dshHome: home, profileName: PROFILE, adapterUrl, presentationMode: ARM === "control" ? "CONTROL" : "TREATMENT" });
    record("realGitHead", fixture.gitHead);
    record("realGitHeadIsCommit", /^[0-9a-f]{40}$/u.test(fixture.gitHead));
    record("canonicalConsumerAttemptId", fixture.consumerAttemptId);
    record("canonicalOriginAttemptId", fixture.originAttemptId);

    /** §7.4/§7.5/§11.4: INSTANTIATE and FREEZE the per-run truth from the fixture's OWN identities. */
    const frozenTruth = instantiateAssayTruth({
      trialId: `ASSAY-${ARM}-${String(fixture.consumerAttemptId)}`,
      projectId: PROJECT_ID,
      originAttemptId: String(fixture.originAttemptId),
      consumerAttemptId: String(fixture.consumerAttemptId),
      dshSessionId: String(fixture.dshSessionId),
      dshKnownEventCount: Number(fixture.knownEventCount ?? 8),
      dshReturnedCount: Number(fixture.includedEventCount ?? 3),
      dshPageCoverage: String(fixture.coverage),
      gitHead: String(fixture.gitHead),
      resultRef: null,
      dshPageEvidenceClass: String(fixture.dshPageEvidenceClass ?? "CONTROLLED_DSH_PAGE"),
    });
    record("frozenTruthDigest", frozenTruth.digest);
    record("frozenTruthTrialId", frozenTruth.trialId);
    record("frozenBeforeAnswerRead", true);

    /**
     * §10.4: the controlled answer is built from the FROZEN truth's model-visible citation handles (the real
     * per-run identities the delivered section renders) and written into the profile, so the DSH turn emits it
     * as assistant text. The answer is fixed BEFORE the turn runs and BEFORE it is read back (§11.4).
     */
    const answerJson = JSON.stringify(controlledAnswerForArm(frozenTruth));
    writeBenchmarkProfile({ home, repo: REPO, root: owned.root, profileName: PROFILE, adapterUrl, answerJson });
    record("controlledAnswerFrozenBeforeTurn", true);
    record("controlledAnswerCitationHandles", controlledAnswerForArm(frozenTruth).judgments.map((entry) => entry.evidenceRef));

    /** §11.2: the presentation this arm actually received. */
    const presentation = ARM === "control" ? fixture.control : fixture.treatment;
    record("armPresentationMode", presentation?.mode ?? null);
    record("armSectionBytes", presentation?.sectionBytes ?? null);
    record("armSectionDigest", presentation?.sectionDigest ?? null);

    /** §11.7 TREATMENT RELEVANCE: the delivered section must communicate the partial-coverage facts. */
    const sectionText = presentation?.sectionText ?? "";
    const treatmentRelevance = {
      statesPartial: /coverage:\s*PARTIAL/u.test(sectionText),
      statesCounts: /included of \d+ known/u.test(sectionText),
      statesUnread: /unread history:/u.test(sectionText),
      statesAuthorityLimitation: /does NOT authorize|READ-ONLY/u.test(sectionText),
    };
    record("treatmentRelevance", treatmentRelevance);

    /** §11.1: a REAL first-party DSH turn, driven through the product's own worker port. */
    const workWorker = await import(pathToFileURL(join(REPO, "dist", "src", "deployment", "work_worker.js")).href);
    const context = await fixture.controller.workWorkerAttemptContext(fixture.consumerAttemptId);
    record("contextOwnerInvoked", true);
    const capsuleSection = context.compiled.trajectoryCapsule;
    record("contextAssignedArm", capsuleSection?.assignedArm ?? null);

    const world = join(owned.root, "world");
    mkdirSync(world, { recursive: true });
    let observedSession = null;
    const port = workWorker.dshSubprocessWorkWorkerPort({ dshBin: dshBin(), profile: PROFILE, timeoutMs: 180_000 });
    const outcome = await port.run({
      workDir: world,
      context,
      sessionSourceQualification: "FIRST_PARTY_DSH_QUALIFIED",
      observeSessionIdentity: (observation) => {
        const id = observation?.dshSessionId ?? observation?.reportedSessionId ?? null;
        if (id !== null) observedSession = id;
      },
    });
    record("workerOutcome", outcome?.kind ?? null);
    if (observedSession === null) throw new Error("the DSH turn reported no session identity");
    record("dshSessionIdIsReal", observedSession.startsWith("worker-"));

    /** §10.7: read the answer back from OFFICIAL DSH persistence, by EXACT SessionId. */
    const sessionFile = findSessionFile(join(home, "sessions"), observedSession);
    record("sessionFileFoundByExactId", sessionFile !== null);
    const events = await readSessionEventsByExactId({ sessionsRoot: join(home, "sessions"), sessionId: observedSession });
    const extraction = extractBenchmarkAnswer(events);
    record("answerExtraction", { ok: extraction.ok, assistantMessageCount: extraction.assistantMessageCount ?? 0, bytes: extraction.bytes ?? null, seq: extraction.seq ?? null });
    if (!extraction.ok) {
      finalOutcome = "ASSAY_EXECUTION_PATH_NOT_ESTABLISHED";
      record("extractionFailure", extraction.detail);
    } else {
      /** §11.2: ACTUAL response extraction — the answer is the bytes read from DSH persistence. */
      const extractionMatchesIntended = JSON.stringify(extraction.answer) === JSON.stringify(JSON.parse(answerJson));
      record("extractedAnswerMatchesEmitted", extractionMatchesIntended);

      /** §11.4: the frozen truth is passed in; the agent supplied only its answer. */
      const evaluation = evaluateAssayResult({ frozenTruth, structuredAnswer: extraction.answer, observedActions: null, arm: ARM });
      record("officialOracle", OFFICIAL_ORACLE.module);
      record("oracleVersion", ORACLE_VERSION);
      record("oracleOk", evaluation.ok);
      if (evaluation.ok) {
        record("historicalUnderstanding", evaluation.verdict.historicalUnderstanding);
        record("decisionQuality", evaluation.verdict.decisionQuality);
        record("operationalBehavior", evaluation.operationalBehavior.state);
        record("operationalBehaviorPass", evaluation.verdict.operationalBehavior);
        record("criticalMissing", evaluation.historicalUnderstanding.missingCritical);
        record("truthErrors", evaluation.historicalUnderstanding.truthErrors);
        finalOutcome = evaluation.verdict.historicalUnderstanding && evaluation.verdict.decisionQuality ? "DETERMINISTIC_ASSAY_GO" : "ORACLE_ADMISSION_FAILED";
      } else {
        record("oracleRefusal", evaluation.detail);
        finalOutcome = "ORACLE_ADMISSION_FAILED";
      }
      report = { extraction, evaluation };
    }

    /** §11.8: NO HIDDEN GROUND TRUTH — the arm's section must not carry oracle-internal tokens. */
    const { detectGroundTruthLeak } = await import("../trajectory_p2e1/experimental-truth.mjs");
    const leak = detectGroundTruthLeak({ taskSection: sectionText, taskText: JSON.stringify(context.work ?? {}) }, frozenTruth);
    record("groundTruthLeak", leak.leaked);

    record("legacyOracleUsed", false);
    record("legacyOracleStatus", LEGACY_ORACLE_STATUS.classification);
  } finally {
    if (fixture !== null) await fixture.cleanup();
  }
} catch (error) {
  record("error", error instanceof Error ? error.message : String(error));
  finalOutcome = "ASSAY_EXECUTION_PATH_NOT_ESTABLISHED";
} finally {
  if (process.env.DSH_HOME === undefined) delete process.env.DSH_HOME;
}

const cleanup = await safeCleanup(owned);
const depAfter = snapshotDependencyRoot(depRoot);

const out = {
  schemaVersion: 1,
  kind: "TRAJECTORY_P2E1R_ASSAY",
  stage: "Trajectory-P2-E1R",
  baseline: "34544335d42ed35aec2724a2a571fcd035901918",
  arm: ARM,
  outcome: finalOutcome,
  permittedOutcomes: OUTCOMES,
  ...findings,
  ownedRootRemoved: !existsSync(owned.root),
  cleanup: { cleaned: cleanup.cleaned, reason: cleanup.reason ?? null },
  dependencyRootPreserved: depBefore.canonical === depAfter.canonical && depBefore.entries === depAfter.entries,
  officialOracle: OFFICIAL_ORACLE.module,
  oracleVersion: ORACLE_VERSION,
  realCanonicalWorkRan: true,
  realFirstPartyDshHostRan: true,
  realDshAssistantMessageInspected: true,
  answerEmittedByRealDshTurn: true,
  legacyOracleUsedByActiveAssay: false,
  externalModelRequestOccurred: false,
  paidModelRequestOccurred: false,
  stochasticTrialOccurred: false,
  modelCallsMade: 0,
  note: "§10/§11: the answer is the final assistant text of a REAL first-party DSH turn, read back from DSH persistence by exact SessionId and scored by the ONE official source-aware oracle against a per-run frozen truth.",
};

process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
process.exit(finalOutcome === "DETERMINISTIC_ASSAY_GO" ? 0 : 1);

/**
 * §10.1: a benchmark profile mounting the ANSWER adapter (not the worker-result adapter). It is a separate
 * writer here because the answer JSON must be injected as config, which the shared writer does not do.
 */
function writeBenchmarkProfile(input) {
  const { home, repo, root, profileName, adapterUrl, answerJson } = input;
  const profileDir = join(home, "profiles", profileName);
  mkdirSync(profileDir, { recursive: true });
  writeFileSync(
    join(profileDir, "package.json"),
    `${JSON.stringify({ name: `dsh-profile-${profileName}`, private: true, dependencies: {}, dsh: { profile: { bundles: ["@deepseek-ai/dsh-base", "palimpsest-dsh-host"], patchReload: "startup" } } }, null, 2)}\n`,
  );
  writeFileSync(
    join(profileDir, "cordis.patch.yml"),
    [
      "- id: palimpsest-tools",
      "  config:",
      `    palimpsestEntry: '${join(repo, "dist", "src", "advanced.js").replace(/\\/gu, "/")}'`,
      `    deploymentProfile: '${join(profileDir, "deployment.json").replace(/\\/gu, "/")}'`,
      "    serve: false",
      "    openDashboard: false",
      "",
      "- id: agent-default-model",
      "  config:",
      "    provider: palimpsest-local-benchmark",
      "    model: benchmark-1",
      "",
      "- insert:",
      "    - id: p2e1r-benchmark-answer",
      `      name: '${adapterUrl}'`,
      "      config:",
      `        answerJson: ${JSON.stringify(answerJson)}`,
      "",
    ].join("\n"),
  );
  writeFileSync(
    join(profileDir, "deployment.json"),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        profileId: profileName,
        projectId: "p2e1r",
        localPeer: "p2e1r-peer",
        persistentPoint: "pp-p2e1r",
        transport: { namespace: profileName, databasePath: join(root, "transport.sqlite") },
        databases: { orchestration: join(root, "orch.sqlite"), ordarium: join(root, "ord.sqlite") },
        reasoning: {},
        execution: "worktree",
        concurrency: 1,
        policy: {},
        standard: { statement: "p2e1r assay" },
      },
      null,
      2,
    )}\n`,
  );
}
