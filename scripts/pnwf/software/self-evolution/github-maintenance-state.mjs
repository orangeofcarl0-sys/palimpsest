
/** A GitHub projection of native maintenance Work and the trusted outbound actions. */
import assert from "node:assert/strict";
import { MaintenanceFailures } from "./failure-investigation.mjs";
import { sealOf } from "./slot.mjs";

export class GitHubMaintenanceState {
  constructor(slot, scope) {
    this.slot = slot;
    this.db = slot.db;
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS github_maintenance_scope (
        id INTEGER PRIMARY KEY CHECK(id=1), seal TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS github_maintenance_work (
        id TEXT PRIMARY KEY, spec TEXT NOT NULL, seal TEXT NOT NULL, facts TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS github_maintenance_publication (
        id TEXT PRIMARY KEY, state TEXT NOT NULL, remote_id TEXT
      ) STRICT
    `);
    const seal = sealOf(scope);
    this.db.prepare("INSERT OR IGNORE INTO github_maintenance_scope (id,seal) VALUES (1,?)").run(seal);
    assert.equal(this.db.prepare("SELECT seal FROM github_maintenance_scope WHERE id=1").get().seal, seal,
      "GITHUB_MAINTENANCE_SCOPE_CHANGED");
  }

  register(spec) {
    assert(/^[a-z][a-z0-9-]{0,49}$/u.test(spec.id), "GITHUB_WORK_ID_INVALID");
    return this.slot.transaction(() => {
      const seal = sealOf(spec);
      const prior = this.db.prepare("SELECT seal FROM github_maintenance_work WHERE id=?").get(spec.id);
      if (prior) {
        assert.equal(prior.seal, seal, "GITHUB_WORK_SPEC_CHANGED");
        return false;
      }
      if (spec.origin) {
        const work = this.list();
        const parent = work.find(item => item.id === spec.origin.work);
        assert(parent?.state === "REJECTED" && parent.attempt === spec.origin.attempt && parent.issue?.number === spec.issue,
          "GITHUB_FOLLOWUP_PARENT_CHANGED");
        assert(!work.some(item => (item.issue?.number ?? item.spec.issue) === spec.issue &&
          !["VERIFIED", "REJECTED", "PAUSED"].includes(item.state)), "GITHUB_FOLLOWUP_ALREADY_ACTIVE");
      }
      this.db.prepare("INSERT INTO github_maintenance_work VALUES (?,?,?,?)").run(spec.id, JSON.stringify(spec), seal,
        JSON.stringify({ state: "REGISTERED" }));
      this.slot.record("GITHUB_WORK_REGISTERED", { id: spec.id, seal });
      return true;
    });
  }

  list() {
    return this.db.prepare("SELECT * FROM github_maintenance_work ORDER BY rowid").all()
      .map(row => ({ id: row.id, spec: JSON.parse(row.spec), seal: row.seal, ...JSON.parse(row.facts) }));
  }

  update(work, details) {
    const { id, spec: _spec, seal: _seal, ...facts } = work;
    const next = { ...facts, ...details };
    if (sealOf(facts) === sealOf(next)) return;
    this.slot.transaction(() => {
      const changed = this.db.prepare("UPDATE github_maintenance_work SET facts=? WHERE id=? AND facts=?")
        .run(JSON.stringify(next), id, JSON.stringify(facts));
      assert.equal(changed.changes, 1, "GITHUB_WORK_ADVANCED");
      this.slot.record("GITHUB_WORK_ADVANCED", { id, state: next.state, reason: next.reason ?? null });
    });
  }

  readFailureCases() {
    if (!this.db.prepare("SELECT 1 FROM sqlite_master WHERE name='maintenance_failure_cases'").get()) return [];
    return new MaintenanceFailures(this.slot).list();
  }

  publication(id) {
    return this.db.prepare("SELECT state,remote_id FROM github_maintenance_publication WHERE id=?").get(id);
  }

  startPublication(id) {
    this.slot.transaction(() => {
      this.db.prepare("INSERT INTO github_maintenance_publication VALUES (?, 'STARTED', NULL)").run(id);
      this.slot.record("GITHUB_PUBLICATION_STARTED", { id });
    });
  }

  resetPublication(id) {
    this.db.prepare("DELETE FROM github_maintenance_publication WHERE id=? AND state='STARTED'").run(id);
  }

  confirmPublication(id, remoteId) {
    this.slot.transaction(() => {
      const prior = this.publication(id);
      if (prior?.state === "CONFIRMED") {
        assert.equal(prior.remote_id, remoteId, "GITHUB_PUBLICATION_ID_CHANGED");
        return;
      }
      this.db.prepare(`INSERT INTO github_maintenance_publication VALUES (?, 'CONFIRMED', ?)
        ON CONFLICT(id) DO UPDATE SET state='CONFIRMED', remote_id=excluded.remote_id`).run(id, remoteId);
      this.slot.record("GITHUB_PUBLICATION_CONFIRMED", { id, remoteId });
    });
  }
}
