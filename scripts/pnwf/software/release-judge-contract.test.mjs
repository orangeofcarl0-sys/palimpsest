import assert from "node:assert/strict";
import { test } from "node:test";
import { digest } from "../energy/contract.mjs";
import { makeReleaseJudge, REQUIRED_CHECKS } from "./release-judge-contract.mjs";

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
  const send = input => judge.dispatch({ caseId: compare.id, ...input });
  const open = () => ["report", "release", "ci", "history"].forEach(part => assert(send({ action: "read", part }).ok));
  const submit = input => send({ action: "submit", documentHash: digest(inputNotes), judgments: judgments(), ...input });
  return { send, open, submit, saved };
}

test("judge only sees opaque cases and must read all four sources before scoring", () => {
  const { send, open, submit, saved } = fixture();
  assert.deepEqual(send({ action: "list" }).cases, ["review-1"]);
  const doc = send({ action: "read", part: "report" });
  assert.deepEqual(Object.keys(doc).sort(), ["caseId", "documentHash", "lines", "ok", "part"]);
  assert.equal(doc.lines[1].line, 2);
  assert.equal(submit().code, "EVIDENCE_NOT_READ");
  assert.equal(saved.length, 0);
  open();
  const result = submit();
  assert(result.ok);
  assert.equal(saved[0].score, 7);
  assert.equal(saved[0].candidate, "d".repeat(40));
  assert.deepEqual(saved[0].claims.treeEquivalence.citations, [{ line: 3, text: notes.split("\n")[2] }]);
  assert.equal(saved[0].receiptId, result.receiptId);
  assert.equal(submit().code, "JUDGMENT_ALREADY_RECORDED");
  assert.equal(saved.length, 1);
});

test("reject mixed document versions and malformed or fabricated citations before writing a receipt", () => {
  const { open, submit, saved } = fixture();
  open();
  assert.equal(submit({ documentHash: digest("different report") }).code, "DOCUMENT_VERSION_MISMATCH");
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
