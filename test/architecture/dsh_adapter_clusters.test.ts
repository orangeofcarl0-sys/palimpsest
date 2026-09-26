/**
 * SR-1 §13/§14/§15/§29 — the DSH adapter cluster's structural closure.
 *
 *   SR1-A05   `defineApplicationTools` is still the aggregate entry both paths reach
 *   SR1-A07-DSH  adapter modules reach no durable store and no semantic service
 *
 * The point of these tests is to make R3A checkable without a source-text census: the layer map,
 * the live import graph and the runtime catalogue are all machine-read, so a new adapter that
 * reaches around the façade — or a compatibility entry that quietly stops being the aggregate —
 * fails here rather than in review.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { analyseModuleArchitecture, isAllowedEdge, layerOf, stripComments, type ModuleArchitecture } from "../../tools/architecture/index.js";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ADAPTERS = "src/adapters/dsh";
const COMPAT_ENTRY = "src/tools/application_tools.ts";

const analysis: ModuleArchitecture = analyseModuleArchitecture(REPO);
const adapterModules = analysis.modules.filter((module) => module.file.startsWith(`${ADAPTERS}/`));

const read = (relative: string): string => readFileSync(join(REPO, relative), "utf8");
const loc = (relative: string): number => read(relative).split("\n").length;

/**
 * §15 A07 — every edge from an adapter to a module BELOW the application layer, with the reason it
 * is a definitional dependency rather than a bypass. These are the same dependencies the monolith
 * had; the extraction moved them, it did not create them, and none of them is a store or a service.
 */
const PERMITTED_BELOW_FACADE: Readonly<Record<string, readonly string[]>> = Object.freeze({
  "src/organization_memory/index.ts": ["VARIANT_KINDS", "VariantKind"],
  "src/proof_asset/index.ts": ["SOURCE_PROVENANCES", "materializeProofSourceRevisionRef"],
  "src/project_workspace/index.ts": ["PROJECT_JOURNAL_KINDS", "ProjectWorkspaceError"],
  "src/interaction/index.ts": ["COLLABORATION_INTENTS", "MAX_BRANCH_HINT", "MIN_BRANCH_HINT"],
  "src/project_management/index.ts": ["MANAGEMENT_INVOLVEMENTS"],
  "src/project_operating/work_mode_profile.ts": ["WORK_MODE_BASE_MODES", "WORK_MODE_MODIFIERS"],
});

/** Named imports an adapter declares from one specifier. */
function importedNames(file: string, specifier: string): string[] {
  const text = read(file);
  const escaped = specifier.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const pattern = new RegExp(`import\\s+(?:type\\s+)?\\{([^}]*)\\}\\s*from\\s*"${escaped}"`, "gu");
  const names = new Set<string>();
  for (const match of text.matchAll(pattern)) {
    for (const raw of match[1]!.split(",")) {
      // An import list may mix kinds inline (`import { a, type B }`); the kind is not the name.
      const name = (raw.trim().split(/\s+as\s+/u).pop()?.trim() ?? "").replace(/^type\s+/u, "");
      if (name !== "") names.add(name);
    }
  }
  return [...names].sort();
}

describe("SR-1 §14 the adapter layer is L5 and only L5", () => {
  it("every module under src/adapters/ is classified L5", () => {
    expect(adapterModules.length).toBeGreaterThanOrEqual(9);
    for (const module of adapterModules) {
      expect(module.layer, `${module.file} is ${module.layer}`).toBe("L5");
      expect(module.unresolvedImports, `${module.file} has unresolved imports`).toEqual([]);
    }
  });

  it("the layer rule rejects L1/L2/L3 → adapters and accepts adapters → application", () => {
    for (const lower of ["L1", "L2", "L3"] as const) {
      expect(isAllowedEdge(lower, "L5"), `${lower} → L5 must be forbidden`).toBe(false);
    }
    expect(isAllowedEdge("L5", "L4"), "adapters → application must be allowed").toBe(true);
    expect(layerOf(`${ADAPTERS}/work.ts`).layer).toBe("L5");
  });

  it("no strongly connected component contains an adapter module (no new adapter cycle)", () => {
    const offending = analysis.stronglyConnectedComponents.filter((component) =>
      component.files.some((file) => file.startsWith("src/adapters/")),
    );
    expect(offending).toEqual([]);
    /**
     * The test is not vacuously true — there ARE cycles, and no adapter is in one.
     *
     * SR-2d1 removed the `controller ↔ graph/canvas` cycle, so the count went 8 → 7. The pin is
     * updated to the measured fact rather than loosened to a range: a NEW cycle must still fail.
     */
    expect(analysis.stronglyConnectedComponents.length).toBe(7);
  });

  it("the checks above are not vacuous: the live graph really does have adapters and cycles", () => {
    expect(adapterModules.length).toBeGreaterThan(0);
    expect(analysis.stronglyConnectedComponents.length).toBeGreaterThan(0);
  });
});

describe("SR-1 §15 A07-DSH adapters do not bypass the application façade", () => {
  it("every adapter import target is a sibling, the façade, the host contract, or a recorded vocabulary", () => {
    const seen = new Set<string>();
    for (const module of adapterModules) {
      for (const target of module.imports) {
        if (target.startsWith(`${ADAPTERS}/`)) continue;
        if (target === "src/application/surface.ts") continue;
        if (target === "src/tools/dsh_types.ts") continue;
        seen.add(target);
        expect(
          Object.keys(PERMITTED_BELOW_FACADE),
          `${module.file} imports ${target}, which is neither the façade nor a recorded vocabulary`,
        ).toContain(target);
      }
    }
    // The recorded set must be exactly the live set: a REMOVED bypass is a finding too, because it
    // would mean this allow-list has drifted away from what the adapters actually do.
    expect([...seen].sort()).toEqual(Object.keys(PERMITTED_BELOW_FACADE).sort());
  });

  it("the imports from below the façade are vocabulary and pure helpers, never a store or a service", () => {
    const storeLike = /(Service|Store|Database|Sqlite|Connection|Repository)$/u;
    for (const [target, permitted] of Object.entries(PERMITTED_BELOW_FACADE)) {
      const actual = adapterModules
        .filter((module) => module.imports.includes(target))
        .flatMap((module) => importedNames(module.file, relativeSpecifier(module.file, target)));
      expect(actual.length, `no adapter imports ${target}`).toBeGreaterThan(0);
      expect(actual.sort()).toEqual([...permitted].sort());
      for (const name of actual) {
        expect(storeLike.test(name), `${target} exports ${name}, which reads like a store or a service`).toBe(false);
      }
    }
  });

  it("no adapter module mentions a durable store or a service API at all", () => {
    const forbidden = /(new\s+DatabaseSync|node:sqlite|new\s+\w*Store\s*\(|createSqliteStore)/u;
    for (const module of adapterModules) {
      expect(forbidden.test(read(module.file)), `${module.file} touches a durable store directly`).toBe(false);
    }
  });
});

describe("SR-1 §15 A05 defineApplicationTools is still the aggregate entry", () => {
  it("the compatibility entry is a shallow re-export and implements nothing", () => {
    const text = read(COMPAT_ENTRY);
    expect(text).toMatch(/export\s*\{\s*defineApplicationTools\s*\}\s*from\s*"\.\.\/adapters\/dsh\/index\.js"/u);
    expect(text).not.toMatch(/\btools\.push\b/u);
    // §10: the old import path keeps working, so the file must stay small.
    expect(loc(COMPAT_ENTRY)).toBeLessThan(20);
  });

  it("the aggregate composes clusters statically, in the frozen order", () => {
    const text = read(`${ADAPTERS}/index.ts`);
    const spreads = [...text.matchAll(/\.\.\.(define\w+Tools)\(application\)/gu)].map((match) => match[1]);
    expect(spreads).toEqual([
      "defineWorkTools",
      "defineFederationTools",
      "defineOrganizationTools",
      "defineCognitionTools",
      "defineProductTools",
      "defineProofTools",
      "defineProjectTools",
      "defineGraphTools",
    ]);
  });

  it("§11 static composition only: no registry, discovery, reflection or dynamic import", () => {
    const forbidden = [
      /await\s+import\s*\(/u,
      /[=(,]\s*import\s*\(/u,
      /\brequire\s*\(/u,
      /\breaddirSync\b|\bglobSync\b/u,
      /\bgetService\s*\(/u,
      /\breflect\b|\bprototype\s*\[/u,
    ];
    for (const file of readdirSync(join(REPO, ADAPTERS))) {
      // Comments are stripped: the aggregate's own doc comment says the words "dynamic import".
      const text = stripComments(read(`${ADAPTERS}/${file}`));
      for (const pattern of forbidden) {
        expect(pattern.test(text), `${ADAPTERS}/${file} matches ${String(pattern)}`).toBe(false);
      }
    }
  });

  it("both import paths reach the SAME function, and it returns the full catalogue", async () => {
    const compat = (await import(
      new URL(`../../dist/src/tools/application_tools.js`, import.meta.url).href
    )) as { readonly defineApplicationTools: unknown };
    const direct = (await import(new URL(`../../dist/src/adapters/dsh/index.js`, import.meta.url).href)) as {
      readonly defineApplicationTools: unknown;
    };
    expect(compat.defineApplicationTools).toBe(direct.defineApplicationTools);
    const tools = (direct.defineApplicationTools as (application: unknown) => readonly { readonly name: string }[])({
      attention: undefined,
    });
    // The work cluster is the aggregate `palimpsest_surfaces` plus the two agent-facing handoffs:
    // `palimpsest_begin` and `palimpsest_finish` (PLMP-LEAN-1 appendices E and A, both recorded in
    // REVIEWED_TOOL_ADDITIONS). All three are unconditional because the Work face is composed in
    // EVERY installation — the minimal one included — so none depends on an optional face.
    expect(tools.map((tool) => tool.name)).toEqual(["palimpsest_surfaces", "palimpsest_finish", "palimpsest_begin"]);
  });
});

describe("SR-1 §29 the split produced no replacement monolith", () => {
  it("the aggregate is shallow and every cluster is cohesive rather than a renamed switchboard", () => {
    // Review flags from §29, used as assertions: an aggregate that grows past these has started
    // accumulating behaviour again.
    const aggregate = read(`${ADAPTERS}/index.ts`);
    expect(loc(`${ADAPTERS}/index.ts`)).toBeLessThanOrEqual(60);
    expect(aggregate).not.toMatch(/\btool\(\s*\{/u);

    const clusterLoc = new Map(
      readdirSync(join(REPO, ADAPTERS))
        .filter((file) => file.endsWith(".ts") && file !== "index.ts" && file !== "common.ts")
        .map((file) => [file, loc(`${ADAPTERS}/${file}`)]),
    );
    expect(clusterLoc.size).toBe(8);
    for (const [file, lines] of clusterLoc) {
      expect(lines, `${ADAPTERS}/${file} is ${String(lines)} lines`).toBeLessThanOrEqual(400);
    }
    // No cluster is empty either: the split must be a real partition, not stubs.
    expect([...clusterLoc.values()].reduce((total, lines) => total + lines, 0)).toBeGreaterThan(800);
  });

  it("the compatibility entry file is the only file left under src/tools for the DSH catalogue", () => {
    const entries = readdirSync(join(REPO, "src/tools")).filter((file) => statSync(join(REPO, "src/tools", file)).isFile());
    expect(entries).toContain("application_tools.ts");
    // The tool definitions no longer live there.
    expect(read("src/tools/application_tools.ts")).not.toMatch(/name:\s*"palimpsest_/u);
  });
});

/**
 * The relative specifier a module uses for a target, or a specifier that cannot match. Adapters
 * import their siblings with `./x.js` and everything else with `../../…`, so this reverses that.
 */
function relativeSpecifier(fromFile: string, target: string): string {
  const fromDirectory = fromFile.split("/").slice(0, -1).join("/");
  const targetDirectory = target.split("/").slice(0, -1).join("/");
  const fromParts = fromDirectory.split("/");
  const targetParts = targetDirectory.split("/");
  let shared = 0;
  while (shared < fromParts.length && shared < targetParts.length && fromParts[shared] === targetParts[shared]) shared++;
  const up = fromParts.length - shared;
  const rest = targetParts.slice(shared).join("/");
  const base = rest === "" ? "." : rest;
  const prefix = up === 0 ? "./" : "../".repeat(up);
  const file = target.split("/").pop()!.replace(/\.ts$/u, ".js");
  return `${prefix}${base === "." ? "" : `${base}/`}${file}`;
}
