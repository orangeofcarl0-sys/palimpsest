/**
 * G10-H — RuntimeScope identity, canonical store, membership, nesting,
 * lifecycle, and organization association (invariants H-A01…A10, A15…A25).
 */

import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

import {
  RuntimeScopeStoreError,
  SqliteRuntimeScopeStore,
  defaultRuntimeScopePath,
  makeRuntimeScopeService,
  parseRuntimeScopeRef,
} from "../src/runtime_scope/index.js";
import type { OrganizationBasisRef, RuntimeScopeMember, RuntimeScopeOrganizationPort } from "../src/runtime_scope/index.js";
import type { ActivationRef } from "../src/coordination/index.js";

const ACT = (id: string): ActivationRef => ({
  activationId: id,
  agentDefinitionId: `ag-${id}`,
  runDefinition: { digest: `rd-${id}` },
  bindingResolution: { resolutionId: `res-${id}`, digest: `rr-${id}` },
});
const member = (id: string): RuntimeScopeMember => ({ kind: "activation", activation: ACT(id) });
const child = (scopeId: string): RuntimeScopeMember => ({ kind: "child_scope", scope: { schemaVersion: 1, scopeId } });
const basis = (revision = 0, digest = "a".repeat(64)): OrganizationBasisRef => ({ organizationDefinitionId: "org-1", revision, digest });

function orgPort(input: { readonly refs?: readonly OrganizationBasisRef[]; readonly head?: OrganizationBasisRef } = {}): RuntimeScopeOrganizationPort {
  const refs = input.refs ?? [];
  return {
    current: async () => input.head,
    exists: async (ref) => refs.some((candidate) => candidate.organizationDefinitionId === ref.organizationDefinitionId && candidate.revision === ref.revision && candidate.digest === ref.digest),
  };
}

function env(organizations?: RuntimeScopeOrganizationPort) {
  const store = new SqliteRuntimeScopeStore(":memory:");
  const service = makeRuntimeScopeService({ store, ...(organizations === undefined ? {} : { organizations }) });
  return { store, service };
}

const SRC = (p: string): string => readFileSync(fileURLToPath(new URL(`../src/runtime_scope/${p}`, import.meta.url)), "utf-8");
const strip = (c: string): string => c.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

describe("H1 RuntimeScope identity & store", () => {
  it("H-A01…A05/A24: RuntimeScopeRef is a typed, strict identity distinct from other scopes", () => {
    expect(parseRuntimeScopeRef({ schemaVersion: 1, scopeId: "root" })).toEqual({ schemaVersion: 1, scopeId: "root" });
    expect(() => parseRuntimeScopeRef({ scopeId: "root" })).toThrow();
    expect(() => parseRuntimeScopeRef({ schemaVersion: 1, scopeId: "root", extra: 1 })).toThrow();
    expect(() => parseRuntimeScopeRef({ schemaVersion: 1, scopeId: "" })).toThrow();
    // A bare string is never a RuntimeScopeRef (the old ContactNeed debt is closed).
    expect(() => parseRuntimeScopeRef("local")).toThrow();
    expect(defaultRuntimeScopePath().endsWith(join("palimpsest", "runtime_scope.sqlite"))).toBe(true);
    // No runtime-scope module imports the Campaign/Institution/Work stores (no truth overlap).
    for (const file of ["store.ts", "service.ts", "artifacts.ts", "ref.ts"]) {
      const code = strip(SRC(file));
      expect(code).not.toMatch(/campaign\/|institution\/|coordination\/store|state\/index|scheduler\//);
    }
  });

  it("store genesis is explicit and idempotent; a conflicting re-open fails closed", async () => {
    const { service, store } = env();
    await service.openScope({ scopeId: "R" });
    await expect(service.openScope({ scopeId: "R" })).rejects.toBeInstanceOf(RuntimeScopeStoreError);
    store.close();
  });

  it("H-A25/concurrency: a stale expected basis fails closed — membership history cannot fork", async () => {
    const { service, store } = env();
    await service.openScope({ scopeId: "R" });
    const staleBasis = (await store.basis("R"))!;
    await service.addMember({ scopeId: "R", member: member("A1") });
    await expect(
      store.appendAtomic({
        scopeId: "R",
        expectedBasis: staleBasis,
        events: [{ eventId: "evt-manual", type: "SCOPE_MEMBER_ADDED", payload: { member: member("A2") } }],
      }),
    ).rejects.toThrow(/basis/);
    store.close();
  });

  it("H-A10/A25: the projection survives restart; a corrupted durable event fails replay closed", async () => {
    const path = join(mkdtempSync(join(tmpdir(), "pal-h1-")), "scope.sqlite");
    const store = new SqliteRuntimeScopeStore(path);
    const service = makeRuntimeScopeService({ store });
    await service.openScope({ scopeId: "R" });
    await service.addMember({ scopeId: "R", member: member("A1") });
    const before = await service.scopeState("R");
    store.close();

    const reopened = new SqliteRuntimeScopeStore(path);
    const reopenedService = makeRuntimeScopeService({ store: reopened });
    const after = await reopenedService.scopeState("R");
    expect(after.members).toEqual(before.members);
    expect(after.basis.chainDigest).toBe(before.basis.chainDigest);
    reopened.close();

    const db = new DatabaseSync(path);
    db.prepare("UPDATE runtime_scope_events SET payload_json = ? WHERE seq = 2").run(JSON.stringify({ member: { kind: "bogus" } }));
    db.close();
    const corrupted = new SqliteRuntimeScopeStore(path);
    await expect(corrupted.replay("R")).rejects.toBeInstanceOf(RuntimeScopeStoreError);
    corrupted.close();
  });
});

describe("H2 membership, nesting & lifecycle", () => {
  it("membership is typed and deduplicated; removal is explicit", async () => {
    const { service, store } = env();
    await service.openScope({ scopeId: "R" });
    await service.addMember({ scopeId: "R", member: member("A1") });
    await expect(service.addMember({ scopeId: "R", member: member("A1") })).rejects.toThrow(/already present/);
    expect((await service.scopeState("R")).members).toHaveLength(1);
    await service.removeMember({ scopeId: "R", memberKey: "activation:A1", reason: "replaced" });
    expect((await service.scopeState("R")).members).toHaveLength(0);
    await expect(service.removeMember({ scopeId: "R", memberKey: "activation:A1", reason: "again" })).rejects.toThrow(/not present/);
    store.close();
  });

  it("H-A06/A07/N03/N04: runtime membership is independent of organization membership and participation", async () => {
    const { service, store } = env();
    await service.openScope({ scopeId: "R" });
    // No API copies organization members into a scope, and no member is auto-created.
    expect((await service.scopeState("R")).members).toHaveLength(0);
    // Adding a temporary activation member creates no organization membership (no such write path).
    await service.addMember({ scopeId: "R", member: member("temp") });
    expect((await service.scopeState("R")).members.map((m) => (m.kind === "activation" ? m.activation.activationId : ""))).toEqual(["temp"]);
    store.close();
  });

  it("H-A09/N08: nesting is a single-parent forest and cycles fail closed", async () => {
    const { service, store } = env();
    await service.openScope({ scopeId: "root" });
    await service.openScope({ scopeId: "child" });
    await service.openScope({ scopeId: "grand" });
    await service.addMember({ scopeId: "root", member: child("child") });
    await service.addMember({ scopeId: "child", member: child("grand") });
    expect((await service.scopeState("child")).parent?.scopeId).toBe("root");
    expect((await service.scopeState("root")).children.map((c) => c.scopeId)).toEqual(["child"]);
    // second parent
    await expect(service.addMember({ scopeId: "grand", member: child("child") })).rejects.toThrow(/already has a parent/);
    // self-parent
    await expect(service.addMember({ scopeId: "root", member: child("root") })).rejects.toThrow(/own child/);
    // cycle (grand → root)
    await expect(service.addMember({ scopeId: "grand", member: child("root") })).rejects.toThrow(/cycle/);
    // unknown child
    await expect(service.addMember({ scopeId: "root", member: child("ghost") })).rejects.toThrow(/does not exist/);
    store.close();
  });

  it("H-A18/N10/N11: close is terminal for the scope only; it touches no Campaign/Institution", async () => {
    const { service, store } = env();
    await service.openScope({ scopeId: "R" });
    await service.closeScope({ scopeId: "R", reason: "done" });
    expect((await service.scopeState("R")).lifecycle).toBe("CLOSED");
    await expect(service.closeScope({ scopeId: "R", reason: "again" })).rejects.toThrow(/CLOSED/);
    await expect(service.addMember({ scopeId: "R", member: member("A9") })).rejects.toThrow(/CLOSED/);
    // lifecycle is derived from runtime-scope events only (no campaign/institution event types exist here).
    expect((await store.replay("R")).map((e) => e.type)).toEqual(["RUNTIME_SCOPE_OPENED", "SCOPE_CLOSED"]);
    store.close();
  });
});

describe("H3 organization association", () => {
  it("H-A15/N01: an organization may exist with zero runtime scopes; a scope needs no organization", async () => {
    const { service } = env(orgPort({ refs: [basis()], head: basis() }));
    await service.openScope({ scopeId: "unassociated" });
    const state = await service.scopeState("unassociated");
    expect(state.definition.organizationBasis).toBeNull();
    expect((await service.holonView("unassociated")).organizationBasisFreshness).toBe("unassociated");
  });

  it("N02/N09: a supplied basis must exist; a stale basis is never disguised as current", async () => {
    const port = orgPort({ refs: [basis(0)], head: basis(1, "b".repeat(64)) });
    const { service } = env(port);
    const grounded = { ...basis(0) };
    await service.openScope({ scopeId: "R", organizationBasis: grounded });
    expect((await service.holonView("R")).organizationBasisFreshness).toBe("stale");
    await expect(service.openScope({ scopeId: "ghost", organizationBasis: basis(9, "c".repeat(64)) })).rejects.toThrow(/does not exist/);
    // Without an organization source, a supplied basis cannot be verified → fail closed.
    const { service: bare } = env();
    await expect(bare.openScope({ scopeId: "R2", organizationBasis: basis() })).rejects.toThrow(/no organization source/);
  });
});
