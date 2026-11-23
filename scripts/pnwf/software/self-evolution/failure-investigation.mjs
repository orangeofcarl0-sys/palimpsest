/** Durable investigation intake shared by maintenance work with Git or local assets. */
import assert from "node:assert/strict";
import { sealOf } from "./slot.mjs";

const hash = value => /^[a-f0-9]{64}$/u.test(value ?? "");
const commit = value => /^[a-f0-9]{40}$/u.test(value ?? "");
const endStates = ["REJECTED", "PAUSED"];

export class MaintenanceFailures {
  constructor(slot) {
    this.slot = slot;
    this.db = slot.db;
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS maintenance_failure_cases (
        id TEXT PRIMARY KEY, input TEXT NOT NULL, report TEXT, disposition TEXT, readback TEXT
      ) STRICT
    `);
  }

  list() {
    return this.db.prepare("SELECT * FROM maintenance_failure_cases ORDER BY rowid").all()
      .map(({ id, input, report, disposition, readback }) => ({
        id, input: JSON.parse(input), report: JSON.parse(report), disposition: JSON.parse(disposition),
        readback: JSON.parse(readback),
      }));
  }

  intake(input) {
    assert(input.project === this.slot.current().project && input.attempt && input.work &&
      hash(input.archive) && endStates.includes(input.verdict?.state) && input.verdict.reason,
    "MAINTENANCE_FAILURE_BINDING_REQUIRED");
    assert(input.target?.kind === "git"
      ? commit(input.target.basis) && (input.target.candidate === null || commit(input.target.candidate)) &&
        hash(input.release?.buildSha256) && input.release.candidate === input.target.basis
      : input.target?.kind === "asset" && input.target.checkpoint && hash(input.target.digest) && hash(input.target.basis),
    "MAINTENANCE_FAILURE_TARGET_REQUIRED");
    const id = "failure-" + sealOf({ project: input.project, attempt: input.attempt, archive: input.archive });
    return this.slot.transaction(() => {
      const existing = this.db.prepare("SELECT input FROM maintenance_failure_cases WHERE id=?").get(id);
      if (existing) assert.equal(sealOf(JSON.parse(existing.input)), sealOf(input), "MAINTENANCE_FAILURE_INPUT_CHANGED");
      else {
        this.db.prepare("INSERT INTO maintenance_failure_cases (id,input) VALUES (?,?)").run(id, JSON.stringify(input));
        this.slot.record("MAINTENANCE_INVESTIGATION_QUEUED", { id, attempt: input.attempt, archive: input.archive });
      }
      return id;
    });
  }

  report(id, receipt) {
    assert(hash(receipt?.seal) && sealOf(receipt.facts) === receipt.seal && receipt.facts.case === id,
      "MAINTENANCE_INVESTIGATION_RECEIPT_CHANGED");
    return this.#record(id, "report", receipt, "MAINTENANCE_INVESTIGATION_COMPLETED");
  }

  route(id, disposition) {
    return this.#record(id, "disposition", disposition, "MAINTENANCE_FAILURE_ROUTED");
  }

  close(id, readback) {
    return this.#record(id, "readback", readback, "MAINTENANCE_FAILURE_RETESTED");
  }

  #record(id, field, value, event) {
    return this.slot.transaction(() => {
      const row = this.db.prepare("SELECT * FROM maintenance_failure_cases WHERE id=?").get(id);
      assert(row && (field === "report" || row.report) && (field !== "readback" || row.disposition),
        "MAINTENANCE_INVESTIGATION_STAGE_MISSING");
      if (row[field]) {
        assert.equal(sealOf(JSON.parse(row[field])), sealOf(value), "MAINTENANCE_INVESTIGATION_STAGE_CHANGED");
        return false;
      }
      this.db.prepare("UPDATE maintenance_failure_cases SET " + field + "=? WHERE id=?").run(JSON.stringify(value), id);
      this.slot.record(event, { id, seal: sealOf(value), ...(field === "disposition" ? value : {}) });
      return true;
    });
  }
}

/** Compare structural blockers across a parent and its repair without keying on paths or SHA. */
export function repeatedFailure(previous, current) {
  const blocked = new Set(previous?.facts.findings.filter(item => item.state === "REPRODUCED" && item.blocking)
    .map(item => item.code));
  return current.facts.findings.filter(item => item.state === "REPRODUCED" && item.blocking && blocked.has(item.code))
    .map(item => item.code);
}
