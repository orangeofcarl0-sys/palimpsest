import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, symlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { launchDeployment, parseDeploymentProfile } from "../../../dist/src/advanced.js";
import { dshBin, installHostBundle, shareDshModules } from "../../trajectory_p2e0/dsh-test-home.mjs";
import { readStream } from "../analyze_energy_trajectory.mjs";
import { startBoundedProxy } from "../bounded_provider.mjs";
import { ExecutionBudget } from "../execution_budget.mjs";
import { startMockProvider } from "../mock_provider.mjs";
import { equipmentReply } from "./model.mjs";
import { grade } from "./judge.mjs";
import { digest, readJson } from "./tools.mjs";

const repo = resolve(import.meta.dirname, "../../..");
const here = import.meta.dirname;
const file = "equipment-review.xlsx";
const frozenFiles = ["contract.json", "judge.mjs", "model.mjs", "reviewer.mjs", "tools.mjs", "workbook.mjs"];
const hash = (path) => digest(readFileSync(path));
const json = (path, value) => writeFileSync(path, JSON.stringify(value, null, 2) + "\n");
const localURL = (path) => pathToFileURL(path).href;
const yaml = (value) => "'" + value.replaceAll("\\", "/").replaceAll("'", "''") + "'";
const bind = (files) => Object.fromEntries(files.map(([name, path]) => [name, hash(path)]));
const sourceSeal = () => bind(frozenFiles.map((name) => [name, join(here, name)]));
const inputs = (run) => join(run, "inputs");
const pinnedInputs = ["accepted.xlsx", "sufficient.json", "gap.json", "bench.json", "prompt.txt"];
const inputSeal = (root) => bind(pinnedInputs.map((name) => [name, join(root, name)]));

async function freeze(run, inputSource) {
  mkdirSync(run);
  const root = inputs(run);
  mkdirSync(root);
  const contract = readJson(join(here, "contract.json"));
  assert.equal(contract.workbook, file);
  const modules = process.env.PALIMPSEST_SHEETS_NODE_MODULES;
  assert(modules && existsSync(join(modules, "@oai", "artifact-tool")), "set PALIMPSEST_SHEETS_NODE_MODULES to the bundled spreadsheet runtime");
  const sheetTools = join(run, "sheet-tools");
  mkdirSync(sheetTools);
  symlinkSync(modules, join(sheetTools, "node_modules"), process.platform === "win32" ? "junction" : "dir");
  copyFileSync(join(here, "workbook.mjs"), join(sheetTools, "workbook.mjs"));
  const workbook = await import(localURL(join(sheetTools, "workbook.mjs")));
  let firstFreeze;
  if (inputSource === undefined) {
    await workbook.createWorkbook(join(root, "accepted.xlsx"), join(run, "starter.png"));
    for (const [arm, measurement] of Object.entries(contract.public)) {
      json(join(root, arm + ".json"), { requirement: contract.requirement, prices: contract.prices, measurement, roles: contract.roles });
    }
    json(join(root, "bench.json"), contract.held);
    writeFileSync(join(root, "prompt.txt"), contract.goal);
  } else {
    const priorPath = join(inputSource, "frozen.json");
    const prior = readJson(priorPath);
    assert.deepEqual(inputSeal(inputs(inputSource)), prior.inputs);
    for (const name of ["contract.json", "judge.mjs", "model.mjs", "reviewer.mjs"]) {
      assert.equal(hash(join(here, name)), prior.source[name], "criteria, evidence source, or mock behavior changed: " + name);
    }
    for (const name of pinnedInputs) copyFileSync(join(inputs(inputSource), name), join(root, name));
    firstFreeze = hash(priorPath);
  }
  assert.deepEqual((await workbook.readWorkbook(join(root, "accepted.xlsx"))).scanner, contract.expected.retainedRow);
  const seal = { schema: contract.schema, frozenAt: new Date().toISOString(), source: sourceSeal(), inputs: inputSeal(root),
    ...(firstFreeze === undefined ? {} : { firstFreeze }) };
  json(join(run, "frozen.json"), seal);
  console.log(JSON.stringify(seal));
}

function prepareArm(out, run, name, goal) {
  const root = join(out, name);
  const world = join(root, "draft");
  const state = join(root, "state");
  mkdirSync(world, { recursive: true });
  mkdirSync(state);
  copyFileSync(join(inputs(run), "accepted.xlsx"), join(world, file));
  const profile = parseDeploymentProfile({
    schemaVersion: 1, profileId: "local-equipment-" + name, projectId: "equipment-" + name, localPeer: "equipment-principal",
    toolProfile: "normal", localAssetCheckpoints: { root: world, paths: [file] },
    transport: { namespace: "local-equipment", databasePath: join(state, "transport.sqlite"), enabled: false },
    databases: Object.fromEntries(["orchestration", "ordarium", "coordination", "transportCursors", "projectJournal"]
      .map((key) => [key, join(state, key + ".sqlite")])),
  });
  const deployment = launchDeployment(profile);
  const records = deployment.installed.application.projectWorkspace;
  assert(records?.localAssetCheckpoints && deployment.installed.federation === undefined);
  const setup = async () => {
    try {
      deployment.installed.controller.start({ projectId: profile.projectId, goal, tasks: [] });
      await records.recordJournalEntry({
        kind: "REFERENCE_NOTE", title: "上一版设备评审", body: "上一版审批记录以原工作簿版本为准。",
        provenance: "owner-provided prior review",
        relatedRefs: [{ kind: "local_asset_digest", id: hash(join(inputs(run), "accepted.xlsx")) }],
      });
    } finally { await deployment.close(); }
  };
  return { root, world, profile, setup, receiptPath: join(root, "receipt.json"), publicFacts: join(inputs(run), name + ".json") };
}

function runDshProcess(world, home, goal, sessionKey) {
  const env = {
    ...Object.fromEntries(Object.entries(process.env).filter(([key]) =>
      /^(?:PATH|PATHEXT|SYSTEMROOT|SYSTEMDRIVE|WINDIR|COMSPEC|HOME|USERPROFILE|APPDATA|LOCALAPPDATA|TEMP|TMP)$/iu.test(key))),
    DSH_HOME: home, PALIMPSEST_EQUIPMENT_MOCK_KEY: sessionKey,
  };
  return new Promise((resolveExit, reject) => {
    const child = spawn(process.execPath, [dshBin(), "--profile", "equipment", "--once", goal], {
      cwd: world, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "", stderr = "", timedOut = false;
    child.stdout.setEncoding("utf8").on("data", (data) => { stdout += data; });
    child.stderr.setEncoding("utf8").on("data", (data) => { stderr += data; });
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, 120_000);
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
    child.once("close", (exitCode) => { clearTimeout(timer); resolveExit({ stdout, stderr, exitCode, timedOut }); });
  });
}

function prepareDshHome(home, arm, workbookModule, proxyUrl) {
  const profile = join(home, "profiles", "equipment");
  mkdirSync(profile, { recursive: true });
  assert.notEqual(shareDshModules(home).strategy, "BLOCKED");
  installHostBundle(home, repo);
  json(join(profile, "package.json"), { name: "dsh-profile-equipment", private: true, dependencies: {},
    dsh: { profile: { bundles: ["@deepseek-ai/dsh-base", "palimpsest-dsh-host"], patchReload: "startup" } } });
  json(join(profile, "deployment.json"), arm.profile);
  writeFileSync(join(home, "settings.yaml"), "agent-default-model:\n  provider: deepseek-official\n  model: deepseek-flash\n");
  writeFileSync(join(profile, "cordis.patch.yml"), [
    "- id: llm-deepseek", "  config:", "    baseURL: " + proxyUrl, "    apiKeyEnv: PALIMPSEST_EQUIPMENT_MOCK_KEY",
    "- id: llm-pi-ai", "  disabled: true",
    "- id: agent-default-model", "  config:", "    provider: deepseek-official", "    model: deepseek-flash",
    "- id: session-title-llm", "  disabled: true",
    "- id: tool-web", "  disabled: true",
    "- id: approval", "  config:", "    policy: never",
    "- id: sandbox-policy", "  config:", "    mode: workspace-write", "    workspaceRoot: " + yaml(arm.world),
    "- id: palimpsest-tools", "  config:", "    palimpsestEntry: " + yaml(join(repo, "dist/src/advanced.js")),
    "    deploymentProfile: " + yaml(join(profile, "deployment.json")), "    serve: false", "    openDashboard: false",
    "- insert:", "    - id: local-equipment-fixture", "      name: " + yaml(localURL(join(here, "tools.mjs"))),
    "      config:", "        workbookModule: " + yaml(workbookModule), "        file: " + yaml(file),
    "        publicFacts: " + yaml(arm.publicFacts), "        receiptPath: " + yaml(arm.receiptPath), "",
  ].join("\n"));
}

function pairCalls(home, readiness, recorded, out) {
  const sessions = join(home, "sessions");
  const matching = readdirSync(sessions, { recursive: true }).filter((path) =>
    path.endsWith(".jsonl.zstd") && path.includes(readiness.sessionId));
  assert.equal(matching.length, 1, "exact DSH session stream match");
  const path = join(sessions, matching[0]);
  const raw = readStream(path, hash(path));
  copyFileSync(path, join(out, "session.jsonl.zstd"));
  return recorded.map((call) => {
    const item = raw.find((event) => event.type === "tool/call" && event.data.callId === call.id);
    const result = raw.find((event) => event.type === "tool/result" && event.data.message.toolCallId === call.id);
    if (item) {
      assert.equal(item.data.name, call.name);
      assert.deepEqual(JSON.parse(item.data.arguments), call.args);
    }
    return { ...call, actualCall: item?.seq ?? null, actualResult: result?.seq ?? null };
  });
}

async function session(arm, stage, goal, workbookModule, workbook, onPending = () => {}) {
  const out = join(arm.root, stage);
  mkdirSync(out);
  const home = join(out, "h");
  const key = randomBytes(32).toString("hex");
  const trace = [];
  const id = "REVIEW";
  const ceiling = 2_000_000;
  const budget = ExecutionBudget.initialize(join(out, "ledger.sqlite"), {
    schema: "pnwf-request-budget/v1", cohortId: "equipment-" + randomUUID(), aggregateCeiling: ceiling,
    sessions: [{ id, ceiling, softCeiling: ceiling, maxRequests: 20 }],
  });
  const provider = await startMockProvider({ reply: equipmentReply(file, onPending, trace) });
  let proxy;
  try {
    budget.startSession(id);
    proxy = await startBoundedProxy({ provider: provider.config, budget, sessionId: id, sessionKey: key });
    prepareDshHome(home, arm, workbookModule, proxy.url);
    const result = await runDshProcess(arm.world, home, goal, key);
    writeFileSync(join(out, "stdout.log"), result.stdout);
    writeFileSync(join(out, "stderr.log"), result.stderr);
    json(join(out, "mock-observations.json"), { calls: provider.calls, failures: provider.failures, trace });
    budget.endSession(id, result.exitCode === 0 && !result.timedOut && provider.failures.length === 0 && !proxy.fatalReason);
    const ledger = budget.snapshot();
    json(join(out, "request-accounting.json"), ledger);
    assert(result.exitCode === 0 && !result.timedOut && provider.failures.length === 0 && ledger.requests.length > 0,
      "DSH Mock stopped before qualification: " + out + " " + JSON.stringify(provider.failures));
    const readyLine = result.stdout.split(/\r?\n/u).find((line) => line.startsWith("PALIMPSEST_HOST_READY "));
    assert(readyLine, "normal DSH runner readiness missing");
    const readiness = JSON.parse(readyLine.slice("PALIMPSEST_HOST_READY ".length));
    const calls = pairCalls(home, readiness, trace, out);
    const finalPath = join(arm.world, file);
    const final = { ...await workbook.readWorkbook(finalPath), digest: hash(finalPath) };
    copyFileSync(finalPath, join(out, file));
    const record = { goal, home, sessionId: readiness.sessionId, readiness, exitCode: result.exitCode,
      ledger: { requests: ledger.requests.length, confirmed: ledger.confirmed, unresolved: ledger.unresolvedRequests },
      mockRequests: provider.calls.length, modelSource: provider.config.kind, paidRequests: 0, calls, final,
      saved: calls.findLast((call) => call.name === "palimpsest_asset_checkpoint" && call.args.action === "save").result,
      restored: calls.find((call) => call.args.action === "restore")?.result ?? null,
      review: calls.find((call) => ["request_review", "resolve_review"].includes(call.args.action))?.result ?? null,
      before: calls.find((call) => call.args.action === "inspect" && call.result?.draft && call.result?.review?.state === "PENDING")?.result ?? null,
    };
    json(join(out, "session.json"), record);
    console.log(JSON.stringify({ stage: out, session: record.sessionId, requests: record.ledger.requests, recommendation: final.logger[1] }));
    return record;
  } finally {
    await proxy?.close();
    await provider.close();
    budget.close();
  }
}

async function snapshotControls(arm, checkpoint) {
  const deployment = launchDeployment(arm.profile);
  const draft = deployment.installed.application.projectWorkspace.localAssetCheckpoints;
  function refuses(action, reason) {
    try { action(); } catch (error) { return error.message.includes(reason); }
    return false;
  }
  try {
    return {
      wrongCheckpoint: refuses(() => draft.restore(file, "lac-" + "0".repeat(64)), "unavailable"),
      conflictingFile: refuses(() => draft.restore(file, checkpoint), "different bytes"),
      outOfScope: refuses(() => draft.latest("../accepted.xlsx"), "outside the configured"),
    };
  } finally { await deployment.close(); }
}

async function mock(run, attempt) {
  const seal = readJson(join(run, "frozen.json"));
  const root = inputs(run);
  assert.deepEqual(sourceSeal(), seal.source);
  assert.deepEqual(inputSeal(root), seal.inputs);
  const workbookModule = join(run, "sheet-tools", "workbook.mjs");
  assert.equal(hash(workbookModule), seal.source["workbook.mjs"]);
  const workbook = await import(localURL(workbookModule));
  const contract = readJson(join(here, "contract.json"));
  const goal = readFileSync(join(root, "prompt.txt"), "utf8");
  const out = join(run, attempt);
  mkdirSync(out);
  const enough = prepareArm(out, run, "sufficient", goal);
  const gapped = prepareArm(out, run, "gap", goal);
  await enough.setup();
  await gapped.setup();
  const direct = await session(enough, "initial", goal, workbookModule, workbook);
  const pending = await session(gapped, "initial", goal, workbookModule, workbook);
  const localDraft = join(gapped.world, file);
  // Preserve the stopped workspace and make the next DSH recover the file from the product store.
  const stoppedWorld = join(gapped.root, "stopped-draft");
  renameSync(gapped.world, stoppedWorld);
  mkdirSync(gapped.world);
  const missingDraftAfterStop = !existsSync(localDraft);
  let receipt, pendingObservedBeforeReceipt = false, noReviewerDraftWrite = false;
  const resumed = await session(gapped, "resumed", goal, workbookModule, workbook, (question) => {
    assert(!existsSync(gapped.receiptPath));
    pendingObservedBeforeReceipt = question.id === pending.review.id && hash(localDraft) === pending.saved.digest;
    const packet = join(gapped.root, "review-request.json");
    json(packet, { ...question, projectId: gapped.profile.projectId, reviewer: "bench-custodian" });
    const before = hash(localDraft);
    receipt = JSON.parse(execFileSync(process.execPath, [join(here, "reviewer.mjs"), packet, join(root, "bench.json")],
      { encoding: "utf8", timeout: 10_000, windowsHide: true }));
    noReviewerDraftWrite = hash(localDraft) === before;
    json(gapped.receiptPath, receipt);
  });
  const controls = {
    ...await snapshotControls(gapped, pending.saved.id),
    noGit: [enough.world, gapped.world, stoppedWorld].every((path) => !existsSync(join(path, ".git"))) &&
      [enough, gapped].every((arm) => arm.profile.repository === undefined),
    transportDisabled: [direct, pending, resumed].every((run) => run.readiness.transportAdapter === "disabled"),
    noTransportFiles: [enough, gapped].every(({ profile }) =>
      !existsSync(profile.transport.databasePath) && !existsSync(profile.databases.transportCursors)),
    workspaceFileScope: [enough.world, gapped.world, stoppedWorld].every((path) =>
      JSON.stringify(readdirSync(path)) === JSON.stringify([file])),
    missingDraftAfterStop, pendingObservedBeforeReceipt, noReviewerDraftWrite, protectedFilesUnchanged:
      JSON.stringify(inputSeal(root)) === JSON.stringify(seal.inputs),
  };
  const evidence = { direct, pending, resumed, receipt, sourceSha256: seal.inputs["bench.json"], controls };
  const result = { ...grade(contract, evidence), controls, actualPaidRequests: 0,
    mockRequests: [direct, pending, resumed].reduce((total, row) => total + row.mockRequests, 0) };
  json(join(out, "evidence.json"), evidence);
  json(join(out, "result.json"), result);
  console.log(JSON.stringify(result));
  assert(result.pass && controls.workspaceFileScope, "frozen equipment review qualification failed");
}

const options = new Map(process.argv.slice(2).map((arg) => arg.replace(/^--/u, "").split(/=(.*)/su).slice(0, 2)));
const action = options.get("action");
const directory = options.get("run");
const attempt = options.get("attempt") ?? "mock";
assert(directory && ["freeze", "mock"].includes(action) && /^[a-z][a-z0-9-]*$/u.test(attempt),
  "Usage: local-equipment/run.mjs --action=freeze|mock --run=<directory> [--attempt=<new-name>]");
if (action === "freeze") await freeze(resolve(directory), options.get("inputs-from"));
else await mock(resolve(directory), attempt);
