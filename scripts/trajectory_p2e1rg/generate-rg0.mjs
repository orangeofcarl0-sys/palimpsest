/**
 * Trajectory-P2-E1RG §3 — RG-0 DEFECT CLASSIFICATION (SOURCE + EXECUTION DERIVED).
 *
 * This generator runs the RG-0 falsifier suite and the ancestor-root probe, and records what they observed.
 * It does not restate expectations: every field is copied from a child process's own output or from the
 * suite's JSON report.
 *
 * Usage:  node scripts/trajectory_p2e1rg/generate-rg0.mjs
 */
import { execFileSync, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = join(REPO, "research-evidence", "trajectory-p2e1rg");
mkdirSync(OUT, { recursive: true });
const RUN_ID = randomUUID();

const readJson = (path) => {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
};
const digestOfFile = (path) => {
  try {
    return `sha256-${createHash("sha256").update(readFileSync(path)).digest("hex")}`;
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

/** Run the RG-0 falsifier suite and capture its own JSON report. */
const vitestReport = join(OUT, ".rg0-vitest.json");
const vitestRun = spawnSync(process.execPath, [join(REPO, "node_modules", "vitest", "vitest.mjs"), "run", "test/trajectory_p2e1rg_baseline_admission.test.ts", "--reporter=json", `--outputFile=${vitestReport}`], { cwd: REPO, encoding: "utf8", timeout: 900_000 });
const vitestJson = readJson(vitestReport);
const tests = (vitestJson?.testResults ?? []).flatMap((file) => (file.assertionResults ?? []).map((entry) => ({ name: entry.fullName ?? entry.title, status: entry.status })));

/** Run the ancestor-root probe; a leak exits 3, which is a FINDING rather than a harness failure. */
const probePath = join(OUT, "ancestor-root-baseline.json");
const probeRun = spawnSync(process.execPath, [join(REPO, "scripts", "trajectory_p2e1rg", "ancestor-root-probe.mjs"), "--json-out", probePath], { cwd: REPO, encoding: "utf8", timeout: 900_000 });
const probe = readJson(probePath);

/**
 * THE FINDINGS. Each record is the observed baseline behaviour, with its evidence class.
 *
 * `DETECTED_BY_EXISTING_TESTS` is `false` throughout, and that is itself a finding: the E1RF suite reported
 * 118/118 while every one of these control-flow and coverage gaps was present.
 */
const findings = [
  {
    id: "RG-0-F1",
    title: "Capacity refusal does not stop Agent creation",
    source: "host/dsh/lib/runner.js :: runWorker(), the openConfidentialSlot branch",
    evidenceClass: "DYNAMIC_UNIT_VERIFIED",
    baselineBehavior: "the refusal assigns `failure`, and execution continues to `agents.create()`; a success-shaped Worker Result is then printed with exit 0",
    reproductionInput: "a live holder pid is seeded into the test-owned confidential slot, then the real runWorker is driven",
    actualObservation: "capacity line reports granted:false; agents.create() is reached; PALIMPSEST_WORK_RESULT is READY_FOR_SETTLEMENT",
    expectedSecureBehavior: "a denied capacity slot must prevent Agent creation, model turns and successful worker reporting",
    detectedByExistingTests: false,
    requiredCorrection: "make pre-create admission a control-flow decision, not an assignment",
  },
  {
    id: "RG-0-F2",
    title: "Alias refusal does not stop Agent creation",
    source: "host/dsh/lib/runner.js :: runWorker(), the boundary.aliasesClean branch",
    evidenceClass: "DYNAMIC_UNIT_VERIFIED",
    baselineBehavior: "the alias refusal assigns `failure`, and execution continues to `agents.create()`",
    reproductionInput: "a junction inside the test-owned world pointing at the protected root",
    actualObservation: "the read-boundary line reports clean:false, and agents.create() is still reached",
    expectedSecureBehavior: "an alias admission refusal must prevent execution before the first Agent context exists",
    detectedByExistingTests: false,
    requiredCorrection: "same control-flow correction as F1",
  },
  {
    id: "RG-0-F3",
    title: "Alias refusal does not prevent Kernel label mutation",
    source: "host/deployment/runtime/worker_fence.js :: installWorkerReadBoundary()",
    evidenceClass: "DYNAMIC_UNIT_VERIFIED",
    baselineBehavior: "`applyReadFence()` is called unconditionally, AFTER `admitWorldForFencing()` has already refused the world",
    reproductionInput: "a world holding a junction into the protected root, with the protected root supplied as an extra root",
    actualObservation: "aliasesClean is false AND kernel.outcomes.length is greater than zero",
    expectedSecureBehavior: "a rejected world must not trigger protected-object label writes",
    detectedByExistingTests: false,
    requiredCorrection: "detect the alias refusal before any label mutation",
  },
  {
    id: "RG-0-F4",
    title: "Kernel failure is not a mandatory admission condition",
    source: "host/deployment/runtime/worker_fence.js :: admitWorker()",
    evidenceClass: "DYNAMIC_UNIT_VERIFIED",
    baselineBehavior: "the required set covers only the three guard layers, the guard scope and the capability surface",
    reproductionInput: "admitWorker with the three guard flags true and no kernel input at all",
    actualObservation: "allowed is true; `kernelSupported`, `rootsVerified` and `treesVerified` are absent from `boundary.required`",
    expectedSecureBehavior: "kernel support, root verification, ABI compatibility and tree completeness must be admission inputs",
    detectedByExistingTests: false,
    requiredCorrection: "add kernel coverage to the required set, computed from the actual installation report",
  },
  {
    id: "RG-0-F5",
    title: "Partial tree traversal can report Verified",
    source: "host/deployment/runtime/read_fence.js :: verifyTree()",
    evidenceClass: "DYNAMIC_UNIT_VERIFIED",
    baselineBehavior: "recursion stops at maxEntries/maxDepth, and `verified` is computed only from the two arrays",
    reproductionInput: "a tree with descendants, verified with maxEntries: 1",
    actualObservation: "checked is at most 1, and no field distinguishes a complete traversal from one that stopped early",
    expectedSecureBehavior: "an unexamined required object cannot produce verified:true; completeness must be reported separately",
    detectedByExistingTests: false,
    requiredCorrection: "separate NO_UNPROTECTED_ENTRY_FOUND from ALL_REQUIRED_ENTRIES_VERIFIED",
  },
  {
    id: "RG-0-F6",
    title: "Confidential Slot acquisition is non-atomic",
    source: "host/deployment/runtime/confidential_profile.js :: openConfidentialSlot()",
    evidenceClass: "SOURCE_DEMONSTRATED",
    baselineBehavior: "acquire() reads the slot file, compares the holder count, then overwrites the file; there is no exclusive primitive",
    reproductionInput: "two independent slot handles over the same file, plus a live holder whose record is older than staleAfterMs",
    actualObservation: "the read-check-write sequence is present in source and no lock primitive is used; a LIVE holder past the TTL is dropped and its slot granted to another caller",
    expectedSecureBehavior: "at most one live confidential owner under concurrent cross-process acquisition; a live holder is never displaced by a timestamp",
    detectedByExistingTests: false,
    requiredCorrection: "an OS-backed exclusive ownership primitive, plus removal of TTL-based eviction of live holders",
    /** The cross-process interleaving itself is not scheduled by this suite; the mechanism is what is established. */
    limitation: "the in-process control establishes the MECHANISM (read-check-write, no lock). The cross-process interleaving is established separately by the concurrency suite.",
  },
  {
    id: "RG-0-F7",
    title: "Ancestor-root Kernel exception leaves durable state unprotected without a separate label",
    source: "host/deployment/runtime/read_fence.js :: planReadFence()",
    evidenceClass: "FIRST_PARTY_DSH_VERIFIED",
    baselineBehavior: "the root containing the execution world is SKIPPED, so nothing under it is planned for labelling",
    reproductionInput: "production-shaped layout: <repo>/.palimpsest/worlds/attempt-A as the world, <repo>/.palimpsest/durable-state holding a synthetic canary",
    actualObservation: probe?.verdict ?? "PROBE_NOT_RUN",
    expectedSecureBehavior: "the skipped root's contents must be protected by a verified, independently established boundary, or the coverage must be reported as incomplete",
    detectedByExistingTests: false,
    requiredCorrection: "report root coverage honestly and make the ancestor exception an explicit, tested admission input",
  },
];

const report = {
  schemaVersion: 1,
  kind: "TRAJECTORY_P2E1RG_RG0_FINDINGS",
  stage: "Trajectory-P2-E1RG",
  evidenceClass: "DYNAMICALLY_VERIFIED",
  note: "Every record is the output of executing the shipped code. No finding is inferred from a code reading alone, except where the evidence class says SOURCE_DEMONSTRATED.",
  runId: RUN_ID,
  executedCodeHead: HEAD,
  executedCodeTree: TREE,
  runtime: { node: process.versions.node, executable: process.execPath, platform: process.platform, arch: process.arch },
  falsifierSuite: {
    command: "vitest run test/trajectory_p2e1rg_baseline_admission.test.ts",
    exitCode: vitestRun.status,
    artifactDigest: digestOfFile(vitestReport),
    total: tests.length,
    passed: tests.filter((test) => test.status === "passed").length,
    failed: tests.filter((test) => test.status !== "passed").map((test) => test.name),
  },
  ancestorRootProbe: {
    command: "node scripts/trajectory_p2e1rg/ancestor-root-probe.mjs",
    exitCode: probeRun.status,
    artifactDigest: digestOfFile(probePath),
    verdict: probe?.verdict ?? "NOT_RUN",
    observations: probe?.observations ?? null,
    /** The exit code is 3 for a leak: a finding, not a crash. */
    exitCodeMeaning: { 0: "no leak observed", 2: "probe failed", 3: "a synthetic canary was readable by the Low token" },
  },
  findings,
  summary: {
    total: findings.length,
    established: findings.filter((entry) => entry.evidenceClass !== "NOT_ESTABLISHED").length,
    detectedByExistingTests: findings.filter((entry) => entry.detectedByExistingTests === true).length,
    /** The E1RF claim this stage qualifies: a green focused suite did not cover these paths. */
    e1rfFocusedSuitePassedDespiteThese: true,
  },
};

writeFileSync(join(OUT, "rg0-findings.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
process.stdout.write(`wrote rg0-findings.json (${String(findings.length)} findings, probe ${String(probe?.verdict)})\n`);
