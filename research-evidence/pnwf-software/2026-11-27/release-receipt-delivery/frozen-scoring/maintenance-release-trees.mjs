import assert from "node:assert/strict";
import { git, sha } from "../energy/contract.mjs";

export function readReleaseTrees(repo, approved, main) {
  return [approved, main].map(commit => {
    assert(sha(commit), "Exact release commit required");
    assert.equal(git(repo, "cat-file", "-t", commit), "commit");
    return { commit, tree: git(repo, "rev-parse", commit + "^{tree}") };
  });
}

const reviewedHead = /(?:送审|\breviewed\b|\bapproved\b)(?:[ \t]*(?:SHA\b|HEAD\b|提交|commit\b))?[ \t|*:\x60=：]*([a-f0-9]{40})(?![a-f0-9])/giu;
const treeName = /文件树|\btrees?\b/iu;
const negation = /文件树[^，,。；;\n]{0,20}?(?:不(?:相同|一样|一致|等价)|不同|并非同一|不是同一|并不是同一|有差异)|\btrees?\s+(?:(?:is|are|were)\s+)?(?:not\b|differ\w*\b)/iu;
const equivalence = /共同(?:完整)?文件树|文件树[^，,。；;\n]{0,60}?(?:同一|相同|一致|等价|均为|一样)|送审与主线完整树(?:相同|一致)|\btrees?\b[^，,。；;\n]{0,72}?(?:三者|两者|均)(?:一致|相同)|\b(?:same|identical|equal)\s+(?:git\s+)?trees?\b|\btrees?\s+(?:are\s+|is\s+)?(?:the\s+)?(?:same|identical|equal)\b/iu;

export function verifyReleaseTrees(notes, merge, citedMain, trees) {
  const citedReviewed = [...new Set([...notes.matchAll(reviewedHead)].map(match => match[1].toLowerCase()))];
  const [submitted, main] = trees;
  const objectsMatch = submitted?.commit === merge.approved && main?.commit === merge.merged &&
    submitted.tree === merge.tree && main.tree === merge.tree;
  const clauses = notes.split(/[。；\r\n]/u);
  const treeToken = new RegExp("(?<![a-f0-9])" + merge.tree + "(?![a-f0-9])", "iu");
  const matchingClaim = clauses.some(clause => treeToken.test(clause) && treeName.test(clause) && equivalence.test(clause));
  const contradiction = clauses.some(clause => negation.test(clause));
  return { pass: objectsMatch && citedReviewed.length === 1 && citedReviewed[0] === merge.approved &&
    citedMain.length === 1 && citedMain[0] === merge.merged && matchingClaim && !contradiction,
  trees, citedReviewed, citedMain, matchingClaim, contradiction, objectsMatch };
}
