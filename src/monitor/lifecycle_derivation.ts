/**
 * G10-AC — pure derivation of monitor continuation state from canonical history.
 *
 * Crash recovery must never depend on what a scan CURRENTLY returns: after a
 * crash the watch may already be `TRIGGERED`, so `scanWatches()` no longer
 * reports it and a naive driver would lose the wake. This module derives the
 * continuation from the canonical Campaign events alone - no table, no pending
 * queue, no second state machine.
 *
 *   trigger-before-wake       → a pending wake cause is derivable from history
 *   wake-before-reconciliation→ the SAME wake cycle is in flight
 *   reconciliation-before-host→ the signal identity is replay-derivable
 */

import type { CampaignEvent } from "../campaign/store.js";

export interface PendingWakeDerivation {
  /** Every `WATCH_TRIGGERED` watch id, in canonical event order (deduplicated). */
  readonly triggeredWatchIds: readonly string[];
  /** The wake cycle currently in flight (started, not completed), if any. */
  readonly inFlightWakeCycleId: string | null;
  /** The wake cycle's encoded cause string, when a wake is in flight. */
  readonly inFlightWakeCause: string | null;
  /** How many wake cycles have been COMPLETED (diagnostics + delivery stop). */
  readonly completedWakeCycles: number;
  /**
   * The deterministic cause for a wake that was triggered but never started.
   * Smallest watch id = stable and independent of event timing.
   */
  readonly pendingWatchId: string | null;
}

function stringField(payload: unknown, field: string): string | null {
  if (typeof payload !== "object" || payload === null) return null;
  const value = (payload as Record<string, unknown>)[field];
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** Derive everything the driver needs to continue a Campaign from its history. */
export function deriveMonitorContinuation(
  events: readonly CampaignEvent[],
): PendingWakeDerivation {
  const triggeredWatchIds: string[] = [];
  const seen = new Set<string>();
  const startedCycles: string[] = [];
  const finishedCycles = new Set<string>();
  let inFlightWakeCause: string | null = null;

  for (const event of events) {
    switch (event.type) {
      case "WATCH_TRIGGERED": {
        const watchId = stringField(event.payload, "watchId");
        if (watchId !== null && !seen.has(watchId)) {
          seen.add(watchId);
          triggeredWatchIds.push(watchId);
        }
        break;
      }
      case "WAKE_STARTED": {
        const wakeCycleId = stringField(event.payload, "wakeCycleId");
        if (wakeCycleId !== null) startedCycles.push(wakeCycleId);
        inFlightWakeCause = stringField(event.payload, "cause");
        break;
      }
      case "WAKE_CYCLE_COMPLETED":
      case "WAKE_COMPLETED": {
        const wakeCycleId = stringField(event.payload, "wakeCycleId");
        if (wakeCycleId !== null) finishedCycles.add(wakeCycleId);
        break;
      }
      default:
        break;
    }
  }

  // In flight = the LAST started cycle, when it has not been completed. A later
  // start supersedes an earlier unfinished one, which is what "one in-flight wake
  // per Campaign" means in history terms.
  const lastStarted = startedCycles.at(-1);
  const inFlightWakeCycleId =
    lastStarted !== undefined && !finishedCycles.has(lastStarted) ? lastStarted : null;

  const sortedTriggered = [...triggeredWatchIds].sort();
  return Object.freeze({
    triggeredWatchIds: Object.freeze(triggeredWatchIds),
    inFlightWakeCycleId,
    inFlightWakeCause: inFlightWakeCycleId === null ? null : inFlightWakeCause,
    completedWakeCycles: finishedCycles.size,
    // A pending wake exists only when nothing is in flight.
    pendingWatchId: inFlightWakeCycleId === null ? (sortedTriggered[0] ?? null) : null,
  });
}

/** The deterministic wake cause for a triggered-but-unstarted watch. */
export function pendingWakeCauseOf(
  derivation: PendingWakeDerivation,
): { readonly kind: "watch"; readonly watchId: string } | null {
  return derivation.pendingWatchId === null
    ? null
    : Object.freeze({ kind: "watch" as const, watchId: derivation.pendingWatchId });
}
