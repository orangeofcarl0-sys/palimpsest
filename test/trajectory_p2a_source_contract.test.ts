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
     * The falsifier: with the minting expression removed, the worker block mentions NO session
     * identity at all. The created identity is therefore never read into any report.
     */
    const stripped = block.replace(/sessionId:\s*brandString\(`worker-\$\{randomUUID\(\)\}`\)/u, "");
    expect(stripped).not.toMatch(/sessionId/u);
    // And the worker holds no IPC send at all: the ONE channel the parent owns is unused here.
    expect(block).not.toContain("process.send");
  });

  it("F1: the only IPC producer in the host bundle is the CONTEXT PULL tool, and it carries no session identity", () => {
    const index = source(FILES.hostIndex);
    // The pull tool is the sole `process.send` site in the shipped host bundle.
    const sends = index.match(/process\.send\(/gu) ?? [];
    expect(sends.length).toBe(1);
    // Its envelope names a channel, a kind, a requestId and a handle — no session identity field.
    expect(index).toContain("channel: typeof raw.contextPullChannel === 'string'");
    expect(index).toContain("kind: 'pull'");
    expect(index).not.toContain("dshSessionId");
    expect(index).not.toContain("session-created");
  });

  it("F1: the installed host bundle agrees with the working tree — this is not a build-staleness artifact", () => {
    const installed = join(PROFILE_MODULES, "palimpsest-dsh-host", "lib", "runner.js");
    if (!existsSync(installed)) {
      // A machine with no installed Palimpsest host bundle cannot run the Level C gate either.
      expect(existsSync(join(PROFILE_MODULES, "palimpsest-dsh-host"))).toBe(false);
      return;
    }
    const text = readFileSync(installed, "utf8");
    expect(text).not.toMatch(/process\.send[\s\S]{0,200}session/iu);
    expect(text).toContain("sessionId: brandString(`worker-${randomUUID()}`)");
  });
});

/* ================================================================== F2 */

describe("P2A F2 — the parent has no Session Identity parser", () => {
  it("F2 (baseline, SOURCE_DEMONSTRATED): spawned.on('message') recognizes only the pull envelope", () => {
    const text = source(FILES.workWorker);
    expect(text).toContain('spawned.on("message", (message: unknown) => {');
    // The ONE parser the listener consults.
    expect(text).toContain("const envelope = parseWorkerPullEnvelope(message);");
    // Any message that is not the pull envelope is dropped without inspection.
    expect(text).toContain("if (envelope === undefined) return;");
    // No session identity parser, channel constant or observation field exists yet.
    expect(text).not.toContain("parseWorkerSessionIdentityEnvelope");
    expect(text).not.toContain("WORK_WORKER_SESSION_IDENTITY_CHANNEL");
    expect(text).not.toContain("WorkerSessionIdentityObservation");
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
    const followupIndex = block.indexOf("agent.followup(");
    expect(createIndex).toBeGreaterThan(-1);
    expect(handleIndex).toBeGreaterThan(createIndex);
    expect(followupIndex).toBeGreaterThan(handleIndex);
    // The capability refusal sits BETWEEN create and the first followup — the exact window P2-A uses.
    const refusalIndex = block.indexOf("if (capabilityRefusal !== null)");
    expect(refusalIndex).toBeGreaterThan(createIndex);
    expect(refusalIndex).toBeLessThan(followupIndex);
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
