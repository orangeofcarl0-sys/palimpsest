/**
 * PAL-FED-0D frozen runtime artifact test (EXPERIMENTAL, §27).
 *
 * Always: the built plugin entries and declared package exports exist, and the
 * plugin module has the DSH plugin shape.
 * When the built artifact is present (local dogfood preparation): its manifest
 * binds the exact tarball bytes and the artifact lives outside the project
 * worktree, so the active worktree is never the control plane.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

const repoRoot = resolve(import.meta.dirname, "..");
const artifactDir = process.env.PAL_FED_ARTIFACT ?? resolve(repoRoot, "..", "pal-fed-runtime");

describe("PAL-FED-0D frozen runtime artifact (§27)", () => {
  it("declares the DSH plugin subpath export and builds the plugin entries", () => {
    const pkg = JSON.parse(readFileSync(resolve(repoRoot, "package.json"), "utf8")) as {
      exports: Record<string, { import: string }>;
    };
    expect(pkg.exports["./dsh-plugin"]?.import).toBe("./dist/src/federation/dsh/plugin.js");
    expect(pkg.exports["./dsh-deterministic-llm"]?.import).toBe(
      "./dist/src/federation/dsh/deterministic_llm.js",
    );
    expect(existsSync(resolve(repoRoot, "dist/src/federation/dsh/plugin.js"))).toBe(true);
    expect(existsSync(resolve(repoRoot, "dist/src/federation/dsh/deterministic_llm.js"))).toBe(true);
  });

  it("exposes the real DSH plugin shape", async () => {
    const module = (await import(
      pathToFileURL(resolve(repoRoot, "dist/src/federation/dsh/plugin.js")).href
    )) as { name?: string; inject?: string[]; apply?: unknown };
    expect(module.name).toBe("pal-fed-collab");
    expect(module.inject).toEqual(["agents", "tools", "systemPrompt"]);
    expect(typeof module.apply).toBe("function");
  });

  const artifactAvailable = existsSync(resolve(artifactDir, "package-metadata.json"));

  it.runIf(artifactAvailable)("the artifact is a self-contained frozen build outside the worktree", () => {
    const metadata = JSON.parse(
      readFileSync(resolve(artifactDir, "package-metadata.json"), "utf8"),
    ) as {
      buildId: string;
      frozenCodeSha256: string;
      sourceCommit: string;
      pluginEntry: string;
      depsMode: string;
    };
    expect(metadata.frozenCodeSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(readFileSync(resolve(artifactDir, "SHA256SUMS"), "utf8")).toContain(
      metadata.frozenCodeSha256,
    );
    expect(readFileSync(resolve(artifactDir, "build-id"), "utf8").trim()).toBe(metadata.buildId);
    // The frozen plugin entry both hosts load really exists inside the artifact.
    expect(existsSync(resolve(artifactDir, metadata.pluginEntry))).toBe(true);
    expect(metadata.depsMode === "link" || metadata.depsMode === "copy").toBe(true);
    // Outside both source worktrees: the artifact dir is not the repo.
    const inside = resolve(artifactDir)
      .toLowerCase()
      .startsWith(`${repoRoot.toLowerCase()}\\`);
    expect(inside).toBe(false);
  });
});
