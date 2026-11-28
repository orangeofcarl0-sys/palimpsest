/** Evidence verification for owner-authorized, externally merged maintenance ports. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, renameSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { digest, readJson } from "../../energy/contract.mjs";
import { conclusion } from "../../energy/product.mjs";
import { gitHubSessionFacts, settlement } from "./github-maintenance-worker.mjs";
import { sealOf } from "./slot.mjs";
import { copyDatabases, manifest } from "./workspace.mjs";

const pathInRepo = path => typeof path === "string" && /^[\w./-]+$/u.test(path) &&
  path.split("/").every(part => part && part !== "." && part !== "..");
const metadataPath = path => path === "handoff.md" ||
  /^(?:docs\/engineering\/[\w./-]+\.md|research-evidence\/[\w./-]+\.(?:json|md))$/u.test(path);
const hash = path => digest(readFileSync(path));

function trusted(root, path, directory = false) {
  assert(pathInRepo(path), "GITHUB_PORT_ARCHIVE_PATH_INVALID");
  const from = realpathSync(root);
  const target = resolve(from, path);
  const resolved = realpathSync(target);
  const inside = relative(from, resolved);
  const entry = lstatSync(target);
  assert(inside && !inside.startsWith("..") && !isAbsolute(inside) && resolved === target &&
    (directory ? entry.isDirectory() : entry.isFile()), "GITHUB_PORT_ARCHIVE_PATH_INVALID");
  return resolved;
}

function readArchivedSession(root, path, ledgerHash, archive) {
  const directory = trusted(root, path, true);
  const from = file => trusted(directory, file);
  const ledger = from("request-ledger.sqlite"), wal = ledger + "-wal";
  assert(!existsSync(wal) || lstatSync(wal).size === 0, "GITHUB_PORT_LEDGER_NOT_SEALED");
  assert.equal(hash(ledger), ledgerHash, "GITHUB_PORT_LEDGER_CHANGED");
  const row = readJson(from("submission-facts.json"));
  const session = readJson(from("session.json"));
  const settled = settlement(directory);
  assert(settled?.archive === archive && settled.reconciled && settled.natural && settled.usageState === "SETTLED" &&
    settled.attributionState === "COMPLETE" && settled.unresolved === 0 &&
    Number.isSafeInteger(settled.requests) && settled.requests > 0, "GITHUB_PORT_ARCHIVE_UNSETTLED");
  const db = new DatabaseSync(ledger, { readOnly: true });
  try {
    const observed = db.prepare("SELECT count(*) AS requests, sum(actual) AS tokens FROM requests WHERE state='SETTLED' AND actual>=0").get();
    const total = db.prepare("SELECT count(*) AS requests FROM requests").get().requests;
    assert(observed.requests === total && total === settled.requests && observed.tokens === session.accounting?.confirmed &&
      session.accounting?.requests === total && session.accounting?.unresolved === 0, "GITHUB_PORT_LEDGER_UNCONFIRMED");
  } finally { db.close(); }
  assert.equal(hash(ledger), ledgerHash, "GITHUB_PORT_LEDGER_CHANGED");
  return { directory, row, session, settled, from };
}

function verifyPortGit(runtime, parent, request, paths) {
  const { approved, merged, basis, port, tree, candidate, pr, metadata } = request;
  const git = (...args) => runtime.git(...args);
  const changed = (from, to) => git("diff", "--no-renames", "--name-only", "-z", from, to, "--").split("\0").filter(Boolean).sort();
  const entry = (commit, path) => git("ls-tree", commit, "--", path);
  assert.equal(git("rev-parse", "refs/palimpsest/main"), merged, "GITHUB_PORT_MAIN_MOVED");
  git("fetch", "--quiet", "--no-tags", runtime.remote, "+refs/pull/" + pr + "/head:refs/palimpsest/port-pr/" + pr);
  assert.equal(git("rev-parse", "refs/palimpsest/port-pr/" + pr), approved, "GITHUB_PORT_APPROVAL_MISMATCH");
  assert(git("rev-parse", approved + "^{tree}") === tree && git("rev-parse", merged + "^{tree}") === tree,
    "GITHUB_PORT_TREE_MISMATCH");
  git("merge-base", "--is-ancestor", basis, merged);
  git("merge-base", "--is-ancestor", port, approved);
  assert.equal(git("show", "-s", "--format=%P", port), basis, "GITHUB_PORT_BASIS_MISMATCH");
  const archivedBasis = parent.releaseAtDispatch.candidate;
  git("merge-base", "--is-ancestor", archivedBasis, basis);
  git("merge-base", "--is-ancestor", archivedBasis, candidate);
  assert(paths.length && paths.every(pathInRepo) && paths.every(path => parent.spec.paths.includes(path)) &&
    parent.spec.artifacts.every(path => paths.includes(path)), "GITHUB_PORT_SCOPE_MISMATCH");
  assert.deepEqual(changed(archivedBasis, candidate), [...paths].sort(), "GITHUB_PORT_SCOPE_MISMATCH");
  assert.deepEqual(changed(basis, port), [...paths].sort(), "GITHUB_PORT_SCOPE_MISMATCH");
  assert(Array.isArray(metadata) && metadata.every(path => pathInRepo(path) && metadataPath(path) && !paths.includes(path)),
    "GITHUB_PORT_METADATA_SCOPE_MISMATCH");
  assert.deepEqual(changed(port, approved), [...metadata].sort(), "GITHUB_PORT_METADATA_SCOPE_MISMATCH");
  for (const path of [...paths, ...metadata]) {
    assert.match(entry(approved, path), /^100(?:644|755) blob [0-9a-f]{40}\t/u, "GITHUB_PORT_NONREGULAR_FILE");
  }
  for (const path of paths) {
    assert.equal(entry(approved, path), entry(candidate, path), "GITHUB_PORT_AUTHORIZED_BLOB_MISMATCH " + path);
  }
  runtime.checkCommitAttribution(archivedBasis, candidate);
  runtime.checkCommitAttribution(basis, approved);
}

export function prepareArchivedPort(runtime, parent, request, destination) {
  const { originalArchive, archive, checkpoint, delivery, candidate, ledger, state } = request;
  const original = readArchivedSession(runtime.archive, request.originalDirectory, ledger.original, originalArchive);
  const resumed = readArchivedSession(runtime.archive, request.deliveryDirectory, ledger.resumed, archive);
  assert.deepEqual(original.settled, parent.settlement, "GITHUB_PORT_ORIGINAL_SETTLEMENT_CHANGED");
  const archivedBasis = parent.releaseAtDispatch.candidate;
  assert(original.row.work === parent.id && original.row.submission?.valid &&
    sealOf(original.row.release) === sealOf(parent.releaseAtDispatch) &&
    original.row.submission?.candidate === candidate && original.row.submission.basis === archivedBasis &&
    original.session.conclusion?.intent === "CHECKPOINT" && original.session.conclusion.eventId === checkpoint,
  "GITHUB_PORT_CHECKPOINT_MISMATCH");
  const usedBefore = parent.requestBudget.usedBefore + original.settled.requests;
  const limit = parent.requestBudget.limit;
  const used = usedBefore + resumed.settled.requests;
  assert(Number.isSafeInteger(used) && used <= limit && ledger.used === used &&
    ledger.remaining === limit - used, "GITHUB_PORT_BALANCE_MISMATCH");
  assert(resumed.row.submission?.valid && resumed.row.submission.candidate === candidate &&
    sealOf(resumed.row.release) === sealOf(parent.releaseAtDispatch) && resumed.session.basis === candidate &&
    resumed.row.submission.basis === archivedBasis && resumed.row.facts?.delivery === delivery &&
    gitHubSessionFacts(resumed.session, resumed.row.submission, checkpoint, parent.spec.artifacts).delivery === delivery,
  "GITHUB_PORT_DELIVERY_MISMATCH");
  const originalState = trusted(original.directory, "checkpoint", true);
  const deliveredState = trusted(resumed.directory, "checkpoint", true);
  manifest(originalState);
  assert.equal(sealOf(manifest(deliveredState)), state, "GITHUB_PORT_DELIVERED_STATE_CHANGED");
  assert.equal(conclusion(originalState)?.eventId, checkpoint, "GITHUB_PORT_CHECKPOINT_MISMATCH");
  assert.equal(conclusion(deliveredState)?.eventId, delivery, "GITHUB_PORT_DELIVERY_MISMATCH");
  const delivered = conclusion(deliveredState);
  assert.equal(delivered.intent, "DELIVER", "GITHUB_PORT_DELIVERY_MISMATCH");
  assert.equal(delivered.body, resumed.session.conclusion.body, "GITHUB_PORT_DELIVERED_STATE_CHANGED");

  const bundle = resumed.from("candidate.bundle");
  assert.equal(hash(bundle), resumed.row.submission.bundleSha256, "GITHUB_PORT_BUNDLE_CHANGED");
  assert.equal(runtime.git("bundle", "list-heads", bundle), candidate + " HEAD", "GITHUB_PORT_BUNDLE_CHANGED");
  // Bring in the current main objects before reading the thin archive bundle.
  assert.equal(runtime.refresh(), request.merged, "GITHUB_PORT_MAIN_MOVED");
  runtime.git("fetch", "--quiet", "--no-tags", bundle, "HEAD:refs/palimpsest/archived-port/" + candidate);
  verifyPortGit(runtime, parent, request, resumed.row.submission.changed);
  const record = delivered.body.split("\n").find(line => line.startsWith('{"schema":"pc1-episode-conclusion/v1"'));
  const artifacts = JSON.parse(record).check.artifacts;
  for (const path of parent.spec.artifacts) {
    const bytes = execFileSync("git", ["--no-replace-objects", "-C", runtime.mirror, "cat-file", "blob", candidate + ":" + path],
      { windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
    assert(artifacts.some(item => item.path === path && item.committed === true && item.commit === candidate &&
      item.digest === digest(bytes)), "GITHUB_PORT_DELIVERY_BLOB_MISMATCH " + path);
  }

  if (!existsSync(destination)) {
    mkdirSync(dirname(destination), { recursive: true });
    const staged = destination + ".preparing-" + randomUUID();
    copyDatabases(deliveredState, staged);
    assert.equal(sealOf(manifest(staged)), state, "GITHUB_PORT_DELIVERED_STATE_CHANGED");
    renameSync(staged, destination);
  }
  assert.equal(sealOf(manifest(destination)), state, "GITHUB_PORT_DELIVERED_STATE_CHANGED");
  return { paths: [...resumed.row.submission.changed].sort(), balance: { usedBefore, used, remaining: limit - used, limit } };
}
