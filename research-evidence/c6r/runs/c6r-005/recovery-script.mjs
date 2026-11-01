/**
 * Focused read/recovery report for the uncertain P1 promotion. Runs inside the P1 path view.
 * Calls the supported PromotionManager.reconcileAll() and records its report and the surrounding
 * ledger rows. Does not call promote() again.
 */
import { writeFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";

const PRODUCT = "/product";
const P1 = "/run/p1";
const WORLD = join(P1, "world");
const STATE = join(P1, "state");

const { installPalimpsest, trustedDefaultPolicy } = await import(`${PRODUCT}/dist/src/install.js`);
const { GitCliPort } = await import(`${PRODUCT}/dist/src/effects/index.js`);
const { SqliteProjectJournalStore } = await import(`${PRODUCT}/dist/src/project_workspace/journal.js`);
const { SqliteProjectAssetAssociationStore } = await import(`${PRODUCT}/dist/src/project_workspace/association.js`);
const { standardFor, policyFor, projectSnapshot } = await import(`${PRODUCT}/scripts/cog6/rig6.mjs`);

function ledger() {
  const db = new DatabaseSync(`${STATE}/palimpsest.sqlite`, { readOnly: true });
  const events = db.prepare("SELECT event_id, event_type, entity_id FROM events ORDER BY event_id DESC LIMIT 12").all();
  const promotions = db.prepare("SELECT project_id, promotion_id, state FROM promotions ORDER BY rowid").all();
  const tasks = db.prepare("SELECT task_id, state, last_event_id FROM tasks ORDER BY task_id").all();
  const attempts = db.prepare("SELECT attempt_id, task_id, state FROM attempts ORDER BY rowid").all();
  db.close();
  const od = new DatabaseSync(`${STATE}/ordarium.sqlite`, { readOnly: true });
  const operations = od.prepare("SELECT operation_id, state, updated_at FROM ordarium_operations ORDER BY updated_at DESC LIMIT 8").all();
  const uncertain = od.prepare("SELECT operation_id, state, record_json FROM ordarium_operations WHERE state='uncertain'").all().map((row) => ({ operation_id: row.operation_id, state: row.state, record: JSON.parse(row.record_json) }));
  od.close();
  return { events, promotions, tasks, attempts, operations, uncertain };
}

const installed = installPalimpsest(
  { tools: { register: () => () => undefined } },
  {
    projectId: "sablewick",
    databasePath: join(STATE, "palimpsest.sqlite"),
    ordariumDatabasePath: join(STATE, "ordarium.sqlite"),
    repository: WORLD,
    git: new GitCliPort(WORLD, join(WORLD, ".palimpsest", "worlds")),
    execution: "worktree",
    standard: standardFor(),
    policy: trustedDefaultPolicy(policyFor()),
    projectJournalStore: new SqliteProjectJournalStore(join(STATE, "journal.sqlite")),
    projectAssetAssociationStore: new SqliteProjectAssetAssociationStore(join(STATE, "associations.sqlite")),
    workWorkerPort: () => { throw new Error("recovery report does not run work"); },
  },
);

const before = await projectSnapshot(installed, WORLD);
const beforeLedger = ledger();
let report;
let error;
try {
  report = await installed.controller.promotions.reconcileAll();
} catch (caught) {
  error = caught instanceof Error ? { name: caught.name, message: caught.message, code: caught.code ?? null } : { message: String(caught) };
}
const after = await projectSnapshot(installed, WORLD);
const afterLedger = ledger();
const record = {
  schema: "c6r-promotion-recovery-report/v1",
  at: new Date().toISOString(),
  label: "OPERATOR_RECOVERY",
  beforeHead: before.head,
  beforeTasks: before.tasks,
  beforeLedger,
  report: report ?? null,
  error: error ?? null,
  afterHead: after.head,
  afterTasks: after.tasks,
  afterLedger,
};
writeFileSync("/evidence/recovery-report.json", JSON.stringify(record, null, 2));
console.log(JSON.stringify({ beforeHead: record.beforeHead, report: record.report, error: record.error, afterHead: record.afterHead, afterTasks: record.afterTasks, uncertain: afterLedger.uncertain.map((entry) => ({ id: entry.operation_id, state: entry.state })), promotions: afterLedger.promotions, events: afterLedger.events }, null, 2));
await installed.close?.();
