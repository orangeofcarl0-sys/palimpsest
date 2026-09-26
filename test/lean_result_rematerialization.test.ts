/**
 * PLMP-LEAN-1 §D3-d — CANDIDATE-SPACE MATERIALIZATION: the first effect, and the boundary that keeps it
 * from becoming canonical mutation.
 *
 *     D3-d Effect  ≠  Canonical Effect
 *
 * The whole slice turns on one invariant, and every test here is a way of attacking it:
 *
 *     Δ CandidateState ≠ 0   ∧   Δ CanonicalProjectState = 0
 *
 * Plus the four acceptance equations the review fixed:
 *
 *     CrossBasisAdmission ⇒ permission to ATTEMPT rematerialization (not to mutate canonical state)
 *     Rematerialization(R_0, B_1) ⇒ NewCandidate(R_1, B_1)
 *     Verification(R_0) ⇏ Verification(R_1)
 *     a failed rematerialization rewrites NOTHING
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, describe, expect, it } from "vitest";

import {
  GIT_SOURCE_REMATERIALIZER_ID,
  gitSourceRematerializer,
} from "../src/deployment/source_rematerializer.js";
import {
  type RematerializationRuntime,
  type ResultRematerializerPort,
} from "../src/project_world/index.js";
import { makeD3Rig, type D3Rig } from "./d3_rig.js";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");

const cleanups: Array<() => void> = [];
afterAll(() => {
  for (const fn of cleanups) fn();
});

const git = (cwd: string, args: readonly string[]): string =>
  execFileSync("git", [...args], { cwd, encoding: "utf8" }).trim();

const srcPath = (path: string) => ({ domain: "source", scope: "path", path }) as const;

/**
 * A repository with the shape the scenario needs:
 *
 *   H0 → R0 changes src/a.ts          (the origin result)
 *   H0 → H1 changes src/b.ts          (a provably disjoint world move)
 */
function scenario(): { repo: string; worldsRoot: string; h0: string; r0: string; h1: string } {
  const root = mkdtempSync(join(tmpdir(), "palimpsest-d3d-"));
  const repo = join(root, "repo");
  const worldsRoot = join(root, "worlds");
  mkdirSync(join(repo, "src"), { recursive: true });
  writeFileSync(join(repo, "src", "a.ts"), "export const a = 1;\n");
  writeFileSync(join(repo, "src", "b.ts"), "export const b = 1;\n");
  execFileSync("git", ["init", "-q"], { cwd: repo });
  execFileSync("git", ["add", "-A"], { cwd: repo });
  execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "H0"], { cwd: repo });
  const h0 = git(repo, ["rev-parse", "HEAD"]);

  // The origin result, produced on a branch so canonical HEAD stays at H0.
  execFileSync("git", ["checkout", "-q", "-b", "result", h0], { cwd: repo });
  writeFileSync(join(repo, "src", "a.ts"), "export const a = 2;\n");
  execFileSync("git", ["add", "-A"], { cwd: repo });
  execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "R0"], { cwd: repo });
  const r0 = git(repo, ["rev-parse", "HEAD"]);

  // The world then moves on canonical main, in a different file.
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
  return { repo, worldsRoot, h0, r0, h1 };
}

/**
 * The premise refs for the disjoint case, recorded through a REGISTERED observer.
 *
 * §D3-R1: there is no longer a way to hand the issuer a premise object — a test must go through a recorder
 * exactly as a deployment does, which is what makes "a caller cannot mint an authority-bearing premise" a
 * property of the API rather than of a comment.
 */
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

/** The result identity every scenario in this file admits: one ATTEMPT_RESULT, fixed by name. */
const RESULT_REF = Object.freeze({ kind: "ATTEMPT_RESULT" as const, ref: "attempt-R0" });

/**
 * Issue a certificate AND record the admission decision — the two durable records the effect consumes.
 *
 * §D3-R2: the effect takes only the admission ref, so a test that wants an effect must first record a
 * decision. That is the shipped shape, not ceremony.
 *
 * §D5-0: the admission also names WHICH result it is about, and the result is DECLARED to the resolver with
 * the delta it carries. The effect reads the delta from there rather than from its caller, so a test must
 * state what the result IS — which is exactly the property under test.
 */
function admitFor(input: {
  readonly rig: D3Rig;
  readonly targetDigest: string;
  readonly targetRevision: string;
  /** §D5-0: the delta the RESULT carries — read by the effect from the resolver, not from a caller. */
  readonly originSource: { readonly backend: string; readonly baseRevision: string; readonly resultRevision: string } | null;
  readonly exactlyCurrent?: boolean | undefined;
  readonly refs?: ReturnType<typeof disjointRefs> | undefined;
  readonly resultManifestDigest?: string | undefined;
  readonly originBasisDigest?: string | undefined;
}) {
  const resultManifestDigest = input.resultManifestDigest ?? "manifest-R0";
  const originBasisDigest = input.originBasisDigest ?? "basis-B0";
  input.rig.declareResult({
    resultSubjectRef: RESULT_REF,
    resultManifestDigest,
    originBasisDigest,
    sourceResult: input.originSource,
    projectId: "d3d",
    taskId: "t1",
  });
  return input.rig.admit({
    resultManifestDigest,
    originBasisDigest,
    targetObservationDigest: input.targetDigest,
    targetBasisRevision: input.targetRevision,
    observationRefs: input.refs ?? disjointRefs(input.rig),
    resultSubjectRef: RESULT_REF,
    ...(input.exactlyCurrent === undefined ? {} : { exactlyCurrent: input.exactlyCurrent }),
  });
}

/** The origin source facet of this file's scenario: the result H0 → R0. */
const originOf = (h0: string, r0: string) => ({ backend: "git", baseRevision: h0, resultRevision: r0 });

function runtimeFor(input: {
  readonly repo: string;
  readonly worldsRoot: string;
  readonly rematerializer?: ResultRematerializerPort | undefined;
}): { rig: D3Rig; runtime: RematerializationRuntime; issuer: D3Rig["issuer"]; atWorld: (revision: string) => void } {
  /**
   * The rig's notion of "the current world", which the effect RE-OBSERVES before creating one. A test sets
   * `current` to whatever world it is simulating; the default is the repository's HEAD, which is what a
   * deployment would read.
   */
  const current: { revision: string } = { revision: git(input.repo, ["rev-parse", "HEAD"]) };
  const rig = makeD3Rig({
    rematerializer: input.rematerializer ?? gitSourceRematerializer({ repository: input.repo, worldsRoot: input.worldsRoot }),
    observeCurrentTarget: () => ({ targetObservationDigest: current.revision, targetBasisRevision: current.revision }),
  });
  cleanups.push(() => rig.close());
  if (rig.runtime === undefined) throw new Error("the rig composed no rematerialization runtime");
  /** Point the rig at a world. The admission and the re-observation must agree for an effect to happen. */
  const atWorld = (revision: string): void => {
    current.revision = revision;
  };
  return { rig, runtime: rig.runtime, issuer: rig.issuer, atWorld };
}

/** The canonical fingerprint the effect must never move. */
function canonicalFingerprint(repo: string) {
  return {
    head: git(repo, ["rev-parse", "HEAD"]),
    tree: git(repo, ["status", "--porcelain"]),
    refs: git(repo, ["for-each-ref", "--format=%(refname) %(objectname)"]),
    branch: git(repo, ["rev-parse", "--abbrev-ref", "HEAD"]),
  };
}

/* ================================================================== *
 * HEADLINE: the effect produces a candidate and moves NO canonical state
 * ================================================================== */

describe("§D3-d HEADLINE: ΔCandidateState ≠ 0 ∧ ΔCanonicalProjectState = 0", () => {
  it("a clean rematerialization produces a candidate based at the target, with canonical source untouched", async () => {
    const { repo, worldsRoot, h0, r0, h1 } = scenario();
    const { rig, runtime, atWorld } = runtimeFor({ repo, worldsRoot });
    const before = canonicalFingerprint(repo);

    const { admissionRef, certificate } = admitFor({ rig, targetDigest: h1, targetRevision: h1, originSource: originOf(h0, r0) });
    atWorld(h1);
    expect(certificate.assessment.outcome).toBe("COMPATIBLE");
    // The world the admission named is the world that exists.
    atWorld(h1);

    const result = await runtime.rematerialize({ admissionRef });
    expect(result.state).toBe("MATERIALIZED");
    const candidate = result.candidate;
    if (candidate === null) throw new Error("expected a candidate");

    // ΔCandidateState ≠ 0: a NEW result identity, based at the TARGET basis.
    expect(candidate.sourceResult?.baseRevision).toBe(h1);
    expect(candidate.sourceResult?.resultRevision).not.toBe(r0);
    expect(candidate.derivation.kind).toBe("REMATERIALIZATION");
    expect(candidate.derivation.mechanism).toBe(GIT_SOURCE_REMATERIALIZER_ID);
    expect(candidate.resultManifestDigest).toMatch(/^[0-9a-f]{64}$/u);

    /**
     * ΔCanonicalProjectState = 0. This is the invariant the whole slice exists for: the effect created a
     * world, changed files and froze a revision, and canonical source did not move.
     */
    expect(canonicalFingerprint(repo)).toEqual(before);

    /**
     * The candidate carries BOTH the target's state and the origin's admitted delta, read from the EXPORTED
     * revision — the canonical object database, which is where a recorded result must be materializable
     * from. (The world itself is released after recording; the exported revision is what persists.)
     */
    expect(git(repo, ["show", `${candidate.sourceResult!.resultRevision}:src/a.ts`])).toContain("export const a = 2");
    expect(git(repo, ["show", `${candidate.sourceResult!.resultRevision}:src/b.ts`])).toContain("export const b = 2");
    // …and it is based on the target, not on the origin.
    expect(git(repo, ["rev-parse", `${candidate.sourceResult!.resultRevision}^`])).toBe(h1);
    // The world was released: its work lives in the exported revision, not in a directory.
    expect(existsSync(`${worldsRoot}/${candidate.derivation.derivationId}`)).toBe(false);
  }, 120_000);

  it("the origin result and its basis are untouched by the derivation", async () => {
    const { repo, worldsRoot, h0, r0, h1 } = scenario();
    const { rig, runtime, atWorld } = runtimeFor({ repo, worldsRoot });
    const { admissionRef, certificate } = admitFor({ rig, targetDigest: h1, targetRevision: h1, originSource: originOf(h0, r0) });
    atWorld(h1);

    const before = { h0: git(repo, ["rev-parse", h0]), r0: git(repo, ["rev-parse", r0]) };
    await runtime.rematerialize({ admissionRef });
    // Provenance immutability carried one stage further: a later stage's effect cannot rewrite an
    // earlier stage's facts. Both revisions still resolve to exactly what they were.
    expect(git(repo, ["rev-parse", h0])).toBe(before.h0);
    expect(git(repo, ["rev-parse", r0])).toBe(before.r0);
    // And the certificate is unchanged — the effect consumed it, it did not modify it.
    expect(certificate.assessment.outcome).toBe("COMPATIBLE");
  }, 120_000);
});

/* ================================================================== *
 * The trust boundary: the entry point takes an admission identity
 * ================================================================== */

describe("§D3-d the effect is gated by the certificate, not by caller-assembled facts", () => {
  it("a STALE certificate attempts no effect at all", async () => {
    const { repo, worldsRoot, h0, r0, h1 } = scenario();
    const { rig, runtime, atWorld } = runtimeFor({ repo, worldsRoot });
    const h2moved = `${h1}-moved-on`;
    const before = canonicalFingerprint(repo);
    const worldsBefore = existsSync(worldsRoot) ? execFileSync(process.execPath, ["-e", `process.stdout.write(String(require('node:fs').readdirSync(${JSON.stringify(worldsRoot)}).length))`], { encoding: "utf8" }) : "0";

    /**
     * Admitted against H1, and the world then MOVES to H2 before the effect is requested.
     *
     * The refusal must come from the RE-OBSERVATION — the recorded admission and the current world
     * disagreeing — rather than from a caller honestly passing a mismatched pair, which is all the previous
     * shape could check. So the rig is deliberately left observing H2 while the record names H1.
     */
    const { admissionRef } = admitFor({ rig, targetDigest: h1, targetRevision: h1, originSource: originOf(h0, r0) });
    atWorld(h2moved);
    const result = await runtime.rematerialize({ admissionRef });
    expect(result.state).toBe("ADMISSION_REFUSED");
    expect(result.candidate).toBe(null);
    // `AdmissionStillApplies ≺ WorldCreation`: no world, no candidate, no canonical mutation.
    expect(canonicalFingerprint(repo)).toEqual(before);
    const worldsAfter = existsSync(worldsRoot) ? execFileSync(process.execPath, ["-e", `process.stdout.write(String(require('node:fs').readdirSync(${JSON.stringify(worldsRoot)}).length))`], { encoding: "utf8" }) : "0";
    expect(worldsAfter).toBe(worldsBefore);
    // And the refusal names the divergence, so a reader sees WHICH world was admitted and which exists.
    expect(result.admission.state).toBe("STALE_PROOF");
    expect(result.detail).toContain(h1.slice(0, 12));
  }, 120_000);

  it("an UNRECORDED admission attempts no effect", async () => {
    const { repo, worldsRoot, h0, r0 } = scenario();
    const { runtime } = runtimeFor({ repo, worldsRoot });
    const before = canonicalFingerprint(repo);
    /**
     * §D3-R2: the effect takes an admission REF and recalls the record itself. A ref this authority never
     * wrote authorizes nothing — which is now the SAME shape as an unissued certificate, because both are
     * "no record exists", rather than two separately-checked conditions.
     */
    const result = await runtime.rematerialize({ admissionRef: "admission-never-recorded" });
    expect(result.state).toBe("ADMISSION_REFUSED");
    expect(result.admission.state).toBe("UNTRUSTED_PROOF");
    expect(result.detail).toContain("is not a recorded decision");
    expect(canonicalFingerprint(repo)).toEqual(before);
  }, 120_000);

  it("an INCOMPATIBLE certificate cannot authorize an effect", async () => {
    const { repo, worldsRoot, h0, r0, h1 } = scenario();
    const { rig, runtime, atWorld } = runtimeFor({ repo, worldsRoot });
    // The change overlaps what the result WROTE, so the proof is a positive conflict.
    const conflicting = {
      projectSemantic: rig.observe(rig.conservativeObserver, []),
      source: rig.observe(rig.sourceObserver, [srcPath("src/a.ts")]),
      assets: rig.observe(rig.conservativeObserver, []),
      environment: rig.observe(rig.conservativeObserver, []),
      resultReads: rig.observe(rig.conservativeObserver, []),
      resultWrites: rig.observe(rig.conservativeObserver, [srcPath("src/a.ts")]),
    };
    const { admissionRef, certificate } = admitFor({ rig, targetDigest: h1, targetRevision: h1, originSource: originOf(h0, r0), refs: conflicting });
    expect(certificate.assessment.outcome).toBe("INCOMPATIBLE");

    const result = await runtime.rematerialize({ admissionRef });
    expect(result.state).toBe("ADMISSION_REFUSED");
    expect(result.admission.state).toBe("CONFLICT");
  }, 120_000);
});

/* ================================================================== *
 * The effect engine must not exceed the proof that authorized it
 * ================================================================== */

describe("§D3-d a failed rematerialization fails closed, and rewrites nothing", () => {
  it("a delta that cannot be applied cleanly produces NO candidate — and does not merge", async () => {
    const { repo, worldsRoot, h0, r0, h1 } = scenario();
    // Make the target conflict with the origin delta by changing the SAME line.
    writeFileSync(join(repo, "src", "a.ts"), "export const a = 99;\n");
    execFileSync("git", ["add", "-A"], { cwd: repo });
    execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "H2 conflicts"], { cwd: repo });
    const h2 = git(repo, ["rev-parse", "HEAD"]);

    const { rig, runtime, atWorld } = runtimeFor({ repo, worldsRoot });
    const before = canonicalFingerprint(repo);
    const { admissionRef, certificate } = admitFor({ rig, targetDigest: h2, targetRevision: h2, originSource: originOf(h0, r0) });
    atWorld(h2);

    const result = await runtime.rematerialize({ admissionRef });
    // The certificate is legitimate and the delta still does not apply. The answer is a FAILURE, never a
    // three-way merge, a rename heuristic or a partial application.
    expect(result.state).toBe("REMATERIALIZATION_FAILED");
    expect(result.candidate).toBe(null);
    // Nothing else changed: not canonical state, not the earlier-stage facts.
    expect(canonicalFingerprint(repo)).toEqual(before);
    expect(result.admission.admitted).toBe(true);
    expect(certificate.assessment.outcome).toBe("COMPATIBLE");
    // The world is retained for inspection rather than deleted — it may hold the only evidence of why.
    expect(result.detail).toContain("does not merge");
  }, 120_000);

  it("a WORLD_UNAVAILABLE backend also produces no candidate and no canonical change", async () => {
    const { repo, worldsRoot, h0, r0, h1 } = scenario();
    const failing: ResultRematerializerPort = {
      adapterId: "always-unavailable",
      mechanismVersion: "1",
      rematerialize: async () => ({ state: "WORLD_UNAVAILABLE", detail: "the world could not be produced" }),
      exportRevision: async () => ({ imported: true, detail: "unused" }),
      release: async () => undefined,
    };
    const { rig, runtime, atWorld } = runtimeFor({ repo, worldsRoot, rematerializer: failing });
    const before = canonicalFingerprint(repo);
    const { admissionRef } = admitFor({ rig, targetDigest: h1, targetRevision: h1, originSource: originOf(h0, r0) });
    atWorld(h1);
    const result = await runtime.rematerialize({ admissionRef });
    expect(result.state).toBe("REMATERIALIZATION_FAILED");
    expect(result.candidate).toBe(null);
    expect(canonicalFingerprint(repo)).toEqual(before);
  }, 120_000);

  it("a result with no source facet reports EFFECT_CAPABILITY_UNAVAILABLE rather than inventing a candidate", async () => {
    const { repo, worldsRoot, h1 } = scenario();
    const { rig, runtime, atWorld } = runtimeFor({ repo, worldsRoot });
    const { admissionRef } = admitFor({ rig, targetDigest: h1, targetRevision: h1, originSource: null });
    atWorld(h1);
    const result = await runtime.rematerialize({ admissionRef });
    expect(result.state).toBe("EFFECT_CAPABILITY_UNAVAILABLE");
    expect(result.candidate).toBe(null);
    expect(result.detail).toContain("no delta to carry");
  }, 120_000);
});

/* ================================================================== *
 * Operation identity
 * ================================================================== */

describe("§D3-d the derivation is identified by its operation, not by its output", () => {
  it("the same operation identity yields the same derivation id", async () => {
    const { repo, worldsRoot, h0, r0, h1 } = scenario();
    const { rig, runtime, atWorld } = runtimeFor({ repo, worldsRoot });
    const { admissionRef } = admitFor({ rig, targetDigest: h1, targetRevision: h1, originSource: originOf(h0, r0) });
    atWorld(h1);
    const run = () =>
      runtime.rematerialize({ admissionRef });
    const first = await run();
    const second = await run();
    expect(first.state).toBe("MATERIALIZED");
    expect(second.state).toBe("MATERIALIZED");
    // Same operation → same derivation identity, so a retry addresses the SAME world rather than
    // accumulating new ones. The OUTPUT revision is deliberately not asserted equal: D2-d already
    // measured that two runs producing byte-identical commits is legitimate, and requiring a stable hash
    // would be asserting git's deduplication rather than this product's promise.
    expect(second.candidate?.derivation.derivationId).toBe(first.candidate?.derivation.derivationId);
    /**
     * §D3-R4: the world is RELEASED once its result is recorded — an ExecutionWorld is a materialized view,
     * not an archive. So the convergence that matters is on the RECORD (which the store keeps) rather than
     * on the directory (which is collected).
     */
    expect(rig.candidates.readByDerivation(first.candidate!.derivation.derivationId)).toHaveLength(1);
  }, 180_000);

  it("a different target basis is a different derivation", async () => {
    const { repo, worldsRoot, h0, r0, h1 } = scenario();
    const { rig, runtime, atWorld } = runtimeFor({ repo, worldsRoot });
    const { admissionRef } = admitFor({ rig, targetDigest: h1, targetRevision: h1, originSource: originOf(h0, r0) });
    atWorld(h1);
    const atH1 = await runtime.rematerialize({ admissionRef });
    // A second ADMISSION against a DIFFERENT target is a different operation, so its ref differs too.
    const other = admitFor({ rig, targetDigest: h0, targetRevision: h0, originSource: originOf(h0, r0) });
    atWorld(h0);
    const atH0 = await runtime.rematerialize({ admissionRef: other.admissionRef });
    expect(atH1.candidate?.derivation.derivationId).not.toBe(atH0.candidate?.derivation.derivationId);
  }, 180_000);
});

/* ================================================================== *
 * The OUT list, as a machine check
 * ================================================================== */

describe("§D3-d scope: no canonical mutation, no merge, no promotion", () => {
  it("the derivation and rematerialization planes contain no canonical mutation and no merge strategy", () => {
    const read = (relative: string): string =>
      execFileSync(
        process.execPath,
        ["-e", `process.stdout.write(require('node:fs').readFileSync(${JSON.stringify(join(REPO, relative))},'utf8'))`],
        { encoding: "utf8" },
      ).replace(/\/\*[\s\S]*?\*\//gu, "");
    for (const file of [
      "src/result/derivation.ts",
      "src/result/rematerialization.ts",
      "src/deployment/source_rematerializer.ts",
    ]) {
      const text = read(file);
      for (const forbidden of [
        // No canonical mutation of any kind.
        "promoteAttempt",
        "assessPromotionEligibility",
        "ATTEMPT_STARTED",
        "ATTEMPT_COMPLETED",
        "ATTEMPT_FAILED",
        "recordCallback",
        "TASK_STARTED",
        // No merge strategy: the effect engine must not exceed the proof that authorized it.
        "cherry-pick",
        "cherryPick",
        "three-way",
        "threeWay",
        "mergeBase",
        "merge-base",
        "--3way",
        "rebase",
        "conflictResolution",
        "llmJudge",
        // No second verification system.
        "commandDerivedResultVerifier",
        "commandAttemptResultVerifier",
      ]) {
        expect(text, `${file} must not contain "${forbidden}"`).not.toContain(forbidden);
      }
    }
  });

  it("the git backend applies a diff and never cherry-picks", () => {
    // COMMENTS ARE STRIPPED: the module's own doc comment explains at length WHY that git operation is
    // not the semantic, so a raw text search would fail on the explanation rather than on a violation.
    const text = execFileSync(
      process.execPath,
      ["-e", `process.stdout.write(require('node:fs').readFileSync(${JSON.stringify(join(REPO, "src/deployment/source_rematerializer.ts"))},'utf8'))`],
      { encoding: "utf8" },
    ).replace(/\/\*[\s\S]*?\*\//gu, "");
    // The mechanism is `diff` + `apply`, stated positively: the semantic is the TREE DELTA, not the
    // commit object, so no git operation that carries commit-graph semantics appears.
    expect(text).toContain('"diff"');
    expect(text).toContain('"apply"');
    expect(text).not.toContain("--3way");
    // The word itself is checked without writing it literally here, so this assertion cannot be defeated
    // by its own comment.
    const forbiddenOperation = ["cherry", "pick"].join("-");
    expect(text).not.toContain(forbiddenOperation);
  });

  it("the rematerialization plane is not wired into promotion eligibility", () => {
    const core = execFileSync(
      process.execPath,
      ["-e", `process.stdout.write(require('node:fs').readFileSync(${JSON.stringify(join(REPO, "src/composition/core.ts"))},'utf8'))`],
      { encoding: "utf8" },
    );
    expect(core).not.toContain("rematerializ");
  });
});
