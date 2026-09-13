/**
 * G10-H — Holon external view: explicit representation, boundary, and
 * internal ⟂ external independence (H-A11…A14, A29, N05…N07, N12).
 */

import { describe, expect, it } from "vitest";

import { SqliteRuntimeScopeStore, makeRuntimeScopeService } from "../src/runtime_scope/index.js";
import type { RuntimeScopeBoundary, RuntimeScopeMember } from "../src/runtime_scope/index.js";
import type { PeerRef } from "../src/federation/index.js";

const ACT = (id: string): RuntimeScopeMember => ({
  kind: "activation",
  activation: { activationId: id, agentDefinitionId: `ag-${id}`, runDefinition: { digest: `rd-${id}` }, bindingResolution: { resolutionId: `res-${id}`, digest: `rr-${id}` } },
});
const peer = (id: string): PeerRef => ({ schemaVersion: 1, peerId: id });
const boundary = (id: string, exposed = true): RuntimeScopeBoundary => ({ boundaryId: id, protocol: "palimpsest.contact.v1", sourceInteractionId: "i-1", exposed });

function env() {
  const store = new SqliteRuntimeScopeStore(":memory:");
  return { store, service: makeRuntimeScopeService({ store }) };
}

describe("H4 Holon external view", () => {
  it("H-A11/H-A03/N07: the external peer is explicit only — never inferred from a member", async () => {
    const { service, store } = env();
    await service.openScope({ scopeId: "R" });
    await service.addMember({ scopeId: "R", member: ACT("A1") });
    // No peer association yet → external peer is null, even though a member exists.
    expect((await service.holonView("R")).peer).toBeNull();
    // A PeerRef whose peerId equals the scopeId is NOT automatically linked.
    await service.associatePeer({ scopeId: "R", peer: peer("R") });
    expect((await service.holonView("R")).peer).toEqual(peer("R"));
    store.close();
  });

  it("H-A12/A29/N05: internal reconfiguration preserves external identity when the boundary is unchanged", async () => {
    const { service, store } = env();
    await service.openScope({ scopeId: "R" });
    await service.associatePeer({ scopeId: "R", peer: peer("P") });
    await service.declareBoundary({ scopeId: "R", boundary: boundary("B") });
    await service.addMember({ scopeId: "R", member: ACT("A1") });
    await service.addMember({ scopeId: "R", member: ACT("A2") });
    const before = await service.holonView("R");

    // Reconfigure: A1 out, A3 in, A2 untouched.
    await service.removeMember({ scopeId: "R", memberKey: "activation:A1", reason: "replaced" });
    await service.addMember({ scopeId: "R", member: ACT("A3") });

    const after = await service.holonView("R");
    expect(after.peer).toEqual(peer("P"));
    expect(after.boundary).toEqual(boundary("B"));
    expect(after.digest).toBe(before.digest); // external identity unchanged
    const members = await service.members("R");
    expect(members.map((m) => (m.kind === "activation" ? m.activation.activationId : "")).sort()).toEqual(["A2", "A3"]);
    store.close();
  });

  it("H-A13: the Holon view exposes the boundary, not internal topology", async () => {
    const { service, store } = env();
    await service.openScope({ scopeId: "R" });
    await service.addMember({ scopeId: "R", member: ACT("A1") });
    const view = await service.holonView("R");
    expect(Object.keys(view).sort()).toEqual(["boundary", "digest", "lifecycle", "organizationBasis", "organizationBasisFreshness", "peer", "scope"]);
    expect(JSON.stringify(view)).not.toContain("A1");
    expect(JSON.stringify(await service.scopeState("R"))).toContain("A1");
    store.close();
  });

  it("N12: a boundary change changes the external contract; a member change does not", async () => {
    const { service, store } = env();
    await service.openScope({ scopeId: "R" });
    await service.declareBoundary({ scopeId: "R", boundary: boundary("B1") });
    const withBoundary = (await service.holonView("R")).digest;
    await service.addMember({ scopeId: "R", member: ACT("A9") });
    expect((await service.holonView("R")).digest).toBe(withBoundary);
    await service.declareBoundary({ scopeId: "R", boundary: boundary("B2") });
    expect((await service.holonView("R")).digest).not.toBe(withBoundary);
    store.close();
  });

  it("H-A14/N06: there is no representative/focus semantics — focus cannot change representation", async () => {
    const { service, store } = env();
    await service.openScope({ scopeId: "R" });
    await service.addMember({ scopeId: "R", member: ACT("first-oldest") });
    // The service has no focus/representative API and the view has no such field.
    expect(Object.hasOwn(service, "setFocus")).toBe(false);
    expect(Object.hasOwn(service, "representative")).toBe(false);
    expect((await service.holonView("R")).peer).toBeNull();
    store.close();
  });
});
