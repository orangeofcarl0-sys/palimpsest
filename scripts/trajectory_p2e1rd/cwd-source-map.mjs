/**
 * Trajectory-P2-E1RD §5.3 — STATIC MISMATCH ANALYSIS (S2).
 *
 * THE INVARIANT. A path approved by the trusted Read Guard must resolve to the object the ACTUAL DSH tool is
 * authorized to read:
 *
 *     RealTarget(GuardCwd, modelPath) === RealTarget(EffectiveSessionCwd, modelPath)
 *
 * This script establishes the two halves of that equality from SOURCE, and then reports which of them the
 * shipped host actually satisfies. It is a STATIC analysis: it proves a source-level possibility and never
 * claims a live exploit. The dynamic reproduction lives in `test/trajectory_p2e1rd_cwd_boundary.test.ts`.
 *
 * WHAT IT READS (and why from Git rather than the working tree): the guard and the fence as COMMITTED at the
 * parent, so the analysis describes the code that was actually qualified, not an in-progress edit.
 *
 * Usage:  node scripts/trajectory_p2e1rd/cwd-source-map.mjs [--json-out <path>]
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ARG_JSON_OUT = process.argv.includes("--json-out") ? process.argv[process.argv.indexOf("--json-out") + 1] : null;
const PARENT = "3eb88dba1420b9d13c32926e0e9c064a8533ae53";

const git = (args) => {
  try {
    return execFileSync("git", args, { cwd: REPO, encoding: "utf8" }).trim();
  } catch {
    return null;
  }
};
const atParent = (path) => {
  try {
    return execFileSync("git", ["show", `${PARENT}:${path}`], { cwd: REPO, encoding: "utf8" });
  } catch {
    return null;
  }
};

/** §3: the installed first-party packages, resolved from the real DSH home rather than assumed. */
const DSH_HOME = (process.env.DSH_HOME ?? join(process.env.USERPROFILE ?? process.env.HOME ?? "", ".dsh")).replace(/\\/gu, "/");
const MODULES = join(DSH_HOME, "profiles", "node_modules", "@deepseek-ai");
/**
 * The profile root hoists only a SUBSET of the release; the remainder is nested under the `dsh` package's
 * own `node_modules`. Both are the SAME installation, so both are searched — resolving only one made four
 * findings report "not installed" for packages that are installed, which is a false negative, not a finding.
 */
const MODULE_ROOTS = [MODULES, join(MODULES, "dsh", "node_modules", "@deepseek-ai")];
const resolveInstalled = (pkg, file) => {
  for (const root of MODULE_ROOTS) {
    const path = join(root, pkg, file);
    if (existsSync(path)) return path;
  }
  return null;
};
const readInstalled = (pkg, file = "lib/index.js") => {
  const path = resolveInstalled(pkg, file);
  return path === null ? null : readFileSync(path, "utf8");
};
const installedVersion = (pkg) => {
  const path = resolveInstalled(pkg, "package.json");
  if (path === null) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")).version ?? null;
  } catch {
    return null;
  }
};

const findings = [];
const record = (id, statement, observed, detail) => {
  findings.push({ id, statement, observed: observed === true, detail });
  process.stderr.write(`  ${observed === true ? "·" : "!"} ${id}: ${String(detail).slice(0, 220)}\n`);
};

/* ---------------------------------------------------------------- A. the executor's basis, installed */

const toolFs = readInstalled("dsh-tool-fs");
const toolFsSearch = readInstalled("dsh-tool-fs-search");
const workingDirectory = readInstalled("dsh-working-directory");
const toolWorkingDirectory = readInstalled("dsh-tool-working-directory");

record(
  "S1-executor-resolves-through-workingDirectory",
  "the installed fs tools resolve model paths through ctx.workingDirectory.ensure(agent), not a fixed header",
  toolFs !== null && /ctx\.workingDirectory\.ensure\(exec\.agent, exec\.signal\)/u.test(toolFs),
  toolFs === null ? "dsh-tool-fs is not installed" : `dsh-tool-fs@${String(installedVersion("dsh-tool-fs"))} resolves via ctx.workingDirectory.ensure`,
);
record(
  "S1-search-resolves-through-workingDirectory",
  "the installed search tools resolve their walk root through the same service",
  toolFsSearch !== null && /await ctx\.workingDirectory\.ensure\(exec\.agent, exec\.signal\)/u.test(toolFsSearch),
  toolFsSearch === null ? "dsh-tool-fs-search is not installed" : `dsh-tool-fs-search@${String(installedVersion("dsh-tool-fs-search"))}`,
);
record(
  "S1-working-directory-service-exists",
  "the installed release ships a mutable per-Session working-directory service",
  workingDirectory !== null,
  workingDirectory === null ? "dsh-working-directory is not installed" : `dsh-working-directory@${String(installedVersion("dsh-working-directory"))}`,
);
record(
  "S1-model-facing-tool-exists",
  "the installed release ships a model-callable `working_directory` tool with an optional absolute or relative `cd`",
  toolWorkingDirectory !== null && /name: "working_directory"/u.test(toolWorkingDirectory) && /cd: \{/u.test(toolWorkingDirectory),
  toolWorkingDirectory === null ? "dsh-tool-working-directory is not installed" : `dsh-tool-working-directory@${String(installedVersion("dsh-tool-working-directory"))}`,
);

/* ---------------------------------------------------------------- B. the guard's basis, at the parent */

const guardSource = atParent("host/deployment/runtime/read_guard.js");
record(
  "S2-guard-uses-a-fixed-basis",
  "the committed guard resolves model paths against a FIXED cwd (config.cwd or the worker world)",
  guardSource !== null && /const cwd = typeof config\.cwd === 'string' && config\.cwd !== '' \? config\.cwd : config\.world;/u.test(guardSource),
  guardSource === null ? "the guard source is not present at the parent" : "createReadGuard resolves against config.cwd ?? config.world",
);
record(
  "S2-guard-does-not-read-the-session-cwd",
  "the committed guard never consults the Session's effective working directory",
  guardSource !== null && !/workingDirectory/u.test(guardSource),
  "no reference to workingDirectory appears in the guard",
);

/* ---------------------------------------------------------------- C. the equality, derived */

const executorMutable = toolFs !== null && /ctx\.workingDirectory\.ensure/u.test(toolFs);
const guardFixed = guardSource !== null && /config\.cwd : config\.world/u.test(guardSource);
/**
 * The equality fails exactly when the executor's basis can MOVE while the guard's stays put. That is a
 * source-level statement about two code paths; it says nothing about whether a live model has done it.
 */
const mismatchPossible = executorMutable && guardFixed;
record(
  "S2-basis-can-diverge",
  "the executor's basis is mutable while the guard's is fixed, so the two can resolve the same model path to different objects",
  mismatchPossible,
  mismatchPossible
    ? "SOURCE-DEMONSTRATED HAZARD: `working_directory {cd: <dir>}` changes what every LATER tool call resolves, while the guard keeps resolving against the world"
    : "the two bases cannot diverge in the installed composition",
);

/* ---------------------------------------------------------------- D. the other mutation routes */

const subagent = readInstalled("dsh-subagent");
const toolSubagent = readInstalled("dsh-tool-subagent");
record(
  "S2-subagent-accepts-a-cwd",
  "`subagent` takes a model-supplied `cwd` and applies it to the CHILD session, so the child's basis can move too",
  toolSubagent !== null && /cwd: \{/u.test(toolSubagent) && subagent !== null && /workingDirectory\.set\(child, create\.cwd/u.test(subagent),
  "dsh-tool-subagent declares `cwd`; dsh-subagent calls workingDirectory.set(child, create.cwd)",
);
record(
  "S2-workflow-inherits-the-parent-basis",
  "`workflow` children inherit the parent's effective directory rather than choosing one",
  /this\.cwd = ctx\.workingDirectory\.ensure\(parent/u.test(readInstalled("dsh-workflow-ptc") ?? ""),
  "dsh-workflow-ptc resolves this.cwd from the PARENT session",
);
record(
  "S2-tool-removal-alone-is-insufficient",
  "removing the model-facing tool would NOT restore the equality, because delegation can still move a child's basis",
  mismatchPossible && toolSubagent !== null && /cwd: \{/u.test(toolSubagent),
  "a child created with `subagent {cwd: <protected>}` resolves relative paths against that directory while a world-fixed guard still approves them",
);

/* ---------------------------------------------------------------- E. the 0.2.0-rc.2 comparison */

/**
 * §3/§4: the QUALIFIED release's source, obtained from the registry tarball and verified by its published
 * integrity hash. When it is not present locally the comparison is reported as NOT_INSPECTED rather than
 * assumed — the absence of a package is not evidence about its behaviour.
 */
const QUALIFIED_DIR = process.env.PALIMPSEST_DSH_020_SOURCE ?? join(REPO, "..", ".runtimes", "dsh-0.2.0");
const qualifiedToolFs = existsSync(join(QUALIFIED_DIR, "dsh-tool-fs", "lib", "index.js"))
  ? readFileSync(join(QUALIFIED_DIR, "dsh-tool-fs", "lib", "index.js"), "utf8")
  : null;
const qualifiedHasWorkingDirectory = existsSync(join(QUALIFIED_DIR, "dsh-working-directory", "package.json"));
record(
  "S1-qualified-release-uses-the-header-cwd",
  "0.2.0-rc.2 resolves model paths from the immutable Session Header cwd",
  qualifiedToolFs !== null && /session\.header\.cwd/u.test(qualifiedToolFs) && !/workingDirectory/u.test(qualifiedToolFs),
  qualifiedToolFs === null ? "the 0.2.0-rc.2 source is not present locally; the comparison was NOT performed" : "dsh-tool-fs@0.2.0-rc.2 reads exec.agent?.session.header.cwd",
);
record(
  "S1-qualified-release-has-no-working-directory-service",
  "0.2.0-rc.2 ships no working-directory service or tool at all",
  qualifiedToolFs !== null && qualifiedHasWorkingDirectory === false,
  qualifiedToolFs === null ? "not inspected" : "no dsh-working-directory / dsh-tool-working-directory package exists at 0.2.0-rc.2",
);

/* ---------------------------------------------------------------- F. the pinned contract */

const labelSource = atParent("host/deployment/runtime/win32_label.js");
record(
  "S6-read-boundary-contract-is-version-pinned",
  "the read-boundary contract names the release it was qualified against, and drift is reported",
  labelSource !== null && /qualifiedVersion: '0\.2\.0-rc\.2'/u.test(labelSource),
  labelSource === null ? "win32_label.js is not present at the parent" : "DSH_CONTRACT.qualifiedVersion = 0.2.0-rc.2",
);

const failed = findings.filter((entry) => entry.observed !== true);
const out = {
  schemaVersion: 1,
  kind: "TRAJECTORY_P2E1RD_CWD_SOURCE_MAP",
  stage: "Trajectory-P2-E1RD",
  parent: PARENT,
  evidenceClass: "SOURCE_DERIVED",
  note: "A static source analysis. `S2-basis-can-diverge` states that two code paths CAN disagree; it does not assert that any live run did. The dynamic reproduction is separate and is reported separately.",
  installed: {
    dshToolFs: installedVersion("dsh-tool-fs"),
    dshToolFsSearch: installedVersion("dsh-tool-fs-search"),
    dshWorkingDirectory: installedVersion("dsh-working-directory"),
    dshToolWorkingDirectory: installedVersion("dsh-tool-working-directory"),
    dshSubagent: installedVersion("dsh-subagent"),
  },
  invariant: "RealTarget(GuardCwd, modelPath) === RealTarget(EffectiveSessionCwd, modelPath)",
  findings,
  conclusion: mismatchPossible
    ? "The guard's basis and the executor's basis are different values with different mutability. Restoring the invariant requires the guard to resolve against the SAME value the executor uses; removing the model-facing tool alone is insufficient while delegation can move a child's basis."
    : "The bases do not diverge in this composition.",
  failedFindings: failed.map((entry) => entry.id),
};

process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
if (ARG_JSON_OUT !== null) {
  mkdirSync(dirname(resolve(ARG_JSON_OUT)), { recursive: true });
  writeFileSync(resolve(ARG_JSON_OUT), `${JSON.stringify(out, null, 2)}\n`);
}
