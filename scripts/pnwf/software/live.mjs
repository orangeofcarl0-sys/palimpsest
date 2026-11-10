#!/usr/bin/env node
/** Owner-side orchestration. The staged model runtime and business assessor come from the qualified main tree. */
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { closeSync, cpSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PAID_COHORT_SCHEMA, PAID_MODE, readDeepSeekKey } from "../bounded_provider.mjs";
import { runContainerSession } from "../container_adapter.mjs";
import { docker } from "../container_runtime.mjs";
import { ExecutionBudget, USAGE_ONLY_SCHEMA } from "../execution_budget.mjs";
import { makeWorkerBroker, stageRuntime } from "../energy/container-worker.mjs";
import { assert, changed, clean, configureGit, descendant, digest, git, head, readJson, sha, writeJson } from "../energy/contract.mjs";
import { attribute } from "../energy/evidence.mjs";
import { CORRECTION, CORRECTION_PATH, FIRST, GUARDED_T2_PROMPT, injectCorrection, PROMPTS, REVIEW, SCENARIO, seedSoftware } from "./contract.mjs";
import { artifactReceipts, bindSoftwareRun, isolated, owner, paths, prepare, preserveBundle, stageSoftwareRuntime, traceSummary, workerPolicy } from "./run.mjs";
import { PUBLISHED_PAIR, restoreOriginalBasis } from "./rerun-basis.mjs";
import { scoreDelivery, scoreReview } from "./score.mjs";

const REPO = fileURLToPath(new URL("../../../", import.meta.url));
const BASE = "268f14f98099b10b181ec9dd1ea4e07ecbe43d31";
const RERUN_BASE = "52451a076d73492b83ac5ea938d413e1993992c5";
const QUALIFICATION = "research-evidence/pnwf-software/2026-11-10/qualification.json";
const FIXTURE = join(REPO, "fixtures/psvr/grpc-migration");
const ARMS = ["P", "F"];
const STAGES = ["T1", "T2", "T3"];
const WINDOW = { maxRequests: 64, wallClockMs: 1800000, requestTimeoutMs: 240000, billingCeiling: null };
const OWNER_GIT = { name: "Software migration trial", email: "software-trial@example.invalid" };

function fileBytes(repo, commit, path) {
  return execFileSync("git", ["-c", "safe.directory=*", "-C", repo, "cat-file", "blob", commit + ":" + path]);
}

function manifest(dir) {
  const files = readdirSync(dir, { recursive: true, withFileTypes: true }).filter(entry => entry.isFile())
    .map(entry => join(entry.parentPath, entry.name)).sort();
  return Object.fromEntries(files.map(path => [relative(dir, path).replaceAll("\\", "/"), digest(readFileSync(path))]));
}

function sha256(path) { return digest(readFileSync(path)); }

const args = new Map(process.argv.slice(2).map(arg => {
  const match = /^--([a-z0-9-]+)(?:=(.*))?$/u.exec(arg);
  assert(match, "INVALID_ARGUMENT");
  return [match[1], match[2] ?? true];
}));
const action = args.get("action");
assert(["prepare", "start", "continue", "accept", "prepare-rerun", "rerun"].includes(action) && typeof args.get("run") === "string", "EXPECTED_PAID_ACTION_AND_RUN");
if (!["prepare", "prepare-rerun"].includes(action)) assert(args.get("execute") === true, "PAID_EXECUTE_FLAG_REQUIRED");
const root = resolve(args.get("run"));
const sealPath = join(root, "paid-seal.json");
const addendumPath = join(root, "paid-addendum.json");
const nativeAddendumPath = join(root, "paid-native-addendum.json");
const rerunSealPath = join(root, "rerun-seal.json");
const rerun = action === "prepare-rerun" || action === "rerun" || existsSync(rerunSealPath);
const qualified = JSON.parse(fileBytes(REPO, BASE, QUALIFICATION).toString("utf8"));
assert(qualified.passed && qualified.paidModelCalls === 0 && qualified.sessions.length === 6, "MOCK_QUALIFICATION_REQUIRED");
const image = qualified.seal.image;
const { runtime, seed } = bindSoftwareRun(root, image);

function contractBinding() {
  assert(head(REPO) === BASE, "CHECKOUT_MUST_MATCH_MAIN_BASE");
  const allowedChanges = new Set(["scripts/pnwf/software/run.mjs", "scripts/pnwf/software/live.mjs"]);
  const scripts = qualified.seal.scripts;
  for (const [path, hash] of Object.entries(scripts)) {
    if (!allowedChanges.has(path)) assert(sha256(join(REPO, path)) === hash, "QUALIFIED_SCRIPT_DRIFT " + path);
  }
  assert(sha256(join(REPO, "scripts/psvr/session_attribution.mjs")) === qualified.seal.attribution, "ATTRIBUTION_DRIFT");
  assert(JSON.stringify(manifest(FIXTURE)) === JSON.stringify(qualified.seal.fixture), "QUALIFIED_FIXTURE_DRIFT");
  assert(Object.entries(PROMPTS).every(([id, prompt]) => digest(prompt) === qualified.seal.prompts[id]), "QUALIFIED_PROMPT_DRIFT");
  assert(docker(["image", "inspect", image, "--format", "{{.Id}}"]) === image, "QUALIFIED_IMAGE_MISSING");
  return {
    base: BASE, qualifiedBlob: git(REPO, "rev-parse", BASE + ":" + QUALIFICATION), image, dsh: qualified.seal.dsh, model: "deepseek-flash",
    mode: PAID_MODE, window: WINDOW, prompts: qualified.seal.prompts, correction: { path: CORRECTION_PATH, sha256: digest(CORRECTION) },
    scorer: { implementation: scripts["scripts/pnwf/software/score.mjs"], probe: scripts["scripts/pnwf/software/probe.cjs"] },
    attribution: qualified.seal.attribution, driver: Object.fromEntries([...allowedChanges].map(path => [path, sha256(join(REPO, path))])),
    order: ["P/T1", "F/T1", "P/T2", "F/T2", "T3 in order of verified owner approvals"],
  };
}

function stagedBinding(binding) {
  const runtimeDigest = digest(JSON.stringify(manifest(runtime)));
  const seedTree = git(seed, "rev-parse", "HEAD^{tree}");
  assert(runtimeDigest === qualified.seal.runtime && seedTree === qualified.seal.seedTree && clean(seed), "QUALIFIED_RUNTIME_OR_SEED_DRIFT");
  return { ...binding, runtime: runtimeDigest, seedCommit: head(seed), seedTree };
}

function rerunBinding() {
  assert(head(REPO) === RERUN_BASE, "CHECKOUT_MUST_MATCH_RERUN_BASE");
  const mockPath = join(root, "mock-qualification.json");
  const mock = readJson(mockPath);
  const principal = mock.sessions?.find(s => s.arm === "P" && s.session === "T2");
  assert(mock.passed && mock.paidModelCalls === 0 && mock.sessions.length === 6 &&
    principal?.trajectory?.streams.some(stream => stream.pairs.some(pair => pair.refusal === "SOFTWARE_REVISION_SCOPE_MISMATCH")),
    "GUARDED_MOCK_QUALIFICATION_REQUIRED");
  const promptHashes = { T2: digest(GUARDED_T2_PROMPT), T3: digest(PROMPTS.T3) };
  const runtimeHash = digest(JSON.stringify(manifest(runtime)));
  assert(mock.seal.image === image && mock.seal.runtime === runtimeHash &&
    mock.seal.prompts.T2 === promptHashes.T2 && mock.seal.prompts.T3 === promptHashes.T3, "RERUN_MOCK_RUNTIME_OR_PROMPT_DRIFT");
  const keys = ["score.mjs", "probe.cjs", "work-policy.mjs", "product-entry.mjs", "contract.mjs", "run.mjs"];
  for (const name of keys) {
    const path = "scripts/pnwf/software/" + name;
    assert(sha256(join(REPO, path)) === mock.seal.scripts[path], "RERUN_MOCK_SCRIPT_DRIFT " + path);
  }
  return {
    base: RERUN_BASE, originalEvidence: git(REPO, "rev-parse", RERUN_BASE + ":" + PUBLISHED_PAIR + "/evidence.json"),
    image, runtime: runtimeHash, mockSha256: sha256(mockPath), mode: PAID_MODE, window: WINDOW, prompts: promptHashes,
    driver: Object.fromEntries(["live.mjs", "rerun-basis.mjs", ...keys].map(name => [name, sha256(join(REPO, "scripts/pnwf/software", name))])),
    bases: Object.fromEntries(ARMS.map(arm => [arm, readJson(join(paths(arm, "T2").run, "replay-basis.json"))])),
  };
}

function prepareRerun() {
  assert(head(REPO) === RERUN_BASE && typeof args.get("mock") === "string" && typeof args.get("from") === "string",
    "RERUN_REQUIRES_MOCK_AND_ORIGINAL_RUN");
  const archive = join(REPO, PUBLISHED_PAIR);
  const original = readJson(join(archive, "evidence.json"));
  assert(original.confirmedRequests === 140 && original.t3.P === "BLOCKED_BY_SCOPE" && original.t3.F === "BLOCKED_BY_SCOPE", "ORIGINAL_PAIR_NOT_BOUND");
  mkdirSync(root);
  stageSoftwareRuntime(REPO, runtime);
  cpSync(join(resolve(args.get("mock")), "qualification.json"), join(root, "mock-qualification.json"));
  const raw = resolve(args.get("from"));
  for (const arm of ARMS) {
    const first = original.cases.find(row => row.arm === arm && row.session === "T1");
    const previous = original.cases.find(row => row.arm === arm && row.session === "T2");
    const p = paths(arm, "T2");
    const input = join(root, "replay-inputs", arm);
    const world = join(input, "basis");
    const proof = restoreOriginalBasis({ archive, source: join(input, "archive"), output: world, previous, first });
    const originalT1 = join(raw, arm, "T1");
    const originalResult = join(originalT1, "result.json");
    assert(sha256(originalResult) === first.originalResultSha256 && first.t1Recount.approved === proof.first, "ORIGINAL_T1_RECEIPT_DRIFT");
    mkdirSync(paths(arm, "T1").run, { recursive: true });
    writeJson(join(paths(arm, "T1").run, "owner-recount.json"), first.t1Recount);
    prepare(p, { world, state: join(originalT1, "stages/T1/state") });
    if (arm === "P") {
      const before = owner(p, "facts");
      assert(before.head === first.basis && before.conclusion?.intent === "DELIVER" && before.attempts.length === 0, "ORIGINAL_PRODUCT_T1_STATE_DRIFT");
      const oldAdmission = readJson(join(raw, arm, "T2", "basis-admission.json"));
      assert(oldAdmission.approved === proof.basis && oldAdmission.priorHead === before.head, "ORIGINAL_T2_ADMISSION_DRIFT");
      const admission = owner(p, "basis", proof.basis, PAID_MODE);
      assert(admission.approved === proof.basis && admission.priorHead === before.head, "RERUN_BASIS_ADMISSION_DRIFT");
      writeJson(join(p.run, "basis-admission.json"), { oldAdmission, admission });
    }
    writeJson(join(p.run, "replay-basis.json"), proof);
  }
  writeJson(rerunSealPath, rerunBinding());
  console.log("RERUN_PREPARED", root);
}

function verifyPaidBinding(binding) {
  const original = readJson(sealPath);
  if (JSON.stringify(binding) === JSON.stringify(original)) return null;
  const { driver, ...common } = binding;
  const { driver: originalDriver, ...originalCommon } = original;
  assert(JSON.stringify(common) === JSON.stringify(originalCommon), "PAID_SEAL_DRIFT");
  for (const [path, hash] of Object.entries(originalDriver)) {
    const name = path.slice(path.lastIndexOf("/") + 1);
    assert(sha256(join(root, "original-host-driver", name)) === hash, "ORIGINAL_PAID_DRIVER_DRIFT");
  }
  const extension = { originalSeal: sha256(sealPath), driver, scope: "Owner-approved request-message alias recount" };
  if (existsSync(addendumPath)) {
    const prior = readJson(addendumPath);
    if (JSON.stringify(extension) === JSON.stringify(prior)) return null;
    const nativeExtension = { ...extension, previousAddendum: sha256(addendumPath),
      scope: "Owner-approved native T1 README navigation and protocol aliases" };
    if (existsSync(nativeAddendumPath)) {
      assert(JSON.stringify(nativeExtension) === JSON.stringify(readJson(nativeAddendumPath)), "PAID_NATIVE_ADDENDUM_DRIFT");
      return null;
    }
    assert(action === "continue" && args.get("arm") === "F", "NATIVE_RECOUNT_CONTINUATION_REQUIRED");
    for (const [path, hash] of Object.entries(prior.driver)) {
      const name = path.slice(path.lastIndexOf("/") + 1);
      assert(sha256(join(root, "first-recount-driver", name)) === hash, "FIRST_RECOUNT_DRIVER_DRIFT");
    }
    return { path: nativeAddendumPath, value: nativeExtension };
  }
  assert(action === "continue", "RECOUNT_CONTINUATION_REQUIRED_FOR_ADDENDUM");
  return { path: addendumPath, value: extension };
}

async function scoreRequestAliases(input, { native = false, includeReadme = false } = {}) {
  const protocol = fileBytes(input.repo, input.commit, "proto/energy.proto").toString("utf8")
    .replace(/\/\*[\s\S]*?\*\/|\/\/[^\r\n]*/gu, "");
  assert(/\bpackage\s+energy\.v1\s*;/u.test(protocol) && /\bservice\s+EnergyService\s*\{/u.test(protocol), "RECOUNT_PROTOCOL_SERVICE_MISMATCH");
  const fields = [
    ["(?:SiteRequest|GetReadingRequest)", /^\s*string\s+site_id\s*=\s*1\s*;\s*$/u],
    ["(?:StreamRequest|StreamReadingsRequest)", /^\s*string\s+site_id\s*=\s*1\s*;\s*u?int32\s+limit\s*=\s*2\s*;\s*$/u],
    ["Reading", native
      ? /^\s*string\s+site_id\s*=\s*1\s*;\s*(?:u?int32|int64)\s+watts\s*=\s*2\s*;\s*int64\s+at_ms\s*=\s*3\s*;\s*$/u
      : /^\s*string\s+site_id\s*=\s*1\s*;\s*u?int32\s+watts\s*=\s*2\s*;\s*int64\s+at_ms\s*=\s*3\s*;\s*$/u],
  ];
  for (const [name, expected] of fields) {
    const body = new RegExp("\\bmessage\\s+" + name + "\\s*\\{([^}]*)\\}", "u").exec(protocol)?.[1];
    assert(body !== undefined && expected.test(body), "RECOUNT_PROTOCOL_FIELD_MISMATCH " + name);
  }
  const entry = new URL("./score.mjs", import.meta.url);
  const frozen = readFileSync(entry, "utf8");
  let source = frozen;
  for (const [from, to] of [["\\(SiteRequest\\)", "\\((?:SiteRequest|GetReadingRequest)\\)"],
    ["\\(StreamRequest\\)", "\\((?:StreamRequest|StreamReadingsRequest)\\)"]]) {
    assert(source.split(from).length === 2, "RECOUNT_FROZEN_RPC_MATCHER_DRIFT");
    source = source.replace(from, to);
  }
  if (includeReadme) {
    const original = "samePaths(changedPaths, FIRST)";
    assert(native && !input.revised && source.split(original).length === 2, "RECOUNT_NATIVE_PATH_MATCHER_DRIFT");
    source = source.replace(original, 'samePaths(changedPaths, [...FIRST, "README.md"])');
  }
  const scorerSha256 = digest(source);
  // Keep all other checks and execute the original probe against the original Git bytes.
  source = source.replace(/from "(\.\.?\/[^"]+)"/gu, (_, path) => "from " + JSON.stringify(new URL(path, entry).href))
    .replaceAll("import.meta.url", JSON.stringify(entry.href));
  const scorer = await import("data:text/javascript;base64," + Buffer.from(source).toString("base64"));
  return { score: scorer.scoreDelivery(input), scorerSha256 };
}

async function scoreStage(p, input) {
  try {
    return { score: scoreDelivery(input), frozenScore: { passed: true } };
  } catch (error) {
    const authorization = join(paths(p.arm, "T1").run, "owner-recount.json");
    if (p.id !== "T2" || error.message !== "SOFTWARE_PROTO_RPC_CONTRACT" || !existsSync(authorization)) throw error;
    const first = readJson(authorization);
    const basisProto = git(input.repo, "rev-parse", input.basis + ":proto/energy.proto");
    assert(first.score.blobs["proto/energy.proto"] === basisProto, "RECOUNT_PROTO_NOT_RETAINED");
    const output = join(p.run, "recount");
    mkdirSync(output);
    return { ...await scoreRequestAliases({ ...input, output: join(output, "scorer") }, { native: p.arm === "F" }),
      frozenScore: { passed: false, reason: error.message }, scoreMode: "owner-approved-alias-recount" };
  }
}

function useKnownUsage() {
  for (const arm of ARMS) for (const id of STAGES) {
    const p = paths(arm, id);
    if (!existsSync(join(p.run, "started.json"))) continue;
    assert(existsSync(join(p.run, "result.json")), "PREVIOUS_PAID_SESSION_UNRESOLVED " + arm + "/" + id);
    const result = readJson(join(p.run, "result.json"));
    assert(result.usageKnown === true, "PREVIOUS_PAID_USAGE_UNRESOLVED " + arm + "/" + id);
  }
}

function snapshotCommit(p, commit, name) {
  const ref = "refs/heads/pnwf-reviewed-" + p.id.toLowerCase();
  git(p.world, "update-ref", ref, commit);
  return preserveBundle(name, p.world, ref);
}

function nativeCandidate(p, basis, evidence) {
  assert(evidence.usageByRole["native-child"]?.requests > 0, "SEPARATE_NATIVE_EXECUTOR_NOT_OBSERVED");
  const prefix = "/run/stage/world/";
  const linked = git(p.world, "worktree", "list", "--porcelain", "-z").split("\0\0").filter(Boolean).flatMap(record => {
    const lines = record.split("\0");
    const path = lines.find(line => line.startsWith("worktree "))?.slice(9);
    const commit = lines.find(line => line.startsWith("HEAD "))?.slice(5);
    if (!(path?.startsWith(prefix) || path?.startsWith("/tmp/")) || !sha(commit) || commit === basis ||
      !descendant(p.world, basis, commit)) return [];
    const ref = lines.find(line => line.startsWith("branch "))?.slice(7) ?? null;
    // A temporary linked worktree disappears with the container. Its registered HEAD and commit
    // are still observable, while cleanliness of its discarded checkout is unknown.
    if (path.startsWith("/tmp/")) return [{ commit, path, ref, clean: null }];
    const peer = resolve(p.world, path.slice(prefix.length));
    const rel = relative(p.world, peer);
    assert(rel && !rel.startsWith("..") && !rel.includes(":"), "NATIVE_WORKTREE_PATH_UNBOUND");
    const pointer = /^gitdir: \/run\/stage\/world\/\.git\/worktrees\/([A-Za-z0-9._-]+)$/u.exec(readFileSync(join(peer, ".git"), "utf8").trim());
    assert(pointer && pointer[1] !== "." && pointer[1] !== "..", "NATIVE_WORKTREE_ADMIN_UNBOUND");
    const bound = (...argv) => git(p.world, "--no-optional-locks", "--git-dir", join(p.world, ".git/worktrees", pointer[1]), "--work-tree", peer, ...argv);
    assert(bound("rev-parse", "HEAD") === commit && bound("status", "--porcelain", "--untracked-files=all") === "", "NATIVE_CANDIDATE_WORKTREE_DIRTY");
    return [{ commit, path, ref, clean: true }];
  });
  const commits = [...new Set(linked.map(row => row.commit))];
  assert(commits.length === 1, "NATIVE_CANDIDATE_WORKTREE_NOT_UNIQUE");
  return { commit: commits[0], route: "native-subagent", worktrees: linked };
}

function formalCandidate(p, basis, facts, evidence) {
  const ready = evidence.workerReceipts.filter(row => row.outcome === "READY_FOR_SETTLEMENT");
  if (!ready.length) {
    if (!rerun || !evidence.usageByRole["native-child"]?.requests) return null;
    const relays = evidence.traces.flatMap((trace, index) => trace.role === "principal"
      ? readJson(join(p.out, "attribution", index + ".timeline.json")).summary.results
          .filter(row => row.facts?.state === "TAKEOVER_SETTLED").map(row => row.facts.resultCommit)
      : []);
    if (!relays.length) return null;
    const attempts = facts.attempts.filter(row => row.state === "COMPLETED" && row.envelope?.base_commit === basis &&
      relays.includes(row.report?.result_commit));
    assert(facts.head === basis && facts.promotions.length === 0 && attempts.length === 1, "TAKEOVER_CANDIDATE_NOT_BOUND");
    const attempt = attempts[0];
    const gate = owner(p, "gate", attempt.id);
    writeJson(join(p.run, "gate.json"), gate);
    return { commit: attempt.report.result_commit, attemptId: attempt.id, route: "governed-takeover", gate: gate.verdict };
  }
  const matches = facts.attempts.filter(row => row.state === "COMPLETED" && row.envelope?.base_commit === basis &&
    ready.some(receipt => receipt.attemptId === row.id && receipt.result === row.report?.result_commit));
  assert(facts.head === basis && facts.promotions.length === 0 && matches.length === 1, "FORMAL_CANDIDATE_NOT_BOUND");
  const attempt = matches[0];
  const receipt = ready.find(row => row.attemptId === attempt.id);
  assert(sha(receipt.result) && receipt.sessionId && receipt.qualification && receipt.exit?.code === 0 &&
    evidence.traces.some(row => row.role === "worker" && row.id === receipt.sessionId && row.modelSteps.length > 0), "FORMAL_WORKER_NOT_ATTRIBUTED");
  const worker = join(p.out, "worker-" + attempt.id);
  const gate = owner(p, "gate", attempt.id);
  writeJson(join(p.run, "gate.json"), gate);
  return { commit: receipt.result, attemptId: attempt.id, route: "formal-worker", gate: gate.verdict, receipt,
    repo: join(worker, "stage/world"), isolation: isolated(readJson(join(worker, "qualification.json"))) };
}

function toolVerification(p, evidence) {
  return evidence.traces.map((trace, index) => {
    const data = readJson(join(p.out, "attribution", index + ".timeline.json")).summary;
    return { role: trace.role, id: trace.id, modelSteps: trace.modelSteps, refusals: trace.refs,
      toolChoices: data.calls.filter(call => /^(work:|continuity:|subagent|workflow|palimpsest_worker_result)/u.test(call.kind))
        .map(call => ({ id: call.callId, seq: call.seq, kind: call.kind, args: call.args })) };
  });
}

async function runStage(p, acceptance = null) {
  useKnownUsage();
  const { arm, id } = p;
  const startedPath = join(p.run, "started.json");
  const resultPath = join(p.run, "result.json");
  assert(!existsSync(startedPath) && !existsSync(resultPath), "PAID_STAGE_ALREADY_RUN");
  const basis = head(p.world);
  assert(sha(basis) && clean(p.world), "PAID_STAGE_WORLD_NOT_CLEAN");
  if (id === "T3") assert(acceptance?.approvedHead === basis && acceptance.tree === git(p.world, "rev-parse", "HEAD^{tree}"), "ACCEPTED_T3_BASIS_MISMATCH");
  const product = arm === "P";
  const before = product ? owner(p, "facts") : null;
  if (product && id !== "T1") assert(before.head === basis, "PRODUCT_BASIS_NOT_ADMITTED");
  const promptPath = join(p.run, "prompt.txt");
  writeFileSync(promptPath, rerun && id === "T2" ? GUARDED_T2_PROMPT : PROMPTS[id]);
  const cohortId = "software-paid-" + arm + "-" + id + "-" + randomUUID();
  writeJson(join(p.run, "cohort.json"), { schema: PAID_COHORT_SCHEMA, cohortId, stages: [{ id }], ...WINDOW });
  writeJson(join(p.run, "core.json"), { cohortId, budget: null, sessions: [{ id, condition: arm, world: p.world, state: p.state,
    expectedHead: basis, killAfterMs: WINDOW.wallClockMs, deployment: p.profile, promptPath }] });
  const budgetPath = join(p.run, "request-ledger.sqlite");
  const ledger = ExecutionBudget.initialize(budgetPath, { schema: USAGE_ONLY_SCHEMA, cohortId, aggregateCeiling: null,
    sessions: [{ id, ceiling: null, softCeiling: null, maxRequests: WINDOW.maxRequests }] });
  const result = { arm, session: id, mode: PAID_MODE, cohortId, basis, acceptance, passed: false, usageKnown: false,
    checks: { artifactsPresent: false, businessCorrect: false, persisted: false, settlement: null, accepted: acceptance ? true : id === "T2" ? false : null, naturalExit: false } };
  const checks = result.checks;
  let candidate;
  try {
    writeFileSync(startedPath, JSON.stringify({ at: new Date().toISOString(), cohortId, basis }) + "\n", { flag: "wx" });
    console.log("PAID_STARTED", arm, id, basis);
    ledger.startSession(id);
    result.execution = await runContainerSession({ run: p.run, sessionId: id, budgetPath, mode: PAID_MODE, repository: runtime, image,
      experiment: { layout: product ? "product" : "native", acceptance: acceptance ? join(p.run, "acceptance.json") : undefined,
        ...(product && id === "T2" ? { createWorker: options => makeWorkerBroker({ ...options, basis, policy: workerPolicy }) } : {}) } });
    checks.naturalExit = result.execution.natural;
    const evidence = attribute(p.run, id, PAID_MODE);
    result.usageKnown = evidence.usageQualified && evidence.traces.filter(row => row.role === "principal").length === 1;
    result.trajectory = traceSummary(p, evidence, false);
    result.roles = toolVerification(p, evidence);
    result.workerReceipts = evidence.workerReceipts;
    result.isolation = isolated(readJson(join(p.out, "qualification.json")));
    const current = head(p.world);
    result.current = current;
    result.dirty = !clean(p.world);
    const facts = product ? owner(p, "facts") : null;
    const fresh = facts?.conclusion?.seq > (before?.conclusion?.seq ?? 0);
    if (facts) result.product = { head: facts.head, conclusion: fresh ? facts.conclusion.intent : null, attempts: facts.attempts,
      promotions: facts.promotions, events: facts.events.filter(row => !before.events.some(prior => prior.id === row.id)) };
    if (id === "T2") {
      assert(current === basis && !result.dirty, "T2_CHANGED_CANONICAL_WORLD_BEFORE_APPROVAL");
      candidate = (product && formalCandidate(p, basis, facts, evidence)) || nativeCandidate(p, basis, evidence);
      result.route = candidate.route;
      checks.settlement = candidate.attemptId ? candidate.gate === "PASS" : null;
      result.candidate = { commit: candidate.commit, attemptId: candidate.attemptId ?? null, gate: candidate.gate ?? null,
        worktrees: candidate.worktrees ?? null, workerIsolation: candidate.isolation ?? null };
      checks.persisted = true;
      if (candidate.route === "formal-worker") {
        result.bundle = preserveBundle(arm + "-T2.bundle", candidate.repo, "refs/heads/pnwf-worker-result");
      } else {
        result.bundle = snapshotCommit(p, candidate.commit, arm + "-T2.bundle");
      }
    } else {
      checks.persisted = current !== basis && descendant(p.world, basis, current);
      assert(checks.persisted && !result.dirty, "DIRECT_DELIVERY_NOT_CLEANLY_COMMITTED");
      result.bundle = preserveBundle(arm + "-" + id + ".bundle", p.world, "HEAD");
      if (fresh && facts.conclusion.intent === "DELIVER") {
        try { result.deliveryReceipt = artifactReceipts(p.world, facts, current, id === "T1" ? FIRST : [REVIEW], before.head); }
        catch (error) { result.deliveryReceiptFailure = error.message; }
      }
    }
    const commit = candidate?.commit ?? current;
    const repo = candidate?.repo ?? p.world;
    const required = id === "T3" ? [REVIEW] : FIRST;
    checks.artifactsPresent = required.every(path => /^100644 blob /u.test(git(repo, "ls-tree", commit, "--", path)));
    if (id === "T3") result.score = scoreReview({ repo, basis, commit });
    else Object.assign(result, await scoreStage(p, { repo, basis, commit, revised: id === "T2", output: join(p.run, "scorer"), image }));
    checks.businessCorrect = true;
    assert(result.usageKnown && checks.naturalExit && checks.settlement !== false, "STAGE_EXIT_USAGE_OR_GATE_NOT_QUALIFIED");
    if (candidate) {
      const ready = { ...result.candidate, route: candidate.route, basis, tree: result.score.tree, commit, readyAt: new Date().toISOString() };
      writeJson(join(p.run, "candidate.json"), ready);
      const patch = execFileSync("git", ["-c", "safe.directory=*", "-C", repo, "diff", "--no-ext-diff", basis, commit, "--"]);
      writeFileSync(join(p.run, "candidate-review.patch"), patch);
    }
    result.passed = true;
  } catch (error) {
    result.reason = error.message;
    console.error("PAID_OBSERVATION", arm, id, result.reason);
  } finally {
    const accounting = ledger.snapshot();
    result.accounting = { state: accounting.state, reason: accounting.reason, requests: accounting.requests.length,
      unresolved: accounting.unresolvedRequests, confirmed: accounting.confirmed };
    if (accounting.unresolvedRequests || !result.execution) result.usageKnown = false;
    ledger.close();
    writeJson(resultPath, result);
    console.log("PAID_RESULT", arm, id, JSON.stringify({ passed: result.passed, usageKnown: result.usageKnown, checks, route: result.route,
      commit: result.score?.commit ?? result.candidate?.commit ?? result.current, requests: result.accounting.requests, reason: result.reason }));
  }
  return result;
}

function secondStage(arm, authorizedScore = null) {
  const from = paths(arm, "T1");
  const p = paths(arm, "T2");
  const first = readJson(join(from.run, "result.json"));
  const score = authorizedScore ?? (first.passed ? first.score : null);
  assert(score?.commit === head(from.world), "FIRST_DELIVERY_NOT_QUALIFIED");
  prepare(p, from);
  const basis = injectCorrection(p.world);
  const pathsChanged = changed(p.world, score.commit, basis);
  assert(pathsChanged.length === 1 && pathsChanged[0] === CORRECTION_PATH &&
    digest(fileBytes(p.world, basis, CORRECTION_PATH)) === digest(CORRECTION), "FROZEN_FLEET_CORRECTION_DRIFT");
  writeJson(join(p.run, "correction.json"), { path: CORRECTION_PATH, sha256: digest(CORRECTION), first: score.commit, commit: basis });
  if (arm === "P") {
    const admission = owner(p, "basis", basis, PAID_MODE);
    assert(admission.approved === basis, "T2_BASIS_ADMISSION_MISMATCH");
    writeJson(join(p.run, "basis-admission.json"), admission);
  }
  return p;
}

function approve(arm, approved) {
  const from = paths(arm, "T2");
  const next = paths(arm, "T3");
  const result = readJson(join(from.run, "result.json"));
  const candidate = readJson(join(from.run, "candidate.json"));
  assert(result.passed && result.score.commit === approved && candidate.commit === approved && sha(approved) &&
    head(from.world) === candidate.basis && !existsSync(next.run), "CANDIDATE_APPROVAL_SHA_MISMATCH");
  const decisionAt = new Date().toISOString();
  let promotion = null;
  let admission = null;
  if (candidate.attemptId) {
    prepare(next, from);
    promotion = owner(next, "promote", candidate.attemptId, candidate.basis, approved);
  } else if (arm === "P") {
    prepare(next, from);
    assert(git(next.world, "rev-parse", "refs/heads/pnwf-reviewed-t2") === approved, "REVIEWED_NATIVE_REF_DRIFT");
    git(next.world, "merge", "--ff-only", approved);
    admission = owner(next, "basis", approved, PAID_MODE);
  } else {
    mkdirSync(next.stage, { recursive: true });
    mkdirSync(next.state);
    git(from.world, "clone", "--quiet", "--no-local", "--no-hardlinks", "--no-checkout", "--", from.world, next.world);
    configureGit(next.world, OWNER_GIT);
    assert(git(next.world, "rev-parse", "refs/remotes/origin/pnwf-reviewed-t2") === approved, "REVIEWED_NATIVE_REF_DRIFT");
    git(next.world, "checkout", "--quiet", "--detach", candidate.basis);
    git(next.world, "remote", "remove", "origin");
    git(next.world, "merge", "--ff-only", approved);
  }
  const approvedHead = head(next.world);
  const tree = git(next.world, "rev-parse", "HEAD^{tree}");
  assert(tree === candidate.tree && clean(next.world) && approvedHead === (promotion?.resultingHeadCommit ?? approved) &&
    (!admission || admission.approved === approved), "ACCEPTED_TREE_MISMATCH");
  const acceptance = { kind: promotion ? "GOVERNED_PROMOTION" : "OWNER_ACCEPTED_GIT", approvedCandidate: approved, approvedHead,
    basis: candidate.basis, tree, promotion, admission, readyAt: candidate.readyAt, decisionAt,
    waitingMs: Date.parse(decisionAt) - Date.parse(candidate.readyAt) };
  writeJson(join(next.run, "acceptance.json"), acceptance);
  writeFileSync(join(next.world, "acceptance.json"), "", { flag: "wx" });
  return { next, acceptance };
}

async function start() {
  assert(ARMS.every(arm => !existsSync(paths(arm, "T1").run)), "PAIR_ALREADY_STARTED");
  const first = new Map();
  for (const arm of ARMS) {
    const p = paths(arm, "T1");
    prepare(p);
    configureGit(p.world, OWNER_GIT);
    if (arm === "P") owner(p, "initialize", head(seed));
    first.set(arm, await runStage(p));
    useKnownUsage();
  }
  for (const arm of ARMS) {
    if (!first.get(arm).passed) continue;
    await runStage(secondStage(arm));
    useKnownUsage();
  }
}

async function continueWithRecount(arm, approved) {
  const p = paths(arm, "T1");
  const resultPath = join(p.run, "result.json");
  const original = readJson(resultPath);
  const native = arm === "F";
  const reason = native ? "SOFTWARE_T1_ARTIFACTS_MISMATCH" : "SOFTWARE_PROTO_RPC_CONTRACT";
  assert(sha(approved) && original.current === approved && head(p.world) === approved && clean(p.world) && original.usageKnown &&
    original.checks.naturalExit && original.reason === reason && !existsSync(paths(arm, "T2").run), "FIRST_RECOUNT_SHA_MISMATCH");
  const output = join(p.run, "owner-recount");
  mkdirSync(output);
  const recount = await scoreRequestAliases({ repo: p.world, basis: original.basis, commit: approved, revised: false, output: join(output, "scorer"), image },
    { native, includeReadme: native });
  writeJson(join(p.run, "owner-recount.json"), { approved, decisionAt: new Date().toISOString(), originalResultSha256: sha256(resultPath),
    frozenReason: original.reason, ...recount });
  console.log("T1_RECOUNT_PASS", arm, approved, recount.score.publicTests);
  await runStage(secondStage(arm, recount.score));
}

let lock;
try {
  if (action === "prepare-rerun") {
    prepareRerun();
  } else if (rerun) {
    assert(["rerun", "accept"].includes(action) && JSON.stringify(rerunBinding()) === JSON.stringify(readJson(rerunSealPath)), "PAID_RERUN_SEAL_DRIFT");
    assert(readDeepSeekKey(), "PAID_GATEWAY_CREDENTIAL_MISSING");
    const lockPath = join(root, ".paid-command");
    const fd = openSync(lockPath, "wx");
    lock = lockPath;
    closeSync(fd);
    useKnownUsage();
    if (action === "rerun") {
      assert(ARMS.every(arm => !existsSync(join(paths(arm, "T2").run, "started.json"))), "PAIR_ALREADY_STARTED");
      for (const arm of ARMS) {
        const p = paths(arm, "T2");
        assert(head(p.world) === readJson(join(p.run, "replay-basis.json")).basis, "RERUN_BASIS_DRIFT");
        await runStage(p);
        useKnownUsage();
      }
    } else {
      const arm = args.get("arm");
      assert(ARMS.includes(arm), "UNKNOWN_ARM");
      const { next, acceptance } = approve(arm, args.get("approve"));
      await runStage(next, acceptance);
    }
  } else if (action === "prepare") {
    const binding = contractBinding();
    mkdirSync(root);
    stageRuntime({ repo: REPO, destination: runtime });
    cpSync(fileURLToPath(new URL("./product-entry.mjs", import.meta.url)), join(runtime, "runtime/product-entry.mjs"));
    writeJson(join(runtime, "runtime/scenario.json"), SCENARIO);
    mkdirSync(seed);
    seedSoftware(seed, FIXTURE);
    writeJson(sealPath, stagedBinding(binding));
    console.log("PREPARED", root);
  } else {
    const extension = verifyPaidBinding(stagedBinding(contractBinding()));
    assert(readDeepSeekKey(), "PAID_GATEWAY_CREDENTIAL_MISSING");
    const lockPath = join(root, ".paid-command");
    const fd = openSync(lockPath, "wx");
    lock = lockPath;
    closeSync(fd);
    useKnownUsage();
    if (extension) writeJson(extension.path, extension.value);
    if (action === "start") await start();
    else {
      const arm = args.get("arm");
      assert(ARMS.includes(arm), "UNKNOWN_ARM");
      if (action === "continue") await continueWithRecount(arm, args.get("first"));
      else {
        const { next, acceptance } = approve(arm, args.get("approve"));
        await runStage(next, acceptance);
      }
    }
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  if (lock) unlinkSync(lock);
}
