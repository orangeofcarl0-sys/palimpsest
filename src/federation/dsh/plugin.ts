/**
 * PAL-FED-0D DSH plugin: the peer runtime binding (EXPERIMENTAL).
 *
 * Mounted once per DSH profile, the plugin owns exactly one peer's
 * collaboration surface in that host process:
 *
 *   - opens the PAL-FED collaboration service against the frozen substrate;
 *   - creates or resumes the peer's root DSH Agent (stable session id, the
 *     peer's own worktree) and composes its scoped world via the supported
 *     `setup(agentCtx, agent)` call site;
 *   - registers the six collaboration tools and the operating guidance into
 *     THAT agent's scope (a subagent does not inherit them);
 *   - runs the deterministic watcher that wakes the agent's DSH inbox when a
 *     peer batch is pending.
 *
 * All lifecycle is DSH's: registry publication, session ownership, driver
 * loop, inbox and disposal. This plugin never drives the model itself.
 */

import type { Context } from "@deepseek-ai/cordis";
import type { Agent } from "@deepseek-ai/dsh-agent";
import type { ToolDefinition } from "@deepseek-ai/dsh-tools";
import { createUserMessage } from "@deepseek-ai/dsh-llm";
import { SessionId } from "@deepseek-ai/dsh-session";
import type { PromptSection } from "@deepseek-ai/dsh-system-prompt";

import { openFederationService, type FederationService } from "../service.js";
import type { PeerRef } from "../peers.js";
import { parsePalFedDshConfig } from "./config.js";
import {
  PAL_FED_OPERATING_GUIDANCE,
  PAL_FED_SECTION_NAME,
  PAL_FED_SECTION_ORDER,
} from "./instructions.js";
import { buildPalFedTools } from "./tools.js";
import { PeerWatcher, type AgentInbox } from "./watcher.js";

/** Stable Cordis plugin name. */
export const name = "pal-fed-collab";

/** Core services this plugin composes against. */
export const inject = ["agents", "tools", "systemPrompt"];

export interface PalFedRuntime {
  readonly service: FederationService;
  readonly agent: Agent;
  readonly selfPeer: PeerRef;
  readonly fabricId: string;
  readonly sessionScope: string;
  readonly tools: readonly ToolDefinition[];
  readonly watcher: PeerWatcher;
  dispose(): Promise<void>;
}

const RUNTIME_SYMBOL = Symbol.for("pal-fed.runtime");
const READY_SYMBOL = Symbol.for("pal-fed.ready");

/** Read the plugin runtime from a DSH root context (test/operator hook). */
export function palFedRuntimeOf(ctx: Context): PalFedRuntime | undefined {
  return (ctx.root as unknown as Record<symbol, PalFedRuntime | undefined>)[RUNTIME_SYMBOL];
}

/**
 * Await this plugin's asynchronous setup. DSH boot settlement does not itself
 * await a plugin effect's async body, so hosts/tests that need the peer agent
 * ready use this handle.
 */
export function palFedReadyOf(ctx: Context): Promise<PalFedRuntime> {
  return (ctx.root as unknown as Record<symbol, Promise<PalFedRuntime> | undefined>)[READY_SYMBOL] ??
    Promise.reject(new Error("pal-fed-collab is not mounted on this context"));
}

export function apply(ctx: Context, rawConfig: unknown): void {
  const config = parsePalFedDshConfig(rawConfig);
  let resolveReady: (runtime: PalFedRuntime) => void = () => {};
  let rejectReady: (error: unknown) => void = () => {};
  const ready = new Promise<PalFedRuntime>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  ready.catch(() => {});
  (ctx.root as unknown as Record<symbol, Promise<PalFedRuntime>>)[READY_SYMBOL] = ready;

  // Async setup runs inside a cordis effect: boot settlement awaits the setup
  // barrier, and the returned disposer tears the runtime down in order.
  ctx.effect(async () => {
   try {
    const service = await openFederationService({
      dbPath: config.dbPath,
      selfPeer: config.selfPeer,
      fabricId: config.fabricId,
    });

    let tools: readonly ToolDefinition[] = [];
    const setup = (agentCtx: Context, agent: Agent): void => {
      tools = buildPalFedTools({
        service,
        selfPeer: config.selfPeer,
        fabricId: config.fabricId,
        sessionScope: String(agent.id),
      });
      for (const tool of tools) {
        agentCtx.tools.register(tool);
      }
      const section: PromptSection = {
        name: PAL_FED_SECTION_NAME,
        order: PAL_FED_SECTION_ORDER,
        text: PAL_FED_OPERATING_GUIDANCE,
      };
      agentCtx.systemPrompt.section(section);
    };

    const agentOptions =
      config.model === undefined
        ? {}
        : { agentOptions: { provider: config.model.provider, model: config.model.model } };

    const handle = config.resume
      ? await ctx.agents.resume({
          resumeSessionId: SessionId(config.sessionId),
          ...agentOptions,
          setup,
        })
      : await ctx.agents.create({
          sessionId: SessionId(config.sessionId),
          meta: { cwd: config.cwd },
          ...agentOptions,
          setup,
        });

    const watcher = new PeerWatcher({
      service,
      selfPeer: config.selfPeer,
      intervalMs: config.watchIntervalMs,
      agent: handle.agent as unknown as AgentInbox,
    });

    const runtime: PalFedRuntime = {
      service,
      agent: handle.agent,
      selfPeer: config.selfPeer,
      fabricId: config.fabricId,
      sessionScope: String(handle.agent.id),
      tools,
      watcher,
      dispose: async () => {
        watcher.stop();
        await handle.dispose();
        await service.close();
      },
    };

    // A fresh session receives the operator seed as its first user turn; a
    // resumed session keeps its own history and is never re-seeded.
    if (!config.resume && config.initialPrompt !== undefined) {
      (handle.agent as unknown as AgentInbox).followup(
        createUserMessage({
          content: [{ type: "text", text: config.initialPrompt }],
          source: { kind: "user" },
        }),
      );
    }

    watcher.start();
    (ctx.root as unknown as Record<symbol, PalFedRuntime | undefined>)[RUNTIME_SYMBOL] = runtime;
    config.onReady?.(runtime);
    resolveReady(runtime);

    return async () => {
      const store = ctx.root as unknown as Record<symbol, PalFedRuntime | undefined>;
      if (store[RUNTIME_SYMBOL] === runtime) delete store[RUNTIME_SYMBOL];
      await runtime.dispose();
    };
   } catch (error) {
    rejectReady(error);
    throw error;
   }
  }, "pal-fed-collab");
}
