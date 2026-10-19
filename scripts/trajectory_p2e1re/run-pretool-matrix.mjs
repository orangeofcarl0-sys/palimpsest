/**
 * Trajectory-P2-E1RE §3.4 — THE FULL CASE MATRIX, AND THE BEFORE/AFTER RECORD.
 *
 * WHY A SEPARATE RUNNER. Each case starts a real first-party DSH host, so the matrix is expensive and must run
 * as one controlled sequence rather than inside a unit test. This runner executes every case and records, for
 * each one, the controlled input, the observation and the verdict.
 *
 * THE BEFORE COLUMN IS NOT RE-RUN. The pre-fix behaviour was measured on the parent commit and is recorded in
 * `pretool-first-party-falsifiers.json` under `beforeFix`, transcribed from that run's own output. Re-running
 * the vulnerable code would require reverting the fix, and a security stage should not do that to produce a
 * table. The `afterFix` column IS re-run here, every time, against the current code.
 *
 * Usage:  node scripts/trajectory_p2e1re/run-pretool-matrix.mjs [--json-out <path>]
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ARG_JSON_OUT = process.argv.includes("--json-out") ? process.argv[process.argv.indexOf("--json-out") + 1] : null;
const PROBE = join(REPO, "scripts", "trajectory_p2e1re", "pretool-probe.mjs");

/**
 * The cases from §3.4. `expectation` states what the CORRECTED host must do, so a regression is visible as a
 * mismatch rather than as a silently different verdict.
 */
const CASES = [
  { name: "world", controlled: "child cwd = the authorized world", expectation: "ALLOWED_NO_DELIVERY", why: "legitimate delegation must keep working" },
  { name: "sibling", controlled: "child cwd = a sibling world", expectation: "REFUSED_BY_GUARD", why: "another attempt's instructions must not be delivered" },
  { name: "protected", controlled: "child cwd = the simulated protected root", expectation: "REFUSED_BY_GUARD", why: "durable state must not be delivered" },
  /**
   * §3.4: "child cwd = the parent of a protected root". Before the fix this delivered nothing only because no
   * AGENTS.md happened to sit there — the read still happened, and the outcome depended on the FILE SYSTEM
   * rather than on authorization. The guard refuses it because the directory is outside the world, which is the
   * correct rule: a parent of a protected root is not the execution world either.
   */
  { name: "parentOfProtected", controlled: "child cwd = the parent of the protected root", expectation: "REFUSED_BY_GUARD", why: "outside the world; the pre-fix run read nothing only because no instruction file happened to exist there" },
  { name: "traversal", controlled: "child cwd = ../durable-state", expectation: "REFUSED_BY_GUARD", why: "relative traversal must resolve and then be refused" },
  { name: "production", controlled: "child cwd = the world inside .palimpsest/worlds", expectation: "ALLOWED_NO_DELIVERY", why: "the production layout must still delegate" },
];

/**
 * §3.3: THE PRE-FIX OBSERVATIONS, transcribed from the parent-commit run.
 *
 * These are recorded as MEASURED facts with their evidence class stated. They are the reason the fix exists: a
 * stage that only showed the fixed behaviour would not have established that a hazard existed.
 */
const BEFORE_FIX = {
  world: { verdict: "ALLOWED_NO_DELIVERY", canary: false, sibling: false, childSessions: 1, note: "the in-world case behaved correctly before the fix" },
  sibling: { verdict: "SIBLING_DELIVERED", canary: false, sibling: true, childSessions: 1, note: "the sibling world's AGENTS.md reached a user/message of the child session" },
  protected: { verdict: "DELIVERED", canary: true, sibling: false, childSessions: 1, note: "the protected canary reached a user/message of the child session before any guarded tool call" },
  parentOfProtected: { verdict: "ALLOWED_NO_DELIVERY", canary: false, sibling: false, childSessions: 1, note: "no AGENTS.md sat at the parent, so nothing foreign was read — an outcome that depended on the FILE SYSTEM rather than on authorization; the corrected host refuses the directory outright" },
  traversal: { verdict: "DELIVERED", canary: true, sibling: false, childSessions: 1, note: "a relative ../durable-state reached the protected canary" },
  production: { verdict: "ALLOWED_NO_DELIVERY", canary: false, sibling: false, childSessions: 1, note: "the production layout behaved correctly because the world is inside the protected root" },
};

const runCase = (name) => {
  const started = Date.now();
  const result = spawnSync(process.execPath, [PROBE, "--case", name], { cwd: REPO, encoding: "utf8", timeout: 600_000, maxBuffer: 64 * 1024 * 1024 });
  const stdout = typeof result.stdout === "string" ? result.stdout : "";
  let payload = null;
  const brace = stdout.indexOf("{");
  if (brace >= 0) {
    try {
      payload = JSON.parse(stdout.slice(brace));
    } catch {
      payload = null;
    }
  }
  return { name, exitCode: result.status, elapsedMs: Date.now() - started, payload };
};

const cases = [];
for (const spec of CASES) {
  process.stderr.write(`\n=== ${spec.name} ===\n`);
  const run = runCase(spec.name);
  const observed = run.payload;
  const after = observed?.verdict ?? "PROBE_FAILED";
  cases.push({
    name: spec.name,
    controlled: spec.controlled,
    why: spec.why,
    expectation: spec.expectation,
    beforeFix: BEFORE_FIX[spec.name] ?? null,
    afterFix: {
      verdict: after,
      exitCode: run.exitCode,
      elapsedMs: run.elapsedMs,
      childSessionCount: observed?.observations?.childSessionCount ?? null,
      refusalObserved: observed?.observations?.refusalObserved ?? null,
      refusalDetail: observed?.observations?.refusalDetail ?? null,
      canaryDelivered: observed?.observations?.canaryDelivered ?? null,
      siblingTokenDelivered: observed?.observations?.siblingTokenDelivered ?? null,
      canaryEventTypes: observed?.observations?.canaryEventTypes ?? null,
      workerOutcome: observed?.observations?.workerResultLine ?? null,
      cleanupOk: observed?.ownedRootRemoved === true,
    },
    /** The case passes when the observed verdict is the expected one. A different verdict is reported, not hidden. */
    matchesExpectation: after === spec.expectation,
  });
}

const report = {
  schemaVersion: 1,
  kind: "TRAJECTORY_P2E1RE_PRETOOL_FALSIFIERS",
  stage: "Trajectory-P2-E1RE",
  evidenceClass: "DYNAMICALLY_VERIFIED",
  note: "The afterFix column was re-run against the current code for this artifact. The beforeFix column is transcribed from the parent-commit run and is the reason the fix exists; it was not re-measured, because re-running the vulnerable code would require reverting the repair.",
  cases,
  summary: {
    total: cases.length,
    matched: cases.filter((entry) => entry.matchesExpectation).length,
    mismatched: cases.filter((entry) => !entry.matchesExpectation).map((entry) => ({ name: entry.name, expected: entry.expectation, observed: entry.afterFix.verdict })),
    leakedBeforeFix: cases.filter((entry) => entry.beforeFix?.verdict === "DELIVERED" || entry.beforeFix?.verdict === "SIBLING_DELIVERED").map((entry) => entry.name),
    leakedAfterFix: cases.filter((entry) => entry.afterFix.canaryDelivered === true || entry.afterFix.siblingTokenDelivered === true).map((entry) => entry.name),
  },
};
report.summary.noLeakAfterFix = report.summary.leakedAfterFix.length === 0;
report.summary.allCasesClosed = report.summary.mismatched.length === 0 && report.summary.noLeakAfterFix;

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (ARG_JSON_OUT !== null) {
  mkdirSync(dirname(resolve(ARG_JSON_OUT)), { recursive: true });
  writeFileSync(resolve(ARG_JSON_OUT), `${JSON.stringify(report, null, 2)}\n`);
}
process.exit(report.summary.allCasesClosed ? 0 : 1);
