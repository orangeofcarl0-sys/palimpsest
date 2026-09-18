/**
 * SR-1 §25/§26 — the composition root and the application surface closure.
 *
 *   SR1-A03  `install.ts` stays a composition root rather than an assembly monolith
 *   SR1-A04  the application surface is composed, not implemented
 *
 * Both are measured from the architecture graph rather than from a source-text census, so they keep
 * holding if the files are renamed or moved. For A04 the graph can prove the shape only up to a
 * point — "the factory composes several cluster modules" is a fact about imports — so the narrow
 * dependency input of each cluster is additionally checked directly on the modules, which is the
 * property that keeps a cluster from reaching back into the whole surface.
 */

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  analyseModuleArchitecture,
  stripComments,
  type ModuleArchitecture,
  type ModuleNode,
} from "../../tools/architecture/index.js";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (relative: string): string => readFileSync(join(REPO, relative), "utf8");
const loc = (relative: string): number => read(relative).split("\n").length;
const analysis: ModuleArchitecture = analyseModuleArchitecture(REPO);
const byFile = new Map<string, ModuleNode>(analysis.modules.map((module) => [module.file, module]));
const nodeOf = (file: string): ModuleNode => {
  const node = byFile.get(file);
  if (node === undefined) throw new Error(`no module ${file}`);
  return node;
};

/** Direct imports of a module, as the live graph sees them. */
const importsOf = (file: string): readonly string[] => nodeOf(file).imports;

describe("SR-1 §25 A03 install.ts stays a composition root", () => {
  it("its fan-out is bounded and every import is a composition module", () => {
    const install = nodeOf("src/install.ts");
    // §25: a ceiling, not a brittle exact value — the point is that install.ts may not grow back
    // into an assembly file.
    expect(install.fanOut, `install.ts fan-out is ${String(install.fanOut)}`).toBeLessThanOrEqual(20);

    const compositionImports = importsOf("src/install.ts").filter((file) => file.startsWith("src/composition/"));
    expect(compositionImports.length).toBeGreaterThanOrEqual(8);
    // Everything it imports beyond the composition root must be one of a handful of contract or
    // vocabulary modules, never a capability family.
    const outside = importsOf("src/install.ts").filter((file) => !file.startsWith("src/composition/"));
    expect(outside.sort()).toEqual(["src/experiment/index.ts", "src/interaction/index.ts", "src/tools/dsh_types.ts"]);
  });

  it("its direct L2/L3 implementation-family imports stay under the §25 ceiling of 8", () => {
    const families = importsOf("src/install.ts").filter((file) => {
      const layer = byFile.get(file)?.layer;
      return layer === "L2" || layer === "L3";
    });
    expect(families.length, `direct capability-family imports: ${families.join(", ")}`).toBeLessThanOrEqual(8);
    expect(families.length).toBe(2);
  });

  it("the composition root is where the assembly lives, and it is decomposed", () => {
    const modules = readdirSync(join(REPO, "src", "composition")).filter((file) => file.endsWith(".ts"));
    expect(modules.length).toBeGreaterThanOrEqual(8);
    // No single composition module is allowed to become the new monolith.
    for (const file of modules) {
      const lines = loc(`src/composition/${file}`);
      expect(lines, `src/composition/${file} is ${String(lines)} lines`).toBeLessThanOrEqual(700);
    }
  });
});

describe("SR-1 §26 A04 the application surface is composed, not implemented", () => {
  it("surface.ts is a compatibility barrel with no implementation", () => {
    expect(loc("src/application/surface.ts")).toBeLessThanOrEqual(60);
    // Comments are stripped: this file's own doc comment names the wildcard it must NOT use.
    const text = stripComments(read("src/application/surface.ts"));
    expect(text).not.toMatch(/\bfunction\s|=>\s*\{/u);
    // It re-exports explicitly: a wildcard over the clusters would publish internal wiring (§4).
    expect(text).not.toContain("export *");
  });

  it("the factory composes several cluster modules rather than containing them", () => {
    const factory = nodeOf("src/application/factory.ts");
    const clusters = factory.imports.filter((file) => file.startsWith("src/application/surfaces/"));
    expect(clusters.length).toBeGreaterThanOrEqual(8);
    // And the factory itself does not grow into the monolith it replaced.
    expect(loc("src/application/factory.ts")).toBeLessThanOrEqual(350);
    // Exactly two modules import a cluster, and their roles differ: the factory CALLS the
    // constructors, and the compatibility barrel re-exports the façade TYPES. Nothing else sees a
    // cluster at all, which is what makes the split a real boundary.
    for (const cluster of clusters) {
      const importers = [...(byFile.get(cluster)?.importers ?? [])].sort();
      expect(importers, `${cluster} has an unexpected importer`).toEqual([
        "src/application/factory.ts",
        "src/application/surface.ts",
      ]);
    }
    // The barrel's cluster imports are type-only: a value re-export would republish a constructor.
    const surfaceText = stripComments(read("src/application/surface.ts"));
    const clusterExports = [...surfaceText.matchAll(/export\s+(type\s+)?\{[^}]*\}\s*from\s*"\.\/surfaces\/[^"]+";/gu)];
    expect(clusterExports.length).toBeGreaterThanOrEqual(8);
    for (const match of clusterExports) {
      expect(match[1], `surface.ts value-re-exports from a cluster: ${match[0].slice(0, 60)}`).toBe("type ");
    }
  });

  it("each cluster declares a narrow dependency input instead of taking the aggregate", () => {
    // The property that keeps a cluster from reaching back into every surface: it names the exact
    // dependencies it reads. Checked on the source because it is a type-level fact, and paired with
    // the graph check above that only the factory composes clusters.
    const files = readdirSync(join(REPO, "src", "application", "surfaces")).filter((file) => file.endsWith(".ts"));
    expect(files.length).toBe(8);
    for (const file of files) {
      const text = read(`src/application/surfaces/${file}`);
      expect(text, `${file} declares no narrow *SurfaceDeps input`).toMatch(/export interface \w+SurfaceDeps \{/u);
      // A cluster must never take `ApplicationSurfaceDeps` — that is the aggregate, and passing it
      // down would make every cluster depend on every capability again.
      expect(text, `${file} takes the aggregate ApplicationSurfaceDeps`).not.toContain("ApplicationSurfaceDeps");
    }
  });

  it("no cluster module is a second truth store or a composition root", () => {
    for (const file of readdirSync(join(REPO, "src", "application", "surfaces")).filter((entry) => entry.endsWith(".ts"))) {
      const relative = `src/application/surfaces/${file}`;
      const lines = loc(relative);
      expect(lines, `${relative} is ${String(lines)} lines`).toBeLessThanOrEqual(400);
      expect(read(relative), `${relative} opens a durable store`).not.toMatch(/new\s+DatabaseSync|node:sqlite/u);
    }
  });
});
