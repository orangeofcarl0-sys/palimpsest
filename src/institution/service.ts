/**
 * G10-F4 institution service — explicit genesis, governance, and authorized
 * epoch advancement (§117–§129).
 *
 * The service ORCHESTRATES; the store enforces atomicity and the authority
 * threshold. Organization existence is checked here (read-only), before the
 * atomic commit.
 *
 * Local approval is explicit (`approve`); remote approval requires an
 * authenticated peer (`approveRemote`) — an unauthenticated remote approval is
 * refused (§119). InstitutionApproval is a governance act: it is NOT a peer
 * Commitment, a message Ack, or a RoleAssignment (§120).
 */

import type { PeerRef } from "../federation/peer.js";
import type { OrganizationDefinition, OrganizationDefinitionRef } from "../organization/definition.js";
import type {
  InstitutionApproval,
  InstitutionCharter,
  InstitutionEpoch,
  InstitutionTransitionProposal,
} from "./artifacts.js";
import {
  materializeApproval,
  materializeContinuationAuthorityRule,
  materializeInstitutionCharter,
  materializeTransitionProposal,
} from "./artifacts.js";
import type { InstitutionStore } from "./store.js";
import { InstitutionStoreError } from "./store.js";

export interface InstitutionServiceDeps {
  readonly store: InstitutionStore;
  readonly organizations: { get(ref: OrganizationDefinitionRef): Promise<OrganizationDefinition | undefined> };
  readonly allocateTransitionId: () => string;
  /**
   * G0/F-AUTH-01: the trusted LOCAL governance identity configured at
   * assembly. `approveLocal` always uses THIS identity; a caller can never
   * choose the local approving peer. Absent = no local approval path.
   * Federation `localPeer` is deliberately NOT reused implicitly (§29).
   */
  readonly localGovernancePeer?: PeerRef | undefined;
}

export interface InstitutionService {
  /** Explicit administrative genesis (§117) — never inferred from Organization/Coalition/Commitments. */
  genesis(input: {
    readonly institutionId: string;
    readonly purpose: string;
    readonly authorities: readonly PeerRef[];
    readonly requiredApprovals: number;
    readonly organization: OrganizationDefinitionRef;
  }): Promise<{ readonly charter: InstitutionCharter; readonly epoch: InstitutionEpoch }>;
  proposeTransition(input: {
    readonly institutionId: string;
    readonly proposedOrganization: OrganizationDefinitionRef;
    readonly reason: string;
    /** Optional charter amendment (new revision) — approved under the CURRENT charter. */
    readonly amendment?: {
      readonly purpose?: string;
      readonly authorities?: readonly PeerRef[];
      readonly requiredApprovals?: number;
    };
  }): Promise<InstitutionTransitionProposal>;
  /**
   * G0/F-AUTH-01: explicit LOCAL approval. The approving peer is the trusted
   * identity configured at assembly — NOT a per-call caller argument.
   */
  approveLocal(input: { readonly transitionId: string }): Promise<InstitutionApproval>;
  /** Remote approval — requires an authenticated peer (§119/§30). */
  approveRemote(input: {
    readonly transitionId: string;
    readonly authenticatedPeer: PeerRef | null;
  }): Promise<InstitutionApproval>;
  /** Authorized advancement (§124). Defaults to the current head. */
  advance(input: { readonly transitionId: string; readonly expectedHeadEpoch?: number }): Promise<InstitutionEpoch>;
}

export function makeInstitutionService(deps: InstitutionServiceDeps): InstitutionService {
  async function genesis(input: {
    readonly institutionId: string;
    readonly purpose: string;
    readonly authorities: readonly PeerRef[];
    readonly requiredApprovals: number;
    readonly organization: OrganizationDefinitionRef;
  }): Promise<{ readonly charter: InstitutionCharter; readonly epoch: InstitutionEpoch }> {
    if ((await deps.organizations.get(input.organization)) === undefined) {
      throw new InstitutionStoreError(
        "invalid_registration",
        `genesis organization ${input.organization.organizationDefinitionId}@${input.organization.revision} does not exist`,
      );
    }
    const charter = materializeInstitutionCharter({
      institutionId: input.institutionId,
      revision: 0,
      purpose: input.purpose,
      continuationAuthority: materializeContinuationAuthorityRule({
        authorities: input.authorities,
        requiredApprovals: input.requiredApprovals,
      }),
    });
    const epoch = await deps.store.genesis({ charter, organization: input.organization });
    return Object.freeze({ charter, epoch });
  }

  async function proposeTransition(input: {
    readonly institutionId: string;
    readonly proposedOrganization: OrganizationDefinitionRef;
    readonly reason: string;
    readonly amendment?: {
      readonly purpose?: string;
      readonly authorities?: readonly PeerRef[];
      readonly requiredApprovals?: number;
    };
  }): Promise<InstitutionTransitionProposal> {
    const head = await deps.store.head(input.institutionId);
    if (head === undefined) {
      throw new InstitutionStoreError("unknown_institution", `institution "${input.institutionId}" does not exist`);
    }
    const current = await deps.store.currentCharter(input.institutionId);
    if (current === undefined) {
      throw new InstitutionStoreError("unknown_institution", `institution "${input.institutionId}" has no charter`);
    }
    let proposedCharter = current;
    if (input.amendment !== undefined) {
      const rule = materializeContinuationAuthorityRule({
        authorities: input.amendment.authorities ?? current.continuationAuthority.authorities,
        requiredApprovals: input.amendment.requiredApprovals ?? current.continuationAuthority.requiredApprovals,
      });
      proposedCharter = materializeInstitutionCharter({
        institutionId: input.institutionId,
        revision: current.revision + 1,
        purpose: input.amendment.purpose ?? current.purpose,
        continuationAuthority: rule,
      });
      // G0/F-CHARTER-01: the amendment is stored as a NON-CANONICAL candidate.
      // It does not occupy the canonical revision slot until commit.
      await deps.store.registerCharterCandidate(proposedCharter);
    }
    const proposal = materializeTransitionProposal({
      transitionId: deps.allocateTransitionId(),
      institutionId: input.institutionId,
      baseEpoch: head,
      proposedCharter: {
        institutionId: proposedCharter.institutionId,
        revision: proposedCharter.revision,
        digest: proposedCharter.digest,
      },
      proposedOrganization: input.proposedOrganization,
      reason: input.reason,
    });
    await deps.store.recordProposal(proposal);
    return proposal;
  }

  async function approveLocal(input: { readonly transitionId: string }): Promise<InstitutionApproval> {
    const local = deps.localGovernancePeer;
    if (local === undefined) {
      throw new InstitutionStoreError(
        "invalid_registration",
        "no local governance identity is configured — local approval is unavailable",
      );
    }
    const approval = materializeApproval({ transitionId: input.transitionId, approvingPeer: local });
    await deps.store.recordApproval(approval);
    return approval;
  }

  async function approveRemote(input: {
    readonly transitionId: string;
    readonly authenticatedPeer: PeerRef | null;
  }): Promise<InstitutionApproval> {
    if (input.authenticatedPeer === null) {
      throw new InstitutionStoreError(
        "invalid_registration",
        "remote institution approval requires an authenticated peer (unauthenticated input cannot approve)",
      );
    }
    // The authenticated identity is asserted by the trusted transport boundary
    // (§30); it is not cryptographic proof unless the adapter guarantees it.
    const approval = materializeApproval({
      transitionId: input.transitionId,
      approvingPeer: input.authenticatedPeer,
    });
    await deps.store.recordApproval(approval);
    return approval;
  }

  async function advance(input: {
    readonly transitionId: string;
    readonly expectedHeadEpoch?: number;
  }): Promise<InstitutionEpoch> {
    const proposal = await deps.store.proposal(input.transitionId);
    if (proposal === undefined) {
      throw new InstitutionStoreError("unknown_transition", `transition "${input.transitionId}" was never proposed`);
    }
    if ((await deps.organizations.get(proposal.proposedOrganization)) === undefined) {
      throw new InstitutionStoreError(
        "invalid_registration",
        `proposed organization ${proposal.proposedOrganization.organizationDefinitionId}@${proposal.proposedOrganization.revision} does not exist`,
      );
    }
    // G0/F-CHARTER-01: resolve the proposed charter from the canonical list
    // (unchanged revision) or from the non-canonical candidate pool (revision).
    const proposedCharter =
      (await deps.store.charter(proposal.proposedCharter)) ??
      (await deps.store.charterCandidate(proposal.proposedCharter));
    if (proposedCharter === undefined) {
      throw new InstitutionStoreError("charter_conflict", "proposed charter revision is not registered");
    }
    const head = await deps.store.head(proposal.institutionId);
    if (head === undefined) {
      throw new InstitutionStoreError("unknown_institution", `institution "${proposal.institutionId}" does not exist`);
    }
    return deps.store.commitTransition({
      proposal,
      proposedCharter,
      expectedHeadEpoch: input.expectedHeadEpoch ?? head.epoch,
    });
  }

  return { genesis, proposeTransition, approveLocal, approveRemote, advance };
}
