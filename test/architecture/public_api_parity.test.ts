/**
 * SR1-A14 — public API parity (§27/§31).
 *
 * SR-1 may move code, split files and re-wire composition; it may NOT remove an export or
 * change its kind. The baseline is captured from the BUILT declarations of the canonical
 * baseline, so this check measures what a consumer actually sees (`main`/`exports` in
 * package.json are unchanged too — asserted below).
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { checkPublicApiParity, collectPublicApi, type PublicApiBaseline } from "../../tools/architecture/index.js";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ENTRIES = ["dist/src/index.d.ts", "dist/src/advanced.d.ts"] as const;

const baseline = JSON.parse(
  readFileSync(join(REPO, "architecture", "public-api-baseline.json"), "utf8"),
) as PublicApiBaseline;

describe("SR1-A14 public API parity", () => {
  it("every baseline export is still present with the same kind, in both entries", () => {
    const current: Record<string, ReturnType<typeof collectPublicApi>> = {};
    for (const entry of ENTRIES) {
      if (!existsSync(join(REPO, entry))) throw new Error(`missing built declaration ${entry}: run pnpm build`);
      current[entry] = collectPublicApi(REPO, entry);
    }
    const result = checkPublicApiParity(baseline, current);
    expect(result.missing).toEqual([]);
    expect(result.changedKind).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("the snapshot is not vacuous: both entries really do export a large surface", () => {
    expect(baseline.entries["dist/src/index.d.ts"]?.length ?? 0).toBeGreaterThan(50);
    expect(baseline.entries["dist/src/advanced.d.ts"]?.length ?? 0).toBeGreaterThan(1000);
  });

  it("the product-path names SR-1 must never drop are enumerated in the baseline", () => {
    const advanced = new Set((baseline.entries["dist/src/advanced.d.ts"] ?? []).map((item) => item.name));
    const root = new Set((baseline.entries["dist/src/index.d.ts"] ?? []).map((item) => item.name));
    for (const name of [
      "installPalimpsest",
      "launchDeployment",
      "parseDeploymentProfile",
      "makePalimpsestApplicationSurface",
      "defineApplicationTools",
      "handleApplicationRequest",
      "applicationErrorStatus",
      "serveOrchestration",
      "ProjectController",
    ]) {
      expect(advanced.has(name), `advanced is missing the product export ${name}`).toBe(true);
    }
    // The root entry is the frozen contract core, not the whole product.
    expect(root.has("EventStore")).toBe(true);
    expect(root.has("installPalimpsest")).toBe(false);
  });

  it("package.json keeps the same entry points and the same bin", () => {
    const pkg = JSON.parse(readFileSync(join(REPO, "package.json"), "utf8")) as {
      readonly main: string;
      readonly types: string;
      readonly bin: Readonly<Record<string, string>>;
      readonly exports: Readonly<Record<string, unknown>>;
    };
    expect(pkg.main).toBe("./dist/src/index.js");
    expect(pkg.types).toBe("./dist/src/index.d.ts");
    expect(pkg.bin.palimpsest).toBe("./dist/src/cli.js");
    expect(Object.keys(pkg.exports).sort()).toEqual([".", "./advanced"]);
  });

  it("the collector distinguishes values from types", () => {
    const surface = collectPublicApi(REPO, "dist/src/index.d.ts");
    const byName = new Map(surface.names.map((item) => [item.name, item.kind]));
    expect(byName.get("EventStore")).toBe("value");
    expect(byName.get("AtomicFaultHook")).toBe("type");
    expect(surface.names.every((item) => item.from.startsWith("dist/src/"))).toBe(true);
  });
});

/**
 * SR-1 closure §2/§4 — the R2 split leaked 16 internal wiring symbols into `advanced` because
 * `surface.ts` re-exported every cluster with `export *`, publishing each cluster's constructor
 * and its narrow deps input alongside the intended façade types. These regressions pin both halves
 * of the fix: the live entry must be free of them, and the checker must REJECT an addition rather
 * than merely reporting it.
 */
describe("SR1-A14 public API is sealed against refactor leakage", () => {
  const R2_INTERNAL_SYMBOLS = [
    "WorkSurfaceDeps",
    "ProductSurfaceDeps",
    "FederationSurfaceDeps",
    "CognitionSurfaceDeps",
    "ProofSurfaceDeps",
    "ProjectSurfaceDeps",
    "OrganizationSurfaceDeps",
    "ProjectionsSurfaceDeps",
    "makeWorkSurfaces",
    "makeProductSurfaces",
    "makeFederationSurfaces",
    "makeCognitionSurfaces",
    "makeProofSurfaces",
    "makeProjectSurfaces",
    "makeOrganizationSurfaces",
    "makeProjectionsSurfaces",
  ];

  it("the 16 R2-internal wiring symbols are absent from the live public entries", () => {
    for (const entry of ENTRIES) {
      const live = new Set(collectPublicApi(REPO, entry).names.map((item) => item.name));
      for (const name of R2_INTERNAL_SYMBOLS) {
        expect(live.has(name), `${entry} leaks the internal wiring symbol ${name}`).toBe(false);
      }
    }
  });

  it("the compatibility surface publishes every canonical cluster façade type", () => {
    const advanced = new Set(collectPublicApi(REPO, "dist/src/advanced.d.ts").names.map((item) => item.name));
    for (const name of [
      "WorkApplicationSurface",
      "CollaborationApplicationSurface",
      "CrossProjectApplicationSurface",
      "FederationApplicationSurface",
      "AttentionApplicationSurface",
      "BoundaryApplicationSurface",
      "ReasoningApplicationSurface",
      "EmpiricalApplicationSurface",
      "RecipesApplicationSurface",
      "AdvisorApplicationSurface",
      "RecipeExecutionApplicationSurface",
      "ProofApplicationSurface",
      "DisclosureApplicationSurface",
      "ProjectWorkspaceApplicationSurface",
      "ProjectManagementApplicationSurface",
      "MonitorApplicationSurface",
      "VerificationApplicationSurface",
      "ExternalAssetsApplicationSurface",
      "OrganizationApplicationSurface",
      "RuntimeApplicationSurface",
      "CampaignApplicationSurface",
      "DynamicsApplicationSurface",
      "EvolutionApplicationSurface",
      "ProjectionsApplicationSurface",
      "BoundaryWorkspaceReadPort",
    ]) {
      expect(advanced.has(name), `advanced lost the façade type ${name}`).toBe(true);
    }
  });

  it("an ADDED public export fails parity instead of being reported as tolerated", () => {
    const current: Record<string, ReturnType<typeof collectPublicApi>> = {};
    for (const entry of ENTRIES) current[entry] = collectPublicApi(REPO, entry);
    // The unmodified live surface is exact: no additions anywhere.
    expect(checkPublicApiParity(baseline, current).added).toEqual([]);
    expect(checkPublicApiParity(baseline, current).ok).toBe(true);

    // Synthesize the exact failure mode the R2 wildcard produced: one extra public name.
    const entry = "dist/src/advanced.d.ts";
    const withExtra = {
      ...current,
      [entry]: {
        entry,
        names: [...current[entry]!.names, { name: "makeWorkSurfaces", kind: "value" as const, from: "dist/src/application/surfaces/work.d.ts" }],
      },
    };
    const result = checkPublicApiParity(baseline, withExtra);
    expect(result.added).toEqual([{ entry, name: "makeWorkSurfaces" }]);
    expect(result.ok).toBe(false);
  });

  it("the manual mutation probe: a synthetic extra export in the checker's own input is detected", () => {
    // Same assertion stated against a minimal hand-built baseline, so the regression does not
    // depend on the shape of the giant committed snapshot.
    const mini = {
      capturedFrom: "synthetic",
      entries: { "entry.d.ts": [{ name: "Base", kind: "type" as const }] },
    };
    const clean = { "entry.d.ts": { entry: "entry.d.ts", names: [{ name: "Base", kind: "type" as const, from: "entry.d.ts" }] } };
    expect(checkPublicApiParity(mini, clean).ok).toBe(true);
    const dirty = {
      "entry.d.ts": {
        entry: "entry.d.ts",
        names: [
          { name: "Base", kind: "type" as const, from: "entry.d.ts" },
          { name: "InternalWiring", kind: "value" as const, from: "entry.d.ts" },
        ],
      },
    };
    const result = checkPublicApiParity(mini, dirty);
    expect(result.added).toEqual([{ entry: "entry.d.ts", name: "InternalWiring" }]);
    expect(result.ok).toBe(false);
  });
});
