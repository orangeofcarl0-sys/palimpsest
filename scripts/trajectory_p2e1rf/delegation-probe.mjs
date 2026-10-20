/**
 * Trajectory-P2-E1RF §4.5 — REAL FIRST-PARTY DSH CONFIRMATION OF THE DELEGATION FENCE.
 *
 * THE QUESTION. RF-A's unit controls prove the GUARD's decision is right. They say nothing about ordering: that
 * the refusal happens BEFORE the child Session exists and before its `agent/pre-step` instruction discovery
 * reads anything. That ordering is the whole security claim, and only the real host can show it.
 *
 * THE OBSERVATION. A worker process runs with its cwd set to the test-owned world. A deterministic local
 * adapter makes the worker call `tools.subagent({ cwd })` through `run_code`. Every Session the run persists is
 * then read back THROUGH OFFICIAL DSH PERSISTENCE and searched for the synthetic tokens. The verdict names both
 * facts separately:
 *
 *   1. did a CHILD SESSION get created? (`childSessionCreated`)
 *   2. did any unauthorized token reach a `user/message`? (`canaryDelivered` / `siblingTokenDelivered`)
 *
 * A case is closed only when the answer is NO to both. `HOST_FAILURE` alone closes nothing: §4.5 says explicitly
 * that a failed child does not imply nothing was read.
 *
 * THE CASES THIS STAGE ADDS. E1RE tested sibling, protected, parent-of-protected, traversal, world and the
 * production layout. RF-A adds the two that the defect was about:
 *   · `aliasToWorld`     — a junction whose CURRENT target is the world. Refused before this stage.
 *   · `aliasToProtected` — a junction to the protected root (already refused; the contrast).
 *
 * SAFETY. Every root is allocated through `allocateOwnedRoot` (containment proven, ownership marker written) and
 * removed through `safeCleanup`, which proves containment again before deleting and never follows a link. Tokens
 * are synthetic. No personal path, session, credential or project file is read, and no external or paid model is
 * contacted: a deterministic local adapter serves every turn.
 *
 * Usage:  node scripts/trajectory_p2e1rf/delegation-probe.mjs --case <name> [--json-out <path>]
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { REPO, allocateOwnedRoot, safeCleanup } from "../trajectory_p2e0/owned-root.mjs";
import { dshBin, installHostBundle, shareDshModules } from "../trajectory_p2e0/dsh-test-home.mjs";
import { prepareFixture } from "../trajectory_p2e0/benchmark-fixture.mjs";

const ARG_CASE = process.argv.includes("--case") ? process.argv[process.argv.indexOf("--case") + 1] : "aliasToWorld";
const ARG_JSON_OUT = process.argv.includes("--json-out") ? process.argv[process.argv.indexOf("--json-out") + 1] : null;
const PROFILE = `p2e1rf-delegation-${ARG_CASE}`;
const CANARY = "P2E1RF-CANARY-4d81b6e2-SYNTHETIC-ONLY";
const SIBLING_TOKEN = "P2E1RF-SIBLING-9a2c7f15";
const WORLD_TOKEN = "P2E1RF-WORLD-INSTRUCTIONS-ALLOWED";

const owned = allocateOwnedRoot("p2e1rf-delegation-", `delegation-${ARG_CASE}`);
const report = {
  schemaVersion: 1,
  kind: "TRAJECTORY_P2E1RF_DELEGATION_FALSIFIER",
  stage: "Trajectory-P2-E1RF",
  case: ARG_CASE,
  canaryToken: CANARY,
  ordering: [],
  observations: {},
  verdict: "NOT_RUN",
};

const step = (id, detail) => {
  report.ordering.push({ seq: report.ordering.length + 1, id, detail });
  process.stderr.write(`  ${String(report.ordering.length).padStart(2)} ${id}${detail === undefined ? "" : ` — ${String(detail).slice(0, 160)}`}\n`);
};

/** Read one session's events through the REAL installed persistence, by exact id (read-only). */
async function readSessionEvents(sessionsRoot, sessionId) {
  const { readSessionEventsByExactId } = await import(pathToFileURL(join(REPO, "scripts", "trajectory_p2e1r", "answer-extraction.mjs")).href);
  return readSessionEventsByExactId({ sessionsRoot, sessionId });
}

/** Every session id present in the test-owned sessions root. */
function listSessionIds(sessionsRoot) {
  if (!existsSync(sessionsRoot)) return [];
  const found = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const path = join(dir, entry.name);
      if (existsSync(join(path, "session.v4.jsonl.zstd")) || existsSync(join(path, "session.v4.jsonl"))) found.push(entry.name);
      else walk(path);
    }
  };
  walk(sessionsRoot);
  return found;
}

try {
  const home = join(owned.root, "home");
  mkdirSync(join(home, "profiles"), { recursive: true });
  installHostBundle(home, REPO);
  const share = shareDshModules(home, { strategy: "junction" });
  step("module-share", share.strategy);

  const world = ARG_CASE === "production" ? join(owned.root, ".palimpsest", "worlds", "attempt-1") : join(owned.root, "world");
  const sibling = ARG_CASE === "production" ? join(owned.root, ".palimpsest", "worlds", "attempt-2") : join(owned.root, "sibling-world");
  const protectedRoot = ARG_CASE === "production" ? join(owned.root, ".palimpsest") : join(owned.root, "durable-state");
  for (const dir of [world, sibling, protectedRoot]) mkdirSync(dir, { recursive: true });
  writeFileSync(join(world, "AGENTS.md"), `${WORLD_TOKEN}\n`, "utf8");
  writeFileSync(join(sibling, "AGENTS.md"), `${SIBLING_TOKEN}\n`, "utf8");
  if (ARG_CASE !== "production") writeFileSync(join(protectedRoot, "AGENTS.md"), `${CANARY}\n`, "utf8");

  /**
   * THE ALIAS FIXTURES. Created INSIDE the world, which is what a model-controlled path could name. A junction
   * is used because it needs no privilege on Windows; a symlink would require Developer Mode.
   */
  const aliasToWorld = join(world, "alias-to-world");
  const aliasToProtected = join(world, "alias-to-protected");
  /**
   * THE ALIAS FIXTURES ARE BUILT ONLY FOR THE CASES THAT NEED THEM.
   *
   * E1RF created both junctions for EVERY case, which was harmless while the alias scan's verdict did not stop
   * a worker. E1RG RG-A made a rejected world a PRE-CREATE REFUSAL, so a leftover `alias-to-protected` inside the
   * world now refuses the `world`, `sibling`, `protected`, `traversal` and `production` cases before the
   * delegation probe can run — the case would report "no leak" while having measured nothing about delegation.
   *
   * A case that does not test aliasing therefore gets a CLEAN world.
   */
  const needsAliasFixture = ARG_CASE === "aliasToWorld" || ARG_CASE === "aliasToProtected";
  let aliasFixture = "NOT_REQUIRED";
  if (needsAliasFixture) {
    try {
      if (ARG_CASE === "aliasToWorld") symlinkSync(world, aliasToWorld, "junction");
      else symlinkSync(protectedRoot, aliasToProtected, "junction");
      aliasFixture = "created";
    } catch (error) {
      aliasFixture = `FAILED ${error instanceof Error ? String(error.code ?? error.message) : String(error)}`;
    }
  }
  step("alias-fixture", aliasFixture);

  const targets = {
    /* --- the two RF-A cases ------------------------------------------------------------------------ */
    aliasToWorld: { path: aliasToWorld, token: CANARY, expect: "REFUSED_BY_GUARD", why: "a junction whose current target is the world is still a mutable indirection" },
    aliasToProtected: { path: aliasToProtected, token: CANARY, expect: "REFUSED_BY_GUARD", why: "a junction to a protected root" },
    /* --- the E1RE cases, re-confirmed under the corrected guard ------------------------------------ */
    world: { path: world, token: WORLD_TOKEN, expect: "ALLOWED_NO_DELIVERY", why: "legitimate in-world delegation must still work" },
    sibling: { path: sibling, token: SIBLING_TOKEN, expect: "REFUSED_BY_GUARD", why: "a sibling attempt world" },
    protected: { path: protectedRoot, token: CANARY, expect: "REFUSED_BY_GUARD", why: "the simulated durable state" },
    parentOfProtected: { path: owned.root, token: CANARY, expect: "REFUSED_BY_GUARD", why: "the parent of the protected root" },
    traversal: { path: "../durable-state", token: CANARY, expect: "REFUSED_BY_GUARD", why: "relative traversal" },
    production: { path: world, token: WORLD_TOKEN, expect: "ALLOWED_NO_DELIVERY", why: "the real deployment layout" },
  };
  const target = targets[ARG_CASE];
  if (target === undefined) throw new Error(`unknown case "${ARG_CASE}"; known: ${Object.keys(targets).join(", ")}`);
  report.expectedVerdict = target.expect;
  report.why = target.why;
  /**
   * A case whose fixture could not be built is a LIMIT, not a pass. It exits without pretending to have tested
   * the property.
   */
  if (ARG_CASE.startsWith("alias") && aliasFixture !== "created") {
    report.verdict = "FIXTURE_LIMIT";
    report.fixtureLimit = `the alias fixture could not be created on this host: ${String(aliasFixture)}`;
    step("fixture-limit", report.fixtureLimit);
    throw new Error("fixture unavailable");
  }
  step("layout", `W=${world} target=${target.path}`);

  /**
   * THE ADAPTER. One `run_code` call invoking the delegation tool with the model-chosen CWD, then text. PTC mode
   * makes `run_code` the only directly callable name, so this is what a PTC-mode model must do. The child
   * receives the same adapter, which simply answers with text.
   */
  const adapterPath = join(owned.root, "delegation-adapter.mjs");
  const targetLiteral = String(target.path).replace(/\\/gu, "/");
  writeFileSync(
    adapterPath,
    `export const name = "p2e1rf-delegation-llm";
export const inject = ["llm"];
const PROVIDER = "palimpsest-local-delegation";
const MODEL = "delegation-1";
const TARGET_LITERAL = ${JSON.stringify(targetLiteral)};
const IS_TRAVERSAL = ${JSON.stringify(ARG_CASE === "traversal")};
function hasToolResult(messages) {
  if (!Array.isArray(messages)) return false;
  return messages.some((m) => m !== null && typeof m === "object" && m.role === "tool");
}
function make() {
  const providerInfo = (p) => ({ id: p ?? PROVIDER, name: "delegation (test-owned)" });
  const listModels = async (p) => [{ provider: p ?? PROVIDER, id: MODEL, name: "delegation-1" }];
  const resolveModel = async (p, m) => ({ provider: p ?? PROVIDER, id: m ?? MODEL, name: "delegation-1" });
  const providerRetryPolicy = () => undefined;
  const prepareCall = async (p, m) => ({ model: await resolveModel(p, m), stream: (o) => stream(o) });
  async function* stream(options) {
    const messages = options?.messages ?? options?.request?.messages;
    if (hasToolResult(messages)) {
      const text = "DELEGATION-PROBE-FINAL-TEXT";
      yield { type: "block-start", index: 0, blockType: "text" };
      yield { type: "text-delta", index: 0, text };
      yield { type: "block-end", index: 0, block: { type: "text", text } };
      yield { type: "finish", reason: { kind: "stop" } };
      return;
    }
    const cwd = IS_TRAVERSAL ? "../durable-state" : TARGET_LITERAL;
    const code = "return await tools.subagent(" + JSON.stringify({ cwd, description: "delegation probe", prompt: "Report the working directory." }) + ")";
    const argsJson = JSON.stringify({ code, description: "delegate to a child with a chosen cwd" });
    yield { type: "block-start", index: 0, blockType: "tool-call" };
    yield { type: "tool-call-delta", index: 0, id: "call-1", name: "run_code", argumentsDelta: argsJson };
    yield { type: "block-end", index: 0, block: { type: "tool-call", id: "call-1", name: "run_code", arguments: argsJson } };
    yield { type: "finish", reason: { kind: "tool-calls" } };
  }
  return { providerInfo, listModels, resolveModel, providerRetryPolicy, prepareCall, stream };
}
export function apply(ctx) {
  ctx.llm.registerAdapter([PROVIDER], make());
}
`,
  );

  const profileDir = join(home, "profiles", PROFILE);
  mkdirSync(profileDir, { recursive: true });
  writeFileSync(
    join(profileDir, "package.json"),
    `${JSON.stringify({ name: `dsh-profile-${PROFILE}`, private: true, dependencies: {}, dsh: { profile: { bundles: ["@deepseek-ai/dsh-base", "palimpsest-dsh-host"], patchReload: "startup" } } }, null, 2)}\n`,
  );
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
      "- id: agent-default-model",
      "  config:",
      "    provider: palimpsest-local-delegation",
      "    model: delegation-1",
      "",
      "- insert:",
      "    - id: p2e1rf-delegation-llm",
      `      name: '${pathToFileURL(adapterPath).href}'`,
      "",
    ].join("\n"),
  );
  writeFileSync(
    join(profileDir, "deployment.json"),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        profileId: PROFILE,
        projectId: "p2e1rf",
        localPeer: "p2e1rf-peer",
        persistentPoint: "pp-p2e1rf",
        transport: { namespace: PROFILE, databasePath: join(owned.root, "transport.sqlite") },
        databases: { orchestration: join(owned.root, "orch.sqlite"), ordarium: join(owned.root, "ord.sqlite") },
        reasoning: {},
        execution: "worktree",
        concurrency: 1,
        policy: {},
        standard: { statement: "p2e1rf delegation probe" },
      },
      null,
      2,
    )}\n`,
  );

  const previousHome = process.env.DSH_HOME;
  process.env.DSH_HOME = home;
  let fixture = null;
  try {
    fixture = await prepareFixture({ dshHome: home, profileName: PROFILE, adapterUrl: pathToFileURL(adapterPath).href, presentationMode: "TREATMENT" });
    step("fixture-prepared");

    const workWorker = await import(pathToFileURL(join(REPO, "dist", "src", "deployment", "work_worker.js")).href);
    const context = await fixture.controller.workWorkerAttemptContext(fixture.consumerAttemptId);
    const contextFile = join(owned.root, "worker-context.json");
    writeFileSync(contextFile, JSON.stringify(workWorker.workWorkerEnvironmentPayload(context)));

    const child = spawn(process.execPath, [dshBin(), "--profile", PROFILE, "--work", contextFile], {
      cwd: world,
      stdio: ["ignore", "pipe", "pipe", "ipc"],
      env: { ...process.env, DSH_HOME: home },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("message", (message) => {
      if (message?.kind === "session-created") step("worker-session-created", message.sessionId);
    });
    const code = await new Promise((done) => child.on("close", done));
    step("worker-exit", String(code));
    report.observations.workerExitCode = code;
    report.observations.workerResultLine = stdout.split(/\r?\n/u).find((line) => line.startsWith("PALIMPSEST_WORK_RESULT")) ?? null;
    report.observations.workerEnv = stdout.split(/\r?\n/u).find((line) => line.startsWith("PALIMPSEST_WORKER_ENV")) ?? null;

    const sessionsRoot = join(home, "sessions");
    const ids = listSessionIds(sessionsRoot);
    step("sessions-present", String(ids.length));
    report.observations.sessionIds = ids;
    /**
     * THE ORDERING OBSERVATION. DSH creates the WORKER session, and the child would be a SECOND session. For
     * every refused case there must be exactly one: the worker's own.
     */
    report.observations.childSessionCreated = ids.length > 1;
    /**
     * HOST-S1 §9.2 — A POSITIVE CASE MUST PROVE THAT A DELEGATION ACTUALLY HAPPENED.
     *
     * `childSessionCreated` is inferred from the session COUNT, which is a weaker observation than it looks: it
     * cannot distinguish "the child ran" from "an unrelated second session exists", and — more importantly — it
     * says nothing at all when the count is ZERO. The E1RG matrix recorded the `production` case as
     * `ALLOWED_NO_DELIVERY` with `sessionCount: 0` and `refusalPoint: PRE_CREATE_ALIAS_ADMISSION`, i.e. a worker
     * that was refused before it ever composed an Agent was scored as a successful legitimate delegation
     * (`baseline-and-falsifiers.json` F8).
     *
     * The positive verdict now requires INDEPENDENT observations, each recorded separately so a reader can see
     * exactly which one was missing:
     *
     *   parentSessionCreated  — the worker's own session exists (the Agent was composed);
     *   preCreateAdmitted     — no pre-create refusal occurred (so the worker really ran);
     *   delegationInvoked     — the model-visible delegation tool was CALLED (a `tool/call` naming it);
     *   childSessionCreated   — a second session exists (the child was created);
     *   childWorldAuthorized  — the child was associated with the intended authorized world;
     *   authorizedContextDelivered — the authorized world's token reached the child's context;
     *   noCanaryDelivered     — no protected token reached any session;
     *   noSecurityRefusal     — the delegation was not refused.
     */
    const PARENT_SESSION_MIN_EVENTS = 2;

    /**
     * THE STRUCTURED PRE-CREATE RECEIPT (§9.4).
     *
     * The refusal phase is parsed from `PALIMPSEST_WORKER_PRECREATE`, never from a substring of the human message.
     * A generic "refusing to run this worker" appears in several distinct refusals, and inferring
     * `PRE_CREATE_ALIAS_ADMISSION` from it would attribute a capacity or kernel refusal to alias admission.
     *
     * An unparseable receipt yields `UNKNOWN`, which §9.4 says must NOT be represented as a verified phase.
     */
    const preCreateReceipt = (() => {
      const line = stdout.split(/\r?\n/u).find((entry) => entry.startsWith("PALIMPSEST_WORKER_PRECREATE "));
      if (typeof line !== "string") return { parsed: false, phase: "UNKNOWN", detail: "no PALIMPSEST_WORKER_PRECREATE line was emitted" };
      try {
        const payload = JSON.parse(line.slice("PALIMPSEST_WORKER_PRECREATE ".length));
        const refusals = Array.isArray(payload?.refusals) ? payload.refusals : [];
        const phases = refusals.map((entry) => (typeof entry?.phase === "string" ? entry.phase : "UNKNOWN"));
        return {
          parsed: true,
          finalResult: payload?.finalResult ?? null,
          refusalCount: phases.length,
          /** The FIRST refusal in precedence order, which is the one that stopped the worker. */
          phase: phases.length > 0 ? phases[0] : "NONE",
          phases,
          detail: refusals[0]?.detail ?? null,
          boundaryModule: payload?.boundaryModule ?? null,
          capacity: payload?.capacity ?? null,
          kernel: payload?.kernel ?? null,
        };
      } catch (error) {
        return { parsed: false, phase: "UNKNOWN", detail: `the pre-create receipt could not be parsed: ${error instanceof Error ? error.message : String(error)}` };
      }
    })();
    report.observations.preCreateReceipt = preCreateReceipt;
    report.observations.preCreateRefused = preCreateReceipt.parsed === true && preCreateReceipt.finalResult === "PRECREATE_REFUSED";
    /** §9.4: the phase is named from the receipt, and only when the receipt parsed. */
    report.observations.refusalPhase = preCreateReceipt.parsed === true ? preCreateReceipt.phase : "UNKNOWN";

    const perSession = [];
    for (const id of ids) {
      let events = [];
      try {
        events = await readSessionEvents(sessionsRoot, id);
      } catch (error) {
        perSession.push({ sessionId: id, readError: error instanceof Error ? error.message : String(error) });
        continue;
      }
      const raw = JSON.stringify(events);
      const typesCarrying = (token) => [...new Set(events.filter((event) => JSON.stringify(event).includes(token)).map((event) => event?.type))];
      const userMessages = events.filter((event) => event?.type === "user/message");
      const toolResults = events.filter((event) => event?.type === "tool/result").map((event) => JSON.stringify(event.data ?? {}).slice(0, 600));
      /**
       * HOST-S1 §9.2: THE TOOL CALLS THEMSELVES. A positive delegation case must show that the model-visible
       * delegation tool was INVOKED, not merely that no token leaked. The call name is recorded so the observation
       * is checkable rather than inferred from a result string.
       */
      const toolCalls = events
        .filter((event) => event?.type === "tool/call")
        .map((event) => ({ name: typeof event?.data?.name === "string" ? event.data.name : null }))
        .filter((call) => call.name !== null);
      perSession.push({
        sessionId: id,
        eventCount: events.length,
        eventTypes: [...new Set(events.map((event) => event?.type).filter((type) => typeof type === "string"))],
        toolCalls,
        containsCanary: raw.includes(CANARY),
        containsSiblingToken: raw.includes(SIBLING_TOKEN),
        containsWorldToken: raw.includes(WORLD_TOKEN),
        canaryInEventTypes: typesCarrying(CANARY),
        siblingInEventTypes: typesCarrying(SIBLING_TOKEN),
        worldInEventTypes: typesCarrying(WORLD_TOKEN),
        /** EVERY user message is model context, not only the first: a leak can arrive on any turn. */
        userMessageSources: userMessages.map((event) => event?.data?.source?.kind ?? null),
        userMessagesCarryingCanary: userMessages.filter((event) => JSON.stringify(event).includes(CANARY)).length,
        userMessagesCarryingSibling: userMessages.filter((event) => JSON.stringify(event).includes(SIBLING_TOKEN)).length,
        /** A refusal is observable here: the delegation tool result names the denying guard. */
        toolResults,
        refusalObserved: toolResults.some((entry) => entry.includes("reparse point") || entry.includes("not the authorized execution world")),
      });
    }
    report.observations.sessions = perSession;

    const canaryDelivered = perSession.some((entry) => entry.containsCanary === true);
    const siblingDelivered = perSession.some((entry) => entry.containsSiblingToken === true);
    report.observations.canaryDelivered = canaryDelivered;
    report.observations.siblingTokenDelivered = siblingDelivered;
    report.observations.refusalObserved = perSession.some((entry) => entry.refusalObserved === true);

    /**
     * HOST-S1 §9.2: DID THIS SESSION ACTUALLY DISPATCH THE DELEGATION CAPABILITY?
     *
     * The worker runs in PTC mode, so the model's only directly callable name is `run_code`; the delegation it
     * performs appears as a PTC DISPATCH inside that program, not as a top-level `tool/call` named `subagent`.
     * Measured on the `world` case: the parent session records `tool/ptc-dispatch` and the child records
     * `subagent/descriptor`, while the only `tool/call` name in either is `run_code`.
     *
     * An observation that looked for a `subagent` tool CALL would therefore report "delegation never happened"
     * for a delegation that demonstrably did. The check is on the dispatch evidence the host actually records.
     */
    const childEvidence = perSession.map((entry) => {
      const types = new Set(entry.eventTypes ?? []);
      const ptcDispatched = types.has("tool/ptc-dispatch") || types.has("tool/ptc-dispatch-start");
      const subagentOffered = types.has("subagent/catalog");
      const namedDelegation = (entry.toolCalls ?? []).some((call) => typeof call?.name === "string" && /subagent|delegate/u.test(call.name));
      return {
        sessionId: entry.sessionId,
        delegationToolCall: ptcDispatched || subagentOffered || namedDelegation,
        delegationEvidence: { ptcDispatched, subagentOffered, namedDelegation },
        worldTokenPresent: entry.containsWorldToken === true,
        canaryPresent: entry.containsCanary === true,
      };
    });
    report.observations.childEvidence = childEvidence;

    /**
     * THE POSITIVE-CASE OBSERVATION SET (§9.2). Each field is independent, and `missingObservations` names the
     * ones that could not be established, so a failure explains itself instead of reporting a bare verdict.
     */
    const parentSessionCreated = ids.length >= 1;
    const preCreateAdmitted = report.observations.preCreateRefused !== true;
    const delegationInvoked = childEvidence.some((entry) => entry.delegationToolCall === true) || report.observations.refusalObserved === true;
    const childCreated = ids.length > 1;
    /**
     * THE CHILD'S WORLD. The child session's own first user message is the instruction discovery for its cwd; the
     * authorized-world token appearing there is the observation that the child was given the intended world.
     */
    const childWorldAuthorized = childCreated && childEvidence.slice(1).some((entry) => entry.worldTokenPresent === true);
    const authorizedContextDelivered = childCreated && childEvidence.slice(1).some((entry) => entry.worldTokenPresent === true);
    const noCanaryDelivered = perSession.every((entry) => entry.containsCanary !== true);

    report.observations.positiveObservations = {
      parentSessionCreated,
      preCreateAdmitted,
      delegationInvoked,
      childSessionCreated: childCreated,
      childWorldAuthorized,
      authorizedContextDelivered,
      noCanaryDelivered,
      noSecurityRefusal: report.observations.refusalObserved !== true && report.observations.preCreateRefused !== true,
    };
    const missingObservations = Object.entries(report.observations.positiveObservations)
      .filter(([, value]) => value !== true)
      .map(([key]) => key);
    report.observations.missingObservations = missingObservations;

    /**
     * E1RG RG-A ADDED AN EARLIER REFUSAL, AND THIS PROBE MUST RECOGNISE IT.
     *
     * The `aliasToProtected` case places a junction into the protected root INSIDE the world. Before RG-A that
     * world was still admitted, and the refusal came later from the DELEGATION guard when the model named the
     * link. Now the ALIAS ADMISSION refuses the world at pre-create, which is strictly earlier and strictly
     * better: no Agent is composed and no model turn runs.
     *
     * The case's EXPECTATION is unchanged — an alias to protected content must be refused — so the probe accepts
     * either refusal point and records WHICH one occurred. Reporting this as a mismatch would punish the
     * stronger refusal.
     */
    /**
     * HOST-S1 §9.3/§9.4 — THE VERDICT, WITH THE REFUSAL PHASE ATTRIBUTED FROM THE RECEIPT.
     *
     * The previous positive branch was `else verdict = "ALLOWED_NO_DELIVERY"`, taken for ANY non-refusal
     * expectation when no token was delivered. It never required a session, an admission, a tool call or a child,
     * so a worker refused at pre-create scored as a successful delegation. §9.6 states the rule directly: "The
     * final Matrix must not qualify merely because no protected token was observed."
     *
     * The corrected verdict is computed from the INDEPENDENT observation set above.
     *
     *   REFUSED_BY_GUARD     the expected refusal occurred, no child was created, and no protected content was
     *                        delivered. The refusal phase is recorded separately and is NOT part of this verdict.
     *   ALLOWED_NO_DELIVERY  a legitimate delegation was OBSERVED: the parent session existed, admission passed,
     *                        the delegation tool was invoked, the child was created in the authorized world with
     *                        its context delivered, and no protected content was delivered.
     *   UNAUTHORIZED_*_DELIVERED  a protected token reached a session — a security failure whatever else happened.
     *   POSITIVE_CASE_NOT_EXECUTED  the case expected a legitimate delegation and the observations above do not
     *                        support it. `missingObservations` names what was absent. This is the verdict the E1RG
     *                        `production` case should have received.
     */
    const leaked = target.token === CANARY ? canaryDelivered : siblingDelivered;
    const observations = report.observations.positiveObservations;
    let verdict;
    if (leaked) {
      verdict = target.token === CANARY ? "UNAUTHORIZED_CONTENT_DELIVERED" : "SIBLING_CONTENT_DELIVERED";
    } else if (target.expect === "REFUSED_BY_GUARD") {
      /**
       * EITHER REFUSAL POINT SATISFIES THE CASE. Pre-create admission is the EARLIER and STRONGER refusal — no
       * Agent, no turn — so a case that expected the delegation guard must accept it rather than reporting a
       * mismatch. What it may NOT do is accept "nothing happened": the refusal itself must be observed.
       */
      const refusalHappened = report.observations.refusalObserved === true || report.observations.preCreateRefused === true;
      verdict = !childCreated && refusalHappened ? "REFUSED_BY_GUARD" : "REFUSAL_NOT_OBSERVED";
    } else {
      /** §9.2: EVERY positive observation is required. A missing one is named, not rounded up. */
      verdict = missingObservations.length === 0 ? "ALLOWED_NO_DELIVERY" : "POSITIVE_CASE_NOT_EXECUTED";
    }
    report.verdict = verdict;
    report.observations.canaryDeliveredByVerdict = verdict === "REFUSED_BY_GUARD" ? false : canaryDelivered;
    step("verdict", verdict);
    if (verdict === "POSITIVE_CASE_NOT_EXECUTED") {
      step("missing-observations", missingObservations.join(", "));
    }
    if (report.observations.refusalPhase !== "NONE") {
      step("refusal-phase", `${report.observations.refusalPhase} (receipt parsed: ${String(preCreateReceipt.parsed)})`);
    }
  } finally {
    if (fixture !== null) await fixture.cleanup();
    if (previousHome === undefined) delete process.env.DSH_HOME;
    else process.env.DSH_HOME = previousHome;
  }
} catch (error) {
  report.error = error instanceof Error ? error.message : String(error);
  if (report.verdict !== "FIXTURE_LIMIT") report.verdict = "PROBE_FAILED";
  process.stderr.write(`  ! probe failed: ${report.error}\n`);
} finally {
  const cleanup = await safeCleanup(owned);
  report.cleanup = { cleaned: cleanup.cleaned, reason: cleanup.reason ?? null };
  report.ownedRootRemoved = !existsSync(owned.root);
}

const emitted = `${JSON.stringify(report, null, 2)}\n`;
process.stdout.write(emitted);
if (ARG_JSON_OUT !== null) {
  mkdirSync(dirname(resolve(ARG_JSON_OUT)), { recursive: true });
  writeFileSync(resolve(ARG_JSON_OUT), emitted, "utf8");
}
/**
 * EXIT CODE. A REFUSED_BY_GUARD or ALLOWED_NO_DELIVERY case is the DESIRED outcome. A delivery is a security
 * failure and exits nonzero; a probe error does too.
 */
process.exit(report.verdict === "REFUSED_BY_GUARD" || report.verdict === "ALLOWED_NO_DELIVERY" ? 0 : 1);
