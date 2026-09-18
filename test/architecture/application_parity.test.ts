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

import {
  REVIEWED_TOOL_CONTRACT_CHANGES,
  canonicalJson,
  captureApplicationParity,
  compareParity,
  toolContractDigest,
  type ParityCapture,
  type ParityRouteEntry,
  type ParityToolEntry,
} from "../../tools/architecture/index.js";

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
    const added: ParityToolEntry = {
      name: "palimpsest_debug",
      mode: "read-only",
      actions: [],
      description: "",
      parameters: canonicalJson({}),
      contractDigest: toolContractDigest({ name: "palimpsest_debug", mode: "read-only", description: "", parameters: canonicalJson({}) }),
    };
    (live.packagedInstallation.dshTools as ParityToolEntry[]).push(added);
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
    (extra.packagedRoutes as ParityRouteEntry[]).push({ path: "/api/debug", get: "ok:200", post: "ok:200", methods: ["GET"] });
    expect(compareParity(base, extra).some((difference) => difference.detail.includes("unexpected: /api/debug"))).toBe(true);

    const changed = clone();
    const route = changed.packagedRoutes.find((entry) => entry.path === "/api/application/surfaces");
    (route as unknown as { get: string }).get = "error:500";
    expect(compareParity(base, changed).some((difference) => difference.where.endsWith("/api/application/surfaces.GET"))).toBe(true);
  });

  /* SR-1 closure §20 — the accepted-method set is part of the route contract, and it is exactly
     what a static manifest must agree with, so it gets its own mutations. */
  it("P13 a changed accepted-method set fails, in both directions", () => {
    const narrowed = clone();
    const getOnly = narrowed.packagedRoutes.find((entry) => entry.path === "/api/proof/claims")!;
    expect(getOnly.methods).toEqual(["GET"]);
    (getOnly as unknown as { methods: string[] }).methods = ["GET", "POST"];
    expect(compareParity(base, narrowed).some((difference) => difference.where.endsWith("/api/proof/claims.methods"))).toBe(true);

    const widened = clone();
    const postOnly = widened.packagedRoutes.find((entry) => entry.path === "/api/proof/claims/reassess")!;
    expect(postOnly.methods).toEqual(["POST"]);
    (postOnly as unknown as { methods: string[] }).methods = ["POST", "PUT"];
    expect(compareParity(base, widened).some((difference) => difference.where.endsWith("/api/proof/claims/reassess.methods"))).toBe(true);
  });

  it("the fixture's method sets are coherent with its own outcome classes", () => {
    // `methods` is read off the adapter's method guard (via the error detail), so the class alone
    // cannot confirm it: an ACCEPTED method can legitimately answer 400 for a malformed probe body.
    // What the class does pin is the refusal side — the guard always throws InvalidRequest, so a
    // method outside the declared set must be answered 400.
    for (const entry of base.packagedRoutes) {
      expect(entry.methods.length, `${entry.path} accepts no method at all`).toBeGreaterThan(0);
      if (entry.methods.length === 1) {
        const refused = entry.methods[0] === "GET" ? entry.post : entry.get;
        expect(refused, `${entry.path} refuses its non-declared method with something other than 400`).toBe("ok:400");
      }
    }
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

  /**
   * SR-1 closure §8 — the mutation regressions for the EXTENDED contract. A structural extraction
   * moves tool definitions between files; the way it goes wrong is not the tool name disappearing,
   * it is a `required` entry, a property name or an enum narrowing changing quietly while the action
   * list stays byte-identical. Each mutation below keeps `actions` untouched on purpose.
   */
  const mutateTool = (name: string, edit: (schema: Record<string, unknown>) => void): ParityCapture => {
    const live = clone();
    const tool = live.packagedInstallation.dshTools.find((entry) => entry.name === name)!;
    const schema = JSON.parse(tool.parameters) as Record<string, unknown>;
    edit(schema);
    const parameters = canonicalJson(schema);
    (tool as unknown as { parameters: string }).parameters = parameters;
    (tool as unknown as { contractDigest: string }).contractDigest = toolContractDigest({
      name: tool.name,
      mode: tool.mode,
      description: tool.description,
      parameters,
    });
    return live;
  };
  const contractDifference = (live: ParityCapture): string | undefined =>
    compareParity(base, live).find((difference) => difference.where.endsWith(".contract"))?.detail;

  it("P8 a changed required-fields list fails, though the action enum is identical", () => {
    const live = mutateTool("palimpsest_cross_project", (schema) => {
      (schema.required as string[]).push("debugTrace");
    });
    const detail = contractDifference(live);
    expect(detail).toBeDefined();
    expect(detail).toContain("parameters:");
    expect(live.packagedInstallation.dshTools.find((entry) => entry.name === "palimpsest_cross_project")?.actions).toEqual(
      base.packagedInstallation.dshTools.find((entry) => entry.name === "palimpsest_cross_project")?.actions,
    );
  });

  it("P9 a renamed property fails", () => {
    const live = mutateTool("palimpsest_collaborate", (schema) => {
      const properties = schema.properties as Record<string, unknown>;
      properties.branchCount = properties.branchCountHint;
      delete properties.branchCountHint;
    });
    expect(contractDifference(live)).toContain("parameters:");
  });

  it("P10 a narrowed NESTED enum fails, though the action enum is identical", () => {
    // `properties.intent.enum` is one level below the top: exactly the schema detail the
    // name/mode/action-enum fixture could not see.
    const live = mutateTool("palimpsest_collaborate", (schema) => {
      const properties = schema.properties as Record<string, { enum?: string[] }>;
      properties.intent!.enum = properties.intent!.enum!.filter((value) => value !== "PARALLEL_AND_CHECK");
    });
    expect(contractDifference(live)).toContain("parameters:");
    const tool = live.packagedInstallation.dshTools.find((entry) => entry.name === "palimpsest_collaborate")!;
    expect(tool.actions).toEqual(["plan", "run"]);
  });

  it("P11 a changed description fails even with an identical schema", () => {
    const live = clone();
    const tool = live.packagedInstallation.dshTools.find((entry) => entry.name === "palimpsest_attention")!;
    (tool as unknown as { description: string }).description = `${tool.description} (rewritten by the extraction)`;
    (tool as unknown as { contractDigest: string }).contractDigest = toolContractDigest({
      name: tool.name,
      mode: tool.mode,
      description: tool.description,
      parameters: tool.parameters,
    });
    expect(contractDifference(live)).toContain("description changed");
  });

  /* §20 — the reviewed tool-contract allowance. The gate must keep its teeth: the allowance admits
     a DESCRIPTION for the one named tool and nothing else, so a schema or action change smuggled in
     beside an allowed description change still fails, and an unlisted tool still fails on prose. */
  it("P14 a description-only change on a reviewed tool is admitted", () => {
    const live = clone();
    const tool = live.packagedInstallation.dshTools.find((entry) => entry.name === "palimpsest_surfaces")!;
    (tool as unknown as { description: string }).description = `${tool.description} (rewritten)`;
    (tool as unknown as { contractDigest: string }).contractDigest = toolContractDigest({
      name: tool.name,
      mode: tool.mode,
      description: tool.description,
      parameters: tool.parameters,
    });
    expect(contractDifference(live)).toBeUndefined();
    // Admitted, not ignored: the digest really did change, so P14 is not vacuous.
    expect(tool.contractDigest).not.toBe(base.packagedInstallation.dshTools.find((entry) => entry.name === "palimpsest_surfaces")?.contractDigest);
  });

  it("P15 the same reviewed tool still fails on a schema change", () => {
    const live = mutateTool("palimpsest_surfaces", (schema) => {
      (schema.required as string[]).push("debugTrace");
    });
    // Both the description AND the schema differ here, so the "description only" condition must be
    // what rejects it — not the absence of an allowance.
    const tool = live.packagedInstallation.dshTools.find((entry) => entry.name === "palimpsest_surfaces")!;
    (tool as unknown as { description: string }).description = `${base.packagedInstallation.dshTools.find((entry) => entry.name === "palimpsest_surfaces")!.description} (rewritten)`;
    (tool as unknown as { contractDigest: string }).contractDigest = toolContractDigest({
      name: tool.name,
      mode: tool.mode,
      description: tool.description,
      parameters: tool.parameters,
    });
    expect(contractDifference(live)).toContain("parameters:");
  });

  it("P16 the same reviewed tool still fails on an action change", () => {
    const live = clone();
    const tool = live.packagedInstallation.dshTools.find((entry) => entry.name === "palimpsest_surfaces")!;
    (tool as unknown as { actions: string[] }).actions.push("debug_run");
    expect(compareParity(base, live).some((difference) => difference.where.endsWith("palimpsest_surfaces.actions"))).toBe(true);
  });

  it("P17 an unlisted tool still fails on a description change (the allowance is not a class)", () => {
    const live = clone();
    const listed = live.packagedInstallation.dshTools.find((entry) => entry.name === "palimpsest_surfaces")!;
    // The same mutation P14 admits, moved to a tool that is NOT reviewed: it must fail.
    const other = live.packagedInstallation.dshTools.find((entry) => entry.name === "palimpsest_attention")!;
    (other as unknown as { description: string }).description = `${other.description} (rewritten)`;
    (other as unknown as { contractDigest: string }).contractDigest = toolContractDigest({
      name: other.name,
      mode: other.mode,
      description: other.description,
      parameters: other.parameters,
    });
    expect(listed.contractDigest).toBe(base.packagedInstallation.dshTools.find((entry) => entry.name === "palimpsest_surfaces")!.contractDigest);
    expect(contractDifference(live)).toContain("description changed");
  });

  it("P12 the fixture really does pin the full contract, not just the action enum", () => {
    for (const tool of [...base.packagedInstallation.dshTools, ...base.minimalInstallation.dshTools]) {
      expect(tool.description.length, `${tool.name} has no captured description`).toBeGreaterThan(0);
      expect(tool.parameters.startsWith("{"), `${tool.name} has no captured parameter schema`).toBe(true);
      const recomputed = toolContractDigest({
        name: tool.name,
        mode: tool.mode,
        description: tool.description,
        parameters: tool.parameters,
      });
      expect(recomputed, `${tool.name} digest does not cover its recorded contract`).toBe(tool.contractDigest);
      // `parameters` must BE canonical, or a key-order change would read as a contract change.
      expect(canonicalJson(JSON.parse(tool.parameters))).toBe(tool.parameters);
    }
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

  /* §20 continued — the reviewed tool-contract allowance, checked against the LIVE tree.
     `compareParity` cannot check staleness (the fixture predates every allowance by construction),
     so it is checked here, where a real capture of the current tree exists. */
  it("A16 every reviewed tool-contract change is real, and is a description-only change", () => {
    expect(REVIEWED_TOOL_CONTRACT_CHANGES.length).toBeGreaterThan(0);
    const canonicalTools = new Map(
      [...FIXTURE.capture.packagedInstallation.dshTools, ...FIXTURE.capture.minimalInstallation.dshTools].map((tool) => [tool.name, tool]),
    );
    for (const entry of REVIEWED_TOOL_CONTRACT_CHANGES) {
      const canonical = canonicalTools.get(entry.tool);
      expect(canonical, `${entry.tool} is not a canonical tool, so the allowance points at nothing`).toBeDefined();
      const now = live.packagedInstallation.dshTools.find((tool) => tool.name === entry.tool);
      expect(now, `${entry.tool} is no longer in the catalogue, so the allowance is stale`).toBeDefined();
      // Non-stale: the live contract really did change.
      expect(now!.contractDigest, `the ${entry.tool} allowance is stale: its live contract is unchanged`).not.toBe(
        canonical!.contractDigest,
      );
      // Description-only: everything a caller can pass, and everything the mode promises, is identical.
      expect(now!.description).not.toBe(canonical!.description);
      expect(now!.parameters).toBe(canonical!.parameters);
      expect(now!.actions).toEqual(canonical!.actions);
      expect(now!.mode).toBe(canonical!.mode);
      expect(entry.reason.length, `${entry.tool} has no written reason`).toBeGreaterThan(40);
    }
  });

  it("A16 an allowance never names a wildcard, and never repeats a tool", () => {
    const tools = REVIEWED_TOOL_CONTRACT_CHANGES.map((entry) => entry.tool);
    expect(tools.some((tool) => tool.includes("*"))).toBe(false);
    expect(new Set(tools).size).toBe(tools.length);
  });
});
