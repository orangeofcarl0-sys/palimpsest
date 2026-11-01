/**
 * C6-R — research runner CLI.
 *
 *   node scripts/c6r/run_c6r.mjs --prepare=<runId>   create an immutable run record from the
 *                                                    qualified P1/F1 initial states
 *   node scripts/c6r/run_c6r.mjs --status=<runId>    print the run record
 *   node scripts/c6r/run_c6r.mjs --gate              read the latest provider probe
 *   node scripts/c6r/run_c6r.mjs --probe=<runId>     run the ONE bounded provider probe and record it
 *   node scripts/c6r/run_c6r.mjs --run=<runId>       refuse a scored launch unless the gate is AVAILABLE
 *
 * The scored launcher is deliberately gated: a probe that returns QUOTA leaves R4–R7 BLOCKED, and
 * no P/F session is fabricated. A new executable version requires a new Code Freeze before it can
 * carry a scored run.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRun, loadRun, setAuthorization, setCondition, setEvaluation, transition, writeRun } from "./runner.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..");
const RUNS = join(REPO, "research-evidence", "c6r", "runs");
const PROBES = join(REPO, "research-evidence", "c6r", "probe");
const QUAL_P1 = join(REPO, "research-evidence", "c6r", "p1-host", "initial-state.json");

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

if (flag("gate")) {
  const probe = latestProbe();
  if (probe === null) {
    process.stdout.write(`${JSON.stringify({ gate: "UNKNOWN", reason: "no probe result is recorded" }, null, 2)}\n`);
    process.exit(2);
  }
  process.stdout.write(`${JSON.stringify({ gate: probe.result.state, dir: probe.dir, exit: probe.result.exit, quotaError: probe.result.quotaError, assistantMessages: probe.result.assistantMessages, codeFreeze: probe.result.codeFreeze }, null, 2)}\n`);
  process.exit(0);
}

const prepareId = arg("prepare");
if (prepareId !== null) {
  const p1 = JSON.parse(readFileSync(QUAL_P1, "utf8"));
  const commit = git(["rev-parse", "HEAD"]);
  const tree = git(["rev-parse", "HEAD^{tree}"]);
  const run = createRun({
    root: RUNS,
    runId: prepareId,
    codeFreeze: commit,
    codeTree: tree,
    t1: p1.observationTime,
    t2: "2026-02-14T09:10:00Z",
    visibleSetDigest: p1.inboxVisible?.visibleSetDigest ?? null,
    scenarioSource: "scripts/cog6/scenario",
  });
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
  process.stdout.write(`${JSON.stringify({ run: run.runId, state: run.state, codeFreeze: run.codeFreeze, initial: run.initial }, null, 2)}\n`);
  process.exit(0);
}

const statusId = arg("status");
if (statusId !== null) {
  const run = loadRun(join(RUNS, statusId));
  process.stdout.write(`${JSON.stringify(run, null, 2)}\n`);
  process.exit(0);
}

const probeId = arg("probe");
if (probeId !== null) {
  const run = loadRun(join(RUNS, probeId));
  execFileSync("wsl.exe", ["-d", "Ubuntu", "--", "bash", "/mnt/f/Codex_Work_Space/Palimpsest/palimpsest-sr1/scripts/c6r/probe_provider_wsl.sh"], {
    stdio: "inherit",
    env: {
      ...process.env,
      MSYS_NO_PATHCONV: "1",
      C6R_CODE_FREEZE_COMMIT: run.codeFreeze.commit,
      C6R_CODE_FREEZE_TREE: run.codeFreeze.tree,
    },
  });
  const probe = latestProbe();
  if (probe === null) throw new Error("the probe produced no result");
  run.probe = { dir: probe.dir, result: probe.result };
  if (probe.result.state !== "AVAILABLE") {
    transition(run, "BLOCKED", { reason: probe.result.quotaError ? "provider_quota" : "provider_unavailable", detail: probe.dir });
  }
  writeRun(run);
  process.stdout.write(`${JSON.stringify({ run: run.runId, state: run.state, gate: probe.result.state }, null, 2)}\n`);
  process.exit(probe.result.state === "AVAILABLE" ? 0 : 3);
}

const runId = arg("run");
if (runId !== null) {
  const run = loadRun(join(RUNS, runId));
  const probe = latestProbe();
  if (probe === null || probe.result.state !== "AVAILABLE") {
    if (run.state !== "BLOCKED") transition(run, "BLOCKED", { reason: "provider_gate_not_available", detail: probe?.dir ?? null });
    process.stdout.write(`${JSON.stringify({ run: run.runId, state: run.state, refused: true, reason: "provider_gate_not_available" }, null, 2)}\n`);
    process.exit(3);
  }
  /* A scored launch requires the frozen scored-condition launcher; it is added only under a NEW Code
     Freeze once the provider is known to be available. */
  process.stdout.write(`${JSON.stringify({ run: run.runId, state: run.state, refused: true, reason: "scored_launcher_requires_new_code_freeze" }, null, 2)}\n`);
  process.exit(4);
}

process.stderr.write("usage: --prepare=<id> | --status=<id> | --gate | --probe=<id> | --run=<id>\n");
process.exit(2);
