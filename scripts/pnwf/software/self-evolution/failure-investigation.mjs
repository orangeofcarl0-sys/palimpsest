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
      ) STRICT;
      CREATE TABLE IF NOT EXISTS maintenance_draft_replays (
        failure TEXT PRIMARY KEY REFERENCES maintenance_failure_cases(id), input TEXT NOT NULL, receipt TEXT, work TEXT
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

  drafts() {
    return this.db.prepare("SELECT failure,input,receipt,work FROM maintenance_draft_replays ORDER BY rowid").all()
      .map(row => ({ failure: row.failure, input: JSON.parse(row.input), receipt: JSON.parse(row.receipt), work: JSON.parse(row.work) }));
  }

  queueDraft(id, input) {
    return this.slot.transaction(() => {
      const row = this.db.prepare("SELECT input,report FROM maintenance_failure_cases WHERE id=?").get(id);
      assert(row?.report, "MAINTENANCE_DRAFT_REQUIRES_INVESTIGATED_CASE");
      const source = JSON.parse(row.input), report = JSON.parse(row.report);
      assert(source.verdict.state === "PAUSED" && source.target.kind === "git" && source.target.basis === source.target.candidate &&
        input.case === id && input.archive === source.archive && input.attempt === source.attempt &&
        input.checkpoint === source.checkpoint && hash(input.checkpoint) &&
        sealOf(input.release) === sealOf(source.release) && input.investigation === report.seal &&
        hash(input.files?.patch) && hash(input.files?.untracked) && hash(input.contract),
      "MAINTENANCE_DRAFT_INPUT_UNBOUND");
      if (source.sources?.["working.patch"] || source.sources?.["untracked.tar.gz"]) {
        assert(input.files.patch === source.sources["working.patch"] && input.files.untracked === source.sources["untracked.tar.gz"],
          "MAINTENANCE_DRAFT_BYTES_UNBOUND");
      }
      const prior = this.db.prepare("SELECT input FROM maintenance_draft_replays WHERE failure=?").get(id);
      if (prior) {
        assert.equal(sealOf(JSON.parse(prior.input)), sealOf(input), "MAINTENANCE_DRAFT_INPUT_CHANGED");
        return false;
      }
      const slot = this.slot.current();
      assert(!slot.writer && slot.transition?.phase !== "PREPARED" && sealOf(slot.active) === sealOf(input.release),
        "MAINTENANCE_DRAFT_NOT_QUIESCENT");
      this.db.prepare("INSERT INTO maintenance_draft_replays (failure,input) VALUES (?,?)").run(id, JSON.stringify(input));
      this.slot.record("MAINTENANCE_DRAFT_QUEUED", { id, draft: sealOf(input) });
      return true;
    });
  }

  recordDraft(id, receipt) {
    return this.slot.transaction(() => {
      const row = this.db.prepare("SELECT input,receipt FROM maintenance_draft_replays WHERE failure=?").get(id);
      const input = row && JSON.parse(row.input);
      assert(input && receipt.facts.case === id && receipt.facts.draft === sealOf(input) &&
        receipt.facts.basis === input.release.candidate && receipt.facts.paidRequests === 0 && receipt.seal === sealOf(receipt.facts),
        "MAINTENANCE_DRAFT_REPLAY_UNBOUND");
      if (row.receipt) {
        assert.equal(sealOf(JSON.parse(row.receipt)), sealOf(receipt), "MAINTENANCE_DRAFT_RECEIPT_CHANGED");
        return false;
      }
      this.db.prepare("UPDATE maintenance_draft_replays SET receipt=? WHERE failure=?").run(JSON.stringify(receipt), id);
      this.slot.record("MAINTENANCE_DRAFT_REPLAYED", { id, receipt: receipt.seal });
      return true;
    });
  }

  handoffDraft(id, work) {
    return this.slot.transaction(() => {
      const row = this.db.prepare("SELECT input,receipt,work FROM maintenance_draft_replays WHERE failure=?").get(id);
      const input = row && JSON.parse(row.input), receipt = row?.receipt && JSON.parse(row.receipt);
      assert(receipt && work.origin.case === id && work.origin.draft === sealOf(input) && work.origin.replay === receipt.seal &&
        work.origin.archive === input.archive && work.origin.attempt === input.attempt && work.origin.investigation === input.investigation &&
        work.contract === input.contract && sealOf(work.release) === sealOf(input.release) &&
        work.state === (receipt.facts.refusal ? "REVIEW_REQUIRED" : "WAITING_FOR_ADMISSION"),
      "MAINTENANCE_DRAFT_HANDOFF_UNBOUND");
      if (row.work) {
        assert.equal(sealOf(JSON.parse(row.work)), sealOf(work), "MAINTENANCE_DRAFT_HANDOFF_CHANGED");
        return false;
      }
      this.db.prepare("UPDATE maintenance_draft_replays SET work=? WHERE failure=?").run(JSON.stringify(work), id);
      this.slot.record("MAINTENANCE_DRAFT_CONTINUATION_READY", { id, work: work.id });
      return true;
    });
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
