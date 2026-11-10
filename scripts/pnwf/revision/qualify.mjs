import { deepStrictEqual, equal, ok, rejects } from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { cpSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { installProduct, inspectWorkRevision, WorkRevisionError } from "../../../dist/src/product.js";
import { deriveProjectStandard } from "../../../dist/src/deployment/standard.js";
import { runContainerSession } from "../container_adapter.mjs";
import { docker } from "../container_runtime.mjs";
import { ExecutionBudget } from "../execution_budget.mjs";
import { startMockProvider } from "../mock_provider.mjs";
import { makeWorkerBroker, stageRuntime } from "../energy/container-worker.mjs";
import * as energy from "../energy/contract.mjs";
import { attribute, requireUsage } from "../energy/evidence.mjs";
import { packageFiles } from "../energy/mock.mjs";
import { conclusion, profileFor } from "../energy/product.mjs";
import * as grpc from "../software/contract.mjs";
import { scriptedArtifacts } from "../software/mock.mjs";
import { scoreDelivery } from "../software/score.mjs";

const repo = fileURLToPath(new URL("../../../", import.meta.url));
const here = dirname(fileURLToPath(import.meta.url));
const argv = new Map(process.argv.slice(2).map(value => value.split(/=(.*)/su, 2)));
if (!argv.get("--run") || !argv.get("--consumer")) {
  throw new Error("Usage: node scripts/pnwf/revision/qualify.mjs --run=<new directory> --consumer=<installed smoke embedder>");
}
const root = resolve(argv.get("--run"));
const consumer = resolve(argv.get("--consumer"));
ok(!consumer.toLowerCase().startsWith(resolve(repo).toLowerCase()), "Consumer must be outside the source repository");
const image = docker(["image", "inspect", "palimpsest-pnwf-isolation:local", "--format", "{{.Id}}"]);
const ceiling = 12_000_000;
const actor = "operator:mock";
const authority = { policyRef: { policyId: "qualification-mock", version: "1" },
  authorize: identity => ({ authorized: identity === actor, role: identity === actor ? "operator" : "unknown" }) };
const { git, head, writeJson } = energy;
const fixturePath = name => join(repo, "fixtures/psvr", name);
const grpcArtifacts = scriptedArtifacts(fixturePath("grpc-migration"));
const obligations = (mayWrite, mustChange, mustPreserve) => ({ schemaVersion: 1,
  mayWrite, mustChange, mustExist: mayWrite, mustPreserve });
const scenarios = [
  { name: "grpc", ...grpc.SCENARIO, taskId: "revise-fleet-default", fixture: fixturePath("grpc-migration"),
    first: grpcArtifacts.first, files: grpcArtifacts.revised, seed: grpc.seedSoftware, correct: grpc.injectCorrection,
    correctionPath: grpc.CORRECTION_PATH, obligations: obligations(grpc.SCOPE, grpc.REQUIRED, grpc.RETAINED),
    gitIdentity: grpc.GIT_IDENTITY, publicCommand: "node --test" },
  { name: "energy", projectId: "energy-project-continuity", taskId: "revise-energy-package",
    goal: "Maintain the two-site deployment package.", standard: "Verify the public format and revision scope.",
    allowedCommands: [{ executable: "node", argv_prefix: ["check.mjs"] }], fixture: fixturePath("energy-deployment"),
    first: packageFiles(false), files: packageFiles(true), seed: energy.makeSeed, correct: energy.injectCorrection,
    correctionPath: energy.BULLETIN, obligations: obligations(energy.REVISION_PATHS, energy.REVISION_PATHS, [energy.CERTIFICATES]),
    publicCommand: "node check.mjs --final" },
];

function writeFiles(repository, files) {
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(dirname(join(repository, path)), { recursive: true });
    writeFileSync(join(repository, path), body);
  }
}

function scenarioWorld(parent, basis) {
  const stage = join(parent, "stages/T2");
  const repository = join(stage, "world");
  const stateDir = join(stage, "state");
  mkdirSync(stage, { recursive: true });
  cpSync(basis, repository, { recursive: true });
  mkdirSync(stateDir);
  return { stage, repository, stateDir };
}

const quote = value => "'" + value.replaceAll("'", "'\\''") + "'";
const work = (action, input = {}) => ({ name: "palimpsest_work", input: { action, ...input } });

function mockReply(scenario, basis, observed) {
  const turns = { principal: 0, worker: 0 };
  let phase = "WAIT";
  const task = { task_id: scenario.taskId, objective: "Apply the committed correction.",
    depends_on: [], write_paths: scenario.obligations.mayWrite, required_artifacts: scenario.obligations.mustExist };
  const block = (content, kind) => (typeof content === "string" ? [{ type: "text", text: content }] : content)
    .filter(entry => entry.type === kind);
  return async (input, ordinal) => {
    const user = input.messages.filter(message => message.role === "user");
    const worker = user.some(message => block(message.content, "text").some(entry => entry.text.includes("Palimpsest WORK WORKER")));
    const step = turns[worker ? "worker" : "principal"]++;
    const value = user.flatMap(message => block(message.content, "tool_result")).at(-1)?.content;
    const result = typeof value === "string" ? value : (value ?? []).map(entry => entry.text ?? "").join("");
    let call;
    if (worker && step === 0) {
      const prompt = user.flatMap(message => block(message.content, "text")).map(entry => entry.text).join("\n");
      for (const path of scenario.obligations.mustPreserve) ok(prompt.includes(path), "Protected path not shown to Worker");
      const js = "const fs=require('node:fs'); fs.readFileSync(" + JSON.stringify(scenario.correctionPath) +
        "); for (const [p,v] of Object.entries(" + JSON.stringify(scenario.files) + ")) fs.writeFileSync(p,v);";
      call = { name: "bash", input: { command: "node -e " + quote(js) + " && " + scenario.publicCommand +
        " && git add -- " + Object.keys(scenario.files).join(" ") + " && git commit -m 'Mock T2 revision'",
        description: "Apply and test the revision" } };
    } else if (worker && step === 1) {
      ok(result.includes("Mock T2 revision"), "Mock Worker did not commit");
      call = { name: "palimpsest_worker_receipt", input: {} };
    } else if (worker && step === 2) {
      observed.preview = JSON.parse(result);
      equal(observed.preview.phase, "PREVIEW");
      equal(observed.preview.basis, basis);
      ok(observed.preview.checks.every(check => check.passed));
      call = { name: "palimpsest_worker_result", input: { kind: "READY_FOR_SETTLEMENT", summary: "The scoped revision is committed." } };
    } else if (!worker && step === 0) {
      call = work("plan", { reason: "Test refusal before dispatch.", tasks: [{
        ...task, write_paths: [...task.write_paths, scenario.obligations.mustPreserve[0]],
      }] });
    } else if (!worker && step === 1) {
      observed.planRefusal = JSON.parse(result);
      equal(observed.planRefusal.reason, "TASK_OBLIGATION_SCOPE_MISMATCH");
      equal(observed.planRefusal.nextAction, "CORRECT_PLAN");
      call = work("plan", { reason: "Apply the source correction.", tasks: [task] });
    } else if (!worker && step === 2) {
      ok(!result.startsWith("Error:"), result);
      call = work("delegate", { taskId: scenario.taskId });
    } else if (!worker && phase === "WAIT") {
      const response = JSON.parse(result);
      if (step === 3) equal(response.state, "STARTED", result);
      const jobs = response.workers?.jobs ?? response.jobs ?? [];
      const settled = jobs.find(job => job.settlementState === "SETTLED");
      if (settled) {
        observed.summary = settled.receipt;
        equal(observed.summary.receiptId, observed.preview.receiptId);
        call = work("receipt", { attemptId: observed.summary.attemptId });
        phase = "READ";
      } else {
        ok(step < 60 && jobs.length && !jobs.some(job => ["HOST_ERROR", "FINISHED"].includes(job.phase)), result);
        await new Promise(resolve => setTimeout(resolve, 900));
        call = work("workers");
      }
    } else if (!worker && phase === "READ") {
      observed.receipt = JSON.parse(result);
      deepStrictEqual(observed.receipt, { ...observed.preview, phase: "SETTLED" });
      call = work("run", { maxSteps: 8 });
      phase = "RUN";
    } else if (!worker && phase === "RUN") {
      ok(result.includes("VERIFYING"), "Candidate did not reach VERIFYING");
      call = work("conclude", { intent: "WAIT_FOR_OPERATOR", statement: "The checked revision awaits approval." });
      phase = "DONE";
    }
    if (!call) return [{ type: "text", text: "The qualification step is complete." }];
    ok(input.tools?.some(tool => tool.name === call.name), "Mock tool unavailable " + call.name);
    return [{ type: "tool_use", id: "revision_" + ordinal, ...call }];
  };
}

function productFor(scenario, p, enroll) {
  const standard = deriveProjectStandard({ repository: p.repository, policyCommands: scenario.allowedCommands,
    statement: scenario.standard, confirmed: true });
  return installProduct({ tools: { register: () => undefined } }, {
    projectId: scenario.projectId, repository: p.repository, stateDir: p.stateDir, execution: "worktree",
    operatorAuthority: authority, standard,
    ...(enroll ? { taskObligations: { [scenario.taskId]: scenario.obligations } } : {}),
  });
}

function score(scenario, parent, repository, first, basis, candidate) {
  const output = join(parent, "scorer");
  return scenario.name === "grpc"
    ? scoreDelivery({ repo: repository, basis, commit: candidate, revised: true, output, image })
    : energy.checkPackage({ repo: repository, basis, commit: candidate, first, fixture: scenario.fixture, output });
}

async function dsh(scenario, parent, frozen, first, basis) {
  const p = scenarioWorld(parent, frozen);
  const runtime = join(parent, "runtime");
  stageRuntime({ repo, destination: runtime });
  cpSync(join(here, "product-entry.mjs"), join(runtime, "runtime/product-entry.mjs"));
  writeJson(join(runtime, "runtime/task-obligations.json"), { [scenario.taskId]: scenario.obligations });
  const start = productFor(scenario, p, true);
  try {
    start.controller.start({ projectId: scenario.projectId, goal: scenario.goal, headCommit: basis, tasks: [] });
  } finally { await start.dispose(); }
  const profile = join(parent, "profile.json");
  profileFor({ ...scenario, world: p.repository, state: p.stateDir, path: profile });
  const promptPath = join(parent, "prompt.txt");
  writeFileSync(promptPath, "Apply the committed correction, send the checked revision for operator review and finish.");
  const cohortId = "revision-" + randomUUID();
  writeJson(join(parent, "core.json"), { cohortId, budget: ceiling, sessions: [{ id: "T2", condition: "P",
    world: p.repository, state: p.stateDir, expectedHead: basis, killAfterMs: 180_000, deployment: profile, promptPath }] });
  const budgetPath = join(parent, "request-ledger.sqlite");
  const ledger = ExecutionBudget.initialize(budgetPath, { schema: "pnwf-request-budget/v1", cohortId, aggregateCeiling: ceiling,
    sessions: [{ id: "T2", ceiling, softCeiling: ceiling }] });
  const observed = {};
  const mock = await startMockProvider({ reply: mockReply(scenario, basis, observed) });
  try {
    ledger.startSession("T2");
    await runContainerSession({ run: parent, sessionId: "T2", budgetPath, provider: mock.config, repository: runtime, image,
      experiment: { layout: "product", createWorker: options => makeWorkerBroker({ ...options, basis, policy: {
        projectId: scenario.projectId, gitIdentity: scenario.gitIdentity,
        requirements: [], checkScope: () => {},
        checkResult(repository, base, candidate, _paths, binding) {
          equal(binding.basis, base);
          const preview = inspectWorkRevision(repository, binding, candidate);
          ok(preview.checks.every(check => check.passed));
          deepStrictEqual(preview, observed.preview);
          return preview.checks.filter(check => check.kind === "WRITE_SCOPE").map(check => check.path);
        },
      } }) } });
    const evidence = attribute(parent, "T2", "mock");
    requireUsage(evidence);
    ok(evidence.natural && mock.failures.length === 0);
    equal(conclusion(p.stateDir)?.intent, "WAIT_FOR_OPERATOR");
    equal(head(p.repository), basis);
    const receipt = observed.receipt;
    const business = score(scenario, parent, p.repository, first, basis, receipt.candidate);
    const product = productFor(scenario, p, false);
    let accepted;
    try {
      deepStrictEqual(product.revision.readReceipt({ attemptId: receipt.attemptId }), receipt);
      const approval = { attemptId: receipt.attemptId, actor, basis, candidate: receipt.candidate, receiptId: receipt.receiptId };
      await rejects(product.revision.accept({ ...approval, candidate: basis }),
        error => error instanceof WorkRevisionError && error.refusal.reason === "APPROVAL_SHA_MISMATCH");
      equal(head(p.repository), basis);
      accepted = await product.revision.accept(approval);
    } finally { await product.dispose(); }
    const reopened = productFor(scenario, p, false);
    try {
      deepStrictEqual(reopened.revision.readReceipt({ attemptId: receipt.attemptId }), receipt);
      equal(reopened.controller.work.project().head_commit, accepted.resultingHeadCommit);
      equal(head(p.repository), accepted.resultingHeadCommit);
      equal(git(p.repository, "rev-parse", "HEAD^{tree}"), business.tree);
    } finally { await reopened.dispose(); }
    return { interface: "normal-dsh", basis, receipt, preview: observed.preview, planRefusal: observed.planRefusal,
      acceptedHead: accepted.resultingHeadCommit, promotionId: accepted.promotionId, business,
      naturalExit: evidence.natural, confirmedMockRequests: evidence.requests, unresolvedRequests: evidence.unresolvedRequests,
      requestIdsBound: evidence.requestIdsBound, usageTupleMatch: evidence.tupleMatch,
      isolation: evidence.workerReceipts.map(row => ({ attemptId: row.attemptId, qualification: row.qualification, exit: row.exit })),
      streams: evidence.traces?.map(trace => ({ role: trace.role, digest: trace.digest, counts: trace.counts })) };
  } finally {
    writeJson(join(parent, "mock-requests.json"), { requests: mock.requests, failures: mock.failures });
    ledger.close();
    await mock.close();
  }
}

function compileConsumer() {
  const installedManifest = energy.readJson(join(consumer, "node_modules/palimpsest-dsh/package.json"));
  ok(installedManifest.exports["./product"]);
  cpSync(join(here, "consumer.mts"), join(consumer, "revision-consumer.mts"));
  execFileSync(process.execPath, [join(repo, "node_modules/typescript/bin/tsc"), "--strict", "--skipLibCheck",
    "--module", "NodeNext", "--target", "ES2024", "--typeRoots", join(repo, "node_modules/@types"),
    "--types", "node", "revision-consumer.mts"], { cwd: consumer, stdio: "inherit" });
  return (mode, path) => JSON.parse(execFileSync(process.execPath, [join(consumer, "revision-consumer.mjs"), mode, path],
    { cwd: consumer, encoding: "utf8", timeout: 90_000, stdio: ["ignore", "pipe", "inherit"] }).trim());
}

function sdk(scenario, parent, frozen, first, basis, run) {
  const p = scenarioWorld(parent, frozen);
  const fixture = join(parent, "consumer-fixture.json");
  const input = { ...scenario, ...p, basis };
  writeJson(fixture, input);
  const prepared = run("prepare", fixture);
  const { receipt } = prepared;
  const business = score(scenario, parent, p.repository, first, basis, receipt.candidate);
  writeJson(fixture, { ...input, attemptId: receipt.attemptId });
  const accepted = run("accept", fixture);
  const reopened = run("read", fixture);
  equal(reopened.acceptedHead, accepted.acceptedHead);
  deepStrictEqual(reopened.receipt, receipt);
  return { interface: "packed-product", basis, receipt, preview: prepared.worker.preview, childPid: prepared.worker.pid,
    acceptedHead: accepted.acceptedHead, promotionId: accepted.promotionId, wrongShaRefused: accepted.wrongShaRefused,
    business, confirmedMockRequests: 0, unresolvedRequests: 0 };
}

mkdirSync(root);
const report = { schema: "pnwf-work-revision-qualification/v1", image, paidModelCalls: 0, scenarios: [] };
try {
  for (const scenario of scenarios) {
    const folder = join(root, scenario.name);
    const frozen = join(folder, "basis");
    mkdirSync(frozen, { recursive: true });
    scenario.seed(frozen, scenario.fixture);
    writeFiles(frozen, scenario.first);
    const first = energy.commitAll(frozen, "Freeze first Mock delivery");
    const basis = scenario.correct(frozen);
    const row = { name: scenario.name, first, basis, obligations: scenario.obligations, sessions: [] };
    report.scenarios.push(row);
    row.sessions.push(await dsh(scenario, join(folder, "dsh"), frozen, first, basis));
    console.log(scenario.name, "dsh PASS", row.sessions.at(-1).acceptedHead);
  }
  const tarball = readdirSync(dirname(consumer)).find(file => file.endsWith(".tgz"));
  ok(tarball, "Run consumer-smoke before qualification");
  report.packageSha256 = energy.digest(readFileSync(join(dirname(consumer), tarball)));
  const consume = compileConsumer();
  for (const [index, scenario] of scenarios.entries()) {
    const row = report.scenarios[index];
    const folder = join(root, scenario.name);
    const external = sdk(scenario, join(folder, "sdk"), join(folder, "basis"), row.first, row.basis, consume);
    equal(external.business.tree, row.sessions[0].business.tree, "The two interfaces produced different candidate trees");
    row.sessions.push(external);
    console.log(scenario.name, "sdk PASS", row.sessions.at(-1).acceptedHead);
  }
  report.passed = true;
} catch (error) {
  report.passed = false;
  report.reason = error.message;
  throw error;
} finally { writeJson(join(root, "qualification.json"), report); }
