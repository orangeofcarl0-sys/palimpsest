/** Regrade archived candidates from their original Git objects without starting a session. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { changed, digest, git, readJson, sha, writeJson } from "../energy/contract.mjs";
import { gradeRelease, RELEASE_REPORT, RELEASE_SCORE_SCHEMA } from "./maintenance-release-score.mjs";
import { readReleaseTrees } from "./maintenance-release-trees.mjs";

assert.equal(process.argv.length, 3, "Usage: maintenance-release-rescore.mjs <evidence-directory>");
const root = resolve(process.argv[2]);
const repo = git(process.cwd(), "rev-parse", "--show-toplevel");
const sealed = readJson(join(root, "sealed.json"));
const prior = readJson(join(root, "archive/pr303-review.json"));
const merge = readJson(join(root, "archive/pr303-merge-verification.json"));
const ci = readJson(join(root, "archive/pr303-main-ci.json"));
assert(sha(sealed.basis));
assert.equal(merge.merged, sealed.basis);
const trees = readReleaseTrees(repo, merge.approved, merge.merged);
for (const [name, hash] of sealed.archive) assert.equal(digest(readFileSync(join(root, "archive", name))), hash);

const readBlob = ref => execFileSync("git", ["--no-replace-objects", "-C", repo, "cat-file", "blob", ref], {
  maxBuffer: 2 * 1024 * 1024, timeout: 30_000,
});
const original = readBlob(sealed.basis + ":" + RELEASE_REPORT);
assert.equal(digest(original), sealed.original);

const arms = ["P", "F"].map(arm => {
  const run = join(root, "live", arm);
  const frozen = readJson(join(run, "result.json"));
  const bundle = join(run, "candidate.bundle");
  assert.equal(frozen.name, arm);
  assert.equal(frozen.basis, sealed.basis);
  assert(sha(frozen.candidate));
  assert.equal(git(repo, "bundle", "list-heads", bundle), frozen.candidate + " HEAD");
  git(repo, "bundle", "verify", bundle);
  // Unbundle restores the sealed Git objects without creating refs or changing the checkout.
  git(repo, "bundle", "unbundle", bundle);
  const parent = git(repo, "show", "-s", "--format=%P", frozen.candidate);
  const paths = changed(repo, sealed.basis, frozen.candidate);
  const ref = frozen.candidate + ":" + RELEASE_REPORT;
  const blob = git(repo, "rev-parse", "--verify", ref);
  const bytes = readBlob(ref);
  assert.equal(parent, frozen.parent);
  assert.deepEqual(paths, frozen.paths);
  assert.equal(blob, frozen.blob);
  assert.deepEqual(bytes, readFileSync(join(run, "report-submitted.md")));
  assert.equal(frozen.score, Object.values(frozen.checks).filter(Boolean).length);
  const { schema, checks, mainCi, mergeMethod, treeCheck } = gradeRelease(
    bytes.toString("utf8"), original.toString("utf8"), paths, frozen.status, parent, { prior, merge, ci, trees },
  );
  return { arm, candidate: frozen.candidate, parent, paths, blob, reportSha256: digest(bytes),
    frozen: { score: frozen.score, total: Object.keys(frozen.checks).length, checks: frozen.checks },
    offline: { schema, score: Object.values(checks).filter(Boolean).length, total: Object.keys(checks).length,
      checks, mergeMethod, mainCi, treeCheck } };
});

const result = { schema: RELEASE_SCORE_SCHEMA, basis: sealed.basis,
  scorerSha256: digest(readFileSync(new URL("./maintenance-release-score.mjs", import.meta.url))),
  treeVerifierSha256: digest(readFileSync(new URL("./maintenance-release-trees.mjs", import.meta.url))),
  additionalPaidRequests: 0, arms };
writeJson(join(root, "offline-score-v4.json"), result);
for (const { arm, frozen, offline } of arms) {
  console.log(arm, "frozen", frozen.score + "/" + frozen.total, "offline", offline.score + "/" + offline.total, offline.mergeMethod);
}
