/**
 * Trajectory-P2A §5 (C1) — THE DSH SESSION IDENTITY SOURCE MAP.
 *
 * READ-ONLY. It answers §5's ten questions by reading the SHIPPED Palimpsest host bundle, the
 * Palimpsest Parent worker port, the Work Delegation correlation layer, and the INSTALLED
 * first-party DSH agent factory — and by MEASURING, not assuming, that no identity producer exists
 * on the Work route today.
 *
 * It modifies nothing, launches no worker, contacts no provider and touches no personal session
 * directory. Every absolute personal path is sanitized out of the output.
 *
 * Usage:  node scripts/trajectory_p2a/dsh-identity-source-map.mjs
 * Output: JSON on stdout.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DSH_HOME = (process.env["DSH_HOME"] ?? join(process.env["USERPROFILE"] ?? "", ".dsh")).replace(/\\/g, "/");
const PACKAGE_ROOT = join(DSH_HOME, "profiles", "node_modules", "@deepseek-ai").replace(/\\/g, "/");
const REPO = process.cwd().replace(/\\/g, "/");

/** §10: strip any absolute personal path from a reported string. */
function sanitize(value) {
  if (typeof value !== "string") return value;
  return value
    .replace(/[A-Za-z]:\\[^\s"']*/gu, "<local-path>")
    .replace(/[A-Za-z]:\/[^\s"']*/gu, "<local-path>")
    .replace(/(?:\/Users|\/home)\/[^\s"']*/gu, "<local-path>");
}

const readIfPresent = (path) => (existsSync(path) ? readFileSync(path, "utf8") : null);

function installedVersions() {
  const wanted = ["dsh", "dsh-agent", "dsh-agent-loop", "dsh-session", "dsh-session-query", "dsh-session-persistence", "dsh-session-persistence-jsonl", "dsh-brand", "dsh-llm", "dsh-tools", "dsh-system-prompt"];
  const versions = {};
  for (const name of wanted) {
    const text = readIfPresent(join(PACKAGE_ROOT, name, "package.json"));
    if (text === null) continue;
    try {
      versions[name] = JSON.parse(text).version;
    } catch {
      versions[name] = "unreadable";
    }
  }
  return versions;
}

/** §5: a source REGION is located by its own anchors, so the answer cannot drift from the file. */
function region(text, startAnchor, endAnchor) {
  if (text === null) return null;
  const start = text.indexOf(startAnchor);
  if (start === -1) return null;
  const end = endAnchor === null ? text.length : text.indexOf(endAnchor, start + startAnchor.length);
  return text.slice(start, end === -1 ? text.length : end);
}

const answers = {};
const record = (id, value) => {
  answers[id] = value;
};

/* ------------------------------------------------------------------ *
 * The sources this map is built from.
 * ------------------------------------------------------------------ */

const runner = readIfPresent(join(REPO, "host", "dsh", "lib", "runner.js"));
const hostIndex = readIfPresent(join(REPO, "host", "dsh", "lib", "index.js"));
const workWorker = readIfPresent(join(REPO, "src", "deployment", "work_worker.ts"));
const workDelegation = readIfPresent(join(REPO, "src", "interaction", "work_delegation.ts"));
const agentLoop = readIfPresent(join(PACKAGE_ROOT, "dsh-agent-loop", "lib", "index.js"));
const agentRegistry = readIfPresent(join(PACKAGE_ROOT, "dsh-agent", "lib", "index.js"));

/**
 * §5 Q1/Q2/Q3 — the WORKER block of the shipped runner, isolated by its own function anchors.
 *
 * The worker block is the region from `async function runWorker` to `async function runBranch`. Every
 * measurement about "what the worker route reports" is taken from THIS slice, so a fact about the
 * principal route cannot be mistaken for a fact about the Work route.
 */
const workerBlock = region(runner, "async function runWorker", "async function runBranch");
const branchBlock = region(runner, "async function runBranch", "async function run(");

record("Q1_where_the_worker_session_id_is_minted", {
  source: "host/dsh/lib/runner.js (runWorker)",
  expression: "sessionId: brandString(`worker-${randomUUID()}`)",
  mintedBy: "the Palimpsest DSH host bundle, inside the runWorker call to agents.create",
  present: workerBlock !== null && /sessionId:\s*brandString\(`worker-\$\{randomUUID\(\)\}`\)/u.test(workerBlock),
  note: "the id is a CANDIDATE minted before creation; the authoritative identity is what DSH returns for the created session",
});

record("Q2_where_the_session_becomes_a_real_published_dsh_session", {
  source: "node_modules/@deepseek-ai/dsh-agent-loop/lib/index.js (AgentLoop.createAgent) + node_modules/@deepseek-ai/dsh-agent/lib/index.js (AgentRegistry.create)",
  observedCallChain: [
    "host runner: await agents.create({ sessionId, meta, agentOptions, setup })",
    "AgentRegistry.create -> requireFactory() -> factory.createAgent(ownerCtx, options)",
    "AgentLoop.createAgent: SessionPreparation.create(sessions.prepare(options.sessionId, {meta}))",
    "AgentLoop.createAgent: await this.createStoredSession(preparation.session)  <-- the session is STORED here",
    "AgentLoop.createAgent: setupAndPublish(...) -> initializeAgent -> prepare -> setup?(...) -> publish(source)",
    "AgentRegistry.enter(agent, owner) asserts agent.id === agent.session.id",
  ],
  createStoredSessionPrecedesPublication: agentLoop !== null && /await this\.createStoredSession\(preparation\.session\)/u.test(agentLoop),
  publishAssertsAgentIdEqualsSessionId: agentRegistry !== null && /agent id "?\$\{id\}"? does not match session id/u.test(agentRegistry.replace(/\s+/gu, " ")),
  note: "the session exists and is stored BEFORE setup runs and BEFORE publication; a successful create therefore yields a real session identity independently of any later turn",
});

record("Q3_where_the_host_could_report_it_before_model_execution", {
  source: "host/dsh/lib/runner.js (runWorker)",
  afterCreateAnchor: "const handle = await agents.create({",
  handleAgentAnchor: "const agent = handle.agent;",
  firstModelTurnAnchor: "agent.followup(",
  orderInSource: {
    createIndex: workerBlock === null ? -1 : workerBlock.indexOf("const handle = await agents.create({"),
    capabilityRefusalIndex: workerBlock === null ? -1 : workerBlock.indexOf("if (capabilityRefusal !== null)"),
    handleAgentIndex: workerBlock === null ? -1 : workerBlock.indexOf("const agent = handle.agent;"),
    firstFollowupIndex: workerBlock === null ? -1 : workerBlock.indexOf("agent.followup("),
  },
  identityAvailableOnHandle: "handle.agent.session.id (AgentRegistry asserts agent.id === session.id, and the principal path already reads String(agent.session.id))",
  note: "the created identity is available from the returned handle immediately after create resolves, and the first model turn is a LATER statement — so a report emitted between them cannot depend on the model's answer",
});

/* ------------------------------------------------------------------ *
 * Q4/Q5/Q6/Q7/Q8 — the Parent side.
 * ------------------------------------------------------------------ */

record("Q4_where_the_parent_currently_receives_ipc", {
  source: "src/deployment/work_worker.ts (dshSubprocessWorkWorkerPort.run)",
  listener: 'spawned.on("message", (message) => ...)',
  present: workWorker !== null && /spawned\.on\("message"/u.test(workWorker),
  parser: "parseWorkerPullEnvelope(message) -> { requestId, handle } | undefined",
  ipcStdio: 'stdio: ["ignore", "pipe", "pipe", "ipc"]  // stdio[3] is the ONE child IPC channel',
  note: "the parent owns the direct child's IPC channel and already parses ONE strict structured message shape on it",
});

record("Q5_why_context_pull_is_not_an_identity_report", {
  source: "src/deployment/work_worker.ts + host/dsh/lib/index.js",
  direction: "child -> parent REQUEST (kind: 'pull'), parent -> child RESPONSE (kind: 'pull-result')",
  requestFields: ["channel", "kind", "requestId", "handle"],
  responseFields: ["channel", "kind", "requestId", "status", "value?", "detail?"],
  carriesSessionId: false,
  reason:
    "the pull protocol names a CONTEXT HANDLE and nothing else; neither direction carries the worker's DSH SessionId, and the parent's answer is a canonical body rather than an identity. A pull that never happens leaves the parent with no session identity at all",
  handlerTreatsUnknownEnvelope: "returns early when parseWorkerPullEnvelope is undefined — an identity-shaped message would be silently DROPPED today",
});

record("Q6_where_the_invocation_id_is_minted", {
  source: "src/deployment/work_worker.ts (dshSubprocessWorkWorkerPort.run)",
  expression: "const invocationId = `wpi-${randomUUID()}`",
  present: workWorker !== null && /const invocationId = `wpi-\$\{randomUUID\(\)\}`/u.test(workWorker),
  owner: "the Parent Deployment Worker Port, one per port invocation",
  emittedOn: "HostProcessObservation.invocationId (the port's own observation emitter)",
  note: "the port mints it and the parent already owns the spawned object, so the parent is the correct owner of the invocation identity",
});

record("Q7_where_the_attempt_id_is_attached_to_host_observations", {
  source: "src/interaction/work_delegation.ts (correlateObservations / executeMutatingWorkBlocking / makeWorkDelegationService.start)",
  mechanism: "correlateObservations(sink, { hostLocalJobId, attemptId }) wraps the sink and stamps the identity onto each observation",
  attemptSource: "prepared.attemptId from deps.controller.prepareMutatingWork(...) — the canonical Work owner",
  invocationSource: "observation.invocationId, ADOPTED from the producer (the port), never minted here",
  present: workDelegation !== null && /function correlateObservations/u.test(workDelegation),
  note: "this is the one host-private boundary that legitimately holds the canonical AttemptId and its own job id; it is where a correlated Session identity belongs",
});

record("Q8_where_the_host_job_id_is_attached", {
  source: "src/interaction/work_delegation.ts",
  asyncPath: "const jobId = `wdj-${randomUUID()}` in makeWorkDelegationService.start",
  blockingPath: 'correlateObservations(..., { hostLocalJobId: "", attemptId: prepared.attemptId }) — the blocking kernel has NO host job, so it supplies the empty string rather than inventing one',
  present: workDelegation !== null && /const jobId = `wdj-\$\{randomUUID\(\)\}`/u.test(workDelegation),
  note: "host-local and non-durable; the blocking path deliberately has none, and a correlated identity must not fabricate one",
});

/* ------------------------------------------------------------------ *
 * Q9 — the missing facts, MEASURED on the worker block.
 * ------------------------------------------------------------------ */

const workerStrippedOfMinting =
  workerBlock === null ? null : workerBlock.replace(/sessionId:\s*brandString\(`worker-\$\{randomUUID\(\)\}`\)/u, "");

record("Q9_which_facts_are_missing_for_real_session_attribution", {
  workerBlockMentionsSessionIdOutsideMinting: workerStrippedOfMinting === null ? null : /sessionId/u.test(workerStrippedOfMinting),
  workerBlockCallsProcessSend: workerBlock === null ? null : /process\.send/u.test(workerBlock),
  workerBlockCallsFollowup: workerBlock === null ? null : /agent\.followup\(/u.test(workerBlock),
  hostIndexSendsIpcOnlyInPullTool: hostIndex !== null && /process\.send\(\{/u.test(hostIndex) && !/process\.send\(\{\s*channel:[^}]*session/iu.test(hostIndex),
  parentParsesOnlyThePullEnvelope: workWorker !== null && /const envelope = parseWorkerPullEnvelope\(message\);/u.test(workWorker) && !/parseWorkerSessionIdentityEnvelope/u.test(workWorker),
  missing: [
    "the actual created DSH SessionId is never read into a report on the Work route",
    "no structured Host -> Parent identity message exists on the IPC channel",
    "the parent has no Session Identity parser branch on spawned.on('message')",
    "the parent therefore records no per-invocation observed session identity",
    "no correlation layer can attach a real DSH SessionId to the canonical AttemptId",
  ],
  note: "the identity EXISTS at runtime (the handle exposes it) but nothing transports or records it",
});

record("Q10_existing_semantics_that_must_not_change", {
  capabilityRefusal: "a refused worker still throws 'refusing to run this worker: ...' and reports HOST_FAILURE — a created session must not be relabelled as work success",
  workerResultContract: "PALIMPSEST_WORK_RESULT and parseWorkWorkerResult are unchanged; an identity report is NOT a work result",
  contextPullAllowlist: "parseWorkerPullEnvelope and workerPullHandleAllowed are unchanged; the pull protocol stays independent",
  workerPayloadBytes: "workWorkerEnvironmentPayload output stays byte-identical; the identity is host-side, not model-visible",
  settlementAuthority: "prepareMutatingWork / settleMutatingWork are untouched; an observed SessionId settles nothing",
  hostObservationSchema: "HostProcessObservation keeps its shape; the session identity is a SEPARATE observation, never smuggled into hostFailureDetail",
  h1BindingResolver: "resolveVerifiedSessionBinding is untouched; a P2-A observation is NOT durable binding evidence and must not reach BOUND_VERIFIED",
  pageIntegrity: "validateSessionEventPage is untouched",
});

/* ------------------------------------------------------------------ *
 * The runtime measurement of the SAME absence, from the installed bundle.
 * ------------------------------------------------------------------ */

const installedRunner = readIfPresent(join(PACKAGE_ROOT, "palimpsest-dsh-host", "lib", "runner.js"));
record("installed_bundle_measurement", {
  installedBundlePresent: installedRunner !== null,
  installedBundleHasWorkerIdentityReport: installedRunner === null ? null : /process\.send[\s\S]{0,200}session/iu.test(installedRunner),
  note: "measured against the INSTALLED bundle, not only the working tree, so the answer describes what would actually run",
});

/* ------------------------------------------------------------------ *
 * The identity chain, with each link's owner.
 * ------------------------------------------------------------------ */

const out = {
  schemaVersion: 1,
  kind: "TRAJECTORY_P2A_DSH_IDENTITY_SOURCE_MAP",
  stage: "Trajectory-P2A",
  readOnly: true,
  modelCallsMade: 0,
  personalSessionsAccessed: false,
  installedVersions: installedVersions(),
  answers,
  identityChain: [
    { identity: "canonical Work AttemptId", owner: "canonical Work (prepareMutatingWork)", hasProducer: true },
    { identity: "host-local JobId", owner: "Work Delegation Service", hasProducer: true, durable: false },
    { identity: "Port InvocationId", owner: "Parent Deployment Worker Port", hasProducer: true },
    { identity: "direct child pid", owner: "Parent ChildProcess observation", hasProducer: true },
    { identity: "actual DSH SessionId", owner: "DSH Host / Agent Session", hasProducer: true, transportedToParent: false },
  ],
  smallestSupportedIntegrationPoint: {
    producer: "host/dsh/lib/runner.js runWorker: report handle.agent.session.id on the existing stdio[3] IPC channel after create succeeds and before the first followup",
    consumer: "src/deployment/work_worker.ts: a strict Session Identity parser branch on spawned.on('message'), associating the identity with the port's OWN invocationId",
    correlation: "src/interaction/work_delegation.ts: an optional correlated session-identity sink that reuses the existing AttemptId/JobId ownership",
    whyNotStdout: "stdout is model-writable, so a stdout line is worker testimony; the IPC channel is owned by the host bundle and is not reachable by the model",
  },
  dshHomeReported: sanitize(DSH_HOME),
  repositoryRootReported: sanitize(REPO),
  note: "no finding here authorizes PRIMARY execution, a durable binding or automatic Handoff",
};

process.stdout.write(JSON.stringify(out, null, 2) + "\n");
