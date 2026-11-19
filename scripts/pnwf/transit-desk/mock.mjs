// Exercises delivery in normal sessions. The local mock emits reference replies; it never forwards requests.
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {mkdirSync, readdirSync, readFileSync, writeFileSync} from "node:fs";
import {join, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {ExecutionBudget} from "../execution_budget.mjs";
import {startMockProvider} from "../mock_provider.mjs";
import {runContainerSession} from "../container_adapter.mjs";
import {profileFor, initializeProject, conclusion} from "../energy/product.mjs";
import {writeJson} from "../energy/contract.mjs";
import {makeWorkerBroker} from "../energy/container-worker.mjs";
import {runtime, previousContract, workerPolicy} from "../task-selection/case.mjs";
import {analyze} from "../task-selection/evidence.mjs";
import {cases, prepare, grade, git} from "./run.mjs";

function replyFor(task, product) {
  const source = fileURLToPath(new URL("./reference/" + task, import.meta.url));
  const paths = readdirSync(source).sort();
  const inspection = {"public-brief": "cat archive/*.md", "departure-board": "node cli.mjs", "depot-charge": "cat night.json"};
  const steps = [["bash", {command: "cat TASK.md README.md && " + inspection[task], description: "Inspect the user materials"}]];
  for (const path of paths) {
    const contents = readFileSync(join(source, path), "utf8").replaceAll("\r\n", "\n").trimEnd();
    steps.push(["bash", {command: "cat > " + path + " <<'END_TRANSIT_FILE'\n" + contents + "\nEND_TRANSIT_FILE",
      description: "Write " + path}]);
  }
  steps.push(["bash", {command: "git add -- " + paths.join(" ") + " && git commit -qm 'Deliver transit desk work' && git rev-parse HEAD",
    description: "Commit the requested submission"}]);
  if (product) steps.push(["palimpsest_work", {action: "conclude", intent: "DELIVER",
    statement: "The requested transit desk materials have been committed.", artifacts: paths}]);
  return async (_request, ordinal) => {
    if (ordinal >= steps.length) return [{type: "text", text: "The requested submission is committed."}];
    const [name, input] = steps[ordinal];
    return [{type: "tool_use", id: "desk_" + ordinal, name, input}];
  };
}

const root = resolve(process.argv[2]);
mkdirSync(root);
const repository = runtime(root);
const {image, window} = previousContract;
const summary = {schema: "transit-desk-dsh-mock/v1", image, model: "local-scripted-mock", sessions: []};
for (const task of cases) {
  for (const arm of ["P", "F"]) {
    const id = "REVIEW";
    const run = join(root, task + "-" + arm);
    const stage = join(run, "stages", id);
    const world = join(stage, "world"), state = join(stage, "state");
    mkdirSync(state, {recursive: true});
    const basis = prepare(task, world);
    git(world, "config", "user.name", "Transit Desk Fixture");
    git(world, "config", "user.email", "fixture@example.invalid");
    git(world, "config", "core.autocrlf", "false");
    git(world, "config", "core.fileMode", "false");
    const promptPath = join(run, "prompt.txt"), deployment = join(run, "profile.json");
    const goal = readFileSync(join(world, "TASK.md"), "utf8");
    writeFileSync(promptPath, goal);
    const product = arm === "P", projectId = "transit-" + task;
    if (product) {
      profileFor({projectId, world, state, path: deployment, standard: "Submit the documents specified by the user task."});
      await initializeProject(deployment, basis, {projectId, goal});
    }
    const cohortId = randomUUID(), budget = 12_000_000, budgetPath = join(run, "request-ledger.sqlite");
    writeJson(join(run, "core.json"), {budget, cohortId, sessions: [{id, condition: arm, world, state, expectedHead: basis,
      killAfterMs: window.wallClockMs, deployment, promptPath}]});
    const ledger = ExecutionBudget.initialize(budgetPath, {schema: "pnwf-request-budget/v1", cohortId, aggregateCeiling: budget,
      sessions: [{id, ceiling: budget, softCeiling: budget, maxRequests: window.maxRequests}]});
    const provider = await startMockProvider({reply: replyFor(task, product)});
    try {
      ledger.startSession(id);
      const execution = await runContainerSession({run, sessionId: id, budgetPath, repository, image, mode: "mock", provider: provider.config,
        experiment: {layout: product ? "product" : "native", ...(product ? {createWorker: ports =>
          makeWorkerBroker({...ports, basis, policy: workerPolicy(projectId)})} : {})}});
      assert(execution.natural && execution.paidModelCalls === 0, JSON.stringify(execution));
      const sha = git(world, "rev-parse", "HEAD").trim();
      const result = grade(task, world, sha);
      assert(result.automatedPass && sha !== basis && !git(world, "status", "--porcelain").trim(), JSON.stringify(result));
      const t = analyze(run, "mock");
      const journal = product ? conclusion(state) : null;
      assert(!product || journal?.intent === "DELIVER", JSON.stringify(journal));
      assert.equal(provider.failures.length, 0);
      assert(t.unknown === 0 && t.requests === provider.calls.length);
      const calls = t.traces.flatMap(trace => trace.calls);
      assert(calls.every(c => c.resultSeq !== null && c.ok && !c.refusal));
      writeJson(join(run, "trajectory.json"), t);
      git(world, "bundle", "create", join(run, "submission.bundle"), "HEAD");
      const record = {task, arm, ...result, natural: execution.natural, paidModelCalls: execution.paidModelCalls,
        mockRequests: t.requests, unknown: t.unknown, pairedCalls: calls.length, conclusion: journal?.intent ?? null};
      summary.sessions.push(record);
      writeJson(join(root, "summary.json"), summary);
      console.log(task, arm, sha, t.requests, "mock requests");
    } finally { ledger.close(); await provider.close(); }
  }
}
