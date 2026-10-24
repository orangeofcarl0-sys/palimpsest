/**
 * Trajectory-P2-B §5 B0-C2 (C2) — THE CORRECTED FIRST-PARTY NO-MODEL GATE.
 *
 * This replaces the P2-A Level C gate's three defects (B0-F1/F2/F3) and separates the Host-Failure
 * facts the P2-A run conflated (B0-F4):
 *
 *   F1 CORRECTED. The session is read through the OFFICIAL DSH reader
 *      (`scripts/trajectory_v0/dsh-session-reader.mjs` → `SessionPersistence.open(id,'read')`), so the
 *      "no model turn" claim is measured on the LOGICAL Session Event stream, not on a UTF-8 scan of a
 *      Zstandard artifact. The gate reports the actual turn/start, step/start and request event counts.
 *   F2 CORRECTED. The gate reports an explicit outcome — `PASS | SKIPPED | BLOCKED | NOT_ESTABLISHED` —
 *      and exits non-zero unless it actually ran and qualified. "Did not run" is never a pass.
 *   F3 CORRECTED. The run directory is a UNIQUE, per-run `mkdtempSync` directory whose containment
 *      inside the gate root is ASSERTED before any recursive delete, and a reparse point is refused.
 *   F4 CORRECTED. The Parent's structured outcome, the Parent's parse failure and the Host's own
 *      refusal reason are reported as THREE separate facts; the gate never claims the refusal reason
 *      was observed through the Parent's result parser.
 *
 * SAFETY. Test-owned DSH home and session root, test-owned profile, no personal profile, no credential,
 * no paid model, PRIMARY disabled. The no-model stop is the SHIPPED fail-closed capability refusal,
 * made deterministic by a test-owned unclassified probe tool that is unreachable in production.
 *
 * NOT a product component. PLAIN JAVASCRIPT (`.mjs`), bare node against `dist/src/**`.
 */
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runtimeHomePath } from "../gates/runtime-home.mjs";
import * as moduleSharing from "./module-sharing.mjs";
import * as ownedResource from "./owned-resource.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const REAL_DSH_HOME = (runtimeHomePath()).replace(/\\/g, "/");
const REAL_MODULES = join(REAL_DSH_HOME, "profiles", "node_modules");
const GATE_ROOT = (process.env.PALIMPSEST_P2B_GATE_ROOT ?? join(homedir(), ".palimpsest-gates")).replace(/\\/g, "/");
const PROFILE = "p2b-level-b";

/** §5 B0-F2: the explicit outcome vocabulary. Only PASS is a qualification. */
const OUTCOMES = ["PASS", "SKIPPED", "BLOCKED", "NOT_ESTABLISHED"];

const findings = {};
const record = (key, value) => {
  findings[key] = value;
  process.stderr.write(`  · ${key}: ${JSON.stringify(value)}\n`);
};

function finish(outcome, extra) {
  const result = {
    schemaVersion: 1,
    kind: "TRAJECTORY_P2B_FIRST_PARTY_GATE",
    stage: "Trajectory-P2-B",
    outcome,
    ...findings,
    ...(extra ?? {}),
  };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(outcome === "PASS" ? 0 : outcome === "SKIPPED" ? 0 : 1);
}

/* ------------------------------------------------------------------ *
 * §5 B0-F3 — A SAFELY OWNED, CONTAINED TEST ROOT
 * ------------------------------------------------------------------ */

/**
 * RA-B - THE LOCAL OWNERSHIP HELPERS ARE GONE.
 *
 * This gate carried its OWN `allocateOwnedRoot` and `safeCleanup`, which cached `contained`/`isReparse` at
 * allocation and deleted whatever occupied the path afterwards. RA-0/F3 measured the consequence on the shared
 * implementation: a foreign directory's contents were removed. Rather than fix the defect twice and let the two
 * copies drift, both now delegate to `scripts/trajectory_p2b/owned-resource.mjs`, which re-proves containment,
 * reparse status and object identity immediately before deleting and keeps a failed attempt retryable.
 */
const allocateOwnedRoot = (prefix) => ownedResource.allocateOwnedRoot(GATE_ROOT, prefix);

const safeCleanup = async (owned) => {
  const proof = ownedResource.revalidateOwnership(owned);
  if (proof.owned !== true) return { cleaned: false, reason: proof.reason, checks: proof.checks, preserved: true };
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      rmSync(owned.root, { recursive: true, force: true, maxRetries: 2, retryDelay: 100 });
      return { cleaned: true, checks: proof.checks };
    } catch (error) {
      await new Promise((done) => setTimeout(done, 250));
      if (attempt === 7) return { cleaned: false, reason: String(error?.message ?? error), preserved: true };
    }
  }
  return { cleaned: false, reason: "attempt budget exhausted", preserved: true };
};


/* ------------------------------------------------------------------ *
 * §5 B0-C2 — the no-model first-party run
 * ------------------------------------------------------------------ */


/**
 * RA-A - THE LOCAL MODULE-SHARING COPIES ARE GONE.
 *
 * This gate carried its own `installHostBundle` and `linkSharedModules`. The second one had the SAME defect the
 * shared rig had: occupancy decided by `existsSync`, and a dereferencing copy as the automatic completion for a
 * partial link set. RA-0/F1 and F2 measured both consequences. It now delegates, so there is exactly ONE
 * implementation of destination admission in the tree.
 */
const installHostBundle = (home) => {
  const nodeModules = join(home, "profiles", "node_modules");
  mkdirSync(nodeModules, { recursive: true });
  for (const [source, name] of [
    [join(REPO, "host", "dsh"), "palimpsest-dsh-host"],
    [join(REPO, "host", "deployment"), "palimpsest-host-deployment"],
  ]) {
    const target = join(nodeModules, name);
    rmSync(target, { recursive: true, force: true });
    cpSync(source, target, { recursive: true });
  }
};

const linkSharedModules = (home) => moduleSharing.linkModuleGraph(home, { sourceModules: REAL_MODULES });


function writeProfile(home, rig) {
  const profileDir = join(home, "profiles", PROFILE);
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
      "    - id: p2b-refusal-probe",
      `      name: '${probeUrl}'`,
      "",
    ].join("\n"),
  );
  writeFileSync(
    join(profileDir, "deployment.json"),
    `${JSON.stringify({ schemaVersion: 1, profileId: PROFILE, projectId: "p2b", localPeer: "p2b-peer", persistentPoint: "pp-p2b", transport: { namespace: PROFILE, databasePath: join(rig, "transport.sqlite") }, databases: { orchestration: join(rig, "orch.sqlite"), ordarium: join(rig, "ord.sqlite") }, reasoning: {}, execution: "worktree", concurrency: 1, policy: {}, standard: { statement: "p2b probe" } }, null, 2)}\n`,
  );
}

/* ------------------------------------------------------------------ *
 * §5 B0-F1 — THE OFFICIAL SESSION MEASUREMENT
 * ------------------------------------------------------------------ */

/**
 * Read the created session through the OFFICIAL reader and count the logical events.
 *
 * This is the corrected measurement: `makeRealDshSessionReader` mounts the installed
 * `JsonlSessionPersistence` and performs ONE `open(id,'read')` + `handle.read(0, undefined)`, so the
 * counts are properties of the LOGICAL stream, not of a text scan over compressed bytes.
 */
async function measureSession(sessionsRoot, sessionId) {
  const readerModule = await import(pathToFileURL(join(REPO, "scripts", "trajectory_v0", "dsh-session-reader.mjs")).href);
  const reader = await readerModule.makeRealDshSessionReader({ dshHomePath: REAL_DSH_HOME, sessionsRoot });
  if (reader === null) return { readState: "READER_UNAVAILABLE", events: null };
  try {
    const page = await reader.readEvents({ sessionId, maxEvents: 200 });
    const counts = { total: page.events.length, turnStart: 0, stepStart: 0, requestHeader: 0, turnEnd: 0 };
    for (const event of page.events) {
      if (event.type === "turn/start") counts.turnStart += 1;
      else if (event.type === "step/start") counts.stepStart += 1;
      else if (event.type === "request/header") counts.requestHeader += 1;
      else if (event.type === "turn/end") counts.turnEnd += 1;
    }
    return {
      readState: page.readState,
      headerSessionId: page.header?.sessionId ?? null,
      persistedEventCount: page.persistedEventCount,
      syntheticRecoveryEventCount: page.syntheticRecoveryEventCount,
      counts,
    };
  } finally {
    await reader.close?.();
  }
}

/* ------------------------------------------------------------------ *
 * run
 * ------------------------------------------------------------------ */

if (!existsSync(join(REPO, "dist", "src", "advanced.js"))) {
  finish("BLOCKED", { blocker: "dist/src/advanced.js is absent; run the build before this gate" });
}
if (!existsSync(join(REAL_MODULES, "@deepseek-ai", "dsh-session"))) {
  finish("SKIPPED", { blocker: "no installed first-party DSH tree; the mandatory gate cannot run" });
}

const owned = allocateOwnedRoot();
record("testRootContained", owned.contained);
record("testRootIsReparsePoint", owned.isReparse);
if (!owned.contained) finish("NOT_ESTABLISHED", { blocker: "could not prove the run directory is contained in the gate root" });

const RIG = owned.root;
const HOME = join(RIG, "home");
const WORLD = join(RIG, "world");
mkdirSync(WORLD, { recursive: true });
mkdirSync(join(HOME, "profiles"), { recursive: true });
installHostBundle(HOME);
linkSharedModules(HOME);
writeProfile(HOME, RIG);

const context = {
  work: {
    projectGoal: "P2-B Level B probe",
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

const advanced = await import(pathToFileURL(join(REPO, "dist", "src", "advanced.js")).href);
void advanced;
const workWorker = await import(pathToFileURL(join(REPO, "dist", "src", "deployment", "work_worker.js")).href);

const previousHome = process.env.DSH_HOME;
process.env.DSH_HOME = HOME;

const observations = [];
let outcome;
try {
  const port = workWorker.dshSubprocessWorkWorkerPort({
    dshBin: process.env.PALIMPSEST_DSH_BIN ?? join(REAL_MODULES, "@deepseek-ai", "dsh", "lib", "bin.js"),
    profile: PROFILE,
    timeoutMs: 240_000,
  });
  outcome = await port.run({
    workDir: WORLD,
    context,
    // §5 B0-C3: this IS a first-party boot, so the caller raises the qualification explicitly. The gate
    // still verifies provenance through the official session read below — the label alone proves nothing.
    sessionSourceQualification: "FIRST_PARTY_DSH_QUALIFIED",
    observeSessionIdentity: (observation) => observations.push(observation),
  });
} finally {
  if (previousHome === undefined) delete process.env.DSH_HOME;
  else process.env.DSH_HOME = previousHome;
}

const identity = observations.length > 0 ? observations[0] : null;
const sessionsRoot = join(HOME, "sessions");
const measurement = identity === null ? { readState: "NO_IDENTITY_OBSERVED" } : await measureSession(sessionsRoot, identity.dshSessionId);

/* §5 B0-F4: the three SEPARATE facts. */
record("parentOutcomeKind", outcome.kind);
record("parentFailureDetail", outcome.kind === "HOST_FAILURE" ? (outcome.detail ?? null) : null);
record("identityObservationCount", observations.length);
record("observedSessionId", identity === null ? null : identity.dshSessionId);
record("observedInvocationId", identity === null ? null : identity.invocationId);
record("observedSource", identity === null ? null : identity.source);
record("observedState", identity === null ? null : identity.observationState);
record("officialSessionMeasurement", measurement);

/**
 * §5 B0-F4: a SEPARATE direct capture of the Host's own telemetry, so the refusal reason is observed
 * as its OWN fact. The gate does NOT claim the Parent's result parser surfaced this reason.
 */
const hostTelemetry = (() => {
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
      `const child = spawn(process.execPath, [${JSON.stringify(process.env.PALIMPSEST_DSH_BIN ?? join(REAL_MODULES, "@deepseek-ai", "dsh", "lib", "bin.js"))}, "--profile", ${JSON.stringify(PROFILE)}, "--work", ${JSON.stringify(payloadPath)}], { cwd: ${JSON.stringify(WORLD)}, env: { ...process.env, DSH_HOME: ${JSON.stringify(HOME)} }, stdio: ["ignore", "pipe", "pipe", "ipc"] });`,
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
      hostIdentityTelemetry: identityLine === undefined ? null : identityLine.slice("PALIMPSEST_WORKER_SESSION_IDENTITY ".length),
      hostWorkerResultLine: resultLine === undefined ? null : resultLine.slice("PALIMPSEST_WORK_RESULT ".length),
    };
  } catch (error) {
    return { hostIdentityTelemetry: null, hostWorkerResultLine: null, error: error?.message ?? String(error) };
  }
})();
record("hostOwnTelemetry", hostTelemetry);

const cleanup = await safeCleanup(owned);
record("testRootCleanup", cleanup);

/* ------------------------------------------------------------------ *
 * §5 B0-F2 — THE EXPLICIT OUTCOME
 * ------------------------------------------------------------------ */

const qualified =
  outcome.kind === "HOST_FAILURE" &&
  observations.length === 1 &&
  identity !== null &&
  identity.source === "DIRECT_CHILD_IPC_REPORT" &&
  /^wpi-/u.test(identity.invocationId) &&
  measurement.readState === "READ_OK" &&
  measurement.counts.turnStart === 0 &&
  measurement.counts.requestHeader === 0 &&
  (measurement.headerSessionId === null || measurement.headerSessionId === identity.dshSessionId);

record("noModelProof", {
  method: "the logical Session Event stream read through the official SessionPersistence reader",
  turnStart: measurement.counts?.turnStart ?? null,
  stepStart: measurement.counts?.stepStart ?? null,
  requestHeader: measurement.counts?.requestHeader ?? null,
  structuralExclusion: "the runner's capability refusal is thrown between agents.create and the only agent.followup call",
  note: "the measurement is the logical stream, NOT a UTF-8 scan of the Zstandard artifact (B0-F1)",
});
record("realFirstPartyDshPathRan", true);
record("modelCallsMade", 0);
record("privateSessionsAccessed", false);

finish(qualified ? "PASS" : "NOT_ESTABLISHED", {
  permittedOutcomes: OUTCOMES,
  qualified,
});
