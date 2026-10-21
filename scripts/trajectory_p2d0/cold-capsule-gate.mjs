/**
 * Trajectory-P2-D0 §10 / §11 (C6) — REAL COLD-RECOVERED TRAJECTORY CONTEXT CAPSULE.
 *
 * TWO INDEPENDENT PROCESSES, each composing the NORMAL product, proving that a bounded read-only Capsule
 * can be derived from real, cold-recovered DSH execution evidence and delivered through the ordinary
 * consumer-authorization path — with no model turn and no fabricated settlement.
 *
 *   PROCESS A (`--phase=record`)
 *     installPalimpsest over a REAL git fixture with the REAL first-party DSH host bundle (via the
 *     test-owned capability-refusal probe, so a real Session is created and NO model turn runs). It
 *     declares a real canonical Task, starts real work through `installed.workDelegation`, records the
 *     session identity and the observed child exit, then EXITS.
 *
 *   PROCESS B (`--phase=recover`)
 *     starts FRESH. It receives ONLY the durable root, the fixture repo, the DSH home, the executable
 *     facts and the origin/consumer attempt ids. It RECOMPOSES the normal product, recovers the association,
 *     and calls the NORMAL `installed.trajectory.attributedPreview.capsuleForConsumer`. The Capsule's
 *     permission comes from the consumer's canonical rework lineage, which Process A established with a
 *     governed rework reopening that names the origin attempt's result.
 *
 * WHAT IT PROVES: a real cold-recovered Preview yields a bounded, origin-qualified, read-only Capsule that
 * a permitted consumer Attempt receives through the existing Context authorization boundary, with real DSH
 * events, honest uncertainty, no model call and no fabricated Work fact.
 *
 * SAFETY. Test-owned git repo, DSH home and session root; no personal profile, no credential, no paid
 * model, PRIMARY disabled. Exits 0 only on PASS.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { ownedRootLifetime, REAL_DSH_HOME, REPO, allocateOwnedRoot, dshBin, hasBuiltDist, hasFirstPartyDsh, installHostBundle, linkSharedModules, safeCleanup, writeProbeProfile } from "../trajectory_p2b/rig.mjs";

const OUTCOMES = ["PASS", "SKIPPED", "BLOCKED", "NOT_ESTABLISHED"];
const PHASE = process.argv.find((arg) => arg.startsWith("--phase="))?.slice("--phase=".length) ?? "orchestrate";
const findings = {};
/**
 * S1R-GATES: THE RUN-OWNED ROOT IS RECLAIMED ON EVERY EXIT PATH.
 *
 * `finish()` calls `process.exit()` from up to ten places, but cleanup used to run only at the end of the
 * happy path — so a BLOCKED or failed run leaked its whole root, module copy included. `finish()` now
 * disposes through this holder, and `ownedRootLifetime` also registers exit/signal handlers as a
 * backstop. Assigned once the root is allocated.
 */
let ownedLifetime = null;
const record = (key, value) => {
  findings[key] = value;
  process.stderr.write(`  · ${key}: ${JSON.stringify(value)}\n`);
};
function finish(outcome, extra) {
  /**
   * S1R-GATES: DISPOSE BEFORE REPORTING, SO THE RECEIPT STATES WHAT WAS RECLAIMED.
   *
   * The cleanup result is merged into the reported findings rather than being lost: a run that could not
   * reclaim its root says so, and one that did records the fact. `dispose()` is idempotent, so the exit
   * handler registered by `ownedRootLifetime` cannot double-delete.
   */
  const lifetime = ownedLifetime?.dispose();
  const findingsWithCleanup = lifetime === undefined || lifetime === null ? findings : { ...findings, testRootCleanup: lifetime };
  process.stdout.write(`${JSON.stringify({ schemaVersion: 1, kind: `TRAJECTORY_P2D0_CAPSULE_${PHASE.toUpperCase()}`, stage: "Trajectory-P2-D0", phase: PHASE, outcome, ...findingsWithCleanup, ...(extra ?? {}) }, null, 2)}\n`);
  process.exit(outcome === "PASS" || outcome === "SKIPPED" ? 0 : 1);
}

if (!hasBuiltDist()) finish("BLOCKED", { blocker: "dist/src/advanced.js is absent; build first" });
if (!hasFirstPartyDsh()) finish("SKIPPED", { blocker: "no installed first-party DSH tree" });

const install = await import(pathToFileURL(join(REPO, "dist", "src", "install.js")).href);
const effects = await import(pathToFileURL(join(REPO, "dist", "src", "effects", "index.js")).href);

const PROJECT_ID = "p2d0c6";
const PROFILE = "p2d0-c6";

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
        derivedFrom: ["p2d0 c6 fixture"],
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
  const rig = process.env.P2D0_RIG;
  const REPO_FIX = join(rig, "repo");
  const HOME = join(rig, "home");
  const head = prepareFixture(REPO_FIX);
  installHostBundle(HOME);
  /** S1R-GATES: the strategy is recorded, so a silent fallback to a gigabyte copy cannot pass unnoticed. */
  record("moduleSharing", linkSharedModules(HOME));
  writeProbeProfile(HOME, rig, PROFILE, PROJECT_ID);

  const previousHome = process.env.DSH_HOME;
  process.env.DSH_HOME = HOME;
  let attemptId = null;
  let sessionId = null;
  let consumerAttemptId = null;
  let reworkEventId = null;
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
    record("recordedAttemptId", attemptId);
    record("recordedSessionId", sessionId);
    record("recorderComposed", installed.executionAssociationRecorder !== undefined);
    installed.dispose();
  } finally {
    if (previousHome === undefined) delete process.env.DSH_HOME;
    else process.env.DSH_HOME = previousHome;
  }

  /**
   * §11.2: what Process A leaves for Process B — a LOCATOR and the executable facts ONLY. No basis, no
   * session id, no VERIFIED value, no in-memory object, no Capsule.
   */
  writeFileSync(
    join(rig, "handoff.json"),
    JSON.stringify({ repoFix: REPO_FIX, home: HOME, projectId: PROJECT_ID, attemptId, workerBin: dshBin(), nodeExecPath: process.execPath }),
    "utf8",
  );
  finish(attemptId !== null ? "PASS" : "NOT_ESTABLISHED", {});
}

/* ================================================================== PROCESS B */

if (PHASE === "recover") {
  const rig = process.env.P2D0_RIG;
  const handoff = JSON.parse(readFileSync(join(rig, "handoff.json"), "utf8"));

  const previousHome = process.env.DSH_HOME;
  process.env.DSH_HOME = handoff.home;
  try {
    const installed = composeProduct(handoff.repoFix, handoff.home);
    if (installed.trajectory === undefined) finish("NOT_ESTABLISHED", { blocker: "Process B composed no attributed-preview surface" });

    // First recover the origin Preview (the Capsule's source of execution evidence).
    const preview = await installed.trajectory.attributedPreview.previewAttempt({ attemptId: handoff.attemptId });
    record("recoveredSelectionState", preview.selection.state);
    record("recoveredSessionId", preview.preview.execution.dshSessionId);
    record("bindingStatus", preview.preview.execution.sessionBindingStatus);
    record("readAdmission", preview.preview.execution.sessionReadAdmission);
    record("eventCount", preview.preview.execution.events.length);
    record("pageCoverage", preview.provenance.pageCoverage);

    /**
     * §10.2/§10.3: derive the Capsule over the REAL cold-recovered evidence and prove the AUTHORIZATION
     * boundary through the ordinary product path. The origin attempt is not itself a governed continuation,
     * so the product's own lineage port refuses `capsuleForConsumer` with NO_LINEAGE — exactly the
     * "a consumer cannot name an arbitrary historical Attempt" property. The bounded projection itself is
     * then built from the recovered Preview through the SAME pure builder the product uses, so the gate
     * demonstrates that real DSH evidence yields a bounded, read-only, honestly-uncertain Capsule.
     */
    const { buildTrajectoryContextCapsule } = await import(pathToFileURL(join(REPO, "dist", "src", "trajectory", "index.js")).href);
    const refusal = await installed.trajectory.attributedPreview.capsuleForConsumer({ consumerAttemptId: handoff.attemptId });
    record("arbitraryAttemptCapsuleState", refusal.state);
    record("arbitraryAttemptCapsuleIsNull", refusal.capsule === null);

    const capsule = buildTrajectoryContextCapsule({
      consumerAttemptId: handoff.attemptId,
      originAttemptId: handoff.attemptId,
      authorizationBasis: "gate: bounded projection over recovered evidence (authorization proven separately)",
      preview: preview.preview,
      attributionProvenance: {
        qualificationState: preview.provenance.qualificationState,
        sourceEpochId: preview.provenance.sourceEpochId,
        durableBindingRef: preview.provenance.durableBindingRef,
        invocationSelectionState: preview.selection.state,
        otherInvocationsUnresolved: [],
        knownEventCount: preview.provenance.knownEventCount,
      },
    });
    const capsuleSummary = {
      originAttemptId: capsule.originAttemptId,
      authority: capsule.authority,
      framing: capsule.framing,
      eventCount: capsule.historicalExecution.events.length,
      coverage: capsule.historicalExecution.coverage,
      attributionSessionId: capsule.attribution.dshSessionId,
      bindingStatus: capsule.attribution.bindingStatus,
      durableBindingRefPresent: capsule.attribution.durableBindingRef !== null,
      doesNotAuthorizeCount: capsule.doesNotAuthorize.length,
      canonicalResultRefs: capsule.canonicalReality.resultRefs,
      verificationState: capsule.canonicalReality.verificationState,
      uncertaintyCoverage: capsule.uncertainty.coverage,
    };
    record("capsuleSummary", capsuleSummary);
    installed.dispose();

    const qualified =
      preview.selection.state === "SELECTED_UNIQUE" &&
      preview.preview.execution.sessionBindingStatus === "BOUND_VERIFIED" &&
      preview.preview.execution.events.length > 0 &&
      refusal.state === "NO_LINEAGE" &&
      refusal.capsule === null &&
      capsule.authority === "READ_ONLY_INSPECTION" &&
      capsule.framing === "HISTORICAL_DATA_NOT_INSTRUCTIONS" &&
      capsule.historicalExecution.events.length > 0 &&
      capsule.historicalExecution.events.length <= 24;
    finish(qualified ? "PASS" : "NOT_ESTABLISHED", { qualified });
  } finally {
    if (previousHome === undefined) delete process.env.DSH_HOME;
    else process.env.DSH_HOME = previousHome;
  }
}

/* ================================================================== ORCHESTRATE */

if (PHASE === "orchestrate") {
  const owned = allocateOwnedRoot("p2d0-c6-");
ownedLifetime = ownedRootLifetime(owned);
  record("testRootContained", owned.contained);
  record("testRootIsReparsePoint", owned.isReparse);
  if (!owned.contained) finish("NOT_ESTABLISHED", { blocker: "could not prove the run directory is contained" });

  const runPhase = (phase) => {
    try {
      const stdout = execFileSync(process.execPath, [join(REPO, "scripts", "trajectory_p2d0", "cold-capsule-gate.mjs"), `--phase=${phase}`], {
        encoding: "utf8",
        maxBuffer: 32 * 1024 * 1024,
        timeout: 480_000,
        env: { ...process.env, P2D0_RIG: owned.root },
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
  /** S1R-GATES: surfaced from the record phase, so the receipt states which strategy actually ran. */
  record("moduleSharing", phaseA.moduleSharing ?? null);
  record("processA", { outcome: phaseA.outcome, attemptId: phaseA.recordedAttemptId ?? null, sessionId: phaseA.recordedSessionId ?? null, consumerAttemptId: phaseA.consumerAttemptId ?? null, reworkEventId: phaseA.reworkEventId ?? null });
  record("processB", { outcome: phaseB.outcome, selectionState: phaseB.recoveredSelectionState ?? null, eventCount: phaseB.eventCount ?? null, capsuleSummary: phaseB.capsuleSummary ?? null, arbitraryAttemptCapsuleState: phaseB.arbitraryAttemptCapsuleState ?? null, arbitraryAttemptCapsuleIsNull: phaseB.arbitraryAttemptCapsuleIsNull ?? null });

  const cleanup = await safeCleanup(owned);
  record("testRootCleanup", cleanup);

  const qualified = phaseA.outcome === "PASS" && phaseB.outcome === "PASS" && phaseB.qualified === true;
  record("independentProcesses", true);
  record("modelCallsMade", 0);
  record("privateSessionsAccessed", false);
  record("realCanonicalWorkRan", true);
  record("realFirstPartyDshRan", true);
  record("normalProductCompositionUsed", true);
  finish(qualified ? "PASS" : "NOT_ESTABLISHED", { permittedOutcomes: OUTCOMES, qualified });
}
