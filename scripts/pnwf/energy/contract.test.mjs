import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { BULLETIN, REVISION_PATHS, commitAll, git, injectCorrection, makeSeed, normalizeSiteRows } from "./contract.mjs";
import { validateWorkerResult } from "./container-worker.mjs";

const fixture = fileURLToPath(new URL("../../../fixtures/psvr/energy-deployment", import.meta.url));

test("worker result transport checks exact basis and rejects non-deliverable paths", () => {
  const world = mkdtempSync(join(tmpdir(), "pnwf-energy-contract-"));
  const seed = makeSeed(world, fixture);
  const basis = injectCorrection(world);
  assert.equal(git(world, "diff", "--name-only", seed, basis), BULLETIN);
  assert.throws(() => validateWorkerResult(world, basis, seed), /WORKER_RESULT_BASIS_MISMATCH/u);
  mkdirSync(join(world, "deliverables"));
  writeFileSync(join(world, REVISION_PATHS[0]), "bounded revision\n");
  const result = commitAll(world, "Produce scoped candidate");
  assert.deepEqual(validateWorkerResult(world, basis, result), [REVISION_PATHS[0]]);
  writeFileSync(join(world, "README.md"), "outside scope\n");
  assert.throws(() => validateWorkerResult(world, basis, result), /WORKER_WORLD_DIRTY/u);
  const escaped = commitAll(world, "Modify a protected input");
  assert.throws(() => validateWorkerResult(world, basis, escaped), /WORKER_RESULT_OUTSIDE_SCOPE/u);
});

test("the scorer accepts only unambiguous site aliases and retains all other data", () => {
  const rows = [{ site: "North Ridge", model: "K-900" }, { site: "Harbor Flats", model: "S-1080" }];
  assert.deepEqual(normalizeSiteRows(rows), [{ site: "NR", model: "K-900" }, { site: "HF", model: "S-1080" }]);
  assert.equal(rows[0].site, "North Ridge");
  assert.throws(() => normalizeSiteRows([{ site: "NR" }, { site: "North Ridge" }]), /SITE_ROWS_DUPLICATE/u);
  assert.throws(() => normalizeSiteRows([{ site: "NR" }, { site: "Harbor" }]), /SITE_ROWS_UNKNOWN_OR_INCOMPLETE/u);
});
