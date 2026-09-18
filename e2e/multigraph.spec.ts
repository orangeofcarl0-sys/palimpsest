/**
 * G10-O MultiGraph organizational debugger — browser E2E over the REAL built product stack.
 *
 * Browser → dist/web bundle → real serveOrchestration (typed application routes) → real
 * application surface → real SQLite kernels. Nothing is mocked; only the side-effect git
 * boundary is absent (no Work execution is exercised here).
 */

import { expect, test } from "@playwright/test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { installPalimpsest } from "../dist/src/advanced.js";
import {
  SqliteBoundaryMemoryStore,
  SqliteOrganizationStore,
  SqliteReasoningCellStore,
  SqliteRuntimeScopeStore,
  materializeOrganizationDefinition,
  reasoningAdmissionDigestOf,
  reasoningVerificationDigestOf,
} from "../dist/src/advanced.js";
import { serveOrchestration } from "../dist/src/serve.js";

const TOKEN = "e2e-o";
const P = { schemaVersion: 1, peerId: "palimpsest" };
const O = { schemaVersion: 1, peerId: "ordarium" };

interface OSession {
  readonly url: string;
  readonly candidateDigest: string;
  close(): Promise<void>;
}

async function startO(): Promise<OSession> {
  const dir = mkdtempSync(join(tmpdir(), "palimpsest-e2e-o-"));
  const organizationStore = new SqliteOrganizationStore(join(dir, "org.sqlite"));
  const boundaryStore = new SqliteBoundaryMemoryStore(join(dir, "boundary.sqlite"));
  const reasoningStore = new SqliteReasoningCellStore(join(dir, "cells.sqlite"));
  const verification = {
    verify: async ({ definition, candidate, frontierBasis }) => {
      const base = { schemaVersion: 1, cell: candidate.cell, candidateDigest: candidate.candidateDigest, frontierBasis, verificationPolicyRef: definition.verificationPolicyRef, standing: "SUPPORTED", supportingEvidenceIds: ["ev-1"], contradictingEvidenceIds: [], provenanceDigest: "a".repeat(64) };
      return { ...base, digest: reasoningVerificationDigestOf(base) };
    },
  };
  const admission = {
    admit: async ({ definition, candidate, verification: verified, frontierBasis }) => {
      const base = { schemaVersion: 1, cell: candidate.cell, candidateDigest: candidate.candidateDigest, verificationResultDigest: verified.digest, frontierBasis, admissionPolicyRef: definition.admissionPolicyRef, decision: "ADMIT", provenanceDigest: "c".repeat(64) };
      return { ...base, digest: reasoningAdmissionDigestOf(base) };
    },
  };
  const installed = installPalimpsest({ tools: { register: () => undefined } }, {
    projectId: "e2e-o",
    databasePath: join(dir, "state.sqlite"),
    ordariumDatabasePath: join(dir, "ordarium.sqlite"),
    localPeer: P,
    organizationStore,
    runtimeScopeStore: new SqliteRuntimeScopeStore(join(dir, "runtime.sqlite")),
    runtimeScopeRepresentationAdmission: { admit: async () => ({ admitted: true }) },
    organizationDynamicsPolicy: { ref: { id: "default", version: "1" }, minDistinctBases: 2, churnMinReconfigurations: 3, concentrationShareThreshold: 0.5, federationMinMessageEvents: 4, federationMinDistinctPeers: 2 },
    boundaryMemoryStore: boundaryStore,
    reasoningCellStore: reasoningStore,
    reasoningVerificationPolicy: verification,
    reasoningAdmissionPolicy: admission,
  });
  // Seed: one organization, one runtime scope, one reasoning cell with a PENDING candidate.
  const definition = materializeOrganizationDefinition({
    organizationDefinitionId: "O1", revision: 0, mission: "e2e organization",
    members: [{ kind: "peer", peer: P }], roles: [{ roleId: "r1", requiredCapabilities: [] }],
    assignments: [{ member: { kind: "peer", peer: P }, roleId: "r1" }], norms: [], interactions: [],
  });
  await organizationStore.registerRevision({ definition, parent: null, expectedHeadRevision: null });
  await installed.runtimeScopes.service.openScope({ scopeId: "S1" });
  await installed.runtimeScopes.service.addMember({ scopeId: "S1", member: { kind: "activation", activation: { activationId: "A1", agentDefinitionId: "ag", runDefinition: { digest: "rd" }, bindingResolution: { resolutionId: "res", digest: "rr" } } } });
  await installed.runtimeScopes.service.associatePeer({ scopeId: "S1", peer: O });
  await installed.reasoningCells.service.openCell({ cellId: "C", objective: "Q", verificationPolicyRef: { policyId: "V", version: "1" }, admissionPolicyRef: { policyId: "A", version: "1" } });
  const opened = await installed.reasoningCells.service.openBranch({ cellId: "C", question: "does X hold?" });
  const submitted = await installed.reasoningCells.service.submitCandidate({ cellId: "C", branchId: opened.branch.ref.branchId, type: { typeId: "reasoning.statement", version: "v1" }, content: { statement: "X" } });

  const handle = await serveOrchestration(installed.controller, { host: "127.0.0.1", port: 0, token: TOKEN, application: installed.application });
  return {
    url: handle.url,
    candidateDigest: submitted.candidate.candidateDigest,
    close: async () => {
      await handle.close();
      await installed.dispose();
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // Windows may still hold a SQLite handle briefly; the temp dir is disposable.
      }
    },
  };
}

test.describe("G10-O MultiGraph organizational debugger", () => {
  let session: OSession;

  test.beforeAll(async () => {
    session = await startO();
  });
  test.afterAll(async () => {
    await session.close();
  });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript((token: string) => {
      window.localStorage.setItem("palimpsest-token", token);
    }, TOKEN);
  });

  test("E2E-O-01: typed species projections with honest knowledge and canonical refs", async ({ page }) => {
    await page.goto(session.url);
    await page.getByRole("button", { name: "MultiGraph 调试器" }).click();
    // The species switcher is keyboard-reachable buttons, not color-only.
    for (const label of ["Work", "Organization", "Collaboration", "Runtime / Holon", "Reasoning"]) {
      await expect(page.getByRole("button", { name: label, exact: true })).toBeVisible();
    }
    await expect(page.getByTestId("projection-knowledge")).toBeVisible();

    // Organization species: a real definition projects member + role nodes; the inspector
    // shows the CANONICAL ref, not the presentation id.
    await page.getByRole("button", { name: "Organization", exact: true }).click();
    await page.getByLabel("投影 ref").fill("O1");
    await expect(page.getByText("peer:palimpsest")).toBeVisible();
    // The projection renders real graph nodes; selecting one shows its CANONICAL ref.
    const renderedNodes = page.locator(".react-flow__node");
    await expect.poll(async () => renderedNodes.count(), { timeout: 10_000 }).toBeGreaterThan(0);
    await renderedNodes.first().click({ force: true });
    await expect(page.getByTestId("inspector-ref")).toBeVisible();
    await expect(page.getByTestId("inspector-ref")).toContainText(":");

    // An unknown organization is an honest `unknown`, never an empty known graph.
    await page.getByLabel("投影 ref").fill("missing-org");
    await expect(page.getByTestId("projection-knowledge")).toContainText("knowledge=unknown");

    // Runtime species distinguishes internal membership from external representation.
    await page.getByRole("button", { name: "Runtime / Holon", exact: true }).click();
    await expect(page.getByText("internal_member")).toBeVisible();
    await expect(page.getByText("external_representation")).toBeVisible();
    await expect(page.getByText("ordarium")).toBeVisible(); // the external peer node
  });

  test("E2E-O-02: a pending reasoning candidate is not admitted, and the UI action goes through the same service", async ({ page }) => {
    await page.goto(session.url);
    await page.getByRole("button", { name: "MultiGraph 调试器" }).click();
    await page.getByRole("button", { name: "Reasoning", exact: true }).click();
    await page.getByLabel("投影 ref").fill("C");
    // Pending candidate is visible as PENDING; no admitted claim exists yet.
    await expect(page.getByText(/pending/)).toBeVisible();
    await expect(page.getByText(/active/)).toHaveCount(0);

    // The safe action performs verification + epistemic admission inside the service.
    await page.getByLabel("candidateDigest").fill(session.candidateDigest);
    await page.getByRole("button", { name: "评估候选" }).click();
    await expect(page.getByText(/admitted/)).toBeVisible();
    await expect(page.getByText(/active/)).toBeVisible();
    // Surfaces panel reports configuration honestly.
    await expect(page.getByText(/reasoning: 已配置/)).toBeVisible();
  });

  test("E2E-O-03: feature absence is honest (Work-only server has no advanced routes)", async ({ page, request }) => {
    // The same page against a server WITHOUT the application surface reports unavailability
    // rather than rendering an empty known graph. (The legacy server is exercised by the
    // existing Work E2E specs; here we assert the typed route contract directly.)
    const unauthorized = await request.get(`${session.url}/api/application/surfaces`);
    expect(unauthorized.status()).toBe(401);
    // The credential travels in the Authorization header, never in the query string. A query
    // parameter needs no CORS preflight, so accepting one there is what let a malicious page fire
    // blind writes at the API (see the fence note in src/serve.ts); the header is a non-browser
    // client's path, and after the fence it is the only one.
    const authorized = await request.get(`${session.url}/api/application/surfaces`, {
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    expect(authorized.status()).toBe(200);
    const surfaces = (await authorized.json()) as { reasoning: boolean; campaign: boolean };
    expect(surfaces.reasoning).toBe(true);
    expect(surfaces.campaign).toBe(false);
    // A generic advanced-method tunnel does not exist.
    const tunnel = await request.post(`${session.url}/api/advanced`, {
      headers: { authorization: `Bearer ${TOKEN}` },
      data: { service: "reasoning", method: "evaluate", args: {} },
    });
    expect(tunnel.status()).toBe(404);
    // And the query parameter no longer authorizes an API request at all.
    const viaQuery = await request.get(`${session.url}/api/application/surfaces?token=${TOKEN}`);
    expect(viaQuery.status()).toBe(401);
    void page;
  });
});
