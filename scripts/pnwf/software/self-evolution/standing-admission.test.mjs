import assert from "node:assert/strict";
import { mkdtempDisposableSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { MaintenanceSlot, sealOf } from "./slot.mjs";
import { evaluateStandingAdmission, windowWithin } from "./standing-admission.mjs";

const project = "standing-mock";
const mode = "mock";
const source = symbol => ({ candidate: symbol.repeat(40), buildSha256: symbol.repeat(64), image: "sha256:" + "f".repeat(64) });
const authority = { actor: "owner", reason: "Bounded review" };
const checkpoint = "1".repeat(64), qualification = "2".repeat(64);
const requestWindow = { maxRequests: 256, wallClockMs: 3_600_000, requestTimeoutMs: 240_000, billingCeiling: null };
const settled = { reconciled: true, natural: true, usageState: "SETTLED", attributionState: "COMPLETE",
  unresolved: 0, requests: 1 };
const grant = { project, mode, requestWindow, expiresAt: null, maxSessions: 2 };

function enqueue(slot, release, window = requestWindow) {
  const approval = { mode, predecessor: slot.current().active, release, qualification };
  const switchId = slot.prepare({ ...approval, approval, checkpoint });
  const input = { kind: "maintenance-selection", release, checkpoint, requestWindow: window };
  slot.activate({ switchId, observedRelease: release, checkpoint, readback: true,
    next: { name: release.candidate, seal: sealOf(input), input } });
  return slot.queued().at(-1);
}

test("validates request-first windows without allowing unlimited billing under a finite grant", () => {
  const allowed = { ...requestWindow, billingCeiling: 100 };
  const asked = { ...requestWindow, billingCeiling: 80 };
  assert(windowWithin(80, 100));
  assert(!windowWithin(101, 100));
  assert(windowWithin(asked, allowed));
  assert(windowWithin({ window: allowed }, { requestWindow: asked }));
  assert(!windowWithin(requestWindow, allowed));
  assert(!windowWithin({ ...asked, billingCeiling: 101 }, allowed));
  assert(!windowWithin({ ...asked, requestTimeoutMs: 240_001 }, allowed));
  assert(!windowWithin({ billingCeiling: 80 }, { billingCeiling: 100 }));
});

test("structured admission binds the pending job, release, task kind and usage history", () => {
  const active = source("a");
  const job = { id: "review", status: "PENDING", input: { kind: "maintenance-selection", release: active, requestWindow } };
  const delegation = { ...grant, id: "existing-grant", status: "ACTIVE",
    lineage: [active], ticketKinds: ["maintenance-selection"], usedSessions: 1 };
  const priorSessions = [{ receipt: { consumed: true }, job: { result: settled } }];
  const facts = { project, mode, active, job, delegation, priorSessions };
  assert.equal(evaluateStandingAdmission(facts).delegation, delegation.id);
  for (const change of [
    { active: source("b") },
    { job: { ...job, status: "DONE" } },
    { job: { ...job, input: { ...job.input, kind: "github-maintenance" } } },
    { job: { ...job, input: { ...job.input, release: { ...active, buildSha256: "b".repeat(64) } } } },
    { delegation: { ...delegation, project: "other" } },
    { delegation: { ...delegation, ticketKinds: ["github-maintenance"] } },
    { delegation: { ...delegation, expiresAt: "2000-01-01T00:00:00Z" } },
    { priorSessions: [...priorSessions, { result: settled }] },
    { priorSessions: [{ job: { result: JSON.stringify({ usageState: "UNKNOWN" }) } }] },
    { priorSessions: [{ job: { result: { usageState: "SETTLED", attributionState: "INCOMPLETE" } } }] },
  ]) assert.deepEqual(evaluateStandingAdmission({ ...facts, ...change }), { admitted: false });
});

test("positional policy requires the verified and release-bound predecessor for ordered GitHub work", () => {
  const initial = source("a"), release = source("b");
  const timedGrant = { project, mode, repositoryId: 3, initial: initial.candidate, work: ["a", "b"],
    window: requestWindow, expiresAt: "2099-01-01T00:00:00Z" };
  const request = { project, mode, release, work: "job-b", requestWindow };
  const scope = { repositoryId: 3 };
  assert.equal(evaluateStandingAdmission(timedGrant, request, scope, "b"), null);
  const predecessor = { id: "a", state: "VERIFIED", release };
  assert.equal(evaluateStandingAdmission(timedGrant, request, scope, "b", predecessor).admitted, true);
  assert.equal(evaluateStandingAdmission(timedGrant, request, scope, "b", { ...predecessor, release: initial }), null);
  assert.equal(evaluateStandingAdmission(timedGrant, request, { repositoryId: 4 }, "b", predecessor), null);
});

test("spends the bound grant once per job across restarts, with no new receipt after exhaustion", async () => {
  using home = mkdtempDisposableSync(join(tmpdir(), "standing-admission-"));
  const path = join(home.path, "slot.sqlite");
  let slot = new MaintenanceSlot(path, { projectId: project, mode, initial: source("a") });
  let competing;
  try {
    slot.enableSessionAdmission();
    const first = enqueue(slot, source("b")), record = slot.grantStandingAdmission(grant, authority);
    const issued = slot.authorizeStandingSession(first.id);
    assert.deepEqual(slot.authorizeStandingSession(first.id), issued);
    assert.equal(issued.id, sealOf(issued.decision));
    assert.equal(issued.decision.delegation, record.delegation);
    assert(!Object.hasOwn(issued.decision, "admitted"));
    slot.close();
    slot = new MaintenanceSlot(path);
    competing = new MaintenanceSlot(path);
    let calls = 0;
    const run = async () => { calls++; return settled; };
    await Promise.all([slot.dispatch(first.signal, source("b"), run), competing.dispatch(first.signal, source("b"), run)]);
    assert.equal(calls, 1);
    const second = enqueue(slot, source("c"));
    assert.equal(slot.standingAdmissionDecision(second.id).delegation.id, record.id);
    await slot.dispatch(second.signal, source("c"), run);
    assert.equal(calls, 2);
    const exhausted = enqueue(slot, source("d"));
    assert.deepEqual(slot.standingAdmissionDecision(exhausted.id), { admitted: false });
    await assert.rejects(slot.dispatch(exhausted.signal, source("d"), run), /SESSION_AUTHORIZATION_REQUIRED/u);
    assert.equal(slot.sessionAdmission(exhausted.id), null);
    assert.equal(slot.view().events.filter(event => event.type === "STANDING_ADMISSION_CONSUMED").length, 2);
  } finally { competing?.close(); slot.close(); }
});

test("revocation persists across restart and blocks an already-issued receipt", async () => {
  using home = mkdtempDisposableSync(join(tmpdir(), "standing-revocation-"));
  const path = join(home.path, "slot.sqlite");
  let slot = new MaintenanceSlot(path, { projectId: project, mode, initial: source("a") });
  try {
    slot.enableSessionAdmission();
    const pending = enqueue(slot, source("b")), record = slot.grantStandingAdmission(grant, authority);
    slot.authorizeStandingSession(pending.id);
    slot.revokeStandingAdmission(record.id, authority);
    slot.close();
    slot = new MaintenanceSlot(path);
    await assert.rejects(slot.dispatch(pending.signal, source("b"), () => assert.fail("dispatched revoked work")),
      /STANDING_ADMISSION_REVOKED/u);
    assert.equal(slot.sessionAdmission(pending.id).consumed, false);
  } finally { slot.close(); }
});

test("selection standing grants do not change the GitHub single-session receipt or authorize a GitHub job", async () => {
  const initial = source("a");
  const slot = new MaintenanceSlot(":memory:", { projectId: project, mode, initial });
  try {
    slot.enableSessionAdmission();
    slot.grantStandingAdmission(grant, authority);
    const { signal } = slot.enqueueGitHubSession("github-work", checkpoint, { release: initial, checkpoint,
      requestWindow, work: "github-work" });
    await assert.rejects(slot.dispatch(signal, initial, () => assert.fail("dispatched without GitHub admission")),
      /SESSION_AUTHORIZATION_REQUIRED/u);
    const request = slot.sessionAdmissionRequest(signal.signalId);
    const receipt = slot.authorizeSession(request, authority);
    assert.deepEqual(receipt, { id: sealOf({ request, ...authority }), decision: { request, ...authority } });
    await slot.dispatch(signal, initial, async () => settled);
    assert.equal(slot.sessionAdmission(signal.signalId).consumed, true);
  } finally { slot.close(); }
});
