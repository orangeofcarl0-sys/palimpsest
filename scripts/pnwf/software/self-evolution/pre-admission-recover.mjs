/** Reclaim a dead host's dispatch only if its stopped execution admitted no model requests. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { backup, DatabaseSync } from "node:sqlite";
import { fileURLToPath, pathToFileURL } from "node:url";
import { digest, readJson, writeJson } from "../../energy/contract.mjs";
import { MaintenanceSlot, sealOf } from "./slot.mjs";

const ledgerPath = "first/request-ledger.sqlite";
const snapshotPath = "stopped-empty-ledger.sqlite";
const cohortPath = "first/cohort.json";
const resultPath = "first/out/MAINTAIN";
const read = (directory, path) => readJson(join(directory, path));
const hash = (directory, path) => digest(readFileSync(join(directory, path)));

function assertDead(pid) {
  assert(Number.isSafeInteger(pid) && pid > 0 && pid !== process.pid);
  assert.throws(() => process.kill(pid, 0), { code: "ESRCH" }, "DISPATCH_CONSUMER_STILL_ALIVE");
}

export function emptyAdmission(directory, file = ledgerPath) {
  const cohort = read(directory, cohortPath);
  const location = pathToFileURL(resolve(directory, file));
  if (file === snapshotPath) location.searchParams.set("immutable", "1");
  const db = new DatabaseSync(location, { readOnly: true });
  try {
    const config = db.prepare("SELECT json, state, reason FROM config").get();
    const metering = JSON.parse(config.json);
    assert(config.state === "OPEN" && config.reason === null && metering.cohortId === cohort.cohortId &&
      metering.sessions.length === 1 && metering.sessions[0].id === "MAINTAIN" &&
      metering.sessions[0].maxRequests === cohort.maxRequests, "STOPPED_LEDGER_SCOPE_MISMATCH");
    assert.equal(db.prepare("SELECT count(*) AS count FROM requests").get().count, 0, "CANNOT_REQUEUE_ADMITTED_REQUESTS");
    assert.equal(db.prepare("SELECT count(*) AS count FROM refusals").get().count, 0, "CANNOT_REQUEUE_OBSERVED_REQUESTS");
    return { cohortId: cohort.cohortId, admitted: 0 };
  } finally { db.close(); }
}

function pathKey(path) {
  const slashPath = path.replaceAll("\\", "/");
  return process.platform === "win32" ? slashPath.replace(/^\/run\/desktop\/mnt\/host\/([a-z])\//iu, "$1:/").toLowerCase() : slashPath;
}

function stoppedContainer(directory, id, active) {
  const docker = args => execFileSync("docker", args, { encoding: "utf8", timeout: 30000 }).trim();
  const view = field => docker(["inspect", id, "--format", field]);
  assert(/^[a-f0-9]{64}$/u.test(id) && view("{{.Id}}") === id);
  const state = JSON.parse(view("{{json .State}}"));
  assert(!state.Running && state.Status === "exited" && state.ExitCode !== 0, "BOUND_CONTAINER_HAS_NOT_STOPPED");
  assert.equal(view("{{.Image}}"), active.image, "PRE_ADMISSION_IMAGE_MISMATCH");
  const mounts = JSON.parse(view("{{json .Mounts}}"));
  const stage = mounts.find(mount => mount.Type === "bind" && mount.Destination === "/run/stage")?.Source;
  assert(stage && pathKey(stage) === pathKey(join(directory, "first/stages/MAINTAIN")), "PRE_ADMISSION_WORLD_MISMATCH");
  const volume = mounts.find(mount => mount.Type === "volume" && mount.Destination === "/run/stage/world")?.Name;
  assert(/^pnwf-self-evolution-[a-f0-9-]+$/u.test(volume));
  assert.equal(docker(["ps", "--quiet", "--filter", "volume=" + volume]), "", "PRE_ADMISSION_WORLD_STILL_HAS_WRITER");
  const git = args => docker(["run", "--rm", "--network", "none", "--user", "1001:1001", "-e", "GIT_OPTIONAL_LOCKS=0",
    "-v", `${volume}:/work:ro`, "-w", "/work", active.image, "git", ...args]);
  const head = git(["rev-parse", "HEAD"]);
  assert.equal(head, read(directory, "incoming.json").candidate);
  assert.equal(git(["status", "--porcelain", "--untracked-files=all"]), "", "PRE_ADMISSION_DRAFT_CHANGED");
  return { id, state, head, clean: true };
}

export function verifyPreAdmissionStop(directory, observation) {
  const { files, metering, container } = observation;
  const required = [ledgerPath, cohortPath, "incoming.json", snapshotPath];
  assert(required.every(path => Object.hasOwn(files, path)) &&
    Object.keys(files).every(path => required.includes(path) || path === ledgerPath + "-wal"),
  "PRE_ADMISSION_STOP_ARTIFACTS_MISMATCH");
  for (const [path, sha256] of Object.entries(files)) assert.equal(hash(directory, path), sha256);
  assert.deepEqual(emptyAdmission(directory, snapshotPath), metering);
  assert(!container.state.Running && container.state.Status === "exited" && container.state.ExitCode !== 0 && container.clean);
  assert.equal(container.head, read(directory, "incoming.json").candidate);
}

export function requeuePreAdmission(slot, observation, archive) {
  return slot.transaction(() => {
    const { id, sequence, consumerPid, dispatch, active, writer } = observation;
    const child = slot.queued().find(item => item.id === id);
    const current = slot.current();
    const split = slot.view().events.find(event => event.seq === dispatch);
    assert(child?.sequence === sequence && child.status === "RUNNING" && !child.outcome && child.result === null &&
      current.writer === writer && !current.blocked && current.transition === null && split?.type === "WAKE_DISPATCHED" &&
      split.detail.id === id, "PRE_ADMISSION_LEASE_MOVED");
    assert.deepEqual(current.active, active);
    assert.deepEqual(split.detail.installation, active);
    assert.equal(slot.db.prepare("SELECT pid FROM consumer").get()?.pid, consumerPid, "PRE_ADMISSION_CONSUMER_MOVED");
    assertDead(consumerPid);
    archive();
    slot.db.prepare("UPDATE inbox SET status='PENDING' WHERE id=?").run(id);
    slot.db.prepare("UPDATE slot SET writer=NULL WHERE id=1").run();
    slot.db.prepare("DELETE FROM consumer WHERE pid=?").run(consumerPid);
    slot.record("WAKE_PRE_ADMISSION_REQUEUED", { id, sequence, dispatch, proof: sealOf(observation),
      cohortId: observation.metering.cohortId });
  });
}

async function recover(campaign, containerId, checkOnly) {
  const slot = new MaintenanceSlot(join(campaign, "slot.sqlite"));
  try {
    const current = slot.current();
    const consumerPid = slot.db.prepare("SELECT pid FROM consumer").get()?.pid;
    assertDead(consumerPid);
    const jobs = slot.queued().filter(item => item.status === "RUNNING");
    assert(jobs.length === 1 && jobs[0].input.kind === "rejection" && current.writer &&
      !current.blocked && current.transition === null, "NO_RECLAIMABLE_REJECTION_DISPATCH");
    const job = jobs[0];
    const dispatch = slot.view().events.findLast(event => event.type === "WAKE_DISPATCHED" && event.detail.id === job.id);
    assert(dispatch && Number.isSafeInteger(job.sequence) && job.sequence > 0);
    const original = join(campaign, "r", String(job.sequence));
    const archived = join(campaign, "halt", String(job.sequence));
    const directory = existsSync(archived) ? archived : original;
    let observation;
    if (existsSync(archived)) {
      assert(!existsSync(original), "PRE_ADMISSION_ARCHIVE_CONFLICT");
      observation = read(directory, "pre-admission-stop.json");
      assert.equal(observation.container.id, containerId);
    } else {
      const home = join(directory, "first/runtime-MAINTAIN/sessions");
      const observed = join(directory, resultPath, "request-observations.jsonl");
      assert(!existsSync(join(directory, resultPath, "run.json")) && !existsSync(join(directory, "first/session.json")) &&
        (!existsSync(observed) || readFileSync(observed).length === 0) &&
        (!existsSync(home) || !readdirSync(home, { withFileTypes: true, recursive: true }).some(entry => entry.isFile())),
      "PRE_ADMISSION_MODEL_ACTIVITY_OBSERVED");
      assert.equal(read(directory, "incoming-wake.json").signalId, job.id);
      assert.equal(sealOf(read(directory, "prior-rejection.json")), job.input.proof);
      const metering = emptyAdmission(directory);
      const container = stoppedContainer(directory, containerId, current.active);
      const files = [ledgerPath, ledgerPath + "-wal", cohortPath, "incoming.json"].filter(path => existsSync(join(directory, path)));
      observation = { id: job.id, sequence: job.sequence, consumerPid, dispatch: dispatch.seq, active: current.active,
        writer: current.writer, metering, container, files: Object.fromEntries(files.map(path => [path, hash(directory, path)])) };
      if (checkOnly) return observation;
      const ledger = new DatabaseSync(join(directory, ledgerPath), { readOnly: true });
      try { await backup(ledger, join(directory, snapshotPath)); } finally { ledger.close(); }
      observation.files[snapshotPath] = hash(directory, snapshotPath);
      writeJson(join(directory, "pre-admission-stop.json"), observation);
    }
    verifyPreAdmissionStop(directory, observation);
    if (checkOnly) return observation;
    mkdirSync(dirname(archived), { recursive: true });
    requeuePreAdmission(slot, observation, () => { if (directory !== archived) renameSync(original, archived); });
    return observation;
  } finally { slot.close(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [campaign, containerId, option] = process.argv.slice(2);
  assert(campaign && containerId && [undefined, "--check"].includes(option),
    "Usage: pre-admission-recover.mjs <campaign> <container-id> [--check]");
  const result = await recover(resolve(campaign), containerId, option === "--check");
  console.log(JSON.stringify(result, null, 2));
}
