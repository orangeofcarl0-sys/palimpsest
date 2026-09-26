/**
 * PLMP-LEAN-1 §D3-e — SERIALIZABLE CONCURRENT RESULT COMPOSITION.
 *
 *     Execute concurrently; canonicalize serially.
 *     Facts persist; authorities expire.
 *
 * The slice's whole claim is that D3-a…D3-d already provide serializable canonicalization when composed,
 * and that NO new concurrency machinery is needed. So these tests are mostly about proving what is ALREADY
 * true and about refusing the things that must not be added:
 *
 *   A  two initially-eligible results cannot both directly promote — the existing expected-head discipline
 *   B  a historical admission persists as a FACT but loses its AUTHORITY
 *   C  the fresh chain (observe → prove → admit → rematerialize → reverify) succeeds
 *   D  no second concurrency assessor exists
 *   E  no multi-result effect exists
 *   F  a failed second composition leaves the first canonical fact intact
 *   G  the succession assessment is PLANNING EVIDENCE and can never be an admission
 *
 * The order-sensitivity case is the one that shows serialization order is SEMANTIC: `A then B` may be legal
 * while `B then A` is not, which is why this slice targets serializability and not commutativity.
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
import {
  SqliteProjectVerificationStore,
  commandAttemptResultVerifier,
  firstPartyAttemptResultVerificationSource,
  gitAttemptResultMaterializer,
  materializeVerifierRegistry,
} from "../src/project_verification/index.js";
import { makeProjectVerificationService } from "../src/project_verification/service.js";
import { materializeWorkDependency } from "../src/domain/world_basis.js";
import {
  COMPOSITION_ORDER_AUTHORITY,
  SUCCESSION_STATES,
  SqliteDerivedResultCandidateStore,
  assessSuccession,
  makeCompatibilityIssuer,
  makeRematerializationRuntime,
  type PremiseSet,
  type ResultRematerializerPort,
} from "../src/project_world/index.js";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");

const cleanups: Array<() => void> = [];
afterAll(() => {
  for (const fn of cleanups) fn();
});

const git = (cwd: string, args: readonly string[]): string =>
  execFileSync("git", [...args], { cwd, encoding: "utf8" }).trim();

const srcPath = (path: string) => ({ domain: "source", scope: "path", path }) as const;
const MANIFEST_A = "a".repeat(64);
const MANIFEST_B = "b".repeat(64);
const BASIS_B1 = "c".repeat(64);

/* ================================================================== *
 * D3-e3 — the succession algebra, and order sensitivity
 * ================================================================== */

describe("§D3-e3 succession: order is semantic, and the assessment is never an admission", () => {
  it("D. it REUSES D3-b's conflict theory — no second concurrency algebra", () => {
    const src = execFileSync(
      process.execPath,
      ["-e", `process.stdout.write(require('node:fs').readFileSync(${JSON.stringify(join(REPO, "src/project_world/serialization.ts"))},'utf8'))`],
      { encoding: "utf8" },
    ).replace(/\/\*[\s\S]*?\*\//gu, "");
    // It CALLS the domain conflict calculus rather than defining its own.
    expect(src).toContain("compareFootprints");
    expect(src).not.toContain("resourceSelectorKey");
    expect(src).not.toContain("relateSelectors");
  });

  it("independent results compose in either order", () => {
    const a = materializeWorkDependency({ reads: [srcPath("src/x.ts")], writes: [srcPath("src/y.ts")] });
    const b = materializeWorkDependency({ reads: [srcPath("src/p.ts")], writes: [srcPath("src/q.ts")] });
    expect(assessSuccession({ predecessor: a, candidate: b }).state).toBe("COMPOSABLE");
    expect(assessSuccession({ predecessor: b, candidate: a }).state).toBe("COMPOSABLE");
  });

  it("ORDER-SENSITIVE: `A then B` may compose while `B then A` may not", () => {
    /**
     * The case that makes serialization order a SEMANTIC fact rather than an implementation detail:
     *
     *     A: reads X, writes Y          B: writes X
     *
     * `A then B`: B changes X, which A never wrote, and A's read of X happened before B — so B's change
     * does not invalidate what A produced. Composable.
     *
     * `B then A`: A's read of X is invalidated by B's change to X. NOT composable.
     */
    const a = materializeWorkDependency({ reads: [srcPath("src/x.ts")], writes: [srcPath("src/y.ts")] });
    const b = materializeWorkDependency({ reads: [], writes: [srcPath("src/x.ts")] });

    const aThenB = assessSuccession({ predecessor: a, candidate: b });
    const bThenA = assessSuccession({ predecessor: b, candidate: a });

    expect(aThenB.state).toBe("COMPOSABLE");
    expect(bThenA.state).toBe("CONFLICT");
    // And the conflict is named as a READ invalidation, not a write collision — the distinction D3-b
    // exists to preserve.
    expect(bThenA.conflicts.map((entry) => entry.kind)).toEqual(["write_read_invalidation"]);
    expect(bThenA.conflicts[0]?.selector).toEqual(srcPath("src/x.ts"));
  });

  it("write/write is a conflict in BOTH directions", () => {
    const a = materializeWorkDependency({ writes: [srcPath("src/x.ts")] });
    const b = materializeWorkDependency({ writes: [srcPath("src/x.ts")] });
    expect(assessSuccession({ predecessor: a, candidate: b }).state).toBe("CONFLICT");
    expect(assessSuccession({ predecessor: b, candidate: a }).state).toBe("CONFLICT");
    expect(assessSuccession({ predecessor: a, candidate: b }).conflicts[0]?.kind).toBe("write_write");
  });

  it("read invalidation is DIRECTIONAL: only the predecessor's writes can invalidate a candidate", () => {
    /**
     * Succession is not symmetric, and this is why the assessment must be directional. The predecessor has
     * ALREADY completed, so its READS cannot invalidate anything — its result is fixed. Only what it
     * CHANGED can.
     */
    const reader = materializeWorkDependency({ reads: [srcPath("src/x.ts")] });
    const writer = materializeWorkDependency({ writes: [srcPath("src/x.ts")] });

    // The reader first: its predecessor change is its WRITES, of which there are none.
    expect(assessSuccession({ predecessor: reader, candidate: writer }).state).toBe("COMPOSABLE");

    // The writer first: its predecessor change IS a write of X, and the reader read X.
    const writerThenReader = assessSuccession({ predecessor: writer, candidate: reader });
    expect(writerThenReader.state).toBe("CONFLICT");
    expect(writerThenReader.conflicts[0]?.kind).toBe("write_read_invalidation");

    // By contrast WRITE/WRITE is symmetric, because neither side's result survives the other.
    const w1 = materializeWorkDependency({ writes: [srcPath("src/x.ts")] });
    const w2 = materializeWorkDependency({ writes: [srcPath("src/x.ts")] });
    expect(assessSuccession({ predecessor: w1, candidate: w2 }).state).toBe("CONFLICT");
    expect(assessSuccession({ predecessor: w2, candidate: w1 }).state).toBe("CONFLICT");
  });

  it("G. the assessment is structurally PLANNING EVIDENCE: `isAdmission` is always false", () => {
    const a = materializeWorkDependency({ writes: [srcPath("src/x.ts")] });
    const b = materializeWorkDependency({ reads: [], writes: [srcPath("src/y.ts")] });
    for (const assessment of [assessSuccession({ predecessor: a, candidate: b }), assessSuccession({ predecessor: b, candidate: a })]) {
      /**
       * A succession assessment reasons about a world that does NOT YET EXIST — the one the predecessor
       * would produce. Admitting against a hypothetical world is exactly the "authority for a future
       * world" mistake, so the type makes it impossible to mistake this for an admission.
       */
      expect(assessment.isAdmission).toBe(false);
    }
    // The vocabulary is the two states, and neither is an authority.
    expect([...SUCCESSION_STATES]).toEqual(["COMPOSABLE", "CONFLICT"]);
  });

  it("the linearization order is chosen OUTSIDE this plane, and that is recorded", () => {
    expect(COMPOSITION_ORDER_AUTHORITY).toContain("promotion-authority-or-caller");
    const src = execFileSync(
      process.execPath,
      ["-e", `process.stdout.write(require('node:fs').readFileSync(${JSON.stringify(join(REPO, "src/project_world/serialization.ts"))},'utf8'))`],
      { encoding: "utf8" },
    ).replace(/\/\*[\s\S]*?\*\//gu, "");
    // No ordering planner: D3-e is composition semantics, not a scheduler.
    for (const forbidden of [
      "computeOptimalOrdering",
      "bestOrder",
      "priority",
      "retryCount",
      "workerRanking",
      "pendingCandidates",
      "permutation",
    ]) {
      expect(src, `serialization.ts must not contain "${forbidden}"`).not.toContain(forbidden);
    }
  });
});

/* ================================================================== *
 * D3-e2 — the two-result composition, end to end
 * ================================================================== */

/** H0 → R0 changes src/a.ts. Canonical then advances H0 → H1 (src/b.ts) → H2 (src/c.ts). */
function scenario() {
  const root = mkdtempSync(join(tmpdir(), "palimpsest-d3e-"));
  const repo = join(root, "repo");
  const worldsRoot = join(root, "worlds");
  mkdirSync(join(repo, "src"), { recursive: true });
  for (const [name, body] of [["a", 1], ["b", 1], ["c", 1]] as const) {
    writeFileSync(join(repo, "src", `${name}.ts`), `export const ${name} = ${String(body)};\n`);
  }
  execFileSync("git", ["init", "-q"], { cwd: repo });
  execFileSync("git", ["add", "-A"], { cwd: repo });
  execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "H0"], { cwd: repo });
  const h0 = git(repo, ["rev-parse", "HEAD"]);

  // The origin result: changes src/a.ts on its own branch.
  execFileSync("git", ["checkout", "-q", "-b", "result", h0], { cwd: repo });
  writeFileSync(join(repo, "src", "a.ts"), "export const a = 2;\n");
  execFileSync("git", ["add", "-A"], { cwd: repo });
  execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "R0"], { cwd: repo });
  const r0 = git(repo, ["rev-parse", "HEAD"]);

  // Canonical advances: H0 → H1 (src/b.ts), then H1 → H2 (src/c.ts).
  execFileSync("git", ["checkout", "-q", "-b", "main", h0], { cwd: repo });
  writeFileSync(join(repo, "src", "b.ts"), "export const b = 2;\n");
  execFileSync("git", ["add", "-A"], { cwd: repo });
  execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "H1"], { cwd: repo });
  const h1 = git(repo, ["rev-parse", "HEAD"]);
  writeFileSync(join(repo, "src", "c.ts"), "export const c = 2;\n");
  execFileSync("git", ["add", "-A"], { cwd: repo });
  execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "H2"], { cwd: repo });
  const h2 = git(repo, ["rev-parse", "HEAD"]);

  cleanups.push(() => {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      // Windows keeps the directory busy while a git handle is open; the OS reaps it.
    }
  });
  return { repo, worldsRoot, h0, r0, h1, h2 };
}

/**
 * The premise refs for one composition step, recorded through REGISTERED observers (§D3-R1).
 *
 * `changePaths` is what the WORLD did; the result's own footprint is separate, because the change set and
 * the result's dependencies play different roles in the proof.
 */
function refsFor(rig: D3Rig, changePaths: readonly ReturnType<typeof srcPath>[]) {
  return {
    projectSemantic: rig.observe(rig.conservativeObserver, []),
    source: rig.observe(rig.sourceObserver, changePaths),
    assets: rig.observe(rig.conservativeObserver, []),
    environment: rig.observe(rig.conservativeObserver, []),
    resultReads: rig.observe(rig.conservativeObserver, [srcPath("src/a.ts")]),
    resultWrites: rig.observe(rig.conservativeObserver, [srcPath("src/a.ts")]),
  };
}

function stack(input: {
  readonly repo: string;
  readonly worldsRoot: string;
  readonly rematerializer?: ResultRematerializerPort | undefined;
  readonly current: { revision: string };
}) {
  const rig = makeD3Rig({
    rematerializer: input.rematerializer ?? gitSourceRematerializer({ repository: input.repo, worldsRoot: input.worldsRoot }),
    observeCurrentTarget: () => ({ targetObservationDigest: input.current.revision, targetBasisRevision: input.current.revision }),
  });
  cleanups.push(() => rig.close());
  const candidateStore = rig.candidates;
  const issuer = rig.issuer;
  const runtime = rig.runtime;
  if (runtime === undefined) throw new Error("the rig composed no rematerialization runtime");
  const provider = commandAttemptResultVerifier();
  const verification = makeProjectVerificationService({
    projectId: "d3e",
    source: { current: () => null } as never,
    store: new SqliteProjectVerificationStore(join(input.repo, ".palimpsest", "verification.sqlite")),
    registry: materializeVerifierRegistry([provider.definition]),
    providers: [provider],
    attemptResultSource: firstPartyAttemptResultVerificationSource({
      projectId: "d3e",
      attemptWorkRecord: () => null,
    } as never),
    attemptResultMaterializer: gitAttemptResultMaterializer({ repository: input.repo }),
    derivedResultSource: firstPartyDerivedResultVerificationSource({ store: candidateStore }),
  });
  return { rig, candidateStore, issuer, runtime, verification };
}

/** One full cycle of the D3 chain against one target. */
async function composeOnce(input: {
  readonly stack: ReturnType<typeof stack>;
  readonly repo: string;
  readonly resultManifestDigest: string;
  readonly originBasisDigest: string;
  readonly originSource: { readonly backend: string; readonly fromRevision: string; readonly toRevision: string };
  readonly target: string;
  readonly changePaths: readonly ReturnType<typeof srcPath>[];
  readonly current: { revision: string };
}) {
  /**
   * §D5-0: the result being carried forward is DECLARED under the identity the admission will name, and the
   * delta comes from that declaration rather than from this call. Note the chain this file builds: the
   * second cycle's origin IS the first cycle's candidate, so the identity is keyed on the result's own
   * manifest — a candidate is a DERIVED_RESULT, and addressing it as an attempt would be a lie about what
   * produced it.
   */
  const resultSubjectRef = { kind: "DERIVED_RESULT" as const, ref: `candidate-${input.resultManifestDigest.slice(0, 16)}` };
  input.stack.rig.declareResult({
    resultSubjectRef,
    resultManifestDigest: input.resultManifestDigest,
    originBasisDigest: input.originBasisDigest,
    sourceResult: {
      backend: input.originSource.backend,
      baseRevision: input.originSource.fromRevision,
      resultRevision: input.originSource.toRevision,
    },
    projectId: "d3e",
    taskId: "t1",
  });
  const { admissionRef, certificate } = input.stack.rig.admit({
    resultManifestDigest: input.resultManifestDigest,
    originBasisDigest: input.originBasisDigest,
    targetObservationDigest: input.target,
    targetBasisRevision: input.target,
    observationRefs: refsFor(input.stack.rig, input.changePaths),
    resultSubjectRef,
  });
  // The rig is placed at the world the admission names, so the effect's re-observation agrees.
  input.current.revision = input.target;
  const rematerialized = await input.stack.runtime.rematerialize({ admissionRef });
  return { admissionRef, certificate, rematerialized };
}

describe("§D3-e2 the fresh chain: a stale candidate re-enters through the ordinary path", () => {
  it("C. stale against B1 → assess B2 → fresh admission → rematerialize → reverify → qualified", async () => {
    const { repo, worldsRoot, h0, r0, h1, h2 } = scenario();
    const current = { revision: h0 };
  const s = stack({ repo, worldsRoot, current });

    // The candidate was admitted against H1 while canonical stood at H1.
    const atH1 = await composeOnce({
      stack: s,
      current,
      repo,
      resultManifestDigest: MANIFEST_A,
      originBasisDigest: BASIS_B1,
      originSource: { backend: "git", fromRevision: h0, toRevision: r0 },
      target: h1,
      changePaths: [srcPath("src/b.ts")],
    });
    expect(atH1.rematerialized.state).toBe("MATERIALIZED");
    const candidateAtH1 = atH1.rematerialized.candidate!;
    expect(candidateAtH1.sourceResult?.baseRevision).toBe(h1);

    /**
     * B. THE HISTORICAL ADMISSION PERSISTS BUT ITS AUTHORITY HAS EXPIRED.
     *
     * Canonical advanced H1 → H2 (a second result landed). The H1 admission is still a real historical
     * fact — the system must never claim it never happened — and it can no longer authorize an effect,
     * because the world it named is not the world any more.
     */
    // The world has moved to H2; the rig is placed there, while the record still names H1.
    current.revision = h2;
    const expired = await s.runtime.rematerialize({ admissionRef: atH1.admissionRef });
    expect(expired.state).toBe("ADMISSION_REFUSED");
    expect(expired.admission.state).toBe("STALE_PROOF");
    // The fact is still recallable, and the record is untouched by the refusal.
    expect(s.issuer.recall(atH1.certificate.issuanceDigest)?.assessment.outcome).toBe("COMPATIBLE");
    expect(s.issuer.recall(atH1.certificate.issuanceDigest)?.assessment.targetObservationDigest).toBe(h1);

    // C. And a FRESH cycle against the real H2 succeeds, producing a NEW candidate based at H2.
    const atH2 = await composeOnce({
      stack: s,
      current,
      repo,
      // The candidate at H1 becomes the origin, so the chain is RB0 → RB1 → RB2 with full provenance.
      resultManifestDigest: candidateAtH1.resultManifestDigest,
      originBasisDigest: atH1.certificate.assessment.targetObservationDigest,
      originSource: { backend: "git", fromRevision: h1, toRevision: candidateAtH1.sourceResult!.resultRevision },
      target: h2,
      changePaths: [srcPath("src/c.ts")],
    });
    expect(atH2.rematerialized.state).toBe("MATERIALIZED");
    const candidateAtH2 = atH2.rematerialized.candidate!;
    expect(candidateAtH2.sourceResult?.baseRevision).toBe(h2);
    // A NEW result identity, and a NEW derivation — the earlier candidate is untouched.
    expect(candidateAtH2.candidateId).not.toBe(candidateAtH1.candidateId);
    expect(candidateAtH2.derivation.derivationId).not.toBe(candidateAtH1.derivation.derivationId);
    // …and it names its predecessor as its origin, so the chain is inspectable.
    expect(candidateAtH2.derivation.originResultManifestDigest).toBe(candidateAtH1.resultManifestDigest);
    expect(s.candidateStore.read(candidateAtH1.candidateId)).toEqual(candidateAtH1);

    // Re-verified through the ordinary path, and qualified on its OWN run.
    const outcome = await s.verification.verifyDerivedResult({
      candidateId: candidateAtH2.candidateId,
      requestedBy: "test:d3e",
    });
    expect(outcome.status).toBe("recorded");
    expect(outcome.run?.verdict).toBe("PASS");
    expect(s.verification.derivedResultQualification(candidateAtH2.candidateId).satisfied).toBe(true);
  }, 240_000);

  it("the chain is inspectable: each candidate names the one it came from", async () => {
    const { repo, worldsRoot, h0, r0, h1, h2 } = scenario();
    const current = { revision: h0 };
  const s = stack({ repo, worldsRoot, current });
    const first = await composeOnce({
      stack: s,
      current,
      repo,
      resultManifestDigest: MANIFEST_A,
      originBasisDigest: BASIS_B1,
      originSource: { backend: "git", fromRevision: h0, toRevision: r0 },
      target: h1,
      changePaths: [srcPath("src/b.ts")],
    });
    const c1 = first.rematerialized.candidate!;
    const second = await composeOnce({
      stack: s,
      current,
      repo,
      resultManifestDigest: c1.resultManifestDigest,
      originBasisDigest: BASIS_B1,
      originSource: { backend: "git", fromRevision: h1, toRevision: c1.sourceResult!.resultRevision },
      target: h2,
      changePaths: [srcPath("src/c.ts")],
    });
    const c2 = second.rematerialized.candidate!;
    /**
     * Immutable chaining: `RB0 → RB1 → RB2`, each step a new identity that names its predecessor. Nothing
     * is ever "updated" to point at a newer basis, so the provenance of every result stays readable.
     */
    expect(c2.derivation.originResultManifestDigest).toBe(c1.resultManifestDigest);
    expect(c2.derivation.originBasisDigest).not.toBe(c2.derivation.targetBasisDigest);
    // Both candidates remain individually addressable.
    expect(s.candidateStore.read(c1.candidateId)?.resultManifestDigest).toBe(c1.resultManifestDigest);
    expect(s.candidateStore.read(c2.candidateId)?.resultManifestDigest).toBe(c2.resultManifestDigest);
  }, 240_000);

  it("F. a failed second composition leaves the FIRST canonical fact and candidate intact", async () => {
    const { repo, worldsRoot, h0, r0, h1, h2 } = scenario();
    // A rematerializer that succeeds once and then fails — the second composition fails.
    const real = gitSourceRematerializer({ repository: repo, worldsRoot });
    let calls = 0;
    const flaky: ResultRematerializerPort = {
      adapterId: real.adapterId,
      mechanismVersion: real.mechanismVersion,
      exportRevision: (input) => real.exportRevision(input),
      release: (id) => real.release(id),
      rematerialize: async (input) => {
        calls += 1;
        if (calls === 1) return real.rematerialize(input);
        return { state: "APPLY_FAILED", detail: "the second composition could not be applied cleanly" };
      },
    };
    const current = { revision: h0 };
  const s = stack({ repo, worldsRoot, rematerializer: flaky, current });

    const first = await composeOnce({
      stack: s,
      current,
      repo,
      resultManifestDigest: MANIFEST_A,
      originBasisDigest: BASIS_B1,
      originSource: { backend: "git", fromRevision: h0, toRevision: r0 },
      target: h1,
      changePaths: [srcPath("src/b.ts")],
    });
    expect(first.rematerialized.state).toBe("MATERIALIZED");
    const firstCandidate = first.rematerialized.candidate!;

    const second = await composeOnce({
      stack: s,
      current,
      repo,
      resultManifestDigest: MANIFEST_B,
      originBasisDigest: BASIS_B1,
      originSource: { backend: "git", fromRevision: h0, toRevision: r0 },
      target: h2,
      changePaths: [srcPath("src/c.ts")],
    });
    expect(second.rematerialized.state).toBe("REMATERIALIZATION_FAILED");
    expect(second.rematerialized.candidate).toBe(null);

    /**
     * `Later serialization failure does not rewrite earlier canonicalization.` The first candidate and its
     * record are exactly what they were; the failure produced no candidate at all. There is deliberately no
     * "roll the first one back so the second fits" — the first is a canonical fact.
     */
    expect(s.candidateStore.read(firstCandidate.candidateId)).toEqual(firstCandidate);
    expect(s.candidateStore.readByDerivation(firstCandidate.derivation.derivationId)).toHaveLength(1);
    expect(first.certificate.assessment.outcome).toBe("COMPATIBLE");
  }, 240_000);
});

/* ================================================================== *
 * D3-e1 — the boundaries this slice must not cross
 * ================================================================== */

describe("§D3-e1 the composition plane adds semantics, not machinery", () => {
  it("D. no second concurrency assessor appears anywhere", () => {
    const read = (relative: string): string =>
      execFileSync(
        process.execPath,
        ["-e", `process.stdout.write(require('node:fs').readFileSync(${JSON.stringify(join(REPO, relative))},'utf8'))`],
        { encoding: "utf8" },
      ).replace(/\/\*[\s\S]*?\*\//gu, "");
    const text = read("src/project_world/serialization.ts");
    // The one concurrency question is answered by D3-b's calculus, so no competing theory is defined here.
    for (const forbidden of [
      "assessConcurrentCompatibility",
      "concurrencyAlgebra",
      "conflictMatrix",
      "jointEligibility",
      "composeResults",
      "mergeCandidates",
    ]) {
      expect(text, `serialization.ts must not define "${forbidden}"`).not.toContain(forbidden);
    }
  });

  it("E. no multi-result effect exists", () => {
    const read = (relative: string): string =>
      execFileSync(
        process.execPath,
        ["-e", `process.stdout.write(require('node:fs').readFileSync(${JSON.stringify(join(REPO, relative))},'utf8'))`],
        { encoding: "utf8" },
      ).replace(/\/\*[\s\S]*?\*\//gu, "");
    for (const file of [
      "src/project_world/serialization.ts",
      "src/result/rematerialization.ts",
      "src/result/derivation.ts",
    ]) {
      const text = read(file);
      for (const forbidden of [
        "applyResults",
        "promoteBatch",
        "mergeCandidates",
        "ResultComposition",
        "atomicAdmission",
        "MultiResult",
      ]) {
        expect(text, `${file} must not contain "${forbidden}"`).not.toContain(forbidden);
      }
    }
  });

  it("the composition plane does not touch canonical state or promotion", () => {
    const text = execFileSync(
      process.execPath,
      ["-e", `process.stdout.write(require('node:fs').readFileSync(${JSON.stringify(join(REPO, "src/project_world/serialization.ts"))},'utf8'))`],
      { encoding: "utf8" },
    ).replace(/\/\*[\s\S]*?\*\//gu, "");
    for (const forbidden of [
      "promoteAttempt",
      "assessPromotionEligibility",
      "ATTEMPT_COMPLETED",
      "recordCallback",
      "execFileSync",
      "node:fs",
    ]) {
      expect(text, `serialization.ts must not contain "${forbidden}"`).not.toContain(forbidden);
    }
  });

  it("A. the existing expected-head discipline is what refuses a stale-base result", () => {
    /**
     * The property that makes serializable canonicalization FREE: promotion already refuses a result
     * authorized at an older base once the head has advanced. Nothing in D3-e needed to add it.
     */
    const eligibility = execFileSync(
      process.execPath,
      ["-e", `process.stdout.write(require('node:fs').readFileSync(${JSON.stringify(join(REPO, "src/domain/promotion_eligibility.ts"))},'utf8'))`],
      { encoding: "utf8" },
    );
    expect(eligibility).toContain("cross_revision_promotion_not_supported");
    expect(eligibility).toMatch(/canonicalExpectedHead !== envelope\.base_commit/u);
    // And D3-e added no blocker of its own: the promotion plane still knows nothing about composition.
    for (const forbidden of ["serializ", "Serializ", "succession", "Succession", "composab", "Composab"]) {
      expect(eligibility, `promotion eligibility must not know about "${forbidden}"`).not.toContain(forbidden);
    }
  });

  it("G. no total idempotency database was introduced by this slice", () => {
    // Each existing layer owns its own idempotency: the store is append-once, the derivation is identified
    // by its operation, verification has its own history. D3-e adds no orchestration-level ledger.
    const text = execFileSync(
      process.execPath,
      ["-e", `process.stdout.write(require('node:fs').readFileSync(${JSON.stringify(join(REPO, "src/project_world/serialization.ts"))},'utf8'))`],
      { encoding: "utf8" },
    );
    for (const forbidden of ["idempotency", "Idempotency", "DatabaseSync", "sqlite", "CREATE TABLE"]) {
      expect(text, `serialization.ts must not contain "${forbidden}"`).not.toContain(forbidden);
    }
  });
});
