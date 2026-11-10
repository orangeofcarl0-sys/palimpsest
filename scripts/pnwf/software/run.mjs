#!/usr/bin/env node
import { throws } from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { startBoundedProxy } from "../bounded_provider.mjs";
import { runContainerSession } from "../container_adapter.mjs";
import { docker } from "../container_runtime.mjs";
import { ExecutionBudget } from "../execution_budget.mjs";
import { startMockProvider } from "../mock_provider.mjs";
import { makeWorkerBroker, stageRuntime } from "../energy/container-worker.mjs";
import { assert, changed, clean, commitAll, configureGit, descendant, digest, git, head, readJson, sha, writeJson } from "../energy/contract.mjs";
import { attribute, requireUsage } from "../energy/evidence.mjs";
import { pendingCandidate, profileFor } from "../energy/product.mjs";
import { checkScope, CORRECTION_PATH, GIT_IDENTITY, GUARDED_T2_PROMPT, injectCorrection, FIRST, PROMPTS, REVIEW, revisionResult, SCENARIO, SCOPE_GUIDANCE, seedSoftware } from "./contract.mjs";
import { qualificationReply, scriptedArtifacts } from "./mock.mjs";
import { OFFLINE, scoreDelivery, scoreReview } from "./score.mjs";

const REPO = fileURLToPath(new URL("../../../", import.meta.url));
const FIXTURE = join(REPO, "fixtures/psvr/grpc-migration");
let root, runtime, seed;
const CEILING = 12000000;
const WINDOW_MS = 180000;
export const workerPolicy = {
  projectId: SCENARIO.projectId, checkScope, checkResult: revisionResult, gitIdentity: GIT_IDENTITY,
  requirements: ["Apply the Fleet compatibility correction in " + CORRECTION_PATH + ". " + SCOPE_GUIDANCE],
};
let image, artifacts, seedCommit;
const sessions = [];
const controls = {};

export function bindSoftwareRun(directory, imageId) {
  root = resolve(directory);
  runtime = join(root, "runtime");
  seed = join(root, "seed");
  image = imageId;
  return { runtime, seed };
}

export function stageSoftwareRuntime(repository, destination) {
  stageRuntime({ repo: repository, destination });
  const mount = join(destination, "runtime");
  for (const [folder, files] of [
    ["software", ["contract.mjs", "work-policy.mjs"]],
    ["energy", ["contract.mjs", "revision-scope.mjs"]],
  ]) {
    mkdirSync(join(mount, folder));
    for (const file of files) cpSync(join(repository, "scripts/pnwf", folder, file), join(mount, folder, file));
  }
  cpSync(fileURLToPath(new URL("./product-entry.mjs", import.meta.url)), join(mount, "product-entry.mjs"));
  writeJson(join(mount, "scenario.json"), SCENARIO);
}

export function paths(arm, id) {
  const run = join(root, arm, id);
  const stage = join(run, "stages", id);
  return { arm, id, run, stage, world: join(stage, "world"), state: join(stage, "state"),
    out: join(run, "out", id), profile: join(run, "profile.json") };
}

export function prepare(p, from) {
  mkdirSync(p.stage, { recursive: true });
  cpSync(from?.world ?? seed, p.world, { recursive: true });
  if (p.arm === "P" && from) cpSync(from.state, p.state, { recursive: true });
  else mkdirSync(p.state);
  if (p.arm === "P") profileFor({ ...SCENARIO, ...p, path: p.profile });
}

export function owner(p, action, ...values) {
  const raw = docker(["run", "--rm", "--network", "none", ...OFFLINE, "--tmpfs", "/tmp:rw,nosuid,nodev,uid=1001,gid=1001",
    "-e", "HOME=/tmp", "-e", "GIT_CONFIG_COUNT=1", "-e", "GIT_CONFIG_KEY_0=safe.directory", "-e", "GIT_CONFIG_VALUE_0=*",
    "-v", runtime + ":/product:ro", "-v", p.stage + ":/run/stage", image,
    "node", "/product/scripts/pnwf/energy/owner-command.mjs", action, ...values]);
  const prefix = "ENERGY_OWNER_RESULT ";
  const line = raw.split(/\r?\n/u).find(value => value.startsWith(prefix));
  assert(line, "OWNER_RESULT_NOT_OBSERVED");
  return JSON.parse(line.slice(prefix.length));
}

function initializeLedger(path, cohortId, ...ids) {
  return ExecutionBudget.initialize(path, { schema: "pnwf-request-budget/v1", cohortId, aggregateCeiling: CEILING,
    sessions: ids.map(id => ({ id, ceiling: CEILING, softCeiling: CEILING })) });
}

async function verifyMissingUsage() {
  const dir = join(root, "missing-usage");
  mkdirSync(dir);
  const budget = initializeLedger(join(dir, "request-ledger.sqlite"), "software-missing-usage", "current", "next");
  const mock = await startMockProvider({ fault: "missing-usage" });
  let gateway;
  try {
    budget.startSession("current");
    const sessionKey = randomBytes(32).toString("hex");
    gateway = await startBoundedProxy({ provider: mock.config, budget, sessionId: "current", sessionKey });
    const response = await fetch(gateway.url + "/v1/messages", { method: "POST", headers: { "x-api-key": sessionKey },
      body: JSON.stringify({ model: "deepseek-flash", stream: true, max_tokens: 400, messages: [{ role: "user", content: "qualification" }] }) });
    writeFileSync(join(dir, "response.txt"), await response.text());
    const state = budget.snapshot();
    writeJson(join(dir, "request-accounting.json"), state);
    assert(mock.calls.length === 1 && state.state === "STOPPED" && state.unresolvedRequests === 1 && state.confirmed === 0 && state.reserved > 0,
      "MISSING_USAGE_NOT_FAIL_CLOSED");
    throws(() => budget.startSession("next"), { code: "COHORT_STOPPED" });
    const next = budget.snapshot().sessions.find(row => row.id === "next").state;
    assert(next === "NOT_STARTED", "MISSING_USAGE_ADMITTED_NEXT_SESSION");
    return { reason: state.reason, nextRefusal: "COHORT_STOPPED", unresolvedRequests: state.unresolvedRequests, next };
  } finally {
    await gateway?.close();
    await mock.close();
    budget.close();
  }
}

export function artifactReceipts(repo, facts, commit, paths, episodeBasis) {
  const body = facts.conclusion?.body;
  const receipt = JSON.parse(body?.split(/\r?\n/u).find(line => line.startsWith('{"schema":"pc1-episode-conclusion/v1"')) ?? "null");
  assert(receipt?.intent === "DELIVER" && receipt.basis.headCommit === episodeBasis, "EPISODE_DELIVER_BASIS_NOT_RECORDED");
  const artifacts = receipt.check.artifacts;
  assert(artifacts?.length === paths.length && paths.every(path => {
    const record = artifacts.find(item => item.path === path);
    const bytes = execFileSync("git", ["-c", "safe.directory=*", "-C", repo, "cat-file", "blob", commit + ":" + path]);
    return record?.committed && record.commit === commit && record.digest === digest(bytes);
  }), "DELIVER_ARTIFACT_RECEIPTS_NOT_BOUND");
  return { id: receipt.conclusionId, episodeBasis, artifacts };
}

export function traceSummary(p, evidence, strict = true) {
  const streams = evidence.traces.map((trace, index) => {
    const data = readJson(join(p.out, "attribution", index + ".timeline.json")).summary;
    const results = new Map(data.results.map(row => [row.callId, row]));
    if (strict) assert(data.calls.length === results.size && data.calls.every(call => results.has(call.callId)), "SOFTWARE_TRACE_PAIRS_INCOMPLETE");
    return { id: trace.id, role: trace.role, digest: trace.digest, counts: trace.counts, failedJobs: trace.failedJobs,
      pairs: data.calls.map(call => {
        const result = results.get(call.callId);
        return { callId: call.callId, callSeq: call.seq, resultSeq: result?.seq ?? null, tool: call.kind.split(" ", 1)[0], ok: result?.ok ?? null,
          refusal: result?.refusalReason ?? null };
      }) };
  });
  const observationPath = join(p.out, "request-observations.jsonl");
  const observations = existsSync(observationPath) ? readFileSync(observationPath, "utf8").trim().split("\n").filter(Boolean).map(line => JSON.parse(line)) : [];
  return { streams, requestLedger: observations.map(({ kind, requestId, actor, usage }) => ({ kind, requestId, actor, usage })),
    requestIdsBound: evidence.requestIdsBound, tupleMatch: evidence.tupleMatch, requests: evidence.requests,
    usageByRole: evidence.usageByRole, unresolvedRequests: evidence.unresolvedRequests, elapsedMs: evidence.elapsedMs };
}

export function isolated(qualification) {
  assert(qualification.checks.some(row => row.name === "no_external_evaluator" && row.status === "ALLOW") &&
    qualification.checks.some(row => row.name === "native_shell_harness" && row.status === "DENIED"), "EVALUATOR_ISOLATION_NOT_OBSERVED");
  const { containerId, descriptorDigest, descriptor, checks, worlds } = qualification;
  return { containerId, descriptorDigest, imageId: descriptor.imageId, user: descriptor.user, network: descriptor.network,
    mounts: descriptor.mounts.map(({ destination, writable }) => ({ destination, writable })), checks, worlds };
}

async function session(p, acceptance) {
  const { arm, id } = p;
  const basis = head(p.world);
  assert(sha(basis) && clean(p.world), "SESSION_WORLD_NOT_CLEAN");
  const formal = arm === "P" && id === "T2";
  if (acceptance) assert(acceptance.approvedHead === basis && acceptance.tree === git(p.world, "rev-parse", "HEAD^{tree}"), "T3_ACCEPTED_HEAD_MISMATCH");
  const before = arm === "P" ? owner(p, "facts") : null;
  if (formal) assert(before.head === basis, "PRODUCT_BASIS_NOT_ADMITTED");
  if (before && acceptance) assert(before.head === basis && before.events.some(event => event.type === "PROMOTION_COMMITTED" &&
    event.entityId === acceptance.promotion.promotionId), "T3_ACCEPTED_PRODUCT_STATE_MISMATCH");
  const promptPath = join(p.run, "prompt.txt");
  writeFileSync(promptPath, id === "T2" ? GUARDED_T2_PROMPT : PROMPTS[id]);
  const cohortId = "software-" + arm + "-" + id + "-" + randomUUID();
  writeJson(join(p.run, "core.json"), { cohortId, budget: CEILING, sessions: [{ id, condition: arm, world: p.world,
    state: p.state, expectedHead: basis, killAfterMs: WINDOW_MS, deployment: p.profile, promptPath }] });
  const budgetPath = join(p.run, "request-ledger.sqlite");
  const ledger = initializeLedger(budgetPath, cohortId, id);
  const mock = await startMockProvider({ reply: qualificationReply({ arm, session: id, basis, artifacts }) });
  const checks = { artifactsPresent: false, businessCorrect: false, persisted: false, settlement: null,
    accepted: acceptance ? true : id === "T2" ? false : null, naturalExit: false };
  const result = { arm, session: id, cohortId, basis, checks, passed: false };
  try {
    ledger.startSession(id);
    await runContainerSession({ run: p.run, sessionId: id, budgetPath, provider: mock.config, repository: runtime, image,
      experiment: { layout: arm === "P" ? "product" : "native", acceptance: acceptance ? join(p.run, "acceptance.json") : undefined,
        ...(formal ? { createWorker: options => makeWorkerBroker({ ...options, basis, policy: workerPolicy }) } : {}) } });
    const evidence = attribute(p.run, id, "mock");
    checks.naturalExit = evidence.natural;
    requireUsage(evidence);
    assert(mock.failures.length === 0, "MOCK_PROVIDER_FAILURE " + mock.failures.join(" | "));
    result.trajectory = traceSummary(p, evidence);
    result.isolation = isolated(readJson(join(p.out, "qualification.json")));
    const current = head(p.world);
    const facts = before ? owner(p, "facts") : null;
    assert(clean(p.world), "SESSION_WORLD_DIRTY");
    let candidate;
    let evaluated = p.world;
    if (id === "T2") {
      assert(current === basis, "T2_MOVED_CANONICAL_HEAD_BEFORE_APPROVAL");
      candidate = formal ? pendingCandidate(facts, evidence.workerReceipts, basis) : { commit: git(p.world, "rev-parse", "refs/heads/software-candidate") };
      if (formal) {
        checkScope(candidate.receipt.writeScope);
        const dir = join(p.out, "worker-" + candidate.attemptId);
        evaluated = join(dir, "stage", "world");
        result.workerIsolation = isolated(readJson(join(dir, "qualification.json")));
        const gate = owner(p, "gate", candidate.attemptId);
        writeJson(join(p.run, "gate.json"), gate);
        assert(gate.verdict === "PASS" && evidence.workerRequests > 0 && facts.conclusion.seq > before.conclusion.seq, "FORMAL_SETTLEMENT_NOT_OBSERVED");
        checks.settlement = true;
        result.conclusion = { intent: facts.conclusion.intent, eventId: facts.conclusion.eventId };
        result.attempt = { id: candidate.attemptId, outcome: candidate.receipt.outcome, gate: gate.verdict, scope: candidate.receipt.writeScope };
      } else {
        assert(evidence.usageByRole["native-child"]?.requests > 0, "NATIVE_CHILD_NOT_OBSERVED");
        const peer = join(p.world, ".palimpsest/native-candidate");
        // The linked-worktree pointer uses the container's absolute path. Bind its admin directory explicitly on the host.
        assert(readFileSync(join(peer, ".git"), "utf8").trim() === "gitdir: /run/stage/world/.git/worktrees/native-candidate",
          "NATIVE_CANDIDATE_WORKTREE_NOT_BOUND");
        const linked = (...args) => git(p.world, "--no-optional-locks", "--git-dir", join(p.world, ".git/worktrees/native-candidate"),
          "--work-tree", peer, ...args);
        assert(linked("rev-parse", "HEAD") === candidate.commit && linked("status", "--porcelain", "--untracked-files=all") === "",
          "NATIVE_CANDIDATE_WORKTREE_DIRTY");
      }
    } else {
      assert(current !== basis && descendant(p.world, basis, current), "DIRECT_DELIVERY_NOT_PERSISTED");
      if (facts) {
        assert(facts.conclusion?.seq > (before.conclusion?.seq ?? 0) && facts.attempts.length === before.attempts.length, "DIRECT_CONCLUSION_NOT_OBSERVED");
        result.conclusion = artifactReceipts(p.world, facts, current, id === "T1" ? FIRST : [REVIEW], before.head);
      }
    }
    result.score = id === "T3" ? scoreReview({ repo: p.world, basis, commit: current }) :
      scoreDelivery({ repo: evaluated, basis, commit: candidate?.commit ?? current, revised: id === "T2", output: join(p.run, "scorer"), image });
    if (candidate) {
      writeJson(join(p.run, "candidate.json"), { ...candidate, basis, tree: result.score.tree, commit: result.score.commit });
      if (formal) result.bundle = preserveBundle("P-candidate.bundle", evaluated, "refs/heads/pnwf-worker-result");
    }
    if (id === "T3") result.bundle = preserveBundle(arm + "-project.bundle", p.world, "HEAD");
    checks.artifactsPresent = checks.businessCorrect = checks.persisted = true;
    result.passed = true;
    sessions.push(result);
    console.log(arm, id, "PASS", result.score.commit, "requests", evidence.requests);
  } catch (error) {
    result.reason = error.message;
    throw error;
  } finally {
    writeJson(join(p.run, "result.json"), result);
    writeJson(join(p.run, "mock-requests.json"), { requests: mock.requests, failures: mock.failures });
    ledger.close();
    await mock.close();
  }
  return result;
}

function accept(from, next, candidate, approved) {
  assert(sha(approved) && approved === candidate.commit && head(from.world) === candidate.basis, "CANDIDATE_APPROVAL_SHA_MISMATCH");
  if (from.arm === "P") prepare(next, from);
  else {
    mkdirSync(next.stage, { recursive: true });
    mkdirSync(next.state);
    git(from.world, "clone", "--quiet", "--no-local", "--no-hardlinks", "--no-checkout", "--", from.world, next.world);
    configureGit(next.world, GIT_IDENTITY);
    assert(git(next.world, "rev-parse", "refs/remotes/origin/software-candidate") === approved, "NATIVE_CANDIDATE_REF_DRIFT");
    git(next.world, "checkout", "--quiet", "--detach", candidate.basis);
    git(next.world, "remote", "remove", "origin");
  }
  const promotion = from.arm === "P" ? owner(next, "promote", candidate.attemptId, candidate.basis, approved) : null;
  if (!promotion) git(next.world, "merge", "--ff-only", approved);
  const approvedHead = head(next.world);
  const tree = git(next.world, "rev-parse", "HEAD^{tree}");
  assert(clean(next.world) && tree === candidate.tree && approvedHead === (promotion?.resultingHeadCommit ?? approved), "ACCEPTED_TREE_MISMATCH");
  const record = { kind: promotion ? "GOVERNED_PROMOTION" : "OWNER_ACCEPTED_GIT", approvedCandidate: approved,
    approvedHead, tree, basis: candidate.basis, promotion };
  writeJson(join(next.run, "acceptance.json"), record);
  writeFileSync(join(next.world, "acceptance.json"), "", { flag: "wx" });
  return record;
}

export function preserveBundle(name, repo, ref) {
  const path = join(root, name);
  git(repo, "bundle", "create", path, ref);
  git(repo, "bundle", "verify", path);
  return { name, sha256: digest(readFileSync(path)) };
}

async function verifyWorkerRefusals(second, basis) {
  const dir = join(root, "worker-refusals");
  mkdirSync(dir);
  const broker = makeWorkerBroker({ out: dir, basis, policy: workerPolicy });
  try {
    const refused = await broker.dispatch({ workDir: "/run/stage/world/.palimpsest/worlds/mock-refusal",
      context: { work: { baseCommit: seedCommit } } });
    assert(refused.kind === "HOST_FAILURE" && refused.detail === "WORKER_REQUEST_BASIS_MISMATCH", "WRONG_WORKER_BASIS_NOT_REFUSED");
    controls.wrongWorkerBasis = refused.detail;
  } finally { await broker.close(); }
  const peer = join(dir, "world");
  cpSync(second.world, peer, { recursive: true });
  for (const [path, body] of Object.entries(artifacts.revised)) writeFileSync(join(peer, path), body);
  writeFileSync(join(peer, "README.md"), "Out-of-scope changes in a proposed Worker result.\n");
  const result = commitAll(peer, "Probe an out-of-scope result");
  throws(() => workerPolicy.checkResult(peer, basis, result), /SOFTWARE_RESULT_OUTSIDE_SCOPE/u);
  controls.outsideScope = { reason: "SOFTWARE_RESULT_OUTSIDE_SCOPE", basis, result, paths: changed(peer, basis, result) };
  writeJson(join(dir, "outside-scope.json"), controls.outsideScope);
}

function freeze() {
  const files = dir => readdirSync(dir, { recursive: true, withFileTypes: true }).filter(entry => entry.isFile())
    .map(entry => join(entry.parentPath, entry.name)).sort();
  const manifest = (dir, base = dir) => Object.fromEntries(files(dir).map(path => [relative(base, path).replaceAll("\\", "/"), digest(readFileSync(path))]));
  const evidence = { implementationHead: head(REPO), image, dsh: "0.2.1-rc.5", seedCommit,
    seedTree: git(seed, "rev-parse", "HEAD^{tree}"), scenario: SCENARIO.projectId, mockWallClockMs: WINDOW_MS,
    prompts: Object.fromEntries(Object.entries({ ...PROMPTS, T2: GUARDED_T2_PROMPT }).map(([id, prompt]) => [id, digest(prompt)])),
    fixture: manifest(FIXTURE), scripts: manifest(join(REPO, "scripts/pnwf"), REPO),
    attribution: digest(readFileSync(join(REPO, "scripts/psvr/session_attribution.mjs"))),
    runtime: digest(JSON.stringify(manifest(runtime))) };
  writeJson(join(root, "seal.json"), evidence);
  return evidence;
}

async function qualify() {
const [action, runArg, ...extra] = process.argv.slice(2);
assert(action === "--action=qualify" && runArg?.startsWith("--run=") && runArg.length > 6 && extra.length === 0,
  "Usage: node scripts/pnwf/software/run.mjs --action=qualify --run=<new directory>");
bindSoftwareRun(runArg.slice(6));
mkdirSync(root);
let seal;
try {
  image = docker(["image", "inspect", "palimpsest-pnwf-isolation:local", "--format", "{{.Id}}"]);
  stageSoftwareRuntime(REPO, runtime);
  mkdirSync(seed);
  seedCommit = seedSoftware(seed, FIXTURE);
  artifacts = scriptedArtifacts(FIXTURE);
  seal = freeze();
  controls.missingUsage = await verifyMissingUsage();
  for (const arm of ["P", "F"]) {
    const first = paths(arm, "T1");
    prepare(first);
    if (arm === "P") owner(first, "initialize", seedCommit);
    const t1 = await session(first);
    const second = paths(arm, "T2");
    prepare(second, first);
    const basis = injectCorrection(second.world);
    const changes = changed(second.world, t1.score.commit, basis);
    assert(changes.length === 1 && changes[0] === CORRECTION_PATH, "CORRECTION_WRITE_SCOPE_MISMATCH");
    const correction = { commit: basis, prior: t1.score.commit, path: CORRECTION_PATH,
      sha256: digest(readFileSync(join(second.world, CORRECTION_PATH))) };
    writeJson(join(second.run, "correction.json"), correction);
    let admission;
    if (arm === "P") {
      await verifyWorkerRefusals(second, basis);
      admission = owner(second, "basis", basis, "mock");
      assert(admission.approved === basis, "BASIS_ADMISSION_SHA_MISMATCH");
      writeJson(join(second.run, "basis-admission.json"), admission);
    }
    const t2 = await session(second);
    t2.correction = correction;
    if (admission) t2.admission = admission;
    const candidate = readJson(join(second.run, "candidate.json"));
    const third = paths(arm, "T3");
    throws(() => accept(second, third, candidate, basis), /CANDIDATE_APPROVAL_SHA_MISMATCH/u);
    assert(!existsSync(third.run), "WRONG_APPROVAL_MUTATED_NEXT_SESSION");
    controls["wrongApproval" + arm] = "CANDIDATE_APPROVAL_SHA_MISMATCH";
    t2.acceptance = accept(second, third, candidate, candidate.commit);
    writeJson(join(second.run, "result.json"), t2);
    await session(third, t2.acceptance);
  }
  controls.scorerIsolation = { principals: sessions.length, worker: sessions.filter(row => row.workerIsolation).length };
  writeJson(join(root, "qualification.json"), { passed: true, paidModelCalls: 0, seal, controls, sessions });
  console.log("QUALIFIED", root);
} catch (error) {
  writeJson(join(root, "qualification.json"), { passed: false, paidModelCalls: 0, reason: error.message, seal, controls, sessions });
  console.error(error);
  process.exitCode = 1;
}
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await qualify();
