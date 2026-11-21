/** Zero-paid recheck of an uncommitted maintenance draft. Leaves the original evidence untouched. */
import assert from "node:assert/strict";
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { stripVTControlCharacters } from "node:util";
import { digest, readJson, writeJson } from "../../energy/contract.mjs";
import { closeoutChecks, regression } from "./judge.mjs";
import { buildCommand, makeVolume, offline, seedSource, success, verifyInstallation } from "./workspace.mjs";

const [recorded, output] = process.argv.slice(2);
assert(recorded && output, "Usage: self-evolution/verify-draft.mjs <live-dir> <new-offline-output>");
const root = resolve(recorded), out = resolve(output);
const record = readJson(join(root, "candidate.json"));
const diff = join(root, "first/working.patch");
assert(!record.submission.valid && record.submission.candidate === record.submission.basis, "UNCOMMITTED_DRAFT_REQUIRED");
assert(readFileSync(diff).length > 0, "DRAFT_PATCH_EMPTY");
assert(!/^\?\? /mu.test(record.submission.status), "UNTRACKED_DRAFT_NOT_COVERED_BY_PATCH");
const world = makeVolume(record.predecessor.image);
mkdirSync(out);
try {
  const materialized = seedSource(world, root, readJson(join(root, "source.json")));
  assert.equal(materialized.head, record.submission.basis);
  const verifyReadiness = label => {
    const evaluated = offline(world, `${buildCommand} && node scripts/pnwf/software/self-maintenance-readiness.mjs`);
    writeFileSync(join(out, `${label}-readiness.log`), evaluated.stdout + evaluated.stderr);
    const result = evaluated.stdout.match(/^DIRECT_READINESS (.+)$/mu)?.[1];
    return { exit: evaluated.status, checks: result ? JSON.parse(result).checks : null };
  };
  const baseline = verifyReadiness("baseline");
  success(offline(world, "git apply /draft.patch && git diff --binary | cmp -s - /draft.patch", [`${diff}:/draft.patch:ro`]));
  const draft = verifyReadiness("draft");
  const tests = regression(world, join(out, "draft-regression.log"));
  const suite = "test/pnwf_product.test.ts";
  const focused = offline(world, `node node_modules/vitest/vitest.mjs run --configLoader runner --no-cache --maxWorkers 1 ${suite}`);
  const focusedLog = stripVTControlCharacters(focused.stdout + focused.stderr);
  writeFileSync(join(out, "draft-pnwf-product.log"), focusedLog);
  writeJson(join(out, "draft-pnwf-product.json"), { source: "uncommitted-draft", patchSha256: digest(readFileSync(diff)), suite,
    exit: focused.status, passed: Number(focusedLog.match(/^\s*Tests\s+(\d+) passed/mu)?.[1] ?? 0), paidRequests: 0 });
  const originalInstall = verifyInstallation(join(root, "initial-build"), record.predecessor);
  const runtime = join(out, "draft-runtime");
  cpSync(originalInstall, runtime, { recursive: true, filter: path => !path.startsWith(join(originalInstall, "dist")) });
  success(offline(world, "mkdir -p /artifact/dist && cp -R dist/src /artifact/dist/", [`${runtime}:/artifact`]));
  const unchangedHostBehavior = await closeoutChecks(join(out, "draft-replay"), { runtime, image: world.image, candidate: false });
  const status = success(offline(world, "git status --porcelain"));
  assert.equal(success(offline(world, "git rev-parse HEAD")), materialized.head);
  writeJson(join(out, "offline-recheck.json"), { basis: materialized.head, patchSha256: digest(readFileSync(diff)), status,
    baseline, draft, tests, unchangedHostBehavior, paidRequests: 0 });
  console.log(JSON.stringify({ baseline, draft, tests, probeDeliveries: unchangedHostBehavior.rows.map(row => row.delivered) }));
} finally { world.close(); }
