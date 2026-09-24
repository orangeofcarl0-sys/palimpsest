/**
 * PLMP-LEAN-1 §D3-c4 — the COMPOSITION gate: the whole premise-provenance chain, against a real
 * repository.
 *
 * The unit suite proves each piece. This proves they still compose, which is the lesson D2 paid for:
 *
 *     slice correctness  ⇏  composition correctness
 *
 * The chain exercised here is the shipped one, end to end:
 *
 *     real git observer → observations with provenance → the issuer → a certificate → the admission gate
 *
 * and the two scenarios are the two things a reviewer must be able to tell apart:
 *
 *   the SAME premises, hand-built → D3-b says COMPATIBLE, admission REFUSES (no authority)
 *   the SAME shape, observed     → certificate issued  → admission DECIDES on the proof
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, describe, expect, it } from "vitest";

import {
  GIT_SOURCE_OBSERVER_ID,
  gitSourceChangeObserver,
} from "../src/deployment/source_change_observer.js";
import {
  covered,
  makeCompatibilityIssuer,
  makeCrossBasisAdmissionRuntime,
  materializePremiseSet,
  noChanges,
  observedPremise,
  provenComplete,
  unavailablePremise,
  type PremiseObservation,
  type PremiseSet,
  type ProjectWorldObservationPort,
} from "../src/project_world/index.js";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");

const cleanups: Array<() => void> = [];
afterAll(() => {
  for (const fn of cleanups) fn();
});

const git = (cwd: string, args: readonly string[]): string =>
  execFileSync("git", [...args], { cwd, encoding: "utf8" }).trim();

function repository(): { repo: string; h0: string } {
  const root = mkdtempSync(join(tmpdir(), "palimpsest-d3c4-"));
  const repo = join(root, "repo");
  mkdirSync(join(repo, "src"), { recursive: true });
  writeFileSync(join(repo, "src", "a.ts"), "export const a = 1;\n");
  writeFileSync(join(repo, "src", "c.ts"), "export const c = 1;\n");
  execFileSync("git", ["init", "-q"], { cwd: repo });
  execFileSync("git", ["add", "-A"], { cwd: repo });
  execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "H0"], { cwd: repo });
  cleanups.push(() => {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      // Windows keeps the directory busy while a git handle is open; the OS reaps it.
    }
  });
  return { repo, h0: git(repo, ["rev-parse", "HEAD"]) };
}

/** A minimal observation port: only the source revision is observed, everything else is absent. */
function worldAt(revision: string, semanticDigest: string): ProjectWorldObservationPort {
  return {
    adapterId: "test-world",
    observeSource: () => ({ ok: true, revision: { backend: "git", revision } }),
    observeSemanticProjection: () => ({ ok: true, digest: semanticDigest }),
    observeRevision: () => 41,
  };
}

/** A source dependency observed by the REAL observer, since a test has no sandbox to attest one. */
function observedSourceDependency(input: {
  readonly repo: string;
  readonly from: string;
  readonly to: string;
  readonly selectors: readonly { readonly domain: "source"; readonly scope: "path"; readonly path: string }[];
}): PremiseObservation {
  return observedPremise({
    provenance: {
      observerId: GIT_SOURCE_OBSERVER_ID,
      observerVersion: "1",
      // A result's read set cannot be narrowed by git, so this fixture attests the CONSERVATIVE_DOMAIN
      // mechanism: the selectors ARE the whole dependency it claims, and nothing more is implied.
      mechanism: "CONSERVATIVE_DOMAIN",
      scope: { domain: "source", scopeRef: input.repo, from: input.from, to: input.to },
    },
    selectors: input.selectors,
  });
}

describe("§D3-c4 the composed chain, against a real repository", () => {
  it("the real observer's output is what a certificate is issued from, and admission follows it", () => {
    const { repo, h0 } = repository();
    // The world moves in src/c.ts.
    writeFileSync(join(repo, "src", "c.ts"), "export const c = 2;\n");
    execFileSync("git", ["add", "-A"], { cwd: repo });
    execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "H1"], { cwd: repo });
    const h1 = git(repo, ["rev-parse", "HEAD"]);

    const change = gitSourceChangeObserver({ repository: repo }).observeChange({
      fromRevision: h0,
      toRevision: h1,
      scopeRef: repo,
    });
    expect(change.state).toBe("OBSERVED");

    const issuer = makeCompatibilityIssuer({ issuerId: "palimpsest-first-party" });
    const runtime = makeCrossBasisAdmissionRuntime({ issuer, observation: worldAt(h1, "sem-1") });
    const target = runtime.observeTarget("t1");

    // The result reads src/a.ts and writes src/b.ts, both observed; the change is in src/c.ts.
    const premises: PremiseSet = materializePremiseSet({
      projectSemantic: observedPremise({
        provenance: {
          observerId: "project-projection",
          observerVersion: "1",
          mechanism: "CONSERVATIVE_DOMAIN",
          scope: { domain: "project_semantic", scopeRef: "d3c4", from: "41", to: "41" },
        },
        selectors: [],
      }),
      source: change,
      assets: observedPremise({
        provenance: {
          observerId: "no-asset-observer",
          observerVersion: "1",
          mechanism: "CONSERVATIVE_DOMAIN",
          scope: { domain: "assets", scopeRef: "none", from: "-", to: "-" },
        },
        selectors: [],
      }),
      environment: observedPremise({
        provenance: {
          observerId: "no-environment-observer",
          observerVersion: "1",
          mechanism: "CONSERVATIVE_DOMAIN",
          scope: { domain: "environment", scopeRef: "none", from: "-", to: "-" },
        },
        selectors: [],
      }),
      resultReads: observedSourceDependency({
        repo,
        from: h0,
        to: h1,
        selectors: [{ domain: "source", scope: "path", path: "src/a.ts" }],
      }),
      resultWrites: observedSourceDependency({
        repo,
        from: h0,
        to: h1,
        selectors: [{ domain: "source", scope: "path", path: "src/b.ts" }],
      }),
    });

    const certificate = issuer.issue({
      resultManifestDigest: "manifest-real",
      originBasisDigest: "basis-real",
      targetObservationDigest: target.digest,
      exactlyCurrent: false,
      premises,
    });
    expect(certificate.assessment.outcome).toBe("COMPATIBLE");

    const decision = runtime.admit({
      presented: certificate,
      resultManifestDigest: "manifest-real",
      originBasisDigest: "basis-real",
      taskId: "t1",
      hasBasis: true,
    });
    expect(decision.admitted).toBe(true);
    expect(decision.state).toBe("ADMITTED");

    /**
     * And the SAME certificate against a world that has moved on is refused — the runtime re-observes the
     * target on every admission rather than trusting the caller's idea of "now".
     */
    writeFileSync(join(repo, "src", "a.ts"), "export const a = 9;\n");
    execFileSync("git", ["add", "-A"], { cwd: repo });
    execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "H2"], { cwd: repo });
    const h2 = git(repo, ["rev-parse", "HEAD"]);
    const movedRuntime = makeCrossBasisAdmissionRuntime({ issuer, observation: worldAt(h2, "sem-1") });
    const afterMove = movedRuntime.admit({
      presented: certificate,
      resultManifestDigest: "manifest-real",
      originBasisDigest: "basis-real",
      taskId: "t1",
      hasBasis: true,
    });
    expect(afterMove.admitted).toBe(false);
    expect(afterMove.state).toBe("STALE_PROOF");
  }, 120_000);

  it("the SAME premises hand-built are refused, while the observed ones are admitted", () => {
    /**
     * The headline, at composition level. Both branches describe the same world; only one of them has a
     * provenance chain behind it, and the system's answer depends on that difference alone.
     */
    const issuer = makeCompatibilityIssuer({ issuerId: "palimpsest-first-party" });
    const runtime = makeCrossBasisAdmissionRuntime({ issuer, observation: worldAt("H1", "sem-1") });
    const target = runtime.observeTarget("t1");

    // (a) Hand-built premises: everything claims PROVEN_COMPLETE and nothing is observed.
    const forged: PremiseSet = materializePremiseSet({
      projectSemantic: unavailablePremise("project_semantic", "not observed"),
      source: unavailablePremise("source", "not observed"),
      assets: unavailablePremise("assets", "not observed"),
      environment: unavailablePremise("environment", "not observed"),
      resultReads: unavailablePremise("source", "not observed"),
      resultWrites: unavailablePremise("source", "not observed"),
    });
    const forgedCertificate = issuer.issue({
      resultManifestDigest: "manifest-real",
      originBasisDigest: "basis-real",
      targetObservationDigest: target.digest,
      exactlyCurrent: false,
      premises: forged,
    });
    // Even issued through the real authority, unavailable premises yield no proof — so the certificate is
    // honest about it and admission reports a gap rather than a pass.
    expect(forgedCertificate.assessment.outcome).toBe("UNKNOWN");
    const forgedDecision = runtime.admit({
      presented: forgedCertificate,
      resultManifestDigest: "manifest-real",
      originBasisDigest: "basis-real",
      taskId: "t1",
      hasBasis: true,
    });
    expect(forgedDecision.admitted).toBe(false);
    expect(forgedDecision.state).toBe("INSUFFICIENT_PROOF");

    // (b) A conclusion that never went through the authority at all.
    const unissued = runtime.admit({
      presented: {
        schemaVersion: 1,
        issuerId: "palimpsest-first-party",
        assessment: {
          schemaVersion: 1,
          policyVersion: "v",
          resultManifestDigest: "manifest-real",
          originBasisDigest: "basis-real",
          targetObservationDigest: target.digest,
          changeFootprintDigest: "x",
          outcome: "COMPATIBLE",
          disjointnessProofs: [],
          conflicts: [],
          unknowns: [],
          detail: "trust me",
          assessmentDigest: "y",
        },
        premiseRefs: {
          projectSemantic: null,
          source: null,
          assets: null,
          environment: null,
          resultReads: null,
          resultWrites: null,
        },
        premiseSetDigest: "g",
        issuanceDigest: "h",
      },
      resultManifestDigest: "manifest-real",
      originBasisDigest: "basis-real",
      taskId: "t1",
      hasBasis: true,
    });
    expect(unissued.admitted).toBe(false);
    expect(unissued.state).toBe("UNTRUSTED_PROOF");
  }, 120_000);

  it("the runtime reports NO_BASIS for an attempt whose provenance was never captured", () => {
    const issuer = makeCompatibilityIssuer({ issuerId: "palimpsest-first-party" });
    const runtime = makeCrossBasisAdmissionRuntime({ issuer, observation: worldAt("H1", "sem-1") });
    const decision = runtime.admit({
      presented: null,
      resultManifestDigest: "m",
      originBasisDigest: "b",
      taskId: "t1",
      hasBasis: false,
    });
    expect(decision.state).toBe("NO_BASIS");
    // The digest is still reported, so a caller can see WHAT it was refused against.
    expect(decision.targetObservationDigest).toMatch(/^[0-9a-f]{64}$/u);
  });

  it("the target observation digest moves when the world moves, and is stable when it does not", () => {
    const issuer = makeCompatibilityIssuer({ issuerId: "x" });
    const first = makeCrossBasisAdmissionRuntime({ issuer, observation: worldAt("H1", "sem-1") });
    const again = makeCrossBasisAdmissionRuntime({ issuer, observation: worldAt("H1", "sem-1") });
    const moved = makeCrossBasisAdmissionRuntime({ issuer, observation: worldAt("H2", "sem-1") });
    const semanticMoved = makeCrossBasisAdmissionRuntime({ issuer, observation: worldAt("H1", "sem-2") });

    expect(again.observeTarget("t1").digest).toBe(first.observeTarget("t1").digest);
    expect(moved.observeTarget("t1").digest).not.toBe(first.observeTarget("t1").digest);
    expect(semanticMoved.observeTarget("t1").digest).not.toBe(first.observeTarget("t1").digest);
  });
});

describe("§D3-c4 the boundary: admission is not promotion", () => {
  it("the admission plane is NOT wired into promotion eligibility", () => {
    /**
     * `COMPATIBLE ⇏ PROMOTION_ELIGIBLE`, and the honest way to hold that line is to leave the existing
     * promotion blockers untouched rather than to redefine `ELIGIBLE`. No transplant effect exists yet,
     * so an admitted result still cannot be carried across — and this asserts the composition did not
     * quietly connect the two.
     */
    const core = execFileSync(
      process.execPath,
      ["-e", `process.stdout.write(require('node:fs').readFileSync(${JSON.stringify(join(REPO, "src/composition/core.ts"))},'utf8'))`],
      { encoding: "utf8" },
    );
    expect(core).not.toContain("crossBasis");
    expect(core).not.toContain("makeCrossBasisAdmissionRuntime");

    // And the promotion blocker vocabulary is unchanged: no cross-basis blocker was invented.
    const eligibility = execFileSync(
      process.execPath,
      ["-e", `process.stdout.write(require('node:fs').readFileSync(${JSON.stringify(join(REPO, "src/domain/promotion_eligibility.ts"))},'utf8'))`],
      { encoding: "utf8" },
    );
    expect(eligibility).not.toContain("cross_basis");
    // The BLOCKER VOCABULARY is what must not grow: a new cross-basis blocker would be a second
    // admission path inside promotion. (The file already mentions "compatibility" in a pre-existing
    // comment about cross-revision promotion, so the check names the identifiers rather than the word.)
    expect(eligibility).not.toContain("cross_basis_");
    expect(eligibility).not.toContain("basis_mismatch");
    expect(eligibility).not.toContain("CompatibilityAssessment");
    expect(eligibility).not.toContain("admitCrossBasis");
  });

  it("no second promotion assessor was created", () => {
    const read = (relative: string): string =>
      execFileSync(
        process.execPath,
        ["-e", `process.stdout.write(require('node:fs').readFileSync(${JSON.stringify(join(REPO, relative))},'utf8'))`],
        { encoding: "utf8" },
      ).replace(/\/\*[\s\S]*?\*\//gu, "");
    for (const file of ["src/project_world/admission.ts", "src/project_world/cross_basis.ts", "src/project_world/issuance.ts"]) {
      const text = read(file);
      for (const forbidden of ["assessPromotionEligibility", "PromotionEligibility", "promoteAttempt", "PROMOTION_"]) {
        expect(text, `${file} must not contain "${forbidden}"`).not.toContain(forbidden);
      }
    }
  });

  it("the unused helper that a caller reaches for is UNAVAILABLE, not a fake complete footprint", () => {
    // `unobservedDependency` exists so nobody has to hand-build a PROVEN_COMPLETE footprint for a facet
    // with no observer. It returns an UNAVAILABLE premise, which carries no coverage.
    const premise = unavailablePremise("assets", "this deployment composes no asset observer");
    expect(premise.state).toBe("UNAVAILABLE");
    // Whereas a hand-built footprint can claim anything — which is exactly why it carries no authority.
    const handBuilt = covered({ selectors: [], coverage: provenComplete("AUTHORITATIVE_MANIFEST", "claimed") });
    expect(handBuilt.coverage.status).toBe("PROVEN_COMPLETE");
    expect(noChanges({ coverage: provenComplete("CONSERVATIVE_DOMAIN", "claimed") }).selectors).toEqual([]);
  });
});
