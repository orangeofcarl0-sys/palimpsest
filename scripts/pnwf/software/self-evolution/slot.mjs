/** Host-owned durable inbox and active installation for one maintenance project. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { buildCampaignWakeActivationSignal } from "../../../../dist/src/monitor/index.js";
import { digest, sha } from "../../energy/contract.mjs";

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
    assert(proof.schema === "palimpsest-maintenance-rejection/v1" && /^campaign-wake-[a-f0-9]{32}$/u.test(proof.signalId) &&
      proof.unresolved === 0 && Number.isSafeInteger(proof.requests) && proof.requests > 0 && sha(proof.candidate) &&
      hex(proof.buildSha256) && hex(proof.checkpoint) && hex(proof.qualification) && proof.receipts.length > 0 &&
      new Set(proof.receipts.map(receipt => receipt.arm)).size === proof.receipts.length, "INVALID_REJECTION_PROOF");
    for (const { id, ...receipt } of proof.receipts) {
      assert(id === "maintenance-rejection-" + digest(json(receipt)) && receipt.candidate === proof.candidate &&
        receipt.buildSha256 === proof.buildSha256 && receipt.qualification === proof.qualification &&
        receipt.observation.arm === receipt.arm && receipt.observation.condition === "clean" &&
        (!receipt.observation.delivered || receipt.observation.recorded.length !== 1), "REJECTION_RECEIPT_NOT_BOUND");
    }
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
    return this.transaction(() => {
      const prior = this.db.prepare("SELECT pid FROM consumer WHERE id=1").get();
      if (prior) {
        try { process.kill(prior.pid, 0); }
        catch (error) { if (error.code !== "ESRCH") throw error; this.db.exec("DELETE FROM consumer"); }
      }
      assert(!this.db.prepare("SELECT 1 FROM consumer").get(), "QUEUE_CONSUMER_ACTIVE");
      const token = randomUUID();
      this.db.prepare("INSERT INTO consumer (id,pid,token) VALUES (1,?,?)").run(process.pid, token);
      return token;
    });
  }

  releaseConsumer(token) {
    assert.equal(this.db.prepare("DELETE FROM consumer WHERE id=1 AND token=?").run(token).changes, 1, "QUEUE_CONSUMER_MOVED");
  }

  completeWork(id, outcome) {
    this.transaction(() => {
      const job = this.db.prepare("SELECT status, outcome FROM inbox JOIN work USING(id) WHERE id=?").get(id);
      assert(job && ["DONE", "STOPPED"].includes(job.status), "WORK_NOT_TERMINAL");
      if (job.outcome) return assert.equal(job.outcome, json(outcome), "WORK_OUTCOME_CHANGED");
      this.db.prepare("UPDATE work SET outcome=? WHERE id=?").run(json(outcome), id);
      this.record("WORK_REVIEWED", { id, outcome });
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
      const lease = randomUUID();
      this.db.prepare("UPDATE slot SET writer=? WHERE id=1").run(lease);
      this.db.prepare("UPDATE inbox SET status='RUNNING' WHERE id=?").run(id);
      this.record("WAKE_DISPATCHED", { id, seal: job.seal, installation: slot.active });
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
    finish(result.reconciled ? "DONE" : "STOPPED", result, result.reconciled ? null : "USAGE_UNCONFIRMED");
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

  prepare({ predecessor, release, qualification, approval, checkpoint }) {
    return this.transaction(() => {
      const slot = this.current();
      const next = identity(release);
      const prior = identity(predecessor);
      const expected = { mode: slot.mode, predecessor: prior, release: next, qualification };
      assert(hex(qualification) && hex(checkpoint) && next.buildSha256 !== prior.buildSha256 && next.candidate !== prior.candidate,
        "INVALID_SWITCH_INPUT");
      assert.deepEqual(approval, expected, "APPROVAL_DOES_NOT_MATCH_QUALIFIED_INSTALLATION");
      if (json(slot.active) === json(next) && slot.transition?.phase === "ACTIVE") {
        assert.deepEqual(slot.transition.approval, approval, "ACTIVE_APPROVAL_DRIFT");
        return false;
      }
      assert(!slot.writer && !slot.blocked && slot.transition?.phase !== "PREPARED", "SWITCH_REQUIRES_QUIESCENT_WRITER");
      assert.deepEqual(slot.active, prior, "ACTIVE_PREDECESSOR_MOVED");
      const transition = { id: randomUUID(), phase: "PREPARED", approval, checkpoint, preparedAt: now() };
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
