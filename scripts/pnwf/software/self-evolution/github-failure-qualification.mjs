/** Qualify a historical rejection on a stopped copy before admitting a new provider cohort. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { constants, copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath, pathToFileURL } from "node:url";
import { digest, readJson } from "../../energy/contract.mjs";
import { MaintenanceFailures } from "./failure-investigation.mjs";
import { inspectFailureSession, readFailureEvidence } from "./github-failure-evidence.mjs";
import { HandoverSupervisor } from "./handover-supervisor.mjs";
import { GitHubMaintenance, githubWindow } from "./github-maintenance.mjs";
import { GitHubMaintenanceRuntime, publish } from "./github-maintenance-runtime.mjs";
import { GitHubMaintenanceState } from "./github-maintenance-state.mjs";
import { MaintenanceSlot, sealOf } from "./slot.mjs";
import { repo } from "./workspace.mjs";

const directory = dirname(fileURLToPath(import.meta.url));
const attribution = resolve(directory, "../../../repository/commit-attribution.mjs");
const parent = "standing-admission";
const base = "166cf7c693953322abecd369bfab2eb1c574b45a";
const originalCandidate = "a6743b69ee0259834516a97980e5a06a087f2494";
const originalArchive = "2f4e1b45e8cbf7c7eb6023faf1dc3cd2d5619d9d1937cc7d7bbc508dfb9fec45";
const files = "scripts/pnwf/software/self-evolution/";
const annotated = join("work", parent, "session");

export function investigationHostSource() {
  const paths = ["scripts/pnwf", "scripts/psvr", "scripts/repository", "src", "host/dsh", "package.json", "pnpm-lock.yaml"];
  const git = (...args) => execFileSync("git", ["-C", repo, ...args], { encoding: "utf8", windowsHide: true }).trim();
  git("diff", "--quiet", "HEAD", "--", ...paths);
  assert.equal(git("ls-files", "--others", "--exclude-standard", "--", ...paths), "", "GITHUB_QUALIFICATION_UNTRACKED_HOST_SOURCE");
  return sealOf(paths.map(path => [path, git("rev-parse", "HEAD:" + path)]));
}

export function assertFailureQualification(plan, { proof, receipt }) {
  const { contract } = plan.failureRecovery;
  assert(receipt === sealOf(proof) && proof.pass === true && proof.mode === "mock" && proof.paidRequests === 0 &&
    proof.image === plan.image && proof.basis === plan.initial && proof.archive === contract.archive &&
    proof.contract === sealOf(contract) && proof.hostSource === investigationHostSource() &&
    proof.origin?.case === "failure-" + sealOf({ project: plan.scope.projectId,
      attempt: proof.origin?.attempt, archive: contract.archive }) && proof.attempts === 1 && proof.cuts?.length === 3 &&
    proof.mockSettlement?.reconciled && proof.mockSettlement?.natural && proof.mockDelivery &&
    proof.predecessor?.pass === true && proof.assets?.state === "REPRODUCED" &&
    proof.zeroRequestStop?.usage === "ZERO_REQUESTS" && proof.probe?.counts?.tests === contract.tests && proof.probe?.counts?.passed === 0,
  "GITHUB_FAILURE_MOCK_QUALIFICATION_REQUIRED");
}

function recoveredContract(spec) {
  const path = files + "run.mjs";
  const before = 'const code = ["run.mjs", "workspace.mjs", "session.mjs", "slot.mjs", "judge.mjs"';
  return {
    parent, archive: originalArchive, basis: base, candidate: originalCandidate, tests: 4,
    title: "Repair persisted standing admission against the archived review",
    goal: [
      "维护 #298 的持久跨轮准入。隔离副本已恢复上一轮允许范围内的未提交草案、同一项目的 CHECKPOINT 与调查依据。使受限授权能跨重启执行，保留撤销、精确范围、次数和未知用量边界。",
      "改动仅限 " + spec.paths.concat(path).join("、") + "。run.mjs 只能在源码摘要列表把 standing-admission.mjs 加到 slot.mjs 后；CLI 授权登记另有工单。不要改历史证据。",
      "公开接口例子：windowWithin(request, limit) 接受 80 在 100 的有限额度内，拒绝 101 与 null 上限。Slot grantStandingAdmission({project,mode,requestWindow,maxSessions,expiresAt}, authority) 在可信 Slot 持久化委托。authorizeStandingSession(workId)、standingAdmissionDecision(workId)、revokeStandingAdmission(id, authority) 保持旧调用方式。evaluateStandingAdmission({project,mode,active,job,delegation,priorSessions}) 检查活动版本、任务种类、余额、撤销及账本；正例可读取委托，错误范围、活动版本不符及 prior UNKNOWN 必须拒绝。",
      "用公开测试和自有负面对照验证。使用宿主已配置的 Git 姓名和邮箱提交，勿覆盖作者或提交者字段，也不要添加共同作者尾注。提交并清理工作树后查看 Work readiness，按实际状态退役已由直接提交完成的任务，记录绑定提交的 DELIVER 并自然退出。交付工件为 maintenance/standing-admission.md。",
    ].join("\n\n"),
    paths: [...spec.paths, path], pathRules: [{ path, before, after: before.replace('"slot.mjs",', '"slot.mjs", "standing-admission.mjs",') }],
    publicTests: [files + "standing-admission.test.mjs", files + "github-maintenance.test.mjs"],
    followups: [
      { title: "Review direct maintenance delivery preflight", detail: "The original status read showed READY and the next DELIVER was refused. Evaluate the handoff from Git closeout to Work readiness and check whether the tool can surface actionable guidance automatically." },
      { title: "Review standing-grant registration by the resident CLI", detail: "The draft registered the grant before claiming the resident lease. Reconcile durable grant authority with the input authorization file and verify ordering, expiry and revocation in a separate change." },
    ],
  };
}

function fileDigest(path) { return digest(readFileSync(path)); }

function copyStoppedFiles(from, to) {
  const stat = lstatSync(from);
  if (stat.isDirectory()) {
    mkdirSync(to);
    for (const name of readdirSync(from)) copyStoppedFiles(join(from, name), join(to, name));
  } else {
    assert(stat.isFile(), "GITHUB_FAILURE_ARCHIVE_ENTRY_NOT_REGULAR");
    copyFileSync(from, to, constants.COPYFILE_EXCL);
  }
}

function forkStopped(plan, root, mode) {
  const old = resolve(plan.root);
  assert(!existsSync(root), "GITHUB_FAILURE_FORK_DIRECTORY_EXISTS");
  const from = join(old, "slot.sqlite"), ledger = join(old, annotated, "request-ledger.sqlite");
  for (const path of [from, join(old, "review.sqlite"), ledger]) {
    if (existsSync(path + "-wal")) assert.equal(readFileSync(path + "-wal").length, 0, "GITHUB_FAILURE_ORIGINAL_NOT_STOPPED");
  }
  const slot = new DatabaseSync(from, { readOnly: true });
  let release;
  try {
    const { active, writer, blocked, transition } = slot.prepare("SELECT * FROM slot WHERE id=1").get();
    release = JSON.parse(active);
    assert(release.candidate === base && !writer && !blocked && JSON.parse(transition)?.phase !== "PREPARED" && !slot.prepare("SELECT 1 FROM resident").get(),
      "GITHUB_FAILURE_ORIGINAL_NOT_QUIESCENT");
  } finally { slot.close(); }
  const before = [fileDigest(from), fileDigest(ledger)];
  mkdirSync(root, { recursive: true });
  for (const item of ["slot.sqlite", "review.sqlite", "work", join("project", base),
    join("installations", base), join("source", base + ".bundle")]) {
    const dest = join(root, item);
    mkdirSync(dirname(dest), { recursive: true });
    copyStoppedFiles(join(old, item), dest);
  }
  assert.deepEqual([fileDigest(from), fileDigest(ledger)], before, "GITHUB_FAILURE_ORIGINAL_CHANGED");
  const scope = { ...plan.scope, mode };
  if (mode === "mock") {
    // Convert only the isolated qualification copy to the existing Mock execution mode.
    const copy = new DatabaseSync(join(root, "slot.sqlite"));
    try {
      copy.prepare("UPDATE slot SET mode=? WHERE id=1").run(mode);
      copy.prepare("UPDATE github_maintenance_scope SET seal=? WHERE id=1").run(sealOf(scope));
    } finally { copy.close(); }
  }
  return { ...plan, scope, root, initial: base, release, recovery: null,
    failureRecovery: { contract: recoveredContract(plan.work.find(item => item.id === parent)) } };
}

function mockForge(basis, original) {
  return {
    branchHead: () => basis,
    issue: async number => {
      assert.equal(number, original.issue.number);
      return { id: original.issue.id, number, html_url: original.issue.url };
    },
    comments: async () => [],
  };
}

function grant(plan, work) {
  assert(work.spec.origin && work.spec.origin.archive === plan.failureRecovery.contract.archive, "GITHUB_FAILURE_GRANT_CASE_CHANGED");
  return { project: plan.scope.projectId, repositoryId: plan.scope.repositoryId, mode: plan.scope.mode,
    initial: plan.initial, work: [work.id], window: githubWindow,
    expiresAt: new Date(Date.now() + 3 * 60 * 60_000).toISOString(),
    recovery: { case: work.spec.origin.case, investigation: work.spec.origin.investigation, workSeal: work.seal } };
}

async function qualifyAssets(root, release) {
  const assets = join(repo, "research-evidence", "pnwf-local-assets", "2026-11-22", "equipment-review-revision-rerun");
  const frozen = join(assets, "checkpoint-basis.json");
  const { storedCheckpoint } = readJson(frozen).arms.gap;
  const { id: checkpoint, projectId: project, basis, digest: blob } = storedCheckpoint;
  const book = join(assets, "gap", "initial", "equipment-review.xlsx");
  const dbPath = join(assets, "gap", "state", "local-asset-checkpoints.sqlite");
  const sources = { checkpoint: fileDigest(frozen), workbook: fileDigest(book), state: fileDigest(dbPath) };
  const assetSlotPath = join(root, "asset-case.sqlite");
  let slot = new MaintenanceSlot(assetSlotPath, { projectId: project, mode: "mock", initial: release });
  const target = { kind: "asset", checkpoint, basis: basis.digest, digest: blob };
  const input = { project, attempt: "equipment-gap-old-review", work: "equipment-gap-review", archive: sealOf(sources),
    release, target, sources, verdict: { state: "REJECTED", reason: "draft-review-version", projection: "QUALIFICATION_CONTROL" } };
  try {
    const cases = new MaintenanceFailures(slot);
    const id = cases.intake(input);
    assert.throws(() => cases.intake({ ...input, target: { ...target, digest: "0".repeat(64) } }), /MAINTENANCE_FAILURE_INPUT_CHANGED/u);
    const binding = { project, checkpoint, basis: basis.digest, digest: blob };
    const supervisor = new HandoverSupervisor(join(root, "asset-replay.sqlite"));
    const result = await supervisor.review({ binding, source: input.archive,
      steps: [{ step: "asset-checkpoint", observed: true }, { step: "review-basis", observed: false }] }, () => {
      const db = new DatabaseSync(dbPath, { readOnly: true });
      try {
        const row = db.prepare("SELECT manifest, bytes FROM local_asset_versions WHERE id=? AND project_id=?").get(checkpoint, project);
        assert.deepEqual(JSON.parse(row.manifest), storedCheckpoint);
        assert.equal(digest(row.bytes), blob);
        assert.equal(sources.workbook, blob);
        const review = readJson(join(assets, "gap", "review-request.json"));
        return { steps: [{ step: "asset-checkpoint", observed: true }, { step: "review-basis", observed: false }],
          workbook: blob, checkpoint, originalRequest: sealOf(review) };
      } finally { db.close(); }
    });
    assert.throws(() => supervisor.read(result.id, { ...binding, digest: "0".repeat(64) }), /HANDOVER_RECEIPT_VERSION_MISMATCH/u);
    const facts = { case: id, asset: result.replay, paidRequests: 0 };
    cases.report(id, { facts, seal: sealOf(facts) });
    cases.route(id, { state: "REVIEW_REQUIRED" });
    assert.equal(supervisor.acknowledge(result.id, binding), true);
    slot.close();
    slot = new MaintenanceSlot(assetSlotPath);
    const restored = new MaintenanceFailures(slot).list();
    assert(restored.length === 1 && restored[0].report.seal === sealOf(facts) && supervisor.read(result.id, binding).delivered);
    return { case: id, state: result.state, workbook: blob, wrongVersion: "REJECTED", afterRestart: restored[0].report.seal };
  } finally { slot.close(); }
}

function qualifyZeroRequestStop(originalPlan) {
  const prior = readJson(join(originalPlan.archive, "startup-stop-receipt.json"));
  const stopped = readJson(join(prior.root, "resident-status.json")).work.find(item => item.id === "delivery-readback");
  const directory = join(prior.root, "work", stopped.id, "session");
  assert.equal(fileDigest(join(directory, "request-ledger.sqlite")), prior.ledgerDigest);
  const evidence = readFailureEvidence(directory, stopped, originalPlan.scope.projectId);
  const { accounting } = inspectFailureSession(directory, evidence);
  assert.equal(accounting.requests, 0);
  assert.equal(accounting.unknown, 0);
  return { ...accounting, original: prior.cause };
}

async function qualify(originalPlan, root) {
  const plan = forkStopped(originalPlan, root, "mock");
  const source = investigationHostSource();
  const slotPath = join(root, "slot.sqlite");
  const reference = plan.release;
  const runtime = new GitHubMaintenanceRuntime({ ...plan, attribution, providerProbe: null,
    failureRecovery: { ...plan.failureRecovery, mock: true } });
  const ref = "refs/palimpsest/source/" + plan.initial;
  runtime.git("fetch", "-q", "--no-tags", join(root, "source", plan.initial + ".bundle"), ref + ":" + ref);
  assert.deepEqual(runtime.build(plan.initial), reference);
  let slot = new MaintenanceSlot(slotPath), pilot, authorization;
  const original = new GitHubMaintenanceState(slot, plan.scope).list().find(item => item.id === parent);
  assert(original?.state === "REJECTED" && original?.settlement.archive === originalArchive);
  const cuts = ["failure-archived", "investigation-written", "followup-registered"];
  const pending = new Set(cuts);
  const sealBefore = fileDigest(join(root, annotated, "request-ledger.sqlite"));
  const open = () => new GitHubMaintenance({ slot, scope: plan.scope, runtime, forge: mockForge(plan.initial, original),
    readGrant: () => authorization ?? null, cut: point => {
      if (pending.delete(point)) throw new Error("QUALIFICATION_RESTART " + point);
    } });
  let lease = slot.claimResident();
  try {
    pilot = open();
    for (let i = 0; i < 16; i++) {
      if (pilot.inspect().work.some(item => item.origin && item.state === "REJECTED")) break;
      const sibling = new MaintenanceSlot(slotPath);
      try { assert.throws(() => sibling.claimResident(), /QUEUE_RESIDENT_ACTIVE/u); }
      finally { sibling.close(); }
      try { await pilot.tick(); }
      catch (error) {
        assert.match(error.message, /^QUALIFICATION_RESTART /u);
        slot.releaseResident(lease);
        slot.close();
        slot = new MaintenanceSlot(slotPath);
        lease = slot.claimResident();
        pilot = open();
      }
      const next = pilot.state.list().find(item => item.spec.origin);
      authorization ??= next && grant(plan, next);
    }
    const final = pilot.inspect();
    const origin = final.failureCases.find(item => item.input.work === parent);
    const work = final.work.find(item => item.origin?.case === origin?.id);
    const successor = final.failureCases.find(item => item.input.work === work?.id);
    assert.equal(pending.size, 0, "GITHUB_FAILURE_QUALIFICATION_CUTS_MISSING");
    assert.deepEqual(origin.report.facts.accounting, {
      requests: 121, settled: 121, unknown: 0, confirmed: 15247187, bound: 121, usage: "SETTLED", attribution: "COMPLETE",
    });
    assert(origin.report.facts.findings.filter(item => item.blocking).length === 4);
    assert.equal(final.work.find(item => item.id === "delivery-readback").state, "VERIFIED");
    assert.equal(final.events.filter(event => event.type === "INSTALLATION_ACTIVATED").length, 1);
    assert(work?.review?.delivery && work.settlement.reconciled && work.settlement.natural &&
      work.input.draft.paths.length === 6 && work.input.previousConclusion === origin.report.facts.delivery.previous,
    "GITHUB_FAILURE_DRAFT_QUALIFICATION_INCOMPLETE");
    assert.equal(work.state, "REJECTED");
    assert.equal(successor?.disposition.state, "PAUSED_REPEAT");
    assert.deepEqual(successor.disposition.repeated, ["FROZEN_PROBE"]);
    assert.equal(fileDigest(join(root, annotated, "request-ledger.sqlite")), sealBefore);
    const attempts = final.events.filter(event => event.type === "WAKE_DISPATCHED" && event.detail.id === work.attempt).length;
    const priorWork = pilot.state.list().find(item => item.id === "delivery-readback");
    const predecessor = await runtime.retest(priorWork, { coldReplay: true });
    assert(predecessor.pass && predecessor.release.candidate === base);
    const assets = await qualifyAssets(root, reference);
    const zeroRequestStop = qualifyZeroRequestStop(originalPlan);
    const proof = { pass: true, mode: "mock", paidRequests: 0, image: plan.image, basis: base, archive: originalArchive,
      predecessor, assets, zeroRequestStop,
      contract: sealOf(plan.failureRecovery.contract), hostSource: source, installation: reference, attempts, cuts,
      origin: { case: origin.id, attempt: origin.input.attempt, receipt: origin.report.seal },
      mockSettlement: work.settlement, mockDelivery: work.review.delivery, draft: work.input.draft,
      probe: work.review.next, repeated: successor.disposition, priorLedger: sealBefore };
    const qualified = { proof, receipt: sealOf(proof) };
    assertFailureQualification(plan, qualified);
    publish(join(root, "qualification.json"), qualified);
    publish(join(root, "resident-status.json"), final);
    console.log(JSON.stringify({ proof: qualified.receipt, case: origin.id, mockRequests: work.settlement.requests, attempts }));
  } finally { slot.releaseResident(lease); slot.close(); }
}

export function authorizeFailure(plan, qualification) {
  assertFailureQualification(plan, qualification);
  const slot = new MaintenanceSlot(join(plan.root, "slot.sqlite"));
  try {
    const state = new GitHubMaintenanceState(slot, plan.scope);
    const cases = state.readFailureCases();
    const origin = cases.find(item => item.id === qualification.proof.origin.case);
    const work = state.list().find(item => item.id === origin?.disposition?.work);
    assert(work?.state === "RUNNING" && work.input?.draft?.basis === plan.initial && work.spec.origin.investigation === origin.report.seal &&
      work.spec.origin.archive === plan.failureRecovery.contract.archive && origin.input.target.candidate === originalCandidate &&
      sealOf(origin.report.facts.accounting) === sealOf({ requests: 121, settled: 121, unknown: 0, confirmed: 15247187,
        bound: 121, usage: "SETTLED", attribution: "COMPLETE" }) &&
      sealOf(slot.current().active) === sealOf(qualification.proof.installation) && !slot.current().blocked && !slot.current().writer &&
      slot.queued().find(row => row.id === work.attempt)?.status === "PENDING", "GITHUB_FAILURE_GRANT_NOT_QUIESCENT");
    const existing = existsSync(plan.grant) ? readJson(plan.grant) : null;
    const authorization = grant(plan, work);
    if (existing) {
      assert.deepEqual({ ...authorization, expiresAt: existing.expiresAt }, existing, "GITHUB_FAILURE_GRANT_CHANGED");
      return existing;
    }
    return publish(plan.grant, authorization);
  } finally { slot.close(); }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const [action, original, destination, mockRoot] = process.argv.slice(2);
  assert(["qualify", "prepare"].includes(action) && original && destination, "Usage: github-failure-qualification.mjs qualify|prepare <old-plan> <new-dir> [mock-dir]");
  const plan = readJson(resolve(original)), root = resolve(destination);
  if (action === "qualify") await qualify(plan, root);
  else {
    assert(mockRoot, "Missing qualified Mock run");
    const qualification = join(resolve(mockRoot), "qualification.json");
    assertFailureQualification({ ...plan, initial: base, failureRecovery: { contract: recoveredContract(plan.work.find(item => item.id === parent)) } },
      readJson(qualification));
    const next = forkStopped(plan, root, "paid-usage-only");
    // Serve validates these private files relative to the trusted archive root.
    next.failureRecovery.qualification = qualification;
    next.grant = join(root, "owner-grant.json");
    publish(join(root, "plan.json"), next);
    console.log(join(root, "plan.json"));
  }
}
