import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { launchDeployment } from "../../../dist/src/advanced.js";
import { dshBin, findSessionFile } from "../../trajectory_p2e0/dsh-test-home.mjs";
import { PAID_MODE, startPaidProxy } from "../bounded_provider.mjs";
import { ExecutionBudget, USAGE_ONLY_SCHEMA } from "../execution_budget.mjs";
import { OPENCODE_GO_MESSAGES, OPENCODE_GO_MODEL, readOpenCodeGoKey, requireOpenCodeGoProbe } from "../opencode_go.mjs";
import { readEquipmentTrace, reconcileEquipmentUsage } from "./live-trajectory.mjs";
import { openFrozen, prepareArm, prepareDshHome, runDshProcess, scopedDisabledTools } from "./run.mjs";
import { digest, readJson, receiptId } from "./tools.mjs";

const repo = resolve(import.meta.dirname, "../../..");
const baseline = "4ae167a2";
const mockName = "live-profile-mock";
const window = { maxRequests: 64, wallClockMs: 1_800_000, requestTimeoutMs: 240_000, tokenCeiling: null, billingCeiling: null };
const armNames = ["sufficient", "gap"];
const id = "REVIEW";
const json = (path, value) => writeFileSync(path, JSON.stringify(value, null, 2) + "\n");
const hash = (path) => digest(readFileSync(path));
const status = (message) => console.log(JSON.stringify(message));

function checkToolScope(trace) {
  const nativeTools = ["working_directory", "todo_write", "skill", "create_goal", "get_goal", "update_goal"];
  assert(trace.toolSets.length > 0, "ordinary DSH tool catalog missing");
  for (const tools of trace.toolSets) {
    assert(tools.includes("equipment_review") && tools.includes("palimpsest_asset_checkpoint"));
    assert(tools.every((name) => name === "equipment_review" || name.startsWith("palimpsest_") || nativeTools.includes(name)),
      "a tool outside the local equipment role was offered");
  }
}

async function inspectProject(arm, out, frozen) {
  const file = frozen.contract.workbook;
  const path = join(arm.world, file);
  const final = existsSync(path) ? { ...await frozen.workbook.readWorkbook(path), digest: hash(path) } : null;
  if (final) copyFileSync(path, join(out, file));
  const deployment = launchDeployment(arm.profile);
  try {
    const workspace = deployment.installed.application.projectWorkspace;
    const journal = await workspace.journal();
    const pending = journal.filter(({ entry, resolution }) => entry.kind === "OPEN_QUESTION" && resolution === undefined)
      .map(({ entry }) => ({ id: entry.entryId, state: "PENDING", question: entry.body,
        checkpointId: entry.relatedRefs.find((ref) => ref.kind === "local_equipment_review")?.id ?? null }));
    return { final, checkpoint: workspace.localAssetCheckpoints.latest(file), pending, journal,
      workspaceFiles: readdirSync(arm.world).sort(), noGit: !existsSync(join(arm.world, ".git")) && arm.profile.repository === undefined,
      noA2A: deployment.transport.adapterId === "disabled" && deployment.installed.federation === undefined &&
        !existsSync(arm.profile.transport.databasePath) && !existsSync(arm.profile.databases.transportCursors) };
  } finally { await deployment.close(); }
}

async function liveSession(arm, phase, frozen, openCodeGoProfile) {
  const out = join(arm.root, phase);
  mkdirSync(out);
  const home = join(out, "h");
  const key = randomBytes(32).toString("hex");
  const budget = ExecutionBudget.initialize(join(out, "ledger.sqlite"), {
    schema: USAGE_ONLY_SCHEMA, cohortId: "equipment-" + randomUUID(), aggregateCeiling: null,
    sessions: [{ id, ceiling: null, softCeiling: null, maxRequests: window.maxRequests }],
  });
  const startedAt = new Date().toISOString();
  const onDisk = join(out, "request-observations.jsonl");
  writeFileSync(onDisk, "", { flag: "wx" });
  let proxy, processResult, failure, ledger;
  budget.startSession(id);
  try {
    proxy = await startPaidProxy({ budget, sessionId: id, sessionKey: key, timeoutMs: window.requestTimeoutMs, openCodeGoProfile,
      onObservation: (row) => appendFileSync(onDisk, JSON.stringify({ ...row, atMs: Date.now() }) + "\n") });
    prepareDshHome(home, arm, frozen.workbookModule, proxy.url, true);
    status({ state: "RUNNING", arm: arm.profile.projectId, phase, startedAt });
    processResult = await runDshProcess(arm.world, home, frozen.goal, key, {
      wallClockMs: window.wallClockMs,
      stopReason: () => {
        const snapshot = budget.snapshot();
        return proxy.fatalReason ?? (snapshot.state === "STOPPED" ? snapshot.reason : null);
      },
    });
  } catch (error) {
    failure = error.code ?? error.message;
    budget.stop(failure);
  } finally {
    try { await proxy?.close(); } catch { budget.stop("PROXY_CLOSE_FAILED"); }
    for (const row of budget.snapshot().requests.filter((row) => row.state === "PENDING")) budget.unknown(row.id, "NO_TERMINAL_ON_HOST_STOP");
    if (proxy?.fatalReason) budget.stop(proxy.fatalReason);
    if (processResult?.stoppedBy) budget.stop(processResult.stoppedBy);
    const snapshot = budget.snapshot();
    budget.endSession(id, processResult?.exitCode === 0 && snapshot.requests.length > 0 && !failure);
    ledger = budget.snapshot();
    json(join(out, "request-accounting.json"), ledger);
    budget.close();
  }
  const endedAt = new Date().toISOString();
  writeFileSync(join(out, "stdout.log"), processResult?.stdout ?? "");
  writeFileSync(join(out, "stderr.log"), processResult?.stderr ?? "");
  const readyLine = processResult?.stdout.split(/\r?\n/u).find((line) => line.startsWith("PALIMPSEST_HOST_READY "));
  const readiness = readyLine ? JSON.parse(readyLine.slice("PALIMPSEST_HOST_READY ".length)) : null;
  const match = readiness && findSessionFile(join(home, "sessions"), readiness.sessionId);
  const stream = match?.unique;
  let trace, traceError, usage, accountingError;
  if (stream) {
    const path = join(out, "session.jsonl.zstd");
    copyFileSync(stream, path);
    try {
      trace = readEquipmentTrace(path, frozen.goal);
      assert.equal(trace.sessionId, readiness.sessionId);
      if (trace.toolSets.length) checkToolScope(trace);
    } catch (error) { traceError = error.message; }
  } else if (ledger.requests.length > 0) traceError = "exact DSH session stream missing";
  const observations = readFileSync(onDisk, "utf8").split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line));
  try { usage = reconcileEquipmentUsage(ledger, observations, trace); } catch (error) { accountingError = error.message; }
  const state = await inspectProject(arm, out, frozen);
  const natural = ledger.sessions[0].state === "ENDED" && trace?.completed === true;
  const record = { schema: "pnwf-local-equipment-session/v1", home, projectId: arm.profile.projectId, phase,
    startedAt, endedAt, durationMs: Date.parse(endedAt) - Date.parse(startedAt), exitCode: processResult?.exitCode ?? null,
    stopReason: processResult?.stoppedBy ?? ledger.reason ?? failure ?? null, natural, readiness,
    traceError: traceError ?? null, accountingError: accountingError ?? null, usage: usage ?? null,
    trace: trace ? { streamSha256: trace.streamSha256, goalMatches: trace.goalMatches, toolSets: trace.toolSets,
      completed: trace.completed, calls: trace.calls, orphanResults: trace.orphanResults, finalText: trace.finalText } : null, state };
  json(join(out, "session.json"), record);
  status({ state: "ENDED", arm: arm.profile.projectId, phase, requests: ledger.requests.length, confirmed: ledger.confirmed,
    unresolved: ledger.unresolvedRequests, natural, stopReason: record.stopReason, decision: state.final?.logger, pending: state.pending.map((row) => row.id),
    bindingError: usage?.bindingError ?? accountingError ?? null });
  return record;
}

function prepareCold(arm, initial, frozen) {
  const { final, checkpoint, pending } = initial.state;
  const question = pending.find((row) => row.checkpointId === checkpoint?.id && row.checkpointId !== null);
  const usableCheckpoint = checkpoint?.digest === final?.digest && checkpoint !== null;
  const stopped = join(arm.root, "stopped-draft");
  renameSync(arm.world, stopped);
  mkdirSync(arm.world);
  let receipt = null;
  if (question && usableCheckpoint) {
    const packet = join(arm.root, "review-request.json");
    json(packet, { ...question, projectId: arm.profile.projectId, reviewer: "bench-custodian" });
    receipt = JSON.parse(execFileSync(process.execPath, [join(import.meta.dirname, "reviewer.mjs"), packet, join(frozen.root, "bench.json")],
      { encoding: "utf8", timeout: 10_000, windowsHide: true }));
    const { id: receiptIdValue, ...body } = receipt;
    assert.equal(receiptIdValue, receiptId(body));
    assert.equal(receipt.sourceSha256, frozen.seal.inputs["bench.json"]);
    assert.equal(receipt.requestId, question.id);
    assert.equal(receipt.checkpointId, checkpoint.id);
    json(arm.receiptPath, receipt);
  }
  const workbook = join(stopped, frozen.contract.workbook);
  const cold = { priorSession: initial.readiness?.sessionId ?? null, question: question ?? null,
    pending, draftDigest: final?.digest ?? null, checkpoint: checkpoint ?? null, usableCheckpoint,
    draftAbsentAtLaunch: !existsSync(join(arm.world, frozen.contract.workbook)),
    stoppedDraftMatches: final ? hash(workbook) === final.digest : !existsSync(workbook),
    receiptId: receipt?.id ?? null, publishedAt: receipt === null ? null : new Date().toISOString() };
  json(join(arm.root, "cold-start.json"), cold);
  return cold;
}

const run = resolve(process.argv[2] ?? "");
assert(process.argv.length === 3 && process.argv[2], "Usage: local-equipment/live.mjs <qualified-run-directory>");
const frozen = await openFrozen(run);
const original = join(repo, "research-evidence/pnwf-local-assets/2026-11-22/equipment-review/frozen.json");
assert.equal(frozen.seal.firstFreeze, hash(original));
assert.deepEqual(frozen.seal.inputs, readJson(original).inputs);
const mockPath = join(run, mockName, "result.json");
const qualification = readJson(mockPath);
assert(qualification.pass && qualification.controls.workspaceFileScope && qualification.actualPaidRequests === 0);
for (const [arm, phase] of [["sufficient", "initial"], ["gap", "initial"], ["gap", "resumed"]]) {
  const trial = readEquipmentTrace(join(run, mockName, arm, phase, "session.jsonl.zstd"), frozen.goal);
  assert(trial.goalMatches && trial.completed);
  checkToolScope(trial);
}
const probePath = join(repo, "research-evidence/pnwf-work-revision/2026-11-18/opencode-go-tooled-t3-055602/opencode-probe.json");
const provider = requireOpenCodeGoProbe(readJson(probePath));
readOpenCodeGoKey(provider);
const git = (...args) => execFileSync("git", args, { cwd: repo, encoding: "utf8", windowsHide: true }).trim();
const sourceCommit = git("rev-parse", baseline + "^{commit}");
assert.equal(git("diff", sourceCommit, "--name-only", "--", "src", "host", "tsconfig.json", "package.json", "pnpm-lock.yaml"), "",
  "the ordinary DSH product source differs from the requested baseline");
const dshVersion = execFileSync(process.execPath, [dshBin(), "--version"], { encoding: "utf8", timeout: 10_000, windowsHide: true }).trim();
const out = join(run, "live");
mkdirSync(out);
json(join(out, "contract.json"), { baseline: sourceCommit, builtEntrySha256: hash(join(repo, "dist/src/advanced.js")), dshVersion,
  mode: PAID_MODE, model: OPENCODE_GO_MODEL, route: OPENCODE_GO_MESSAGES, window, providerProbeSha256: hash(probePath),
  frozenSha256: hash(join(run, "frozen.json")), qualificationSha256: hash(mockPath), scopedDisabledTools,
  roles: frozen.contract.roles, goalSha256: frozen.seal.inputs["prompt.txt"], coldOn: "durable pending question or provisional workbook row",
  receiptDelivery: "after initial DSH exit and before new DSH starts, only for a verified request and stopped draft",
  crossSessionStop: "unreconciled terminal usage closes admission" });
const arms = armNames.map((name) => prepareArm(out, run, name, frozen.goal));
for (const arm of arms) await arm.setup();
const outcomes = Object.fromEntries(armNames.map((name) => [name, { initial: null, cold: null, resumed: null }]));
const accountable = (row) => row.usage && row.usage.unresolved === 0 && row.accountingError === null;
let blocked = null;
for (const [i, arm] of arms.entries()) {
  const row = await liveSession(arm, "initial", frozen, provider);
  outcomes[armNames[i]].initial = row;
  if (!accountable(row)) { blocked = armNames[i] + "/initial"; break; }
}
if (!blocked) {
  for (const [i, arm] of arms.entries()) {
    const outcome = outcomes[armNames[i]];
    if (!outcome.initial.state.pending.length && outcome.initial.state.final?.logger[2] !== "待复核") continue;
    outcome.cold = prepareCold(arm, outcome.initial, frozen);
    outcome.resumed = await liveSession(arm, "resumed", frozen, provider);
    if (!accountable(outcome.resumed)) { blocked = armNames[i] + "/resumed"; break; }
  }
}
const originalInputsPreserved = Object.entries(frozen.seal.inputs).every(([name, originalHash]) => hash(join(frozen.root, name)) === originalHash);
const stages = Object.values(outcomes).flatMap((row) => [row.initial, row.resumed].filter(Boolean));
json(join(out, "result.json"), { blocked, originalInputsPreserved, sessions: stages.map((row) => ({ projectId: row.projectId, phase: row.phase,
  natural: row.natural, noGit: row.state.noGit, noA2A: row.state.noA2A, exactUserGoal: row.trace?.goalMatches ?? null })),
  outcomes: Object.fromEntries(Object.entries(outcomes).map(([name, row]) => [name, { initial: row.initial?.readiness?.sessionId ?? null,
    cold: row.cold, resumed: row.resumed?.readiness?.sessionId ?? null }])) });
if (blocked) process.exitCode = 5;
