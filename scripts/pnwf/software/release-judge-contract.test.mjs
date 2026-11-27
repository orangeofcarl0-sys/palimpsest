import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { digest, git } from "../energy/contract.mjs";
import { makeReleaseJudge, REQUIRED_CHECKS, RUBRIC, RUBRIC_DIGEST, RUBRIC_VERSION } from "./release-judge-contract.mjs";
import { releaseJudgeCases } from "./release-judge-cases.mjs";

const approved = "a".repeat(40), main = "b".repeat(40), tree = "c".repeat(40), continuation = "continue-123";
const facts = {
  release: { approved, main, tree, sameTree: true, state: "MERGED" },
  ci: { qualified: true, runs: [{ id: "12345678" }, { id: "87654321" }] },
  history: { continuation },
};
const notes = [
  "可以结清，BLOCKED 是已合入前的状态。",
  "送审 " + approved + "，主线 " + main + "。",
  "两个提交的文件树均为 " + tree + "。",
  "主线 CI 12345678 和 87654321 通过。",
  "两组原判 7/7、6/7。",
  "第 16 笔 UNKNOWN，原拒绝、草案和待办 " + continuation + " 保留。",
].join("\n");
const judgments = () => REQUIRED_CHECKS.map((criterion, n) => ({
  criterion, verdict: "PASS", reason: "Read the indicated line.", lines: [n + 1],
}));
function fixture(inputNotes = notes, inputFacts = facts) {
  const compare = { id: "review-1", notes: inputNotes, candidate: "d".repeat(40),
    original: true, scopedCandidate: true, expectedFailures: ["hidden-fixture-field"] };
  const saved = [];
  const judge = makeReleaseJudge({ cases: [compare], facts: inputFacts, onReceipt: receipt => saved.push(receipt) });
  const list = judge.dispatch({ action: "list" });
  const binding = { rubricVersion: list.rubricVersion, rubricDigest: list.rubricDigest };
  const send = input => judge.dispatch({ caseId: compare.id, ...input });
  const open = () => ["report", "release", "ci", "history"].forEach(part => assert(send({ action: "read", part }).ok));
  const submit = input => send({ action: "submit", documentHash: digest(inputNotes), judgments: judgments(), ...binding, ...input });
  return { send, open, submit, saved, list, binding };
}

const evidenceRoot = new URL("../../../evidence/", import.meta.url);
const trackedEvidenceRoot = new URL("../../../research-evidence/pnwf-software/2026-11-27/", import.meta.url);
const trackedJudgeRoot = new URL("release-tool-judge/live/", trackedEvidenceRoot);
function optionalJson(url) {
  try {
    return JSON.parse(readFileSync(url, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}
function evidence(file) {
  return optionalJson(new URL(file, evidenceRoot));
}
function sealedJudgments(compare, facts) {
  const lines = compare.notes.split(/\r?\n/u);
  const find = piece => lines.findIndex(line => line.includes(piece)) + 1;
  const cite = (...pieces) => [...new Set(pieces.map(find).filter(line => line > 0))];
  return REQUIRED_CHECKS.map(criterion => {
    const fail = compare.expectedFailures.includes(criterion);
    const citations = {
      releaseClosed: cite("可以结清", "结清", "决定"),
      exactVersions: cite(facts.release.approved, facts.release.main),
      treeEquivalence: cite(facts.release.tree),
      actualMainCi: cite(...facts.ci.runs.map(run => run.id)),
      originalVerdicts: cite("7/7", "6/7"),
      issue298RemainsBlocked: cite(facts.history.continuation),
    }[criterion];
    return { criterion, verdict: fail ? "FAIL" : "PASS",
      reason: fail ? "Sealed negative control." : "Sealed positive control.", lines: fail ? [] : citations };
  });
}

function trackedReplayAvailable() {
  const sealed = optionalJson(new URL("maintenance-release-evidence/sealed.json", trackedEvidenceRoot));
  const merge = optionalJson(new URL("maintenance-release-evidence/archive/pr303-merge-verification.json", trackedEvidenceRoot));
  if (!sealed || !merge?.approved || !merge?.merged) return false;
  const repo = fileURLToPath(new URL("../../..", import.meta.url));
  try {
    for (const commit of [sealed.basis, merge.approved, merge.merged]) {
      git(repo, "rev-parse", "--verify", "--quiet", commit + "^{commit}");
    }
    return true;
  } catch {
    return false;
  }
}

const frozen = evidence("frozen-cases.json");
const archivedReceipt = evidence("older-report-verdict.json") ??
  optionalJson(new URL("review-5.receipt.json", trackedJudgeRoot));
function observationVerdict(observation, fixture) {
  if (!observation) return null;
  const row = observation.cases?.find(item => item.originalScore === 6 &&
    item.verdicts?.issue298RemainsBlocked === "FAIL");
  if (!row) return null;
  const compare = fixture.cases.find(item => item.id === row.id);
  if (!compare) return null;
  const positives = sealedJudgments(compare, fixture.facts);
  const lines = compare.notes.split(/\r?\n/u);
  const claims = Object.fromEntries(REQUIRED_CHECKS.map(criterion => {
    const verdict = row.verdicts[criterion];
    const citations = verdict === "PASS" ? positives.find(item => item.criterion === criterion).lines : [];
    return [criterion, { verdict, reason: "Archived judge observation.", source: RUBRIC[criterion].source,
      citations: citations.map(line => ({ line, text: lines[line - 1] })) }];
  }));
  return { caseId: row.id, documentHash: compare.documentHash, claims,
    semanticScore: row.semanticScore, score: row.score };
}
const historical = frozen ? archivedReceipt ?? observationVerdict(evidence("judge-observation.json"), frozen) : null;
const loaderAvailable = Boolean(frozen) || trackedReplayAvailable();

test("judge only sees opaque cases and must read all four sources before scoring", () => {
  const { send, open, submit, saved, list, binding } = fixture();
  assert.deepEqual(send({ action: "list" }).cases, ["review-1"]);
  assert.equal(list.rubricVersion, RUBRIC_VERSION);
  assert.equal(list.rubricDigest, RUBRIC_DIGEST);
  assert.equal(list.rubricDigest, digest(JSON.stringify(list.criteria)));
  const doc = send({ action: "read", part: "report" });
  assert.deepEqual(Object.keys(doc).sort(), ["caseId", "documentHash", "lines", "ok", "part"]);
  assert.equal(doc.lines[1].line, 2);
  assert.equal(submit().code, "EVIDENCE_NOT_READ");
  assert.equal(saved.length, 0);
  open();
  const result = submit();
  assert(result.ok);
  assert.equal(result.rubricVersion, binding.rubricVersion);
  assert.equal(result.rubricDigest, binding.rubricDigest);
  assert.equal(saved[0].score, 7);
  assert.equal(saved[0].candidate, "d".repeat(40));
  assert.equal(saved[0].rubricVersion, list.rubricVersion);
  assert.equal(saved[0].rubricDigest, list.rubricDigest);
  assert.deepEqual(saved[0].claims.treeEquivalence.citations, [{ line: 3, text: notes.split("\n")[2] }]);
  assert.equal(saved[0].receiptId, result.receiptId);
  assert.equal(submit().code, "JUDGMENT_ALREADY_RECORDED");
  assert.equal(saved.length, 1);
});

test("reject mixed document versions, wrong rubric bindings, and malformed citations before writing a receipt", () => {
  const { open, submit, saved } = fixture();
  open();
  assert.equal(submit({ documentHash: digest("different report") }).code, "DOCUMENT_VERSION_MISMATCH");
  assert.equal(submit({ rubricVersion: "pnwf-release-judge-rubric/other" }).code, "RUBRIC_VERSION_MISMATCH");
  assert.equal(submit({ rubricDigest: "0".repeat(64) }).code, "RUBRIC_DIGEST_MISMATCH");
  assert.equal(saved.length, 0);
  const malformed = judgments();
  malformed[2] = null;
  assert.equal(submit({ judgments: malformed }).code, "JUDGMENT_OR_CITATION_INVALID");
  const badLine = judgments();
  badLine[2].lines = [24];
  assert.equal(submit({ judgments: badLine }).code, "JUDGMENT_OR_CITATION_INVALID");
  const wrongPart = judgments();
  wrongPart[1].lines = [4];
  assert.equal(submit({ judgments: wrongPart }).code, "CITATION_OR_AUTHORITY_MISMATCH");
  assert.equal(saved.length, 0);
});

test("a worker cannot pass CI with a missing run or pass a tree that host Git found unequal", () => {
  const missingRun = fixture(notes.replace("87654321", "00000000"));
  missingRun.open();
  assert.equal(missingRun.submit().code, "CITATION_OR_AUTHORITY_MISMATCH");
  const wrongTree = fixture(notes, { ...facts, release: { ...facts.release, sameTree: false } });
  wrongTree.open();
  assert.equal(wrongTree.submit().code, "CITATION_OR_AUTHORITY_MISMATCH");
});

test("an abstention is durable without manufacturing a numerical score", () => {
  const { open, submit, saved } = fixture();
  open();
  const entries = judgments();
  entries[2].verdict = "UNCERTAIN";
  entries[2].lines = [];
  assert(submit({ judgments: entries }).ok);
  assert.equal(saved[0].claims.treeEquivalence.verdict, "UNCERTAIN");
  assert.equal(saved[0].semanticScore, null);
  assert.equal(saved[0].score, null);
});

test("sealed labels and the tool judge share one rubric, including the tree and CI counterexamples",
  { skip: frozen ? false : "sealed evidence mount is not present" }, () => {
  const saved = [];
  const judge = makeReleaseJudge({ cases: frozen.cases, facts: frozen.facts, onReceipt: receipt => saved.push(receipt) });
  const list = judge.dispatch({ action: "list" });
  assert.equal(list.rubricVersion, RUBRIC_VERSION);
  assert.equal(list.rubricDigest, digest(JSON.stringify(list.criteria)));
  for (const compare of frozen.cases) {
    for (const part of ["report", "release", "ci", "history"]) {
      assert(judge.dispatch({ action: "read", caseId: compare.id, part }).ok);
    }
    const result = judge.dispatch({ action: "submit", caseId: compare.id, documentHash: compare.documentHash,
      rubricVersion: list.rubricVersion, rubricDigest: list.rubricDigest,
      judgments: sealedJudgments(compare, frozen.facts) });
    assert(result.ok, compare.id + " should settle");
    const receipt = saved.at(-1);
    assert.equal(receipt.rubricVersion, list.rubricVersion);
    assert.equal(receipt.rubricDigest, list.rubricDigest);
    assert.equal(receipt.documentHash, compare.documentHash);
    for (const criterion of REQUIRED_CHECKS) {
      assert.equal(receipt.claims[criterion].verdict, compare.expectedFailures.includes(criterion) ? "FAIL" : "PASS");
    }
    const expectedSemantic = REQUIRED_CHECKS.length - compare.expectedFailures.length;
    assert.equal(receipt.semanticScore, expectedSemantic);
    assert.equal(receipt.score, compare.original ? expectedSemantic + Number(compare.scopedCandidate) : null);
    assert.deepEqual(compare.baselineV4, { scopedCandidate: compare.scopedCandidate,
      ...Object.fromEntries(REQUIRED_CHECKS.map(criterion => [criterion, !compare.expectedFailures.includes(criterion)])) });
  }
  assert.equal(saved.length, frozen.cases.length);
  assert.deepEqual(frozen.cases.map(compare => compare.frozen), [5, 6, 5, 5, 6, 6]);
  assert.deepEqual(frozen.cases.filter(compare => compare.expectedFailures.length).map(compare => [compare.id, compare.expectedFailures]),
    [["review-2", ["treeEquivalence"]], ["review-4", ["actualMainCi"]], ["review-6", ["treeEquivalence"]]]);
});

test("the historical rejection verdict stays archived while the unified rubric replays it offline",
  { skip: historical ? false : "sealed or tracked historical archive is not present" }, () => {
  const compare = frozen.cases.find(row => row.id === historical.caseId);
  assert(compare, "archived case must remain in the sealed set");
  assert.equal(compare.documentHash, historical.documentHash);
  assert.equal(historical.claims.issue298RemainsBlocked.verdict, "FAIL");
  assert.equal(historical.match, undefined);
  if (historical.receiptId) {
    const { receiptId, ...archived } = historical;
    assert.equal(digest(JSON.stringify(archived)), receiptId, "archived receipt bytes must remain intact");
  }
  assert.equal(historical.score, 6);
  const saved = [];
  const judge = makeReleaseJudge({ cases: [compare], facts: frozen.facts, onReceipt: receipt => saved.push(receipt) });
  const list = judge.dispatch({ action: "list" });
  for (const part of ["report", "release", "ci", "history"]) {
    assert(judge.dispatch({ action: "read", caseId: compare.id, part }).ok);
  }
  const archivedJudgments = REQUIRED_CHECKS.map(criterion => {
    const claim = historical.claims[criterion];
    return { criterion, verdict: claim.verdict, reason: claim.reason, lines: claim.citations.map(row => row.line) };
  });
  const result = judge.dispatch({ action: "submit", caseId: compare.id, documentHash: historical.documentHash,
    rubricVersion: list.rubricVersion, rubricDigest: list.rubricDigest, judgments: archivedJudgments });
  assert(result.ok);
  assert.equal(result.rubricDigest, RUBRIC_DIGEST);
  assert.equal(saved[0].rubricVersion, RUBRIC_VERSION);
  assert.equal(saved[0].semanticScore, historical.semanticScore);
  assert.equal(saved[0].score, historical.score);
  assert.equal(saved[0].claims.issue298RemainsBlocked.verdict, "FAIL");
});

test("the sealed evidence loader verifies its manifest and returns the shared rubric binding",
  { skip: loaderAvailable ? false : "sealed evidence mount and tracked archives are not present" }, () => {
  const fixture = releaseJudgeCases(fileURLToPath(new URL("../../..", import.meta.url)));
  assert.equal(fixture.rubricVersion, RUBRIC_VERSION);
  assert.equal(fixture.rubricDigest, RUBRIC_DIGEST);
  assert.deepEqual(fixture.cases.map(compare => compare.id),
    ["review-1", "review-2", "review-3", "review-4", "review-5", "review-6"]);
  assert(fixture.cases.every(compare => digest(compare.notes) === compare.documentHash));
});
