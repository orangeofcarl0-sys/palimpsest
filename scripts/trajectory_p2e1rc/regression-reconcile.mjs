/**
 * Trajectory-P2-E1RC §6 — REGRESSION RECONCILIATION (C4).
 *
 * WHAT E1R GOT WRONG (C1-F8). `regression-reconcile.mjs` classified EVERY failure in the HEAD report as
 * `PRE_EXISTING_SAME_FAILURE` by construction, initialised `newlyIntroduced = 0` and `unresolved = 0`, hard-
 * coded the contention list, and "proved" uniqueness with the tautology `preExisting === matrix.length`.
 * A reconciler that cannot produce a different answer is not an audit.
 *
 * THIS RECONCILER IS COMPUTED FROM THE ACTUAL REPORTS.
 *
 *   · identity is a stable compound key: `<normalized relative path>::<full test title>`;
 *   · a failure is `PRE_EXISTING_SAME_FAILURE` ONLY if the SAME key failed in the BASELINE report;
 *   · a HEAD failure absent from the baseline is `NEW_REGRESSION`;
 *   · a baseline failure absent from HEAD is `RESOLVED_FAILURE`;
 *   · an isolation run that PASSES supports `ENVIRONMENT_SENSITIVE`, but only for a key that failed in HEAD;
 *   · anything left is `UNRESOLVED`;
 *   · missing reports reduce the verdict to `PARTIALLY_RECONCILED` or `UNRESOLVED` rather than silently passing.
 *
 * Usage:  node scripts/trajectory_p2e1rc/regression-reconcile.mjs --baseline <json> --head <json> [--isolation <json>]... [--exclude <testfile>]...
 */
import { existsSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";

const argv = process.argv.slice(2);
const valuesOf = (flag) => argv.reduce((acc, token, index) => (token === flag ? [...acc, argv[index + 1]] : acc), []);
const BASELINE_REPORTS = valuesOf("--baseline");
const HEAD_REPORTS = valuesOf("--head");
const ISOLATION_REPORTS = valuesOf("--isolation");
const EXCLUSIONS = valuesOf("--exclude");

const readReport = (path) => {
  if (!existsSync(path)) return { ok: false, reason: `report not found: ${path}` };
  try {
    return { ok: true, report: JSON.parse(readFileSync(path, "utf8")) };
  } catch (error) {
    return { ok: false, reason: `report is not valid JSON: ${path}: ${error instanceof Error ? error.message : String(error)}` };
  }
};

/** §6.1: normalize Windows and POSIX paths to a repo-relative, forward-slash form. */
const normalizeFile = (name) => {
  const rel = relative(process.cwd(), resolve(String(name))).split("\\").join("/");
  return rel.startsWith("..") ? String(name).split("\\").join("/") : rel;
};

/** §6.1: the stable compound identity. */
const identityOf = (file, title) => `${normalizeFile(file)}::${title}`;

/** Every failed (and passed) assertion in a vitest JSON report, keyed by compound identity. */
function assertionsOf(report) {
  const failed = new Map();
  const passed = new Map();
  for (const suite of report.testResults ?? []) {
    const file = suite.name;
    for (const assertion of suite.assertionResults ?? []) {
      const key = identityOf(file, assertion.fullName ?? assertion.title ?? "(unnamed)");
      const record = { key, file: normalizeFile(file), title: assertion.fullName ?? assertion.title ?? "(unnamed)", status: assertion.status };
      if (assertion.status === "failed") failed.set(key, record);
      if (assertion.status === "passed") passed.set(key, record);
    }
  }
  return { failed, passed };
}

const collected = { baseline: [], head: [], isolation: [], problems: [] };
for (const path of BASELINE_REPORTS) {
  const read = readReport(path);
  if (read.ok) collected.baseline.push({ path, report: read.report });
  else collected.problems.push(`baseline: ${read.reason}`);
}
for (const path of HEAD_REPORTS) {
  const read = readReport(path);
  if (read.ok) collected.head.push({ path, report: read.report });
  else collected.problems.push(`head: ${read.reason}`);
}
for (const path of ISOLATION_REPORTS) {
  const read = readReport(path);
  if (read.ok) collected.isolation.push({ path, report: read.report });
  else collected.problems.push(`isolation: ${read.reason}`);
}

const baselineFailed = new Map();
for (const entry of collected.baseline) for (const [key, value] of assertionsOf(entry.report).failed) baselineFailed.set(key, value);
const headFailed = new Map();
for (const entry of collected.head) for (const [key, value] of assertionsOf(entry.report).failed) headFailed.set(key, value);
/** An isolation PASS for a key means that test succeeds when run alone. */
const isolationPassed = new Set();
const isolationFailed = new Set();
for (const entry of collected.isolation) {
  const assertions = assertionsOf(entry.report);
  for (const key of assertions.passed.keys()) isolationPassed.add(key);
  for (const key of assertions.failed.keys()) isolationFailed.add(key);
}

const excluded = new Set(EXCLUSIONS.map((file) => normalizeFile(file)));

/** §6.3: classification is COMPUTED. Each HEAD failure gets exactly one class. */
const classifications = [];
for (const [key, failure] of headFailed) {
  if (excluded.has(failure.file)) {
    classifications.push({ ...failure, classification: "EXCLUDED_UNSAFE", why: "excluded by an explicit --exclude; its result is not counted as green" });
    continue;
  }
  if (baselineFailed.has(key)) {
    classifications.push({ ...failure, classification: "PRE_EXISTING_SAME_FAILURE", why: "the same compound identity failed in the baseline report" });
    continue;
  }
  if (isolationPassed.has(key)) {
    classifications.push({ ...failure, classification: "ENVIRONMENT_SENSITIVE", why: "absent from the baseline report but PASSES when run in isolation; classified as environment-sensitive, which does not prove a causal mechanism" });
    continue;
  }
  classifications.push({ ...failure, classification: "NEW_REGRESSION", why: "absent from the baseline report and not shown to pass in isolation" });
}
for (const [key, failure] of baselineFailed) {
  if (headFailed.has(key) || excluded.has(failure.file)) continue;
  classifications.push({ ...failure, classification: "RESOLVED_FAILURE", why: "failed in the baseline report and does not fail in HEAD" });
}
/** §6.3: anything neither classified nor explained stays UNRESOLVED. */
for (const entry of classifications) {
  if (entry.classification === "NEW_REGRESSION" && isolationFailed.has(entry.key)) {
    entry.classification = "UNRESOLVED";
    entry.why = "absent from baseline, and it ALSO fails in isolation, so environment sensitivity does not explain it";
  }
}

const counts = classifications.reduce((acc, entry) => {
  acc[entry.classification] = (acc[entry.classification] ?? 0) + 1;
  return acc;
}, {});

/** §6.3: real set membership, not a tautology. */
const headFailureKeys = new Set([...headFailed.keys()].filter((key) => !excluded.has(headFailed.get(key).file)));
const classifiedKeys = new Set(classifications.filter((entry) => entry.classification !== "RESOLVED_FAILURE").map((entry) => entry.key));
const everyHeadFailureClassifiedOnce = headFailureKeys.size === classifiedKeys.size && [...headFailureKeys].every((key) => classifiedKeys.has(key));

/** §6.4: the verdict STRENGTH depends on what evidence was actually available. */
const haveBaseline = collected.baseline.length > 0;
const haveHead = collected.head.length > 0;
const unresolved = counts.UNRESOLVED ?? 0;
const newRegressions = counts.NEW_REGRESSION ?? 0;
const verdict = !haveHead
  ? "UNRESOLVED"
  : !haveBaseline
    ? "PARTIALLY_RECONCILED"
    : unresolved > 0 || newRegressions > 0 || collected.problems.length > 0
      ? "PARTIALLY_RECONCILED"
      : "SCOPED_RECONCILED";

const report = {
  schemaVersion: 1,
  kind: "TRAJECTORY_P2E1RC_REGRESSION_RECONCILIATION",
  stage: "Trajectory-P2-E1RC",
  method: "computed from the supplied vitest JSON reports; no classification is predeclared",
  inputs: {
    baselineReports: collected.baseline.map((entry) => entry.path),
    headReports: collected.head.map((entry) => entry.path),
    isolationReports: collected.isolation.map((entry) => entry.path),
    exclusions: [...excluded],
    problems: collected.problems,
  },
  totals: {
    baselineFailures: baselineFailed.size,
    headFailures: headFailed.size,
    isolationPassed: isolationPassed.size,
    isolationFailed: isolationFailed.size,
  },
  counts,
  everyHeadFailureClassifiedExactlyOnce: everyHeadFailureClassifiedOnce,
  classifications,
  verdict,
  scopeCaveat: "this verdict covers the test files whose reports were supplied; it is NOT a whole-repository regression qualification",
  unsafeExclusionsPreserved: [...excluded],
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
process.exit(verdict === "SCOPED_RECONCILED" ? 0 : 1);
