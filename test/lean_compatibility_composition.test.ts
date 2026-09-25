/**
 * PLMP-LEAN-1 §D3-b4 — the COMPOSITION proof: the assessor's proof boundary, measured against a REAL
 * repository rather than against fixtures.
 *
 * D2 taught the standing lesson this file exists to honour:
 *
 *     slice correctness  ⇏  composition correctness
 *
 * Every D3-b unit test above builds its own footprints, so none of them can show what the system
 * actually concludes when a real source change is observed through the real git observer against a real
 * completed result. The two scenarios here are chosen to be the two HONEST outcomes:
 *
 *   POSITIVE   a result whose write footprint was OBSERVED at path granularity, against a source change
 *              in a provably different path — and the read side is what decides whether that can be a
 *              proof. With today's repository-wide read access it CANNOT be, which is the finding.
 *
 *   UNKNOWN    the same shape, where the read coverage is unproven. This is the outcome that proves the
 *              packaged runtime does not over-promise for the sake of looking useful.
 *
 * The point is not that the system says COMPATIBLE. The point is that whatever it says is derivable from
 * evidence a caller can point at, and that a coarse read cannot be laundered into a proof by a narrow
 * declaration.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, describe, expect, it } from "vitest";

import { gitSourceChangeObserver } from "../src/deployment/source_change_observer.js";
import { makeD3Rig, type D3Rig } from "./d3_rig.js";
import {
  assessCompatibility,
  covered,
  materializeWorldChangeFootprint,
  noChanges,
  provenComplete,
  sourceChangeFootprintFromPaths,
  unproven,
  wholeRepositoryRead,
  type CoveredFootprint,
} from "../src/project_world/index.js";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");

const cleanups: Array<() => void> = [];
afterAll(() => {
  for (const fn of cleanups) fn();
});

/** The footprint an observation contributes; an UNAVAILABLE premise contributes an UNPROVEN empty set. */
/**
 * §D3-R1: the observer writes through a REGISTERED recorder, so a test observes by building a rig and
 * handing the observer its recorder — exactly as a deployment wires it. The result is an observation REF.
 */
function sourceObserverFor(rig: D3Rig, repo: string) {
  return gitSourceChangeObserver({ repository: repo, recorder: rig.sourceObserver });
}

/** The footprint a recalled observation contributes, for the pure D3-b analyzer. */
function observedFootprint(rig: D3Rig, ref: string): CoveredFootprint {
  const record = rig.observations.recall(ref);
  return record?.footprint ?? { selectors: [], coverage: { status: "UNPROVEN" as const, detail: record?.detail ?? "unobserved" } };
}

const git = (cwd: string, args: readonly string[]): string =>
  execFileSync("git", [...args], { cwd, encoding: "utf8" }).trim();

function repository(): { repo: string; h0: string } {
  const root = mkdtempSync(join(tmpdir(), "palimpsest-d3b4-"));
  const repo = join(root, "repo");
  mkdirSync(join(repo, "src"), { recursive: true });
  mkdirSync(join(repo, "docs"), { recursive: true });
  writeFileSync(join(repo, "src", "parser.ts"), "export const parse = () => 1;\n");
  writeFileSync(join(repo, "src", "network.ts"), "export const send = () => 2;\n");
  writeFileSync(join(repo, "docs", "readme.md"), "# readme\n");
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

/** The empty change parts every scenario needs, so only the source part varies. */
function otherParts() {
  return {
    projectSemantic: noChanges({ coverage: provenComplete("CONSERVATIVE_DOMAIN", "the projection is compared directly") }),
    assets: noChanges({ coverage: provenComplete("CONSERVATIVE_DOMAIN", "no asset dependency is declared") }),
    environment: noChanges({ coverage: provenComplete("CONSERVATIVE_DOMAIN", "no environment dependency is declared") }),
  };
}

describe("§D3-b4 the real source change observer", () => {
  it("names exactly the paths that moved, as a durable OBSERVATION with provenance", () => {
    const { repo, h0 } = repository();
    writeFileSync(join(repo, "src", "network.ts"), "export const send = () => 3;" + String.fromCharCode(10));
    execFileSync("git", ["add", "-A"], { cwd: repo });
    execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "H1"], { cwd: repo });
    const h1 = git(repo, ["rev-parse", "HEAD"]);

    const rig = makeD3Rig();
    cleanups.push(() => rig.close());
    const ref = sourceObserverFor(rig, repo).observeChange({ fromRevision: h0, toRevision: h1, scopeRef: repo });

    /**
     * §D3-R1: the observer returns an observation REF, and the record behind it is what carries the
     * provenance — who observed, by what mechanism, over what scope. That is the difference between a
     * premise somebody established and a premise a caller asserted.
     */
    const record = rig.observations.recall(ref);
    expect(record?.state).toBe("OBSERVED");
    expect(record?.provenance?.observerId).toBe("git-source-change-observer");
    expect(record?.provenance?.mechanism).toBe("RUNTIME_OBSERVED");
    expect(record?.provenance?.scope).toEqual({ domain: "source", scopeRef: repo, from: h0, to: h1 });
    expect(record?.observationRef).toMatch(/^obs-[0-9a-f]{32}$/u);
    expect(record?.footprint?.coverage.status).toBe("PROVEN_COMPLETE");
    expect(record?.selectors).toEqual([{ domain: "source", scope: "path", path: "src/network.ts" }]);
  });

  it("identical revisions record an EMPTY PROVEN change set", () => {
    const { repo, h0 } = repository();
    const rig = makeD3Rig();
    cleanups.push(() => rig.close());
    const ref = sourceObserverFor(rig, repo).observeChange({ fromRevision: h0, toRevision: h0, scopeRef: repo });
    const record = rig.observations.recall(ref);
    expect(record?.selectors).toEqual([]);
    expect(record?.footprint?.coverage.status).toBe("PROVEN_COMPLETE");
  });

  it("an UNCOMPARABLE revision pair is recorded UNAVAILABLE, never a proven empty set", () => {
    const { repo, h0 } = repository();
    const rig = makeD3Rig();
    cleanups.push(() => rig.close());
    const ref = sourceObserverFor(rig, repo).observeChange({
      fromRevision: h0,
      toRevision: "0".repeat(40),
      scopeRef: repo,
    });
    // "I could not compare them" must not read as "nothing changed" — that inversion is the whole reason
    // coverage exists, so the record is UNAVAILABLE and carries no footprint at all.
    const record = rig.observations.recall(ref);
    expect(record?.state).toBe("UNAVAILABLE");
    expect(record?.footprint).toBe(null);
    expect(record?.detail).toContain("could not be compared");
  });

  it("a rename names BOTH paths, so an old path's readers see the change", () => {
    const { repo, h0 } = repository();
    execFileSync("git", ["mv", "src/network.ts", "src/transport.ts"], { cwd: repo });
    execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "rename"], { cwd: repo });
    const after = git(repo, ["rev-parse", "HEAD"]);
    const rig = makeD3Rig();
    cleanups.push(() => rig.close());
    const ref = sourceObserverFor(rig, repo).observeChange({ fromRevision: h0, toRevision: after, scopeRef: repo });
    const paths = (rig.observations.recall(ref)?.selectors ?? []).map((selector) =>
      selector.domain === "source" && selector.scope === "path" ? selector.path : "",
    );
    expect(paths.sort()).toEqual(["src/network.ts", "src/transport.ts"]);
  });
});

describe("§D3-b4 the packaged composition: what the system actually concludes", () => {
  it("POSITIVE-shaped: an observed result write against a provably disjoint source change", () => {
    const { repo, h0 } = repository();
    const rig = makeD3Rig();
    cleanups.push(() => rig.close());
    // A result that changed exactly one path, observed by the diff the product already takes.
    writeFileSync(join(repo, "src", "parser.ts"), "export const parse = () => 42;\n");
    execFileSync("git", ["add", "-A"], { cwd: repo });
    execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "result"], { cwd: repo });
    const resultRevision = git(repo, ["rev-parse", "HEAD"]);
    const resultWrite = sourceChangeFootprintFromPaths({
      paths: git(repo, ["diff", "--name-only", `${h0}..${resultRevision}`]).split("\n").filter((line) => line !== ""),
    });
    expect(resultWrite.selectors).toEqual([{ domain: "source", scope: "path", path: "src/parser.ts" }]);

    // The world then moves in a DIFFERENT path.
    writeFileSync(join(repo, "src", "network.ts"), "export const send = () => 9;\n");
    execFileSync("git", ["add", "-A"], { cwd: repo });
    execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "world moves"], { cwd: repo });
    const worldRevision = git(repo, ["rev-parse", "HEAD"]);
    const change = sourceObserverFor(rig, repo).observeChange({
      fromRevision: resultRevision,
      toRevision: worldRevision,
      scopeRef: repo,
    });
    expect(observedFootprint(rig, change).selectors).toEqual([{ domain: "source", scope: "path", path: "src/network.ts" }]);

    /**
     * THE FINDING. The write side is provably disjoint, and the read side is the WHOLE REPOSITORY —
     * because nothing narrowed it and nothing enforced a narrower set. So the change overlaps the read
     * footprint and the honest outcome is INCOMPATIBLE, not COMPATIBLE.
     *
     * This is not a defect to be fixed by declaring a narrower read scope: the declaration would be
     * unenforced, which is exactly the laundering the coverage rule exists to prevent.
     */
    const withRepositoryRead = assessCompatibility({
      resultManifestDigest: "manifest-real",
      originBasisDigest: "basis-real",
      targetObservationDigest: worldRevision,
      exactlyCurrent: false,
      change: materializeWorldChangeFootprint({ ...otherParts(), source: observedFootprint(rig, change) }),
      reads: wholeRepositoryRead(),
      writes: resultWrite,
    });
    expect(withRepositoryRead.outcome).toBe("INCOMPATIBLE");
    expect(withRepositoryRead.conflicts.map((entry) => entry.kind)).toEqual(["read_invalidation"]);
    // The WRITE side really was proven disjoint, so the conflict is entirely about the read.
    expect(withRepositoryRead.disjointnessProofs.some((proof) => proof.side === "write")).toBe(true);

    // And with the write side alone considered (no read dependency at all) the same change IS compatible
    // — which shows the machinery can produce a positive proof, and that the read footprint is what
    // currently blocks one.
    const writeOnly = assessCompatibility({
      resultManifestDigest: "manifest-real",
      originBasisDigest: "basis-real",
      targetObservationDigest: worldRevision,
      exactlyCurrent: false,
      change: materializeWorldChangeFootprint({ ...otherParts(), source: observedFootprint(rig, change) }),
      reads: covered({ selectors: [], coverage: provenComplete("CONSERVATIVE_DOMAIN", "this result declares no read dependency") }),
      writes: resultWrite,
    });
    expect(writeOnly.outcome).toBe("COMPATIBLE");
    expect(writeOnly.conflicts).toEqual([]);
  }, 120_000);

  it("UNKNOWN: an UNPROVEN read coverage is never laundered into a proof by a narrow declaration", () => {
    const { repo, h0 } = repository();
    const rig = makeD3Rig();
    cleanups.push(() => rig.close());
    writeFileSync(join(repo, "src", "network.ts"), "export const send = () => 7;\n");
    execFileSync("git", ["add", "-A"], { cwd: repo });
    execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "world moves"], { cwd: repo });
    const after = git(repo, ["rev-parse", "HEAD"]);
    const change = sourceObserverFor(rig, repo).observeChange({ fromRevision: h0, toRevision: after, scopeRef: repo });

    // A result that DECLARES it reads only `src/parser.ts`. Nothing enforced that, so the declared
    // footprint is not a proof of completeness — and the narrow declaration buys nothing.
    const declaredRead: CoveredFootprint = covered({
      selectors: [{ domain: "source", scope: "path", path: "src/parser.ts" }],
      coverage: unproven("the work declared a read scope and nothing enforced it, while the world grants repository-wide read access"),
    });
    const assessment = assessCompatibility({
      resultManifestDigest: "manifest-declared",
      originBasisDigest: "basis-declared",
      targetObservationDigest: after,
      exactlyCurrent: false,
      change: materializeWorldChangeFootprint({ ...otherParts(), source: observedFootprint(rig, change) }),
      reads: declaredRead,
      writes: covered({ selectors: [], coverage: provenComplete("CONSERVATIVE_DOMAIN", "no write declared") }),
    });
    // The selectors look disjoint — `src/parser.ts` vs `src/network.ts` — and the outcome is still not
    // a proof. This is the packaged runtime declining to over-promise.
    expect(assessment.outcome).toBe("UNKNOWN");
    expect(assessment.outcome).not.toBe("COMPATIBLE");
    expect(assessment.unknowns.map((entry) => entry.part)).toContain("read_coverage");
    expect(assessment.disjointnessProofs).toEqual([]);
  }, 120_000);
});
