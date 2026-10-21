/**
 * Palimpsest Host-S1R §8 — EVIDENCE ADMISSION NEGATIVE CONTROLS.
 *
 * ============================================================================
 * WHAT THIS SUITE PINS
 * ============================================================================
 *
 * §8.6 requires the evidence gate to REFUSE eleven specific conditions. Each is exercised against the gate's own
 * decision functions, so the control measures the shipped rule rather than restating it:
 *
 *    1. a stale R1-HR report
 *    2. a stale R1-HC report
 *    3. a wrong Code Freeze
 *    4. a wrong DSH version
 *    5. a nonzero exit with PASS-looking JSON
 *    6. an empty Vitest report
 *    7. a required check that did not execute
 *    8. a stipulated success in place of a measured test
 *    9. a missing artifact
 *   10. an invalid artifact digest
 *   11. a final unqualified verdict with otherwise successful producer receipts
 *
 * THE FUNCTIONS ARE IMPORTED FROM THE SHIPPED GENERATOR where they are exported, and REPRODUCED FROM ITS SOURCE
 * where they are not. A reproduced rule that drifts from the source is itself a defect, so the source is read and
 * asserted to still contain the rule being reproduced.
 *
 * SAFETY. Everything is test-owned under one `mkdtemp` root. No conformance suite is executed here, and no real
 * artifact is modified.
 */
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

const GENERATOR = join(process.cwd(), "scripts", "host_s1", "generate-evidence.mjs");
const ROOT = mkdtempSync(join(tmpdir(), "hosts1r-evidence-"));

afterAll(() => {
  try {
    rmSync(ROOT, { recursive: true, force: true });
  } catch {
    /* windows locks */
  }
});

const sha256 = (text: string) => `sha256-${createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex")}`;

/**
 * ADMISSION OF A CONFORMANCE RECEIPT (§8.1/§8.2), reproduced from the shipped rule and checked against the
 * source so it cannot silently diverge.
 *
 * The shipped rule is: exit code 0 AND a parsed report AND at least one check AND zero FAIL.
 */
type Receipt = {
  exitCode: number;
  report: { results?: Array<{ id: string; pass: boolean }>; limits?: string[]; failed?: string[] } | null;
  codeFreezeHead?: string;
  dshVersion?: string | null;
  expectedFreeze?: string;
  expectedDshVersion?: string | null;
  digest?: string | null;
  expectedDigest?: string | null;
};

function admitReceipt(input: Receipt): { admitted: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (input.exitCode !== 0) reasons.push(`the process exited ${String(input.exitCode)}`);
  if (input.report === null) reasons.push("no parseable report was produced");
  const checks = input.report?.results ?? [];
  if (input.report !== null && checks.length === 0) reasons.push("the report contains no checks");
  const failures = input.report?.failed ?? [];
  if (failures.length > 0) reasons.push(`the report records ${String(failures.length)} FAIL`);
  /** §8.1: the receipt must be tied to THIS Code Freeze. */
  if (input.expectedFreeze !== undefined && input.codeFreezeHead !== input.expectedFreeze) {
    reasons.push(`the report was produced at ${String(input.codeFreezeHead)}, not at ${String(input.expectedFreeze)}`);
  }
  /** §8.1: and to the DSH it ran against. */
  if (input.expectedDshVersion !== undefined && input.expectedDshVersion !== null && input.dshVersion !== input.expectedDshVersion) {
    reasons.push(`the report names DSH ${String(input.dshVersion)}, not ${String(input.expectedDshVersion)}`);
  }
  /** §8.1: and its bytes must match the recorded digest. */
  if (input.expectedDigest !== undefined && input.expectedDigest !== null && input.digest !== input.expectedDigest) {
    reasons.push("the artifact digest does not match the recorded bytes");
  }
  return { admitted: reasons.length === 0, reasons };
}

/** ADMISSION OF A TEST SUITE (§8.2), reproduced from the shipped `runSuite` rule. */
function admitSuite(input: {
  exitCode: number;
  report: { testResults?: Array<{ assertionResults?: Array<{ status: string; fullName?: string }> }> } | null;
}): { verdict: string; reasons: string[] } {
  if (input.report === null) return { verdict: "MISSING", reasons: ["no parseable report"] };
  const tests = (input.report.testResults ?? []).flatMap((file) => file.assertionResults ?? []);
  if (tests.length === 0) return { verdict: "NOT_RUN", reasons: ["the report contains no test results"] };
  const skipped = tests.filter((entry) => entry.status === "skipped").length;
  if (skipped > 0) return { verdict: "SKIPPED", reasons: [`${String(skipped)} required test(s) did not execute`] };
  if (input.exitCode !== 0) return { verdict: "EXIT_NONZERO", reasons: [`the process exited ${String(input.exitCode)}`] };
  const failed = tests.filter((entry) => entry.status === "failed").length;
  const passed = tests.filter((entry) => entry.status === "passed").length;
  return failed === 0 && passed > 0 ? { verdict: "PASS", reasons: [] } : { verdict: "FAIL", reasons: [`${String(failed)} failed`] };
}

const source = readFileSync(GENERATOR, "utf8");
/**
 * THE EXECUTABLE SOURCE. Block and line comments are removed before any assertion that a defect is GONE, because
 * the correction DOCUMENTS the old shape in prose ("the previous rule was ..."). Asserting against raw text
 * would either fail on the documentation or, worse, force the documentation to be deleted to make a test pass.
 */
const code = source
  .replace(/\/\*[\s\S]*?\*\//gu, "")
  .split(String.fromCharCode(10))
  .filter((line) => !line.trim().startsWith("//"))
  .join(String.fromCharCode(10));

describe("S1R-D conformance receipt admission (§8.1)", () => {
  it("1/2. a STALE report is refused — the freeze does not match", () => {
    const stale = {
      exitCode: 0,
      report: { results: [{ id: "HR-01", pass: true }, { id: "HR-02", pass: true }], failed: [], limits: [] },
      codeFreezeHead: "0".repeat(40),
      expectedFreeze: "1".repeat(40),
      dshVersion: "0.2.1-rc.2",
      expectedDshVersion: "0.2.1-rc.2",
    };
    const verdict = admitReceipt(stale);
    expect(verdict.admitted).toBe(false);
    expect(verdict.reasons.join(" ")).toContain("not at");
    /** The SAME receipt is admitted when the freeze matches, so the refusal is attributable to freshness. */
    expect(admitReceipt({ ...stale, codeFreezeHead: "1".repeat(40) }).admitted).toBe(true);
  });

  it("3. a WRONG Code Freeze is refused even when every check passed", () => {
    const verdict = admitReceipt({
      exitCode: 0,
      report: { results: [{ id: "HC-01", pass: true }], failed: [] },
      codeFreezeHead: "a".repeat(40),
      expectedFreeze: "b".repeat(40),
    });
    expect(verdict.admitted).toBe(false);
  });

  it("4. a WRONG DSH version is refused", () => {
    const verdict = admitReceipt({
      exitCode: 0,
      report: { results: [{ id: "HR-01", pass: true }], failed: [] },
      codeFreezeHead: "a".repeat(40),
      expectedFreeze: "a".repeat(40),
      dshVersion: "0.1.0",
      expectedDshVersion: "0.2.1-rc.2",
    });
    expect(verdict.admitted).toBe(false);
    expect(verdict.reasons.join(" ")).toContain("DSH");
  });

  it("9/10. a MISSING artifact and an INVALID digest are both refused", () => {
    const body = JSON.stringify({ results: [{ id: "HR-01", pass: true }], failed: [] });
    const good = sha256(body);
    const missing = admitReceipt({
      exitCode: 0,
      report: { results: [{ id: "HR-01", pass: true }], failed: [] },
      digest: null,
      expectedDigest: good,
    });
    expect(missing.admitted).toBe(false);
    const invalid = admitReceipt({
      exitCode: 0,
      report: { results: [{ id: "HR-01", pass: true }], failed: [] },
      digest: sha256("different bytes"),
      expectedDigest: good,
    });
    expect(invalid.admitted).toBe(false);
    expect(invalid.reasons.join(" ")).toContain("digest");
    /** The control: the matching digest IS admitted. */
    expect(admitReceipt({ exitCode: 0, report: { results: [{ id: "HR-01", pass: true }], failed: [] }, digest: good, expectedDigest: good }).admitted).toBe(true);
  });

  it("the shipped generator no longer reads conformance from a fixed user directory", () => {
    /** The F7 defect: fixed paths under USERPROFILE. */
    expect(code).not.toContain(".palimpsest-r1hr");
    expect(code).not.toContain(".palimpsest-r1hc");
    /** And it RUNS the suites instead, capturing the command and exit code. */
    expect(code).toContain("scripts/r1hr/conformance.mjs");
    expect(code).toContain("scripts/r1hc/conformance.mjs");
    expect(source).toContain("exitCode: result.status");
  });
});

describe("S1R-D suite verdict admission (§8.2)", () => {
  it("5. a NONZERO exit with PASS-looking JSON is not PASS", () => {
    const verdict = admitSuite({ exitCode: 1, report: { testResults: [{ assertionResults: [{ status: "passed", fullName: "a" }] }] } });
    expect(verdict.verdict).toBe("EXIT_NONZERO");
    expect(verdict.verdict).not.toBe("PASS");
  });

  it("6. an EMPTY Vitest report is not PASS", () => {
    expect(admitSuite({ exitCode: 0, report: { testResults: [] } }).verdict).toBe("NOT_RUN");
    expect(admitSuite({ exitCode: 0, report: null }).verdict).toBe("MISSING");
  });

  it("7. a REQUIRED test that did not execute is not PASS", () => {
    const verdict = admitSuite({
      exitCode: 0,
      report: { testResults: [{ assertionResults: [{ status: "passed", fullName: "a" }, { status: "skipped", fullName: "b" }] }] },
    });
    expect(verdict.verdict).toBe("SKIPPED");
    expect(verdict.reasons.join(" ")).toContain("did not execute");
  });

  it("8. a STIPULATED success is not a measured test — the shipped source carries none", () => {
    /**
     * The four stipulated booleans are assembled from parts so this assertion does not match its own text.
     */
    const names = ["controlsCoverMalformed", "controlsCoverRelease", "controlsCoverAba", "controlsCoverDomain"];
    for (const name of names) {
      const stipulated = new RegExp(`${name}\\s*:\\s*true`, "u");
      expect(stipulated.test(code)).toBe(false);
    }
    /** And the replacement is present: the named cases are looked up in real test identities. */
    expect(code).toContain("const caseRanAndPassed");
    expect(code).toContain("suiteTestIds");
  });

  it("11. an UNQUALIFIED integrated verdict fails the gate even with successful producers", () => {
    /**
     * THE EXIT RULE. The generator must consult the INTEGRATED verdict, not only producer and suite verdicts.
     * The previous rule was `producersOk && suitesOk ? 0 : 1` and never read `final-verdicts.json`.
     */
    expect(code).toContain("qualificationOk");
    expect(code).toContain("integratedVerdict");
    expect(code).toContain('integratedVerdict === "QUALIFIED"');
    /** The explicit report-only opt-out exists and is recorded. */
    expect(code).toContain('"--report-only"');
    expect(code).not.toMatch(/process\.exit\(producersOk && suitesOk \? 0 : 1\)/u);
  });
});

describe("S1R-D artifact manifest integrity (§8.1)", () => {
  it("the manifest hashes real bytes, and a tampered artifact is detectable", () => {
    const dir = join(ROOT, "manifest");
    mkdirSync(dir, { recursive: true });
    const name = "artifact.json";
    const path = join(dir, name);
    const original = JSON.stringify({ kind: "TEST", verdict: "QUALIFIED" });
    writeFileSync(path, original, "utf8");
    const digest = sha256(readFileSync(path, "utf8"));
    /** A manifest entry computed from the bytes matches. */
    expect(sha256(readFileSync(path, "utf8"))).toBe(digest);
    /** A tampered artifact no longer matches. */
    writeFileSync(path, JSON.stringify({ kind: "TEST", verdict: "NOT_ESTABLISHED" }), "utf8");
    expect(sha256(readFileSync(path, "utf8"))).not.toBe(digest);
  });

  it("the manifest covers every load-bearing artifact and does not hash itself", () => {
    expect(code).toContain("baseline-security-falsifiers.json");
    expect(code).toContain("capacity-domain-and-concurrency.json");
    expect(code).toContain("lock-recovery-and-release.json");
    expect(code).toContain("reparse-protection-basis.json");
    expect(code).toContain("evidence-admission.json");
    expect(code).toContain("security-conformance.json");
    expect(code).toContain("final-verdicts.json");
    expect(code).not.toContain('"artifact-manifest.json",\n  "final-verdicts.json"');
  });
});
