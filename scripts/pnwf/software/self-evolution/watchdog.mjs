/** Observe a single maintenance campaign without holding a writer or making model requests. */
import assert from "node:assert/strict";
import { existsSync, renameSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { setTimeout } from "node:timers/promises";
import { readJson } from "../../energy/contract.mjs";

const terminal = ["AWAIT_OWNER", "STOPPED", "DELIVERED_NEXT"];

function processAlive(pid) {
  if (!pid) return false;
  try { process.kill(pid, 0); return true; }
  catch (error) {
    if (error.code === "ESRCH") return false;
    if (error.code === "EPERM") return true;
    throw error;
  }
}

function accounting(run) {
  const ledger = join(run, "request-ledger.sqlite");
  if (!existsSync(ledger)) return null;
  const db = new DatabaseSync(ledger, { readOnly: true });
  try {
    db.exec("PRAGMA busy_timeout=3000; BEGIN");
    const tables = db.prepare("SELECT COUNT(*) AS count FROM sqlite_schema WHERE name IN ('config','requests')").get();
    if (tables.count !== 2) return null;
    const config = db.prepare("SELECT json,state,reason FROM config").get();
    if (!config) return null;
    const rows = db.prepare("SELECT state,COUNT(*) AS count FROM requests GROUP BY state").all();
    const unknown = db.prepare("SELECT id FROM requests WHERE state='UNKNOWN' ORDER BY rowid").all().map(row => row.id);
    return { cohortId: JSON.parse(config.json).cohortId, state: config.state, reason: config.reason,
      counts: Object.fromEntries(rows.map(row => [row.state, row.count])), unknown };
  } finally { db.close(); }
}

export function inspectCampaign(campaign) {
  const db = new DatabaseSync(join(campaign, "slot.sqlite"), { readOnly: true });
  let slot, consumer, job;
  try {
    db.exec("PRAGMA busy_timeout=3000; BEGIN");
    slot = db.prepare("SELECT project,active,writer,blocked FROM slot WHERE id=1").get();
    consumer = db.prepare("SELECT pid FROM consumer WHERE id=1").get()?.pid ?? null;
    job = db.prepare(`SELECT inbox.rowid AS sequence,inbox.id,inbox.status,work.input,work.outcome
      FROM work JOIN inbox USING(id) ORDER BY inbox.rowid DESC LIMIT 1`).get();
  } finally { db.close(); }
  assert(slot && job, "WATCHDOG_NO_CAMPAIGN");
  const active = JSON.parse(slot.active), input = JSON.parse(job.input), outcome = JSON.parse(job.outcome ?? "null");
  const alive = processAlive(consumer);
  const round = join(campaign, "r", String(job.sequence));
  const run = input.kind === "successor" ? join(input.directory, input.attempt === 1 ? "next" : "next-" + input.attempt) : join(round, "first");
  const status = terminal.includes(outcome?.state) ? outcome.state : alive ? "RUNNING" : "HOST_INTERRUPTED";
  const approvalRecord = status === "AWAIT_OWNER" ? join(outcome.directory, "approval-request.json") : null;
  const approval = approvalRecord ? readJson(approvalRecord).approval : null;
  if (approval) {
    assert.equal(approval.release.candidate, outcome.candidate);
    assert.equal(approval.release.buildSha256, outcome.buildSha256);
  }
  return { status, project: slot.project, consumer, alive, writer: Boolean(slot.writer), blocked: slot.blocked, active,
    job: { id: job.id, sequence: job.sequence, status: job.status, outcome }, accounting: accounting(run), approvalRecord, approval };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [directory, option] = process.argv.slice(2);
  assert(directory && [undefined, "--once"].includes(option), "Usage: watchdog.mjs <campaign> [--once]");
  const campaign = resolve(directory), output = join(campaign, "watchdog.json");
  const pending = output + "." + process.pid + ".tmp";
  let interruptionObservations = 0;
  while (true) {
    const state = inspectCampaign(campaign);
    interruptionObservations = state.status === "HOST_INTERRUPTED" ? interruptionObservations + 1 : 0;
    if (state.status !== "HOST_INTERRUPTED" || interruptionObservations >= 2 || option === "--once") {
      writeFileSync(pending, JSON.stringify({ observedAt: new Date().toISOString(), ...state }, null, 2) + "\n");
      renameSync(pending, output);
    }
    if (option === "--once" || terminal.includes(state.status) || interruptionObservations >= 2) break;
    await setTimeout(15000);
  }
}
