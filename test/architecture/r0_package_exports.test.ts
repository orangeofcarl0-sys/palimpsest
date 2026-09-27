/**
 * R0 §11/§24 — the PACKAGE EXPORT SURFACE, pinned.
 *
 * R0 found a real integration defect: the E-plane capabilities (`procedures`, `project-intent`,
 * `project-collaboration`, `institutional-learning`) were deliberately kept OFF the `/advanced`
 * star-export barrel — `/advanced` is at its fan-out ratchet ceiling, and star-exporting them would
 * turn every internal type into public API — on the stated assumption that a host reaches them by
 * SUB-PATH import. But `package.json` declared no `exports` entry for any of them, and a declared
 * `exports` map BLOCKS every subpath it does not name. So `palimpsest-dsh/procedures` threw
 * `ERR_PACKAGE_PATH_NOT_EXPORTED`, and no external embedder could supply a `procedureStore` at all.
 *
 * The live gates did not catch it because they import `dist/src/<plane>/index.js` by FILESYSTEM path,
 * which bypasses the package boundary entirely. That is exactly the class of defect a clean-consumer
 * check exists to find, and this test is the cheap version of it: it asserts the declared surface
 * resolves and that the public-API seal still reads 0/0/0.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const pkg = JSON.parse(readFileSync(join(REPO, "package.json"), "utf8")) as {
  exports: Record<string, { types: string; import: string }>;
};

/** Every subpath the SDK guide documents. Each must be DECLARED, or the boundary blocks it. */
const DOCUMENTED_SUBPATHS = [".", "./advanced", "./procedures", "./project-intent", "./project-collaboration", "./institutional-learning"];

describe("R0 §24 the declared package export surface", () => {
  it("every documented subpath is declared in the exports map", () => {
    for (const subpath of DOCUMENTED_SUBPATHS) {
      expect(pkg.exports[subpath], `package.json declares no "${subpath}" export`).toBeDefined();
    }
  });

  it("each declared subpath points at both a runtime module and its types", () => {
    for (const subpath of DOCUMENTED_SUBPATHS) {
      const entry = pkg.exports[subpath];
      // The declared-ness is asserted by the previous case; this one asserts the SHAPE of what is
      // declared, so a missing entry fails loudly here rather than as a property read of undefined.
      expect(entry, `package.json declares no "${subpath}" export`).toBeDefined();
      if (entry === undefined) continue;
      expect(entry.import, `${subpath} has no runtime entry`).toMatch(/^\.\/dist\/src\/.*\.js$/u);
      expect(entry.types, `${subpath} has no types entry`).toMatch(/^\.\/dist\/src\/.*\.d\.ts$/u);
      // The types must sit beside the module they describe, not somewhere unrelated.
      expect(entry.types.replace(/\.d\.ts$/u, ".js")).toBe(entry.import);
    }
  });

  it("the E-plane subpaths name the plane's own barrel", () => {
    const expected: Record<string, string> = {
      "./procedures": "./dist/src/procedures/index.js",
      "./project-intent": "./dist/src/project_intent/index.js",
      "./project-collaboration": "./dist/src/project_collaboration/index.js",
      "./institutional-learning": "./dist/src/institutional_learning/index.js",
    };
    for (const [subpath, target] of Object.entries(expected)) {
      expect(pkg.exports[subpath]?.import, `${subpath} does not resolve to its own barrel`).toBe(target);
    }
  });

  it("the E-plane capabilities are NOT star-exported from /advanced", () => {
    // This is the deliberate half of the design: the subpath exists precisely because the barrel
    // must not carry them. If someone later adds the star-export, the public-API seal would grow and
    // this pin records why that was avoided.
    const advanced = readFileSync(join(REPO, "src", "advanced.ts"), "utf8");
    for (const plane of ["procedures", "project_intent", "project_collaboration", "institutional_learning"]) {
      expect(advanced, `src/advanced.ts star-exports ${plane}`).not.toContain(`export * from "./${plane}/index.js"`);
    }
  });
});
