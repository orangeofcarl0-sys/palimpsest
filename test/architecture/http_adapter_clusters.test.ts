/**
 * SR-1 §19–§24 — the HTTP adapter cluster's structural and static closure.
 *
 *   SR1-A06      `handleApplicationRequest` is still the aggregate entry
 *   SR1-A07-HTTP the adapters reach no durable store and no semantic service
 *   SR1-A13      the static route manifest equals the canonical route set
 *
 * A13 has to hold on BOTH halves (§24): the static manifest must describe exactly the canonical
 * routes — which catches a live route the probe inventory never knew about — and the behavioural
 * probe must still match, which the golden parity suite asserts over every route and every method.
 */

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { REVIEWED_ROUTE_ADDITIONS, analyseModuleArchitecture, stripComments, type ModuleArchitecture } from "../../tools/architecture/index.js";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ADAPTERS = "src/adapters/http";
const COMPAT_ENTRY = "src/application/http.ts";
const FIXTURE = JSON.parse(
  readFileSync(join(REPO, "test", "fixtures", "sr1", "application-parity.json"), "utf8"),
) as {
  readonly capture: {
    readonly packagedRoutes: readonly {
      readonly path: string;
      readonly get: string;
      readonly post: string;
      readonly methods: readonly string[];
    }[];
  };
};

const read = (relative: string): string => readFileSync(join(REPO, relative), "utf8");
const loc = (relative: string): number => read(relative).split("\n").length;
const analysis: ModuleArchitecture = analyseModuleArchitecture(REPO);
const adapterModules = analysis.modules.filter((module) => module.file.startsWith(`${ADAPTERS}/`));

/** §19: the manifest is a literal array of cluster manifests, so this is a static import. */
const manifestModule = (await import(new URL(`../../dist/src/adapters/http/router.js`, import.meta.url).href)) as {
  readonly applicationRouteInventory: () => readonly {
    readonly path: string;
    readonly methods: readonly string[];
    readonly face: string | null;
    readonly match: string;
  }[];
  readonly APPLICATION_ROUTE_MANIFEST: readonly {
    readonly path: string;
    readonly match: string;
    readonly methods: readonly string[];
    readonly face: string | null;
    readonly resolveFaceFirst?: boolean;
    readonly covers?: readonly string[];
  }[];
};

const inventory = manifestModule.applicationRouteInventory();

/**
 * §20 — the canonical path/method set. Derived from the golden fixture, which was captured from the
 * canonical baseline. `/api/` is the unrouted control probe (the adapter deliberately answers
 * `undefined` for an unknown API path), so it is excluded from the ROUTED set by its recorded
 * outcome rather than by name.
 */
const canonicalRouted = FIXTURE.capture.packagedRoutes.filter(
  (entry) => entry.get !== "unrouted" || entry.post !== "unrouted",
);
const canonicalPaths = [...canonicalRouted.map((entry) => entry.path)].sort();

describe("SR-1 §20/A13 the static route manifest equals the canonical route set", () => {
  it("the manifest covers exactly the canonical paths, no missing and no unreviewed addition", () => {
    const manifestPaths = [...inventory.map((entry) => entry.path)].sort();
    const reviewed = REVIEWED_ROUTE_ADDITIONS.map((entry) => entry.path);
    const missing = canonicalPaths.filter((path) => !manifestPaths.includes(path));
    const unexpected = manifestPaths.filter((path) => !canonicalPaths.includes(path) && !reviewed.includes(path));
    expect(unexpected, "the manifest declares a route the canonical adapter did not have and that was never reviewed").toEqual([]);
    expect(missing, "the manifest lost a canonical route").toEqual([]);
    // An allowance that outlived the route it was granted for is a stale exception, not a licence.
    expect(reviewed.filter((path) => !manifestPaths.includes(path)), "a reviewed addition is no longer routed").toEqual([]);
    // The count is derived, so it cannot drift: 127 canonical + exactly the reviewed additions.
    expect(manifestPaths.length).toBe(127 + reviewed.length);
  });

  it("every reviewed addition names a concrete path and a reason, like the architecture exceptions", () => {
    expect(REVIEWED_ROUTE_ADDITIONS.length).toBeGreaterThan(0);
    for (const entry of REVIEWED_ROUTE_ADDITIONS) {
      expect(entry.path.startsWith("/api/")).toBe(true);
      expect(entry.reason.length, `${entry.path} has no written reason`).toBeGreaterThan(40);
    }
    // A general wildcard would defeat the gate entirely.
    expect(REVIEWED_ROUTE_ADDITIONS.some((entry) => entry.path.includes("*"))).toBe(false);
  });

  it("the manifest's path set has no duplicate", () => {
    const paths = inventory.map((entry) => entry.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("every manifest route declares the methods the canonical route accepted", () => {
    // §20 needs method sets, and the outcome class alone cannot express them. The fixture's
    // `methods` was derived from the adapter's own guard, so the comparison is exact — with one
    // documented rule: a `resolveFaceFirst` route resolves its face BEFORE the method guard, so in
    // an installation without that surface every method is answered 501 and nothing is refused.
    const expectedFor = (entry: (typeof manifestModule.APPLICATION_ROUTE_MANIFEST)[number]): readonly string[] =>
      entry.resolveFaceFirst === true ? ["GET", "POST", "PUT", "DELETE", "PATCH"] : entry.methods;
    for (const descriptor of manifestModule.APPLICATION_ROUTE_MANIFEST) {
      const covered = [descriptor.path, ...(descriptor.covers ?? [])];
      for (const path of covered) {
        // A reviewed post-baseline addition has no canonical method set to be compared against; it
        // is covered instead by the behavioural probe and by the allowance's own assertions.
        if (REVIEWED_ROUTE_ADDITIONS.some((entry) => entry.path === path)) continue;
        const canonical = canonicalRouted.find((entry) => entry.path === path);
        expect(canonical, `${path} is not a canonical route`).toBeDefined();
        expect(expectedFor(descriptor), `${path} method set differs from canonical`).toEqual([...canonical!.methods]);
      }
    }
  });

  it("the fixture's own method sets are non-trivial: both single-method directions exist", () => {
    // Guard against a fixture where every route read as "accepts everything".
    const single = canonicalRouted.filter((entry) => entry.methods.length === 1);
    expect(single.filter((entry) => entry.methods[0] === "GET").length).toBeGreaterThan(20);
    expect(single.filter((entry) => entry.methods[0] === "POST").length).toBeGreaterThan(20);
  });

  it("every canonical route is described by the manifest with a face or as the discovery route", () => {
    for (const entry of inventory) {
      if (entry.path === "/api/application/surfaces") {
        expect(entry.face).toBeNull();
        continue;
      }
      expect(entry.face, `${entry.path} declares no face`).not.toBeNull();
    }
  });
});

describe("SR-1 §21 dispatch precedence is explicit, not accidental", () => {
  it("no two descriptors can match the same pathname", () => {
    // This is what makes the manifest order unobservable: an exact descriptor matches one path, and
    // the two prefix descriptors are in disjoint subtrees. If this ever fails, the order in
    // `APPLICATION_ROUTE_MANIFEST` starts deciding behaviour and must be justified explicitly.
    const descriptors = manifestModule.APPLICATION_ROUTE_MANIFEST;
    const exact = descriptors.filter((descriptor) => descriptor.match === "exact");
    const prefixes = descriptors.filter((descriptor) => descriptor.match === "prefix");

    const exactPaths = exact.map((descriptor) => descriptor.path);
    expect(new Set(exactPaths).size).toBe(exactPaths.length);

    for (const prefix of prefixes) {
      for (const path of [prefix.path, ...(prefix.covers ?? [])]) {
        expect(exactPaths, `${path} is matched both exactly and by the prefix ${prefix.path}`).not.toContain(path);
      }
    }
    // The two prefix routes live in disjoint subtrees.
    const [first, second] = prefixes;
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    expect(first!.path.startsWith(second!.path) || second!.path.startsWith(first!.path)).toBe(false);
  });

  it("the manifest order is the canonical dispatch order", () => {
    // The canonical switchboard's groups, in order. Kept identical so a reviewer diffing the
    // manifest against it sees no reshuffling.
    const groupOf = (path: string): string => {
      if (path.startsWith("/api/application/")) return "work";
      if (path.startsWith("/api/cross-project/") || path.startsWith("/api/collaboration/")) return "product";
      if (path.startsWith("/api/federation/") || path.startsWith("/api/attention") || path.startsWith("/api/boundary/")) return "federation";
      if (/^\/api\/(runtime|organization|campaign|dynamics|evolution)/u.test(path)) return "organization";
      if (/^\/api\/(reasoning|experiments|memory|recipes|advisor)/u.test(path)) return "cognition";
      if (path.startsWith("/api/projection/")) return "projections";
      if (path.startsWith("/api/proof/")) return "proof";
      if (/^\/api\/(project|monitor|verification)/u.test(path)) return "project";
      // `/api/manage/activity*` and the mode-change REQUEST belong to the project cluster in the
      // manifest, before the management tail: the canonical switchboard had exactly that split.
      if (/^\/api\/manage\/(activity|request_work_mode_change)/u.test(path)) return "project";
      if (path.startsWith("/api/external-assets/")) return "externalAssets";
      if (path.startsWith("/api/manage/")) return "management";
      throw new Error(`unclassified route ${path}`);
    };
    const order: string[] = [];
    for (const entry of inventory) {
      const group = groupOf(entry.path);
      if (order[order.length - 1] !== group) {
        expect(order, `${group} appears after ${order[order.length - 1] ?? "(none)"}`).not.toContain(group);
        order.push(group);
      }
    }
    expect(order).toEqual([
      "work",
      "product",
      "federation",
      "organization",
      "cognition",
      "projections",
      "proof",
      "project",
      "externalAssets",
      "management",
    ]);
  });
});

describe("SR-1 §23 A06 handleApplicationRequest is still the aggregate entry", () => {
  it("the compatibility entry exposes exactly the four baseline names and implements nothing", () => {
    const text = read(COMPAT_ENTRY);
    expect(loc(COMPAT_ENTRY)).toBeLessThanOrEqual(25);
    expect(text).not.toMatch(/\bpathname ===|\bstartsWith\("/u);
    expect(text).not.toMatch(/requireSurface|bodyObject/u);
    const exported = [...text.matchAll(/export (?:type )?\{([^}]*)\}/gu)].flatMap((match) =>
      match[1]!.split(",").map((name) => name.trim().replace(/^type\s+/u, "")).filter((name) => name !== ""),
    );
    expect(exported.sort()).toEqual(
      ["ApplicationRouteInput", "ApplicationRouteResult", "applicationErrorStatus", "handleApplicationRequest"].sort(),
    );
  });

  it("the aggregate reaches the SAME function through both import paths", async () => {
    const compat = (await import(new URL(`../../dist/src/application/http.js`, import.meta.url).href)) as {
      readonly handleApplicationRequest: unknown;
      readonly applicationErrorStatus: unknown;
    };
    const router = (await import(new URL(`../../dist/src/adapters/http/router.js`, import.meta.url).href)) as {
      readonly handleApplicationRequest: unknown;
    };
    const common = (await import(new URL(`../../dist/src/adapters/http/common.js`, import.meta.url).href)) as {
      readonly applicationErrorStatus: unknown;
    };
    expect(compat.handleApplicationRequest).toBe(router.handleApplicationRequest);
    expect(compat.applicationErrorStatus).toBe(common.applicationErrorStatus);
  });

  it("§11/§19 static composition only: no registry, discovery, reflection or dynamic import", () => {
    const forbidden = [/await\s+import\s*\(/u, /[=(,]\s*import\s*\(/u, /\brequire\s*\(/u, /\breaddirSync\b|\bglobSync\b/u, /\bgetService\s*\(/u, /\breflect\b/u];
    for (const file of readdirSync(join(REPO, ADAPTERS))) {
      const text = stripComments(read(`${ADAPTERS}/${file}`));
      for (const pattern of forbidden) {
        expect(pattern.test(text), `${ADAPTERS}/${file} matches ${String(pattern)}`).toBe(false);
      }
    }
  });
});

/**
 * §23 A07-HTTP — every edge from an HTTP adapter to a module below the application layer, with why
 * it is a definitional dependency and not a bypass. These are the imports the monolith already had;
 * the extraction moved them and added none.
 */
const PERMITTED_BELOW_FACADE: Readonly<Record<string, readonly string[]>> = Object.freeze({
  "src/project_workspace/index.ts": [
    "ASSOCIATION_KINDS",
    "PROJECT_ASSET_KINDS",
    "PROJECT_JOURNAL_KINDS",
    "PROJECT_JOURNAL_RESOLUTION_STATUSES",
    "ProjectWorkspaceError",
    "parseCanonicalAssetRef",
  ],
  "src/project_management/index.ts": ["MANAGEMENT_INVOLVEMENTS"],
  "src/project_operating/work_mode_profile.ts": ["WORK_MODE_BASE_MODES", "WORK_MODE_MODIFIERS", "WorkModeBaseMode", "WorkModeModifier"],
  "src/organization_memory/index.ts": ["VARIANT_KINDS", "VariantKind"],
  "src/recipes/artifacts.ts": ["CompiledRecipePlan", "parseCompiledRecipePlan", "parseRecipePlan"],
  "src/recipes/execution.ts": ["RecipeExecutionContext"],
  "src/advisor/task_profile.ts": ["TaskProfile", "parseTaskProfile"],
  "src/proof_asset/index.ts": ["SOURCE_PROVENANCES", "parseEvidenceSelector", "parseProofSourceRevisionRef"],
  "src/external_assets/index.ts": [
    "parseExternalAssetImportCandidate",
    "parseExternalAssetPublicationPreview",
    "parseExternalAssetReferenceCandidate",
    "parseExternalAssetStableRef",
  ],
});

function importedNames(file: string, specifier: string): string[] {
  const escaped = specifier.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const pattern = new RegExp(`import\\s+(?:type\\s+)?\\{([^}]*)\\}\\s*from\\s*"${escaped}"`, "gu");
  const names = new Set<string>();
  for (const match of read(file).matchAll(pattern)) {
    for (const raw of match[1]!.split(",")) {
      // An import list may mix kinds inline (`import { a, type B }`); the kind is not the name.
      const name = (raw.trim().split(/\s+as\s+/u).pop()?.trim() ?? "").replace(/^type\s+/u, "");
      if (name !== "") names.add(name);
    }
  }
  return [...names].sort();
}

function relativeSpecifier(fromFile: string, target: string): string {
  const fromDirectory = fromFile.split("/").slice(0, -1).join("/");
  const targetDirectory = target.split("/").slice(0, -1).join("/");
  const fromParts = fromDirectory.split("/");
  const targetParts = targetDirectory.split("/");
  let shared = 0;
  while (shared < fromParts.length && shared < targetParts.length && fromParts[shared] === targetParts[shared]) shared++;
  const up = fromParts.length - shared;
  const rest = targetParts.slice(shared).join("/");
  const prefix = up === 0 ? "./" : "../".repeat(up);
  const file = target.split("/").pop()!.replace(/\.ts$/u, ".js");
  return `${prefix}${rest === "" ? "" : `${rest}/`}${file}`;
}

describe("SR-1 §23 A07-HTTP adapters do not bypass the application façade", () => {
  it("every adapter import target is a sibling, the façade, or a recorded vocabulary", () => {
    const seen = new Set<string>();
    for (const module of adapterModules) {
      for (const target of module.imports) {
        if (target.startsWith(`${ADAPTERS}/`)) continue;
        if (target === "src/application/surface.ts") continue;
        seen.add(target);
        expect(
          Object.keys(PERMITTED_BELOW_FACADE),
          `${module.file} imports ${target}, which is neither the façade nor a recorded vocabulary`,
        ).toContain(target);
      }
    }
    expect([...seen].sort()).toEqual(Object.keys(PERMITTED_BELOW_FACADE).sort());
  });

  it("the imports from below the façade are vocabulary and pure parsers, never a store or a service", () => {
    const storeLike = /(Service|Store|Database|Sqlite|Connection|Repository)$/u;
    for (const [target, permitted] of Object.entries(PERMITTED_BELOW_FACADE)) {
      const actual = [...new Set(adapterModules
        .filter((module) => module.imports.includes(target))
        .flatMap((module) => importedNames(module.file, relativeSpecifier(module.file, target))))];
      expect(actual.length, `no adapter imports ${target}`).toBeGreaterThan(0);
      expect(actual.sort()).toEqual([...permitted].sort());
      for (const name of actual) {
        expect(storeLike.test(name), `${target} exports ${name}, which reads like a store or a service`).toBe(false);
      }
    }
  });

  it("no HTTP adapter opens a database or a store", () => {
    const forbidden = /(new\s+DatabaseSync|node:sqlite|new\s+\w*Store\s*\(|createSqliteStore)/u;
    for (const module of adapterModules) {
      expect(forbidden.test(read(module.file)), `${module.file} touches a durable store directly`).toBe(false);
    }
  });

  it("every adapter module is L5 with no unresolved import", () => {
    expect(adapterModules.length).toBeGreaterThanOrEqual(11);
    for (const module of adapterModules) {
      expect(module.layer, `${module.file} is ${module.layer}`).toBe("L5");
      expect(module.unresolvedImports, `${module.file} has unresolved imports`).toEqual([]);
    }
  });
});

describe("SR-1 §29 the split produced no replacement monolith", () => {
  it("the router is shallow and no cluster is a renamed switchboard", () => {
    expect(loc(`${ADAPTERS}/router.ts`)).toBeLessThanOrEqual(120);
    expect(read(`${ADAPTERS}/router.ts`)).not.toMatch(/\brequireSurface|bodyObject/u);
    const clusterLoc = new Map(
      readdirSync(join(REPO, ADAPTERS))
        .filter((file) => file.endsWith(".ts") && file !== "router.ts" && file !== "common.ts")
        .map((file) => [file, loc(`${ADAPTERS}/${file}`)]),
    );
    expect(clusterLoc.size).toBe(10);
    for (const [file, lines] of clusterLoc) {
      expect(lines, `${ADAPTERS}/${file} is ${String(lines)} lines`).toBeLessThanOrEqual(400);
    }
    expect([...clusterLoc.values()].reduce((total, lines) => total + lines, 0)).toBeGreaterThan(800);
  });

  it("the compatibility entry no longer holds the route table", () => {
    // Comments are stripped: this file's own doc comment quotes the generic
    // `POST /api/advanced {service, method}` tunnel it exists to rule out.
    expect(stripComments(read(COMPAT_ENTRY))).not.toContain("/api/");
  });
});
