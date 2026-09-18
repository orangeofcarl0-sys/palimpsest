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
