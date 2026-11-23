import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { digest } from "../../energy/contract.mjs";

const encode = value => JSON.stringify(value);
const hash = value => digest(encode(value));
const bindingKey = binding => hash(Object.entries(binding).sort(([a], [b]) => a.localeCompare(b)));

/** An earlier unobserved step prevents attributing a later absence. */
export function firstBreak(steps) {
  const step = steps.find(item => item.observed !== true);
  return step?.observed === false ? step : null;
}

export class HandoverSupervisor {
  #path;
  #pending = new Map();

  constructor(path) {
    this.#path = path;
    const db = new DatabaseSync(path);
    try {
      db.exec(`CREATE TABLE IF NOT EXISTS reviews (
        id TEXT PRIMARY KEY, binding TEXT NOT NULL, receipt TEXT NOT NULL,
        delivered INTEGER NOT NULL DEFAULT 0
      ) STRICT`);
    } finally { db.close(); }
  }

  review({ binding, steps, source }, reproduce) {
    const failure = firstBreak(steps);
    if (!failure) return null;
    assert(typeof source === "string" && source.length && Object.values(binding).every(value =>
      typeof value === "string" && value.length), "INCOMPLETE_HANDOVER_BINDING");
    const key = bindingKey(binding);
    const id = "handover-" + hash({ key, source, step: failure.step });
    const run = () => this.#review(id, key, { binding, failure, source }, reproduce);
    if (!this.#pending.has(id)) {
      this.#pending.set(id, Promise.resolve().then(run).finally(() => this.#pending.delete(id)));
    }
    return this.#pending.get(id);
  }

  async #review(id, key, original, reproduce) {
    const db = new DatabaseSync(this.#path);
    try {
      // The isolated replay is read-only with respect to the original. A killed
      // consumer rolls back this transaction and can safely retry the replay.
      db.exec("BEGIN IMMEDIATE");
      const saved = db.prepare("SELECT receipt FROM reviews WHERE id=?").get(id);
      if (saved) {
        db.exec("COMMIT");
        return JSON.parse(saved.receipt);
      }
      const startedAt = new Date().toISOString();
      const replay = await reproduce();
      const confirmed = firstBreak(replay.steps);
      const reproduced = confirmed?.step === original.failure.step;
      const receipt = { id, ...original, state: reproduced ? "REPRODUCED" : "INCONCLUSIVE",
        firstBreak: reproduced ? confirmed : null, replay, startedAt, endedAt: new Date().toISOString() };
      db.prepare("INSERT INTO reviews (id,binding,receipt) VALUES (?,?,?)").run(id, key, encode(receipt));
      db.exec("COMMIT");
      return receipt;
    } catch (error) {
      if (db.isTransaction) db.exec("ROLLBACK");
      throw error;
    } finally { db.close(); }
  }

  #bound(db, id, binding) {
    const row = db.prepare("SELECT binding, receipt, delivered FROM reviews WHERE id=?").get(id);
    assert(row && row.binding === bindingKey(binding), "HANDOVER_RECEIPT_VERSION_MISMATCH");
    return row;
  }

  read(id, binding) {
    const db = new DatabaseSync(this.#path, { readOnly: true });
    try {
      const row = this.#bound(db, id, binding);
      return { receipt: JSON.parse(row.receipt), delivered: row.delivered === 1 };
    } finally { db.close(); }
  }

  acknowledge(id, binding) {
    const db = new DatabaseSync(this.#path);
    try {
      this.#bound(db, id, binding);
      return db.prepare("UPDATE reviews SET delivered=1 WHERE id=? AND delivered=0").run(id).changes === 1;
    } finally { db.close(); }
  }
}
