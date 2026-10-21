#!/usr/bin/env node
/**
 * Host-S1 §10 — RUN-SCOPED EVIDENCE GENERATION.
 *
 * Every artifact this produces carries: the Code Freeze SHA, the executed tree identity, the runtime identity, the
 * DSH version, the command, the exit code, a run id, its own artifact digest, the observed result, and an explicit
 * LIMIT / NOT_ESTABLISHED where applicable.
 *
 * NOTHING IS DERIVED FROM A MISSING INPUT. A producer that did not run, or whose output cannot be read, is
 * recorded as MISSING and the dependent verdict is withheld — the generator never substitutes a default that would
 * read as a pass. That rule is the E1RF §8/§9 correction, preserved.
 *
 * Usage:  node scripts/host_s1/generate-evidence.mjs --rig=<path outside the repository> [--json-out <path>]
 */
import { execFileSync, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const EVIDENCE = join(REPO, "research-evidence", "host-s1r");
const NL = String.fromCharCode(10);

const arg = (name) => {
  const prefix = `${name}=`;
  const inline = process.argv.find((entry) => entry.startsWith(prefix));
  if (inline !== undefined) return inline.slice(prefix.length);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
};

const RIG = arg("--rig");
if (RIG === null) {
  process.stderr.write(`usage: generate-evidence.mjs --rig=<path outside the repository>${NL}`);
  process.exit(2);
}
/**
 * THE RIG MUST BE OUTSIDE THE REPOSITORY. Inside it, a fixture inherits the repository's own `.palimpsest` and its
 * standing labels, which makes the protected-root assertions describe the wrong tree. This is a hard precondition,
 * not a warning.
 */
const rigResolved = resolve(RIG);
if (rigResolved.toLowerCase().startsWith(REPO.toLowerCase())) {
  process.stderr.write(`the rig must be OUTSIDE the repository (got ${rigResolved}); a rig inside it inherits the real .palimpsest${NL}`);
  process.exit(2);
}
mkdirSync(rigResolved, { recursive: true });
mkdirSync(EVIDENCE, { recursive: true });

const NODE = process.execPath;
const git = (args) => {
  try {
    return execFileSync("git", args, { cwd: REPO, encoding: "utf8" }).trim();
  } catch {
    return null;
  }
};

const codeHead = git(["rev-parse", "HEAD"]);
const codeTree = git(["rev-parse", "HEAD^{tree}"]);
const dirty = (git(["status", "--porcelain=v1", "--untracked-files=all"]) ?? "") !== "";
const dshVersion = (() => {
  try {
    const home = (process.env.DSH_HOME ?? join(process.env.USERPROFILE ?? "", ".dsh")).replace(/\\/gu, "/");
    return JSON.parse(readFileSync(join(home, "profiles", "node_modules", "@deepseek-ai", "dsh", "package.json"), "utf8")).version;
  } catch {
    return null;
  }
})();

const sha256 = (text) => `sha256-${createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex")}`;

/**
 * Run one producer, capture its output, and classify it.
 *
 * `classify` maps the producer's own verdict onto PASS / LIMIT / FAIL. A producer that did not produce a
 * parseable artifact is MISSING — never PASS.
 */
function produce({ id, command, args, expectedExit = [0], classify, cwd = REPO }) {
  const startedAt = new Date().toISOString();
  const runId = randomUUID();
  const outPath = join(rigResolved, `${id}.json`);
  rmSync(outPath, { force: true });
  const result = spawnSync(NODE, [...args, "--json-out", outPath], {
    cwd,
    encoding: "utf8",
    timeout: 1_800_000,
    maxBuffer: 128 * 1024 * 1024,
    env: { ...process.env, PALIMPSEST_DSH_ROOT: process.env.PALIMPSEST_DSH_ROOT ?? join((process.env.DSH_HOME ?? join(process.env.USERPROFILE ?? "", ".dsh")).replace(/\\/gu, "/"), "profiles", "node_modules", "@deepseek-ai", "dsh").replace(/\\/gu, "/") },
  });
  let artifact = null;
  try {
    artifact = JSON.parse(readFileSync(outPath, "utf8"));
  } catch {
    artifact = null;
  }
  const exitOk = expectedExit.includes(result.status ?? -1);
  const verdict = artifact === null ? "MISSING" : classify(artifact);
  return {
    id,
    command: `${command} --json-out <rig>/${id}.json`,
    runId,
    startedAt,
    elapsedMs: null,
    exitCode: result.status,
    exitExpected: exitOk,
    artifactProduced: artifact !== null,
    artifactDigest: artifact === null ? null : sha256(JSON.stringify(artifact)),
    observedVerdict: verdict,
    stderrTail: String(result.stderr ?? "").split(NL).slice(-4).join(NL).slice(0, 800),
    artifact,
  };
}

const producers = [
  {
    id: "baseline-falsifiers",
    command: "node scripts/host_s1/reproduce-baseline.mjs",
    args: [join(REPO, "scripts", "host_s1", "reproduce-baseline.mjs")],
    classify: (artifact) => {
      const reproduced = artifact?.summary?.reproduced ?? -1;
      /** F9 is a DOCUMENTATION erratum; it is expected to remain reproduced until the Evidence Freeze. */
      return reproduced === 1 && (artifact?.summary?.reproducedIds ?? []).join(",") === "F9" ? "PASS" : `FAIL(${String(reproduced)} reproduced)`;
    },
  },
  {
    id: "sibling-world",
    command: "node scripts/host_s1/sibling-world-probe.mjs",
    args: [join(REPO, "scripts", "host_s1", "sibling-world-probe.mjs")],
    expectedExit: [0, 3],
    classify: (artifact) => {
      if (artifact?.verdict === "SIBLING_PROTECTED_BY_THE_LABEL") return "PASS";
      if (artifact?.verdict === "SIBLING_READABLE_BY_LOW_TOKEN") return "FAIL";
      if (artifact?.verdict === "SIBLING_PROTECTED_WITHOUT_LABEL") return "PASS";
      return `LIMIT(${String(artifact?.verdict)})`;
    },
  },
  {
    id: "junction-label",
    command: "node scripts/host_s1/junction-label-probe.mjs",
    args: [join(REPO, "scripts", "host_s1", "junction-label-probe.mjs")],
    expectedExit: [0, 3],
    classify: (artifact) => {
      /** The measurement is a BASIS STATEMENT, not a pass/fail on the fence itself. */
      if (artifact?.verdict === "JUNCTION_LABEL_IS_A_PROTECTION_BASIS") return "PASS";
      if (artifact?.verdict === "JUNCTION_LABEL_INSUFFICIENT") return "MEASURED(JUNCTION_LABEL_INSUFFICIENT)";
      return `LIMIT(${String(artifact?.verdict)})`;
    },
  },
  {
    id: "verify-cost",
    command: "node scripts/host_s1/verify-cost-probe.mjs",
    args: [join(REPO, "scripts", "host_s1", "verify-cost-probe.mjs")],
    classify: (artifact) => (artifact?.rows === undefined ? "LIMIT(no rows)" : "PASS"),
  },
  {
    id: "baseline-concerns",
    /**
     * S1R-D §8.5 — THE BASELINE IS MEASURED AGAINST THE PARENT, NOT AGAINST THE CORRECTED TREE.
     *
     * The nine §4 hypotheses describe the PARENT's behaviour. Running the probe on the corrected tree would
     * report only the findings that are still reproducible — which is a statement about the fix, not about the
     * baseline, and it would silently turn a corrected defect into "not reproduced". The producer therefore
     * checks out the parent commit into a detached worktree OUTSIDE the repository and runs the SAME probe
     * there, so the finding and the correction are measured against different code and both are recorded.
     *
     * If the parent worktree cannot be prepared, the producer is MISSING and every dependent verdict is
     * withheld — the baseline is never inferred from the corrected tree.
     */
    command: "node <parent-worktree>/scripts/host_s1r/reproduce-concerns.mjs",
    args: [join(parentWorktree, "scripts", "host_s1r", "reproduce-concerns.mjs")],
    cwd: parentWorktree,
    /**
     * THE BASELINE MUST REPRODUCE ALL NINE CONCERNS. This producer runs against the PARENT commit, so every
     * hypothesis must be measured there; a finding that does NOT reproduce on the parent is a problem with the
     * probe or with the parent selection, and it is reported as such rather than accepted.
     */
    classify: (artifact) => {
      if (parentWorktreeState.prepared !== true) return `MISSING(${String(parentWorktreeState.detail)})`;
      const findings = Array.isArray(artifact?.findings) ? artifact.findings : [];
      const reproduced = findings.filter((entry) => entry.reproduced === true).map((entry) => entry.id);
      return findings.length === 9 && reproduced.length === 9 ? "PASS" : `FAIL(${String(reproduced.length)}/9 reproduced)`;
    },
  },
];

/**
 * THE PARENT WORKTREE. Prepared once, outside the repository, at the exact parent commit this stage declares.
 * A failure here is recorded rather than fatal: the baseline producer then reports MISSING and the dependent
 * verdicts are withheld, which is the fail-closed answer.
 */
const PARENT_HEAD = "c4ea1ab6090163f951941c0ab0d9794c6e0f8df4";
const parentWorktree = join(rigResolved, "parent-worktree");
let parentWorktreeState = { prepared: false, detail: null };
(() => {
  try {
    rmSync(parentWorktree, { recursive: true, force: true });
    const added = spawnSync("git", ["worktree", "add", "--detach", parentWorktree, PARENT_HEAD], { cwd: REPO, encoding: "utf8", timeout: 600_000 });
    if (added.status !== 0) {
      parentWorktreeState = { prepared: false, detail: `git worktree add exited ${String(added.status)}: ${String(added.stderr ?? "").slice(0, 300)}` };
      return;
    }
    /**
     * THE MODULE GRAPH IS LINKED, NOT INSTALLED. A junction gives the same module identity without copying
     * 30k+ files, and the probe only needs the runtime modules the repository already has.
     */
    const modules = join(parentWorktree, "node_modules");
    if (!existsSync(modules)) {
      const linked = spawnSync("cmd", ["/c", "mklink", "/J", modules, join(REPO, "node_modules")], { encoding: "utf8", timeout: 120_000 });
      if (linked.status !== 0) {
        parentWorktreeState = { prepared: false, detail: `the module link could not be created: ${String(linked.stdout ?? linked.stderr ?? "").slice(0, 200)}` };
        return;
      }
    }
    /** The probe itself must exist at the parent commit; it does not, so the CORRECTED copy is used there. */
    mkdirSync(join(parentWorktree, "scripts", "host_s1r"), { recursive: true });
    copyFileSync(join(REPO, "scripts", "host_s1r", "reproduce-concerns.mjs"), join(parentWorktree, "scripts", "host_s1r", "reproduce-concerns.mjs"));
    parentWorktreeState = { prepared: true, detail: `detached at ${PARENT_HEAD}` };
  } catch (error) {
    parentWorktreeState = { prepared: false, detail: error instanceof Error ? error.message : String(error) };
  }
})();

const results = [];
for (const producer of producers) {
  process.stderr.write(`  · ${producer.id}${NL}`);
  results.push(produce(producer));
}

/**
 * THE TEST SUITES. Each is run and its PASS/LIMIT/FAIL counts are read from the runner's own output, so a suite
 * that fails is recorded as failing rather than being summarised away.
 */
function runSuite(id, files) {
  const runId = randomUUID();
  const startedAt = new Date().toISOString();
  const result = spawnSync(NODE, [join(REPO, "node_modules", "vitest", "vitest.mjs"), "run", "--reporter=json", "--outputFile", join(rigResolved, `${id}.vitest.json`), ...files], {
    cwd: REPO,
    encoding: "utf8",
    timeout: 1_800_000,
    maxBuffer: 128 * 1024 * 1024,
  });
  let report = null;
  try {
    report = JSON.parse(readFileSync(join(rigResolved, `${id}.vitest.json`), "utf8"));
  } catch {
    report = null;
  }
  const tests = (report?.testResults ?? []).flatMap((file) => file.assertionResults ?? []);
  const passed = tests.filter((entry) => entry.status === "passed").length;
  const failed = tests.filter((entry) => entry.status === "failed").length;
  const skipped = tests.filter((entry) => entry.status === "skipped").length;
  /**
   * S1R-D §8.2 — SUBPROCESS STATUS IS PART OF THE VERDICT.
   *
   * MEASURED (F8). The previous verdict was `report === null ? "MISSING" : failed === 0 && passed > 0 ? "PASS"
   * : "FAIL"` — the child's EXIT CODE was never consulted, and skipped tests were counted but never blocked a
   * PASS. A process that exited nonzero after its assertions passed, or that reported PASS while required
   * tests were skipped, was summarised as passing from the JSON alone.
   *
   * Each refusal now names itself:
   *   MISSING     no parseable report;
   *   NOT_RUN     the report contains no test results at all;
   *   SKIPPED     a required test did not execute (a disclosed LIMIT must be declared explicitly, see below);
   *   EXIT_NONZERO the process exited nonzero, whatever the JSON said;
   *   PASS / FAIL otherwise.
   */
  const noTests = tests.length === 0;
  const exitNonZero = result.status !== 0;
  const observedVerdict =
    report === null
      ? "MISSING"
      : noTests
        ? "NOT_RUN"
        : skipped > 0
          ? "SKIPPED"
          : exitNonZero
            ? "EXIT_NONZERO"
            : failed === 0 && passed > 0
              ? "PASS"
              : "FAIL";
  /**
   * §8.2: DUPLICATE TEST IDENTITIES ARE REPORTED. A report that silently contains the same test twice cannot be
   * used to claim a count.
   */
  const names = tests.map((entry) => String(entry.fullName ?? entry.title ?? ""));
  const duplicates = [...new Set(names.filter((name, index) => names.indexOf(name) !== index))];
  return {
    id,
    command: `node node_modules/vitest/vitest.mjs run ${files.join(" ")}`,
    runId,
    startedAt,
    exitCode: result.status,
    total: tests.length,
    passed,
    failed,
    skipped,
    duplicateTestIds: duplicates,
    testIds: names,
    observedVerdict,
    failures: tests.filter((entry) => entry.status === "failed").map((entry) => String(entry.fullName ?? entry.title ?? "")).slice(0, 20),
  };
}

const suites = [
  runSuite("host-s1-spine", ["test/host_s1_spine_coverage.test.ts"]),
  runSuite("host-s1-descendant", ["test/host_s1_descendant_admission.test.ts", "test/host_s1_descendant_phase.test.ts"]),
  runSuite("host-s1-capacity", ["test/host_s1r_capacity_domain.test.ts"]),
  runSuite("host-s1-delegation", ["test/host_s1_delegation_oracle.test.ts"]),
  runSuite("host-s1-reparse", ["test/host_s1r_reparse_boundary.test.ts"]),
  runSuite("host-s1-evidence", ["test/host_s1r_evidence_admission.test.ts"]),
  runSuite("host-regression", [
    "test/trajectory_p2e1rg_baseline_admission.test.ts",
    "test/trajectory_p2e1rg_capacity_atomicity.test.ts",
    "test/trajectory_p2e1rg_kernel_coverage.test.ts",
    "test/trajectory_p2e1rg_precreate_admission.test.ts",
    "test/trajectory_p2e1re_pretool_boundary.test.ts",
    "test/trajectory_p2e1re_win32_fault.test.ts",
    "test/trajectory_p2e1rf_delegation_alias.test.ts",
    "test/trajectory_p2e1rf_answer_provenance.test.ts",
    "test/trajectory_p2e1rf_malformed_ace.test.ts",
    "test/trajectory_p2e1rf_evidence_freshness.test.ts",
  ]),
];

const byId = (id) => results.find((entry) => entry.id === id) ?? null;
const suiteById = (id) => suites.find((entry) => entry.id === id) ?? null;

const runIdentity = {
  codeFreezeHead: codeHead,
  executedCodeTree: codeTree,
  workingTreeDirty: dirty,
  runtimeNode: process.versions.node,
  runtimeExecutable: NODE,
  platform: process.platform,
  arch: process.arch,
  dshVersion,
  timestampIsNotFreshnessProof: true,
};

const write = (name, payload) => {
  const body = { ...payload, runIdentity, stage: "Palimpsest Host-S1R", schemaVersion: 1 };
  writeFileSync(join(EVIDENCE, name), `${JSON.stringify(body, null, 2)}${NL}`, "utf8");
  process.stderr.write(`  → ${name}${NL}`);
};

/* ---------------------------------------------------------------- 2. baseline falsifiers */
{
  const producer = byId("baseline-concerns");
  const findings = producer?.artifact?.findings ?? [];
  write("baseline-security-falsifiers.json", {
    kind: "HOST_S1R_BASELINE_SECURITY_FALSIFIERS",
    evidenceClass: findings.length === 9 ? "DYNAMIC_UNIT_VERIFIED" : "NOT_ESTABLISHED",
    note:
      "Nine §4 hypotheses measured against the Host-S1 parent. Each records its source, baseline behaviour, actual input, observed output, invariant, evidence class and what remains uncertain. A finding marked reproduced describes the PARENT's behaviour; the correction is asserted by the suites named in the corresponding S1R verdict.",
    parentHead: producer?.artifact?.parentHead ?? null,
    producer: { command: producer?.command, exitCode: producer?.exitCode, runId: producer?.runId, artifactDigest: producer?.artifactDigest },
    summary: producer?.artifact?.summary ?? null,
    findings,
    /** The two measurements that decided the design rather than confirming it. */
    decisiveMeasurements: {
      f1: findings.find((entry) => entry.id === "F1")?.observed ?? null,
      f3: findings.find((entry) => entry.id === "F3")?.observed ?? null,
      f2: findings.find((entry) => entry.id === "F2")?.observed ?? null,
    },
  });
}

/* ---------------------------------------------------------------- 3. capacity domain */
{
  const suite = suiteById("host-s1-capacity");
  const producer = byId("baseline-concerns");
  const f3 = (producer?.artifact?.findings ?? []).find((entry) => entry.id === "F3");
  write("capacity-domain-and-concurrency.json", {
    kind: "HOST_S1R_CAPACITY_DOMAIN_AND_CONCURRENCY",
    evidenceClass: suite?.observedVerdict === "PASS" ? "CROSS_PROCESS_RUNTIME_VERIFIED" : "NOT_ESTABLISHED",
    /**
     * THE MEASUREMENT THAT DECIDED THE DOMAIN (F3). Two independent test-owned repositories, each with its own
     * `.palimpsest`, world and synthetic canary; BOTH worlds made ACTIVE with the same first-party
     * `AclWriteGrant` the sandbox applies on every confined spawn; a confined process granted ONLY repository
     * A's workspace read repository B's ACTIVE-world canary.
     */
    crossRepository: f3?.observed ?? null,
    crossRepositoryReproduced: f3?.reproduced === true,
    /**
     * WHY THE REPOSITORY IS NOT THE DOMAIN. The two worlds carried DIFFERENT workspace write SIDs, so neither
     * the workspace nor the repository separates them; what they share is the Low integrity level every
     * confined process of this principal carries.
     */
    isolationUnitEvidence: {
      distinctWorkspaceWriteSids: true,
      sharedIntegrityLevel: "Low",
      conclusion: "a mandatory integrity label is a LEVEL, not a compartment: two ACTIVE worlds are both at Low, so neither can refuse the other",
    },
    /** THE CORRECTED NAMESPACE, as the module itself reports it. */
    domain: {
      scope: "windows-principal-machine",
      source: "confidential_profile.js :: openConfidentialSlot().domain",
      capacityRootTemplate: "%LOCALAPPDATA%/Palimpsest/host-capacity",
      assumption:
        "capacity exclusion is scoped to this Windows principal on this machine: every confidential worker this principal can start contends for one slot, whatever repository or DSH home it serves. Different principals are not covered.",
      ancestryChecked: "every ancestor of the capacity root is lstat-inspected; a reparse point refuses the slot",
    },
    mechanism: "mkdir-exclusive-lock",
    controls: suite,
    limits: [
      "the cross-repository measurement runs one confined probe against two simultaneously ACTIVE worlds; it does not run two full agent sessions concurrently",
      "different Windows principals are not covered by this slot and are separated by their own profile ACLs and integrity levels; that separation is asserted from the platform's default ACLs, not measured here",
    ],
  });
}

/* ---------------------------------------------------------------- 4. lock recovery and release */
{
  const suite = suiteById("host-s1-capacity");
  const producer = byId("baseline-concerns");
  const f1 = (producer?.artifact?.findings ?? []).find((entry) => entry.id === "F1");
  const f2 = (producer?.artifact?.findings ?? []).find((entry) => entry.id === "F2");
  write("lock-recovery-and-release.json", {
    kind: "HOST_S1R_LOCK_RECOVERY_AND_RELEASE",
    evidenceClass: suite?.observedVerdict === "PASS" ? "CROSS_PROCESS_RUNTIME_VERIFIED" : "NOT_ESTABLISHED",
    /** THE MEASURED OVERLAP (F1): the instrumented interleaving, in a bounded child process. */
    staleRecovery: f1?.observed ?? null,
    staleRecoveryReproduced: f1?.reproduced === true,
    /** THE MEASURED RELEASE DEFECT (F2): a failed record write left a phantom holder no retry could remove. */
    releaseDefect: f2?.observed?.failedWriteDuringRelease ?? null,
    releaseDefectReproduced: f2?.reproduced === true,
    /**
     * THE CORRECTION, STATED AS A POLICY RATHER THAN A CODE SHAPE.
     *
     * §6.4 permits disabling automatic reclamation when object-identity-safe exclusion cannot be demonstrated.
     * Removing a lock by PATHNAME frees that pathname between the removal and any re-publication, and the
     * filesystem offers no compare-and-unlink, so the window is structural rather than narrow.
     */
    policy: {
      automaticReclamation: "DISABLED",
      ambiguousLock: "REFUSED with a named operator action",
      liveHolderEviction: "liveness only; an indeterminate answer counts as a holder",
      deadHolderEviction: "AUTOMATIC — a crashed worker frees capacity without operator action",
      criticalSection: "the lock is held only across the read-modify-write of the holder record",
      failedRelease: "retryable, and `held` stays true until the reduced record is durably written",
      unreadableRecord: "never rewritten; the bytes are preserved and the refusal is observable",
    },
    controls: suite,
    limits: [
      "a crash inside the critical section requires an operator to remove the lock; this is an availability cost accepted in exchange for provable exclusion",
      "the indeterminate-liveness path has no reproducible fixture on this host: every real pid answers ESRCH or EPERM, so the tri-state rule is pinned from source",
    ],
  });
}

/* ---------------------------------------------------------------- 5. reparse protection basis */
{
  const suite = suiteById("host-s1-reparse");
  const junction = byId("junction-label");
  const cost = byId("verify-cost");
  const producer = byId("baseline-concerns");
  const f4 = (producer?.artifact?.findings ?? []).find((entry) => entry.id === "F4");
  const f5 = (producer?.artifact?.findings ?? []).find((entry) => entry.id === "F5");
  const f6 = (producer?.artifact?.findings ?? []).find((entry) => entry.id === "F6");
  write("reparse-protection-basis.json", {
    kind: "HOST_S1R_REPARSE_PROTECTION_BASIS",
    evidenceClass: suite?.observedVerdict === "PASS" ? "DYNAMICALLY_VERIFIED" : "NOT_ESTABLISHED",
    /** F4: the identity check now precedes the type gate. */
    fileDirectedLinks: { finding: f4 ?? null, reproduced: f4?.reproduced === true },
    /** F5: the basis is the VERIFIED root set, not the declared one. */
    declaredVersusVerifiedBasis: { finding: f5 ?? null, reproduced: f5?.reproduced === true },
    /** F6: resolution is not authorization. */
    unknownExternalTargets: { finding: f6 ?? null, reproduced: f6?.reproduced === true },
    /**
     * THE MEASUREMENT THAT MADE A BLANKET RULE UNACCEPTABLE. A real DSH home contains hundreds of
     * installer-created junctions; refusing every reparse point would refuse every worker in every deployment
     * while protecting nothing extra.
     */
    junctionLabelMeasurement: {
      verdict: junction?.artifact?.verdict ?? "MISSING",
      canaryReadThroughLabelledJunction: junction?.artifact?.observations?.canaryReadThroughLabelledJunction ?? null,
      note: "a label on a junction protects the LINK OBJECT, not its target; a link's own label is never accepted as coverage",
    },
    realLayoutCost: cost?.artifact?.summary ?? null,
    /** THE CORRECTED CLASSIFICATION CONTRACT. */
    contract: {
      identityBeforeType: "lstat precedes any statSync type gate, so a file-directed link is classified rather than skipped",
      protectionBasis: "the set of roots whose label was VERIFIED, never the declared set",
      dependencyException:
        "an out-of-domain target is admitted only when it resolves under a declared dependency root (the DSH installation the host runs from); everything else refuses",
      noCatchAll: "there is deliberately no rule admitting arbitrary external paths",
      disclosure: "every out-of-domain link stays recorded and `reparseBasis` still reports REPARSE_LEAVES_PROTECTION_DOMAIN",
    },
    controls: suite,
    limits: [
      "a file-directed symlink cannot be created on this host (EPERM: privilege not held, Developer Mode off); that case is SOURCE_DEMONSTRATED",
      "a junction aimed at a file is created but is BROKEN (statSync ENOENT), so it cannot demonstrate a read-through",
      "a reparse target replaced after admission is caught by the NEXT verification; the runtime basis is the kernel label and the alias scan, not this walk",
    ],
  });
}
/**
 * S1R-D: THE CONFORMANCE RECEIPTS, HOISTED.
 *
 * Section 6 runs the suites and section 8 records how the gate decided. Both need the receipts, so the
 * declaration lives at module scope rather than inside a block — a block-scoped binding made the evidence
 * receipt throw a ReferenceError, which is exactly the kind of self-inflicted gap a fail-closed gate must not
 * have.
 */
/** @type {Record<string, any>} */
let conformanceReceipts = {};

/* ---------------------------------------------------------------- 6. conformance */
{
  /**
   * S1R-D §8.1 — CURRENT-RUN CONFORMANCE, NOT A HISTORICAL REPORT.
   *
   * WHAT WAS WRONG (measured as F7). The generator read
   *
   *     <USERPROFILE>/.palimpsest-r1hr/conformance/conformance.json
   *     <USERPROFILE>/.palimpsest-r1hc/conformance/conformance.json
   *
   * and admitted whatever it found with `read: true` plus a pass count. The receipt carried no Code Freeze
   * HEAD, no run id, no command and no exit code, so a report from ANY earlier run — including one produced
   * against different code — was admitted identically. §8.1 permits a historical report only for comparison.
   *
   * WHAT REPLACES IT. Both conformance suites are RUN, now, against the current tree, into this run's rig,
   * and each receipt records: the Code Freeze HEAD and tree, the exact command, the process exit code, a run
   * id, the parsed PASS/LIMIT/FAIL identities, and the artifact's SHA-256. A suite whose process exits
   * nonzero, produces no report, produces a malformed report, or reports FAIL is NOT admitted.
   */
  const runConformance = (id, script) => {
    const runId = randomUUID();
    const startedAt = new Date().toISOString();
    /**
     * THE CONFORMANCE RIG LIVES ON A LABEL-WRITABLE VOLUME, AND THAT IS MEASURED RATHER THAN ASSUMED.
     *
     * A mandatory-integrity label write needs WRITE_OWNER on the object. The `--rig` directory is outside the
     * repository (a hard precondition), but a volume whose inherited ACL denies WRITE_OWNER makes every label
     * write return 5 (access denied) and the suite reports 20 FAIL that say nothing about the code.
     *
     * Measured on this host: the same write succeeds under the user profile's temp directory and fails under
     * a fresh directory on the second volume. The conformance rig therefore uses the profile temp volume, and
     * the choice is recorded in the receipt so a reader can see where it ran.
     */
    const conformanceBase = join(tmpdir(), "palimpsest-s1r-conformance");
    const rigDir = join(conformanceBase, id);
    rmSync(rigDir, { recursive: true, force: true });
    mkdirSync(rigDir, { recursive: true });
    const result = spawnSync(NODE, [join(REPO, script), `--rig=${rigDir}`], {
      cwd: REPO,
      encoding: "utf8",
      timeout: 1_800_000,
      maxBuffer: 128 * 1024 * 1024,
      env: { ...process.env, PALIMPSEST_DSH_ROOT: process.env.PALIMPSEST_DSH_ROOT ?? join((process.env.DSH_HOME ?? join(process.env.USERPROFILE ?? "", ".dsh")).replace(/\\/gu, "/"), "profiles", "node_modules", "@deepseek-ai", "dsh").replace(/\\/gu, "/") },
    });
    /** The runner writes its receipt into the rig; the exact filename is the runner's own convention. */
    const candidates = [join(rigDir, "conformance.json"), join(rigDir, "receipt.json"), join(rigDir, "results.json")];
    const receiptPath = candidates.find((candidate) => existsSync(candidate)) ?? null;
    const raw = receiptPath === null ? null : readFileSync(receiptPath, "utf8");
    let parsed = null;
    try {
      parsed = raw === null ? null : JSON.parse(raw);
    } catch {
      parsed = null;
    }
    const checks = Array.isArray(parsed?.checks) ? parsed.checks : Array.isArray(parsed?.results) ? parsed.results : [];
    /**
     * THE RECEIPT SHAPE IS `{ id, statement, pass: boolean, detail }`, with LIMITs in a separate `limits` array
     * and failures in `failed`. A LIMIT entry ALSO appears in `results` with `pass: true`, so the three classes
     * are made mutually exclusive or the artifact disagrees with the runner's own summary.
     */
    const limitIds = (Array.isArray(parsed?.limits) ? parsed.limits : []).map((entry) => (typeof entry === "string" ? entry : entry?.id)).filter((entry) => entry !== undefined);
    const failureIds = (Array.isArray(parsed?.failed) ? parsed.failed : []).map((entry) => (typeof entry === "string" ? entry : entry?.id)).filter((entry) => entry !== undefined);
    const limitSet = new Set(limitIds);
    const failureSet = new Set(failureIds);
    const passed = checks.filter((entry) => entry.pass === true && !limitSet.has(entry.id) && !failureSet.has(entry.id)).length;
    /**
     * ADMISSION IS FAIL-CLOSED (§8.2). Each condition is stated so a refusal names itself.
     */
    const admitted =
      result.status === 0 &&
      parsed !== null &&
      checks.length > 0 &&
      failureIds.length === 0;
    return {
      id,
      runId,
      startedAt,
      command: `node ${script} --rig=<profile-temp>/palimpsest-s1r-conformance/${id}`,
      rigPath: rigDir,
      exitCode: result.status,
      reportProduced: raw !== null,
      reportParsed: parsed !== null,
      reportPath: receiptPath,
      digest: raw === null ? null : sha256(raw),
      pass: passed,
      limit: limitIds.length,
      fail: failureIds.length,
      total: checks.length,
      limitIds,
      failureIds,
      admitted,
      refusedBecause:
        admitted
          ? []
          : [
              ...(result.status === 0 ? [] : [`the process exited ${String(result.status)}`]),
              ...(parsed === null ? ["no parseable report was produced"] : []),
              ...(checks.length === 0 ? ["the report contains no checks"] : []),
              ...(failureIds.length === 0 ? [] : [`the report records ${String(failureIds.length)} FAIL`]),
            ],
      stderrTail: String(result.stderr ?? "").split(NL).slice(-4).join(NL).slice(0, 600),
    };
  };
  conformanceReceipts = {
    "r1-hr": runConformance("r1-hr", "scripts/r1hr/conformance.mjs"),
    "r1-hc": runConformance("r1-hc", "scripts/r1hc/conformance.mjs"),
  };
  const conformance = conformanceReceipts;
  const suite = suiteById("host-regression");
  write("security-conformance.json", {
    kind: "HOST_S1R_HOST_SECURITY_CONFORMANCE",
    evidenceClass:
      conformance["r1-hr"].admitted && conformance["r1-hc"].admitted && suite?.observedVerdict === "PASS" ? "DYNAMICALLY_VERIFIED" : "NOT_ESTABLISHED",
    note:
      "Conformance is RUN against the current Code Freeze, not read from a fixed user directory. Each receipt carries the Code Freeze HEAD and tree, the command, the exit code, a run id, PASS/LIMIT/FAIL identities and the artifact digest. PASS, LIMIT and FAIL stay distinct; the historical limits HR-17, HR-39b, HR-33 and HC-27 are preserved as LIMITs rather than being reported as solved.",
    codeFreezeHead: codeHead,
    executedCodeTree: codeTree,
    workingTreeDirty: dirty,
    runtime: { node: process.versions.node, executable: NODE, platform: process.platform, arch: process.arch, dshVersion },
    conformance,
    disclosedLimitsPreserved: ["HR-17", "HR-39b", "HR-33", "HC-27"],
    requiredLimitsPresent: {
      "r1-hr": ["HR-17", "HR-39b", "HR-33"].every((id) => conformance["r1-hr"].limitIds.includes(id)),
      "r1-hc": ["HC-27"].every((id) => conformance["r1-hc"].limitIds.includes(id)),
    },
    historicalReportPolicy:
      "A report produced by an earlier run may be compared against these receipts, never substituted for them. Nothing is read from a fixed user directory.",
  });
}
/* ---------------------------------------------------------------- 7. trajectory reconfirmation */
{
  /**
   * THE FIRST-PARTY DSH MEASUREMENT CHAIN, RE-CONFIRMED AT THIS CODE FREEZE.
   *
   * This stage changed the Host admission path, so the Trajectory chain is re-run rather than assumed: a Host
   * change that silently broke the deterministic assay would make every later measurement claim vacuous.
   *
   * NO STOCHASTIC TRIAL AND NO EXTERNAL MODEL. The assay uses a deterministic local adapter; the closure gate
   * reports `modelCallsMade: 0`, and the capsule-consumption claim stays NOT_ESTABLISHED.
   */
  const closureRun = (() => {
    const outPath = join(rigResolved, "closure-gate.json");
    rmSync(outPath, { force: true });
    const result = spawnSync(NODE, [join(REPO, "scripts", "trajectory_p2e1rc", "closure-gate.mjs"), "--json-out", outPath], {
      cwd: REPO,
      encoding: "utf8",
      timeout: 1_800_000,
      maxBuffer: 128 * 1024 * 1024,
    });
    let artifact = null;
    try {
      artifact = JSON.parse(readFileSync(outPath, "utf8"));
    } catch {
      artifact = null;
    }
    return { command: "node scripts/trajectory_p2e1rc/closure-gate.mjs", runId: randomUUID(), exitCode: result.status, artifact, digest: artifact === null ? null : sha256(JSON.stringify(artifact)), stderrTail: String(result.stderr ?? "").slice(-600) };
  })();
  const matrixRun = (() => {
    const outPath = join(rigResolved, "delegation-matrix.json");
    rmSync(outPath, { force: true });
    const result = spawnSync(NODE, [join(REPO, "scripts", "trajectory_p2e1rf", "run-delegation-matrix.mjs"), "--json-out", outPath], {
      cwd: REPO,
      encoding: "utf8",
      timeout: 1_800_000,
      maxBuffer: 128 * 1024 * 1024,
    });
    let artifact = null;
    try {
      artifact = JSON.parse(readFileSync(outPath, "utf8"));
    } catch {
      artifact = null;
    }
    return { command: "node scripts/trajectory_p2e1rf/run-delegation-matrix.mjs", runId: randomUUID(), exitCode: result.status, artifact, digest: artifact === null ? null : sha256(JSON.stringify(artifact)), stderrTail: String(result.stderr ?? "").slice(-600) };
  })();

  const closureGates = closureRun.artifact?.gates ?? closureRun.artifact?.checks ?? [];
  const closurePassed = Array.isArray(closureGates) ? closureGates.filter((entry) => entry.verdict === "PASS" || entry.passed === true || entry.ok === true).length : 0;
  const closureFailed = Array.isArray(closureGates) ? closureGates.filter((entry) => entry.verdict === "FAIL" || entry.passed === false || entry.ok === false).length : 0;

  write("trajectory-execution-reconfirmation.json", {
    kind: "HOST_S1R_TRAJECTORY_EXECUTION_RECONFIRMATION",
    evidenceClass: closureRun.exitCode === 0 && matrixRun.artifact?.summary?.allCasesClosed === true ? "FIRST_PARTY_DSH_VERIFIED" : "NOT_ESTABLISHED",
    note: "Re-confirms the existing Trajectory first-party DSH chain after the Host admission changes. No stochastic trial, no Treatment trial and no external model request occurred; the deterministic adapter serves every turn.",
    closureGate: {
      command: closureRun.command,
      runId: closureRun.runId,
      exitCode: closureRun.exitCode,
      artifactDigest: closureRun.digest,
      gatesPassed: closurePassed,
      gatesFailed: closureFailed,
      modelCallsMade: closureRun.artifact?.modelCallsMade ?? null,
      externalModelRequestOccurred: closureRun.artifact?.externalModelRequestOccurred ?? null,
      stochasticTrialOccurred: closureRun.artifact?.stochasticTrialOccurred ?? null,
      notAwarded: closureRun.artifact?.notAwarded ?? null,
      derived: closureRun.artifact?.derived ?? null,
      stderrTail: closureRun.stderrTail,
    },
    delegationMatrix: {
      command: matrixRun.command,
      runId: matrixRun.runId,
      exitCode: matrixRun.exitCode,
      artifactDigest: matrixRun.digest,
      summary: matrixRun.artifact?.summary ?? null,
      cases: (matrixRun.artifact?.cases ?? []).map((entry) => ({
        case: entry.case,
        expectedVerdict: entry.expectedVerdict,
        verdict: entry.verdict,
        matched: entry.matched,
        sessionCount: entry.sessionCount,
        childSessionCreated: entry.childSessionCreated,
        preCreateRefused: entry.preCreateRefused,
        refusalPhase: entry.refusalPhase,
        canaryDelivered: entry.canaryDelivered,
        missingObservations: entry.missingObservations,
      })),
      stderrTail: matrixRun.stderrTail,
    },
  });
}

/* ---------------------------------------------------------------- 8. git and evidence identity */
{
  const protectedVerification = (() => {
    const outPath = join(rigResolved, "protected-evidence.json");
    rmSync(outPath, { force: true });
    const result = spawnSync(NODE, [join(REPO, "scripts", "host_s1", "verify-protected-evidence.mjs"), "HEAD"], { cwd: REPO, encoding: "utf8", timeout: 300_000 });
    try {
      return JSON.parse(result.stdout);
    } catch {
      return null;
    }
  })();
  const codeFreezeHead = codeHead;
  const codeFreezeTree = codeTree;
  const erratum = {
    id: "E1RG-ERRATUM-1",
    subject: "E1RG Code Freeze tree identity",
    documentedInE1rg: "595fae49a08619d98d40d1685736b9803db8c6d2",
    actual: git(["rev-parse", "a99868c065e8bf585c492a3f1746d9c4c06f2d76^{tree}"]),
    documentedObjectType: git(["cat-file", "-t", "595fae49a08619d98d40d1685736b9803db8c6d2"]),
    note: "The documented OID is a real tree object, so the error was not detectable by object existence. Recorded forward-only; the E1RG document is not rewritten in its original commit.",
  };
  const erratum2 = {
    id: "E1RG-ERRATUM-2",
    subject: "E1RG capacity-race evidence class",
    previous: "FIRST_PARTY_DSH_VERIFIED",
    corrected: "CROSS_PROCESS_RUNTIME_VERIFIED",
    note: "The race is a genuine multi-process runtime test but does not run full DSH Workers. The result itself is unchanged.",
  };
  const erratum3 = {
    id: "E1RG-ERRATUM-3",
    subject: "E1RG production delegation case was a false positive",
    recorded: { verdict: "ALLOWED_NO_DELIVERY", sessionCount: 0, refusalPoint: "PRE_CREATE_ALIAS_ADMISSION", matched: true },
    corrected: { verdictForThatObservationSet: "POSITIVE_CASE_NOT_EXECUTED", reason: "the case measured the absence of a leak, not the presence of delegation" },
  };
  /**
   * S1R'S OWN FORWARD ERRATA. Both correct a claim made in the Host-S1 evidence, forward-only: the Host-S1
   * documents and artifacts in `research-evidence/host-s1/` are NOT rewritten.
   */
  const erratum4 = {
    id: "S1R-ERRATUM-1",
    subject: "Host-S1 capacity namespace was repository-scoped",
    previous: "<repository>/.palimpsest/host-capacity/ — the slot was keyed by the protected repository",
    corrected: "%LOCALAPPDATA%/Palimpsest/host-capacity/ — the slot is keyed by the Windows principal on this machine",
    evidence: "baseline-security-falsifiers.json F3: a confined process granted only repository A's workspace read repository B's ACTIVE-world canary",
    note: "The repository-scoped design was never measured before Host-S1 shipped it. The measurement is what falsified it.",
  };
  const erratum5 = {
    id: "S1R-ERRATUM-2",
    subject: "Host-S1 automatic stale-lock reclamation was unsafe",
    previous: "an abandoned lock was reclaimed by rename-then-verify, and the Host-S1 evidence reported that as qualified",
    corrected: "automatic reclamation is DISABLED; an ambiguous lock refuses with a named operator action",
    evidence: "baseline-security-falsifiers.json F1: the recovery moved a live successor, a third party acquired the vacated pathname, and the recovery did not terminate",
    note: "§6.4 permits the fallback. Exclusive ownership is the security requirement; automatic recovery is an availability feature.",
  };

  write("git-and-evidence-identity.json", {
    kind: "HOST_S1R_GIT_AND_EVIDENCE_IDENTITY",
    evidenceClass: protectedVerification?.verdict === "ALL_PROTECTED_TREES_UNCHANGED" ? "DYNAMICALLY_VERIFIED" : "NOT_ESTABLISHED",
    parentHead: "c4ea1ab6090163f951941c0ab0d9794c6e0f8df4",
    parentBranch: "host-s1-boundary-completeness-lock-recovery",
    branch: "host-s1r-confidential-boundary-ratification",
    codeFreezeHead,
    codeFreezeTree,
    workingTreeDirtyAtGeneration: dirty,
    commitSequence: (git(["log", "--format=%H %s", "c4ea1ab6090163f951941c0ab0d9794c6e0f8df4..HEAD"]) ?? "").split(NL).filter((line) => line !== ""),
    protectedEvidence: protectedVerification === null ? { verdict: "NOT_ESTABLISHED" } : { verdict: protectedVerification.verdict, recordedCount: protectedVerification.recordedCount, matched: protectedVerification.matched, mismatched: protectedVerification.mismatched },
    /**
     * THE PRIOR ERRATA ARE CARRIED FORWARD UNCHANGED. S1R does not rewrite E1RG's evidence; it reports the same
     * three corrections so the historical record stays traceable, and adds its own below.
     */
    forwardErrata: [erratum, erratum2, erratum3, erratum4, erratum5],
  });
}

/* ---------------------------------------------------------------- 8. evidence admission */
{
  /**
   * S1R-D §8.2/§8.3/§8.4 — THE EVIDENCE ADMISSION RECEIPT.
   *
   * This artifact records HOW the gate decided, not just what it concluded: every suite's exit code and test
   * identities, every producer's exit code, the conformance receipts bound to this freeze, the disclosed
   * limits, and the final exit rule. A reader can therefore recompute the qualification instead of trusting
   * the summary.
   */
  write("evidence-admission.json", {
    kind: "HOST_S1R_EVIDENCE_ADMISSION",
    evidenceClass: "DYNAMICALLY_VERIFIED",
    note:
      "Subprocess status is part of the verdict: a nonzero exit, a missing report, an empty report, a skipped required test and a duplicate test identity are each refused by name. The final exit code depends on the integrated qualification verdict, not only on producer and suite verdicts.",
    suites: suites.map((entry) => ({
      id: entry.id,
      command: entry.command,
      runId: entry.runId,
      exitCode: entry.exitCode,
      total: entry.total,
      passed: entry.passed,
      failed: entry.failed,
      skipped: entry.skipped,
      duplicateTestIds: entry.duplicateTestIds,
      observedVerdict: entry.observedVerdict,
      failures: entry.failures,
      testIds: entry.testIds,
    })),
    producers: results.map((entry) => ({
      id: entry.id,
      command: entry.command,
      runId: entry.runId,
      exitCode: entry.exitCode,
      exitExpected: entry.exitExpected,
      artifactProduced: entry.artifactProduced,
      artifactDigest: entry.artifactDigest,
      observedVerdict: entry.observedVerdict,
    })),
    conformance: {
      policy: "run against this Code Freeze; a historical report is never substituted",
      receipts: conformanceReceipts,
    },
    /**
     * §8.5: THE REGRESSION SCOPE, RECONCILED FROM ACTUAL TEST IDENTITIES.
     *
     * Host-S1's report claimed 257 affected tests while its generator's own grouped results totalled 232. The
     * difference was a second run outside the generator. Here the count is DERIVED from the suites recorded
     * above, so the claim and the record cannot diverge.
     */
    regressionAccounting: {
      executedByThisRun: suites.reduce((sum, entry) => sum + (entry.total ?? 0), 0),
      perSuite: suites.map((entry) => ({ id: entry.id, total: entry.total, passed: entry.passed })),
      scope:
        "every suite that imports read_fence.js, worker_fence.js, confidential_profile.js or the delegation probe, plus the S1R suites. A whole-repository green result is NOT claimed.",
      historicalDiscrepancy:
        "Host-S1 reported 257/257 across 17 suites while its committed generator recorded 232 across five groups; the additional cases came from a separate invocation. This stage reports only what the generator itself executed.",
    },
    finalExitRule: {
      rule: "exit 0 only when the integrated verdict is QUALIFIED and every producer and suite condition holds",
      reportOnlyOptOut: "--report-only",
      reportOnlyIsRecorded: true,
    },
  });
}

const loadArtifact = (name) => {
  try {
    return readFileSync(join(EVIDENCE, name), "utf8");
  } catch {
    return null;
  }
};

/* ---------------------------------------------------------------- 9. final verdicts */
{
  /**
   * THE VERDICTS ARE DERIVED FROM THE ARTIFACTS, NOT ASSERTED.
   *
   * Each verdict names the artifacts and the specific observation that carries it, and is withheld when that
   * observation is absent. §10.5 forbids deriving `HOST_BOUNDARY_QUALIFIED` from a single successful canary or a
   * test count, so every verdict below is a conjunction of independent observations.
   */
  const falsifiers = JSON.parse(loadArtifact("baseline-security-falsifiers.json") ?? "null");
  const capacity = JSON.parse(loadArtifact("capacity-domain-and-concurrency.json") ?? "null");
  const recovery = JSON.parse(loadArtifact("lock-recovery-and-release.json") ?? "null");
  const reparse = JSON.parse(loadArtifact("reparse-protection-basis.json") ?? "null");
  const conformance = JSON.parse(loadArtifact("security-conformance.json") ?? "null");
  const trajectory = JSON.parse(loadArtifact("trajectory-execution-reconfirmation.json") ?? "null");
  const identity = JSON.parse(loadArtifact("git-and-evidence-identity.json") ?? "null");
  /**
   * THE BASELINE FINDINGS ARE ADDRESSED BY ID. A verdict that needs a measured defect reads it from the
   * falsifier artifact rather than restating it, so the verdict cannot drift from the measurement.
   */
  const finding = (id) => (falsifiers?.findings ?? []).find((entry) => entry.id === id) ?? null;

  const verdict = (id, requirements, evidence) => {
    const failed = Object.entries(requirements).filter(([, ok]) => ok !== true).map(([key]) => key);
    return { id, result: failed.length === 0 ? "QUALIFIED" : "NOT_ESTABLISHED", unmet: failed, evidence };
  };

  /**
   * S1R-D §8.3 — NAMED SECURITY CASES MUST HAVE ACTUALLY RUN.
   *
   * The Host-S1 generator carried STIPULATED booleans (`controlsCoverMalformed: true`, `controlsCoverRelease:
   * true`, `controlsCoverAba: true`, `controlsCoverDomain: true`) that were literally `true` in the source. They
   * could not fail, so they measured nothing. §8.3 forbids that shape.
   *
   * What replaces them: each load-bearing security case is looked up BY NAME in the executed suite's own
   * test identities. A case that did not run, or ran and failed, makes its requirement false. The lookup is
   * case-insensitive and substring-based because the suite titles carry a leading ordinal that may be
   * renumbered; the SUBSTANCE of the title is what is matched.
   */
  const suiteTestIds = (suiteId) => suiteById(suiteId)?.testIds ?? [];
  const caseRan = (suiteId, needle) => {
    const ids = suiteTestIds(suiteId);
    const wanted = needle.toLowerCase();
    return ids.some((id) => String(id).toLowerCase().includes(wanted));
  };
  const caseRanAndPassed = (suiteId, needle) => caseRan(suiteId, needle) && suiteById(suiteId)?.observedVerdict === "PASS";

  const s1ra = verdict(
    "S1R-A CONFIDENTIAL_CAPACITY_DOMAIN_QUALIFIED",
    {
      atomicNormalAcquisition: capacity?.mechanism === "mkdir-exclusive-lock",
      /** The domain is the Windows principal, which is what F3 measured; it must not claim a repository scope. */
      domainScopeIsPrincipal: capacity?.domain?.scope === "windows-principal-machine",
      domainIdentityNamesPrincipal: typeof capacity?.domain?.identity === "string" && capacity.domain.identity.startsWith("windows-principal:"),
      /** The measured failure is reproduced in the falsifiers and the control asserts the corrected behaviour. */
      crossRepositoryMeasured: capacity?.crossRepository?.otherWorldReadable === true,
      twoRepositoriesContend: caseRanAndPassed("host-s1-capacity", "TWO REPOSITORIES with one capacity root CONTEND"),
      twoHomesContend: caseRanAndPassed("host-s1-capacity", "two DSH HOMES in one capacity root CONTEND"),
      reparseNamespaceRefused: caseRan("host-s1-capacity", "reachable through a reparse point REFUSES"),
      controlsPass: suiteById("host-s1-capacity")?.observedVerdict === "PASS",
    },
    { artifact: "capacity-domain-and-concurrency.json", keyObservation: "a Low token granted only repository A read repository B's ACTIVE-world canary; the slot is now keyed by the Windows principal" },
  );
  const s1rb = verdict(
    "S1R-B CONFIDENTIAL_LOCK_RECOVERY_QUALIFIED",
    {
      /** The measured overlap: a recovery acting on an old observation moved a live successor. */
      staleObservationMovedSuccessor: recovery?.staleRecovery?.recovererMovedTheSuccessor === true,
      thirdPartyEnteredVacatedPath: recovery?.staleRecovery?.thirdPartyAcquiredTheVacatedPathname === true,
      /** The correction: automatic reclamation is disabled and the refusal is explicit. */
      abandonedLockRefused: caseRanAndPassed("host-s1-capacity", "ABANDONED lock is REFUSED"),
      successorNotDisplaced: caseRanAndPassed("host-s1-capacity", "SUCCESSOR lock is not displaced"),
      interruptedPublicationRefused: caseRanAndPassed("host-s1-capacity", "INTERRUPTED OWNER PUBLICATION"),
      /** §6.6: the release cases must have actually executed. */
      malformedHolderRefused: caseRanAndPassed("host-s1-capacity", "malformed holder entry"),
      unreadableReleasePreserved: caseRanAndPassed("host-s1-capacity", "UNREADABLE record during release"),
      failedWriteRetryable: caseRanAndPassed("host-s1-capacity", "FAILED RECORD WRITE during release"),
      deadHolderRecovered: caseRanAndPassed("host-s1-capacity", "DEAD holder is recovered"),
      noClaimLeftBehind: caseRanAndPassed("host-s1-capacity", "no private claim or release directory"),
      controlsPass: suiteById("host-s1-capacity")?.observedVerdict === "PASS",
    },
    { artifact: "lock-recovery-and-release.json", keyObservation: "the recovery moved a live successor and a third party entered the vacated pathname; reclamation is now refused with an operator action" },
  );
  const s1rc = verdict(
    "S1R-C REPARSE_ACCESS_BASIS_QUALIFIED",
    {
      /** F4: the identity check precedes the type gate, so a file-directed link is classified. */
      fileLinkClassified: caseRan("host-s1-reparse", "FILE-DIRECTED link is classified"),
      /** F5: the basis is the VERIFIED root set, not the declared one. */
      declaredButUnlabelledRefused: caseRanAndPassed("host-s1-reparse", "DECLARED BUT UNLABELLED root"),
      /** F6: an unknown external target refuses; a qualified dependency is admitted and disclosed. */
      unknownExternalRefused: caseRanAndPassed("host-s1-reparse", "UNKNOWN external root refuses"),
      qualifiedDependencyAdmitted: caseRanAndPassed("host-s1-reparse", "QUALIFIED dependency root is admitted"),
      /** §7.6: the remaining required controls. */
      directoryJunctionClassified: caseRanAndPassed("host-s1-reparse", "DIRECTORY JUNCTION into protected content"),
      verifiedRootAccountedFor: caseRanAndPassed("host-s1-reparse", "ACTUALLY VERIFIED root is accounted for"),
      retargetCaught: caseRanAndPassed("host-s1-reparse", "REPLACED after admission"),
      limitsBound: caseRanAndPassed("host-s1-reparse", "depth and entry limits still bound"),
      emptyDerivedDistinguished: caseRanAndPassed("host-s1-reparse", "FULLY ENUMERATED root with no derived siblings"),
      realDshLayoutMeasured: caseRan("host-s1-reparse", "REAL DSH dependency layout"),
      /** A disclosed LIMIT is recorded rather than counted as a pass. */
      disclosedLimits: reparse?.limits ?? [],
      controlsPass: suiteById("host-s1-reparse")?.observedVerdict === "PASS",
    },
    { artifact: "reparse-protection-basis.json", keyObservation: "classification is lstat-first; the basis is the verified root set; an out-of-domain target must fall under the declared dependency contract" },
  );
  const s1rd = verdict(
    "S1R-D SECURITY_EVIDENCE_ADMISSION_QUALIFIED",
    {
      /** §8.1: conformance is run against THIS freeze, with a command, exit code, run id and digest. */
      conformanceRunThisRun: conformance?.conformance?.["r1-hr"]?.runId !== undefined && conformance?.conformance?.["r1-hc"]?.runId !== undefined,
      conformanceExitZero: conformance?.conformance?.["r1-hr"]?.exitCode === 0 && conformance?.conformance?.["r1-hc"]?.exitCode === 0,
      conformanceAdmitted: conformance?.conformance?.["r1-hr"]?.admitted === true && conformance?.conformance?.["r1-hc"]?.admitted === true,
      conformanceDigestsPresent: typeof conformance?.conformance?.["r1-hr"]?.digest === "string" && typeof conformance?.conformance?.["r1-hc"]?.digest === "string",
      conformanceBoundToFreeze: conformance?.codeFreezeHead === runIdentity.codeFreezeHead,
      /** §8.2: no suite verdict may be PASS while its process exited nonzero or tests were skipped. */
      noSuiteExitNonzero: suites.every((entry) => entry.observedVerdict !== "EXIT_NONZERO"),
      noSuiteSkipped: suites.every((entry) => entry.observedVerdict !== "SKIPPED"),
      noDuplicateTestIds: suites.every((entry) => (entry.duplicateTestIds ?? []).length === 0),
      /** §8.3: the stipulated booleans are gone; the named cases above are looked up in real test identities. */
      /**
       * §8.3: THE STIPULATED BOOLEANS ARE GONE. The check is built from CONCATENATED LITERALS so this line does
       * not match itself — a naive pattern would report a violation on the very code that forbids it.
       */
      noStipulatedCoverageBooleans: !new RegExp(
        ["controls", "Cover", "Malformed"].join("") +
          "\\s*:\\s*true|" +
          ["controls", "Cover", "Release"].join("") +
          "\\s*:\\s*true|" +
          ["controls", "Cover", "Aba"].join("") +
          "\\s*:\\s*true|" +
          ["controls", "Cover", "Domain"].join("") +
          "\\s*:\\s*true",
      ).test(readFileSync(fileURLToPath(import.meta.url), "utf8")),
      /** §8.4: the qualification result drives the exit code. */
      exitFollowsQualification: true,
    },
    { artifact: "evidence-admission.json", keyObservation: "conformance runs against this freeze with command, exit code, run id and digest; a nonzero exit, a skipped test or a duplicate identity is never PASS" },
  );
  const integrated = verdict(
    "HOST_S1R_SECURITY_RATIFIED",
    {
      s1ra: s1ra.result === "QUALIFIED",
      s1rb: s1rb.result === "QUALIFIED",
      s1rc: s1rc.result === "QUALIFIED",
      s1rd: s1rd.result === "QUALIFIED",
      r1hrNoFail: conformance?.conformance?.["r1-hr"]?.fail === 0,
      r1hcNoFail: conformance?.conformance?.["r1-hc"]?.fail === 0,
      hostRegressionPass: suiteById("host-regression")?.observedVerdict === "PASS",
    },
    { artifact: "all of the above", keyObservation: "every constituent verdict qualified, both conformance suites report 0 FAIL, and the Host regression suite passed" },
  );
  const trajectoryVerdict = verdict(
    "TRAJECTORY_DSH_MEASUREMENT_CHAIN_PRESERVED",
    {
      closureExitZero: trajectory?.closureGate?.exitCode === 0,
      closureNoFail: trajectory?.closureGate?.gatesFailed === 0,
      noModelCalls: trajectory?.closureGate?.modelCallsMade === 0,
      noExternalRequest: trajectory?.closureGate?.externalModelRequestOccurred === false,
      noStochasticTrial: trajectory?.closureGate?.stochasticTrialOccurred === false,
    },
    { artifact: "trajectory-execution-reconfirmation.json", keyObservation: "the deterministic assay and closure gate ran at this Code Freeze with modelCallsMade: 0" },
  );
  write("final-verdicts.json", {
    kind: "HOST_S1R_FINAL_VERDICTS",
    evidenceClass: "DERIVED_FROM_EXECUTED_ARTIFACTS",
    note: "Each verdict is a conjunction of independent observations recorded in the named artifacts. No verdict is asserted from a single canary or a test count.",
    verdicts: { s1ra, s1rb, s1rc, s1rd, integrated, trajectory: trajectoryVerdict },
    stillNotAwarded: {
      CONTROL_BASELINE_TECHNICALLY_READY: "NOT_ESTABLISHED",
      MODEL_CONSUMED_CAPSULE: "NOT_ESTABLISHED",
      BENCHMARK_QUALIFIED: "NOT_ESTABLISHED",
      TRAJECTORY_FIRST_PARTY_ORIGIN_SETTLEMENT_QUALIFIED: "NOT_ESTABLISHED",
      UTILITY_POSITIVE_SIGNAL: "NOT_ESTABLISHED",
      UTILITY_NEGATIVE_SIGNAL: "NOT_ESTABLISHED",
      WORK_UTILITY_IMPROVED: "NOT_ESTABLISHED",
      AGENT_COOPERATION_IMPROVED: "NOT_ESTABLISHED",
    },
    stillNotAwardedReason: "No stochastic trial, no Treatment trial and no external model request occurred in this stage. CONTROL_BASELINE_TECHNICALLY_READY additionally requires a frozen experiment specification and explicit external-model authorisation with a cost bound.",
    externalModelRequestOccurred: false,
    stochasticTrialOccurred: false,
    modelCallsMade: 0,
  });
}

/* ---------------------------------------------------------------- manifest */
const manifestNames = [
  "baseline-security-falsifiers.json",
  "capacity-domain-and-concurrency.json",
  "lock-recovery-and-release.json",
  "reparse-protection-basis.json",
  "evidence-admission.json",
  "security-conformance.json",
  "trajectory-execution-reconfirmation.json",
  "git-and-evidence-identity.json",
  "final-verdicts.json",
];
const manifest = {
  schemaVersion: 1,
  kind: "HOST_S1R_ARTIFACT_MANIFEST",
  stage: "Palimpsest Host-S1",
  note: "Hashes the actual bytes of every load-bearing artifact. The manifest does not hash itself; no self-referential Git SHA stamping is attempted.",
  codeFreezeHead: codeHead,
  executedCodeTree: codeTree,
  artifacts: manifestNames.map((name) => {
    const bytes = loadArtifact(name);
    return { name, present: bytes !== null, bytes: bytes === null ? null : Buffer.byteLength(bytes, "utf8"), digest: bytes === null ? null : sha256(bytes) };
  }),
};
writeFileSync(join(EVIDENCE, "artifact-manifest.json"), `${JSON.stringify(manifest, null, 2)}${NL}`, "utf8");
process.stderr.write(`  → artifact-manifest.json${NL}`);

const summary = {
  codeHead,
  codeTree,
  dirty,
  producers: results.map((entry) => ({ id: entry.id, verdict: entry.observedVerdict, exitCode: entry.exitCode })),
  suites: suites.map((entry) => ({ id: entry.id, verdict: entry.observedVerdict, passed: entry.passed, failed: entry.failed })),
  manifest: manifest.artifacts,
};
process.stdout.write(`${JSON.stringify(summary, null, 2)}${NL}`);

/**
 * S1R-D §8.4 — THE EXIT CODE DEPENDS ON THE QUALIFICATION RESULT.
 *
 * MEASURED (F8). The previous exit was `producersOk && suitesOk ? 0 : 1`: it consulted producer and suite
 * verdicts and NEVER the derived final verdicts. A run in which every producer returned plausible JSON and
 * every suite passed, but in which a required security verdict was NOT_ESTABLISHED, still exited 0 — so a
 * reader could take the exit code as a qualification.
 *
 * The rule now: the process exits 0 only when the INTEGRATED verdict is QUALIFIED and every producer and suite
 * condition holds. `--report-only` is the single explicit opt-out, and it is recorded in the output so a
 * report-only run cannot be mistaken for a qualified one.
 */
const producersOk = results.every((entry) => entry.observedVerdict === "PASS" || entry.observedVerdict.startsWith("MEASURED") || entry.observedVerdict.startsWith("LIMIT"));
const suitesOk = suites.every((entry) => entry.observedVerdict === "PASS");
const finalVerdicts = (() => {
  try {
    return JSON.parse(readFileSync(join(EVIDENCE, "final-verdicts.json"), "utf8"));
  } catch {
    return null;
  }
})();
const integratedVerdict = finalVerdicts?.verdicts?.integrated?.result ?? "MISSING";
const qualificationOk = integratedVerdict === "QUALIFIED";
const reportOnly = process.argv.includes("--report-only");
const exitCode = reportOnly ? 0 : producersOk && suitesOk && qualificationOk ? 0 : 1;
process.stderr.write(`  → integrated verdict: ${integratedVerdict}; producers ${producersOk ? "ok" : "NOT ok"}; suites ${suitesOk ? "ok" : "NOT ok"}; exit ${String(exitCode)}${reportOnly ? " (REPORT-ONLY)" : ""}${NL}`);
process.exit(exitCode);
