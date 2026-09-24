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
  makeCompatibilityIssuer,
  makeRematerializationRuntime,
  materializePremiseSet,
  observedPremise,
  unavailablePremise,
  type PremiseSet,
  type RematerializationRuntime,
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

/** An observation helper: a premise whose mechanism the test stands behind. */
const observed = (selectors: readonly ReturnType<typeof srcPath>[]) =>
  observedPremise({
    provenance: {
      observerId: "test-observer",
      observerVersion: "1",
      mechanism: "CONSERVATIVE_DOMAIN",
      scope: { domain: "source", scopeRef: "repo", from: "H0", to: "H1" },
    },
    selectors,
  });

/**
 * A premise set whose source change is `src/b.ts` — provably disjoint from everything R0 touched.
 *
 * R0 modified `src/a.ts`, so it both read and wrote that file. The world's move in `src/b.ts` therefore
 * overlaps neither side, which is what makes this the positive case.
 */
function disjointPremises(): PremiseSet {
  return materializePremiseSet({
    projectSemantic: observed([]),
    source: observed([srcPath("src/b.ts")]),
    assets: observed([]),
    environment: observed([]),
    resultReads: observed([srcPath("src/a.ts")]),
    resultWrites: observed([srcPath("src/a.ts")]),
  });
}

function issueFor(input: {
  readonly issuer: ReturnType<typeof makeCompatibilityIssuer>;
  readonly targetDigest: string;
  readonly premises: PremiseSet;
  readonly exactlyCurrent?: boolean | undefined;
}) {
  return input.issuer.issue({
    resultManifestDigest: "manifest-R0",
    originBasisDigest: "basis-B0",
    targetObservationDigest: input.targetDigest,
    exactlyCurrent: input.exactlyCurrent ?? false,
    premises: input.premises,
  });
}

function runtimeFor(input: {
  readonly repo: string;
  readonly worldsRoot: string;
  readonly rematerializer?: ResultRematerializerPort | undefined;
}): { issuer: ReturnType<typeof makeCompatibilityIssuer>; runtime: RematerializationRuntime } {
  const issuer = makeCompatibilityIssuer({ issuerId: "palimpsest-first-party" });
  const runtime = makeRematerializationRuntime({
    issuer,
    rematerializer: input.rematerializer ?? gitSourceRematerializer({ repository: input.repo, worldsRoot: input.worldsRoot }),
    clock: () => "2026-09-24T00:00:00.000Z",
  });
  return { issuer, runtime };
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
    const { issuer, runtime } = runtimeFor({ repo, worldsRoot });
    const before = canonicalFingerprint(repo);

    const certificate = issueFor({ issuer, targetDigest: h1, premises: disjointPremises() });
    expect(certificate.assessment.outcome).toBe("COMPATIBLE");

    const result = await runtime.rematerialize({
      presented: certificate,
      resultManifestDigest: "manifest-R0",
      originBasisDigest: "basis-B0",
      originSource: { backend: "git", fromRevision: h0, toRevision: r0 },
      targetBasisDigest: h1,
      targetBasisRevision: h1,
      projectId: "d3d",
      taskId: "t1",
      hasBasis: true,
    });
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

    // The candidate really carries BOTH: the target's state and the origin's admitted delta.
    const worldPath = `${worldsRoot}/${candidate.derivation.derivationId}`;
    expect(readFileSync(join(worldPath, "src", "a.ts"), "utf8")).toContain("export const a = 2");
    expect(readFileSync(join(worldPath, "src", "b.ts"), "utf8")).toContain("export const b = 2");
    // …and it is based on the target, not on the origin.
    expect(git(worldPath, ["rev-parse", `${candidate.sourceResult!.resultRevision}^`])).toBe(h1);
  }, 120_000);

  it("the origin result and its basis are untouched by the derivation", async () => {
    const { repo, worldsRoot, h0, r0, h1 } = scenario();
    const { issuer, runtime } = runtimeFor({ repo, worldsRoot });
    const certificate = issueFor({ issuer, targetDigest: h1, premises: disjointPremises() });

    const before = { h0: git(repo, ["rev-parse", h0]), r0: git(repo, ["rev-parse", r0]) };
    await runtime.rematerialize({
      presented: certificate,
      resultManifestDigest: "manifest-R0",
      originBasisDigest: "basis-B0",
      originSource: { backend: "git", fromRevision: h0, toRevision: r0 },
      targetBasisDigest: h1,
      targetBasisRevision: h1,
      projectId: "d3d",
      taskId: "t1",
      hasBasis: true,
    });
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
    const { issuer, runtime } = runtimeFor({ repo, worldsRoot });
    const before = canonicalFingerprint(repo);
    const worldsBefore = existsSync(worldsRoot) ? execFileSync(process.execPath, ["-e", `process.stdout.write(String(require('node:fs').readdirSync(${JSON.stringify(worldsRoot)}).length))`], { encoding: "utf8" }) : "0";

    // Issued against H1, presented against H2.
    const certificate = issueFor({ issuer, targetDigest: h1, premises: disjointPremises() });
    const result = await runtime.rematerialize({
      presented: certificate,
      resultManifestDigest: "manifest-R0",
      originBasisDigest: "basis-B0",
      originSource: { backend: "git", fromRevision: h0, toRevision: r0 },
      targetBasisDigest: "H2-moved-on",
      targetBasisRevision: "H2-moved-on",
      projectId: "d3d",
      taskId: "t1",
      hasBasis: true,
    });
    expect(result.state).toBe("ADMISSION_REFUSED");
    expect(result.candidate).toBe(null);
    // `AdmissionStillApplies ≺ WorldCreation`: no world, no candidate, no canonical mutation.
    expect(canonicalFingerprint(repo)).toEqual(before);
    const worldsAfter = existsSync(worldsRoot) ? execFileSync(process.execPath, ["-e", `process.stdout.write(String(require('node:fs').readdirSync(${JSON.stringify(worldsRoot)}).length))`], { encoding: "utf8" }) : "0";
    expect(worldsAfter).toBe(worldsBefore);
  }, 120_000);

  it("an UNISSUED certificate attempts no effect", async () => {
    const { repo, worldsRoot, h0, r0, h1 } = scenario();
    const { runtime } = runtimeFor({ repo, worldsRoot });
    const before = canonicalFingerprint(repo);
    const result = await runtime.rematerialize({
      presented: {
        schemaVersion: 1,
        issuerId: "palimpsest-first-party",
        assessment: {
          schemaVersion: 1,
          policyVersion: "v",
          resultManifestDigest: "manifest-R0",
          originBasisDigest: "basis-B0",
          targetObservationDigest: h1,
          changeFootprintDigest: "x",
          outcome: "COMPATIBLE",
          disjointnessProofs: [],
          conflicts: [],
          unknowns: [],
          detail: "trust me",
          assessmentDigest: "y",
        },
        premiseRefs: { projectSemantic: null, source: null, assets: null, environment: null, resultReads: null, resultWrites: null },
        premiseSetDigest: "g",
        issuanceDigest: "h",
      },
      resultManifestDigest: "manifest-R0",
      originBasisDigest: "basis-B0",
      originSource: { backend: "git", fromRevision: h0, toRevision: r0 },
      targetBasisDigest: h1,
      targetBasisRevision: h1,
      projectId: "d3d",
      taskId: "t1",
      hasBasis: true,
    });
    expect(result.state).toBe("ADMISSION_REFUSED");
    expect(result.detail).toContain("no rematerialization was attempted");
    expect(canonicalFingerprint(repo)).toEqual(before);
  }, 120_000);

  it("an INCOMPATIBLE certificate cannot authorize an effect", async () => {
    const { repo, worldsRoot, h0, r0, h1 } = scenario();
    const { issuer, runtime } = runtimeFor({ repo, worldsRoot });
    // The change overlaps what the result WROTE, so the proof is a positive conflict.
    const conflicting = materializePremiseSet({
      projectSemantic: observed([]),
      source: observed([srcPath("src/a.ts")]),
      assets: observed([]),
      environment: observed([]),
      resultReads: observed([]),
      resultWrites: observed([srcPath("src/a.ts")]),
    });
    const certificate = issueFor({ issuer, targetDigest: h1, premises: conflicting });
    expect(certificate.assessment.outcome).toBe("INCOMPATIBLE");

    const result = await runtime.rematerialize({
      presented: certificate,
      resultManifestDigest: "manifest-R0",
      originBasisDigest: "basis-B0",
      originSource: { backend: "git", fromRevision: h0, toRevision: r0 },
      targetBasisDigest: h1,
      targetBasisRevision: h1,
      projectId: "d3d",
      taskId: "t1",
      hasBasis: true,
    });
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

    const { issuer, runtime } = runtimeFor({ repo, worldsRoot });
    const before = canonicalFingerprint(repo);
    const certificate = issueFor({ issuer, targetDigest: h2, premises: disjointPremises() });

    const result = await runtime.rematerialize({
      presented: certificate,
      resultManifestDigest: "manifest-R0",
      originBasisDigest: "basis-B0",
      originSource: { backend: "git", fromRevision: h0, toRevision: r0 },
      targetBasisDigest: h2,
      targetBasisRevision: h2,
      projectId: "d3d",
      taskId: "t1",
      hasBasis: true,
    });
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
    const { issuer, runtime } = runtimeFor({ repo, worldsRoot, rematerializer: failing });
    const before = canonicalFingerprint(repo);
    const certificate = issueFor({ issuer, targetDigest: h1, premises: disjointPremises() });
    const result = await runtime.rematerialize({
      presented: certificate,
      resultManifestDigest: "manifest-R0",
      originBasisDigest: "basis-B0",
      originSource: { backend: "git", fromRevision: h0, toRevision: r0 },
      targetBasisDigest: h1,
      targetBasisRevision: h1,
      projectId: "d3d",
      taskId: "t1",
      hasBasis: true,
    });
    expect(result.state).toBe("REMATERIALIZATION_FAILED");
    expect(result.candidate).toBe(null);
    expect(canonicalFingerprint(repo)).toEqual(before);
  }, 120_000);

  it("a result with no source facet reports EFFECT_CAPABILITY_UNAVAILABLE rather than inventing a candidate", async () => {
    const { repo, worldsRoot, h1 } = scenario();
    const { issuer, runtime } = runtimeFor({ repo, worldsRoot });
    const certificate = issueFor({ issuer, targetDigest: h1, premises: disjointPremises() });
    const result = await runtime.rematerialize({
      presented: certificate,
      resultManifestDigest: "manifest-R0",
      originBasisDigest: "basis-B0",
      originSource: null,
      targetBasisDigest: h1,
      targetBasisRevision: h1,
      projectId: "d3d",
      taskId: "t1",
      hasBasis: true,
    });
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
    const { issuer, runtime } = runtimeFor({ repo, worldsRoot });
    const certificate = issueFor({ issuer, targetDigest: h1, premises: disjointPremises() });
    const run = () =>
      runtime.rematerialize({
        presented: certificate,
        resultManifestDigest: "manifest-R0",
        originBasisDigest: "basis-B0",
        originSource: { backend: "git", fromRevision: h0, toRevision: r0 },
        targetBasisDigest: h1,
        targetBasisRevision: h1,
        projectId: "d3d",
        taskId: "t1",
        hasBasis: true,
      });
    const first = await run();
    const second = await run();
    expect(first.state).toBe("MATERIALIZED");
    expect(second.state).toBe("MATERIALIZED");
    // Same operation → same derivation identity, so a retry addresses the SAME world rather than
    // accumulating new ones. The OUTPUT revision is deliberately not asserted equal: D2-d already
    // measured that two runs producing byte-identical commits is legitimate, and requiring a stable hash
    // would be asserting git's deduplication rather than this product's promise.
    expect(second.candidate?.derivation.derivationId).toBe(first.candidate?.derivation.derivationId);
    expect(existsSync(`${worldsRoot}/${first.candidate!.derivation.derivationId}`)).toBe(true);
  }, 180_000);

  it("a different target basis is a different derivation", async () => {
    const { repo, worldsRoot, h0, r0, h1 } = scenario();
    const { issuer, runtime } = runtimeFor({ repo, worldsRoot });
    const certificate = issueFor({ issuer, targetDigest: h1, premises: disjointPremises() });
    const atH1 = await runtime.rematerialize({
      presented: certificate,
      resultManifestDigest: "manifest-R0",
      originBasisDigest: "basis-B0",
      originSource: { backend: "git", fromRevision: h0, toRevision: r0 },
      targetBasisDigest: h1,
      targetBasisRevision: h1,
      projectId: "d3d",
      taskId: "t1",
      hasBasis: true,
    });
    // A second certificate against a DIFFERENT target is a different operation.
    const other = issuer.issue({
      resultManifestDigest: "manifest-R0",
      originBasisDigest: "basis-B0",
      targetObservationDigest: h0,
      exactlyCurrent: false,
      premises: disjointPremises(),
    });
    const atH0 = await runtime.rematerialize({
      presented: other,
      resultManifestDigest: "manifest-R0",
      originBasisDigest: "basis-B0",
      originSource: { backend: "git", fromRevision: h0, toRevision: r0 },
      targetBasisDigest: h0,
      targetBasisRevision: h0,
      projectId: "d3d",
      taskId: "t1",
      hasBasis: true,
    });
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
      "src/project_world/derivation.ts",
      "src/project_world/rematerialization.ts",
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
