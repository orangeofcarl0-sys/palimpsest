/**
 * G10-M deterministic runtime structural safety assessment.
 *
 *   blocked assessment cannot be authority-overridden
 *
 * Pure and deterministic: given the candidate and the exact current scope states it
 * produces obligations and an admissible/blocked standing. It never mutates, never
 * consults authority, and never "repairs" a candidate.
 */

import { canonicalDigest } from "../schema/canonical.js";
import type { RuntimeScopeLifecycle, RuntimeScopeMember } from "../runtime_scope/index.js";
import { runtimeScopeMemberKey } from "../runtime_scope/index.js";
import type { RuntimeScopeState } from "../runtime_scope/index.js";
import type { CompleteRuntimeEvolutionCandidate } from "./artifacts.js";

export const RUNTIME_EVOLUTION_ASSESSMENT_DOMAIN = "palimpsest.runtime-evolution-assessment.v1";

export type RuntimeObligationKind =
  | "proposal_freshness"
  | "source_basis_freshness"
  | "scope_exists"
  | "scope_open"
  | "parent_relationship_current"
  | "member_set_exact"
  | "forest_acyclic"
  | "single_parent_preserved"
  | "member_collision_absent"
  | "external_peer_absent"
  | "boundary_absent"
  | "campaign_association_absent"
  | "new_scope_id_available";

export interface RuntimeObligation {
  readonly obligationId: string;
  readonly kind: RuntimeObligationKind;
  readonly status: "satisfied" | "unresolved";
  readonly detail: string;
}

export interface RuntimeStructuralEvolutionAssessment {
  readonly kind: CompleteRuntimeEvolutionCandidate["kind"];
  readonly status: "admissible" | "blocked";
  readonly candidate: CompleteRuntimeEvolutionCandidate;
  readonly sourceScopeIds: readonly string[];
  readonly obligations: readonly RuntimeObligation[];
  readonly digest: string;
}

class Obligations {
  readonly #items: RuntimeObligation[] = [];
  add(kind: RuntimeObligationKind, satisfied: boolean, detail: string): void {
    this.#items.push(Object.freeze({ obligationId: `ob-${this.#items.length + 1}-${kind}`, kind, status: satisfied ? "satisfied" : "unresolved", detail }));
  }
  list(): readonly RuntimeObligation[] {
    return Object.freeze([...this.#items].sort((a, b) => (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0)));
  }
  blocked(): boolean {
    return this.#items.some((item) => item.status === "unresolved");
  }
}

interface ForestModel {
  readonly scopes: Set<string>;
  readonly members: Map<string, Map<string, RuntimeScopeMember>>;
  readonly lifecycles: Map<string, RuntimeScopeLifecycle>;
}

function buildForest(sources: readonly RuntimeScopeState[], extras: readonly string[]): ForestModel {
  const scopes = new Set<string>(extras);
  const members = new Map<string, Map<string, RuntimeScopeMember>>();
  const lifecycles = new Map<string, RuntimeScopeLifecycle>();
  for (const state of sources) {
    scopes.add(state.definition.scopeId);
    members.set(state.definition.scopeId, new Map(state.members.map((member) => [runtimeScopeMemberKey(member), member])));
    lifecycles.set(state.definition.scopeId, state.lifecycle);
  }
  return { scopes, members, lifecycles };
}

/** Validate single-parent + acyclicity over the simulated forest. */
function forestValid(model: ForestModel): { readonly valid: boolean; readonly detail: string } {
  const parentOf = new Map<string, string>();
  for (const [scopeId, memberMap] of model.members) {
    for (const member of memberMap.values()) {
      if (member.kind !== "child_scope") continue;
      const childId = member.scope.scopeId;
      if (childId === scopeId) return { valid: false, detail: `scope "${scopeId}" is its own child` };
      if (!model.scopes.has(childId)) return { valid: false, detail: `scope "${scopeId}" references unknown child "${childId}"` };
      const existing = parentOf.get(childId);
      if (existing !== undefined) return { valid: false, detail: `scope "${childId}" has more than one parent ("${existing}", "${scopeId}")` };
      parentOf.set(childId, scopeId);
    }
  }
  for (const scopeId of model.scopes) {
    const seen = new Set<string>([scopeId]);
    let cursor = parentOf.get(scopeId);
    while (cursor !== undefined) {
      if (seen.has(cursor)) return { valid: false, detail: `cycle detected at "${cursor}"` };
      seen.add(cursor);
      cursor = parentOf.get(cursor);
    }
  }
  return { valid: true, detail: "single-parent and acyclic" };
}

export function assessRuntimeStructuralEvolution(
  candidate: CompleteRuntimeEvolutionCandidate,
  sources: readonly RuntimeScopeState[],
  input: { readonly proposalFresh: boolean },
): RuntimeStructuralEvolutionAssessment {
  const byId = new Map(sources.map((state) => [state.definition.scopeId, state]));
  const obligations = new Obligations();
  obligations.add("proposal_freshness", input.proposalFresh, input.proposalFresh ? "the dynamics proposal basis is current" : "the dynamics proposal basis changed after it was grounded");

  const requireScope = (scopeId: string, what: string): RuntimeScopeState | undefined => {
    const state = byId.get(scopeId);
    obligations.add("scope_exists", state !== undefined, state === undefined ? `${what} scope "${scopeId}" does not exist` : `${what} scope "${scopeId}" exists`);
    return state;
  };
  const requireBasis = (state: RuntimeScopeState | undefined, expected: { throughSeq: number; chainDigest: string }, what: string): boolean => {
    const ok = state !== undefined && state.basis.throughSeq === expected.throughSeq && state.basis.chainDigest === expected.chainDigest;
    obligations.add("source_basis_freshness", ok, ok ? `${what} basis is exact` : `${what} basis changed since the candidate was compiled`);
    return ok;
  };
  const requireOpen = (state: RuntimeScopeState | undefined, what: string): void => {
    const ok = state !== undefined && state.lifecycle === "OPEN";
    obligations.add("scope_open", ok, ok ? `${what} scope is OPEN` : `${what} scope is not OPEN`);
  };

  if (candidate.kind === "ENCAPSULATE") {
    const parent = requireScope(candidate.sourceParent.ref.scopeId, "source parent");
    requireBasis(parent, candidate.sourceParent.basis, "source parent");
    requireOpen(parent, "source parent");
    const newId = candidate.newChild.scopeId;
    obligations.add("new_scope_id_available", !byId.has(newId), byId.has(newId) ? `new scope id "${newId}" already exists` : `new scope id "${newId}" is available`);
    if (parent !== undefined) {
      const parentKeys = new Set(parent.members.map(runtimeScopeMemberKey));
      const movedKeys = candidate.membersToMove.map(runtimeScopeMemberKey);
      const allPresent = movedKeys.every((key) => parentKeys.has(key));
      obligations.add("member_set_exact", allPresent, allPresent ? "every member to move is currently present in the parent" : "a member to move is not currently present in the parent");
      const forest = buildForest(sources, [newId]);
      const parentMembers = new Map(parent.members.map((member) => [runtimeScopeMemberKey(member), member]));
      for (const key of movedKeys) parentMembers.delete(key);
      parentMembers.set(`child_scope:${newId}`, Object.freeze({ kind: "child_scope" as const, scope: Object.freeze({ schemaVersion: 1 as const, scopeId: newId }) }));
      forest.members.set(parent.definition.scopeId, parentMembers);
      forest.members.set(newId, new Map(candidate.membersToMove.map((member) => [runtimeScopeMemberKey(member), member])));
      forest.lifecycles.set(newId, "OPEN");
      const valid = forestValid(forest);
      obligations.add("forest_acyclic", valid.valid, valid.detail);
      obligations.add("single_parent_preserved", valid.valid, valid.detail);
      // The new child inherits no external semantics by construction; assert the contract's intent.
      obligations.add("external_peer_absent", true, "a new child carries no peer automatically (definition has no peer field)");
      obligations.add("boundary_absent", true, "a new child carries no boundary automatically");
      obligations.add("campaign_association_absent", true, "a new child carries no campaign association automatically");
    }
  } else if (candidate.kind === "COLLAPSE") {
    const child = requireScope(candidate.child.ref.scopeId, "child");
    const parent = requireScope(candidate.parent.ref.scopeId, "parent");
    requireBasis(child, candidate.child.basis, "child");
    requireBasis(parent, candidate.parent.basis, "parent");
    requireOpen(child, "child");
    requireOpen(parent, "parent");
    if (child !== undefined && parent !== undefined) {
      const singleParent = child.parent !== null && child.parent.scopeId === parent.definition.scopeId;
      obligations.add("parent_relationship_current", singleParent, singleParent ? "the child's current parent is the candidate parent" : "the child's current parent is not the candidate parent");
      obligations.add("external_peer_absent", child.peer === null, child.peer === null ? "the child has no external peer" : "the child has an external PeerRef — collapse would destroy an external contract");
      obligations.add("boundary_absent", child.boundary === null, child.boundary === null ? "the child declares no external boundary" : "the child declares an external boundary — collapse would destroy an external contract");
      obligations.add("campaign_association_absent", child.campaignIds.length === 0, child.campaignIds.length === 0 ? "the child has no campaign association" : "the child hosts campaign association(s) — collapse cannot migrate them implicitly");
      const parentKeys = new Set(parent.members.map(runtimeScopeMemberKey));
      const collisions = child.members.map(runtimeScopeMemberKey).filter((key) => parentKeys.has(key));
      obligations.add("member_collision_absent", collisions.length === 0, collisions.length === 0 ? "no member of the child collides with the parent" : `member collision(s): ${collisions.join(", ")}`);
      const forest = buildForest(sources, []);
      const parentMembers = new Map(parent.members.map((member) => [runtimeScopeMemberKey(member), member]));
      parentMembers.delete(`child_scope:${child.definition.scopeId}`);
      for (const member of child.members) parentMembers.set(runtimeScopeMemberKey(member), member);
      forest.members.set(parent.definition.scopeId, parentMembers);
      forest.members.set(child.definition.scopeId, new Map());
      forest.lifecycles.set(child.definition.scopeId, "CLOSED");
      const valid = forestValid(forest);
      obligations.add("forest_acyclic", valid.valid, valid.detail);
      obligations.add("single_parent_preserved", valid.valid, valid.detail);
    }
  } else {
    const scope = requireScope(candidate.scope.ref.scopeId, "scope");
    requireBasis(scope, candidate.scope.basis, "scope");
    requireOpen(scope, "scope");
    if (scope !== undefined) {
      const activationCount = scope.members.filter((member) => member.kind === "activation").length;
      const childCount = scope.members.filter((member) => member.kind === "child_scope").length;
      obligations.add("member_set_exact", activationCount === 0 && childCount === 0, activationCount === 0 && childCount === 0 ? "the scope is structurally empty" : `the scope still has ${activationCount} activation(s) and ${childCount} child scope(s)`);
      obligations.add("external_peer_absent", scope.peer === null, scope.peer === null ? "the scope has no external peer" : "the scope has an external peer — retirement would destroy an external contract");
      obligations.add("boundary_absent", scope.boundary === null, scope.boundary === null ? "the scope declares no boundary" : "the scope declares a boundary — retirement would destroy an external contract");
      obligations.add("campaign_association_absent", scope.campaignIds.length === 0, scope.campaignIds.length === 0 ? "the scope has no campaign association" : "the scope hosts campaign association(s) — retirement cannot migrate them implicitly");
      if (scope.parent !== null) {
        const parent = byId.get(scope.parent.scopeId);
        requireOpen(parent, "parent");
        const forest = buildForest(sources, []);
        const parentMembers = new Map((parent?.members ?? []).map((member) => [runtimeScopeMemberKey(member), member]));
        parentMembers.delete(`child_scope:${scope.definition.scopeId}`);
        forest.members.set(scope.parent.scopeId, parentMembers);
        forest.members.set(scope.definition.scopeId, new Map());
        forest.lifecycles.set(scope.definition.scopeId, "CLOSED");
        const valid = forestValid(forest);
        obligations.add("forest_acyclic", valid.valid, valid.detail);
        obligations.add("single_parent_preserved", valid.valid, valid.detail);
      } else {
        const forest = buildForest(sources, []);
        forest.members.set(scope.definition.scopeId, new Map());
        forest.lifecycles.set(scope.definition.scopeId, "CLOSED");
        const valid = forestValid(forest);
        obligations.add("forest_acyclic", valid.valid, valid.detail);
        obligations.add("single_parent_preserved", valid.valid, valid.detail);
      }
    }
  }

  const obligationsList = obligations.list();
  const status = obligations.blocked() ? "blocked" : "admissible";
  return Object.freeze({
    kind: candidate.kind,
    status,
    candidate,
    sourceScopeIds: Object.freeze([...new Set([...byId.keys()])].sort()),
    obligations: obligationsList,
    digest: canonicalDigest({
      domain: RUNTIME_EVOLUTION_ASSESSMENT_DOMAIN,
      kind: candidate.kind,
      candidateDigest: candidate.digest,
      status,
      obligations: obligationsList.map((obligation) => ({ kind: obligation.kind, status: obligation.status })),
      sourceScopeIds: [...new Set([...byId.keys()])].sort(),
    }),
  });
}
