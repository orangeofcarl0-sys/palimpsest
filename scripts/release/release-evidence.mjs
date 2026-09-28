/**
 * R0 §34 — MACHINE-READABLE RELEASE EVIDENCE.
 *
 * Emits a small manifest describing the release candidate: the commit, the stage ancestry, the
 * canonical command list and their expected counts, the architecture exception count, the public-API
 * result, and the package artifact identity.
 *
 * This is NOT a product store and NOT a new canonical owner. It is release evidence, written under
 * `release-evidence/` — a directory that holds exactly this kind of artifact already — and nothing in
 * `src/` reads it. Its only job is to make "what did we claim, and at which revision?" checkable
 * without re-reading a prose report.
 *
 * Counts that can only be obtained by RUNNING the suite are captured from a run, not invented: pass
 * them in through the environment, or the field is recorded as `not_captured` rather than guessed.
 *
 *   node scripts/release/release-evidence.mjs            # write release-evidence/r0-release-evidence.json
 *   node scripts/release/release-evidence.mjs --print     # write to stdout only
 */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PRINT_ONLY = process.argv.includes("--print");

const git = (...args) => execFileSync("git", args, { cwd: REPO, encoding: "utf8" }).trim();

/** The E0 → E-LIVE stage line, in order, each with its expected subject prefix. */
const STAGES = [
  { stage: "E0", subject: "docs(e0): close project production rebase and freeze E1-K" },
  { stage: "E1-K", subject: "feat(e1-k): capitalize governed knowledge into attempt context" },
  { stage: "E2-I", subject: "feat(e2-i): reconcile project intent from governed evidence" },
  { stage: "E3-C", subject: "feat(e3-c): close sovereign project collaboration loop" },
  { stage: "E4-L", subject: "feat(e4-l): close structural intervention learning loop" },
  { stage: "E5-P", subject: "feat(e5-p): capitalize project experience into reusable procedures" },
  { stage: "E-LIVE", subject: "test(e-live): prove long-horizon project intelligence compounding" },
];

/** Resolve each stage to the commit in the RC's history whose subject matches. */
function ancestry() {
  const log = git("log", "--format=%H%x09%s").split("\n").map((line) => {
    const [hash, ...rest] = line.split("\t");
    return { hash, subject: rest.join("\t") };
  });
  return STAGES.map(({ stage, subject }) => {
    const found = log.find((entry) => entry.subject === subject);
    return { stage, subject, commit: found?.hash ?? "MISSING", ancestorOfHead: found === undefined ? false : isAncestor(found.hash) };
  });
}

function isAncestor(commit) {
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", commit, "HEAD"], { cwd: REPO, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/** A count that only a real run can produce. Absent ⇒ recorded honestly, never invented. */
const captured = (name) => process.env[name]?.trim() || "not_captured";

const architectureBaseline = JSON.parse(
  execFileSync(process.execPath, ["-e", `process.stdout.write(require('fs').readFileSync(${JSON.stringify(join(REPO, "architecture", "module-architecture.json"))},'utf8'))`], { encoding: "utf8" }),
);

const pkg = JSON.parse(
  execFileSync(process.execPath, ["-e", `process.stdout.write(require('fs').readFileSync(${JSON.stringify(join(REPO, "package.json"))},'utf8'))`], { encoding: "utf8" }),
);

const manifest = {
  schemaVersion: 1,
  generatedBy: "scripts/release/release-evidence.mjs",
  /**
   * §10: this artifact states what it ATTEST. It is evidence ABOUT a code state, and that code state
   * is named explicitly rather than left implicit in "HEAD at generation time" — otherwise the
   * evidence commit would look like part of the product change it describes.
   */
  attests: {
    subjectCommit: captured("R0_ATTESTED_COMMIT"),
    subjectIs: "the code-state release candidate (the last commit that changed code, harness, packaging or tests)",
    thisArtifactIs: "an attestation ABOUT that commit, not a product-code change",
    evidenceCommitsAreNotProductCode: true,
  },
  releaseCandidate: {
    commit: git("rev-parse", "HEAD"),
    branch: git("rev-parse", "--abbrev-ref", "HEAD"),
    tree: git("rev-parse", "HEAD^{tree}"),
    baselinePreE: "9ec76ff2657706386d4cfd3e64eff60fd716d604",
    mergeBaseWithOriginMain: (() => {
      try {
        return git("merge-base", "HEAD", "origin/main");
      } catch {
        return "origin/main not fetched";
      }
    })(),
  },
  stageAncestry: ancestry(),
  canonicalCommands: [
    "pnpm build",
    "pnpm exec vitest run",
    "pnpm test:e2e",
    "pnpm architecture:check",
    "pnpm architecture:check-public-api",
    "pnpm gate:e1-k-live",
    "pnpm gate:e2-i-live",
    "pnpm gate:e3-c-live",
    "pnpm gate:e4-l-live",
    "pnpm gate:e5-p-live",
    "pnpm gate:e-live",
    "pnpm gate:d2-live",
    "pnpm gate:d4-live",
    "pnpm gate:d5-live",
    "pnpm release:consumer-smoke",
  ],
  expectedCounts: {
    unitTestFiles: captured("R0_UNIT_FILES"),
    unitTests: captured("R0_UNIT_TESTS"),
    unitErrors: captured("R0_UNIT_ERRORS"),
    e2e: captured("R0_E2E"),
    liveGates: {
      "gate:e1-k-live": captured("R0_GATE_E1K"),
      "gate:e2-i-live": captured("R0_GATE_E2I"),
      "gate:e3-c-live": captured("R0_GATE_E3C"),
      "gate:e4-l-live": captured("R0_GATE_E4L"),
      "gate:e5-p-live": captured("R0_GATE_E5P"),
      "gate:e-live": captured("R0_GATE_ELIVE"),
      "gate:d2-live": captured("R0_GATE_D2"),
      "gate:d4-live": captured("R0_GATE_D4"),
      "gate:d5-live": captured("R0_GATE_D5"),
    },
  },
  /**
   * R0-R §5: what remote CI actually ran. The E gates and the package smoke run on a stock Linux
   * runner; D2/D4/D5 need the private `@deepseek-ai/dsh` host and SKIP there, so their Linux behaviour
   * stays unverified and only their Windows evidence stands. Recording the distinction here keeps a
   * green CI badge from being read as broader coverage than it is.
   */
  remoteCi: {
    platform: captured("R0_CI_PLATFORM"),
    node: captured("R0_CI_NODE"),
    pnpm: captured("R0_CI_PNPM"),
    unitTests: captured("R0_CI_UNIT_TESTS"),
    e2e: captured("R0_CI_E2E"),
    gatesRunOnCi: ["gate:e1-k-live", "gate:e2-i-live", "gate:e3-c-live", "gate:e4-l-live", "gate:e5-p-live", "gate:e-live"],
    packageSmoke: captured("R0_CI_PACKAGE_SMOKE"),
    gatesSkippedWithoutDsh: ["gate:d2-live", "gate:d4-live", "gate:d5-live"],
    pullRequest: captured("R0_PR"),
  },
  architecture: {
    dependencyFirewalls: architectureBaseline.baseline.dependencyFirewalls.length,
    hotspotRatchets: architectureBaseline.baseline.hotspotRatchets.length,
    importerAllowlists: architectureBaseline.baseline.importerAllowlists.length,
    permittedForbiddenEdges: architectureBaseline.baseline.permittedForbiddenEdges.length,
    permittedCycles: architectureBaseline.baseline.permittedCycles.length,
    // The captured identity is frozen at SR-2; R0 promised not to move it and did not.
    capturedFrom: architectureBaseline.baseline.capturedFrom,
    capturedTree: architectureBaseline.baseline.capturedTree,
  },
  publicApi: {
    entrypoints: Object.keys(pkg.exports),
    result: captured("R0_PUBLIC_API"),
  },
  package: {
    name: pkg.name,
    version: pkg.version,
    private: pkg.private === true,
    // A tarball digest is only known after a pack; capture it rather than fabricate it.
    artifact: captured("R0_PACKAGE_ARTIFACT"),
    artifactSha256: captured("R0_PACKAGE_SHA256"),
  },
  knownFlakes: [
    {
      gate: "gate:d5-live",
      observedRate:
        "1 failure in 8 earlier local runs, then 20/20 PASS in a dedicated sequential reliability run",
      symptom: "the scheduler never offered TASK_STARTED for tb",
      detail:
        "D5 drives two sibling tasks and waits for the scheduler's own TASK_STARTED decision to point " +
        "at the task it is driving. Under load the decision can be offered for the sibling first, and " +
        "the gate's bounded wait then gives up. The single observed failure did not reproduce in 20 " +
        "consecutive runs, so it is isolated and non-reproducible. Neither D5 nor any product source " +
        "is touched by R0, so this is not an R0 regression; the D5 gate was NOT weakened.",
      classification: "KNOWN FLAKE, NONBLOCKING WITH EVIDENCE — no repeatable failure observed",
    },
  ],
  nodeFloor: {
    declared: ">=24.15.0",
    observedInterpreters: [
      { version: "v24.14.1", platform: "Windows (local)", satisfiesDeclaredFloor: false, fullMatrix: "passes" },
      { version: "v24.21.0", platform: "ubuntu-latest (CI)", satisfiesDeclaredFloor: true, fullMatrix: "passes" },
    ],
    classification: "DECLARED FLOOR SATISFIED BY A TESTED INTERPRETER, NECESSITY UNVERIFIED",
    action: "not lowered in this stage; a lower bound is a compatibility promise, not a reproducibility fix",
  },
  // R0-R §3.4: distinguish what was true WHEN the code-state RC was captured from what is true NOW.
  // The historical statement must not be rewritten as the tree moves; instead both are stated.
  outwardAction: {
    atCodeStateCapture: {
      meaning: "the state of the OUTWARD world at the moment the code-state RC commit was made",
      remoteBranch: "not pushed",
      pullRequest: "none",
      main: "unchanged (9ec76ff)",
      package: "unpublished",
    },
    current: captured("R0_OUTWARD_ACTION_CURRENT"),
    note:
      "The code-state RC is a LOCAL COMMIT; nothing about it was pushed when it was captured. A later " +
      "stage may push the branch or open a PR, and this field records that separately rather than " +
      "retroactively editing the historical claim.",
  },
};

const text = `${JSON.stringify(manifest, null, 2)}\n`;
if (PRINT_ONLY) {
  process.stdout.write(text);
} else {
  const target = join(REPO, "release-evidence", "r0-release-evidence.json");
  writeFileSync(target, text);
  process.stdout.write(`wrote ${target}\n`);
}
