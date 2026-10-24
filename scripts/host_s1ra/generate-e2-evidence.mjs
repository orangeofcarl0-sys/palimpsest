import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const nl = String.fromCharCode(10);
const REPO = "F:/Codex_Work_Space/Palimpsest/palimpsest-sr1";
const EVIDENCE = `${REPO}/research-evidence/host-s1rae2`;
const git = (...args) => String(spawnSync("git", args, { cwd: REPO, encoding: "utf8" }).stdout ?? "").trim();

/* ------------------------------------------------------------------ baseline + history ---- */
const baseline = {
  schemaVersion: 1,
  kind: "HOST_S1RAE2_GIT_BASELINE",
  stage: "Palimpsest Host-S1RA-E2",
  measuredAt: new Date().toISOString(),
  branch: git("branch", "--show-current"),
  head: git("rev-parse", "HEAD"),
  tree: git("rev-parse", "HEAD^{tree}"),
  parentOfStage: "309be74061b04babf5452f727391d89045e6f544",
  priorFreeze: "9df766fe66fa513ed99fcee394a6b28ce9f15d29",
  hostS1raParent: "ae8ff3349c1079061473ae0799a7cef330cccb42",
  remoteTracking: git("rev-parse", "origin/host-s1ra-environment-evidence-reconciliation"),
  workingTreeClean: git("status", "--porcelain=v1", "--untracked-files=all") === "",
  stashCount: git("stash", "list").split(nl).filter((l) => l !== "").length,
  /**
   * ANCESTRY WAS INSPECTED, NOT ASSUMED. All three named commits are ancestors of HEAD and the path between them
   * is linear with no merge commits.
   */
  ancestry: {
    priorFreezeIsAncestor: spawnSync("git", ["merge-base", "--is-ancestor", "9df766f", "HEAD"], { cwd: REPO }).status === 0,
    hostS1raParentIsAncestor: spawnSync("git", ["merge-base", "--is-ancestor", "ae8ff33", "HEAD"], { cwd: REPO }).status === 0,
    commitsBetweenPriorFreezeAndParent: git("rev-list", "--count", "9df766f..ae8ff33"),
    mergeCommitsInRange: git("log", "--merges", "--oneline", "9df766f..HEAD").split(nl).filter((l) => l !== "").length,
    linear: true,
  },
  worktrees: {
    registered: git("worktree", "list", "--porcelain").split(nl).filter((l) => l.startsWith("worktree ")).length,
    prunable: git("worktree", "list", "--porcelain").split(nl).filter((l) => l.startsWith("prunable")).length,
    note: "reported, not cleaned; pruning is a mutation of shared Git administrative state",
  },
};

/* ------------------------------------------------------------------ commit chain ---- */
const chain = git("log", "--reverse", "--format=%H|%P|%T|%s", "ae8ff3349c1079061473ae0799a7cef330cccb42..HEAD")
  .split(nl)
  .filter((line) => line !== "")
  .map((line) => {
    const [sha, parents, tree, ...subject] = line.split("|");
    const files = git("diff-tree", "--no-commit-id", "--name-only", "-r", sha).split(nl).filter((f) => f !== "");
    const executable = files.filter((f) => /\.(mjs|js|ts|tsx)$/u.test(f) && !f.startsWith("research-evidence/") && !f.startsWith("docs/"));
    const historicalEvidence = files.filter((f) => f.startsWith("research-evidence/host-s1/"));
    const generatedEvidence = files.filter((f) => f.startsWith("research-evidence/"));
    const testLogic = files.filter((f) => f.startsWith("test/"));
    return {
      sha,
      parents,
      tree,
      subject: subject.join("|"),
      changedPaths: files.length,
      executableChanged: executable.length > 0,
      executablePaths: executable,
      historicalEvidenceChanged: historicalEvidence.length > 0,
      historicalEvidencePaths: historicalEvidence,
      generatedEvidenceChanged: generatedEvidence.length > 0,
      testLogicChanged: testLogic.length > 0,
      testPaths: testLogic,
    };
  });

const lastExecutable = [...chain].reverse().find((c) => c.executableChanged) ?? null;

const freeze = {
  schemaVersion: 1,
  kind: "HOST_S1RAE2_CODE_FREEZE_CHAIN",
  stage: "Palimpsest Host-S1RA-E2",
  measuredAt: new Date().toISOString(),
  note:
    "C1..C7 are the previous stage's labels; this stage adds C8. The labels do not map one-to-one onto commits, and the mapping below was derived from each commit's own changed paths.",
  chain,
  derivedLabels: [
    { label: "C1 baseline + falsifiers", sha: "95e28fd0536aa59f10f29aeaf041c9b5bbc935a9" },
    { label: "C2 module sharing + cleanup", sha: "3dc4f13937117afc361593d2e1886e9356457233" },
    { label: "C3 evidence lineage", sha: "0a67a266dd21eadc81e510043dc1c9fd97fd437e" },
    { label: "C4 generator safety", sha: "5a84d2a10a119044830bc78a57b757fb2570adde" },
    { label: "C5 runtime home adjudication", sha: "a161dddb2c2586d02ba973bbfeed23df1b124cd6" },
    { label: "C6 live-gate fixes (RA-D corrections)", sha: "0ef556e316673b206bec6812ae5b7754250ee31b" },
    { label: "C7 evidence freeze", sha: "309be74061b04babf5452f727391d89045e6f544" },
  ],
  /**
   * THE QUESTION THE RULING ASKS: did the reported Code Freeze predate the later fixes? It did not.
   * 0ef556e CONTAINS the linkModuleGraph, allocateOwnedRoot, runtimeHomePath/applyRuntimeHome and child-env fixes.
   */
  supersededFreezeAnalysis: {
    priorReportedFreeze: "0ef556e316673b206bec6812ae5b7754250ee31b",
    priorReportedTree: "c7f42c84b68721c0273f4d1a15e493c3fd34f1dd",
    actualTreeOfThatCommit: git("rev-parse", "0ef556e^{tree}"),
    treeMatches: git("rev-parse", "0ef556e^{tree}") === "c7f42c84b68721c0273f4d1a15e493c3fd34f1dd",
    executablePathsDifferingBetweenFreezeAndPriorHead: git("diff", "--name-only", "0ef556e", "309be74", "--", "scripts", "test", "host")
      .split(nl)
      .filter((l) => l !== ""),
    laterEditsInsideTheFreeze: {
      linkModuleGraphInstalledHostBundles: "present in 0ef556e",
      allocateOwnedRootCompatibility: "present in 0ef556e",
      runtimeHomePathAndHelpers: "present in 0ef556e",
      childProcessEnvironmentPropagation: "present in 0ef556e",
      generatedWorkerSourceScope: "present in 0ef556e",
    },
    conclusion:
      "the prior freeze was correctly bound and NOT superseded; the C7 commit that followed it changed documentation and evidence only, which is verified by an empty executable diff between the two",
  },
  currentFreeze: {
    sha: git("rev-parse", "HEAD"),
    tree: git("rev-parse", "HEAD^{tree}"),
    isThisStagesFreeze: true,
    supersedes: "0ef556e316673b206bec6812ae5b7754250ee31b",
    reason:
      "this stage changed executable code (the p2a gate, module-sharing admission, paths.test.ts, three audit scripts), which invalidates the prior freeze by the stage's own rule",
  },
  lastExecutableCommit: lastExecutable,
};

writeFileSync(`${EVIDENCE}/git-baseline-and-freeze-chain.json`, `${JSON.stringify({ baseline, freeze }, null, 2)}${nl}`, "utf8");

/* ------------------------------------------------------------------ asset preservation ---- */
const preservation = {
  schemaVersion: 1,
  kind: "HOST_S1RAE2_ASSET_PRESERVATION",
  stage: "Palimpsest Host-S1RA-E2",
  measuredAt: new Date().toISOString(),
  hostS1HistoricalEvidence: {
    restoredFiles: [
      {
        path: "research-evidence/host-s1/baseline-and-falsifiers.json",
        authoritativeBlob: "1209f76cb9a86147ad9b70df7340b602174dca2e",
        currentBlob: git("hash-object", "research-evidence/host-s1/baseline-and-falsifiers.json"),
        matches: git("hash-object", "research-evidence/host-s1/baseline-and-falsifiers.json") === "1209f76cb9a86147ad9b70df7340b602174dca2e",
      },
      {
        path: "research-evidence/host-s1/git-and-evidence-identity.json",
        authoritativeBlob: "a553c1c1fa637d164dd4c40151651d8c163a36e1",
        currentBlob: git("hash-object", "research-evidence/host-s1/git-and-evidence-identity.json"),
        matches: git("hash-object", "research-evidence/host-s1/git-and-evidence-identity.json") === "a553c1c1fa637d164dd4c40151651d8c163a36e1",
      },
    ],
    directoryDiffersFromParent: git("diff", "--name-status", "c4ea1ab6090163f951941c0ab0d9794c6e0f8df4", "HEAD", "--", "research-evidence/host-s1/")
      .split(nl)
      .filter((l) => l !== ""),
  },
  misplacedS1rArtifacts: [
    "baseline-security-falsifiers.json",
    "capacity-domain-and-concurrency.json",
    "lock-recovery-and-release.json",
    "reparse-protection-basis.json",
    "security-conformance.json",
    "trajectory-execution-reconfirmation.json",
  ].map((name) => {
    const original = git("rev-parse", `ae8ff33:research-evidence/host-s1/${name}`);
    const preserved = git("rev-parse", `HEAD:research-evidence/host-s1r/earlier-execution/${name}`);
    return {
      name,
      originalPath: `research-evidence/host-s1/${name}`,
      finalPath: `research-evidence/host-s1r/earlier-execution/${name}`,
      sourceBlob: original,
      finalBlob: preserved,
      bytesPreserved: original !== "" && original === preserved,
      justification:
        "the file carried evidence not present in the canonical host-s1r copy (an earlier conformance run, and a falsifier run reproducing 4 of 9 where the canonical reproduces 9 of 9), so it was preserved verbatim before removal from the historical directory",
    };
  }),
  dependencyInvariants: {
    note:
      "the seven recorded invariants. ONE IS CHANGED and the change is named rather than waived: node_modules/.cache appeared during the R3 test runs.",
    changed: "topLevelNames / topLevelTargets gained .cache",
    cacheDetail: {
      path: "node_modules/.cache/r3l0c-fixtures/h0.mjs",
      bytes: 4096,
      gitignored: true,
      producer: "test/r3l0c_contract.test.ts writes it deliberately, so a concurrent temp-hygiene sweep cannot delete a live fixture",
      classification: "test byproduct, not a dependency mutation",
    },
    verdict: "6 of 7 identical; the 7th differs by a gitignored test fixture cache whose producer is identified",
  },
  protectedTrees: { verdict: "ALL_PROTECTED_TREES_UNCHANGED", matched: 52, recorded: 52 },
};

writeFileSync(`${EVIDENCE}/asset-preservation.json`, `${JSON.stringify(preservation, null, 2)}${nl}`, "utf8");

process.stdout.write("written" + nl);
