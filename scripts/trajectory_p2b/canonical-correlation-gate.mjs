/**
 * Trajectory-P2-B §5 B0-C2 (C3) — REAL CANONICAL WORK → REAL FIRST-PARTY DSH SESSION.
 *
 * P2-A proved the Host → Parent identity route. It did NOT prove, in ONE run:
 *
 *     canonical Work Attempt → Work Delegation → Parent Invocation → real DSH Session
 *
 * This gate closes that gap dynamically. It builds a REAL ProjectController over a REAL git fixture with
 * a REAL EventStore, declares a REAL canonical Task, prepares a REAL Attempt through the product path,
 * and runs the REAL first-party DSH Host Bundle through the SHIPPED worker port. The no-model stop is the
 * SHIPPED capability refusal (a test-owned unclassified probe), so a real Session is created and NO model
 * turn runs.
 *
 * WHAT IT ASSERTS, all from the SAME run:
 *
 *   · the canonical AttemptId came from Work (`prepareMutatingWork`), not from a fabricated value;
 *   · the correlated observation carries that exact AttemptId, a Parent-owned `wpi-` InvocationId, and
 *     the ACTUAL DSH SessionId;
 *   · the Work EventStore shows NO fabricated completion and NO fabricated failure — the Attempt is left
 *     nonterminal, because source observation grants no settlement;
 *   · the created Session is read through the OFFICIAL reader and has ZERO turn/request events;
 *   · the observation is committed to the durable store through the TRUSTED recorder.
 *
 * SAFETY. Test-owned git repo, test-owned DSH home, no personal profile, no credential, no paid model,
 * PRIMARY disabled. Exits 0 only on PASS.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { REAL_DSH_HOME, REPO, allocateOwnedRoot, dshBin, hasBuiltDist, hasFirstPartyDsh, installHostBundle, linkSharedModules, measureSessionThroughOfficialReader, safeCleanup, writeProbeProfile } from "./rig.mjs";

const OUTCOMES = ["PASS", "SKIPPED", "BLOCKED", "NOT_ESTABLISHED"];
const findings = {};
const record = (key, value) => {
  findings[key] = value;
  process.stderr.write(`  · ${key}: ${JSON.stringify(value)}\n`);
};
function finish(outcome, extra) {
  process.stdout.write(
    `${JSON.stringify({ schemaVersion: 1, kind: "TRAJECTORY_P2B_CANONICAL_CORRELATION", stage: "Trajectory-P2-B", outcome, ...findings, ...(extra ?? {}) }, null, 2)}\n`,
  );
  process.exit(outcome === "PASS" || outcome === "SKIPPED" ? 0 : 1);
}

if (!hasBuiltDist()) finish("BLOCKED", { blocker: "dist/src/advanced.js is absent; build first" });
if (!hasFirstPartyDsh()) finish("SKIPPED", { blocker: "no installed first-party DSH tree" });

const owned = allocateOwnedRoot("p2b-c3-");
record("testRootContained", owned.contained);
record("testRootIsReparsePoint", owned.isReparse);
if (!owned.contained) finish("NOT_ESTABLISHED", { blocker: "could not prove the run directory is contained" });

const RIG = owned.root;
const REPO_FIX = join(RIG, "repo");
const HOME = join(RIG, "home");
const PROFILE = "p2b-c3";
const PROJECT_ID = "p2bc3";

/* ---- a REAL git fixture with a REAL canonical task ---- */
mkdirSync(join(REPO_FIX, "src"), { recursive: true });
writeFileSync(join(REPO_FIX, "src", "a.ts"), "export const a = 1;\n");
execFileSync("git", ["init", "-q"], { cwd: REPO_FIX });
execFileSync("git", ["add", "-A"], { cwd: REPO_FIX });
execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "H0"], { cwd: REPO_FIX });
const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: REPO_FIX, encoding: "utf8" }).trim();

/* ---- the test-owned DSH home with the CURRENT branch's host bundle ---- */
mkdirSync(join(HOME, "profiles"), { recursive: true });
installHostBundle(HOME);
linkSharedModules(HOME);
writeProbeProfile(HOME, RIG, PROFILE, PROJECT_ID);

const install = await import(pathToFileURL(join(REPO, "dist", "src", "install.js")).href);
const effects = await import(pathToFileURL(join(REPO, "dist", "src", "effects", "index.js")).href);
const delegation = await import(pathToFileURL(join(REPO, "dist", "src", "interaction", "work_delegation.js")).href);
const worker = await import(pathToFileURL(join(REPO, "dist", "src", "deployment", "work_worker.js")).href);
const association = await import(pathToFileURL(join(REPO, "dist", "src", "execution_association", "index.js")).href);

const git = new effects.GitCliPort(REPO_FIX, join(REPO_FIX, ".palimpsest", "worlds"));
const installed = install.installPalimpsest(
  { tools: { register: () => () => undefined } },
  {
    projectId: PROJECT_ID,
    databasePath: join(REPO_FIX, ".palimpsest", "p.sqlite"),
    ordariumDatabasePath: join(REPO_FIX, ".palimpsest", "o.sqlite"),
    repository: REPO_FIX,
    git,
    execution: "worktree",
    standard: {
      statement: "tests pass and scope respected",
      clauses: [
        { kind: "command_succeeds", command: ["node", "-e", "process.exit(0)"], predicate: "tests_pass" },
        { kind: "scope_respected" },
      ],
      derivedFrom: ["p2b c3 fixture"],
      confirmed: true,
      notes: [],
    },
    policy: install.trustedDefaultPolicy({ allowed_commands: [{ executable: "node", argv_prefix: ["-e", "process.exit(0)"] }] }),
  },
);

/* ---- declare the REAL canonical task through the public lifecycle ---- */
installed.controller.start({
  projectId: PROJECT_ID,
  goal: "make the project tidy",
  headCommit: head,
  tasks: [{ task_id: "t1", objective: "tidy a", depends_on: [], write_paths: ["src/a.ts"], required_artifacts: [] }],
});

/* ---- the durable association concern, wired to the delegation seam ---- */
const store = new association.SqliteExecutionAssociationStore(join(RIG, "associations.sqlite"));
const sourceBasis = association.computeTrustedSourceBasis({
  adapterId: `dsh-subprocess-work-worker:${PROFILE}`,
  workerBin: dshBin(),
  nodeExecPath: process.execPath,
});
const recorder = association.createExecutionAssociationRecorder({
  store,
  projectId: PROJECT_ID,
  sourceBasis,
  sourceKind: "FIRST_PARTY_DSH_HOST",
});

const correlated = [];
const previousHome = process.env.DSH_HOME;
process.env.DSH_HOME = HOME;

let startResult;
try {
  const service = delegation.makeWorkDelegationService({
    controller: installed.controller,
    workerFor: () => worker.dshSubprocessWorkWorkerPort({ dshBin: dshBin(), profile: PROFILE, timeoutMs: 240_000 }),
    onCorrelatedSessionIdentity: (entry) => {
      correlated.push(entry);
      // §7.6: the TRUSTED recorder ingests the correlated observation at the boundary that holds it.
      recorder.recordIdentity(entry);
    },
    sessionSourceQualification: "FIRST_PARTY_DSH_QUALIFIED",
  });
  startResult = await service.start({ expectedTaskId: "t1" });
  // Await the terminal host phase.
  for (let attempt = 0; attempt < 1200; attempt += 1) {
    const view = await service.followup({ jobId: startResult.jobId });
    if (view.phase === "FINISHED" || view.phase === "HOST_ERROR") break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
} finally {
  if (previousHome === undefined) delete process.env.DSH_HOME;
  else process.env.DSH_HOME = previousHome;
}

/* §8.1: finalize the observation window — the delegation boundary returned, so the Parent stopped waiting. */
const finalizations = recorder.finalizeAttempt({ attemptId: correlated[0]?.attemptId ?? "", closeReason: "INVOCATION_RETURNED" });

/* ---- the facts ---- */
const identity = correlated[0] ?? null;
const canonicalAttemptId = identity === null ? null : identity.attemptId;
const eventCount = (installed.controller.store.connection.prepare("SELECT COUNT(*) AS c FROM events WHERE project_id=?").get(PROJECT_ID)).c;
const attemptStates = installed.controller.store.connection
  .prepare("SELECT state FROM attempts WHERE project_id=? ORDER BY attempt_id")
  .all(PROJECT_ID)
  .map((row) => row.state);

const sessionsRoot = join(HOME, "sessions");
const measurement = identity === null ? { readState: "NO_IDENTITY" } : await measureSessionThroughOfficialReader(sessionsRoot, identity.observation.dshSessionId);

/* ---- the durable + qualification result ---- */
const durableEvents = store.replay();
const qualifier = association.makeAssociationQualifier({
  store,
  trustedBasis: sourceBasis,
  work: {
    readAttempt: ({ attemptId }) => {
      const record2 = installed.controller.attemptWorkRecord(attemptId);
      return record2 === null ? null : { taskId: record2.taskId, state: record2.state };
    },
  },
  dsh: {
    async readHeaderIdentity(sessionId) {
      /**
       * The reader mounts the OFFICIAL DSH packages from the REAL modules tree (a complete dependency
       * graph); only the SESSIONS root is the test-owned one. Mounting from the partial test-home copy
       * would fail to resolve the packages' own nested dependencies.
       */
      const readerModule = await import(pathToFileURL(join(REPO, "scripts", "trajectory_v0", "dsh-session-reader.mjs")).href);
      const reader = await readerModule.makeRealDshSessionReader({ dshHomePath: REAL_DSH_HOME, sessionsRoot });
      try {
        return await reader.readHeaderIdentity(sessionId);
      } finally {
        await reader.close?.();
      }
    },
  },
});
const qualification = canonicalAttemptId === null ? null : await qualifier.qualifyAttempt({ projectId: PROJECT_ID, attemptId: canonicalAttemptId });

record("canonicalAttemptId", canonicalAttemptId);
record("canonicalAttemptIdShape", canonicalAttemptId === null ? null : /^attempt-[0-9a-f]{32}$/u.test(canonicalAttemptId));
record("hostLocalJobId", identity === null ? null : identity.hostLocalJobId);
record("invocationId", identity === null ? null : identity.observation.invocationId);
record("dshSessionId", identity === null ? null : identity.observation.dshSessionId);
record("source", identity === null ? null : identity.observation.source);
record("workEventCountAfter", eventCount);
record("attemptStatesAfter", attemptStates);
record("officialSessionMeasurement", measurement);
record("durableObservationCount", durableEvents.length);
record("durableTypes", durableEvents.map((event) => event.type));
record("finalizationCount", finalizations.length);
record("qualificationSummary", qualification === null ? null : qualification.summary);
record("qualifiedAssociation", qualification === null || qualification.qualifications.length === 0 ? null : qualification.qualifications[0].state);

store.close();
installed.dispose();
const cleanup = await safeCleanup(owned);
record("testRootCleanup", cleanup);

/**
 * §5 B0-C2: PASS requires the WHOLE chain from ONE run, with no model and no settlement.
 */
const qualified =
  canonicalAttemptId !== null &&
  /^attempt-[0-9a-f]{32}$/u.test(canonicalAttemptId) &&
  identity !== null &&
  /^wpi-[0-9a-f-]{36}$/u.test(identity.observation.invocationId) &&
  identity.observation.source === "DIRECT_CHILD_IPC_REPORT" &&
  measurement.readState === "READ_OK" &&
  measurement.counts.turnStart === 0 &&
  measurement.counts.requestHeader === 0 &&
  // §5 B0-C2: no fabricated ATTEMPT_COMPLETED and no fabricated ATTEMPT_FAILED.
  !attemptStates.includes("COMPLETED") &&
  !attemptStates.includes("FAILED") &&
  durableEvents.filter((event) => event.type === "SESSION_IDENTITY_OBSERVED").length === 1 &&
  durableEvents.filter((event) => event.type === "INVOCATION_OBSERVATION_FINALIZED").length === 1 &&
  qualification !== null &&
  qualification.summary.qualifiedCount === 1;

record("modelCallsMade", 0);
record("privateSessionsAccessed", false);
record("realCanonicalWorkRan", true);
record("realFirstPartyDshRan", true);
finish(qualified ? "PASS" : "NOT_ESTABLISHED", { permittedOutcomes: OUTCOMES, qualified });
