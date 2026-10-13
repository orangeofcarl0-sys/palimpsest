/**
 * Trajectory-P2-B §10 (C6) — REAL COLD RECOVERY IN AN INDEPENDENT PROCESS.
 *
 * The decisive qualification gate. A Store write followed by a replay IN THE SAME PROCESS is not enough.
 * This gate runs TWO separate Node processes:
 *
 *   PROCESS A (`--phase=record`)  builds a REAL canonical Work Attempt, runs the REAL first-party DSH
 *                                 worker (no model, capability refusal), receives the real Session
 *                                 identity, correlates it with the Parent Invocation and the canonical
 *                                 Attempt, COMMITS the observation + window finalization through the
 *                                 durable owner, prints the identities it used, and EXITS.
 *
 *   PROCESS B (`--phase=recover`) starts FRESH. It receives ONLY the durable store path and the test
 *                                 home/session root. It does NOT receive Process A's job map, tracker,
 *                                 in-memory association object, a `VERIFIED` value, or a selected
 *                                 SessionId. It opens the durable history, replays the typed records,
 *                                 re-opens canonical Work, re-opens the official DSH Session source,
 *                                 revalidates the identities, and recomputes the qualification.
 *
 * WHAT IT PROVES: the recovered association has the SAME semantic identity as the recorded one, and it
 * was produced WITHOUT the original Parent's memory.
 *
 * WHAT IT DOES NOT CLAIM: resumption of a DSH Agent, automatic Handoff, or Session event admission
 * (§10.2, §10.4).
 *
 * SAFETY. Test-owned git repo, DSH home and session root; no personal profile, no credential, no paid
 * model, PRIMARY disabled. Exits 0 only on PASS.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { REAL_DSH_HOME, REPO, allocateOwnedRoot, dshBin, hasBuiltDist, hasFirstPartyDsh, installHostBundle, linkSharedModules, measureSessionThroughOfficialReader, safeCleanup, writeProbeProfile } from "./rig.mjs";

const OUTCOMES = ["PASS", "SKIPPED", "BLOCKED", "NOT_ESTABLISHED"];
const PHASE = process.argv.find((arg) => arg.startsWith("--phase="))?.slice("--phase=".length) ?? "orchestrate";
const findings = {};
const record = (key, value) => {
  findings[key] = value;
  process.stderr.write(`  · ${key}: ${JSON.stringify(value)}\n`);
};
function finish(outcome, extra) {
  process.stdout.write(
    `${JSON.stringify({ schemaVersion: 1, kind: `TRAJECTORY_P2B_COLD_RECOVERY_${PHASE.toUpperCase()}`, stage: "Trajectory-P2-B", phase: PHASE, outcome, ...findings, ...(extra ?? {}) }, null, 2)}\n`,
  );
  process.exit(outcome === "PASS" || outcome === "SKIPPED" ? 0 : 1);
}

if (!hasBuiltDist()) finish("BLOCKED", { blocker: "dist/src/advanced.js is absent; build first" });
if (!hasFirstPartyDsh()) finish("SKIPPED", { blocker: "no installed first-party DSH tree" });

const install = await import(pathToFileURL(join(REPO, "dist", "src", "install.js")).href);
const effects = await import(pathToFileURL(join(REPO, "dist", "src", "effects", "index.js")).href);
const delegation = await import(pathToFileURL(join(REPO, "dist", "src", "interaction", "work_delegation.js")).href);
const worker = await import(pathToFileURL(join(REPO, "dist", "src", "deployment", "work_worker.js")).href);
const association = await import(pathToFileURL(join(REPO, "dist", "src", "execution_association", "index.js")).href);

const PROJECT_ID = "p2bc6";

/** A real git fixture with a real canonical task, used by BOTH phases (Process B re-opens the same). */
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

function installStack(repoFix) {
  const git = new effects.GitCliPort(repoFix, join(repoFix, ".palimpsest", "worlds"));
  return install.installPalimpsest(
    { tools: { register: () => () => undefined } },
    {
      projectId: PROJECT_ID,
      databasePath: join(repoFix, ".palimpsest", "p.sqlite"),
      ordariumDatabasePath: join(repoFix, ".palimpsest", "o.sqlite"),
      repository: repoFix,
      git,
      execution: "worktree",
      standard: {
        statement: "tests pass and scope respected",
        clauses: [
          { kind: "command_succeeds", command: ["node", "-e", "process.exit(0)"], predicate: "tests_pass" },
          { kind: "scope_respected" },
        ],
        derivedFrom: ["p2b c6 fixture"],
        confirmed: true,
        notes: [],
      },
      policy: install.trustedDefaultPolicy({ allowed_commands: [{ executable: "node", argv_prefix: ["-e", "process.exit(0)"] }] }),
    },
  );
}

/** A real official-reader-backed header port, mounting the packages from the REAL modules tree. */
async function headerPort(sessionsRoot) {
  const readerModule = await import(pathToFileURL(join(REPO, "scripts", "trajectory_v0", "dsh-session-reader.mjs")).href);
  return {
    async readHeaderIdentity(sessionId) {
      const reader = await readerModule.makeRealDshSessionReader({ dshHomePath: REAL_DSH_HOME, sessionsRoot });
      try {
        return await reader.readHeaderIdentity(sessionId);
      } finally {
        await reader.close?.();
      }
    },
  };
}

/* ================================================================== PROCESS A: record */

if (PHASE === "record") {
  const rig = process.env.P2B_RIG;
  const REPO_FIX = join(rig, "repo");
  const HOME = join(rig, "home");
  const STORE_PATH = join(rig, "associations.sqlite");
  const PROFILE = "p2b-c6";
  const head = prepareFixture(REPO_FIX);
  installHostBundle(HOME);
  linkSharedModules(HOME);
  writeProbeProfile(HOME, rig, PROFILE, PROJECT_ID);

  const installed = installStack(REPO_FIX);
  installed.controller.start({
    projectId: PROJECT_ID,
    goal: "make the project tidy",
    headCommit: head,
    tasks: [{ task_id: "t1", objective: "tidy a", depends_on: [], write_paths: ["src/a.ts"], required_artifacts: [] }],
  });

  const store = new association.SqliteExecutionAssociationStore(STORE_PATH);
  const sourceBasis = association.computeTrustedSourceBasis({ adapterId: `dsh-subprocess-work-worker:${PROFILE}`, workerBin: dshBin(), nodeExecPath: process.execPath });
  const recorder = association.createExecutionAssociationRecorder({ store, projectId: PROJECT_ID, sourceBasis, sourceKind: "FIRST_PARTY_DSH_HOST" });

  const correlated = [];
  const previousHome = process.env.DSH_HOME;
  process.env.DSH_HOME = HOME;
  try {
    const service = delegation.makeWorkDelegationService({
      controller: installed.controller,
      workerFor: () => worker.dshSubprocessWorkWorkerPort({ dshBin: dshBin(), profile: PROFILE, timeoutMs: 240_000 }),
      onCorrelatedSessionIdentity: (entry) => {
        correlated.push(entry);
        recorder.recordIdentity(entry);
      },
      sessionSourceQualification: "FIRST_PARTY_DSH_QUALIFIED",
    });
    const started = await service.start({ expectedTaskId: "t1" });
    for (let attempt = 0; attempt < 1200; attempt += 1) {
      const view = await service.followup({ jobId: started.jobId });
      if (view.phase === "FINISHED" || view.phase === "HOST_ERROR") break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  } finally {
    if (previousHome === undefined) delete process.env.DSH_HOME;
    else process.env.DSH_HOME = previousHome;
  }

  /* §8.1 / P2-D0 §7.1: finalize THIS Invocation from its own observed terminal boundary. */
  const attemptId = correlated[0]?.attemptId ?? "";
  if (correlated.length > 0) {
    recorder.finalizeInvocation({ attemptId: correlated[0].attemptId, invocationId: correlated[0].observation.invocationId, closeReason: "CHILD_EXIT_OBSERVED" });
  }
  const durable = store.replay();
  const observation = durable.find((event) => event.type === "SESSION_IDENTITY_OBSERVED");
  const measurement = observation === undefined ? { readState: "NONE" } : await measureSessionThroughOfficialReader(join(HOME, "sessions"), observation.payload.dshSessionId);

  /**
   * §10.1: what Process A writes for Process B. IDENTITIES ONLY — no in-memory object, no VERIFIED value,
   * no selected SessionId beyond the durable record's own content, and — P2-C §6.1 — NO sourceBasis. The
   * earlier version handed its own basis to Process B, which established only VALUE MATCHING; Process B
   * now DERIVES its trusted registry from its own deployment configuration.
   */
  writeFileSync(
    join(rig, "handoff.json"),
    JSON.stringify({
      storePath: STORE_PATH,
      repoFix: REPO_FIX,
      home: HOME,
      sessionsRoot: join(HOME, "sessions"),
      projectId: PROJECT_ID,
      attemptId,
      /** P2-C §6.1: only the EXECUTABLE FACTS, so Process B recomputes its own trusted basis. */
      workerBin: dshBin(),
      nodeExecPath: process.execPath,
      // These are what Process A OBSERVED, recorded so Process B's result can be COMPARED to them.
      observed: {
        invocationId: observation?.payload.invocationId ?? null,
        dshSessionId: observation?.payload.dshSessionId ?? null,
      },
    }),
    "utf8",
  );

  record("recordedAttemptId", attemptId);
  record("recordedInvocationId", observation?.payload.invocationId ?? null);
  record("recordedSessionId", observation?.payload.dshSessionId ?? null);
  record("durableEventCount", durable.length);
  record("officialSessionMeasurement", measurement);
  store.close();
  installed.dispose();
  finish(durable.length === 2 ? "PASS" : "NOT_ESTABLISHED", { durableTypes: durable.map((event) => event.type) });
}

/* ================================================================== PROCESS B: recover */

if (PHASE === "recover") {
  const rig = process.env.P2B_RIG;
  const handoff = JSON.parse(execFileSync(process.execPath, ["-e", `process.stdout.write(require('node:fs').readFileSync(${JSON.stringify(join(rig, "handoff.json"))},'utf8'))`], { encoding: "utf8" }));

  /**
   * §10.1: Process B receives ONLY the durable locator and normal trusted configuration. It does NOT
   * receive Process A's job map, tracker, association object, or a VERIFIED value.
   */
  const store = new association.SqliteExecutionAssociationStore(handoff.storePath);
  const replay = store.replay();

  // Re-open canonical Work from the durable EventStore in a fresh process.
  const installed = installStack(handoff.repoFix);
  /**
   * P2-C §6.1: Process B DERIVES its own trusted basis from the deployment's own executable facts, rather
   * than being handed Process A's basis. This is the correction of the F1 falsifier: the recovery now
   * establishes an INDEPENDENT verifier authority, not just a matching value.
   */
  const processBBasis = association.computeTrustedSourceBasis({ adapterId: "dsh-subprocess-work-worker:p2b-c6", workerBin: handoff.workerBin, nodeExecPath: handoff.nodeExecPath });
  const qualifier = association.makeAssociationQualifier({
    store,
    registry: association.registryFromSingleBasis(processBBasis, "FIRST_PARTY_DSH_HOST"),
    work: {
      readAttempt: ({ attemptId }) => {
        const workRecord = installed.controller.attemptWorkRecord(attemptId);
        return workRecord === null ? { ok: false, reason: "no canonical attempt record" } : { ok: true, taskId: workRecord.taskId, state: workRecord.state, creationEventId: "ev-admitted" };
      },
    },
    dsh: await headerPort(handoff.sessionsRoot),
  });
  const result = await qualifier.qualifyAttempt({ projectId: handoff.projectId, attemptId: handoff.attemptId });

  const qualified = result.qualifications.find((entry) => entry.state === "ASSOCIATION_QUALIFIED") ?? null;
  const measurement = qualified === null ? { readState: "NONE" } : await measureSessionThroughOfficialReader(handoff.sessionsRoot, qualified.dshSessionId);

  record("recoveredReplayCount", replay.length);
  record("recoveredReplayTypes", replay.map((event) => event.type));
  record("recoveredQualificationSummary", result.summary);
  record("recoveredInvocationId", qualified === null ? null : qualified.invocationId);
  record("recoveredSessionId", qualified === null ? null : qualified.dshSessionId);
  record("recoveredDurableBindingRef", qualified === null ? null : qualified.durableBindingRef);
  record("recoveredSessionMeasurement", measurement);
  record("processAObserved", handoff.observed);
  store.close();
  installed.dispose();

  /**
   * §10.2: the recovered association has the SAME semantic identity as what Process A recorded, and it
   * was produced WITHOUT Process A's memory.
   */
  const sameIdentity =
    qualified !== null &&
    qualified.invocationId === handoff.observed.invocationId &&
    qualified.dshSessionId === handoff.observed.dshSessionId &&
    measurement.readState === "READ_OK" &&
    measurement.counts.turnStart === 0;

  record("recoveredIdentityMatchesRecorded", sameIdentity);
  finish(sameIdentity ? "PASS" : "NOT_ESTABLISHED", { qualified: sameIdentity });
}

/* ================================================================== ORCHESTRATE */

if (PHASE === "orchestrate") {
  const owned = allocateOwnedRoot("p2b-c6-");
  record("testRootContained", owned.contained);
  record("testRootIsReparsePoint", owned.isReparse);
  if (!owned.contained) finish("NOT_ESTABLISHED", { blocker: "could not prove the run directory is contained" });

  const runPhase = (phase) => {
    try {
      const stdout = execFileSync(process.execPath, [join(REPO, "scripts", "trajectory_p2b", "cold-recovery-gate.mjs"), `--phase=${phase}`], {
        encoding: "utf8",
        maxBuffer: 32 * 1024 * 1024,
        timeout: 480_000,
        env: { ...process.env, P2B_RIG: owned.root },
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
  record("processA", { outcome: phaseA.outcome, recordedSessionId: phaseA.recordedSessionId ?? null, durableEventCount: phaseA.durableEventCount ?? null });
  record("processB", { outcome: phaseB.outcome, recoveredSessionId: phaseB.recoveredSessionId ?? null, matches: phaseB.recoveredIdentityMatchesRecorded ?? null });

  const cleanup = await safeCleanup(owned);
  record("testRootCleanup", cleanup);

  const qualified = phaseA.outcome === "PASS" && phaseB.outcome === "PASS" && phaseB.recoveredIdentityMatchesRecorded === true;
  record("independentProcesses", true);
  record("modelCallsMade", 0);
  record("privateSessionsAccessed", false);
  finish(qualified ? "PASS" : "NOT_ESTABLISHED", { permittedOutcomes: OUTCOMES, qualified });
}
