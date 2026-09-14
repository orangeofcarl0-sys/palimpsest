/**
 * G10-M runtime structural evolution service — the application-facing boundary for
 * governed runtime topology change.
 *
 *   FreshProposal → CompleteCandidate → DeterministicAssessment → Authority → AtomicActivation
 *
 * One logical topology transition is applied as ONE multi-scope transaction, so a partial
 * canonical forest is never visible. Runtime topology evolution NEVER mutates
 * Organization/Institution/BoundaryMemory/Campaign. The runtime structural authority is
 * independent from representation admission, organization evolution, continuation, and
 * effect authority.
 */

import { canonicalDigest } from "../schema/canonical.js";
import type { DynamicsPolicy, OrganizationDynamicsProposal, OrganizationDynamicsService, ProposalImpactReport } from "../organization_dynamics/index.js";
import type {
  RuntimeScopeAppendRequest,
  RuntimeScopeService,
  RuntimeScopeState,
  RuntimeScopeStore,
  RuntimeScopeStructuralTransition,
} from "../runtime_scope/index.js";
import { materializeRuntimeScopeRef, runtimeScopeMemberKey } from "../runtime_scope/index.js";
import type { RuntimeScopeRef } from "../runtime_scope/index.js";
import { assessRuntimeStructuralEvolution } from "./assessment.js";
import type { RuntimeStructuralEvolutionAssessment } from "./assessment.js";
import type {
  CompleteRuntimeEvolutionCandidate,
  RuntimeEvolutionCaseRef,
  RuntimeStructuralEvolutionAdmissionPort,
  RuntimeStructuralEvolutionCompilerPort,
} from "./artifacts.js";
import {
  RUNTIME_KIND_TO_TARGET,
  parseCompleteRuntimeEvolutionCandidate,
  runtimeDispositionFor,
  runtimeEvolutionCaseRefOf,
} from "./artifacts.js";
import type { RuntimeEvolutionEvent, RuntimeEvolutionStore } from "./store.js";
import { RuntimeEvolutionStoreError } from "./store.js";

export interface RuntimeEvolutionDeps {
  readonly runtimeScopes: { readonly store: RuntimeScopeStore; readonly service: RuntimeScopeService };
  readonly dynamics: OrganizationDynamicsService;
  readonly store?: RuntimeEvolutionStore | undefined;
  readonly compiler?: RuntimeStructuralEvolutionCompilerPort | undefined;
  readonly authority?: RuntimeStructuralEvolutionAdmissionPort | undefined;
}

export interface RuntimeEvolutionRequest {
  readonly proposal: OrganizationDynamicsProposal;
  readonly policy: DynamicsPolicy;
}

export type RuntimeEvolutionOutcome =
  | { readonly status: "not_runtime_subject"; readonly detail: string }
  | { readonly status: "unsupported_evolution_kind"; readonly detail: string }
  | { readonly status: "stale_proposal"; readonly detail: string }
  | { readonly status: "stale_candidate"; readonly detail: string }
  | { readonly status: "incomplete"; readonly detail: string }
  | { readonly status: "blocked"; readonly caseRef: RuntimeEvolutionCaseRef; readonly unresolvedObligations: readonly string[] }
  | { readonly status: "denied"; readonly caseRef: RuntimeEvolutionCaseRef; readonly detail: string }
  | { readonly status: "authority_unresolved"; readonly caseRef: RuntimeEvolutionCaseRef; readonly detail: string }
  | {
      readonly status: "activated";
      readonly caseRef: RuntimeEvolutionCaseRef;
      readonly kind: CompleteRuntimeEvolutionCandidate["kind"];
      readonly touchedScopes: readonly RuntimeScopeRef[];
      readonly createdScopes: readonly RuntimeScopeRef[];
      readonly afterSnapshotDigest: string | null;
    };

export interface RuntimeEvolutionInspection {
  readonly caseRef: RuntimeEvolutionCaseRef;
  readonly state: string;
  readonly events: readonly RuntimeEvolutionEvent[];
}

export interface RuntimeEvolutionService {
  prepareRuntimeEvolution(input: RuntimeEvolutionRequest): Promise<RuntimeEvolutionOutcome>;
  advanceRuntimeEvolution(input: RuntimeEvolutionRequest): Promise<RuntimeEvolutionOutcome>;
  resumeRuntimeEvolution(input: RuntimeEvolutionRequest): Promise<RuntimeEvolutionOutcome>;
  inspectRuntimeEvolution(caseRef: RuntimeEvolutionCaseRef): Promise<RuntimeEvolutionInspection>;
  dispositionOf(proposalKind: string, subjectKind: string): string;
}

function eventRequest(type: RuntimeScopeAppendRequest["type"], scopeId: string, payload: unknown): RuntimeScopeAppendRequest {
  return { eventId: `evt-${canonicalDigest({ domain: "palimpsest.runtime-scope-event.v1", type, scopeId, payload }).slice(0, 24)}`, type, payload };
}

function basisKey(state: RuntimeScopeState): string {
  return `${state.definition.scopeId}@${state.basis.throughSeq}:${state.basis.chainDigest}`;
}

export function makeRuntimeEvolutionService(deps: RuntimeEvolutionDeps): RuntimeEvolutionService {
  async function allStates(): Promise<readonly RuntimeScopeState[]> {
    const refs = await deps.runtimeScopes.service.listScopes();
    const states: RuntimeScopeState[] = [];
    for (const ref of refs) states.push(await deps.runtimeScopes.service.scopeState(ref.scopeId));
    return Object.freeze(states);
  }

  async function append(caseRef: RuntimeEvolutionCaseRef, events: { eventId: string; type: RuntimeEvolutionEvent["type"]; payload: unknown }[]): Promise<void> {
    if (deps.store === undefined) return;
    const basis = await deps.store.basis(caseRef);
    if (basis === undefined) throw new RuntimeEvolutionStoreError("unknown_case", `runtime evolution case "${caseRef}" does not exist`);
    await deps.store.appendAtomic({ caseRef, expectedBasis: basis, events });
  }

  function eventIdFor(type: string, caseRef: string, payload: unknown): string {
    return `rev-${canonicalDigest({ domain: "palimpsest.runtime-evolution-event.v1", type, caseRef, payload }).slice(0, 24)}`;
  }

  function buildTransition(candidate: CompleteRuntimeEvolutionCandidate, sources: readonly RuntimeScopeState[]): { transition: RuntimeScopeStructuralTransition; touched: readonly RuntimeScopeRef[]; created: readonly RuntimeScopeRef[] } {
    const byId = new Map(sources.map((state) => [state.definition.scopeId, state]));
    if (candidate.kind === "ENCAPSULATE") {
      const parentId = candidate.sourceParent.ref.scopeId;
      const newId = candidate.newChild.scopeId;
      const parentEvents: RuntimeScopeAppendRequest[] = [];
      for (const member of candidate.membersToMove) {
        parentEvents.push(eventRequest("SCOPE_MEMBER_REMOVED", parentId, { memberKey: runtimeScopeMemberKey(member), reason: `encapsulated into ${newId}` }));
      }
      parentEvents.push(eventRequest("SCOPE_MEMBER_ADDED", parentId, { member: Object.freeze({ kind: "child_scope" as const, scope: materializeRuntimeScopeRef({ scopeId: newId }) }) }));
      const childEvents = candidate.membersToMove.map((member) => eventRequest("SCOPE_MEMBER_ADDED", newId, { member }));
      return {
        transition: { expectedScopes: [{ scopeId: parentId, expectedBasis: candidate.sourceParent.basis, events: parentEvents }], createScopes: [{ definition: candidate.newChild, events: childEvents }] },
        touched: Object.freeze([candidate.sourceParent.ref]),
        created: Object.freeze([materializeRuntimeScopeRef({ scopeId: newId })]),
      };
    }
    if (candidate.kind === "COLLAPSE") {
      const parentId = candidate.parent.ref.scopeId;
      const childId = candidate.child.ref.scopeId;
      const child = byId.get(childId)!;
      const parentEvents: RuntimeScopeAppendRequest[] = [eventRequest("SCOPE_MEMBER_REMOVED", parentId, { memberKey: `child_scope:${childId}`, reason: `collapsed into parent ${parentId}` })];
      for (const member of child.members) parentEvents.push(eventRequest("SCOPE_MEMBER_ADDED", parentId, { member }));
      const childEvents: RuntimeScopeAppendRequest[] = [];
      for (const member of child.members) childEvents.push(eventRequest("SCOPE_MEMBER_REMOVED", childId, { memberKey: runtimeScopeMemberKey(member), reason: "collapsed into parent" }));
      childEvents.push(eventRequest("SCOPE_CLOSED", childId, { reason: `collapsed into parent ${parentId}` }));
      return {
        transition: {
          expectedScopes: [
            { scopeId: parentId, expectedBasis: candidate.parent.basis, events: parentEvents },
            { scopeId: childId, expectedBasis: candidate.child.basis, events: childEvents },
          ],
          createScopes: [],
        },
        touched: Object.freeze([candidate.parent.ref, candidate.child.ref]),
        created: Object.freeze([]),
      };
    }
    const scopeId = candidate.scope.ref.scopeId;
    const scope = byId.get(scopeId)!;
    const expectedScopes: { scopeId: string; expectedBasis: { scopeId: string; throughSeq: number; chainDigest: string }; events: readonly RuntimeScopeAppendRequest[] }[] = [];
    const touched: RuntimeScopeRef[] = [];
    if (scope.parent !== null) {
      const parentState = byId.get(scope.parent.scopeId);
      if (parentState !== undefined) {
        expectedScopes.push({ scopeId: scope.parent.scopeId, expectedBasis: parentState.basis, events: [eventRequest("SCOPE_MEMBER_REMOVED", scope.parent.scopeId, { memberKey: `child_scope:${scopeId}`, reason: `retired scope ${scopeId}` })] });
        touched.push(materializeRuntimeScopeRef({ scopeId: scope.parent.scopeId }));
      }
    }
    expectedScopes.push({ scopeId, expectedBasis: candidate.scope.basis, events: [eventRequest("SCOPE_CLOSED", scopeId, { reason: "governed runtime retirement" })] });
    touched.push(candidate.scope.ref);
    return { transition: { expectedScopes, createScopes: [] }, touched: Object.freeze(touched), created: Object.freeze([]) };
  }

  async function observeAfter(proposal: OrganizationDynamicsProposal, policy: DynamicsPolicy): Promise<string | null> {
    const observed = await deps.dynamics.observe(proposal.subject, policy);
    return observed.status === "observed" ? observed.snapshot.digest : null;
  }

  async function existingCase(proposalDigest: string): Promise<{ caseRef: RuntimeEvolutionCaseRef; events: readonly RuntimeEvolutionEvent[]; types: readonly string[] } | undefined> {
    if (deps.store === undefined) return undefined;
    const record = await deps.store.caseByProposal(proposalDigest);
    if (record === undefined) return undefined;
    const events = await deps.store.replay(record.caseRef);
    return { caseRef: record.caseRef, events, types: events.map((event) => event.type) };
  }

  async function drive(input: RuntimeEvolutionRequest): Promise<RuntimeEvolutionOutcome> {
    const { proposal, policy } = input;
    const disposition = runtimeDispositionFor(proposal.kind, proposal.subject.kind);
    if (disposition === "ROUTED_ORGANIZATION_RETIREMENT") return { status: "not_runtime_subject", detail: `proposal kind "${proposal.kind}" on an organization subject is handled by the organization retirement path` };
    if (disposition === "UNSUPPORTED_SUBJECT") return { status: "unsupported_evolution_kind", detail: `proposal kind "${proposal.kind}" has no runtime structural semantics for subject "${proposal.subject.kind}"` };

    // Idempotent re-entry: an activated/terminal case short-circuits before freshness.
    const prior = await existingCase(proposal.digest);
    if (prior !== undefined) {
      const last = (type: string): RuntimeEvolutionEvent | undefined => [...prior.events].reverse().find((event) => event.type === type);
      const activated = last("RUNTIME_EVOLUTION_ACTIVATED");
      if (activated !== undefined) {
        const payload = activated.payload as { kind: CompleteRuntimeEvolutionCandidate["kind"]; touchedScopes: readonly RuntimeScopeRef[]; createdScopes: readonly RuntimeScopeRef[] };
        const post = last("RUNTIME_EVOLUTION_POST_OBSERVED");
        return { status: "activated", caseRef: prior.caseRef, kind: payload.kind, touchedScopes: payload.touchedScopes, createdScopes: payload.createdScopes, afterSnapshotDigest: post === undefined ? null : (post.payload as { afterSnapshotDigest: string }).afterSnapshotDigest };
      }
      if (prior.types.includes("RUNTIME_EVOLUTION_BLOCKED")) {
        const payload = last("RUNTIME_EVOLUTION_BLOCKED")!.payload as { unresolvedObligations: readonly string[] };
        return { status: "blocked", caseRef: prior.caseRef, unresolvedObligations: payload.unresolvedObligations };
      }
      if (prior.types.includes("RUNTIME_EVOLUTION_DENIED")) return { status: "denied", caseRef: prior.caseRef, detail: (last("RUNTIME_EVOLUTION_DENIED")!.payload as { detail: string }).detail };
      if (prior.types.includes("RUNTIME_EVOLUTION_AUTHORITY_UNRESOLVED")) return { status: "authority_unresolved", caseRef: prior.caseRef, detail: (last("RUNTIME_EVOLUTION_AUTHORITY_UNRESOLVED")!.payload as { detail: string }).detail };
    }

    if (deps.compiler === undefined) return { status: "incomplete", detail: "no RuntimeStructuralEvolutionCompilerPort is configured" };
    if (deps.authority === undefined) return { status: "incomplete", detail: "no RuntimeStructuralEvolutionAdmissionPort is configured" };

    const subjectScopeId = proposal.subject.kind === "runtime_scope" ? proposal.subject.scope.scopeId : "";
    const freshness = await deps.dynamics.evaluateProposal(proposal);
    if (freshness.status !== "fresh") return { status: "stale_proposal", detail: freshness.detail };

    const before = await allStates();
    const observed = await deps.dynamics.observe(proposal.subject, policy);
    if (observed.status !== "observed") return { status: "incomplete", detail: `cannot build an impact report: ${observed.status}` };
    const impact: ProposalImpactReport = deps.dynamics.proposalImpact(proposal, observed.snapshot);

    let raw: unknown;
    try {
      raw = await deps.compiler.compile({ proposal, impact, scopes: before });
    } catch (error) {
      return { status: "incomplete", detail: `the runtime structural compiler failed: ${error instanceof Error ? error.message : String(error)}` };
    }
    let candidate: CompleteRuntimeEvolutionCandidate;
    try {
      candidate = parseCompleteRuntimeEvolutionCandidate(raw);
    } catch (error) {
      return { status: "incomplete", detail: `compiler output is not a complete runtime candidate: ${error instanceof Error ? error.message : String(error)}` };
    }
    if (candidate.proposalDigest !== proposal.digest) return { status: "incomplete", detail: "candidate is not bound to this proposal" };
    if (candidate.proposalBasisDigest !== proposal.basisDigest) return { status: "incomplete", detail: "candidate basis does not match the proposal basis" };
    const expectedKind = RUNTIME_KIND_TO_TARGET[proposal.kind]!;
    if (candidate.kind !== expectedKind) return { status: "incomplete", detail: `candidate kind ${candidate.kind} does not match proposal kind ${proposal.kind}` };
    if (subjectScopeId !== "" && !candidateTouchesScope(candidate, subjectScopeId)) {
      return { status: "incomplete", detail: "the candidate does not concern the proposal's subject scope" };
    }

    const caseRef = runtimeEvolutionCaseRefOf({ proposalDigest: proposal.digest, candidateDigest: candidate.digest });
    if (deps.store !== undefined) {
      const byProposal = await deps.store.caseByProposal(proposal.digest);
      if (byProposal !== undefined && byProposal.caseRef !== caseRef) return { status: "incomplete", detail: "this proposal is already bound to a different runtime candidate" };
      if (byProposal === undefined) {
        await deps.store.openCase({ caseRef, proposalDigest: proposal.digest, candidateDigest: candidate.digest, subjectKey: `runtime_scope:${subjectScopeId}` });
        await append(caseRef, [{ eventId: eventIdFor("RUNTIME_EVOLUTION_CANDIDATE_COMPILED", caseRef, { candidate }), type: "RUNTIME_EVOLUTION_CANDIDATE_COMPILED", payload: { candidate } }]);
      }
    }

    let assessment: RuntimeStructuralEvolutionAssessment = assessRuntimeStructuralEvolution(candidate, before, { proposalFresh: true });
    if (deps.store !== undefined) {
      await append(caseRef, [
        {
          eventId: eventIdFor("RUNTIME_EVOLUTION_ASSESSED", caseRef, { assessmentDigest: assessment.digest, status: assessment.status }),
          type: "RUNTIME_EVOLUTION_ASSESSED",
          payload: { kind: assessment.kind, status: assessment.status, assessmentDigest: assessment.digest, obligations: assessment.obligations.map((obligation) => ({ obligationId: obligation.obligationId, kind: obligation.kind, status: obligation.status, detail: obligation.detail })) },
        },
      ]);
    }
    if (assessment.status !== "admissible") {
      const unresolved = assessment.obligations.filter((obligation) => obligation.status === "unresolved").map((obligation) => obligation.obligationId);
      if (deps.store !== undefined) await append(caseRef, [{ eventId: eventIdFor("RUNTIME_EVOLUTION_BLOCKED", caseRef, { unresolved }), type: "RUNTIME_EVOLUTION_BLOCKED", payload: { unresolvedObligations: unresolved } }]);
      return { status: "blocked", caseRef, unresolvedObligations: Object.freeze(unresolved) };
    }

    const authorityOutcome = await deps.authority.admit({
      proposalDigest: proposal.digest,
      candidateDigest: candidate.digest,
      assessmentDigest: assessment.digest,
      kind: candidate.kind,
      touchedScopes: candidateTouchedScopes(candidate),
      impact,
    });
    if (authorityOutcome.outcome === "denied") {
      if (deps.store !== undefined) await append(caseRef, [{ eventId: eventIdFor("RUNTIME_EVOLUTION_DENIED", caseRef, { detail: authorityOutcome.detail }), type: "RUNTIME_EVOLUTION_DENIED", payload: { detail: authorityOutcome.detail } }]);
      return { status: "denied", caseRef, detail: authorityOutcome.detail };
    }
    if (authorityOutcome.outcome === "unresolved") {
      if (deps.store !== undefined) await append(caseRef, [{ eventId: eventIdFor("RUNTIME_EVOLUTION_AUTHORITY_UNRESOLVED", caseRef, { detail: authorityOutcome.detail }), type: "RUNTIME_EVOLUTION_AUTHORITY_UNRESOLVED", payload: { detail: authorityOutcome.detail } }]);
      return { status: "authority_unresolved", caseRef, detail: authorityOutcome.detail };
    }
    if (deps.store !== undefined) {
      await append(caseRef, [{ eventId: eventIdFor("RUNTIME_EVOLUTION_AUTHORIZED", caseRef, { candidateDigest: candidate.digest, assessmentDigest: assessment.digest }), type: "RUNTIME_EVOLUTION_AUTHORIZED", payload: { candidateDigest: candidate.digest, assessmentDigest: assessment.digest } }]);
    }

    // Immediately before the irreversible write, re-read EVERY source and require all exact
    // bases unchanged (G10-M §61). Any drift is a stale candidate with zero structural writes.
    const after = await allStates();
    const beforeKeys = new Set(before.map(basisKey));
    const afterKeys = new Set(after.map(basisKey));
    if (beforeKeys.size !== afterKeys.size || [...beforeKeys].some((key) => !afterKeys.has(key))) {
      return { status: "stale_candidate", detail: "a source runtime-scope basis changed before activation" };
    }
    if (candidate.kind === "ENCAPSULATE" && after.some((state) => state.definition.scopeId === candidate.newChild.scopeId)) {
      return { status: "stale_candidate", detail: "the new scope id became occupied before activation" };
    }
    // Re-assess against the freshly read sources; a changed basis becomes an unresolved obligation.
    assessment = assessRuntimeStructuralEvolution(candidate, after, { proposalFresh: true });
    if (assessment.status !== "admissible") {
      const unresolved = assessment.obligations.filter((obligation) => obligation.status === "unresolved").map((obligation) => obligation.obligationId);
      if (deps.store !== undefined) await append(caseRef, [{ eventId: eventIdFor("RUNTIME_EVOLUTION_BLOCKED", caseRef, { unresolved }), type: "RUNTIME_EVOLUTION_BLOCKED", payload: { unresolvedObligations: unresolved } }]);
      return { status: "blocked", caseRef, unresolvedObligations: Object.freeze(unresolved) };
    }

    const built = buildTransition(candidate, after);
    try {
      await deps.runtimeScopes.store.applyStructuralTransition(built.transition);
    } catch (error) {
      return { status: "stale_candidate", detail: `the atomic runtime transition failed closed: ${error instanceof Error ? error.message : String(error)}` };
    }
    if (deps.store !== undefined) {
      await append(caseRef, [
        {
          eventId: eventIdFor("RUNTIME_EVOLUTION_ACTIVATED", caseRef, { kind: candidate.kind, touched: built.touched.map((ref) => ref.scopeId), created: built.created.map((ref) => ref.scopeId) }),
          type: "RUNTIME_EVOLUTION_ACTIVATED",
          payload: { kind: candidate.kind, touchedScopes: built.touched, createdScopes: built.created },
        },
      ]);
    }
    const afterSnapshotDigest = await observeAfter(proposal, policy);
    if (afterSnapshotDigest !== null && deps.store !== undefined) {
      await append(caseRef, [
        {
          eventId: eventIdFor("RUNTIME_EVOLUTION_POST_OBSERVED", caseRef, { before: proposal.snapshotDigest, after: afterSnapshotDigest }),
          type: "RUNTIME_EVOLUTION_POST_OBSERVED",
          payload: { beforeSnapshotDigest: proposal.snapshotDigest, afterSnapshotDigest },
        },
      ]);
    }
    return { status: "activated", caseRef, kind: candidate.kind, touchedScopes: built.touched, createdScopes: built.created, afterSnapshotDigest };
  }

  function candidateTouchedScopeIds(candidate: CompleteRuntimeEvolutionCandidate): readonly string[] {
    if (candidate.kind === "ENCAPSULATE") return [candidate.sourceParent.ref.scopeId];
    if (candidate.kind === "COLLAPSE") return [candidate.parent.ref.scopeId, candidate.child.ref.scopeId];
    return [candidate.scope.ref.scopeId];
  }

  function candidateTouchesScope(candidate: CompleteRuntimeEvolutionCandidate, scopeId: string): boolean {
    return candidateTouchedScopeIds(candidate).includes(scopeId);
  }

  function candidateTouchedScopes(candidate: CompleteRuntimeEvolutionCandidate) {
    if (candidate.kind === "ENCAPSULATE") return Object.freeze([candidate.sourceParent]);
    if (candidate.kind === "COLLAPSE") return Object.freeze([candidate.parent, candidate.child]);
    return Object.freeze([candidate.scope]);
  }

  async function inspectRuntimeEvolution(caseRef: RuntimeEvolutionCaseRef): Promise<RuntimeEvolutionInspection> {
    if (deps.store === undefined) throw new RuntimeEvolutionStoreError("unknown_case", "no runtime evolution store is configured");
    const record = await deps.store.case(caseRef);
    if (record === undefined) throw new RuntimeEvolutionStoreError("unknown_case", `runtime evolution case "${caseRef}" does not exist`);
    const events = await deps.store.replay(caseRef);
    let state = "PROPOSED";
    for (const event of events) {
      switch (event.type) {
        case "RUNTIME_EVOLUTION_CANDIDATE_COMPILED": state = "COMPILED"; break;
        case "RUNTIME_EVOLUTION_ASSESSED": state = "COMPILED"; break;
        case "RUNTIME_EVOLUTION_BLOCKED": state = "BLOCKED"; break;
        case "RUNTIME_EVOLUTION_AUTHORIZED": state = "AUTHORIZED"; break;
        case "RUNTIME_EVOLUTION_DENIED": state = "DENIED"; break;
        case "RUNTIME_EVOLUTION_AUTHORITY_UNRESOLVED": state = "AUTHORITY_UNRESOLVED"; break;
        case "RUNTIME_EVOLUTION_ACTIVATED": state = "ACTIVATED"; break;
        case "RUNTIME_EVOLUTION_POST_OBSERVED": state = "POST_OBSERVED"; break;
        case "RUNTIME_EVOLUTION_CLOSED": state = "CLOSED"; break;
        default: break;
      }
    }
    return Object.freeze({ caseRef, state, events });
  }

  return {
    prepareRuntimeEvolution: drive,
    advanceRuntimeEvolution: drive,
    resumeRuntimeEvolution: drive,
    inspectRuntimeEvolution,
    dispositionOf: (proposalKind: string, subjectKind: string) => runtimeDispositionFor(proposalKind, subjectKind),
  };
}
