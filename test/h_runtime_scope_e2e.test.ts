/**
 * G10-H — production golden E2E + negatives + install surface + federation origin.
 *
 *   Organization O → RuntimeScope R (explicit O basis) → internal A1/A2 → external PeerRef P
 *   → internal reconfiguration does not change P/boundary → restart reproduces the Holon
 */

import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { installPalimpsest } from "../src/install.js";
import { FakeGitPort } from "../src/effects/index.js";
import { MockHost } from "./helpers.js";
import { SqliteOrganizationStore, materializeOrganizationDefinition, organizationRefOf } from "../src/organization/index.js";
import { SqliteRuntimeScopeStore } from "../src/runtime_scope/index.js";
import type { PeerRef } from "../src/federation/index.js";
import { materializeContactNeed } from "../src/federation/index.js";
import type { RuntimeScopeBoundary, RuntimeScopeMember } from "../src/runtime_scope/index.js";

const SRC = (p: string): string => readFileSync(fileURLToPath(new URL(`../src/${p}`, import.meta.url)), "utf-8");
const strip = (c: string): string => c.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

const ACT = (id: string): RuntimeScopeMember => ({
  kind: "activation",
  activation: { activationId: id, agentDefinitionId: `ag-${id}`, runDefinition: { digest: `rd-${id}` }, bindingResolution: { resolutionId: `res-${id}`, digest: `rr-${id}` } },
});
const peer = (id: string): PeerRef => ({ schemaVersion: 1, peerId: id });
const boundary = (): RuntimeScopeBoundary => ({ boundaryId: "B", protocol: "palimpsest.contact.v1", source: { kind: "runtime_declared", declarationId: "d-1" }, exposed: true });

function install(scopeStore: SqliteRuntimeScopeStore, orgStore: SqliteOrganizationStore | undefined) {
  return installPalimpsest(new MockHost() as never, {
    projectId: "p",
    databasePath: join(mkdtempSync(join(tmpdir(), "pal-h-")), "s.sqlite"),
    ordariumDatabasePath: join(mkdtempSync(join(tmpdir(), "pal-h-ops-")), "o.sqlite"),
    git: new FakeGitPort("c".repeat(40)),
    clock: () => "2026-08-13T00:00:00Z",
    runtimeScopeStore: scopeStore,
    runtimeScopeRepresentationAdmission: { admit: async () => ({ admitted: true as const }) },
    ...(orgStore === undefined ? {} : { organizationStore: orgStore }),
  });
}

describe("H7 golden E2E: recursive runtime organization as one Holon boundary", () => {
  it("represents internal plurality as one explicit external boundary across restart", async () => {
    const scopePath = join(mkdtempSync(join(tmpdir(), "pal-h-scope-")), "runtime_scope.sqlite");
    const orgStore = new SqliteOrganizationStore(":memory:");
    const org = materializeOrganizationDefinition({
      organizationDefinitionId: "O",
      revision: 0,
      mission: "research",
      members: [],
      roles: [],
      assignments: [],
      norms: [],
      interactions: [],
    });
    await orgStore.registerRevision({ definition: org, parent: null, expectedHeadRevision: null });
    const orgRef = organizationRefOf(org);

    let scopeStore = new SqliteRuntimeScopeStore(scopePath);
    let installed = install(scopeStore, orgStore);
    const service = installed.runtimeScopes!.service;

    // 1–3. Organization-grounded scope with internal activations.
    await service.openScope({ scopeId: "R", organizationBasis: orgRef });
    await service.addMember({ scopeId: "R", member: ACT("A1") });
    await service.addMember({ scopeId: "R", member: ACT("A2") });

    // 4–5. External peer associated explicitly; the Holon view shows P/boundary/basis, not A1/A2.
    await service.associatePeer({ scopeId: "R", peer: peer("P") });
    await service.declareBoundary({ scopeId: "R", boundary: boundary() });
    const view = await installed.holons!.view("R");
    expect(view.peer).toEqual(peer("P"));
    expect(view.boundary?.boundaryId).toBe("B");
    expect(view.organizationBasis).toEqual(orgRef);
    expect(view.organizationBasisFreshness).toBe("current");
    expect(JSON.stringify(view)).not.toContain("A1");

    // 6–8. Internal reconfiguration; external identity/boundary unchanged.
    await service.removeMember({ scopeId: "R", memberKey: "activation:A1", reason: "replaced" });
    await service.addMember({ scopeId: "R", member: ACT("A3") });
    const afterReconfig = await installed.holons!.view("R");
    expect(afterReconfig.peer).toEqual(peer("P"));
    expect(afterReconfig.digest).toBe(view.digest);

    // 10. Nested child scope is encapsulated: adding it changes internal structure only.
    await service.openScope({ scopeId: "C" });
    await service.addMember({ scopeId: "C", member: ACT("C1") });
    await service.addMember({ scopeId: "R", member: { kind: "child_scope", scope: { schemaVersion: 1, scopeId: "C" } } });
    expect((await installed.holons!.view("R")).digest).toBe(view.digest);
    expect((await service.scopeState("R")).children.map((c) => c.scopeId)).toEqual(["C"]);

    // 9. Restart reproduces the same external Holon state.
    scopeStore.close();
    scopeStore = new SqliteRuntimeScopeStore(scopePath);
    installed = install(scopeStore, orgStore);
    const replayed = await installed.holons!.view("R");
    expect(replayed.digest).toBe(view.digest);
    expect(replayed.peer).toEqual(peer("P"));
    expect((await installed.runtimeScopes!.service.scopeState("R")).members.map((m) => (m.kind === "activation" ? m.activation.activationId : "child:C")).sort()).toEqual(["A2", "A3", "child:C"]);
    scopeStore.close();
    orgStore.close();
  });
});

describe("H7 negatives & firewalls", () => {
  it("N01/N02/N03/N04: organization without runtime; scope without org; no ghost activation; no org copy", async () => {
    const orgStore = new SqliteOrganizationStore(":memory:");
    const org = materializeOrganizationDefinition({ organizationDefinitionId: "O", revision: 0, mission: "m", members: [], roles: [], assignments: [], norms: [], interactions: [] });
    await orgStore.registerRevision({ definition: org, parent: null, expectedHeadRevision: null });
    const scopeStore = new SqliteRuntimeScopeStore(":memory:");
    const installed = install(scopeStore, orgStore);
    const service = installed.runtimeScopes!.service;

    // N01: organization exists, zero runtime scopes.
    expect(await service.listScopes()).toHaveLength(0);
    // N02: scope with no organization association is honestly expressible.
    await service.openScope({ scopeId: "solo" });
    expect((await installed.holons!.view("solo")).organizationBasisFreshness).toBe("unassociated");
    // N03/N04: no ghost activation; scope membership writes no organization revision.
    const before = await orgStore.lineage("O");
    await service.addMember({ scopeId: "solo", member: ACT("temp") });
    expect((await service.scopeState("solo")).members).toHaveLength(1);
    expect(await orgStore.lineage("O")).toEqual(before);
    scopeStore.close();
    orgStore.close();
  });

  it("H-A26: the runtime-organization surface is absent without wiring (never stubbed)", () => {
    const bare = installPalimpsest(new MockHost() as never, {
      projectId: "p",
      databasePath: join(mkdtempSync(join(tmpdir(), "pal-h-bare-")), "s.sqlite"),
      ordariumDatabasePath: join(mkdtempSync(join(tmpdir(), "pal-h-bare-ops-")), "o.sqlite"),
      git: new FakeGitPort("c".repeat(40)),
      clock: () => "2026-08-13T00:00:00Z",
    });
    expect(bare.runtimeScopes).toBeUndefined();
    expect(bare.holons).toBeUndefined();
  });

  it("H-A22/A21/A27/A28: no scheduler/manager/effect-authority coupling", () => {
    for (const file of ["scheduler/scheduler.ts", "runtime/realize.ts", "federation/federation_service.ts", "organization/store.ts", "institution/store.ts"]) {
      expect(strip(SRC(file))).not.toMatch(/runtime_scope/);
    }
    // runtime_scope imports no effects/Ordarium authority surface.
    for (const file of ["store.ts", "service.ts", "artifacts.ts", "ref.ts"]) {
      expect(strip(readFileSync(fileURLToPath(new URL(`../src/runtime_scope/${file}`, import.meta.url)), "utf-8"))).not.toMatch(/ordarium|effects\//i);
    }
    // Root contract core stays free of the runtime-organization surface.
    expect(SRC("index.ts")).not.toMatch(/runtime_scope|RuntimeScope|Holon/);
  });

  it("H-A24: the ContactNeed runtime_scope origin is typed and grounded", () => {
    const need = materializeContactNeed({
      contactNeedId: "n1",
      origin: { kind: "runtime_scope", scope: { schemaVersion: 1, scopeId: "R" } },
      competenceTags: ["x"],
      reason: "r",
    });
    expect(need.origin.kind === "runtime_scope" && need.origin.scope.scopeId).toBe("R");
    expect(() =>
      materializeContactNeed({ contactNeedId: "n2", origin: { kind: "runtime_scope", scope: "legacy" } as never, competenceTags: ["x"], reason: "r" }),
    ).toThrow();
  });
});
