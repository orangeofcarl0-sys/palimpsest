/**
 * G10-R adversarial + source firewall.
 *
 *   OrganizationMemory ≠ PolicyAuthority   Evaluation ≠ Governance
 *   OrganizationMemory ≠ DynamicsProposal  HistoricalWinner ≠ FutureAuthority
 *
 * The empirical subsystem must not reach into any semantic/sibling store, must
 * not invent a universal organization score, must disclose its uncertainty, and
 * must treat experimental treatments as opaque descriptors that cannot carry
 * authority (R-N04/R-N05/R-N11, EO-A16/A20/A21/A22/A23).
 */

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  materializeExperiment,
  materializeMetric,
  materializeScenario,
  materializeVariant,
  parseEvaluation,
  parseVariant,
} from "../src/organization_memory/index.js";
import type { MetricObservation, RunResult } from "../src/organization_memory/index.js";
import { buildRunResult, evaluate } from "../src/experiment/index.js";
import type { ExperimentRunSpec } from "../src/experiment/index.js";

const OM_DIR = fileURLToPath(new URL("../src/organization_memory", import.meta.url));
const EXP_DIR = fileURLToPath(new URL("../src/experiment", import.meta.url));

const strip = (code: string): string =>
  code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

interface SourceFile {
  readonly name: string;
  readonly path: string;
  readonly code: string;
}

function sourceFiles(dir: string): readonly SourceFile[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith(".ts"))
    .map((name) => ({ name, path: join(dir, name), code: readFileSync(join(dir, name), "utf-8") }));
}

function importSpecifiers(code: string): readonly string[] {
  const specifiers: string[] = [];
  for (const match of code.matchAll(/\bfrom\s+["']([^"']+)["']/gu)) specifiers.push(match[1]!);
  for (const match of code.matchAll(/\bimport\s+["']([^"']+)["']/gu)) specifiers.push(match[1]!);
  return specifiers;
}

/** Modules from any sibling/semantic subsystem: never importable here. */
const FORBIDDEN_MODULES: readonly RegExp[] = [
  /organization\//u, // ../organization/* (OrganizationStore / OrganizationDefinition)
  /coordination/u,
  /boundary_memory/u,
  /reasoning_cell/u,
  /runtime_evolution/u,
  /organization_evolution/u,
  /(^|\/)effects(\/|$)/u,
  /authority/u,
];

/** Identifiers that would signal importing another subsystem's store or authority. */
const FORBIDDEN_TOKENS: readonly string[] = [
  "OrganizationStore",
  "RuntimeScopeStore",
  "BoundaryMemoryStore",
  "CoordinationStore",
  "ReasoningCellStore",
  "organization_evolution",
  "runtime_evolution",
  "EffectAuthority",
  "effect_authority",
  "grantAuthority",
];

const ALLOWED_OM_IMPORTS: ReadonlySet<string> = new Set([
  "../schema/canonical.js",
  "../schema/identifier.js",
  "./artifacts.js",
  "./store.js",
  "./service.js",
  "node:fs",
  "node:os",
  "node:path",
  "node:sqlite",
]);

/* ------------------------------------------------------------------ *
 * Builders for the evaluation-disclosure proof
 * ------------------------------------------------------------------ */

const PROVENANCE = {
  provider: "test-provider",
  model: "test-model",
  hostVersion: "host-1",
  palimpsestSha: "sha-1",
  ordariumVersion: "ord-1",
  profileDigest: "profile-1",
  repoShas: [] as readonly { readonly repo: string; readonly sha: string }[],
  unknowns: [] as readonly string[],
};

function disclosureFixture(): { readonly evaluation: ReturnType<typeof evaluate> } {
  const scenario = materializeScenario({
    scenarioId: "scn-1",
    scenarioRevision: 0,
    kind: "S1_LOW_COUPLING",
    classification: "OPEN_ENDED",
    task: "task",
    successCriteria: ["criterion"],
    bounds: { maxWallClockMs: 1000, maxModelCalls: 10, maxRunsPerVariant: 10 },
  });
  const variant = materializeVariant({ variantId: "var-a", kind: "SINGLE_LOCUS", description: "a" });
  const experiment = materializeExperiment({
    experimentId: "exp-1",
    revision: 0,
    objective: "compare",
    scenarioRefs: [{ scenarioId: scenario.scenarioId, scenarioRevision: scenario.scenarioRevision, digest: scenario.digest }],
    variantRefs: [{ variantId: variant.variantId, digest: variant.digest }],
    measurementPlan: {
      metricIds: ["qualityScore"],
      primaryValidatorRef: "validator-1",
      objectives: ["quality"],
      objectiveNote: "decision_aid_not_truth",
    },
    runPolicy: {
      minRunsPerVariantPerScenario: 3,
      maxRuns: 100,
      maxWallClockMs: 1000,
      maxModelCalls: 10,
      maxAttemptsPerRun: 1,
      randomizeOrder: false,
      seed: 1,
    },
  });
  const measurement: MetricObservation = materializeMetric({
    metricId: "qualityScore",
    unit: "score",
    measurementClass: "DIRECTLY_OBSERVED",
    state: "known",
    value: 50,
    provenance: "test",
  });
  const spec: ExperimentRunSpec = { experiment, scenario, variant, seed: 1, orderIndex: 1, warmup: false, attempt: 1 };
  const run: RunResult = buildRunResult({
    spec,
    provenance: PROVENANCE,
    execution: { outcome: "PASS", failureClassification: "NONE", measurements: [measurement], validatorResults: [] },
    startedAt: "2020-01-01T00:00:00.000Z",
    endedAt: "2020-01-01T00:00:01.000Z",
  });
  return { evaluation: evaluate({ experiment, runs: [run] }) };
}

/* ------------------------------------------------------------------ *
 * Source firewall
 * ------------------------------------------------------------------ */

describe("G10-R source firewall", () => {
  it("organization_memory imports only schema/self/node builtins (no sibling store, no authority)", () => {
    const files = sourceFiles(OM_DIR);
    expect(files.length).toBeGreaterThanOrEqual(4);
    for (const file of files) {
      for (const specifier of importSpecifiers(file.code)) {
        for (const forbidden of FORBIDDEN_MODULES) {
          expect(forbidden.test(specifier), `${file.name} imports forbidden module "${specifier}"`).toBe(false);
        }
        expect(ALLOWED_OM_IMPORTS.has(specifier), `${file.name} imports unexpected module "${specifier}"`).toBe(true);
      }
    }
  });

  it("organization_memory references no sibling store, evolution stream, effect authority, retire or activate", () => {
    for (const file of sourceFiles(OM_DIR)) {
      const code = strip(file.code);
      for (const token of FORBIDDEN_TOKENS) {
        expect(code.includes(token), `${file.name} references "${token}"`).toBe(false);
      }
      expect(/\bretire\b/u.test(code), `${file.name} references retire`).toBe(false);
      expect(/\bactivate\b/u.test(code), `${file.name} references activate`).toBe(false);
      expect(/\.\s*appendAtomic\s*\(/u.test(code) && file.name === "artifacts.ts", "artifacts.ts must not append").toBe(false);
    }
    // The ONLY appendAtomic is its own private store method, called from its own service.
    const withAppendAtomic = sourceFiles(OM_DIR)
      .filter((file) => strip(file.code).includes("appendAtomic"))
      .map((file) => file.name)
      .sort();
    expect(withAppendAtomic).toEqual(["service.ts", "store.ts"]);
  });
});

/* ------------------------------------------------------------------ *
 * No universal organization score
 * ------------------------------------------------------------------ */

describe("G10-R no universal organization score (R-N11)", () => {
  it("has no OrganizationHealth/AgentSynergy/ArchitectureScore/synergyScore anywhere", () => {
    const forbidden = /OrganizationHealth|AgentSynergy|ArchitectureScore|synergyScore/u;
    for (const dir of [OM_DIR, EXP_DIR]) {
      for (const file of sourceFiles(dir)) {
        expect(forbidden.test(file.code), `${file.name} introduces a universal organization score`).toBe(false);
      }
    }
  });
});

/* ------------------------------------------------------------------ *
 * Uncertainty disclosure
 * ------------------------------------------------------------------ */

describe("G10-R evaluation uncertainty disclosure (EO-A16)", () => {
  it("stores sample counts and warnings/limitations and preserves them across canonical round-trip", () => {
    const { evaluation } = disclosureFixture();
    expect(Object.keys(evaluation.sampleSize).sort()).toEqual(["max", "min"]);
    expect(Number.isInteger(evaluation.sampleSize.min)).toBe(true);
    expect(Number.isInteger(evaluation.sampleSize.max)).toBe(true);
    expect(evaluation.sampleSize.min).toBe(evaluation.sampleSize.max);
    expect(evaluation.warnings).toContain("fewer_than_min_runs");
    expect(evaluation.limitations).toContain("observed_association_not_causation");
    expect(evaluation.limitations).toContain("no_universal_score");

    const roundTrip = parseEvaluation(JSON.parse(JSON.stringify(evaluation)) as unknown);
    expect(roundTrip.sampleSize).toEqual(evaluation.sampleSize);
    expect(roundTrip.warnings).toEqual(evaluation.warnings);
    expect(roundTrip.limitations).toEqual(evaluation.limitations);
    expect(roundTrip.digest).toBe(evaluation.digest);
  });
});

/* ------------------------------------------------------------------ *
 * ArchitectureVariant carries no authority
 * ------------------------------------------------------------------ */

describe("G10-R ArchitectureVariant is an opaque treatment descriptor", () => {
  it("keeps authority-looking configRefs as opaque strings with no authority/role/permission parser field", () => {
    const configRefs = ["authority:root", "role=admin", "permission=*", "grant:all", "activate:everything"];
    const variant = materializeVariant({
      variantId: "var-admin",
      kind: "CUSTOM_EXISTING_CONFIGURATION",
      description: "looks privileged",
      configRefs,
    });
    expect([...variant.configRefs]).toEqual(configRefs);
    for (const banned of ["authority", "role", "permission", "grant", "capabilities"]) {
      expect(Object.keys(variant)).not.toContain(banned);
    }

    const parsed = parseVariant(JSON.parse(JSON.stringify(variant)) as unknown);
    expect(parsed).toEqual(variant);
    expect([...parsed.configRefs]).toEqual(configRefs);

    // The artifact's declared shape never names an authority/role/permission field.
    const artifacts = readFileSync(join(OM_DIR, "artifacts.ts"), "utf-8");
    const interfaceStart = artifacts.indexOf("export interface ArchitectureVariant");
    const interfaceEnd = artifacts.indexOf("export function variantDigestOf");
    expect(interfaceStart).toBeGreaterThanOrEqual(0);
    expect(interfaceEnd).toBeGreaterThan(interfaceStart);
    const declaration = artifacts.slice(interfaceStart, interfaceEnd);
    for (const banned of ["authority", "role", "permission"]) {
      expect(declaration.includes(banned), `ArchitectureVariant declares "${banned}"`).toBe(false);
    }
  });
});
