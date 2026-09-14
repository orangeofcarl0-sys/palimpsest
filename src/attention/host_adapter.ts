/**
 * G10-P host activation adapters — the LAST of the three separated layers:
 *
 *   Ordarium durable signal (mechanical) → Palimpsest attention decision (semantic)
 *        → host activation adapter (cognition)
 *
 *   Notification ≠ Activation        Host Wake ≠ Semantic Authority
 *
 * These adapters are HOST INTEGRATION, not semantic code. They import NO canonical
 * store and NO authority/admission port (source-firewalled). They are STRUCTURAL: the
 * DSH agent registry and the Pi extension host are declared by shape, so this package
 * does not depend on either host's private package. `activate` never throws — a host
 * failure returns `activated: false` so the attention signal stays pending and the
 * durable semantic inbox is never lost (`P-A34`).
 */

import type { AttentionSignal } from "./signals.js";

export interface AttentionActivationOutcome {
  readonly activated: boolean;
  readonly detail: string;
}

export interface AttentionActivationPort {
  readonly adapterId: string;
  activate(signal: AttentionSignal): Promise<AttentionActivationOutcome>;
}

export function defaultAttentionText(signal: AttentionSignal): string {
  const where = signal.threadId === undefined ? "" : ` (thread ${signal.threadId})`;
  return `[palimpsest attention] ${signal.kind} from ${signal.peer.peerId}${where}: ${signal.reason}`;
}

/** Pull-mode adapter: no host wake is configured; the inbox remains the truth path. */
export function nullAttentionAdapter(): AttentionActivationPort {
  return {
    adapterId: "null",
    activate: async () => ({
      activated: false,
      detail: "no attention activation adapter is configured — pull mode only",
    }),
  };
}

export interface RecordingAttentionAdapter extends AttentionActivationPort {
  readonly activated: readonly AttentionSignal[];
}

/** Test/embedding adapter: records activations without waking anything. */
export function recordingAttentionAdapter(adapterId = "recording"): RecordingAttentionAdapter {
  const activated: AttentionSignal[] = [];
  return {
    adapterId,
    activated,
    activate: async (signal) => {
      activated.push(signal);
      return { activated: true, detail: `recorded ${signal.signalId}` };
    },
  };
}

/* ------------------------------------------------------------------ *
 * DSH: ctx.agents.resume(...) / agent.followup(message)
 * ------------------------------------------------------------------ */

export interface DshAgentLike {
  followup(message: string): void;
}

export interface DshAgentsServiceLike {
  /** Live agent handle, when one is resident. */
  get?(id: string): DshAgentLike | undefined;
  /** Cold resume of a persisted session; mints a fresh agent scope. */
  resume?(options: { readonly resumeSessionId: string }): Promise<DshAgentLike | { readonly agent: DshAgentLike }>;
}

function agentOf(resumed: DshAgentLike | { readonly agent: DshAgentLike }): DshAgentLike {
  return typeof (resumed as { followup?: unknown }).followup === "function"
    ? (resumed as DshAgentLike)
    : (resumed as { readonly agent: DshAgentLike }).agent;
}

export function dshAgentsAttentionAdapter(input: {
  readonly agents: DshAgentsServiceLike;
  /** The persisted session/agent this deployment signals (host binding, not a PeerRef). */
  readonly resumeSessionId: string;
  readonly format?: ((signal: AttentionSignal) => string) | undefined;
}): AttentionActivationPort {
  const format = input.format ?? defaultAttentionText;
  const adapterId = "dsh-agents";
  return {
    adapterId,
    async activate(signal) {
      const text = format(signal);
      try {
        const live = input.agents.get?.(input.resumeSessionId);
        if (live !== undefined) {
          live.followup(text);
          return { activated: true, detail: `followed up the resident agent "${input.resumeSessionId}"` };
        }
        if (input.agents.resume !== undefined) {
          const resumed = agentOf(await input.agents.resume({ resumeSessionId: input.resumeSessionId }));
          resumed.followup(text);
          return { activated: true, detail: `cold-resumed "${input.resumeSessionId}" and queued a turn` };
        }
        return { activated: false, detail: "the DSH agents service exposes neither get() nor resume()" };
      } catch (error) {
        return {
          activated: false,
          detail: `DSH activation failed: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },
  };
}

/* ------------------------------------------------------------------ *
 * Pi: pi.sendMessage(message, { deliverAs, triggerTurn })
 * ------------------------------------------------------------------ */

export interface PiHostLike {
  sendMessage(message: unknown, options?: unknown): unknown;
}

export function piAttentionAdapter(input: {
  readonly pi: PiHostLike;
  readonly deliverAs?: "steer" | "followUp" | "nextTurn" | undefined;
  readonly format?: ((signal: AttentionSignal) => string) | undefined;
}): AttentionActivationPort {
  const format = input.format ?? defaultAttentionText;
  const adapterId = "pi-host";
  return {
    adapterId,
    async activate(signal) {
      try {
        // `triggerTurn: true` is the documented wake/enqueue primitive.
        const result = input.pi.sendMessage(format(signal), {
          deliverAs: input.deliverAs ?? "followUp",
          triggerTurn: true,
        });
        await Promise.resolve(result);
        return { activated: true, detail: "queued a Pi turn with triggerTurn" };
      } catch (error) {
        return {
          activated: false,
          detail: `Pi activation failed: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },
  };
}
