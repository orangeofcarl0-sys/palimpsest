import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { gradeRelease, RELEASE_REPORT } from "./maintenance-release-score.mjs";

const evidence = new URL("../../../research-evidence/pnwf-software/2026-11-27/maintenance-release-evidence/", import.meta.url);
const json = path => JSON.parse(readFileSync(new URL(path, evidence), "utf8"));
const facts = { prior: json("archive/pr303-review.json"), merge: json("archive/pr303-merge-verification.json"),
  ci: json("archive/pr303-main-ci.json") };
const main = facts.merge.merged;
const original = "Original report.\n";
const runIds = facts.ci.workflows.map(row => String(row.databaseId));
const table = ["| 工作流 | 运行 |", "| --- | --- |", ...facts.ci.workflows.map(row =>
  "| " + row.workflowName + " | [记录](" + row.url + ") |")].join("\n");
const heading = "## PR #303\n\n发布已结清。\n\n";
const versions = "| 送审 SHA | " + facts.merge.approved + " |\n| 实际主线 SHA | " + main + " |\n\n";
const report = heading + versions + "### 主线 CI\n\n" + table + "\n";
const grade = (notes, archive = facts) => gradeRelease(original + notes, original, [RELEASE_REPORT], "", main, archive);

test("release closure stands independently of the merge method", () => {
  const result = grade(report);
  assert.equal(result.checks.releaseClosed, true);
  assert.equal(result.mergeMethod, "REBASE_UNSTATED");
  const waiting = grade(report.replace("发布已结清。", "已按 rebase 合入，但发布尚未结清，仍待核对。"));
  assert.equal(waiting.checks.releaseClosed, false);
  assert.equal(waiting.mergeMethod, "REBASE_MENTIONED");
  const archive = structuredClone(facts);
  archive.merge.pr.state = "OPEN";
  assert.equal(grade(report, archive).checks.releaseClosed, false);
});

test("workflow rows can establish the CI coverage without an explicit count", () => {
  const result = grade(report);
  assert.equal(result.checks.actualMainCi, true);
  assert.deepEqual(result.mainCi.citedRunIds, runIds);
});

test("checks explicit Chinese and Arabic workflow and job counts against the receipt", () => {
  for (const count of ["四条运行、十五项作业均通过。", "4/4 工作流、15/15 jobs 通过。"]) {
    assert.equal(grade(report + count).checks.actualMainCi, true);
  }
  for (const count of ["五条运行、十五项作业均通过。", "四条运行、十四项作业均通过。", "4/5 工作流均已成功。"]) {
    const result = grade(report + count);
    assert.equal(result.mainCi.reportedCountsMatch, false);
    assert.equal(result.checks.actualMainCi, false);
  }
});

test("requires the exact full SHA identified as main in the submitted notes", () => {
  for (const wrongHead of [main.slice(0, 8), facts.merge.approved, main + "e"]) {
    const wrong = report.replace("实际主线 SHA | " + main, "实际主线 SHA | " + wrongHead) + "\n任意引用 " + main;
    assert.equal(grade(wrong).checks.actualMainCi, false);
  }
  assert.equal(grade(report + "\n主线 SHA " + facts.merge.approved).checks.actualMainCi, false);
});

test("missing, duplicate, and partial run IDs fail despite a claimed total", () => {
  for (const substitution of ["00000000000", runIds[0], runIds[1] + "1", runIds[1].slice(1)]) {
    const wrong = report.replace(runIds[1], substitution) + "\n四条运行、十五项作业均通过。";
    assert.equal(grade(wrong).checks.actualMainCi, false);
  }
});

test("CI run citations under the prior review do not satisfy main CI", () => {
  const wrong = report.replace("### 主线 CI", "### 送审 CI") + "\n### 主线 CI\n\n四条运行、十五项作业均通过。";
  assert.equal(grade(wrong).checks.actualMainCi, false);
});

test("archived runs must be successful on the actual main SHA with matching successful jobs", () => {
  for (const change of [
    ci => { ci.workflows[0].headSha = facts.merge.approved; },
    ci => { ci.workflows[0].status = "in_progress"; },
    ci => { ci.workflows[0].headBranch = "topic"; },
    ci => { ci.jobs[0].conclusion = "failure"; },
    ci => { ci.jobs[0].url = ci.jobs[0].url.replace(runIds[0], runIds[1]); },
  ]) {
    const archive = structuredClone(facts);
    change(archive.ci);
    assert.equal(grade(report, archive).checks.actualMainCi, false);
  }
});

for (const arm of ["P", "F"]) {
  test(arm + " original appended report passes the revised business checks", () => {
    const submitted = readFileSync(new URL("live/" + arm + "/report-submitted.md", evidence), "utf8");
    const offset = submitted.lastIndexOf("\n## 发布");
    assert(offset > 0);
    const result = gradeRelease(submitted, submitted.slice(0, offset), [RELEASE_REPORT], "", main, facts);
    assert.equal(result.mergeMethod, "REBASE_UNSTATED");
    assert.deepEqual(Object.values(result.checks), Array(7).fill(true));
    assert.equal(json("live/" + arm + "/result.json").score, 5);
  });
}
