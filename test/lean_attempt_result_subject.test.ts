/**
 * PLMP-LEAN-1 phase 2B (B-r1) — the subject UNION, first slice.
 * Acceptance LEAN-A20 (the two subject kinds are distinguishable, in both directions).
 *
 * The union is the point: `ATTEMPT_RESULT` is a SECOND SUBJECT KIND, not a second verification
 * system. Two things must hold and neither is obvious:
 *
 *   1. Widening the kind list must NOT change the frozen head semantics. `ProjectHeadVerification-
 *      Subject.kind` is therefore the LITERAL "CURRENT_PROJECT_HEAD" and the head parser checks it
 *      explicitly — if it used the kind union, `pvEnum` would start accepting ATTEMPT_RESULT and a
 *      type alias would have silently changed a frozen semantic.
 *
 *   2. The two subjects must not alias. A head subject and an attempt-result subject describing the
 *      SAME project and the SAME commits still have different digests, because the digest domains
 *      differ — so "a HEAD PASS" can never be read as satisfying an attempt-result requirement.
 */
import { describe, expect, it } from "vitest";

import {
  ATTEMPT_RESULT_SUBJECT_DOMAIN,
  PROJECT_VERIFICATION_SUBJECT_KINDS,

  isAttemptResultSubject,
  materializeAttemptResultVerificationSubject,
  materializeProjectHeadVerificationSubject,
  parseAttemptResultVerificationSubject,
  parseProjectHeadVerificationSubject,
  parseProjectVerificationSubject,
  sameSubject,
} from "../src/project_verification/index.js";

const HEAD_INPUT = {
  projectId: "p1",
  projectRevision: 3,
  projectDigest: "a".repeat(64),
  headCommit: "b".repeat(40),
};

const ATTEMPT_INPUT = {
  projectId: "p1",
  taskId: "t1",
  attemptId: "attempt-1",
  envelopeId: "env-1",
  baseCommit: "b".repeat(40),
  resultCommit: "c".repeat(40),
  reportDigest: "d".repeat(64),
};

describe("LEAN-A20: the subject union distinguishes the two kinds, in both directions", () => {
  it("both kinds are declared, and the head subject's kind stays the LITERAL", () => {
    expect([...PROJECT_VERIFICATION_SUBJECT_KINDS]).toEqual(["CURRENT_PROJECT_HEAD", "ATTEMPT_RESULT"]);
    const head = materializeProjectHeadVerificationSubject(HEAD_INPUT);
    // Not merely equal at runtime — the type is the literal, so a widened union cannot leak in.
    expect(head.kind).toBe("CURRENT_PROJECT_HEAD");
  });

  it("the head parser still REJECTS an attempt-result payload", () => {
    // The frozen semantic: widening the kind list must not make the head parser permissive.
    const attempt = materializeAttemptResultVerificationSubject(ATTEMPT_INPUT);
    expect(() => parseProjectHeadVerificationSubject(attempt)).toThrow();
  });

  it("the attempt parser rejects a head payload", () => {
    const head = materializeProjectHeadVerificationSubject(HEAD_INPUT);
    expect(() => parseAttemptResultVerificationSubject(head)).toThrow();
  });

  it("the dispatch parser routes by kind, and round-trips both", () => {
    const head = materializeProjectHeadVerificationSubject(HEAD_INPUT);
    const attempt = materializeAttemptResultVerificationSubject(ATTEMPT_INPUT);
    expect(parseProjectVerificationSubject(head)).toEqual(head);
    expect(parseProjectVerificationSubject(attempt)).toEqual(attempt);
    expect(isAttemptResultSubject(parseProjectVerificationSubject(attempt))).toBe(true);
    expect(isAttemptResultSubject(parseProjectVerificationSubject(head))).toBe(false);
  });

  it("the two subjects do NOT alias, even over the same project and the same commits", () => {
    // The head subject points at headCommit; the attempt subject's resultCommit is that same commit.
    const head = materializeProjectHeadVerificationSubject(HEAD_INPUT);
    const attempt = materializeAttemptResultVerificationSubject({
      ...ATTEMPT_INPUT,
      resultCommit: HEAD_INPUT.headCommit,
    });
    // Different digest DOMAINS, so the digests differ — a HEAD PASS can never be read as satisfying
    // an attempt-result requirement, which is A37's firewall at the identity level.
    expect(attempt.digest).not.toBe(head.digest);
    expect(sameSubject(attempt, head)).toBe(false);
    expect(sameSubject(attempt, materializeAttemptResultVerificationSubject({ ...ATTEMPT_INPUT, resultCommit: HEAD_INPUT.headCommit }))).toBe(true);
    expect(ATTEMPT_RESULT_SUBJECT_DOMAIN).not.toContain("head");
  });

  it("the attempt subject is digest-bound to every identity field", () => {
    const base = materializeAttemptResultVerificationSubject(ATTEMPT_INPUT);
    const body = { ...ATTEMPT_INPUT };
    for (const field of ["taskId", "attemptId", "envelopeId", "baseCommit", "resultCommit", "reportDigest"] as const) {
      const changed = materializeAttemptResultVerificationSubject({ ...body, [field]: field === "reportDigest" ? "e".repeat(64) : "f".repeat(40) });
      expect(changed.digest).not.toBe(base.digest);
    }
    // And a tampered digest is refused.
    expect(() => parseAttemptResultVerificationSubject({ ...base, digest: "0".repeat(64) })).toThrow();
    // A wrong kind is refused too, so the two kinds cannot be confused by a payload that merely
    // looks like the other one.
    expect(() => parseAttemptResultVerificationSubject({ ...base, kind: "CURRENT_PROJECT_HEAD" })).toThrow();
  });
});
