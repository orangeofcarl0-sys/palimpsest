/** Host-side contract for a semantic release judge. The authority facts come from Git and sealed receipts. */
import assert from "node:assert/strict";
import { digest } from "../energy/contract.mjs";

/**
 * One rubric is shared by the sealed release labels (the offline v4 checks in
 * maintenance-release-score.mjs and evidence/frozen-cases.json) and the tool-based judge.
 * The version identifies the label vocabulary; the digest fingerprints the exact criteria a
 * receipt was written against.
 */
export const RUBRIC_VERSION = "pnwf-release-judge-rubric/v1";
export const RUBRIC = Object.freeze({
  releaseClosed: Object.freeze({ source: "release", requirement: "The report concludes that the release may close and explains the earlier blocked snapshot as historical." }),
  exactVersions: Object.freeze({ source: "release", requirement: "The report distinguishes the exact reviewed commit from the actual main commit." }),
  treeEquivalence: Object.freeze({ source: "release", requirement: "The report associates the two correct commits with their shared Git tree. An unrelated equality, a bare digest without shared attribution, or a contradiction fails." }),
  actualMainCi: Object.freeze({ source: "ci", requirement: "The report identifies every main CI run for the correct commit and accurately describes their results. Review-head runs must stay distinct. Any stated counts must be accurate." }),
  originalVerdicts: Object.freeze({ source: "history", requirement: "The report preserves both named historical verdicts." }),
  issue298RemainsBlocked: Object.freeze({ source: "history", requirement: "The report preserves issue 298's unknown request, offline draft score and same waiting continuation without claiming the blocked position advanced." }),
});
export const REQUIRED_CHECKS = Object.freeze(Object.keys(RUBRIC));
/** A receipt binds both the rubric identity and this exact criteria digest. */
export const RUBRIC_DIGEST = digest(JSON.stringify(RUBRIC));
export const RUBRIC_BINDING = Object.freeze({ rubricVersion: RUBRIC_VERSION, rubricDigest: RUBRIC_DIGEST });

export function makeReleaseJudge({ cases, facts, onReceipt = () => {} }) {
  const byId = new Map(cases.map(compare => [compare.id, {
    ...compare,
    documentHash: typeof compare.documentHash === "string" ? compare.documentHash : digest(compare.notes),
    lines: compare.notes.split(/\r?\n/u),
  }]));
  const observed = new Map(cases.map(compare => [compare.id, new Set()]));
  const receipts = new Map(), events = [];
  const deny = (code, extra = {}) => ({ ok: false, code, ...extra });
  const sources = { release: facts.release, ci: facts.ci, history: facts.history };
  const getClaims = (compare, input) => {
    const entries = input.judgments;
    if (!Array.isArray(entries) || entries.length !== REQUIRED_CHECKS.length ||
        new Set(entries.map(entry => entry?.criterion)).size !== REQUIRED_CHECKS.length) return null;
    const valid = entries.every(entry => entry && typeof entry === "object" && Object.hasOwn(RUBRIC, entry.criterion) &&
      ["PASS", "FAIL", "UNCERTAIN"].includes(entry.verdict) &&
      typeof entry.reason === "string" && entry.reason.trim() && entry.reason.length <= 1200 &&
      Array.isArray(entry.lines) && entry.lines.length <= 20 && (entry.verdict !== "PASS" || entry.lines.length > 0) &&
      entry.lines.every(line => Number.isSafeInteger(line) && line > 0 && Boolean(compare.lines[line - 1]?.trim())));
    if (!valid) return null;
    return Object.fromEntries(entries.map(({ criterion, verdict, reason, lines }) => [criterion, {
      verdict, reason, source: RUBRIC[criterion].source, citations: [...new Set(lines)].map(line => ({
        line, text: compare.lines[line - 1],
      })),
    }]));
  };
  function dispatch(input) {
    let outcome;
    if (input?.action === "list") {
      outcome = { ok: true, ...RUBRIC_BINDING, cases: [...byId.keys()], criteria: RUBRIC, requiredChecks: REQUIRED_CHECKS };
    } else if (!byId.has(input?.caseId)) {
      outcome = deny("CASE_UNKNOWN");
    } else {
      const compare = byId.get(input.caseId);
      const seen = observed.get(input.caseId);
      if (input.action === "read" && (input.part === "report" || Object.hasOwn(sources, input.part))) {
        seen.add(input.part);
        outcome = { ok: true, caseId: input.caseId, part: input.part, documentHash: compare.documentHash,
          ...(input.part === "report" ? { lines: compare.lines.map((text, index) => ({ line: index + 1, text })) } :
            { fact: sources[input.part] }) };
      } else if (input.action === "submit") {
        outcome = submit(compare, seen, input);
      } else {
        outcome = deny("UNKNOWN_ACTION_OR_PART");
      }
    }
    events.push({ action: input?.action, caseId: input?.caseId, part: input?.part, ok: outcome.ok, code: outcome.code,
      receiptId: outcome.receiptId });
    return outcome;
  }
  function submit(compare, seen, input) {
    if (input.documentHash !== compare.documentHash) return deny("DOCUMENT_VERSION_MISMATCH");
    if (input.rubricVersion !== RUBRIC_VERSION) {
      return deny("RUBRIC_VERSION_MISMATCH", { expectedRubricVersion: RUBRIC_VERSION });
    }
    if (input.rubricDigest !== RUBRIC_DIGEST) {
      return deny("RUBRIC_DIGEST_MISMATCH", { expectedRubricDigest: RUBRIC_DIGEST });
    }
    if (!["report", ...Object.keys(sources)].every(part => seen.has(part))) return deny("EVIDENCE_NOT_READ");
    if (receipts.has(compare.id)) return deny("JUDGMENT_ALREADY_RECORDED");
    const claims = getClaims(compare, input);
    if (!claims) return deny("JUDGMENT_OR_CITATION_INVALID");
    const quoted = key => claims[key].citations.map(line => line.text).join("\n");
    const pass = key => claims[key].verdict === "PASS";
    // Host checks exact identifiers in citations. The worker decides how the report relates them.
    if ((pass("exactVersions") && ![facts.release.approved, facts.release.main].every(sha => quoted("exactVersions").includes(sha))) ||
        (pass("treeEquivalence") && (!facts.release.sameTree || !quoted("treeEquivalence").includes(facts.release.tree))) ||
        (pass("actualMainCi") && (!facts.ci.qualified || !facts.ci.runs.every(run => quoted("actualMainCi").includes(run.id)))) ||
        (pass("releaseClosed") && facts.release.state !== "MERGED") ||
        (pass("issue298RemainsBlocked") && !quoted("issue298RemainsBlocked").includes(facts.history.continuation))) {
      return deny("CITATION_OR_AUTHORITY_MISMATCH");
    }
    const values = Object.values(claims);
    const uncertain = values.some(claim => claim.verdict === "UNCERTAIN");
    const score = uncertain ? null : values.filter(claim => claim.verdict === "PASS").length;
    const scope = compare.original ? { pass: compare.scopedCandidate } : null;
    const receipt = { caseId: compare.id, ...RUBRIC_BINDING, documentHash: compare.documentHash, candidate: compare.candidate,
      scope, claims, semanticScore: score, score: scope && score !== null ? score + Number(scope.pass) : null };
    const receiptId = digest(JSON.stringify(receipt));
    onReceipt({ ...receipt, receiptId });
    receipts.set(compare.id, { ...receipt, receiptId });
    return { ok: true, ...RUBRIC_BINDING, receiptId, remaining: [...byId.keys()].filter(id => !receipts.has(id)) };
  }
  assert.equal(byId.size, cases.length);
  return { dispatch, snapshot: () => ({ events, receipts: [...receipts.values()] }) };
}
