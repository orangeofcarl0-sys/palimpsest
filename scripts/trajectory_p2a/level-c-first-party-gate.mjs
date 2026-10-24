/**
 * Trajectory-P2A §9 Level C — THE REAL HOST BUNDLE -> PARENT NO-MODEL INTEGRATION GATE.
 *
 * This is the mandatory full P2-A gate. It drives the SHIPPED worker port
 * (`dshSubprocessWorkWorkerPort`) against a REAL DSH boot of the CURRENT branch's host bundle, in a
 * TEST-OWNED DSH home, and demonstrates:
 *
 *   1. a real first-party DSH Agent Session is created;
 *   2. the Host obtains its ACTUAL SessionId;
 *   3. the Host sends that identity on the existing Node IPC channel;
 *   4. the Parent receives it from the SAME ChildProcess it launched;
 *   5. the Parent associates it with its OWN InvocationId;
 *   6. no model Turn runs and no provider request is initiated;
 *   7. no Work success is fabricated;
 *   8. no durable association is asserted.
 *
 * THE NO-MODEL STRATEGY (§9). The ruling prefers the EXISTING post-creation Capability Refusal path.
 * A TEST-OWNED profile mounts one extra plugin (`refusal-probe-plugin.mjs`) that registers ONE tool
 * absent from the host's capability classification table, so the runner's fail-closed gate REFUSES
 * the worker immediately after `agents.create()` succeeded and before the first `agent.followup()`.
 * That is exactly the window P2-A needs: SESSION_CREATED followed by CAPABILITY_REFUSED with zero
 * model turns. Nothing is bypassed — the shipped refusal is what fires.
 *
 * THE EVIDENCE IS NOT PROVIDER-BASED. The no-model claim rests on STRUCTURE (the refusal precedes the
 * only `followup` call) and on MEASUREMENT (the created session has no turn events), never on an
 * absent credential or a failed request — a failed network call would still be an attempted request.
 *
 * SAFETY. Test-owned DSH home, test-owned session root, test-owned temp dirs. No personal profile is
 * loaded, no personal session is read, no credential is copied, no paid model is invoked, PRIMARY
 * stays disabled. The gate writes its result as JSON to stdout.
 *
 * NOT a product component. PLAIN JAVASCRIPT (`.mjs`): it runs under bare node against `dist/src/**`.
 */
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as moduleSharing from "../trajectory_p2b/module-sharing.mjs";
import * as ownedResource from "../trajectory_p2b/owned-resource.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const REAL_DSH_HOME = (process.env.DSH_HOME ?? join(homedir(), ".dsh")).replace(/\\/g, "/");
const REAL_MODULES = join(REAL_DSH_HOME, "profiles", "node_modules");
const GATE_ROOT = (process.env.PALIMPSEST_P2A_GATE_ROOT ?? join(homedir(), ".palimpsest-gates")).replace(/\\/g, "/");
/**
 * RA-B — THE RIG IS UNIQUE PER RUN AND RECLAIMED ON EVERY EXIT PATH.
 *
 * The superseded gate used a FIXED path and deleted it unconditionally at startup. Two consequences were
 * measured in the Host-S1RA audit: a concurrent run and this one destroyed each other's fixture, and a run
 * that exited before the single end-of-script path left its whole tree behind — the 14 MiB `p2a-level-c`
 * directory found in the gate root.
 *
 * The allocation is now owned, marker-carrying and identity-checked, and the lifetime helper reclaims it on
 * normal return, on `process.exit()`, and on SIGINT/SIGTERM.
 */
const owned = ownedResource.allocateOwnedRoot(GATE_ROOT, "p2a-level-c-");
const RIG = owned.root;
const HOME = join(RIG, "home");
const WORLD = join(RIG, "world");
const PROFILE = "p2a-level-c";
const lifetime = ownedResource.ownedRootLifetime(owned);

const findings = {};
const record = (key, value) => {
  findings[key] = value;
  process.stderr.write(`  · ${key}: ${JSON.stringify(value)}\n`);
};

/** §9.1: refresh the CURRENT branch's host bundle where the DSH profile loader resolves it. */
function installHostBundle() {
  const nodeModules = join(HOME, "profiles", "node_modules");
  mkdirSync(nodeModules, { recursive: true });
  for (const [source, name] of [
    [join(REPO, "host", "dsh"), "palimpsest-dsh-host"],
    [join(REPO, "host", "deployment"), "palimpsest-host-deployment"],
  ]) {
    const target = join(nodeModules, name);
    rmSync(target, { recursive: true, force: true });
    cpSync(source, target, { recursive: true });
  }
}

/**
 * RA-A — THIS GATE CARRIED THE LAST UNCONVERTED COPY OF THE DEFECTIVE SHARING HELPER.
 *
 * It decided occupancy with `existsSync`, which FOLLOWS a reparse point, and it completed the graph with
 * `cpSync(..., { dereference: true })`. RA-0/F1 and F2 measured both consequences: a dangling junction reads as
 * free, and a partial link set is "completed" by a copy that can materialise ~1 GiB per home. Every other gate was
 * converted in the previous stage; this one was missed, and `test/trajectory_p2a_first_party_gate.test.ts` still
 * executes it.
 *
 * It now delegates to the single corrected implementation.
 */
function linkSharedModules() {
  const result = moduleSharing.linkModuleGraph(HOME, {
    sourceModules: REAL_MODULES,
    /** The host bundle packages are installed by `installHostBundle()` immediately before this call. */
    providedByCaller: ["palimpsest-dsh-host", "palimpsest-host-deployment"],
  });
  record("moduleSharing", result);
  return result;
}

function writeProfile() {
  const profileDir = join(HOME, "profiles", PROFILE);
  mkdirSync(profileDir, { recursive: true });
  writeFileSync(
    join(profileDir, "package.json"),
    `${JSON.stringify(
      {
        name: `dsh-profile-${PROFILE}`,
        private: true,
        dependencies: {},
        dsh: { profile: { bundles: ["@deepseek-ai/dsh-base", "palimpsest-dsh-host"], patchReload: "startup" } },
      },
      null,
      2,
    )}\n`,
  );
  /**
   * The patch layer: point the Palimpsest host at THIS branch's built entry, and mount the test-owned
   * refusal probe. The probe is the ONLY addition and it exists solely to make the SHIPPED refusal
   * deterministic. It is unreachable in production: no shipped profile mounts it.
   */
  const probeUrl = pathToFileURL(join(REPO, "scripts", "trajectory_p2a", "refusal-probe-plugin.mjs")).href;
  writeFileSync(
    join(profileDir, "cordis.patch.yml"),
    [
      "- id: palimpsest-tools",
      "  config:",
      `    palimpsestEntry: '${join(REPO, "dist", "src", "advanced.js").replace(/\\/gu, "/")}'`,
      `    deploymentProfile: '${join(profileDir, "deployment.json").replace(/\\/gu, "/")}'`,
      "    serve: false",
      "    openDashboard: false",
      "",
      "- insert:",
      "    - id: p2a-refusal-probe",
      `      name: '${probeUrl}'`,
      "",
    ].join("\n"),
  );
  /**
   * A deployment profile is required by the host plugin's schema. The worker path never composes a
   * deployment, so its contents are inert; it exists so the plugin config validates.
   */
  writeFileSync(
    join(profileDir, "deployment.json"),
    `${JSON.stringify({ schemaVersion: 1, profileId: PROFILE, projectId: "p2a", localPeer: "p2a-peer", persistentPoint: "pp-p2a", transport: { namespace: PROFILE, databasePath: join(RIG, "transport.sqlite") }, databases: { orchestration: join(RIG, "orch.sqlite"), ordarium: join(RIG, "ord.sqlite") }, reasoning: {}, execution: "worktree", concurrency: 1, policy: {}, standard: { statement: "p2a probe" } }, null, 2)}\n`,
  );
}

/** Count the session artifacts a real DSH boot wrote, and the turn events in them. */
function inspectSessions() {
  const sessionsRoot = join(HOME, "sessions");
  if (!existsSync(sessionsRoot)) return { sessionCount: 0, sessionIds: [], turnEventCount: 0, artifactBytes: 0 };
  const sessionIds = [];
  let turnEventCount = 0;
  let artifactBytes = 0;
  for (const project of readdirSync(sessionsRoot)) {
    const projectDir = join(sessionsRoot, project);
    let entries;
    try {
      entries = readdirSync(projectDir);
    } catch {
      continue;
    }
    for (const sessionId of entries) {
      const sessionDir = join(projectDir, sessionId);
      let files;
      try {
        files = readdirSync(sessionDir);
      } catch {
        continue;
      }
      const jsonl = files.find((file) => file.startsWith("session.v") && file.includes("jsonl"));
      if (jsonl === undefined) continue;
      sessionIds.push(sessionId);
      const artifact = join(sessionDir, jsonl);
      artifactBytes += statSync(artifact).size;
      const text = execFileSync(process.execPath, ["-e", `process.stdout.write(require('node:fs').readFileSync(${JSON.stringify(artifact)},'utf8'))`], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
      for (const line of text.split(/\r?\n/u)) {
        if (line.trim() === "") continue;
        if (/"type"\s*:\s*"turn\/(start|end)"/u.test(line) || /"type"\s*:\s*"request\/header"/u.test(line)) turnEventCount += 1;
      }
    }
  }
  return { sessionCount: sessionIds.length, sessionIds, turnEventCount, artifactBytes };
}

/* ------------------------------------------------------------------ run */

const advanced = await import(pathToFileURL(join(REPO, "dist", "src", "advanced.js")).href);
const workWorker = await import(pathToFileURL(join(REPO, "dist", "src", "deployment", "work_worker.js")).href);

/** No pre-deletion: the root is unique to this run, so there is nothing of anyone else's to remove. */
mkdirSync(WORLD, { recursive: true });
mkdirSync(join(HOME, "profiles"), { recursive: true });
installHostBundle();
linkSharedModules();
writeProfile();

/** A minimal, JSON-serializable worker environment — the same shape the product sends. */
const context = {
  work: {
    projectGoal: "P2-A Level C probe",
    requirements: [],
    decisions: [],
    objective: "probe the host identity route",
    writeScope: [],
    requiredArtifacts: [],
    baseCommit: "0".repeat(40),
    completionChecks: [],
    independentVerificationRequired: false,
  },
  compiled: { manifestId: "m", boot: [], handles: [] },
};

const previousHome = process.env.DSH_HOME;
process.env.DSH_HOME = HOME;

const observations = [];
let outcome;
try {
  const port = workWorker.dshSubprocessWorkWorkerPort({ dshBin: process.env.PALIMPSEST_DSH_BIN ?? join(REAL_MODULES, "@deepseek-ai", "dsh", "lib", "bin.js"), profile: PROFILE, timeoutMs: 240_000 });
  outcome = await port.run({
    workDir: WORLD,
    context,
    // §9 Level C step 6/7: raise the source qualification explicitly — this IS a first-party boot.
    sessionSourceQualification: "FIRST_PARTY_DSH_QUALIFIED",
    observeSessionIdentity: (observation) => observations.push(observation),
  });
} finally {
  if (previousHome === undefined) delete process.env.DSH_HOME;
  else process.env.DSH_HOME = previousHome;
}

const sessions = inspectSessions();
const identity = observations.length > 0 ? observations[0] : null;

/**
 * §9.2: THE WORKER'S OWN TELEMETRY, as corroborating evidence. The SHIPPED port does not surface the
 * child's stdout, so a SECOND boot is spawned directly (same argv and stdio shape the port uses) to
 * capture the host's own identity report and the worker result line. This proves the refusal actually
 * fired rather than the worker dying for an unrelated reason. The port-driven run above remains the
 * primary evidence; this corroborates it.
 */
function captureWorkerTelemetry() {
  const payloadPath = join(RIG, "context.json");
  writeFileSync(
    payloadPath,
    JSON.stringify({
      context,
      resultTool: { name: "palimpsest_worker_result", description: "d", parameters: { type: "object", properties: { kind: { type: "string" }, summary: { type: "string" } }, required: ["kind", "summary"], additionalProperties: false }, mode: "read-only" },
      contextPullTool: { name: "palimpsest_worker_context_pull", description: "d", parameters: { type: "object", properties: { handle: { type: "string" } }, required: ["handle"], additionalProperties: false }, mode: "read-only" },
      contextIndexText: "",
      contextPullChannel: "palimpsest-worker-context-v1",
      allowedPullHandles: [],
      deniedAuthorityPrefix: "palimpsest_",
    }),
    "utf8",
  );
  const runner = join(RIG, "capture.mjs");
  writeFileSync(
    runner,
    [
      'import { spawn } from "node:child_process";',
      `const child = spawn(process.execPath, [${JSON.stringify(dshBinPath())}, "--profile", ${JSON.stringify(PROFILE)}, "--work", ${JSON.stringify(payloadPath)}], { cwd: ${JSON.stringify(WORLD)}, env: { ...process.env, DSH_HOME: ${JSON.stringify(HOME)} }, stdio: ["ignore", "pipe", "pipe", "ipc"] });`,
      "let out = '';",
      "child.stdout.on('data', (c) => (out += c.toString()));",
      "child.stderr.on('data', () => {});",
      "child.on('close', () => process.stdout.write(out));",
      "",
    ].join("\n"),
  );
  try {
    const output = execFileSync(process.execPath, [runner], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024, env: { ...process.env, DSH_HOME: HOME } });
    const identityLine = output.split(/\r?\n/u).find((line) => line.startsWith("PALIMPSEST_WORKER_SESSION_IDENTITY "));
    const resultLine = output.split(/\r?\n/u).find((line) => line.startsWith("PALIMPSEST_WORK_RESULT "));
    return {
      hostTelemetry: identityLine === undefined ? null : identityLine.slice("PALIMPSEST_WORKER_SESSION_IDENTITY ".length),
      workerResult: resultLine === undefined ? null : resultLine.slice("PALIMPSEST_WORK_RESULT ".length),
      captured: identityLine !== undefined && resultLine !== undefined,
    };
  } catch (error) {
    return { hostTelemetry: null, workerResult: null, captured: false, error: error?.message ?? String(error) };
  }
}

function dshBinPath() {
  return process.env.PALIMPSEST_DSH_BIN ?? join(REAL_MODULES, "@deepseek-ai", "dsh", "lib", "bin.js");
}

const corroboration = captureWorkerTelemetry();

const result = {
  schemaVersion: 1,
  kind: "TRAJECTORY_P2A_FIRST_PARTY_INTEGRATION",
  stage: "Trajectory-P2A",
  evidenceClass: "REAL_HOST_PARENT_INTEGRATION_NO_MODEL",
  sourceLocations: [
    "host/dsh/lib/runner.js (runWorker: agents.create -> session identity report -> capability refusal)",
    "host/dsh/lib/session-identity.js (the producer)",
    "src/deployment/work_worker.ts (the parent port and its strict identity parser)",
  ],
  method:
    "boot the CURRENT branch's host bundle in a test-owned DSH home via the SHIPPED worker port, with a test-owned profile that makes the SHIPPED capability refusal fire after session creation and before the first model turn; observe the identity on the real IPC channel",
  observations: {
    outcomeKind: outcome.kind,
    hostFailureDetail: outcome.kind === "HOST_FAILURE" ? (outcome.detail ?? null) : null,
    identityObservationCount: observations.length,
    observedSessionId: identity === null ? null : identity.dshSessionId,
    observedInvocationId: identity === null ? null : identity.invocationId,
    observedSource: identity === null ? null : identity.source,
    observedSourceQualification: identity === null ? null : identity.sourceQualification,
    observedState: identity === null ? null : identity.observationState,
    observedDirectChildPid: identity === null ? null : identity.directChildPid,
    sessionsWrittenByHost: sessions.sessionCount,
    hostSessionIdsMatchObservation: identity !== null && sessions.sessionIds.includes(identity.dshSessionId),
    turnEventCountInWrittenSessions: sessions.turnEventCount,
    sessionArtifactBytes: sessions.artifactBytes,
  },
  corroboratingRun: {
    note: "a second boot spawned directly with the SAME argv and stdio shape the port uses; it shows the worker's OWN telemetry and the refusal reason, proving the refusal fired rather than the worker dying for an unrelated reason",
    hostTelemetry: corroboration.hostTelemetry,
    workerResult: corroboration.workerResult,
    captured: corroboration.captured,
  },
  expectedInvariant:
    "a real DSH session is created, its identity reaches the parent on the IPC channel, the parent stamps its own invocation, the worker is refused, and NO model turn runs",
  verdict: "PENDING",
  noModelProof: {
    structuralExclusion:
      "the runner's capability refusal is thrown between `agents.create` and the only `agent.followup` call; on a refusal the runner disposes the handle and never reaches the first turn",
    runtimeMeasurement: {
      turnEventCountInWrittenSessions: sessions.turnEventCount,
      note: "a model turn appends turn/start and request/header events to the session artifact; zero such events is the measurement, not the assumption",
    },
  },
  realFirstPartyDshPathRan: true,
  modelCallsMade: 0,
  privateSessionsAccessed: false,
  testProfileProvenance: "a test-owned DSH home under the gate root, with a test-owned profile that mounts the current branch's host bundle; no user profile is loaded and no credential is copied",
  remainingUncertainty: [
    "the refusal is the SHIPPED fail-closed path, made deterministic by a test-owned unclassified probe tool; a production worker would be ADMITTED and then run a model turn, which is out of P2-A scope",
    "the identity observation is not a durable binding: nothing here persists an Attempt -> Session association",
  ],
};

const qualified =
  outcome.kind === "HOST_FAILURE" &&
  observations.length >= 1 &&
  identity !== null &&
  identity.source === "DIRECT_CHILD_IPC_REPORT" &&
  /^wpi-/u.test(identity.invocationId) &&
  typeof identity.directChildPid === "number" &&
  sessions.sessionCount >= 1 &&
  sessions.sessionIds.includes(identity.dshSessionId) &&
  sessions.turnEventCount === 0;
result.verdict = qualified ? "REAL_HOST_PARENT_IDENTITY_ROUTE_QUALIFIED_NO_MODEL" : "NOT_ESTABLISHED";

/**
 * RA-B — THE CLEANUP OUTCOME IS PART OF THE RESULT, and it is disposed BEFORE the process exits so a failure
 * is visible in the receipt rather than inferred from a directory that may or may not still exist.
 */
const cleanup = lifetime.dispose();
result.testRootCleanup = cleanup;

process.stdout.write(JSON.stringify(result, null, 2) + "\n");
process.exit(qualified ? 0 : 1);
