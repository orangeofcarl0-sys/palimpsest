/** Trusted host operations, used only after the preceding model container has stopped. */
import { generateKeyPairSync, randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { launchDeployment, loadDeploymentProfile } from "../../../dist/src/advanced.js";
import { installProduct } from "../../../dist/src/product.js";
import { makeSignedOperatorAuthority, signOperatorToken, verifyOperatorToken } from "../../../dist/src/project_review/index.js";
import { assert, clean, head, sha, writeJson } from "./contract.mjs";

export const PROJECT = "energy-project-continuity";
const GOAL = "Maintain a source-grounded deployment decision package for North Ridge and Harbor Flats as the project changes.";
const GATE = "gate-release";
const STATE_FILES = {
  orchestration: "palimpsest.sqlite", ordarium: "ordarium.sqlite", coordination: "coordination.sqlite",
  transportCursors: "transport-cursors.sqlite", projectJournal: "journal.sqlite", projectAssociations: "associations.sqlite", management: "management.sqlite",
};

export function profileFor({ world, state, path, projectId = PROJECT, localPeer = "energy-project-principal",
  allowedCommands = [{ executable: "node", argv_prefix: ["check.mjs"] }],
  standard = "Required artifacts exist, the public format check succeeds, and all changes are within the declared scope." }) {
  writeJson(path, {
    schemaVersion: 1, profileId: projectId, projectId, localPeer,
    repository: world, execution: "worktree", concurrency: 1, toolProfile: "normal",
    policy: { allowed_commands: allowedCommands },
    standard: { statement: standard },
    transport: { namespace: projectId, databasePath: join(state, "transport.sqlite") },
    databases: Object.fromEntries(Object.entries(STATE_FILES).map(([name, file]) => [name, join(state, file)])),
  });
}

async function withDeployment(profile, action) {
  const deployment = launchDeployment(loadDeploymentProfile(profile));
  try { return await action(deployment.installed.controller); }
  finally { await deployment.close(); }
}

export async function initializeProject(profile, seed, { projectId = PROJECT, goal = GOAL } = {}) {
  return withDeployment(profile, controller => controller.start({ projectId, goal, headCommit: seed, tasks: [] }));
}

export function checkpoint(state) {
  for (const name of readdirSync(state).filter(file => file.endsWith(".sqlite"))) {
    const db = new DatabaseSync(join(state, name));
    try {
      const row = db.prepare("PRAGMA wal_checkpoint(TRUNCATE)").get();
      assert(row.busy === 0, "STATE_WRITER_NOT_QUIESCENT");
    } finally { db.close(); }
  }
}

export function conclusion(state) {
  const path = join(state, "journal.sqlite");
  if (!existsSync(path)) return null;
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    for (const row of db.prepare("SELECT seq, event_id, payload_json FROM project_journal_events ORDER BY seq DESC").all()) {
      const entry = JSON.parse(row.payload_json).entry;
      if (!entry?.title?.startsWith("Episode conclusion:")) continue;
      return { seq: row.seq, eventId: row.event_id, intent: entry.title.slice("Episode conclusion:".length).trim(), body: entry.body };
    }
    return null;
  } finally { db.close(); }
}

export async function productFacts(profile, state, { projectId = PROJECT } = {}) {
  return withDeployment(profile, controller => {
    const status = controller.status();
    const attempts = status.attempts.map(attempt => ({ id: attempt.attempt_id, task: attempt.task_id, state: attempt.state,
      ...controller.attemptWorkRecord(attempt.attempt_id) }));
    const events = controller.store.listEvents(projectId).map(event => ({ id: event.event_id, type: event.event_type, entityId: event.entity_id }));
    return { head: status.headCommit, tasks: status.tasks, attempts, events, conclusion: conclusion(state),
      promotions: controller.promotions.promotionFactsSync(), headState: controller.promotions.projectHeadStatusSync() };
  });
}

export async function admitBasis({ world, state, approved, mode, projectId = PROJECT,
  reason = "Owner admitted the committed initial package and supplier input as the execution basis.",
  operatorNamespace = "energy" }) {
  assert(sha(approved) && head(world) === approved && clean(world), "BASIS_APPROVAL_MISMATCH");
  const operatorId = operatorNamespace + (mode === "mock" ? "-mock-operator" : "-project-owner");
  const actor = `operator:${operatorId}`;
  const purpose = `${operatorNamespace}-basis:${approved}`;
  // The owner command's exact SHA is the authorization input. Its local token stays in this process.
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const token = signOperatorToken({ privateKeyPem: privateKey.export({ format: "pem", type: "pkcs8" }).toString(), claims: {
    operatorId, purpose, nonce: randomUUID(), issuedAt: new Date(Date.now() - 1000).toISOString(), expiresAt: new Date(Date.now() + 60000).toISOString(),
  } });
  const verified = verifyOperatorToken({ token, publicKeyPem: publicKey.export({ format: "pem", type: "spki" }).toString(), expectedOperatorId: operatorId, expectedPurpose: purpose });
  assert(verified.valid, "OPERATOR_TOKEN_REFUSED");
  const product = installProduct({ tools: { register: () => () => {} } }, { projectId, repository: world, stateDir: state,
    execution: "worktree", operatorAuthority: makeSignedOperatorAuthority({ claims: verified.claims, actor }) });
  try {
    const old = product.controller.work.project();
    const admitted = product.controller.planReconciled({ tasks: old.tasks.map(task => ({ ...task })), reason }, {
      headAdvance: { source: "DIRECT_BASIS", toHead: approved, operator: actor, reason },
    });
    assert(product.controller.work.project().head_commit === approved, "BASIS_NOT_ADMITTED");
    return { actor, priorHead: old.head_commit, approved, eventId: admitted.event.event_id, recordedAt: new Date().toISOString() };
  } finally { await product.dispose(); }
}

export function pendingCandidate(facts, receipts, basis) {
  assert(facts.head === basis && facts.promotions.length === 0 && facts.conclusion?.intent === "WAIT_FOR_OPERATOR", "GOVERNED_CANDIDATE_NOT_PENDING");
  const candidates = facts.attempts.filter(attempt => attempt.state === "COMPLETED" && attempt.envelope?.base_commit === basis);
  assert(candidates.length === 1, "GOVERNED_CANDIDATE_NOT_UNIQUE");
  const attempt = candidates[0];
  const receipt = receipts.find(entry => entry.attemptId === attempt.id && entry.outcome === "READY_FOR_SETTLEMENT");
  const result = attempt.report?.result_commit;
  assert(sha(result) && receipt?.result === result && receipt?.sessionId && receipt?.qualification && receipt?.exit?.code === 0, "CANDIDATE_WORKER_ATTRIBUTION_MISMATCH");
  return { attemptId: attempt.id, commit: result, receipt, task: attempt.task };
}

export async function gateStatus(profile, attemptId) {
  return withDeployment(profile, controller => controller.evaluateAttemptGate(GATE, attemptId));
}

export async function promoteCandidate({ profile, world, attemptId, basis, approved }) {
  assert(sha(approved) && head(world) === basis && clean(world), "APPROVAL_BASIS_MISMATCH");
  return withDeployment(profile, async controller => {
    const record = controller.attemptWorkRecord(attemptId);
    assert(record?.state === "COMPLETED" && record.envelope?.base_commit === basis && record.report?.result_commit === approved, "APPROVAL_SHA_MISMATCH");
    assert(controller.evaluateAttemptGate(GATE, attemptId).verdict === "PASS", "PROMOTION_GATE_REFUSED");
    const result = await controller.promoteAttempt({ attemptId, gateId: GATE, reason: `Owner approved candidate ${approved}` });
    for (let i = 0; i < 16 && controller.step() !== null; i += 1) { /* drain deterministic progress */ }
    await controller.reconcileProjectHead();
    assert(head(world) === result.resultingHeadCommit && controller.work.project().head_commit === result.resultingHeadCommit, "PROMOTION_HEAD_NOT_RECONCILED");
    return result;
  });
}
