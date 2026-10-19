/**
 * Trajectory-P2-E1RF §7 — RF-D: EVIDENCE FRESHNESS AND QUALIFICATION INTEGRITY.
 *
 * THE WEAKNESS THIS PINS. `generate-evidence.mjs` read R1-HR/R1-HC reports from a FIXED user-wide path and
 * reused a pre-existing falsifier file, with nothing binding those inputs to the Code Freeze under test. It also
 * mapped `pass === true` to `"PASS"` even when `limit === true`, so a disclosed LIMIT was recorded as a
 * successful assertion.
 *
 * WHAT IS ASSERTED. Not "a variable contains FAIL". These tests call the shipping admission code and assert on
 * its return value, and each refusal is paired with a positive control so a function that refused everything
 * could not pass.
 */
import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

type Admission = {
  admitArtifact: (input: Record<string, unknown>) => { admitted: boolean; reasons: readonly string[]; identity: Record<string, unknown> | null; summary: unknown };
  classifyCheck: (row: { pass?: boolean; limit?: boolean }) => "PASS" | "LIMIT" | "FAIL";
  summarizeConformance: (suite: string, record: unknown) => {
    checks: readonly { identity: string; id: string; status: string }[];
    counts: { pass: number; limit: number; fail: number };
    duplicateIdentities: readonly string[];
    failDisagreement: readonly string[];
    limitDisagreement: readonly string[];
    verdict: string;
  };
  checkIdentity: (suite: string, ordinal: number, row: { id?: string; statement?: string }) => string;
  runIdentityOf: (input: Record<string, unknown>) => Record<string, unknown>;
  ARTIFACT_KINDS: { CONFORMANCE: string; FALSIFIER: string; VITEST: string };
  RUN_IDENTITY_FIELDS: readonly string[];
};

const SCRIPTS = ["..", "scripts", "trajectory_p2e1rf"].join("/");
const load = async (name: string): Promise<unknown> => import(/* @vite-ignore */ `${SCRIPTS}/${name}`);
const admission = (await load("evidence-admission.mjs")) as Admission;

const sha256 = (text: string): string => `sha256-${createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex")}`;
const digestOf = (value: unknown): string => sha256(JSON.stringify(value));

const identity = {
  executedCodeHead: "a".repeat(40),
  executedCodeTree: "b".repeat(40),
  command: "node scripts/r1hr/conformance.mjs --rig <run-scoped>",
  exitCode: 0,
  runtimeNode: "24.22.0",
  dshIdentity: "0.2.1-rc.2",
  selection: "r1hr",
  runId: "run-0001",
};
const soundRecord = {
  runIdentity: identity,
  results: [
    { id: "HR-01", statement: "planned policy", pass: true },
    { id: "HR-17", statement: "a symlink fixture", pass: true, limit: true },
  ],
  failed: [],
  limits: ["HR-17"],
};
const soundDigest = digestOf(soundRecord);
const conform = (content: unknown, extra: Record<string, unknown> = {}) => admission.admitArtifact({ kind: admission.ARTIFACT_KINDS.CONFORMANCE, path: "r1hr", content, digest: digestOf(content), expectedCodeHead: identity.executedCodeHead, ...extra });

describe("E1RF RF-D evidence admission (DYNAMICALLY_VERIFIED)", () => {
  it("1. a SOUND report is admitted — the gate is not a refusal of everything", () => {
    const verdict = conform(soundRecord);
    expect(verdict.admitted).toBe(true);
    expect(verdict.reasons).toEqual([]);
  });

  it("2. a report from a DIFFERENT Code HEAD is refused", () => {
    const verdict = conform({ ...soundRecord, runIdentity: { ...identity, executedCodeHead: "c".repeat(40) } });
    expect(verdict.admitted).toBe(false);
    expect(verdict.reasons.join(" ")).toContain("not the code freeze");
  });

  it("3. a MISSING report is refused", () => {
    const verdict = admission.admitArtifact({ kind: admission.ARTIFACT_KINDS.CONFORMANCE, path: "r1hr", content: null, digest: null });
    expect(verdict.admitted).toBe(false);
    expect(verdict.reasons).toContain("the artifact is missing or unparseable");
  });

  it("4. a report from a different DSH release is refused", () => {
    const verdict = conform({ ...soundRecord, runIdentity: { ...identity, dshIdentity: "0.2.0-rc.2" } }, { expectedDsh: "0.2.1-rc.2" });
    expect(verdict.admitted).toBe(false);
    expect(verdict.reasons.join(" ")).toContain("not 0.2.1-rc.2");
  });

  it("5. a report from a different Node runtime is refused", () => {
    const verdict = conform({ ...soundRecord, runIdentity: { ...identity, runtimeNode: "24.14.1" } }, { expectedRuntime: "24.22.0" });
    expect(verdict.admitted).toBe(false);
    expect(verdict.reasons.join(" ")).toContain("not 24.22.0");
  });

  it("6. a report from ANOTHER RUN of the same code is refused when the run is named", () => {
    const verdict = conform({ ...soundRecord, runIdentity: { ...identity, runId: "run-9999" } }, { expectedRunId: "run-0001" });
    expect(verdict.admitted).toBe(false);
    expect(verdict.reasons.join(" ")).toContain("belongs to run run-9999");
  });

  it("7. a TAMPERED digest is refused", () => {
    const verdict = admission.admitArtifact({ kind: admission.ARTIFACT_KINDS.CONFORMANCE, path: "r1hr", content: soundRecord, digest: digestOf({ ...soundRecord, results: [] }), expectedDigest: soundDigest, expectedCodeHead: identity.executedCodeHead });
    expect(verdict.admitted).toBe(false);
    expect(verdict.reasons.join(" ")).toContain("does not match the recorded digest");
  });

  it("8. a success-shaped body from a NONZERO exit is refused", () => {
    const verdict = conform({ ...soundRecord, runIdentity: { ...identity, exitCode: 1 } });
    expect(verdict.admitted).toBe(false);
    expect(verdict.reasons.join(" ")).toContain("exited 1");
  });

  it("9. an artifact with NO run identity is refused, one missing field at a time", () => {
    const noIdentity = admission.admitArtifact({ kind: admission.ARTIFACT_KINDS.CONFORMANCE, path: "r1hr", content: { results: [] }, digest: digestOf({ results: [] }) });
    expect(noIdentity.admitted).toBe(false);
    expect(noIdentity.reasons.join(" ")).toContain("no run identity");
    /** Every required field is named when absent, not collapsed into one boolean. */
    for (const field of admission.RUN_IDENTITY_FIELDS) {
      const partial = { ...identity };
      delete (partial as Record<string, unknown>)[field];
      const verdict = conform({ ...soundRecord, runIdentity: partial });
      expect(verdict.admitted).toBe(false);
      expect(verdict.reasons.join(" ")).toContain(`missing "${field}"`);
    }
  });

  it("10. a compromised report is refused when its ROW and TALLY disagree", () => {
    const verdict = conform({ ...soundRecord, results: [{ id: "HR-99", statement: "failing", pass: false }], failed: [], limits: [] });
    expect(verdict.admitted).toBe(false);
    expect(verdict.reasons.join(" ")).toContain("FAIL tally disagrees");
  });

  it("11. an EMPTY check collection is refused", () => {
    const verdict = conform({ ...soundRecord, results: [], failed: [], limits: [] });
    expect(verdict.admitted).toBe(false);
    expect(verdict.reasons.join(" ")).toContain("empty check collection");
  });

  it("12. a falsifier artifact must state whether its observations were RE-EXECUTED or TRANSCRIBED", () => {
    const transcribed = { runIdentity: identity, cases: [{ name: "beforeFix", verdict: "UNAUTHORIZED_CONTENT_DELIVERED" }] };
    const verdict = admission.admitArtifact({ kind: admission.ARTIFACT_KINDS.FALSIFIER, path: "falsifier", content: transcribed, digest: digestOf(transcribed) });
    expect(verdict.admitted).toBe(false);
    expect(verdict.reasons.join(" ")).toContain("does not state whether its observations were re-executed or transcribed");
  });
});

describe("E1RF RF-D PASS / LIMIT / FAIL classification (DYNAMICALLY_VERIFIED)", () => {
  it("13. a LIMIT row is classified LIMIT even though it carries pass:true — THE DEFECT", () => {
    /** This is exactly how the shipped suites write a disclosed residual, and how E1RE recorded it as PASS. */
    expect(admission.classifyCheck({ pass: true, limit: true })).toBe("LIMIT");
    expect(admission.classifyCheck({ pass: true })).toBe("PASS");
    expect(admission.classifyCheck({ pass: false })).toBe("FAIL");
  });

  it("14. the summary counts a LIMIT separately from a PASS", () => {
    const summary = admission.summarizeConformance("r1hr", soundRecord);
    expect(summary.counts.pass).toBe(1);
    expect(summary.counts.limit).toBe(1);
    expect(summary.counts.fail).toBe(0);
    /** The suite's overall verdict is LIMIT, not PASS: a disclosed residual caps the claim. */
    expect(summary.verdict).toBe("LIMIT");
  });

  it("15. a DUPLICATE check id is preserved and reported, never deduplicated away", () => {
    /**
     * The real R1-HR report contains two HR-25 rows with different statements. Deduplicating by id would lose an
     * assertion silently.
     */
    const duplicated = { ...soundRecord, results: [{ id: "HR-25", statement: "first", pass: true }, { id: "HR-25", statement: "second", pass: true }], limits: [] };
    const summary = admission.summarizeConformance("r1hr", duplicated);
    expect(summary.checks).toHaveLength(2);
    expect(summary.duplicateIdentities).toContain("HR-25");
    expect(summary.checks[0]?.identity).not.toBe(summary.checks[1]?.identity);
  });

  it("16. the identity is `suite:ordinal:id:statement`, so a reordering is visible", () => {
    const a = admission.checkIdentity("r1hr", 0, { id: "HR-25", statement: "first" });
    const b = admission.checkIdentity("r1hr", 1, { id: "HR-25", statement: "second" });
    expect(a).toBe("r1hr#0:HR-25:first");
    expect(b).toBe("r1hr#1:HR-25:second");
    expect(a).not.toBe(b);
  });

  it("17. an UNDECLARED LIMIT in a row is surfaced as a tally disagreement", () => {
    const summary = admission.summarizeConformance("r1hr", { ...soundRecord, limits: [] });
    expect(summary.limitDisagreement).toContain("HR-17");
  });

  it("18. a timestamp is NOT accepted as a freshness proof", () => {
    const built = admission.runIdentityOf({ ...identity });
    expect(built.timestampIsNotFreshnessProof).toBe(true);
    /** The freshness fields are the identity fields, and none of them is a time. */
    expect(admission.RUN_IDENTITY_FIELDS).not.toContain("startedAt");
    expect(admission.RUN_IDENTITY_FIELDS).not.toContain("timestamp");
  });
});
