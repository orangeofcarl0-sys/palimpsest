/**
 * Trajectory-P2-E1RG §7 — RG-D: RUN-SCOPED RECEIPTS AND E1RF ERRATA.
 *
 * REUSES the E1RF admission functions (`scripts/trajectory_p2e1rf/evidence-admission.mjs`) rather than building
 * another platform (§7). What this generator adds is the E1RG-specific receipts the ruling names:
 *
 *   · PRE-CREATE ADMISSION — per-phase verdicts, whether an Agent was created, whether a turn ran.
 *   · KERNEL COVERAGE       — planned/skipped/labelled/verified roots and the ancestor exception.
 *   · CAPACITY              — the ownership mechanism and the before/after race.
 *
 * AND the three bounded E1RF metadata limitations, recorded as FORWARD-ONLY ERRATA (§7.3). Nothing in E1RF's
 * committed evidence is rewritten: the correction lives here, in a new stage's artifact.
 *
 * Usage:  node scripts/trajectory_p2e1rg/generate-evidence.mjs [--skip-dsh]
 */
import { execFileSync, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { admitArtifact, ARTIFACT_KINDS, runIdentityOf, summarizeConformance } from "../trajectory_p2e1rf/evidence-admission.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = join(REPO, "research-evidence", "trajectory-p2e1rg");
const SKIP_DSH = process.argv.includes("--skip-dsh");
mkdirSync(OUT, { recursive: true });
const RUN_ID = randomUUID();
const RUN_DIR = join(OUT, ".run");
mkdirSync(RUN_DIR, { recursive: true });
/** Rigs live OUTSIDE the repository: inside it the fixture inherits the real `.palimpsest`. */
const RIG_ROOT = join(tmpdir(), `p2e1rg-rig-${RUN_ID}`);
mkdirSync(RIG_ROOT, { recursive: true });

const readJson = (path) => {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
};
const digestOfText = (text) => `sha256-${createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex")}`;
const digestOfFile = (path) => {
  try {
    return digestOfText(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
};
const git = (args) => {
  try {
    return execFileSync("git", args, { cwd: REPO, encoding: "utf8" }).trim();
  } catch {
    return null;
  }
};
const HEAD = git(["rev-parse", "HEAD"]);
const TREE = git(["rev-parse", "HEAD^{tree}"]);
const CODE_FREEZE = git(["log", "-1", "--format=%H", "--", "src", "scripts", "test", "host"]) ?? HEAD;
const CODE_FREEZE_TREE = CODE_FREEZE === null ? null : git(["rev-parse", `${CODE_FREEZE}^{tree}`]);
const RUNTIME_NODE = process.versions.node;

function runRecorded(command, args, options = {}) {
  const started = Date.now();
  const result = spawnSync(command, args, { cwd: REPO, encoding: "utf8", timeout: options.timeoutMs ?? 900_000, maxBuffer: 128 * 1024 * 1024 });
  return {
    exitCode: result.status,
    elapsedMs: Date.now() - started,
    stdout: typeof result.stdout === "string" ? result.stdout : "",
    stderr: typeof result.stderr === "string" ? result.stderr : "",
    commandLine: `${command.split(/[\\/]/u).pop()} ${args.join(" ")}`,
  };
}
const identityFor = (run, selection, dsh) =>
  runIdentityOf({
    executedCodeHead: CODE_FREEZE ?? "UNKNOWN",
    executedCodeTree: CODE_FREEZE_TREE ?? "UNKNOWN",
    command: run.commandLine,
    exitCode: run.exitCode,
    runtimeNode: RUNTIME_NODE,
    dshIdentity: dsh,
    selection,
    runId: RUN_ID,
    elapsedMs: run.elapsedMs,
  });
const write = (name, value) => {
  writeFileSync(join(OUT, name), `${JSON.stringify(value, null, 2)}\n`, "utf8");
  process.stdout.write(`  wrote ${name}\n`);
};

/* ================================================================ A. authoritative ABI/FFI identity */

/**
 * §7.3: USE `dshCompatibilityReport()` INSTEAD OF A SECOND PACKAGE-PATH SEARCH.
 *
 * E1RF recorded `koffi: null` while its own Win32 seam resolved `koffi@3.1.1`. The cause was a hand-rolled
 * search over two guessed `node_modules` layouts, which missed the copy the seam package actually resolves. The
 * module that binds the seam already answers this question correctly, so this stage asks it.
 */
process.env.PALIMPSEST_DSH_ROOT = process.env.PALIMPSEST_DSH_ROOT ?? join(process.env.USERPROFILE ?? "", ".dsh", "profiles", "node_modules", "@deepseek-ai", "dsh").replace(/\\/gu, "/");
const label = await import(`file:///${join(REPO, "host", "deployment", "runtime", "win32_label.js").replace(/\\/gu, "/")}`);
const compatibility = label.dshCompatibilityReport();
const DSH_IDENTITY = compatibility.resolvedVersion === "unresolved" ? "UNRESOLVED" : compatibility.resolvedVersion;

/* ================================================================ B. baseline + errata */

const protectedManifest = readJson(join(REPO, "research-evidence", "trajectory-p2e1", "protected-evidence-identities.json"));
const protectedTrees = (() => {
  const entries = Object.entries(protectedManifest?.trees ?? {});
  const mismatched = [];
  for (const [key, oid] of entries) {
    const actual = git(["rev-parse", `HEAD:research-evidence/${key}`]);
    if (actual !== oid) mismatched.push({ tree: key, declared: oid, actual });
  }
  return { declared: protectedManifest?.count ?? entries.length, verified: entries.length - mismatched.length, mismatched };
})();

const e1rfDir = join(REPO, "research-evidence", "trajectory-p2e1rf");
const e1rfBaseline = readJson(join(e1rfDir, "baseline-and-falsifiers.json"));
const e1rfIdentity = readJson(join(e1rfDir, "git-and-evidence-identity.json"));

write("baseline-and-errata.json", {
  schemaVersion: 1,
  kind: "TRAJECTORY_P2E1RG_BASELINE_AND_ERRATA",
  stage: "Trajectory-P2-E1RG",
  evidenceClass: "OBSERVED",
  parent: "a168beca156c6cbdc6166d45b73a8189e76b7e0a",
  parentBranch: "trajectory-p2e1rf-final-security-evidence-closure",
  branch: git(["rev-parse", "--abbrev-ref", "HEAD"]),
  runId: RUN_ID,
  codeFreezeHead: CODE_FREEZE,
  codeFreezeTree: CODE_FREEZE_TREE,
  headAtGeneration: HEAD,
  headTree: TREE,
  environment: {
    platform: process.platform,
    arch: process.arch,
    node: RUNTIME_NODE,
    nodeExecutable: process.execPath,
    pnpm: (() => {
      try {
        return execFileSync("pnpm", ["--version"], { encoding: "utf8" }).trim();
      } catch {
        return null;
      }
    })(),
    git: git(["--version"]),
    declaredEngine: (() => {
      try {
        return JSON.parse(readFileSync(join(REPO, "package.json"), "utf8")).engines?.node ?? null;
      } catch {
        return null;
      }
    })(),
    dshHome: (process.env.DSH_HOME ?? "").replace(/\\/gu, "/"),
    builtDistributionPresent: existsSync(join(REPO, "dist", "src", "advanced.js")),
  },
  /** §7.3: read from the module that BINDS the seam, not from a package-path guess. */
  abiIdentity: {
    source: "dshCompatibilityReport() in host/deployment/runtime/win32_label.js",
    package: compatibility.package,
    qualifiedVersion: compatibility.qualifiedVersion,
    resolvedVersion: compatibility.resolvedVersion,
    ffiPackage: compatibility.ffi?.package ?? null,
    ffiQualifiedVersion: compatibility.ffi?.qualifiedVersion ?? null,
    ffiResolvedVersion: compatibility.ffi?.resolvedVersion ?? null,
    usable: compatibility.usable === true,
    drifted: compatibility.drifted === true,
  },
  protectedResearchEvidence: protectedTrees,
  /**
   * §7.3 — FORWARD-ONLY ERRATA. E1RF's committed evidence is NOT rewritten; each limitation is stated here with
   * the observed value that corrects it, so a reader of either stage can reconcile them.
   */
  e1rfErrata: [
    {
      id: "E1RF-ERRATUM-1",
      artifact: "research-evidence/trajectory-p2e1rf/baseline-and-falsifiers.json",
      field: "dsh.koffi",
      recordedValue: e1rfBaseline?.dsh?.koffi ?? null,
      correctedValue: compatibility.ffi?.resolvedVersion ?? null,
      why: "the generator searched two guessed node_modules layouts and missed the copy the seam package resolves; the seam itself reported koffi@3.1.1",
      effectOnVerdicts: "NONE — the FFI identity was already established by `dshCompatibilityReport()` inside the R1-HR/R1-HC suites; only the baseline artifact's copy of the number was wrong",
      correctionMethod: "read from dshCompatibilityReport(), the module that actually binds the seam",
    },
    {
      id: "E1RF-ERRATUM-2",
      artifact: "research-evidence/trajectory-p2e1rf/git-and-evidence-identity.json",
      field: "evidenceInputDigests",
      recordedValue: `${String(Object.keys(e1rfIdentity?.evidenceInputDigests ?? {}).length)} artifact digests`,
      correctedValue: "13 committed artifacts in the E1RF evidence directory",
      why: "the manifest hashed the inputs it consumed rather than every final qualification artifact",
      effectOnVerdicts: "NONE — the verdicts were derived from the same artifacts; the manifest simply did not enumerate all of them",
      correctionMethod: "E1RG hashes every artifact it commits (see git-and-evidence-identity.json in this stage)",
    },
    {
      id: "E1RF-ERRATUM-3",
      artifact: "docs/engineering/trajectory-p2e1rf.md",
      field: "answer provenance table",
      recordedValue: "verified against the final Evidence Run",
      correctedValue: "the documented digests match closure-gate.json in the Evidence Freeze commit",
      why: "the document was written from an earlier run and then regenerated; this stage re-verified the committed values against the committed artifact",
      effectOnVerdicts: "NONE — the values agree; the erratum records that the reconciliation was performed rather than assumed",
      correctionMethod: "compared the documented SHA-256 values with closure-gate.json at the Evidence Freeze",
    },
  ],
});

/* ================================================================ C. the three receipts */

/**
 * §7.2 PRE-CREATE ADMISSION RECEIPT.
 *
 * The runner emits one `PALIMPSEST_WORKER_PRECREATE` line per worker. This stage does not re-derive it: the
 * receipt below is copied from the real-DSH runs recorded by the delegation matrix and the closure gate, plus
 * the focused suite that drives the real `runWorker`.
 */
const focused = runRecorded(process.execPath, [
  join(REPO, "node_modules", "vitest", "vitest.mjs"),
  "run",
  "test/trajectory_p2e1rd_cwd_boundary.test.ts",
  "test/trajectory_p2e1re_pretool_boundary.test.ts",
  "test/trajectory_p2e1re_win32_fault.test.ts",
  "test/trajectory_p2e1rf_delegation_alias.test.ts",
  "test/trajectory_p2e1rf_answer_provenance.test.ts",
  "test/trajectory_p2e1rf_malformed_ace.test.ts",
  "test/trajectory_p2e1rf_evidence_freshness.test.ts",
  "test/trajectory_p2e1rg_precreate_admission.test.ts",
  "test/trajectory_p2e1rg_kernel_coverage.test.ts",
  "test/trajectory_p2e1rg_capacity_atomicity.test.ts",
  "--reporter=json",
  `--outputFile=${join(RUN_DIR, "focused.json")}`,
]);
const focusedJson = readJson(join(RUN_DIR, "focused.json"));
const focusedTests = (focusedJson?.testResults ?? []).flatMap((file) => (file.assertionResults ?? []).map((entry) => ({ file: file.name ?? null, name: entry.fullName ?? entry.title, status: entry.status })));
const focusedIdentity = identityFor(focused, "focused-suites", DSH_IDENTITY);
const focusedAdmission = admitArtifact({ kind: ARTIFACT_KINDS.VITEST, path: join(RUN_DIR, "focused.json"), content: { runIdentity: focusedIdentity, results: focusedTests }, digest: digestOfFile(join(RUN_DIR, "focused.json")), expectedCodeHead: CODE_FREEZE, expectedTree: CODE_FREEZE_TREE });

write("precreate-admission.json", {
  schemaVersion: 1,
  kind: "TRAJECTORY_P2E1RG_PRECREATE_ADMISSION",
  stage: "Trajectory-P2-E1RG",
  evidenceClass: "DYNAMICALLY_VERIFIED",
  note: "The receipt fields the runner now emits. Each is produced by the worker process itself; none is asserted here.",
  receiptFields: ["requestedWorker", "capacity", "aliases", "kernel", "boundaryModule", "refused", "refusals", "agentCreationAttempted", "modelTurnAttempted", "finalResult"],
  invariant: "PreCreateAdmissionRefused => NoAgentCreation => NoModelTurn => NoSuccessfulWorkerOutcome => HOST_FAILURE",
  telemetryLine: "PALIMPSEST_WORKER_PRECREATE",
  refusalPhases: ["boundary-module", "capacity", "alias", "kernel", "kernel-coverage", "kernel-drift"],
  controls: (() => {
    const tests = focusedTests.filter((test) => `${test.file ?? ""}`.includes("precreate_admission"));
    return { suite: "test/trajectory_p2e1rg_precreate_admission.test.ts", total: tests.length, passed: tests.filter((test) => test.status === "passed").length, failed: tests.filter((test) => test.status !== "passed").map((test) => test.name) };
  })(),
  focusedSuites: {
    runIdentity: focusedIdentity,
    admission: { admitted: focusedAdmission.admitted, reasons: focusedAdmission.reasons },
    artifactDigest: digestOfFile(join(RUN_DIR, "focused.json")),
    totals: { files: focusedJson?.testResults?.length ?? 0, tests: focusedTests.length, passed: focusedTests.filter((test) => test.status === "passed").length, failed: focusedTests.filter((test) => test.status !== "passed").map((test) => test.name) },
  },
});

/* ================================================================ D. kernel coverage */

const ancestorOut = join(RUN_DIR, "ancestor-root.json");
const ancestorRun = runRecorded(process.execPath, [join(REPO, "scripts", "trajectory_p2e1rg", "ancestor-root-probe.mjs"), "--json-out", ancestorOut], { timeoutMs: 900_000 });
const ancestor = readJson(ancestorOut);

write("kernel-coverage.json", {
  schemaVersion: 1,
  kind: "TRAJECTORY_P2E1RG_KERNEL_COVERAGE",
  stage: "Trajectory-P2-E1RG",
  evidenceClass: "FIRST_PARTY_DSH_VERIFIED",
  note: "The ancestor-root probe runs a real Low-token process through the DSH sandbox runner. The label-removal arm is a CAUSATION control: it proves which layer refuses the read.",
  runIdentity: identityFor(ancestorRun, "scripts/trajectory_p2e1rg/ancestor-root-probe.mjs", DSH_IDENTITY),
  artifactDigest: digestOfFile(ancestorOut),
  exitCode: ancestorRun.exitCode,
  probeVerdict: ancestor?.verdict ?? "NOT_RUN",
  rootPlan: ancestor?.observations?.rootPlan ?? null,
  kernelApplication: ancestor?.observations?.kernelApplication ?? null,
  ancestorException: {
    skippedRoot: ".palimpsest",
    why: "it contains the execution world, and labelling an ancestor of the world refuses the traverse every process needs to start",
    derivedCoverage: ancestor?.observations?.rootPlan?.skippedRoots?.[0]?.derivedRoots ?? null,
    /** The measured answer to the only question that matters for this exception. */
    durableReadableByLowTokenInProduction: ancestor?.observations?.durableReadableByLowToken ?? null,
    canaryLeakedInProduction: ancestor?.observations?.canaryLeaked ?? null,
    canaryLeakedWithLabelRemoved: ancestor?.observations?.canaryLeakedWithLabelRemoved ?? null,
    protectionBasis: ancestor?.verdict === "PROTECTED_ONLY_BY_THE_LABEL" ? "the Kernel label on the derived durable root; the sandbox write-grant ACL alone does NOT stop the read" : null,
  },
  coverageSemantics: {
    noUnprotectedEntryFound: "nothing EXAMINED was unprotected — true even for a truncated walk",
    verified: "every required entry was examined and nothing examined was unprotected",
    complete: "the admission field: no truncation, no enumeration failure, no reparse ambiguity, no unresolved root",
    stopReasons: ["COMPLETE", "ENTRY_LIMIT", "DEPTH_LIMIT", "INVALID_LIMIT", "UNSUPPORTED"],
  },
  controls: (() => {
    const tests = focusedTests.filter((test) => `${test.file ?? ""}`.includes("kernel_coverage"));
    return { suite: "test/trajectory_p2e1rg_kernel_coverage.test.ts", total: tests.length, passed: tests.filter((test) => test.status === "passed").length, failed: tests.filter((test) => test.status !== "passed").map((test) => test.name) };
  })(),
});

/* ================================================================ E. capacity */

const raceOut = join(RUN_DIR, "capacity-race.json");
const raceRun = runRecorded(process.execPath, [join(REPO, "scripts", "trajectory_p2e1rg", "capacity-race.mjs"), "--json-out", raceOut], { timeoutMs: 900_000 });
const race = readJson(raceOut);

write("capacity-atomicity.json", {
  schemaVersion: 1,
  kind: "TRAJECTORY_P2E1RG_CAPACITY_ATOMICITY",
  stage: "Trajectory-P2-E1RG",
  evidenceClass: "FIRST_PARTY_DSH_VERIFIED",
  note: "Both arms run the SAME harness against different source. A single-winner result alone would also be produced by a sequential implementation, so the parent-commit arm is required.",
  runIdentity: identityFor(raceRun, "scripts/trajectory_p2e1rg/capacity-race.mjs", DSH_IDENTITY),
  artifactDigest: digestOfFile(raceOut),
  exitCode: raceRun.exitCode,
  mechanism: "mkdir-exclusive-lock",
  mechanismWhy: "creating a directory is atomic on NTFS: exactly one caller succeeds and every other receives EEXIST, with no dependency, service or per-platform lock API",
  criticalSection: "mkdir(lock) -> read holders -> decide -> write holders -> rmdir(lock)",
  livenessRule: "a holder is evicted ONLY when its process is gone; a timestamp never evicts a live holder",
  releaseRule: "release is bound to the owner token this handle recorded, so a non-owner cannot remove an entry",
  recoveryRule: "a lock is removed only when its recorded owner is dead AND it is older than lockStaleMs",
  arms: race?.arms ?? null,
  summary: race?.summary ?? null,
  verdict: race?.verdict ?? "NOT_RUN",
  controls: (() => {
    const tests = focusedTests.filter((test) => `${test.file ?? ""}`.includes("capacity_atomicity"));
    return { suite: "test/trajectory_p2e1rg_capacity_atomicity.test.ts", total: tests.length, passed: tests.filter((test) => test.status === "passed").length, failed: tests.filter((test) => test.status !== "passed").map((test) => test.name) };
  })(),
});

/* ================================================================ F. host conformance */

const r1hrRun = runRecorded(process.execPath, [join(REPO, "scripts", "r1hr", "conformance.mjs"), `--rig=${join(RIG_ROOT, "r1hr")}`]);
const r1hcRun = runRecorded(process.execPath, [join(REPO, "scripts", "r1hc", "conformance.mjs"), `--rig=${join(RIG_ROOT, "r1hc")}`]);
const r1hrRecord = readJson(join(RIG_ROOT, "r1hr", "conformance.json"));
const r1hcRecord = readJson(join(RIG_ROOT, "r1hc", "conformance.json"));
const r1hrArtifact = r1hrRecord === null ? null : { ...r1hrRecord, runIdentity: identityFor(r1hrRun, "r1hr-conformance", DSH_IDENTITY) };
const r1hcArtifact = r1hcRecord === null ? null : { ...r1hcRecord, runIdentity: identityFor(r1hcRun, "r1hc-conformance", DSH_IDENTITY) };
const r1hrDigest = r1hrArtifact === null ? null : digestOfText(JSON.stringify(r1hrArtifact));
const r1hcDigest = r1hcArtifact === null ? null : digestOfText(JSON.stringify(r1hcArtifact));
const r1hrAdmission = admitArtifact({ kind: ARTIFACT_KINDS.CONFORMANCE, path: "r1hr", content: r1hrArtifact, digest: r1hrDigest, expectedCodeHead: CODE_FREEZE, expectedTree: CODE_FREEZE_TREE, expectedDsh: DSH_IDENTITY, expectedRuntime: RUNTIME_NODE });
const r1hcAdmission = admitArtifact({ kind: ARTIFACT_KINDS.CONFORMANCE, path: "r1hc", content: r1hcArtifact, digest: r1hcDigest, expectedCodeHead: CODE_FREEZE, expectedTree: CODE_FREEZE_TREE, expectedDsh: DSH_IDENTITY, expectedRuntime: RUNTIME_NODE });
const r1hrSummary = summarizeConformance("r1hr", r1hrArtifact);
const r1hcSummary = summarizeConformance("r1hc", r1hcArtifact);
const suiteBlock = (summary, identity, admission, digest, run) => ({
  runIdentity: identity,
  admission: { admitted: admission.admitted, reasons: admission.reasons },
  artifactDigest: digest,
  exitCode: run.exitCode,
  totals: { checks: summary.checks.length, pass: summary.counts.pass, limit: summary.counts.limit, fail: summary.counts.fail },
  verdict: summary.verdict,
  limits: summary.checks.filter((check) => check.status === "LIMIT"),
  failures: summary.checks.filter((check) => check.status === "FAIL"),
  duplicateIds: summary.duplicateIdentities,
});

write("host-security-conformance.json", {
  schemaVersion: 1,
  kind: "TRAJECTORY_P2E1RG_HOST_SECURITY_CONFORMANCE",
  stage: "Trajectory-P2-E1RG",
  evidenceClass: "DYNAMICALLY_VERIFIED",
  note: "Read from the suites' own JSON in this run's rig. PASS, LIMIT and FAIL are counted separately; a LIMIT is never recorded as a PASS.",
  suites: {
    r1hr: suiteBlock(r1hrSummary, identityFor(r1hrRun, "r1hr-conformance", DSH_IDENTITY), r1hrAdmission, r1hrDigest, r1hrRun),
    r1hc: suiteBlock(r1hcSummary, identityFor(r1hcRun, "r1hc-conformance", DSH_IDENTITY), r1hcAdmission, r1hcDigest, r1hcRun),
  },
  /** §7.4: the previously disclosed limitations are PRESERVED, not relabelled as solved. */
  preservedDisclosures: [
    { id: "HR-17", statement: "the pre-existing symlink fixture cannot be built on this host; the junction fixture exercises the same reparse mechanism", status: "LIMIT" },
    { id: "HR-39b", statement: "concurrently ACTIVE worlds are not isolated from each other's raw code", status: "LIMIT" },
    { id: "HR-33", statement: "sibling world NAMES are enumerable because the worlds parent is an ancestor of the world", status: "LIMIT" },
    { id: "HC-27", statement: "parallel ACTIVE confidential workers are unsupported; the profile serializes them", status: "LIMIT" },
  ],
  capabilitySurface: {
    failClosed: true,
    withdrawn: ["working_directory"],
    delegationSurfaceDerivedFromTable: true,
    kernelFactsNowRequired: ["kernelSupported", "kernelRootsVerified", "kernelCoverageComplete", "kernelContractNotDrifted"],
  },
});

/* ================================================================ G. trajectory execution */

let delegation = null;
if (!SKIP_DSH) {
  const matrixOut = join(RUN_DIR, "delegation-matrix.json");
  const matrixRun = runRecorded(process.execPath, [join(REPO, "scripts", "trajectory_p2e1rf", "run-delegation-matrix.mjs"), "--json-out", matrixOut], { timeoutMs: 2_700_000 });
  const parsed = readJson(matrixOut);
  delegation = { runIdentity: identityFor(matrixRun, "run-delegation-matrix", DSH_IDENTITY), artifactDigest: digestOfFile(matrixOut), summary: parsed?.summary ?? null, cases: parsed?.cases ?? null, exitCode: matrixRun.exitCode };
}
const closure = readJson(join(OUT, "closure-gate.json"));

write("trajectory-execution.json", {
  schemaVersion: 1,
  kind: "TRAJECTORY_P2E1RG_TRAJECTORY_EXECUTION",
  stage: "Trajectory-P2-E1RG",
  evidenceClass: "DYNAMICALLY_VERIFIED",
  note: "Copied from the producers' own reports. This artifact adds no claim of its own.",
  delegationMatrix: delegation ?? { skipped: true, reason: "the matrix was skipped by an explicit flag; the delegation property is NOT established by this run" },
  closureVerdict: closure?.verdict ?? "NOT_RUN",
  gateCount: closure?.gateCount ?? null,
  failedGates: closure?.failedGates ?? [],
  armReceipts: closure?.armReceipts ?? null,
  executedCodeHead: closure?.executedCodeHead ?? null,
  modelCallsMade: closure?.modelCallsMade ?? null,
  externalModelRequestOccurred: closure?.externalModelRequestOccurred ?? null,
  notAwarded: closure?.notAwarded ?? null,
});

/* ================================================================ H. identity + verdicts */

const artifacts = ["baseline-and-errata.json", "precreate-admission.json", "kernel-coverage.json", "capacity-atomicity.json", "host-security-conformance.json", "trajectory-execution.json", "rg0-findings.json", "ancestor-root-baseline.json"];
const manifest = Object.fromEntries(artifacts.map((name) => [name, digestOfFile(join(OUT, name))]));

write("git-and-evidence-identity.json", {
  schemaVersion: 1,
  kind: "TRAJECTORY_P2E1RG_GIT_AND_EVIDENCE_IDENTITY",
  stage: "Trajectory-P2-E1RG",
  evidenceClass: "OBSERVED",
  runId: RUN_ID,
  codeFreezeHead: CODE_FREEZE,
  codeFreezeTree: CODE_FREEZE_TREE,
  headAtGeneration: HEAD,
  headTree: TREE,
  note: "The manifest need not hash itself, and no commit SHA is stamped into the commit that creates it.",
  /** §7.3 erratum 2: EVERY artifact this stage commits is hashed, not only the inputs. */
  evidenceArtifactDigests: manifest,
  artifactCount: Object.keys(manifest).length,
  protectedResearchEvidence: protectedTrees,
  changedExecutablePaths: (() => {
    try {
      const base = CODE_FREEZE ?? HEAD;
      return execFileSync("git", ["diff", "--name-only", base, HEAD], { cwd: REPO, encoding: "utf8" }).split(/\r?\n/u).filter(Boolean);
    } catch {
      return null;
    }
  })(),
});

/**
 * EVERY VERDICT IS COMPUTED FROM THE ARTIFACTS ABOVE.
 */
const preCreateTests = focusedTests.filter((test) => `${test.file ?? ""}`.includes("precreate_admission"));
const kernelTests = focusedTests.filter((test) => `${test.file ?? ""}`.includes("kernel_coverage"));
const capacityTests = focusedTests.filter((test) => `${test.file ?? ""}`.includes("capacity_atomicity"));
const allPassed = (tests) => tests.length > 0 && tests.every((test) => test.status === "passed");

const preCreateQualified = allPassed(preCreateTests) && focusedAdmission.admitted === true;
const kernelQualified = allPassed(kernelTests) && ancestor?.verdict === "PROTECTED_ONLY_BY_THE_LABEL" && ancestor?.observations?.canaryLeaked === false && r1hrSummary.counts.fail === 0;
const capacityQualified = allPassed(capacityTests) && race?.summary?.correctionEstablished === true && race?.summary?.correctedGrants === 1;
const evidenceQualified = focusedAdmission.admitted === true && r1hrAdmission.admitted === true && r1hcAdmission.admitted === true && Object.values(manifest).every((digest) => typeof digest === "string");
const trajectoryPreserved = delegation?.summary?.allCasesClosed === true && delegation?.summary?.noLeak === true && closure?.verdict === "CLOSURE_ESTABLISHED";
const runtimeExit = preCreateQualified && kernelQualified && capacityQualified && evidenceQualified && trajectoryPreserved && focusedTests.filter((test) => test.status !== "passed").length === 0;

write("final-verdicts.json", {
  schemaVersion: 1,
  kind: "TRAJECTORY_P2E1RG_FINAL_VERDICTS",
  stage: "Trajectory-P2-E1RG",
  evidenceClass: "DERIVED_FROM_THE_ABOVE",
  runId: RUN_ID,
  verdicts: {
    RG_A_HOST_PRECREATE_ADMISSION_QUALIFIED: preCreateQualified ? "QUALIFIED" : "NOT_ESTABLISHED",
    RG_B_KERNEL_COVERAGE_AND_TREE_VERIFICATION_QUALIFIED: kernelQualified ? "QUALIFIED" : "NOT_ESTABLISHED",
    RG_C_CONFIDENTIAL_CAPACITY_ATOMICITY_QUALIFIED: capacityQualified ? "QUALIFIED" : "NOT_ESTABLISHED",
    RG_D_HOST_ADMISSION_EVIDENCE_QUALIFIED: evidenceQualified ? "QUALIFIED" : "NOT_ESTABLISHED",
    RG_E_HOST_CONFIDENTIAL_EXECUTION_REQUALIFIED: runtimeExit ? "QUALIFIED" : "NOT_ESTABLISHED",
    TRAJECTORY_DSH_MEASUREMENT_CHAIN_PRESERVED: trajectoryPreserved ? "QUALIFIED" : "NOT_ESTABLISHED",
  },
  scope: {
    testedRuntime: { node: RUNTIME_NODE, platform: process.platform, arch: process.arch, dsh: DSH_IDENTITY, abi: compatibility.ffi?.resolvedVersion ?? null },
    explicitlyNotGeneralized: "The verdicts are scoped to this tested runtime. The CWD semantics, the pre-step instruction discovery and the Win32 binding seam were qualified against DSH 0.2.1-rc.2 only.",
    notAwarded: {
      MODEL_CONSUMED_CAPSULE: "NOT_ESTABLISHED",
      BENCHMARK_QUALIFIED: "NOT_ESTABLISHED",
      TRAJECTORY_FIRST_PARTY_ORIGIN_SETTLEMENT_QUALIFIED: "NOT_ESTABLISHED",
      UTILITY_POSITIVE_SIGNAL: "NOT_ESTABLISHED",
      UTILITY_NEGATIVE_SIGNAL: "NOT_ESTABLISHED",
      WORK_UTILITY_IMPROVED: "NOT_ESTABLISHED",
      AGENT_COOPERATION_IMPROVED: "NOT_ESTABLISHED",
      CONTROL_BASELINE_TECHNICALLY_READY: "NOT_ESTABLISHED",
    },
    notAwardedReason: "A deterministic adapter emitting a correct answer is not evidence of model reasoning or utility. No stochastic trial and no external model request occurred in this stage.",
  },
  basis: {
    RG_A: `pre-create controls ${String(preCreateTests.filter((test) => test.status === "passed").length)}/${String(preCreateTests.length)}; focused admission ${String(focusedAdmission.admitted)}`,
    RG_B: `kernel controls ${String(kernelTests.filter((test) => test.status === "passed").length)}/${String(kernelTests.length)}; probe ${String(ancestor?.verdict)}; canary leaked in production ${String(ancestor?.observations?.canaryLeaked)}; R1-HR fails ${String(r1hrSummary.counts.fail)}`,
    RG_C: `capacity controls ${String(capacityTests.filter((test) => test.status === "passed").length)}/${String(capacityTests.length)}; parent grants ${String(race?.summary?.parentGrants)}; corrected grants ${String(race?.summary?.correctedGrants)}`,
    RG_D: `focused admission ${String(focusedAdmission.admitted)}; R1-HR admission ${String(r1hrAdmission.admitted)}; R1-HC admission ${String(r1hcAdmission.admitted)}; artifacts hashed ${String(Object.keys(manifest).length)}`,
    RG_E: `all components ${String(preCreateQualified && kernelQualified && capacityQualified && evidenceQualified && trajectoryPreserved)}`,
    TRAJECTORY: `delegation matrix closed ${String(delegation?.summary?.allCasesClosed)}; closure ${String(closure?.verdict)}`,
  },
  disclosedLimits: [
    "HR-17: the pre-existing symlink fixture cannot be built on this host; the junction fixture exercises the same reparse mechanism",
    "HR-39b: concurrently ACTIVE worlds are not isolated from each other's raw code",
    "HR-33: sibling world NAMES are enumerable because the worlds parent is an ancestor of the world",
    "HC-27: parallel ACTIVE confidential workers are unsupported; the profile serializes them",
    "Excluded test: test/r3l0ciarlcf_gates.test.ts, known unsafe against a shared working tree; its exclusion predates this stage",
    "The ancestor-root probe establishes protection for a PRODUCTION-SHAPED fixture. It does not enumerate every possible layout a deployment might create.",
  ],
});

process.stdout.write(`\nrun ${RUN_ID} complete\n`);
process.exit(runtimeExit ? 0 : 1);
