/**
 * SR-1 §31 — the change-radius proof, as a test rather than as a paragraph.
 *
 * The claim SR-1 has to earn: a normal product change now touches the semantic owner, the
 * application cluster that exposes it, and the DSH and/or HTTP cluster that fronts it — and it does
 * NOT touch `install.ts`, the `surface.ts` compatibility barrel, or either aggregate switchboard.
 *
 * Three representative changes are used: a CrossProject read action, a Verification read view, and a
 * ProjectWorkspace endpoint. For each, the test asserts where the concern lives AND that the four
 * files a change must not need are genuinely empty of it. The negative half is the part that would
 * silently rot, so it is asserted directly.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { stripComments } from "../../tools/architecture/index.js";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (relative: string): string => readFileSync(join(REPO, relative), "utf8");

/** The files a change must NOT have to touch to stay inside its own radius (§31). */
const OUT_OF_RADIUS = {
  "the composition root": "src/install.ts",
  "the surface compatibility barrel": "src/application/surface.ts",
  "the global DSH switchboard": "src/adapters/dsh/index.ts",
  "the global HTTP switchboard": "src/adapters/http/router.ts",
} as const;

const CHANGES = [
  {
    name: "a CrossProject read action",
    owner: "src/interaction/cross_project.ts",
    application: "src/application/surfaces/product.ts",
    dsh: "src/adapters/dsh/product.ts",
    http: "src/adapters/http/product.ts",
    // An exported member of the read face, plus the route and tool that front it.
    probe: {
      application: "CrossProjectApplicationSurface",
      dsh: "palimpsest_cross_project",
      http: "/api/cross-project/projects",
    },
  },
  {
    name: "a Verification read view",
    owner: "src/project_verification",
    application: "src/application/surfaces/project.ts",
    dsh: "src/adapters/dsh/project.ts",
    http: "src/adapters/http/project.ts",
    probe: {
      application: "VerificationApplicationSurface",
      dsh: "palimpsest_verification",
      http: "/api/verification/status",
    },
  },
  {
    name: "a ProjectWorkspace endpoint",
    owner: "src/project_workspace/index.ts",
    application: "src/application/surfaces/project.ts",
    dsh: "src/adapters/dsh/project.ts",
    http: "src/adapters/http/project.ts",
    probe: {
      application: "ProjectWorkspaceApplicationSurface",
      dsh: "palimpsest_project",
      http: "/api/project/workspace",
    },
  },
] as const;

describe("SR-1 §31 a normal change stays inside its own radius", () => {
  for (const change of CHANGES) {
    it(`${change.name} lives in exactly the expected files`, () => {
      expect(read(change.application), `${change.application} lost ${change.probe.application}`).toContain(
        change.probe.application,
      );
      expect(read(change.dsh), `${change.dsh} lost ${change.probe.dsh}`).toContain(change.probe.dsh);
      expect(read(change.http), `${change.http} lost ${change.probe.http}`).toContain(change.probe.http);
    });

    it(`${change.name} does not require touching the composition root or either switchboard`, () => {
      for (const [label, file] of Object.entries(OUT_OF_RADIUS)) {
        const text = stripComments(read(file));
        expect(text, `${file} (${label}) now mentions ${change.probe.http}`).not.toContain(change.probe.http);
        expect(text, `${file} (${label}) now mentions ${change.probe.dsh}`).not.toContain(change.probe.dsh);
      }
    });
  }

  it("the HTTP aggregate declares no route of its own", () => {
    // Adding a route to an existing cluster must not edit the switchboard. `router.ts` composes
    // cluster manifests and dispatches; it names no concrete route. The only API string it may hold
    // is the bare `/api/` prefix guard, which decides whether the adapter is involved at all.
    const router = stripComments(read("src/adapters/http/router.ts"));
    const concretePaths = [...router.matchAll(/"(\/api\/[a-z-]+\/[^"]*)"/gu)].map((match) => match[1]);
    expect(concretePaths, `router.ts declares routes: ${concretePaths.join(", ")}`).toEqual([]);
    const spreads = [...router.matchAll(/\.\.\.([A-Z_]+_ROUTES)/gu)].map((match) => match[1]);
    expect(spreads.length).toBeGreaterThanOrEqual(8);
  });

  it("the DSH aggregate declares no tool of its own", () => {
    const aggregate = stripComments(read("src/adapters/dsh/index.ts"));
    expect(aggregate).not.toContain("palimpsest_");
    expect(aggregate).not.toMatch(/\btool\(\s*\{/u);
    const spreads = [...aggregate.matchAll(/\.\.\.(define\w+Tools)\(application\)/gu)].map((match) => match[1]);
    expect(spreads.length).toBeGreaterThanOrEqual(8);
  });

  it("both compatibility entries are shallow enough that a change never lands in them", () => {
    for (const file of [OUT_OF_RADIUS["the surface compatibility barrel"], "src/application/http.ts", "src/tools/application_tools.ts"]) {
      const lines = read(file).split("\n").length;
      expect(lines, `${file} is ${String(lines)} lines`).toBeLessThanOrEqual(60);
      expect(stripComments(read(file)), `${file} implements something`).not.toMatch(
        /\bfunction \w|\bconst \w+ = \(|=>\s*\{/u,
      );
    }
  });

  it("the semantic owner is still the only place the capability's policy lives", () => {
    // The façade must be a façade: the application cluster that fronts CrossProject does not
    // contain the protocol, and the semantic owner does not import an adapter.
    const application = stripComments(read("src/application/surfaces/product.ts"));
    expect(application).not.toMatch(/CROSS_PROJECT_\w*TEXT|INBOUND_REQUEST/u);
    const http = stripComments(read("src/adapters/http/product.ts"));
    expect(http, "the HTTP cluster restated semantic policy").not.toMatch(/COMPOSE|_INTENT_/u);
  });
});
