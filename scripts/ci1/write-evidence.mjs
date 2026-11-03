/**
 * Palimpsest-CI1 §18 — EVIDENCE MANIFEST.
 *
 * A COMPACT, INDEPENDENTLY REPRODUCIBLE SET. The ruling forbids a large duplicate copy of existing runtime histories,
 * so this producer records IDENTITIES and VERDICTS, not artefacts: the commit and tree SHAs, the test selection and
 * its per-file results, the protected-asset counts, and the specific limitations the stage carries forward.
 *
 * WHAT IT DOES NOT DO. It does not run the tests. A test result read from a file this producer also wrote would be a
 * self-report. The runner's exit codes are supplied by the caller, from runs that actually happened, and the
 * producer records them as EXTERNAL INPUTS so the provenance is visible in the document itself.
 *
 * Usage:
 *   node scripts/ci1/write-evidence.mjs --json=<path> --selection=<file> \
 *     --ci1-exit=<n> --ci1-tests=<n> --ci1-files=<n> --ci1-passed=<n>
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/u, "").split("=");
    return [key, rest.join("=")];
  }),
);

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const git = (argv) => execFileSync("git", argv, { cwd: REPO, encoding: "utf8" }).trim();

const findings = {};
const record = (key, value) => {
  findings[key] = value;
  process.stderr.write(`  · ${key}: ${JSON.stringify(value)}\n`);
};

const HEAD = git(["rev-parse", "HEAD"]);
const HEAD_TREE = git(["rev-parse", "HEAD^{tree}"]);

const E4 = {
  codeFreeze: "05aa9d2250906b3a70fabd38a1fe180becdbd698",
  codeTree: "cfcaaf75ca2c0e1bec02a58910f737716f875be7",
  evidenceFreeze: "95ce9b843948085f7a02fa86f62e867300440fc1",
  evidenceTree: "954a6be45d10e866f8f1a36d4ca69448e1eb9127",
};

/* ------------------------------------------------------------------ *
 * A — BASELINE
 * ------------------------------------------------------------------ */

record("baseline", {
  ci1Branch: git(["rev-parse", "--abbrev-ref", "HEAD"]),
  parent: E4.evidenceFreeze,
  parentTree: E4.evidenceTree,
  head: HEAD,
  headTree: HEAD_TREE,
  runtime: "0.2.1-rc.3",
  changedPaths: git(["diff", "--name-status", E4.evidenceFreeze, HEAD])
    .split("\n")
    .filter((line) => line.length > 0),
});

/* ------------------------------------------------------------------ *
 * B — PROTECTED ASSETS
 * ------------------------------------------------------------------ */

const protectedTrees = git(["ls-tree", "-d", "--name-only", HEAD, "research-evidence/"])
  .split("\n")
  .filter((line) => line.length > 0);
const worktrees = git(["worktree", "list", "--porcelain"])
  .split("\n")
  .filter((line) => line.startsWith("worktree "));

record("protectedAssets", {
  evidenceTrees: protectedTrees.length,
  worktreesRegistered: worktrees.length,
  historicalWorktreePresent: existsSync(join(REPO, "..", "r3lcfsh-worktree-SMlvwB")) || git(["branch", "--list", "r3lcfsh-worktree-SMlvwB"]).length > 0,
  /** The gate root is read from disk, never assumed. */
  gateRoot: (() => {
    const root = join(process.env.USERPROFILE ?? process.env.HOME ?? "", ".palimpsest-gates");
    if (!existsSync(root)) return { path: root.replace(/\\/gu, "/"), entries: null, present: false };
    const entries = execFileSync(process.execPath, ["-e", `process.stdout.write(String(require("node:fs").readdirSync(${JSON.stringify(root)}).length))`], { encoding: "utf8" });
    return { path: root.replace(/\\/gu, "/"), entries: Number(entries), present: true };
  })(),
});

/* ------------------------------------------------------------------ *
 * C — CI1 TEST RESULTS (external inputs)
 * ------------------------------------------------------------------ */

const selectionFile = args.get("selection");
const selection = selectionFile === undefined ? null : readFileSync(resolve(selectionFile), "utf8").split("\n").filter((line) => line.trim().length > 0);

record("ci1Tests", {
  /**
   * THESE NUMBERS ARE EXTERNAL INPUTS, RECORDED WITH THEIR PROVENANCE.
   *
   * The producer cannot verify them without re-running, and re-running here would make the evidence a second run
   * rather than a record of the accepted one. So they are labelled `source: CALLER_SUPPLIED` and the runner exit code
   * is carried alongside, because a pass count with a nonzero exit is not a pass.
   */
  source: "CALLER_SUPPLIED_FROM_ACTUAL_RUNS",
  files: [
    "test/ci1_two_owner_causal.test.ts",
    "test/ci1_causal_oracle.test.ts",
    "test/ci1_dependency_staleness.test.ts",
    "test/ci1_stale_and_duplicate.test.ts",
    "test/ci1_bounded_synthesis.test.ts",
  ],
  combinedRun: {
    exitCode: args.has("ci1-exit") ? Number(args.get("ci1-exit")) : null,
    tests: args.has("ci1-tests") ? Number(args.get("ci1-tests")) : null,
    passed: args.has("ci1-passed") ? Number(args.get("ci1-passed")) : null,
    files: args.has("ci1-files") ? Number(args.get("ci1-files")) : null,
  },
  selectionFile: selectionFile ?? null,
  selectionSize: selection === null ? null : selection.length,
});

/* ------------------------------------------------------------------ *
 * D — THE CLAIMS, AND THEIR SCOPE
 * ------------------------------------------------------------------ */

record("claims", {
  established: [
    "two distinct real Activations are created by the shipped realization service from one immutable baseline, and both attempts settle to COMPLETED with distinct result commits",
    "the real Trajectory projection contains both attempts and emits NO causal cross-attempt edge; the only cross-attempt edge it emits is SAME_OWNER_SEQUENCE_SUCCESSOR labelled TEMPORAL_ONLY",
    "observation order does not change the verified relations: the (relation, evidenceState) multiset is identical under both orders",
    "a cross-Owner dependency is measured on BYTES: B records the digest it read, and B1 still names A1's digest after A2 rewrote the same path",
    "a misbound dependency (claiming A1, reading A2) fails hard and records no COMPLETED attempt",
    "promotion authority is a head comparison: a caller naming an unproven head is refused, and the refusal writes nothing",
    "a duplicate delivery converges: same promotionId, no second PROMOTION_COMMITTED, no second head advance",
    "a declared gate cannot qualify a combination, because the gate vocabulary has no combination subject and an unevidenced subject is INCOMPLETE",
    "the Worker's effective module identity is measured inside the child at three anchors; the enforced pin is rc.3 and the fence loads from the run-owned test home",
  ],
  notEstablished: [
    "a locally PASSING candidate on the delegated settlement route: that route records no completion-contract evidence at all (measured: empty evidence table after ATTEMPT_COMPLETED)",
    "the late-result path (ATTEMPT_LATE_RESULT): it is only legal from EXPIRED (state_machine.ts:61), so a COMPLETED attempt cannot exercise it, and the test does not fake it",
    "a clean full-selection runner exit 0 on this machine (carried from E4)",
    "two real DSH subprocess Workers running concurrently: the subprocess port needs a model and cannot complete a deterministic bounded task; its identity and delivery are separately qualified",
    "any cross-Owner relation the existing Trajectory vocabulary can express: no SAME_BASIS or SHARED_BASELINE edge kind exists",
  ],
  limitationsCarried: [
    "E3 quarantine residual TOCTOU is unchanged",
    "L1 cooperative same-user execution only; no L2 hostile-isolation claim",
    "module-sharing provenance is structural (paths and sizes), not content-addressed",
    "rc.3 is qualified for the operations exercised, not every Win32 path",
    "the real runtime Home content boundary remains unestablished",
    "the stale deployment copy in the real runtime home differs from the repo in exactly the two files E4 changed; it is NOT on the executed path, but it is a latent hazard",
  ],
});

/* ------------------------------------------------------------------ *
 * E — FREEZE
 * ------------------------------------------------------------------ */

const manifest = {
  schemaVersion: 1,
  kind: "PALIMPSEST_CI1_EVIDENCE_MANIFEST",
  stage: "Palimpsest-CI1 — Two-Owner Causal Integration",
  measuredAt: new Date().toISOString(),
  node: { version: process.version, executable: process.execPath },
  e4: E4,
  findings,
};

const out = args.get("json");
if (out !== undefined) {
  mkdirSync(dirname(resolve(out)), { recursive: true });
  writeFileSync(resolve(out), `${JSON.stringify(manifest, null, 2)}\n`);
  process.stderr.write(`\nwrote ${resolve(out)}\n`);
}
process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
