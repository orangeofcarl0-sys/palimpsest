/** Seal and reopen a stopped maintenance world without reopening its request ledger. */
import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { gunzipSync } from "node:zlib";
import { digest, readJson, writeJson } from "../../energy/contract.mjs";
import { readStream } from "../../analyze_energy_trajectory.mjs";
import { conclusion } from "../../energy/product.mjs";
import { sealOf } from "./slot.mjs";
import { makeEvidence, manifest, offline, projectId, quote, source, success, verifiedArchiveDigest } from "./workspace.mjs";

const history = "2b8722b488e089da1c6ca8f4bad76de740f44cfc";
const archive = "research-evidence/pnwf-software/2026-11-22/maintenance-queue/live";
const statePath = "first/stages/MAINTAIN/state";
const out = "first/out/MAINTAIN";
const read = (directory, path) => readJson(join(directory, path));
const fileDigest = (directory, path) => digest(readFileSync(join(directory, path)));

export function regularDraftFiles(compressed, expected) {
  const tar = gunzipSync(compressed, { maxOutputLength: 16 * 1024 * 1024 });
  const files = [];
  const headerString = (from, to) => tar.subarray(from, to).toString("utf8").replace(/\0.*$/su, "");
  let cursor = 0;
  while (cursor + 512 <= tar.length && tar.subarray(cursor, cursor + 512).some(byte => byte !== 0)) {
    const name = headerString(cursor, cursor + 100);
    assert(/^[\w./-]+$/u.test(name) && name.split("/").every(part => part && ![".", "..", ".git"].includes(part.toLowerCase())),
      "UNSAFE_DRAFT_PATH");
    assert((tar[cursor + 156] === 48 || tar[cursor + 156] === 0) && tar[cursor + 345] === 0 &&
      expected.includes(name) && !files.some(file => file.path === name), "DRAFT_ENTRY_NOT_ALLOWED");
    const length = headerString(cursor + 124, cursor + 136).trim();
    const permissions = headerString(cursor + 100, cursor + 108).trim();
    assert(/^[0-7]+$/u.test(length) && /^[0-7]+$/u.test(permissions), "BAD_DRAFT_TAR_HEADER");
    const size = Number.parseInt(length, 8), mode = Number.parseInt(permissions, 8);
    assert(Number.isSafeInteger(size) && cursor + 512 + size <= tar.length && mode <= 0o777, "BAD_DRAFT_TAR_ENTRY");
    files.push({ path: name, digest: digest(tar.subarray(cursor + 512, cursor + 512 + size)), size, mode });
    cursor += 512 + Math.ceil(size / 512) * 512;
  }
  assert(tar.length - cursor >= 1024 && tar.subarray(cursor).every(byte => byte === 0), "BAD_DRAFT_TAR_END");
  assert.deepEqual(files.map(file => file.path).sort(), [...expected].sort());
  return files;
}

export function archivedQueueDraft(campaign) {
  const directory = join(campaign, "r/5");
  const row = read(directory, "candidate.json");
  const session = read(directory, "first/session.json");
  assert.deepEqual(session.execution, row.session);
  assert.deepEqual(session.accounting, row.accounting);
  assert(row.mode === "paid-usage-only" && row.frozen.source === source && row.frozen.projectId === projectId &&
    !row.passed && !row.reconciled && !row.session.natural && row.session.killedBy === "usage_unobservable" &&
    row.submission.basis === "cd6ef14d708c2fb19a9c9887c3b511f5d454c899" && row.submission.candidate === row.submission.basis &&
    !row.submission.bundleSha256 && !row.submission.valid, "REQUIRE_ARCHIVED_STOPPED_DRAFT");
  const ledger = read(directory, out + "/request-accounting.json");
  const unknown = ledger.requests.at(-1);
  const lane = ledger.sessions.find(value => value.id === row.session.sessionId);
  assert(ledger.state === "STOPPED" && ledger.reason === "UPSTREAM_UNCERTAIN" && ledger.cohortId === row.session.cohortId &&
    lane?.state === "STOPPED" && lane.unresolvedRequests === 1 && ledger.unresolvedRequests === 1 &&
    ledger.requests.length === 71 && ledger.requests.slice(0, -1).every(item => item.state === "SETTLED") &&
    unknown.state === "UNKNOWN" && unknown.id === "4bcfa3c8-b6c5-4faa-acca-9bc26b7f7a39" && unknown.actual === null,
  "ARCHIVED_UNKNOWN_NOT_BOUND");
  const queue = read(campaign, "queue.json"), slot = read(campaign, "slot.json");
  assert(!slot.slot.writer && slot.slot.blocked === "USAGE_UNCONFIRMED" && slot.slot.project === projectId);
  assert.deepEqual(queue.map(item => item.outcome.state), ["REJECTED", "REJECTED", "STOPPED"]);
  assert.equal(queue.at(-1).id, row.signalId);
  assert.deepEqual(JSON.parse(queue.at(-1).result), { reconciled: false, natural: false, requests: 71 });
  const rejection = read(directory, "incoming.json");
  const previous = read(campaign, "r/4/candidate.json");
  assert(rejection.candidate === row.submission.basis && previous.reconciled && !previous.passed);
  assert.deepEqual(previous.predecessor, row.predecessor);
  for (const n of ["3", "4"]) {
    const evaluated = read(campaign, "r/" + n + "/candidate.json");
    const positive = evaluated.verification.probes.rows.filter(probe => probe.condition === "clean");
    assert(!evaluated.passed && positive.length === 2 && positive.every(probe => !probe.delivered));
  }
  const stream = "first/runtime-MAINTAIN/sessions/" + session.trajectory.stream;
  const states = manifest(join(directory, statePath)).filter(([name]) => name.endsWith(".sqlite"));
  const paths = ["slot.json", "queue.json", "prior-unknown.json", "r/3/candidate.json", "r/4/candidate.json", "r/4/first/candidate.bundle",
    ...["candidate.json", "source.json", "incoming.json", "initial-build/build.json", "first/session.json", "first/cohort.json",
      "first/request-ledger.sqlite", "first/working.patch", "first/untracked.tar.gz", out + "/run.json", out + "/request-accounting.json",
      out + "/request-observations.jsonl", stream, ...states.map(([name]) => statePath + "/" + name)].map(path => "r/5/" + path)];
  const files = Object.fromEntries(paths.map(path => [path, verifiedArchiveDigest(campaign, history, archive, path)]));
  const bundle = join(campaign, "r/4/first/candidate.bundle");
  assert.equal(files["r/4/first/candidate.bundle"], previous.submission.bundleSha256);
  assert.deepEqual(conclusion(join(directory, statePath)), session.conclusion);
  const untrackedPaths = row.submission.status.split("\n").filter(line => line.startsWith("?? ")).map(line => line.slice(3));
  assert(untrackedPaths.length > 0);
  const untracked = regularDraftFiles(readFileSync(join(directory, "first/untracked.tar.gz")), untrackedPaths);
  const stop = { history, archive, cohort: ledger.cohortId, signalId: row.signalId, ordinal: 71, unknown: [unknown.id],
    reason: unknown.reason, requests: ledger.requests.length, unresolved: ledger.unresolvedRequests,
    ledgerSha256: files["r/5/first/request-ledger.sqlite"], traceSha256: session.trajectory.sha256 };
  const proof = { kind: "stopped-draft", projectId, installation: row.predecessor.buildSha256, basis: rejection.basis,
    head: row.submission.basis, stop, rejection, checkpoint: sealOf(states), states, files,
    tracked: files["r/5/first/working.patch"], untrackedArchive: files["r/5/first/untracked.tar.gz"], untracked, status: row.submission.status };
  return { directory, proof, row: previous, session, rejection, bundle, stream };
}

export function prepareQueueDraft(prior, root) {
  const { directory, proof } = prior;
  const info = read(directory, "source.json");
  const stopped = read(directory, "candidate.json");
  assert.equal(fileDigest(directory, "source.tar"), info.archiveSha256);
  for (const name of ["source.json", "source.tar", "source.bundle", "initial-build", "next-seal", "input-first"]) {
    cpSync(join(directory, name), join(root, name), { recursive: true });
  }
  const input = join(root, "input-first");
  const missing = stopped.evidence.entries.filter(([name]) => !existsSync(join(input, name)));
  if (missing.length) {
    const reference = join(root, "reference-input");
    const rebuilt = new Map(makeEvidence(reference, "first").entries);
    for (const [name, hash] of missing) {
      assert.equal(rebuilt.get(name), hash, "SEALED_REFERENCE_UNAVAILABLE: " + name);
      const destination = join(input, name);
      mkdirSync(dirname(destination), { recursive: true });
      cpSync(join(reference, name), destination);
    }
    writeJson(join(root, "evidence-recovered.json"), missing);
  }
  assert.equal(sealOf(manifest(input)), stopped.evidence.sha256, "DRAFT_EVIDENCE_DRIFT");
  assert.deepEqual(manifest(join(root, "next-seal")), stopped.nextEvidence.entries, "NEXT_TICKET_EVIDENCE_DRIFT");
  const packet = join(input, "draft-stop");
  mkdirSync(packet);
  const events = readStream(join(directory, prior.stream), proof.stop.traceSha256);
  writeFileSync(join(packet, "session.jsonl"), events.map(event => JSON.stringify(event)).join("\n") + "\n");
  for (const path of ["first/working.patch", "first/untracked.tar.gz", out + "/run.json", out + "/request-accounting.json"]) {
    cpSync(join(directory, path), join(packet, path.split("/").at(-1)));
  }
  writeJson(join(packet, "checkpoint.json"), proof);
  const entries = manifest(input);
  return { source: info, evidence: { entries, sha256: sealOf(entries) }, nextEvidence: stopped.nextEvidence };
}

export function restoreQueueDraft(prior, world) {
  const { directory, proof } = prior;
  const patch = join(directory, "first/working.patch"), untracked = join(directory, "first/untracked.tar.gz");
  const recorded = success(offline(world, [
    "test -z \"$(git status --porcelain)\"",
    "git apply --check /tracked.patch",
    "git apply /tracked.patch",
    "git diff --binary | cmp -s - /tracked.patch",
    "git diff --cached --quiet",
    "tar -xzf /untracked.tar.gz --keep-old-files --no-same-owner --no-same-permissions",
    ...proof.untracked.map(file => "test \"$(sha256sum " + quote(file.path) + " | cut -d ' ' -f 1)\" = " + file.digest +
      " && test \"$(stat -c %a " + quote(file.path) + ")\" = " + file.mode.toString(8)),
    "git rev-parse HEAD",
    "git status --porcelain --untracked-files=all",
  ].join("\n"), [patch + ":/tracked.patch:ro", untracked + ":/untracked.tar.gz:ro"]));
  const [head, ...status] = recorded.split(/\r?\n/u);
  assert.equal(head, proof.head);
  // The historical recorder trimmed the leading space on the first porcelain row.
  assert.equal(status.join("\n").trimStart(), proof.status, "RESTORED_DRAFT_STATUS_DRIFT");
  return { head, tracked: proof.tracked, status: proof.status, untracked: proof.untracked, checkpoint: proof.checkpoint };
}
