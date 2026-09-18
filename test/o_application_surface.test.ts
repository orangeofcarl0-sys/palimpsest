/**
 * G10-O application surface — tool/HTTP parity, mutation verticals, projection honesty,
 * authority firewalls, partial-install composition, and Work-only backward compatibility
 * (APP-A01…A40).
 */

import { afterAll, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { installPalimpsest } from "../src/install.js";
import { defineApplicationTools } from "../src/tools/application_tools.js";
import type { InstalledPalimpsest } from "../src/install.js";
import { handleApplicationRequest } from "../src/application/http.js";
import { SqliteBoundaryMemoryStore } from "../src/boundary_memory/index.js";
import type { BoundaryMemoryStore } from "../src/boundary_memory/index.js";
import { SqliteReasoningCellStore, invalidationAdmissionDigestOf, invalidationVerificationDigestOf, reasoningAdmissionDigestOf, reasoningVerificationDigestOf } from "../src/reasoning_cell/index.js";
import type { ReasoningEpistemicAdmissionPolicyPort, ReasoningVerificationPolicyPort } from "../src/reasoning_cell/index.js";
import { SqliteOrganizationStore, materializeOrganizationDefinition } from "../src/organization/index.js";
import { SqliteRuntimeScopeStore } from "../src/runtime_scope/index.js";
import { SqliteCoordinationStore } from "../src/coordination/index.js";
import type { DshToolDefinition, DshToolRunContext } from "../src/tools/dsh_types.js";
import type { DynamicsPolicy } from "../src/organization_dynamics/index.js";
import type { PeerRef } from "../src/federation/index.js";

const SRC = (p: string): string => readFileSync(fileURLToPath(new URL(`../src/${p}`, import.meta.url)), "utf-8");
const strip = (c: string): string => c.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

const DIR = mkdtempSync(join(tmpdir(), "palimpsest-o-"));
afterAll(() => {
  try { rmSync(DIR, { recursive: true, force: true }); } catch { /* windows handle */ }
});
let pathSeq = 0;
const nextPath = (name: string): string => join(DIR, `${name}-${++pathSeq}.sqlite`);

const P: PeerRef = { schemaVersion: 1, peerId: "palimpsest" };
const O: PeerRef = { schemaVersion: 1, peerId: "ordarium" };
const policy: DynamicsPolicy = { ref: { id: "default", version: "1" }, minDistinctBases: 2, churnMinReconfigurations: 3, concentrationShareThreshold: 0.5, federationMinMessageEvents: 4, federationMinDistinctPeers: 2 };

function context(): { tools: { register(definition: DshToolDefinition): void } } {
  return { tools: { register: () => undefined } };
}

function policies(): { verification: ReasoningVerificationPolicyPort; admission: ReasoningEpistemicAdmissionPolicyPort } {
  const verification: ReasoningVerificationPolicyPort = {
    verify: async ({ definition, candidate, frontierBasis }) => {
      const base = { schemaVersion: 1 as const, cell: candidate.cell, candidateDigest: candidate.candidateDigest, frontierBasis, verificationPolicyRef: definition.verificationPolicyRef, standing: "SUPPORTED" as const, supportingEvidenceIds: ["ev-1"], contradictingEvidenceIds: [], provenanceDigest: "a".repeat(64) };
      return { ...base, digest: reasoningVerificationDigestOf(base) };
    },
    verifyInvalidation: async ({ definition, request, frontierBasis }) => {
      const base = { schemaVersion: 1 as const, cell: request.cell, targetClaimId: request.targetClaimId, requestDigest: request.requestDigest, frontierBasis, verificationPolicyRef: definition.verificationPolicyRef, standing: "SUPPORTED" as const, evidenceIds: [], provenanceDigest: "b".repeat(64) };
      return { ...base, digest: invalidationVerificationDigestOf(base) };
    },
  };
  const admission: ReasoningEpistemicAdmissionPolicyPort = {
    admit: async ({ definition, candidate, verification, frontierBasis }) => {
      const base = { schemaVersion: 1 as const, cell: candidate.cell, candidateDigest: candidate.candidateDigest, verificationResultDigest: verification.digest, frontierBasis, admissionPolicyRef: definition.admissionPolicyRef, decision: "ADMIT" as const, provenanceDigest: "c".repeat(64) };
      return { ...base, digest: reasoningAdmissionDigestOf(base) };
    },
    admitInvalidation: async ({ definition, request, verification, frontierBasis }) => {
      const base = { schemaVersion: 1 as const, cell: request.cell, targetClaimId: request.targetClaimId, requestDigest: request.requestDigest, verificationResultDigest: verification.digest, frontierBasis, admissionPolicyRef: definition.admissionPolicyRef, decision: "INVALIDATE" as const, provenanceDigest: "d".repeat(64) };
      return { ...base, digest: invalidationAdmissionDigestOf(base) };
    },
  };
  return { verification, admission };
}

function fullInstall(): { installed: InstalledPalimpsest; boundary: BoundaryMemoryStore; reasoning: SqliteReasoningCellStore } {
  const boundary = new SqliteBoundaryMemoryStore(":memory:");
  const reasoning = new SqliteReasoningCellStore(":memory:");
  const { verification, admission } = policies();
  const installed = installPalimpsest(context() as never, {
    projectId: "p-o",
    databasePath: nextPath("state"),
    ordariumDatabasePath: nextPath("ord"),
    localPeer: P,
    coordinationStore: new SqliteCoordinationStore(":memory:"),
    peerTransportPort: { adapterId: "test", send: async () => ({ transportMessageId: "t", delivered: true }) },
    peerDirectoryPort: { observePeers: async () => ({ state: "known", value: [] }) },
    attemptCatalog: { assertAdmissibleAttempt: async () => undefined },
    organizationStore: new SqliteOrganizationStore(":memory:"),
    runtimeScopeStore: new SqliteRuntimeScopeStore(":memory:"),
    runtimeScopeRepresentationAdmission: { admit: async () => ({ admitted: true }) },
    organizationDynamicsPolicy: policy,
    boundaryMemoryStore: boundary,
    reasoningCellStore: reasoning,
    reasoningVerificationPolicy: verification,
    reasoningAdmissionPolicy: admission,
  });
  return { installed, boundary, reasoning };
}

function bareInstall(): InstalledPalimpsest {
  return installPalimpsest(context() as never, { projectId: "bare", databasePath: nextPath("state"), ordariumDatabasePath: nextPath("ord") });
}

function toolNamed(tools: readonly DshToolDefinition[], name: string): DshToolDefinition {
  const tool = tools.find((entry) => entry.name === name);
  if (tool === undefined) throw new Error(`tool "${name}" is not registered (registered: ${tools.map((t) => t.name).join(", ")})`);
  return tool;
}

function runContext(name: string, args: unknown): DshToolRunContext {
  return { callId: "c1", rootCallId: "r1", name, arguments: args, signal: new AbortController().signal };
}

async function callTool(tools: readonly DshToolDefinition[], name: string, args: unknown): Promise<unknown> {
  return toolNamed(tools, name).execute(args, runContext(name, args));
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

describe("G10-O backward compatibility (APP-A04/A34)", () => {
  it("a Work-only install keeps exactly the nine Work tools and no advanced application surface", async () => {
    const installed = bareInstall();
    expect(installed.tools.map((tool) => tool.name).sort()).toEqual([
      "palimpsest_claim",
      "palimpsest_gate",
      "palimpsest_next",
      "palimpsest_plan",
      "palimpsest_preview",
      "palimpsest_report",
      "palimpsest_run",
      "palimpsest_start",
      "palimpsest_status",
    ]);
    expect(installed.application.work).toBeDefined();
    expect(installed.application.federation).toBeUndefined();
    expect(installed.application.boundary).toBeUndefined();
    expect(installed.application.reasoning).toBeUndefined();
    expect(installed.application.projections).toBeUndefined();
    // An unconfigured advanced route is ABSENT (not a fake empty surface).
    expect(await handleApplicationRequest({ application: installed.application, method: "GET", pathname: "/api/reasoning/frontier", query: new URLSearchParams({ cellId: "C" }), body: undefined })).toMatchObject({ status: 501 });
    await installed.dispose();
  });
});

describe("G10-O agent tools over the application surface", () => {
  it("APP-A02/A05: advanced tools appear only with their surface, and surfaces are reported", async () => {
    const { installed } = fullInstall();
    const names = installed.tools.map((tool) => tool.name);
    for (const expected of ["palimpsest_surfaces", "palimpsest_federation", "palimpsest_boundary", "palimpsest_runtime_view", "palimpsest_organization_view", "palimpsest_dynamics", "palimpsest_reasoning", "palimpsest_graph"]) {
      expect(names).toContain(expected);
    }
    const surfaces = (await callTool(installed.tools, "palimpsest_surfaces", { action: "list" })) as Record<string, boolean>;
    expect(surfaces.reasoning).toBe(true);
    expect(surfaces.boundary).toBe(true);
    // Campaign is absent here (no campaign store) — reported honestly, not as an empty surface.
    expect(surfaces.campaign).toBe(false);
    await installed.dispose();
  });

  it("APP-A06…A10: a caller cannot inject identity/authority/verification/admission", async () => {
    const { installed } = fullInstall();
    for (const tool of installed.tools) {
      const properties = Object.keys((tool.parameters as { properties?: Record<string, unknown> }).properties ?? {});
      for (const forbidden of ["from", "authenticated", "localPeer", "acceptedBy", "verificationResult", "admissionDecision", "authorized", "authority", "event", "appendEvent"]) {
        expect(properties).not.toContain(forbidden);
      }
      expect((tool.parameters as { additionalProperties?: unknown }).additionalProperties).toBe(false);
    }
    // Unknown fields are rejected at the tool boundary.
    await expect(callTool(installed.tools, "palimpsest_federation", { action: "inbox", from: "evil" })).rejects.toThrow(/unknown argument/);
    await expect(callTool(installed.tools, "palimpsest_reasoning", { action: "evaluate", cellId: "C", candidateDigest: "x", admissionDecision: { decision: "ADMIT" } })).rejects.toThrow(/unknown argument/);
    await installed.dispose();
  });

  it("APP-A13/A20: the boundary mutation vertical goes tool → application → boundary truth", async () => {
    const { installed, boundary } = fullInstall();
    await boundary.openWorkspace({ schemaVersion: 1, workspaceId: "W", participants: [P, O], purpose: "shared" } as never);
    await installed.boundaryMemory!.service.createArtifact({ workspaceId: "W", artifactId: "A", type: { typeId: "boundary.statement", version: "v1" }, title: "t" });
    const proposed = (await callTool(installed.tools, "palimpsest_boundary", { action: "propose", workspaceId: "W", artifactId: "A", content: { statement: "v1", tags: ["requirement"], references: [] }, requiredAcceptors: [P.peerId, O.peerId], intent: "decl" })) as { digest: string };
    // The tool cannot accept for other peers: local acceptance is derived, and the canonical
    // head only advances once BOTH required acceptors have accepted.
    await callTool(installed.tools, "palimpsest_boundary", { action: "decide", workspaceId: "W", artifactId: "A", candidateDigest: proposed.digest, decision: "accept" });
    expect(await installed.boundaryMemory!.service.currentAccepted({ workspaceId: "W", artifactId: "A" })).toBeNull();
    await installed.boundaryMemory!.service.acceptRevision({ workspaceId: "W", artifactId: "A", candidateDigest: proposed.digest, authenticatedPeer: O });
    const head = (await installed.boundaryMemory!.service.currentAccepted({ workspaceId: "W", artifactId: "A" }))!.ref;
    expect(head.revision).toBe(0);
    // HTTP sees exactly the same canonical state.
    const viaHttp = (await http(installed, "GET", "/api/boundary/current?workspaceId=W&artifactId=A")).body as { ref: { revision: number } };
    expect(viaHttp.ref.revision).toBe(head.revision);
    await installed.dispose();
  });

  it("APP-A08/A09: the reasoning vertical evaluates through the service (caller never supplies results)", async () => {
    const { installed, reasoning } = fullInstall();
    await installed.reasoningCells!.service.openCell({ cellId: "C", objective: "Q", verificationPolicyRef: { policyId: "V", version: "1" }, admissionPolicyRef: { policyId: "A", version: "1" } });
    const opened = (await callTool(installed.tools, "palimpsest_reasoning", { action: "branch", cellId: "C", question: "q" })) as { branch: { ref: { branchId: string } } };
    const submitted = (await callTool(installed.tools, "palimpsest_reasoning", { action: "candidate", cellId: "C", branchId: opened.branch.ref.branchId, type: { typeId: "reasoning.statement", version: "v1" }, content: { statement: "X" } })) as { candidate: { candidateDigest: string } };
    // Before evaluation the frontier is empty and the candidate is NOT admitted.
    expect(((await http(installed, "GET", "/api/reasoning/frontier?cellId=C")).body as { claims: unknown[] }).claims).toHaveLength(0);
    const evaluated = (await callTool(installed.tools, "palimpsest_reasoning", { action: "evaluate", cellId: "C", candidateDigest: submitted.candidate.candidateDigest })) as { status: string };
    expect(evaluated.status).toBe("admitted");
    const frontier = (await http(installed, "GET", "/api/reasoning/frontier?cellId=C")).body as { claims: readonly { ref: { claimId: string } }[] };
    expect(frontier.claims).toHaveLength(1);
    await installed.dispose();
  });
});

describe("G10-O typed HTTP routes (APP-A07/A12/A14)", () => {
  it("routes are strict, namespaced, and mapped to honest statuses; no generic tunnel exists", async () => {
    const { installed } = fullInstall();
    expect((await http(installed, "GET", "/api/application/surfaces")).status).toBe(200);
    // wrong method
    expect((await http(installed, "GET", "/api/reasoning/evaluate?cellId=C")).status).toBe(400);
    // unknown route → not an application route
    expect(await handleApplicationRequest({ application: installed.application, method: "POST", pathname: "/api/advanced", query: new URLSearchParams(), body: { service: "x", method: "y" } })).toBeUndefined();
    // malformed typed ref
    expect((await http(installed, "GET", "/api/organization/view?organizationDefinitionId=nope")).status).toBe(404);
    // raw-store endpoints do not exist
    expect(await handleApplicationRequest({ application: installed.application, method: "POST", pathname: "/api/store/append", query: new URLSearchParams(), body: {} })).toBeUndefined();
    // an unknown reasoning cell is 404, not an empty known frontier
    expect((await http(installed, "GET", "/api/reasoning/frontier?cellId=MISSING")).status).toBe(404);
    await installed.dispose();
  });
});

describe("G10-O typed MultiGraph projections (APP-A15…A24)", () => {
  it("projections carry canonical refs, honest knowledge, and distinct species semantics", async () => {
    const { installed } = fullInstall();
    const work = (await http(installed, "GET", "/api/projection/work")).body as { species: string; knowledge: string; nodes: readonly { presentationId: string; ref: { species: string } }[]; projectionDigest: string };
    expect(work.species).toBe("work");
    expect(["known", "error", "unknown"]).toContain(work.knowledge);
    expect(work.nodes.every((node) => node.ref.species === "work")).toBe(true);
    expect(work.projectionDigest).toHaveLength(64);

    // An unknown organization is `unknown`, NEVER an empty known graph.
    const unknownOrg = (await http(installed, "GET", "/api/projection/organization?organizationDefinitionId=missing")).body as { knowledge: string; nodes: unknown[] };
    expect(unknownOrg.knowledge).toBe("unknown");
    expect(unknownOrg.nodes).toHaveLength(0);

    // A real organization projects members/roles/assignments distinctly.
    const def = materializeOrganizationDefinition({
      organizationDefinitionId: "O1", revision: 0, mission: "m",
      members: [{ kind: "peer", peer: P }], roles: [{ roleId: "r1", requiredCapabilities: [] }],
      assignments: [{ member: { kind: "peer", peer: P }, roleId: "r1" }], norms: [], interactions: [],
    });
    await installed.organization!.store.registerRevision({ definition: def, parent: null, expectedHeadRevision: null });
    const org = (await http(installed, "GET", "/api/projection/organization?organizationDefinitionId=O1")).body as { knowledge: string; nodes: readonly { kind: string }[]; edges: readonly { kind: string }[] };
    expect(org.knowledge).toBe("known");
    expect(org.nodes.some((node) => node.kind === "member")).toBe(true);
    expect(org.nodes.some((node) => node.kind === "role")).toBe(true);
    expect(org.edges.some((edge) => edge.kind === "assignment")).toBe(true);
    expect(org.edges.some((edge) => edge.kind === "internal_member" || edge.kind === "declared_interaction")).toBe(false);

    // Runtime projection distinguishes internal membership from external representation.
    await installed.runtimeScopes!.service.openScope({ scopeId: "S1" });
    await installed.runtimeScopes!.service.addMember({ scopeId: "S1", member: { kind: "activation", activation: { activationId: "A1", agentDefinitionId: "ag", runDefinition: { digest: "rd" }, bindingResolution: { resolutionId: "res", digest: "rr" } } } });
    await installed.runtimeScopes!.service.associatePeer({ scopeId: "S1", peer: O });
    const runtime = (await http(installed, "GET", "/api/projection/runtime")).body as { edges: readonly { kind: string }[]; nodes: readonly { kind: string }[] };
    expect(runtime.edges.some((edge) => edge.kind === "internal_member")).toBe(true);
    expect(runtime.edges.some((edge) => edge.kind === "external_representation")).toBe(true);
    expect(runtime.nodes.some((node) => node.kind === "external_peer")).toBe(true);
    await installed.dispose();
  });

  it("APP-A28: a pending reasoning candidate is not rendered as an admitted claim", async () => {
    const { installed, reasoning } = fullInstall();
    await installed.reasoningCells!.service.openCell({ cellId: "C", objective: "Q", verificationPolicyRef: { policyId: "V", version: "1" }, admissionPolicyRef: { policyId: "A", version: "1" } });
    const opened = (await callTool(installed.tools, "palimpsest_reasoning", { action: "branch", cellId: "C", question: "q" })) as { branch: { ref: { branchId: string } } };
    await callTool(installed.tools, "palimpsest_reasoning", { action: "candidate", cellId: "C", branchId: opened.branch.ref.branchId, type: { typeId: "reasoning.statement", version: "v1" }, content: { statement: "PENDING" } });
    const projectionBody = (await http(installed, "GET", "/api/projection/reasoning?cellId=C")).body as { nodes: readonly { kind: string; state: string | null }[] };
    const claimNodes = projectionBody.nodes.filter((node) => node.kind === "claim");
    expect(claimNodes).toHaveLength(0);
    const candidateNodes = projectionBody.nodes.filter((node) => node.kind === "candidate");
    expect(candidateNodes).toHaveLength(1);
    expect(candidateNodes[0]!.state).toBe("pending");
    await installed.dispose();
  });
});

describe("G10-O authority & source firewalls (APP-A01/A03/A11/A17/A36/A37)", () => {
  it("no product surface imports store mutators or a universal graph schema", () => {
    for (const file of ["application/http.ts", "application/projections.ts", "application/projection_types.ts", "tools/application_tools.ts"]) {
      const source = strip(SRC(file));
      expect(source).not.toMatch(/from "[^"]*store\.js"/);
      expect(source).not.toMatch(/appendAtomic|applyStructuralTransition|registerRevision|\.retire\(|append\(/);
      expect(source).not.toMatch(/\bdata:\s*any\b/);
      expect(source).not.toMatch(/UniversalNode|GlobalGraphStore|GlobalManager|GlobalPlanner/);
    }
    // The Work controller stays Work-scoped (no advanced module import).
    const controller = strip(SRC("tools/controller.ts"));
    for (const module of ["federation", "boundary_memory", "runtime_scope", "organization", "institution", "campaign", "organization_dynamics", "organization_evolution", "runtime_evolution", "reasoning_cell", "application"]) {
      expect(controller).not.toMatch(new RegExp(`from "\\.\\./${module}/`));
    }
    // HTTP route modules expose no generic advanced-method tunnel.
    expect(strip(SRC("application/http.ts"))).not.toMatch(/\/api\/advanced|service,\s*method,\s*args/);
  });
});

describe("G10-O partial installation matrix (APP-A35)", () => {
  it("optional surfaces compose independently without crashing unrelated surfaces", async () => {
    const orgStore = new SqliteOrganizationStore(":memory:");
    const withOrg = installPalimpsest(context() as never, { projectId: "p1", databasePath: nextPath("state"), ordariumDatabasePath: nextPath("ord"), organizationStore: orgStore });
    expect(withOrg.application.organization).toBeDefined();
    expect(withOrg.application.federation).toBeUndefined();
    expect(withOrg.application.projections).toBeDefined();
    expect(withOrg.tools.map((tool) => tool.name)).toContain("palimpsest_organization_view");
    expect(withOrg.tools.map((tool) => tool.name)).not.toContain("palimpsest_federation");
    expect(withOrg.tools.length).toBeGreaterThan(9);
    await withOrg.dispose();

    const boundaryStore = new SqliteBoundaryMemoryStore(":memory:");
    const withBoundary = installPalimpsest(context() as never, { projectId: "p2", databasePath: nextPath("state"), ordariumDatabasePath: nextPath("ord"), localPeer: P, boundaryMemoryStore: boundaryStore });
    expect(withBoundary.application.boundary).toBeDefined();
    expect(withBoundary.application.reasoning).toBeUndefined();
    expect(withBoundary.tools.map((tool) => tool.name)).toContain("palimpsest_boundary");
    expect(withBoundary.tools.map((tool) => tool.name)).not.toContain("palimpsest_reasoning");
    await withBoundary.dispose();
  });
});

/**
 * APP-A16: the agent can tell a person where to watch this project.
 *
 * The agent is the primary interaction surface and the page is a dashboard beside it, so "where do I
 * look?" has to be answerable from inside a tool result. Only the HOST can answer it, and only after
 * it has served — a profile may ask for port 0 and let the OS choose — so the host supplies a getter.
 * With no host wiring the answer is null: an unknown dashboard must never become an invented url.
 */
describe("APP-A16: the dashboard url reaches the agent through the surfaces tool", () => {
  it("an installation with no host wiring reports null, never a guessed url", async () => {
    const { installed } = fullInstall();
    const surfaces = (await callTool(defineApplicationTools(installed.application), "palimpsest_surfaces", { action: "list" })) as Record<string, unknown>;
    expect(surfaces.dashboardUrl).toBeNull();
    expect(installed.application.work.dashboardUrl()).toBeNull();
    await installed.dispose();
  });

  it("a wired host fact is reported verbatim, and is read at CALL time rather than at install time", async () => {
    // Exactly how the DSH host wires it: the url only exists after serving, so the port is a getter.
    let url: string | null = null;
    const installed = installPalimpsest(context() as never, {
      projectId: "p-o-url",
      databasePath: nextPath("state"),
      ordariumDatabasePath: nextPath("ord"),
      hostFacts: { dashboardUrl: () => url },
    });
    // `installed.tools` is the legacy Work set for a deployment with no advanced surface; the
    // surfaces tool belongs to the application adapter, so ask that one directly.
    const tools = defineApplicationTools(installed.application);
    const before = (await callTool(tools, "palimpsest_surfaces", { action: "list" })) as Record<string, unknown>;
    expect(before.dashboardUrl).toBeNull();

    url = "http://127.0.0.1:7911";
    const after = (await callTool(tools, "palimpsest_surfaces", { action: "list" })) as Record<string, unknown>;
    expect(after.dashboardUrl).toBe("http://127.0.0.1:7911");
    await installed.dispose();
  });
});
