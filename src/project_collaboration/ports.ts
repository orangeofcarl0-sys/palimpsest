/**
 * E3-C §30 — the CONSUMER-OWNED READ PORTS and the authoring port.
 *
 * ## The port wall (§30)
 *
 * `src/project_collaboration/**` must not import the Work kernel, an EventStore, or a concrete Federation
 * service/store. Its job is to read Project reality, prepare a candidate, assess currentness, invoke the
 * need authority, and hand the result to the EXISTING Federation need declaration. It owns:
 *
 *     NO store      NO peer identity      NO Work      NO commitment history      NO authority
 *
 * So it declares narrow READ capabilities and composition adapts the owners into them. The two writes it
 * needs — the untrusted authoring call and the Federation declaration — are PORTS over existing owners,
 * not new mutation paths.
 *
 * ## §6 authoring is untrusted cognition
 *
 * `CollaborationNeedAuthoringPort.propose` may suggest competence tags and a reason. It may NOT contact a
 * peer, select a peer, create a commitment, or grant authority — none of those capabilities appear in the
 * port's shape, so they are not reachable from an authoring implementation by construction.
 *
 * Layer: L2 (`src/project_collaboration/`).
 */
import type { ContactNeedOrigin } from "../federation/peer.js";
import type { CollaborationProjectBasis, NeedGround } from "./need.js";

/** §5: the canonical Work facts a ground observation is built from. */
export interface ProjectRealityFacts {
  readonly projectBasis: CollaborationProjectBasis;
  /** The declared hints the Work itself already carries (never invented here). */
  readonly declaredHints: readonly string[];
}

/**
 * §5 `BLOCKED_TASK` observation: the canonical blocked-work condition, read from the Work owner.
 * `undefined` means "this task is not a blocked task in canonical Work" — never a guess.
 */
export interface BlockedTaskObservation {
  readonly taskId: string;
  readonly objective: string;
  readonly dependsOn: readonly string[];
  readonly declaredHints: readonly string[];
}

/**
 * §5 `FAILED_ATTEMPT` observation: the attempt identity, its report digest and the observed status.
 * `undefined` means "no such attempt / not a failed attempt in canonical Work".
 */
export interface FailedAttemptObservation {
  readonly taskId: string;
  readonly attemptId: string;
  readonly reportDigest: string;
  readonly objective: string;
}

/**
 * §6: the untrusted authoring result.
 *
 *   `proposal`   — the author suggests tags and a reason for THIS observation
 *   `NO_NEED`    — the author looked and concluded no external need exists (§5: pressure ≠ need)
 *   `UNRESOLVED` — the author could not decide
 *
 * The union is closed on purpose: there is no "approve" arm, because authoring never approves.
 */
export type NeedAuthoringProposal = {
  readonly outcome: "proposal";
  readonly competenceTags: readonly string[];
  readonly reason: string;
};
export type NeedAuthoringResult = NeedAuthoringProposal | { readonly outcome: "NO_NEED" } | { readonly outcome: "UNRESOLVED" };

/**
 * §6: the authoring seam. `origin` names the authoring implementation so a candidate can record who
 * proposed it without the module trusting the proposal.
 */
export interface CollaborationNeedAuthoringPort {
  readonly origin: string;
  propose(input: {
    readonly ground: NeedGround;
    readonly facts: ProjectRealityFacts;
  }): Promise<NeedAuthoringResult>;
}

/** §9: the declared-need declaration capability, over the EXISTING Federation owner. */
export interface NeedDeclarationPort {
  declare(input: {
    readonly origin: ContactNeedOrigin;
    readonly competenceTags: readonly string[];
    readonly reason: string;
    /** §13: the retry-stable admission correlation, carried through to the Federation owner. */
    readonly candidateDigest: string;
    readonly accepted: unknown;
  }): Promise<{ readonly contactNeedId: string }>;
}

/**
 * THE PORTS. Everything here is a READ except `declare` (an existing-owner call) and the authoring seam
 * (§6, which the caller supplies and which owns no canonical capability).
 */
export interface ProjectCollaborationPorts {
  /** The canonical project facts (the basis source) — read through the Work owner. */
  readonly project: {
    facts(): Promise<{ readonly projectId: string; readonly revision: number; readonly digest: string; readonly headCommit: string }>;
  };
  /** §5: observe a blocked task condition. Absent owner ⇒ the capability is honestly unavailable. */
  readonly blockedTask?: { observe(taskId: string): Promise<BlockedTaskObservation | undefined> } | undefined;
  /** §5: observe a failed attempt condition. */
  readonly failedAttempt?: { observe(attemptId: string): Promise<FailedAttemptObservation | undefined> } | undefined;
  /** §11: declare the admitted need through the EXISTING Federation owner. */
  readonly declaration: NeedDeclarationPort;
}
