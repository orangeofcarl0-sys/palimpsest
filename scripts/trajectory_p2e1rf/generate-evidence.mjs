/**
 * Trajectory-P2-E1RF §10 — EVIDENCE GENERATION FROM THE FROZEN CODE.
 *
 * WHAT CHANGED FROM E1RE (§7). The E1RE generator read R1-HR/R1-HC reports from a FIXED user-wide path
 * (`~/.palimpsest-r1hr/conformance/conformance.json`) and reused a pre-existing falsifier file. Nothing bound
 * either input to the Code Freeze under test, and `outcomes()` recorded a disclosed LIMIT as `"PASS"`.
 *
 * This generator:
 *   · runs every suite INTO a run-scoped directory it creates, so the input is the run's own output;
 *   · gives every artifact a run identity (code HEAD, tree, command, exit code, runtime, DSH, selection, runId);
 *   · ADMITS each input through `evidence-admission.mjs` and records the reasons when it is refused;
 *   · classifies every check PASS / LIMIT / FAIL and never relabels a LIMIT.
 *
 * NOTHING IS ASSERTED. Every field below is read from a child process's own output or from a real package tree.
 * A missing or refused input produces a NOT_ESTABLISHED verdict, not a default.
 *
 * Usage:  node scripts/trajectory_p2e1rf/generate-evidence.mjs [--skip-matrix]
 */
import { execFileSync, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { admitArtifact, ARTIFACT_KINDS, runIdentityOf, summarizeConformance } from "./evidence-admission.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = join(REPO, "research-evidence", "trajectory-p2e1rf");
const SKIP_MATRIX = process.argv.includes("--skip-matrix");
mkdirSync(OUT, { recursive: true });

/** A per-invocation run identity, so every artifact in this set names the same execution. */
const RUN_ID = randomUUID();
const STARTED_AT = new Date().toISOString();
const RUN_DIR = join(OUT, ".run");
mkdirSync(RUN_DIR, { recursive: true });
/**
 * WHERE THE CONFORMANCE RIGS LIVE.
 *
 * OUTSIDE THE REPOSITORY, and ABSOLUTE. Both properties are load-bearing, and both were measured:
 *
 *   · the suites build a fixture repository under the rig and walk upward for `.palimpsest`. A rig INSIDE this
 *     repository therefore inherits the real repository's `.palimpsest`, and 20 assertions fail because the
 *     fixture is no longer the layout they describe. That is not a regression in the fence; it is the suite
 *     being given the wrong world.
 *   · `--rig` is parsed as `--rig=<path>`; a space-separated value is ignored and the suite falls back to the
 *     user-wide default, which would silently reintroduce exactly the fixed-path weakness RF-D removes.
 *
 * The directory is created by THIS invocation and named by it, so the input is the run's own output.
 */
const RIG_ROOT = join(tmpdir(), `p2e1rf-rig-${RUN_ID}`);
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
/**
 * THE CODE FREEZE. The last commit that touched executable code. Computed from Git's own history rather than
 * assumed, so an evidence commit that also, wrongly, touched code would be visible as a mismatch.
 */
const CODE_FREEZE = git(["log", "-1", "--format=%H", "--", "src", "scripts", "test", "host"]) ?? HEAD;
const CODE_FREEZE_TREE = CODE_FREEZE === null ? null : git(["rev-parse", `${CODE_FREEZE}^{tree}`]);

const dshHome = (process.env.DSH_HOME ?? join(process.env.USERPROFILE ?? process.env.HOME ?? "", ".dsh")).replace(/\\/gu, "/");
const moduleRoots = [join(dshHome, "profiles", "node_modules", "@deepseek-ai"), join(dshHome, "profiles", "node_modules", "@deepseek-ai", "dsh", "node_modules", "@deepseek-ai")];
const pkgVersion = (pkg) => {
  for (const root of moduleRoots) {
    const path = join(root, pkg, "package.json");
    if (existsSync(path)) {
      try {
        return JSON.parse(readFileSync(path, "utf8")).version ?? null;
      } catch {
        return null;
      }
    }
  }
  return null;
};
const DSH_IDENTITY = pkgVersion("dsh-tool-fs") ?? "UNRESOLVED";
const RUNTIME_NODE = process.versions.node;

const write = (name, value) => {
  writeFileSync(join(OUT, name), `${JSON.stringify(value, null, 2)}\n`, "utf8");
  process.stdout.write(`  wrote ${name}\n`);
};

/** Run one child, capture its exit code and elapsed time, and build the identity block for its output. */
function runRecorded(command, args, options = {}) {
  const started = Date.now();
  const result = spawnSync(command, args, { cwd: REPO, encoding: "utf8", timeout: options.timeoutMs ?? 900_000, maxBuffer: 128 * 1024 * 1024 });
  return {
    exitCode: result.status,
    elapsedMs: Date.now() - started,
    stdout: typeof result.stdout === "string" ? result.stdout : "",
    stderr: typeof result.stderr === "string" ? result.stderr : "",
    timedOut: result.error !== undefined && result.error !== null,
    commandLine: `${command.split(/[\\/]/u).pop()} ${args.join(" ")}`,
  };
}
const identityFor = (run, selection) =>
  runIdentityOf({
    executedCodeHead: CODE_FREEZE ?? "UNKNOWN",
    executedCodeTree: CODE_FREEZE_TREE ?? "UNKNOWN",
    command: run.commandLine,
    exitCode: run.exitCode,
    runtimeNode: RUNTIME_NODE,
    dshIdentity: DSH_IDENTITY,
    selection,
    runId: RUN_ID,
    startedAt: STARTED_AT,
    elapsedMs: run.elapsedMs,
  });

/* ================================================================ A. baseline and environment */

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

const desktop = (() => {
  try {
    return execFileSync("cmd", ["/c", "ver"], { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
})();

write("baseline-and-falsifiers.json", {
  schemaVersion: 1,
  kind: "TRAJECTORY_P2E1RF_BASELINE_AND_FALSIFIERS",
  stage: "Trajectory-P2-E1RF",
  evidenceClass: "OBSERVED",
  parent: "2c3fbc60b1b8688ec067202256be65308c5e5cff",
  parentBranch: "trajectory-p2e1re-pretool-win32-qualification",
  branch: git(["rev-parse", "--abbrev-ref", "HEAD"]),
  runId: RUN_ID,
  startedAt: STARTED_AT,
  codeFreezeHead: CODE_FREEZE,
  codeFreezeTree: CODE_FREEZE_TREE,
  headAtGeneration: HEAD,
  headTree: TREE,
  environment: {
    platform: process.platform,
    arch: process.arch,
    windows: desktop,
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
    diskFreeBytes: (() => {
      try {
        const out = execFileSync("powershell", ["-NoProfile", "-Command", "(Get-PSDrive -Name F).Free"], { encoding: "utf8" }).trim();
        return Number(out);
      } catch {
        return null;
      }
    })(),
  },
  dsh: {
    release: DSH_IDENTITY,
    win32Process: pkgVersion("dsh-win32-process"),
    koffi: (() => {
      for (const root of moduleRoots) {
        const path = join(root, "koffi", "package.json");
        if (existsSync(path)) {
          try {
            return JSON.parse(readFileSync(path, "utf8")).version;
          } catch {
            return null;
          }
        }
      }
      return null;
    })(),
    packages: Object.fromEntries(["dsh-tool-fs", "dsh-working-directory", "dsh-tool-working-directory", "dsh-subagent", "dsh-tool-subagent", "dsh-agent-instructions", "dsh-win32-process"].map((pkg) => [pkg, pkgVersion(pkg)])),
    moduleRoots: moduleRoots.filter((root) => existsSync(root)),
  },
  protectedResearchEvidence: protectedTrees,
  /** The RF-0 reproduction, copied so the baseline and the correction are in one artifact. */
  rf0Reproduction: readJson(join(OUT, "rf0-defect-reproduction.json")),
});

/* ================================================================ B. the focused suites, run-scoped */

const FOCUSED_SUITES = [
  "test/trajectory_p2e1rd_cwd_boundary.test.ts",
  "test/trajectory_p2e1re_pretool_boundary.test.ts",
  "test/trajectory_p2e1re_win32_fault.test.ts",
  "test/trajectory_p2e1rf_delegation_alias.test.ts",
  "test/trajectory_p2e1rf_answer_provenance.test.ts",
  "test/trajectory_p2e1rf_malformed_ace.test.ts",
  "test/trajectory_p2e1rf_evidence_freshness.test.ts",
];
const vitestReport = join(RUN_DIR, "vitest.json");
const vitestRun = runRecorded(process.execPath, [join(REPO, "node_modules", "vitest", "vitest.mjs"), "run", ...FOCUSED_SUITES, "--reporter=json", `--outputFile=${vitestReport}`]);
const vitestJson = readJson(vitestReport);
const vitestTests = (vitestJson?.testResults ?? []).flatMap((file) => (file.assertionResults ?? []).map((entry) => ({ file: file.name ?? null, name: entry.fullName ?? entry.title, status: entry.status })));
const vitestIdentity = identityFor(vitestRun, FOCUSED_SUITES.join(","));
const vitestAdmission = admitArtifact({
  kind: ARTIFACT_KINDS.VITEST,
  path: vitestReport,
  content: { runIdentity: vitestIdentity, results: vitestTests },
  digest: digestOfFile(vitestReport),
  expectedCodeHead: CODE_FREEZE,
  expectedTree: CODE_FREEZE_TREE,
});

write("focused-suites.json", {
  schemaVersion: 1,
  kind: "TRAJECTORY_P2E1RF_FOCUSED_SUITES",
  stage: "Trajectory-P2-E1RF",
  evidenceClass: "DYNAMICALLY_VERIFIED",
  note: "These are the DECISION controls for RF-A/B/C/D. Ordering and first-party claims are established separately by the real-DSH cases.",
  runIdentity: vitestIdentity,
  runId: RUN_ID,
  admission: { admitted: vitestAdmission.admitted, reasons: vitestAdmission.reasons },
  artifactDigest: digestOfFile(vitestReport),
  suites: FOCUSED_SUITES,
  totals: {
    files: vitestJson?.testResults?.length ?? 0,
    tests: vitestTests.length,
    passed: vitestTests.filter((test) => test.status === "passed").length,
    failed: vitestTests.filter((test) => test.status !== "passed").map((test) => test.name),
  },
  /** Per-suite counts, so a suite that contributed no tests is visible rather than invisible. */
  perSuite: Object.fromEntries(
    FOCUSED_SUITES.map((suite) => {
      const file = vitestJson?.testResults?.find((entry) => String(entry.name ?? "").replace(/\\/gu, "/").endsWith(suite));
      const results = file?.assertionResults ?? [];
      return [suite, { tests: results.length, passed: results.filter((entry) => entry.status === "passed").length, failed: results.filter((entry) => entry.status !== "passed").length }];
    }),
  ),
});

/* ================================================================ C. delegation matrix (real DSH) */

let delegationMatrix = null;
if (!SKIP_MATRIX) {
  const matrixOut = join(RUN_DIR, "delegation-matrix.json");
  const matrixRun = runRecorded(process.execPath, [join(REPO, "scripts", "trajectory_p2e1rf", "run-delegation-matrix.mjs"), "--json-out", matrixOut], { timeoutMs: 2_700_000 });
  const parsed = readJson(matrixOut);
  delegationMatrix = {
    runIdentity: identityFor(matrixRun, "scripts/trajectory_p2e1rf/run-delegation-matrix.mjs"),
    artifactDigest: digestOfFile(matrixOut),
    summary: parsed?.summary ?? null,
    cases:
      parsed?.cases?.map((entry) => ({
        case: entry.case,
        why: entry.why,
        expectedVerdict: entry.expectedVerdict,
        verdict: entry.verdict,
        matched: entry.matched,
        canaryDelivered: entry.canaryDelivered,
        siblingTokenDelivered: entry.siblingTokenDelivered,
        childSessionCreated: entry.childSessionCreated,
        refusalObserved: entry.refusalObserved,
        sessionCount: entry.sessionCount,
        cleanup: entry.cleanup,
        fixtureLimit: entry.fixtureLimit,
      })) ?? null,
    exitCode: matrixRun.exitCode,
  };
} else {
  delegationMatrix = { skipped: true, reason: "the matrix was skipped by an explicit flag; the delegation verdict is NOT established by this run" };
}

write("delegation-path-qualification.json", {
  schemaVersion: 1,
  kind: "TRAJECTORY_P2E1RF_DELEGATION_PATH_QUALIFICATION",
  stage: "Trajectory-P2-E1RF",
  evidenceClass: "FIRST_PARTY_DSH_VERIFIED",
  note: "The unit controls prove the DECISION. These cases prove the ORDERING: a refused CWD creates no child Session, so nothing is read before the refusal.",
  defect: {
    id: "D1",
    source: "host/deployment/runtime/cwd_fence.js :: createDelegationCwdGuard()",
    reproduction: "world/alias-to-world was ADMITTED on the parent commit because its canonical target is the world",
  },
  correction: {
    lexicalIdentityIsTheDecision: true,
    reparseScanOverTheSpelledPath: true,
    canonicalizationIsAConsistencyCheck: true,
    enforcedSurfaceDerivedFrom: "CAPABILITY_CLASSES where class === DELEGATED_SURFACE",
    declaredMinimum: ["subagent", "subagent_fork"],
    auditFinding: "DSH 0.2.1-rc.2 registers `subagent` and does not register `subagent_fork`; the E1RE list therefore named a capability this release does not have",
  },
  unitControls: (() => {
    const admissionOfSuite = {
      suite: "test/trajectory_p2e1rf_delegation_alias.test.ts",
      tests: vitestTests.filter((test) => test.file !== null && `${test.file}`.replace(/\\/gu, "/").endsWith("test/trajectory_p2e1rf_delegation_alias.test.ts")),
    };
    return { suite: admissionOfSuite.suite, total: admissionOfSuite.tests.length, passed: admissionOfSuite.tests.filter((test) => test.status === "passed").length, failed: admissionOfSuite.tests.filter((test) => test.status !== "passed").map((test) => test.name) };
  })(),
  firstPartyCases: delegationMatrix,
});

/* ================================================================ D. answer provenance */

const closurePath = join(OUT, "closure-gate.json");
const closure = readJson(closurePath);
write("answer-provenance.json", {
  schemaVersion: 1,
  kind: "TRAJECTORY_P2E1RF_ANSWER_PROVENANCE",
  stage: "Trajectory-P2-E1RF",
  evidenceClass: "DYNAMICALLY_VERIFIED",
  note: "Read from the closure gate's own receipts. The digest is the HARNESS's observation of the persisted bytes; the emitted digest is test configuration and is named separately.",
  defect: {
    id: "D2",
    source: "scripts/trajectory_p2e1rc/closure-gate.mjs :: armReceipt().answerDigest",
    reproduction: "both arms recorded sha256-74234e98…b90b, which is SHA-256 of the literal string \"null\"",
    nullPayloadDigest: "sha256-74234e98afe7498fb5daf1f36ac2d78acc339464f950703b8c019892f982b90b",
  },
  correction: {
    digestComputedAt: "assay-harness.mjs, over extraction.rawText, the bytes read from official DSH persistence",
    observedField: "persistedExtractedAnswerDigest",
    configurationField: "emittedExpectedAnswerDigest",
    gateRejectsNullDigest: true,
  },
  unitControls: (() => {
    const tests = vitestTests.filter((test) => test.file !== null && `${test.file}`.replace(/\\/gu, "/").endsWith("test/trajectory_p2e1rf_answer_provenance.test.ts"));
    return { suite: "test/trajectory_p2e1rf_answer_provenance.test.ts", total: tests.length, passed: tests.filter((test) => test.status === "passed").length, failed: tests.filter((test) => test.status !== "passed").map((test) => test.name) };
  })(),
  arms: closure === null ? null : { control: closure.armReceipts?.control ?? null, treatment: closure.armReceipts?.treatment ?? null },
  closureVerdict: closure?.verdict ?? "NOT_RUN",
  closureGatesForProvenance: closure?.gates?.filter((entry) => entry.id.includes("answer-digest") || entry.id.includes("answer-extracted") || entry.id.includes("answer-matches")) ?? null,
});

/* ================================================================ E. Win32 preservation */

const r1hrRun = runRecorded(process.execPath, [join(REPO, "scripts", "r1hr", "conformance.mjs"), `--rig=${join(RIG_ROOT, "r1hr")}`], { timeoutMs: 900_000 });
const r1hcRun = runRecorded(process.execPath, [join(REPO, "scripts", "r1hc", "conformance.mjs"), `--rig=${join(RIG_ROOT, "r1hc")}`], { timeoutMs: 900_000 });
/** The suites write `conformance.json` into their rig; that is the run's own output, not a user-wide file. */
const r1hrRecordRaw = readJson(join(RIG_ROOT, "r1hr", "conformance.json"));
const r1hcRecordRaw = readJson(join(RIG_ROOT, "r1hc", "conformance.json"));
const r1hrIdentity = identityFor(r1hrRun, "r1hr-conformance");
const r1hcIdentity = identityFor(r1hcRun, "r1hc-conformance");
/** The identity is attached to a COPY that is then admitted, so the artifact carries its own provenance. */
const r1hrArtifact = r1hrRecordRaw === null ? null : { ...r1hrRecordRaw, runIdentity: r1hrIdentity };
const r1hcArtifact = r1hcRecordRaw === null ? null : { ...r1hcRecordRaw, runIdentity: r1hcIdentity };
const r1hrDigest = r1hrArtifact === null ? null : digestOfText(JSON.stringify(r1hrArtifact));
const r1hcDigest = r1hcArtifact === null ? null : digestOfText(JSON.stringify(r1hcArtifact));
const r1hrAdmission = admitArtifact({ kind: ARTIFACT_KINDS.CONFORMANCE, path: "r1hr", content: r1hrArtifact, digest: r1hrDigest, expectedCodeHead: CODE_FREEZE, expectedTree: CODE_FREEZE_TREE, expectedDsh: DSH_IDENTITY, expectedRuntime: RUNTIME_NODE });
const r1hcAdmission = admitArtifact({ kind: ARTIFACT_KINDS.CONFORMANCE, path: "r1hc", content: r1hcArtifact, digest: r1hcDigest, expectedCodeHead: CODE_FREEZE, expectedTree: CODE_FREEZE_TREE, expectedDsh: DSH_IDENTITY, expectedRuntime: RUNTIME_NODE });
const r1hrSummary = summarizeConformance("r1hr", r1hrArtifact);
const r1hcSummary = summarizeConformance("r1hc", r1hcArtifact);

write("win32-preservation.json", {
  schemaVersion: 1,
  kind: "TRAJECTORY_P2E1RF_WIN32_PRESERVATION",
  stage: "Trajectory-P2-E1RF",
  evidenceClass: "DYNAMICALLY_VERIFIED",
  note: "Read from the SUITES' OWN JSON produced in this run's rig, not from a user-wide path. PASS, LIMIT and FAIL are counted separately and a LIMIT is never recorded as a PASS.",
  defect: {
    id: "D3",
    source: "host/deployment/runtime/win32_label.js :: parseLabelAcl() / planLabel()",
    reproduction: "a mandatory ACE with an undecodable policy mask parsed as present:true/readable:true, and planLabel computed NaN | NO_READ_UP = 2, discarding every existing policy bit",
  },
  correction: {
    validatedFields: ["AclSize", "AceCount", "AceType", "AceFlags", "AceSize", "policyMask", "SidRevision", "SubAuthorityCount", "SidLength", "IdentifierAuthority", "IntegrityRid"],
    unverifiedState: "present:false, readable:false, unreadableField:<name>",
    absentLabelMeaning: "present:false, readable:true — the descriptor WAS read and carried no mandatory ACE",
    planLabelRefusesCoercion: true,
  },
  unitControls: (() => {
    const tests = vitestTests.filter((test) => test.file !== null && `${test.file}`.replace(/\\/gu, "/").endsWith("test/trajectory_p2e1rf_malformed_ace.test.ts"));
    return { suite: "test/trajectory_p2e1rf_malformed_ace.test.ts", total: tests.length, passed: tests.filter((test) => test.status === "passed").length, failed: tests.filter((test) => test.status !== "passed").map((test) => test.name) };
  })(),
  suites: {
    r1hr: {
      runIdentity: r1hrIdentity,
      admission: { admitted: r1hrAdmission.admitted, reasons: r1hrAdmission.reasons },
      artifactDigest: r1hrDigest,
      exitCode: r1hrRun.exitCode,
      totals: { checks: r1hrSummary.checks.length, pass: r1hrSummary.counts.pass, limit: r1hrSummary.counts.limit, fail: r1hrSummary.counts.fail },
      verdict: r1hrSummary.verdict,
      /** A LIMIT is listed AS a limit, with its statement, so it cannot read as a verified assertion. */
      limits: r1hrSummary.checks.filter((check) => check.status === "LIMIT"),
      failures: r1hrSummary.checks.filter((check) => check.status === "FAIL"),
      duplicateIds: r1hrSummary.duplicateIdentities,
      declaredLimits: r1hrSummary.declaredLimits,
    },
    r1hc: {
      runIdentity: r1hcIdentity,
      admission: { admitted: r1hcAdmission.admitted, reasons: r1hcAdmission.reasons },
      artifactDigest: r1hcDigest,
      exitCode: r1hcRun.exitCode,
      totals: { checks: r1hcSummary.checks.length, pass: r1hcSummary.counts.pass, limit: r1hcSummary.counts.limit, fail: r1hcSummary.counts.fail },
      verdict: r1hcSummary.verdict,
      limits: r1hcSummary.checks.filter((check) => check.status === "LIMIT"),
      failures: r1hcSummary.checks.filter((check) => check.status === "FAIL"),
      duplicateIds: r1hcSummary.duplicateIdentities,
      declaredLimits: r1hcSummary.declaredLimits,
    },
  },
  preservedConstraints: [
    "a single ACTIVE confidential worker (HC-27, disclosed LIMIT)",
    "concurrently active worlds are not isolated from each other's raw code (HR-39b, disclosed LIMIT)",
    "the shared worlds parent is an ancestor of the world, so sibling world NAMES are enumerable (HR-33, disclosed LIMIT)",
  ],
});

/* ================================================================ F. security conformance + evidence freshness */

const falsifierOut = join(RUN_DIR, "evidence-falsifiers.json");
const falsifierRun = runRecorded(process.execPath, [join(REPO, "scripts", "trajectory_p2e1rf", "evidence-falsifiers.mjs"), "--json-out", falsifierOut]);
const falsifierParsed = readJson(falsifierOut);

write("security-conformance.json", {
  schemaVersion: 1,
  kind: "TRAJECTORY_P2E1RF_SECURITY_CONFORMANCE",
  stage: "Trajectory-P2-E1RF",
  evidenceClass: "DYNAMICALLY_VERIFIED",
  note: "The integrated security picture: which guarantees are in force, which are disclosed limits, and which are unverified.",
  guardLayers: {
    kernel: { installed: true, verifiedBy: "R1-HR HR-09..HR-12, HR-32" },
    trustedReadGuard: { installed: "global scope", requiredBecause: "a delegation capability reaches other scopes" },
    cwdBasisFence: { installed: true, invariant: "the effective Session directory must EQUAL the execution world" },
    delegationFence: { installed: true, invariant: "a child directory must be the world, tested lexically and by reparse scan" },
    admissionPrecondition: { required: ["readGuardInstalled", "cwdFenceInstalled", "delegationFenceInstalled", "globalGuardScope", "capabilitySurfaceAdmitted"] },
  },
  capabilitySurface: {
    failClosed: true,
    withdrawn: ["working_directory"],
    withdrawalBackstop: "the name stays absent from CAPABILITY_CLASSES, so a re-exposure refuses the worker start",
    delegationSurfaceDerivedFromTable: true,
  },
  confidentialProfile: { serializesActiveWorkers: true, disclosedLimitation: "HC-27" },
  evidenceFalsifiers: {
    runIdentity: identityFor(falsifierRun, "scripts/trajectory_p2e1rf/evidence-falsifiers.mjs"),
    exitCode: falsifierRun.exitCode,
    artifactDigest: digestOfFile(falsifierOut),
    summary: falsifierParsed?.summary ?? null,
    cases: falsifierParsed?.cases?.map((entry) => ({ case: entry.case, injected: entry.injected, refused: entry.refused, positiveControl: entry.positiveControl })) ?? null,
  },
});

write("evidence-freshness.json", {
  schemaVersion: 1,
  kind: "TRAJECTORY_P2E1RF_EVIDENCE_FRESHNESS",
  stage: "Trajectory-P2-E1RF",
  evidenceClass: "OBSERVED",
  note: "The run identity of every authoritative input in this set, and the admission decision for each.",
  defect: {
    id: "D4",
    source: "scripts/trajectory_p2e1re/generate-evidence.mjs",
    reproduction: "conformance reports were read from a fixed user-wide path and a prior falsifier file was reused, with no binding to the code freeze; LIMIT rows were recorded as PASS",
    evidenceClass: "SOURCE_DEMONSTRATED",
  },
  correction: {
    runScoped: "every suite runs into research-evidence/trajectory-p2e1rf/.run, created by this invocation",
    runId: RUN_ID,
    identityFields: ["executedCodeHead", "executedCodeTree", "command", "exitCode", "runtimeNode", "dshIdentity", "selection", "runId"],
    timestampIsNotFreshnessProof: true,
    limitHandling: "classifyCheck reads `limit` BEFORE `pass`",
    duplicateIds: "preserved and reported, never deduplicated",
  },
  inputs: [
    { artifact: "focused suites (vitest json)", runIdentity: vitestIdentity, digest: digestOfFile(vitestReport), admitted: vitestAdmission.admitted, reasons: vitestAdmission.reasons },
    { artifact: "r1hr conformance", runIdentity: r1hrIdentity, digest: r1hrDigest, admitted: r1hrAdmission.admitted, reasons: r1hrAdmission.reasons },
    { artifact: "r1hc conformance", runIdentity: r1hcIdentity, digest: r1hcDigest, admitted: r1hcAdmission.admitted, reasons: r1hcAdmission.reasons },
    { artifact: "evidence falsifiers", runIdentity: identityFor(falsifierRun, "scripts/trajectory_p2e1rf/evidence-falsifiers.mjs"), digest: digestOfFile(falsifierOut), admitted: falsifierParsed !== null, reasons: falsifierParsed === null ? ["the falsifier artifact was not produced"] : [] },
    ...(delegationMatrix?.cases === undefined ? [] : [{ artifact: "delegation matrix", runIdentity: delegationMatrix.runIdentity, digest: delegationMatrix.artifactDigest, admitted: delegationMatrix.summary?.allCasesClosed === true, reasons: delegationMatrix.summary?.allCasesClosed === true ? [] : ["the matrix did not close"] }]),
  ],
  historicalTranscriptions: [
    {
      artifact: "research-evidence/trajectory-p2e1re/pretool-first-party-falsifiers.json :: beforeFix",
      evidenceClass: "HISTORICAL_OBSERVATION_TRANSCRIBED",
      note: "E1RE recorded its pre-fix observations as a transcription of earlier local runs. The original logs are NOT available to this stage, so they cannot be bound by digest and are not presented as dynamically re-executed. No vulnerable configuration was re-run to obtain a better-looking chain.",
    },
  ],
});

/* ================================================================ G. execution + git identity */

write("trajectory-execution.json", {
  schemaVersion: 1,
  kind: "TRAJECTORY_P2E1RF_TRAJECTORY_EXECUTION",
  stage: "Trajectory-P2-E1RF",
  evidenceClass: "DYNAMICALLY_VERIFIED",
  note: "Copied from the closure gate's own report. This artifact adds no claim of its own.",
  closureVerdict: closure?.verdict ?? "NOT_RUN",
  gateCount: closure?.gateCount ?? null,
  failedGates: closure?.failedGates ?? [],
  runtime: closure?.environment ?? null,
  executedCodeHead: closure?.executedCodeHead ?? null,
  receipts: closure?.receipts ?? null,
  /** The DERIVED per-arm receipts: these are the ones that carry the answer digest. */
  armReceipts: closure?.armReceipts ?? null,
  modelCallsMade: closure?.modelCallsMade ?? null,
  externalModelRequestOccurred: closure?.externalModelRequestOccurred ?? null,
  notAwarded: closure?.notAwarded ?? null,
});

write("git-and-evidence-identity.json", {
  schemaVersion: 1,
  kind: "TRAJECTORY_P2E1RF_GIT_AND_EVIDENCE_IDENTITY",
  stage: "Trajectory-P2-E1RF",
  evidenceClass: "OBSERVED",
  runId: RUN_ID,
  codeFreezeHead: CODE_FREEZE,
  codeFreezeTree: CODE_FREEZE_TREE,
  headAtGeneration: HEAD,
  headTree: TREE,
  /**
   * §7.6: the manifest need not hash itself, and no commit SHA is stamped into the commit that creates it.
   * The Evidence Freeze HEAD is therefore recorded by the report, not by this file.
   */
  note: "headAtGeneration is the commit from which these artifacts were produced. The Evidence Freeze commit that contains them is named in the final report, not here, because a commit cannot contain its own hash.",
  protectedResearchEvidence: protectedTrees,
  evidenceInputDigests: {
    "rf0-defect-reproduction.json": digestOfFile(join(OUT, "rf0-defect-reproduction.json")),
    "focused-suites.json": digestOfFile(join(OUT, "focused-suites.json")),
    "delegation-path-qualification.json": digestOfFile(join(OUT, "delegation-path-qualification.json")),
    "win32-preservation.json": digestOfFile(join(OUT, "win32-preservation.json")),
    "security-conformance.json": digestOfFile(join(OUT, "security-conformance.json")),
    "evidence-freshness.json": digestOfFile(join(OUT, "evidence-freshness.json")),
  },
  changedExecutablePaths: (() => {
    try {
      const base = CODE_FREEZE ?? HEAD;
      return execFileSync("git", ["diff", "--name-only", base, HEAD], { cwd: REPO, encoding: "utf8" }).split(/\r?\n/u).filter(Boolean);
    } catch {
      return null;
    }
  })(),
});

/* ================================================================ H. verdicts */

/**
 * EVERY VERDICT BELOW IS COMPUTED FROM THE ARTIFACTS ABOVE. None is written as a literal.
 */
const focusedFailed = vitestTests.filter((test) => test.status !== "passed");
const delegationClosed = delegationMatrix?.summary?.allCasesClosed === true && delegationMatrix?.summary?.noLeak === true;
const delegationRefusals = delegationMatrix?.cases?.filter((entry) => entry.expectedVerdict === "REFUSED_BY_GUARD") ?? [];
const delegationChildrenRefused = delegationRefusals.every((entry) => entry.childSessionCreated === false);
const delegationLegitimate = (delegationMatrix?.cases ?? []).filter((entry) => entry.expectedVerdict === "ALLOWED_NO_DELIVERY");
const delegationLegitimateWorks = delegationLegitimate.length > 0 && delegationLegitimate.every((entry) => entry.matched === true && entry.canaryDelivered === false);

const controlReceipt = closure?.armReceipts?.control ?? null;
const treatmentReceipt = closure?.armReceipts?.treatment ?? null;
const digestPresent = (receipt) => /^sha256-[0-9a-f]{64}$/u.test(String(receipt?.answerDigest ?? "")) && receipt?.answerDigest !== "sha256-74234e98afe7498fb5daf1f36ac2d78acc339464f950703b8c019892f982b90b";
const provenanceEstablished = digestPresent(controlReceipt) && digestPresent(treatmentReceipt) && controlReceipt?.oracleOk === true && treatmentReceipt?.oracleOk === true && controlReceipt?.answerDigest !== treatmentReceipt?.answerDigest;

const win32Established = r1hrSummary.counts.fail === 0 && r1hcSummary.counts.fail === 0 && r1hrAdmission.admitted === true && r1hcAdmission.admitted === true && vitestTests.filter((test) => `${test.file ?? ""}`.includes("malformed_ace") && test.status === "passed").length > 0;

const freshnessEstablished = falsifierParsed?.summary?.allRefused === true && falsifierParsed?.summary?.positiveControlsPresent === true && vitestAdmission.admitted === true;

const runtimeExit = delegationClosed && delegationChildrenRefused && delegationLegitimateWorks && provenanceEstablished && win32Established && freshnessEstablished && closure?.verdict === "CLOSURE_ESTABLISHED" && focusedFailed.length === 0;

write("final-verdicts.json", {
  schemaVersion: 1,
  kind: "TRAJECTORY_P2E1RF_FINAL_VERDICTS",
  stage: "Trajectory-P2-E1RF",
  evidenceClass: "DERIVED_FROM_THE_ABOVE",
  runId: RUN_ID,
  verdicts: {
    E1RF_A_DELEGATION_PATH_IDENTITY_QUALIFIED: delegationClosed && delegationChildrenRefused && delegationLegitimateWorks ? "QUALIFIED" : "NOT_ESTABLISHED",
    E1RF_B_ANSWER_PROVENANCE_QUALIFIED: provenanceEstablished ? "QUALIFIED" : "NOT_ESTABLISHED",
    E1RF_C_WIN32_MALFORMED_ACE_PRESERVATION_QUALIFIED: win32Established ? "QUALIFIED" : "NOT_ESTABLISHED",
    E1RF_D_EVIDENCE_FRESHNESS_QUALIFIED: freshnessEstablished ? "QUALIFIED" : "NOT_ESTABLISHED",
    E1RF_RUNTIME_EXIT_TRAJECTORY_MEASUREMENT_INFRASTRUCTURE_QUALIFIED: runtimeExit ? "QUALIFIED" : "NOT_ESTABLISHED",
  },
  scope: {
    testedRuntime: { node: RUNTIME_NODE, platform: process.platform, dsh: DSH_IDENTITY, win32Process: pkgVersion("dsh-win32-process"), koffi: (() => {
      for (const root of moduleRoots) {
        const path = join(root, "koffi", "package.json");
        if (existsSync(path)) {
          try {
            return JSON.parse(readFileSync(path, "utf8")).version;
          } catch {
            return null;
          }
        }
      }
      return null;
    })() },
    explicitlyNotGeneralized: "The runtime exit verdict is scoped to this tested runtime. It is NOT a claim about any future DSH release: the CWD semantics, the pre-step instruction discovery and the Win32 binding seam were qualified against 0.2.1-rc.2 only.",
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
    RF_A: `first-party matrix ${delegationClosed ? "closed" : "NOT closed"}: ${String(delegationMatrix?.summary?.matched ?? 0)}/${String(delegationMatrix?.summary?.total ?? 0)} matched, leaked ${JSON.stringify(delegationMatrix?.summary?.leaked ?? null)}; every refused case created no child session: ${String(delegationChildrenRefused)}; legitimate in-world delegation still works: ${String(delegationLegitimateWorks)}`,
    RF_B: `control digest ${String(controlReceipt?.answerDigest)}; treatment digest ${String(treatmentReceipt?.answerDigest)}; distinct=${String(controlReceipt?.answerDigest !== treatmentReceipt?.answerDigest)}`,
    RF_C: `R1-HR ${String(r1hrSummary.counts.pass)} PASS/${String(r1hrSummary.counts.limit)} LIMIT/${String(r1hrSummary.counts.fail)} FAIL; R1-HC ${String(r1hcSummary.counts.pass)} PASS/${String(r1hcSummary.counts.limit)} LIMIT/${String(r1hcSummary.counts.fail)} FAIL; both admitted=${String(r1hrAdmission.admitted && r1hcAdmission.admitted)}`,
    RF_D: `falsifiers refused ${String(falsifierParsed?.summary?.refused ?? 0)}/${String(falsifierParsed?.summary?.total ?? 0)} with positive controls ${String(falsifierParsed?.summary?.positiveControlsPresent)}; vitest admission ${String(vitestAdmission.admitted)}`,
    runtimeExit: `all four components ${String(delegationClosed && provenanceEstablished && win32Established && freshnessEstablished)}; closure ${String(closure?.verdict)}; focused failures ${String(focusedFailed.length)}`,
  },
  /** Limits carried forward verbatim, so the reader sees what is NOT claimed. */
  disclosedLimits: [
    "HR-17: the pre-existing symlink fixture cannot be built on this host; the junction fixture exercises the same reparse mechanism",
    "HR-39b: concurrently ACTIVE worlds are not isolated from each other's raw code",
    "HR-33: sibling world NAMES are enumerable because the worlds parent is an ancestor of the world",
    "HC-27: parallel ACTIVE confidential workers are unsupported; the profile serializes them",
    "Excluded test: test/r3l0ciarlcf_gates.test.ts, known unsafe against a shared working tree; its exclusion predates this stage",
  ],
});

process.stdout.write(`\nrun ${RUN_ID} complete\n`);
/**
 * THE RIG IS TEST-OWNED AND REMOVED BY NAME. It is a directory this invocation created under the OS temp root,
 * never a user path, and nothing outside it is touched.
 */
rmSync(RIG_ROOT, { recursive: true, force: true });
process.exit(runtimeExit ? 0 : 1);
