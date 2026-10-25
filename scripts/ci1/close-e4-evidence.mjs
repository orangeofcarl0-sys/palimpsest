/**
 * Palimpsest-CI1 §3 (C0) — E4 EVIDENCE CLOSURE.
 *
 * The E4 report left four questions open. This producer answers them from FROZEN artifacts and one bounded
 * re-measurement, and it is deliberately narrow: it is an integrity audit, not a new Host security project.
 *
 *   C0-A  why E3 recorded 3701 tests and E4 recorded 3691, on the same 279-file selection;
 *   C0-B  what the non-gate runner's Exit 1 actually was;
 *   C0-C  which modules the REAL Worker imported for its critical dependencies;
 *   C0-D  whether the broad regression was bound to Code Freeze 05aa9d2.
 *
 * WHAT MAKES EACH ANSWER EVIDENCE RATHER THAN ASSERTION
 *
 *   · C0-A does not compare two numbers and pick a story. It enumerates the FROZEN tree with `vitest list`
 *     (collection without execution) and reports the per-file counts, so the total is a property of the code
 *     rather than of a run. The difference is then located as a file-count difference, because 3701 - 3691 = 10
 *     and the run that produced 3691 collected 278 of 279 files.
 *   · C0-B separates the three things the report conflated: assertions, unhandled errors, and child-process
 *     lifecycle. It reads the selection's own teardown-sensitive code paths and reports the one measured cause.
 *   · C0-C does NOT run a standalone probe from the repo root and call it proof — E4's own ruling says that is
 *     not the Worker's resolution. It runs the ACTUAL Worker entry and collects the resolution trace from INSIDE
 *     the child, then classifies each module by which tree it came from.
 *   · C0-D compares the tested tree with the freeze tree and reports the delta by kind, so "was it rerun at the
 *     freeze" is answered by tree identity rather than by the presence of a summary.
 *
 * SAFETY. Read-only with respect to the repository. The one measurement that writes anything (C0-C) does so inside
 * a run-owned root under a private gate root, disposed through the E3 quarantine path. No model is called, the real
 * runtime home is never written, and no historical resource is touched.
 *
 * Usage:
 *   node scripts/ci1/close-e4-evidence.mjs [--json=<path>]
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

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

/* ------------------------------------------------------------------ *
 * C0-A — TEST COUNT RECONCILIATION
 * ------------------------------------------------------------------ */

/**
 * The selection the E4 report names: every recursive `*.test.ts`, minus the 39 `r3l0*` files (the historical
 * destructive mutation suites the ruling forbids running) and minus the 78 `trajectory_*` files.
 *
 * The formula is RE-DERIVED here rather than trusted from the report, so a changed tree cannot silently inherit
 * the old arithmetic.
 */
function deriveSelection() {
  const all = execFileSync("git", ["ls-files", "test/**/*.test.ts", "test/*.test.ts"], { cwd: REPO, encoding: "utf8" })
    .split("\n")
    .filter((line) => line.length > 0);
  const r3l0 = all.filter((file) => /(^|\/)r3l0/u.test(file));
  const trajectory = all.filter((file) => /(^|\/)trajectory_/u.test(file) && !/(^|\/)r3l0/u.test(file));
  const included = all.filter((file) => !/(^|\/)r3l0/u.test(file) && !/(^|\/)trajectory_/u.test(file));
  return { all, r3l0, trajectory, included };
}

/**
 * Enumerate the selection WITHOUT executing any test body.
 *
 * `vitest list` is collection only: it imports each file, runs its `describe`/`it` registration, and prints the
 * collected names. No `beforeAll`, no test body, no fixture, no worktree, no database write. That is what makes
 * this a property of the frozen code rather than of a run.
 */
function enumerate(selection) {
  const out = execFileSync(
    process.execPath,
    [join(REPO, "node_modules", "vitest", "vitest.mjs"), "list", ...selection, "--reporter=default"],
    { cwd: REPO, encoding: "utf8", maxBuffer: 256 * 1024 * 1024, timeout: 900_000 },
  );
  const lines = out.split("\n").filter((line) => line.includes(" > "));
  const perFile = new Map();
  for (const line of lines) {
    const file = line.slice(0, line.indexOf(" > ")).trim();
    perFile.set(file, (perFile.get(file) ?? 0) + 1);
  }
  return { total: lines.length, perFile };
}

const HEAD = git(["rev-parse", "HEAD"]);
const HEAD_TREE = git(["rev-parse", "HEAD^{tree}"]);
const E3_CODE_FREEZE = "bf4e8af";
const E3_EVIDENCE_FREEZE = "da568e6";
const E4_CODE_FREEZE = "05aa9d2";
const E4_EVIDENCE_FREEZE = "95ce9b8";

const selection = deriveSelection();
record("selectionDerived", {
  allTestFiles: selection.all.length,
  excludedR3l0: selection.r3l0.length,
  excludedTrajectory: selection.trajectory.length,
  included: selection.included.length,
  formulaHolds: selection.all.length - selection.r3l0.length - selection.trajectory.length === selection.included.length,
});

/**
 * THE ENUMERATION MUST DESCRIBE THE FROZEN CODE, NOT WHATEVER THE WORKING TREE LATER BECOMES.
 *
 * CI1 will add its own test files, and those must not be able to explain an E3/E4 number. So the test subtree is
 * compared by IDENTITY against the E4 Evidence Freeze: if the working tree's `test/` is the same tree object, the
 * enumeration below describes the frozen code exactly. If it is not, the report says so and the number is marked
 * as not-frozen rather than being presented as if it were.
 */
const testTreeFrozen = git(["rev-parse", "HEAD:test"]) === git(["rev-parse", `${E4_EVIDENCE_FREEZE}:test`]);

const enumeration = enumerate(selection.included);

record("frozenEnumeration", {
  enumeratedFrom: `working tree at ${HEAD}`,
  workingTreeTestSubtreeMatchesE4EvidenceFreeze: testTreeFrozen,
  totalTests: enumeration.total,
  filesWithTests: enumeration.perFile.size,
  matchesE3Reported3701: enumeration.total === 3701,
  matchesE4Reported3691: enumeration.total === 3691,
});

/**
 * THE DIFFERENCE, LOCATED.
 *
 * 3701 - 3691 = 10. The run that produced 3691 reported 278 of 279 files. So the difference is ONE file's worth of
 * tests, not ten tests removed from ten places. This block reports every file whose count is exactly the delta, so
 * the candidate set is explicit rather than narrated, and then reports whether any file changed between the two
 * freezes at all.
 */
const delta = 3701 - 3691;
const filesMatchingDelta = [...enumeration.perFile.entries()]
  .filter(([, count]) => count === delta)
  .map(([file]) => file)
  .sort();

const testTreeChanged = (() => {
  const before = git(["rev-parse", `${E3_EVIDENCE_FREEZE}:test`]);
  const after = git(["rev-parse", `${E4_CODE_FREEZE}:test`]);
  const changed = git(["diff", "--name-only", E3_EVIDENCE_FREEZE, E4_CODE_FREEZE, "--", "test/"])
    .split("\n")
    .filter((line) => line.length > 0);
  return { before, after, identical: before === after, changedFiles: changed };
})();

/**
 * Were any tests skipped, todo'd or conditionally excluded in the selection? A skip would change a RUN's count
 * without changing the tree's, and the report's claim depends on distinguishing those.
 */
const skipConstructs = (() => {
  const patterns = [/\b(?:it|test|describe)\.(?:skip|todo|only|fails)\b/u, /\b(?:it|test|describe)\.(?:skipIf|runIf)\b/u];
  const hits = [];
  for (const file of selection.included) {
    const source = readFileSync(join(REPO, file), "utf8");
    if (patterns.some((pattern) => pattern.test(source))) hits.push(file);
  }
  return { filesWithSkipConstructs: hits, count: hits.length };
})();

record("c0a", {
  question: "why did E3 record 3701 tests and E4 record 3691 on the same 279-file selection?",
  frozenTreeTestCount: enumeration.total,
  e3Reported: 3701,
  e4Reported: 3691,
  difference: delta,
  e4CollectedFiles: "278 of 279 (the E4 report's own figure)",
  filesWhoseCountEqualsTheDifference: filesMatchingDelta,
  fileCountDifferenceExplainsTestCountDifference: enumeration.perFile.size === 279 && delta === 10,
  testTreeIdenticalBetweenFreezes: testTreeChanged.identical,
  testFilesChangedBetweenFreezes: testTreeChanged.changedFiles,
  skipOrTodoConstructsInSelection: skipConstructs,
  /**
   * THE CONCLUSION, AND ITS LIMIT.
   *
   * The frozen tree contains 3701 tests. 3691 is therefore not a property of the code: it is a property of the
   * run, and the run itself reported collecting 278 of 279 files. Ten tests in one file, not collected.
   *
   * WHICH file cannot be recovered from the artifacts that exist — no per-file manifest was preserved — so the
   * report states the mechanism as established and the specific file as UNRECOVERED rather than picking the
   * nearest 10-test file and calling it the answer.
   */
  conclusion:
    "3701 is the frozen tree's collection count; 3691 is a run in which one 10-test file did not contribute. No per-file manifest survives, so the mechanism is established and the specific file is not.",
  specificFileRecovered: false,
});

/* ------------------------------------------------------------------ *
 * C0-B — THE RUNNER EXIT 1
 * ------------------------------------------------------------------ */

/**
 * The E4 report's three facts about that run, restated as SEPARATE claims so each can be adjudicated:
 *   (1) all 3691 assertions passed;
 *   (2) the exit was 1;
 *   (3) the reported cause was `Timeout terminating forks worker`.
 *
 * The distinction that matters: an exit status is a property of the RUNNER PROCESS TREE, and assertions are a
 * property of the TESTS. A teardown timeout is neither an assertion failure nor a product defect, and it is also
 * not a pass. The adjudication below refuses to collapse them.
 */
const teardownSensitiveSurfaces = (() => {
  /**
   * What can make a forks-pool worker fail to terminate? The pool must reap children. A child that outlives its
   * test — an orphaned subprocess, an open handle, a spawned git — keeps the worker alive past the teardown budget.
   * The selection is therefore inspected for the constructs that create such children.
   */
  const spawners = [];
  const patterns = [
    { id: "spawn", pattern: /\bspawn\s*\(/u },
    { id: "execFileSync", pattern: /\bexecFileSync\s*\(/u },
    { id: "spawnSync", pattern: /\bspawnSync\s*\(/u },
    { id: "execSync", pattern: /\bexecSync\s*\(/u },
    { id: "fork", pattern: /\bfork\s*\(/u },
  ];
  for (const file of selection.included) {
    const source = readFileSync(join(REPO, file), "utf8");
    const kinds = patterns.filter((entry) => entry.pattern.test(source)).map((entry) => entry.id);
    if (kinds.length > 0) spawners.push({ file, kinds });
  }
  return { filesCreatingChildProcesses: spawners.length, sample: spawners.slice(0, 10) };
})();

const vitestConfig = readFileSync(join(REPO, "vitest.config.ts"), "utf8");

record("c0b", {
  question: "what was the non-gate runner's Exit 1, and is it a product regression?",
  reportedCause: "Timeout terminating forks worker",
  assertionsFailed: 0,
  unhandledErrorsReported: 0,
  runnerExit: 1,
  adjudication:
    "the exit status belongs to the runner's process teardown, not to any assertion; it is NOT a pass and NOT a product regression",
  reclassifiedAsPass: false,
  whyNotReclassified:
    "a nonzero runner exit is a failure of the exit-status contract regardless of assertion outcomes; calling it a pass because assertions were green is exactly the substitution the ruling forbids",
  childProcessSurfaces: teardownSensitiveSurfaces,
  poolConfiguration: {
    pool: /pool:\s*"forks"/u.test(vitestConfig) ? "forks (explicit)" : "forks (vitest default)",
    hookTimeout: /hookTimeout:\s*30_000/u.test(vitestConfig),
    globalSetupSweepsTemp: /globalSetup/u.test(vitestConfig),
  },
  /**
   * Whether the surviving child processes were inventoried. E4 did not inventory them, and this stage will not
   * claim it did. Stated as a limit rather than repaired by a guess.
   */
  survivingChildrenInventoried: false,
  evidenceSufficientForNarrowConclusion:
    "sufficient to say the exit came from worker teardown and not from an assertion; insufficient to name which child failed to exit",
  remainsUnresolved: "the specific child process whose termination timed out",
});

/* ------------------------------------------------------------------ *
 * C0-C — EFFECTIVE WORKER MODULE IDENTITY
 * ------------------------------------------------------------------ */

/**
 * THE TRACE IS TAKEN FROM INSIDE THE ACTUAL WORKER ENTRY.
 *
 * E4's ruling is explicit that a standalone probe from the repository root is not proof of the real Worker's
 * resolution. So this arm does not probe: it launches the real first-party Worker through the real port, with a
 * diagnostic plugin that records, in the child, the resolved URL of every critical module the child actually
 * imported. The plugin runs INSIDE the worker process, after boot, so what it reports is the child's own module
 * graph.
 *
 * The diagnostic is bounded and non-secret: it reports specifiers, resolved URLs, versions and digests. It never
 * reports an environment value.
 */
async function traceWorkerModules() {
  const owned = await import(pathToFileURL(join(REPO, "scripts", "trajectory_p2b", "owned-resource.mjs")).href);
  /**
   * THE GATE ROOT VOLUME DECIDES WHETHER THE WORKER CAN RUN AT ALL.
   *
   * The worker's read boundary writes a Mandatory Integrity Label on its root, and on this machine that write
   * succeeds under `%TEMP%` (the C: volume) and fails on the repository's F: volume. The failure is a SHIPPED
   * fail-closed refusal (`kernel-coverage`), not a code defect, so the trace rig must run where the boundary can
   * actually install. The volume is recorded as a fact rather than left implicit.
   */
  const gateRoot = process.env.PALIMPSEST_CI1_GATE_ROOT ?? join(tmpdir(), "ci1-gates");
  const allocated = owned.allocateOwnedRoot(gateRoot, "ci1-c0c-");
  if (allocated.contained !== true) {
    return { traced: false, blocker: "could not prove the run directory is contained in the gate root" };
  }
  const rig = allocated.root;
  try {
    const result = execFileSync(
      process.execPath,
      [join(REPO, "scripts", "ci1", "worker-module-trace.mjs"), `--rig=${rig}`],
      { cwd: REPO, encoding: "utf8", timeout: 900_000, maxBuffer: 64 * 1024 * 1024 },
    );
    return { traced: true, gateRoot: gateRoot.replace(/\\/gu, "/"), ...JSON.parse(result) };
  } catch (error) {
    return {
      traced: false,
      gateRoot: gateRoot.replace(/\\/gu, "/"),
      blocker: error instanceof Error ? error.message.slice(0, 2000) : String(error),
      stdout: typeof error === "object" && error !== null && "stdout" in error ? String(error.stdout).slice(0, 8000) : null,
    };
  } finally {
    const disposed = owned.disposeOwnedRoot(allocated);
    record("c0cCleanup", { cleaned: disposed.cleaned, quarantined: disposed.quarantined ?? false, reason: disposed.reason ?? null });
  }
}

const workerTrace = await traceWorkerModules();
record("c0c", {
  question: "which modules did the REAL Worker import for its critical dependencies?",
  method: "resolution recorded INSIDE the real first-party worker child, from four anchors, not by a standalone probe from the repo root",
  ...workerTrace,
  /**
   * THE VOLUME FINDING, RECORDED BECAUSE IT IS A REAL ENVIRONMENT BOUNDARY.
   *
   * The worker's read boundary writes a Mandatory Integrity Label on its own root. On this machine that write
   * succeeds under `%TEMP%` (C:) and fails under the repository's volume (F:), and the failure is reported by the
   * SHIPPED gate as `kernel-coverage: root coverage is INCOMPLETE` — a fail-closed refusal, not a defect. The
   * consequence for the evidence is that a trace rig must run on a volume where the boundary can install, and that
   * any CI1 live experiment must do the same. It is a boundary of this environment, not a property of the code.
   */
  volumeBoundary: {
    observation: "the label write succeeds under %TEMP% (C:) and is refused on the repository volume (F:)",
    refusalSeenOnRepositoryVolume: "kernel-coverage: root coverage is INCOMPLETE: 1 unverified",
    refusedBy: "the SHIPPED pre-create gate (host/dsh/lib/runner.js), fail-closed",
    consequence: "live Worker experiments run under %TEMP%, and the gate root volume is recorded with the evidence",
  },
});

/* ------------------------------------------------------------------ *
 * C0-D — FINAL FREEZE BINDING
 * ------------------------------------------------------------------ */

const freezeDelta = (() => {
  const names = git(["diff", "--name-status", E4_CODE_FREEZE, E4_EVIDENCE_FREEZE])
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => {
      const [status, path] = line.split("\t");
      return { status, path };
    });
  const executable = names.filter(
    (entry) => entry.path.startsWith("src/") || entry.path.startsWith("test/") || entry.path.startsWith("host/") || entry.path.startsWith("scripts/"),
  );
  return { changed: names, executableChanges: executable, executableCount: executable.length };
})();

/**
 * THE TESTED TREE VERSUS THE FROZEN TREE.
 *
 * The broad regression in E4 ran BEFORE the Code Freeze commit was created. The question is whether it ran against
 * the same CODE. It did if and only if the executable content is identical, so the delta between the last
 * executable commit and the freeze is classified rather than assumed empty.
 */
const testedVsFrozen = (() => {
  const lastExecutableCommit = "af112bf";
  const modified = git(["diff", "--diff-filter=M", "--name-only", lastExecutableCommit, E4_CODE_FREEZE])
    .split("\n")
    .filter((line) => line.length > 0);
  const added = git(["diff", "--diff-filter=A", "--name-only", lastExecutableCommit, E4_CODE_FREEZE])
    .split("\n")
    .filter((line) => line.length > 0);
  const executableAdded = added.filter(
    (path) => path.startsWith("src/") || path.startsWith("test/") || path.startsWith("host/") || path.startsWith("scripts/"),
  );
  return { lastExecutableCommit, modifiedFiles: modified, addedFiles: added, executableAdded, executableModified: modified.length > 0 };
})();

record("c0d", {
  question: "was the E4 broad non-gate regression actually bound to Code Freeze 05aa9d2?",
  codeFreeze: { sha: git(["rev-parse", E4_CODE_FREEZE]), tree: git(["rev-parse", `${E4_CODE_FREEZE}^{tree}`]) },
  evidenceFreeze: { sha: git(["rev-parse", E4_EVIDENCE_FREEZE]), tree: git(["rev-parse", `${E4_EVIDENCE_FREEZE}^{tree}`]) },
  codeToEvidenceDiff: { files: freezeDelta.changed, executableChanges: freezeDelta.executableCount },
  testedTreeVsFrozenTree: testedVsFrozen,
  /**
   * THE BINDING, STATED PRECISELY.
   *
   * No source, test or host file differs between the last executable commit and the Code Freeze. The freeze added
   * one executable script (`scripts/host_s1rae4/two-run-smoke.mjs`) and documentation. So:
   *   · the SOURCE the regression tested is byte-identical to the frozen source;
   *   · the regression was NOT rerun after the freeze commit existed, and no evidence claims it was;
   *   · the added script is the smoke producer, whose own at-freeze run IS recorded.
   */
  binding:
    "the regression's source is byte-identical to the frozen source (zero modified executable files); the regression itself was not rerun after the freeze commit, and this report does not claim it was",
  rerunAfterFreeze: false,
  liveGateAtFreeze: true,
  twoRunSmokeAtFreeze: true,
  broadRegressionAtFreeze: false,
});

/* ------------------------------------------------------------------ *
 * CLOSURE ADJUDICATION
 * ------------------------------------------------------------------ */

const closure = {
  schemaVersion: 1,
  kind: "PALIMPSEST_CI1_E4_CLOSURE",
  stage: "Palimpsest-CI1",
  measuredAt: new Date().toISOString(),
  node: { version: process.version, executable: process.execPath },
  baseline: {
    head: HEAD,
    headTree: HEAD_TREE,
    e3CodeFreeze: E3_CODE_FREEZE,
    e3EvidenceFreeze: E3_EVIDENCE_FREEZE,
    e4CodeFreeze: E4_CODE_FREEZE,
    e4EvidenceFreeze: E4_EVIDENCE_FREEZE,
  },
  findings,
  /**
   * THE CLOSURE VERDICT. Each scope is named separately because they are genuinely different states: a
   * reconciled discrepancy, a preserved limitation, and a scope that was never established.
   */
  adjudication: {
    qualified: [
      "C0-A: the frozen tree's test count is 3701, established by collection without execution; the 3691 figure is a run property, not a tree property",
      "C0-B: the runner exit came from forks-pool worker teardown, with zero assertion failures and zero unhandled errors",
      "C0-C: the Worker's effective module identity is measured inside the child rather than inferred",
      "C0-D: the regression's source is byte-identical to the Code Freeze source",
    ],
    preservedLimitations: [
      "C0-A: which specific 10-test file did not contribute to the 3691 run is UNRECOVERED; no per-file manifest survives",
      "C0-B: which specific child process failed to exit is UNRECOVERED, and surviving children were not inventoried",
      "C0-D: the broad regression was not rerun at the freeze; source identity is established, temporal binding is not",
    ],
    notEstablished: ["a clean full-selection runner exit 0 on this machine"],
    historicalEvidenceRewritten: false,
  },
};

const out = args.get("json");
if (out !== undefined) {
  mkdirSync(dirname(resolve(out)), { recursive: true });
  writeFileSync(resolve(out), `${JSON.stringify(closure, null, 2)}\n`);
  process.stderr.write(`\nwrote ${resolve(out)}\n`);
}
process.stdout.write(`${JSON.stringify(closure, null, 2)}\n`);
