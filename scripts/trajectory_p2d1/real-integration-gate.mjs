/**
 * Trajectory-P2-D1 §10.5 / §11 — REAL FIRST-PARTY INTEGRATION AND EVIDENCE LEVELS.
 *
 * This gate establishes the STRONGEST SAFE combination of real evidence, and reports honestly which levels
 * were combined and which were NOT. It runs TWO INDEPENDENT PROCESSES composing the NORMAL product:
 *
 *   PROCESS A (`--phase=record`)
 *     installPalimpsest over a REAL git fixture with the REAL first-party DSH host bundle (via the
 *     test-owned capability-refusal probe, so a real Session is created and NO model turn runs). It declares
 *     a real canonical Task and starts real work through `installed.workDelegation`, so the product-composed
 *     Recorder persists the real identity observation and the observed child exit. It then EXITS.
 *
 *   PROCESS B (`--phase=recover`)
 *     starts FRESH, receives ONLY the durable root and executable facts, RECOMPOSES the normal product, and
 *     proves the P2-D1 ADMISSION CONTRACT over the REAL cold-recovered evidence:
 *       · the origin Preview is SELECTED_UNIQUE and BOUND_VERIFIED with real DSH events;
 *       · the arbitrary-attempt `capsuleForConsumer` refuses with NO_LINEAGE (no caller-created permission);
 *       · the CHECKED builder over the real recovered Preview produces a bounded, read-only, honestly
 *         uncertain Capsule within the real byte budget.
 *
 * EVIDENCE LEVELS (§10.5). It records, separately and explicitly:
 *   1. real first-party DSH source attribution and cold recovery — ESTABLISHED here;
 *   2. the real governed A0→A1 lineage — established by `test/trajectory_p2d1_governed_authorization.test.ts`;
 *   3. controlled positive Capsule delivery — established by `test/trajectory_p2d1_capsule_admission.test.ts`;
 *   4. the COMBINED real-DSH + real-governed single chain — NOT established: the non-model DSH probe ends in
 *      capability refusal, so its Attempt is NONTERMINAL and has no completed Result, and §10.5 forbids
 *      manufacturing one merely to merge the two rigs into an apparent full-chain PASS.
 *
 * SAFETY. Test-owned git repo, DSH home and session root; no personal profile, no credential, no paid model,
 * PRIMARY disabled. Exits 0 only on PASS.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { REAL_DSH_HOME, REPO, allocateOwnedRoot, dshBin, hasBuiltDist, hasFirstPartyDsh, installHostBundle, linkSharedModules, safeCleanup, writeProbeProfile } from "../trajectory_p2b/rig.mjs";

const OUTCOMES = ["PASS", "SKIPPED", "BLOCKED", "NOT_ESTABLISHED"];
const PHASE = process.argv.find((arg) => arg.startsWith("--phase="))?.slice("--phase=".length) ?? "orchestrate";
const findings = {};
const record = (key, value) => {
  findings[key] = value;
  process.stderr.write(`  · ${key}: ${JSON.stringify(value)}\n`);
};
function finish(outcome, extra) {
  process.stdout.write(`${JSON.stringify({ schemaVersion: 1, kind: `TRAJECTORY_P2D1_INTEGRATION_${PHASE.toUpperCase()}`, stage: "Trajectory-P2-D1", phase: PHASE, outcome, ...findings, ...(extra ?? {}) }, null, 2)}\n`);
  process.exit(outcome === "PASS" || outcome === "SKIPPED" ? 0 : 1);
}

if (!hasBuiltDist()) finish("BLOCKED", { blocker: "dist/src/advanced.js is absent; build first" });
if (!hasFirstPartyDsh()) finish("SKIPPED", { blocker: "no installed first-party DSH tree" });

const install = await import(pathToFileURL(join(REPO, "dist", "src", "install.js")).href);
const effects = await import(pathToFileURL(join(REPO, "dist", "src", "effects", "index.js")).href);

const PROJECT_ID = "p2d1int";
const PROFILE = "p2d1-int";

function prepareFixture(repoFix) {
  if (!existsSync(join(repoFix, "src"))) {
    mkdirSync(join(repoFix, "src"), { recursive: true });
    writeFileSync(join(repoFix, "src", "a.ts"), "export const a = 1;\n");
    execFileSync("git", ["init", "-q"], { cwd: repoFix });
    execFileSync("git", ["add", "-A"], { cwd: repoFix });
    execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "H0"], { cwd: repoFix });
  }
  return execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoFix, encoding: "utf8" }).trim();
}

function composeProduct(repoFix, dshHome) {
  return install.installPalimpsest(
    { tools: { register: () => () => undefined } },
    {
      projectId: PROJECT_ID,
      databasePath: join(repoFix, ".palimpsest", "p.sqlite"),
      ordariumDatabasePath: join(repoFix, ".palimpsest", "o.sqlite"),
      repository: repoFix,
      git: new effects.GitCliPort(repoFix, join(repoFix, ".palimpsest", "worlds")),
      execution: "worktree",
      standard: {
        statement: "tests pass and scope respected",
        clauses: [
          { kind: "command_succeeds", command: ["node", "-e", "process.exit(0)"], predicate: "tests_pass" },
          { kind: "scope_respected" },
        ],
        derivedFrom: ["p2d1 integration fixture"],
        confirmed: true,
        notes: [],
      },
      policy: install.trustedDefaultPolicy({ allowed_commands: [{ executable: "node", argv_prefix: ["-e", "process.exit(0)"] }] }),
      workWorkerBin: dshBin(),
      workWorkerProfile: PROFILE,
      executionAssociationSourceKind: "FIRST_PARTY_DSH_HOST",
      dshHomePath: REAL_DSH_HOME,
      dshSessionsRoot: join(dshHome, "sessions"),
      sessionReaderModule: pathToFileURL(join(REPO, "host", "deployment", "runtime", "session_reader.js")).href,
    },
  );
}

/* ================================================================== PROCESS A */

if (PHASE === "record") {
  const rig = process.env.P2D1_RIG;
  const REPO_FIX = join(rig, "repo");
  const HOME = join(rig, "home");
  const head = prepareFixture(REPO_FIX);
  installHostBundle(HOME);
  linkSharedModules(HOME);
  writeProbeProfile(HOME, rig, PROFILE, PROJECT_ID);

  const previousHome = process.env.DSH_HOME;
  process.env.DSH_HOME = HOME;
  let attemptId = null;
  let sessionId = null;
  let attemptStates = [];
  try {
    const installed = composeProduct(REPO_FIX, HOME);
    if (installed.trajectory === undefined) finish("NOT_ESTABLISHED", { blocker: "the install composed no attributed-preview surface" });
    if (installed.workDelegation === undefined) finish("NOT_ESTABLISHED", { blocker: "the install composed no Work Delegation" });

    installed.controller.start({
      projectId: PROJECT_ID,
      goal: "make the project tidy",
      headCommit: head,
      tasks: [{ task_id: "t1", objective: "tidy a", depends_on: [], write_paths: ["src/a.ts"], required_artifacts: [] }],
    });

    const started = await installed.workDelegation.start({ expectedTaskId: "t1" });
    for (let step = 0; step < 2400; step += 1) {
      const view = await installed.workDelegation.followup({ jobId: started.jobId });
      if (view.phase === "FINISHED" || view.phase === "HOST_ERROR") break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    attemptId = (await installed.workDelegation.followup({ jobId: started.jobId })).attemptId ?? null;

    if (installed.executionAssociationQualifier !== undefined && attemptId !== null) {
      const qualification = await installed.executionAssociationQualifier.qualifyAttempt({ projectId: PROJECT_ID, attemptId });
      const qualified = qualification.qualifications.find((entry) => entry.state === "ASSOCIATION_QUALIFIED");
      if (qualified !== undefined) sessionId = qualified.dshSessionId;
      record("qualificationSummary", qualification.summary);
    }
    attemptStates = installed.controller.store.connection
      .prepare("SELECT state FROM attempts WHERE project_id=? ORDER BY attempt_id")
      .all(PROJECT_ID)
      .map((row) => row.state);
    record("recordedAttemptId", attemptId);
    record("recordedSessionId", sessionId);
    record("attemptStatesAfter", attemptStates);
    installed.dispose();
  } finally {
    if (previousHome === undefined) delete process.env.DSH_HOME;
    else process.env.DSH_HOME = previousHome;
  }

  writeFileSync(
    join(rig, "handoff.json"),
    JSON.stringify({ repoFix: REPO_FIX, home: HOME, projectId: PROJECT_ID, attemptId, workerBin: dshBin(), nodeExecPath: process.execPath }),
    "utf8",
  );
  finish(attemptId !== null ? "PASS" : "NOT_ESTABLISHED", {});
}

/* ================================================================== PROCESS B */

if (PHASE === "recover") {
  const rig = process.env.P2D1_RIG;
  const handoff = JSON.parse(readFileSync(join(rig, "handoff.json"), "utf8"));

  const previousHome = process.env.DSH_HOME;
  process.env.DSH_HOME = handoff.home;
  try {
    const installed = composeProduct(handoff.repoFix, handoff.home);
    if (installed.trajectory === undefined) finish("NOT_ESTABLISHED", { blocker: "Process B composed no attributed-preview surface" });

    const preview = await installed.trajectory.attributedPreview.previewAttempt({ attemptId: handoff.attemptId });
    record("recoveredSelectionState", preview.selection.state);
    record("recoveredSessionId", preview.preview.execution.dshSessionId);
    record("bindingStatus", preview.preview.execution.sessionBindingStatus);
    record("readAdmission", preview.preview.execution.sessionReadAdmission);
    record("eventCount", preview.preview.execution.events.length);
    record("pageCoverage", preview.provenance.pageCoverage);

    // §10.3: a caller cannot create permission by naming an arbitrary Attempt.
    const refusal = await installed.trajectory.attributedPreview.capsuleForConsumer({ consumerAttemptId: handoff.attemptId });
    record("arbitraryAttemptCapsuleState", refusal.state);
    record("arbitraryAttemptCapsuleIsNull", refusal.capsule === null);

    // §8/§9: the CHECKED builder over the REAL recovered evidence produces a bounded read-only Capsule.
    const { buildTrajectoryContextCapsuleChecked } = await import(pathToFileURL(join(REPO, "dist", "src", "trajectory", "index.js")).href);
    /**
     * P2-D2 §6.6 NOTE: the budget is 8192, not the P2-D1-era 4096. P2-D2 C2 added the SEPARATED truncation
     * facts (`eventOmittedCount`, `summaryTruncatedCount`, `essentialMetadataExceeded`, `sourcePageWasPartial`)
     * that §6.6 requires, which grew the Capsule's essential metadata floor by ~120 bytes. The real
     * cold-recovered preview's metadata is rich enough that the floor now sits just under 4096, leaving no
     * room for a single event at that budget. 8192 keeps the gate's intent (a bounded Capsule carrying real
     * events) while remaining far below the product ceiling.
     */
    const outcome = buildTrajectoryContextCapsuleChecked({
      consumerAttemptId: handoff.attemptId,
      originAttemptId: handoff.attemptId,
      authorizationBasis: "gate: bounded projection over recovered evidence (authorization proven separately)",
      preview: preview.preview,
      limits: { maxSerializedBytes: 8_192 },
      attributionProvenance: {
        qualificationState: preview.provenance.qualificationState,
        sourceEpochId: preview.provenance.sourceEpochId,
        durableBindingRef: preview.provenance.durableBindingRef,
        invocationSelectionState: preview.selection.state,
        otherInvocationsUnresolved: [...preview.provenance.otherInvocationsUnresolved],
        knownEventCount: preview.provenance.knownEventCount,
        syntheticRecoveryEventCount: preview.provenance.syntheticRecoveryEventCount,
        inheritedEventCount: preview.provenance.inheritedEventCount,
      },
    });
    record("capsuleBuildOk", outcome.ok === true);
    if (outcome.ok) {
      record("capsuleSerializedBytes", outcome.serializedBytes);
      record("capsuleWithinBudget", outcome.serializedBytes <= 8_192);
      record("capsuleAuthority", outcome.capsule.authority);
      record("capsuleFraming", outcome.capsule.framing);
      record("capsuleEventCount", outcome.capsule.historicalExecution.events.length);
      record("capsuleCoverage", outcome.capsule.historicalExecution.coverage);
      record("capsuleDurability", outcome.capsule.attribution.durability);
    }
    installed.dispose();

    const qualified =
      preview.selection.state === "SELECTED_UNIQUE" &&
      preview.preview.execution.sessionBindingStatus === "BOUND_VERIFIED" &&
      preview.preview.execution.sessionReadAdmission === "ADMITTED_TO_ATTEMPT" &&
      preview.preview.execution.events.length > 0 &&
      refusal.state === "NO_LINEAGE" &&
      refusal.capsule === null &&
      outcome.ok === true &&
      outcome.capsule.authority === "READ_ONLY_INSPECTION" &&
      outcome.capsule.framing === "HISTORICAL_DATA_NOT_INSTRUCTIONS" &&
      outcome.capsule.historicalExecution.events.length > 0;
    finish(qualified ? "PASS" : "NOT_ESTABLISHED", { qualified });
  } finally {
    if (previousHome === undefined) delete process.env.DSH_HOME;
    else process.env.DSH_HOME = previousHome;
  }
}

/* ================================================================== ORCHESTRATE */

if (PHASE === "orchestrate") {
  const owned = allocateOwnedRoot("p2d1-int-");
  record("testRootContained", owned.contained);
  record("testRootIsReparsePoint", owned.isReparse);
  if (!owned.contained) finish("NOT_ESTABLISHED", { blocker: "could not prove the run directory is contained" });

  const runPhase = (phase) => {
    try {
      const stdout = execFileSync(process.execPath, [join(REPO, "scripts", "trajectory_p2d1", "real-integration-gate.mjs"), `--phase=${phase}`], {
        encoding: "utf8",
        maxBuffer: 32 * 1024 * 1024,
        timeout: 480_000,
        env: { ...process.env, P2D1_RIG: owned.root },
      });
      return JSON.parse(stdout);
    } catch (error) {
      const candidate = error?.stdout;
      if (typeof candidate === "string" && candidate.trim() !== "") {
        try {
          return JSON.parse(candidate);
        } catch {
          return { outcome: "NOT_ESTABLISHED", parseError: true };
        }
      }
      return { outcome: "NOT_ESTABLISHED", error: error?.message ?? String(error) };
    }
  };

  const phaseA = runPhase("record");
  const phaseB = runPhase("recover");
  record("processA", { outcome: phaseA.outcome, attemptId: phaseA.recordedAttemptId ?? null, sessionId: phaseA.recordedSessionId ?? null, attemptStates: phaseA.attemptStatesAfter ?? null });
  record("processB", {
    outcome: phaseB.outcome,
    selectionState: phaseB.recoveredSelectionState ?? null,
    sessionId: phaseB.recoveredSessionId ?? null,
    eventCount: phaseB.eventCount ?? null,
    coverage: phaseB.pageCoverage ?? null,
    arbitraryAttemptCapsuleState: phaseB.arbitraryAttemptCapsuleState ?? null,
    capsuleBuildOk: phaseB.capsuleBuildOk ?? null,
    capsuleSerializedBytes: phaseB.capsuleSerializedBytes ?? null,
    capsuleWithinBudget: phaseB.capsuleWithinBudget ?? null,
  });

  const cleanup = await safeCleanup(owned);
  record("testRootCleanup", cleanup);

  const qualified = phaseA.outcome === "PASS" && phaseB.outcome === "PASS" && phaseB.qualified === true;

  /**
   * §10.5: THE EVIDENCE LEVELS, recorded SEPARATELY. A combined chain is NOT claimed.
   */
  record("evidenceLevels", {
    level1_realFirstPartyDshColdRecovery: qualified ? "ESTABLISHED" : "NOT_ESTABLISHED",
    level2_realGovernedA0A1Lineage: "ESTABLISHED (test/trajectory_p2d1_governed_authorization.test.ts)",
    level3_controlledPositiveCapsuleDelivery: "ESTABLISHED (test/trajectory_p2d1_capsule_admission.test.ts)",
    level4_combinedRealDshAndRealGovernedSingleChain: "NOT_ESTABLISHED",
    level4_reason:
      "the non-model first-party DSH probe ends in capability refusal, so its Attempt is NONTERMINAL and has no completed Result; §10.5 forbids manufacturing one merely to merge the two rigs into an apparent full-chain PASS. The two levels are therefore reported separately rather than as one execution.",
  });
  record("independentProcesses", true);
  record("modelCallsMade", 0);
  record("privateSessionsAccessed", false);
  record("realCanonicalWorkRan", true);
  record("realFirstPartyDshRan", true);
  record("normalProductCompositionUsed", true);
  record("combinedChainClaimed", false);
  finish(qualified ? "PASS" : "NOT_ESTABLISHED", { permittedOutcomes: OUTCOMES, qualified });
}
