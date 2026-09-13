/**
 * G10-K Boundary Memory service — the single application-facing boundary for
 * durable, versioned, multi-peer shared boundary state.
 *
 *   Conversation ≠ Candidate ≠ AcceptedRevision ≠ Commitment ≠ Evidence ≠ Organization
 *
 * Every state-dependent transition reads the workspace chain, derives its
 * preconditions from history, and commits as ONE `appendAtomic` batch
 * (CAS-guarded on the exact basis). Acceptance is explicit and authenticated;
 * an author can never accept for another peer; concurrent candidates branch and
 * never last-write-win. Rejection is a legitimate terminal outcome.
 */

import { canonicalDigest } from "../schema/canonical.js";
import type { PeerRef } from "../federation/peer.js";
import type {
  AcceptedBoundaryRevision,
  BoundaryArtifactDefinition,
  BoundaryArtifactTypeRegistry,
  BoundaryCandidateRevision,
  BoundaryWorkspaceDefinition,
  CandidateStanding,
  OrganizationBlueprintContent,
} from "./artifacts.js";
import {
  ORGANIZATION_BLUEPRINT_TYPE,
  acceptedRevisionDigestOf,
  acceptedRevisionRefOf,
  boundaryContentDigestOf,
  candidateDigestOf,
  candidateHasAcceptor,
  canonicalPeerSet,
  defaultBoundaryArtifactTypeRegistry,
  isWorkspaceParticipant,
  materializeBoundaryArtifactDefinition,
  materializeBoundaryWorkspaceDefinition,
  organizationDefinitionOfBlueprint,
} from "./artifacts.js";
import type { AcceptedBoundaryRevisionRef, BoundaryArtifactTypeRef } from "./ref.js";
import { acceptedBoundaryRevisionRefsEqual, boundaryArtifactTypeRefsEqual } from "./ref.js";
import type { BoundaryAppendRequest, BoundaryBasis, BoundaryEvent, BoundaryMemoryStore } from "./store.js";
import { BoundaryMemoryStoreError } from "./store.js";

export interface BoundaryMemoryDeps {
  readonly store: BoundaryMemoryStore;
  /** The local peer identity — authors are ALWAYS derived from this, never supplied. */
  readonly localPeer: PeerRef;
  readonly types?: BoundaryArtifactTypeRegistry | undefined;
}

export interface AcceptedBoundaryState {
  readonly ref: AcceptedBoundaryRevisionRef;
  readonly candidate: BoundaryCandidateRevision;
  readonly content: unknown;
  readonly acceptors: readonly PeerRef[];
}

export interface AcceptedOrganizationBlueprint {
  readonly workspaceId: string;
  readonly artifactId: string;
  readonly revision: AcceptedBoundaryRevisionRef;
  readonly contentDigest: string;
  readonly content: OrganizationBlueprintContent;
  readonly definition: ReturnType<typeof organizationDefinitionOfBlueprint>;
  readonly requiredAcceptors: readonly PeerRef[];
}

export interface CandidateView {
  readonly candidate: BoundaryCandidateRevision;
  readonly standing: CandidateStanding;
  readonly acceptors: readonly PeerRef[];
  readonly rejectedBy: readonly PeerRef[];
}

export interface ArtifactView {
  readonly artifact: BoundaryArtifactDefinition;
  readonly current: AcceptedBoundaryState | null;
  readonly pending: readonly CandidateView[];
  readonly revisionCount: number;
}

export interface BoundaryWorkspaceView {
  readonly workspace: BoundaryWorkspaceDefinition;
  readonly closed: boolean;
  readonly closedReason: string | null;
  readonly artifacts: readonly ArtifactView[];
  readonly basis: BoundaryBasis;
}

export interface WorkspaceChanges {
  readonly basis: BoundaryBasis;
  readonly changedArtifacts: readonly ArtifactView[];
}

export interface AcceptanceOutcome {
  readonly candidateDigest: string;
  readonly standing: CandidateStanding;
  readonly accepted: AcceptedBoundaryRevisionRef | null;
  readonly acceptors: readonly PeerRef[];
}

export interface RejectionOutcome {
  readonly candidateDigest: string;
  readonly standing: CandidateStanding;
  readonly rejectedBy: readonly PeerRef[];
}

export interface BoundaryMemoryService {
  openWorkspace(input: { readonly workspaceId: string; readonly participants: readonly PeerRef[]; readonly purpose: string }): Promise<BoundaryWorkspaceDefinition>;
  closeWorkspace(input: { readonly workspaceId: string; readonly reason: string }): Promise<void>;
  createArtifact(input: { readonly workspaceId: string; readonly artifactId: string; readonly type: BoundaryArtifactTypeRef; readonly title: string }): Promise<BoundaryArtifactDefinition>;
  proposeRevision(input: {
    readonly workspaceId: string;
    readonly artifactId: string;
    readonly base: AcceptedBoundaryRevisionRef | null;
    readonly content: unknown;
    readonly requiredAcceptors: readonly PeerRef[];
    readonly intent: string;
  }): Promise<BoundaryCandidateRevision>;
  acceptRevision(input: {
    readonly workspaceId: string;
    readonly artifactId: string;
    readonly candidateDigest: string;
    readonly authenticatedPeer: PeerRef | null;
    readonly local?: boolean | undefined;
  }): Promise<AcceptanceOutcome>;
  rejectRevision(input: {
    readonly workspaceId: string;
    readonly artifactId: string;
    readonly candidateDigest: string;
    readonly authenticatedPeer: PeerRef | null;
    readonly local?: boolean | undefined;
  }): Promise<RejectionOutcome>;
  currentAccepted(input: { readonly workspaceId: string; readonly artifactId: string }): Promise<AcceptedBoundaryState | null>;
  pendingCandidates(input: { readonly workspaceId: string; readonly artifactId: string }): Promise<readonly CandidateView[]>;
  workspaceView(input: { readonly workspaceId: string }): Promise<BoundaryWorkspaceView>;
  changesSince(input: { readonly workspaceId: string; readonly throughSeq: number }): Promise<WorkspaceChanges>;
  acceptedBlueprint(input: { readonly workspaceId: string; readonly artifactId: string }): Promise<AcceptedOrganizationBlueprint | undefined>;
  /** Fail-closed verification for a `boundary_revision` CommitmentScope. */
  admitBoundaryRevisionScope(ref: AcceptedBoundaryRevisionRef): Promise<void>;
}

interface ArtifactState {
  readonly definition: BoundaryArtifactDefinition;
  readonly candidates: Map<string, BoundaryCandidateRevision>;
  readonly acceptances: Map<string, Set<string>>;
  readonly rejections: Map<string, Set<string>>;
  readonly revisions: AcceptedBoundaryRevision[];
}

interface WorkspaceState {
  readonly workspace: BoundaryWorkspaceDefinition;
  closed: boolean;
  closedReason: string | null;
  readonly artifacts: Map<string, ArtifactState>;
}

function fail(kind: ConstructorParameters<typeof BoundaryMemoryStoreError>[0], message: string): never {
  throw new BoundaryMemoryStoreError(kind, message);
}

function peersOf(peerIds: readonly string[]): readonly PeerRef[] {
  return Object.freeze([...peerIds].sort().map((peerId) => Object.freeze({ schemaVersion: 1 as const, peerId })));
}

export function makeBoundaryMemoryService(deps: BoundaryMemoryDeps): BoundaryMemoryService {
  const types = deps.types ?? defaultBoundaryArtifactTypeRegistry();

  function eventIdFor(type: string, workspaceId: string, payload: unknown): string {
    return `bev-${canonicalDigest({ domain: "palimpsest.boundary-event.v1", type, workspaceId, payload }).slice(0, 32)}`;
  }

  async function append(workspaceId: string, events: readonly BoundaryAppendRequest[]): Promise<readonly BoundaryEvent[]> {
    const basis = await deps.store.basis(workspaceId);
    if (basis === undefined) fail("unknown_workspace", `workspace "${workspaceId}" does not exist`);
    return deps.store.appendAtomic({ workspaceId, expectedBasis: basis, events });
  }

  function derive(events: readonly BoundaryEvent[]): WorkspaceState | undefined {
    if (events.length === 0) return undefined;
    const opened = events[0]!;
    if (opened.type !== "WORKSPACE_OPENED") fail("malformed_record", "a boundary workspace history must begin with WORKSPACE_OPENED");
    const workspace = (opened.payload as { workspace: BoundaryWorkspaceDefinition }).workspace;
    const state: WorkspaceState = { workspace, closed: false, closedReason: null, artifacts: new Map() };
    const artifactOfCandidate = (candidateDigest: string): ArtifactState | undefined => {
      for (const artifact of state.artifacts.values()) if (artifact.candidates.has(candidateDigest)) return artifact;
      return undefined;
    };
    for (const event of events.slice(1)) {
      switch (event.type) {
        case "WORKSPACE_CLOSED":
          state.closed = true;
          state.closedReason = (event.payload as { reason: string }).reason;
          break;
        case "ARTIFACT_CREATED": {
          const artifact = (event.payload as { artifact: BoundaryArtifactDefinition }).artifact;
          if (!state.artifacts.has(artifact.artifactId)) {
            state.artifacts.set(artifact.artifactId, { definition: artifact, candidates: new Map(), acceptances: new Map(), rejections: new Map(), revisions: [] });
          }
          break;
        }
        case "CANDIDATE_PROPOSED": {
          const candidate = (event.payload as { candidate: BoundaryCandidateRevision }).candidate;
          state.artifacts.get(candidate.artifactId)?.candidates.set(candidate.digest, candidate);
          break;
        }
        case "CANDIDATE_ACCEPTED": {
          const payload = event.payload as { candidateDigest: string; acceptedBy: PeerRef };
          const artifact = artifactOfCandidate(payload.candidateDigest);
          if (artifact !== undefined) {
            const set = artifact.acceptances.get(payload.candidateDigest) ?? new Set<string>();
            set.add(payload.acceptedBy.peerId);
            artifact.acceptances.set(payload.candidateDigest, set);
          }
          break;
        }
        case "CANDIDATE_REJECTED": {
          const payload = event.payload as { candidateDigest: string; rejectedBy: PeerRef };
          const artifact = artifactOfCandidate(payload.candidateDigest);
          if (artifact !== undefined) {
            const set = artifact.rejections.get(payload.candidateDigest) ?? new Set<string>();
            set.add(payload.rejectedBy.peerId);
            artifact.rejections.set(payload.candidateDigest, set);
          }
          break;
        }
        case "REVISION_ACCEPTED": {
          const revision = (event.payload as { revision: AcceptedBoundaryRevision }).revision;
          state.artifacts.get(revision.artifactId)?.revisions.push(revision);
          break;
        }
        default:
          break;
      }
    }
    for (const artifact of state.artifacts.values()) artifact.revisions.sort((a, b) => a.revision - b.revision);
    return state;
  }

  async function requireState(workspaceId: string): Promise<{ state: WorkspaceState; events: readonly BoundaryEvent[] }> {
    const events = await deps.store.replay(workspaceId);
    const state = derive(events);
    if (state === undefined) fail("unknown_workspace", `workspace "${workspaceId}" does not exist`);
    return { state, events };
  }

  function headOf(artifact: ArtifactState): AcceptedBoundaryRevision | undefined {
    return artifact.revisions[artifact.revisions.length - 1];
  }

  function baseMatchesHead(artifact: ArtifactState, candidate: BoundaryCandidateRevision): boolean {
    const head = headOf(artifact);
    return candidate.base === null ? head === undefined : head !== undefined && acceptedBoundaryRevisionRefsEqual(candidate.base, acceptedRevisionRefOf(head));
  }

  function standingOf(artifact: ArtifactState, candidate: BoundaryCandidateRevision): CandidateStanding {
    const acceptingRevision = artifact.revisions.find((revision) => revision.candidateDigest === candidate.digest);
    if (acceptingRevision !== undefined) {
      const head = headOf(artifact);
      return head !== undefined && head.revision === acceptingRevision.revision ? "ACCEPTED" : "SUPERSEDED";
    }
    const rejected = [...(artifact.rejections.get(candidate.digest) ?? [])].some((peerId) =>
      candidate.requiredAcceptors.some((peer) => peer.peerId === peerId),
    );
    if (rejected) return "REJECTED";
    if (!baseMatchesHead(artifact, candidate)) return "STALE";
    return (artifact.acceptances.get(candidate.digest)?.size ?? 0) > 0 ? "PARTIALLY_ACCEPTED" : "PROPOSED";
  }

  function acceptedStateOf(artifact: ArtifactState): AcceptedBoundaryState | null {
    const head = headOf(artifact);
    if (head === undefined) return null;
    const candidate = artifact.candidates.get(head.candidateDigest);
    if (candidate === undefined) fail("malformed_record", `accepted revision ${head.revision} has no candidate`);
    return Object.freeze({ ref: acceptedRevisionRefOf(head), candidate, content: candidate.content, acceptors: head.acceptors });
  }

  function candidateViews(artifact: ArtifactState): readonly CandidateView[] {
    return Object.freeze(
      [...artifact.candidates.values()]
        .map((candidate) =>
          Object.freeze({
            candidate,
            standing: standingOf(artifact, candidate),
            acceptors: peersOf([...(artifact.acceptances.get(candidate.digest) ?? [])]),
            rejectedBy: peersOf([...(artifact.rejections.get(candidate.digest) ?? [])]),
          }),
        )
        .sort((a, b) => (a.candidate.digest < b.candidate.digest ? -1 : 1)),
    );
  }

  function artifactView(artifact: ArtifactState): ArtifactView {
    return Object.freeze({
      artifact: artifact.definition,
      current: acceptedStateOf(artifact),
      pending: Object.freeze(
        candidateViews(artifact).filter((view) => view.standing !== "ACCEPTED" && view.standing !== "SUPERSEDED" && view.standing !== "REJECTED"),
      ),
      revisionCount: artifact.revisions.length,
    });
  }

  function requireOpen(state: WorkspaceState): void {
    if (state.closed) fail("workspace_closed", `workspace "${state.workspace.workspaceId}" is closed`);
  }

  function requireArtifact(state: WorkspaceState, artifactId: string): ArtifactState {
    const artifact = state.artifacts.get(artifactId);
    if (artifact === undefined) fail("unknown_artifact", `artifact "${artifactId}" does not exist in this workspace`);
    return artifact;
  }

  function requireParticipant(state: WorkspaceState, peer: PeerRef, what: string): void {
    if (!isWorkspaceParticipant(state.workspace, peer)) fail("not_a_participant", `${what} "${peer.peerId}" is not a workspace participant`);
  }

  function validateContent(type: BoundaryArtifactTypeRef, content: unknown): unknown {
    const validator = types.validator(type);
    if (validator === undefined) fail("unknown_type", `unknown boundary artifact type "${type.typeId}@${type.version}"`);
    try {
      return validator.validate(content);
    } catch (error) {
      fail("invalid_content", `artifact content is invalid for "${type.typeId}@${type.version}": ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  function resolveAcceptor(authenticatedPeer: PeerRef | null, local: boolean | undefined): { peer: PeerRef; authenticated: boolean } {
    const peer = local === true ? deps.localPeer : authenticatedPeer;
    if (peer === null) fail("unauthenticated_acceptance", "acceptance requires an authenticated peer (unauthenticated input can never accept shared boundary state)");
    return { peer, authenticated: local !== true };
  }

  async function openWorkspace(input: { readonly workspaceId: string; readonly participants: readonly PeerRef[]; readonly purpose: string }): Promise<BoundaryWorkspaceDefinition> {
    const workspace = materializeBoundaryWorkspaceDefinition({ workspaceId: input.workspaceId, participants: input.participants, purpose: input.purpose });
    await deps.store.openWorkspace(workspace);
    return workspace;
  }

  async function closeWorkspace(input: { readonly workspaceId: string; readonly reason: string }): Promise<void> {
    const { state } = await requireState(input.workspaceId);
    if (state.closed) return;
    if (input.reason.trim() === "") fail("invalid_registration", "close reason must be a non-empty string");
    const payload = Object.freeze({ reason: input.reason });
    await append(input.workspaceId, [{ eventId: eventIdFor("WORKSPACE_CLOSED", input.workspaceId, payload), type: "WORKSPACE_CLOSED", payload }]);
  }

  async function createArtifact(input: { readonly workspaceId: string; readonly artifactId: string; readonly type: BoundaryArtifactTypeRef; readonly title: string }): Promise<BoundaryArtifactDefinition> {
    const { state } = await requireState(input.workspaceId);
    requireOpen(state);
    if (types.validator(input.type) === undefined) fail("unknown_type", `unknown boundary artifact type "${input.type.typeId}@${input.type.version}"`);
    const artifact = materializeBoundaryArtifactDefinition({ workspaceId: input.workspaceId, artifactId: input.artifactId, type: input.type, title: input.title });
    if (state.artifacts.has(artifact.artifactId)) fail("already_exists", `artifact "${artifact.artifactId}" already exists`);
    await append(input.workspaceId, [{ eventId: eventIdFor("ARTIFACT_CREATED", input.workspaceId, { artifact }), type: "ARTIFACT_CREATED", payload: { artifact } }]);
    return artifact;
  }

  async function proposeRevision(input: {
    readonly workspaceId: string;
    readonly artifactId: string;
    readonly base: AcceptedBoundaryRevisionRef | null;
    readonly content: unknown;
    readonly requiredAcceptors: readonly PeerRef[];
    readonly intent: string;
  }): Promise<BoundaryCandidateRevision> {
    const { state } = await requireState(input.workspaceId);
    requireOpen(state);
    requireParticipant(state, deps.localPeer, "author");
    const artifact = requireArtifact(state, input.artifactId);
    const requiredAcceptors = canonicalPeerSet(input.requiredAcceptors, "requiredAcceptors", 1);
    for (const peer of requiredAcceptors) requireParticipant(state, peer, "required acceptor");
    if (requiredAcceptors.every((peer) => peer.peerId === deps.localPeer.peerId)) {
      fail("unilateral_acceptance_unsupported", "requiredAcceptors must include at least one peer other than the author (joint acceptance only in v1)");
    }
    const head = headOf(artifact);
    if (input.base === null) {
      if (head !== undefined) fail("invalid_registration", "a candidate for an artifact with an accepted head must declare a base");
    } else {
      if (input.base.workspaceId !== input.workspaceId || input.base.artifactId !== input.artifactId) {
        fail("invalid_registration", "candidate base must reference this workspace artifact");
      }
      const known = artifact.revisions.some((revision) => acceptedBoundaryRevisionRefsEqual(acceptedRevisionRefOf(revision), input.base!));
      if (!known) fail("invalid_registration", "candidate base is not a known accepted revision of this artifact");
    }
    if (input.intent.trim() === "") fail("invalid_registration", "candidate intent must be a non-empty string");
    const content = validateContent(artifact.definition.type, input.content);
    const contentDigest = boundaryContentDigestOf(artifact.definition.type, content);
    const baseFields = {
      schemaVersion: 1 as const,
      workspaceId: input.workspaceId,
      artifactId: input.artifactId,
      type: artifact.definition.type,
      base: input.base,
      content,
      contentDigest,
      author: deps.localPeer,
      requiredAcceptors,
      intent: input.intent,
    };
    const candidate: BoundaryCandidateRevision = Object.freeze({ ...baseFields, digest: candidateDigestOf(baseFields) });
    await append(input.workspaceId, [{ eventId: eventIdFor("CANDIDATE_PROPOSED", input.workspaceId, { candidate }), type: "CANDIDATE_PROPOSED", payload: { candidate } }]);
    return candidate;
  }

  async function acceptRevision(input: {
    readonly workspaceId: string;
    readonly artifactId: string;
    readonly candidateDigest: string;
    readonly authenticatedPeer: PeerRef | null;
    readonly local?: boolean | undefined;
  }): Promise<AcceptanceOutcome> {
    const { state } = await requireState(input.workspaceId);
    requireOpen(state);
    const artifact = requireArtifact(state, input.artifactId);
    const candidate = artifact.candidates.get(input.candidateDigest);
    if (candidate === undefined) fail("unknown_candidate", `candidate "${input.candidateDigest}" does not exist in this artifact`);
    const { peer, authenticated } = resolveAcceptor(input.authenticatedPeer, input.local);
    requireParticipant(state, peer, "acceptor");
    if (!candidateHasAcceptor(candidate, peer)) fail("not_required_acceptor", `"${peer.peerId}" is not a required acceptor of this candidate`);
    const standing = standingOf(artifact, candidate);
    const acceptingRevision = artifact.revisions.find((revision) => revision.candidateDigest === candidate.digest);
    if (acceptingRevision !== undefined) {
      // Idempotent retry of an already-advanced revision.
      return Object.freeze({ candidateDigest: candidate.digest, standing, accepted: acceptedRevisionRefOf(acceptingRevision), acceptors: acceptingRevision.acceptors });
    }
    if (standing === "REJECTED") fail("already_decided", "this candidate has been rejected by a required acceptor");
    if (standing === "STALE") fail("stale_candidate", "this candidate's base is no longer the current accepted head — rebase it as a new candidate");
    const accepted = artifact.acceptances.get(candidate.digest) ?? new Set<string>();
    if (accepted.has(peer.peerId)) {
      // Idempotent retry: the same acceptor re-accepting the same candidate adds nothing.
      return Object.freeze({ candidateDigest: candidate.digest, standing, accepted: null, acceptors: peersOf([...accepted]) });
    }
    const acceptors = peersOf([...accepted, peer.peerId]);
    const acceptancePayload = Object.freeze({ workspaceId: input.workspaceId, artifactId: input.artifactId, candidateDigest: candidate.digest, acceptedBy: peer, authenticated });
    const complete = candidate.requiredAcceptors.every((required) => acceptors.some((acceptor) => acceptor.peerId === required.peerId));
    if (!complete) {
      await append(input.workspaceId, [{ eventId: eventIdFor("CANDIDATE_ACCEPTED", input.workspaceId, acceptancePayload), type: "CANDIDATE_ACCEPTED", payload: acceptancePayload }]);
      return Object.freeze({ candidateDigest: candidate.digest, standing: "PARTIALLY_ACCEPTED", accepted: null, acceptors });
    }
    // Final acceptance: the base must still be the current head; head advancement is atomic with it.
    if (!baseMatchesHead(artifact, candidate)) fail("stale_candidate", "this candidate's base is no longer the current accepted head — rebase it as a new candidate");
    const head = headOf(artifact);
    const revision: AcceptedBoundaryRevision = Object.freeze({
      schemaVersion: 1 as const,
      workspaceId: input.workspaceId,
      artifactId: input.artifactId,
      revision: artifact.revisions.length,
      candidateDigest: candidate.digest,
      revisionDigest: acceptedRevisionDigestOf({
        workspaceId: input.workspaceId,
        artifactId: input.artifactId,
        revision: artifact.revisions.length,
        candidateDigest: candidate.digest,
        acceptors,
        previousRevisionDigest: head?.revisionDigest ?? null,
      }),
      acceptors,
      base: candidate.base,
    });
    await append(input.workspaceId, [
      { eventId: eventIdFor("CANDIDATE_ACCEPTED", input.workspaceId, acceptancePayload), type: "CANDIDATE_ACCEPTED", payload: acceptancePayload },
      { eventId: eventIdFor("REVISION_ACCEPTED", input.workspaceId, { revision }), type: "REVISION_ACCEPTED", payload: { revision } },
    ]);
    return Object.freeze({ candidateDigest: candidate.digest, standing: "ACCEPTED", accepted: acceptedRevisionRefOf(revision), acceptors });
  }

  async function rejectRevision(input: {
    readonly workspaceId: string;
    readonly artifactId: string;
    readonly candidateDigest: string;
    readonly authenticatedPeer: PeerRef | null;
    readonly local?: boolean | undefined;
  }): Promise<RejectionOutcome> {
    const { state } = await requireState(input.workspaceId);
    requireOpen(state);
    const artifact = requireArtifact(state, input.artifactId);
    const candidate = artifact.candidates.get(input.candidateDigest);
    if (candidate === undefined) fail("unknown_candidate", `candidate "${input.candidateDigest}" does not exist in this artifact`);
    const { peer } = resolveAcceptor(input.authenticatedPeer, input.local);
    requireParticipant(state, peer, "rejector");
    if (!candidateHasAcceptor(candidate, peer)) fail("not_required_acceptor", `"${peer.peerId}" is not a required acceptor of this candidate (only required acceptors may decide a candidate)`);
    const standing = standingOf(artifact, candidate);
    if (standing === "ACCEPTED" || standing === "SUPERSEDED") fail("already_decided", "an accepted revision cannot be rejected");
    const rejected = artifact.rejections.get(candidate.digest) ?? new Set<string>();
    if (rejected.has(peer.peerId)) {
      return Object.freeze({ candidateDigest: candidate.digest, standing, rejectedBy: peersOf([...rejected]) });
    }
    const payload = Object.freeze({ workspaceId: input.workspaceId, artifactId: input.artifactId, candidateDigest: candidate.digest, rejectedBy: peer, authenticated: input.local !== true });
    await append(input.workspaceId, [{ eventId: eventIdFor("CANDIDATE_REJECTED", input.workspaceId, payload), type: "CANDIDATE_REJECTED", payload }]);
    return Object.freeze({ candidateDigest: candidate.digest, standing: "REJECTED", rejectedBy: peersOf([...rejected, peer.peerId]) });
  }

  async function currentAccepted(input: { readonly workspaceId: string; readonly artifactId: string }): Promise<AcceptedBoundaryState | null> {
    const { state } = await requireState(input.workspaceId);
    return acceptedStateOf(requireArtifact(state, input.artifactId));
  }

  async function pendingCandidates(input: { readonly workspaceId: string; readonly artifactId: string }): Promise<readonly CandidateView[]> {
    const { state } = await requireState(input.workspaceId);
    return artifactView(requireArtifact(state, input.artifactId)).pending;
  }

  async function workspaceView(input: { readonly workspaceId: string }): Promise<BoundaryWorkspaceView> {
    const { state } = await requireState(input.workspaceId);
    const basis = await deps.store.basis(input.workspaceId);
    if (basis === undefined) fail("unknown_workspace", `workspace "${input.workspaceId}" does not exist`);
    return Object.freeze({
      workspace: state.workspace,
      closed: state.closed,
      closedReason: state.closedReason,
      artifacts: Object.freeze([...state.artifacts.values()].map(artifactView).sort((a, b) => (a.artifact.artifactId < b.artifact.artifactId ? -1 : 1))),
      basis,
    });
  }

  async function changesSince(input: { readonly workspaceId: string; readonly throughSeq: number }): Promise<WorkspaceChanges> {
    const { state, events } = await requireState(input.workspaceId);
    const touched = new Set<string>();
    for (const event of events) {
      if (event.seq <= input.throughSeq) continue;
      if (event.type === "ARTIFACT_CREATED") touched.add((event.payload as { artifact: BoundaryArtifactDefinition }).artifact.artifactId);
      else if (event.type === "CANDIDATE_PROPOSED") touched.add((event.payload as { candidate: BoundaryCandidateRevision }).candidate.artifactId);
      else if (event.type === "REVISION_ACCEPTED") touched.add((event.payload as { revision: AcceptedBoundaryRevision }).revision.artifactId);
    }
    const basis = await deps.store.basis(input.workspaceId);
    if (basis === undefined) fail("unknown_workspace", `workspace "${input.workspaceId}" does not exist`);
    return Object.freeze({
      basis,
      changedArtifacts: Object.freeze(
        [...touched]
          .map((artifactId) => state.artifacts.get(artifactId))
          .filter((artifact): artifact is ArtifactState => artifact !== undefined)
          .map(artifactView)
          .sort((a, b) => (a.artifact.artifactId < b.artifact.artifactId ? -1 : 1)),
      ),
    });
  }

  async function acceptedBlueprint(input: { readonly workspaceId: string; readonly artifactId: string }): Promise<AcceptedOrganizationBlueprint | undefined> {
    const { state } = await requireState(input.workspaceId);
    const artifact = state.artifacts.get(input.artifactId);
    if (artifact === undefined) return undefined;
    if (!boundaryArtifactTypeRefsEqual(artifact.definition.type, ORGANIZATION_BLUEPRINT_TYPE)) return undefined;
    const head = headOf(artifact);
    if (head === undefined) return undefined;
    const candidate = artifact.candidates.get(head.candidateDigest);
    if (candidate === undefined) fail("malformed_record", "accepted blueprint revision has no candidate");
    const content = validateContent(ORGANIZATION_BLUEPRINT_TYPE, candidate.content) as OrganizationBlueprintContent;
    return Object.freeze({
      workspaceId: input.workspaceId,
      artifactId: input.artifactId,
      revision: acceptedRevisionRefOf(head),
      contentDigest: candidate.contentDigest,
      content,
      definition: organizationDefinitionOfBlueprint(content),
      requiredAcceptors: candidate.requiredAcceptors,
    });
  }

  async function admitBoundaryRevisionScope(ref: AcceptedBoundaryRevisionRef): Promise<void> {
    if (!(await deps.store.exists(ref.workspaceId))) fail("unverified_scope", `workspace "${ref.workspaceId}" does not exist`);
    const { state } = await requireState(ref.workspaceId);
    const artifact = state.artifacts.get(ref.artifactId);
    if (artifact === undefined) fail("unverified_scope", `artifact "${ref.artifactId}" does not exist`);
    const known = artifact.revisions.some((revision) => acceptedBoundaryRevisionRefsEqual(acceptedRevisionRefOf(revision), ref));
    if (!known) fail("unverified_scope", "a commitment may only scope to an exact accepted boundary revision (candidate revisions cannot be scoped)");
  }

  return {
    openWorkspace,
    closeWorkspace,
    createArtifact,
    proposeRevision,
    acceptRevision,
    rejectRevision,
    currentAccepted,
    pendingCandidates,
    workspaceView,
    changesSince,
    acceptedBlueprint,
    admitBoundaryRevisionScope,
  };
}
