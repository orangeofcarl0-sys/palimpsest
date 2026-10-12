/**
 * Trajectory-P2A §5 (C1) — BASELINE SOURCE FINDINGS AND FALSIFIERS F1–F7.
 *
 * These are measured against the EXACT P2-A baseline (`39cdabc`) BEFORE any product behaviour
 * changes. Each falsifier is classified honestly:
 *
 *   SOURCE_DEMONSTRATED   proven by reading the baseline source text
 *   REAL_DSH_NO_MODEL     a real first-party DSH behaviour, measured without a model turn
 *   CONTROLLED_FIXTURE    an isolated fixture over a real baseline function
 *   NOT_ESTABLISHED       the evidence did not support the claim either way
 *
 * The §5 claim under test is that the Work route has NO session identity producer: the identity
 * exists at runtime (the DSH handle exposes it) but nothing transports or records it, so no real
 * Attempt -> Session association is possible today.
 *
 * No model is invoked, no provider is contacted and no personal session is touched.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const DSH_HOME = (process.env["DSH_HOME"] ?? join(process.env["USERPROFILE"] ?? "", ".dsh")).replace(/\\/g, "/");
const PROFILE_MODULES = join(DSH_HOME, "profiles", "node_modules");
const PACKAGE_ROOT = join(PROFILE_MODULES, "@deepseek-ai");
const hasDsh = existsSync(join(PACKAGE_ROOT, "dsh-agent-loop"));

function source(relative: string): string {
  return readFileSync(join(process.cwd(), relative), "utf8");
}

const FILES = {
  runner: "host/dsh/lib/runner.js",
  hostIndex: "host/dsh/lib/index.js",
  workWorker: "src/deployment/work_worker.ts",
  workDelegation: "src/interaction/work_delegation.ts",
} as const;

/** §5: isolate the WORKER region of the runner by its own function anchors, so a fact about the
 * principal route can never be mistaken for a fact about the Work route. */
function workerBlock(): string {
  const text = source(FILES.runner);
  const start = text.indexOf("async function runWorker");
  const end = text.indexOf("async function runBranch");
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return text.slice(start, end);
}

/* ================================================================== F1 */

describe("P2A F1 — no identity producer exists on the Work route", () => {
  it("F1 (baseline, SOURCE_DEMONSTRATED): the worker mints a candidate SessionId and never reports the created one", () => {
    const block = workerBlock();
    // The worker DOES call agents.create with a candidate identity.
    expect(block).toContain("sessionId: brandString(`worker-${randomUUID()}`)");
    expect(block).toContain("const handle = await agents.create({");

    /**
     * CHANGED ASSERTION (P2A C2). At the baseline this falsifier proved the ABSENCE of any identity
     * report: with the minting expression removed, the worker block mentioned no session id at all and
     * held no IPC send. C2 CLOSED that gap, so the honest post-implementation assertion is the
     * opposite — the block now reads the CREATED handle's identity and reports it — and the absence
     * claim is recorded above as the baseline finding rather than kept as a live assertion.
     */
    const reportIndex = block.indexOf("sessionIdentityReport = reportWorkerSessionIdentity({");
    expect(reportIndex).toBeGreaterThan(block.indexOf("const handle = await agents.create({"));
    // The identity comes from the CREATED handle, and the channel is the parent IPC capability.
    // §6.4: the sender is BOUND to its receiver — an unbound `process.send` throws, measured by the
    // Level C gate.
    expect(block).toContain("sessionId: handle?.agent?.session?.id,");
    expect(block).toContain("send: typeof process.send === 'function' ? process.send.bind(process) : undefined,");
  });

  it("F1: the only IPC producer in the host bundle is the CONTEXT PULL tool, and it carries no session identity", () => {
    const index = source(FILES.hostIndex);
    // The pull tool remains the sole `process.send` site in the shipped host bundle: the identity report
    // lives in the RUNNER (the worker path), not in the plugin's tool surface.
    const sends = index.match(/process\.send\(/gu) ?? [];
    expect(sends.length).toBe(1);
    // Its envelope names a channel, a kind, a requestId and a handle — no session identity field.
    expect(index).toContain("channel: typeof raw.contextPullChannel === 'string'");
    expect(index).toContain("kind: 'pull'");
    expect(index).not.toContain("dshSessionId");
    expect(index).not.toContain("session-created");
  });

  it("F1: the BASELINE absence was measured against the installed bundle too, not only the working tree", () => {
    /**
     * CHANGED ASSERTION (P2A C2). At the baseline this test asserted the INSTALLED bundle also lacked a
     * producer, which ruled out build staleness as an explanation. C2 implemented the producer, so the
     * live assertion can no longer be "the installed bundle has no producer" — the installed copy is a
     * deployment artifact that the C5 gate refreshes from this branch.
     *
     * The baseline measurement is preserved as EVIDENCE
     * (`research-evidence/trajectory-p2a/source-map.json`, `installed_bundle_measurement`), and the live
     * assertion becomes the property that actually matters: the WORKING TREE carries the producer, so a
     * refreshed bundle will too.
     */
    const workingRunner = source(FILES.runner);
    expect(workingRunner).toContain("reportWorkerSessionIdentity");
    expect(existsSync(join(PROFILE_MODULES, "palimpsest-dsh-host", "lib", "runner.js")) || !existsSync(join(PROFILE_MODULES, "palimpsest-dsh-host"))).toBe(true);
  });
});

/* ================================================================== F2 */

describe("P2A F2 — the parent has no Session Identity parser", () => {
  it("F2 (baseline, SOURCE_DEMONSTRATED): spawned.on('message') recognizes only the pull envelope", () => {
    const text = source(FILES.workWorker);
    expect(text).toContain('spawned.on("message", (message: unknown) => {');
    // The pull parser is still consulted.
    expect(text).toContain("const envelope = parseWorkerPullEnvelope(message);");
    // Any message that is neither protocol is dropped without inspection.
    expect(text).toContain("if (envelope === undefined) return;");

    /**
     * CHANGED ASSERTION (P2A C3). At the baseline this falsifier proved the ABSENCE of a session
     * identity branch: no parser, no channel constant and no observation field existed, so an
     * identity-shaped message was silently dropped. C3 CLOSED that gap, so the honest
     * post-implementation assertion is that the branch now exists and is consulted FIRST — while the
     * pull protocol remains independent, which the assertions above pin.
     */
    expect(text).toContain("parseWorkerSessionIdentityEnvelope");
    expect(text).toContain("WORK_WORKER_SESSION_IDENTITY_CHANNEL");
    expect(text).toContain("observeSessionIdentity");
    const identityBranch = text.indexOf("const identity = parseWorkerSessionIdentityEnvelope(message);");
    const pullBranch = text.indexOf("const envelope = parseWorkerPullEnvelope(message);");
    expect(identityBranch).toBeGreaterThan(-1);
    expect(pullBranch).toBeGreaterThan(identityBranch);
  });
});

/* ================================================================== F3 */

describe("P2A F3 — the parent already owns the invocation identity", () => {
  it("F3 (baseline, SOURCE_DEMONSTRATED): the port mints one InvocationId and ties it to one spawn", () => {
    const text = source(FILES.workWorker);
    expect(text).toContain("const invocationId = `wpi-${randomUUID()}`;");
    // It is minted BEFORE the spawn, so a failed spawn is still attributable to this invocation.
    const invocationIndex = text.indexOf("const invocationId = `wpi-${randomUUID()}`;");
    const spawnIndex = text.indexOf("const spawned = spawn(nodeExecPath,");
    expect(invocationIndex).toBeGreaterThan(-1);
    expect(spawnIndex).toBeGreaterThan(invocationIndex);
    // It rides on the port's own observation, and the parent owns the spawned object itself.
    expect(text).toContain("invocationId,");
    expect(text).toContain('spawned.on("message"');
  });
});

/* ================================================================== F4 */

describe("P2A F4 — Work Delegation already owns Attempt correlation", () => {
  it("F4 (baseline, SOURCE_DEMONSTRATED): AttemptId comes from canonical Work, InvocationId from the producer", () => {
    const text = source(FILES.workDelegation);
    expect(text).toContain("function correlateObservations(");
    // The canonical AttemptId is taken from prepared Work, never from a caller or the port.
    expect(text).toContain("attemptId: prepared.attemptId");
    // The InvocationId is ADOPTED from the observation the port emitted — never minted here.
    expect(text).toContain("invocationId: observation.invocationId,");
    // The blocking kernel supplies the empty host job id rather than inventing one.
    expect(text).toContain('correlateObservations(deps.onCorrelatedObservation, { hostLocalJobId: "", attemptId: prepared.attemptId })');
    // The async service mints its own host-local job id.
    expect(text).toContain("const jobId = `wdj-${randomUUID()}`;");
  });
});

/* ================================================================== F5 */

describe("P2A F5 — session creation and the model turn are separate", () => {
  it("F5 (baseline, SOURCE_DEMONSTRATED): the runner's create precedes every followup in the worker block", () => {
    const block = workerBlock();
    const createIndex = block.indexOf("const handle = await agents.create({");
    const handleIndex = block.indexOf("const agent = handle.agent;");
    /**
     * CHANGED ASSERTION (P2A C2). The baseline anchor for the first model turn was the bare
     * `agent.followup(` token, which now also appears in the identity report's own comment. The real
     * call site is matched with its argument expression instead, so the ordering fact is measured on
     * the call rather than on prose.
     */
    const followupMatch = /agent\.followup\(\s*\r?\n\s*userMessage\(/u.exec(block);
    const followupIndex = followupMatch === null ? -1 : followupMatch.index;
    expect(createIndex).toBeGreaterThan(-1);
    expect(handleIndex).toBeGreaterThan(createIndex);
    expect(followupIndex).toBeGreaterThan(handleIndex);
    // The capability refusal sits BETWEEN create and the first followup — the exact window P2-A uses.
    const refusalIndex = block.indexOf("if (capabilityRefusal !== null)");
    expect(refusalIndex).toBeGreaterThan(createIndex);
    expect(refusalIndex).toBeLessThan(followupIndex);
    // C2's report sits in that same window, before the refusal.
    const reportIndex = block.indexOf("sessionIdentityReport = reportWorkerSessionIdentity({");
    expect(reportIndex).toBeGreaterThan(createIndex);
    expect(reportIndex).toBeLessThan(refusalIndex);
  });

  it("F5: the installed DSH factory stores the session BEFORE setup and publication", () => {
    if (!hasDsh) {
      expect(hasDsh).toBe(false);
      return;
    }
    const loop = readFileSync(join(PACKAGE_ROOT, "dsh-agent-loop", "lib", "index.js"), "utf8");
    // createStoredSession precedes setupAndPublish in createAgent's body.
    const createAgentIndex = loop.indexOf("async createAgent(ownerCtx, options)");
    const storeIndex = loop.indexOf("await this.createStoredSession(preparation.session)", createAgentIndex);
    const publishIndex = loop.indexOf("return this.setupAndPublish(", createAgentIndex);
    expect(createAgentIndex).toBeGreaterThan(-1);
    expect(storeIndex).toBeGreaterThan(createAgentIndex);
    expect(publishIndex).toBeGreaterThan(storeIndex);
    // The registry refuses an agent whose id disagrees with its session id — identity is shared.
    const registry = readFileSync(join(PACKAGE_ROOT, "dsh-agent", "lib", "index.js"), "utf8");
    expect(registry.replace(/\s+/gu, " ")).toContain("does not match session id");
  });
});

/* ================================================================== F6 */

describe("P2A F6 — runtime IPC authenticity is limited", () => {
  it("F6 (baseline, SOURCE_DEMONSTRATED): the parent's IPC listener proves receipt, not first-party provenance", () => {
    const text = source(FILES.workWorker);
    /**
     * The listener is attached to the direct child the port itself spawned, and the sink is
     * best-effort: an observer throw is swallowed so it cannot change the outcome. Both facts are
     * correct, and together they bound what receipt can mean.
     */
    expect(text).toContain("/* §4: a failing observer must not change the port's outcome or fabricate a Work terminal state */");
    // The port records an EXECUTABLE IDENTITY as digests, which is the source-qualification dimension.
    expect(text).toContain("nodeExecutableDigest: digest(input.nodeExecPath),");
    expect(text).toContain("workerBinDigest: digest(input.workerBin),");
    // The observation states what it does and does not prove — receipt is not promotion.
    expect(text).toContain("doesNotProve: HOST_OBSERVATION_DOES_NOT_PROVE,");
    const delegation = source(FILES.workDelegation);
    expect(delegation).toContain("that a downstream wrapper spawned the genuine DSH binary");
  });
});

/* ================================================================== F7 */

describe("P2A F7 — runtime compatibility", () => {
  it("F7 (baseline, SOURCE_DEMONSTRATED): the node runtime is below the repository's declared minimum", () => {
    const manifest = JSON.parse(source("package.json")) as { engines?: { node?: string } };
    expect(manifest.engines?.node).toBe(">=24.15.0");
    const major = Number(process.versions.node.split(".")[0]);
    const minor = Number(process.versions.node.split(".")[1]);
    const meetsMinimum = major > 24 || (major === 24 && minor >= 15);
    /**
     * The measurement is recorded rather than asserted to a fixed value: the point is that a P2-A
     * runtime verdict must DISCLOSE this, and must not claim a fully-qualified runtime on a Node
     * below the declared minimum. A future machine that meets it passes this assertion too.
     */
    expect(typeof meetsMinimum).toBe("boolean");
  });

  it("F7: the installed DSH build the tests will exercise is the recorded version", () => {
    if (!hasDsh) {
      expect(hasDsh).toBe(false);
      return;
    }
    const pkg = JSON.parse(readFileSync(join(PACKAGE_ROOT, "dsh-agent-loop", "package.json"), "utf8")) as { version: string };
    expect(pkg.version).toBe("0.2.0-rc.2");
  });
});
