/**
 * Trajectory-P2-E1RF §4.5 — THE DELEGATION CASE MATRIX (real first-party DSH, one process per case).
 *
 * Each case is a separate `delegation-probe.mjs` invocation with its own test-owned root, so a case cannot
 * contaminate another's sessions. The matrix is what makes the claim checkable: every case must reach the
 * verdict it is SUPPOSED to reach, and no case may deliver an unauthorized token.
 *
 * THE TWO FACTS ARE KEPT SEPARATE (§4.5): "the guard refused" and "nothing was delivered" are different
 * observations, and a case that refused but still leaked would be a security failure with a passing refusal.
 *
 * Usage:  node scripts/trajectory_p2e1rf/run-delegation-matrix.mjs [--json-out <path>]
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ARG_JSON_OUT = process.argv.includes("--json-out") ? process.argv[process.argv.indexOf("--json-out") + 1] : null;
const RUN = process.env.P2E1RF_RUN_DIR ?? join(REPO, "research-evidence", "trajectory-p2e1rf", ".run");
mkdirSync(RUN, { recursive: true });

const git = (args) => {
  try {
    return execFileSync("git", args, { cwd: REPO, encoding: "utf8" }).trim();
  } catch {
    return null;
  }
};

/** The cases and the verdict each MUST reach. A refusal is not a failure; a delivery is. */
const CASES = [
  { name: "aliasToWorld", expect: "REFUSED_BY_GUARD", why: "RF-A: a junction whose current target is the world" },
  { name: "aliasToProtected", expect: "REFUSED_BY_GUARD", why: "RF-A: a junction to a protected root" },
  { name: "world", expect: "ALLOWED_NO_DELIVERY", why: "legitimate in-world delegation must still work" },
  { name: "sibling", expect: "REFUSED_BY_GUARD", why: "a sibling attempt world" },
  { name: "protected", expect: "REFUSED_BY_GUARD", why: "the simulated durable state" },
  { name: "parentOfProtected", expect: "REFUSED_BY_GUARD", why: "the parent of the protected root" },
  { name: "traversal", expect: "REFUSED_BY_GUARD", why: "relative traversal out of the world" },
  { name: "production", expect: "ALLOWED_NO_DELIVERY", why: "the real deployment layout" },
];

const rows = [];
for (const entry of CASES) {
  const out = join(RUN, `delegation-${entry.name}.json`);
  process.stderr.write(`\n=== ${entry.name} (${entry.why}) ===\n`);
  const started = Date.now();
  const run = spawnSync(process.execPath, [join(REPO, "scripts", "trajectory_p2e1rf", "delegation-probe.mjs"), "--case", entry.name, "--json-out", out], {
    cwd: REPO,
    encoding: "utf8",
    timeout: 900_000,
    maxBuffer: 64 * 1024 * 1024,
  });
  let probe = null;
  try {
    probe = JSON.parse(readFileSync(out, "utf8"));
  } catch {
    probe = null;
  }
  rows.push({
    case: entry.name,
    why: entry.why,
    expectedVerdict: entry.expect,
    verdict: probe?.verdict ?? "NO_OUTPUT",
    exitCode: run.status,
    elapsedMs: Date.now() - started,
    matched: probe?.verdict === entry.expect,
    /* --- the SECURITY facts, separate from the verdict --------------------------------------------- */
    canaryDelivered: probe?.observations?.canaryDelivered === true,
    siblingTokenDelivered: probe?.observations?.siblingTokenDelivered === true,
    childSessionCreated: probe?.observations?.childSessionCreated === true,
    refusalObserved: probe?.observations?.refusalObserved === true,
    sessionCount: (probe?.observations?.sessionIds ?? []).length,
    /* --- hygiene ----------------------------------------------------------------------------------- */
    cleanup: probe?.cleanup ?? null,
    ownedRootRemoved: probe?.ownedRootRemoved === true,
    fixtureLimit: probe?.fixtureLimit ?? null,
    error: probe?.error ?? null,
  });
}

/**
 * THE CLOSURE PREDICATE.
 *
 *   · every case matched its expected verdict;
 *   · NO case delivered an unauthorized token (this is checked independently of the verdict, because a case
 *     that "expected" a refusal could otherwise be recorded as closed while leaking);
 *   · every refused case created no child session — the ordering claim, not just the decision;
 *   · every case cleaned up its owned root.
 */
const leaked = rows.filter((row) => row.canaryDelivered || row.siblingTokenDelivered);
const mismatched = rows.filter((row) => !row.matched);
const refusedWithChild = rows.filter((row) => row.expectedVerdict === "REFUSED_BY_GUARD" && row.childSessionCreated);
const cleanupFailed = rows.filter((row) => !row.ownedRootRemoved);
const limits = rows.filter((row) => row.fixtureLimit !== null);

const summary = {
  total: rows.length,
  matched: rows.length - mismatched.length,
  mismatched: mismatched.map((row) => row.case),
  leaked: leaked.map((row) => row.case),
  refusedWithChild: refusedWithChild.map((row) => row.case),
  cleanupFailed: cleanupFailed.map((row) => row.case),
  limits: limits.map((row) => ({ case: row.case, why: row.fixtureLimit })),
  noLeak: leaked.length === 0,
  allCasesClosed: mismatched.length === 0 && leaked.length === 0 && refusedWithChild.length === 0 && cleanupFailed.length === 0,
};

const report = {
  schemaVersion: 1,
  kind: "TRAJECTORY_P2E1RF_DELEGATION_MATRIX",
  stage: "Trajectory-P2-E1RF",
  evidenceClass: "FIRST_PARTY_DSH_VERIFIED",
  note: "One real first-party DSH process per case, each with its own test-owned root. The verdict and the delivery facts are recorded separately.",
  executedCodeHead: git(["rev-parse", "HEAD"]),
  executedCodeTree: git(["rev-parse", "HEAD^{tree}"]),
  runtime: { node: process.versions.node, executable: process.execPath, platform: process.platform },
  runDirectory: RUN,
  cases: rows,
  summary,
};

const emitted = `${JSON.stringify(report, null, 2)}\n`;
process.stdout.write(emitted);
if (ARG_JSON_OUT !== null) {
  mkdirSync(dirname(resolve(ARG_JSON_OUT)), { recursive: true });
  writeFileSync(resolve(ARG_JSON_OUT), emitted, "utf8");
}
process.stderr.write(`\n${String(summary.matched)}/${String(summary.total)} matched · leaked ${JSON.stringify(summary.leaked)} · limits ${JSON.stringify(summary.limits)}\n`);
process.exit(summary.allCasesClosed ? 0 : 1);
