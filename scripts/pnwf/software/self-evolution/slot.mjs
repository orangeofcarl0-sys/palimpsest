/** Host-owned durable inbox and active installation for one maintenance project. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { buildCampaignWakeActivationSignal } from "../../../../dist/src/monitor/index.js";
import { digest, sha } from "../../energy/contract.mjs";
import { failureKey, replayFailures } from "./replay-verdict.mjs";

const json = value => JSON.stringify(value);
const hex = value => typeof value === "string" && /^[0-9a-f]{64}$/u.test(value);
const now = () => new Date().toISOString();

function identity(release) {
  assert(sha(release?.candidate) && hex(release.buildSha256) && typeof release.image === "string", "INVALID_RELEASE_IDENTITY");
  return { candidate: release.candidate, buildSha256: release.buildSha256, image: release.image };
}

export class MaintenanceSlot {
  constructor(path, { projectId, mode, initial } = {}) {
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA busy_timeout=3000;
      CREATE TABLE IF NOT EXISTS slot (id INTEGER PRIMARY KEY CHECK(id=1), project TEXT NOT NULL, mode TEXT NOT NULL,
        active TEXT NOT NULL, transition TEXT, writer TEXT, blocked TEXT);
      CREATE TABLE IF NOT EXISTS inbox (id TEXT PRIMARY KEY, seal TEXT NOT NULL, status TEXT NOT NULL, result TEXT);
      CREATE TABLE IF NOT EXISTS work (id TEXT PRIMARY KEY REFERENCES inbox(id), signal TEXT NOT NULL,
        input TEXT NOT NULL, digest TEXT NOT NULL, outcome TEXT);
      CREATE TABLE IF NOT EXISTS consumer (id INTEGER PRIMARY KEY CHECK(id=1), pid INTEGER NOT NULL, token TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS resident (id INTEGER PRIMARY KEY CHECK(id=1), pid INTEGER NOT NULL, token TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS session_admission_policy (id INTEGER PRIMARY KEY CHECK(id=1));
      CREATE TABLE IF NOT EXISTS session_admissions (work TEXT PRIMARY KEY REFERENCES inbox(id), receipt TEXT NOT NULL,
        consumed INTEGER NOT NULL DEFAULT 0 CHECK(consumed IN (0,1)));
      CREATE TABLE IF NOT EXISTS events (seq INTEGER PRIMARY KEY, at TEXT NOT NULL, type TEXT NOT NULL, detail TEXT NOT NULL);`);
    try {
      this.transaction(() => {
        if (!this.db.prepare("SELECT 1 FROM slot").get()) {
          assert(typeof projectId === "string" && ["mock", "paid-usage-only"].includes(mode), "SLOT_NOT_INITIALIZED");
          this.db.prepare("INSERT INTO slot (id, project, mode, active) VALUES (1, ?, ?, ?)").run(projectId, mode, json(identity(initial)));
          this.record("INITIAL_INSTALLATION", identity(initial));
        } else if (projectId !== undefined) {
          const slot = this.current();
          assert(slot.project === projectId && slot.mode === mode, "SLOT_SCOPE_DRIFT");
        }
      });
    } catch (error) { this.db.close(); throw error; }
  }

  transaction(action) {
    this.db.exec("BEGIN IMMEDIATE");
    try { const result = action(); this.db.exec("COMMIT"); return result; }
    catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }

  current() {
    const row = this.db.prepare("SELECT * FROM slot WHERE id=1").get();
    return { ...row, active: JSON.parse(row.active), transition: row.transition ? JSON.parse(row.transition) : null };
  }

  record(type, detail) {
    this.db.prepare("INSERT INTO events (at, type, detail) VALUES (?, ?, ?)").run(now(), type, json(detail));
  }

  publish(name, seal) {
    return this.#publish(name, seal);
  }

  enqueueMaintenance(name, seal, { release, checkpoint, parent, rejection, accepted = false, policy }) {
    const installation = identity(release);
    assert(hex(checkpoint) && typeof parent === "string", "MAINTENANCE_CHECKPOINT_REQUIRED");
    if (policy !== undefined) assert(accepted && hex(policy), "INVALID_MAINTENANCE_POLICY");
    const input = { kind: "maintenance-ticket", release: installation, checkpoint, parent,
      ...(rejection === undefined ? {} : { rejection }), ...(accepted ? { accepted: true } : {}),
      ...(policy === undefined ? {} : { policy }) };
    return this.#publish(name, seal, (slot) => {
      assert(!slot.writer && !slot.blocked && slot.transition?.phase === "ACTIVE", "MAINTENANCE_INSTALLATION_NOT_READY");
      assert.deepEqual(slot.active, installation, "MAINTENANCE_INSTALLATION_MOVED");
      const job = this.queued().find(item => item.id === parent);
      if (accepted) {
        assert(job?.status === "DONE" && job.outcome?.state === "AWAIT_OWNER" && job.input.kind === "maintenance-ticket" &&
          slot.transition.approval.release.candidate === installation.candidate, "MAINTENANCE_PARENT_NOT_ACCEPTED");
        assert.deepEqual(job.input.release, slot.transition.approval.predecessor, "MAINTENANCE_PARENT_WRONG_INSTALLATION");
      } else if (rejection === undefined) {
        assert(job?.status === "DONE" && job.outcome?.state === "VERIFIED_ACCEPTED", "MAINTENANCE_PARENT_NOT_VERIFIED");
      } else {
        assert(job?.status === "DONE" && job.outcome?.state === "STOPPED" && job.input.kind === "maintenance-ticket" &&
          job.input.rejection === undefined && hex(rejection), "MAINTENANCE_PARENT_NOT_REJECTED");
        const terminal = JSON.parse(job.result);
        assert(terminal.reconciled && terminal.natural && terminal.usageState === "SETTLED" && terminal.attributionState === "COMPLETE" &&
          terminal.unresolved === 0, "REJECTION_REQUIRES_SETTLEMENT");
      }
      if (!accepted) assert.deepEqual(job.input.release, installation, "MAINTENANCE_PARENT_WRONG_INSTALLATION");
    }, input);
  }

  publishDraft(proof, seal, release) {
    assert(/^campaign-wake-[a-f0-9]{32}$/u.test(proof.signalId) && proof.reason === "REQUEST_LIMIT" &&
      proof.unresolved === 0 && proof.requests > 0 && hex(proof.checkpoint), "INVALID_DRAFT_STOP_PROOF");
    const installation = identity(release);
    assert(installation.candidate === proof.basis && installation.buildSha256 === proof.installation, "DRAFT_INSTALLATION_MISMATCH");
    return this.#publish("resume-" + proof.signalId, seal, (slot, signal) => {
      const predecessor = this.db.prepare("SELECT * FROM inbox WHERE id=?").get(proof.signalId);
      assert(slot.project === proof.projectId && !slot.writer && !slot.blocked && slot.transition === null, "DRAFT_REQUIRES_QUIESCENT_PREDECESSOR");
      assert.deepEqual(slot.active, installation, "DRAFT_ACTIVE_INSTALLATION_MOVED");
      assert(predecessor?.status === "DONE", "DRAFT_PREDECESSOR_NOT_COMPLETED");
      const result = JSON.parse(predecessor.result);
      assert(result.reconciled && !result.natural && result.requests === proof.requests, "DRAFT_PREDECESSOR_STOP_MISMATCH");
      this.record("DRAFT_RESUME_PUBLISHED", { id: signal.signalId, prior: proof.signalId,
        cohort: proof.cohortId, checkpoint: proof.checkpoint, proof: digest(json(proof)) });
    });
  }

  publishRejection(proof, release, input) {
    const legacy = proof.schema === "palimpsest-maintenance-rejection/v1";
    assert((legacy || proof.schema === "palimpsest-maintenance-rejection/v2") && /^campaign-wake-[a-f0-9]{32}$/u.test(proof.signalId) &&
      proof.unresolved === 0 && Number.isSafeInteger(proof.requests) && proof.requests > 0 && sha(proof.candidate) &&
      hex(proof.buildSha256) && hex(proof.checkpoint) && hex(proof.qualification) && Array.isArray(proof.receipts) && proof.receipts.length > 0 &&
      new Set(proof.receipts.map(receipt => `${receipt.arm}:${receipt.condition ?? "clean"}`)).size === proof.receipts.length,
    "INVALID_REJECTION_PROOF");
    for (const { id, ...receipt } of proof.receipts) {
      assert(id === "maintenance-rejection-" + digest(json(receipt)) && receipt.candidate === proof.candidate &&
        receipt.buildSha256 === proof.buildSha256 && receipt.qualification === proof.qualification &&
        ["WITH", "WITHOUT"].includes(receipt.arm) && receipt.observation.arm === receipt.arm &&
        receipt.observation.condition === (legacy ? "clean" : receipt.condition) && Array.isArray(receipt.observation.recorded) &&
        typeof receipt.observation.delivered === "boolean" && Number.isSafeInteger(receipt.observation.requests) &&
        Number.isSafeInteger(receipt.observation.offers),
      "REJECTION_RECEIPT_NOT_BOUND");
      const failures = replayFailures(receipt.observation);
      assert(failures.length > 0, "REJECTION_RECEIPT_HAS_NO_FAILURE");
      if (!legacy) assert.deepEqual(receipt.failures, failures, "REJECTION_FAILURES_CHANGED");
    }
    if (!legacy) assert.equal(proof.failureKey, failureKey(proof.receipts), "REJECTION_FAILURE_KEY_CHANGED");
    const installation = identity(release);
    assert(installation.candidate === proof.basis && installation.buildSha256 === proof.installation &&
      installation.candidate !== proof.candidate, "REJECTION_INSTALLATION_MISMATCH");
    const seal = digest(json(proof));
    return this.#publish("reject-" + proof.signalId, seal, (slot, signal) => {
      assert(slot.project === proof.projectId && !slot.writer && !slot.blocked && slot.transition?.phase !== "PREPARED",
        "REJECTION_REQUIRES_QUIESCENT_PREDECESSOR");
      assert.deepEqual(slot.active, installation, "REJECTION_ACTIVE_INSTALLATION_MOVED");
      const parent = this.db.prepare("SELECT * FROM inbox WHERE id=?").get(proof.signalId);
      assert(parent?.status === "DONE", "REJECTED_RUN_NOT_COMPLETED");
      const result = JSON.parse(parent.result);
      assert(result.reconciled && result.natural && result.requests === proof.requests, "REJECTED_RUN_TERMINAL_MISMATCH");
      this.record("REJECTION_PUBLISHED", { id: signal.signalId, prior: proof.signalId, candidate: proof.candidate,
        buildSha256: proof.buildSha256, receipts: proof.receipts.map(receipt => receipt.id), cohort: proof.cohortId,
        checkpoint: proof.checkpoint, proof: seal });
    }, input);
  }

  publishObservedRejection(proof, release, input) {
    const installation = identity(release);
    const { parent, archive, receipt, checkpoint, cohortId, requests } = proof;
    const binding = receipt?.binding;
    assert(/^campaign-wake-[a-f0-9]{32}$/u.test(parent) && hex(archive) && hex(checkpoint) &&
      typeof cohortId === "string" && Number.isSafeInteger(requests) && requests > 0 &&
      /^handover-[a-f0-9]{64}$/u.test(receipt?.id) && receipt.state === "REPRODUCED" &&
      receipt.firstBreak?.observed === false && binding && sha(binding.basis) && sha(binding.candidate) &&
      binding.basis !== binding.candidate && binding.build === installation.buildSha256 && hex(binding.rejection) &&
      input.kind === "observed-rejection" && input.proof === sealOf(proof), "INVALID_OBSERVED_REJECTION");
    return this.#publish("observed-rejection-" + parent, input.proof, (slot, signal) => {
      assert(slot.project === binding.project && !slot.writer && !slot.blocked && !slot.transition, "OBSERVED_REJECTION_NOT_QUIESCENT");
      assert.deepEqual(slot.active, installation, "OBSERVED_REJECTION_INSTALLATION_MOVED");
      const job = this.db.prepare("SELECT status, seal, result FROM inbox WHERE id=?").get(parent);
      assert(job?.status === "DONE" && job.seal === archive, "OBSERVED_REJECTION_PARENT_MISMATCH");
      const result = JSON.parse(job.result);
      assert(result.reconciled && result.natural && result.usageState === "SETTLED" && result.attributionState === "COMPLETE" &&
        result.unresolved === 0 && result.requests === requests && result.cohortId === cohortId, "OBSERVED_REJECTION_PARENT_UNSETTLED");
      this.record("REJECTION_PUBLISHED", { id: signal.signalId, prior: parent, candidate: binding.candidate,
        buildSha256: binding.build, receipt: receipt.id, checkpoint, proof: input.proof });
    }, input);
  }

  importSettledReview(signal, release, result, input, outcome = null) {
    assert(input.kind === "archived-review" && hex(input.proof) && hex(signal.reconciliationDigest) &&
      /^campaign-wake-[a-f0-9]{32}$/u.test(signal.signalId) && result.reconciled && result.natural &&
      result.usageState === "SETTLED" && result.attributionState === "COMPLETE" && result.unresolved === 0 &&
      Number.isSafeInteger(result.requests) && result.requests > 0, "ARCHIVED_REVIEW_REQUIRES_SETTLEMENT_AND_ATTRIBUTION");
    assert(outcome === null || (outcome.state === "REJECTED" && hex(outcome.failureKey)), "ARCHIVED_REVIEW_REQUIRES_REJECTION_HISTORY");
    return this.transaction(() => {
      const slot = this.current(), id = signal.signalId;
      assert(signal.projectId === slot.project && !slot.writer && !slot.blocked && !slot.transition, "ARCHIVED_REVIEW_WRITER_NOT_QUIESCENT");
      assert.deepEqual(slot.active, identity(release), "ARCHIVED_REVIEW_INSTALLATION_MOVED");
      this.db.prepare("INSERT INTO inbox (id, seal, status, result) VALUES (?, ?, 'DONE', ?)").run(id, signal.reconciliationDigest, json(result));
      this.db.prepare("INSERT INTO work (id, signal, input, digest, outcome) VALUES (?, ?, ?, ?, ?)")
        .run(id, json(signal), json(input), digest(json(input)), outcome && json(outcome));
      this.record("ARCHIVED_REVIEW_IMPORTED", { id, proof: input.proof, ...result });
      if (outcome) this.record("WORK_REVIEWED", { id, outcome });
    });
  }

  publishArchivedDraft(proof, release, directory) {
    const { stop } = proof;
    const installation = identity(release);
    assert(Array.isArray(stop.unknown), "INVALID_ARCHIVED_DRAFT");
    const unknown = stop.kind === undefined && Number.isSafeInteger(stop.unresolved) && stop.unresolved > 0 && stop.unknown.length === stop.unresolved;
    const wallClock = stop.kind === "wall-clock" && stop.reason === "wall_clock" && stop.usageState === "SETTLED" &&
      stop.attributionState === "INCOMPLETE" && stop.unresolved === 0 && stop.unknown.length === 0 && hex(stop.traceSha256) &&
      Number.isSafeInteger(stop.requests) && stop.requests > 1 && stop.modelSteps === stop.requests - 1 &&
      stop.missingStep?.ordinal === stop.requests && typeof stop.missingStep.requestId === "string" &&
      typeof stop.missingStep.responseId === "string" && stop.missingStep.responseId.length > 0;
    assert(proof.kind === "stopped-draft" && sha(proof.head) && hex(proof.checkpoint) && hex(proof.tracked) &&
      hex(proof.untrackedArchive) && hex(stop.ledgerSha256) && (unknown || wallClock) &&
      /^campaign-wake-[a-f0-9]{32}$/u.test(stop.signalId) && typeof directory === "string",
      "INVALID_ARCHIVED_DRAFT");
    assert(installation.candidate === proof.basis && installation.buildSha256 === proof.installation, "DRAFT_INSTALLATION_MISMATCH");
    const seal = sealOf(proof);
    return this.#publish("archived-draft-" + stop.signalId, seal, (slot, signal) => {
      assert(slot.project === proof.projectId && !slot.writer && !slot.blocked && slot.transition === null,
        "DRAFT_REQUIRES_QUIESCENT_PREDECESSOR");
      assert.deepEqual(slot.active, installation, "DRAFT_ACTIVE_INSTALLATION_MOVED");
      assert(!this.db.prepare("SELECT 1 FROM inbox WHERE id=?").get(stop.signalId), "DRAFT_REQUIRES_NEW_ACCOUNTING_SCOPE");
      this.record("ARCHIVED_DRAFT_PUBLISHED", { id: signal.signalId, prior: stop.signalId, candidate: proof.head,
        cohort: stop.cohort, checkpoint: proof.checkpoint, proof: seal });
    }, { kind: "draft", directory, proof: seal });
  }

  #publish(name, seal, validate, input) {
    assert(/^[\w-]+$/u.test(name) && hex(seal), "INVALID_EVIDENCE_SEAL");
    return this.transaction(() => this.#insert(name, seal, validate, input));
  }

  #insert(name, seal, validate, input) {
      const slot = this.current();
      const { project } = slot;
      const signal = buildCampaignWakeActivationSignal({ projectId: project, campaignId: `${project}-maintenance`,
        wakeCycleId: name, cause: { kind: "manual", signalId: name }, phase: "RECONCILIATION_READY",
        reconciliationDigest: seal, detail: "A sealed project run is ready to read.", createdAt: now() });
      const existing = this.db.prepare("SELECT seal FROM inbox WHERE id=?").get(signal.signalId);
      if (existing) {
        assert.equal(existing.seal, seal, "EVIDENCE_CHANGED_ON_REPLAY");
        if (input) assert.equal(this.db.prepare("SELECT digest FROM work WHERE id=?").get(signal.signalId)?.digest,
          digest(json(input)), "WORK_INPUT_CHANGED_ON_REPLAY");
        return { signal, inserted: false };
      }
      validate?.(slot, signal);
      this.db.prepare("INSERT INTO inbox (id, seal, status) VALUES (?, ?, 'PENDING')").run(signal.signalId, seal);
      if (input) this.db.prepare("INSERT INTO work (id, signal, input, digest) VALUES (?, ?, ?, ?)")
        .run(signal.signalId, json(signal), json(input), digest(json(input)));
      this.record("EVIDENCE_READY", signal);
      return { signal, inserted: true };
  }

  queued() {
    return this.db.prepare("SELECT inbox.rowid AS sequence, inbox.*, work.signal, work.input, work.digest, work.outcome FROM work JOIN inbox USING(id) ORDER BY inbox.rowid")
      .all().map(row => {
        assert.equal(digest(row.input), row.digest, "QUEUED_INPUT_CHANGED");
        const signal = JSON.parse(row.signal);
        assert(signal.signalId === row.id && signal.reconciliationDigest === row.seal && signal.projectId === this.current().project,
          "QUEUED_SIGNAL_CHANGED");
        return { ...row, signal, input: JSON.parse(row.input), outcome: row.outcome && JSON.parse(row.outcome) };
      });
  }

  claimConsumer() {
    return this.#claimProcess("consumer");
  }

  claimResident() {
    return this.#claimProcess("resident");
  }

  #claimProcess(table) {
    return this.transaction(() => {
      const prior = this.db.prepare("SELECT pid FROM " + table + " WHERE id=1").get();
      if (prior) {
        try { process.kill(prior.pid, 0); }
        catch (error) { if (error.code !== "ESRCH") throw error; this.db.exec("DELETE FROM " + table); }
      }
      assert(!this.db.prepare("SELECT 1 FROM " + table).get(), "QUEUE_" + table.toUpperCase() + "_ACTIVE");
      const token = randomUUID();
      this.db.prepare("INSERT INTO " + table + " (id,pid,token) VALUES (1,?,?)").run(process.pid, token);
      return token;
    });
  }

  releaseConsumer(token) {
    assert.equal(this.db.prepare("DELETE FROM consumer WHERE id=1 AND token=?").run(token).changes, 1, "QUEUE_CONSUMER_MOVED");
  }

  releaseResident(token) {
    assert.equal(this.db.prepare("DELETE FROM resident WHERE id=1 AND token=?").run(token).changes, 1, "QUEUE_RESIDENT_MOVED");
  }

  completeWork(id, outcome) {
    this.transaction(() => {
      const job = this.db.prepare("SELECT status, outcome FROM inbox JOIN work USING(id) WHERE id=?").get(id);
      assert(job && ["DONE", "STOPPED"].includes(job.status), "WORK_NOT_TERMINAL");
      if (job.outcome) return assert.equal(job.outcome, json(outcome), "WORK_OUTCOME_CHANGED");
      if (outcome.state === "PAUSED") {
        const previous = this.db.prepare("SELECT outcome FROM work WHERE id=? AND id<>?").get(outcome.previous, id);
        const observed = JSON.parse(previous?.outcome ?? "null");
        assert(job.status === "DONE" && !this.current().writer && !this.current().blocked && outcome.reason === "REPEATED_REJECTION" &&
          hex(outcome.failureKey) && observed?.state === "REJECTED" && observed.failureKey === outcome.failureKey, "REVIEW_PAUSE_REQUIRES_REPEATED_FAILURE");
        this.db.prepare("UPDATE slot SET blocked=? WHERE id=1").run(outcome.reason);
      }
      this.db.prepare("UPDATE work SET outcome=? WHERE id=?").run(json(outcome), id);
      this.record("WORK_REVIEWED", { id, outcome });
    });
  }

  recordIndependentRecheck(id, original, outcome) {
    assert(original?.state === "STOPPED" && outcome?.state === "AWAIT_OWNER" && sha(outcome.candidate) &&
      hex(outcome.buildSha256) && hex(outcome.review), "INVALID_INDEPENDENT_RECHECK");
    return this.transaction(() => {
      const slot = this.current();
      assert(!slot.writer && !slot.blocked && !slot.transition, "INDEPENDENT_RECHECK_REQUIRES_QUIESCENT_SLOT");
      const job = this.db.prepare("SELECT status, outcome, input FROM inbox JOIN work USING(id) WHERE id=?").get(id);
      assert(job?.status === "DONE" && JSON.parse(job.input).kind === "observed-rejection", "INDEPENDENT_RECHECK_REQUIRES_SETTLED_REVIEW");
      if (job.outcome === json(outcome)) return false;
      assert.equal(job.outcome, json(original), "ORIGINAL_REVIEW_CHANGED");
      this.db.prepare("UPDATE work SET outcome=? WHERE id=?").run(json(outcome), id);
      this.record("WORK_INDEPENDENTLY_RECHECKED", { id, original, outcome });
      return true;
    });
  }

  recordMaintenanceRecheck(id, original, receipt) {
    assert(original?.state === "STOPPED" && hex(original.review) && hex(receipt), "INVALID_MAINTENANCE_RECHECK");
    return this.transaction(() => {
      const { writer, blocked } = this.current();
      const job = this.db.prepare("SELECT status, input, outcome FROM inbox JOIN work USING(id) WHERE id=?").get(id);
      assert(!writer && !blocked && job?.status === "DONE" && JSON.parse(job.input).kind === "maintenance-selection",
        "MAINTENANCE_RECHECK_REQUIRES_SETTLED_SELECTION");
      assert.equal(job.outcome, json(original), "ORIGINAL_REVIEW_CHANGED");
      const detail = { id, original, receipt };
      const prior = this.db.prepare("SELECT detail FROM events WHERE type='MAINTENANCE_RECHECKED' AND json_extract(detail, '$.id')=?").get(id);
      if (prior) {
        assert.deepEqual(JSON.parse(prior.detail), detail, "MAINTENANCE_RECHECK_CHANGED");
        return false;
      }
      this.record("MAINTENANCE_RECHECKED", detail);
      return true;
    });
  }

  recordRepairRecheck(id, original, outcome) {
    assert(original?.state === "STOPPED" && outcome?.state === "AWAIT_OWNER" && hex(original.review) && hex(outcome.review),
      "INVALID_REPAIR_RECHECK");
    return this.transaction(() => {
      const slot = this.current();
      const job = this.queued().find(item => item.id === id);
      assert(job?.input.kind === "maintenance-repair" && job.status === "DONE" && !slot.writer && !slot.blocked,
        "REPAIR_RECHECK_REQUIRES_SETTLEMENT");
      assert.deepEqual(slot.active, job.input.release, "REPAIR_RECHECK_INSTALLATION_MOVED");
      const terminal = JSON.parse(job.result);
      assert(terminal.reconciled && terminal.natural && terminal.usageState === "SETTLED" && terminal.attributionState === "COMPLETE" &&
        terminal.unresolved === 0, "REPAIR_RECHECK_USAGE_NOT_CONFIRMED");
      const detail = { id, original, outcome };
      if (job.outcome?.review === outcome.review) {
        const prior = this.db.prepare("SELECT detail FROM events WHERE type='REPAIR_RECHECKED' AND json_extract(detail, '$.id')=?").get(id);
        assert.deepEqual(JSON.parse(prior?.detail ?? "null"), detail);
        return false;
      }
      assert.deepEqual(job.outcome, original, "ORIGINAL_REPAIR_REVIEW_CHANGED");
      this.db.prepare("UPDATE work SET outcome=? WHERE id=?").run(json(outcome), id);
      this.record("REPAIR_RECHECKED", detail);
      return true;
    });
  }

  enqueueMaintenanceQualification(id, candidate, review) {
    assert(sha(candidate) && hex(review), "INVALID_MAINTENANCE_QUALIFICATION");
    return this.transaction(() => {
      const slot = this.current();
      const parent = this.queued().find(job => job.id === id);
      assert(parent?.input.kind === "maintenance-selection" && parent.status === "DONE" &&
        parent.outcome, "QUALIFICATION_REQUIRES_SETTLED_SELECTION");
      const terminal = JSON.parse(parent.result);
      assert(terminal.reconciled && terminal.natural && terminal.usageState === "SETTLED" &&
        terminal.attributionState === "COMPLETE" && terminal.unresolved === 0 && hex(terminal.reviewInput),
      "QUALIFICATION_SETTLEMENT_UNCONFIRMED");
      const recheck = this.db.prepare("SELECT detail FROM events WHERE type='MAINTENANCE_RECHECKED' AND json_extract(detail, '$.id')=?").get(id);
      const rechecked = recheck && JSON.parse(recheck.detail);
      const recorded = rechecked ? rechecked.receipt : parent.outcome.review;
      assert((rechecked || parent.outcome.state === "DELIVERED_NEXT") && review === recorded, "QUALIFICATION_REVIEW_MISMATCH");
      const input = { kind: "maintenance-release-review", parent: id, release: parent.input.release,
        candidate, review, settlement: terminal.reviewInput };
      return this.#insert("qualify-" + id, digest(json(input)), () => {
        assert(!slot.writer && !slot.blocked && slot.transition?.phase === "ACTIVE", "QUALIFICATION_SLOT_UNAVAILABLE");
        assert.deepEqual(slot.active, input.release, "QUALIFICATION_INSTALLATION_MOVED");
        assert(candidate !== slot.active.candidate, "QUALIFICATION_REQUIRES_NEW_CANDIDATE");
      }, input);
    });
  }

  completeMaintenanceQualification(id, receipt) {
    assert(["NO_RELEASE", "REWORK_REQUIRED", "QUALIFIED"].includes(receipt?.state) && hex(receipt.digest),
      "INVALID_QUALIFICATION_RECEIPT");
    return this.transaction(() => {
      const slot = this.current();
      const job = this.queued().find(item => item.id === id);
      assert(job?.input.kind === "maintenance-release-review", "UNKNOWN_QUALIFICATION_JOB");
      if (job.outcome) {
        assert.deepEqual(job.outcome, receipt, "QUALIFICATION_OUTCOME_CHANGED");
        return false;
      }
      assert(job.status === "PENDING" && !slot.writer && !slot.blocked && slot.transition?.phase === "ACTIVE",
        "QUALIFICATION_SLOT_UNAVAILABLE");
      assert.deepEqual(slot.active, job.input.release, "QUALIFICATION_INSTALLATION_MOVED");
      this.db.prepare("UPDATE inbox SET status='DONE' WHERE id=?").run(id);
      this.db.prepare("UPDATE work SET outcome=? WHERE id=?").run(json(receipt), id);
      this.record("MAINTENANCE_RELEASE_REVIEWED", { id, parent: job.input.parent, ...receipt });
      if (receipt.state !== "NO_RELEASE") {
        const kind = receipt.state === "QUALIFIED" ? "maintenance-promotion" : "maintenance-repair";
        const next = { ...job.input, kind, qualification: id, receipt: receipt.digest };
        this.#insert(kind + "-" + id, digest(json(next)), null, next);
      }
      return true;
    });
  }

  promotionDelivery(id) {
    const jobs = this.queued(), job = jobs.find(item => item.id === id);
    assert(job?.input.kind === "maintenance-promotion", "UNKNOWN_MAINTENANCE_PROMOTION");
    const { kind, qualification, receipt, ...binding } = job.input;
    const review = jobs.find(item => item.id === qualification), parent = jobs.find(item => item.id === binding.parent);
    assert(review?.status === "DONE" && parent?.status === "DONE" && parent.input.kind === "maintenance-selection",
      "PROMOTION_REQUIRES_SETTLED_DELIVERY_AND_RELEASE_REVIEW");
    assert.deepEqual(review.input, { kind: "maintenance-release-review", ...binding }, "PROMOTION_RELEASE_BINDING_CHANGED");
    assert.deepEqual(review.outcome, { state: "QUALIFIED", digest: receipt }, "PROMOTION_RELEASE_REVIEW_CHANGED");
    assert.deepEqual(parent.input.release, binding.release, "PROMOTION_DELIVERY_BASIS_CHANGED");
    const recheck = this.db.prepare("SELECT detail FROM events WHERE type='MAINTENANCE_RECHECKED' AND json_extract(detail, '$.id')=?")
      .get(parent.id);
    assert(recheck ? JSON.parse(recheck.detail).receipt === binding.review :
      parent.outcome?.state === "DELIVERED_NEXT" && parent.outcome.review === binding.review, "PROMOTION_DELIVERY_REVIEW_CHANGED");
    const usage = JSON.parse(parent.result);
    assert(usage?.reconciled && usage.natural && usage.usageState === "SETTLED" && usage.attributionState === "COMPLETE" &&
      usage.unresolved === 0 && usage.reviewInput === binding.settlement, "PROMOTION_REQUIRES_EXACT_SETTLEMENT");
    return { job, parent, usage };
  }

  claimPromotion(id) {
    return this.transaction(() => {
      const { job } = this.promotionDelivery(id);
      if (job.status === "DONE") return false;
      const { active, blocked, writer, transition } = this.current();
      assert(!blocked && !writer && transition?.phase === "ACTIVE", "PROMOTION_REQUIRES_QUIESCENT_INSTALLATION");
      assert.deepEqual(active, job.input.release, "PROMOTION_PREDECESSOR_MOVED");
      if (job.status === "RUNNING") return false;
      assert.equal(job.status, "PENDING");
      this.db.prepare("UPDATE inbox SET status='RUNNING' WHERE id=?").run(id);
      this.record("MAINTENANCE_PROMOTION_STARTED", { id, candidate: job.input.candidate, settlement: job.input.settlement });
      return true;
    });
  }

  completePromotion(id, outcome) {
    assert(["AWAIT_OWNER", "STOPPED"].includes(outcome?.state) && hex(outcome.review), "INVALID_PROMOTION_REVIEW");
    return this.transaction(() => {
      const { job, usage } = this.promotionDelivery(id);
      if (job.status === "DONE") {
        assert.deepEqual(job.outcome, outcome, "PROMOTION_REVIEW_CHANGED");
        assert.deepEqual(JSON.parse(job.result), usage);
        return false;
      }
      const { active, blocked, writer, transition } = this.current();
      assert(job.status === "RUNNING" && !blocked && !writer && transition?.phase === "ACTIVE", "PROMOTION_NOT_UNDER_REVIEW");
      assert.deepEqual(active, job.input.release, "PROMOTION_PREDECESSOR_MOVED");
      this.db.prepare("UPDATE inbox SET status='DONE', result=? WHERE id=?").run(json(usage), id);
      this.db.prepare("UPDATE work SET outcome=? WHERE id=?").run(json(outcome), id);
      this.record("MAINTENANCE_PROMOTION_REVIEWED", { id, candidate: job.input.candidate, outcome });
      return true;
    });
  }

  recordSuccessorQualification(id, proposal, checkpoint) {
    return this.transaction(() => {
      const slot = this.current();
      const previous = identity(proposal.predecessor), release = identity(proposal.release);
      assert(!slot.writer && !slot.blocked && slot.transition?.phase === "ACTIVE", "SUCCESSOR_QUALIFICATION_REQUIRES_QUIESCENT_INSTALLATION");
      assert.deepEqual(slot.active, previous, "SUCCESSOR_QUALIFICATION_PREDECESSOR_MOVED");
      assert(proposal.mode === slot.mode && previous.candidate !== release.candidate && previous.buildSha256 !== release.buildSha256 &&
        previous.image === release.image && hex(checkpoint) && hex(proposal.qualification), "INVALID_SUCCESSOR_QUALIFICATION");
      const job = this.db.prepare("SELECT status, outcome, result, input FROM inbox JOIN work USING(id) WHERE id=?").get(id);
      assert(job?.status === "DONE" && JSON.parse(job.outcome ?? "null")?.state === "DELIVERED_NEXT", "SUCCESSOR_QUALIFICATION_REQUIRES_DELIVERY");
      const input = JSON.parse(job.input), terminal = JSON.parse(job.result);
      assert(input.kind === "handover-successor" && terminal.reconciled && terminal.natural && terminal.usageState === "SETTLED" &&
        terminal.attributionState === "COMPLETE" && terminal.unresolved === 0, "SUCCESSOR_QUALIFICATION_REQUIRES_SETTLED_SESSION");
      assert.deepEqual(identity(input.release), previous, "SUCCESSOR_QUALIFICATION_DELIVERY_INSTALLATION_MISMATCH");
      const detail = { id, proposal, checkpoint };
      const prior = this.db.prepare("SELECT detail FROM events WHERE type='SUCCESSOR_QUALIFIED' AND json_extract(detail, '$.id')=?").get(id);
      if (prior) {
        assert.deepEqual(JSON.parse(prior.detail), detail, "SUCCESSOR_QUALIFICATION_CHANGED");
        return false;
      }
      this.record("SUCCESSOR_QUALIFIED", detail);
      return true;
    });
  }

  enableSessionAdmission() {
    this.db.prepare("INSERT OR IGNORE INTO session_admission_policy (id) VALUES (1)").run();
  }

  requiresSessionAdmission(id) {
    const kind = this.db.prepare("SELECT json_extract(input,'$.kind') AS kind FROM work WHERE id=?").get(id)?.kind;
    return kind === "github-maintenance" || (kind === "maintenance-selection" &&
      Boolean(this.db.prepare("SELECT 1 FROM session_admission_policy WHERE id=1").get()));
  }


  enqueueGitHubSession(name, seal, { release, checkpoint, requestWindow, work }) {
    const installation = identity(release);
    assert(hex(checkpoint) && requestWindow && typeof work === "string", "GITHUB_SESSION_CONTRACT_MISSING");
    const input = { kind: "github-maintenance", release: installation, checkpoint, requestWindow, work };
    return this.#publish(name, seal, slot => {
      assert(!slot.writer && !slot.blocked && slot.transition?.phase !== "PREPARED", "GITHUB_SESSION_SLOT_UNAVAILABLE");
      assert.deepEqual(slot.active, installation, "GITHUB_SESSION_INSTALLATION_MOVED");
    }, input);
  }

  recoverGitHubSettlement(id, result) {
    assert(result.reconciled && result.usageState === "SETTLED" && result.attributionState === "COMPLETE" &&
      result.unresolved === 0 && Number.isSafeInteger(result.requests) && result.requests > 0 && hex(result.archive),
    "GITHUB_SESSION_RECOVERY_NEEDS_SEALED_SETTLEMENT");
    return this.transaction(() => {
      const slot = this.current(), job = this.queued().find(row => row.id === id);
      assert(job?.input.kind === "github-maintenance", "GITHUB_SESSION_RECOVERY_WRONG_WORK");
      if (job.status === "DONE") {
        assert.deepEqual(JSON.parse(job.result), result, "GITHUB_SESSION_SETTLEMENT_DRIFT");
        return false;
      }
      const dispatched = this.db.prepare("SELECT detail FROM events WHERE type='WAKE_DISPATCHED' ORDER BY seq DESC LIMIT 1").get();
      assert(job.status === "RUNNING" && slot.writer && !slot.blocked && JSON.parse(dispatched.detail).id === id,
        "GITHUB_SESSION_RECOVERY_WRONG_WRITER");
      assert.deepEqual(slot.active, job.input.release, "GITHUB_SESSION_RECOVERY_WRONG_INSTALLATION");
      this.db.prepare("UPDATE inbox SET status='DONE', result=? WHERE id=?").run(json(result), id);
      this.db.prepare("UPDATE slot SET writer=NULL WHERE id=1").run();
      this.record("WAKE_COMPLETED", { id, ...result });
      return true;
    });
  }


  sessionAdmissionRequest(id) {
    const slot = this.current(), job = this.queued().find(item => item.id === id);
    assert(["maintenance-selection", "github-maintenance"].includes(job?.input.kind), "SESSION_ADMISSION_REQUIRES_SELECTION");
    assert.deepEqual(job.input.release, slot.active, "SESSION_ADMISSION_INSTALLATION_MOVED");
    assert(hex(job.input.checkpoint) && job.input.requestWindow, "SESSION_ADMISSION_CONTRACT_MISSING");
    return { project: slot.project, mode: slot.mode, work: id, release: slot.active,
      seal: job.seal, checkpoint: job.input.checkpoint, requestWindow: job.input.requestWindow };
  }

  sessionAdmission(id) {
    const saved = this.db.prepare("SELECT receipt, consumed FROM session_admissions WHERE work=?").get(id);
    return saved ? { receipt: JSON.parse(saved.receipt), consumed: Boolean(saved.consumed) } : null;
  }

  authorizeSession(request, { actor, reason }) {
    assert(typeof actor === "string" && actor.trim() && typeof reason === "string" && reason.trim(), "SESSION_ADMISSION_AUTHORITY_REQUIRED");
    return this.transaction(() => {
      assert(this.requiresSessionAdmission(request.work), "SESSION_ADMISSION_POLICY_REQUIRED");
      assert.deepEqual(request, this.sessionAdmissionRequest(request.work), "SESSION_ADMISSION_REQUEST_CHANGED");
      const decision = { request, actor: actor.trim(), reason: reason.trim() };
      const prior = this.sessionAdmission(request.work);
      if (prior) {
        assert.deepEqual(prior.receipt.decision, decision, "SESSION_ADMISSION_ALREADY_RECORDED");
        return prior.receipt;
      }
      const status = this.db.prepare("SELECT status FROM inbox WHERE id=?").get(request.work).status;
      const slot = this.current();
      assert(status === "PENDING" && !slot.blocked && !slot.writer && slot.transition?.phase !== "PREPARED",
        "SESSION_ADMISSION_REQUIRES_QUIESCENT_PENDING_WORK");
      const receipt = { id: sealOf(decision), decision };
      this.db.prepare("INSERT INTO session_admissions (work,receipt) VALUES (?,?)").run(request.work, json(receipt));
      this.record("SESSION_AUTHORIZED", { id: request.work, admission: receipt.id, decision });
      return receipt;
    });
  }

  async dispatch(signal, release, run) {
    const id = signal.signalId;
    const token = this.transaction(() => {
      const slot = this.current();
      const job = this.db.prepare("SELECT * FROM inbox WHERE id=?").get(id);
      assert(job && signal.projectId === slot.project && job.seal === signal.reconciliationDigest, "WAKE_NOT_BOUND_TO_SEALED_EVIDENCE");
      if (job.status !== "PENDING") return null;
      assert(!slot.writer && !slot.blocked && slot.transition?.phase !== "PREPARED", "MAINTENANCE_WRITER_BUSY_OR_STOPPED");
      assert.deepEqual(identity(release), slot.active, "WRONG_ACTIVE_INSTALLATION");
      let admission;
      if (this.requiresSessionAdmission(id)) {
        const saved = this.sessionAdmission(id);
        assert(saved && !saved.consumed, "SESSION_AUTHORIZATION_REQUIRED");
        assert.deepEqual(saved.receipt.decision.request, this.sessionAdmissionRequest(id), "SESSION_ADMISSION_REQUEST_CHANGED");
        assert.equal(saved.receipt.id, sealOf(saved.receipt.decision), "SESSION_ADMISSION_RECEIPT_CHANGED");
        this.db.prepare("UPDATE session_admissions SET consumed=1 WHERE work=?").run(id);
        admission = saved.receipt.id;
      }
      const lease = randomUUID();
      this.db.prepare("UPDATE slot SET writer=? WHERE id=1").run(lease);
      this.db.prepare("UPDATE inbox SET status='RUNNING' WHERE id=?").run(id);
      this.record("WAKE_DISPATCHED", { id, seal: job.seal, installation: slot.active, ...(admission ? { admission } : {}) });
      return lease;
    });
    if (!token) return null;
    const finish = (status, result, blocker) => this.transaction(() => {
      assert.equal(this.current().writer, token, "WRITER_LEASE_MISMATCH");
      this.db.prepare("UPDATE inbox SET status=?, result=? WHERE id=?").run(status, json(result), id);
      this.db.prepare("UPDATE slot SET writer=NULL, blocked=? WHERE id=1").run(blocker);
      this.record(status === "DONE" ? "WAKE_COMPLETED" : "WAKE_STOPPED", { id, ...result });
    });
    let result;
    try { result = await run(); }
    catch (error) { finish("STOPPED", { error: error.message }, "WRITER_EXIT_OR_USAGE_UNCONFIRMED"); throw error; }
    const blocker = result.usageState === "SETTLED" && result.attributionState === "INCOMPLETE"
      ? "ATTRIBUTION_INCOMPLETE" : "USAGE_UNCONFIRMED";
    finish(result.reconciled ? "DONE" : "STOPPED", result, result.reconciled ? null : blocker);
    return result;
  }

  stopInterrupted(signal, release, observation) {
    const { requests, unresolved, digest: proof } = observation;
    assert(Number.isSafeInteger(requests) && Number.isSafeInteger(unresolved) && unresolved > 0 &&
      unresolved <= requests && hex(proof), "INTERRUPTED_USAGE_OBSERVATION_REQUIRED");
    return this.transaction(() => {
      const slot = this.current();
      const job = this.db.prepare("SELECT * FROM inbox WHERE id=?").get(signal.signalId);
      assert(job?.seal === signal.reconciliationDigest && signal.projectId === slot.project, "INTERRUPTED_WAKE_NOT_BOUND");
      assert.deepEqual(slot.active, identity(release), "INTERRUPTED_INSTALLATION_MOVED");
      const result = { reconciled: false, natural: false, requests, unresolved, source: "OFFLINE_STOP_OBSERVATION", proof };
      if (job.status === "STOPPED") {
        assert.deepEqual(JSON.parse(job.result), result, "INTERRUPTED_OBSERVATION_CHANGED");
        return false;
      }
      const dispatched = this.db.prepare("SELECT detail FROM events WHERE type='WAKE_DISPATCHED' ORDER BY seq DESC LIMIT 1").get();
      assert(job.status === "RUNNING" && slot.writer && !slot.blocked && JSON.parse(dispatched.detail).id === signal.signalId,
        "INTERRUPTED_WRITER_NOT_CURRENT");
      this.db.prepare("UPDATE inbox SET status='STOPPED', result=? WHERE id=?").run(json(result), signal.signalId);
      this.db.prepare("UPDATE slot SET writer=NULL, blocked='USAGE_UNCONFIRMED' WHERE id=1").run();
      this.record("WAKE_STOPPED", { id: signal.signalId, ...result });
      return true;
    });
  }

  prepare({ predecessor, release, qualification, approval, checkpoint, authorization }) {
    return this.transaction(() => {
      const slot = this.current();
      const next = identity(release);
      const prior = identity(predecessor);
      const expected = { mode: slot.mode, predecessor: prior, release: next, qualification };
      assert(hex(qualification) && hex(checkpoint) && next.buildSha256 !== prior.buildSha256 && next.candidate !== prior.candidate,
        "INVALID_SWITCH_INPUT");
      assert.deepEqual(approval, expected, "APPROVAL_DOES_NOT_MATCH_QUALIFIED_INSTALLATION");
      if (authorization !== undefined) assert(hex(authorization), "INVALID_SWITCH_AUTHORIZATION");
      if (json(slot.active) === json(next) && slot.transition?.phase === "ACTIVE") {
        assert.deepEqual(slot.transition.approval, approval, "ACTIVE_APPROVAL_DRIFT");
        if (authorization !== undefined) assert.equal(slot.transition.authorization, authorization, "ACTIVE_AUTHORIZATION_DRIFT");
        return false;
      }
      if (slot.transition?.phase === "PREPARED" && authorization !== undefined) {
        assert(!slot.writer && !slot.blocked, "SWITCH_WRITER_ACTIVE");
        assert.deepEqual(slot.transition.approval, approval, "PREPARED_APPROVAL_DRIFT");
        assert.equal(slot.transition.authorization, authorization, "PREPARED_AUTHORIZATION_DRIFT");
        assert.equal(slot.transition.checkpoint, checkpoint, "PREPARED_CHECKPOINT_DRIFT");
        return slot.transition.id;
      }
      assert(!slot.writer && !slot.blocked && slot.transition?.phase !== "PREPARED", "SWITCH_REQUIRES_QUIESCENT_WRITER");
      assert.deepEqual(slot.active, prior, "ACTIVE_PREDECESSOR_MOVED");
      const transition = { id: randomUUID(), phase: "PREPARED", approval, checkpoint, preparedAt: now(),
        ...(authorization === undefined ? {} : { authorization }) };
      this.db.prepare("UPDATE slot SET transition=? WHERE id=1").run(json(transition));
      this.record("SWITCH_PREPARED", transition);
      return transition.id;
    });
  }

  activate({ switchId, observedRelease, checkpoint, readback, next }) {
    return this.transaction(() => {
      const { transition, writer } = this.current();
      assert(transition?.phase === "PREPARED" && transition.id === switchId && !writer && readback === true, "SWITCH_NOT_READY");
      assert.deepEqual(identity(observedRelease), transition.approval.release, "WRONG_LOADED_BUILD");
      assert.equal(checkpoint, transition.checkpoint, "CHECKPOINT_DRIFT");
      const active = { ...transition, phase: "ACTIVE", activatedAt: now() };
      this.db.prepare("UPDATE slot SET active=?, transition=? WHERE id=1").run(json(active.approval.release), json(active));
      this.record("INSTALLATION_ACTIVATED", active);
      if (next) this.#insert(next.name, next.seal, undefined, next.input);
      return active;
    });
  }

  recover(switchId, checkpoint, reason) {
    return this.transaction(() => {
      const { transition, writer, blocked } = this.current();
      assert(transition?.id === switchId && !writer && !blocked, "RECOVERY_REQUIRES_OBSERVED_EXIT_AND_USAGE");
      assert(["PREPARED", "ACTIVE"].includes(transition.phase), "NO_SWITCH_TO_RECOVER");
      if (transition.checkpoint !== checkpoint) {
        this.db.prepare("UPDATE slot SET blocked='STATE_ADVANCED_REQUIRES_REVIEW' WHERE id=1").run();
        this.record("RECOVERY_BLOCKED", { checkpoint, reason });
        return false;
      }
      const reverted = { ...transition, phase: "REVERTED", reason };
      this.db.prepare("UPDATE slot SET active=?, transition=? WHERE id=1").run(json(transition.approval.predecessor), json(reverted));
      this.record("PREDECESSOR_RESTORED", reverted);
      return true;
    });
  }

  view() {
    const slot = this.current();
    return { slot: { ...slot, writer: Boolean(slot.writer) }, inbox: this.db.prepare("SELECT * FROM inbox ORDER BY rowid").all().map(row => ({ ...row })),
      events: this.db.prepare("SELECT * FROM events ORDER BY seq").all().map(row => ({ ...row, detail: JSON.parse(row.detail) })) };
  }

  close() { this.db.close(); }
}

export const sealOf = entries => digest(json(entries));
