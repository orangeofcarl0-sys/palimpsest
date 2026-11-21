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
    assert(/^[\w-]+$/u.test(name) && hex(seal), "INVALID_EVIDENCE_SEAL");
    return this.transaction(() => {
      const { project } = this.current();
      const signal = buildCampaignWakeActivationSignal({ projectId: project, campaignId: `${project}-maintenance`,
        wakeCycleId: name, cause: { kind: "manual", signalId: name }, phase: "RECONCILIATION_READY",
        reconciliationDigest: seal, detail: "A sealed project run is ready to read.", createdAt: now() });
      const existing = this.db.prepare("SELECT seal FROM inbox WHERE id=?").get(signal.signalId);
      if (existing) { assert.equal(existing.seal, seal, "EVIDENCE_CHANGED_ON_REPLAY"); return { signal, inserted: false }; }
      this.db.prepare("INSERT INTO inbox (id, seal, status) VALUES (?, ?, 'PENDING')").run(signal.signalId, seal);
      this.record("EVIDENCE_READY", signal);
      return { signal, inserted: true };
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

  activate({ switchId, observedRelease, checkpoint, readback }) {
    return this.transaction(() => {
      const { transition, writer } = this.current();
      assert(transition?.phase === "PREPARED" && transition.id === switchId && !writer && readback === true, "SWITCH_NOT_READY");
      assert.deepEqual(identity(observedRelease), transition.approval.release, "WRONG_LOADED_BUILD");
      assert.equal(checkpoint, transition.checkpoint, "CHECKPOINT_DRIFT");
      const active = { ...transition, phase: "ACTIVE", activatedAt: now() };
      this.db.prepare("UPDATE slot SET active=?, transition=? WHERE id=1").run(json(active.approval.release), json(active));
      this.record("INSTALLATION_ACTIVATED", active);
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
    return { slot: { ...slot, writer: Boolean(slot.writer) }, inbox: this.db.prepare("SELECT * FROM inbox ORDER BY rowid").all(),
      events: this.db.prepare("SELECT * FROM events ORDER BY seq").all().map(row => ({ ...row, detail: JSON.parse(row.detail) })) };
  }

  close() { this.db.close(); }
}

export const sealOf = entries => digest(json(entries));
