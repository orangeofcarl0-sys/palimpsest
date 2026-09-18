/**
 * SR1-A10/A11/A12/A15 — golden structural parity (§21, §30).
 *
 * The fixture is captured from the EXACT canonical baseline
 * `a30a328afbe2850e02151f4e41f32242091abeae` by
 * `node scripts/audit/application-parity.mjs --tree <baseline> --write`, and this test compares
 * the refactored tree against it. It is never regenerated from the tree it guards.
 *
 * What it proves for TWO equivalent installations (a packaged one with the collaboration bundle,
 * and a minimal one where the ABSENCE behaviour lives):
 *
 *   A10 capability absence parity   — the same capability keys exist, and the same ones are
 *                                     absent instead of stubbed
 *   A11 application availability    — the same aggregate application surface keys are present
 *   A12 DSH catalogue parity        — the same tool names, the same modes, the same action sets
 *   A15 product tool contract parity— `palimpsest_collaborate` and `palimpsest_cross_project`
 *                                     are in that catalogue with their qualified action sets
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";

import { captureApplicationParity, compareParity, type ParityCapture } from "../../tools/architecture/index.js";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const FIXTURE = JSON.parse(
  readFileSync(join(REPO, "test", "fixtures", "sr1", "application-parity.json"), "utf8"),
) as { readonly note: string; readonly capture: ParityCapture };

describe("SR-1C §21 golden structural parity", () => {
  // Captured once, before the assertions: the two installations are launched and disposed.
  let live: ParityCapture;
  beforeAll(async () => {
    live = await captureApplicationParity(REPO);
  }, 120_000);

  it("A10/A11/A12 every recorded capability, face, tool and action set still exists", () => {
    const differences = compareParity(FIXTURE.capture, live);
    expect(differences).toEqual([]);
  });

  it("the fixture is a baseline capture, and it is not vacuous", () => {
    expect(FIXTURE.note).toContain("a30a328afbe2850e02151f4e41f32242091abeae");
    expect(FIXTURE.capture.packagedInstallation.dshTools.length).toBeGreaterThanOrEqual(10);
    expect(FIXTURE.capture.packagedInstallation.applicationSurfaceKeys.length).toBeGreaterThanOrEqual(8);
    expect(FIXTURE.capture.packagedInstallation.installedCapabilityKeys.length).toBeGreaterThanOrEqual(10);
  });

  it("A10 the minimal installation really does show absence, not stubs", () => {
    // A minimal install composes the Work face and nothing else; the optional capabilities are
    // absent KEYS, which is exactly the property §15 protects.
    expect(FIXTURE.capture.minimalInstallation.applicationSurfaceKeys).toEqual(["work"]);
    expect(FIXTURE.capture.minimalInstallation.dshTools.map((tool) => tool.name)).toEqual(["palimpsest_surfaces"]);
    expect(live.minimalInstallation.applicationSurfaceKeys).toEqual(FIXTURE.capture.minimalInstallation.applicationSurfaceKeys);
    expect(live.minimalInstallation.dshTools.map((tool) => tool.name)).toEqual(
      FIXTURE.capture.minimalInstallation.dshTools.map((tool) => tool.name),
    );
  });

  it("A15 the two live-qualified product tools keep their qualified contract", () => {
    for (const tool of ["palimpsest_collaborate", "palimpsest_cross_project"]) {
      const entry = live.packagedInstallation.dshTools.find((candidate) => candidate.name === tool);
      expect(entry, `${tool} must remain in the packaged catalogue`).toBeDefined();
      expect(entry?.mode, `${tool} must remain mutating`).toBe("mutating");
    }
    expect(live.packagedInstallation.dshTools.find((tool) => tool.name === "palimpsest_collaborate")?.actions).toEqual([
      "plan",
      "run",
    ]);
    expect(live.packagedInstallation.dshTools.find((tool) => tool.name === "palimpsest_cross_project")?.actions).toEqual([
      "projects",
      "prepare",
      "ask",
      "status",
      "pending",
      "respond",
      "receive",
      "acknowledge",
    ]);
  });
});
