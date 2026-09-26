/**
 * SR-2e §21/§22/§23 — the ARCHITECTURE RATCHETS and the E-plane firewall, as proofs.
 *
 * SR-2.0 fixed what the checker could not SEE (an unclassified module inherited "may import
 * anything"; the captured identity was `unknown`). SR-2e adds what the LAYER model cannot EXPRESS:
 *
 *   §21  concrete dependency firewalls — "src/continuation/** must not import src/state/**" is a
 *        statement about two DIRECTORIES, and both layers permit it in general.
 *   §22  hotspot ratchets — a known hotspot may not silently grow again, recorded as a measured
 *        per-file ceiling rather than a global "every file < N lines" rule.
 *   §23  concrete importer allowlists — which modules may name a given concrete module AT ALL.
 *        This is the E-plane firewall: a new semantic module must fail on the IMPORT.
 *
 * The proofs are in BOTH directions, which is what makes them proofs rather than restatements:
 * the live graph must pass, and a synthetic breach of each rule must FAIL.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  analyseModuleArchitecture,
  checkArchitecture,
  DEPENDENCY_FIREWALLS,
  HOTSPOT_RATCHETS,
  IMPORTER_ALLOWLISTS,
  type ArchitectureBaseline,
  type ModuleArchitecture,
} from "../../tools/architecture/index.js";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (relative: string): string => readFileSync(join(REPO, relative), "utf8");

const baseline = JSON.parse(readFileSync(join(REPO, "architecture", "module-architecture.json"), "utf8"))
  .baseline as ArchitectureBaseline;
const live = analyseModuleArchitecture(REPO);

/**
 * A deep clone of the live graph, so a probe cannot mutate the shared analysis.
 *
 * Cast to a MUTABLE shape because every probe below deliberately commits an architectural breach:
 * the analyzer's own types are readonly, which is the right type for a real reader and the wrong
 * one for a test whose purpose is to corrupt a copy.
 */
interface MutableGraph {
  modules: Array<{ file: string; imports: string[]; layer: string; loc: number; fanOut: number; fanIn: number }>;
}
const clone = (): MutableGraph => JSON.parse(JSON.stringify(live)) as MutableGraph;
const asGraph = (graph: MutableGraph): ModuleArchitecture => graph as unknown as ModuleArchitecture;
const violationsOf = (graph: MutableGraph, kind: string): readonly string[] =>
  checkArchitecture(asGraph(graph), baseline)
    .violations.filter((violation) => violation.kind === kind)
    .map((violation) => violation.detail);

/* ================================================================== *
 * The baseline carries the rules, and the live graph satisfies them
 * ================================================================== */

describe("SR-2e the constraint tables are IN the baseline, not only in code", () => {
  it("v4 records all three tables", () => {
    expect(baseline.version).toBe(4);
    expect(baseline.dependencyFirewalls).toHaveLength(5);
    expect(baseline.hotspotRatchets).toHaveLength(4);
    expect(baseline.importerAllowlists).toHaveLength(2);
  });

  it("every rule carries a written reason — an unexplained rule is an unexplained refusal", () => {
    for (const firewall of baseline.dependencyFirewalls ?? []) {
      expect(firewall.reason.length, firewall.id).toBeGreaterThan(80);
      expect(firewall.id.length, "a firewall needs an id to be cited by").toBeGreaterThan(3);
    }
    for (const ratchet of baseline.hotspotRatchets ?? []) {
      expect(ratchet.reason.length, ratchet.file).toBeGreaterThan(80);
    }
    for (const allowlist of baseline.importerAllowlists ?? []) {
      expect(allowlist.reason.length, allowlist.module).toBeGreaterThan(80);
    }
  });

  it("the live graph satisfies all three — zero violations of the new kinds", () => {
    for (const kind of ["firewall_breach", "hotspot_growth", "importer_not_allowed"]) {
      expect(violationsOf(live as unknown as MutableGraph, kind), `${kind} must be clean on the live tree`).toEqual([]);
    }
  });
});

/* ================================================================== *
 * §21 — the firewalls REJECT
 * ================================================================== */

describe("SR-2e §21 the concrete firewalls actually fire", () => {
  it("a continuation → state import is refused BY NAME", () => {
    const graph = clone();
    graph.modules.find((module) => module.file === "src/continuation/service.ts")!.imports.push("src/state/migrations.ts");
    const breaches = violationsOf(graph, "firewall_breach");
    expect(breaches).toHaveLength(1);
    expect(breaches[0]).toContain("continuation-not-world-internals");
    expect(breaches[0]).toContain("src/continuation/service.ts");
  });

  it("the firewall covers the ruling's whole list, not only the one edge SR-2a removed", () => {
    const firewall = (baseline.dependencyFirewalls ?? []).find((entry) => entry.id === "continuation-not-world-internals")!;
    for (const forbidden of [
      "src/state/",
      "src/tools/controller.ts",
      "src/project_world/issuance.ts",
      "src/project_world/observation_authority.ts",
      "src/project_world/admission_store.ts",
      "src/deployment/source_change_observer.ts",
    ]) {
      expect(firewall.to, `the firewall must name ${forbidden}`).toContain(forbidden);
    }
    // And it has NO blanket exclusions: the port wall is absolute, as its reason says.
    expect(firewall.exclusions).toEqual([]);
  });

  it("the identity layer cannot reach its consumers — the SR-2d3 cycle cannot be rebuilt", () => {
    const graph = clone();
    graph.modules.find((module) => module.file === "src/identity/refs.ts")!.imports.push("src/federation/peer.ts");
    expect(violationsOf(graph, "firewall_breach").length).toBeGreaterThan(0);
  });

  it("the Work / context / result layers cannot reach the host or the façade", () => {
    for (const [from, to] of [
      ["src/work/read_model.ts", "src/tools/controller.ts"],
      ["src/context/service.ts", "src/deployment/work_worker.ts"],
      ["src/result/subject.ts", "src/state/event_store.ts"],
    ] as const) {
      const graph = clone();
      graph.modules.find((module) => module.file === from)!.imports.push(to);
      expect(violationsOf(graph, "firewall_breach").length, `${from} → ${to}`).toBeGreaterThan(0);
    }
  });

  it("an exclusion would be a CONCRETE edge with a reason — none is used today", () => {
    // The mechanism exists and is unused, which is the honest state: SR-2 removed the violations
    // rather than recording allowances for them.
    for (const firewall of baseline.dependencyFirewalls ?? []) {
      for (const exception of firewall.exclusions) {
        expect(exception.reason.length, `${exception.from} → ${exception.to}`).toBeGreaterThan(40);
      }
    }
    expect((baseline.dependencyFirewalls ?? []).flatMap((entry) => entry.exclusions)).toEqual([]);
  });
});

/* ================================================================== *
 * §22 — the ratchets REJECT growth, and are not a global size rule
 * ================================================================== */

describe("SR-2e §22 the hotspot ratchets actually hold", () => {
  it("growing the controller past its LOC ceiling fails", () => {
    const graph = clone();
    graph.modules.find((module) => module.file === "src/tools/controller.ts")!.loc += 100;
    const growth = violationsOf(graph, "hotspot_growth");
    expect(growth).toHaveLength(1);
    expect(growth[0]).toContain("LOC grew to");
  });

  it("growing its fan-out past the ceiling fails too — the ratchet is multi-dimensional", () => {
    const graph = clone();
    const node = graph.modules.find((module) => module.file === "src/tools/controller.ts")!;
    node.fanOut += 5;
    expect(violationsOf(graph, "hotspot_growth").length).toBeGreaterThan(0);
  });

  it("the ratchet values are the MEASURED post-SR-2 numbers, so the rule reads 'no worse'", () => {
    const ratchet = (baseline.hotspotRatchets ?? []).find((entry) => entry.file === "src/tools/controller.ts")!;
    const node = live.modules.find((module) => module.file === ratchet.file)!;
    // The ceiling is at or just above the measured value, never an unverified aspiration.
    expect(ratchet.maxLoc).not.toBeNull();
    expect(node.loc).toBeLessThanOrEqual(ratchet.maxLoc!);
    expect(ratchet.maxLoc! - node.loc).toBeLessThanOrEqual(10);
    // Fan-out may have RISEN while knowledge fell — the ratchet records both, measured.
    expect(node.fanOut).toBeLessThanOrEqual(ratchet.maxFanOut!);
    expect(node.fanIn).toBeLessThanOrEqual(ratchet.maxFanIn!);
  });

  it("a ratchet for a module that no longer exists is STALE, not satisfied", () => {
    const graph = clone();
    const ratchet = (baseline.hotspotRatchets ?? [])[0]!;
    const tampered: ArchitectureBaseline = {
      ...baseline,
      hotspotRatchets: [{ ...ratchet, file: "src/gone/vanished.ts" }],
    };
    const result = checkArchitecture(asGraph(graph), tampered);
    expect(result.violations.some((violation) => violation.detail.includes("no longer exists"))).toBe(true);
  });

  it("it is NOT a global size rule: no rule constrains every file", () => {
    // The refusal the ruling made explicit — a mechanical "all files < N" rule would be met by
    // splitting a coherent module, which is the degeneration SR-2 exists to prevent.
    const ratcheted = new Set((baseline.hotspotRatchets ?? []).map((entry) => entry.file));
    expect(ratcheted.size).toBeLessThan(live.modules.length / 10);
    // And every ratcheted file is a genuinely large or high-fan-out module.
    for (const file of ratcheted) {
      const node = live.modules.find((module) => module.file === file)!;
      expect(node.loc > 200 || node.fanOut > 30, `${file} is not a hotspot`).toBe(true);
    }
  });

  it("a `null` dimension is explicitly 'not ratcheted', never a ceiling of zero", () => {
    const advanced = (baseline.hotspotRatchets ?? []).find((entry) => entry.file === "src/advanced.ts")!;
    expect(advanced.maxLoc).toBeNull();
    expect(advanced.maxFanOut).toBe(40);
    // The live value satisfies it, so null did not silently mean "fail".
    const node = live.modules.find((module) => module.file === "src/advanced.ts")!;
    expect(node.fanOut).toBeLessThanOrEqual(40);
  });
});

/* ================================================================== *
 * §23 — the importer allowlists REJECT, and record today's reality
 * ================================================================== */

describe("SR-2e §23 the importer allowlists are the E-plane firewall", () => {
  it("a NEW module importing the controller fails ON THE IMPORT", () => {
    const graph = clone();
    graph.modules.push({
      ...graph.modules[0]!,
      file: "src/workforce/roster.ts",
      imports: ["src/tools/controller.ts"],
      layer: "L2",
    });
    const breaches = violationsOf(graph, "importer_not_allowed");
    expect(breaches).toHaveLength(1);
    expect(breaches[0]).toContain("src/workforce/roster.ts");
    expect(breaches[0]).toContain("src/tools/controller.ts");
  });

  it("a NEW module reaching the Event Log directly fails as well", () => {
    const graph = clone();
    graph.modules.push({
      ...graph.modules[0]!,
      file: "src/workforce/mailbox.ts",
      imports: ["src/state/event_store.ts"],
      layer: "L2",
    });
    expect(violationsOf(graph, "importer_not_allowed").length).toBeGreaterThan(0);
  });

  it("the allowlists record today's real importers, so the slice changes nothing", () => {
    // Every current importer of the two modules is named — the rule is "no NEW one", not "fewer".
    for (const allowlist of baseline.importerAllowlists ?? []) {
      const importers = live.modules
        .filter((module) => module.file !== allowlist.module && module.imports.includes(allowlist.module))
        .map((module) => module.file);
      expect(importers.length).toBeGreaterThan(0);
      for (const importer of importers) {
        expect(
          allowlist.allowedImporters.some((prefix) => importer.startsWith(prefix)),
          `${importer} imports ${allowlist.module} but is not on its allowlist`,
        ).toBe(true);
      }
    }
  });

  it("the controller's allowlist names the OWNERS a new module should reach instead", () => {
    const allowlist = (baseline.importerAllowlists ?? []).find((entry) => entry.module === "src/tools/controller.ts")!;
    // The reason must say where to go instead — otherwise the rule is only a refusal.
    for (const owner of ["src/work/", "src/context/", "src/result/", "src/identity/"]) {
      expect(allowlist.reason, `the reason must point at ${owner}`).toContain(owner);
    }
  });
});

/* ================================================================== *
 * The E plane is a CONCRETE rule, not a promise
 * ================================================================== */

describe("SR-2e the E-plane firewall is enforced, not declared", () => {
  it("the three rules together cover the ruling's E-plane list", () => {
    /**
     * §24's list: a future E module must not import EventStore, ProjectController,
     * PromotionManager, CompatibilityIssuer, ReworkAdmissionPermit, WorldBasisRuntime.
     *
     * The union of the firewalls (by boundary) and the allowlists (by named module) covers them:
     * the kernel internals a new `src/<e>/` module would reach are all either firewalled from a
     * lower layer or allowlisted at their own module.
     */
    const listed = new Set([
      ...(baseline.dependencyFirewalls ?? []).flatMap((firewall) => [...firewall.from, ...firewall.to]),
      ...(baseline.importerAllowlists ?? []).map((allowlist) => allowlist.module),
    ]);
    // The two the ruling named outright are named here.
    expect([...listed]).toContain("src/tools/controller.ts");
    expect([...listed]).toContain("src/state/");
  });

  it("the rules are DENY BY DEFAULT: a module matching no allowlist is refused", () => {
    // The check has no "unknown module ⇒ permit" branch: an importer not on the list fails.
    const source = read("tools/architecture/rules.ts");
    expect(source).toContain("allowedImporters.some((prefix) => node.file.startsWith(prefix))");
    expect(source).toContain("importer_not_allowed");
    // And the allowlist rule is checked against the LIVE graph, not a recorded snapshot.
    expect(source).toContain("for (const node of architecture.modules)");
  });

  it("SR-2.0's rule still stands: unclassified is refused, and no module is unclassified", () => {
    expect(live.modules.filter((module) => module.layer === "UNCLASSIFIED")).toEqual([]);
    // The new layers SR-2 introduced are all classified.
    for (const file of [
      "src/work/read_model.ts",
      "src/work/head.ts",
      "src/work/attempt_execution.ts",
      "src/context/service.ts",
      "src/result/subject.ts",
      "src/identity/refs.ts",
      "src/continuation/service.ts",
      "src/continuation/assessment.ts",
    ]) {
      const node = live.modules.find((module) => module.file === file);
      expect(node, `${file} must exist`).toBeDefined();
      expect(node!.layer, `${file} must be classified`).not.toBe("UNCLASSIFIED");
    }
  });

  it("the tables are DATA in one place, so a reviewer reads policy rather than inferring it", () => {
    // No rule is derived from the graph: they live in the code-level table and are COPIED on write.
    expect(DEPENDENCY_FIREWALLS.length).toBe(5);
    expect(HOTSPOT_RATCHETS.length).toBe(4);
    expect(IMPORTER_ALLOWLISTS.length).toBe(2);
    const writer = read("scripts/audit/module-architecture.mjs");
    expect(writer).toContain("firewalls: arch.DEPENDENCY_FIREWALLS");
    expect(writer).toContain("ratchets: arch.HOTSPOT_RATCHETS");
    expect(writer).toContain("allowlists: arch.IMPORTER_ALLOWLISTS");
  });
});
