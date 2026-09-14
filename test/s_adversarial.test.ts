/**
 * G10-S adversarial + source firewall.
 *
 *   Recipe ≠ Authority      Advisor ≠ Authority      Suggestion ≠ Selection
 *   Branch execution ≠ PeerRef ≠ PersistentPoint      CandidateClaim ≠ AcceptedClaim
 *
 * The recipe/advisor subsystem must own no sibling store or effect authority, must invent no
 * universal/weighted score and no arbitrary graph, and must reach existing governed services only
 * through their declared high-level service types.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  builtinRecipeRegistry,
  compileRecipePlan,
  makeRecipeExecutionService,
  materializeRecipePlan,
} from "../src/recipes/index.js";
import type { RecipeDefinitionRef, ReasoningBranchExecutionPort } from "../src/recipes/index.js";
import type { ReasoningCellService } from "../src/reasoning_cell/index.js";
import type { FederationService } from "../src/federation/index.js";
import type { PeerRef } from "../src/federation/index.js";

const ADVISOR_DIR = fileURLToPath(new URL("../src/advisor", import.meta.url));
const RECIPES_DIR = fileURLToPath(new URL("../src/recipes", import.meta.url));
const EXECUTION_FILE = fileURLToPath(new URL("../src/recipes/execution.ts", import.meta.url));
const BRANCH_EXECUTION_FILE = fileURLToPath(new URL("../src/reasoning_cell/branch_execution.ts", import.meta.url));

const strip = (code: string): string => code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

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

function allRecipeAdvisorFiles(): readonly SourceFile[] {
  return [...sourceFiles(ADVISOR_DIR).map((file) => ({ ...file, name: `advisor/${file.name}` })), ...sourceFiles(RECIPES_DIR).map((file) => ({ ...file, name: `recipes/${file.name}` }))];
}

function importSpecifiers(code: string): readonly string[] {
  const specifiers: string[] = [];
  for (const match of code.matchAll(/\bfrom\s+["']([^"']+)["']/gu)) specifiers.push(match[1]!);
  for (const match of code.matchAll(/\bimport\s+["']([^"']+)["']/gu)) specifiers.push(match[1]!);
  return specifiers;
}

/** Sibling stores / effect authority are never importable from the recipe/advisor layer. */
const FORBIDDEN_MODULES: readonly RegExp[] = [
  /(^|\/)organization\/store\.js$/u,
  /(^|\/)organization_evolution\/store\.js$/u,
  /(^|\/)runtime_evolution\/store\.js$/u,
  /(^|\/)runtime_scope\/store\.js$/u,
  /(^|\/)boundary_memory\/store\.js$/u,
  /(^|\/)coordination\/store\.js$/u,
  /(^|\/)reasoning_cell\/store\.js$/u,
  /(^|\/)continuity\//u,
  /(^|\/)effects(\/|$)/u,
  /authority/u,
];

/** Identifiers that would signal mutating a sibling store or granting authority. */
const FORBIDDEN_TOKENS: readonly string[] = [
  "OrganizationStore",
  "RuntimeScopeStore",
  "BoundaryMemoryStore",
  "CoordinationStore",
  "ReasoningCellStore",
  "PersistentPoint",
  "appendAtomic",
  "registerRevision",
  "applyStructuralTransition",
  "grantAuthority",
  "EffectAuthority",
];

/** A universal score / weighted sum must not exist anywhere in the subsystem. */
const FORBIDDEN_SCORE = /FocusScore|universalScore|UniversalScore|weightedSum|weighted_sum|WeightedSum|ArchitectureScore|OrganizationHealth|AgentSynergy/u;

/** No arbitrary-graph generator. */
const FORBIDDEN_GRAPH = /GraphStore|generateGraph|arbitrary[ _-]?graph|GlobalGraph|UniversalGraph/iu;

describe("G10-S recipe/advisor source firewall", () => {
  it("imports no sibling store, continuity, or effect authority", () => {
    for (const file of allRecipeAdvisorFiles()) {
      for (const specifier of importSpecifiers(file.code)) {
        for (const forbidden of FORBIDDEN_MODULES) {
          expect(forbidden.test(specifier), `${file.name} imports forbidden module "${specifier}"`).toBe(false);
        }
      }
    }
  });

  it("references no sibling store mutator, persistent point, or authority grant", () => {
    for (const file of allRecipeAdvisorFiles()) {
      const code = strip(file.code);
      for (const token of FORBIDDEN_TOKENS) {
        expect(code.includes(token), `${file.name} references "${token}"`).toBe(false);
      }
    }
  });

  it("introduces no universal/weighted score and no arbitrary graph", () => {
    for (const file of allRecipeAdvisorFiles()) {
      expect(FORBIDDEN_SCORE.test(file.code), `${file.name} introduces a universal score`).toBe(false);
      expect(FORBIDDEN_GRAPH.test(file.code), `${file.name} introduces an arbitrary graph`).toBe(false);
    }
  });

  it("the EXPLORE execution path reaches the service but never an admission port", () => {
    const execution = readFileSync(EXECUTION_FILE, "utf-8");
    const code = strip(execution);
    expect(code).toContain("submitCandidate");
    expect(code).toContain("evaluateCandidate");
    expect(code).not.toMatch(/\.admit\(/u);
    expect(code).not.toMatch(/AdmissionPort|admissionDecision|AdmissionDecision/u);
    // The branch execution seam itself constructs no identity locus.
    const branch = strip(readFileSync(BRANCH_EXECUTION_FILE, "utf-8"));
    expect(branch).not.toMatch(/materializePeerRef|PersistentPoint|continuity/iu);
  });
});

/* ------------------------------------------------------------------ *
 * Behavioral: a fake port proves no peer/continuity mutator is reached
 * ------------------------------------------------------------------ */

const P: PeerRef = { schemaVersion: 1, peerId: "palimpsest" };
const registry = builtinRecipeRegistry();

function refOf(recipeId: string): RecipeDefinitionRef {
  const definition = registry.get(recipeId);
  if (definition === undefined) throw new Error(`no recipe "${recipeId}"`);
  return { recipeId: definition.recipeId, version: definition.version, digest: definition.digest };
}

const explore = compileRecipePlan(
  materializeRecipePlan({ baseRecipeRef: refOf("explore.v1"), parameters: { question: "q", branchCount: 2 }, rationaleDigest: "a".repeat(64) }),
  registry,
);
const coordinate = compileRecipePlan(
  materializeRecipePlan({ baseRecipeRef: refOf("coordinate.v1"), existingSubjectRefs: ["peer-a"], rationaleDigest: "a".repeat(64) }),
  registry,
);

function reasoningSpy(calls: string[]): ReasoningCellService {
  let branch = 0;
  return {
    openCell: async () => {
      calls.push("openCell");
      return {} as never;
    },
    openBranch: async () => {
      calls.push("openBranch");
      branch += 1;
      return { branch: { ref: { branchId: `branch-${branch}` } }, brief: {} } as never;
    },
    branchBrief: async () => {
      calls.push("branchBrief");
      return {} as never;
    },
    submitCandidate: async () => {
      calls.push("submitCandidate");
      return { candidate: { candidateDigest: "d".repeat(64) }, status: "PENDING" } as never;
    },
    evaluateCandidate: async () => {
      calls.push("evaluateCandidate");
      return { status: "admitted", claimId: "claim-1" } as never;
    },
  } as unknown as ReasoningCellService;
}

describe("G10-S recipe execution touches no peer/continuity mutator", () => {
  it("a throwing proxy for the federation/continuity surface is never accessed by EXPLORE or COORDINATE", async () => {
    const bomb = new Proxy({} as object, {
      get() {
        throw new Error("a recipe execution reached a peer/continuity mutator");
      },
    }) as unknown as FederationService;
    const branchExecution: ReasoningBranchExecutionPort = { adapterId: "fake", run: async () => ({ statement: "s" }) };
    const service = makeRecipeExecutionService({ localPeer: P, reasoning: reasoningSpy([]), branchExecution, federation: bomb });

    await expect(service.execute(explore, {})).resolves.toMatchObject({ status: "explored" });
    await expect(service.execute(coordinate, {})).resolves.toMatchObject({ status: "coordination_surfaced" });
  });

  it("the executor calls submitCandidate + evaluateCandidate and exposes no admission method", async () => {
    const calls: string[] = [];
    const reasoning = reasoningSpy(calls);
    const branchExecution: ReasoningBranchExecutionPort = { adapterId: "fake", run: async () => ({ statement: "a candidate" }) };
    const service = makeRecipeExecutionService({ localPeer: P, reasoning, branchExecution });
    const outcome = await service.execute(explore, {});
    expect(outcome).toMatchObject({ status: "explored", branchExecutions: 2 });
    expect(calls).toContain("submitCandidate");
    expect(calls).toContain("evaluateCandidate");
    expect((reasoning as unknown as Record<string, unknown>).admit).toBeUndefined();
  });
});
