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
  let aliasFixture = null;
  try {
    symlinkSync(world, aliasToWorld, "junction");
    symlinkSync(protectedRoot, aliasToProtected, "junction");
    aliasFixture = "created";
  } catch (error) {
    aliasFixture = `FAILED ${error instanceof Error ? String(error.code ?? error.message) : String(error)}`;
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
      perSession.push({
        sessionId: id,
        eventCount: events.length,
        eventTypes: [...new Set(events.map((event) => event?.type).filter((type) => typeof type === "string"))],
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
    report.observations.canaryEventTypes = [...new Set(perSession.flatMap((entry) => entry.canaryInEventTypes ?? []))];

    const leaked = target.token === CANARY ? canaryDelivered : siblingDelivered;
    let verdict;
    if (leaked) verdict = target.token === CANARY ? "UNAUTHORIZED_CONTENT_DELIVERED" : "SIBLING_CONTENT_DELIVERED";
    else if (target.expect === "REFUSED_BY_GUARD") verdict = report.observations.refusalObserved && !report.observations.childSessionCreated ? "REFUSED_BY_GUARD" : "ALLOWED_NO_DELIVERY";
    else verdict = "ALLOWED_NO_DELIVERY";
    report.verdict = verdict;
    report.observations.canaryDeliveredByVerdict = verdict === "REFUSED_BY_GUARD" ? false : canaryDelivered;
    step("verdict", verdict);
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
