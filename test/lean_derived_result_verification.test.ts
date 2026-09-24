/**
 * PLMP-LEAN-1 §D3-d3 — the ResultSubject generalization and RE-VERIFICATION.
 *
 * The one existing semantic this slice was authorized to generalize, and the two things it must prove:
 *
 *     ONE verifier runtime serves ATTEMPT_RESULT and DERIVED_RESULT — no second verifier species
 *     Verification(R_0) ⇏ Verification(R_1)   — a candidate earns its OWN verification fact
 *
 * The generalization is deliberately minimal. `supportedSubjects` on the registered first-party verifier
 * is NOT widened, because widening it would change that verifier's definition DIGEST — and B.11 already
 * recorded the consequence: every recorded attempt-result verification would stop qualifying. The kind
 * acceptance lives in the protocol and in the resolver's result-subject family relation instead, which
 * costs no digest. This suite pins that digest, so a future "helpful" widening fails loudly.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, describe, expect, it } from "vitest";

import {
  PROJECT_VERIFICATION_SUBJECT_KINDS,
  commandAttemptResultVerifier,
  isDerivedResultSubject,
  materializeDerivedResultVerificationSubject,
  materializeVerifierRegistry,
  parseProjectVerificationSubject,
  resultSubjectRevisionRange,
  ProjectVerificationError,
} from "../src/project_verification/index.js";
import { firstPartyDerivedResultVerificationSource } from "../src/deployment/derived_result_source.js";
import { SqliteDerivedResultCandidateStore, materializeDerivedResultCandidate, materializeResultDerivation } from "../src/project_world/index.js";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");

const cleanups: Array<() => void> = [];
afterAll(() => {
  for (const fn of cleanups) fn();
});

/* ================================================================== *
 * The vocabulary
 * ================================================================== */

describe("§D3-d3 ResultSubject = { ATTEMPT_RESULT, DERIVED_RESULT }", () => {
  it("the subject kind vocabulary has exactly three kinds, and the result kinds are a family", () => {
    expect([...PROJECT_VERIFICATION_SUBJECT_KINDS]).toEqual(["CURRENT_PROJECT_HEAD", "ATTEMPT_RESULT", "DERIVED_RESULT"]);
  });

  it("a derived subject round-trips through the union parser, and is not mistaken for an attempt", () => {
    const subject = materializeDerivedResultVerificationSubject({
      projectId: "p",
      taskId: "t1",
      candidateId: "candidate-abc",
      derivationId: "deriv-abc",
      originResultManifestDigest: "f".repeat(64),
      baseRevision: "a".repeat(40),
      resultRevision: "b".repeat(40),
      resultManifestDigest: "e".repeat(64),
    });
    const parsed = parseProjectVerificationSubject(subject);
    expect(parsed.kind).toBe("DERIVED_RESULT");
    expect(isDerivedResultSubject(parsed)).toBe(true);
    expect(parsed).toEqual(subject);
    // The attempt-result parser must still REFUSE it: the kinds are told apart by identity, not guessed.
    expect(() => parseProjectVerificationSubject({ ...subject, kind: "ATTEMPT_RESULT" })).toThrow(ProjectVerificationError);
  });

  it("the common shape is the commit RANGE, which is why one protocol serves both kinds", () => {
    const derived = materializeDerivedResultVerificationSubject({
      projectId: "p",
      taskId: "t1",
      candidateId: "c",
      derivationId: "d",
      originResultManifestDigest: "f".repeat(64),
      baseRevision: "a".repeat(40),
      resultRevision: "b".repeat(40),
      resultManifestDigest: "e".repeat(64),
    });
    expect(resultSubjectRevisionRange(derived)).toEqual({ baseRevision: "a".repeat(40), resultRevision: "b".repeat(40) });
  });

  it("a subject whose digest does not match its content is refused", () => {
    const subject = materializeDerivedResultVerificationSubject({
      projectId: "p",
      taskId: "t1",
      candidateId: "c",
      derivationId: "d",
      originResultManifestDigest: "f".repeat(64),
      baseRevision: "a".repeat(40),
      resultRevision: "b".repeat(40),
      resultManifestDigest: "e".repeat(64),
    });
    expect(() => parseProjectVerificationSubject({ ...subject, resultRevision: "c".repeat(40) })).toThrow(/digest does not match/u);
  });
});

/* ================================================================== *
 * The digest constraint: no second verifier, and no staling
 * ================================================================== */

describe("§D3-d3 no second verifier species, and no staled definition", () => {
  it("the first-party result verifier's definition digest is UNCHANGED by this slice", () => {
    /**
     * The load-bearing assertion. Widening `supportedSubjects` to include DERIVED_RESULT would be the
     * obvious way to "support" the new kind, and it would change this digest — which makes every recorded
     * attempt-result verification non-current, so a previously qualifying result would stop qualifying.
     * The value is pinned so that regression cannot be introduced quietly.
     */
    const definition = commandAttemptResultVerifier().definition;
    expect(definition.supportedSubjects).toEqual(["ATTEMPT_RESULT"]);
    expect(definition.digest).toBe("38d455e0a8f61fe6f35612a0950c4330359cab162f60bfc039bb79a202fb10ca");
  });

  it("the protocol ACCEPTS a derived subject even though the registry lists only ATTEMPT_RESULT", async () => {
    const port = commandAttemptResultVerifier();
    const derived = materializeDerivedResultVerificationSubject({
      projectId: "p",
      taskId: "t1",
      candidateId: "c",
      derivationId: "d",
      originResultManifestDigest: "f".repeat(64),
      baseRevision: "a".repeat(40),
      resultRevision: "b".repeat(40),
      resultManifestDigest: "e".repeat(64),
    });
    /**
     * No repository is supplied, so the validator refuses for the MISSING CHECKOUT — which is how we know
     * it got PAST the kind check. A kind refusal would name the kind instead, so the two failures are
     * distinguishable and this assertion is about the right one.
     */
    return expect(port.verify({ subject: derived, requestedBy: "test" } as never)).rejects.toThrow(
      /needs the materialized checkout/u,
    );
  });

  it("exactly ONE first-party verifier factory exists for result subjects", () => {
    const text = execFileSync(
      process.execPath,
      ["-e", `process.stdout.write(require('node:fs').readFileSync(${JSON.stringify(join(REPO, "src/project_verification/experiment_adapter.ts"))},'utf8'))`],
      { encoding: "utf8" },
    ).replace(/\/\*[\s\S]*?\*\//gu, "");
    // One factory for a result subject. A `commandDerivedResultVerifier` would be the second species this
    // slice exists to avoid.
    expect(text).not.toContain("commandDerivedResultVerifier");
    expect(text).toContain("commandAttemptResultVerifier");
  });

  it("the registry still resolves a result verifier for a derived subject through the family relation", () => {
    const port = commandAttemptResultVerifier();
    const registry = materializeVerifierRegistry([port.definition]);
    // The registered ref serves ATTEMPT_RESULT; the resolver's family relation is what makes it serve
    // DERIVED_RESULT too, and that relation lives in the service rather than in the definition.
    expect(registry.get(port.definition.verifierRef)?.supportedSubjects).toEqual(["ATTEMPT_RESULT"]);
    const service = execFileSync(
      process.execPath,
      ["-e", `process.stdout.write(require('node:fs').readFileSync(${JSON.stringify(join(REPO, "src/project_verification/service.ts"))},'utf8'))`],
      { encoding: "utf8" },
    );
    expect(service).toContain("function definitionServes(");
    expect(service).toMatch(/kind === "DERIVED_RESULT" && definition\.supportedSubjects\.includes\("ATTEMPT_RESULT"\)/u);
  });
});

/* ================================================================== *
 * The subject source
 * ================================================================== */

describe("§D3-d3 the subject comes from the RECORD, never from the caller", () => {
  function store(): SqliteDerivedResultCandidateStore {
    const s = new SqliteDerivedResultCandidateStore(":memory:");
    cleanups.push(() => s.close());
    return s;
  }

  function candidateFixture() {
    const derivation = materializeResultDerivation({
      kind: "REMATERIALIZATION",
      mechanism: "git-source-rematerializer",
      mechanismVersion: "1",
      originResultManifestDigest: "1".repeat(64),
      originBasisDigest: "2".repeat(64),
      targetBasisDigest: "3".repeat(64),
      admissionRef: "issuance-abc",
    });
    return materializeDerivedResultCandidate({
      projectId: "p",
      taskId: "t1",
      derivation,
      sourceResult: { backend: "git", baseRevision: "a".repeat(40), resultRevision: "b".repeat(40) },
      producedAssetRefs: [],
      derivedAt: "2026-09-24T00:00:00.000Z",
    });
  }

  it("the subject is derived from the recorded candidate, including its origin manifest", () => {
    const s = store();
    const candidate = candidateFixture();
    s.appendOnce(candidate);
    const source = firstPartyDerivedResultVerificationSource({ store: s });
    const subject = source.materialize(candidate.candidateId);
    expect(subject.kind).toBe("DERIVED_RESULT");
    expect(subject.candidateId).toBe(candidate.candidateId);
    expect(subject.derivationId).toBe(candidate.derivation.derivationId);
    // The ORIGIN is named separately from the candidate, which is what keeps the two verifications
    // distinguishable by construction.
    expect(subject.originResultManifestDigest).toBe(candidate.derivation.originResultManifestDigest);
    expect(subject.resultManifestDigest).toBe(candidate.resultManifestDigest);
    expect(resultSubjectRevisionRange(subject).resultRevision).toBe("b".repeat(40));
  });

  it("an unknown candidate is refused, not turned into an empty subject", () => {
    const source = firstPartyDerivedResultVerificationSource({ store: store() });
    expect(() => source.materialize("never-recorded")).toThrow(/is not recorded/u);
  });

  it("a candidate with no source facet is refused, because there is no revision to check out", () => {
    const s = store();
    const derivation = materializeResultDerivation({
      kind: "REMATERIALIZATION",
      mechanism: "m",
      mechanismVersion: "1",
      originResultManifestDigest: "1".repeat(64),
      originBasisDigest: "2".repeat(64),
      targetBasisDigest: "3".repeat(64),
      admissionRef: "i",
    });
    const sourceless = materializeDerivedResultCandidate({
      projectId: "p",
      taskId: "t1",
      derivation,
      sourceResult: null,
      producedAssetRefs: [],
      derivedAt: "2026-09-24T00:00:00.000Z",
    });
    s.appendOnce(sourceless);
    const source = firstPartyDerivedResultVerificationSource({ store: s });
    expect(() => source.materialize(sourceless.candidateId)).toThrow(/no source facet/u);
  });

  it("the candidate store is APPEND-ONCE: a second append of the same identity keeps the first", () => {
    const s = store();
    const candidate = candidateFixture();
    const first = s.appendOnce(candidate);
    expect(first.state).toBe("APPENDED");
    const second = s.appendOnce(candidate);
    expect(second.state).toBe("EXISTING");
    expect(second.candidate.candidateId).toBe(first.candidate.candidateId);
    // And it is findable by derivation, which is what makes a retry converge rather than accumulate.
    expect(s.readByDerivation(candidate.derivation.derivationId)).toHaveLength(1);
  });
});

/* ================================================================== *
 * The OUT list, as a machine check
 * ================================================================== */

describe("§D3-d3 scope: one verifier, no reuse inference", () => {
  it("no verification-reuse inference appears anywhere in the derivation path", () => {
    const read = (relative: string): string =>
      execFileSync(
        process.execPath,
        ["-e", `process.stdout.write(require('node:fs').readFileSync(${JSON.stringify(join(REPO, relative))},'utf8'))`],
        { encoding: "utf8" },
      ).replace(/\/\*[\s\S]*?\*\//gu, "");
    for (const file of [
      "src/project_world/derivation.ts",
      "src/deployment/derived_result_source.ts",
      "src/project_world/candidate_store.ts",
    ]) {
      const text = read(file);
      for (const forbidden of [
        // No reuse inference: a candidate's verdict is never carried over from its origin.
        "reuseVerification",
        "inheritVerification",
        "verificationReuse",
        "carryOverVerdict",
        // No canonical mutation and no promotion.
        "promoteAttempt",
        "assessPromotionEligibility",
        "ATTEMPT_COMPLETED",
        "recordCallback",
      ]) {
        expect(text, `${file} must not contain "${forbidden}"`).not.toContain(forbidden);
      }
    }
  });

  it("the candidate store is append-once by schema, not by caller discipline", () => {
    const text = execFileSync(
      process.execPath,
      ["-e", `process.stdout.write(require('node:fs').readFileSync(${JSON.stringify(join(REPO, "src/project_world/candidate_store.ts"))},'utf8'))`],
      { encoding: "utf8" },
    ).toUpperCase();
    expect(text).not.toContain("ON CONFLICT");
    expect(text).not.toContain("UPDATE DERIVED_RESULT_CANDIDATE");
    expect(text).toContain("PRIMARY KEY (CANDIDATE_ID)");
  });
});
