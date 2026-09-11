/**
 * PAL-FED-0D DSH test host harness (EXPERIMENTAL).
 *
 * Boots a REAL DSH tree in-process (the pinned `dsh-sdk-minimal` bundle minus
 * its app/terminal rows) with two PAL-FED plugins mounted: the deterministic
 * model adapter and the peer-collaboration plugin. Tests then drive authentic
 * DSH agents — real registry, real session log, real loop, real tool dispatch,
 * real inbox — rather than a fake harness.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { boot, loadOverlayPatches } from "@deepseek-ai/dsh-app-boot";
import type { Context } from "@deepseek-ai/cordis";

import type { PeerRef } from "../src/federation/peers.js";
import type { AdmissionBinding } from "../src/federation/dsh/admission.js";
import {
  palFedReadyOf,
  type PalFedRuntime,
} from "../src/federation/dsh/plugin.js";
import type { ScriptStepFn, ScriptedStep } from "../src/federation/dsh/deterministic_llm.js";

const require = createRequire(import.meta.url);

export const TEST_PROVIDER = "pal-fed-test";
export const TEST_MODEL = "scripted-1";

const DIST_PLUGIN = pathToFileURL(resolve("dist/src/federation/dsh/plugin.js")).href;
const DIST_LLM = pathToFileURL(resolve("dist/src/federation/dsh/deterministic_llm.js")).href;

/** The rows the minimal agent tree does not need for federation tests. */
const DISABLED_ROWS = [
  "sdk-jsonrpc-server",
  "sdk-app-startup",
  "terminal-bash",
  "terminal-pwsh",
  "persistent-bash",
  "persistent-pwsh",
];

export interface BootPeerOptions {
  /** Per-host scratch directory (config + sessions). */
  readonly dir: string;
  readonly dbPath: string;
  readonly fabricId: string;
  readonly selfPeer: PeerRef;
  readonly sessionId: string;
  readonly cwd: string;
  readonly script?: readonly ScriptedStep[];
  readonly scriptFn?: ScriptStepFn | undefined;
  readonly resume?: boolean;
  readonly watchIntervalMs?: number;
  readonly initialPrompt?: string;
  /** PAL-FED-0I experiment-only admission binding (adds decision_submit). */
  readonly admission?: AdmissionBinding;
}

export interface DshPeerHost {
  readonly ctx: Context;
  readonly runtime: PalFedRuntime;
  close(): Promise<void>;
}

export async function bootPeerHost(options: BootPeerOptions): Promise<DshPeerHost> {
  mkdirSync(options.dir, { recursive: true });
  const configPath = join(options.dir, "cordis.yml");
  writeFileSync(configPath, "[]\n");

  const patches = loadOverlayPatches(
    "pal-fed-test",
    require.resolve("@deepseek-ai/dsh-sdk-minimal/cordis.patch.yml"),
  );
  for (const id of DISABLED_ROWS) {
    patches.push({ id, disabled: true });
  }
  patches.push({
    id: "sessions",
    config: { root: join(options.dir, "sessions"), compression: "none" },
  });
  patches.push({
    insert: [
      {
        id: "pal-fed-deterministic-llm",
        name: DIST_LLM,
        config: {
          provider: TEST_PROVIDER,
          model: TEST_MODEL,
          script: options.script ?? [],
          ...(options.scriptFn === undefined ? {} : { scriptFn: options.scriptFn }),
        },
      },
      {
        id: "pal-fed",
        name: DIST_PLUGIN,
        config: {
          selfPeer: options.selfPeer,
          fabricId: options.fabricId,
          dbPath: options.dbPath,
          sessionId: options.sessionId,
          cwd: options.cwd,
          resume: options.resume === true,
          watchIntervalMs: options.watchIntervalMs ?? 60_000,
          model: { provider: TEST_PROVIDER, model: TEST_MODEL },
          ...(options.initialPrompt === undefined ? {} : { initialPrompt: options.initialPrompt }),
          ...(options.admission === undefined ? {} : { admission: options.admission }),
        },
      },
    ],
  });

  const ctx = await boot("pal-fed-test", configPath, patches);
  const runtime = await palFedReadyOf(ctx);
  return {
    ctx,
    runtime,
    async close() {
      await ctx.fiber.dispose();
    },
  };
}

/** Wait until the agent's driver is idle (no scheduled or active turn). */
export async function waitIdle(host: DshPeerHost): Promise<void> {
  const agent = host.runtime.agent as unknown as { whenIdle(): Promise<void> };
  await agent.whenIdle();
}
