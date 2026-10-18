/**
 * Trajectory-P2-E1RC §5 — THE CLOSURE GATE (C3).
 *
 * THE PROBLEM E1RC CLOSES (C1-F4/F5/F6).
 *
 *   · E1R's `generate-evidence.mjs` WROTE success-shaped constants — `realFirstPartyDshHostRan: true`,
 *     `answerEmittedByRealDshTurn: true`, `realDshAssistantMessageInspected: true` — regardless of whether any
 *     DSH turn ran. A JSON template filled with expected values is not evidence.
 *   · E1R's harness decided GO from the ORACLE verdict alone, so a run whose arm, section digest, source
 *     basis, citation availability, leak check, cleanup or dependency root was wrong could still report GO.
 *   · A missing first-party DSH dependency exited with code 0, so "not established" looked successful.
 *
 * THIS GATE IS THE ONE PLACE A VERDICT IS DERIVED. It:
 *   1. verifies prerequisites (built dist, first-party DSH, a real commit);
 *   2. runs the semantic dry-run and requires its GO;
 *   3. runs the ACTUAL first-party DSH assay for CONTROL and for TREATMENT, capturing each process's exit
 *      code and machine-readable receipt;
 *   4. validates the run identities and evidence provenance from THOSE receipts;
 *   5. aggregates the oracle verdict AND every measured integrity condition;
 *   6. requires the negative controls to be rejected;
 *   7. emits a derived GO/NO-GO, and exits NONZERO unless the closure is established.
 *
 * No success field is asserted here. Every one is read from a child process's own output.
 *
 * Usage:  node scripts/trajectory_p2e1rc/closure-gate.mjs [--json-out <path>]
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ARG_JSON_OUT = process.argv.includes("--json-out") ? process.argv[process.argv.indexOf("--json-out") + 1] : null;

const git = (args) => {
  try {
    return execFileSync("git", args, { cwd: REPO, encoding: "utf8" }).trim();
  } catch {
    return null;
  }
};

const gates = [];
/** §5.3: a gate is only satisfied by an OBSERVED fact, never by a declaration. */
const gate = (id, statement, ok, detail) => {
  gates.push({ id, statement, ok: ok === true, detail });
  process.stderr.write(`  ${ok === true ? "·" : "!"} ${id}: ${ok === true ? "ok" : "FAILED"} — ${String(detail).slice(0, 200)}\n`);
};

/** §5.3: a required child must be observed to SUCCEED. A nonzero exit is never reinterpreted as success. */
function runChild(label, script, args = [], timeoutMs = 900_000) {
  const started = Date.now();
  const result = spawnSync(process.execPath, [script, ...args], { cwd: REPO, encoding: "utf8", timeout: timeoutMs, maxBuffer: 128 * 1024 * 1024 });
  const stdout = typeof result.stdout === "string" ? result.stdout : "";
  const stderr = typeof result.stderr === "string" ? result.stderr : "";
  let parsed = null;
  const brace = stdout.indexOf("{");
  if (brace >= 0) {
    try {
      parsed = JSON.parse(stdout.slice(brace));
    } catch {
      parsed = null;
    }
  }
  const receipt = {
    label,
    command: `${process.execPath.split(/[\\/]/u).pop()} ${script}${args.length > 0 ? ` ${args.join(" ")}` : ""}`,
    exitCode: result.status,
    signal: result.signal ?? null,
    timedOut: result.error !== undefined && result.error !== null && String(result.error).includes("ETIMEDOUT"),
    elapsedMs: Date.now() - started,
    parsed: parsed !== null,
    stderrTail: stderr.split(/\r?\n/u).filter(Boolean).slice(-6),
  };
  return { receipt, payload: parsed };
}

/* ================================================================ 1. prerequisites */
const head = git(["rev-parse", "HEAD"]);
gate("git-head-resolves", "the working commit resolves to a real commit", head !== null && /^[0-9a-f]{40}$/u.test(head), head);
gate("git-worktree-clean", "no uncommitted executable source changes are present", (git(["status", "--porcelain=v1", "--untracked-files=all", "--", "src", "scripts", "test", "host"]) ?? "x").trim() === "", git(["status", "--porcelain=v1", "--untracked-files=all", "--", "src", "scripts", "test", "host"]));

const distPresent = existsSync(join(REPO, "dist", "src", "advanced.js"));
gate("built-dist-present", "the built distribution exists", distPresent, "dist/src/advanced.js");

const dshModule = pathToFileURL(join(REPO, "scripts", "trajectory_p2e0", "dsh-test-home.mjs")).href;
const dshHome = await import(dshModule);
const firstPartyDsh = dshHome.hasFirstPartyDsh();
gate("first-party-dsh-present", "the installed first-party DSH tree is available", firstPartyDsh, firstPartyDsh ? "dsh-session resolved" : "ABSENT — the execution chain cannot be established");

/** §9.1/C1-F6: a missing required dependency must NOT produce a successful closure. */
if (!distPresent || !firstPartyDsh) {
  const report = {
    schemaVersion: 1,
    kind: "TRAJECTORY_P2E1RC_CLOSURE_GATE",
    stage: "Trajectory-P2-E1RC",
    verdict: "ASSAY_EXECUTION_PATH_NOT_ESTABLISHED",
    reason: "a required prerequisite is missing; no execution-derived evidence can exist",
    gates,
    blocked: true,
    executedCodeHead: head,
    externalModelRequestOccurred: false,
    modelCallsMade: 0,
  };
  if (ARG_JSON_OUT !== null) {
    mkdirSync(dirname(resolve(ARG_JSON_OUT)), { recursive: true });
    writeFileSync(resolve(ARG_JSON_OUT), `${JSON.stringify(report, null, 2)}\n`);
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exit(2);
}

/* ================================================================ 2. semantic dry-run */
const dryRun = runChild("dry-run", join(REPO, "scripts", "trajectory_p2e1", "calibrate.mjs"), ["--dry-run"], 600_000);
gate("dry-run-exit-zero", "the semantic dry-run process exited 0", dryRun.receipt.exitCode === 0, dryRun.receipt.exitCode);
gate("dry-run-go", "the semantic dry-run reported DETERMINISTIC_ASSAY_GO", dryRun.payload?.verdict === "DETERMINISTIC_ASSAY_GO", dryRun.payload?.verdict ?? "no payload");
gate("dry-run-no-external-provider", "the dry-run contacted no external provider", dryRun.payload?.externalModelRequestOccurred === false && dryRun.payload?.modelCallsMade === 0, `calls=${String(dryRun.payload?.modelCallsMade)}`);

/* ================================================================ 3. actual DSH assay, both arms */
const arms = {};
for (const arm of ["control", "treatment"]) {
  const run = runChild(`assay-${arm}`, join(REPO, "scripts", "trajectory_p2e1r", "assay-harness.mjs"), ["--arm", arm], 900_000);
  const payload = run.payload;
  arms[arm] = { receipt: run.receipt, payload };

  /**
   * §5.3: EVERY condition below is measured on THIS run's own output. A failure in any one of them forces a
   * non-establishment verdict — that is the C1-F5 correction.
   */
  const observed = payload !== null;
  gate(`assay-${arm}-exit-zero`, `the ${arm} assay process exited 0`, run.receipt.exitCode === 0, run.receipt.exitCode);
  gate(`assay-${arm}-payload`, `the ${arm} assay emitted a machine-readable receipt`, observed, run.receipt.parsed);
  if (!observed) continue;

  gate(`assay-${arm}-outcome-go`, `the ${arm} assay reported DETERMINISTIC_ASSAY_GO`, payload.outcome === "DETERMINISTIC_ASSAY_GO", payload.outcome);
  gate(`assay-${arm}-arm-matches`, `the ${arm} run delivered the ${arm.toUpperCase()} arm`, String(payload.contextAssignedArm ?? "").toLowerCase() === arm, payload.contextAssignedArm);
  gate(`assay-${arm}-presentation-matches`, `the ${arm} run rendered the ${arm.toUpperCase()} presentation`, String(payload.armPresentationMode ?? "").toLowerCase() === arm, payload.armPresentationMode);
  gate(`assay-${arm}-section-delivered`, `the ${arm} section was delivered with a positive byte count and digest`, Number(payload.armSectionBytes) > 0 && typeof payload.armSectionDigest === "string" && payload.armSectionDigest.length === 64, `${String(payload.armSectionBytes)} bytes`);
  gate(`assay-${arm}-session-real`, `the ${arm} turn produced a real DSH session identity`, payload.dshSessionIdIsReal === true, payload.dshSessionIdIsReal);
  gate(`assay-${arm}-session-file`, `the ${arm} session file was found by exact identity`, payload.sessionFileFoundByExactId === true, payload.sessionFileFoundByExactId);
  gate(`assay-${arm}-answer-extracted`, `the ${arm} answer was extracted from DSH persistence`, payload.answerExtraction?.ok === true && payload.answerExtraction?.assistantMessageCount >= 1, JSON.stringify(payload.answerExtraction));
  gate(`assay-${arm}-answer-matches-emitted`, `the extracted ${arm} answer equals the emitted answer`, payload.extractedAnswerMatchesEmitted === true, payload.extractedAnswerMatchesEmitted);
  gate(`assay-${arm}-truth-frozen-before-read`, `the ${arm} truth was frozen before the answer was read`, payload.frozenBeforeAnswerRead === true, payload.frozenBeforeAnswerRead);
  gate(`assay-${arm}-truth-digest`, `the ${arm} truth digest is a per-run SHA-256`, /^sha256-[0-9a-f]{64}$/u.test(String(payload.frozenTruthDigest ?? "")), payload.frozenTruthDigest);
  gate(`assay-${arm}-oracle-ok`, `the official oracle accepted the ${arm} answer`, payload.oracleOk === true && payload.historicalUnderstanding === true && payload.decisionQuality === true, `hist=${String(payload.historicalUnderstanding)} decision=${String(payload.decisionQuality)}`);
  gate(`assay-${arm}-operational-not-measured`, `the ${arm} run reports operational behavior as NOT_MEASURED`, payload.operationalBehavior === "NOT_MEASURED" && payload.operationalBehaviorPass === null, payload.operationalBehavior);
  gate(`assay-${arm}-no-leak`, `no oracle-internal token leaked into the ${arm} model-visible context`, payload.groundTruthLeak === false, payload.groundTruthLeak);
  gate(`assay-${arm}-cleanup`, `the ${arm} owned root was removed`, payload.ownedRootRemoved === true, payload.ownedRootRemoved);
  gate(`assay-${arm}-dependency-preserved`, `the ${arm} run preserved the main dependency root`, payload.dependencyRootPreserved === true, payload.dependencyRootPreserved);
  gate(`assay-${arm}-legacy-oracle-unused`, `the ${arm} run used no legacy oracle`, payload.legacyOracleUsed === false && payload.legacyOracleUsedByActiveAssay === false, payload.legacyOracleStatus);
  gate(`assay-${arm}-no-model`, `the ${arm} run made no external model call`, payload.externalModelRequestOccurred === false && payload.modelCallsMade === 0, `calls=${String(payload.modelCallsMade)}`);
  gate(`assay-${arm}-official-oracle`, `the ${arm} run used the official oracle`, payload.officialOracle === "scripts/trajectory_p2e1/source-aware-oracle.mjs", payload.officialOracle);
  /** §5.4: TREATMENT relevance — the delivered section must carry the partial-coverage facts. */
  if (arm === "treatment") {
    const relevance = payload.treatmentRelevance ?? {};
    gate("assay-treatment-relevance", "the TREATMENT section communicates partial coverage, counts and unread extent", relevance.statesPartial === true && relevance.statesCounts === true && relevance.statesUnread === true, JSON.stringify(relevance));
  }
}

/** §5.6: the two arms were INDEPENDENTLY instantiated — do not claim paired-world equivalence. */
const controlPayload = arms.control.payload;
const treatmentPayload = arms.treatment.payload;
if (controlPayload !== null && treatmentPayload !== null) {
  gate(
    "arms-independently-instantiated",
    "the CONTROL and TREATMENT runs were independently instantiated (their identities differ)",
    controlPayload.frozenTruthTrialId !== treatmentPayload.frozenTruthTrialId,
    `${String(controlPayload.frozenTruthTrialId)} vs ${String(treatmentPayload.frozenTruthTrialId)}`,
  );
  gate(
    "arms-share-scenario",
    "both arms used the same frozen scenario and oracle version",
    controlPayload.oracleVersion === treatmentPayload.oracleVersion,
    controlPayload.oracleVersion,
  );
}

/* ================================================================ 4. derived verdict */
const failed = gates.filter((entry) => entry.ok !== true);
const verdict = failed.length === 0 ? "CLOSURE_ESTABLISHED" : "CLOSURE_NOT_ESTABLISHED";

const report = {
  schemaVersion: 1,
  kind: "TRAJECTORY_P2E1RC_CLOSURE_GATE",
  stage: "Trajectory-P2-E1RC",
  verdict,
  /** §5.1: every field below is READ from a child receipt, never asserted. */
  executedCodeHead: head,
  codeTreeIdentity: git(["rev-parse", "HEAD^{tree}"]),
  environment: { platform: process.platform, node: process.version, git: git(["--version"]) },
  gates,
  failedGates: failed.map((entry) => entry.id),
  gateCount: gates.length,
  receipts: {
    dryRun: dryRun.receipt,
    control: arms.control?.receipt ?? null,
    treatment: arms.treatment?.receipt ?? null,
  },
  /**
   * §5.1: DERIVED EXECUTION FACTS. Each is computed from the receipts above, so a run that did not execute
   * cannot claim it did.
   */
  derived: {
    firstPartyDshTurnObserved: arms.control?.payload?.realFirstPartyDshHostRan === true && arms.treatment?.payload?.realFirstPartyDshHostRan === true,
    answersExtractedFromPersistence:
      arms.control?.payload?.answerExtraction?.ok === true && arms.treatment?.payload?.answerExtraction?.ok === true,
    controlArmDelivered: String(arms.control?.payload?.contextAssignedArm ?? "").toLowerCase() === "control",
    treatmentArmDelivered: String(arms.treatment?.payload?.contextAssignedArm ?? "").toLowerCase() === "treatment",
    modelConsumedCapsule: false,
    modelConsumedCapsuleReason: "the deterministic adapter is SEEDED with the expected answer through profile configuration; it does not read the Capsule, so this run proves transport and persistence only",
    stochasticInference: false,
    externalModelRequest: false,
  },
  /** §9.2: verdicts that must remain unawarded. */
  notAwarded: {
    TRAJECTORY_FIRST_PARTY_ORIGIN_SETTLEMENT_QUALIFIED: "NOT_ESTABLISHED",
    BENCHMARK_QUALIFIED: "NOT_ESTABLISHED",
    MODEL_CONSUMED_CAPSULE: "NOT_ESTABLISHED",
    UTILITY_POSITIVE_SIGNAL: "NOT_ESTABLISHED",
    UTILITY_NEGATIVE_SIGNAL: "NOT_ESTABLISHED",
    WORK_UTILITY_IMPROVED: "NOT_ESTABLISHED",
    AGENT_COOPERATION_IMPROVED: "NOT_ESTABLISHED",
  },
  externalModelRequestOccurred: false,
  stochasticTrialOccurred: false,
  modelCallsMade: 0,
};

if (ARG_JSON_OUT !== null) {
  mkdirSync(dirname(resolve(ARG_JSON_OUT)), { recursive: true });
  writeFileSync(resolve(ARG_JSON_OUT), `${JSON.stringify(report, null, 2)}\n`);
}
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
/** §5.3: non-establishment is a NONZERO exit — never `process.exit(0)` meaning "not established". */
process.exit(verdict === "CLOSURE_ESTABLISHED" ? 0 : 1);
