import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { digest, readJson } from "./tools.mjs";

const prior = resolve(import.meta.dirname, "../../../research-evidence/pnwf-local-assets/2026-11-22/equipment-review-live");

export function archivedUnknown() {
  const paths = ["result.json", "recount.json", "sufficient/initial/ledger.sqlite", "sufficient/initial/request-accounting.json",
    "sufficient/initial/request-observations.jsonl", "sufficient/initial/session.jsonl.zstd"];
  const ledger = readJson(join(prior, paths[3]));
  assert.equal(readJson(join(prior, paths[0])).blocked, "sufficient/initial");
  assert(ledger.state === "STOPPED" && ledger.requests.length === 13 && ledger.unresolvedRequests === 1);
  const request = ledger.requests[12];
  assert.equal(request.id, "ab0af720-f897-4534-b308-6c96d6388f74");
  assert(request.state === "UNKNOWN" && request.reason === "CLIENT_DISCONNECTED" && request.actual === null && request.usage === null);
  const ledgerUrl = pathToFileURL(join(prior, paths[2]));
  ledgerUrl.searchParams.set("immutable", "1");
  const db = new DatabaseSync(ledgerUrl.href, { readOnly: true });
  try { assert.deepEqual({ ...db.prepare("SELECT * FROM requests WHERE id=?").get(request.id) }, request); }
  finally { db.close(); }
  const observations = readFileSync(join(prior, paths[4]), "utf8").split(/\r?\n/u).filter(Boolean)
    .map((line) => JSON.parse(line)).filter((row) => row.requestId === request.id);
  assert.deepEqual(observations.map((row) => row.kind), ["ADMITTED"]);
  const prefix = readJson(join(prior, paths[1])).outcomes.sufficient.initial.settledPrefix;
  assert.equal(prefix.bound, 12);
  assert.equal(prefix.confirmed, ledger.confirmed);
  return {
    sourceCommit: "1afe9282", source: "../equipment-review-live", cohortId: ledger.cohortId, ordinal: 13, request, observations,
    originalLedgerState: ledger.state, confirmedTokens: ledger.confirmed, totalTokens: null, dshOnly: prefix.dshAfterCutoff,
    disposition: "ARCHIVED_UNKNOWN_SEPARATE_COHORT_AUTHORIZED",
    files: Object.fromEntries(paths.map((path) => [path, digest(readFileSync(join(prior, path)))])),
  };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  console.log(JSON.stringify(archivedUnknown(), null, 2));
}
