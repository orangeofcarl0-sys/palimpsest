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
  process.exit(2);
}
/**
 * E1RC §5.3 (C1-F6): A MISSING REQUIRED DEPENDENCY IS A FAILURE. E1R exited 0 here, so "not established"
 * looked like success to any caller that only checked the exit status. It is now NONZERO (2 = prerequisite
 * missing, distinct from 1 = ran but not established).
 */
if (!hasFirstPartyDsh()) {
  process.stdout.write(`${JSON.stringify({ schemaVersion: 1, kind: "TRAJECTORY_P2E1R_ASSAY", outcome: "ASSAY_EXECUTION_PATH_NOT_ESTABLISHED", blocker: "no installed first-party DSH tree", exitMeaning: "prerequisite missing" }, null, 2)}\n`);
  process.exit(2);
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
    /**
     * §5.5: the answer travels as a FILE PATH. Inlining JSON into the YAML patch made the patch parse the
     * flow mapping as an OBJECT, so the plugin received a non-string config and the entry failed to load.
     */
    const answerPath = join(owned.root, `answer-${ARM}.json`);
    writeFileSync(answerPath, `${answerJson}\n`);
    writeBenchmarkProfile({ home, repo: REPO, root: owned.root, profileName: PROFILE, adapterUrl, answerPath });
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
    record("workerDetail", outcome?.detail ?? null);
    if (observedSession === null) throw new Error("the DSH turn reported no session identity");
    record("dshSessionIdIsReal", observedSession.startsWith("worker-"));
    /** E1RE RE-D §6.2: the observed identity, so the per-arm receipt can name the Session it scored. */
    record("dshSessionId", observedSession);
    /**
     * E1RD S5.4: SESSION CREATION IS NOT A COMPLETED TURN.
     *
     * Each stage is recorded SEPARATELY and in order. E1RC's receipt could report `firstPartyDshTurnObserved:
     * true` for a run where the Session was created and the worker then returned HOST_FAILURE with no assistant
     * message at all. A session id proves the Session Creation boundary was crossed; it proves nothing about
     * the turn, so the two are never collapsed into one boolean.
     */
    const executionStages = {
      sessionCreated: observedSession.startsWith("worker-"),
      workerStartAttempted: true,
      /** The worker's OWN outcome is the only evidence that capability admission let it start. */
      capabilityAdmissionPassed: outcome?.kind !== "HOST_FAILURE",
      /**
       * §10.3: a COMPLETED worker is one that reported a Work outcome kind. `HOST_FAILURE` is the host's
       * statement that no outcome was produced, and it is never a completion.
       */
      workerCompleted: outcome?.kind === "READY_FOR_SETTLEMENT" || outcome?.kind === "NEEDS_ESCALATION",
      assistantPersisted: false,
      answerExtracted: false,
      officialOracleEvaluatedExtractedOutput: false,
    };
    if (executionStages.capabilityAdmissionPassed === false) {
      /** The refusal is recorded verbatim, so a reader sees the mechanism rather than an inferred cause. */
      record("workerRefusalDetail", typeof outcome?.detail === "string" ? outcome.detail : null);
    }

    /** §10.7: read the answer back from OFFICIAL DSH persistence, by EXACT SessionId. */
    const sessionFile = findSessionFile(join(home, "sessions"), observedSession);
    record("sessionFileFoundByExactId", sessionFile !== null);
    /**
     * §11.8: NO HIDDEN GROUND TRUTH — checked BEFORE the verdict is derived, because it is a gating condition.
     */
    const { detectGroundTruthLeak } = await import("../trajectory_p2e1/experimental-truth.mjs");
    const leak = detectGroundTruthLeak({ taskSection: sectionText, taskText: JSON.stringify(context.work ?? {}) }, frozenTruth);
    record("groundTruthLeak", leak.leaked);
    const events = await readSessionEventsByExactId({ sessionsRoot: join(home, "sessions"), sessionId: observedSession });
    const extraction = extractBenchmarkAnswer(events);
    record("answerExtraction", { ok: extraction.ok, assistantMessageCount: extraction.assistantMessageCount ?? 0, bytes: extraction.bytes ?? null, seq: extraction.seq ?? null });
    executionStages.assistantPersisted = (extraction.assistantMessageCount ?? 0) >= 1;
    executionStages.answerExtracted = extraction.ok === true;
    record("executionStages", executionStages);
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
      /** E1RD S5.4: the LAST stage is a property of the OBSERVATION, not of the harness reaching a line. */
      executionStages.officialOracleEvaluatedExtractedOutput = evaluation.ok === true && executionStages.answerExtracted === true;
      record("executionStages", executionStages);
      if (evaluation.ok) {
        record("historicalUnderstanding", evaluation.verdict.historicalUnderstanding);
        record("decisionQuality", evaluation.verdict.decisionQuality);
        record("operationalBehavior", evaluation.operationalBehavior.state);
        record("operationalBehaviorPass", evaluation.verdict.operationalBehavior);
        record("criticalMissing", evaluation.historicalUnderstanding.missingCritical);
        record("truthErrors", evaluation.historicalUnderstanding.truthErrors);
        record("unsupportedCertainty", evaluation.historicalUnderstanding.unsupportedCertainty ?? []);
        /**
         * E1RC §5.3 (C1-F5): THE GO DECISION IS FAIL-CLOSED ON INTEGRITY, NOT ONLY ON THE ORACLE.
         *
         * E1R set GO from the oracle verdict alone, so a run with the wrong arm, a missing section, a broken
         * source basis, an unavailable citation, a leak, or a failed cleanup could still report GO. Every
         * measured condition is now ANDed in; `integrity` is recorded so the closure gate can read exactly
         * which condition failed.
         */
        const integrity = {
          armDelivered: String(findings.contextAssignedArm ?? "").toLowerCase() === ARM,
          presentationMode: String(findings.armPresentationMode ?? "").toLowerCase() === ARM,
          sectionDelivered: Number(findings.armSectionBytes) > 0 && typeof findings.armSectionDigest === "string" && findings.armSectionDigest.length === 64,
          sessionIdentity: findings.dshSessionIdIsReal === true && findings.sessionFileFoundByExactId === true,
          answerExtracted: findings.answerExtraction?.ok === true,
          answerMatchesEmitted: extractionMatchesIntended === true,
          sourceBasisBound: findings.frozenTruthTrialId === frozenTruth.trialId && findings.frozenTruthDigest === frozenTruth.digest,
          noGroundTruthLeak: findings.groundTruthLeak === false,
          /**
           * E1RD S5.4/§10.3: A HOST_FAILURE MUST NOT PASS.
           *
           * Measured: a run whose worker exited 1 still produced a persisted assistant message (the adapter
           * emitted it before the host finished), so an oracle-only GO reported success for a turn whose host
           * had failed. The completed-turn chain is now part of the integrity gate, and the worker's own
           * outcome is required to be a reported outcome rather than a host failure.
           */
          workerCompleted: findings.executionStages?.workerCompleted === true,
          capabilityAdmissionPassed: findings.executionStages?.capabilityAdmissionPassed === true,
          completedTurnChain: findings.executionStages?.assistantPersisted === true && findings.executionStages?.answerExtracted === true && findings.executionStages?.officialOracleEvaluatedExtractedOutput === true,
        };
        record("integrity", integrity);
        const integrityOk = Object.values(integrity).every((value) => value === true);
        finalOutcome = integrityOk && evaluation.verdict.historicalUnderstanding && evaluation.verdict.decisionQuality ? "DETERMINISTIC_ASSAY_GO" : integrityOk ? "ORACLE_ADMISSION_FAILED" : "INTEGRITY_FAILED";
      } else {
        record("oracleRefusal", evaluation.detail);
        finalOutcome = "ORACLE_ADMISSION_FAILED";
      }
      report = { extraction, evaluation };
    }

    record("legacyOracleUsed", false);
    record("legacyOracleStatus", LEGACY_ORACLE_STATUS.classification);
  } finally {
    if (fixture !== null) await fixture.cleanup();
  }
} catch (error) {
  record("error", error instanceof Error ? error.message : String(error));
  if (process.env.E1RC_TRACE === "1" && error instanceof Error) {
    record("errorStack", String(error.stack ?? "").split(/\r?\n/u).slice(0, 10));
  }
  finalOutcome = "ASSAY_EXECUTION_PATH_NOT_ESTABLISHED";
} finally {
  if (process.env.DSH_HOME === undefined) delete process.env.DSH_HOME;
}

const cleanup = await safeCleanup(owned);
const depAfter = snapshotDependencyRoot(depRoot);

/**
 * §5.1 (E1RC C1-F4): EVERY EXECUTION ATTRIBUTE BELOW IS DERIVED FROM THIS RUN'S OWN OBSERVATIONS.
 *
 * E1R wrote `realFirstPartyDshHostRan: true` and friends unconditionally. These are now computed from the
 * `findings` this invocation actually recorded, so a run that never started a DSH turn cannot claim one.
 */
const observed = {
  /**
   * E1RD S5.4: a CREATED SESSION is not a COMPLETED TURN, and the two are now separate fields.
   *
   * `realFirstPartyDshHostRan` means only that a real first-party DSH process created a Session — which is what
   * it always measured, despite the name having been read as a completed turn. The completed-turn fact is
   * `completedDshTurnProducedAnswer`, which requires the assistant message to have been persisted, extracted,
   * matched, and scored.
   */
  realFirstPartyDshHostRan: typeof findings.dshSessionIdIsReal === "boolean" && findings.dshSessionIdIsReal === true,
  sessionCreated: findings.executionStages?.sessionCreated === true,
  capabilityAdmissionPassed: findings.executionStages?.capabilityAdmissionPassed === true,
  workerCompleted: findings.executionStages?.workerCompleted === true,
  assistantPersisted: findings.executionStages?.assistantPersisted === true,
  completedDshTurnProducedAnswer:
    findings.executionStages?.sessionCreated === true &&
    findings.executionStages?.capabilityAdmissionPassed === true &&
    findings.executionStages?.assistantPersisted === true &&
    findings.executionStages?.answerExtracted === true &&
    findings.executionStages?.officialOracleEvaluatedExtractedOutput === true &&
    findings.extractedAnswerMatchesEmitted === true,
  answerEmittedByRealDshTurn: findings.answerExtraction?.ok === true && findings.extractedAnswerMatchesEmitted === true,
  realDshAssistantMessageInspected: findings.answerExtraction?.ok === true && findings.sessionFileFoundByExactId === true,
  realCanonicalWorkRan: typeof findings.canonicalConsumerAttemptId === "string" && findings.canonicalConsumerAttemptId.length > 0,
  contextOwnerInvoked: findings.contextOwnerInvoked === true,
  armDelivered: typeof findings.contextAssignedArm === "string",
};

const out = {
  schemaVersion: 1,
  kind: "TRAJECTORY_P2E1R_ASSAY",
  stage: "Trajectory-P2-E1RC",
  /** The E1RC parent this harness was derived from; the ACTUAL executed head is recorded by the closure gate. */
  derivedFromHead: "f78e7672441b1a970ed21f66435feb595c9401a3",
  arm: ARM,
  outcome: finalOutcome,
  permittedOutcomes: OUTCOMES,
  ...findings,
  ownedRootRemoved: !existsSync(owned.root),
  cleanup: { cleaned: cleanup.cleaned, reason: cleanup.reason ?? null },
  dependencyRootPreserved: depBefore.canonical === depAfter.canonical && depBefore.entries === depAfter.entries,
  officialOracle: OFFICIAL_ORACLE.module,
  oracleVersion: ORACLE_VERSION,
  ...observed,
  legacyOracleUsedByActiveAssay: false,
  externalModelRequestOccurred: false,
  paidModelRequestOccurred: false,
  stochasticTrialOccurred: false,
  modelCallsMade: 0,
  modelConsumedCapsule: false,
  modelConsumedCapsuleReason: "the deterministic adapter is SEEDED with the expected answer through profile configuration; it does not read the Capsule, so this run proves transport and persistence only",
  note: "§5.1: execution attributes are derived from this run's observations, not asserted. The answer is the final assistant text of a real first-party DSH turn, read back from DSH persistence by exact SessionId and scored by the official source-aware oracle against a per-run frozen truth.",
};

process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
process.exit(finalOutcome === "DETERMINISTIC_ASSAY_GO" ? 0 : 1);

/**
 * §10.1: a benchmark profile mounting the ANSWER adapter (not the worker-result adapter). It is a separate
 * writer here because the answer JSON must be injected as config, which the shared writer does not do.
 */
function writeBenchmarkProfile(input) {
  const { home, repo, root, profileName, adapterUrl, answerPath } = input;
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
      `        answerPath: '${String(answerPath).replace(/\\/gu, "/")}'`,
      "        resultToolName: 'palimpsest_worker_result'",
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
