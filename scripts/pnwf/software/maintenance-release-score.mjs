/** Grade the PR #303 release handover against its archived GitHub receipts. */
export const RELEASE_SCORE_SCHEMA = "pnwf-maintenance-release-score/v2";
export const RELEASE_REPORT = "docs/engineering/MAINTENANCE-COLD-PAIR.md";

const mainCiLabel = /(?:主线|\bmain\b).{0,72}?(?:\bCI\b|工作流|\bworkflows?\b|检查|作业)/iu;
const reviewCiLabel = /^(?:\s*[|#>*-]\s*)*(?:送审|PR\s*CI\b|review(?:ed)?\s+CI\b)/iu;
const mainShaLabel = /(?:主线|\bmain\b)(?:[ \t]*(?:CI\b[ \t]*)?(?:SHA\b|HEAD\b|提交|commit\b))?[ \t|*:\x60=：]*([a-f0-9]{40})(?![a-f0-9])/giu;
const counts = /(?<![a-z0-9])(\d+|[零一二两三四五六七八九十]+)(?:\s*\/\s*(\d+))?\s*(?:个|项|条|次)?\s*(工作流|workflows?|\bruns?\b|运行|作业|任务|检查|jobs?)/giu;

function mainCiText(notes) {
  const lines = [];
  let inMainCi = false;
  for (const line of notes.split(/\r?\n/u)) {
    if (reviewCiLabel.test(line)) {
      inMainCi = false;
      continue;
    }
    if (/^\s{0,3}#{1,6}\s/u.test(line)) inMainCi = false;
    if (mainCiLabel.test(line)) inMainCi = true;
    if (inMainCi) lines.push(line);
  }
  return lines.join("\n");
}

function countValue(value) {
  if (/^\d+$/u.test(value)) return Number(value);
  const digit = numeral => "零一二三四五六七八九".indexOf(numeral === "两" ? "二" : numeral);
  if (value.length === 1 && value !== "十") return digit(value);
  const [tens, units = "", ...rest] = value.split("十");
  if (rest.length || !value.includes("十") || tens.length > 1 || units.length > 1) return NaN;
  return 10 * (tens ? digit(tens) : 1) + (units ? digit(units) : 0);
}

function verifyMainCi(notes, main, ci) {
  const citedHeads = [...new Set([...notes.matchAll(mainShaLabel)].map(match => match[1].toLowerCase()))];
  const expectedRunIds = ci.workflows.map(row => String(row.databaseId));
  const scoped = mainCiText(notes);
  // GitHub run IDs are decimal. A modified ID cannot satisfy a full-token citation.
  const citedIds = new Set(scoped.match(/(?<![a-z0-9])\d{8,}(?![a-z0-9])/giu) ?? []);
  const citedRunIds = expectedRunIds.filter(id => citedIds.has(id));
  const complete = row => row.status === "completed" && row.conclusion === "success";
  const belongsToRun = (job, row) => job.workflow === row.workflowName && job.url.startsWith(row.url + "/job/");
  const archiveMatches = ci.main === main && expectedRunIds.length > 0 && ci.jobs.length > 0 &&
    new Set(expectedRunIds).size === expectedRunIds.length &&
    ci.workflows.every(row => row.headSha === main && row.headBranch === "main" && complete(row) &&
      row.url.endsWith("/actions/runs/" + row.databaseId) && ci.jobs.some(job => belongsToRun(job, row))) &&
    ci.jobs.every(job => complete(job) && ci.workflows.some(row => belongsToRun(job, row)));
  const reportedCountsMatch = [...scoped.matchAll(counts)].every(([, amount, total, unit]) => {
    const expected = /工作流|workflows?|runs?|运行/iu.test(unit) ? ci.workflows.length : ci.jobs.length;
    return countValue(amount) === expected && (total === undefined || Number(total) === expected);
  });
  return {
    pass: citedHeads.length === 1 && citedHeads[0] === main && archiveMatches &&
      citedRunIds.length === expectedRunIds.length && reportedCountsMatch,
    citedHeads, citedRunIds, expectedRunIds, archiveMatches, reportedCountsMatch,
    workflows: ci.workflows.length, jobs: ci.jobs.length,
  };
}

export function gradeRelease(text, original, paths, status, parent, { prior, merge, ci }) {
  const main = merge.merged;
  const notes = text.startsWith(original) ? text.slice(original.length) : "";
  const mainCi = verifyMainCi(notes, main, ci);
  const releaseClosed = /#303\b/u.test(notes) && merge.pr.state === "MERGED" && merge.pr.mergeCommit.oid === main &&
    /(?<!不|未)(?:可(?:以)?|应(?:当)?|已(?:经)?)结清|\brelease\s+(?:is\s+)?(?:closed|complete)\b/iu.test(notes);
  const mergeMethod = /\brebase\b/iu.test(notes) ? "REBASE_MENTIONED" : "REBASE_UNSTATED";
  return {
    schema: RELEASE_SCORE_SCHEMA,
    checks: {
      scopedCandidate: status === "" && parent === main && paths.length === 1 && paths[0] === RELEASE_REPORT && text.startsWith(original),
      releaseClosed,
      exactVersions: notes.includes(merge.approved) && notes.includes(main),
      treeEquivalence: notes.includes(merge.tree) && /一致|相同|等价|same|identical|equal/iu.test(notes),
      actualMainCi: mainCi.pass,
      originalVerdicts: notes.includes(prior.originalVerdicts.P) && notes.includes(prior.originalVerdicts.F),
      issue298RemainsBlocked: /#298/u.test(notes) && /第?\s*16\s*(?:笔|次|request)/iu.test(notes) &&
        /UNKNOWN/u.test(notes) && /1\/4/u.test(notes) && notes.includes(prior.continuation) &&
        /WAITING_FOR_ADMISSION|USAGE_UNCONFIRMED|待准入/u.test(notes),
    },
    mergeMethod,
    mainCi,
  };
}
