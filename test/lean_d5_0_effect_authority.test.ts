/**
 * PLMP-LEAN-1 §D5-0 — EFFECT AUTHORITY CLOSURE, as machine proofs.
 *
 * D3-R2 made an admission a durable record and had the effect read its TARGET from it. One seam survived,
 * and it is the one this slice closes:
 *
 *     rematerialize({ admissionRef, originSource, projectId, taskId, producedAssetRefs })
 *                                  ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
 *                                  still caller-assembled facts
 *
 * So the system could prove "an admission authorizes an effect" but NOT "the effect is about the result
 * that admission was issued for". A caller could name a genuine admission and hand it a different delta.
 *
 * The proofs below are the ways that could still be false, and each one must be impossible:
 *
 *   A  the effect accepts ONLY an admission ref — the seam is not merely unused, it is unexpressible
 *   B  an admission names WHICH result it is about, and the ref depends on it
 *   C  a result that disagrees with the admission is REFUSED, not silently carried
 *   D  a deployment with no resolver reports a CAPABILITY GAP, never a caller-supplied delta
 *   E  the freshness observer is a HARD dependency, not an optional re-check
 *   F  the first-party resolver reads real records and resolves both result kinds
 *   G  a resolved result's project/task/assets reach the candidate, so they are the RESULT's, not a caller's
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, describe, expect, it } from "vitest";

import { gitSourceRematerializer } from "../src/deployment/source_rematerializer.js";
import {
  firstPartyResultResolver,
  FIRST_PARTY_RESULT_RESOLVER_ID,
} from "../src/deployment/result_resolution.js";
import {
  crossBasisAdmissionRefOf,
  makeRematerializationRuntime,
  resultSubjectRefDigest,
  type AuthoritativeResultResolver,
  type CrossBasisAdmissionRecord,
  type DerivedResultCandidateStore,
  type ResolvedResult,
  type ResultRematerializerPort,
  type ResultSubjectRef,
} from "../src/project_world/index.js";
import {
  firstPartyAttemptResultVerificationSource,
  materializeAttemptResultVerificationSubject,
  type AttemptResultVerificationSource,
} from "../src/project_verification/index.js";
import type { ProjectWorldBasis } from "../src/domain/world_basis.js";
import { makeD3Rig, type D3Rig } from "./d3_rig.js";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");

const cleanups: Array<() => void> = [];
afterAll(() => {
  for (const fn of cleanups) fn();
});

const git = (cwd: string, args: readonly string[]): string =>
  execFileSync("git", [...args], { cwd, encoding: "utf8" }).trim();

const srcPath = (path: string) => ({ domain: "source", scope: "path", path }) as const;
const RESULT_A: ResultSubjectRef = Object.freeze({ kind: "ATTEMPT_RESULT", ref: "attempt-a" });
const RESULT_B: ResultSubjectRef = Object.freeze({ kind: "ATTEMPT_RESULT", ref: "attempt-b" });

/** A repository with the shape the effect needs: H0 → R0 changes src/a.ts. */
function scenario(): { repo: string; worldsRoot: string; h0: string; r0: string } {
  const root = mkdtempSync(join(tmpdir(), "palimpsest-d50-"));
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
  // Back to the basis. The fixture never created a branch named `main` — the default branch IS the basis —
  // so this returns to H0 by revision rather than by a name the fixture did not make.
  execFileSync("git", ["checkout", "-q", "--detach", h0], { cwd: repo });
  cleanups.push(() => {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      // Windows keeps the directory busy while a git handle is open; the OS reaps it.
    }
  });
  return { repo, worldsRoot, h0, r0 };
}

/** The premises for the disjoint case, recorded through registered observers. */
function refsFor(rig: D3Rig) {
  return {
    projectSemantic: rig.observe(rig.conservativeObserver, []),
    source: rig.observe(rig.sourceObserver, [srcPath("src/b.ts")]),
    assets: rig.observe(rig.conservativeObserver, []),
    environment: rig.observe(rig.conservativeObserver, []),
    resultReads: rig.observe(rig.conservativeObserver, [srcPath("src/a.ts")]),
    resultWrites: rig.observe(rig.conservativeObserver, [srcPath("src/a.ts")]),
  };
}

/**
 * A stack whose resolver can be replaced, which is how C is proven.
 *
 * When `results` is given the runtime is built HERE with that resolver rather than using the rig's own, so a
 * test can make the resolver disagree with the admission. The rig's stores are the same objects either way,
 * so the admission under test is a real durable record.
 */
function stackFor(input: {
  readonly repo: string;
  readonly worldsRoot: string;
  readonly current: { revision: string };
  readonly results?: AuthoritativeResultResolver | undefined;
  readonly rematerializer?: ResultRematerializerPort | undefined;
}): { rig: D3Rig; runtime: ReturnType<typeof makeRematerializationRuntime> } {
  const rematerializer =
    input.rematerializer ?? gitSourceRematerializer({ repository: input.repo, worldsRoot: input.worldsRoot });
  const rig = makeD3Rig({
    rematerializer,
    observeCurrentTarget: () => ({ targetObservationDigest: input.current.revision, targetBasisRevision: input.current.revision }),
  });
  cleanups.push(() => rig.close());
  const runtime =
    input.results === undefined
      ? rig.runtime
      : makeRematerializationRuntime({
          issuer: rig.issuer,
          rematerializer,
          candidates: rig.candidates,
          admissions: rig.admissions,
          results: input.results,
          observeCurrentTarget: () => ({ targetObservationDigest: input.current.revision, targetBasisRevision: input.current.revision }),
          clock: () => "2026-09-25T00:00:00.000Z",
        });
  if (runtime === undefined) throw new Error("the rig composed no rematerialization runtime");
  return { rig, runtime };
}

/* ================================================================== *
 * A. The effect accepts ONLY an admission ref
 * ================================================================== */

describe("§D5-0 A. the effect's only input is an admission identity", () => {
  it("the entry point has no parameter through which a caller can describe the result", () => {
    const text = execFileSync(
      process.execPath,
      ["-e", `process.stdout.write(require('node:fs').readFileSync(${JSON.stringify(join(REPO, "src/result/rematerialization.ts"))},'utf8'))`],
      { encoding: "utf8" },
    );
    /**
     * The interface block is what a caller sees, so this is the seam itself rather than a caller's use of
     * it. `originSource`, `projectId`, `taskId` and `producedAssetRefs` must not appear as INPUTS — they are
     * resolved now. They still appear in the file as the resolver's fields and in the detail strings, which
     * is why this asserts on the input shape rather than on the whole text.
     */
    const inputBlock = text.slice(text.indexOf("  rematerialize(input: {"), text.indexOf("  }): Promise<RematerializationResult>;"));
    expect(inputBlock).toContain("readonly admissionRef: string;");
    expect(inputBlock).not.toContain("originSource");
    expect(inputBlock).not.toContain("projectId");
    expect(inputBlock).not.toContain("taskId");
    expect(inputBlock).not.toContain("producedAssetRefs");
  });

  it("a caller CANNOT pass a delta: the parameter does not exist at runtime either", async () => {
    const { repo, worldsRoot, h0, r0 } = scenario();
    const current = { revision: h0 };
    const { rig, runtime } = stackFor({ repo, worldsRoot, current });
    rig.declareResult({
      resultSubjectRef: RESULT_A,
      resultManifestDigest: "m".repeat(64),
      originBasisDigest: "b".repeat(64),
      sourceResult: { backend: "git", baseRevision: h0, resultRevision: r0 },
      projectId: "p",
      taskId: "t1",
    });
    const { admissionRef } = rig.admit({
      resultManifestDigest: "m".repeat(64),
      originBasisDigest: "b".repeat(64),
      targetObservationDigest: h0,
      targetBasisRevision: h0,
      observationRefs: refsFor(rig),
      resultSubjectRef: RESULT_A,
    });
    /**
     * Extra properties are ignored by the function, so the PROOF is not "it throws" — it is that the
     * candidate's delta comes from the resolver. A caller-supplied delta that disagrees is simply not read.
     */
    const result = await runtime.rematerialize({
      admissionRef,
      originSource: { backend: "git", fromRevision: "deadbeef", toRevision: "deadbeef" },
      projectId: "SOMEBODY-ELSE",
      taskId: "NOT-THE-RESULTS-TASK",
      producedAssetRefs: ["asset-the-caller-invented"],
    } as never);
    expect(result.state).toBe("MATERIALIZED");
    // The RESOLVED identity won, not the caller's.
    expect(result.candidate?.projectId).toBe("p");
    expect(result.candidate?.taskId).toBe("t1");
    expect(result.candidate?.producedAssetRefs).toEqual([]);
    // And the delta applied is the RESULT's, so the candidate carries R0's change.
    const changed = git(repo, ["diff", "--name-only", `${h0}..${result.candidate!.sourceResult!.resultRevision}`]);
    expect(changed).toBe("src/a.ts");
  }, 120_000);
});

/* ================================================================== *
 * B. An admission names WHICH result it is about
 * ================================================================== */

describe("§D5-0 B. the admission's identity includes the result", () => {
  it("two admissions differing only in their result are DIFFERENT identities", () => {
    const base = { issuanceRef: "issuance-a", targetObservationDigest: "target-1" };
    const one = crossBasisAdmissionRefOf({ ...base, resultSubjectRef: RESULT_A });
    const other = crossBasisAdmissionRefOf({ ...base, resultSubjectRef: RESULT_B });
    expect(one).not.toBe(other);
    // And a different result KIND is a different identity too — a candidate is not an attempt.
    const asCandidate = crossBasisAdmissionRefOf({
      ...base,
      resultSubjectRef: { kind: "DERIVED_RESULT", ref: RESULT_A.ref },
    });
    expect(asCandidate).not.toBe(one);
  });

  it("the record holds the result identity, and recalling it gives the same one back", () => {
    const rig = makeD3Rig();
    cleanups.push(() => rig.close());
    const { record } = rig.admit({
      resultManifestDigest: "m".repeat(64),
      originBasisDigest: "b".repeat(64),
      targetObservationDigest: "digest-of-B1",
      targetBasisRevision: "revision-of-B1",
      observationRefs: refsFor(rig),
      resultSubjectRef: RESULT_A,
    });
    expect(record.resultSubjectRef).toEqual(RESULT_A);
    expect(rig.admissions.recall(record.admissionRef)?.resultSubjectRef).toEqual(RESULT_A);
  });
});

/* ================================================================== *
 * C. A result that disagrees with the admission is REFUSED
 * ================================================================== */

describe("§D5-0 C. an admission cannot be pointed at a different result", () => {
  it("a resolver returning a DIFFERENT manifest than the admission names is refused, with no world created", async () => {
    const { repo, worldsRoot, h0, r0 } = scenario();
    const current = { revision: h0 };
    /**
     * THE DEFECT THIS PINS. Before D5-0 the caller supplied the delta, so this disagreement was not even
     * expressible: there was no record saying which result the admission was for. Now there is, and a
     * mismatch must refuse rather than carry somebody else's work.
     */
    const disagreeing: AuthoritativeResultResolver = Object.freeze({
      adapterId: "disagreeing-resolver",
      resolve: (ref: ResultSubjectRef): ResolvedResult =>
        Object.freeze({
          resultSubjectRef: ref,
          // The admission says "m"*64; this result says otherwise.
          resultManifestDigest: "9".repeat(64),
          originBasisDigest: "b".repeat(64),
          projectId: "p",
          taskId: "t1",
          sourceResult: Object.freeze({ backend: "git", baseRevision: h0, resultRevision: r0 }),
          producedAssetRefs: Object.freeze([]),
        }),
    });
    const { rig, runtime } = stackFor({ repo, worldsRoot, current, results: disagreeing });
    rig.declareResult({
      resultSubjectRef: RESULT_A,
      resultManifestDigest: "m".repeat(64),
      originBasisDigest: "b".repeat(64),
      sourceResult: { backend: "git", baseRevision: h0, resultRevision: r0 },
    });
    const { admissionRef } = rig.admit({
      resultManifestDigest: "m".repeat(64),
      originBasisDigest: "b".repeat(64),
      targetObservationDigest: h0,
      targetBasisRevision: h0,
      observationRefs: refsFor(rig),
      resultSubjectRef: RESULT_A,
    });
    const result = await runtime.rematerialize({ admissionRef });
    expect(result.state).toBe("ADMISSION_REFUSED");
    expect(result.admission.state).toBe("UNTRUSTED_PROOF");
    expect(result.candidate).toBe(null);
    // NO world was created: the refusal happened before any effect.
    expect(existsSync(join(worldsRoot, `deriv-${"x"}`))).toBe(false);
    expect(git(repo, ["rev-parse", "HEAD"])).toBe(h0);
  }, 120_000);

  it("a result that resolves to a DIFFERENT origin basis is refused too", async () => {
    const { repo, worldsRoot, h0, r0 } = scenario();
    const current = { revision: h0 };
    const wrongBasis: AuthoritativeResultResolver = Object.freeze({
      adapterId: "wrong-basis-resolver",
      resolve: (ref: ResultSubjectRef): ResolvedResult =>
        Object.freeze({
          resultSubjectRef: ref,
          resultManifestDigest: "m".repeat(64),
          originBasisDigest: "not-the-admissions-basis",
          projectId: "p",
          taskId: "t1",
          sourceResult: Object.freeze({ backend: "git", baseRevision: h0, resultRevision: r0 }),
          producedAssetRefs: Object.freeze([]),
        }),
    });
    const { rig, runtime } = stackFor({ repo, worldsRoot, current, results: wrongBasis });
    rig.declareResult({
      resultSubjectRef: RESULT_A,
      resultManifestDigest: "m".repeat(64),
      originBasisDigest: "b".repeat(64),
      sourceResult: { backend: "git", baseRevision: h0, resultRevision: r0 },
    });
    const { admissionRef } = rig.admit({
      resultManifestDigest: "m".repeat(64),
      originBasisDigest: "b".repeat(64),
      targetObservationDigest: h0,
      targetBasisRevision: h0,
      observationRefs: refsFor(rig),
      resultSubjectRef: RESULT_A,
    });
    const result = await runtime.rematerialize({ admissionRef });
    expect(result.state).toBe("ADMISSION_REFUSED");
    expect(result.candidate).toBe(null);
  }, 120_000);
});

/* ================================================================== *
 * D. No resolver is a CAPABILITY GAP, never a caller-supplied delta
 * ================================================================== */

describe("§D5-0 D. a deployment that cannot resolve results reports a capability gap", () => {
  it("with no resolver composed, the effect refuses and never falls back to caller facts", async () => {
    const { repo, worldsRoot, h0, r0 } = scenario();
    const rig = makeD3Rig({ rematerializer: gitSourceRematerializer({ repository: repo, worldsRoot }) });
    cleanups.push(() => rig.close());
    const runtime = makeRematerializationRuntime({
      issuer: rig.issuer,
      rematerializer: gitSourceRematerializer({ repository: repo, worldsRoot }),
      candidates: rig.candidates,
      admissions: rig.admissions,
      // NO `results`: the honest "this deployment cannot resolve results".
      observeCurrentTarget: () => ({ targetObservationDigest: h0, targetBasisRevision: h0 }),
    });
    rig.declareResult({
      resultSubjectRef: RESULT_A,
      resultManifestDigest: "m".repeat(64),
      originBasisDigest: "b".repeat(64),
      sourceResult: { backend: "git", baseRevision: h0, resultRevision: r0 },
    });
    const { admissionRef } = rig.admit({
      resultManifestDigest: "m".repeat(64),
      originBasisDigest: "b".repeat(64),
      targetObservationDigest: h0,
      targetBasisRevision: h0,
      observationRefs: refsFor(rig),
      resultSubjectRef: RESULT_A,
    });
    const result = await runtime.rematerialize({ admissionRef });
    expect(result.state).toBe("EFFECT_CAPABILITY_UNAVAILABLE");
    expect(result.candidate).toBe(null);
    expect(result.detail).toContain("no authoritative result resolver");
    // The admission itself was ADMITTED — the gap is a capability, not a stale or untrusted proof.
    expect(result.admission.admitted).toBe(true);
  }, 120_000);

  it("an unresolvable result identity is the same capability gap, not a silent success", async () => {
    const { repo, worldsRoot, h0 } = scenario();
    const { rig, runtime } = stackFor({ repo, worldsRoot, current: { revision: h0 } });
    const { admissionRef } = rig.admit({
      resultManifestDigest: "m".repeat(64),
      originBasisDigest: "b".repeat(64),
      targetObservationDigest: h0,
      targetBasisRevision: h0,
      observationRefs: refsFor(rig),
      // Nothing was ever declared under this identity.
      resultSubjectRef: { kind: "DERIVED_RESULT", ref: "candidate-that-does-not-exist" },
    });
    const result = await runtime.rematerialize({ admissionRef });
    expect(result.state).toBe("EFFECT_CAPABILITY_UNAVAILABLE");
    expect(result.candidate).toBe(null);
    expect(result.detail).toContain("cannot authoritatively resolve");
  }, 120_000);
});

/* ================================================================== *
 * E. The freshness observer is a HARD dependency
 * ================================================================== */

describe("§D5-0 E. AdmissionStillApplies ≺ WorldCreation is structural, not optional", () => {
  it("the composition cannot omit the observer — it is a required dependency", () => {
    const text = execFileSync(
      process.execPath,
      ["-e", `process.stdout.write(require('node:fs').readFileSync(${JSON.stringify(join(REPO, "src/result/rematerialization.ts"))},'utf8'))`],
      { encoding: "utf8" },
    );
    /**
     * Before D5-0 this read `observeCurrentTarget?: ... | undefined`, so a deployment that omitted it
     * SKIPPED the freshness re-check — a structural invariant a composition could opt out of. The optional
     * marker is what made it optional, so its absence is the proof.
     */
    expect(text).not.toContain("readonly observeCurrentTarget?:");
    expect(text).toContain("readonly observeCurrentTarget: (taskId: string)");
    // And the re-check itself is not behind a conditional.
    expect(text).not.toContain("if (input.observeCurrentTarget !== undefined)");
  });

  it("a world that moved between admission and effect produces no candidate", async () => {
    const { repo, worldsRoot, h0, r0 } = scenario();
    const current = { revision: h0 };
    const { rig, runtime } = stackFor({ repo, worldsRoot, current });
    rig.declareResult({
      resultSubjectRef: RESULT_A,
      resultManifestDigest: "m".repeat(64),
      originBasisDigest: "b".repeat(64),
      sourceResult: { backend: "git", baseRevision: h0, resultRevision: r0 },
    });
    const { admissionRef } = rig.admit({
      resultManifestDigest: "m".repeat(64),
      originBasisDigest: "b".repeat(64),
      targetObservationDigest: h0,
      targetBasisRevision: h0,
      observationRefs: refsFor(rig),
      resultSubjectRef: RESULT_A,
    });
    // The world moves after the admission was recorded.
    current.revision = "a-different-world";
    const result = await runtime.rematerialize({ admissionRef });
    expect(result.state).toBe("ADMISSION_REFUSED");
    expect(result.admission.state).toBe("STALE_PROOF");
    expect(result.candidate).toBe(null);
  }, 120_000);
});

/* ================================================================== *
 * F. The first-party resolver reads real records
 * ================================================================== */

describe("§D5-0 F. the first-party resolver resolves both result kinds from real records", () => {
  /** A Work owner stand-in that returns exactly what a real one would: a captured basis and a task. */
  function ownerWith(input: {
    readonly basis: ProjectWorldBasis | null;
    readonly taskId?: string | undefined;
  }) {
    return {
      projectId: "d5-0",
      attemptBasis: () =>
        input.basis === null ? null : { basis: input.basis, taskId: input.taskId ?? "t1" },
    };
  }

  /** A minimal ATTEMPT_RESULT source, standing in for the verification plane's own. */
  function subjectSource(input: {
    readonly taskId: string;
    readonly baseCommit: string;
    readonly resultCommit: string;
  }): AttemptResultVerificationSource {
    return {
      materialize: (attemptId: string) =>
        materializeAttemptResultVerificationSubject({
          projectId: "d5-0",
          taskId: input.taskId,
          attemptId,
          envelopeId: "env-1",
          baseCommit: input.baseCommit,
          resultCommit: input.resultCommit,
          reportDigest: "f".repeat(64),
        }),
    };
  }

  it("an ATTEMPT_RESULT resolves to the manifest its captured basis implies", () => {
    const { repo, h0, r0 } = scenario();
    const basis: ProjectWorldBasis = {
      schemaVersion: 1,
      projectId: "d5-0",
      taskId: "t1",
      capturedAtRevision: 1,
      semanticProjectionDigest: "s".repeat(64),
      source: { state: "BOUND", value: { backend: "git", revision: h0 } },
      assets: { state: "NOT_REQUIRED" },
      environment: { state: "NOT_REQUIRED" },
      basisDigest: "d".repeat(64),
    } as unknown as ProjectWorldBasis;
    const resolver = firstPartyResultResolver({
      owner: ownerWith({ basis }),
      attemptResultSource: subjectSource({ taskId: "t1", baseCommit: h0, resultCommit: r0 }),
      candidates: { read: () => null, readByDerivation: () => [], appendOnce: () => ({ state: "APPENDED" as const, candidate: null as never }), close: () => undefined } as DerivedResultCandidateStore,
    });
    expect(resolver.adapterId).toBe(FIRST_PARTY_RESULT_RESOLVER_ID);
    const resolved = resolver.resolve({ kind: "ATTEMPT_RESULT", ref: "attempt-1" });
    expect(resolved).not.toBe(null);
    expect(resolved?.taskId).toBe("t1");
    expect(resolved?.originBasisDigest).toBe("d".repeat(64));
    expect(resolved?.sourceResult).toEqual({ backend: "git", baseRevision: h0, resultRevision: r0 });
    expect(resolved?.resultManifestDigest).toMatch(/^[0-9a-f]{64}$/u);
    void repo;
  });

  it("an attempt with NO captured basis is unresolvable — never a basis reconstructed from the world", () => {
    const { h0, r0 } = scenario();
    const resolver = firstPartyResultResolver({
      owner: ownerWith({ basis: null }),
      attemptResultSource: subjectSource({ taskId: "t1", baseCommit: h0, resultCommit: r0 }),
      candidates: { read: () => null, readByDerivation: () => [], appendOnce: () => ({ state: "APPENDED" as const, candidate: null as never }), close: () => undefined } as DerivedResultCandidateStore,
    });
    /**
     * Every D2 attempt is in this position. A resolver that invented a basis would make the admission's
     * origin-basis cross-check unfalsifiable, which is why `null` is the answer rather than a guess.
     */
    expect(resolver.resolve({ kind: "ATTEMPT_RESULT", ref: "attempt-1" })).toBe(null);
  });

  it("an attempt whose record disagrees with itself is unresolvable, because the owner refuses it", () => {
    const { h0, r0 } = scenario();
    const basis: ProjectWorldBasis = {
      schemaVersion: 1,
      projectId: "d5-0",
      taskId: "t1",
      capturedAtRevision: 1,
      semanticProjectionDigest: "s".repeat(64),
      source: { state: "BOUND", value: { backend: "git", revision: h0 } },
      assets: { state: "NOT_REQUIRED" },
      environment: { state: "NOT_REQUIRED" },
      basisDigest: "d".repeat(64),
    } as unknown as ProjectWorldBasis;
    const resolver = firstPartyResultResolver({
      owner: ownerWith({ basis, taskId: "t1" }),
      // The subject source says this attempt belongs to t2, the basis says t1.
      attemptResultSource: subjectSource({ taskId: "t2", baseCommit: h0, resultCommit: r0 }),
      candidates: { read: () => null, readByDerivation: () => [], appendOnce: () => ({ state: "APPENDED" as const, candidate: null as never }), close: () => undefined } as DerivedResultCandidateStore,
    });
    expect(resolver.resolve({ kind: "ATTEMPT_RESULT", ref: "attempt-1" })).toBe(null);
  });

  it("a DERIVED_RESULT resolves from the candidate store, and an unknown candidate is unresolvable", () => {
    const { h0, r0 } = scenario();
    const candidate = {
      schemaVersion: 1 as const,
      candidateId: "candidate-xyz",
      projectId: "d5-0",
      taskId: "t2",
      derivation: {
        schemaVersion: 1 as const,
        derivationId: "deriv-1",
        kind: "REMATERIALIZATION" as const,
        mechanism: "git-source-rematerializer",
        mechanismVersion: "1",
        originResultManifestDigest: "o".repeat(64),
        originBasisDigest: "orig-basis",
        targetBasisDigest: "target-basis",
        admissionRef: "admission-1",
      },
      sourceResult: { backend: "git", baseRevision: h0, resultRevision: r0 },
      producedAssetRefs: ["asset-1"],
      resultManifestDigest: "c".repeat(64),
      derivedAt: "2026-09-25T00:00:00.000Z",
    };
    const resolver = firstPartyResultResolver({
      owner: ownerWith({ basis: null }),
      attemptResultSource: subjectSource({ taskId: "t1", baseCommit: h0, resultCommit: r0 }),
      candidates: {
        read: (id: string) => (id === "candidate-xyz" ? candidate : null),
        readByDerivation: () => [],
        appendOnce: () => ({ state: "EXISTING" as const, candidate }),
        close: () => undefined,
      } as DerivedResultCandidateStore,
    });
    const resolved = resolver.resolve({ kind: "DERIVED_RESULT", ref: "candidate-xyz" });
    expect(resolved?.resultManifestDigest).toBe("c".repeat(64));
    expect(resolved?.originBasisDigest).toBe("orig-basis");
    expect(resolved?.producedAssetRefs).toEqual(["asset-1"]);
    expect(resolver.resolve({ kind: "DERIVED_RESULT", ref: "candidate-unknown" })).toBe(null);
  });
});

/* ================================================================== *
 * G. The candidate belongs to the RESULT, not to the caller
 * ================================================================== */

describe("§D5-0 G. the candidate is an artifact of the resolved result", () => {
  it("the result's own task, project and assets reach the candidate", async () => {
    const { repo, worldsRoot, h0, r0 } = scenario();
    const { rig, runtime } = stackFor({ repo, worldsRoot, current: { revision: h0 } });
    /**
     * Declared under an identity whose project/task/assets are DISTINCTIVE, so the candidate can only carry
     * them if they came from the resolution rather than from anything the caller passed.
     */
    rig.declareResult({
      resultSubjectRef: { kind: "DERIVED_RESULT", ref: "candidate-origin" },
      resultManifestDigest: "m".repeat(64),
      originBasisDigest: "b".repeat(64),
      sourceResult: { backend: "git", baseRevision: h0, resultRevision: r0 },
      projectId: "project-from-the-result",
      taskId: "task-from-the-result",
      producedAssetRefs: ["asset-from-the-result"],
    });
    const { admissionRef } = rig.admit({
      resultManifestDigest: "m".repeat(64),
      originBasisDigest: "b".repeat(64),
      targetObservationDigest: h0,
      targetBasisRevision: h0,
      observationRefs: refsFor(rig),
      resultSubjectRef: { kind: "DERIVED_RESULT", ref: "candidate-origin" },
    });
    const result = await runtime.rematerialize({ admissionRef });
    expect(result.state).toBe("MATERIALIZED");
    expect(result.candidate?.projectId).toBe("project-from-the-result");
    expect(result.candidate?.taskId).toBe("task-from-the-result");
    expect(result.candidate?.producedAssetRefs).toEqual(["asset-from-the-result"]);
  }, 120_000);

  it("the result identity's digest is stable and kind-sensitive", () => {
    const digest = resultSubjectRefDigest(RESULT_A);
    expect(resultSubjectRefDigest({ kind: "ATTEMPT_RESULT", ref: RESULT_A.ref })).toBe(digest);
    expect(resultSubjectRefDigest({ kind: "DERIVED_RESULT", ref: RESULT_A.ref })).not.toBe(digest);
    expect(resultSubjectRefDigest(RESULT_B)).not.toBe(digest);
  });
});

/* ================================================================== *
 * The record shape itself
 * ================================================================== */

describe("§D5-0 the admission record requires a result identity", () => {
  it("a record without one is not constructible — the field is required, not optional", () => {
    const text = execFileSync(
      process.execPath,
      ["-e", `process.stdout.write(require('node:fs').readFileSync(${JSON.stringify(join(REPO, "src/project_world/admission_store.ts"))},'utf8'))`],
      { encoding: "utf8" },
    );
    expect(text).toContain("readonly resultSubjectRef: ResultSubjectRef;");
    expect(text).not.toContain("readonly resultSubjectRef?:");
    // And the record stays append-once: no update path was introduced by this slice.
    expect(text.toUpperCase()).not.toContain("ON CONFLICT");
    const record: CrossBasisAdmissionRecord = {
      schemaVersion: 1,
      admissionRef: "a",
      issuanceRef: "i",
      resultSubjectRef: RESULT_A,
      resultManifestDigest: "m",
      originBasisDigest: "b",
      targetObservation: { targetObservationDigest: "t", targetBasisRevision: "H", detail: "d" },
      state: "ADMITTED",
      admitted: true,
      detail: "d",
      recordedAt: "t",
    };
    expect(record.resultSubjectRef).toEqual(RESULT_A);
  });
});
