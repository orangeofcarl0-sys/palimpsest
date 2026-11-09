/** The scenario and the independent, host-only business checks. This module is never mounted. */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const BASE = "112a7b50c25639ec5586afd170e9f7f311c561ba";
export const START = "2026-11-05";
export const BULLETIN = "updates/2026-11-06/hf-capacity-correction.csv";
export const CORRECTION = "model,site,capacity_kw,condition\nS-1080,HF,600,max +42 C\n";
export const DELIVERABLES = ["technical-capacity.md", "vendor-compliance.md", "cost-model.json", "schedule.md", "risk-review.md", "recommendation.md"]
  .map(name => `deliverables/${name}`);
export const CERTIFICATES = DELIVERABLES[1];
export const REVISION_PATHS = DELIVERABLES.filter(path => path !== CERTIFICATES);
export const SUMMARY = "deliverables/procurement-review.md";
export const ACCEPTANCE = "acceptance.json";
export const PROMPTS = Object.freeze({
  T1: "Use the project materials to complete the initial deployment decision package for both sites. Deliver a committed version I can review. This is a planning exercise and does not authorize purchases.",
  T2: "New material has arrived in this project. Have a separate executor revise the affected work in an isolated copy, keep what is still valid, and leave a committed candidate for my approval. Keep the accepted package available until I approve the candidate.",
  T3: "Use the accepted revision of this project to deliver a one-page procurement review. Include each site's configuration, the changes in cost and timing, and the decisions that still require approval. Commit the review without making any purchase.",
});

export const readJson = path => JSON.parse(readFileSync(path, "utf8"));
export const writeJson = (path, value) => writeFileSync(path, JSON.stringify(value, null, 2) + "\n");
export const digest = value => createHash("sha256").update(value).digest("hex");
export const sha = value => typeof value === "string" && /^[0-9a-f]{40}$/u.test(value);
export const git = (repo, ...args) => execFileSync("git", ["-c", "safe.directory=*", "-C", repo, ...args], {
  encoding: "utf8", maxBuffer: 16 * 1024 * 1024, timeout: 30000,
}).trim();
export const blob = (repo, commit, path) => git(repo, "rev-parse", "--verify", `${commit}:${path}`);
export const head = repo => git(repo, "rev-parse", "HEAD");
export const clean = repo => git(repo, "status", "--porcelain", "--untracked-files=all") === "";
export const descendant = (repo, base, target) => git(repo, "merge-base", base, target) === base;
export const changed = (repo, base, target) => git(repo, "diff", "--no-renames", "--name-only", "-z", base, target, "--").split("\0").filter(Boolean);
export function assert(condition, reason) { if (!condition) throw new Error(reason); }

export function commitAll(repo, message) {
  git(repo, "add", "--all");
  git(repo, "commit", "--quiet", "-m", message);
  return head(repo);
}

export function configureGit(repo) {
  git(repo, "config", "user.name", "Energy experiment");
  git(repo, "config", "user.email", "energy-experiment@example.invalid");
  git(repo, "config", "core.autocrlf", "false");
  git(repo, "config", "core.filemode", "false");
  git(repo, "config", "commit.gpgsign", "false");
}

// The public check validates the file contract. Business selection is recomputed outside the executor.
const PUBLIC_CHECK = `import { readFileSync, existsSync } from 'node:fs';
const paths = ${JSON.stringify(DELIVERABLES)};
let count = 0;
for (const path of paths) {
  if (!existsSync(path)) {
    if (process.argv.includes('--final')) throw Error('missing ' + path);
    continue;
  }
  const text = readFileSync(path, 'utf8');
  const json = path.endsWith('.json') ? text : /<!-- data:start -->\\s*\`\`\`json\\s*([\\s\\S]*?)\`\`\`\\s*<!-- data:end -->/u.exec(text)?.[1];
  if (!json) throw Error('missing data block in ' + path);
  JSON.parse(json);
  count++;
}
console.log('format check passed for ' + count + ' deliverables');
`;

export function makeSeed(repo, fixture) {
  mkdirSync(repo, { recursive: true });
  cpSync(join(fixture, "sources"), join(repo, "sources"), { recursive: true });
  cpSync(join(fixture, "package.json"), join(repo, "package.json"));
  writeFileSync(join(repo, ".gitignore"), ".palimpsest/\n/acceptance.json\n");
  writeFileSync(join(repo, "README.md"), "# Two-site energy deployment\n\nSee TASK.md and the site and vendor sources.\n");
  writeFileSync(join(repo, "TASK.md"), `# Two-site energy deployment\n\nUse the site, capacity, certificate, pricing and lead-time sources to choose the lowest landed cost among eligible configurations. Use ${START} as the common planning start and quote date. Include the non-current certificate and other unresolved risks. Keep the sources unchanged. A dated correction in updates/ replaces only the source fields it explicitly identifies.\n\nProduce these files under deliverables/. Use the following JSON keys, and include the evidence and reasoning in the Markdown prose. In Markdown, enclose the JSON block between <!-- data:start --> and <!-- data:end -->.\n\n- technical-capacity.md: {sites: [{site,model}]}, including the deciding constraint and source.\n- vendor-compliance.md: {vendors: [{model,certificate}]}, with CURRENT or EXPECTED_NOT_CURRENT. Keep this certificate record separate from configuration choices.\n- cost-model.json: {lines: [{site,model,unitPrice,freight,lineTotal}],total}.\n- schedule.md: {start,installs: [{site,model,leadWeeks,installStart,commission}]}, using YYYY-MM-DD and start plus vendor lead weeks.\n- risk-review.md: {risks: [{statement,source}]}.\n- recommendation.md: {north,harbor,totalUsd,corridorMm}, including the binding sources.\n\nRun node check.mjs --final to check format. Keep unaffected deliverables and facts when revising. Stage only candidate deliverables for review, and leave approvals to the project owner.\n\nIf asked for a procurement review, write deliverables/procurement-review.md with a short prose review and a data block containing {north,harbor,previousTotalUsd,totalUsd,previousHarborLeadWeeks,harborLeadWeeks,approvedHead,pendingApprovals}. The owner provides the accepted HEAD in acceptance.json.\n`);
  writeFileSync(join(repo, "check.mjs"), PUBLIC_CHECK);
  git(repo, "init", "-q");
  configureGit(repo);
  // Make the single seed object once, then copy it for both arms.
  return commitAll(repo, "Initialize two-site deployment sources");
}

export function injectCorrection(repo) {
  mkdirSync(join(repo, "updates", "2026-11-06"), { recursive: true });
  writeFileSync(join(repo, BULLETIN), CORRECTION, { flag: "wx" });
  return commitAll(repo, "Record supplier capacity correction for Harbor Flats");
}

export function dataBlock(text) {
  const match = /<!-- data:start -->\s*```json\s*([\s\S]*?)```\s*<!-- data:end -->/u.exec(text);
  assert(match !== null, "DATA_BLOCK_MISSING");
  return JSON.parse(match[1]);
}

const SITE_LABELS = { NR: "NR", "North Ridge": "NR", HF: "HF", "Harbor Flats": "HF" };

export function normalizeSiteRows(rows) {
  assert(Array.isArray(rows) && rows.length === 2 && rows.every(row => Object.hasOwn(SITE_LABELS, row?.site)), "SITE_ROWS_UNKNOWN_OR_INCOMPLETE");
  const normalized = rows.map(row => ({ ...row, site: SITE_LABELS[row.site] }));
  assert(new Set(normalized.map(row => row.site)).size === 2, "SITE_ROWS_DUPLICATE");
  return normalized;
}

function normalizeScoringCopies(output) {
  const normalizations = [];
  for (const [path, key] of [[DELIVERABLES[0], "sites"], [DELIVERABLES[2], "lines"], [DELIVERABLES[3], "installs"]]) {
    const file = join(output, path);
    const text = readFileSync(file, "utf8");
    const data = path.endsWith(".json") ? JSON.parse(text) : dataBlock(text);
    const rows = normalizeSiteRows(data[key]);
    const changedLabels = rows.flatMap((row, index) => row.site === data[key][index].site ? [] : [{ from: data[key][index].site, to: row.site }]);
    if (!changedLabels.length) continue;
    normalizations.push({ path, changedLabels });
    const json = JSON.stringify({ ...data, [key]: rows }, null, 2);
    writeFileSync(file, path.endsWith(".json") ? json + "\n" : text.replace(
      /(<!-- data:start -->\s*```json\s*)[\s\S]*?(\s*```\s*<!-- data:end -->)/u,
      (_block, start, end) => start + json + end,
    ));
  }
  return normalizations;
}

function approvedPaths(repo, commit, allowed) {
  const paths = git(repo, "ls-tree", "-r", "-z", commit, "--", ...allowed).split("\0").filter(Boolean);
  assert(paths.length === allowed.length && paths.every(line => /^100644 blob [0-9a-f]{40}\t/u.test(line)), "ARTIFACT_MISSING_OR_NOT_REGULAR");
  return Object.fromEntries(allowed.map(path => [path, blob(repo, commit, path)]));
}

export function checkPackage({ repo, commit, basis, first, fixture, output }) {
  assert(sha(commit) && sha(basis) && commit !== basis && descendant(repo, basis, commit), "PACKAGE_BASIS_MISMATCH");
  const diff = changed(repo, basis, commit);
  const scope = first ? REVISION_PATHS : DELIVERABLES;
  assert(diff.length === scope.length && diff.every(path => scope.includes(path)), "PACKAGE_SCOPE_MISMATCH");
  const artifacts = approvedPaths(repo, commit, DELIVERABLES);
  mkdirSync(output);
  cpSync(join(fixture, "sources"), join(output, "sources"), { recursive: true });
  cpSync(join(fixture, "check.mjs"), join(output, "check.mjs"));
  mkdirSync(join(output, "deliverables"));
  for (const path of DELIVERABLES) writeFileSync(join(output, path), git(repo, "show", `${commit}:${path}`) + "\n");
  const normalizations = normalizeScoringCopies(output);
  if (first) {
    assert(artifacts[CERTIFICATES] === blob(repo, first, CERTIFICATES), "CERTIFICATE_ARTIFACT_REWRITTEN");
    assert(git(repo, "show", `${basis}:${BULLETIN}`) === CORRECTION.trim(), "CORRECTION_CONTENT_MISMATCH");
    const capacity = join(output, "sources/capacity.csv");
    const original = readFileSync(capacity, "utf8");
    const corrected = original.replace("S-1080,HF,900,max +42 C", CORRECTION.trim().split("\n")[1]);
    assert(corrected !== original, "CORRECTION_DID_NOT_APPLY");
    writeFileSync(capacity, corrected);
    const risk = dataBlock(readFileSync(join(output, DELIVERABLES[4]), "utf8"));
    assert(risk.risks?.some(entry => String(entry.source).includes("hf-capacity-correction.csv")), "CORRECTION_RISK_SOURCE_MISSING");
    for (const path of [DELIVERABLES[0], DELIVERABLES[5]]) {
      assert(readFileSync(join(output, path), "utf8").includes("hf-capacity-correction.csv"), "CORRECTION_PROVENANCE_MISSING");
    }
  }
  const schedule = dataBlock(readFileSync(join(output, DELIVERABLES[3]), "utf8"));
  assert(schedule.start === START, "PLANNING_START_DRIFT");
  const firstNorth = first && normalizeSiteRows(dataBlock(git(repo, "show", `${first}:${DELIVERABLES[3]}`)).installs).find(entry => entry.site === "NR");
  if (firstNorth) {
    const north = schedule.installs.find(entry => entry.site === "NR");
    assert(north?.installStart === firstNorth.installStart && north.commission === firstNorth.commission, "UNAFFECTED_NORTH_SCHEDULE_DRIFT");
  }
  const verifier = execFileSync(process.execPath, [join(output, "check.mjs"), "--final"], { cwd: output, encoding: "utf8", timeout: 10000 }).trim();
  const recommendation = dataBlock(readFileSync(join(output, DELIVERABLES[5]), "utf8"));
  return { passed: true, commit, basis, tree: git(repo, "rev-parse", `${commit}^{tree}`), artifacts, changedPaths: diff, recommendation, schedule, normalizations, verifier };
}

export function checkReview({ repo, commit, accepted }) {
  assert(sha(commit) && sha(accepted) && commit !== accepted && descendant(repo, accepted, commit), "REVIEW_BASIS_MISMATCH");
  const diff = changed(repo, accepted, commit);
  assert(diff.length === 1 && diff[0] === SUMMARY, "REVIEW_SCOPE_MISMATCH");
  const artifacts = approvedPaths(repo, commit, [SUMMARY]);
  const text = git(repo, "show", `${commit}:${SUMMARY}`);
  const data = dataBlock(text);
  assert(data.north === "K-900" && data.harbor === "K-900" && data.previousTotalUsd === 485000 && data.totalUsd === 536000 &&
    data.previousHarborLeadWeeks === 9 && data.harborLeadWeeks === 14 && data.approvedHead === accepted &&
    Array.isArray(data.pendingApprovals) && data.pendingApprovals.some(entry => /purchase|procurement|order|budget/iu.test(entry)) &&
    text.split("<!-- data:start -->")[0].trim().length > 100 && text.includes("hf-capacity-correction.csv"), "REVIEW_CONTENT_MISMATCH");
  return { passed: true, commit, basis: accepted, artifacts, data };
}

export function acceptanceOf(path) { return existsSync(path) ? readJson(path) : null; }
