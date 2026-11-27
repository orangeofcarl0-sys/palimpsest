/** Prepare blind judge cases from frozen, byte-verified release reports. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { changed, digest, git, readJson, sha } from "../energy/contract.mjs";
import { gradeRelease, RELEASE_REPORT } from "./maintenance-release-score.mjs";
import { readReleaseTrees } from "./maintenance-release-trees.mjs";

const evidence = "research-evidence/pnwf-software/2026-11-27";
const readBlob = (repo, ref) => execFileSync("git", ["--no-replace-objects", "-C", repo, "cat-file", "blob", ref], {
  maxBuffer: 2 * 1024 * 1024, timeout: 30_000,
});

export function releaseJudgeCases(repo) {
  const latest = join(repo, evidence, "release-receipt-delivery");
  const older = join(repo, evidence, "release-contact-basis");
  const sealed = readJson(join(latest, "sealed.json"));
  for (const [name, hash] of sealed.archive) assert.equal(digest(readFileSync(join(latest, "archive", name))), hash);
  assert(sha(sealed.basis));
  const originalBytes = readBlob(repo, sealed.basis + ":" + RELEASE_REPORT);
  assert.equal(digest(originalBytes), sealed.original);
  const original = originalBytes.toString("utf8");
  const prior = readJson(join(latest, "archive/pr303-review.json"));
  const merge = readJson(join(latest, "archive/pr303-merge-verification.json"));
  const ci = readJson(join(latest, "archive/pr303-main-ci.json"));
  assert.equal(merge.merged, sealed.basis);
  assert.equal(merge.approved, prior.pr.headRefOid);
  assert.equal(merge.pr.mergeCommit.oid, merge.merged);
  const trees = readReleaseTrees(repo, merge.approved, merge.merged);
  const complete = item => item.status === "completed" && item.conclusion === "success";
  const runs = ci.workflows.map(run => ({
    id: String(run.databaseId), name: run.workflowName, commit: run.headSha, branch: run.headBranch, status: run.status,
    conclusion: run.conclusion, jobs: ci.jobs.filter(job => job.workflow === run.workflowName && job.url.startsWith(run.url + "/job/")),
  }));
  const facts = {
    release: { pr: 303, priorState: prior.pr.state, priorMergeStatus: prior.pr.mergeStateStatus, state: merge.pr.state,
      approved: merge.approved, main: merge.merged, tree: merge.tree, trees, sameTree: trees.every(entry => entry.tree === merge.tree) },
    ci: { commit: ci.main, runs, jobCount: ci.jobs.length,
      qualified: ci.main === merge.merged && runs.length === 4 && ci.jobs.length === 15 && new Set(runs.map(run => run.id)).size === 4 &&
        runs.every(run => run.commit === merge.merged && run.branch === "main" && complete(run) && run.jobs.length && run.jobs.every(complete)) &&
        runs.reduce((count, run) => count + run.jobs.length, 0) === ci.jobs.length },
    history: { verdicts: prior.originalVerdicts, issue: 298, originalRejection: "REJECTED / persisted-candidate",
      request: ci.issue298.request, draft: ci.issue298.draft, continuation: ci.issue298.continuation,
      continuationState: ci.issue298.continuationState, issueState: ci.issue298.state },
  };
  assert(facts.release.sameTree && facts.ci.qualified);
  function load(root, arm) {
    const dir = join(root, "live", arm);
    const frozen = readJson(join(dir, "result.json"));
    const bundle = join(dir, "candidate.bundle");
    assert(sha(frozen.candidate));
    assert.equal(git(repo, "bundle", "list-heads", bundle), frozen.candidate + " HEAD");
    git(repo, "bundle", "verify", bundle);
    git(repo, "bundle", "unbundle", bundle);
    const ref = frozen.candidate + ":" + RELEASE_REPORT;
    const bytes = readBlob(repo, ref);
    assert.deepEqual(bytes, readFileSync(join(dir, "report-submitted.md")));
    assert.equal(git(repo, "rev-parse", ref), frozen.blob);
    const paths = changed(repo, sealed.basis, frozen.candidate);
    const parent = git(repo, "show", "-s", "--format=%P", frozen.candidate);
    const text = bytes.toString("utf8");
    assert(text.startsWith(original));
    const scopedCandidate = parent === sealed.basis && frozen.status === "" &&
      paths.length === 1 && paths[0] === RELEASE_REPORT;
    return { candidate: frozen.candidate, blob: frozen.blob, frozen: frozen.score, scopedCandidate,
      original: true, notes: text.slice(original.length), expectedFailures: [] };
  }
  const first = load(latest, "P"), second = load(latest, "F"), same = load(older, "P");
  const variant = (source, notes, key) => {
    assert.notEqual(notes, source.notes);
    return { ...source, notes, original: false, expectedFailures: [key] };
  };
  // Mutations preserve the exact cited hashes wherever possible and change only the assertion being tested.
  const negation = variant(same, same.notes.replace("文件树为同一", "文件树不相同。主线树为"), "treeEquivalence");
  const unrelated = variant(same, same.notes.replace("文件树为同一", "只给出主线文件树").replace(
    "故以文件树而非提交 SHA 对照送审与主线", "核验时间与归档一致"), "treeEquivalence");
  const missingRun = variant(second, second.notes.replaceAll(facts.ci.runs[0].id, "00000000000"), "actualMainCi");
  const cases = [first, unrelated, second, missingRun, same, negation].map((row, index) => {
    const id = "review-" + (index + 1);
    const baselineV4 = gradeRelease(original + row.notes, original, [RELEASE_REPORT], "", sealed.basis, { prior, merge, ci, trees });
    return { ...row, id, baselineV4: baselineV4.checks };
  });
  return { basis: sealed.basis, facts, cases };
}
