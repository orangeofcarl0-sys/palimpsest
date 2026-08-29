/**
 * Telemetry externalization (PLMP-TLM-1). The durable home of the
 * ModelPerformanceTable is the Ordarium managed state kind (the shared
 * operations timeline): every flush appends one throwaway delta subject
 * under the versioned namespace, and loading aggregates every delta by
 * summation. Overwrite-CAS slots have no clean merge for counters under
 * concurrent writers; append-only subjects reduce the merge to an
 * associative sum, and the per-flush revision chain keeps every write
 * attributable on the shared timeline.
 */

import { randomUUID } from "node:crypto";

import {
  StateRevisionConflictError,
  type OrdariumStateStore,
  type StateRecord,
} from "@ordarium/core";

import { ModelPerformanceTable, type PerformanceSnapshot } from "./performance_table.js";

export const TELEMETRY_NAMESPACE = "palimpsest.telemetry.v1";

export type TelemetryDeltaValue = {
  task_type: string;
  model: string;
  attempts: number;
  successes: number;
  cost: number;
};

/** Management-plane identity: telemetry is no orchestration call (TLM-1 §1). */
const TELEMETRY_IDENTITY = {
  source: "palimpsest-telemetry",
  scope: "telemetry",
} as const;

/** Fresh-subject key collisions are practically unreachable; this bounds them. */
const CREATE_RETRIES = 3;

export class TelemetryStateSync {
  #store: OrdariumStateStore;
  /** Mirror of everything already durable; flush writes memory minus this. */
  #synced: ModelPerformanceTable;

  private constructor(store: OrdariumStateStore, synced: ModelPerformanceTable) {
    this.#store = store;
    this.#synced = synced;
  }

  /** Aggregate every durable delta into a fresh baseline (restart path). */
  static async load(store: OrdariumStateStore): Promise<TelemetryStateSync> {
    const synced = new ModelPerformanceTable();
    let cursor: string | undefined = undefined;
    do {
      const page = await store.list({ namespace: TELEMETRY_NAMESPACE }, cursor);
      for (const record of page.records) {
        synced.addAggregated(decodeDelta(record));
      }
      cursor = page.nextCursor;
    } while (cursor !== undefined);
    return new TelemetryStateSync(store, synced);
  }

  /** The aggregated view of everything durable so far. */
  durableSnapshot(): PerformanceSnapshot {
    return this.#synced.snapshot();
  }

  /** Append the memory table's not-yet-durable deltas as new state subjects. */
  async flush(table: ModelPerformanceTable): Promise<void> {
    for (const row of table.snapshot().rows) {
      const durable = this.#synced.stat(row.task_type, row.model);
      const attempts = row.attempts - (durable?.attempts ?? 0);
      if (attempts <= 0) continue;
      const successes = Math.min(row.successes - (durable?.successes ?? 0), attempts);
      const cost = Math.max(0, row.cost - (durable?.cost ?? 0));
      const delta: TelemetryDeltaValue = {
        task_type: row.task_type,
        model: row.model,
        attempts,
        successes,
        cost,
      };
      await this.#createDelta(delta);
      this.#synced.addAggregated(delta);
    }
  }

  async #createDelta(delta: TelemetryDeltaValue): Promise<void> {
    let lastError: unknown;
    for (let attempt = 0; attempt < CREATE_RETRIES; attempt += 1) {
      try {
        await this.#store.write({
          namespace: TELEMETRY_NAMESPACE,
          key: `delta-${randomUUID()}`,
          expectedRevision: 0,
          value: delta,
          identity: { ...TELEMETRY_IDENTITY, callId: `tel-${randomUUID()}` },
        });
        return;
      } catch (error) {
        // A fresh subject can only conflict on the (astronomically unlikely)
        // key collision; retry with a new key, then surface the exhaustion -
        // a busy-family storage condition, never a verdict (TLM-1 §2).
        if (!(error instanceof StateRevisionConflictError)) throw error;
        lastError = error;
      }
    }
    throw lastError;
  }
}

function decodeDelta(record: StateRecord): TelemetryDeltaValue {
  const value = record.value as Partial<TelemetryDeltaValue> | null;
  const { attempts, successes, cost } = value ?? {};
  if (
    value === null ||
    typeof value !== "object" ||
    typeof value.task_type !== "string" ||
    typeof value.model !== "string" ||
    !Number.isSafeInteger(attempts) ||
    (attempts ?? 0) < 1 ||
    !Number.isSafeInteger(successes) ||
    (successes ?? 0) < 0 ||
    (successes ?? 0) > (attempts ?? 0) ||
    typeof cost !== "number" ||
    !Number.isFinite(cost) ||
    (cost ?? 0) < 0
  ) {
    throw new TypeError(`unparseable telemetry delta subject ${record.namespace}/${record.key}`);
  }
  return {
    task_type: value.task_type,
    model: value.model,
    attempts: attempts as number,
    successes: successes as number,
    cost: cost as number,
  };
}
