/**
 * Trajectory-P2-E1RE §3.3 — PRE-TOOL CONFIDENTIALITY FALSIFIER (test-owned, real first-party DSH).
 *
 * THE QUESTION. Can a model-controlled Child CWD cause an UNAUTHORIZED implicit filesystem read — one the
 * Tool Guard never sees — to enter model context BEFORE the child's first guarded tool dispatch?
 *
 * WHY A UNIT TEST CANNOT ANSWER IT. `createCwdFenceGuard()` with a mocked CWD proves only that the guard
 * behaves; it says nothing about whether a read happens BEFORE the guard is consulted. The ordering is the
 * whole question, so this script drives the REAL first-party DSH host:
 *
 *   worker process (cwd = W) -> run_code -> tools.subagent({ cwd: <target> })
 *     -> child Session created -> workingDirectory.set(child, target)
 *     -> child agent/pre-step -> dsh-agent-instructions compose()
 *     -> discoverInstructionFiles() reads AGENTS.md from the target's ancestor chain
 *     -> the file content is injected into the child's model context
 *
 * OBSERVATION. The child's persisted Session events are read back through official DSH persistence and searched
 * for the synthetic canary token. If the token appears, the content was read AND delivered before any tool
 * dispatch — a confidentiality failure that a later guard refusal cannot undo.
 *
 * EVEN THE FIXED HOST IS MEASURED THE SAME WAY. After the delegation guard was installed, the same cases run
 * again and are expected to refuse with an observable `ToolCallError` and NO child session. The verdict for a
 * case is therefore one of:
 *   · DELIVERED            the token reached a user/message — a leak
 *   · REFUSED_BY_GUARD     the delegation call errored and no child session exists
 *   · ALLOWED_NO_DELIVERY  the child was created (legitimately, inside the world) and no foreign token appeared
 *
 * SAFETY. Every root is test-owned and allocated through `allocateOwnedRoot`. The canary is a harmless
 * synthetic token. No personal path, session, credential or project content is touched, and no external or
 * paid model is contacted (a deterministic local adapter serves every turn).
 *
 * Usage:  node scripts/trajectory_p2e1re/pretool-probe.mjs [--case <name>] [--json-out <path>]
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { REPO, allocateOwnedRoot, safeCleanup } from "../trajectory_p2e0/owned-root.mjs";
import { dshBin, installHostBundle, shareDshModules } from "../trajectory_p2e0/dsh-test-home.mjs";
import { prepareFixture } from "../trajectory_p2e0/benchmark-fixture.mjs";

const ARG_CASE = process.argv.includes("--case") ? process.argv[process.argv.indexOf("--case") + 1] : "sibling";
const ARG_JSON_OUT = process.argv.includes("--json-out") ? process.argv[process.argv.indexOf("--json-out") + 1] : null;
const PROFILE = `p2e1re-pretool-${ARG_CASE}`;
const CANARY = "P2E1RE-CANARY-7f3c9a1d-SYNTHETIC-ONLY";

const owned = allocateOwnedRoot("p2e1re-pretool-", `pretool-${ARG_CASE}`);
const report = {
  schemaVersion: 1,
  kind: "TRAJECTORY_P2E1RE_PRETOOL_FALSIFIER",
  stage: "Trajectory-P2-E1RE",
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

  /**
   * THE TEST-OWNED LAYOUT. W is the authorized world; S a sibling world; P a simulated protected root. Each
   * carries an AGENTS.md holding a DIFFERENT synthetic token, so a delivered token names its source.
   *
   * THE `production` CASE reproduces the REAL deployment shape: the world is
   * `<repo>/.palimpsest/worlds/<attempt>` and the durable state is `<repo>/.palimpsest`, so the worker's own
   * world is INSIDE a protected root. That shape is what `read_fence.js` already discloses as a residual
   * (a protected root containing the world cannot be labelled), and it is the shape a real deployment uses.
   */
  const world = ARG_CASE === "production" ? join(owned.root, ".palimpsest", "worlds", "attempt-1") : join(owned.root, "world");
  const sibling = ARG_CASE === "production" ? join(owned.root, ".palimpsest", "worlds", "attempt-2") : join(owned.root, "sibling-world");
  const protectedRoot = ARG_CASE === "production" ? join(owned.root, ".palimpsest") : join(owned.root, "durable-state");
  for (const dir of [world, sibling, protectedRoot]) mkdirSync(dir, { recursive: true });
  writeFileSync(join(world, "AGENTS.md"), `WORLD-INSTRUCTIONS-ALLOWED\n`);
  writeFileSync(join(sibling, "AGENTS.md"), `SIBLING-CANARY-2b8e4f\n`);
  /** In the production shape the world is inside P, so the canary must NOT be an ancestor of the world. */
  if (ARG_CASE !== "production") writeFileSync(join(protectedRoot, "AGENTS.md"), `${CANARY}\n`);

  const targets = {
    sibling: { path: sibling, token: "SIBLING-CANARY-2b8e4f" },
    protected: { path: protectedRoot, token: CANARY },
    world: { path: world, token: "WORLD-INSTRUCTIONS-ALLOWED" },
    parentOfProtected: { path: owned.root, token: CANARY },
    traversal: { path: "../durable-state", token: CANARY },
    production: { path: world, token: "WORLD-INSTRUCTIONS-ALLOWED" },
  };
  const target = targets[ARG_CASE] ?? targets.sibling;
  step("layout", `W=${world} target=${target.path}`);

  /**
   * THE ADAPTER. It emits ONE `run_code` call that invokes the delegation tool with the model-chosen CWD, then
   * finishes with text. PTC mode makes `run_code` the only directly callable name, so this is what a PTC-mode
   * model must do. The child receives the SAME adapter, which simply answers with text.
   */
  const adapterPath = join(owned.root, "pretool-adapter.mjs");
  writeFileSync(
    adapterPath,
    `export const name = "p2e1re-pretool-llm";
export const inject = ["llm"];
const PROVIDER = "palimpsest-local-pretool";
const MODEL = "pretool-1";
const TARGET = ${JSON.stringify(target.path)};
const TARGET_LITERAL = ${JSON.stringify(ARG_CASE === "traversal" ? "../durable-state" : target.path.replace(/\\/gu, "/"))};
function hasToolResult(messages) {
  if (!Array.isArray(messages)) return false;
  return messages.some((m) => m !== null && typeof m === "object" && m.role === "tool");
}
function make() {
  const providerInfo = (p) => ({ id: p ?? PROVIDER, name: "pretool (test-owned)" });
  const listModels = async (p) => [{ provider: p ?? PROVIDER, id: MODEL, name: "pretool-1" }];
  const resolveModel = async (p, m) => ({ provider: p ?? PROVIDER, id: m ?? MODEL, name: "pretool-1" });
  const providerRetryPolicy = () => undefined;
  const prepareCall = async (p, m) => ({ model: await resolveModel(p, m), stream: (o) => stream(o) });
  async function* stream(options) {
    const messages = options?.messages ?? options?.request?.messages;
    if (hasToolResult(messages)) {
      const text = "PRETOOL-PROBE-FINAL-TEXT";
      yield { type: "block-start", index: 0, blockType: "text" };
      yield { type: "text-delta", index: 0, text };
      yield { type: "block-end", index: 0, block: { type: "text", text } };
      yield { type: "finish", reason: { kind: "stop" } };
      return;
    }
    const code = "return await tools.subagent(" + JSON.stringify({ cwd: TARGET_LITERAL, description: "pretool probe", prompt: "Report the working directory." }) + ")";
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
      `    provider: palimpsest-local-pretool`,
      "    model: pretool-1",
      "",
      "- insert:",
      "    - id: p2e1re-pretool-llm",
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
        projectId: "p2e1re",
        localPeer: "p2e1re-peer",
        persistentPoint: "pp-p2e1re",
        transport: { namespace: PROFILE, databasePath: join(owned.root, "transport.sqlite") },
        databases: { orchestration: join(owned.root, "orch.sqlite"), ordarium: join(owned.root, "ord.sqlite") },
        reasoning: {},
        execution: "worktree",
        concurrency: 1,
        policy: {},
        standard: { statement: "p2e1re pretool probe" },
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
    const code = await new Promise((resolve) => child.on("close", resolve));
    step("worker-exit", String(code));
    report.observations.workerExitCode = code;
    report.observations.workerResultLine = stdout.split(/\r?\n/u).find((line) => line.startsWith("PALIMPSEST_WORK_RESULT")) ?? null;
    report.observations.workerCapabilities = stdout.split(/\r?\n/u).find((line) => line.startsWith("PALIMPSEST_WORKER_CAPABILITIES")) ?? null;
    report.observations.workerEnv = stdout.split(/\r?\n/u).find((line) => line.startsWith("PALIMPSEST_WORKER_ENV")) ?? null;

    const sessionsRoot = join(home, "sessions");
    const ids = listSessionIds(sessionsRoot);
    step("sessions-present", String(ids.length));
    report.observations.sessionIds = ids;

    /** THE DECISIVE OBSERVATION: which session's events carry which token, and where. */
    const perSession = [];
    for (const id of ids) {
      let events = [];
      try {
        events = await readSessionEvents(sessionsRoot, id);
      } catch (error) {
        perSession.push({ sessionId: id, readError: error instanceof Error ? error.message : String(error) });
        continue;
      }
      const types = events.map((event) => event?.type).filter((type) => typeof type === "string");
      const raw = JSON.stringify(events);
      const siblingToken = "SIBLING-CANARY-2b8e4f";
      const worldToken = "WORLD-INSTRUCTIONS-ALLOWED";
      /** WHICH event carries the token is the whole question: a user/message IS model context. */
      const typesCarrying = (token) => [...new Set(events.filter((event) => JSON.stringify(event).includes(token)).map((event) => event?.type))];
      /**
       * Whether the token appears in the FIRST user message (the injected baseline) or only in a later
       * tool/result. Pre-step delivery is a `user/message` from `agent-instructions`; a child's answer arriving
       * as a tool result is a different (and expected) path.
       */
      const firstUserMessage = events.find((event) => event?.type === "user/message");
      /** The parent's OWN tool result: whether the delegation was refused, and by whom. */
      const toolResults = events.filter((event) => event?.type === "tool/result").map((event) => JSON.stringify(event.data ?? {}).slice(0, 400));
      perSession.push({
        sessionId: id,
        eventCount: events.length,
        eventTypes: [...new Set(types)],
        containsCanary: raw.includes(CANARY),
        containsSiblingToken: raw.includes(siblingToken),
        containsWorldToken: raw.includes(worldToken),
        canaryInEventTypes: typesCarrying(CANARY),
        siblingInEventTypes: typesCarrying(siblingToken),
        worldInEventTypes: typesCarrying(worldToken),
        /** The exact provenance of the first user message, which is what pre-step injects. */
        firstUserMessageSource: firstUserMessage?.data?.source?.kind ?? null,
        firstUserMessageCarriesCanary: JSON.stringify(firstUserMessage ?? {}).includes(CANARY),
        firstUserMessageCarriesSibling: JSON.stringify(firstUserMessage ?? {}).includes(siblingToken),
        /** A refusal is observable here: the delegation tool result names the denying guard. */
        toolResults,
      });
    }
    report.observations.sessions = perSession;

    const canaryDelivered = perSession.some((entry) => entry.containsCanary === true);
    const siblingDelivered = perSession.some((entry) => entry.containsSiblingToken === true);
    report.observations.canaryDelivered = canaryDelivered;
    report.observations.siblingTokenDelivered = siblingDelivered;
    report.observations.canaryEventTypes = [...new Set(perSession.flatMap((entry) => entry.canaryInEventTypes ?? []))];

    /**
     * THE THREE-WAY VERDICT. A refusal is only a PASS if it is OBSERVABLE and produced NO child session: a
     * silent stall or a child that exists but was never used would be a different outcome, and both are recorded
     * as such rather than as success.
     */
    const delivered = target.token === CANARY ? canaryDelivered : siblingDelivered;
    /** A child session is any session that is NOT the worker's own. */
    const childSessions = perSession.filter((entry) => !String(entry.sessionId).startsWith("worker-"));
    const refusalText = perSession.flatMap((entry) => entry.toolResults ?? []).find((text) => /is not the authorized execution world|delegation fence|ToolCallError/u.test(text)) ?? null;
    report.observations.childSessionCount = childSessions.length;
    report.observations.refusalObserved = refusalText !== null;
    report.observations.refusalDetail = refusalText === null ? null : refusalText.slice(0, 300);

    if (delivered) report.verdict = target.token === CANARY ? "DELIVERED" : "SIBLING_DELIVERED";
    else if (childSessions.length === 0 && refusalText !== null) report.verdict = "REFUSED_BY_GUARD";
    else report.verdict = "ALLOWED_NO_DELIVERY";
    /** The case is CLOSED when no unauthorized token was delivered, whether by refusal or by legitimate use. */
    report.caseClosed = delivered === false;
    step("verdict", report.verdict);
  } finally {
    if (fixture !== null) await fixture.cleanup();
    if (previousHome === undefined) delete process.env.DSH_HOME;
    else process.env.DSH_HOME = previousHome;
  }
} catch (error) {
  report.error = error instanceof Error ? error.message : String(error);
  report.verdict = "PROBE_FAILED";
  report.caseClosed = false;
  process.stderr.write(`  ! probe failed: ${report.error}\n`);
} finally {
  const cleanup = await safeCleanup(owned);
  report.cleanup = { cleaned: cleanup.cleaned, reason: cleanup.reason ?? null };
  report.ownedRootRemoved = !existsSync(owned.root);
}

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (ARG_JSON_OUT !== null) {
  mkdirSync(dirname(resolve(ARG_JSON_OUT)), { recursive: true });
  writeFileSync(resolve(ARG_JSON_OUT), `${JSON.stringify(report, null, 2)}\n`);
}
process.exit(report.caseClosed === true ? 0 : 1);
