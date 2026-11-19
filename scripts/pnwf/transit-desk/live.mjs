// One new metered cohort per arm. The six qualified workspaces and prompts are the admission references.
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {mkdirSync, readFileSync, writeFileSync} from "node:fs";
import {join, resolve} from "node:path";
import {ExecutionBudget, USAGE_ONLY_SCHEMA} from "../execution_budget.mjs";
import {PAID_COHORT_SCHEMA, PAID_MODE} from "../bounded_provider.mjs";
import {runContainerSession} from "../container_adapter.mjs";
import {requireOpenCodeGoProbe} from "../opencode_go.mjs";
import {readJson, writeJson, digest} from "../energy/contract.mjs";
import {profileFor, initializeProject, conclusion} from "../energy/product.mjs";
import {makeWorkerBroker} from "../energy/container-worker.mjs";
import {runtime, previousContract, workerPolicy, repo} from "../task-selection/case.mjs";
import {cases, prepare, git} from "./run.mjs";

const base = "3c44aba89fc9837619c5d22b2545b1e77a445f2b";
const archived = "research-evidence/pnwf-task-selection/2026-11-19/transit-desk/mock";
const frozen = (path) => git(repo, "show", base + ":" + path);
const qualification = JSON.parse(frozen(archived + "/summary.json"));
const matrix = cases.flatMap(task => ["P", "F"].map(arm => ({task, arm})));
assert.deepEqual(qualification.sessions.map(({task, arm}) => ({task, arm})), matrix);
assert(qualification.sessions.every(s => s.natural && s.automatedPass && s.paidModelCalls === 0 && s.unknown === 0));
const {image, window, model, route} = previousContract;
assert.equal(image, qualification.image);
assert.deepEqual(window, {maxRequests: 64, wallClockMs: 1800000, requestTimeoutMs: 240000, billingCeiling: null});
assert.equal(git(repo, "diff", base, "--", "src", "host", "scripts/pnwf/container_adapter.mjs", "scripts/pnwf/container_runtime.mjs",
  "scripts/pnwf/transit-desk/run.mjs", "scripts/pnwf/transit-desk/checks.mjs", "fixtures/psvr/transit-desk"), "");
const provider = requireOpenCodeGoProbe(readJson(join(repo,
  "research-evidence/pnwf-work-revision/2026-11-18/opencode-go-tooled-t3-055602/opencode-probe.json")));
const root = resolve(process.argv[2]);
mkdirSync(root);
const repository = runtime(root);
const summary = {base, image, model, route, window, order: matrix, started: [], completed: []};
const save = () => writeJson(join(root, "matrix.json"), summary);
save();
for (const {task, arm} of matrix) {
  const id = "REVIEW", name = task + "-" + arm;
  const ref = qualification.sessions.find(s => s.task === task && s.arm === arm);
  const run = join(root, name), stage = join(run, "stages", id), world = join(stage, "world"), state = join(stage, "state");
  mkdirSync(state, {recursive: true});
  const basis = prepare(task, world);
  assert.equal(basis, ref.basis);
  for (const [key, value] of Object.entries({"user.name": "Transit Desk Fixture", "user.email": "fixture@example.invalid",
    "core.autocrlf": "false", "core.fileMode": "false"})) git(world, "config", key, value);
  const goal = readFileSync(join(world, "TASK.md"), "utf8");
  assert.equal(goal, frozen(archived + "/" + name + "/prompt.txt"));
  const promptPath = join(run, "prompt.txt"), deployment = join(run, "profile.json");
  writeFileSync(promptPath, goal);
  const product = arm === "P", projectId = "transit-" + task;
  if (product) {
    profileFor({projectId, world, state, path: deployment, standard: "Submit the documents specified by the user task."});
    await initializeProject(deployment, basis, {projectId, goal});
  }
  const cohortId = randomUUID(), budgetPath = join(run, "request-ledger.sqlite");
  writeJson(join(run, "core.json"), {budget: null, cohortId, sessions: [{id, condition: arm, world, state, expectedHead: basis,
    killAfterMs: window.wallClockMs, deployment, promptPath}]});
  writeJson(join(run, "cohort.json"), {schema: PAID_COHORT_SCHEMA, cohortId, stages: [{id}], ...window});
  const ledger = ExecutionBudget.initialize(budgetPath, {schema: USAGE_ONLY_SCHEMA, cohortId, aggregateCeiling: null,
    sessions: [{id, ceiling: null, softCeiling: null, maxRequests: window.maxRequests}]});
  try {
    ledger.startSession(id);
    summary.started.push({name, cohortId, basis, promptDigest: digest(goal)});
    save();
    console.log("Started", name, basis);
    const execution = await runContainerSession({run, sessionId: id, budgetPath, repository, image, mode: PAID_MODE,
      experiment: {layout: product ? "product" : "native", openCodeGoProfile: provider, ...(product ? {createWorker: ports =>
        makeWorkerBroker({...ports, basis, policy: workerPolicy(projectId)})} : {})}});
    const snapshot = ledger.snapshot();
    const record = {name, natural: execution.natural, stop: snapshot.reason ?? execution.error,
      requests: snapshot.requests.length, confirmed: snapshot.confirmed, unknown: snapshot.unresolvedRequests,
      workingHead: git(world, "rev-parse", "HEAD").trim(), conclusion: product ? conclusion(state) : null};
    summary.completed.push(record);
    save();
    console.log("Ended", name, record.natural, record.requests, record.unknown);
    // Financial uncertainty closes the subsequent arms. Business refusals are evidence.
    if (snapshot.unresolvedRequests || snapshot.requests.some(r => r.state !== "SETTLED") || !record.requests) break;
  } finally { ledger.close(); }
}
