/** The host prepares the detached Git copy, qualifies the actual peer, and imports only an observed commit. */
import { spawn } from "node:child_process";
import { closeSync, cpSync, mkdirSync, openSync, readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { prepareContainerProfile, DSH_BIN } from "../container_adapter.mjs";
import { createPrincipal, docker, qualifyPrincipal } from "../container_runtime.mjs";
import { startContainerBridge } from "../container_bridge.mjs";
import { assert, changed, clean, configureGit, descendant, git, head, sha, writeJson } from "./contract.mjs";
import { CERTIFICATES, PRESERVE_CERTIFICATES, requireRevisionScope, REVISION_PATHS } from "./revision-scope.mjs";

const PREFLIGHT = fileURLToPath(new URL("../world_preflight.mjs", import.meta.url));
const ATTEMPT_PATH = /^\/run\/stage\/world\/\.palimpsest\/worlds\/([a-zA-Z0-9_-]+)$/u;
const READ_ATTEMPT = `const {DatabaseSync}=require('node:sqlite');
const db=new DatabaseSync('/run/stage/state/palimpsest.sqlite',{readOnly:true});
const row=db.prepare('SELECT state FROM attempts WHERE project_id=? AND attempt_id=?').get('energy-project-continuity',process.argv[1]);
db.close();process.stdout.write(row?.state??'');`;

export function stageRuntime({ repo, destination }) {
  mkdirSync(destination);
  for (const part of ["dist/src", "host/dsh"]) {
    mkdirSync(join(destination, part, ".."), { recursive: true });
    cpSync(join(repo, part), join(destination, part), { recursive: true, dereference: true });
  }
  writeJson(join(destination, "package.json"), { type: "module", private: true });
  const modules = join(destination, "node_modules/@ordarium");
  mkdirSync(modules, { recursive: true });
  for (const name of ["core", "host-kit", "ledger-sqlite", "testing"]) {
    cpSync(realpathSync(join(repo, "node_modules/@ordarium", name)), join(modules, name), { recursive: true, dereference: true });
  }
  mkdirSync(join(destination, "runtime"));
  for (const part of ["product-entry.mjs", "revision-scope.mjs", "revision-work.mjs", "worker"]) {
    cpSync(fileURLToPath(new URL(part, import.meta.url)), join(destination, "runtime", part), { recursive: true });
  }
  const ownerScripts = join(destination, "scripts/pnwf/energy");
  mkdirSync(ownerScripts, { recursive: true });
  for (const part of ["contract.mjs", "revision-scope.mjs", "product.mjs", "owner-command.mjs"]) {
    cpSync(fileURLToPath(new URL(part, import.meta.url)), join(ownerScripts, part));
  }
}

export function validateWorkerResult(repo, basis, result) {
  assert(sha(result) && result !== basis && descendant(repo, basis, result), "WORKER_RESULT_BASIS_MISMATCH");
  assert(clean(repo), "WORKER_WORLD_DIRTY");
  const paths = changed(repo, basis, result);
  assert(paths.length > 0 && paths.every(path => REVISION_PATHS.includes(path)), "WORKER_RESULT_OUTSIDE_SCOPE");
  const entries = git(repo, "ls-tree", "-r", "-z", result, "--", ...paths).split("\0").filter(Boolean);
  assert(entries.length === paths.length && entries.every(entry => /^100644 blob /u.test(entry)), "WORKER_RESULT_NOT_REGULAR");
  return paths;
}

function start(runtime, stdout, stderr) {
  const child = spawn("docker", ["exec", "--user", "1001:1001", "--workdir", "/run/stage/world", runtime.id,
    "node", DSH_BIN, "--profile", "alhs-core", "--work", "/run/stage/context.json"], { stdio: ["ignore", stdout, stderr] });
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => resolve({ code, signal }));
  });
}

export function makeWorkerBroker({ stage, out, repository, image, principalId, gateway, sessionKey, basis, stopIsClosed }) {
  let current = null;
  let closed = false;
  const attempted = new Set();
  const records = [];
  const record = () => writeJson(join(out, "worker-receipts.json"), records);
  async function execute(request, job) {
    const match = ATTEMPT_PATH.exec(request?.workDir);
    assert(match && request?.context?.work?.baseCommit === basis, "WORKER_REQUEST_BASIS_MISMATCH");
    const attemptId = match[1];
    Object.assign(job.receipt, { attemptId, basis });
    const work = request.context.work;
    requireRevisionScope(work.writeScope);
    Object.assign(job.receipt, { writeScope: [...work.writeScope], preservedPath: CERTIFICATES });
    assert(!attempted.has(attemptId), "WORKER_ATTEMPT_ALREADY_DISPATCHED");
    attempted.add(attemptId);
    const principalWorld = join(stage, "world");
    const attempt = join(principalWorld, ".palimpsest", "worlds", attemptId);
    const active = () => docker(["exec", "--user", "1001:1001", principalId, "node", "-e", READ_ATTEMPT, attemptId], { stdio: ["ignore", "pipe", "pipe"] }) === "RUNNING";
    const attemptGit = (...args) => docker(["exec", "--user", "1001:1001", principalId, "git", "-c", "safe.directory=*", "-C", request.workDir, ...args]);
    const attemptAtBasis = () => attemptGit("rev-parse", "HEAD") === basis && attemptGit("status", "--porcelain", "--untracked-files=all") === "";
    assert(active() && realpathSync(attempt) === attempt && head(principalWorld) === basis && attemptAtBasis(), "WORKER_ATTEMPT_NOT_BOUND_AT_BASIS");
    const directory = join(out, `worker-${attemptId}`);
    mkdirSync(directory);
    const peerStage = join(directory, "stage");
    const peer = join(peerStage, "world");
    const home = join(directory, "home");
    mkdirSync(peerStage);
    // Use the canonical basis only. The attempt store and its Git alternates never enter the peer.
    git(principalWorld, "clone", "--no-local", "--no-hardlinks", "--no-checkout", "--", principalWorld, peer);
    git(peer, "remote", "remove", "origin");
    configureGit(peer);
    git(peer, "checkout", "--quiet", "--detach", basis);
    assert(head(peer) === basis && clean(peer), "WORKER_PEER_BASIS_MISMATCH");
    const workerContract = await import(pathToFileURL(join(repository, "dist/src/deployment/work_worker.js")).href);
    const { context, resultTool, deniedAuthorityPrefix } = workerContract.workWorkerEnvironmentPayload({
      ...request.context,
      work: { ...work, requirements: [...work.requirements, PRESERVE_CERTIFICATES] },
    });
    // This new-source scenario needs the checked-out materials. No external context channel is mounted.
    writeJson(join(peerStage, "context.json"), { context, resultTool, deniedAuthorityPrefix });
    prepareContainerProfile({ home, repository, layout: "worker" });
    const runtime = createPrincipal({ repository, stage: peerStage, home, image, preflight: PREFLIGHT, layout: "worker" });
    job.runtime = runtime;
    let bridge;
    try {
      const qualification = qualifyPrincipal(runtime, basis);
      writeJson(join(directory, "qualification.json"), qualification);
      Object.assign(job.receipt, { containerId: runtime.id, qualification: qualification.descriptorDigest });
      assert(!closed && !stopIsClosed(), "WORKER_SESSION_STOPPED");
      bridge = await startContainerBridge(runtime.id, gateway, sessionKey, { actor: "worker" });
      assert(!closed && !stopIsClosed(), "WORKER_SESSION_STOPPED");
      const stdout = join(directory, "run.log");
      const stderr = join(directory, "run.err");
      const log = openSync(stdout, "wx");
      const errors = openSync(stderr, "wx");
      let exit;
      try { exit = await start(runtime, log, errors); }
      finally { closeSync(log); closeSync(errors); }
      job.receipt.exit = exit;
      assert(exit.code === 0 && exit.signal === null && !closed && !stopIsClosed(), "WORKER_DID_NOT_EXIT_NATURALLY");
      const lines = readFileSync(stdout, "utf8").split(/\r?\n/u).filter(line => line.startsWith("PNWF_CONTAINER_WORKER_RESULT "));
      assert(lines.length === 1, "WORKER_OUTCOME_UNOBSERVABLE");
      const reported = JSON.parse(lines[0].slice("PNWF_CONTAINER_WORKER_RESULT ".length));
      const parsed = workerContract.parseWorkWorkerResult(reported.outcome);
      assert(parsed.ok && typeof reported.sessionId === "string" && reported.sessionId.startsWith("worker-"), "WORKER_RESULT_REJECTED");
      job.receipt.sessionId = reported.sessionId;
      if (parsed.outcome.kind !== "READY_FOR_SETTLEMENT") return { kind: parsed.outcome.kind, detail: parsed.outcome.summary };
      const result = head(peer);
      const paths = validateWorkerResult(peer, basis, result);
      assert(active() && attemptAtBasis() && head(principalWorld) === basis, "WORKER_RETURN_BASIS_DRIFT");
      // Transport the commit without changing the canonical live Git HEAD. Product observes and settles this Attempt.
      const bundle = join(directory, "result.bundle");
      git(peer, "update-ref", "refs/heads/pnwf-worker-result", result);
      git(peer, "bundle", "create", bundle, "refs/heads/pnwf-worker-result", `^${basis}`);
      const inContainer = `/tmp/${attemptId}.bundle`;
      docker(["exec", "-i", "--user", "1001:1001", principalId, "node", "-e",
        "const fs=require('node:fs');fs.writeFileSync(process.argv[1],fs.readFileSync(0),{flag:'wx'});", inContainer],
      { input: readFileSync(bundle), stdio: ["pipe", "pipe", "pipe"] });
      attemptGit("fetch", "--no-tags", "--", inContainer, "refs/heads/pnwf-worker-result");
      attemptGit("checkout", "--quiet", "--detach", result);
      assert(attemptGit("rev-parse", "HEAD") === result && attemptGit("status", "--porcelain") === "", "WORKER_RESULT_IMPORT_FAILED");
      Object.assign(job.receipt, { result, paths, outcome: "READY_FOR_SETTLEMENT" });
      return { kind: "READY_FOR_SETTLEMENT", detail: parsed.outcome.summary };
    } finally {
      try { await bridge?.close(); } finally { runtime.cleanup(); job.runtime = null; }
    }
  }
  return {
    async dispatch(request) {
      assert(!closed && current === null, "WORKER_CAPACITY_UNAVAILABLE");
      const receipt = { startedAt: new Date().toISOString(), outcome: "DISPATCHED" };
      records.push(receipt);
      const job = { runtime: null, receipt };
      current = job;
      job.done = execute(request, job);
      try {
        const outcome = await job.done;
        receipt.outcome = outcome.kind;
        return outcome;
      } catch (error) {
        Object.assign(receipt, { outcome: "HOST_FAILURE", reason: error.message });
        return { kind: "HOST_FAILURE", detail: error.message };
      } finally {
        receipt.endedAt = new Date().toISOString();
        record();
        current = null;
      }
    },
    async close() {
      closed = true;
      const job = current;
      if (job?.runtime) {
        try { docker(["kill", job.runtime.id], { timeout: 10000 }); } catch { /* its own cleanup removes it */ }
      }
      await job?.done?.catch(() => undefined);
      record();
    },
  };
}
