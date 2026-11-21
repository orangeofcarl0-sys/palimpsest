/** Observe a stopped container and its still-authoritative ledger without contacting the provider. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { DatabaseSync, backup } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { digest, readJson, writeJson } from "../../energy/contract.mjs";
import { conclusion } from "../../energy/product.mjs";
import { usageBreakdown, usageTotal } from "../../execution_budget.mjs";
import { trajectory } from "./session.mjs";
import { MaintenanceSlot, sealOf } from "./slot.mjs";

const out = "first/out/MAINTAIN";
const ledger = "first/request-ledger.sqlite";
const ledgerCopy = "stopped-ledger.sqlite";
const read = (root, name) => readJson(join(root, name));
const fileDigest = (root, name) => digest(readFileSync(join(root, name)));

function stoppedUsage(root, path) {
  const db = new DatabaseSync(join(root, path), { readOnly: true });
  try {
    const { json, state, reason } = db.prepare("SELECT * FROM config").get();
    const { cohortId, sessions } = JSON.parse(json);
    const originalSessions = db.prepare("SELECT * FROM sessions ORDER BY ordinal").all().map(row => ({ ...row }));
    const requests = db.prepare("SELECT * FROM requests ORDER BY rowid").all().map(row => ({ ...row }));
    const events = readFileSync(join(root, out, "request-observations.jsonl"), "utf8").trim().split("\n").map(JSON.parse);
    const ended = events.filter(event => event.kind === "TERMINAL");
    const expected = read(root, "first/cohort.json");
    assert(state === "STOPPED" && cohortId === expected.cohortId && sessions.length === 1 && sessions[0].id === "MAINTAIN" &&
      sessions[0].maxRequests === expected.maxRequests, "INTERRUPTION_NOT_BOUND_TO_STOPPED_COHORT");
    assert.deepEqual(events.filter(event => event.kind === "ADMITTED").map(event => event.requestId), requests.map(row => row.id));
    const unknown = requests.filter(row => row.state === "UNKNOWN");
    const settled = requests.filter(row => row.state === "SETTLED");
    assert(unknown.length > 0 && unknown.length + settled.length === requests.length && settled.length === ended.length,
      "INTERRUPTION_NOT_A_TERMINAL_UNKNOWN_LEDGER");
    assert(unknown.every(row => row.actual === null && row.usage === null && ended.every(event => event.requestId !== row.id)));
    for (const row of settled) {
      const terms = ended.filter(event => event.requestId === row.id);
      assert.equal(terms.length, 1);
      const parts = usageBreakdown(terms[0].usage);
      assert.deepEqual(parts, JSON.parse(row.usage));
      assert.equal(usageTotal(parts), row.actual);
    }
    return { cohortId, state, reason, originalSessions, admitted: requests.length, settled: settled.length, unresolved: unknown.length,
      confirmed: settled.reduce((total, row) => total + row.actual, 0), total: null, requests };
  } finally { db.close(); }
}

function stoppedTrace(root) {
  const home = join(root, "first/runtime-MAINTAIN/sessions");
  const streams = readdirSync(home, { recursive: true }).filter(file => file.endsWith(".zstd"));
  assert.equal(streams.length, 1);
  const readyLine = readFileSync(join(root, out, "run.log"), "utf8").split(/\r?\n/u).find(line => line.startsWith("PALIMPSEST_HOST_READY "));
  const { sessionId } = JSON.parse(readyLine.slice("PALIMPSEST_HOST_READY ".length));
  assert(streams[0].split(/[\\/]/u).includes(sessionId));
  const sha256 = digest(readFileSync(join(home, streams[0])));
  return trajectory({ run: join(root, "first") }, { traces: [{ role: "principal", digest: sha256 }] });
}

export function verifyInterrupted(root, observation) {
  assert(!existsSync(join(root, out, "run.json")) && !existsSync(join(root, "first/session.json")));
  for (const [file, sha256] of Object.entries(observation.files)) assert.equal(fileDigest(root, file), sha256);
  assert.deepEqual(stoppedUsage(root, ledgerCopy), observation.usage);
  assert.deepEqual(stoppedTrace(root), observation.trajectory);
  const { container, git } = observation;
  assert(!container.state.Running && container.state.ExitCode !== 0 && container.id === read(root, out + "/qualification.json").containerId);
  assert.equal(Date.parse(container.state.FinishedAt) - Date.parse(container.state.StartedAt), container.elapsedMs);
  assert.equal(git.head, read(root, "incoming.json").candidate);
  assert.equal(observation.host.exitCode, 1);
  return observation;
}

function closeObservedSlot(root, origin, previousRelease, observation) {
  const slot = new MaintenanceSlot(join(origin.slotDirectory, "slot.sqlite"));
  try {
    const before = join(root, "slot-before-interruption.json");
    if (!existsSync(before)) writeJson(before, slot.view());
    const { admitted, unresolved } = observation.usage;
    const request = { requests: admitted, unresolved, digest: sealOf(observation) };
    const wake = read(root, "incoming-wake.json");
    slot.stopInterrupted(wake, previousRelease, request);
    assert(!slot.stopInterrupted(wake, previousRelease, request), "INTERRUPTION_REPLAY_CHANGED");
    writeJson(join(root, "slot.json"), slot.view());
  } finally { slot.close(); }
}

async function capture(root) {
  const origin = read(root, "resume-origin.json");
  const prior = read(root, "prior-rejection.json");
  const rejection = read(root, "incoming.json");
  assert(origin.kind === "rejection" && origin.prior === sealOf(prior));
  assert.deepEqual(rejection, prior.rejection);
  assert(!existsSync(join(root, out, "run.json")) && !existsSync(join(root, "first/session.json")));
  const previousRelease = read(root, "initial-build/build.json");
  const recorded = join(root, "interruption.json");
  if (existsSync(recorded)) {
    closeObservedSlot(root, origin, previousRelease, verifyInterrupted(root, readJson(recorded)));
    return;
  }
  const host = read(root, "host-exit.json");
  assert(host.exitCode === 1 && host.error === "write EPIPE", "REQUIRE_OBSERVED_BRIDGE_EXIT");
  const id = read(root, out + "/qualification.json").containerId;
  assert(/^[a-f0-9]{64}$/u.test(id));
  const docker = args => execFileSync("docker", args, { encoding: "utf8", timeout: 30000 }).trim();
  const state = JSON.parse(docker(["inspect", id, "--format", "{{json .State}}"]));
  assert(!state.Running && state.Status === "exited" && state.ExitCode !== 0, "CONTAINER_STILL_ACTIVE");
  assert.equal(docker(["inspect", id, "--format", "{{.Image}}"]), previousRelease.image);
  const mounts = JSON.parse(docker(["inspect", id, "--format", "{{json .Mounts}}"]));
  const volume = mounts.find(mount => mount.Type === "volume" && mount.Destination === "/run/stage/world")?.Name;
  assert(/^pnwf-self-evolution-[a-f0-9-]+$/u.test(volume));
  const git = args => docker(["run", "--rm", "--network", "none", "--user", "1001:1001", "-e", "GIT_OPTIONAL_LOCKS=0",
    "-v", `${volume}:/work:ro`, "-w", "/work", previousRelease.image, "git", ...args]);
  const head = git(["rev-parse", "HEAD"]);
  assert.equal(head, rejection.candidate);
  const status = git(["status", "--porcelain", "--untracked-files=all"]);
  const originalConclusion = conclusion(join(root, "first/stages/MAINTAIN/state"));
  assert.deepEqual(originalConclusion, read(origin.previousRun, "first/session.json").conclusion);
  const observed = stoppedUsage(root, ledger);
  const db = new DatabaseSync(join(root, ledger), { readOnly: true });
  try { await backup(db, join(root, ledgerCopy)); }
  finally { db.close(); }
  const snapshot = new DatabaseSync(join(root, ledgerCopy));
  try { snapshot.exec("PRAGMA journal_mode=DELETE"); } finally { snapshot.close(); }
  const files = Object.fromEntries([ledger, ledger + "-wal", ledgerCopy, "host-exit.json",
    ...["request-observations.jsonl", "run.log", "qualification.json"].map(name => out + "/" + name)]
    .filter(file => existsSync(join(root, file))).map(file => [file, fileDigest(root, file)]));
  const observation = {
    schema: "palimpsest-maintenance-interruption/v1", host, originalTerminalRecordPresent: false,
    container: { id, state, elapsedMs: Date.parse(state.FinishedAt) - Date.parse(state.StartedAt) },
    usage: observed, trajectory: stoppedTrace(root), git: { head, status },
    priorConclusion: { intent: originalConclusion.intent, eventId: originalConclusion.eventId }, files,
  };
  verifyInterrupted(root, observation);
  writeJson(recorded, observation);
  closeObservedSlot(root, origin, previousRelease, observation);
  console.log(JSON.stringify({ stopped: observed.reason, admitted: observed.admitted, unknown: observed.unresolved, head }));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert(process.argv[2], "Usage: self-evolution/interruption.mjs <stopped-live-directory>");
  await capture(resolve(process.argv[2]));
}
