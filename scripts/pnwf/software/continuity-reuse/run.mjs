import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { appendFileSync, cpSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { runContainerSession } from "../../container_adapter.mjs";
import { docker } from "../../container_runtime.mjs";
import { ExecutionBudget, USAGE_ONLY_SCHEMA } from "../../execution_budget.mjs";
import { PAID_COHORT_SCHEMA, PAID_MODE } from "../../bounded_provider.mjs";
import { startMockProvider } from "../../mock_provider.mjs";
import { OPENCODE_GO_MESSAGES, readOpenCodeGoKey, requireOpenCodeGoProbe } from "../../opencode_go.mjs";
import { analyzeAttributedStage, readStream } from "../../analyze_energy_trajectory.mjs";
import { stageRuntime } from "../../energy/container-worker.mjs";
import { digest, git, readJson, writeJson } from "../../energy/contract.mjs";
import { attribute } from "../../energy/evidence.mjs";
import { checkpoint, conclusion } from "../../energy/product.mjs";
import { accepted, admit, brief, correction, episodeId, file, here, hint, historical, hostSha, journalEvents, noteSeed, replay, repo,
  restore, score, workEvents } from "./case.mjs";
import { originalCase, replayCloseout } from "./closeout-replay.mjs";

const [modeArg, directory, mockDirectory] = process.argv.slice(2);
assert(directory && ["mock", "live", "mock-closeout", "live-closeout"].includes(modeArg),
  "Usage: continuity-reuse/run.mjs mock|live|mock-closeout|live-closeout <new output dir> [qualified Mock dir]");
const closeout = modeArg.endsWith("-closeout");
const paid = modeArg.startsWith("live");
const sourceHost = closeout ? "07ab5aad7f77a2fd67f426c80e5215cf3f2bc6de" : hostSha;
const mode = paid ? PAID_MODE : "mock";
const root = resolve(directory);
const image = docker(["image", "inspect", "palimpsest-cold-handover:local", "--format", "{{.Id}}"]);
const window = { maxRequests: 64, wallClockMs: 30 * 60_000, requestTimeoutMs: 240_000, billingCeiling: null };
const session = "RESUME";
const runtime = join(root, "runtime");
const changedHostFiles = git(repo, "diff", "--name-only", sourceHost, "--", "src", "host", "package.json", "pnpm-lock.yaml", "tsconfig.json").split("\n").filter(Boolean);
assert(changedHostFiles.every(path => closeout && ["host/dsh/lib/runner.js", "host/dsh/lib/direct_closeout.js", "src/application/work_outcome.ts"].includes(path)), "Host source differs from the held revision");
const files = ["case.mjs", "run.mjs", "plugin/index.js", "plugin/package.json", "../../container_adapter.mjs",
  "../../container_runtime.mjs", "../../bounded_provider.mjs", "../../execution_budget.mjs", "../../analyze_energy_trajectory.mjs",
  "../../energy/container-worker.mjs"].map(name => join(here, name));
for (const name of readdirSync(join(repo, "dist/src"), { recursive: true }).filter(name => name.endsWith(".js")).sort()) files.push(join(repo, "dist/src", name));
if (closeout) files.push(join(here, "closeout-replay.mjs"), join(repo, "host/dsh/lib/direct_closeout.js"), join(repo, "host/dsh/lib/runner.js"));
const frozen = { hostSha: sourceHost, accepted: accepted.acceptedHead, image, window, briefSha256: digest(brief), hintSha256: digest(hint),
  ...(closeout ? { closeout: true } : {}),
  codeSha256: digest(JSON.stringify(files.map(path => digest(readFileSync(path))))) };
let qualified;
let provider;
if (paid) {
  qualified = readJson(join(resolve(mockDirectory), "matrix.json"));
  assert.equal(qualified.qualified, true);
  assert.deepEqual(qualified.frozen, frozen);
  assert.equal(qualified.rows.length, 2);
  assert(qualified.rows.every(row => row.passed && row.execution.paidRequestsAdmitted === 0));
  provider = requireOpenCodeGoProbe(readJson(join(repo, "research-evidence/pnwf-work-revision/2026-11-18/opencode-go-tooled-t3-055602/opencode-probe.json")));
  readOpenCodeGoKey(provider);
}

function configureProfile(home) {
  cpSync(join(here, "plugin"), join(home, "profiles/node_modules/pnwf-handover-review"), { recursive: true });
  appendFileSync(join(home, "profiles/alhs-core/cordis.patch.yml"), "\n- insert:\n    - id: pnwf-handover-review\n      name: pnwf-handover-review\n");
}

function dispatch(run, receipt, request) {
  const expected = receipt.sha;
  if (!request || request.sha !== expected || typeof request.question !== "string" || !request.question.trim()) {
    const result = { ok: false, reason: "ACCEPTED_SHA_REQUIRED", next: "Use the full owner-accepted Git SHA and specify the handover question." };
    appendFileSync(join(run, "desk.jsonl"), JSON.stringify({ sha: request?.sha ?? null, result }) + "\n");
    return result;
  }
  const result = { ok: true, receiptId: digest(JSON.stringify(receipt)), ...receipt };
  appendFileSync(join(run, "desk.jsonl"), JSON.stringify({ sha: request.sha, result }) + "\n");
  return result;
}

function mockReply(offered, retained) {
  const report = `# Cold handover maintenance review\n\nReadback decision: READY\n\nThe previous UNKNOWN for ${episodeId} is historical. A same-SHA cold readback finds that Episode REOPENED. The owner accepted ${accepted.acceptedHead} in DIRECT_BASIS event 8. Verification note ${accepted.note.id} follows ${correction}; no open questions remain. This is for maintenance handover only, with release approval retained by the owner.\n\n${retained}`;
  const wrong = { sha: accepted.basis, question: "Read the original accepted project" };
  const right = { sha: accepted.acceptedHead, question: "Is the historic handover blocker still reproducible?" };
  const observe = [{ name: "palimpsest_continuity", input: { action: "pulse" } },
  ...(offered ? [{ name: "handover_readback", input: wrong }, { name: "handover_readback", input: right }]
    : [{ name: "palimpsest_continuity", input: { action: "explain", subject: `episode:${episodeId}` } },
      { name: "palimpsest_continuity", input: { action: "explain", subject: `journal:${accepted.note.id}` } }]),
  { name: "bash", input: { command: `printf %s '${Buffer.from(report).toString("base64")}' | base64 -d > ${file} && git add -- ${file} && git commit -m 'Revalidate retained gRPC handover' && echo HANDOVER_COMMITTED`, description: "Submit the qualified maintenance review" } },
  { name: "palimpsest_work", input: { action: "conclude", intent: "DELIVER", artifacts: [file], statement: "Deliver the revalidated cold-handover review." } }];
  return async (request, ordinal) => {
    const messages = JSON.stringify(request.messages);
    assert.equal(messages.includes(hint), offered);
    assert(messages.includes(brief));
    const latest = request.messages.flatMap(message => Array.isArray(message.content) ? message.content : [])
      .findLast(block => block.type === "tool_result")?.content;
    if (ordinal === 1) assert(JSON.stringify(latest).includes(accepted.acceptedHead));
    if (ordinal === 2) assert(JSON.stringify(latest).includes(offered ? "ACCEPTED_SHA_REQUIRED" : "REOPENED"));
    if (ordinal === 3) assert(JSON.stringify(latest).includes(offered ? "receiptId" : accepted.note.id));
    if (ordinal === 4) assert(JSON.stringify(latest).includes("HANDOVER_COMMITTED"));
    if (closeout && ordinal === 4) return [{ type: "text", text: "The scoped maintenance review is committed." }];
    if (closeout && ordinal === 5) assert(messages.includes("[Project closeout]") && messages.includes("intent=DELIVER"));
    if (ordinal === (closeout ? 6 : 5)) assert(JSON.stringify(latest).includes("RECORDED"));
    const call = observe[closeout && ordinal >= 5 ? ordinal - 1 : ordinal];
    return call ? [{ type: "tool_use", id: `handover_${ordinal}`, ...call }]
      : [{ type: "text", text: "The scoped maintenance review is committed." }];
  };
}

function analyze(run, out, evidence, receipt, approval, offered) {
  const principal = evidence.traces.find(row => row.role === "principal");
  assert(principal);
  const streams = join(run, `runtime-${session}`, "sessions");
  const paths = readdirSync(streams, { recursive: true }).filter(path => path.endsWith(".zstd"));
  const path = paths.find(path => digest(readFileSync(join(streams, path))) === principal.digest);
  assert(path);
  const timeline = readJson(join(out, "attribution", `${evidence.traces.indexOf(principal)}.timeline.json`)).summary;
  const rows = readStream(join(streams, path), principal.digest);
  const bySeq = new Map(rows.map(row => [row.seq, row]));
  const resultByCall = new Map(timeline.results.map(row => [row.callId, row]));
  const significant = [];
  for (const call of timeline.calls) {
    const paired = resultByCall.get(call.callId);
    const event = bySeq.get(call.seq);
    const message = bySeq.get(paired?.seq)?.data?.message;
    if (message) assert.equal(message.toolCallId, call.callId);
    const output = (message?.content ?? []).map(block => block.text ?? "").join("\n");
    const input = JSON.parse(event.data.arguments);
    const tool = event.data.name;
    const kind = call.kind.split(" ")[0];
    const item = { id: call.callId, call: call.seq, result: paired?.seq ?? null, request: event.data.step, kind, ok: paired?.ok ?? false };
    if (tool === "handover_readback") {
      const payload = JSON.parse(output || "null");
      significant.push({ ...item, action: "request-independent-made-measurement", sha: input.sha,
        question: input.question, receipt: payload?.receiptId ?? null, reason: payload?.reason ?? null });
      if (payload?.ok) assert.equal(payload.receiptId, digest(JSON.stringify(receipt)));
    } else if (tool === "palimpsest_continuity" && input.action === "explain") {
      const payload = JSON.parse(output || "null");
      significant.push({ ...item, action: "inspect-record", subject: input.subject, found: payload?.found ?? false,
        episode: payload?.episode?.state ?? null, acceptance: payload?.headAcceptance?.eventId ?? null });
    } else if (tool === "palimpsest_continuity" && input.action === "pulse") {
      significant.push({ ...item, action: "pulse", reachedAccepted: output.includes(accepted.acceptedHead), containsReopen: output.includes("REOPENED") });
    } else if (kind === "read" || tool === "view" || tool === "bash") {
      const target = JSON.stringify(input);
      if (target.includes(file)) significant.push({ ...item, action: /git commit/u.test(target) ? "commit-review" : "review-file", input });
    } else if (kind === "edit" || kind === "write") {
      if (JSON.stringify(input).includes(file)) significant.push({ ...item, action: "revise-review", input });
    } else if (kind === "work:conclude" || tool.includes("subagent") || tool === "workflow") {
      significant.push({ ...item, action: kind, input });
    }
  }
  const firstVerify = significant.find(row => row.receipt || (row.action === "inspect-record" && row.found && row.episode === "REOPENED")) ?? null;
  const offer = offered ? approval.ref : null;
  const methodInReplay = rows.some(event => JSON.stringify(event.data ?? {}).includes(hint));
  const closeoutOffers = readFileSync(join(out, "run.log"), "utf8").split(/\r?\n/u).filter(line => line.startsWith("PALIMPSEST_CLOSEOUT_OFFER "))
    .map(line => JSON.parse(line.slice("PALIMPSEST_CLOSEOUT_OFFER ".length)));
  const closeoutMessages = rows.filter(event => event.type === "user/message" && JSON.stringify(event.data).includes("[Project closeout]"))
    .map(event => event.seq);
  return { offer, methodInReplay, firstVerify, independentReceiptCount: significant.filter(row => row.receipt).length,
    ...(closeout ? { closeoutOffers, closeoutMessages } : {}),
    stream: path.replaceAll("\\", "/"), significant };
}

async function arm(name, seed, receipt, approval) {
  const offered = name === "WITH";
  const run = join(root, name);
  const stage = join(run, "stages", session);
  const world = join(stage, "world");
  const state = join(stage, "state");
  mkdirSync(stage, { recursive: true });
  cpSync(seed.world, world, { recursive: true });
  cpSync(seed.state, state, { recursive: true });
  const deployment = join(run, "profile.json");
  const settings = readJson(seed.profile);
  writeJson(deployment, { ...settings, repository: world, transport: { ...settings.transport, databasePath: join(state, "transport.sqlite") },
    databases: Object.fromEntries(Object.entries(settings.databases).map(([key, path]) => [key, join(state, path.split(/[\\/]/u).at(-1))])) });
  const beforeWork = workEvents(state);
  const beforeJournal = journalEvents(state);
  assert.equal(git(world, "rev-parse", "HEAD"), seed.head);
  assert.equal(git(world, "status", "--porcelain"), "");
  const promptPath = join(run, "prompt.txt");
  writeFileSync(join(run, "brief.txt"), brief);
  writeFileSync(promptPath, `${brief}${offered ? `\n\n[Approved project handover method] ${approval.revision.content.steps[0].instruction}` : ""}`);
  if (offered) writeJson(join(run, "offer.json"), { procedure: approval.ref, accepted: accepted.acceptedHead, worktree: seed.head, instructionSha256: digest(hint) });
  const cohortId = `continuity-reuse-${randomUUID()}`;
  const ceiling = paid ? null : 2_000_000;
  const budgetPath = join(run, "request-ledger.sqlite");
  if (paid) writeJson(join(run, "cohort.json"), { schema: PAID_COHORT_SCHEMA, cohortId, stages: [{ id: session }], ...window });
  writeJson(join(run, "core.json"), { cohortId, budget: ceiling, sessions: [{ id: session, condition: "P", world, state, deployment, expectedHead: seed.head,
    promptPath, killAfterMs: paid ? window.wallClockMs : 5 * 60_000 }] });
  const budget = ExecutionBudget.initialize(budgetPath, { schema: paid ? USAGE_ONLY_SCHEMA : "pnwf-request-budget/v1", cohortId, aggregateCeiling: ceiling,
    sessions: [{ id: session, ceiling, softCeiling: ceiling, maxRequests: paid ? window.maxRequests : 16 }] });
  const mock = paid ? null : await startMockProvider({ reply: mockReply(offered, seed.retained) });
  const row = { name, basis: seed.head, accepted: accepted.acceptedHead, mode, passed: false };
  try {
    budget.startSession(session);
    console.log("START", mode, name);
    row.execution = await runContainerSession({ run, sessionId: session, budgetPath, repository: runtime, image, mode, provider: mock?.config,
      experiment: { layout: "product", openCodeGoProfile: provider, configureProfile, dispatchDesk: args => dispatch(run, receipt, args) } });
  } finally { budget.close(); await mock?.close(); }
  const out = join(run, "out", session);
  const ledger = readJson(join(out, "request-accounting.json"));
  row.accounting = { requests: ledger.requests.length, confirmed: ledger.confirmed, unresolved: ledger.unresolvedRequests };
  try {
    row.evidence = attribute(run, session, mode);
    row.trajectory = analyze(run, out, row.evidence, receipt, approval, offered);
    if (paid && row.evidence.usageQualified) row.requestBinding = analyzeAttributedStage(run, session, {
      arm: name, result: { evidence: row.evidence, seal: { provider: "opencode-go", route: OPENCODE_GO_MESSAGES } },
    });
  } catch (error) { row.attributionError = error.message; }
  if (mock?.failures.length) row.mockErrors = mock.failures;
  row.candidate = git(world, "rev-parse", "HEAD");
  row.status = git(world, "status", "--porcelain");
  row.paths = git(world, "diff", "--name-only", seed.head, row.candidate).split(/\r?\n/u).filter(Boolean);
  writeFileSync(join(run, "working.patch"), git(world, "diff", "--binary", "HEAD"));
  const working = readFileSync(join(world, file), "utf8");
  writeFileSync(join(run, "review-working.md"), working);
  if (row.candidate !== seed.head) {
    git(world, "merge-base", "--is-ancestor", seed.head, row.candidate);
    git(world, "bundle", "create", join(run, "candidate.bundle"), `${seed.head}..HEAD`);
    writeFileSync(join(run, "candidate.patch"), git(world, "diff", "--binary", seed.head, row.candidate) + "\n");
    const committed = execFileSync("git", ["-C", world, "cat-file", "blob", `${row.candidate}:${file}`], { encoding: "utf8", timeout: 20_000 });
    writeFileSync(join(run, "review-committed.md"), committed);
    row.grade = score({ text: committed, retained: seed.retained });
  } else row.grade = score({ text: working, retained: seed.retained });
  checkpoint(state);
  row.owners = { workPreserved: JSON.stringify(workEvents(state)) === JSON.stringify(beforeWork),
    journalPrefixPreserved: JSON.stringify(journalEvents(state).slice(0, beforeJournal.length)) === JSON.stringify(beforeJournal),
    journalAppends: journalEvents(state).length - beforeJournal.length };
  row.conclusion = conclusion(state);
  const body = row.conclusion?.body.split("\n").find(line => line.startsWith('{"schema":"pc1-episode-conclusion/v1"'));
  row.delivery = row.conclusion?.intent === "DELIVER" && Boolean(body && JSON.parse(body).check.artifacts.some(artifact =>
    artifact.path === file && artifact.committed && artifact.commit === row.candidate));
  row.passed = row.execution.natural && row.evidence?.valid && row.candidate !== seed.head && row.status === "" && row.paths.join() === file &&
    row.grade.passed === row.grade.expected && row.owners.workPreserved && row.owners.journalPrefixPreserved && row.delivery;
  if (!paid) row.passed = row.passed && !row.mockErrors && row.trajectory.methodInReplay === offered &&
    (offered ? row.trajectory.firstVerify?.receipt && row.trajectory.significant.some(x => x.reason === "ACCEPTED_SHA_REQUIRED")
      : row.trajectory.firstVerify?.episode === "REOPENED" && row.trajectory.independentReceiptCount === 0);
  if (!paid && closeout) row.passed = row.passed && row.trajectory.closeoutOffers.length === 1 &&
    row.trajectory.closeoutOffers[0].head === row.candidate && row.trajectory.closeoutMessages.length === 1 &&
    row.trajectory.significant.some(event => event.action === "work:conclude" && event.input.intent === "DELIVER" &&
      event.call > row.trajectory.closeoutMessages[0]);
  row.passed = Boolean(row.passed);
  writeJson(join(run, "result.json"), row);
  console.log("RESULT", name, row.passed, row.candidate, row.accounting, row.grade);
  return row;
}

mkdirSync(root);
const prior = historical();
const seed = restore(join(root, "restored"));
const { receipt: measured, tests } = await replay(seed, prior, sourceHost);
const receipt = closeout ? readJson(join(originalCase, "independent-review.json")) : measured;
if (closeout) assert.deepEqual({ ...measured, runtime: receipt.runtime }, receipt, "Independent verifier facts drifted from the prior pair");
writeJson(join(root, "historical.json"), prior);
writeJson(join(root, "independent-review.json"), receipt);
writeFileSync(join(root, "independent-public-tests.log"), tests);
const approval = await admit(root, prior, receipt);
writeJson(join(root, "approval.json"), approval);
Object.assign(seed, noteSeed(seed.world, prior));
if (closeout) {
  const regressions = await replayCloseout(root, seed);
  writeJson(join(root, "closeout-regression.json"), regressions);
  assert.equal(regressions.length, 2);
}
git(seed.world, "bundle", "create", join(root, "inherited.bundle"), "HEAD");
writeFileSync(join(root, "inherited-review.md"), seed.text);
assert.equal(score({ text: seed.text, retained: seed.retained }).checks.revisedDecision, false);
if (qualified) {
  assert.equal(qualified.basis, seed.head);
  assert.deepEqual(qualified.procedure, approval.ref);
  assert.equal(qualified.receiptId, digest(JSON.stringify(receipt)));
}
stageRuntime({ repo, destination: runtime });
const matrix = { mode, frozen, basis: seed.head, procedure: approval.ref, receiptId: digest(JSON.stringify(receipt)), rows: [], qualified: false };
writeJson(join(root, "matrix.json"), matrix);
// Counterbalance the previous method trial, where WITH ran first.
for (const name of ["WITHOUT", "WITH"]) {
  const row = await arm(name, seed, receipt, approval);
  matrix.rows.push(row);
  matrix.qualified = matrix.rows.length === 2 && matrix.rows.every(row => row.passed);
  writeJson(join(root, "matrix.json"), matrix);
  if (paid && (!row.accounting.requests || row.accounting.unresolved || !row.evidence?.usageQualified)) break;
}
if (!paid && !matrix.qualified) process.exitCode = 1;
