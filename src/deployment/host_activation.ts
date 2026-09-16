/**
 * UX-C §23/§40 (CF-UXB-03) — the SHIPPED runner's activation wiring, extracted so
 * the cold-resume proof can drive the runner's OWN construction rather than a
 * parallel test stub.
 *
 * The DSH host session id is NOT a PeerRef: a cold `get() → undefined` must
 * `resume()` the persisted session and QUEUE a followup turn, and a failed
 * resume/activation must leave the semantic signal pending. This module owns that
 * exact `agents → adapter` wiring; `host/dsh/lib/runner.js` calls it with the real
 * `dshAgentsAttentionAdapter`, real session branding and the real user-message
 * constructor, and the tests/dogfoods drive it with a recording agents service.
 *
 * It is host/deployment packaging (`src/deployment/**`): it carries no semantic
 * authority, touches no store and imports no kernel module.
 */

import type { AttentionActivationPort, AttentionSignal } from "../attention/index.js";

/** A live/resumed agent as the runner can reach it (the runner supplies the wrapper). */
export interface RunnerActivationAgent {
  followup(message: unknown): void;
  whenIdle?(): Promise<void> | void;
}

/** The DSH agents service, as far as the runner's activation wiring uses it. */
export interface RunnerActivationAgents {
  get?(id: string): RunnerActivationAgent | undefined | null;
  resume?(options: {
    readonly resumeSessionId: string;
    readonly agentOptions: unknown;
    readonly setup: (agentCtx: unknown) => void;
  }): Promise<{ readonly agent?: RunnerActivationAgent } | RunnerActivationAgent>;
}

export interface ComposeRunnerActivationInput {
  /** The product attention adapter factory (the real `dshAgentsAttentionAdapter`). */
  readonly createAdapter: (input: {
    readonly agents: {
      readonly get?: (id: string) => { followup(message: string): void } | undefined;
      readonly resume?: (
        options: { readonly resumeSessionId: string },
      ) => Promise<{ followup(message: string): void } | { readonly agent: { followup(message: string): void } }>;
    };
    readonly resumeSessionId: string;
    readonly format: (signal: AttentionSignal) => string;
  }) => AttentionActivationPort;
  readonly agents: RunnerActivationAgents;
  /** The persisted host session/agent this deployment signals (host binding, not a PeerRef). */
  readonly sessionId: string;
  readonly agentOptions: unknown;
  readonly setup: (agentCtx: unknown) => void;
  /** Brand a host session id exactly as the runner does (`brandString(String(id))`). */
  readonly brandSessionId: (id: string) => string;
  /** Build the real user message delivered to the agent. */
  readonly toUserMessage: (text: string) => unknown;
  readonly format: (signal: AttentionSignal) => string;
}

/**
 * Compose the shipped runner's activation adapter over one agents service.
 *
 * `get()` returning `undefined`/`null` is the COLD case: the wiring calls
 * `resume()`, awaits the resumed agent's `whenIdle()`, and returns a `followup`
 * handle. Any rejection propagates to the product adapter, which converts it to
 * `activated: false` so the durable signal stays pending.
 */
export function composeRunnerActivation(input: ComposeRunnerActivationInput): AttentionActivationPort {
  const { createAdapter, agents, sessionId, agentOptions, setup, brandSessionId, toUserMessage, format } = input;
  return createAdapter({
    agents: {
      get: (id: string) => {
        const live = typeof agents.get === "function" ? agents.get(id) : undefined;
        if (live === undefined || live === null) return undefined;
        return { followup: (text: string) => live.followup(toUserMessage(text)) };
      },
      resume: async ({ resumeSessionId }: { readonly resumeSessionId: string }) => {
        const resumed = await agents.resume!({
          resumeSessionId: brandSessionId(String(resumeSessionId)),
          agentOptions,
          setup,
        });
        const resumedAgent = (resumed as { readonly agent?: RunnerActivationAgent }).agent ?? (resumed as RunnerActivationAgent);
        await resumedAgent?.whenIdle?.();
        return { followup: (text: string) => resumedAgent.followup(toUserMessage(text)) };
      },
    },
    resumeSessionId: sessionId,
    format,
  });
}
