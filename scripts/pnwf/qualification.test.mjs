import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { ExecutionBudget, USAGE_ONLY_SCHEMA } from "./execution_budget.mjs";
import { startBoundedProxy, verifyMock, UsageReader, finalUsage, startMessagesProxy, paidRequestAdmission, PAID_COHORT_SCHEMA, PAID_MODE } from "./bounded_provider.mjs";
import { startMockProvider } from "./mock_provider.mjs";

function fixtureLedger(t, config) {
  const root = mkdtempSync(join(tmpdir(), "pnwf-budget-"));
  const path = join(root, "budget.sqlite");
  const budget = ExecutionBudget.initialize(path, config);
  t.after(() => { budget.close(); rmSync(root, { recursive: true, force: true }); });
  budget.startSession("a");
  return { budget, path, root };
}
function ledger(t, ceiling = 10000) {
  return fixtureLedger(t, { schema: "pnwf-request-budget/v1", cohortId: "qualification", aggregateCeiling: ceiling,
    sessions: [{ id: "a", ceiling, softCeiling: ceiling }, { id: "b", ceiling, softCeiling: ceiling }] });
}
async function rig(t, options = {}) {
  const { budget } = ledger(t, options.ceiling ?? 10000);
  const mock = await startMockProvider(options);
  const key = randomBytes(32).toString("hex");
  const proxy = await startBoundedProxy({ provider: mock.config, budget, sessionId: "a", sessionKey: key, timeoutMs: options.timeoutMs ?? 1500 });
  t.after(async () => { await proxy.close(); await mock.close(); });
  const send = (overrides = {}) => fetch(proxy.url + "/v1/messages", { method: "POST", headers: { "x-api-key": key },
    body: JSON.stringify({ model: "deepseek-flash", stream: true, max_tokens: 400, messages: [{ role: "user", content: "qualification" }], ...overrides }) });
  return { budget, mock, proxy, send };
}
test("missing, damaged and incomplete usage never become zero", t => {
  const { budget, path, root } = ledger(t);
  assert.throws(() => new ExecutionBudget(join(root, "missing")), /missing/);
  const corrupt = join(root, "corrupt"); writeFileSync(corrupt, "not sqlite");
  assert.throws(() => new ExecutionBudget(corrupt), /unreadable/);
  const id = budget.reserve("a", 500, "request");
  budget.unknown(id, "interrupted");
  assert.equal(budget.snapshot().reserved, 500);
  const reopened = new ExecutionBudget(path);
  try { assert.throws(() => reopened.reserve("a", 1, "retry"), e => e.code === "COHORT_STOPPED"); }
  finally { reopened.close(); }
  assert.throws(() => budget.startSession("b"), e => e.code === "COHORT_STOPPED");
});
test("independent ledger connections reserve against the same aggregate", t => {
  const { budget, path } = ledger(t, 1000);
  const second = new ExecutionBudget(path);
  try {
    budget.reserve("a", 700, "first");
    assert.throws(() => second.reserve("a", 400, "second"), e => e.code === "BUDGET_EXHAUSTED");
    assert.equal(budget.snapshot().reserved, 700);
    assert.equal(budget.snapshot().state, "STOPPED");
  } finally { second.close(); }
});
test("prior unfinished or failed session blocks the next session", t => {
  const { budget } = ledger(t);
  assert.throws(() => budget.startSession("b"), e => e.code === "PRIOR_SESSION_UNRESOLVED");
  budget.endSession("a", false);
  assert.throws(() => budget.startSession("b"), e => e.code === "COHORT_STOPPED");
});
test("large request is refused BEFORE the mock sees it", async t => {
  const { send, mock, budget } = await rig(t, { ceiling: 1000 });
  const response = await send({ messages: [{ role: "user", content: "x".repeat(1100) }] });
  assert.equal(response.status, 429);
  assert.equal(mock.calls.length, 0);
  assert.equal(budget.snapshot().confirmed, 0);
  assert.equal(budget.snapshot().reserved, 0);
});
test("late usage holds reservations; concurrent request cannot spend them", async t => {
  const { send, mock, budget } = await rig(t, { ceiling: 1000, delayMs: 150 });
  const first = await send();
  assert.equal(budget.snapshot().confirmed, 0);
  assert.ok(budget.snapshot().reserved > 500);
  const second = await send();
  assert.equal(second.status, 429);
  await first.text();
  assert.equal(mock.calls.length, 1);
  assert.equal(budget.snapshot().confirmed, mock.calls[0].total);
  assert.equal(budget.snapshot().reserved, 0);
  assert.throws(() => budget.startSession("b"));
});
test("fragmented final usage is counted once, including cache tokens", () => {
  const reader = new UsageReader(true);
  const stream = 'data: {"type":"message_start","message":{"usage":{"input_tokens":999}}}\n\n' +
    'data: {"type":"message_delta","usage":{"input_tokens":12,"cache_read_input_tokens":30,"cache_creation_input_tokens":4,"output_tokens":5}}\n\n' +
    'data: {"type":"message_stop"}\n\n';
  for (const byte of Buffer.from(stream)) reader.push(Buffer.from([byte]));
  assert.equal(reader.end(), 51);
});
test("stream interruption conserves reservation and forbids later requests", async t => {
  const { send, mock, budget } = await rig(t, { fault: "interrupt", delayMs: 30 });
  try { await (await send()).text(); } catch { /* interrupted response is the injection */ }
  assert.equal(budget.snapshot().state, "STOPPED");
  assert.ok(budget.snapshot().reserved > 0);
  assert.equal(budget.snapshot().confirmed, 0);
  assert.equal((await send()).status, 403);
  assert.equal(mock.calls.length, 1);
});
test("absent final usage cannot be interpreted as a free call", async t => {
  const { send, budget } = await rig(t, { fault: "missing-usage" });
  await (await send()).text();
  assert.equal(budget.snapshot().state, "STOPPED");
  assert.ok(budget.snapshot().reserved > 0);
});
test("unqualified real provider and wrong mock instance are rejected", async t => {
  await assert.rejects(verifyMock({ kind: "deepseek-official", url: "https://api.deepseek.com/anthropic" }), e => e.code === "PROVIDER_BOUND_UNQUALIFIED");
  const mock = await startMockProvider();
  t.after(() => mock.close());
  await assert.rejects(verifyMock({ ...mock.config, instanceId: "another-run" }), e => e.code === "MOCK_IDENTITY_MISMATCH");
  assert.equal(mock.calls.length, 0);
});
test("an occupied mock port fails closed; any HTTP listener is not identity", async t => {
  let requests = 0;
  const occupied = createServer((req, res) => { requests++; res.setHeader("content-type", "application/json"); res.end('{}'); });
  await new Promise(resolve => occupied.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => occupied.close(resolve)));
  const port = occupied.address().port;
  await assert.rejects(startMockProvider({ port }), e => e.code === "EADDRINUSE");
  await assert.rejects(verifyMock({ kind: "pnwf-deterministic-mock/v1", url: `http://127.0.0.1:${port}/`, instanceId: "expected", secret: "x".repeat(64) }));
  assert.equal(requests, 1); // identity GET only; no model route was called
});
test("successful sessions conserve exact accounting and permit the next stage", async t => {
  const { send, mock, budget } = await rig(t);
  await (await send()).text();
  await (await send({ stream: false })).text();
  const snapshot = budget.snapshot();
  assert.equal(snapshot.confirmed, mock.calls.reduce((n, call) => n + call.total, 0));
  assert.equal(snapshot.reserved, 0);
  budget.endSession("a", true);
  budget.startSession("b");
  assert.equal(budget.snapshot().sessions[1].state, "RUNNING");
});

const childNode = (args, env = {}) => new Promise((resolveExit, reject) => {
  const child = spawn(process.execPath, args, { env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  child.stdout.on("data", chunk => { output += chunk; }); child.stderr.on("data", chunk => { output += chunk; });
  child.once("error", reject); child.once("close", code => resolveExit({ code, output }));
});

test("separate OS processes cannot reserve the same remaining budget", async t => {
  const { budget, path } = ledger(t, 1000);
  const module = pathToFileURL(resolve("scripts/pnwf/execution_budget.mjs")).href;
  const code = `import {ExecutionBudget} from ${JSON.stringify(module)};
    const b=new ExecutionBudget(process.argv[1]);
    try{b.reserve('a',600,'process');}catch(e){process.exitCode=5;}finally{b.close();}`;
  const results = await Promise.all([childNode(["--input-type=module", "-e", code, path]), childNode(["--input-type=module", "-e", code, path])]);
  assert.deepEqual(results.map(r => r.code).sort(), [0, 5]);
  assert.equal(budget.snapshot().reserved, 600);
});

test("aggregate ceiling persists across completed sessions", t => {
  const { budget } = ledger(t, 1000);
  const id = budget.reserve("a", 600, "first"); budget.settle(id, 600); budget.endSession("a", true); budget.startSession("b");
  assert.throws(() => budget.reserve("b", 500, "second"), e => e.code === "BUDGET_EXHAUSTED");
  assert.equal(budget.snapshot().confirmed, 600);
  assert.equal(budget.snapshot().reserved, 0);
});

test("session ceiling still binds when the cohort has spare capacity", t => {
  const { budget, root } = ledger(t);
  const path = join(root, "session-cap.sqlite");
  const capped = ExecutionBudget.initialize(path, { ...budget.config, aggregateCeiling: 5000,
    sessions: [{ id: "a", ceiling: 1000, softCeiling: 900 }] });
  try {
    capped.startSession("a");
    assert.throws(() => capped.reserve("a", 901, "too much"), e => e.code === "BUDGET_EXHAUSTED");
    assert.equal(capped.snapshot().reserved, 0);
  } finally { capped.close(); }
});

test("mutated configuration and corrupted session rows fail closed", t => {
  const { budget, path } = ledger(t);
  budget.db.prepare("UPDATE sessions SET ordinal=9 WHERE id='a'").run();
  assert.throws(() => budget.reserve("a", 1, "bad row"), e => e.code === "UNOBSERVABLE_USAGE");
  assert.throws(() => new ExecutionBudget(path), e => e.code === "UNOBSERVABLE_USAGE");
  budget.db.prepare("UPDATE sessions SET ordinal=0 WHERE id='a'").run();
  budget.db.prepare("UPDATE config SET json=?").run(JSON.stringify({ ...budget.config, aggregateCeiling: 1000000 }));
  assert.throws(() => budget.reserve("a", 1, "changed authority"), e => e.code === "UNOBSERVABLE_USAGE");
});

test("null, negative or incomplete counters are not zero usage", () => {
  for (const usage of [{ output_tokens: 1 }, { input_tokens: 1, output_tokens: null },
    { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: null }, { input_tokens: -1, output_tokens: 1 }]) {
    assert.throws(() => finalUsage(usage));
  }
});

test("timeout retains the admitted bound and forbids a retry", async t => {
  const { send, budget, mock } = await rig(t, { delayMs: 150, timeoutMs: 30 });
  try { await (await send()).text(); } catch { /* deliberately interrupted */ }
  assert.equal(budget.snapshot().reason, "PROVIDER_TIMEOUT");
  assert.ok(budget.snapshot().reserved > 0);
  assert.equal((await send()).status, 403);
  assert.equal(mock.requests.length, 1);
});

test("the mock enforces output bounds; rejection never releases uncertain usage", async t => {
  const { send, budget, mock } = await rig(t, { reply: () => [{ type: "text", text: "x".repeat(500) }] });
  await (await send()).text();
  assert.equal(mock.requests.length, 1);
  assert.equal(mock.requests[0].accepted, false);
  assert.equal(budget.snapshot().state, "STOPPED");
  assert.ok(budget.snapshot().reserved > 0);
});

test("old isolation JSON cannot qualify an arbitrary host adapter or a paid run", async t => {
  const { root } = ledger(t);
  const cohort = join(root, "cohort.json"), adapter = join(root, "host.mjs"), proof = join(root, "old-isolation.json"), marker = join(root, "ran");
  writeFileSync(cohort, JSON.stringify({ schema: "pnwf-qualification-cohort/v1", cohortId: "qualification", aggregateCeiling: 10000,
    sessionCeiling: 10000, reserveTokens: 0, stages: [{ id: "a" }, { id: "b" }] }));
  writeFileSync(adapter, "import{writeFileSync}from'node:fs';writeFileSync(process.env.MARKER,'unsafe');");
  writeFileSync(proof, JSON.stringify({ status: "EVALUATION_ISOLATION_QUALIFIED" }));
  for (const mode of ["mock", "paid"]) {
    const result = await childNode(["scripts/pnwf/run_pnwf_live.mjs", "--execute", "--mode=" + mode,
      "--cohort=" + cohort, "--adapter=" + adapter, "--isolation=" + proof, "--session=a", "--out=" + root], { MARKER: marker });
    assert.equal(result.code, 5);
    assert.match(result.output, mode === "mock" ? /ADAPTER_NOT_QUALIFIED/ : /PROVIDER_BOUND_UNQUALIFIED/);
  }
  assert.equal(existsSync(marker), false);
});

test("runner refuses missing prior ledger and cannot restart an unresolved cohort", async t => {
  const { budget, root, path } = ledger(t);
  const mock = await startMockProvider(); t.after(() => mock.close());
  const cohort = join(root, "cohort.json"), provider = join(root, "provider.json");
  writeFileSync(cohort, JSON.stringify({ schema: "pnwf-qualification-cohort/v1", cohortId: "qualification", aggregateCeiling: 10000,
    sessionCeiling: 10000, reserveTokens: 0, stages: [{ id: "a" }, { id: "b" }] }));
  writeFileSync(join(root, "core.json"), JSON.stringify({ cohortId: "qualification", sessions: [{ id: "a" }, { id: "b" }] }));
  writeFileSync(provider, JSON.stringify(mock.config));
  const argv = ["scripts/pnwf/run_pnwf_live.mjs", "--execute", "--mode=mock", "--cohort=" + cohort,
    "--adapter=" + resolve("scripts/pnwf/container_adapter.mjs"), "--session=b", "--out=" + root];
  for (const ledgerPath of [join(root, "missing.sqlite"), path]) {
    const result = await childNode(argv, { ALHS_CORE_RUN: root, PNWF_BUDGET_DB: ledgerPath, PNWF_PROVIDER_CONFIG: provider });
    assert.equal(result.code, 5);
    const blocked = JSON.parse(readFileSync(join(root, "BLOCKED.json"), "utf8"));
    assert.ok(["UNOBSERVABLE_USAGE", "PRIOR_SESSION_UNRESOLVED"].includes(blocked.reason));
  }
  assert.equal(budget.snapshot().sessions[1].state, "NOT_STARTED");
  assert.equal(mock.requests.length, 0);
});

async function meteredRig(t, { complete = true, maxRequests = 1 } = {}) {
  const { budget, path } = fixtureLedger(t, { schema: USAGE_ONLY_SCHEMA, cohortId: "paid-transport-fixture", aggregateCeiling: null,
    sessions: ["a", "b"].map(id => ({ id, ceiling: null, softCeiling: null, maxRequests })) });
  const observations = [];
  const terminal = { input_tokens: 3_000_000, cache_read_input_tokens: 2_000_000, cache_creation_input_tokens: 0, output_tokens: 700 };
  const upstream = createServer((req, res) => {
    observations.push({ route: req.url, key: req.headers["x-api-key"], request: budget.snapshot().requests.at(-1) });
    req.resume();
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.write(`data: ${JSON.stringify({ type: "message_start", message: { usage: { input_tokens: 1, output_tokens: 0 } } })}\n\n`);
    res.write(`data: ${JSON.stringify({ type: "message_delta", usage: terminal })}\n\n`);
    res.end(complete ? 'data: {"type":"message_stop"}\n\n' : '');
  });
  await new Promise(resolve => upstream.listen(0, "127.0.0.1", resolve));
  const key = randomBytes(32).toString("hex");
  const proxy = await startMessagesProxy({ budget, sessionId: "a", sessionKey: key, requestAdmission: paidRequestAdmission,
    target: new URL(`http://127.0.0.1:${upstream.address().port}/anthropic/v1/messages`), headers: { "x-api-key": "fixture-upstream" } });
  t.after(async () => { await proxy.close(); await new Promise(resolve => upstream.close(resolve)); });
  const send = (overrides = {}) => fetch(proxy.url + "/v1/messages", { method: "POST", headers: { "x-api-key": key },
    body: JSON.stringify({ model: "deepseek-flash", stream: true, max_tokens: 400, messages: [{ role: "user", content: "fixture" }], ...overrides }) });
  return { budget, path, observations, terminal, send };
}

test("usage-only requests settle beyond former token ceilings and stop at the request count", async t => {
  const { budget, observations, terminal, send } = await meteredRig(t);
  await (await send()).text();
  assert.equal(observations.length, 1);
  assert.equal(observations[0].request.state, "PENDING");
  assert.equal(observations[0].request.reserved, null);
  assert.equal(observations[0].route, "/anthropic/v1/messages");
  assert.equal(observations[0].key, "fixture-upstream");
  assert.deepEqual(budget.snapshot().requests[0].usage, terminal);
  assert.equal(budget.snapshot().confirmed, 5_000_700);
  assert.equal(budget.snapshot().unresolvedRequests, 0);
  const refused = await send();
  assert.equal(refused.status, 429);
  assert.equal((await refused.json()).error.type, "REQUEST_LIMIT");
  assert.equal(observations.length, 1);
});

test("usage-only interrupted terminal stream persists unknown and does not send another request", async t => {
  const { budget, path, observations, send } = await meteredRig(t, { complete: false, maxRequests: 3 });
  await (await send()).text();
  const reopened = new ExecutionBudget(path);
  try {
    assert.equal(reopened.snapshot().requests[0].state, "UNKNOWN");
    assert.equal(reopened.snapshot().requests[0].actual, null);
    assert.equal(reopened.snapshot().unresolvedRequests, 1);
    assert.throws(() => reopened.startSession("b"), e => e.code === "COHORT_STOPPED");
  } finally { reopened.close(); }
  assert.equal((await send()).status, 403);
  assert.equal(observations.length, 1);
  assert.equal(budget.snapshot().state, "STOPPED");
});

test("usage-only gateway denies model switching and provider-side tools before sending", async t => {
  const { budget, observations, send } = await meteredRig(t);
  for (const [body, code] of [[{ model: "deepseek-v4-pro" }, "PAID_MODEL_OR_MESSAGES_DENIED"],
    [{ tools: [{ type: "web_search_20250305", name: "web_search" }] }, "PROVIDER_SIDE_TOOL_DENIED"]]) {
    const refused = await send(body);
    assert.equal(refused.status, 403);
    assert.equal((await refused.json()).error.type, code);
  }
  assert.equal(observations.length, 0);
  assert.equal(budget.snapshot().requests.length, 0);
});

test("an explicit usage-only manifest still cannot admit an arbitrary adapter or old spend ledger", async t => {
  const { root, path } = ledger(t);
  const cohort = join(root, "metered.json"), adapter = join(root, "adapter.mjs");
  writeFileSync(cohort, JSON.stringify({ schema: PAID_COHORT_SCHEMA, cohortId: "qualification", billingCeiling: null, maxRequests: 1,
    wallClockMs: 60000, stages: [{ id: "a" }] }));
  writeFileSync(adapter, 'throw new Error("UNSAFE_ADAPTER_EXECUTED");');
  writeFileSync(join(root, "core.json"), JSON.stringify({ cohortId: "qualification", budget: null, sessions: [{ id: "a", killAfterMs: 60000 }] }));
  for (const [candidate, refusal] of [[adapter, /ADAPTER_NOT_QUALIFIED/], [resolve("scripts/pnwf/container_adapter.mjs"), /BUDGET_COHORT_MISMATCH/]]) {
    const result = await childNode(["scripts/pnwf/run_pnwf_live.mjs", "--mode=" + PAID_MODE, "--cohort=" + cohort,
      "--adapter=" + candidate, "--session=a", "--execute", "--out=" + root], { ALHS_CORE_RUN: root, PNWF_BUDGET_DB: path });
    assert.equal(result.code, 5);
    assert.match(result.output, refusal);
  }
});
