/**
 * PC1 S05-R06 — the async collaboration lifecycle.
 *
 * A pure, durable-shape-neutral reducer for one handoff. The existing DSH/federation transport owns
 * delivery; this reducer owns the FOUR facts a consumer must never conflate:
 *
 *   delivered  ≠  consumed  ≠  acted-on  ≠  cancelled
 *
 * It is deliberately small and serialisable: a host can persist `snapshot()` and restore it after a
 * restart. A restored OPEN record is not proof that a worker is still running — that is what
 * `interrupt()` is for.
 */
export const HANDOFF_STATES = ["CREATED", "QUEUED", "DELIVERED", "CONSUMED", "ACTED", "CANCELLED", "INTERRUPTED"] as const;
export type HandoffState = (typeof HANDOFF_STATES)[number];

export interface DeliveryRecord {
  readonly deliveryId: string;
  readonly at: string;
  readonly payload: string;
}

export interface HandoffLifecycleRecord {
  readonly handoffId: string;
  readonly state: HandoffState;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly deliveries: readonly DeliveryRecord[];
  readonly consumedAt: string | null;
  readonly actedAt: string | null;
  readonly cancelReason: string | null;
  readonly interruptReason: string | null;
}

export class LifecycleError extends Error {
  constructor(readonly code: "NOT_FOUND" | "ILLEGAL_TRANSITION" | "DUPLICATE_CONFLICT", message: string) {
    super(message);
    this.name = "LifecycleError";
  }
}

export class HandoffLifecycle {
  readonly #records = new Map<string, HandoffLifecycleRecord>();
  readonly #now: () => string;

  constructor(now: () => string = () => new Date().toISOString()) {
    this.#now = now;
  }

  create(handoffId: string): HandoffLifecycleRecord {
    if (this.#records.has(handoffId)) throw new LifecycleError("DUPLICATE_CONFLICT", `handoff ${handoffId} already exists`);
    const now = this.#now();
    const record: HandoffLifecycleRecord = {
      handoffId,
      state: "CREATED",
      createdAt: now,
      updatedAt: now,
      deliveries: [],
      consumedAt: null,
      actedAt: null,
      cancelReason: null,
      interruptReason: null,
    };
    this.#records.set(handoffId, record);
    return record;
  }

  #get(handoffId: string): HandoffLifecycleRecord {
    const record = this.#records.get(handoffId);
    if (record === undefined) throw new LifecycleError("NOT_FOUND", `unknown handoff ${handoffId}`);
    return record;
  }

  #set(record: HandoffLifecycleRecord): HandoffLifecycleRecord {
    this.#records.set(record.handoffId, record);
    return record;
  }

  queue(handoffId: string): HandoffLifecycleRecord {
    const record = this.#get(handoffId);
    if (record.state !== "CREATED") throw new LifecycleError("ILLEGAL_TRANSITION", `handoff ${handoffId} is ${record.state}, not CREATED`);
    return this.#set({ ...record, state: "QUEUED", updatedAt: this.#now() });
  }

  deliver(handoffId: string, deliveryId: string, payload: string): HandoffLifecycleRecord {
    const record = this.#get(handoffId);
    if (record.state === "CANCELLED" || record.state === "INTERRUPTED") {
      throw new LifecycleError("ILLEGAL_TRANSITION", `handoff ${handoffId} is ${record.state}; a late delivery cannot reopen authority`);
    }
    const existing = record.deliveries.find((delivery) => delivery.deliveryId === deliveryId);
    if (existing !== undefined) {
      if (existing.payload !== payload) {
        throw new LifecycleError("DUPLICATE_CONFLICT", `delivery ${deliveryId} was already recorded with different content`);
      }
      return record;
    }
    if (record.state === "CONSUMED" || record.state === "ACTED") {
      // A late duplicate is recorded as a fact, but it does not reopen the consumed handoff.
      return this.#set({
        ...record,
        deliveries: [...record.deliveries, { deliveryId, at: this.#now(), payload }],
        updatedAt: this.#now(),
      });
    }
    return this.#set({
      ...record,
      state: "DELIVERED",
      deliveries: [...record.deliveries, { deliveryId, at: this.#now(), payload }],
      updatedAt: this.#now(),
    });
  }

  consume(handoffId: string, deliveryId: string): HandoffLifecycleRecord {
    const record = this.#get(handoffId);
    if (record.state === "CANCELLED" || record.state === "INTERRUPTED") {
      throw new LifecycleError("ILLEGAL_TRANSITION", `handoff ${handoffId} is ${record.state}; it cannot be consumed`);
    }
    const delivery = record.deliveries.find((entry) => entry.deliveryId === deliveryId);
    if (delivery === undefined) throw new LifecycleError("ILLEGAL_TRANSITION", `delivery ${deliveryId} has not been delivered to ${handoffId}`);
    if (record.state === "CONSUMED" || record.state === "ACTED") return record;
    if (record.state !== "DELIVERED") throw new LifecycleError("ILLEGAL_TRANSITION", `handoff ${handoffId} is ${record.state}, not DELIVERED`);
    return this.#set({ ...record, state: "CONSUMED", consumedAt: this.#now(), updatedAt: this.#now() });
  }

  act(handoffId: string): HandoffLifecycleRecord {
    const record = this.#get(handoffId);
    if (record.state === "ACTED") return record;
    if (record.state !== "CONSUMED") throw new LifecycleError("ILLEGAL_TRANSITION", `handoff ${handoffId} is ${record.state}; only a CONSUMED result can be acted on`);
    return this.#set({ ...record, state: "ACTED", actedAt: this.#now(), updatedAt: this.#now() });
  }

  cancel(handoffId: string, reason: string): HandoffLifecycleRecord {
    const record = this.#get(handoffId);
    if (record.state === "ACTED" || record.state === "CANCELLED") return record;
    return this.#set({ ...record, state: "CANCELLED", cancelReason: reason, updatedAt: this.#now() });
  }

  interrupt(handoffId: string, reason: string): HandoffLifecycleRecord {
    const record = this.#get(handoffId);
    if (record.state === "ACTED" || record.state === "CANCELLED") {
      throw new LifecycleError("ILLEGAL_TRANSITION", `handoff ${handoffId} is ${record.state}; it has no live job to interrupt`);
    }
    return this.#set({ ...record, state: "INTERRUPTED", interruptReason: reason, updatedAt: this.#now() });
  }

  inspect(handoffId: string): HandoffLifecycleRecord {
    return this.#get(handoffId);
  }

  snapshot(): string {
    return JSON.stringify([...this.#records.values()]);
  }

  static restore(snapshot: string, now: () => string = () => new Date().toISOString()): HandoffLifecycle {
    const lifecycle = new HandoffLifecycle(now);
    for (const record of JSON.parse(snapshot) as HandoffLifecycleRecord[]) {
      lifecycle.#records.set(record.handoffId, record);
    }
    return lifecycle;
  }
}
