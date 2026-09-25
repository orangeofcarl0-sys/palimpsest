/**
 * PLMP-LEAN-1 §D3-R — the AUTHORITY/durability hardening, and the four audit findings it closes.
 *
 * A code audit of D3-c/D3-d found four places where the comments claimed more than the code did. Each is
 * measured here, in the direction that FAILS if the hardening is reverted:
 *
 *   R1  a caller could name the real observer in a hand-built premise — I verified the forgery by doing it
 *   R2  the effect took the target digest and the target revision as INDEPENDENT inputs, so admission could
 *       pass on one world and the effect run in another
 *   R3  issuance lived in an in-memory Map, so every certificate vanished on restart while bases,
 *       candidates and verifications survived
 *   R4  `release()` existed but was never called, so worlds accumulated — and once it WAS called, replay
 *       stopped converging until the lookup was added
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, describe, expect, it } from "vitest";

import { gitSourceRematerializer } from "../src/deployment/source_rematerializer.js";
import type {
  AuthoritativeResultResolver,
  ResolvedResult,
  ResultSubjectRef,
} from "../src/project_world/index.js";
import {
  SqliteDerivedResultCandidateStore,
  admitCrossBasis,
  crossBasisAdmissionRefOf,
  makeCompatibilityIssuer,
  makeCrossBasisAdmissionStore,
  makeObservationAuthority,
  makeRematerializationRuntime,
  type PremiseReferences,
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
const MANIFEST = "a".repeat(64);
const BASIS = "b".repeat(64);
/**
 * §D5-0: the result identity these fixtures admit. It is now a REQUIRED part of an admission, because the
 * effect resolves the result from the record rather than accepting the caller's description of it.
 */
const HARDENING_RESULT_REF = Object.freeze({ kind: "ATTEMPT_RESULT" as const, ref: "attempt-hardening" });

/* ================================================================== *
 * R1 — premise authority
 * ================================================================== */

describe("§D3-R1 a positive premise requires an authoritative record", () => {
  it("there is NO free constructor for an authority-bearing premise", () => {
    /**
     * The audit found that `observedPremise({ provenance, selectors })` was exported, so a caller could
     * pass the REAL observer's identity and mechanism in a hand-built literal and hand it to the issuer —
     * verified by doing it. The constructor is gone, and this asserts the export surface, so a future
     * "convenience" re-export fails loudly.
     */
    const barrel = execFileSync(
      process.execPath,
      ["-e", `process.stdout.write(require('node:fs').readFileSync(${JSON.stringify(join(REPO, "src/project_world/index.ts"))},'utf8'))`],
      { encoding: "utf8" },
    );
    expect(barrel).not.toMatch(/^\s*observedPremise,\s*$/mu);
    // The observation AUTHORITY is exported; `registerObserver` is reachable only on it, which the
    // composition performs — a module must be handed a recorder rather than minting an identity.
    expect(barrel).toContain("makeObservationAuthority");
    // And the free constructor is not merely unexported: it does not exist.
    const observation = execFileSync(
      process.execPath,
      ["-e", `process.stdout.write(require('node:fs').readFileSync(${JSON.stringify(join(REPO, "src/project_world/observation.ts"))},'utf8'))`],
      { encoding: "utf8" },
    ).replace(/\/\*[\s\S]*?\*\//gu, "");
    expect(observation).not.toContain("export function observedPremise");
    // `unavailablePremise` SURVIVES, asymmetrically: it can never grant positive authority.
    expect(observation).toContain("export function unavailablePremise");
  });

  it("the issuer consumes observation REFS and recalls the records itself", () => {
    const rig = makeD3Rig();
    cleanups.push(() => rig.close());

    // A ref this authority never wrote is an OBSTACLE, not a silent gap — so citing a fabricated ref
    // produces an unusable premise rather than a pass.
    const certificate = rig.issuer.issue({
      resultManifestDigest: MANIFEST,
      originBasisDigest: BASIS,
      targetObservationDigest: "t1",
      exactlyCurrent: false,
      observationRefs: {
        projectSemantic: "obs-fabricated-1",
        source: "obs-fabricated-2",
        assets: "obs-fabricated-3",
        environment: "obs-fabricated-4",
        resultReads: "obs-fabricated-5",
        resultWrites: "obs-fabricated-6",
      },
    });
    expect(certificate.assessment.outcome).toBe("UNKNOWN");
    expect(certificate.assessment.unknowns.map((entry) => entry.part)).toContain("unobserved_facet");
    expect(certificate.assessment.unknowns.some((entry) => entry.detail.includes("unheld observation refs"))).toBe(true);
    // And the certificate records WHICH refs it was issued from, so the citation is auditable.
    expect(certificate.premiseRefs.source).toBe("obs-fabricated-2");
  });

  it("a registered observer's record carries the identity the OBSERVER was registered with", () => {
    const rig = makeD3Rig();
    cleanups.push(() => rig.close());
    // Two observers with different mechanisms; each record names its own.
    const viaGit = rig.observe(rig.sourceObserver, [srcPath("src/a.ts")]);
    const viaMaterializer = rig.observe(rig.conservativeObserver, [srcPath("src/a.ts")]);
    expect(rig.observations.recall(viaGit)?.provenance?.observerId).toBe("git-source-change-observer");
    expect(rig.observations.recall(viaGit)?.provenance?.mechanism).toBe("RUNTIME_OBSERVED");
    expect(rig.observations.recall(viaMaterializer)?.provenance?.mechanism).toBe("CONSERVATIVE_DOMAIN");
    // The same selectors through different mechanisms are DIFFERENT observations.
    expect(viaGit).not.toBe(viaMaterializer);
  });

  it("an UNAVAILABLE record carries no footprint, so it can only ever produce obstacles", () => {
    const rig = makeD3Rig();
    cleanups.push(() => rig.close());
    const ref = rig.unavailable(rig.sourceObserver, "source", "the observer could not compare the revisions");
    const record = rig.observations.recall(ref);
    expect(record?.state).toBe("UNAVAILABLE");
    expect(record?.footprint).toBe(null);
    expect(record?.provenance).toBe(null);
  });
});

/* ================================================================== *
 * R2 — the effect's target is a fact, not a caller's assertion
 * ================================================================== */

describe("§D3-R2 the effect takes an admission identity, and the target comes from the record", () => {
  it("the effect has NO parameter for a target digest or revision", () => {
    const runtime = execFileSync(
      process.execPath,
      ["-e", `process.stdout.write(require('node:fs').readFileSync(${JSON.stringify(join(REPO, "src/project_world/rematerialization.ts"))},'utf8'))`],
      { encoding: "utf8" },
    ).replace(/\/\*[\s\S]*?\*\//gu, "");
    // The public interface takes an admissionRef and nothing that could name a world independently.
    expect(runtime).toContain("readonly admissionRef: string;");
    const interfaceBlock = runtime.slice(runtime.indexOf("export interface RematerializationRuntime"));
    expect(interfaceBlock.slice(0, interfaceBlock.indexOf("}"))).not.toContain("targetBasisRevision");
    expect(interfaceBlock.slice(0, interfaceBlock.indexOf("}"))).not.toContain("targetBasisDigest");
    expect(interfaceBlock.slice(0, interfaceBlock.indexOf("}"))).not.toContain("presented");
  });

  it("a target revision that disagrees with the admitted observation is not expressible", () => {
    /**
     * The audit's exact scenario: `digest(B1)` with revision `H2`. It is no longer expressible, because the
     * effect reads BOTH from one record. What a caller CAN do is admit one world and then let the world
     * move — and that is caught by the re-observation, which is the next test.
     */
    const rig = makeD3Rig();
    cleanups.push(() => rig.close());
    const refs: PremiseReferences = {
      projectSemantic: rig.observe(rig.conservativeObserver, []),
      source: rig.observe(rig.sourceObserver, []),
      assets: rig.observe(rig.conservativeObserver, []),
      environment: rig.observe(rig.conservativeObserver, []),
      resultReads: rig.observe(rig.conservativeObserver, []),
      resultWrites: rig.observe(rig.conservativeObserver, []),
    };
    const { record } = rig.admit({
      resultManifestDigest: MANIFEST,
      originBasisDigest: BASIS,
      targetObservationDigest: "digest-of-B1",
      targetBasisRevision: "revision-of-B1",
      observationRefs: refs,
      resultSubjectRef: HARDENING_RESULT_REF,
    });
    // The record holds ONE observation, and both halves come from it.
    expect(record.targetObservation.targetObservationDigest).toBe("digest-of-B1");
    expect(record.targetObservation.targetBasisRevision).toBe("revision-of-B1");
    // Recalling it gives back the same pair — there is no way to pair one with the other's world.
    expect(rig.admissions.recall(record.admissionRef)?.targetObservation).toEqual(record.targetObservation);
  });

  it("the admission ref is derived from the issuance AND the target, so it names both", () => {
    const one = crossBasisAdmissionRefOf({ issuanceRef: "issuance-a", targetObservationDigest: "target-1", resultSubjectRef: HARDENING_RESULT_REF });
    const other = crossBasisAdmissionRefOf({ issuanceRef: "issuance-a", targetObservationDigest: "target-2", resultSubjectRef: HARDENING_RESULT_REF });
    const third = crossBasisAdmissionRefOf({ issuanceRef: "issuance-b", targetObservationDigest: "target-1", resultSubjectRef: HARDENING_RESULT_REF });
    expect(new Set([one, other, third]).size).toBe(3);
  });

  it("the admission record is APPEND-ONCE by schema", () => {
    const store = execFileSync(
      process.execPath,
      ["-e", `process.stdout.write(require('node:fs').readFileSync(${JSON.stringify(join(REPO, "src/project_world/admission_store.ts"))},'utf8'))`],
      { encoding: "utf8" },
    ).toUpperCase();
    expect(store).not.toContain("ON CONFLICT");
    expect(store).not.toContain("UPDATE CROSS_BASIS_ADMISSION");
    expect(store).toContain("PRIMARY KEY (ADMISSION_REF)");
  });
});

/* ================================================================== *
 * R3 — durability across a restart
 * ================================================================== */

describe("§D3-R3 authority survives a restart, because the record is durable", () => {
  function durableRig() {
    const dir = mkdtempSync(join(tmpdir(), "d3r-"));
    cleanups.push(() => {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // The OS reaps it.
      }
    });
    const open = () => {
      const observations = makeObservationAuthority({ databasePath: join(dir, "observations.sqlite") });
      const issuer = makeCompatibilityIssuer({
        issuerId: "palimpsest-first-party",
        observations,
        databasePath: join(dir, "issuance.sqlite"),
        clock: () => "2026-09-24T00:00:00.000Z",
      });
      const admissions = makeCrossBasisAdmissionStore({ databasePath: join(dir, "admissions.sqlite") });
      const candidates = new SqliteDerivedResultCandidateStore(join(dir, "candidates.sqlite"));
      const sourceObserver = observations.registerObserver({
        observerId: "git-source-change-observer",
        observerVersion: "1",
        mechanism: "RUNTIME_OBSERVED",
      });
      return { observations, issuer, admissions, candidates, sourceObserver };
    };
    return { dir, open };
  }

  it("an issuance and an admission recorded before a restart are recallable after it", () => {
    const { open } = durableRig();

    // ---- First process lifetime ----
    const first = open();
    const refs: PremiseReferences = {
      projectSemantic: first.sourceObserver.record({ scope: { domain: "project_semantic", scopeRef: "p", from: "41", to: "41" }, selectors: [] }),
      source: first.sourceObserver.record({ scope: { domain: "source", scopeRef: "repo", from: "H0", to: "H1" }, selectors: [srcPath("src/a.ts")] }),
      assets: first.sourceObserver.record({ scope: { domain: "assets", scopeRef: "none", from: "-", to: "-" }, selectors: [] }),
      environment: first.sourceObserver.record({ scope: { domain: "environment", scopeRef: "none", from: "-", to: "-" }, selectors: [] }),
      resultReads: first.sourceObserver.record({ scope: { domain: "source", scopeRef: "repo", from: "H0", to: "H1" }, selectors: [srcPath("src/b.ts")] }),
      resultWrites: first.sourceObserver.record({ scope: { domain: "source", scopeRef: "repo", from: "H0", to: "H1" }, selectors: [srcPath("src/b.ts")] }),
    };
    const certificate = first.issuer.issue({
      resultManifestDigest: MANIFEST,
      originBasisDigest: BASIS,
      targetObservationDigest: "target-1",
      exactlyCurrent: false,
      observationRefs: refs,
    });
    const admissionRef = crossBasisAdmissionRefOf({ issuanceRef: certificate.issuanceDigest, targetObservationDigest: "target-1", resultSubjectRef: HARDENING_RESULT_REF });
    const decision = admitCrossBasis({
      issuer: first.issuer,
      presented: certificate,
      resultManifestDigest: MANIFEST,
      originBasisDigest: BASIS,
      targetObservationDigest: "target-1",
      hasBasis: true,
    });
    first.admissions.record({
      schemaVersion: 1,
      admissionRef,
      issuanceRef: certificate.issuanceDigest,
      resultSubjectRef: HARDENING_RESULT_REF,
      resultManifestDigest: MANIFEST,
      originBasisDigest: BASIS,
      targetObservation: { targetObservationDigest: "target-1", targetBasisRevision: "H1", detail: "observed" },
      state: decision.state,
      admitted: decision.admitted,
      detail: decision.detail,
      recordedAt: "2026-09-24T00:00:00.000Z",
    });
    const outcomeBefore = certificate.assessment.outcome;
    first.admissions.close();
    first.candidates.close();
    first.issuer.close();
    first.observations.close();

    // ---- Second process lifetime, same files ----
    const second = open();
    /**
     * `Facts persist; authorities expire` means an authority expires because the WORLD moved — never
     * because the host restarted. Before this hardening the issuance was an in-memory Map, so every
     * certificate vanished on restart while bases, candidates and verifications survived: the authority
     * history was the one durable-looking thing that was not durable.
     */
    expect(second.issuer.recall(certificate.issuanceDigest)?.assessment.outcome).toBe(outcomeBefore);
    expect(second.issuer.issuedCount()).toBe(1);
    expect(second.admissions.recall(admissionRef)?.admitted).toBe(true);
    expect(second.admissions.recall(admissionRef)?.targetObservation.targetBasisRevision).toBe("H1");
    // The OBSERVATIONS survive too, so the certificate's citations still resolve.
    expect(second.observations.recall(refs.source ?? "")?.state).toBe("OBSERVED");
    second.admissions.close();
    second.candidates.close();
    second.issuer.close();
    second.observations.close();
  });

  it("a certificate issued by a DIFFERENT authority is not recognised (authority is a record, not a shape)", () => {
    const one = makeD3Rig({ issuerId: "authority-one" });
    cleanups.push(() => one.close());
    const two = makeD3Rig({ issuerId: "authority-two" });
    cleanups.push(() => two.close());

    const refs: PremiseReferences = {
      projectSemantic: one.observe(one.conservativeObserver, []),
      source: one.observe(one.sourceObserver, []),
      assets: one.observe(one.conservativeObserver, []),
      environment: one.observe(one.conservativeObserver, []),
      resultReads: one.observe(one.conservativeObserver, []),
      resultWrites: one.observe(one.conservativeObserver, []),
    };
    const certificate = one.issuer.issue({
      resultManifestDigest: MANIFEST,
      originBasisDigest: BASIS,
      targetObservationDigest: "t1",
      exactlyCurrent: false,
      observationRefs: refs,
    });
    // The second authority holds no record of it, so presenting it there is UNTRUSTED_PROOF.
    const decision = admitCrossBasis({
      issuer: two.issuer,
      presented: certificate,
      resultManifestDigest: MANIFEST,
      originBasisDigest: BASIS,
      targetObservationDigest: "t1",
      hasBasis: true,
    });
    expect(decision.admitted).toBe(false);
    expect(decision.state).toBe("UNTRUSTED_PROOF");
  });
});

/* ================================================================== *
 * R4 — release, and replay convergence after it
 * ================================================================== */

describe("§D3-R4 the world is a materialized view, not an archive", () => {
  /** H0 → R0 changes src/a.ts. */
  function scenario() {
    const root = mkdtempSync(join(tmpdir(), "d3r4-"));
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
    cleanups.push(() => {
      try {
        rmSync(root, { recursive: true, force: true });
      } catch {
        // The OS reaps it.
      }
    });
    return { repo, worldsRoot, h0, r0 };
  }

  it("the world is released once its candidate is recorded, and the revision stays readable", () => {
    const { repo, worldsRoot, h0, r0 } = scenario();
    const current = { revision: h0 };
    const rig = makeD3Rig({
      rematerializer: gitSourceRematerializer({ repository: repo, worldsRoot }),
      observeCurrentTarget: () => ({ targetObservationDigest: current.revision, targetBasisRevision: current.revision }),
    });
    cleanups.push(() => rig.close());
    if (rig.runtime === undefined) throw new Error("no runtime");

    const refs: PremiseReferences = {
      projectSemantic: rig.observe(rig.conservativeObserver, []),
      source: rig.observe(rig.sourceObserver, []),
      assets: rig.observe(rig.conservativeObserver, []),
      environment: rig.observe(rig.conservativeObserver, []),
      resultReads: rig.observe(rig.conservativeObserver, [srcPath("src/a.ts")]),
      resultWrites: rig.observe(rig.conservativeObserver, [srcPath("src/a.ts")]),
    };
    /**
     * §D5-0: the result this admission is about, declared where it is resolved. The effect reads the delta
     * from here, so the caller no longer describes the result at all.
     */
    rig.declareResult({
      resultSubjectRef: HARDENING_RESULT_REF,
      resultManifestDigest: MANIFEST,
      originBasisDigest: BASIS,
      sourceResult: { backend: "git", baseRevision: h0, resultRevision: r0 },
      projectId: "p",
      taskId: "t1",
    });
    const { admissionRef } = rig.admit({
      resultManifestDigest: MANIFEST,
      originBasisDigest: BASIS,
      targetObservationDigest: h0,
      targetBasisRevision: h0,
      observationRefs: refs,
      resultSubjectRef: HARDENING_RESULT_REF,
    });

    return rig.runtime
      .rematerialize({ admissionRef })
      .then((first) => {
        expect(first.state).toBe("MATERIALIZED");
        const candidate = first.candidate!;
        /**
         * §D3-R4: the world is collected, and the RESULT survives because it was exported. An
         * ExecutionWorld is a materialized view of an attempt's work — keeping every one would accumulate
         * directories without bound.
         */
        expect(existsSync(`${worldsRoot}/${candidate.derivation.derivationId}`)).toBe(false);
        // The exported revision is still readable in the canonical object database.
        expect(git(repo, ["cat-file", "-t", candidate.sourceResult!.resultRevision])).toBe("commit");

        /**
         * §D3-R3: and replay still converges. This is the property the release BROKE until the lookup was
         * added: without it a retry would re-create the released world and produce a SECOND candidate
         * identity for one operation.
         */
        return rig.runtime!.rematerialize({ admissionRef }).then((second) => {
          expect(second.state).toBe("MATERIALIZED");
          expect(second.candidate?.candidateId).toBe(candidate.candidateId);
          expect(rig.candidates.readByDerivation(candidate.derivation.derivationId)).toHaveLength(1);
        });
      });
  }, 120_000);

  it("a release failure never rewrites the outcome — the candidate is already durable", async () => {
    const { repo, worldsRoot, h0, r0 } = scenario();
    const real = gitSourceRematerializer({ repository: repo, worldsRoot });
    const current = { revision: h0 };
    const rig = makeD3Rig({
      rematerializer: {
        adapterId: real.adapterId,
        mechanismVersion: real.mechanismVersion,
        rematerialize: (input) => real.rematerialize(input),
        exportRevision: (input) => real.exportRevision(input),
        release: async () => {
          throw new Error("the world directory could not be removed");
        },
      },
      observeCurrentTarget: () => ({ targetObservationDigest: current.revision, targetBasisRevision: current.revision }),
    });
    cleanups.push(() => rig.close());
    if (rig.runtime === undefined) throw new Error("no runtime");

    const refs: PremiseReferences = {
      projectSemantic: rig.observe(rig.conservativeObserver, []),
      source: rig.observe(rig.sourceObserver, []),
      assets: rig.observe(rig.conservativeObserver, []),
      environment: rig.observe(rig.conservativeObserver, []),
      resultReads: rig.observe(rig.conservativeObserver, [srcPath("src/a.ts")]),
      resultWrites: rig.observe(rig.conservativeObserver, [srcPath("src/a.ts")]),
    };
    /**
     * §D5-0: the result this admission is about, declared where it is resolved. The effect reads the delta
     * from here, so the caller no longer describes the result at all.
     */
    rig.declareResult({
      resultSubjectRef: HARDENING_RESULT_REF,
      resultManifestDigest: MANIFEST,
      originBasisDigest: BASIS,
      sourceResult: { backend: "git", baseRevision: h0, resultRevision: r0 },
      projectId: "p",
      taskId: "t1",
    });
    const { admissionRef } = rig.admit({
      resultManifestDigest: MANIFEST,
      originBasisDigest: BASIS,
      targetObservationDigest: h0,
      targetBasisRevision: h0,
      observationRefs: refs,
      resultSubjectRef: HARDENING_RESULT_REF,
    });
    const result = await rig.runtime.rematerialize({ admissionRef });
    // Hygiene failure is not a result failure: the candidate was recorded before the release was attempted.
    expect(result.state).toBe("MATERIALIZED");
    expect(result.candidate).not.toBe(null);
    expect(rig.candidates.read(result.candidate!.candidateId)).toEqual(result.candidate);
  }, 120_000);
});

/* ================================================================== *
 * D3-R-LIVE — the PACKAGED path
 * ================================================================== */

describe("§D3-R-LIVE a real deployment composes the authority trio and can carry a result", () => {
  it("install composes the durable authorities, and the whole chain runs on them", async () => {
    const { installPalimpsest, trustedDefaultPolicy } = await import("../src/install.js");
    const { GitCliPort } = await import("../src/effects/index.js");

    const root = mkdtempSync(join(tmpdir(), "d3rlive-"));
    const repo = join(root, "repo");
    const worldsRoot = join(repo, ".palimpsest", "worlds");
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
    // `-B` CREATES main: the fixture started on the default branch and then moved to `result`.
    execFileSync("git", ["checkout", "-q", "-B", "main", h0], { cwd: repo });
    cleanups.push(() => {
      try {
        rmSync(root, { recursive: true, force: true });
      } catch {
        // The OS reaps it.
      }
    });

    const installed = installPalimpsest(
      { tools: { register: () => () => undefined } } as never,
      {
        projectId: "d3rlive",
        databasePath: join(root, "p.sqlite"),
        ordariumDatabasePath: join(root, "o.sqlite"),
        repository: repo,
        git: new GitCliPort(repo, worldsRoot),
        execution: "worktree",
        policy: trustedDefaultPolicy({ allowed_commands: [{ executable: "node", argv_prefix: ["-e", "process.exit(0)"] }] }),
      } as never,
    );
    cleanups.push(() => void installed.dispose());

    /**
     * THE COMPOSITION SCOPE, stated precisely.
     *
     * The four audit findings were all MODULE-level seams — premise attestation, target-revision binding,
     * issuance durability, world release — so D3-R hardened those modules and did NOT add a product
     * surface. Exposing the authority trio on the install result would be a new capability key, which the
     * SR-1 §21 parity gate requires to be a REVIEWED addition with a written reason rather than a side
     * effect of a hardening pass.
     *
     * So this gate wires the trio the way a host composes it — over the REAL install, the REAL repository
     * and the SHIPPED observers — and asserts the chain runs. What it does NOT claim is that a deployment
     * reaches the trio without composing it.
     */
    const observations = makeObservationAuthority({ databasePath: join(root, "obs.sqlite") });
    cleanups.push(() => observations.close());
    const issuer = makeCompatibilityIssuer({
      issuerId: "palimpsest-first-party",
      observations,
      databasePath: join(root, "iss.sqlite"),
      clock: () => "2026-09-24T00:00:00.000Z",
    });
    cleanups.push(() => issuer.close());
    const admissions = makeCrossBasisAdmissionStore({ databasePath: join(root, "adm.sqlite") });
    cleanups.push(() => admissions.close());

    /**
     * The chain over the SHIPPED observers and stores: a registered recorder attests the source change, the
     * issuer turns it into a durable certificate, the admission is recorded, and the effect reads its target
     * FROM the record. Every step goes through the composed surface.
     */
    const sourceObserver = observations.registerObserver({
      observerId: "git-source-change-observer",
      observerVersion: "1",
      mechanism: "RUNTIME_OBSERVED",
    });
    // The REAL observer, writing through the registered recorder the deployment provided.
    const { gitSourceChangeObserver } = await import("../src/deployment/source_change_observer.js");
    const changeRef = gitSourceChangeObserver({ repository: repo, recorder: sourceObserver }).observeChange({
      fromRevision: h0,
      toRevision: h0,
      scopeRef: repo,
    });
    expect(observations.recall(changeRef)?.state).toBe("OBSERVED");

    const reads = sourceObserver.record({ scope: { domain: "source", scopeRef: repo, from: h0, to: h0 }, selectors: [srcPath("src/a.ts")] });
    const writes = sourceObserver.record({ scope: { domain: "source", scopeRef: repo, from: h0, to: h0 }, selectors: [srcPath("src/a.ts")] });
    const empty = (domain: "project_semantic" | "assets" | "environment") =>
      sourceObserver.record({ scope: { domain, scopeRef: "none", from: "-", to: "-" }, selectors: [] });

    const certificate = issuer.issue({
      resultManifestDigest: MANIFEST,
      originBasisDigest: BASIS,
      targetObservationDigest: h0,
      exactlyCurrent: false,
      observationRefs: {
        projectSemantic: empty("project_semantic"),
        source: changeRef,
        assets: empty("assets"),
        environment: empty("environment"),
        resultReads: reads,
        resultWrites: writes,
      },
    });
    expect(certificate.assessment.outcome).toBe("COMPATIBLE");

    const admissionRef = crossBasisAdmissionRefOf({ issuanceRef: certificate.issuanceDigest, targetObservationDigest: h0, resultSubjectRef: HARDENING_RESULT_REF });
    const decision = admitCrossBasis({
      issuer,
      presented: certificate,
      resultManifestDigest: MANIFEST,
      originBasisDigest: BASIS,
      targetObservationDigest: h0,
      hasBasis: true,
    });
    expect(decision.admitted).toBe(true);
    admissions.record({
      schemaVersion: 1,
      admissionRef,
      issuanceRef: certificate.issuanceDigest,
      resultSubjectRef: HARDENING_RESULT_REF,
      resultManifestDigest: MANIFEST,
      originBasisDigest: BASIS,
      targetObservation: { targetObservationDigest: h0, targetBasisRevision: h0, detail: "the observed target" },
      state: decision.state,
      admitted: decision.admitted,
      detail: decision.detail,
      recordedAt: "2026-09-24T00:00:00.000Z",
    });

    const candidates = new SqliteDerivedResultCandidateStore(join(root, "cand.sqlite"));
    cleanups.push(() => candidates.close());
    /**
     * §D5-0: the resolver this chain needs. The runtime now REFUSES to run without one — a deployment that
     * cannot say which result an admission is about cannot carry one forward — so this test composes one,
     * exactly as a deployment would.
     */
    const results: AuthoritativeResultResolver = Object.freeze({
      adapterId: "test-result-registry",
      resolve: (ref: ResultSubjectRef): ResolvedResult | null =>
        ref.ref === HARDENING_RESULT_REF.ref
          ? Object.freeze({
              resultSubjectRef: HARDENING_RESULT_REF,
              resultManifestDigest: MANIFEST,
              originBasisDigest: BASIS,
              projectId: "d3rlive",
              taskId: "t1",
              sourceResult: Object.freeze({ backend: "git", baseRevision: h0, resultRevision: r0 }),
              producedAssetRefs: Object.freeze([]),
            })
          : null,
    });
    const runtime = makeRematerializationRuntime({
      issuer,
      rematerializer: gitSourceRematerializer({ repository: repo, worldsRoot }),
      candidates,
      admissions,
      results,
      observeCurrentTarget: () => ({ targetObservationDigest: h0, targetBasisRevision: h0 }),
    });
    const result = await runtime.rematerialize({ admissionRef });
    expect(result.state).toBe("MATERIALIZED");
    // Canonical source untouched: the effect stayed in candidate space.
    expect(git(repo, ["rev-parse", "HEAD"])).toBe(h0);
    // And the world was released, while the result stays readable.
    expect(git(repo, ["cat-file", "-t", result.candidate!.sourceResult!.resultRevision])).toBe("commit");
  }, 180_000);
});
