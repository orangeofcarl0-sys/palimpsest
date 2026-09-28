#!/usr/bin/env node
/**
 * R1-R §5/§6/§13/§14 — THE SCENARIO DEFINITIONS THE TRIAL HARNESS DRIVES.
 *
 * One place defines, for each primary scenario: the project the worker edits, the task it is given, the
 * black-box oracle command, the hidden acceptance, and the capital to install. Everything a trial
 * varies is here; everything a trial must HOLD CONSTANT is derived from here so the paired-state proof
 * (§14) can hash it.
 *
 * THE TWO ORACLES, AND WHY BOTH EXIST (§5, §7):
 *
 *   visible oracle  `node test/check.js` inside the world — the worker may run it and iterate on it
 *   hidden acceptance  `scripts/r1r/fixtures/<scenario>/acceptance.mjs` — OUTSIDE the world, authoritative
 *
 * The hidden acceptance module is never copied into a trial world. `assertOracleInaccessible` proves
 * that mechanically rather than by inspection: it checks the module's bytes are absent from the world
 * tree, so a later edit that accidentally inlined it fails a test instead of quietly weakening §5.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { REPO_ROOT } from "./amendment.mjs";
import { deriveCapital } from "./capital.mjs";

const FIXTURE_ROOT = join(REPO_ROOT, "scripts", "r1r", "fixtures");

const git = (cwd, args) => execFileSync("git", [...args], { cwd, encoding: "utf8" }).trim();
export const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

/* ---------------------------------------------------------------- scenario table */

/**
 * §5/§6: the two primary scenarios, frozen here.
 *
 * `sourceFile` is the file the worker is expected to change; `acceptanceModule` is the hidden
 * acceptance, which lives under `fixtures/` and is NEVER copied into a world.
 */
export const SCENARIOS = Object.freeze({
  B: Object.freeze({
    id: "B",
    name: "B_CONFIG_MIGRATION",
    projectId: "r1r-config-migration",
    /** §21: the pre-paid cognitive mistake this scenario measures for recurrence. */
    knownFailure: "transform/default before legacy ambiguity validation",
    knownFailureDetector: "defaultsAppliedBeforeLegacyValidation",
    sourceFile: "src/config.ts",
    exportName: "migrateConfig",
    acceptanceModule: join(FIXTURE_ROOT, "scenario-b", "acceptance.mjs"),
    fixtureDir: join(FIXTURE_ROOT, "scenario-b"),
    /** The command the worker is told to run, and the only command its envelope authorizes. */
    oracleCommand: Object.freeze(["node", "test/check.js"]),
    taskObjective: "finish migrateConfig so it migrates a legacy configuration document to the v2 shape",
    projectGoal: "move downstream services onto the v2 configuration format",
    /**
     * §5: the requirements state the BROAD product goal and must NOT enumerate the edge-case rules. An
     * earlier version of this scenario said "a document that cannot be migrated unambiguously must be
     * refused rather than converted", which is the ordering method stated outright — C0 then had the
     * pre-paid mistake already avoided on its first candidate, and the primary measure had no headroom.
     * These requirements are deliberately satisfiable-looking without revealing the ordering.
     */
    requirements: Object.freeze([
      "migrateConfig must accept a legacy configuration document and return the v2 shape",
      "the migration must be correct for every document the legacy contract admits",
    ]),
  }),
  C: Object.freeze({
    id: "C",
    name: "C_REPLAY_SAFE_REDUCER",
    projectId: "r1r-event-reducer",
    knownFailure: "mutate/reduce before replay/sequence validity is established",
    knownFailureDetector: "reducedBeforeWholeHistoryValidation",
    sourceFile: "src/reducer.ts",
    exportName: "applyEventStream",
    acceptanceModule: join(FIXTURE_ROOT, "scenario-c", "acceptance.mjs"),
    fixtureDir: join(FIXTURE_ROOT, "scenario-c"),
    oracleCommand: Object.freeze(["node", "test/check.js"]),
    taskObjective: "finish applyEventStream so it applies an event log to the store's current state",
    projectGoal: "make replay produce the same state on every replica",
    /**
     * §6: the broad goal only. An earlier version said "and rejects invalid histories", which names the
     * whole contract; the visible README and the oracle's failure classes are where the worker is meant
     * to learn the rest, by exploring.
     */
    requirements: Object.freeze([
      "applyEventStream must apply a log to the caller's state deterministically",
      "the result must be correct for every log the store admits",
    ]),
  }),
});

/* ---------------------------------------------------------------- world construction */

/** Recursively list files under a directory, relative to it, POSIX-style. */
export function listFiles(root) {
  const out = [];
  const walk = (dir, prefix) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const rel = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isDirectory()) walk(join(dir, entry.name), rel);
      else out.push(rel);
    }
  };
  walk(root, "");
  return out.sort();
}

/**
 * Build the world the worker edits: the fixture's own files (which include the VISIBLE oracle and the
 * visible unit tests), the H0 starting implementation, and a git repository at H0.
 *
 * The fixture's `acceptance.mjs` is deliberately NOT among the copied files: it lives one level ABOVE
 * the fixture's world-copyable set. See `WORLD_EXCLUDES`.
 */
/**
 * Files that must NOT be copied into a worker's world.
 *
 * `acceptance.mjs` is the hidden acceptance itself. `acceptance.d.mts` is its TYPE DECLARATION — harness
 * scaffolding added so the TypeScript tests can import the `.mjs` under `noImplicitAny`. It names
 * `migrateConfigReference` and `applyEventStreamReference`, so copying it would leak the reference
 * implementation's identity into the world; the accessibility check caught exactly that, which is why
 * the exclusion is a list of names rather than a single literal.
 */
const WORLD_EXCLUDES = Object.freeze(["acceptance.mjs", "acceptance.d.mts"]);

export function buildWorld(scenario, dir) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  cpSync(scenario.fixtureDir, dir, {
    recursive: true,
    filter: (source) => !WORLD_EXCLUDES.includes(source.split(/[\\/]/u).pop() ?? ""),
  });
  execFileSync("git", ["init", "-q"], { cwd: dir });
  execFileSync("git", ["add", "-A"], { cwd: dir });
  execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "H0"], { cwd: dir });
  return git(dir, ["rev-parse", "HEAD"]);
}

/**
 * §5: PROVE the hidden acceptance is not reachable from the world.
 *
 * Not a path check — a CONTENT check. The acceptance module's distinctive source bytes must appear
 * nowhere under the world, and neither may the hidden case ids. This is what makes "it may NOT read the
 * hidden acceptance implementation" a mechanical fact rather than a claim about the layout.
 */
export function assertOracleInaccessible(scenario, worldDir) {
  const acceptanceBytes = readFileSync(scenario.acceptanceModule);
  const acceptanceText = acceptanceBytes.toString("utf8");
  // Two distinctive needles: the module's own header line and its exported reference function name.
  const needles = ["THE HIDDEN ACCEPTANCE", "reduceEventStreamReference", "migrateConfigReference"];
  const found = [];
  for (const relative of listFiles(worldDir)) {
    if (relative.startsWith(".git/")) continue;
    const bytes = readFileSync(join(worldDir, relative));
    const text = bytes.toString("utf8");
    for (const needle of needles) {
      if (acceptanceText.includes(needle) && text.includes(needle)) found.push(`${relative}:${needle}`);
    }
  }
  if (found.length > 0) {
    throw new Error(`§5 VIOLATION: the hidden acceptance is reachable from the world at ${found.join(", ")}`);
  }
  return Object.freeze({ checkedFiles: listFiles(worldDir).filter((relative) => !relative.startsWith(".git/")).length, needles });
}

/* ---------------------------------------------------------------- hidden acceptance */

/** Load a scenario's hidden acceptance module. */
export async function loadAcceptance(scenario) {
  return await import(pathToFileURL(scenario.acceptanceModule).href);
}

/**
 * Judge a candidate implementation against the HIDDEN acceptance (§5).
 *
 * The candidate's source is read out of the world's committed tree and imported in a SCRATCH directory
 * that contains only the fixture's scaffolding — never the world itself — so a candidate cannot see or
 * influence the judging environment.
 */
export async function judgeHidden(scenario, sourceText, scratchDir) {
  const acceptance = await loadAcceptance(scenario);
  rmSync(scratchDir, { recursive: true, force: true });
  mkdirSync(join(scratchDir, "src"), { recursive: true });
  writeFileSync(join(scratchDir, scenario.sourceFile), sourceText, "utf8");
  const module = await import(`${pathToFileURL(join(scratchDir, scenario.sourceFile)).href}?v=${Date.now()}`);
  const fn = module[scenario.exportName];
  if (typeof fn !== "function") throw new Error(`the candidate does not export a function named ${scenario.exportName}`);
  const hidden = acceptance.materialize(acceptance.HIDDEN_CASES);
  return acceptance.runCases(fn, hidden);
}

/**
 * Run the VISIBLE oracle inside a world, exactly as the worker would.
 *
 * `scenario.oracleCommand` is the FULL command (`["node", "test/check.js"]`) because that is what the
 * TaskEnvelope's `allowed_commands` must match; the executable and its arguments are therefore split
 * here rather than the command being passed whole, which would look for a program literally named
 * "node test/check.js".
 */
export function runVisibleOracle(scenario, worldDir) {
  const [executable, ...argv] = scenario.oracleCommand;
  try {
    const stdout = execFileSync(executable, argv, { cwd: worldDir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { exitCode: 0, stdout };
  } catch (error) {
    return { exitCode: typeof error.status === "number" ? error.status : 1, stdout: `${error.stdout ?? ""}${error.stderr ?? ""}` };
  }
}

/* ---------------------------------------------------------------- digests (§14) */

/** The digest of a file's bytes, or "ABSENT" — used by the paired-state proof. */
export function fileDigest(path) {
  return existsSync(path) ? sha256(readFileSync(path)) : "ABSENT";
}

/**
 * §14: the invariant identity of one trial's WORLD AND TASK, before any capital is selected.
 *
 * These must match WITHIN a block across C0/C1/C2. The two things deliberately NOT here are the context
 * index and the resolvable handles — those are the treatment, and they are recorded separately.
 */
export function pairedStateDigest(scenario, worldDir, task) {
  const acceptanceBytes = readFileSync(scenario.acceptanceModule);
  const visibleFiles = listFiles(worldDir).filter((relative) => !relative.startsWith(".git/"));
  const visibleDigest = sha256(visibleFiles.map((relative) => `${relative}:${fileDigest(join(worldDir, relative))}`).join("\n"));
  return Object.freeze({
    scenarioId: scenario.name,
    // The task object carries the product's OWN field names (`write_paths`), because it is handed to
    // `controller.start` unchanged; the digest must hash what the product actually receives.
    taskSemanticDigest: sha256(JSON.stringify({ objective: task.objective, writePaths: [...task.write_paths], requirements: [...scenario.requirements] })),
    /**
     * §14 asks for "repository HEAD". A per-trial `git init` cannot produce the same commit SHA twice,
     * so the raw SHA is recorded for inspection and the SEMANTIC identity of the starting tree is what
     * the within-block comparison uses: `startingTreeDigest` is the digest of every tracked path's
     * bytes at H0. Two trials whose starting trees differ in any byte disagree here.
     */
    repositoryHead: git(worldDir, ["rev-parse", "HEAD"]),
    startingTreeDigest: sha256(visibleFiles.map((relative) => `${relative}:${fileDigest(join(worldDir, relative))}`).join("\n")),
    targetSourceDigest: fileDigest(join(worldDir, scenario.sourceFile)),
    visibleTestDigest: visibleDigest,
    hiddenOracleDigest: sha256(acceptanceBytes),
    visibleFileCount: visibleFiles.length,
  });
}

/**
 * §14: the fields the within-block comparison actually uses. `repositoryHead` is deliberately excluded —
 * it is a per-run SHA, and comparing it would report every block as confounded for a reason that has
 * nothing to do with the experiment.
 */
export const PAIRED_STATE_COMPARABLE_FIELDS = Object.freeze([
  "scenarioId",
  "taskSemanticDigest",
  "startingTreeDigest",
  "targetSourceDigest",
  "visibleTestDigest",
  "hiddenOracleDigest",
  "visibleFileCount",
]);

/** The digest of the ORDINARY workTask text with the context-index section removed (§14/§27). */
export function ordinaryTaskDigest(promptText, indexHeading) {
  const cutAt = promptText.indexOf(indexHeading);
  const ordinary = cutAt === -1 ? promptText : promptText.slice(0, cutAt);
  return sha256(ordinary.replace(/^Base commit: .*$/mu, "Base commit: <masked>"));
}

/* ---------------------------------------------------------------- capital (§8) */

export { deriveCapital };
