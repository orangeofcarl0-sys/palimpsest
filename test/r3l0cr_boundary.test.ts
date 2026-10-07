/**
 * R3-L0C-R §7 — THE REAL-PREHISTORY BOUNDARY PROBE TEST.
 *
 * §7 requires the probe to run against the EXACT real prehistory and association state, with the exact capital
 * assets, associations, selector, packaged runtime and consumer boundary, driven by a scripted actor with NO LLM.
 * It states that a simplified dummy Project is NOT sufficient.
 *
 * WHY THAT PROHIBITION IS THE TEST'S REASON FOR EXISTING. R3-L0C's preflight drove a dummy project, which has no
 * capital associations, so a selection could not resolve against it at all — the dummy refused with
 * `KNOWLEDGE_NOT_PROJECT_ASSOCIATED`. The preflight passed while the real delivery path was broken, because what
 * it exercised was not what runs. This test drives the real thing.
 *
 * THE ACTOR HAS NO FILESYSTEM ESCAPE HATCH. It can only observe what the consumer was handed and read through the
 * governed pull, so a delivery defect cannot be masked by finding the body on disk.
 */
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { buildPrehistory } from "../scripts/r3l0c/build-prehistory.mjs";
import { admitCapital, selectionRefs } from "../scripts/r3l0c/prehistory.mjs";
import { GENERATION_EXPOSURES } from "../scripts/r3l0c/capital.mjs";
import { buildExpectationManifest } from "../scripts/r3l0cr/contract.mjs";
import { probeMatchesExpectation, runRealPrehistoryBoundaryProbe } from "../scripts/r3l0cr/boundary-probe.mjs";

const BASE = join(tmpdir(), "palimpsest-r3l0cr-boundary");

/** The probe is expensive, so it runs once and the assertions read its result. */
let probe: Awaited<ReturnType<typeof runRealPrehistoryBoundaryProbe>>;
let expectation: ReturnType<typeof buildExpectationManifest>;

describe("R3-L0C-R §7 — the real-prehistory deterministic boundary probe", () => {
  it("drives the exact real prehistory and association state with a scripted actor, and no LLM", async () => {
    rmSync(BASE, { recursive: true, force: true });
    const prehistory = await buildPrehistory(BASE);
    const admitted = await admitCapital(BASE, prehistory.paths, "cutover-entitlements", prehistory.world);
    const refs = selectionRefs(admitted);
    /** §7: the EXACT capital assets and associations, from the real admission. */
    expect(admitted.admitted.reasoning.length).toBeGreaterThan(0);
    expect(admitted.admitted.procedure.length).toBeGreaterThan(0);

    expectation = buildExpectationManifest({ generationId: "G1", arm: "C", admittedRefs: refs, generationExposures: GENERATION_EXPOSURES });
    expect(expectation.expectedConsumerVisibleHandles.length).toBeGreaterThan(0);

    probe = await runRealPrehistoryBoundaryProbe({
      projectId: "cutover-entitlements",
      world: prehistory.world,
      paths: prehistory.paths,
      refs,
      generationId: "G1",
      generationExposures: GENERATION_EXPOSURES,
      expectation,
    });
  }, 900_000);

  it("§7 no LLM was invoked and the real prehistory was used, not a dummy", () => {
    expect(probe.noLlmInvoked).toBe(true);
    expect(probe.usedRealPrehistory).toBe(true);
    expect(probe.dummyProject).toBe(false);
  });

  it("§7 the attempt settled without a host error", () => {
    expect(probe.hostError, `the probe reported a host error: ${String(probe.hostError)}`).toBeNull();
    expect(probe.phase).toBe("FINISHED");
  });

  it("§7 the consumer boundary carried EXACTLY the frozen expected handles", () => {
    const match = probeMatchesExpectation(probe, expectation);
    expect(match.matches, `expected [${match.expected.join(", ")}] but the consumer saw [${match.observed.join(", ")}]`).toBe(true);
    expect(probe.missingFromBoundary).toEqual([]);
    expect(probe.failures).toEqual([]);
  });

  it("§7 the scripted actor pulled every handle and resolved the canonical body digests", () => {
    expect(probe.pulls.length).toBe(expectation.expectedConsumerVisibleHandles.length);
    for (const pull of probe.pulls) {
      expect(pull.resolved, `${pull.handle} did not resolve`).toBe(true);
      expect(pull.bodyBytes, `${pull.handle} returned an empty body`).toBeGreaterThan(0);
      expect(pull.bodyDigest, `${pull.handle} has no canonical body digest`).toMatch(/^[0-9a-f]{64}$/u);
    }
  });

  it("§7 both capital halves were delivered, so neither was silently lost", () => {
    const handles = probe.consumerVisibleHandles.join(" ");
    expect(handles).toContain("@ctx/reasoning/");
    expect(handles).toContain("@ctx/procedure/");
    const kinds = probe.consumerVisibleKinds.join(" ");
    expect(kinds.length).toBeGreaterThan(0);
  });

  it("§7 BOUNDARY_PROBE is PASS", () => {
    expect(probe.BOUNDARY_PROBE).toBe("PASS");
  });

  afterAll(() => {
    try {
      rmSync(BASE, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {
      /* the temp hygiene sweep collects it */
    }
  });
});
