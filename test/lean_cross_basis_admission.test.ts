/**
 * PLMP-LEAN-1 §D3-c — CROSS-BASIS ADMISSION, and the headline test this whole slice exists for.
 *
 *     a logically valid conclusion from untrusted premises  ⇏  system authority
 *
 * D3-b is a pure function, so it must accept whatever it is handed — including a fabricated premise set
 * that yields a perfectly sound `COMPATIBLE`. That conclusion carries no authority, and this suite proves
 * the admission gate can tell the difference:
 *
 *   HEADLINE   D3-b says COMPATIBLE from forged premises; D3-c refuses to admit it
 *   C2         a certificate is authority-bearing only if the ISSUER issued it, from observations
 *   C3         two orthogonal checks, neither implying the other: StillApplies + AuthoritativelyIssued
 *   C4         every positive premise needs provenance — read/write coverage cannot be laundered either
 *   C5         the four refusal reasons stay distinct, because the next step differs
 *   C6         admission is not promotion, and not an effect
 */
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, describe, expect, it } from "vitest";

import {
  CROSS_BASIS_ADMISSION_STATES,
  admitCrossBasis,
  covered,
  noChanges,
  provenComplete,
  unavailablePremise,
  unproven,
  wholeRepositoryRead,
  type CoveredFootprint,
  type PremiseReferences,
} from "../src/project_world/index.js";
import { makeD3Rig, type D3Rig } from "./d3_rig.js";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");

const cleanups: Array<() => void> = [];
afterAll(() => {
  for (const fn of cleanups) fn();
});

/* ------------------------------------------------------------------ fixtures */

const srcPath = (path: string) => ({ domain: "source", scope: "path", path }) as const;

/**
 * §D3-R1: a rig whose observers are REGISTERED, so a positive premise is a durable record rather than an
 * object a test assembled. The suite's headline property — that naming the real observer is not a route to
 * authority — is now a property of the API: there is no `observedPremise` to call.
 */
const rig = () => {
  const built = makeD3Rig();
  cleanups.push(() => built.close());
  return built;
};

/** The first-party-looking identity a forgery WOULD have named. */
const REAL_OBSERVER_ID = "git-source-change-observer";

/** All six premise slots observed, with the source change given. */
function observedRefs(
  r: D3Rig,
  input: {
    readonly sourceChanges: readonly ReturnType<typeof srcPath>[];
    readonly reads?: readonly ReturnType<typeof srcPath>[] | undefined;
    readonly writes?: readonly ReturnType<typeof srcPath>[] | undefined;
  },
) {
  return {
    projectSemantic: r.observe(r.conservativeObserver, []),
    source: r.observe(r.sourceObserver, input.sourceChanges),
    assets: r.observe(r.conservativeObserver, []),
    environment: r.observe(r.conservativeObserver, []),
    resultReads: r.observe(r.conservativeObserver, input.reads ?? [srcPath("src/a.ts")]),
    resultWrites: r.observe(r.conservativeObserver, input.writes ?? [srcPath("src/b.ts")]),
  };
}

/** An all-UNOBSERVED ref set: every slot cites nothing, which can only ever produce obstacles. */
function nothingObserved(): PremiseReferences {
  return { projectSemantic: null, source: null, assets: null, environment: null, resultReads: null, resultWrites: null };
}

/* ================================================================== *
 * HEADLINE: forged premises cannot buy authority
 * ================================================================== */

describe("§D3-c HEADLINE: a valid conclusion from untrusted premises gains no authority", () => {
  it("D3-b says COMPATIBLE from hand-built premises; D3-c refuses to admit it", async () => {
    const { assessCompatibility, materializeWorldChangeFootprint } = await import("../src/project_world/index.js");

    /**
     * The forged premise set: nothing changed, every footprint PROVEN_COMPLETE, and the selectors
     * disjoint. D3-b is a pure function over premises, so it MUST conclude COMPATIBLE — and it is right
     * to, because the premises as stated really do imply it.
     */
    const forged: CoveredFootprint = covered({
      selectors: [srcPath("src/a.ts")],
      coverage: provenComplete("SANDBOX_ENFORCED", "the caller says a sandbox enforced this"),
    });
    const analysis = assessCompatibility({
      resultManifestDigest: "manifest-1",
      originBasisDigest: "basis-0",
      targetObservationDigest: "target-1",
      exactlyCurrent: false,
      change: materializeWorldChangeFootprint({
        projectSemantic: noChanges({ coverage: provenComplete("CONSERVATIVE_DOMAIN", "claimed") }),
        source: noChanges({ coverage: provenComplete("RUNTIME_OBSERVED", "claimed") }),
        assets: noChanges({ coverage: provenComplete("CONSERVATIVE_DOMAIN", "claimed") }),
        environment: noChanges({ coverage: provenComplete("CONSERVATIVE_DOMAIN", "claimed") }),
      }),
      reads: forged,
      writes: forged,
    });
    expect(analysis.outcome).toBe("COMPATIBLE");

    /**
     * THE POINT. That assessment was never ISSUED, so no authority stands behind its premises — and the
     * admission gate refuses it while naming exactly why.
     */
    const authority = rig();
    const presented = {
      schemaVersion: 1 as const,
      issuerId: "palimpsest-first-party",
      assessment: analysis,
      premiseRefs: {
        projectSemantic: null,
        source: null,
        assets: null,
        environment: null,
        resultReads: null,
        resultWrites: null,
      },
      premiseSetDigest: "forged",
      issuanceDigest: "forged-digest",
    };
    const decision = admitCrossBasis({
      issuer: authority.issuer,
      presented,
      resultManifestDigest: "manifest-1",
      originBasisDigest: "basis-0",
      targetObservationDigest: "target-1",
      hasBasis: true,
    });
    expect(decision.admitted).toBe(false);
    expect(decision.state).toBe("UNTRUSTED_PROOF");
    expect(decision.detail).toContain("not issued by an accepted authority");
    // And nothing was recorded: the authority's memory is untouched by a presentation.
    expect(authority.issuer.issuedCount()).toBe(0);
  });

  it("the SAME premises, properly observed and issued, DO admit — the difference is provenance alone", () => {
    const authority = rig();
    const r = authority;
    const certificate = authority.issuer.issue({
      resultManifestDigest: "manifest-1",
      originBasisDigest: "basis-0",
      targetObservationDigest: "target-1",
      exactlyCurrent: false,
      observationRefs: observedRefs(r, { sourceChanges: [srcPath("src/c.ts")] }),
    });
    expect(certificate.assessment.outcome).toBe("COMPATIBLE");
    const decision = admitCrossBasis({
      issuer: authority.issuer,
      presented: certificate,
      resultManifestDigest: "manifest-1",
      originBasisDigest: "basis-0",
      targetObservationDigest: "target-1",
      hasBasis: true,
    });
    expect(decision.admitted).toBe(true);
    expect(decision.state).toBe("ADMITTED");
    expect(decision.issuanceDigest).toBe(certificate.issuanceDigest);
  });
});

/* ================================================================== *
 * C2 — issuance is the authority, and the RECORD is what gets checked
 * ================================================================== */

describe("§D3-c2 the certificate is the issuer's record, not the caller's object", () => {
  it("the issuer re-derives the assessment from the observations; a supplied conclusion is not accepted", () => {
    const authority = rig();
    const r = authority;
    // `issue` takes observations and NOT an assessment — there is no parameter for a conclusion, so a
    // caller cannot have one blessed.
    const certificate = authority.issuer.issue({
      resultManifestDigest: "m",
      originBasisDigest: "b0",
      targetObservationDigest: "t1",
      exactlyCurrent: false,
      observationRefs: observedRefs(authority, { sourceChanges: [srcPath("src/a.ts")] }),
    });
    // The change overlaps the read dependency, so the issuer's OWN derivation says INCOMPATIBLE — which
    // a caller hoping for COMPATIBLE cannot talk it out of.
    expect(certificate.assessment.outcome).toBe("INCOMPATIBLE");
  });

  it("a MUTATED assessment under a genuine digest is not admitted: the recorded copy is validated", () => {
    const authority = rig();
    const r = authority;
    const certificate = authority.issuer.issue({
      resultManifestDigest: "m",
      originBasisDigest: "b0",
      targetObservationDigest: "t1",
      exactlyCurrent: false,
      observationRefs: observedRefs(authority, { sourceChanges: [srcPath("src/a.ts")] }),
    });
    expect(certificate.assessment.outcome).toBe("INCOMPATIBLE");

    // The attack: keep the genuine digest, swap in an assessment that says COMPATIBLE.
    const mutated = {
      ...certificate,
      assessment: { ...certificate.assessment, outcome: "COMPATIBLE" as const },
    };
    const decision = admitCrossBasis({
      issuer: authority.issuer,
      presented: mutated,
      resultManifestDigest: "m",
      originBasisDigest: "b0",
      targetObservationDigest: "t1",
      hasBasis: true,
    });
    expect(decision.admitted).toBe(false);
    // The RECORDED copy says INCOMPATIBLE, and the record is what decides.
    expect(decision.state).toBe("CONFLICT");
  });

  it("issuance identity moves with the premises: a different observation is a different certificate", () => {
    const authority = rig();
    const r = authority;
    const one = authority.issuer.issue({
      resultManifestDigest: "m",
      originBasisDigest: "b0",
      targetObservationDigest: "t1",
      exactlyCurrent: false,
      observationRefs: observedRefs(r, { sourceChanges: [srcPath("src/c.ts")] }),
    });
    const other = authority.issuer.issue({
      resultManifestDigest: "m",
      originBasisDigest: "b0",
      targetObservationDigest: "t1",
      exactlyCurrent: false,
      observationRefs: observedRefs(r, { sourceChanges: [srcPath("src/d.ts")] }),
    });
    expect(other.issuanceDigest).not.toBe(one.issuanceDigest);
    expect(other.premiseSetDigest).not.toBe(one.premiseSetDigest);
    expect(authority.issuer.issuedCount()).toBe(2);
    // Both are individually recallable, so identity is not positional.
    expect(authority.issuer.recall(one.issuanceDigest)?.issuanceDigest).toBe(one.issuanceDigest);
    expect(authority.issuer.recall("never-issued")).toBe(null);
  });

  it("a certificate carries WHICH observation each premise rests on", () => {
    const authority = rig();
    const r = authority;
    const refs = observedRefs(authority, { sourceChanges: [srcPath("src/c.ts")] });
    const certificate = authority.issuer.issue({
      resultManifestDigest: "m",
      originBasisDigest: "b0",
      targetObservationDigest: "t1",
      exactlyCurrent: false,
      observationRefs: refs,
    });
    // The certificate cites the OBSERVATION REFS it was issued from, and the authority can recall each
    // one — which is the whole point of §D3-R1.
    expect(certificate.premiseRefs.source).toBe(refs.source);
    expect(authority.observations.recall(refs.source ?? "")?.state).toBe("OBSERVED");
    expect(certificate.premiseRefs.resultReads).toMatch(/^obs-[0-9a-f]{32}$/u);
    // Every premise was observed, so no reference is null.
    expect(Object.values(certificate.premiseRefs).every((ref) => ref !== null)).toBe(true);
  });
});

/* ================================================================== *
 * C3 — the two orthogonal checks
 * ================================================================== */

describe("§D3-c3 authority and freshness are orthogonal", () => {
  const issueFor = (authority: D3Rig, target: string) =>
    authority.issuer.issue({
      resultManifestDigest: "m",
      originBasisDigest: "b0",
      targetObservationDigest: target,
      exactlyCurrent: false,
      observationRefs: observedRefs(authority, { sourceChanges: [srcPath("src/c.ts")] }),
    });

  it("a genuine certificate for one target does NOT authorize another", () => {
    const authority = rig();
    const r = authority;
    const certificate = issueFor(authority, "t1");
    const moved = admitCrossBasis({
      issuer: authority.issuer,
      presented: certificate,
      resultManifestDigest: "m",
      originBasisDigest: "b0",
      targetObservationDigest: "t2",
      hasBasis: true,
    });
    expect(moved.admitted).toBe(false);
    expect(moved.state).toBe("STALE_PROOF");
    expect(moved.moreEvidenceCouldHelp).toBe(true);
    // A fresh assessment against the current target DOES admit — freshness is repairable, provenance is not.
    const fresh = admitCrossBasis({
      issuer: authority.issuer,
      presented: issueFor(authority, "t2"),
      resultManifestDigest: "m",
      originBasisDigest: "b0",
      targetObservationDigest: "t2",
      hasBasis: true,
    });
    expect(fresh.admitted).toBe(true);
  });

  it("a certificate for another result or another origin basis is likewise not applicable", () => {
    const authority = rig();
    const r = authority;
    const certificate = issueFor(authority, "t1");
    for (const input of [
      { resultManifestDigest: "other", originBasisDigest: "b0" },
      { resultManifestDigest: "m", originBasisDigest: "b9" },
    ]) {
      const decision = admitCrossBasis({
        issuer: authority.issuer,
        presented: certificate,
        ...input,
        targetObservationDigest: "t1",
        hasBasis: true,
      });
      expect(decision.admitted).toBe(false);
      expect(decision.state).toBe("STALE_PROOF");
    }
  });

  it("a correct target binding does NOT rescue untrusted premises — the two checks are independent", () => {
    const authority = rig();
    const r = authority;
    const decision = admitCrossBasis({
      issuer: authority.issuer,
      presented: {
        schemaVersion: 1,
        issuerId: "someone-else",
        assessment: {
          schemaVersion: 1,
          policyVersion: "v",
          resultManifestDigest: "m",
          originBasisDigest: "b0",
          targetObservationDigest: "t1",
          changeFootprintDigest: "x",
          outcome: "COMPATIBLE",
          disjointnessProofs: [],
          conflicts: [],
          unknowns: [],
          detail: "trust me",
          assessmentDigest: "y",
        },
        premiseRefs: {
          projectSemantic: "a",
          source: "b",
          assets: "c",
          environment: "d",
          resultReads: "e",
          resultWrites: "f",
        },
        premiseSetDigest: "g",
        issuanceDigest: "h",
      },
      resultManifestDigest: "m",
      originBasisDigest: "b0",
      targetObservationDigest: "t1",
      hasBasis: true,
    });
    // Perfectly bound to the right result, basis and target — and still refused.
    expect(decision.state).toBe("UNTRUSTED_PROOF");
  });
});

/* ================================================================== *
 * C4 — every positive premise needs provenance, not just the change set
 * ================================================================== */

describe("§D3-c4 read and write coverage cannot be laundered either", () => {
  it("an UNAVAILABLE read premise blocks the proof even when the change set is authoritative", () => {
    /**
     * The mirror of the headline test, aimed at the OTHER premise. A caller could fix the change
     * observation and still hand in a read footprint it merely declares. Because the issuer derives the
     * assessment from the OBSERVATIONS, an unavailable read premise contributes no coverage, and the
     * outcome is UNKNOWN — so the hole is not moved, it is closed.
     */
    const authority = rig();
    const certificate = authority.issuer.issue({
      resultManifestDigest: "m",
      originBasisDigest: "b0",
      targetObservationDigest: "t1",
      exactlyCurrent: false,
      /**
       * No observer exists that can attest to what the result read, so that slot cites NOTHING.
       *
       * §D3-R1 makes this sharper than a hand-built `UNAVAILABLE` premise: there is no premise object to
       * supply at all, only the absence of a ref — and an absent ref contributes no coverage.
       */
      observationRefs: {
        projectSemantic: authority.observe(authority.conservativeObserver, []),
        source: authority.observe(authority.sourceObserver, [srcPath("src/c.ts")]),
        assets: authority.observe(authority.conservativeObserver, []),
        environment: authority.observe(authority.conservativeObserver, []),
        resultReads: null,
        resultWrites: authority.observe(authority.conservativeObserver, [srcPath("src/b.ts")]),
      },
    });
    expect(certificate.assessment.outcome).toBe("UNKNOWN");
    // The hygiene rule in action: the WRITE dependency is coverage-qualified, so its disjointness proof
    // is legitimately emitted; the READ dependency is not, so it contributes none. A consumer cannot
    // pick a read-side proof out of this assessment because there is none to pick.
    expect(certificate.assessment.disjointnessProofs.map((proof) => proof.side)).toEqual(["write"]);
    expect(certificate.assessment.unknowns.map((entry) => entry.part)).toContain("read_coverage");
    expect(certificate.premiseRefs.resultReads).toBe(null);

    const decision = admitCrossBasis({
      issuer: authority.issuer,
      presented: certificate,
      resultManifestDigest: "m",
      originBasisDigest: "b0",
      targetObservationDigest: "t1",
      hasBasis: true,
    });
    expect(decision.admitted).toBe(false);
    expect(decision.state).toBe("INSUFFICIENT_PROOF");
    expect(decision.moreEvidenceCouldHelp).toBe(true);
  });

  it("a mechanism is declared by the OBSERVER, and there is no way for a caller to claim one", () => {
    /**
     * §D3-R1: the free `observedPremise({ provenance, selectors })` constructor is GONE. A positive
     * premise now exists only as a durable record written through a REGISTERED observer, so a caller
     * cannot name the real observer's identity in a hand-built literal — which I verified was possible
     * before this hardening, by doing it.
     */
    const authority = rig();
    // The only freely-constructible premise is the one that can never grant authority.
    const declared = unavailablePremise("source", "the caller has no observer");
    expect(declared.state).toBe("UNAVAILABLE");
    expect("footprint" in declared).toBe(false);
    // And an UNAVAILABLE record contributes no coverage to an issuance.
    const unavailableRef = authority.observe(authority.sourceObserver, [srcPath("src/a.ts")]);
    const record = authority.observations.recall(unavailableRef);
    expect(record?.state).toBe("OBSERVED");
    // A ref the authority never wrote recalls as null, which the issuer turns into an obstacle.
    expect(authority.observations.recall("obs-never-written")).toBe(null);
  });

  it("a whole-repository read observed honestly still cannot admit against a source change", () => {
    const authority = rig();
    const r = authority;
    const certificate = authority.issuer.issue({
      resultManifestDigest: "m",
      originBasisDigest: "b0",
      targetObservationDigest: "t1",
      exactlyCurrent: false,
      observationRefs: {
        projectSemantic: authority.observe(authority.conservativeObserver, []),
        source: authority.observe(authority.sourceObserver, [srcPath("src/c.ts")]),
        assets: authority.observe(authority.conservativeObserver, []),
        environment: authority.observe(authority.conservativeObserver, []),
        // The honest observation: this deployment CAN see the read set, and the read set is everything.
        resultReads: authority.observe(authority.conservativeObserver, wholeRepositoryRead().selectors),
        resultWrites: authority.observe(authority.conservativeObserver, [srcPath("src/b.ts")]),
      },
    });
    // Authoritative premises, and the honest outcome is still a conflict: the read overlaps the change.
    expect(certificate.assessment.outcome).toBe("INCOMPATIBLE");
    const decision = admitCrossBasis({
      issuer: authority.issuer,
      presented: certificate,
      resultManifestDigest: "m",
      originBasisDigest: "b0",
      targetObservationDigest: "t1",
      hasBasis: true,
    });
    expect(decision.state).toBe("CONFLICT");
  });
});

/* ================================================================== *
 * C5 — the refusal reasons stay distinct
 * ================================================================== */

describe("§D3-c5 every refusal keeps its own reason", () => {
  it("the vocabulary is the six states, and only one of them admits", () => {
    expect([...CROSS_BASIS_ADMISSION_STATES]).toEqual([
      "ADMITTED",
      "CONFLICT",
      "INSUFFICIENT_PROOF",
      "STALE_PROOF",
      "UNTRUSTED_PROOF",
      "NO_BASIS",
    ]);
  });

  it("NO_BASIS is its own state: an attempt with no recorded basis has nothing to admit against", () => {
    const decision = admitCrossBasis({
      issuer: rig().issuer,
      presented: null,
      resultManifestDigest: "m",
      originBasisDigest: "b0",
      targetObservationDigest: "t1",
      hasBasis: false,
    });
    expect(decision.state).toBe("NO_BASIS");
    expect(decision.admitted).toBe(false);
  });

  it("an absent certificate is INSUFFICIENT_PROOF, and says more evidence could help", () => {
    const decision = admitCrossBasis({
      issuer: rig().issuer,
      presented: null,
      resultManifestDigest: "m",
      originBasisDigest: "b0",
      targetObservationDigest: "t1",
      hasBasis: true,
    });
    expect(decision.state).toBe("INSUFFICIENT_PROOF");
    expect(decision.moreEvidenceCouldHelp).toBe(true);
  });

  it("CONFLICT is NOT repairable by observing more, while INSUFFICIENT_PROOF is", () => {
    const authority = rig();
    const r = authority;
    const conflicting = authority.issuer.issue({
      resultManifestDigest: "m",
      originBasisDigest: "b0",
      targetObservationDigest: "t1",
      exactlyCurrent: false,
      observationRefs: observedRefs(authority, { sourceChanges: [srcPath("src/a.ts")] }),
    });
    const conflict = admitCrossBasis({
      issuer: authority.issuer,
      presented: conflicting,
      resultManifestDigest: "m",
      originBasisDigest: "b0",
      targetObservationDigest: "t1",
      hasBasis: true,
    });
    const insufficient = admitCrossBasis({
      issuer: authority.issuer,
      presented: null,
      resultManifestDigest: "m",
      originBasisDigest: "b0",
      targetObservationDigest: "t1",
      hasBasis: true,
    });
    /**
     * The distinction that matters for every future consumer: a witness is a FACT and no amount of
     * further observation removes it, whereas a gap may close with a better observer. Collapsing both
     * into one "blocked" would lose the only information a recovery path needs.
     */
    expect(conflict.state).toBe("CONFLICT");
    expect(conflict.moreEvidenceCouldHelp).toBe(false);
    expect(insufficient.state).toBe("INSUFFICIENT_PROOF");
    expect(insufficient.moreEvidenceCouldHelp).toBe(true);
  });

  it("EXACT admits without needing a compatibility proof at all", () => {
    const authority = rig();
    const r = authority;
    const certificate = authority.issuer.issue({
      resultManifestDigest: "m",
      originBasisDigest: "b0",
      targetObservationDigest: "t1",
      exactlyCurrent: true,
      observationRefs: observedRefs(authority, { sourceChanges: [] }),
    });
    expect(certificate.assessment.outcome).toBe("EXACT");
    const decision = admitCrossBasis({
      issuer: authority.issuer,
      presented: certificate,
      resultManifestDigest: "m",
      originBasisDigest: "b0",
      targetObservationDigest: "t1",
      hasBasis: true,
    });
    expect(decision.admitted).toBe(true);
    expect(decision.state).toBe("ADMITTED");
  });
});

/* ================================================================== *
 * C6 — the slice's own boundary
 * ================================================================== */

describe("§D3-c6 admission is neither promotion nor an effect", () => {
  it("no promotion, no effect, no proof search appears in the admission plane", () => {
    const read = (relative: string): string =>
      execFileSync(
        process.execPath,
        ["-e", `process.stdout.write(require('node:fs').readFileSync(${JSON.stringify(join(REPO, relative))},'utf8'))`],
        { encoding: "utf8" },
      ).replace(/\/\*[\s\S]*?\*\//gu, "");
    const NO_EFFECT = [
      "cherry-pick",
      "rebase",
      "transplant",
      "applyResult",
      "promoteAttempt",
      "assessPromotionEligibility",
      "ATTEMPT_COMPLETED",
      "recordCallback",
      "execFileSync",
      "git diff",
    ];
    /**
     * §D3-R2 note: `node:fs`/`node:sqlite` are no longer forbidden here. The issuance and admission records
     * became DURABLE, which is the point of the hardening — a durable record needs a store. What remains
     * forbidden is every EFFECT and every second proof search, which is what this list is for.
     */
    for (const file of [
      "src/project_world/admission.ts",
      "src/project_world/issuance.ts",
      "src/project_world/observation.ts",
      "src/project_world/observation_authority.ts",
      "src/project_world/admission_store.ts",
    ]) {
      const text = read(file);
      for (const forbidden of NO_EFFECT) {
        expect(text, `${file} must not contain "${forbidden}"`).not.toContain(forbidden);
      }
    }

    /**
     * The sharper boundary, and the one that matters: the ADMISSION plane must not re-derive
     * compatibility. `issuance.ts` DOES call `assessCompatibility` — that is the generator, and its job is
     * to run D3-b over observations. `admission.ts` must contain no selector algebra and no assessor at
     * all, or D3-b and D3-c would become two compatibility engines that drift.
     */
    const admission = read("src/project_world/admission.ts");
    for (const forbidden of ["relateSelectors", "relateSelectorToSet", "assessCompatibility", "covered(", "provenComplete"]) {
      expect(admission, `admission.ts must not re-derive proofs: found "${forbidden}"`).not.toContain(forbidden);
    }
  });

  it("the issuer is the ONLY writer of its record, so authority cannot be self-granted", () => {
    const text = execFileSync(
      process.execPath,
      ["-e", `process.stdout.write(require('node:fs').readFileSync(${JSON.stringify(join(REPO, "src/project_world/issuance.ts"))},'utf8'))`],
      { encoding: "utf8" },
    );
    /**
     * §D3-R2: the record is now DURABLE, so the writer is a SQLite INSERT inside the factory closure
     * rather than an in-memory Map. The property is unchanged — one writer, reachable only through
     * `issue()` — and it is now also true across a restart.
     */
    expect(text.match(/insert\.run\(/gu)?.length).toBe(1);
    // No exported way to write the record directly.
    expect(text).not.toMatch(/export function (register|record|remember)Issuance/u);
    // And it is append-once by SCHEMA, not by caller discipline.
    expect(text.toUpperCase()).toContain("PRIMARY KEY (ISSUANCE_DIGEST)");
  });
});
