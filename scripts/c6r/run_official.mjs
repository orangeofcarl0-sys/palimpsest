/**
 * C6-R A3 — runner for the DeepSeek official channel.
 *
 * The network path is the Windows CONNECT proxy at 127.0.0.1:7890, reached through WSL mirrored
 * networking and the installed `https-proxy-agent`. The pre-check is an unauthenticated GET / (401);
 * the scored P1 session is the availability test for the key/quota. The last two session slots are
 * used for the P1/F1 pair.
 *
 *   node scripts/c6r/run_official.mjs --prepare=c6r-005
 *   node scripts/c6r/run_official.mjs --run-p1=c6r-005
 *   node scripts/c6r/run_official.mjs --run-f1=c6r-005
 *   node scripts/c6r/run_official.mjs --status=c6r-005
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRun, loadRun, setCondition, transition } from "./runner.mjs";
import { accountSessions, readSessionStream } from "./session_stream.mjs";
import { classifySession } from "./budget.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const RUNS = join(REPO, "research-evidence", "c6r", "runs");
const PRECHECK = join(REPO, "research-evidence", "c6r", "deepseek-connect", "precheck.json");
const WSL_REPO = "/mnt/f/Codex_Work_Space/Palimpsest/palimpsest-sr1";
const WSL_P1_RUN = "/home/admini/c6r/runs/qual-p1";
const WSL_F1_RUN = "/home/admini/c6r/runs/qual-f1";
const P1_OUT = `${WSL_P1_RUN}/p1/scored-deepseek/out`;
const F1_OUT = `${WSL_F1_RUN}/f1/scored-deepseek/out`;

const PROVIDER = Object.freeze({
  name: "deepseek-official",
  model: "deepseek-flash",
  protocol: "anthropic-messages",
  baseUrl: "https://api.deepseek.com/anthropic",
  egress: "windows CONNECT proxy 127.0.0.1:7890 via https-proxy-agent",
  keySource: "owner DSH credential store, outside the sandbox",
});

function arg(name) {
  const prefix = `--${name}=`;
  const found = process.argv.find((value) => value.startsWith(prefix));
  return found === undefined ? null : found.slice(prefix.length);
}
function git(args) {
  return execFileSync("git", args, { cwd: REPO, encoding: "utf8" }).trim();
}
function wsl(args) {
  execFileSync("wsl.exe", ["-d", "Ubuntu", "--", ...args], {
    stdio: "inherit",
    env: { ...process.env, MSYS_NO_PATHCONV: "1" },
  });
}
function readPrecheck() {
  if (!existsSync(PRECHECK)) throw new Error("the official connectivity pre-check is missing");
  const result = JSON.parse(readFileSync(PRECHECK, "utf8"));
  if (result.reachable !== true) throw new Error("the official connectivity pre-check is not reachable");
  return { dir: "research-evidence/c6r/deepseek-connect", result };
}
function copyEvidence(runId, condition, wslOut) {
  const destWsl = `${WSL_REPO}/research-evidence/c6r/runs/${runId}/${condition}`;
  const dest = join(RUNS, runId, condition);
  mkdirSync(dest, { recursive: true });
  wsl(["rm", "-rf", destWsl]);
  wsl(["mkdir", "-p", `${WSL_REPO}/research-evidence/c6r/runs/${runId}`]);
  wsl(["cp", "-r", `${wslOut}/.`, destWsl]);
  return dest;
}
function classify(dir) {
  const sessionDir = join(dir, "session");
  const streams = existsSync(sessionDir)
    ? readdirSync(sessionDir).filter((name) => name.endsWith(".jsonl.zstd")).map((name) => readSessionStream(join(sessionDir, name)))
    : [];
  const account = accountSessions(streams);
  const first = account.sessions[0];
  const classification = classifySession({
    sessionCount: account.sessionCount,
    assistantMessages: first?.assistantMessages ?? 0,
    providerErrors: first?.providerErrors ?? 0,
    complete: account.sessions.length > 0 && account.sessions.every((session) => session.complete),
  });
  const exit = existsSync(join(dir, "exit-code.txt")) ? Number(readFileSync(join(dir, "exit-code.txt"), "utf8").trim()) : null;
  return { account, first, classification, exit };
}

const prepareId = arg("prepare");
if (prepareId !== null) {
  const connectivity = readPrecheck();
  const p1 = JSON.parse(readFileSync(join(REPO, "research-evidence", "c6r", "p1-host", "initial-state.json"), "utf8"));
  const run = createRun({
    root: RUNS,
    runId: prepareId,
    codeFreeze: git(["rev-parse", "HEAD"]),
    codeTree: git(["rev-parse", "HEAD^{tree}"]),
    t1: p1.observationTime,
    t2: "2026-02-14T09:10:00Z",
    visibleSetDigest: p1.inboxVisible?.visibleSetDigest ?? null,
    scenarioSource: "scripts/cog6/scenario",
  });
  run.provider = PROVIDER;
  run.connectivity = connectivity;
  setCondition(run, "P1", { preparedAt: new Date().toISOString(), evidence: "research-evidence/c6r/p1-host" });
  setCondition(run, "F1", { preparedAt: new Date().toISOString(), evidence: "research-evidence/c6r/f1-host" });
  run.initial = {
    p1ProjectHead: p1.projectHead,
    p1Revision: p1.projectRevision,
    p1Ready: p1.readyTasks,
    p1Satisfied: p1.satisfiedTasks,
    p1VisibleSetDigest: p1.inboxVisible?.visibleSetDigest ?? null,
    p1CanonicalCapabilities: p1.canonicalCapabilitiesDigest,
    p1CandidateOnDisk: p1.candidateOnDisk?.digest ?? null,
  };
  process.stdout.write(`${JSON.stringify({ run: run.runId, state: run.state, provider: run.provider, connectivity: run.connectivity.result.status, codeFreeze: run.codeFreeze }, null, 2)}\n`);
  process.exit(0);
}

const statusId = arg("status");
if (statusId !== null) {
  process.stdout.write(`${JSON.stringify(loadRun(join(RUNS, statusId)), null, 2)}\n`);
  process.exit(0);
}

const p1Id = arg("run-p1");
if (p1Id !== null) {
  const run = loadRun(join(RUNS, p1Id));
  if (run.state !== "P1_PREPARED") throw new Error(`P1 requires P1_PREPARED, got ${run.state}`);
  readPrecheck();
  transition(run, "P1_RUNNING", { reason: "deepseek-official session launched through the Windows CONNECT proxy" });
  wsl(["bash", `${WSL_REPO}/scripts/c6r/session_p1_deepseek_wsl.sh`]);
  const dir = copyEvidence(p1Id, "P1", P1_OUT);
  const result = classify(dir);
  setCondition(run, "P1", {
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    sessionId: result.first?.sessionId ?? null,
    exit: result.exit === null ? null : { code: result.exit, signal: null },
    usage: result.first === undefined ? null : { inputTokens: result.first.inputTokens, outputTokens: result.first.outputTokens, totalTokens: result.first.totalTokens },
    classification: result.classification.classification,
    evidence: `research-evidence/c6r/runs/${p1Id}/P1`,
    classifyReason: result.classification.reason,
    account: result.account,
  });
  if (result.classification.classification === "OBSERVED") transition(run, "P1_FINISHED", { reason: "valid assistant observation" });
  else if (result.classification.classification === "BLOCKED") transition(run, "BLOCKED", { reason: result.classification.reason ?? "session_blocked", detail: `research-evidence/c6r/runs/${p1Id}/P1` });
  else transition(run, "INVALID", { reason: result.classification.reason ?? "session_invalid", detail: `research-evidence/c6r/runs/${p1Id}/P1` });
  process.stdout.write(`${JSON.stringify({ run: run.runId, condition: "P1", state: run.state, classification: result.classification, account: result.account.totals, sessionId: result.first?.sessionId ?? null, exit: result.exit }, null, 2)}\n`);
  process.exit(result.classification.classification === "OBSERVED" ? 0 : result.classification.classification === "BLOCKED" ? 3 : 4);
}

const f1Id = arg("run-f1");
if (f1Id !== null) {
  const run = loadRun(join(RUNS, f1Id));
  if (run.state === "P1_FINISHED") transition(run, "F1_PREPARED", { reason: "P1 preserved; F1 next" });
  if (run.state !== "F1_PREPARED") throw new Error(`F1 requires F1_PREPARED, got ${run.state}`);
  readPrecheck();
  transition(run, "F1_RUNNING", { reason: "deepseek-official session launched through the Windows CONNECT proxy" });
  wsl(["bash", `${WSL_REPO}/scripts/c6r/session_f1_deepseek_wsl.sh`]);
  const dir = copyEvidence(f1Id, "F1", F1_OUT);
  const result = classify(dir);
  setCondition(run, "F1", {
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    sessionId: result.first?.sessionId ?? null,
    exit: result.exit === null ? null : { code: result.exit, signal: null },
    usage: result.first === undefined ? null : { inputTokens: result.first.inputTokens, outputTokens: result.first.outputTokens, totalTokens: result.first.totalTokens },
    classification: result.classification.classification,
    evidence: `research-evidence/c6r/runs/${f1Id}/F1`,
    classifyReason: result.classification.reason,
    account: result.account,
  });
  if (result.classification.classification === "OBSERVED") transition(run, "F1_FINISHED", { reason: "valid assistant observation" });
  else if (result.classification.classification === "BLOCKED") transition(run, "BLOCKED", { reason: result.classification.reason ?? "session_blocked", detail: `research-evidence/c6r/runs/${f1Id}/F1` });
  else transition(run, "INVALID", { reason: result.classification.reason ?? "session_invalid", detail: `research-evidence/c6r/runs/${f1Id}/F1` });
  process.stdout.write(`${JSON.stringify({ run: run.runId, condition: "F1", state: run.state, classification: result.classification, account: result.account.totals, sessionId: result.first?.sessionId ?? null, exit: result.exit }, null, 2)}\n`);
  process.exit(result.classification.classification === "OBSERVED" ? 0 : result.classification.classification === "BLOCKED" ? 3 : 4);
}

process.stderr.write("usage: --prepare=<id> | --run-p1=<id> | --run-f1=<id> | --status=<id>\n");
process.exit(2);
