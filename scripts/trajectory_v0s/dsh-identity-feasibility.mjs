/**
 * Trajectory-V0S §10 (S2) — DSH SESSION IDENTITY PRODUCER FEASIBILITY.
 *
 * READ-ONLY. This script inspects the INSTALLED DeepSeek Harness packages and the installed
 * Palimpsest host bundle to answer one question:
 *
 *     At what exact runtime boundary could a trusted Palimpsest Host obtain the DSH-owned SessionId
 *     for the Worker execution it initiated?
 *
 * It modifies nothing, launches nothing and contacts nothing. It reads source text and reports what
 * it found, with every absolute personal path SANITIZED out of the output.
 *
 * Usage:  node scripts/trajectory_v0s/dsh-identity-feasibility.mjs
 * Output: JSON on stdout.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DSH_HOME = process.env["DSH_HOME"] ?? join(process.env["USERPROFILE"] ?? "", ".dsh");

/** §10: strip any absolute personal path from a reported string. */
function sanitize(value) {
  if (typeof value !== "string") return value;
  return value
    .replace(/[A-Za-z]:\\[^\s"']*/gu, "<local-path>")
    .replace(/[A-Za-z]:\/[^\s"']*/gu, "<local-path>")
    .replace(/(?:\/Users|\/home)\/[^\s"']*/gu, "<local-path>");
}

function readIfPresent(path) {
  return existsSync(path) ? readFileSync(path, "utf8") : null;
}

/** §10: the installed DSH package versions, so the audit names the exact build it inspected. */
function installedVersions() {
  const root = join(DSH_HOME, "profiles", "node_modules", "@deepseek-ai");
  if (!existsSync(root)) return null;
  const wanted = ["dsh", "dsh-session", "dsh-session-query", "dsh-session-persistence-jsonl", "dsh-headless", "dsh-workflow", "dsh-subagent"];
  const versions = {};
  for (const name of wanted) {
    const pkg = readIfPresent(join(root, name, "package.json"));
    if (pkg === null) continue;
    try {
      versions[name] = JSON.parse(pkg).version;
    } catch {
      versions[name] = "unreadable";
    }
  }
  return versions;
}

const findings = {};

/* ------------------------------------------------------------------ *
 * 1. WHO MINTS THE WORKER SESSION ID
 * ------------------------------------------------------------------ */

const hostBundleRoot = join(DSH_HOME, "profiles", "node_modules", "palimpsest-dsh-host");
const runnerSource = readIfPresent(join(hostBundleRoot, "lib", "runner.js"));
const startupSource = readIfPresent(join(hostBundleRoot, "lib", "startup.js"));

findings.workerSessionMinting = (() => {
  if (runnerSource === null) return { present: false, note: "the installed Palimpsest host bundle was not found" };
  /**
   * §10: the exact expression that creates the worker's session. It is minted BY THE PALIMPSEST HOST
   * BUNDLE — not by DSH — and handed to DSH's `agents.create`.
   */
  const workerCreate = /sessionId:\s*brandString\(`worker-\$\{randomUUID\(\)\}`\)/u.test(runnerSource);
  const branchCreate = /sessionId:\s*brandString\(`branch-\$\{randomUUID\(\)\}`\)/u.test(runnerSource);
  const principalCreate = /sessionId:\s*brandString\(`session-\$\{randomUUID\(\)\}`\)/u.test(runnerSource);
  return {
    present: true,
    workerMintsSessionId: workerCreate,
    branchMintsSessionId: branchCreate,
    principalMintsSessionId: principalCreate,
    producer: "palimpsest-dsh-host/lib/runner.js (runWorker), via agents.create({ sessionId })",
    note: "the id is minted by the HOST BUNDLE and passed into DSH's agents service; DSH persists the session under the profile's sessions root",
  };
})();

/* ------------------------------------------------------------------ *
 * 2. WHICH CHANNEL CARRIES IT (principal vs worker)
 * ------------------------------------------------------------------ */

findings.principalReportingChannels = (() => {
  if (runnerSource === null) return { present: false };
  /**
   * §10: the PRINCIPAL path has TWO documented reporting channels — a session-id FILE and a
   * machine-readable readiness line. The WORKER path has neither.
   */
  return {
    present: true,
    writesSessionIdFile: /sessionIdFile/u.test(runnerSource) && /writeFileSync\(startup\.sessionIdFile/u.test(runnerSource),
    printsReadinessLine: /PALIMPSEST_HOST_READY/u.test(runnerSource),
    readinessCarriesSessionId: /PALIMPSEST_HOST_READY[\s\S]{0,200}sessionId/u.test(runnerSource),
    startupOffersSessionFileFlag: startupSource !== null && /--session-file/u.test(startupSource),
    note: "the --session-file flag and the PALIMPSEST_HOST_READY line both belong to the create/resume principal path",
  };
})();

findings.workerReportingChannels = (() => {
  if (runnerSource === null) return { present: false };
  /**
   * §10: enumerate every machine-readable line the WORKER prints, and check whether ANY of them
   * carries the session id. This is the decisive measurement for the current Work route.
   */
  const prefixes = [...runnerSource.matchAll(/PALIMPSEST_WORKER_[A-Z_]+/gu)].map((match) => match[0]);
  const unique = [...new Set(prefixes)];
  const resultPrefix = /PALIMPSEST_WORK_RESULT/u.test(runnerSource);
  /**
   * The worker block is the region from `async function runWorker` to the next top-level function.
   * Searching it for `sessionId` is how the audit establishes that the created identity is never
   * reported.
   */
  const workerStart = runnerSource.indexOf("async function runWorker");
  const branchStart = runnerSource.indexOf("async function runBranch");
  const workerBlock = workerStart === -1 ? "" : runnerSource.slice(workerStart, branchStart === -1 ? undefined : branchStart);
  const workerReportsSessionId = /sessionId/u.test(workerBlock.replace(/sessionId:\s*brandString\(`worker-[^`]*`\)/u, ""));
  return {
    present: true,
    machineReadableLinePrefixes: unique.sort(),
    printsWorkResult: resultPrefix,
    workerBlockMentionsSessionIdOutsideMinting: workerReportsSessionId,
    workerExposesSessionId: workerReportsSessionId,
    note: workerReportsSessionId
      ? "the worker block references a session id outside the minting expression"
      : "the worker mints `worker-<uuid>` and NEVER reports it on stdout, stderr or the IPC channel",
  };
})();

/* ------------------------------------------------------------------ *
 * 3. THE HOST-SIDE CHANNELS THE PARENT ALREADY OWNS
 * ------------------------------------------------------------------ */

const workWorkerSource = readIfPresent(join(process.cwd(), "src", "deployment", "work_worker.ts"));
findings.parentChannels = (() => {
  if (workWorkerSource === null) return { present: false, note: "Palimpsest work_worker.ts was not found from the current directory" };
  return {
    present: true,
    spawnArgumentShape: /spawn\(nodeExecPath,\s*\[input\.dshBin,\s*"--profile",\s*input\.profile,\s*"--work",\s*contextFile\]/u.test(workWorkerSource),
    spawnsWithWorkDirCwd: /cwd:\s*runInput\.workDir/u.test(workWorkerSource),
    ownsIpcChannel: /stdio\[3\]/u.test(workWorkerSource) || /ipc/u.test(workWorkerSource),
    parsesIpcMessages: /spawned\.on\("message"/u.test(workWorkerSource),
    parsesStdout: /spawned\.stdout\?\.on\("data"/u.test(workWorkerSource),
    note: "the parent owns the child's stdout and a dedicated IPC channel (stdio[3]) and already parses structured messages on it",
  };
})();

/* ------------------------------------------------------------------ *
 * 4. THE DSH-SIDE IDENTITY SURFACES (for comparison, not for the Work route)
 * ------------------------------------------------------------------ */

const headlessRoot = join(DSH_HOME, "profiles", "node_modules", "@deepseek-ai", "dsh-headless", "lib");
findings.headlessJsonSessionEvent = (() => {
  if (!existsSync(headlessRoot)) return { present: false };
  const files = readdirSync(headlessRoot).filter((file) => file.endsWith(".js"));
  let carries = false;
  let snippet = null;
  for (const file of files) {
    const text = readIfPresent(join(headlessRoot, file));
    if (text === null) continue;
    const match = /type:\s*"session",\s*sessionId:\s*agent\.id/u.exec(text);
    if (match !== null) {
      carries = true;
      snippet = "write({ type: 'session', sessionId: agent.id, cwd })";
      break;
    }
  }
  return {
    present: true,
    emitsOpeningSessionEvent: carries,
    shape: snippet,
    /**
     * §10: this proves DSH CAN expose a created session's identity to a parent process. It does NOT
     * prove the Palimpsest Worker route does, or that it uses this implementation.
     */
    note: "DSH Headless emits a machine-readable opening `session` event under --json; this is a capability of a DIFFERENT route than the Palimpsest Work worker",
  };
})();

/* ------------------------------------------------------------------ *
 * 5. MULTI-AGENT SOURCE MAP (§11, read-only)
 * ------------------------------------------------------------------ */

findings.multiAgentSourceMap = (() => {
  const workflowRoot = join(DSH_HOME, "profiles", "node_modules", "@deepseek-ai", "dsh-workflow", "lib");
  const workflowSource = readIfPresent(join(workflowRoot, "index.js"));
  const workflowInvariant = readIfPresent(join(workflowRoot, "invariant.js"));
  const subagentRoot = join(DSH_HOME, "profiles", "node_modules", "@deepseek-ai", "dsh-subagent");
  return {
    workflow: {
      packagePresent: workflowSource !== null,
      runIdType: workflowSource !== null && /WorkflowRunId/u.test(workflowSource),
      agentStartEvent: workflowInvariant !== null && /workflow\/agent-start/u.test(workflowInvariant),
      agentEndEvent: workflowInvariant !== null && /workflow\/agent-end/u.test(workflowInvariant),
      childIdentityField: "childId",
      /** §11: a workflow child finishing is not a Palimpsest Work promotion. */
      doesNotImply: "canonical Work Promotion",
    },
    agentTeam: {
      subagentPackagesPresent: existsSync(subagentRoot),
      note: "durable member provisioning, Inbox acceptance, Task Board updates and member session identity are separate DSH surfaces; a Team Task completion is not a Palimpsest Work completion",
    },
    worktree: {
      note: "a DSH-created worktree is not automatically an approved Palimpsest Attempt World; the authorized world remains the one the port hands the worker as its cwd",
    },
  };
})();

/* ------------------------------------------------------------------ *
 * 6. THE FEASIBILITY DECISION
 * ------------------------------------------------------------------ */

const workerExposes = findings.workerReportingChannels.workerExposesSessionId === true;
const parentOwnsChannel = findings.parentChannels.ownsIpcChannel === true && findings.parentChannels.parsesIpcMessages === true;

const outcome = workerExposes
  ? "SUPPORTED_PRODUCER_DEMONSTRATED_NO_MODEL"
  : parentOwnsChannel
    ? "PRODUCER_REQUIRES_RUNTIME_INTEGRATION"
    : "PRODUCER_NOT_ESTABLISHED";

process.stdout.write(`${JSON.stringify({
  schemaVersion: 1,
  kind: "TRAJECTORY_V0S_DSH_IDENTITY_PRODUCER_FEASIBILITY",
  stage: "Trajectory-V0S",
  readOnly: true,
  modelCallsMade: 0,
  installedVersions: installedVersions(),
  dshHomeReported: sanitize(DSH_HOME),
  findings,
  identityChain: [
    "Canonical Work AttemptId        (the Work owner; has a producer)",
    "Host-local JobId                (the delegation service; has a producer, ephemeral)",
    "Port InvocationId               (the worker port; has a producer)",
    "Direct Child Process            (the port's spawn; has a producer)",
    "Actual DSH SessionId            (MISSING: no producer reports it to the parent)",
  ],
  outcome,
  smallestSupportedIntegrationPoint: {
    candidate: "P2 (supported worker output protocol), on the EXISTING IPC channel",
    detail:
      "runWorker already holds `handle.agent.session.id` from agents.create and the parent already parses structured messages on the dedicated stdio[3] IPC channel. Reporting the session identity as ONE structured message on that channel BEFORE the first model turn would let the parent bind the exact session to the exact InvocationId it spawned.",
    whyItIsNotImplementedHere:
      "S2 is a read-only gate: it forbids modifying the Worker Port and forbids adding a Worker output schema extension.",
    requiredChanges: [
      "palimpsest-dsh-host/lib/runner.js (runWorker): report the created session identity on the IPC channel",
      "src/deployment/work_worker.ts: accept and record that identity against the invocation",
    ],
    whyTheChannelMatters:
      "stdout is model-writable (the worker can run bash), so a stdout line is worker testimony. The IPC channel is owned by the host bundle and is not reachable by the model, which is what makes the report a host observation rather than a claim.",
    whatItStillWouldNotProve: [
      "that no OTHER session was created for the same attempt",
      "that the session's cwd equals the attempt's authorized world (it would need a header check)",
      "canonical ownership: only a durable producer-side binding record can establish that",
    ],
  },
  threatAndLifecycleAssessment: {
    whoProducesSessionId: "the Palimpsest host bundle mints `worker-<uuid>` and passes it to DSH's agents.create",
    canWorkerForgeIt: "not on the IPC channel; yes on stdout",
    canHostDistinguishCreation: "not today: the worker route reports no session identity at all",
    crashBeforePersistence: "the session would be unreadable, so the binding would have to be recorded as SOURCE_UNAVAILABLE rather than as a session",
    multipleSessions: "a retry or a resumed worker could create a second session; the binding would need a cardinality rule",
    forkOrResume: "a forked child carries parentSession in its header, which is lineage, not Attempt ownership",
    oneAttemptMultipleSessions: "possible in principle and currently unconstrained, so the binding must be one-to-many or explicitly one-to-one",
    wrapperChild: "the direct child may be a wrapper, so the pid proves only the direct child",
    survivesParentShutdown: "the session persists; the host job id does not",
    secondCanonicalOwner: "no: a binding record referencing the Work AttemptId would remain a read-side reference, not a new authority",
    verifiableAfterRestart: "only if the binding is durable; the session id alone is readable but its Attempt ownership would not be",
    requiresLiveModel: "no: session creation is a non-model operation",
    changesExecutionEnvironment: "it would add one structured IPC message, not a new capability",
  },
  permittedOutcomes: [
    "SUPPORTED_PRODUCER_IDENTIFIED_SOURCE_ONLY",
    "SUPPORTED_PRODUCER_DEMONSTRATED_NO_MODEL",
    "PRODUCER_REQUIRES_RUNTIME_INTEGRATION",
    "PRODUCER_NOT_ESTABLISHED",
  ],
  note: "no permitted outcome authorizes PRIMARY execution",
}, null, 2)}\n`);
