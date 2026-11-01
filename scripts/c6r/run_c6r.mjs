/**
 * C6-R — research runner CLI (provider amendment A2: opencode/deepseek-v4.1-flash).
 *
 *   node scripts/c6r/run_c6r.mjs --prepare=<runId>          create an immutable run record
 *   node scripts/c6r/run_c6r.mjs --status=<runId>           print the run record
 *   node scripts/c6r/run_c6r.mjs --gate                     read the latest opencode probe
 *   node scripts/c6r/run_c6r.mjs --probe=<runId>            run the ONE bounded opencode probe
 *   node scripts/c6r/run_c6r.mjs --run=<runId> [--condition=p1|f1]
 *                                                           run P1 or F1, only if AVAILABLE
 *
 * A scored condition is refused when the provider gate is not AVAILABLE. A provider/session failure
 * becomes BLOCKED; an unreadable/contaminated observation becomes INVALID; an unfavourable but real
 * turn remains OBSERVED.
 */
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRun, loadRun, setCondition, transition, writeRun } from "./runner.mjs";
import { accountSessions, readSessionStream } from "./session_stream.mjs";
import { classifySession } from "./budget.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..");
const RUNS = join(REPO, "research-evidence", "c6r", "runs");
const PROBES = join(REPO, "research-evidence", "c6r", "opencode-probe");
const QUAL_P1 = join(REPO, "research-evidence", "c6r", "p1-host", "initial-state.json");
const WSL_REPO = "/mnt/f/Codex_Work_Space/Palimpsest/palimpsest-sr1";
const WSL_QUAL_P1 = "/home/admini/c6r/runs/qual-p1";
const WSL_QUAL_F1 = "/home/admini/c6r/runs/qual-f1";

const PROVIDER = Object.freeze({
  name: "opencode",
  model: "deepseek-v4.1-flash",
  protocol: "openai-chat-completions",
  baseUrl: "https://opencode.ai/zen/go/v1",
  zcodeProviderId: "5c7f8d75-e85e-4de5-9b27-e2b59eab1c7a",
});

function arg(name) {
  const prefix = `--${name}=`;
  const found = process.argv.find((value) => value.startsWith(prefix));
  return found === undefined ? null : found.slice(prefix.length);
}
function flag(name) {
  return process.argv.includes(`--${name}`);
}
function git(args) {
  return execFileSync("git", args, { cwd: REPO, encoding: "utf8" }).trim();
}
function wsl(args, env = {}) {
  return execFileSync("wsl.exe", ["-d", "Ubuntu", "--", ...args], {
    stdio: "inherit",
    env: { ...process.env, MSYS_NO_PATHCONV: "1", ...env },
  });
}
function latestProbe() {
  if (!existsSync(PROBES)) return null;
  const dirs = readdirSync(PROBES, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .reverse();
  for (const name of dirs) {
    const path = join(PROBES, name, "probe-result.json");
    if (existsSync(path)) return { dir: join(PROBES, name), result: JSON.parse(readFileSync(path, "utf8")) };
  }
  return null;
}
function requireAvailable(run) {
  const probe = latestProbe();
  if (probe === null || probe.result.state !== "AVAILABLE") {
    throw new Error(`provider gate is not AVAILABLE: ${probe?.result?.state ?? "no probe"}`);
  }
  if (probe.result.provider !== PROVIDER.name || probe.result.model !== PROVIDER.model) {
    throw new Error(`probe identity ${probe.result.provider}/${probe.result.model} does not match ${PROVIDER.name}/${PROVIDER.model}`);
  }
  if (run.provider === undefined || run.provider.model !== PROVIDER.model) {
    throw new Error("run provider identity does not match the amended provider");
  }
  return probe;
}

if (flag("gate")) {
  const probe = latestProbe();
  if (probe === null) {
    process.stdout.write(`${JSON.stringify({ gate: "UNKNOWN", reason: "no opencode probe result is recorded" }, null, 2)}\n`);
    process.exit(2);
  }
  process.stdout.write(`${JSON.stringify({ gate: probe.result.state, dir: probe.dir, provider: probe.result.provider, model: probe.result.model, exit: probe.result.exit, assistantMessages: probe.result.assistantMessages, usage: probe.result.usage, codeFreeze: probe.result.codeFreeze }, null, 2)}\n`);
  process.exit(0);
}

const prepareId = arg("prepare");
if (prepareId !== null) {
  const p1 = JSON.parse(readFileSync(QUAL_P1, "utf8"));
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
  run.provider = { ...PROVIDER, keySource: "zcode provider_config.json (outside the sandbox)" };
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
  writeRun(run);
  process.stdout.write(`${JSON.stringify({ run: run.runId, state: run.state, provider: run.provider, codeFreeze: run.codeFreeze, initial: run.initial }, null, 2)}\n`);
  process.exit(0);
}

const statusId = arg("status");
if (statusId !== null) {
  process.stdout.write(`${JSON.stringify(loadRun(join(RUNS, statusId)), null, 2)}\n`);
  process.exit(0);
}

const probeId = arg("probe");
if (probeId !== null) {
  const run = loadRun(join(RUNS, probeId));
  wsl(["bash", `${WSL_REPO}/scripts/c6r/probe_opencode_wsl.sh`], {
    C6R_CODE_FREEZE_COMMIT: run.codeFreeze.commit,
    C6R_CODE_FREEZE_TREE: run.codeFreeze.tree,
    C6R_HEAD_AT_PROBE: git(["rev-parse", "HEAD"]),
  });
  const probe = latestProbe();
  if (probe === null) throw new Error("the opencode probe produced no result");
  run.probe = { dir: probe.dir, result: probe.result };
  if (probe.result.state !== "AVAILABLE") {
    transition(run, "BLOCKED", {
      reason: probe.result.reason ?? "provider_unavailable",
      detail: probe.dir,
    });
  }
  writeRun(run);
  process.stdout.write(`${JSON.stringify({ run: run.runId, state: run.state, gate: probe.result.state, provider: probe.result.provider, model: probe.result.model }, null, 2)}\n`);
  process.exit(probe.result.state === "AVAILABLE" ? 0 : 3);
}

const runId = arg("run");
if (runId !== null) {
  const run = loadRun(join(RUNS, runId));
  const condition = (arg("condition") ?? (run.state === "P1_FINISHED" ? "f1" : "p1")).toLowerCase();
  if (condition !== "p1" && condition !== "f1") throw new Error("--condition must be p1 or f1");
  requireAvailable(run);

  const isP1 = condition === "p1";
  if (isP1) {
    if (run.state !== "P1_PREPARED") throw new Error(`P1 requires P1_PREPARED, got ${run.state}`);
    transition(run, "P1_RUNNING", { reason: "opencode session launched" });
    wsl(["bash", `${WSL_REPO}/scripts/c6r/session_p1_opencode_wsl.sh`], { C6R_P1_RUN: WSL_QUAL_P1 });
  } else {
    if (run.state === "P1_FINISHED") transition(run, "F1_PREPARED", { reason: "P1 preserved; F1 next" });
    if (run.state !== "F1_PREPARED") throw new Error(`F1 requires F1_PREPARED, got ${run.state}`);
    transition(run, "F1_RUNNING", { reason: "opencode session launched" });
    wsl(["bash", `${WSL_REPO}/scripts/c6r/session_f1_opencode_wsl.sh`], { C6R_F1_RUN: WSL_QUAL_F1 });
  }

  const wslOut = isP1 ? `${WSL_QUAL_P1}/p1/scored/out` : `${WSL_QUAL_F1}/f1/scored/out`;
  const dest = join(RUNS, runId, isP1 ? "P1" : "F1");
  mkdirSync(dest, { recursive: true });
  try {
    wsl(["rm", "-rf", `${WSL_REPO}/research-evidence/c6r/runs/${runId}/${isP1 ? "P1" : "F1"}`]);
    wsl(["mkdir", "-p", `${WSL_REPO}/research-evidence/c6r/runs/${runId}`]);
    wsl(["cp", "-r", `${wslOut}/.`, `${WSL_REPO}/research-evidence/c6r/runs/${runId}/${isP1 ? "P1" : "F1"}`]);
  } catch {
    /* the evidence copy is recorded below even when the copy itself fails */
  }
  const evidenceDir = existsSync(dest) ? dest : null;
  const sessionDir = evidenceDir === null ? null : join(evidenceDir, "session");
  const streams = sessionDir !== null && existsSync(sessionDir)
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
  const exit = evidenceDir !== null && existsSync(join(evidenceDir, "exit-code.txt"))
    ? Number(readFileSync(join(evidenceDir, "exit-code.txt"), "utf8").trim())
    : null;
  setCondition(run, isP1 ? "P1" : "F1", {
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    sessionId: first?.sessionId ?? null,
    exit: exit === null ? null : { code: exit, signal: null },
    usage: first === undefined ? null : { inputTokens: first.inputTokens, outputTokens: first.outputTokens, totalTokens: first.totalTokens },
    classification: classification.classification,
    evidence: evidenceDir === null ? null : `research-evidence/c6r/runs/${runId}/${isP1 ? "P1" : "F1"}`,
    classifyReason: classification.reason,
    account,
  });
  if (classification.classification === "OBSERVED") {
    transition(run, isP1 ? "P1_FINISHED" : "F1_FINISHED", { reason: "valid assistant observation", detail: classification.reason ?? null });
  } else if (classification.classification === "BLOCKED") {
    transition(run, "BLOCKED", { reason: classification.reason ?? "session_blocked", detail: evidenceDir });
  } else {
    transition(run, "INVALID", { reason: classification.reason ?? "session_invalid", detail: evidenceDir });
  }
  writeRun(run);
  process.stdout.write(`${JSON.stringify({ run: run.runId, condition: isP1 ? "P1" : "F1", state: run.state, classification, account: account.totals, sessionId: first?.sessionId ?? null, exit }, null, 2)}\n`);
  process.exit(classification.classification === "OBSERVED" ? 0 : classification.classification === "BLOCKED" ? 3 : 4);
}

process.stderr.write("usage: --prepare=<id> | --status=<id> | --gate | --probe=<id> | --run=<id> [--condition=p1|f1]\n");
process.exit(2);
