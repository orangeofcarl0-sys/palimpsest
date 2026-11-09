/**
 * PNWF-CQ-R1: the actual container is qualified before its first provider call.
 * network=none; fixed-route stdio egress; fresh credential-free profile; durable request accounting.
 * Old isolation JSON is not an execution permit. Only this adapter may be invoked by the PNWF gate.
 */
import { execFileSync, spawn } from "node:child_process";
import { appendFileSync, cpSync, mkdirSync, openSync, closeSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { ExecutionBudget } from "./execution_budget.mjs";
import { PAID_MODE, startBoundedProxy, startPaidProxy, verifyMock } from "./bounded_provider.mjs";
import { createPrincipal, qualifyPrincipal, containerRepositoryPath } from "./container_runtime.mjs";
import { startContainerBridge } from "./container_bridge.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const write = (path, value) => writeFileSync(path, JSON.stringify(value, null, 2) + "\n");
export const DSH_BIN = "/usr/local/lib/node_modules/@deepseek-ai/dsh/lib/bin.js";

export function prepareContainerProfile({ home, repository, layout = "recorded", workerControl = false }) {
  mkdirSync(home);
  const profile = join(home, "profiles", "alhs-core");
  mkdirSync(profile, { recursive: true });
  const packages = join(home, "profiles/node_modules");
  mkdirSync(packages, { recursive: true });
  const native = layout === "native";
  const repoPath = layout === "recorded" ? containerRepositoryPath(repository) : "/product";
  const entry = workerControl ? `${repoPath}/runtime/product-entry.mjs` : `${repoPath}/dist/src/advanced.js`;
  write(join(profile, "package.json"), { name: "dsh-profile-alhs-core", private: true, dependencies: {},
    dsh: { profile: { bundles: ["@deepseek-ai/dsh-base", native ? "@deepseek-ai/dsh-headless" : "palimpsest-dsh-host"], patchReload: "startup" } } });
  writeFileSync(join(home, "settings.yaml"), "agent-default-model:\n  provider: deepseek-official\n  model: deepseek-flash\n");
  writeFileSync(join(profile, "cordis.patch.yml"), [
    "- id: llm-deepseek", "  config:", "    baseURL: http://127.0.0.1:18080", "    apiKeyEnv: CQ_PROXY_KEY",
    "- id: llm-pi-ai", "  disabled: true",
    "- id: agent-default-model", "  config:", "    provider: deepseek-official", "    model: deepseek-flash",
    "- id: approval", "  config:", "    policy: never",
    "- id: permission", "  config:", "    presets:",
    "      read-only: { sandbox: read-only, approval: never }",
    "      workspace-write: { sandbox: workspace-write, approval: never }",
    "      danger-full-access: { sandbox: danger-full-access, approval: never }",
    "    defaultPreset: workspace-write",
    "- id: sandbox-policy", "  config:", "    mode: workspace-write", "    workspaceRoot: '/run/stage/world'",
    "- id: session-title-llm", "  disabled: true", "- id: tool-web", "  disabled: true",
    ...(!native ? ["- id: palimpsest-tools", "  config:", `    palimpsestEntry: '${entry}'`,
      "    deploymentProfile: '/run/stage/deployment-linux.json'", "    serve: false", "    openDashboard: false"] : []),
    ...(layout === "worker" ? ["- id: palimpsest-runner", "  disabled: true", "- insert:",
      "    - id: pnwf-container-worker", "      name: 'pnwf-container-worker'"] : []), "",
  ].join("\n"));
  if (!native) {
    cpSync(join(repository, "host/dsh"), join(packages, "palimpsest-dsh-host"), { recursive: true });
    if (layout === "recorded") cpSync(join(repository, "host/deployment"), join(packages, "palimpsest-host-deployment"), { recursive: true });
    if (layout === "worker") cpSync(join(repository, "runtime/worker"), join(packages, "pnwf-container-worker"), { recursive: true });
  }
}
function within(root, path) {
  const base = resolve(root) + "/";
  const value = resolve(path).replaceAll("\\", "/");
  if (!value.startsWith(base.replaceAll("\\", "/"))) throw new Error("PREPARED_PATH_OUTSIDE_RUN");
  return resolve(path);
}
export async function runContainerSession({ run, sessionId, budgetPath, provider, mode = "mock", repository = process.cwd(), image = "palimpsest-pnwf-isolation:local", experiment }) {
  // Capability/identity failures precede profile preparation, container creation and provider traffic.
  const paid = mode === PAID_MODE;
  if (!paid && mode !== "mock") throw new Error("UNKNOWN_EXECUTION_MODE");
  if (!paid) await verifyMock(provider);
  const budget = new ExecutionBudget(budgetPath);
  try {
  if (budget.usageOnly !== paid) throw new Error("ACCOUNTING_MODE_MISMATCH");
  let runtime, proxy, bridge, child, timeout, monitor, worker;
  let outFd, errFd, killedBy = null, exitCode = 1, failure = null, isolation = null;
  const startedAt = new Date().toISOString();
  const core = JSON.parse(readFileSync(join(run, "core.json"), "utf8"));
  const prepared = core.sessions.find(s => s.id === sessionId);
  if (!prepared || core.cohortId !== budget.config.cohortId || budget.snapshot().sessions.find(s => s.id === sessionId)?.state !== "RUNNING") {
    throw new Error("SESSION_NOT_ADMITTED");
  }
  if (paid && (core.budget !== null || !Number.isSafeInteger(prepared.killAfterMs) || prepared.killAfterMs <= 0 || prepared.killAfterMs > 3600000)) {
    throw new Error("INVALID_PAID_SESSION_WINDOW");
  }
  const stage = within(run, join(run, "stages", sessionId));
  const world = within(stage, prepared.world);
  const state = within(stage, prepared.state);
  if (world !== resolve(stage, "world") || state !== resolve(stage, "state") || !/^[0-9a-f]{40}$/u.test(prepared.expectedHead ?? "")) {
    throw new Error("PREPARED_WORLD_NOT_BOUND");
  }
  const out = join(run, "out", sessionId);
  mkdirSync(out, { recursive: true });
  const home = join(run, "runtime-" + sessionId);
  const layout = experiment?.layout ?? "recorded";
  try {
    prepareContainerProfile({ home, repository, layout, workerControl: experiment?.createWorker !== undefined });
    if (layout !== "native") {
      const deployment = JSON.parse(readFileSync(prepared.deployment, "utf8"));
      deployment.repository = "/run/stage/world";
      deployment.transport.databasePath = "/run/stage/state/transport.sqlite";
      for (const key of Object.keys(deployment.databases)) deployment.databases[key] = "/run/stage/state/" + String(deployment.databases[key]).split(/[\\/]/u).pop();
      write(join(stage, "deployment-linux.json"), deployment);
    }
    runtime = createPrincipal({ repository, stage, home, image, preflight: join(HERE, "world_preflight.mjs"), layout, acceptance: experiment?.acceptance });
    isolation = qualifyPrincipal(runtime, prepared.expectedHead);
    write(join(out, "qualification.json"), isolation);

    // No provider request can happen before the actual container and ALL copied worlds pass.
    const sessionKey = randomBytes(32).toString("hex");
    const onObservation = experiment === undefined ? undefined : event => appendFileSync(join(out, "request-observations.jsonl"), JSON.stringify(event) + "\n");
    proxy = paid ? await startPaidProxy({ budget, sessionId, sessionKey, onObservation }) : await startBoundedProxy({ provider, budget, sessionId, sessionKey, onObservation });
    worker = experiment?.createWorker?.({ stage, out, repository, image: runtime.imageId, principalId: runtime.id, gateway: proxy.url, sessionKey,
      stopIsClosed: () => budget.snapshot().state !== "OPEN" });
    bridge = await startContainerBridge(runtime.id, proxy.url, sessionKey, { dispatchWork: worker?.dispatch });
    const prompt = readFileSync(prepared.promptPath, "utf8");
    outFd = openSync(join(out, "run.log"), "w"); errFd = openSync(join(out, "run.err"), "w");
    // Principal observations must not refresh the index while the Worker broker imports its commit.
    child = spawn("docker", ["exec", "--user", "1001:1001", "--workdir", "/run/stage/world",
      ...(experiment?.createWorker ? ["-e", "GIT_OPTIONAL_LOCKS=0"] : []),
      runtime.id, "node", DSH_BIN, "--profile", "alhs-core", layout === "native" ? "--json" : "--once", prompt],
      { stdio: ["ignore", outFd, errFd] });
    const kill = reason => {
      if (killedBy !== null) return;
      killedBy = reason;
      try { budget.stop(reason); } catch { failure = "UNOBSERVABLE_USAGE"; }
      try { execFileSync("docker", ["kill", runtime.id], { stdio: "ignore", timeout: 10000 }); } catch { /* cleanup also removes the container */ }
    };
    timeout = setTimeout(() => kill("wall_clock"), Math.min(Number(prepared.killAfterMs ?? 60000), 3600000));
    monitor = setInterval(() => {
      try {
        const snapshot = budget.snapshot();
        if (proxy.fatalReason || snapshot.state !== "OPEN") {
          kill(snapshot.reason === "BUDGET_EXHAUSTED" ? "budget" : snapshot.reason === "REQUEST_LIMIT" ? "request_limit" : "usage_unobservable");
        }
      } catch { kill("usage_unobservable"); }
    }, 250);
    exitCode = await new Promise((resolveExit, reject) => {
      child.once("error", reject); child.once("close", code => resolveExit(code ?? 1));
    });
  } catch (error) {
    failure = error.code ?? error.message;
    try { budget.stop(failure); } catch { failure = "UNOBSERVABLE_USAGE"; }
  } finally {
    clearTimeout(timeout); clearInterval(monitor);
    for (const cleanup of [() => worker?.close(), () => bridge?.close(), () => proxy?.close(), () => runtime?.cleanup()]) {
      try { await cleanup(); } catch (error) { failure ??= "CLEANUP_FAILED: " + error.message; }
    }
    if (outFd !== undefined) closeSync(outFd);
    if (errFd !== undefined) closeSync(errFd);
  }
  const snapshot = budget.snapshot();
  const session = snapshot.sessions.find(s => s.id === sessionId);
  const natural = exitCode === 0 && failure === null && killedBy === null && snapshot.state === "OPEN" &&
    session.unresolvedRequests === 0 && (!paid || session.requestCount > 0);
  budget.endSession(sessionId, natural);
  const endedAt = new Date().toISOString();
  const usage = { schema: "aps-budget-ledger/v1", cohortId: core.cohortId, sessionId,
    observedAt: endedAt, maxTokens: session.ceiling, softCeiling: session.softCeiling,
    totalTokens: session.unresolvedRequests === 0 ? session.confirmed : null, confirmedTokens: session.confirmed,
    reservedTokens: session.reserved, unresolvedRequests: session.unresolvedRequests,
    source: paid ? "PROVIDER_TERMINAL_USAGE_LEDGER" : "REQUEST_ADMISSION_LEDGER", state: natural ? "ENDED" : "STOPPED" };
  const record = { schema: "alhs-core-session-run/v1", cohortId: core.cohortId, sessionId, condition: prepared.condition,
    world, home, principalRuntime: "container", containerId: isolation?.containerId ?? null,
    qualification: isolation?.descriptorDigest ?? null, startedAt, endedAt, exitCode, error: failure,
    killedBy, stopped: !natural, natural, usage, mode, paidRequestsAdmitted: paid ? session.requestCount : 0,
    paidModelCalls: paid ? (session.unresolvedRequests === 0 ? session.requestCount : null) : 0 };
  write(join(out, "run.json"), record);
  write(join(out, "budget.json"), usage);
  write(join(out, "request-accounting.json"), budget.snapshot());
  return record;
  } finally { budget.close(); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = new Map(process.argv.slice(2).map(arg => { const [key, ...value] = arg.replace(/^--/u, "").split("="); return [key, value.join("=")]; }));
  try {
    const mode = args.get("mode") ?? "mock";
    if (!process.env.ALHS_CORE_RUN || !process.env.PNWF_BUDGET_DB || (mode !== PAID_MODE && !process.env.PNWF_PROVIDER_CONFIG)) throw new Error("QUALIFIED_GATE_REQUIRED");
    const result = await runContainerSession({
      run: resolve(process.env.ALHS_CORE_RUN), sessionId: args.get("session"), budgetPath: resolve(process.env.PNWF_BUDGET_DB),
      mode, provider: mode === PAID_MODE ? undefined : JSON.parse(readFileSync(process.env.PNWF_PROVIDER_CONFIG, "utf8")),
    });
    process.stdout.write(JSON.stringify(result) + "\n"); process.exitCode = result.natural ? 0 : 5;
  } catch (error) { process.stderr.write(error.message + "\n"); process.exitCode = 5; }
}
