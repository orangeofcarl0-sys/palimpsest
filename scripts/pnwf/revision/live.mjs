/** Run one ordinary DSH T2 against an already approved historical basis. */
import { deepStrictEqual } from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { inspectWorkRevision, requireWorkRevision } from "../../../dist/src/work/revision.js";
import { PAID_COHORT_SCHEMA, PAID_MODE, readDeepSeekKey } from "../bounded_provider.mjs";
import { runContainerSession } from "../container_adapter.mjs";
import { docker } from "../container_runtime.mjs";
import { ExecutionBudget, USAGE_ONLY_SCHEMA } from "../execution_budget.mjs";
import { makeWorkerBroker, stageRuntime } from "../energy/container-worker.mjs";
import * as energy from "../energy/contract.mjs";
import { attribute, requireUsage } from "../energy/evidence.mjs";
import { profileFor } from "../energy/product.mjs";
import * as grpc from "../software/contract.mjs";
import { OFFLINE, scoreDelivery } from "../software/score.mjs";

const { assert, changed, clean, digest, git, head, readJson, sha, writeJson } = energy;
const repo = fileURLToPath(new URL("../../../", import.meta.url));
const here = fileURLToPath(new URL(".", import.meta.url));
const originalRelease = "7f849be7058cb75992ba06fa226a0ff708b25111";
const image = "sha256:ebf870ae77228fa819a332add9d0ba9f1aefc404c0088ea3f6bb28030a0adef0";
const window = { maxRequests: 64, wallClockMs: 1800000, requestTimeoutMs: 240000, billingCeiling: null };
const { values } = parseArgs({ options: Object.fromEntries(
  ["action", "scenario", "run", "world", "t1", "control", "approve", "release", "qualification"].map(key => [key, { type: "string" }])) });
const { action, scenario } = values;
const release = values.release ?? originalRelease;
assert(["prepare", "run", "review", "accept"].includes(action) && ["grpc", "energy"].includes(scenario) && values.run, "LIVE_T2_ARGUMENTS_REQUIRED");
const root = resolve(values.run);
const stage = join(root, "stages/T2");
const world = join(stage, "world");
const state = join(stage, "state");
const runtime = join(root, "product");
const profile = join(root, "profile.json");
const promptPath = join(root, "prompt.txt");
const budgetPath = join(root, "request-ledger.sqlite");
const lock = join(root, "started.json");
const sealPath = join(root, "contract.json");
const candidatePath = join(root, "candidate.json");
const resultPath = join(root, "result.json");
const recountPath = join(root, "review-result.json");
const software = scenario === "grpc";
const spec = software ? {
  ...grpc.SCENARIO, gitIdentity: { name: "Software migration trial", email: "software-trial@example.invalid" },
  taskId: "revise-fleet-default", basis: "fbeb8958f4405688b13f37dbdec330157a660ab0",
  first: "3dadc3a1df9cabf2fd40543f711e3720916e9447", paths: grpc.SCOPE, mustChange: grpc.REQUIRED,
  mustPreserve: grpc.RETAINED, correction: [grpc.CORRECTION_PATH, grpc.CORRECTION], prompt: grpc.GUARDED_T2_PROMPT,
} : {
  projectId: "energy-project-continuity", taskId: "revise-energy-package", operatorNamespace: "energy",
  basis: "8041871314136d417b285a800265858757463f68", first: "4cf360d5620fa10df5022c777aa0ed83c312a80a",
  paths: energy.REVISION_PATHS, mustChange: energy.REVISION_PATHS, mustPreserve: [energy.CERTIFICATES],
  correction: [energy.BULLETIN, energy.CORRECTION], prompt: energy.WORK_T2_PROMPT,
};
const obligations = { schemaVersion: 1, mayWrite: spec.paths, mustChange: spec.mustChange, mustExist: spec.paths, mustPreserve: spec.mustPreserve };
const shaFile = path => digest(readFileSync(path));
const frozenScore = fileURLToPath(new URL("../software/score.mjs", import.meta.url));
const scoreFixture = join(repo, "fixtures/psvr/energy-deployment");
const productFiles = ["product-entry.mjs", "task-obligations.json", "scenario.json", "owner-accept.mjs"];

function offline(script, args = [], directory = stage) {
  return docker(["run", "--rm", "--network", "none", ...OFFLINE, "--tmpfs", "/tmp:rw,nosuid,nodev,uid=1001,gid=1001",
    "-e", "HOME=/tmp", "-e", "GIT_CONFIG_COUNT=1", "-e", "GIT_CONFIG_KEY_0=safe.directory", "-e", "GIT_CONFIG_VALUE_0=*",
    "-v", runtime + ":/product:ro", "-v", directory + ":/run/stage",
    image, "node", "/product/" + script, ...args]);
}

function owner(action, ...args) {
  const stdout = offline("scripts/pnwf/energy/owner-command.mjs", [action, ...args]);
  const line = stdout.split(/\r?\n/u).find(row => row.startsWith("ENERGY_OWNER_RESULT "));
  return JSON.parse(line.slice("ENERGY_OWNER_RESULT ".length));
}

function treeDigest(path) {
  return digest(execFileSync("git", ["-C", path, "ls-tree", "-r", "--full-tree", "HEAD"]));
}

function productBinding() {
  return Object.fromEntries(productFiles.map(path => [path, shaFile(join(runtime, "runtime", path))]));
}

function qualificationDigest() {
  if (release === originalRelease) return null;
  assert(values.qualification, "READINESS_MOCK_QUALIFICATION_REQUIRED");
  const report = readJson(values.qualification);
  assert(report.passed && report.paidModelCalls === 0 && report.implementationHead === release && report.image === image &&
    report.readinessModuleSha256 === shaFile(join(runtime, "dist/src/application/work_outcome.js")) &&
    ["grpc", "energy"].every(name => report.scenarios.find(row => row.name === name)?.sessions.some(row =>
      row.interface === "normal-dsh" && row.naturalExit && row.unresolvedRequests === 0 &&
      row.readiness?.active.task.state === "ACTIVE" && row.readiness?.verifying.task.state === "VERIFYING")),
  "READINESS_MOCK_QUALIFICATION_MISMATCH");
  return shaFile(values.qualification);
}

function prepare() {
  assert(values.world && values.t1 && values.control, "ORIGINAL_INPUT_PATHS_REQUIRED");
  const source = resolve(values.world);
  const first = resolve(values.t1);
  const control = resolve(values.control);
  const historicAdmission = readJson(join(control, "basis-admission.json"));
  assert((historicAdmission.admission ?? historicAdmission).approved === spec.basis, "ORIGINAL_ADMISSION_SHA_MISMATCH");
  const historicResult = readJson(join(control, "result.json"));
  assert(historicResult.passed && historicResult.basis === spec.basis, "ORIGINAL_CONTROL_NOT_BOUND");
  assert(shaFile(join(control, "prompt.txt")) === digest(spec.prompt), "ORIGINAL_PROMPT_DRIFT");
  assert(head(source) === spec.basis && clean(source) && git(source, "rev-parse", "HEAD^") === spec.first &&
    !existsSync(join(source, ".git/objects/info/alternates")) && !existsSync(join(source, ".palimpsest")), "ORIGINAL_WORLD_NOT_CLEAN_AT_BASIS");
  deepStrictEqual(changed(source, spec.first, spec.basis), [spec.correction[0]]);
  const correctionBytes = execFileSync("git", ["-C", source, "cat-file", "blob", spec.basis + ":" + spec.correction[0]]);
  assert(digest(correctionBytes) === digest(spec.correction[1]), "ORIGINAL_CORRECTION_DRIFT");
  mkdirSync(root);
  mkdirSync(stage, { recursive: true });
  cpSync(source, world, { recursive: true });
  cpSync(join(first, "stages/T1/state"), state, { recursive: true });
  assert(head(world) === spec.basis && clean(world) && treeDigest(world) === treeDigest(source), "REPLAY_WORLD_DRIFT");
  stageRuntime({ repo, destination: runtime });
  for (const part of ["product-entry.mjs", "owner-accept.mjs"]) cpSync(join(here, part), join(runtime, "runtime", part));
  writeJson(join(runtime, "runtime/task-obligations.json"), { [spec.taskId]: obligations });
  writeJson(join(runtime, "runtime/scenario.json"), spec);
  profileFor({ ...spec, world, state, path: profile });
  const before = owner("facts");
  const original = historicAdmission.admission ?? historicAdmission;
  assert(before.head === original.priorHead && before.attempts.length === 0 && before.conclusion?.intent === "DELIVER" &&
    before.promotions.length === 0, "ORIGINAL_T1_STATE_DRIFT");
  const admission = owner("basis", spec.basis, PAID_MODE);
  assert(admission.approved === spec.basis && admission.priorHead === before.head, "REPLAY_ADMISSION_FAILED");
  const prompt = spec.prompt + "\n\nRegister this as a formal Palimpsest Work revision using the task ID " + spec.taskId +
    " so the host can attach the authorized file obligations.";
  writeFileSync(promptPath, prompt);
  const seal = { release, image, scenario, basis: spec.basis, first: spec.first, tree: git(world, "rev-parse", "HEAD^{tree}"),
    mode: PAID_MODE, model: "deepseek-flash", dsh: "0.2.1-rc.5", window, admission, originalAdmission: original,
    originalPrompt: digest(spec.prompt), prompt: digest(prompt), correction: digest(correctionBytes), obligations,
    originalResultSha256: shaFile(join(control, "result.json")), t1ResultSha256: shaFile(join(first, "result.json")),
    scorerSha256: shaFile(software ? frozenScore : join(scoreFixture, "check.mjs")), productBinding: productBinding(),
    qualificationSha256: qualificationDigest() };
  writeJson(sealPath, seal);
  console.log("REPLAY_PREPARED", scenario, spec.basis, root);
}

async function score(commit, outputBase) {
  if (!software) return { business: energy.checkPackage({ repo: world, commit, basis: spec.basis, first: spec.first,
    fixture: scoreFixture, output: join(outputBase, "scorer") }) };
  const input = { repo: world, basis: spec.basis, commit, revised: true, image };
  try {
    return { business: scoreDelivery({ ...input, output: join(outputBase, "scorer") }), frozenScore: { passed: true } };
  } catch (error) {
    if (error.message !== "SOFTWARE_PROTO_RPC_CONTRACT") throw error;
    // Reuse only the request-message aliases already accepted for this immutable basis.
    assert(energy.blob(world, spec.basis, "proto/energy.proto") === energy.blob(world, commit, "proto/energy.proto"), "PROTO_ALIAS_BLOB_DRIFT");
    const url = new URL("../software/score.mjs", import.meta.url);
    const aliased = readFileSync(url, "utf8").replace("\\(SiteRequest\\)", "\\((?:SiteRequest|GetReadingRequest)\\)")
      .replace("\\(StreamRequest\\)", "\\((?:StreamRequest|StreamReadingsRequest)\\)");
    const source = aliased.replace(/from "(\.\.?\/[^"]+)"/gu, (_, path) => "from " + JSON.stringify(new URL(path, url).href))
      .replaceAll("import.meta.url", JSON.stringify(url.href));
    const scorer = await import("data:text/javascript;base64," + Buffer.from(source).toString("base64"));
    mkdirSync(join(outputBase, "recount"), { recursive: true });
    return { business: scorer.scoreDelivery({ ...input, output: join(outputBase, "recount/scorer") }),
      frozenScore: { passed: false, reason: error.message }, scoreMode: "owner-approved-alias-recount", aliasScorerSha256: digest(aliased) };
  }
}

async function reviewCandidate(result, outputBase = root) {
  const { receipt, facts, gate } = result;
  assert(receipt?.phase === "SETTLED" && result.usageKnown && result.execution.natural &&
    receipt.candidate === facts.attempts.find(attempt => attempt.id === receipt.attemptId)?.report?.result_commit &&
    gate.verdict === "PASS" && head(world) === spec.basis && clean(world), "CANDIDATE_REVIEW_NOT_BOUND");
  requireWorkRevision(receipt);
  Object.assign(result, await score(receipt.candidate, outputBase));
  const patch = execFileSync("git", ["-C", world, "diff", "--no-ext-diff", spec.basis, receipt.candidate, "--"]);
  writeFileSync(join(root, "candidate-review.patch"), patch);
  result.candidateQualified = true;
  result.waitRecorded = facts.conclusion?.intent === "WAIT_FOR_OPERATOR";
  const candidate = { ...receipt, commit: receipt.candidate, tree: result.business.tree, gate: gate.verdict, route: result.route,
    changedPaths: result.business.changedPaths, business: result.business, frozenScore: result.frozenScore,
    waitRecorded: result.waitRecorded, readyAt: new Date().toISOString() };
  writeJson(candidatePath, candidate);
}

async function run() {
  const seal = readJson(sealPath);
  assert(!existsSync(lock) && !existsSync(resultPath) && seal.release === release && seal.image === image && seal.scenario === scenario &&
    seal.basis === spec.basis && head(world) === spec.basis && clean(world) && shaFile(promptPath) === seal.prompt, "LIVE_PREPARATION_DRIFT");
  deepStrictEqual(productBinding(), seal.productBinding);
  assert((seal.qualificationSha256 ?? null) === qualificationDigest(), "READINESS_MOCK_QUALIFICATION_DRIFT");
  const before = owner("facts");
  assert(before.head === spec.basis && before.attempts.length === 0 && before.promotions.length === 0, "PRE_RUN_PRODUCT_STATE_DRIFT");
  readDeepSeekKey();
  const cohortId = "work-revision-live-" + scenario + "-" + randomUUID();
  writeJson(join(root, "cohort.json"), { schema: PAID_COHORT_SCHEMA, cohortId, stages: [{ id: "T2" }], ...window });
  writeJson(join(root, "core.json"), { cohortId, budget: null, sessions: [{ id: "T2", condition: "P", world, state,
    expectedHead: spec.basis, killAfterMs: window.wallClockMs, deployment: profile, promptPath }] });
  const ledger = ExecutionBudget.initialize(budgetPath, { schema: USAGE_ONLY_SCHEMA, cohortId, aggregateCeiling: null,
    sessions: [{ id: "T2", ceiling: null, softCeiling: null, maxRequests: window.maxRequests }] });
  const result = { scenario, basis: spec.basis, cohortId, passed: false, usageKnown: false };
  try {
    writeFileSync(lock, JSON.stringify({ scenario, cohortId, basis: spec.basis, at: new Date().toISOString() }) + "\n", { flag: "wx" });
    ledger.startSession("T2");
    console.log("PAID_T2_STARTED", scenario, spec.basis);
    result.execution = await runContainerSession({ run: root, sessionId: "T2", budgetPath, mode: PAID_MODE, repository: runtime, image,
      experiment: { layout: "product", createWorker: options => makeWorkerBroker({ ...options, basis: spec.basis, policy: {
        projectId: spec.projectId, gitIdentity: spec.gitIdentity, requirements: [], checkScope: () => {},
        checkResult(repository, basis, candidate, writeScope, binding) {
          assert(binding?.basis === basis, "WORKER_OBLIGATIONS_NOT_BOUND");
          deepStrictEqual(binding.writePaths, writeScope);
          const preview = inspectWorkRevision(repository, binding, candidate);
          writeJson(join(options.out, `worker-${binding.attemptId}`, "host-preview.json"), preview);
          requireWorkRevision(preview);
          return preview.checks.filter(check => check.kind === "WRITE_SCOPE").map(check => check.path);
        },
      } }) } });
    result.evidence = attribute(root, "T2", PAID_MODE);
    result.usageKnown = result.evidence.usageQualified;
    result.facts = owner("facts");
    requireUsage(result.evidence);
    const facts = result.facts;
    assert(head(world) === spec.basis && facts.head === spec.basis && clean(world) && facts.promotions.length === 0,
      "CANONICAL_WORLD_MOVED_BEFORE_APPROVAL");
    const completed = facts.attempts.filter(attempt => attempt.state === "COMPLETED" && attempt.envelope?.base_commit === spec.basis);
    assert(completed.length === 1, "CANDIDATE_NOT_UNIQUE");
    const attempt = completed[0];
    const receipt = attempt.report?.revision_receipt;
    assert(receipt?.phase === "SETTLED" && receipt.taskId === spec.taskId && receipt.attemptId === attempt.id && receipt.basis === spec.basis &&
      sha(receipt.candidate) && receipt.candidate === attempt.report.result_commit, "SETTLED_OBLIGATION_RECEIPT_NOT_BOUND");
    requireWorkRevision(receipt);
    result.receipt = receipt;
    const broker = result.evidence.workerReceipts.find(row => row.attemptId === attempt.id && row.result === receipt.candidate);
    if (broker) {
      const preview = readJson(join(root, "out/T2", `worker-${attempt.id}`, "host-preview.json"));
      deepStrictEqual(receipt, { ...preview, phase: "SETTLED" });
    }
    result.route = broker ? "formal-worker" : "principal-settlement";
    const gate = owner("gate", attempt.id);
    result.gate = gate;
    await reviewCandidate(result);
    assert(facts.conclusion?.intent === "WAIT_FOR_OPERATOR" && facts.conclusion.seq > before.conclusion.seq, "WAIT_FOR_OPERATOR_NOT_RECORDED");
    result.passed = true;
  } catch (error) {
    result.reason = error.message;
  } finally {
    const accounting = ledger.snapshot();
    result.accounting = { requests: accounting.requests.length, unresolved: accounting.unresolvedRequests, confirmed: accounting.confirmed,
      state: accounting.state, reason: accounting.reason };
    if (accounting.unresolvedRequests || !result.execution) result.usageKnown = false;
    ledger.close();
    writeJson(resultPath, result);
    console.log("PAID_T2_RESULT", scenario, JSON.stringify({ passed: result.passed, usageKnown: result.usageKnown, ...result.accounting,
      candidate: result.receipt?.candidate, gate: result.gate?.verdict, reason: result.reason }));
  }
  if (!result.passed) process.exitCode = 1;
}

async function review() {
  assert(!existsSync(recountPath) && !existsSync(candidatePath), "CANDIDATE_REVIEW_ALREADY_RECORDED");
  const original = readJson(resultPath);
  const result = { ...original, originalResultSha256: shaFile(resultPath), originalReason: original.reason, addedPaidRequests: 0 };
  const outputBase = join(root, "offline-review");
  mkdirSync(outputBase);
  await reviewCandidate(result, outputBase);
  result.passed = result.waitRecorded;
  result.reason = result.waitRecorded ? null : "WAIT_FOR_OPERATOR_NOT_RECORDED";
  writeJson(recountPath, result);
  console.log("OFFLINE_CANDIDATE_REVIEW", scenario, result.receipt.candidate, result.reason ?? "PASS");
}

function accept() {
  const candidate = readJson(candidatePath);
  const reviewed = readJson(existsSync(recountPath) ? recountPath : resultPath);
  assert((reviewed.passed || reviewed.candidateQualified) && sha(values.approve) && values.approve === candidate.commit &&
    reviewed.receipt?.candidate === candidate.commit && reviewed.receipt?.receiptId === candidate.receiptId &&
    head(world) === spec.basis && clean(world), "OWNER_CANDIDATE_SHA_MISMATCH");
  const copy = join(root, "accepted-stage");
  assert(!existsSync(copy), "ACCEPTANCE_ALREADY_STARTED");
  cpSync(stage, copy, { recursive: true });
  const raw = offline("runtime/owner-accept.mjs", [candidate.attemptId, spec.basis, values.approve, candidate.receiptId], copy);
  const accepted = JSON.parse(raw.split(/\r?\n/u).find(row => row.startsWith("REVISION_ACCEPTED ")).slice("REVISION_ACCEPTED ".length));
  const acceptedWorld = join(copy, "world");
  assert(head(acceptedWorld) === accepted.resultingHeadCommit && clean(acceptedWorld) &&
    git(acceptedWorld, "rev-parse", "HEAD^{tree}") === candidate.tree && head(world) === spec.basis, "ACCEPTED_HEAD_NOT_BOUND");
  writeJson(join(root, "acceptance.json"), { ...accepted, approved: values.approve, basis: spec.basis, attemptId: candidate.attemptId,
    receiptId: candidate.receiptId, tree: candidate.tree, recordedAt: new Date().toISOString() });
}

assert(sha(release) && energy.descendant(repo, originalRelease, release) && energy.descendant(repo, release, head(repo)) &&
  git(repo, "diff", "--name-only", release, "--", "src", "host", "package.json", "pnpm-lock.yaml", "tsconfig.json") === "" &&
  docker(["image", "inspect", image, "--format", "{{.Id}}"]) === image, "RELEASE_OR_IMAGE_DRIFT");
if (action === "prepare") prepare();
else if (action === "run") await run();
else if (action === "review") await review();
else accept();
