/** Host driver. Each command is restartable between Sessions; a started Session is never replayed. */
import { execFileSync } from "node:child_process";
import { throws } from "node:assert/strict";
import { closeSync, cpSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { ExecutionBudget, USAGE_ONLY_SCHEMA } from "../execution_budget.mjs";
import { PAID_COHORT_SCHEMA, PAID_MODE } from "../bounded_provider.mjs";
import { runContainerSession } from "../container_adapter.mjs";
import { docker } from "../container_runtime.mjs";
import { startMockProvider } from "../mock_provider.mjs";
import { attribute, requireUsage } from "./evidence.mjs";
import { makeWorkerBroker, stageRuntime } from "./container-worker.mjs";
import { CONTEXT_VARIANTS, revisionPrompt } from "./context-variants.mjs";
import { pendingCandidate, profileFor } from "./product.mjs";
import { qualificationReply } from "./mock.mjs";
import { CERTIFICATES, requireRevisionScope, REVISION_PATHS } from "./revision-scope.mjs";
import { REVISION_WORKER_WAIT_MS } from "./revision-work.mjs";
import { ACCEPTANCE, BASE, BULLETIN, CORRECTION, PROMPTS, WORK_T2_PROMPT, assert, checkPackage, checkReview, changed, clean, digest,
  descendant, git, head, injectCorrection, makeSeed, readJson, sha, writeJson } from "./contract.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../../..");
const FIXTURE = join(REPO, "fixtures/psvr/energy-deployment");
const args = new Map(process.argv.slice(2).map(value => { const [key, ...parts] = value.slice(2).split("="); return [key, parts.join("=")]; }));
const root = resolve(args.get("run") || join(tmpdir(), `pnwf-energy-${randomUUID()}`));
const runtime = join(root, "runtime");
const seed = join(root, "seed");
const sealPath = join(root, "contract.json");
const qualificationPath = join(root, "qualification.json");
const fixedWindow = { maxRequests: 64, wallClockMs: 1800000, requestTimeoutMs: 240000, billingCeiling: null };
const mockWindowMs = 180000;

const note = (status, fields = {}) => process.stdout.write(JSON.stringify({ status, ...fields }) + "\n");
const readSeal = () => readJson(sealPath);
const experimentFiles = () => [...readdirSync(HERE, { recursive: true }).filter(file => /\.(?:mjs|js|json)$/u.test(file)).map(file => join(HERE, file)),
  ...["container_adapter", "container_runtime", "container_bridge", "bounded_provider", "execution_budget", "world_preflight", "mock_provider"].map(name => join(HERE, `../${name}.mjs`)),
  join(REPO, "scripts/psvr/session_attribution.mjs"), join(REPO, "pnpm-lock.yaml")];
function digestFiles(files, base) {
  return digest(files.sort().map(file => `${file.slice(base.length).replaceAll("\\", "/")}\0${digest(readFileSync(file))}\n`).join(""));
}
const runtimeDigest = () => digestFiles(readdirSync(runtime, { recursive: true, withFileTypes: true })
  .filter(entry => entry.isFile()).map(entry => join(entry.parentPath, entry.name)), runtime);

function initialize(prior) {
  assert(descendant(REPO, BASE, head(REPO)), "UNEXPECTED_IMPLEMENTATION_BASE");
  const variant = args.get("variant") ?? "baseline";
  assert(variant === "baseline" || CONTEXT_VARIANTS.includes(variant), "UNKNOWN_T2_CONTEXT_VARIANT");
  if (variant !== "baseline") {
    assert(prior && args.has("reuse-basis") && args.has("compare-to"), "T2_CONTEXT_VARIANT_REQUIRES_APPROVED_CONTROL");
  }
  mkdirSync(root);
  stageRuntime({ repo: REPO, destination: runtime, variant });
  const previous = prior ? readJson(join(prior, "contract.json")) : null;
  if (previous) cpSync(join(prior, "seed"), seed, { recursive: true });
  const seedCommit = previous ? head(seed) : makeSeed(seed, FIXTURE);
  const image = docker(["image", "inspect", previous?.image ?? args.get("image") ?? "palimpsest-pnwf-isolation:local", "--format", "{{.Id}}"]);
  const seal = { schema: "pnwf-energy-contract/v1", base: BASE, implementationHead: head(REPO), scripts: digestFiles(experimentFiles(), REPO),
    runtime: runtimeDigest(), seedCommit, seedTree: git(seed, "rev-parse", "HEAD^{tree}"), image,
    bulletin: { path: BULLETIN, sha256: digest(CORRECTION) }, prompts: Object.fromEntries(Object.entries(PROMPTS).map(([session, prompt]) => [session, digest(prompt)])),
    scorer: digest(readFileSync(join(FIXTURE, "check.mjs"))), model: "deepseek-flash", dsh: "0.2.1-rc.5", window: fixedWindow,
    revisionScope: { writePaths: REVISION_PATHS, preservedPath: CERTIFICATES, workT2Prompt: digest(revisionPrompt(variant)), workerWaitMs: REVISION_WORKER_WAIT_MS } };
  if (previous) {
    assert(["base", "seedCommit", "seedTree", "image", "bulletin", "scorer", "model", "dsh", "window"].every(key =>
      JSON.stringify(seal[key]) === JSON.stringify(previous[key])), "RECOUNT_EXPERIMENT_INPUT_DRIFT");
    assert(seal.prompts.T1 === previous.prompts.T1 && seal.prompts.T3 === previous.prompts.T3, "RECOUNT_PROMPT_DRIFT");
    if (seal.prompts.T2 !== previous.prompts.T2) {
      assert(args.has("reuse-basis"), "RECOUNT_T2_SCOPE_CHANGE_REQUIRES_REUSED_BASIS");
      seal.revisionScope.priorT2Prompt = previous.prompts.T2;
    }
    seal.recountOf = digest(readFileSync(join(prior, "contract.json")));
  }
  if (variant !== "baseline") {
    const control = resolve(args.get("compare-to"));
    const reference = readJson(join(control, "contract.json"));
    const resultBytes = readFileSync(join(control, "live/P/T2/result.json"));
    const result = JSON.parse(resultBytes);
    const approval = readJson(join(resolve(args.get("reuse-basis")), "live/P/T2/basis-owner-observation.json"));
    assert(result.passed && result.evidence.valid && result.basis === approval.commit && approval.decision === "APPROVED" &&
      result.facts.conclusion?.intent === "WAIT_FOR_OPERATOR", "T2_CONTEXT_CONTROL_BASIS_MISMATCH");
    assert(["seedCommit", "seedTree", "image", "bulletin", "prompts", "scorer", "model", "dsh", "window"].every(key =>
      JSON.stringify(seal[key]) === JSON.stringify(reference[key])) &&
      reference.revisionScope?.workT2Prompt === digest(WORK_T2_PROMPT) &&
      reference.revisionScope.workerWaitMs === REVISION_WORKER_WAIT_MS &&
      JSON.stringify(reference.revisionScope.writePaths) === JSON.stringify(REVISION_PATHS) &&
      reference.revisionScope.preservedPath === CERTIFICATES, "T2_CONTEXT_CONTROL_DRIFT");
    seal.contextVariant = { name: variant, approvedBasis: approval.commit, controlResultSha256: digest(resultBytes) };
  }
  writeJson(sealPath, seal);
  return seal;
}

function verifySeal() {
  const seal = readSeal();
  assert(seal.scripts === digestFiles(experimentFiles(), REPO) && seal.runtime === runtimeDigest() &&
    seal.scorer === digest(readFileSync(join(FIXTURE, "check.mjs"))) && seal.seedCommit === head(seed) && clean(seed), "FROZEN_EXPERIMENT_DRIFT");
  return seal;
}

function sessionPaths(mode, arm, session) {
  const group = join(root, mode === "mock" ? "mock" : "live", arm);
  const run = join(group, session);
  const stage = join(run, "stages", session);
  return { group, run, stage, world: join(stage, "world"), state: join(stage, "state"), profile: join(run, "profile.json"),
    result: join(run, "result.json"), review: join(run, "operator-review.json"), started: join(run, "started.json") };
}

function owner(p, action, ...values) {
  const raw = docker(["run", "--rm", "--network", "none", "--read-only", "--cap-drop", "ALL", "--security-opt", "no-new-privileges",
    "--user", "1001:1001", "--tmpfs", "/tmp:rw,nosuid,nodev,uid=1001,gid=1001", "-e", "HOME=/tmp", "-e", "GIT_CONFIG_COUNT=1",
    "-e", "GIT_CONFIG_KEY_0=safe.directory", "-e", "GIT_CONFIG_VALUE_0=*", "-v", `${runtime}:/product:ro`, "-v", `${p.stage}:/run/stage`,
    readSeal().image, "node", "/product/scripts/pnwf/energy/owner-command.mjs", action, ...values]);
  const line = raw.split(/\r?\n/u).find(value => value.startsWith("ENERGY_OWNER_RESULT "));
  assert(line, "OWNER_RESULT_NOT_OBSERVED");
  return JSON.parse(line.slice("ENERGY_OWNER_RESULT ".length));
}

function createStage(p, arm, from) {
  mkdirSync(p.stage, { recursive: true });
  cpSync(from?.world ?? seed, p.world, { recursive: true });
  if (arm === "P" && from) cpSync(from.state, p.state, { recursive: true });
  else mkdirSync(p.state);
  if (arm === "P") profileFor({ world: p.world, state: p.state, path: p.profile });
}

function prepareSecond(mode, arm, first) {
  const p = sessionPaths(mode, arm, "T2");
  assert(!existsSync(p.run), "T2_ALREADY_PREPARED");
  createStage(p, arm, first);
  const commit = injectCorrection(p.world);
  writeJson(p.review, { kind: "DIRECT_BASIS", arm, first: head(first.world), commit, correctionSha256: digest(CORRECTION),
    changedPaths: changed(p.world, head(first.world), commit), readyAt: new Date().toISOString() });
  if (mode === PAID_MODE && arm === "P") note("AWAITING_BASIS_APPROVAL", { arm, commit, review: p.review });
}

function copyApprovedBasis(previousRoot, first) {
  const previous = join(previousRoot, "live/P/T2");
  const previousWorld = join(previous, "stages/T2/world");
  const review = readJson(join(previous, "operator-review.json"));
  const approval = readJson(join(previous, "basis-owner-observation.json"));
  assert(approval.decision === "APPROVED" && sha(approval.commit) && review.commit === approval.commit && head(previousWorld) === review.commit &&
    review.first === head(first.world) && git(previousWorld, "rev-parse", "HEAD^") === review.first && clean(previousWorld), "REUSED_BASIS_APPROVAL_MISMATCH");
  const changes = changed(previousWorld, review.first, review.commit);
  assert(changes.length === 1 && changes[0] === BULLETIN && review.correctionSha256 === digest(CORRECTION) &&
    digest(readFileSync(join(previousWorld, BULLETIN))) === review.correctionSha256, "REUSED_BASIS_CORRECTION_MISMATCH");
  const next = sessionPaths(PAID_MODE, "P", "T2");
  assert(!existsSync(next.run) && !existsSync(join(previous, "started.json")), "REUSED_BASIS_SESSION_ALREADY_STARTED");
  createStage(next, "P", { world: previousWorld, state: first.state });
  writeJson(next.review, review);
  writeJson(join(next.run, "basis-owner-observation.json"), approval);
  note("OWNER_APPROVED_BASIS_CARRIED_FORWARD", { commit: review.commit, review: next.review });
}

function importRescoredT1(prior, seal) {
  const qualification = readJson(join(prior, "qualification.json"));
  assert(qualification.passed && qualification.paidModelCalls === 0, "ORIGINAL_QUALIFICATION_MISSING");
  const source = join(prior, "live/P/T1");
  const raw = readFileSync(join(source, "result.json"));
  const first = JSON.parse(raw);
  assert(first.passed === false && first.arm === "P" && first.session === "T1" && first.mode === PAID_MODE &&
    first.basis === seal.seedCommit && first.evidence?.valid && first.facts?.conclusion?.intent === "DELIVER" &&
    first.facts.attempts.length === 0 && /technical-capacity: NR selects undefined/u.test(first.reason ?? "") &&
    /schedule: HF is missing/u.test(first.reason ?? ""), "ORIGINAL_T1_NOT_ELIGIBLE_FOR_SITE_ALIAS_RECOUNT");
  const sourceStage = join(source, "stages/T1");
  const world = join(sourceStage, "world");
  const commit = head(world);
  const body = first.facts.conclusion.body.split("\n").findLast(line => line.startsWith('{"schema":"pc1-episode-conclusion/v1"'));
  const conclusion = JSON.parse(body);
  assert(sha(commit) && commit === args.get("commit") && clean(world) && conclusion.check.artifacts.length === 6 &&
    conclusion.check.artifacts.every(artifact => artifact.commit === commit && artifact.committed && artifact.tracked && artifact.present), "ORIGINAL_T1_GIT_NOT_BOUND_TO_DELIVERY");
  const next = sessionPaths(PAID_MODE, "P", "T1");
  mkdirSync(next.run, { recursive: true });
  const business = checkPackage({ repo: world, commit, basis: first.basis, fixture: FIXTURE, output: join(next.run, "scorer") });
  assert(business.normalizations.length === 3, "SITE_ALIAS_RECOUNT_DID_NOT_EXPLAIN_ORIGINAL_FAILURE");
  cpSync(sourceStage, next.stage, { recursive: true });
  cpSync(join(source, "out"), join(next.run, "out"), { recursive: true });
  cpSync(join(source, "started.json"), next.started);
  writeFileSync(join(next.run, "result.original.json"), raw);
  writeJson(next.result, { ...first, passed: true, reason: null, business,
    checks: { ...first.checks, artifactsPresent: true, businessCorrect: true, persisted: true },
    scoringRecount: { originalResultSha256: digest(raw), originalStatus: "STOPPED", originalReason: first.reason,
      inputCommit: commit, scope: "Host-only exact aliases North Ridge/NR and Harbor Flats/HF", addedPaidRequests: 0 } });
  note("REAL_T1_RECOUNT_PASSED", { commit, requests: first.evidence.requests, totalTokens: first.evidence.totalTokens, result: next.result });
  if (args.has("reuse-basis")) copyApprovedBasis(resolve(args.get("reuse-basis")), next);
  else prepareSecond(PAID_MODE, "P", next);
}

function approveBasis(mode, approved) {
  const p = sessionPaths(mode, "P", "T2");
  const review = readJson(p.review);
  assert(sha(approved) && approved === review.commit && head(p.world) === approved && clean(p.world), "BASIS_APPROVAL_SHA_MISMATCH");
  if (mode === PAID_MODE && readSeal().contextVariant) {
    assert(approved === readSeal().contextVariant.approvedBasis, "T2_CONTEXT_CONTROL_BASIS_MISMATCH");
  }
  const receipt = join(p.run, "basis-admission.json");
  assert(!existsSync(p.started) && !existsSync(receipt), "BASIS_ALREADY_APPLIED");
  assert(digest(readFileSync(join(p.world, BULLETIN))) === review.correctionSha256, "BASIS_BULLETIN_DRIFT");
  const result = owner(p, "basis", approved, mode);
  writeJson(receipt, { ...result, waitMs: Date.parse(result.recordedAt) - Date.parse(review.readyAt), mode });
  note("BASIS_ADMITTED", { commit: approved, arm: "P", receipt });
}

function nativeCandidate(world, basis) {
  assert(head(world) === basis && clean(world), "NATIVE_CANONICAL_HEAD_CHANGED");
  const refs = git(world, "for-each-ref", "--format=%(objectname)", "refs/heads").split("\n").filter(sha);
  const candidates = [...new Set(refs)].filter(commit => commit !== basis && descendant(world, basis, commit));
  assert(candidates.length === 1, "NATIVE_CANDIDATE_NOT_UNIQUE");
  return { commit: candidates[0] };
}

function approveCandidate(mode, arm, approved) {
  const from = sessionPaths(mode, arm, "T2");
  const candidate = readJson(join(from.run, "candidate.json"));
  assert(readJson(from.result).passed && sha(approved) && approved === candidate.commit && head(from.world) === candidate.basis, "CANDIDATE_APPROVAL_SHA_MISMATCH");
  const p = sessionPaths(mode, arm, "T3");
  assert(!existsSync(p.run), "ACCEPTANCE_ALREADY_STARTED");
  createStage(p, arm, from);
  const promotion = arm === "P" ? owner(p, "promote", candidate.attemptId, candidate.basis, approved) : null;
  if (arm === "F") git(p.world, "merge", "--ff-only", approved);
  const approvedHead = head(p.world);
  const approvedTree = git(p.world, "rev-parse", `${approvedHead}^{tree}`);
  const candidateTree = candidate.tree;
  assert(sha(approvedHead) && clean(p.world) && approvedTree === candidateTree && (promotion === null || promotion.resultingHeadCommit === approvedHead), "ACCEPTED_TREE_MISMATCH");
  const acceptance = { kind: arm === "P" ? "GOVERNED_PROMOTION" : "OWNER_ACCEPTED_GIT", mode, arm, approvedCandidate: approved, approvedHead,
    tree: approvedTree, basis: candidate.basis, attemptId: candidate.attemptId ?? null, promotion, recordedAt: new Date().toISOString(),
    waitMs: Date.now() - Date.parse(candidate.readyAt) };
  writeJson(join(p.run, ACCEPTANCE), acceptance);
  writeFileSync(join(p.world, ACCEPTANCE), "", { flag: "wx" });
  note("CANDIDATE_ACCEPTED", { arm, commit: approved, approvedHead, acceptance: join(p.run, ACCEPTANCE) });
}

async function runSession(mode, arm, session) {
  const p = sessionPaths(mode, arm, session);
  const seal = readSeal();
  assert(!existsSync(p.started), "SESSION_ALREADY_STARTED");
  if (session === "T1") {
    assert(!existsSync(p.run), "INITIAL_SESSION_ALREADY_PREPARED");
    createStage(p, arm, null);
    if (arm === "P") owner(p, "initialize", seal.seedCommit);
  }
  const basis = head(p.world);
  assert(sha(basis) && clean(p.world), "SESSION_WORLD_NOT_CLEAN");
  if (session === "T2") {
    assert(readJson(sessionPaths(mode, arm, "T1").result).passed && readJson(p.review).commit === basis, "T2_PREREQUISITE_MISSING");
    if (arm === "P") assert(readJson(join(p.run, "basis-admission.json")).approved === basis, "T2_BASIS_APPROVAL_MISSING");
  }
  const acceptancePath = session === "T3" ? join(p.run, ACCEPTANCE) : undefined;
  if (acceptancePath) {
    const receipt = readJson(acceptancePath);
    assert(receipt.approvedHead === basis && receipt.tree === git(p.world, "rev-parse", "HEAD^{tree}"), "T3_ACCEPTED_HEAD_MISMATCH");
  }
  const productBefore = arm === "P" ? owner(p, "facts") : null;
  const promptPath = join(p.run, "prompt.txt");
  const formalRevision = arm === "P" && session === "T2";
  const variant = formalRevision ? seal.contextVariant?.name : undefined;
  writeFileSync(promptPath, formalRevision ? revisionPrompt(variant) : PROMPTS[session]);
  assert((formalRevision ? seal.revisionScope.workT2Prompt : seal.prompts[session]) === digest(readFileSync(promptPath)), "PROMPT_DRIFT");
  const cohortId = `energy-${arm}-${session}-${randomUUID()}`;
  const paid = mode === PAID_MODE;
  const mockCeiling = 12000000;
  const killAfterMs = paid ? fixedWindow.wallClockMs : mockWindowMs;
  writeJson(join(p.run, "cohort.json"), { schema: paid ? PAID_COHORT_SCHEMA : "pnwf-qualification-cohort/v1", cohortId, stages: [{ id: session }],
    ...(paid ? fixedWindow : { aggregateCeiling: mockCeiling, sessionCeiling: mockCeiling, reserveTokens: 0 }) });
  writeJson(join(p.run, "core.json"), { cohortId, budget: paid ? null : mockCeiling, sessions: [{ id: session, condition: arm, world: p.world,
    state: p.state, expectedHead: basis, killAfterMs, deployment: p.profile, promptPath }] });
  const budgetPath = join(p.run, "request-ledger.sqlite");
  const ledger = ExecutionBudget.initialize(budgetPath, paid ? { schema: USAGE_ONLY_SCHEMA, cohortId, aggregateCeiling: null,
    sessions: [{ id: session, ceiling: null, softCeiling: null, maxRequests: fixedWindow.maxRequests }] } :
    { schema: "pnwf-request-budget/v1", cohortId, aggregateCeiling: mockCeiling, sessions: [{ id: session, ceiling: mockCeiling, softCeiling: mockCeiling }] });
  const mock = paid ? null : await startMockProvider({ reply: qualificationReply({ arm, session, accepted: basis, variant }), delayMs: 180 });
  const experiment = { layout: arm === "P" ? "product" : "native", acceptance: acceptancePath,
    ...(formalRevision ? { createWorker: options => makeWorkerBroker({ ...options, basis, variant }) } : {}) };
  let evidence = null;
  let business = null;
  let facts = null;
  const checks = { artifactsPresent: false, businessCorrect: false, persisted: false, settlement: null, accepted: session === "T3" ? true : null, naturalExit: false };
  try {
    writeJson(p.started, { at: new Date().toISOString(), cohortId, mode, basis });
    ledger.startSession(session);
    await runContainerSession({ run: p.run, sessionId: session, budgetPath, provider: mock?.config, mode, repository: runtime, image: seal.image, experiment });
    evidence = attribute(p.run, session, mode, variant);
    checks.naturalExit = evidence.natural;
    if (arm === "P") facts = owner(p, "facts");
    const current = head(p.world);
    assert(clean(p.world), "SESSION_LEFT_UNCOMMITTED_CHANGES");
    requireUsage(evidence);
    let candidate = null;
    if (session === "T2") {
      assert(current === basis, "T2_MOVED_CANONICAL_HEAD_BEFORE_APPROVAL");
      candidate = arm === "P" ? pendingCandidate(facts, evidence.workerReceipts, basis) : nativeCandidate(p.world, basis);
      if (arm === "P") {
        requireRevisionScope(candidate.receipt.writeScope);
        assert(candidate.receipt.preservedPath === CERTIFICATES, "WORKER_CERTIFICATE_SCOPE_NOT_OBSERVED");
      }
      if (variant === "receipt") {
        assert(["principal", "worker"].every(role => evidence.traces.some(trace => trace.role === role &&
          trace.contextActions.some(action => action.kind === "receipt" && action.ok && action.commit === candidate.commit))),
        "REVISION_RECEIPT_NOT_OBSERVED_FOR_CANDIDATE");
      }
      if (variant === "brief-pulse") {
        assert(evidence.traces.some(trace => trace.role === "principal" &&
          trace.contextActions.some(action => action.kind === "brief-pulse" && action.ok)), "BRIEF_PULSE_NOT_OBSERVED");
      }
      checks.settlement = arm === "P" ? true : null;
      checks.accepted = false;
    }
    if (session === "T3") {
      business = checkReview({ repo: p.world, commit: current, accepted: basis });
    } else {
      const first = session === "T2" ? readJson(p.review).first : null;
      const commit = candidate?.commit ?? current;
      // A governed candidate's objects live in the Attempt, not the canonical Git directory yet.
      const evaluated = arm === "P" && candidate ? join(p.run, "out", session, `worker-${candidate.attemptId}`, "stage", "world") : p.world;
      business = checkPackage({ repo: evaluated, commit, basis, first, fixture: FIXTURE, output: join(p.run, "scorer") });
    }
    checks.artifactsPresent = checks.businessCorrect = checks.persisted = true;
    if (arm === "P") {
      assert(facts.conclusion?.seq > (productBefore?.conclusion?.seq ?? 0), "FRESH_EPISODE_CONCLUSION_MISSING");
      if (session !== "T2") {
        assert(facts.conclusion.intent === "DELIVER" && facts.attempts.length === productBefore.attempts.length, "DIRECT_DELIVERY_NOT_RECORDED");
      } else {
        const gate = owner(p, "gate", candidate.attemptId);
        assert(gate.verdict === "PASS", "CANDIDATE_GATE_NOT_PASSING");
        assert(evidence.workerRequests > 0, "WORKER_PROVIDER_USAGE_NOT_OBSERVED");
        candidate.gate = gate.verdict;
      }
    }
    if (session === "T2" && arm === "F" && mode === "mock") assert(evidence.usageByRole["native-child"]?.requests > 0, "NATIVE_CHILD_NOT_OBSERVED");
    if (candidate) {
      const review = { ...candidate, basis, readyAt: new Date().toISOString(), artifactCommit: business.commit, recommendation: business.recommendation,
        changedPaths: business.changedPaths, artifacts: business.artifacts, tree: business.tree };
      writeJson(join(p.run, "candidate.json"), review);
      if (paid) note("AWAITING_CANDIDATE_APPROVAL", { arm, commit: candidate.commit, review: join(p.run, "candidate.json") });
    }
    writeJson(p.result, { passed: true, arm, session, mode, basis, checks, evidence, business, facts });
    note("SESSION_PASSED", { mode, arm, session, requests: evidence.requests, natural: evidence.natural, commit: business.commit });
    if (session === "T1") prepareSecond(mode, arm, p);
  } catch (error) {
    writeJson(p.result, { passed: false, arm, session, mode, basis, checks, evidence, business, facts, reason: error.message });
    note("SESSION_STOPPED", { mode, arm, session, reason: error.message, result: p.result });
    throw error;
  } finally {
    if (mock) writeJson(join(p.run, "mock-requests.json"), { requests: mock.requests, failures: mock.failures });
    ledger.close();
    await mock?.close();
  }
}

async function qualify() {
  const prior = args.has("adopt-t1") ? resolve(args.get("adopt-t1")) : null;
  const seal = initialize(prior);
  try {
    if (prior) importRescoredT1(prior, seal);
    const tests = execFileSync(process.execPath, ["--test", "scripts/pnwf/qualification.test.mjs", "scripts/pnwf/energy/contract.test.mjs"],
      { cwd: REPO, encoding: "utf8", timeout: 90000 });
    writeFileSync(join(root, "negative-tests.log"), tests);
    const failures = [];
    for (const arm of seal.contextVariant ? ["P"] : ["P", "F"]) {
      try {
        await runSession("mock", arm, "T1");
        const second = sessionPaths("mock", arm, "T2");
        if (arm === "P") {
          const review = readJson(second.review);
          throws(() => approveBasis("mock", review.first), /BASIS_APPROVAL_SHA_MISMATCH/u);
          approveBasis("mock", review.commit);
        }
        await runSession("mock", arm, "T2");
        const candidate = readJson(join(second.run, "candidate.json"));
        assert(sha(candidate.commit), "MOCK_CANDIDATE_UNREADABLE");
        throws(() => approveCandidate("mock", arm, candidate.basis), /CANDIDATE_APPROVAL_SHA_MISMATCH/u);
        assert(!existsSync(sessionPaths("mock", arm, "T3").run), "REJECTED_APPROVAL_MUTATED_NEXT_SESSION");
        approveCandidate("mock", arm, candidate.commit);
        await runSession("mock", arm, "T3");
      } catch (error) {
        failures.push({ arm, reason: error.message });
        note("MOCK_ARM_BLOCKED", failures.at(-1));
      }
    }
    assert(failures.length === 0, failures.map(entry => `${entry.arm} ${entry.reason}`).join(" | "));
    writeJson(qualificationPath, { passed: true, paidModelCalls: 0, seal: digest(JSON.stringify(seal)), completedAt: new Date().toISOString() });
    note("QUALIFIED", { run: root });
  } catch (error) {
    writeJson(qualificationPath, { passed: false, paidModelCalls: 0, reason: error.message, completedAt: new Date().toISOString() });
    throw error;
  }
}

let lock = null;
try {
  const action = args.get("action") || "qualify";
  if (action === "qualify") await qualify();
  else {
    lock = join(root, ".active-command");
    const fd = openSync(lock, "wx");
    try { writeFileSync(fd, `${process.pid}\n`); } finally { closeSync(fd); }
    const seal = verifySeal();
    const qualification = readJson(qualificationPath);
    assert(qualification.passed && qualification.paidModelCalls === 0 && qualification.seal === digest(JSON.stringify(seal)), "ZERO_PAID_QUALIFICATION_REQUIRED");
    const arm = args.get("arm") || "P";
    assert(arm === "P" || arm === "F", "UNKNOWN_ARM");
    if (arm === "F") assert(readJson(sessionPaths(PAID_MODE, "P", "T3").result).passed, "PALIMPSEST_VERTICAL_REQUIRED");
    if (action === "basis" && arm === "P") approveBasis(PAID_MODE, args.get("approve"));
    else if (action === "accept") approveCandidate(PAID_MODE, arm, args.get("approve"));
    else if (action === "live") {
      assert(args.has("execute") && Object.hasOwn(PROMPTS, args.get("session")), "EXPLICIT_LIVE_SESSION_REQUIRED");
      if (seal.contextVariant) assert(arm === "P" && args.get("session") === "T2", "T2_CONTEXT_VARIANT_SESSION_REQUIRED");
      await runSession(PAID_MODE, arm, args.get("session"));
    } else throw new Error("UNKNOWN_ACTION");
  }
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
} finally {
  if (lock !== null) {
    // Leave a lock from a different process alone, including an interrupted operator command.
    try { if (readFileSync(lock, "utf8") === `${process.pid}\n`) unlinkSync(lock); } catch { /* no owned lock */ }
  }
}
