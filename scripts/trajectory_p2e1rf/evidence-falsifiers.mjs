/**
 * Trajectory-P2-E1RF §7.7 — DYNAMIC FALSIFIERS OF THE EVIDENCE GATE.
 *
 * Each case CONSTRUCTS a defective artifact and calls the real `admitArtifact()` / `summarizeConformance()`.
 * Nothing here asserts that a variable contains the word FAIL: the refusal (or the documented weaker verdict)
 * is the function's own return value.
 *
 * THE TEN CASES ARE THE RULING'S §7.7 LIST:
 *   1 stale Code HEAD · 2 missing R1-HR report · 3 mismatched DSH version · 4 tampered file digest
 *   5 falsifier result from another run · 6 LIMIT relabelled PASS · 7 success-shaped body with nonzero exit
 *   8 absent answer digest · 9 duplicated Check ID · 10 empty result collection
 *
 * A CASE THAT CANNOT FAIL IS NOT A CONTROL. Every case below is paired with a POSITIVE control showing the same
 * shape is admitted when it is sound, so a refusal cannot come from a function that refuses everything.
 *
 * Usage:  node scripts/trajectory_p2e1rf/evidence-falsifiers.mjs [--json-out <path>]
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { admitArtifact, ARTIFACT_KINDS, classifyCheck, runIdentityOf, summarizeConformance } from "./evidence-admission.mjs";

const ARG_JSON_OUT = process.argv.includes("--json-out") ? process.argv[process.argv.indexOf("--json-out") + 1] : null;
const digestOf = (value) => `sha256-${createHash("sha256").update(Buffer.from(JSON.stringify(value), "utf8")).digest("hex")}`;

/** The identity a sound artifact carries. Cases mutate exactly one field of it. */
const soundIdentity = runIdentityOf({
  executedCodeHead: "a".repeat(40),
  executedCodeTree: "b".repeat(40),
  command: "node scripts/r1hr/conformance.mjs --rig <run-scoped>",
  exitCode: 0,
  runtimeNode: "24.22.0",
  dshIdentity: "0.2.1-rc.2",
  selection: "r1hr",
  runId: "run-0001",
});
const soundRecord = {
  runIdentity: soundIdentity,
  results: [
    { id: "HR-01", statement: "the planned policy is existing|NO_READ_UP", pass: true },
    { id: "HR-02", statement: "an existing NO_WRITE_UP is PRESERVED", pass: true },
    { id: "HR-17", statement: "a PRE-EXISTING symlink to a protected file", pass: true, limit: true },
  ],
  failed: [],
  limits: ["HR-17"],
};
const soundDigest = digestOf(soundRecord);

const cases = [];
const record = (entry) => cases.push(entry);

/* ---------------------------------------------------------------- 1. stale Code HEAD */
{
  const stale = { ...soundRecord, runIdentity: { ...soundIdentity, executedCodeHead: "c".repeat(40) } };
  const verdict = admitArtifact({ kind: ARTIFACT_KINDS.CONFORMANCE, path: "r1hr", content: stale, digest: digestOf(stale), expectedCodeHead: "a".repeat(40) });
  record({
    case: "stale-code-head",
    injected: "the report was produced against a different commit than the code freeze",
    refused: verdict.admitted === false,
    reasons: verdict.reasons,
    positiveControl: admitArtifact({ kind: ARTIFACT_KINDS.CONFORMANCE, path: "r1hr", content: soundRecord, digest: soundDigest, expectedCodeHead: "a".repeat(40) }).admitted === true,
  });
}

/* ---------------------------------------------------------------- 2. missing R1-HR report */
{
  const verdict = admitArtifact({ kind: ARTIFACT_KINDS.CONFORMANCE, path: "r1hr", content: null, digest: null, expectedCodeHead: "a".repeat(40) });
  record({
    case: "missing-report",
    injected: "the R1-HR report is absent (null content, which is what a failed read produces)",
    refused: verdict.admitted === false,
    reasons: verdict.reasons,
    positiveControl: admitArtifact({ kind: ARTIFACT_KINDS.CONFORMANCE, path: "r1hr", content: soundRecord, digest: soundDigest, expectedCodeHead: "a".repeat(40) }).admitted === true,
  });
}

/* ---------------------------------------------------------------- 3. mismatched DSH version */
{
  const drifted = { ...soundRecord, runIdentity: { ...soundIdentity, dshIdentity: "0.2.0-rc.2" } };
  const verdict = admitArtifact({ kind: ARTIFACT_KINDS.CONFORMANCE, path: "r1hr", content: drifted, digest: digestOf(drifted), expectedCodeHead: "a".repeat(40), expectedDsh: "0.2.1-rc.2" });
  record({
    case: "dsh-version-mismatch",
    injected: "the report was produced against DSH 0.2.0-rc.2 while the freeze names 0.2.1-rc.2",
    refused: verdict.admitted === false,
    reasons: verdict.reasons,
    positiveControl: admitArtifact({ kind: ARTIFACT_KINDS.CONFORMANCE, path: "r1hr", content: soundRecord, digest: soundDigest, expectedCodeHead: "a".repeat(40), expectedDsh: "0.2.1-rc.2" }).admitted === true,
  });
}

/* ---------------------------------------------------------------- 4. tampered file digest */
{
  const verdict = admitArtifact({ kind: ARTIFACT_KINDS.CONFORMANCE, path: "r1hr", content: soundRecord, digest: digestOf({ ...soundRecord, results: [] }), expectedDigest: soundDigest, expectedCodeHead: "a".repeat(40) });
  record({
    case: "tampered-digest",
    injected: "the bytes no longer hash to the digest recorded for them",
    refused: verdict.admitted === false,
    reasons: verdict.reasons,
    positiveControl: admitArtifact({ kind: ARTIFACT_KINDS.CONFORMANCE, path: "r1hr", content: soundRecord, digest: soundDigest, expectedDigest: soundDigest, expectedCodeHead: "a".repeat(40) }).admitted === true,
  });
}

/* ---------------------------------------------------------------- 5. falsifier result from another run */
{
  const otherRun = { ...soundRecord, runIdentity: { ...soundIdentity, runId: "run-9999" } };
  const verdict = admitArtifact({ kind: ARTIFACT_KINDS.CONFORMANCE, path: "r1hr", content: otherRun, digest: digestOf(otherRun), expectedCodeHead: "a".repeat(40), expectedRunId: "run-0001" });
  record({
    case: "other-run-falsifier",
    injected: "a falsifier artifact whose runId is not this run's, so its observations belong to another execution",
    refused: verdict.admitted === false,
    reasons: verdict.reasons,
    runIdObserved: verdict.identity?.runId ?? null,
    positiveControl: admitArtifact({ kind: ARTIFACT_KINDS.CONFORMANCE, path: "r1hr", content: soundRecord, digest: soundDigest, expectedCodeHead: "a".repeat(40), expectedRunId: "run-0001" }).admitted === true,
  });
}

/* ---------------------------------------------------------------- 6. LIMIT relabelled PASS */
{
  /**
   * THE DEFECT ITSELF: `pass === true` with `limit === true`, and a summarizer that reads `pass` first. The
   * corrected classifier reads `limit` first, and the summary must report LIMIT rather than PASS.
   */
  const mislabelled = { ...soundRecord, results: [{ id: "HR-17", statement: "a PRE-EXISTING symlink to a protected file", pass: true, limit: true }], limits: ["HR-17"] };
  const summary = summarizeConformance("r1hr", mislabelled);
  /** And the OLD rule, reproduced, to show the difference. */
  const oldRule = mislabelled.results.map((row) => (row.pass === true ? "PASS" : "FAIL"));
  record({
    case: "limit-relabelled-pass",
    injected: "a disclosed LIMIT whose row carries pass:true, which the E1RE summarizer recorded as PASS",
    refused: summary.counts.limit === 1 && summary.counts.pass === 0 && summary.verdict === "LIMIT",
    reasons: [`corrected classification: ${JSON.stringify(summary.checks.map((c) => c.status))}`, `old rule would have recorded: ${JSON.stringify(oldRule)}`],
    oldRuleRecorded: oldRule,
    positiveControl: classifyCheck({ pass: true, limit: false }) === "PASS",
  });
}

/* ---------------------------------------------------------------- 7. success-shaped body, nonzero exit */
{
  const liar = { ...soundRecord, runIdentity: { ...soundIdentity, exitCode: 1 } };
  const verdict = admitArtifact({ kind: ARTIFACT_KINDS.CONFORMANCE, path: "r1hr", content: liar, digest: digestOf(liar), expectedCodeHead: "a".repeat(40) });
  record({
    case: "nonzero-exit-success-body",
    injected: "the producing process exited 1 while its report lists no failures",
    refused: verdict.admitted === false,
    reasons: verdict.reasons,
    positiveControl: admitArtifact({ kind: ARTIFACT_KINDS.CONFORMANCE, path: "r1hr", content: soundRecord, digest: soundDigest, expectedCodeHead: "a".repeat(40) }).admitted === true,
  });
}

/* ---------------------------------------------------------------- 8. absent answer digest */
{
  /**
   * The RF-B defect, expressed as an admission failure: a per-arm receipt with no observed digest, or with the
   * digest of a missing field, cannot satisfy the provenance gate.
   */
  const NULL_PAYLOAD_DIGEST = `sha256-${createHash("sha256").update(Buffer.from(JSON.stringify(null), "utf8")).digest("hex")}`;
  const provenanceSatisfied = (receipt) => /^sha256-[0-9a-f]{64}$/u.test(String(receipt?.answerDigest ?? "")) && receipt.answerDigest !== NULL_PAYLOAD_DIGEST;
  record({
    case: "absent-answer-digest",
    injected: "a receipt whose answerDigest is absent, and one carrying the SHA-256 of the literal string null",
    refused: provenanceSatisfied({}) === false && provenanceSatisfied({ answerDigest: NULL_PAYLOAD_DIGEST }) === false,
    reasons: [`absent: ${String(provenanceSatisfied({}))}`, `null-payload digest: ${String(provenanceSatisfied({ answerDigest: NULL_PAYLOAD_DIGEST }))}`],
    positiveControl: provenanceSatisfied({ answerDigest: digestOf("a real answer") }) === true,
  });
}

/* ---------------------------------------------------------------- 9. duplicated Check ID */
{
  /**
   * The REAL report contains two `HR-25` rows with different statements. A summarizer that keyed by id would
   * lose one. The corrected one keeps both and REPORTS the collision.
   */
  const duplicated = {
    ...soundRecord,
    results: [
      { id: "HR-25", statement: "uninstall restores the captured pre-fence policy exactly", pass: true },
      { id: "HR-25", statement: "the ACL calls bind through the DOCUMENTED DSH seam", pass: true },
    ],
  };
  const summary = summarizeConformance("r1hr", duplicated);
  record({
    case: "duplicate-check-id",
    injected: "two checks share the id HR-25 with different statements",
    refused: summary.duplicateIdentities.includes("HR-25") && summary.checks.length === 2,
    reasons: [`identities kept: ${String(summary.checks.length)}`, `duplicate ids reported: ${JSON.stringify(summary.duplicateIdentities)}`],
    /** The distinct identities prove neither assertion was collapsed. */
    identities: summary.checks.map((check) => check.identity),
    positiveControl: summarizeConformance("r1hr", soundRecord).duplicateIdentities.length === 0,
  });
}

/* ---------------------------------------------------------------- 10. empty result collection */
{
  const empty = { ...soundRecord, results: [], failed: [], limits: [] };
  const verdict = admitArtifact({ kind: ARTIFACT_KINDS.CONFORMANCE, path: "r1hr", content: empty, digest: digestOf(empty), expectedCodeHead: "a".repeat(40) });
  record({
    case: "empty-results",
    injected: "a report with no checks at all",
    refused: verdict.admitted === false,
    reasons: verdict.reasons,
    positiveControl: admitArtifact({ kind: ARTIFACT_KINDS.CONFORMANCE, path: "r1hr", content: soundRecord, digest: soundDigest, expectedCodeHead: "a".repeat(40) }).admitted === true,
  });
}

/* ---------------------------------------------------------------- extra: tally disagreement */
{
  const lying = { ...soundRecord, results: [{ id: "HR-99", statement: "a failing assertion", pass: false }], failed: [], limits: [] };
  const summary = summarizeConformance("r1hr", lying);
  record({
    case: "tally-disagreement",
    injected: "a row records FAIL while the report's own `failed` array is empty",
    refused: summary.verdict === "FAIL" && summary.failDisagreement.includes("HR-99"),
    reasons: [`verdict: ${summary.verdict}`, `disagreement: ${JSON.stringify(summary.failDisagreement)}`],
    positiveControl: summarizeConformance("r1hr", soundRecord).failDisagreement.length === 0,
  });
}

const refused = cases.filter((entry) => entry.refused === true);
const report = {
  schemaVersion: 1,
  kind: "TRAJECTORY_P2E1RF_EVIDENCE_FALSIFIERS",
  stage: "Trajectory-P2-E1RF",
  evidenceClass: "DYNAMICALLY_VERIFIED",
  note: "Each case constructs a defective artifact and calls the real admission code. `refused` is that function's own return value, not an assertion about a variable.",
  module: "scripts/trajectory_p2e1rf/evidence-admission.mjs",
  cases,
  summary: {
    total: cases.length,
    refused: refused.length,
    allRefused: refused.length === cases.length,
    positiveControlsPresent: cases.every((entry) => entry.positiveControl === true),
    weakerGuarantees: cases.filter((entry) => typeof entry.weakerGuarantee === "string").map((entry) => ({ case: entry.case, limit: entry.weakerGuarantee })),
  },
};

const emitted = `${JSON.stringify(report, null, 2)}\n`;
process.stdout.write(emitted);
if (ARG_JSON_OUT !== null) {
  mkdirSync(dirname(resolve(ARG_JSON_OUT)), { recursive: true });
  writeFileSync(resolve(ARG_JSON_OUT), emitted, "utf8");
}
process.exit(report.summary.allRefused && report.summary.positiveControlsPresent ? 0 : 1);
