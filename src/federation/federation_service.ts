/**
 * G10-E5 federated workforce service — the high-level bottom-up collaboration
 * surface (§106–§110). It COORDINATES local semantic steps:
 *
 *   declareContactNeed / findCandidates
 *   openThread (implicit) / sendMessage / wakePeer / acknowledge
 *   offerCommitment / acceptCommitment / rejectCommitment / releaseCommitment
 *   offerHandoff / acceptHandoff / rejectHandoff
 *   beginParticipation / endParticipation
 *   views: manpowerPoint / coalition / inbox / thread
 *
 * It is NOT a global planner or authority root (§5/§98): it derives contact
 * needs, discovers candidates, sends messages, records commitments, and
 * derives views — it never commands arbitrary peers, forces remote
 * commitment, changes peer authority, or schedules Work. There is NO
 * `assignPeerToTask` / `forcePeerParticipation` / `setWorker` API (§108).
 */

import type { Activation } from "../runtime/index.js";
import type { CoordinationStore } from "../coordination/store.js";
import { CoordinationStoreError } from "../identity/errors.js";
import { canonicalDigest } from "../schema/canonical.js";
import type { AttemptCatalogPort, ParticipationService } from "../coordination/index.js";
import type { PeerDirectoryPort } from "./directory.js";
import { discoverContactCandidates } from "./directory.js";
import type {
  ContactNeed,
  ContactNeedDeclarationProvenance,
  ContactNeedDeclaredPayload,
  PeerAdvertisement,
  PeerContinuityAssociation,
  PeerRef,
} from "./peer.js";
import { materializeContactNeed, matchContactCandidates } from "./peer.js";
import type { CommitmentId, CommitmentOffer, CommitmentScope } from "./commitment.js";
import { CommitmentError } from "./commitment.js";
import type { CommitmentSummary } from "./commitment_service.js";
import type { ContactRequestedPayload } from "./messages.js";
import type { FederationMessagingService, InboxView, ThreadView } from "./messaging.js";
import type { CoalitionView, ManpowerPointView } from "./workforce.js";
import { coalitionView, manpowerPointView } from "./workforce.js";
import type { CoalitionScope, CoalitionSnapshot } from "./coalition.js";
import { deriveCoalitionSnapshot } from "./coalition.js";
import type { AttemptRef } from "../coordination/index.js";
import { FEDERATION_SCOPE } from "./messaging.js";

export interface FederationServiceDeps {
  readonly store: CoordinationStore;
  readonly localPeer: PeerRef;
  readonly messaging: FederationMessagingService;
  readonly commitments: import("./commitment_service.js").CommitmentService;
  readonly participation: ParticipationService;
  readonly directory: PeerDirectoryPort;
  readonly allocateContactNeedId: () => string;
  /** G10-P (additive): explicit PeerRef↔PersistentPoint associations (deployment binding). */
  readonly continuityAssociations?: readonly PeerContinuityAssociation[] | undefined;
}

/**
 * E3-C §14: a durable declared need, as recovered from history. It carries the need itself PLUS the
 * provenance that explains why it exists, so a reader after a restart sees the same grounding an
 * in-session caller saw.
 */
export interface DeclaredContactNeedView {
  readonly need: ContactNeed;
  readonly provenance: import("./peer.js").ContactNeedDeclarationProvenance;
}

export interface FederationService {
  /**
   * E3-C §12: declare a ContactNeed. Manual declaration is now DURABLE — it appends
   * `CONTACT_NEED_DECLARED` to the existing coordination history instead of returning a memory-only
   * artifact, so the two classes "durable governed need" and "ephemeral manual need" no longer exist
   * behind one API name.
   *
   * `candidate` (§13) makes the declaration retry-stable: a repeat for the SAME candidate digest returns
   * the already-declared need rather than allocating a second one.
   */
  declareContactNeed(input: {
    readonly origin: ContactNeed["origin"];
    readonly competenceTags: readonly string[];
    readonly reason: string;
    /**
     * E3-C §13 (additive): the admission provenance for a candidate-derived declaration. Absent ⇒ a
     * manual declaration. When present the candidate digest is the retry correlation.
     */
    readonly provenance?: import("./peer.js").ContactNeedDeclarationProvenance | undefined;
  }): Promise<ContactNeed>;
  /** E3-C §14: the durable need by id, derived from history (undefined when never declared). */
  contactNeed(contactNeedId: string): Promise<DeclaredContactNeedView | undefined>;
  /** E3-C §14: every durably declared need, derived from history in declaration order. */
  contactNeeds(): Promise<readonly DeclaredContactNeedView[]>;
  findCandidates(need: ContactNeed): Promise<
    | { readonly status: "discovered"; readonly candidates: ReturnType<typeof matchContactCandidates> }
    | { readonly status: "directory_unknown"; readonly detail: string }
    | { readonly status: "directory_error"; readonly detail: string }
  >;
  /**
   * E3-C §16: request contact for a DURABLY DECLARED need. A fabricated in-memory
   * `{contactNeedId: "whatever"}` is refused: the need must exist in history first. A contact request
   * still grants NO commitment.
   */
  requestContact(input: { readonly need: ContactNeed; readonly to: PeerRef }): Promise<void>;
  sendMessage: FederationMessagingService["sendMessage"];
  wakePeer: FederationMessagingService["wakePeer"];
  acknowledge: FederationMessagingService["acknowledge"];
  recordInboundMessage: FederationMessagingService["recordInboundMessage"];
  offerCommitment(input: {
    readonly proposedHolder: PeerRef;
    readonly scope: CommitmentScope;
    readonly statement: string;
  }): ReturnType<import("./commitment_service.js").CommitmentService["offerCommitment"]>;
  /**
   * E3-C §17: the HIGH-LEVEL need-scoped commitment path. It DERIVES
   * `scope = { kind: "contact_need", contactNeedId }` itself — the caller never hand-authors the scope —
   * after proving the need exists durably and a `CONTACT_REQUESTED` exists for this need and holder.
   * It then uses the EXISTING `CommitmentService`; there is no new commitment owner.
   */
  offerCommitmentForNeed(input: {
    readonly contactNeedId: string;
    readonly proposedHolder: PeerRef;
    readonly statement: string;
  }): ReturnType<import("./commitment_service.js").CommitmentService["offerCommitment"]>;
  acceptCommitment: import("./commitment_service.js").CommitmentService["acceptCommitment"];
  rejectCommitment: import("./commitment_service.js").CommitmentService["rejectCommitment"];
  releaseCommitment: import("./commitment_service.js").CommitmentService["releaseCommitment"];
  offerHandoff: import("./commitment_service.js").CommitmentService["offerHandoff"];
  acceptHandoff: import("./commitment_service.js").CommitmentService["acceptHandoff"];
  /** E3-C §28: submit a typed fulfillment for an ACTIVE commitment (submission ≠ acceptance). */
  submitFulfillment: import("./commitment_service.js").CommitmentService["submitFulfillment"];
  /** E3-C §25: the independent fulfillment authority decides the EXACT submission digest. */
  decideFulfillment: import("./commitment_service.js").CommitmentService["decideFulfillment"];
  /** E3-C §28: read-only derived fulfillment state for a commitment. */
  fulfillment: import("./commitment_service.js").CommitmentService["fulfillment"];
  /** E3-C §28: read-only derived submissions for a commitment. */
  fulfillmentSubmissions: import("./commitment_service.js").CommitmentService["fulfillmentSubmissions"];
  beginParticipation(input: {
    readonly activation: Activation;
    readonly attempt: AttemptRef;
    readonly invocationId?: string;
  }): Promise<unknown>;
  endParticipation(input: {
    readonly participationId: string;
    readonly endReason: "completed" | "withdrawn" | "cancelled" | "runtime_lost";
  }): Promise<unknown>;
  thread(threadId: string): Promise<ThreadView>;
  inbox(peer: PeerRef): Promise<InboxView>;
  manpowerPoint(peer: PeerRef): Promise<ManpowerPointView>;
  /** Legacy string-scoped derived coalition projection (E5). */
  coalition(scope: string): Promise<CoalitionView>;
  /** G10-F1 formal coalition snapshot: derived, basis-recorded, read-only (§37/§41). */
  coalitionSnapshot(scope: CoalitionScope): Promise<CoalitionSnapshot>;
  /** G10-O: derived read-only commitment state (no mutation). */
  commitmentState(commitmentId: string): Promise<{ readonly state: string; readonly holder: PeerRef } | undefined>;
  /** G10-P: read-only enumeration of every commitment with its derived state (CF-O-01). */
  commitments(): Promise<readonly CommitmentSummary[]>;
}

export function makeFederationService(deps: FederationServiceDeps): FederationService {
  /**
   * §11/§13: the durable-declaration reader. ONE derivation over the existing history, shared by the
   * idempotence check and both read surfaces, so "was this declared?" and "what did it declare?" can
   * never disagree.
   */
  async function declaredNeeds(): Promise<readonly DeclaredContactNeedView[]> {
    const events = await deps.store.replay();
    const views: DeclaredContactNeedView[] = [];
    for (const event of events) {
      if (event.type !== "CONTACT_NEED_DECLARED") continue;
      const payload = event.payload as ContactNeedDeclaredPayload;
      views.push(Object.freeze({ need: payload.need, provenance: payload.provenance }));
    }
    return Object.freeze(views);
  }

  async function declareContactNeed(input: {
    readonly origin: ContactNeed["origin"];
    readonly competenceTags: readonly string[];
    readonly reason: string;
    readonly provenance?: ContactNeedDeclarationProvenance | undefined;
  }): Promise<ContactNeed> {
    const provenance: ContactNeedDeclarationProvenance = input.provenance ?? Object.freeze({ kind: "manual" as const });

    // §13: a retry of the SAME admitted candidate must not create a second durable need. The candidate
    // digest is the retry-stable correlation, derived from history rather than kept in a new store.
    if (provenance.kind === "candidate") {
      const existing = (await declaredNeeds()).find(
        (view) => view.provenance.kind === "candidate" && view.provenance.candidateDigest === provenance.candidateDigest,
      );
      if (existing !== undefined) return existing.need;
    }

    const need = materializeContactNeed({
      contactNeedId: deps.allocateContactNeedId(),
      origin: input.origin,
      competenceTags: input.competenceTags,
      reason: input.reason,
    });
    const payload: ContactNeedDeclaredPayload = Object.freeze({ need, provenance });
    await deps.store.append({
      eventId: canonicalDigest({
        domain: "palimpsest.coordination-event.v1",
        type: "CONTACT_NEED_DECLARED",
        scope: FEDERATION_SCOPE,
        content: payload,
      }),
      projectId: FEDERATION_SCOPE,
      type: "CONTACT_NEED_DECLARED",
      payload,
    } as never);
    return need;
  }

  async function contactNeed(contactNeedId: string): Promise<DeclaredContactNeedView | undefined> {
    return (await declaredNeeds()).find((view) => view.need.contactNeedId === contactNeedId);
  }

  async function findCandidates(need: ContactNeed) {
    return discoverContactCandidates(deps.directory, need);
  }

  async function requestContact(input: { readonly need: ContactNeed; readonly to: PeerRef }): Promise<void> {
    // §16: a fabricated in-memory need id must no longer be sufficient for the governed path. The need
    // must be DURABLY DECLARED before any contact is recorded — a contact request is a consequence of a
    // declared need, never of a caller's assertion that one exists.
    const declared = await contactNeed(input.need.contactNeedId);
    if (declared === undefined) {
      throw new CoordinationStoreError(
        `contact need "${input.need.contactNeedId}" is not durably declared — declare it before requesting contact`,
      );
    }
    await deps.messaging.requestContact({ contactNeedId: input.need.contactNeedId, to: input.to });
  }

  /**
   * §17: the high-level need-scoped commitment path. The scope is DERIVED here from the need id, so a
   * caller cannot hand-author a scope that names a need it never proved exists.
   *
   * The three preconditions are checked against history, in order: the need exists durably; a
   * `CONTACT_REQUESTED` exists from THIS peer for THIS need and the proposed holder. Then the EXISTING
   * `CommitmentService` records the offer — no new commitment owner, and no commitment semantics here.
   */
  async function offerCommitmentForNeed(input: {
    readonly contactNeedId: string;
    readonly proposedHolder: PeerRef;
    readonly statement: string;
  }): Promise<CommitmentOffer> {
    const declared = await contactNeed(input.contactNeedId);
    if (declared === undefined) {
      throw new CoordinationStoreError(
        `contact need "${input.contactNeedId}" is not durably declared — offerCommitmentForNeed requires a declared need`,
      );
    }
    const events = await deps.store.replay();
    const requested = events.some((event) => {
      if (event.type !== "CONTACT_REQUESTED") return false;
      const payload = event.payload as ContactRequestedPayload;
      return (
        payload.contactNeedId === input.contactNeedId &&
        payload.from.peerId === deps.localPeer.peerId &&
        payload.to.peerId === input.proposedHolder.peerId
      );
    });
    if (!requested) {
      throw new CommitmentError(
        "unverified_scope",
        `no CONTACT_REQUESTED exists from "${deps.localPeer.peerId}" for need "${input.contactNeedId}" and holder "${input.proposedHolder.peerId}"`,
      );
    }
    // The scope is DERIVED, never accepted from the caller.
    const scope: CommitmentScope = Object.freeze({ kind: "contact_need" as const, contactNeedId: input.contactNeedId });
    return deps.commitments.offerCommitment({
      proposedHolder: input.proposedHolder,
      scope,
      statement: input.statement,
    });
  }

  return {
    declareContactNeed,
    contactNeed,
    contactNeeds: declaredNeeds,
    findCandidates,
    requestContact,
    offerCommitmentForNeed,
    submitFulfillment: deps.commitments.submitFulfillment,
    decideFulfillment: deps.commitments.decideFulfillment,
    fulfillment: deps.commitments.fulfillment,
    fulfillmentSubmissions: deps.commitments.fulfillmentSubmissions,
    sendMessage: deps.messaging.sendMessage,
    wakePeer: deps.messaging.wakePeer,
    acknowledge: deps.messaging.acknowledge,
    recordInboundMessage: deps.messaging.recordInboundMessage,
    offerCommitment: deps.commitments.offerCommitment,
    acceptCommitment: deps.commitments.acceptCommitment,
    rejectCommitment: deps.commitments.rejectCommitment,
    releaseCommitment: deps.commitments.releaseCommitment,
    offerHandoff: deps.commitments.offerHandoff,
    acceptHandoff: deps.commitments.acceptHandoff,
    beginParticipation: (input) =>
      deps.participation.beginParticipation({
        activation: input.activation,
        attempt: input.attempt,
        ...(input.invocationId === undefined ? {} : { invocation: { invocationId: input.invocationId } }),
      }),
    endParticipation: (input) => deps.participation.endParticipation(input),
    thread: (threadId) => deps.messaging.threadView(threadId),
    inbox: (peer) => deps.messaging.inboxView(peer),
    manpowerPoint: (peer) =>
      manpowerPointView(
        {
          store: deps.store,
          localPeer: deps.localPeer,
          inboxOf: (target) => deps.messaging.inboxView(target),
          ...(deps.continuityAssociations === undefined
            ? {}
            : { continuityAssociations: deps.continuityAssociations }),
        },
        peer,
      ),
    coalition: (scope) =>
      coalitionView({ store: deps.store, localPeer: deps.localPeer, inboxOf: (peer) => deps.messaging.inboxView(peer) }, scope),
    coalitionSnapshot: (scope) => deriveCoalitionSnapshot(deps.store, scope),
    commitmentState: async (commitmentId: string) => {
      const entry = await deps.commitments.commitmentState(commitmentId);
      return entry === undefined ? undefined : { state: entry.state, holder: entry.holder };
    },
    commitments: () => deps.commitments.listCommitments(),
  };
}

export type { AttemptCatalogPort, PeerAdvertisement, PeerRef, Activation };

/**
 * E3-C §18: the canonical `contact_need` scope guard, derived from the EXISTING coordination history.
 *
 * This is the ONE place that answers "was this need durably declared?" for scope verification, and it is
 * deliberately a read over history rather than a lookup in a new store. Composition injects it into the
 * commitment service; a direct construction that omits it refuses every `contact_need` scope.
 */
export function durableContactNeedScopeGuard(
  store: CoordinationStore,
): import("./commitment_service.js").ContactNeedScopeGuard {
  return Object.freeze({
    async admitScope(scope: CommitmentScope): Promise<void> {
      if (scope.kind !== "contact_need") {
        throw new CommitmentError("unverified_scope", "the contact-need scope guard only verifies contact_need scopes");
      }
      const events = await store.replay();
      const declared = events.some((event) => {
        if (event.type !== "CONTACT_NEED_DECLARED") return false;
        const payload = event.payload as ContactNeedDeclaredPayload;
        return payload.need.contactNeedId === scope.contactNeedId;
      });
      if (!declared) {
        // §18: a caller-supplied contactNeedId cannot manufacture a valid commitment scope.
        throw new CommitmentError(
          "unverified_scope",
          `contact need "${scope.contactNeedId}" is not durably declared — a commitment may only scope to a declared need`,
        );
      }
    },
  });
}
