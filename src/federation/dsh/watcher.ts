/**
 * PAL-FED-0D deterministic peer watcher (EXPERIMENTAL, §18–§23/§33).
 *
 * The watcher observes the durable coordination feed, materializes the pending
 * batch through the normal inbox path, and delivers a thin attention notice to
 * the configured DSH Agent's inbox. It is deterministic infrastructure: no
 * LLM, no routing, no prioritization. Wake is NOT acknowledgement — only the
 * agent's own collab_ack advances the durable cursor.
 */

import { boundContextSummary, createUserMessage, type UserMessage } from "@deepseek-ai/dsh-llm";

import type { FederationService } from "../service.js";
import type { PeerRef } from "../peers.js";

/** The narrow live-agent capability the watcher needs. */
export interface AgentInbox {
  followup(message: UserMessage): void;
}

export interface PeerWatcherOptions {
  readonly service: FederationService;
  readonly selfPeer: PeerRef;
  readonly agent: AgentInbox;
  readonly intervalMs: number;
}

export interface PeerWatcherStatus {
  readonly lastWakeBatchId: string | undefined;
  readonly wakeCount: number;
}

/**
 * Polls `collab_inbox` on a bounded local timer. A pending batch is deduped by
 * its durable batch id for this adapter lifetime, so the agent is woken at most
 * once per pending batch; an adapter restart with the batch still pending wakes
 * it again, which is the intended crash-recovery behavior.
 */
export class PeerWatcher {
  readonly #service: FederationService;
  readonly #selfPeer: PeerRef;
  readonly #agent: AgentInbox;
  readonly #intervalMs: number;
  #timer: NodeJS.Timeout | undefined;
  #lastWakeBatchId: string | undefined;
  #wakeCount = 0;
  #ticking = false;
  #stopped = false;

  constructor(options: PeerWatcherOptions) {
    this.#service = options.service;
    this.#selfPeer = options.selfPeer;
    this.#agent = options.agent;
    this.#intervalMs = options.intervalMs;
  }

  start(): void {
    if (this.#timer !== undefined || this.#stopped) return;
    this.#timer = setInterval(() => {
      void this.tick();
    }, this.#intervalMs);
    this.#timer.unref?.();
  }

  stop(): void {
    this.#stopped = true;
    if (this.#timer !== undefined) {
      clearInterval(this.#timer);
      this.#timer = undefined;
    }
  }

  status(): PeerWatcherStatus {
    return { lastWakeBatchId: this.#lastWakeBatchId, wakeCount: this.#wakeCount };
  }

  /** One observation cycle; exposed so tests can drive it deterministically. */
  async tick(): Promise<string | null> {
    if (this.#stopped || this.#ticking) return null;
    this.#ticking = true;
    try {
      // inbox() persists the pending batch before returning it, so a wake can
      // never point at work the durable substrate does not already hold.
      const result = await this.#service.inbox();
      if (result.batchId === null) return null;
      if (result.batchId === this.#lastWakeBatchId) return null;
      this.#lastWakeBatchId = result.batchId;
      this.#wakeCount += 1;
      this.#agent.followup(this.#notice(result.batchId, result.events.length, result.contracts.length));
      return result.batchId;
    } finally {
      this.#ticking = false;
    }
  }

  #notice(batchId: string, eventCount: number, contractCount: number): UserMessage {
    const text =
      `PAL-FED collaboration batch ${batchId} is pending ` +
      `(${eventCount} event(s), ${contractCount} contract revision(s)). ` +
      `Use collab_inbox to inspect the durable boundary changes, process them, ` +
      `then collab_ack only after handling them.`;
    return createUserMessage({
      content: [{ type: "text", text }],
      source: {
        kind: "plugin",
        plugin: "pal-fed-collab",
        form: "notice",
        summary: boundContextSummary(`peer batch ${batchId}`),
      },
    });
  }
}
