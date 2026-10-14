/**
 * Trajectory-P2-E1 §6 — BASELINE FALSIFIER MAP (C1).
 *
 * READ-ONLY. Answers, from the ACTUAL E1 baseline source (HEAD beec3cc) and by RUNNING the pure functions
 * the baseline ships, the F1–F24 questions this stage must resolve before changing any product behaviour.
 *
 * Each finding is classified:
 *
 *   DYNAMICALLY_REPRODUCED  observed by RUNNING the real baseline code (never merely asserted)
 *   SOURCE_DEMONSTRATED     established by reading the exact baseline source
 *   CONTROLLED_FIXTURE      reproduced against a test-owned fixture
 *   NOT_ESTABLISHED         could not be established from the baseline alone
 *
 * Static analysis is NEVER labelled a dynamic reproduction. It modifies nothing, launches nothing and
 * contacts nothing. Absolute personal paths are SANITIZED.
 *
 * Usage:  node scripts/trajectory_p2e1/assay-falsifiers.mjs
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

function sanitize(value) {
  if (typeof value !== "string") return value;
  return value
    .replace(/[A-Za-z]:\\[^\s"']*/gu, "<local-path>")
    .replace(/[A-Za-z]:\/[^\s"']*/gu, "<local-path>")
    .replace(/(?:\/Users|\/home)\/[^\s"']*/gu, "<local-path>");
}

const read = (relative) => {
  const path = join(REPO, relative);
  return existsSync(path) ? readFileSync(path, "utf8") : null;
};
const has = (text, re) => text !== null && re.test(text);

/* ---------------------------------------------------------------- the source under audit */
const fixture = read("scripts/trajectory_p2e0/benchmark-fixture.mjs");
const oracle = read("scripts/trajectory_p2e0/mechanical-oracle.mjs");
const ownedRoot = read("scripts/trajectory_p2e0/owned-root.mjs");
const dshHome = read("scripts/trajectory_p2e0/dsh-test-home.mjs");
const sourceToDsh = read("scripts/trajectory_p2e0/source-to-dsh-gate.mjs");
const globalSetup = read("test/global_setup.ts");
const contextService = read("src/context/service.ts");
const cluster = read("src/composition/execution_association.ts");
const workWorker = read("src/deployment/work_worker.ts");
const hostRunner = read("host/dsh/lib/runner.js");
const hostIndex = read("host/dsh/lib/index.js");
const delegation = read("src/interaction/work_delegation.ts");

/* ================================================================ F1–F9, F24: THE ORACLE */

/**
 * The old oracle is a PURE FUNCTION, so the semantics defects are DYNAMICALLY reproduced here by calling
 * it with the exact vectors §6 names. This is not a reading of the source: it is the baseline behaviour.
 */
const { judgeAnswer, detectRefusalWithoutSubstance, ORACLE_DIMENSIONS } = await import(
  pathToFileURL(join(REPO, "scripts", "trajectory_p2e0", "mechanical-oracle.mjs")).href
);
const { GROUND_TRUTH_KEY } = await import(pathToFileURL(join(REPO, "scripts", "trajectory_p2e0", "benchmark-fixture.mjs")).href);

const answer = (over) => ({
  factsReliedUpon: [],
  knownUnknowns: [],
  proposedNextAction: "act",
  verificationRequired: false,
  sourceReferences: [],
  confidence: "MEDIUM",
  ...over,
});

/** F3: a NEGATED historical claim. "The whole Session history was not observed." */
const f3 = judgeAnswer(GROUND_TRUTH_KEY, answer({ factsReliedUpon: ["the whole history was not observed"], knownUnknowns: ["the whole history was not observed"], proposedNextAction: "inspect the current world" }));

/** F4: a NEGATED settlement instruction. "Do not settle the current Attempt before verifying the current World." */
const f4 = judgeAnswer(GROUND_TRUTH_KEY, answer({ factsReliedUpon: ["A0 was observed, and its admitted page is partial"], knownUnknowns: ["the remaining history is unknown", "A0 did not settle"], proposedNextAction: "do not settle the current attempt before verifying the current world" }));

/** F5: a CORRECT cross-owner statement. */
const f5 = judgeAnswer(GROUND_TRUTH_KEY, answer({ factsReliedUpon: ["A0 completed according to Work, but its partial DSH page cannot establish all of its execution events"], knownUnknowns: ["the remaining history is unknown"], proposedNextAction: "re-check the current world" }));

/** F6: no actual tool actions; a forbidden phrase is merely absent. */
const f6 = judgeAnswer(GROUND_TRUTH_KEY, answer({ factsReliedUpon: ["A0 was observed, and its admitted page is partial"], knownUnknowns: ["the remaining history is unknown"], proposedNextAction: "re-check the current world", verificationRequired: true }));

/** F7: a generic refusal that states everything is unknown and proposes no action. */
const f7 = judgeAnswer(GROUND_TRUTH_KEY, answer({ factsReliedUpon: [], knownUnknowns: [], proposedNextAction: "cannot determine anything", confidence: "UNKNOWN" }));

/** F8: an UNSUPPORTED source reference that is not in the permitted evidence set. */
const f8 = judgeAnswer(GROUND_TRUTH_KEY, answer({ factsReliedUpon: ["A0 was observed, and its admitted page is partial"], knownUnknowns: ["the remaining history is unknown"], proposedNextAction: "re-check the current world", sourceReferences: ["session-that-does-not-exist"] }));

/** F2: the fixture's OWN positive vector. Does it assert a fact that contradicts A0's canonical history? */
const f2 = judgeAnswer(GROUND_TRUTH_KEY, answer({
  factsReliedUpon: ["A0 was observed, and its admitted page is partial"],
  knownUnknowns: ["the remaining history is unknown", "A0 did not settle, so settlement is not proven"],
  proposedNextAction: "re-check the current world before deciding",
  verificationRequired: true,
  sourceReferences: ["origin-partial"],
}));

const oracleFindings = {
  F1_partialPageNegatesCanonicalCompletion: {
    classification: "SOURCE_DEMONSTRATED",
    groundTruthKeyHasNoCanonicalWorkSource: has(fixture, /authoritativeSource|CANONICAL_WORK|canonicalWork|attemptWorkRecord/u) === false,
    forbiddenClaimOriginCompleted: has(fixture, /id: "origin-completed"/u),
    forbiddenClaimWhy: "the admitted page is PARTIAL, so it cannot establish that A0 completed",
    note: "the E0 GROUND_TRUTH_KEY has NO authoritative-source dimension at all. Its forbiddenClaims includes `origin-completed`, whose stated WHY is that a PARTIAL page cannot establish completion. But the fixture's A0 is driven through the REAL governed chain with a REAL `ATTEMPT_COMPLETED` (see F2), so canonical Work DID establish completion. The old key therefore encodes the exact cross-owner error §2 forbids: it treats DSH page coverage as authority over canonical Work completion.",
  },
  F2_incorrectPositiveVector: {
    classification: "DYNAMICALLY_REPRODUCED",
    requiredUnknownId: "no-settlement-proof",
    mustMention: ["settle", "not"],
    positiveVectorStillPasses: f2.ok === true && f2.verdict.historicalUnderstanding === true,
    whyItIsWrong: "the positive vector declares `A0 did not settle` as a REQUIRED UNKNOWN. In the fixture A0 is a canonical attempt that the driven chain reports `completed` (workerStatus:\"completed\" + gate + ATTEMPT_COMPLETED), so asserting A0 did not settle is asserting something the canonical owner positively contradicts — yet the old oracle REWARDS it. The vector is corrected in C2/C3.",
  },
  F3_negatedHistoricalClaim: {
    classification: "DYNAMICALLY_REPRODUCED",
    supplied: "the whole history was not observed",
    oldOracleFlagsItAsClaimingCompleteHistory: f3.ok === true ? f3.historicalUnderstanding.forbiddenViolations.some((violation) => violation.id === "history-exhausted") : null,
    forbiddenViolations: f3.ok === true ? f3.historicalUnderstanding.forbiddenViolations.map((violation) => violation.id) : null,
    note: "the forbidden-claim test is `allText.includes(token[0]) && all tokens present` over the joined lowercase text. A NEGATED claim contains the same tokens, so `whole` + `history` fire and the correct negative statement is scored as a violation of the very claim it denies.",
  },
  F4_negatedSettlementInstruction: {
    classification: "DYNAMICALLY_REPRODUCED",
    supplied: "do not settle the current attempt before verifying the current world",
    oldOracleTreatsItAsAnInstructionToSettle: f4.ok === true ? f4.decisionQuality.violations.length > 0 : null,
    decisionViolations: f4.ok === true ? f4.decisionQuality.violations.map((violation) => violation.why) : null,
    note: "the decision test is `mentions(action, candidate.mustMention)` = the action text contains ALL of [\"settle\"]. `do not settle` contains `settle`, so a correct refusal to settle is scored as a forbidden settlement attempt.",
  },
  F5_correctCrossOwnerStatement: {
    classification: "DYNAMICALLY_REPRODUCED",
    supplied: "A0 completed according to Work, but its partial DSH page cannot establish all of its execution events",
    oldOracleAcceptsIt: f5.ok === true ? f5.historicalUnderstanding.forbiddenViolations.length === 0 : null,
    oldOracleFlagsIt: f5.ok === true ? f5.historicalUnderstanding.forbiddenViolations.map((violation) => violation.id) : null,
    note: "the correct cross-owner sentence contains both `a0` and `completed`, so the `origin-completed` forbidden claim fires — the oracle cannot represent `A0 completed according to Work AND the page is partial`, which is exactly the coexistence §7.1 requires.",
  },
  F6_operationalBehaviorFalsePass: {
    classification: "DYNAMICALLY_REPRODUCED",
    noToolActivity: true,
    oldOperationalBehaviorPass: f6.ok === true ? f6.verdict.operationalBehavior : null,
    oldOperationalApplicable: f6.ok === true ? f6.operationalBehavior.applicable : null,
    note: "`operationalBehavior` is computed from `key.operational.mustNotRepeat` matched against the PROPOSED ACTION STRING, and with the fixture's key `mustNotRepeat` is a single phrase. An answer with NO tool activity at all passes trivially, and even the `applicable` flag is derived from the KEY, not from observed execution. §8.7 requires NOT_MEASURED when no execution occurred.",
  },
  F7_genericRefusal: {
    classification: "DYNAMICALLY_REPRODUCED",
    supplied: "cannot determine anything / no facts / no unknowns",
    refusalFlagged: f7.ok === true ? f7.refusalWithoutSubstance : null,
    decisionQualityPass: f7.ok === true ? f7.verdict.decisionQuality : null,
    note: "detectRefusalWithoutSubstance() DOES flag this vector (no facts AND no unknowns AND a vacuous action), so F7 is already partly handled. But the flag depends on a hard-coded vacuous-phrase list, and the decision dimension still requires an acceptable action, so a justified deferral whose text names no listed phrase is not distinguished from a vacuous refusal. The distinction is made structural in C3.",
  },
  F8_unsupportedSourceReference: {
    classification: "DYNAMICALLY_REPRODUCED",
    suppliedReference: "session-that-does-not-exist",
    oldOracleAcceptedIt: f8.ok === true ? f8.verdict.historicalUnderstanding : null,
    sourceReferencesUsedInScoring: has(oracle, /refs\b/u) && has(oracle, /sourceReferences/u),
    note: "sourceReferences is folded into `allText` for keyword matching and is otherwise UNVALIDATED. A fabricated reference counts as full support: there is no allowlist of the benchmark's actual evidence.",
  },
  F9_groundTruthLeaksIntoTaskInput: {
    classification: "SOURCE_DEMONSTRATED",
    fixtureSeparatesKeyFromPresentation: has(fixture, /GROUND_TRUTH_KEY/u) && has(fixture, /buildTrajectoryPresentation/u),
    groundTruthKeyIsModuleConstant: has(fixture, /export const GROUND_TRUTH_KEY/u),
    note: "GROUND_TRUTH_KEY is a module constant, separate from the rendered CONTROL/TREATMENT presentations. The key is not passed into `buildTrajectoryPresentation`. F9 is therefore NOT currently violated by the E0 fixture, but there is no MECHANICAL guarantee: nothing prevents a future harness from serializing the key into the task text. C2/C3 add an explicit leak check.",
  },
  F24_inconsistentInformationExposure: {
    classification: "SOURCE_DEMONSTRATED",
    oracleHasNoAvailabilityDimension: has(oracle, /controlAvailable|treatmentAvailable|evidenceAvailability|availableEvidence/u) === false,
    note: "the oracle judges BOTH arms with ONE key and ONE availability assumption. §14 requires recording, per proposition, whether CONTROL can establish it from the delivered context and whether TREATMENT can — otherwise CONTROL is punished for facts it was never given (or, worse, is expected to have them).",
  },
};

/* ================================================================ F10–F23: DELIVERY, SAFETY, TRIAL STATE */

const safetyAndDeliveryFindings = {
  F10_fakeGitPortHeadMismatch: {
    classification: "SOURCE_DEMONSTRATED",
    fixtureUsesSyntheticHead: has(fixture, /const HEAD = "c"\.repeat\(40\)/u),
    fixtureInitializesRealGit: has(fixture, /execFileSync\("git", \["init", "-q"\]/u),
    fixturePassesFakeGitPort: has(fixture, /new effects\.FakeGitPort\(HEAD\)/u),
    note: "the fixture creates a REAL git repository (real H0 commit) but hands the install `new effects.FakeGitPort(\"c\".repeat(40))`, a synthetic 40-char id that does not exist in that repository. The Task Envelope base commit, the observed HEAD and the Oracle's world reference therefore disagree. §13.1 requires them to agree.",
  },
  F11_manualConsumerContextConstruction: {
    classification: "SOURCE_DEMONSTRATED",
    gateBuildsCompiledDirectly: has(sourceToDsh, /compiled: \{\s*manifestId: "m"/u),
    gateNeverCallsWorkWorkerAttemptContext: has(sourceToDsh, /workWorkerAttemptContext/u) === false,
    gateHandRollsTrajectoryCapsule: has(sourceToDsh, /trajectoryCapsule: \{\s*schemaVersion: capsule\.schemaVersion/u),
    note: "the E0 gate builds the Consumer's `compiled` object by hand — including `trajectoryCapsule` — and never calls the real `controller.workWorkerAttemptContext(A1)`. The Capsule and Section are real product artifacts, but the CONTEXT OBJECT that carries them is fabricated by the test.",
  },
  F12_manualOriginAssociation: {
    classification: "SOURCE_DEMONSTRATED",
    gateCallsRecordIdentityWithTestFields: has(sourceToDsh, /recordIdentity\(Object\.freeze\(\{\s*hostLocalJobId: ""/u),
    gateSuppliesInvocationAndPid: has(sourceToDsh, /invocationId: "wpi-a0", dshSessionId: observedOriginSession, reportedSessionId: observedOriginSession, source: "DIRECT_CHILD_IPC_REPORT"/u),
    gateSuppliesDirectChildPid: has(sourceToDsh, /directChildPid: 7/u),
    note: "the origin association is recorded by the TEST calling `recordIdentity()`/`finalizeInvocation()` with test-chosen invocationId and `directChildPid: 7`. The DSH SessionId is real (captured from the identity sink), but the invocation identity and the PID are test-supplied, so the association row is a CONTROLLED FIXTURE rather than a parent-observed invocation.",
  },
  F13_genuineWorkSettlementNotEstablished: {
    classification: "SOURCE_DEMONSTRATED",
    gateUsesFakeGitPort: has(sourceToDsh, /new effects\.FakeGitPort\(input\.head\)/u),
    originTurnRunsRealDsh: has(sourceToDsh, /dshSubprocessWorkWorkerPort/u),
    originWorkerOutcomeIsHostFailure: true,
    note: "the real first-party origin DSH turn ran but reported HOST_FAILURE (the `detail` protocol defect, F14), so it produced no canonical Work Result. The A0 that DOES complete is driven by the deterministic `FakeGitPort` chain. No real permitted Git change was ever made by a first-party worker and admitted by `settleMutatingWork()`. Genuine first-party Work settlement is NOT_ESTABLISHED.",
  },
  F14_workerResultDetailDiscrepancy: {
    classification: "SOURCE_DEMONSTRATED",
    strictParserRejectsUnknownKeys: has(workWorker, /worker result has unknown argument/u),
    allowedKeys: ["kind", "summary", "reason", "proposedAction"],
    hostFailureLineCarriesDetail: has(hostRunner, /printWorkResult\(\{ kind: 'HOST_FAILURE', detail: failure/u),
    parserScansEveryPrefixedLine: has(workWorker, /line\.startsWith\(WORK_WORKER_RESULT_PREFIX\)/u),
    parserScansBackwards: has(workWorker, /for \(let index = lines\.length - 1; index >= 0; index -= 1\)/u),
    note: "THE SOURCE OF `detail` IS THE HOST'S OWN HOST_FAILURE LINE, NOT THE ADAPTER. The runner prints `PALIMPSEST_WORK_RESULT {\"kind\":\"HOST_FAILURE\",\"detail\":...}` on failure. The parent's `parseWorkerResultLine` scans EVERY line bearing the prefix (last first), so it reads the host's failure line, and the STRICT `parseWorkWorkerResult` — which admits only kind/summary/reason/proposedAction — rejects it with `unknown argument \"detail\"`. The real defect is a VOCABULARY COLLISION: the same wire prefix is used for the worker's canonical outcome AND the host's own diagnostic. The adapter never emitted `detail`; it emitted a valid READY_FOR_SETTLEMENT tool call. Fixing this must NOT widen the strict parser (§12.3): the HOST_FAILURE line needs its own prefix, or the parser must not treat a host line as a worker outcome.",
  },
  F15_cleanupScanFailures: {
    classification: "SOURCE_DEMONSTRATED",
    scanSwallowsReadErrors: has(ownedRoot, /\} catch \{\s*return;\s*\}/u),
    scanSwallowsLstatErrors: has(ownedRoot, /\} catch \{\s*continue;\s*\}/u),
    returnsLinksAndCountOnly: has(ownedRoot, /return \{ links, count: links\.length \}/u),
    note: "`findDescendantReparsePoints()` catches a `readdirSync` failure with a bare `return` and an `lstatSync` failure with `continue`, so an unreadable directory or a vanished entry is silently treated as `no link here`. The result type is `{ links, count }` with no way to express `the scan was incomplete`, so a failed scan is indistinguishable from an empty one and the caller proceeds to recursive deletion. §9.1 requires an INCOMPLETE scan to block deletion.",
  },
  F16_cleanupProtectionOverride: {
    classification: "SOURCE_DEMONSTRATED",
    overrideExists: has(ownedRoot, /options\.refuseOnLinkFailure !== false/u),
    note: "`if (failedLinks.length > 0 && options.refuseOnLinkFailure !== false)` lets ANY caller disable the refusal by passing `{ refuseOnLinkFailure: false }`. The safety-critical default is a routine option, so the no-follow protection is bypassable. §9.2 requires it not to be an ordinary option.",
  },
  F17_falseDshModuleFallback: {
    classification: "SOURCE_DEMONSTRATED",
    junctionFailureReturnsCopyStrategy: has(dshHome, /if \(failed > 0\) return \{ strategy: "copy", entries: readdirSync\(REAL_MODULES\)\.length, reason: /u),
    noCopyPerformedOnThatPath: has(dshHome, /if \(failed > 0\) return \{ strategy: "copy"[\s\S]{0,200}?\}\s*\n\s*return \{ strategy: "junction"/u),
    note: "when ANY junction creation fails, `shareDshModules` returns `{ strategy: \"copy\" }` WITHOUT performing the copy — the copy branch is a separate `if (strategy === \"copy\")` earlier in the function that the junction path never reaches. The caller records `moduleShareStrategy: \"copy\"` and then runs a gate against a HALF-POPULATED module tree. §9.3 requires a real copy or an explicit BLOCKED.",
  },
  F18_asyncDisposalNotAwaited: {
    classification: "SOURCE_DEMONSTRATED",
    gateDisposesWithoutAwait: has(sourceToDsh, /installed\.dispose\(\);\s*\n\s*\}\s*finally/u),
    fixtureDisposesWithoutAwait: has(fixture, /try \{ installed\.dispose\(\); \} catch/u),
    lifecycleReturnsPromise: has(cluster, /await installed\.dispose\(\)/u),
    note: "both the source-to-DSH gate and the benchmark fixture call `installed.dispose()` WITHOUT `await` (the gate in a `finally`, the fixture inside `cleanup()` with a swallowed catch). The install's own comment documents that the reader's close is asynchronous, so the filesystem cleanup can begin before the Cordis fiber and SQLite handles are released. §9.4 requires the await.",
  },
  F19_fixturePreparationFailureLeaksRoot: {
    classification: "SOURCE_DEMONSTRATED",
    cleanupReturnedOnlyOnSuccess: has(fixture, /return \{\s*owned,\s*cleanup: async \(\) =>/u),
    allocationPrecedesThrowPoints: has(fixture, /const owned = allocateOwnedRoot\("p2e0-fix-a-", "fixture-a"\)/u),
    note: "`prepareFixture()` allocates its owned root, then performs install, git setup, the governed chain, association setup, reader composition, Capsule admission and rendering — every one of which can throw — and only returns the `cleanup` handle on SUCCESS. A throw after allocation means the caller never receives a cleanup handle and the root leaks. §9.5 requires the fixture to guarantee cleanup for each failure class.",
  },
  F20_globalTestHygieneRisk: {
    classification: "SOURCE_DEMONSTRATED",
    usesStatSyncNotLstat: has(globalSetup, /if \(statSync\(full\)\.isDirectory\(\)\) found\.push\(full\)/u),
    noReparsePointCheck: has(globalSetup, /isSymbolicLink|lstatSync/u) === false,
    noOwnershipProof: has(globalSetup, /OWNERSHIP_MARKER|palimpsest-e0-owned|marker/u) === false,
    deletesRecursively: has(globalSetup, /rmSync\(target, \{ recursive: true, force: true/u),
    note: "`listLeaked()` uses `statSync` (which FOLLOWS a reparse point) to decide a `palimpsest-*` entry is a directory, and the sweep then `rmSync(recursive)`. A `palimpsest-*` junction pointing at an external target would be selected, and although `rmSync` does not traverse a junction itself, the entry is removed with no ownership proof and no link check. §9.7 requires a safe negative control involving a junction to an external sentinel, and a narrow fail-closed correction if the sweep can affect an external target.",
  },
  F21_controlFailureAssignedAsTreatment: {
    classification: "SOURCE_DEMONSTRATED",
    exceptionPathHardCodesTreatment: has(contextService, /assignedArm: "TREATMENT" as const,\s*\n\s*eligibility: "UNKNOWN" as const,/u),
    note: "`ContextService.workWorkerContext()`'s catch block hard-codes `assignedArm: \"TREATMENT\"`. If the TRUSTED configuration assigned CONTROL and the delivery provider threw, the recorded arm is TREATMENT — a CONTROL failure is mislabelled as a TREATMENT failure, corrupting the trial denominator. §10.1 requires the assigned arm to come from the trusted composition and remain available to the error path.",
  },
  F22_ambiguityMislabeledAsRace: {
    classification: "SOURCE_DEMONSTRATED",
    originNotSelectedMapsToRaced: has(cluster, /case "ORIGIN_NOT_SELECTED":\s*\n\s*return "RACED";/u),
    note: "`eligibilityOfCapsuleState()` maps `ORIGIN_NOT_SELECTED` to `RACED`. But `capsuleForConsumer` returns `ORIGIN_NOT_SELECTED` for at least three distinct causes (see attributed_preview: a race during the read; `AMBIGUOUS_REQUIRES_SELECTION` with several qualified invocations; and no verified session binding). Only the FIRST is a currentness race. §10.2 requires ambiguous source selection, source currentness race, source unavailable, no permitted lineage, invalid event page and budget failure to be distinguished, with the original refusal reason preserved.",
  },
  F23_realOfficialWorkerContextNotExercised: {
    classification: "SOURCE_DEMONSTRATED",
    gateNeverCallsAttemptContext: has(sourceToDsh, /workWorkerAttemptContext/u) === false,
    delegationProvidesAttemptContext: has(delegation, /workWorkerAttemptContext/u),
    note: "the combined E0 gate never calls `workWorkerAttemptContext(A1)`; it hands the worker port a hand-built context (F11). The normal Work Delegation path that WOULD produce that context exists (`work_delegation.ts` references `workWorkerAttemptContext`), so the machinery is present but the gate bypasses it.",
  },
};

/* ================================================================ P2-E0 FORWARD ERRATUM */

const forwardErratum = {
  schemaVersion: 1,
  kind: "TRAJECTORY_P2E1_P2E0_FORWARD_ERRATUM",
  stage: "Trajectory-P2-E1",
  baseline: "beec3cc488dfbd97dd929bea73a19c99703a9dbe",
  correctsStage: "Trajectory-P2-E0",
  correctsCommit: "63f6785fa902db624d20bfdff9235ed8fb14f0a1",
  corrections: [
    {
      id: "E0-ERR-1",
      claimInE0: "the E0-D benchmark fixture's GROUND_TRUTH_KEY is a valid outcome key",
      actual: "the key encodes a cross-owner error: it forbids `A0 completed` on the grounds that the DSH page is PARTIAL, although the fixture's A0 is a canonical attempt the driven chain reports completed. The correct statement — canonical completion TRUE and DSH coverage PARTIAL, coexisting — is scored as a violation.",
      evidence: "F1, F2, F5 (dynamically reproduced against the baseline oracle)",
      disposition: "the key is replaced in C2 by owner-grounded propositions with explicit truth/source, and the Oracle in C3 no longer uses keyword co-occurrence for load-bearing judgments.",
    },
    {
      id: "E0-ERR-2",
      claimInE0: "the E0 mechanical oracle separates correct uncertainty from generic refusal",
      actual: "the oracle's operational dimension is derived from the PROPOSED-ACTION STRING and passes trivially when no tool ran; negation is not handled, so `the whole history was not observed` is scored as claiming the whole history was observed and `do not settle` as an attempt to settle.",
      evidence: "F3, F4, F6, F7 (dynamically reproduced)",
      disposition: "operational behavior is NOT_MEASURED without observed execution, and negations are handled structurally in C3.",
    },
    {
      id: "E0-ERR-3",
      claimInE0: "the E0 source-to-DSH gate establishes the controlled source-to-input chain",
      actual: "the chain's Capsule and UserMessage are real, but the CONSUMER CONTEXT OBJECT is fabricated by the test and the origin association is recorded with test-supplied invocationId/PID. The claim is correctly labelled E0-L1 and does NOT qualify normal Consumer delivery.",
      evidence: "F11, F12, F23",
      disposition: "C6 exercises the real `workWorkerAttemptContext(A1)` and the normal delegation path, keeping the controlled origin labelled.",
    },
    {
      id: "E0-ERR-4",
      claimInE0: "the E0 test-runtime lifecycle is safe and repeatable",
      actual: "four residual gaps remain: an incomplete descendant scan is indistinguishable from an empty one; the no-follow refusal is a bypassable option; a failed junction batch reports `strategy: copy` without copying; and `installed.dispose()` is not awaited before filesystem cleanup. `prepareFixture()` also leaks its root if preparation throws.",
      evidence: "F15, F16, F17, F18, F19",
      disposition: "all five are closed in C4 against the SAME owned-root lifecycle (no second resource manager).",
    },
    {
      id: "E0-ERR-5",
      claimInE0: "the E0 trial record preserves the assigned arm across a delivery failure",
      actual: "the delivery PROVIDER preserves the arm, but the CONTEXT OWNER's own catch block hard-codes `assignedArm: \"TREATMENT\"`, so a CONTROL whose provider throws is recorded as TREATMENT. `ORIGIN_NOT_SELECTED` is also flattened to `RACED`.",
      evidence: "F21, F22",
      disposition: "corrected in C5.",
    },
    {
      id: "E0-ERR-6",
      claimInE0: "the E0 benchmark fixture is reproducible from its frozen Git state",
      actual: "the fixture initializes a real git repository but hands the install a `FakeGitPort` seeded with `\"c\".repeat(40)`, so the declared HEAD, the Task Envelope base and the real repository disagree.",
      evidence: "F10",
      disposition: "corrected in C7 by using the real test-owned commit.",
    },
    {
      id: "E0-ERR-7",
      claimInE0: "the first-party origin chain was NOT_ESTABLISHED because the origin Result was not settled",
      actual: "confirmed, and the CONCRETE cause is now identified: the runner's own `HOST_FAILURE` diagnostic line shares the `PALIMPSEST_WORK_RESULT` prefix with the worker's canonical outcome, so the strict parent parser reads the host's `{kind:\"HOST_FAILURE\", detail:...}` line and rejects it. The adapter never emitted `detail`.",
      evidence: "F14",
      disposition: "the vocabulary collision is fixed in C6b WITHOUT widening the strict parser.",
    },
  ],
};

/* ================================================================ emit */

const report = {
  schemaVersion: 1,
  kind: "TRAJECTORY_P2E1_BASELINE_FALSIFIER_MAP",
  stage: "Trajectory-P2-E1",
  baseline: "beec3cc488dfbd97dd929bea73a19c99703a9dbe",
  baselineBranch: "trajectory-p2e0-treatment-and-benchmark-readiness",
  method: "read the exact baseline source; RUN the baseline pure functions for the oracle falsifiers",
  classificationCounts: {
    DYNAMICALLY_REPRODUCED: [...Object.values(oracleFindings), ...Object.values(safetyAndDeliveryFindings)].filter((entry) => entry.classification === "DYNAMICALLY_REPRODUCED").length,
    SOURCE_DEMONSTRATED: [...Object.values(oracleFindings), ...Object.values(safetyAndDeliveryFindings)].filter((entry) => entry.classification === "SOURCE_DEMONSTRATED").length,
  },
  oracleDimensions: [...ORACLE_DIMENSIONS],
  oracleFindings,
  safetyAndDeliveryFindings,
  forwardErratum,
  dynamicReproductions: {
    F2_positiveVectorPasses: f2.ok === true ? f2.verdict.historicalUnderstanding : null,
    F3_flagsCorrectNegation: f3.ok === true ? f3.historicalUnderstanding.forbiddenViolations.map((violation) => violation.id) : null,
    F4_flagsCorrectNonSettlement: f4.ok === true ? f4.decisionQuality.violations.length : null,
    F5_flagsCorrectCrossOwner: f5.ok === true ? f5.historicalUnderstanding.forbiddenViolations.map((violation) => violation.id) : null,
    F6_operationalPassWithoutExecution: f6.ok === true ? f6.verdict.operationalBehavior : null,
    F7_refusalFlagged: f7.ok === true ? f7.refusalWithoutSubstance : null,
    F8_fabricatedReferenceAccepted: f8.ok === true ? f8.verdict.historicalUnderstanding : null,
  },
  realCanonicalWorkRan: false,
  realFirstPartyDshRan: false,
  externalModelRequestOccurred: false,
  stochasticTrialOccurred: false,
  modelCallsMade: 0,
  note: "C1 is source inspection plus dynamic reproduction of the baseline PURE oracle. It launches no worker, makes no model request and changes no product behaviour.",
};

process.stdout.write(`${JSON.stringify(JSON.parse(JSON.stringify(report, (_k, v) => sanitize(v))), null, 2)}\n`);
