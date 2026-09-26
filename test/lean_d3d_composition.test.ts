/**
 * PLMP-LEAN-1 §D3-d4 — the COMPOSITION gate: the whole D3 chain, and the two invariants that must hold
 * at the end of it.
 *
 *     R0 @ B0 → compatible → admitted → rematerialized at B1 → R1 @ B1 → independently re-verified
 *       → the EXISTING verification qualification → canonical source unchanged, promotion facts zero
 *
 * The final golden gate asserts the two facts the whole slice is built around:
 *
 *     Δ CandidateState ≠ 0        a new result identity exists, based at the target
 *     Δ CanonicalProjectState = 0 no promotion, no source mutation, no promotion facts
 *
 * and the verification fact that must NOT be inherited:
 *
 *     Verification(R_0) ⇏ Verification(R_1)
 *
 * A candidate is re-verified through the SAME runtime — no second verifier species — and its qualification
 * is computed by the SAME calculus the attempt path uses.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, describe, expect, it } from "vitest";

import { firstPartyDerivedResultVerificationSource } from "../src/deployment/derived_result_source.js";
import { makeD3Rig, type D3Rig } from "./d3_rig.js";
import { gitSourceRematerializer } from "../src/deployment/source_rematerializer.js";
import { GitCliPort } from "../src/effects/index.js";
import {
  SqliteProjectVerificationStore,
  commandAttemptResultVerifier,
  firstPartyAttemptResultVerificationSource,
  gitAttemptResultMaterializer,
  materializeVerifierRegistry,
} from "../src/project_verification/index.js";
import { makeProjectVerificationService } from "../src/project_verification/service.js";
import {
  SqliteDerivedResultCandidateStore,
  makeCompatibilityIssuer,
  makeRematerializationRuntime,
  type PremiseSet,
} from "../src/project_world/index.js";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");

const cleanups: Array<() => void> = [];
afterAll(() => {
  for (const fn of cleanups) fn();
});

const git = (cwd: string, args: readonly string[]): string =>
  execFileSync("git", [...args], { cwd, encoding: "utf8" }).trim();

/**
 * The canonical working tree, EXCLUDING the product's own state directory — the same filter the product's
 * own observation applies, and for the same reason: `.palimpsest/` is scaffolding, not the attempt's work.
 */
const canonicalTree = (repo: string): string =>
  git(repo, ["status", "--porcelain"])
    .split(String.fromCharCode(10))
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.endsWith(".palimpsest/"))
    .join("|");

const srcPath = (path: string) => ({ domain: "source", scope: "path", path }) as const;

/**
 * The subject parser is strict about identity fields, and rightly so: a manifest digest must be a real
 * canonical sha256 and a basis digest likewise. A placeholder like "manifest-R0" is REFUSED — which is the
 * strictness working, so the fixture supplies real values rather than the parser being loosened for a test.
 */
const MANIFEST_R0 = "a".repeat(64);
const BASIS_B0 = "b".repeat(64);

/** H0 → R0 changes src/a.ts; the world then moves H0 → H1 in src/b.ts. */
function scenario() {
  const root = mkdtempSync(join(tmpdir(), "palimpsest-d3d4-"));
  const repo = join(root, "repo");
  const worldsRoot = join(root, "worlds");
  mkdirSync(join(repo, "src"), { recursive: true });
  writeFileSync(join(repo, "src", "a.ts"), "export const a = 1;\n");
  writeFileSync(join(repo, "src", "b.ts"), "export const b = 1;\n");
  execFileSync("git", ["init", "-q"], { cwd: repo });
  execFileSync("git", ["add", "-A"], { cwd: repo });
  execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "H0"], { cwd: repo });
  const h0 = git(repo, ["rev-parse", "HEAD"]);

  execFileSync("git", ["checkout", "-q", "-b", "result", h0], { cwd: repo });
  writeFileSync(join(repo, "src", "a.ts"), "export const a = 2;\n");
  execFileSync("git", ["add", "-A"], { cwd: repo });
  execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "R0"], { cwd: repo });
  const r0 = git(repo, ["rev-parse", "HEAD"]);

  execFileSync("git", ["checkout", "-q", "-b", "main", h0], { cwd: repo });
  writeFileSync(join(repo, "src", "b.ts"), "export const b = 2;\n");
  execFileSync("git", ["add", "-A"], { cwd: repo });
  execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "H1"], { cwd: repo });
  const h1 = git(repo, ["rev-parse", "HEAD"]);

  cleanups.push(() => {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      // Windows keeps the directory busy while a git handle is open; the OS reaps it.
    }
  });
  return { root, repo, worldsRoot, h0, r0, h1 };
}

/** The premise refs for the disjoint case, recorded through REGISTERED observers (§D3-R1). */
function disjointRefs(rig: D3Rig) {
  return {
    projectSemantic: rig.observe(rig.conservativeObserver, []),
    source: rig.observe(rig.sourceObserver, [srcPath("src/b.ts")]),
    assets: rig.observe(rig.conservativeObserver, []),
    environment: rig.observe(rig.conservativeObserver, []),
    resultReads: rig.observe(rig.conservativeObserver, [srcPath("src/a.ts")]),
    resultWrites: rig.observe(rig.conservativeObserver, [srcPath("src/a.ts")]),
  };
}

/** The result identity every scenario in this file admits. */
const RESULT_REF = Object.freeze({ kind: "ATTEMPT_RESULT" as const, ref: "attempt-R0" });

/**
 * Build the full D3-d stack over one repository: the rig (observation + issuance + admission + candidates)
 * and the rematerialization runtime. The effect re-observes the current world, which the caller supplies.
 *
 * §D5-0: the RESULT is declared here, once, with the delta it carries. The effect reads the delta from the
 * resolver rather than from its caller, so a test states what the result IS — the same statement a
 * deployment's resolver would make from its own records.
 */
function stackFor(input: {
  readonly repo: string;
  readonly worldsRoot: string;
  readonly current: { revision: string };
  readonly originSource?: { readonly backend: string; readonly baseRevision: string; readonly resultRevision: string } | null | undefined;
}) {
  const rig = makeD3Rig({
    rematerializer: gitSourceRematerializer({ repository: input.repo, worldsRoot: input.worldsRoot }),
    observeCurrentTarget: () => ({ targetObservationDigest: input.current.revision, targetBasisRevision: input.current.revision }),
  });
  cleanups.push(() => rig.close());
  rig.declareResult({
    resultSubjectRef: RESULT_REF,
    resultManifestDigest: MANIFEST_R0,
    originBasisDigest: BASIS_B0,
    sourceResult: input.originSource ?? null,
    projectId: "d3d4",
    taskId: "t1",
  });
  if (rig.runtime === undefined) throw new Error("the rig composed no rematerialization runtime");
  return { rig, runtime: rig.runtime, candidates: rig.candidates };
}

describe("§D3-d4 the whole chain, end to end", () => {
  it("R0 admitted against B1 → candidate R1 at B1 → independently re-verified, canonical untouched", async () => {
    const { repo, worldsRoot, h0, r0, h1 } = scenario();
    const canonicalBefore = {
      head: git(repo, ["rev-parse", "HEAD"]),
      tree: canonicalTree(repo),
      refs: git(repo, ["for-each-ref", "--format=%(refname) %(objectname)"]),
    };

    // ---- 1. The stack: observation authority, issuance, admission and candidates. ----
    const { rig, runtime, candidates: candidateStore } = stackFor({ repo, worldsRoot, current: { revision: h1 }, originSource: { backend: "git", baseRevision: h0, resultRevision: r0 } });

    // ---- 2. The certificate AND the admission record, from observed premises. ----
    const { admissionRef, certificate } = rig.admit({
      resultManifestDigest: MANIFEST_R0,
      originBasisDigest: BASIS_B0,
      targetObservationDigest: h1,
      targetBasisRevision: h1,
      observationRefs: disjointRefs(rig),
      resultSubjectRef: RESULT_REF,
    });
    expect(certificate.assessment.outcome).toBe("COMPATIBLE");

    // ---- 3. The rematerialization effect, in candidate space, driven by the admission ref alone. ----
    const rematerialized = await runtime.rematerialize({ admissionRef });
    expect(rematerialized.state).toBe("MATERIALIZED");
    const candidate = rematerialized.candidate;
    if (candidate === null) throw new Error("expected a candidate");
    // Recorded, so later stages can name it by identity.
    expect(candidateStore.read(candidate.candidateId)).toEqual(candidate);

    /**
     * ΔCanonicalProjectState = 0, checked BEFORE verification so the effect's own footprint is isolated.
     */
    expect({
      head: git(repo, ["rev-parse", "HEAD"]),
      tree: canonicalTree(repo),
      refs: git(repo, ["for-each-ref", "--format=%(refname) %(objectname)"]),
    }).toEqual(canonicalBefore);

    // ---- 4. Re-verification through the EXISTING runtime, with a derived subject source. ----
    const provider = commandAttemptResultVerifier();
    const verification = makeProjectVerificationService({
      projectId: "d3d4",
      // The head source is unused here; the packaged deployment composes it, so the fixture supplies one.
      source: { current: () => null } as never,
      store: new SqliteProjectVerificationStore(join(repo, ".palimpsest", "verification.sqlite")),
      registry: materializeVerifierRegistry([provider.definition]),
      providers: [provider],
      attemptResultSource: firstPartyAttemptResultVerificationSource({
        projectId: "d3d4",
        attemptWorkRecord: () => null,
      } as never),
      attemptResultMaterializer: gitAttemptResultMaterializer({ repository: repo }),
      derivedResultSource: firstPartyDerivedResultVerificationSource({ store: candidateStore }),
    });

    const outcome = await verification.verifyDerivedResult({
      candidateId: candidate.candidateId,
      requestedBy: "test:d3d4",
      reason: "a rematerialized candidate must earn its own verification",
    });
    expect(outcome.status).toBe("recorded");
    expect(outcome.run?.verdict).toBe("PASS");
    // The subject really is the DERIVED kind, and it names its origin separately — which is what keeps the
    // origin's verdict from being readable as the candidate's.
    expect(outcome.run?.subject.kind).toBe("DERIVED_RESULT");

    // ---- 5. The qualification calculus, over the candidate. ----
    const qualification = verification.derivedResultQualification(candidate.candidateId);
    expect(qualification.satisfied).toBe(true);
    expect(qualification.runRef).toBe(outcome.run?.runId);

    /**
     * Δ CandidateState ≠ 0 while Δ CanonicalProjectState = 0 — the slice's two headline facts, asserted
     * together at the end of the real chain.
     */
    expect({
      head: git(repo, ["rev-parse", "HEAD"]),
      tree: canonicalTree(repo),
      refs: git(repo, ["for-each-ref", "--format=%(refname) %(objectname)"]),
    }).toEqual(canonicalBefore);
    expect(candidate.sourceResult?.baseRevision).toBe(h1);
  }, 180_000);

  it("the origin's verification does NOT transfer: the candidate needs its OWN run", async () => {
    const { repo, worldsRoot, h0, r0, h1 } = scenario();
    const current = { revision: h1 };
    const { rig, runtime, candidates: candidateStore } = stackFor({ repo, worldsRoot, current, originSource: { backend: "git", baseRevision: h0, resultRevision: r0 } });
    const { admissionRef, certificate } = rig.admit({
      resultManifestDigest: MANIFEST_R0,
      originBasisDigest: BASIS_B0,
      targetObservationDigest: h1,
      targetBasisRevision: h1,
      observationRefs: disjointRefs(rig),
      resultSubjectRef: RESULT_REF,
    });
    
    const rematerialized = await runtime.rematerialize({ admissionRef });
    const candidate = rematerialized.candidate!;

    const provider = commandAttemptResultVerifier();
    const verification = makeProjectVerificationService({
      projectId: "d3d4",
      source: { current: () => null } as never,
      store: new SqliteProjectVerificationStore(join(repo, ".palimpsest", "verification.sqlite")),
      registry: materializeVerifierRegistry([provider.definition]),
      providers: [provider],
      attemptResultSource: firstPartyAttemptResultVerificationSource({
        projectId: "d3d4",
        attemptWorkRecord: () => null,
      } as never),
      attemptResultMaterializer: gitAttemptResultMaterializer({ repository: repo }),
      derivedResultSource: firstPartyDerivedResultVerificationSource({ store: candidateStore }),
    });

    /**
     * BEFORE any run over the candidate: the qualification is unsatisfied, even though the ORIGIN result
     * is a perfectly good verified attempt result. That is `Verification(R_0) ⇏ Verification(R_1)` made
     * mechanical rather than merely stated.
     */
    const before = verification.derivedResultQualification(candidate.candidateId);
    expect(before.satisfied).toBe(false);
    expect(before.detail).toContain("no verification run covers");

    // And it becomes satisfied only by running a verification over the CANDIDATE.
    await verification.verifyDerivedResult({ candidateId: candidate.candidateId, requestedBy: "test" });
    expect(verification.derivedResultQualification(candidate.candidateId).satisfied).toBe(true);
  }, 180_000);

  it("the two qualifications are independent: one candidate's run does not satisfy another's", async () => {
    const { repo, worldsRoot, h0, r0, h1 } = scenario();
    const current = { revision: h1 };
    const { rig, runtime, candidates: candidateStore } = stackFor({ repo, worldsRoot, current, originSource: { backend: "git", baseRevision: h0, resultRevision: r0 } });
    const { admissionRef, certificate } = rig.admit({
      resultManifestDigest: MANIFEST_R0,
      originBasisDigest: BASIS_B0,
      targetObservationDigest: h1,
      targetBasisRevision: h1,
      observationRefs: disjointRefs(rig),
      resultSubjectRef: RESULT_REF,
    });
    
    /**
     * Each target needs its OWN certificate: a witness for one target does not authorize another, so
     * presenting the H1 certificate against an H0 target is refused as stale. The fixture therefore issues
     * per target, which is the discipline working rather than an inconvenience.
     */
    const rematerialize = async (target: string) => {
      // Each target gets its own ADMISSION, and the rig is placed at that world so the effect's
      // re-observation agrees with the record.
      const scoped = rig.admit({
        resultManifestDigest: MANIFEST_R0,
        originBasisDigest: BASIS_B0,
        targetObservationDigest: target,
        targetBasisRevision: target,
        observationRefs: disjointRefs(rig),
        resultSubjectRef: RESULT_REF,
      });
      current.revision = target;
      return runtime.rematerialize({ admissionRef: scoped.admissionRef });
    };
    const atH1 = await rematerialize(h1);
    const atH0 = await rematerialize(h0);
    // Different targets are different derivations, hence different candidates.
    expect(atH1.candidate?.candidateId).not.toBe(atH0.candidate?.candidateId);

    const provider = commandAttemptResultVerifier();
    const verification = makeProjectVerificationService({
      projectId: "d3d4",
      source: { current: () => null } as never,
      store: new SqliteProjectVerificationStore(join(repo, ".palimpsest", "verification.sqlite")),
      registry: materializeVerifierRegistry([provider.definition]),
      providers: [provider],
      attemptResultSource: firstPartyAttemptResultVerificationSource({
        projectId: "d3d4",
        attemptWorkRecord: () => null,
      } as never),
      attemptResultMaterializer: gitAttemptResultMaterializer({ repository: repo }),
      derivedResultSource: firstPartyDerivedResultVerificationSource({ store: candidateStore }),
    });
    await verification.verifyDerivedResult({ candidateId: atH1.candidate!.candidateId, requestedBy: "test" });
    expect(verification.derivedResultQualification(atH1.candidate!.candidateId).satisfied).toBe(true);
    // The other candidate has no run of its own.
    expect(verification.derivedResultQualification(atH0.candidate!.candidateId).satisfied).toBe(false);
  }, 240_000);
});

/* ================================================================== *
 * The boundary: the composition still does not touch promotion
 * ================================================================== */

describe("§D3-d4 the D3 complexity terminates before the Promotion boundary", () => {
  it("the composition does not wire the derivation path into promotion eligibility", () => {
    const core = execFileSync(
      process.execPath,
      ["-e", `process.stdout.write(require('node:fs').readFileSync(${JSON.stringify(join(REPO, "src/composition/core.ts"))},'utf8'))`],
      { encoding: "utf8" },
    );
    expect(core).not.toContain("rematerializ");
    expect(core).not.toContain("DerivedResultCandidate");

    // And the promotion plane still knows nothing about derivations: no new blocker, no second assessor.
    const eligibility = execFileSync(
      process.execPath,
      ["-e", `process.stdout.write(require('node:fs').readFileSync(${JSON.stringify(join(REPO, "src/domain/promotion_eligibility.ts"))},'utf8'))`],
      { encoding: "utf8" },
    );
    // IDENTIFIERS, not words: "candidate" is pre-existing domain vocabulary (an attempt is a batch
    // candidate), so the check names the concepts this slice introduced rather than a substring.
    for (const forbidden of [
      "ResultDerivation",
      "DerivedResultCandidate",
      "derivationId",
      "rematerializ",
      "Rematerializ",
      "cross_basis",
      "admitCrossBasis",
      "CompatibilityAssessment",
    ]) {
      expect(eligibility, `promotion eligibility must not know about "${forbidden}"`).not.toContain(forbidden);
    }
  });

  it("the candidate store's owner closes it, and the verification plane owns no candidate state", () => {
    // The candidate store is a capability the composition would own; it is deliberately NOT composed yet,
    // because wiring it would also mean wiring the effect — and the effect has no promotion path.
    const source = execFileSync(
      process.execPath,
      ["-e", `process.stdout.write(require('node:fs').readFileSync(${JSON.stringify(join(REPO, "src/result/candidate_store.ts"))},'utf8'))`],
      { encoding: "utf8" },
    );
    expect(source).toContain("close(): void");
    const service = execFileSync(
      process.execPath,
      ["-e", `process.stdout.write(require('node:fs').readFileSync(${JSON.stringify(join(REPO, "src/project_verification/service.ts"))},'utf8'))`],
      { encoding: "utf8" },
    );
    // The verification plane reads a subject through a port and stores only its own run history.
    expect(service).not.toContain("derived_result_candidate");
  });
});
