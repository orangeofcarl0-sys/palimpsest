/**
 * PLMP-LEAN-1 §D5-a — the CONTINUATION ASSESSMENT over the REAL D3 primitives.
 *
 * The unit file proves the assessment's own algebra. This one proves the thing the review asked for
 * explicitly, as a machine gate rather than as live evidence:
 *
 *     source observation unavailable  →  compatibility UNKNOWN
 *                                     →  rematerialization unavailable
 *                                     →  current-basis rework may still be admitted
 *
 * which is the operational form of
 *
 *     lack of proof blocks reuse, not future work
 *
 * It composes the SHIPPED pieces and adds no reasoning of its own:
 *
 *   D5-0 `AuthoritativeResultResolver`   what the result IS
 *   D3-a `AssessCurrentness`             does its basis still hold
 *   D3-b issuer                          prove non-interference, or do not claim it
 *   D5-a `assessContinuation`            which safe ways forward exist
 *
 * The point of running the REAL assessor rather than hand-feeding a verdict is that the UNKNOWN must be
 * D3-b's own conclusion. A test that wrote `compatibility: "UNKNOWN"` by hand would be asserting its own
 * input.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { gitSourceChangeObserver } from "../src/deployment/source_change_observer.js";
import {
  makeCompatibilityIssuer,
  makeObservationAuthority,
  REPOSITORY_SOURCE,
  sourceChangeFootprintFromPaths,
  type ResultSubjectRef,
} from "../src/project_world/index.js";
// SR-2 §十四: the assessment now belongs to the continuation layer, which consumes World
// conclusions rather than being part of the World kernel.
import { assessContinuation, type ContinuationAssessment } from "../src/continuation/assessment.js";

const cleanups: Array<() => void> = [];
afterAll(() => {
  for (const fn of cleanups) fn();
});

const git = (cwd: string, args: readonly string[]): string =>
  execFileSync("git", [...args], { cwd, encoding: "utf8" }).trim();

const RESULT: ResultSubjectRef = Object.freeze({ kind: "ATTEMPT_RESULT", ref: "attempt-r0" });

/** A repository where H0 → R0 changed src/a.ts, and canonical stays at H0 until a promotion moves it. */
function scenario(): { repo: string; h0: string; r0: string } {
  const root = mkdtempSync(join(tmpdir(), "palimpsest-d5a-"));
  const repo = join(root, "repo");
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
  execFileSync("git", ["checkout", "-q", "--detach", h0], { cwd: repo });
  cleanups.push(() => {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      // Windows keeps the directory busy while a git handle is open; the OS reaps it.
    }
  });
  return { repo, h0, r0 };
}

/**
 * Build a continuation assessment whose compatibility comes from the REAL issuer.
 *
 * `sourceChangeRef` is deliberately a parameter: passing a real observation yields a real verdict, and
 * passing `null` yields the shape a deployment has when it CANNOT observe the source change — which is the
 * UNKNOWN case this file exists for.
 */
function assessWith(input: {
  readonly repo: string;
  readonly h0: string;
  readonly r0: string;
  readonly observeSourceChange: boolean;
  /**
   * Whether this fixture stands in for a deployment that composes change observers for EVERY domain.
   *
   * The first-party deployment composes exactly ONE (`gitSourceChangeObserver`), so on the real chain the
   * other three change domains are UNPROVEN and `COMPATIBLE` is unreachable. Setting this to `true` models a
   * deployment with fuller evidence, which is what makes the previous claim a statement about OBSERVABILITY
   * rather than about the assessor being unable to conclude COMPATIBLE at all.
   */
  readonly observeEveryChangeDomain?: boolean | undefined;
  readonly currentTargetDigest: string | null;
  readonly capabilities?: { readonly rematerialization: boolean; readonly rework: boolean } | undefined;
}): ContinuationAssessment {
  const root = mkdtempSync(join(tmpdir(), "palimpsest-d5a-rig-"));
  cleanups.push(() => {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      // The OS reaps it.
    }
  });
  const observations = makeObservationAuthority({ databasePath: join(root, "obs.sqlite"), clock: () => "T" });
  const issuer = makeCompatibilityIssuer({
    issuerId: "palimpsest-first-party",
    observations,
    databasePath: join(root, "iss.sqlite"),
    clock: () => "T",
  });
  cleanups.push(() => {
    observations.close();
    issuer.close();
  });
  const sourceRecorder = observations.registerObserver({
    observerId: "git-source-change-observer",
    observerVersion: "1",
    mechanism: "RUNTIME_OBSERVED",
  });
  const conservative = observations.registerObserver({
    observerId: "world-materializer",
    observerVersion: "1",
    mechanism: "CONSERVATIVE_DOMAIN",
  });

  const scope = (from: string, to: string) => ({ domain: "source" as const, scopeRef: input.repo, from, to });

  /**
   * The CHANGE the result must survive. When the observer is unavailable this becomes an UNPROVEN empty set
   * — exactly what the first-party observer itself produces for an incomparable revision pair.
   */
  const sourceChangeRefReal = gitSourceChangeObserver({ repository: input.repo, recorder: sourceRecorder }).observeChange({
    fromRevision: input.h0,
    toRevision: input.h0,
    scopeRef: input.repo,
  });

  // The result's own write footprint, from the diff the product already takes: an execution fact.
  const writePaths = git(input.repo, ["diff", "--name-only", `${input.h0}..${input.r0}`])
    .split(String.fromCharCode(10))
    .filter((line) => line !== "");
  const writeRef = sourceRecorder.record({
    scope: scope(input.h0, input.r0),
    selectors: sourceChangeFootprintFromPaths({ paths: writePaths }).selectors,
  });
  // Its read footprint: the honest first-party answer is the whole repository.
  const readRef = conservative.record({ scope: scope(input.h0, input.h0), selectors: [REPOSITORY_SOURCE] });
  /**
   * A domain this deployment cannot observe is UNAVAILABLE — which is the FIRST-PARTY shape for every domain
   * but source. `observeEveryChangeDomain` stands in for a deployment that composes observers for all of
   * them, and its evidence is a proven-EMPTY observation: "I compared this domain and nothing moved."
   */
  const everyDomain = input.observeEveryChangeDomain === true;
  const empty = (domain: "project_semantic" | "assets" | "environment") =>
    everyDomain
      ? sourceRecorder.record({ scope: scope(input.h0, input.h0), selectors: [] })
      : conservative.unavailable({ domain, detail: `no first-party observer exists for the ${domain} change domain` });

  const sourceChangeRef = input.observeSourceChange
    ? sourceChangeRefReal
    : conservative.unavailable({
        domain: "source",
        detail: "the source revisions could not be compared, so neither a change nor its absence is established",
      });

  const certificate = issuer.issue({
    resultManifestDigest: "m".repeat(64),
    originBasisDigest: "b".repeat(64),
    targetObservationDigest: input.currentTargetDigest ?? "unobserved",
    exactlyCurrent: false,
    observationRefs: {
      projectSemantic: empty("project_semantic"),
      source: sourceChangeRef,
      assets: empty("assets"),
      environment: empty("environment"),
      resultReads: readRef,
      resultWrites: writeRef,
    },
  });

  return assessContinuation({
    resultSubjectRef: RESULT,
    originBasisDigest: "b".repeat(64),
    currentTargetDigest: input.currentTargetDigest,
    currentness: "STALE",
    // THE REAL ASSESSOR'S conclusion, not a hand-written verdict.
    compatibility: certificate.assessment.outcome,
    capabilities: input.capabilities ?? { rematerialization: true, rework: true },
  });
}

/* ================================================================== *
 * The gate the review named
 * ================================================================== */

describe("§D5-a the UNKNOWN gate: an unavailable observation blocks reuse but not rework", () => {
  it("source observation unavailable ⇒ UNKNOWN ⇒ no rematerialization, rework still available", () => {
    const { repo, h0, r0 } = scenario();
    const assessment = assessWith({
      repo,
      h0,
      r0,
      // The deployment cannot observe the source change at all.
      observeSourceChange: false,
      currentTargetDigest: "target-1",
    });

    // 1. D3-b's OWN conclusion is UNKNOWN — not a verdict this test supplied.
    expect(assessment.compatibility).toBe("UNKNOWN");
    expect(assessment.evidence.moreCouldHelp).toBe(true);
    expect(assessment.evidence.gaps.length).toBeGreaterThan(0);

    // 2. So reuse is not available, and the refusal says "unproven", not "refused".
    expect(assessment.reuse.exactCurrent).toBe(false);
    expect(assessment.reuse.rematerializationAvailable).toBe(false);
    expect(assessment.reuse.blocker).toContain("could not be completed");
    expect(assessment.reuse.blocker).not.toContain("conflict");

    // 3. AND THE WORK CONTINUES. This is the whole claim:
    expect(assessment.rework.available).toBe(true);
    expect(assessment.rework.blocker).toBe(null);
  });

  it("the SAME result with the source change actually observed still does NOT reach COMPATIBLE — and WHY", () => {
    /**
     * THE FINDING THIS FILE MEASURED, and it is a capability fact rather than a defect.
     *
     * My first version of this test asserted COMPATIBLE here. It is not reachable, and the reason is worth
     * stating precisely because it decides what D5 can claim:
     *
     *   the first-party deployment composes exactly ONE change observer — `gitSourceChangeObserver` — so the
     *   `project_semantic`, `assets` and `environment` CHANGE domains are UNPROVEN on every real run
     *
     * D3-b requires change coverage to be PROVEN_COMPLETE for every change domain, because a work may depend
     * on an undeclared facet: D3-0 deliberately resolves those facets to UNKNOWN rather than NOT_REQUIRED
     * ("nothing in a canonical envelope declares an asset dependency yet, so the deployment cannot claim the
     * work does not depend on them"). So an unobservable asset change CAN affect a source-only result, and
     * recording the obstacle is the SOUND answer rather than a gap in the implementation.
     *
     * This is the spec's own stated growth route, not a surprise:
     *
     *     better evidence ⇒ more compatibility
     *
     * and emphatically NOT `more optimistic heuristics ⇒ more compatibility`. So the honest summary is:
     *
     *     EXACT         reachable  (D3-a exact currentness)
     *     INCOMPATIBLE  reachable  (a proven source-side conflict)
     *     UNKNOWN       the common case, because 3 of 4 change domains have no observer
     *     COMPATIBLE    NOT reachable through the first-party composition today
     */
    const { repo, h0, r0 } = scenario();
    const assessment = assessWith({ repo, h0, r0, observeSourceChange: true, currentTargetDigest: "target-1" });
    expect(assessment.compatibility).toBe("UNKNOWN");
    // The obstacles are all `change_coverage` — i.e. unobservable CHANGE DOMAINS, not a source conflict.
    expect(assessment.evidence.gaps.some((gap) => gap.includes("incomplete"))).toBe(true);
    // Reuse is therefore not available, and rework still is.
    expect(assessment.reuse.rematerializationAvailable).toBe(false);
    expect(assessment.rework.available).toBe(true);
  });

  it("with ALL FOUR change domains observed, COMPATIBLE IS reachable and the carry path opens", () => {
    /**
     * The other half, so the previous test is a statement about OBSERVABILITY rather than about the
     * machinery being unable to produce COMPATIBLE at all. A deployment that composes change observers for
     * every domain reaches the positive proof — which is exactly the "better evidence" route, demonstrated
     * rather than asserted.
     */
    const { repo, h0, r0 } = scenario();
    const assessment = assessWith({
      repo,
      h0,
      r0,
      observeSourceChange: true,
      currentTargetDigest: "target-1",
      observeEveryChangeDomain: true,
    });
    expect(assessment.compatibility).toBe("COMPATIBLE");
    expect(assessment.reuse.rematerializationAvailable).toBe(true);
    expect(assessment.reuse.blocker).toBe(null);
    // Rework remains available too — the two paths are not substitutes.
    expect(assessment.rework.available).toBe(true);
  });

  it("the two outcomes are distinguishable WITHOUT reading prose, and the work is equally permitted", () => {
    const { repo, h0, r0 } = scenario();
    const unknown = assessWith({ repo, h0, r0, observeSourceChange: true, currentTargetDigest: "target-1" });
    const compatible = assessWith({
      repo,
      h0,
      r0,
      observeSourceChange: true,
      currentTargetDigest: "target-1",
      observeEveryChangeDomain: true,
    });
    /**
     * The operational separation, stated as facts a caller can act on:
     *
     *   reuse differs    (the evidence is the difference)
     *   rework does NOT  (the work was never in question)
     */
    expect(unknown.reuse.rematerializationAvailable).not.toBe(compatible.reuse.rematerializationAvailable);
    expect(unknown.rework.available).toBe(compatible.rework.available);
  });
});

/* ================================================================== *
 * The capability dimension, on the real primitives
 * ================================================================== */

describe("§D5-a a capability gap does not masquerade as a proof gap", () => {
  it("COMPATIBLE but no rematerializer: the proof stands, the DEPLOYMENT cannot carry it", () => {
    const { repo, h0, r0 } = scenario();
    const assessment = assessWith({
      repo,
      h0,
      r0,
      observeSourceChange: true,
      currentTargetDigest: "target-1",
      observeEveryChangeDomain: true,
      capabilities: { rematerialization: false, rework: true },
    });
    expect(assessment.compatibility).toBe("COMPATIBLE");
    expect(assessment.reuse.rematerializationAvailable).toBe(false);
    // The blocker names the missing CAPABILITY rather than doubting the proof.
    expect(assessment.reuse.blocker).toContain("composes no way to carry the result");
    expect(assessment.evidence.gaps.some((gap) => gap.includes("capability"))).toBe(true);
    expect(assessment.rework.available).toBe(true);
  });

  it("UNKNOWN with no rematerializer and no rework: both paths blocked, each with ITS OWN reason", () => {
    const { repo, h0, r0 } = scenario();
    const assessment = assessWith({
      repo,
      h0,
      r0,
      observeSourceChange: false,
      currentTargetDigest: "target-1",
      capabilities: { rematerialization: false, rework: false },
    });
    expect(assessment.reuse.rematerializationAvailable).toBe(false);
    expect(assessment.rework.available).toBe(false);
    expect(assessment.reuse.blocker).not.toBe(assessment.rework.blocker);
  });
});

/* ================================================================== *
 * No target, no path
 * ================================================================== */

describe("§D5-a an unobservable world blocks both paths, for one reason each", () => {
  it("with no current target, neither reuse nor rework is available", () => {
    const { repo, h0, r0 } = scenario();
    const assessment = assessWith({ repo, h0, r0, observeSourceChange: true, currentTargetDigest: null });
    expect(assessment.currentTargetDigest).toBe(null);
    expect(assessment.reuse.rematerializationAvailable).toBe(false);
    expect(assessment.reuse.blocker).toContain("no target to prove non-interference against");
    expect(assessment.rework.available).toBe(false);
    expect(assessment.rework.blocker).toContain("cannot be observed");
  });
});
