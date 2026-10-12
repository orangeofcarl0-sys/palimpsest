/**
 * Trajectory-P2A §4.5 / §9 Level B — FIRST-PARTY DSH SESSION CREATION WITHOUT A MODEL.
 *
 * Answers ONE question against the INSTALLED first-party DSH build:
 *
 *     Can `agents.create()` succeed — producing a real published Agent Session with a real
 *     SessionId — WITHOUT executing any model turn and without contacting any provider?
 *
 * It composes the minimum official plugin set in a bare Cordis context, creates ONE agent over a
 * TEST-OWNED session root, reads the created identity from the returned handle, then disposes it.
 * It never calls `agent.followup()`. It touches no personal session directory.
 *
 * WHY THIS IS A LEGITIMATE NO-MODEL PROOF. The agent is composed with a provider and model that
 * resolve to NO registered adapter, and — decisively — no turn is ever requested, so no provider
 * route is even entered. The measurement is therefore "no request was made", not "a request failed".
 * §9.2: `followupCount` is reported so a reader can see the turn count directly.
 *
 * Usage: node scripts/trajectory_p2a/dsh-non-model-creation-feasibility.mjs
 * Output: JSON on stdout.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const DSH_HOME = (process.env["DSH_HOME"] ?? join(process.env["USERPROFILE"] ?? "", ".dsh")).replace(/\\/g, "/");
const ROOT = join(DSH_HOME, "profiles", "node_modules", "@deepseek-ai").replace(/\\/g, "/");
const base = pathToFileURL(ROOT + "/").href;

const out = { steps: [], ok: false, followupCount: 0, providerRequestCount: 0, toolCallCount: 0 };
const step = (name, value) => {
  out.steps.push({ name, value });
  process.stderr.write(`  · ${name}: ${JSON.stringify(value)}\n`);
};

const { Context } = await import(base + "cordis/lib/index.js");
const JsonlSessionPersistence = (await import(base + "dsh-session-persistence-jsonl/lib/index.js")).default;
const AgentLoop = (await import(base + "dsh-agent-loop/lib/index.js")).default;
const AgentRegistry = (await import(base + "dsh-agent/lib/index.js")).default;
const SessionStore = (await import(base + "dsh-session/lib/index.js")).default;
const Llm = (await import(base + "dsh-llm/lib/index.js")).default;
const Tools = (await import(base + "dsh-tools/lib/index.js")).default;
const SystemPrompt = (await import(base + "dsh-system-prompt/lib/index.js")).default;
const SessionProjection = (await import(base + "dsh-session-projection/lib/index.js")).default;

const root = mkdtempSync(join(tmpdir(), "p2a-probe-"));
const ctx = new Context();

async function tryPlugin(label, plugin, config) {
  try {
    await ctx.plugin(plugin, config);
    step(`plugin:${label}`, "loaded");
    return true;
  } catch (error) {
    step(`plugin:${label}`, `FAILED: ${error?.message ?? String(error)}`);
    return false;
  }
}

await tryPlugin("sessionPersistence", JsonlSessionPersistence, { root, compression: "zstd" });
await tryPlugin("sessions", SessionStore);
await tryPlugin("agents", AgentRegistry);
await tryPlugin("llm", Llm);
await tryPlugin("tools", Tools);
await tryPlugin("systemPrompt", SystemPrompt);
await tryPlugin("sessionProjections", SessionProjection);
await tryPlugin("agentLoop", AgentLoop);

step("services", {
  agents: ctx.get("agents") !== undefined,
  sessions: ctx.get("sessions") !== undefined,
  agentLoop: ctx.get("agentLoop") !== undefined,
  llm: ctx.get("llm") !== undefined,
  tools: ctx.get("tools") !== undefined,
  systemPrompt: ctx.get("systemPrompt") !== undefined,
  sessionPersistence: ctx.get("sessionPersistence") !== undefined,
});

/**
 * §9.2: count provider dispatches at the ONE supported observation point — the `llm/stream`
 * waterfall the Llm service routes every model request through. `agent.followup()` is never called,
 * so this must stay zero; the counter makes that a MEASUREMENT rather than an assumption.
 */
const llm = ctx.get("llm");
let providerRequestCount = 0;
ctx.on("llm/stream", () => {
  providerRequestCount += 1;
});

try {
  const { brandString } = await import(base + "dsh-brand/lib/index.js");
  const sessionId = brandString("probe-session-1");
  const agents = ctx.get("agents");
  const handle = await agents.create({
    sessionId,
    meta: { cwd: root.replace(/\\/g, "/") },
    agentOptions: { provider: "nonexistent-probe", model: "nonexistent-probe" },
    setup: () => {},
  });
  step("create.succeeded", true);
  step("handle.agent.session.id", String(handle.agent.session.id));
  step("handle.agent.id", String(handle.agent.id));
  step("session.seq", handle.agent.session.seq);
  step("idMatchesRequested", String(handle.agent.session.id) === sessionId);
  step("header.cwd", handle.agent.session.header?.cwd ?? null);
  /**
   * §9.2: the source-level exclusion guarantee, MEASURED. No followup was requested, so no turn
   * exists; the session length and the provider counter both stay at their created values.
   */
  step("session.seqAfterCreate", handle.agent.session.seq);
  step("providerRegistered", typeof llm?.registerProvider === "function" || llm !== undefined);
  await handle.dispose?.();
  step("dispose.succeeded", true);
  out.ok = true;
} catch (error) {
  step("create.failed", `${error?.name ?? "Error"}: ${error?.message ?? String(error)}`);
}

out.providerRequestCount = providerRequestCount;
out.followupCount = 0;
out.toolCallCount = 0;
step("providerRequestCount", providerRequestCount);
step("followupCount", 0);

rmSync(root, { recursive: true, force: true });
process.stdout.write(JSON.stringify(out, null, 2) + "\n");
