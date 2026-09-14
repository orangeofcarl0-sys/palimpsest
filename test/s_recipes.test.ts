/**
 * G10-S recipes — registry honesty, strict digest-bound artifacts, the pure compiler, the
 * governed execution seam, and the product wiring (HTTP + tools + a real FOCUS e2e).
 *
 *   RecipeDefinition ≠ Authority      RecipePlan ≠ Execution
 *   CompiledRecipePlan ≠ Effect       Execution ≠ Admission
 */

import { afterAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  COMPILATION_AUTHORITY_NOTES,
  RecipeCompileError,
  builtinRecipeRegistry,
  compileRecipePlan,
  makeRecipeExecutionService,
  materializeRecipeDefinition,
  materializeRecipePlan,
  parseCompiledRecipePlan,
  parseRecipeDefinition,
  parseRecipePlan,
} from "../src/recipes/index.js";
import type {
  CompiledRecipePlan,
  RecipeDefinitionRef,
  RecipePlan,
  RecipeRegistry,
  ReasoningBranchExecutionPort,
} from "../src/recipes/index.js";
import type { ReasoningCellService } from "../src/reasoning_cell/index.js";
import type { FederationService } from "../src/federation/index.js";
import type { PeerRef } from "../src/federation/index.js";
import { installPalimpsest } from "../src/install.js";
import type { InstalledPalimpsest } from "../src/install.js";
import { handleApplicationRequest } from "../src/application/http.js";
import type { DshToolDefinition, DshToolRunContext } from "../src/tools/dsh_types.js";

const P: PeerRef = { schemaVersion: 1, peerId: "palimpsest" };

const DIR = mkdtempSync(join(tmpdir(), "palimpsest-s-recipes-"));
afterAll(() => {
  try {
    rmSync(DIR, { recursive: true, force: true });
  } catch {
    /* windows handle */
  }
});
let seq = 0;
const nextPath = (name: string): string => join(DIR, `${name}-${++seq}.sqlite`);

const registry: RecipeRegistry = builtinRecipeRegistry();

function refOf(recipeId: string): RecipeDefinitionRef {
  const definition = registry.get(recipeId);
  if (definition === undefined) throw new Error(`no builtin recipe "${recipeId}"`);
  return { recipeId: definition.recipeId, version: definition.version, digest: definition.digest };
}

function planOf(input: {
  readonly base: string;
  readonly modifiers?: readonly string[];
  readonly parameters?: Readonly<Record<string, unknown>>;
  readonly existingSubjectRefs?: readonly string[];
  readonly registry?: RecipeRegistry;
}): RecipePlan {
  const active = input.registry ?? registry;
  const ref = (recipeId: string): RecipeDefinitionRef => {
    const definition = active.get(recipeId);
    if (definition === undefined) throw new Error(`no recipe "${recipeId}"`);
    return { recipeId: definition.recipeId, version: definition.version, digest: definition.digest };
  };
  return materializeRecipePlan({
    baseRecipeRef: ref(input.base),
    modifierRefs: (input.modifiers ?? []).map(ref),
    ...(input.parameters === undefined ? {} : { parameters: input.parameters }),
    ...(input.existingSubjectRefs === undefined ? {} : { existingSubjectRefs: input.existingSubjectRefs }),
    rationaleDigest: "a".repeat(64),
  });
}

function context(): { tools: { register(definition: DshToolDefinition): void } } {
  return { tools: { register: () => undefined } };
}

function runContext(name: string, args: unknown): DshToolRunContext {
  return { callId: "c1", rootCallId: "r1", name, arguments: args, signal: new AbortController().signal };
}

async function callTool(tools: readonly DshToolDefinition[], name: string, args: unknown): Promise<unknown> {
  const definition = tools.find((entry) => entry.name === name);
  if (definition === undefined) throw new Error(`tool "${name}" not registered`);
  return definition.execute(args, runContext(name, args));
}

async function http(installed: InstalledPalimpsest, method: string, path: string, body?: unknown): Promise<{ status: number; body: unknown }> {
  const url = new URL(path, "http://localhost");
  const result = await handleApplicationRequest({
    application: installed.application,
    method,
    pathname: url.pathname,
    query: url.searchParams,
    body,
  });
  if (result === undefined) throw new Error(`no application route for ${method} ${path}`);
  return result;
}

/** A structural ReasoningCellService spy: records exactly which service calls the executor makes. */
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

/* ------------------------------------------------------------------ *
 * Registry honesty
 * ------------------------------------------------------------------ */

describe("G10-S builtin registry", () => {
  it("has exactly the five recipes with honest per-capability readiness", () => {
    const list = registry.list();
    expect(list.map((definition) => definition.recipeId)).toEqual(["focus.v1", "explore.v1", "coordinate.v1", "verify.v1", "monitor.v1"]);
    const readiness = Object.fromEntries(list.map((definition) => [definition.recipeId, definition.readiness]));
    expect(readiness).toEqual({
      "focus.v1": "PRODUCTION_READY",
      "explore.v1": "CONDITIONAL",
      "coordinate.v1": "PRODUCTION_READY",
      "verify.v1": "CONDITIONAL",
      "monitor.v1": "PREVIEW_ONLY",
    });
    // A CONDITIONAL/PREVIEW recipe states its limitation; readiness is never padded.
    expect(registry.get("explore.v1")!.limitations.length).toBeGreaterThan(0);
    expect(registry.get("monitor.v1")!.limitations.some((line) => line.includes("background condition source"))).toBe(true);
    expect(registry.get("ghost.v1")).toBeUndefined();
  });

  it("strict-parses definitions and plans and fails closed on unknown fields / tampering", () => {
    const definition = registry.get("focus.v1")!;
    expect(parseRecipeDefinition(JSON.parse(JSON.stringify(definition)) as unknown)).toEqual(definition);
    expect(() => parseRecipeDefinition({ ...definition, universalScore: 1 })).toThrow(/unknown field/);
    expect(() => parseRecipeDefinition({ ...definition, digest: "0".repeat(64) })).toThrow(/digest does not match/);

    const plan = planOf({ base: "explore.v1", parameters: { question: "q", branchCount: 3 } });
    const roundTrip = parseRecipePlan(JSON.parse(JSON.stringify(plan)) as unknown);
    expect(roundTrip).toEqual(plan);
    expect(roundTrip.planId).toBe(plan.planId);

    // planId is digest-derived: mutating any visible content fails BOTH the digest and the planId check.
    expect(() => parseRecipePlan({ ...plan, planId: "plan-tampered" })).toThrow(/planId must be derived/);
    expect(() => parseRecipePlan({ ...plan, parameters: { question: "q" } })).toThrow(/digest does not match/);
  });

  it("materializeRecipeDefinition rejects a role/mode mismatch", () => {
    expect(() => materializeRecipeDefinition({ recipeId: "bad.v1", role: "base", readiness: "PRODUCTION_READY" })).toThrow(/base recipe requires baseMode/);
    expect(() => materializeRecipeDefinition({ recipeId: "bad.v1", role: "modifier", modifier: "VERIFY", baseMode: "FOCUS", readiness: "PRODUCTION_READY" })).toThrow(/must not carry baseMode/);
  });
});

/* ------------------------------------------------------------------ *
 * Compiler (pure, descriptive)
 * ------------------------------------------------------------------ */

describe("G10-S recipe compiler", () => {
  it("FOCUS compiles to reuse_principal with NO reasoning cell and NO peer", () => {
    const compiled = compileRecipePlan(planOf({ base: "focus.v1" }), registry);
    expect(compiled.steps).toEqual([{ kind: "reuse_principal" }]);
    expect(compiled.baseMode).toBe("FOCUS");
    expect(compiled.requiredCapabilities).toEqual(["work.principal"]);
    expect(compiled.authorityNotes).toEqual(COMPILATION_AUTHORITY_NOTES);
    expect(compiled.steps.some((step) => step.kind === "open_reasoning_cell" || step.kind === "surface_contact_need")).toBe(false);
  });

  it("EXPLORE compiles to one open_reasoning_cell and rejects a missing question / branchCount < 2", () => {
    const compiled = compileRecipePlan(planOf({ base: "explore.v1", parameters: { question: "how?", branchCount: 3 } }), registry);
    expect(compiled.steps).toEqual([{ kind: "open_reasoning_cell", branchCount: 3, question: "how?" }]);

    expect(() => compileRecipePlan(planOf({ base: "explore.v1", parameters: { branchCount: 2 } }), registry)).toThrow(RecipeCompileError);
    try {
      compileRecipePlan(planOf({ base: "explore.v1", parameters: { branchCount: 2 } }), registry);
    } catch (error) {
      expect((error as RecipeCompileError).kind).toBe("missing_parameter");
    }
    expect(() => compileRecipePlan(planOf({ base: "explore.v1", parameters: { question: "q", branchCount: 1 } }), registry)).toThrow(/branchCount/);
  });

  it("COORDINATE compiles to surface_contact_need + prepare_boundary_context over the GIVEN refs only", () => {
    const compiled = compileRecipePlan(planOf({ base: "coordinate.v1", existingSubjectRefs: ["peer-a", "peer-b"] }), registry);
    expect(compiled.steps.map((step) => step.kind)).toEqual(["surface_contact_need", "prepare_boundary_context"]);
    for (const step of compiled.steps) {
      if (step.kind === "surface_contact_need" || step.kind === "prepare_boundary_context") {
        expect(step.peerRefs).toEqual([
          { schemaVersion: 1, peerId: "peer-a" },
          { schemaVersion: 1, peerId: "peer-b" },
        ]);
      }
    }
  });

  it("COORDINATE with no existing subject refs is blocked (never a way to spawn a peer)", () => {
    try {
      compileRecipePlan(planOf({ base: "coordinate.v1" }), registry);
      throw new Error("expected the compiler to reject COORDINATE without refs");
    } catch (error) {
      expect(error).toBeInstanceOf(RecipeCompileError);
      expect((error as RecipeCompileError).kind).toBe("coordinate_requires_independent_peer");
    }
  });

  it("rejects unsupported modifiers and unknown recipes", () => {
    try {
      compileRecipePlan(planOf({ base: "explore.v1", modifiers: ["monitor.v1"], parameters: { question: "q" } }), registry);
      throw new Error("expected unsupported_modifier");
    } catch (error) {
      expect((error as RecipeCompileError).kind).toBe("unsupported_modifier");
    }

    const ghost = materializeRecipePlan({
      baseRecipeRef: { recipeId: "ghost.v1", version: 1, digest: "b".repeat(64) },
      rationaleDigest: "a".repeat(64),
    });
    try {
      compileRecipePlan(ghost, registry);
      throw new Error("expected unknown_recipe");
    } catch (error) {
      expect((error as RecipeCompileError).kind).toBe("unknown_recipe");
    }
  });

  it("a tampered compiled plan fails strict parse (plan digest is bound)", () => {
    const compiled = compileRecipePlan(planOf({ base: "focus.v1" }), registry);
    expect(parseCompiledRecipePlan(JSON.parse(JSON.stringify(compiled)) as unknown)).toEqual(compiled);
    expect(() => parseCompiledRecipePlan({ ...compiled, baseMode: "COORDINATE" })).toThrow(/digest does not match/);
  });
});

/* ------------------------------------------------------------------ *
 * Execution (governed services only)
 * ------------------------------------------------------------------ */

describe("G10-S recipe execution", () => {
  it("returns capability_required when the reasoning/branch dependencies are absent (S-N04/S-N05/S-N29/S-N30)", async () => {
    const compiled = compileRecipePlan(planOf({ base: "explore.v1", parameters: { question: "q", branchCount: 2 } }), registry);
    const noDeps = makeRecipeExecutionService({ localPeer: P });
    await expect(noDeps.execute(compiled, {})).resolves.toMatchObject({ status: "capability_required", capability: "reasoning_cell" });

    const noBranch = makeRecipeExecutionService({ localPeer: P, reasoning: reasoningSpy([]) });
    await expect(noBranch.execute(compiled, {})).resolves.toMatchObject({ status: "capability_required", capability: "branch_execution" });
  });

  it("EXPLORE submits + evaluates through the service and never admits a claim directly", async () => {
    const calls: string[] = [];
    const reasoning = reasoningSpy(calls);
    const branchExecution: ReasoningBranchExecutionPort = { adapterId: "fake", run: async () => ({ statement: "a candidate" }) };
    const service = makeRecipeExecutionService({ localPeer: P, reasoning, branchExecution });
    const compiled = compileRecipePlan(planOf({ base: "explore.v1", parameters: { question: "q", branchCount: 2 } }), registry);

    const outcome = await service.execute(compiled, {});
    expect(outcome).toMatchObject({ status: "explored", branchExecutions: 2, unresolved: 0 });
    expect(calls).toContain("submitCandidate");
    expect(calls).toContain("evaluateCandidate");
    // No admission port is ever called from this layer; the service exposes none.
    expect(calls).not.toContain("admit");
    expect((reasoning as unknown as Record<string, unknown>).admit).toBeUndefined();
  });

  it("never touches a peer/continuity mutator (a proxy federation throws on ANY access)", async () => {
    const bomb = new Proxy({} as object, {
      get() {
        throw new Error("a recipe execution touched a peer/continuity mutator");
      },
    }) as unknown as FederationService;
    const branchExecution: ReasoningBranchExecutionPort = { adapterId: "fake", run: async () => ({ statement: "s" }) };
    const service = makeRecipeExecutionService({ localPeer: P, reasoning: reasoningSpy([]), branchExecution, federation: bomb });
    const compiled = compileRecipePlan(planOf({ base: "explore.v1", parameters: { question: "q", branchCount: 2 } }), registry);
    await expect(service.execute(compiled, {})).resolves.toMatchObject({ status: "explored" });
  });

  it("COORDINATE surfaces only the EXISTING refs and creates no peer", async () => {
    const service = makeRecipeExecutionService({ localPeer: P });
    const compiled = compileRecipePlan(planOf({ base: "coordinate.v1", existingSubjectRefs: ["peer-a"] }), registry);
    const outcome = await service.execute(compiled, {});
    expect(outcome).toMatchObject({ status: "coordination_surfaced" });
    if (outcome.status === "coordination_surfaced") {
      expect(outcome.peerRefs).toEqual([{ schemaVersion: 1, peerId: "peer-a" }]);
    }
  });
});

/* ------------------------------------------------------------------ *
 * Product wiring (install + HTTP + tools)
 * ------------------------------------------------------------------ */

describe("G10-S product wiring", () => {
  it("FOCUS compiles+executes against a real Work-only install and conjures no advanced surface", async () => {
    const installed = installPalimpsest(context() as never, {
      projectId: "s-focus",
      databasePath: nextPath("state"),
      ordariumDatabasePath: nextPath("ord"),
      localPeer: P,
    });
    try {
      expect(installed.recipes.list()).toHaveLength(5);
      expect(installed.recipeExecution).toBeDefined();
      expect(installed.application.recipeExecution).toBeDefined();
      expect(installed.application.recipes).toBeDefined();

      const plan = planOf({ base: "focus.v1", registry: installed.recipes });
      const compiled = installed.application.recipeExecution!.compile(plan);
      const outcome = await installed.application.recipeExecution!.start(compiled, {});
      expect(outcome).toEqual({ status: "reused_principal" });

      // Executing FOCUS creates no collaboration/cognition/organization surface of its own.
      const application = installed.application;
      expect(application.federation).toBeUndefined();
      expect(application.boundary).toBeUndefined();
      expect(application.organization).toBeUndefined();
      expect(application.campaign).toBeUndefined();
      expect(application.dynamics).toBeUndefined();
      expect(application.evolution).toBeUndefined();
      expect(application.reasoning).toBeUndefined();
      expect(application.attention).toBeUndefined();
      expect(application.empirical).toBeUndefined();
      expect(application.advisor).toBeUndefined();
    } finally {
      await installed.dispose();
    }
  });

  it("exposes strict read-only recipes routes plus a governed compile/execute", async () => {
    const installed = installPalimpsest(context() as never, {
      projectId: "s-http",
      databasePath: nextPath("state"),
      ordariumDatabasePath: nextPath("ord"),
      localPeer: P,
    });
    try {
      const surfaces = (await http(installed, "GET", "/api/application/surfaces")).body as Record<string, boolean>;
      expect(surfaces.recipes).toBe(true);
      expect(surfaces.recipeExecution).toBe(true);
      expect(surfaces.advisor).toBe(false);

      const listed = (await http(installed, "GET", "/api/recipes")).body as readonly { recipeId: string }[];
      expect(listed).toHaveLength(5);
      expect((await http(installed, "GET", "/api/recipes/recipe?id=focus.v1")).body).toMatchObject({ recipeId: "focus.v1" });
      const readiness = (await http(installed, "GET", "/api/recipes/readiness")).body as readonly { recipeId: string; readiness: string }[];
      expect(readiness.find((entry) => entry.recipeId === "monitor.v1")!.readiness).toBe("PREVIEW_ONLY");

      // wrong method is rejected
      expect((await http(installed, "GET", "/api/recipes/compile")).status).toBe(400);

      const plan = planOf({ base: "focus.v1", registry: installed.recipes });
      const compiled = (await http(installed, "POST", "/api/recipes/compile", plan)).body as CompiledRecipePlan;
      expect(compiled.steps).toEqual([{ kind: "reuse_principal" }]);
      // A tampered planId is a strict 400, never silently compiled.
      expect((await http(installed, "POST", "/api/recipes/compile", { ...plan, planId: "plan-x" })).status).toBe(400);

      const executed = (await http(installed, "POST", "/api/recipes/execute", { compiled })).body;
      expect(executed).toEqual({ status: "reused_principal" });
    } finally {
      await installed.dispose();
    }
  });

  it("exposes the recipe/advisor tools with no identity or authority field", async () => {
    const installed = installPalimpsest(context() as never, {
      projectId: "s-tools",
      databasePath: nextPath("state"),
      ordariumDatabasePath: nextPath("ord"),
      localPeer: P,
    });
    try {
      const names = installed.tools.map((tool) => tool.name);
      expect(names).toContain("palimpsest_recipes");
      expect(names).toContain("palimpsest_recipe");
      expect(names).not.toContain("palimpsest_advisor"); // no memory store here

      for (const forbidden of ["localPeer", "from", "authenticated", "authority", "peerId", "force_authority", "force_admit", "spawn_peer"]) {
        for (const name of ["palimpsest_recipes", "palimpsest_recipe", "palimpsest_advisor"]) {
          const definition = installed.tools.find((tool) => tool.name === name);
          if (definition === undefined) continue;
          const properties = Object.keys((definition.parameters as { properties?: Record<string, unknown> }).properties ?? {});
          expect(properties).not.toContain(forbidden);
        }
      }

      const recipesList = (await callTool(installed.tools, "palimpsest_recipes", { action: "list" })) as readonly { recipeId: string }[];
      expect(recipesList).toHaveLength(5);
      const status = (await callTool(installed.tools, "palimpsest_recipe", { action: "status" })) as { reasoningCell: boolean; branchExecution: boolean };
      expect(status).toMatchObject({ reasoningCell: false, branchExecution: false });

      const plan = planOf({ base: "focus.v1", registry: installed.recipes });
      const compiled = (await callTool(installed.tools, "palimpsest_recipe", { action: "compile", plan })) as CompiledRecipePlan;
      const executed = await callTool(installed.tools, "palimpsest_recipe", { action: "start", compiled });
      expect(executed).toEqual({ status: "reused_principal" });
      await expect(callTool(installed.tools, "palimpsest_recipes", { action: "list", localPeer: "evil" })).rejects.toThrow(/unknown argument/);
    } finally {
      await installed.dispose();
    }
  });
});
