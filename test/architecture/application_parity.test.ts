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

import { captureApplicationParity, compareParity, type ParityCapture, type ParityRouteEntry, type ParityToolEntry } from "../../tools/architecture/index.js";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const FIXTURE = JSON.parse(
  readFileSync(join(REPO, "test", "fixtures", "sr1", "application-parity.json"), "utf8"),
) as {
  readonly schemaVersion: number;
  readonly provenance: {
    readonly baselineCommit: string;
    readonly baselineTree: string;
    readonly captureCommit: string;
    readonly captureTree: string;
  };
  readonly note: string;
  readonly capture: ParityCapture;
};


/* ================================================================== *
 * SR-1D §14 — parity hardening regressions (P1-P7).
 *
 * The comparison must be EXACT two-way parity: an accidentally ADDED surface, tool, action,
 * route or readiness field is a failure just like a missing one. These tests drive
 * `compareParity` with deliberate mutations, so they hold regardless of what the live tree
 * happens to contain.
 * ================================================================== */

describe("SR-1D §14 the comparison rejects extras, not only omissions", () => {
  const base = FIXTURE.capture;
  const clone = (): ParityCapture => JSON.parse(JSON.stringify(base)) as ParityCapture;

  it("P1 an unexpected application surface fails", () => {
    const live = clone();
    (live.packagedInstallation.applicationSurfaceKeys as string[]).push("accidentalDebugSurface");
    expect(compareParity(base, live).some((difference) => difference.where.includes("applicationSurfaceKeys"))).toBe(true);
  });

  it("P2 an unexpected DSH tool fails", () => {
    const live = clone();
    (live.packagedInstallation.dshTools as ParityToolEntry[]).push({ name: "palimpsest_debug", mode: "read-only", actions: [] });
    expect(compareParity(base, live).some((difference) => difference.detail.includes("unexpected: palimpsest_debug"))).toBe(true);
  });

  it("P3 an unexpected DSH action fails", () => {
    const live = clone();
    const tool = live.packagedInstallation.dshTools.find((entry) => entry.name === "palimpsest_collaborate");
    (tool as unknown as { actions: string[] }).actions.push("debug_run");
    expect(compareParity(base, live).some((difference) => difference.where.endsWith("palimpsest_collaborate.actions"))).toBe(true);
  });

  it("P4 an unexpected HTTP route fails, and a changed outcome class fails", () => {
    const extra = clone();
    (extra.packagedRoutes as ParityRouteEntry[]).push({ path: "/api/debug", get: "ok:200", post: "ok:200" });
    expect(compareParity(base, extra).some((difference) => difference.detail.includes("unexpected: /api/debug"))).toBe(true);

    const changed = clone();
    const route = changed.packagedRoutes.find((entry) => entry.path === "/api/application/surfaces");
    (route as unknown as { get: string }).get = "error:500";
    expect(compareParity(base, changed).some((difference) => difference.where.endsWith("/api/application/surfaces.GET"))).toBe(true);
  });

  it("P5 a changed readiness value fails, and an extra readiness field fails", () => {
    const changed = clone();
    (changed.readiness as Record<string, string>).attention = "ACTIVE";
    expect(compareParity(base, changed).some((difference) => difference.where === "readiness.attention")).toBe(true);

    const extra = clone();
    (extra.readiness as Record<string, string>).debugSurface = "AVAILABLE";
    expect(compareParity(base, extra).some((difference) => difference.where === "readiness.keys")).toBe(true);
  });

  it("the unmutated baseline compares equal to itself (the comparison is not vacuous)", () => {
    expect(compareParity(base, clone())).toEqual([]);
  });
});

describe("SR-1D §8 the capture probes while the runtime is ACTIVE", () => {
  it("P6 the minimal route probe runs before the minimal installation is disposed", () => {
    const order = FIXTURE.capture.order ?? [];
    expect(order.indexOf("minimal:routes")).toBeGreaterThanOrEqual(0);
    expect(order.indexOf("minimal:routes")).toBeLessThan(order.indexOf("minimal:dispose"));
  });

  it("P7 readiness and the packaged route probe run before the deployment is closed", () => {
    const order = FIXTURE.capture.order ?? [];
    expect(order.indexOf("packaged:readiness")).toBeLessThan(order.indexOf("packaged:close"));
    expect(order.indexOf("packaged:routes")).toBeLessThan(order.indexOf("packaged:close"));
  });

  it("the active capture is observably different from a post-close one (the §7 finding)", () => {
    // Probed while active, the minimal installation answers most routes with a surface-absent
    // failure; the previous post-close capture recorded none. The fixture must be the ACTIVE one.
    const absent = FIXTURE.capture.minimalRoutes.filter(
      (route) => route.get.endsWith(":5" + "01") || route.post.endsWith(":5" + "01"),
    );
    expect(absent.length).toBeGreaterThan(50);
  });
});
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

  it("§10 the fixture records unambiguous canonical provenance", () => {
    expect(FIXTURE.schemaVersion).toBe(1);
    expect(FIXTURE.provenance.baselineCommit).toBe("a30a328afbe2850e02151f4e41f32242091abeae");
    expect(FIXTURE.provenance.baselineTree).toBe("83ef6ba115feaae39a4b47c9881ad78fb6df2639");
    // The capture ran on the exact canonical tree, so the control and the baseline are the same.
    expect(FIXTURE.provenance.captureTree).toBe(FIXTURE.provenance.baselineTree);
  });

  it("A13 the HTTP route contract is recorded per method for both installations", () => {
    expect(FIXTURE.capture.packagedRoutes.length).toBeGreaterThanOrEqual(120);
    expect(FIXTURE.capture.minimalRoutes.length).toBe(FIXTURE.capture.packagedRoutes.length);
    // Behavioural method contract, not source text: the surfaces route answers GET and refuses POST
    // (or vice versa) and the fixture records which.
    const surfaces = FIXTURE.capture.packagedRoutes.find((route) => route.path === "/api/application/surfaces");
    expect(surfaces).toBeDefined();
    expect(surfaces?.get).not.toBe(surfaces?.post);
    // Every route is probed with both methods; a route that is unrouted for both is still recorded.
    expect(FIXTURE.capture.packagedRoutes.every((route) => route.get !== "" && route.post !== "")).toBe(true);
  });

  it("§13 readiness keys are recorded and still present", () => {
    expect(FIXTURE.capture.readiness).not.toBeNull();
    expect(Object.keys(FIXTURE.capture.readiness ?? {}).length).toBeGreaterThanOrEqual(8);
    // EXACT map parity: no missing field, no extra field, no changed value (§12).
    expect(live.readiness).toEqual(FIXTURE.capture.readiness);
    expect(live.lifecycle.disposeIsIdempotent).toBe(true);
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
