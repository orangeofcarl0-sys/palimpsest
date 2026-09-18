/**
 * SR-1D R2 §7/§8/§9 — the product application-surface cluster.
 *
 * Owns BOTH the façade interfaces (CollaborationApplicationSurface, CrossProjectApplicationSurface) and the constructor that
 * implements them, from a NARROW input: this module can only see the 3 dependencies it
 * actually reads (collaboration, crossProject, federation). Behaviour is unchanged.
 */

import type { FederationService } from "../../federation/index.js";
import type { CollaborationService } from "../../interaction/collaboration.js";
import type { CollaborationPlanView } from "../../interaction/intent.js";
import type { CollaborationResult } from "../../interaction/result_view.js";
import type { CrossProjectService, CrossProjectDirectoryView, CrossProjectPendingAsk } from "../../interaction/cross_project.js";
import type { CrossProjectCollaborationResult } from "../../interaction/cross_project_result.js";
import { parsePeerMessage } from "../../federation/messages.js";
import type { PeerRef } from "../../federation/peer.js";

/** Exactly the dependencies this cluster reads — nothing else is visible to it (§9). */
export interface ProductSurfaceDeps {
  readonly collaboration?: CollaborationService | undefined;
  readonly crossProject?: CrossProjectService | undefined;
  readonly federation?: FederationService | undefined;
}

/**
 * UX-A §16/§17/§23: ONE-REQUEST LOCAL COLLABORATION.
 *
 * `plan(request)` is READ-ONLY (it profiles, consults the existing advisor and the
 * derived posture/verification availability, and derives a plan view); `run(request)`
 * executes only the EXISTING governed recipe/verification paths. Neither method
 * reaches a store, mints an authority, creates a durable peer/commitment, or revises
 * ProjectIR. The request is a `CollaborationRequest`: `{ task, intent?,
 * taskProfileOverrides?, branchCountHint?, verifierRef?, requestedBy }` — raw recipe
 * ids, plan objects, agent ids, commands, authority flags, `PeerRef`s and
 * `VerificationResult`s are rejected as unknown fields.
 */
export interface CollaborationApplicationSurface {
  plan(request: unknown): Promise<CollaborationPlanView>;
  run(request: unknown): Promise<CollaborationResult>;
}

/**
 * UX-B §28 — ONE-REQUEST CROSS-PROJECT COLLABORATION.
 *
 * The seven §28 members, plus the §22/§38/§39 `acknowledge` product path the audit
 * found missing entirely (SC-7: `FederationService.acknowledge` existed with NO
 * surface, tool or route). Everything else is derived by the service from the
 * EXISTING federation thread + inbox; this face adds no logic, no authority and no
 * second parser beyond the service's own strict ones.
 *
 * §60: the summaries are plain language ("Asked the optics project"); peer ids,
 * thread ids and message ids stay under `details`.
 */
export interface CrossProjectApplicationSurface {
  /** §8/§42: the READ-ONLY project directory. `state` is part of the answer. */
  projects(): Promise<CrossProjectDirectoryView>;
  /** §26: READ-ONLY — the exact outbound packet, nothing hidden, nothing sent. */
  prepareAsk(request: unknown): Promise<CrossProjectCollaborationResult>;
  /** §9/§27/§45: the explicit Ask. The ONLY place this face sends a request. */
  ask(request: unknown): Promise<CrossProjectCollaborationResult>;
  /** §18/§19: READ-ONLY derived state. Never sends, never acknowledges. */
  status(requestId: string): Promise<CrossProjectCollaborationResult>;
  /** §30: authenticated inbound asks addressed to THIS project. */
  pending(): Promise<readonly CrossProjectPendingAsk[]>;
  /** §37/§38: answer one pending Ask on its own thread. */
  respond(requestId: string, answer: unknown): Promise<CrossProjectCollaborationResult>;
  /** §39: surface the valid terminal answer and acknowledge THAT message. */
  receive(requestId: string): Promise<CrossProjectCollaborationResult>;
  /**
   * SC-7: the explicit `acknowledge` product path, per `PeerMessage` (never per
   * id). ACK means "processed/seen" — never agreement, never truth (§76), and it
   * is never called before a response send succeeded (§38).
   */
  acknowledge(message: unknown): Promise<unknown>;
}

export function makeProductSurfaces(deps: ProductSurfaceDeps): { readonly collaboration: CollaborationApplicationSurface | undefined; readonly crossProject: CrossProjectApplicationSurface | undefined } {
    const collaboration: CollaborationApplicationSurface | undefined =
      deps.collaboration === undefined
        ? undefined
        : {
            plan: (request) => deps.collaboration!.plan(request),
            run: (request) => deps.collaboration!.run(request),
          };

    /*
     * UX-B §28/SC-15/SC-7: the cross-project face. Like the collaboration face above
     * it is COMPOSED here and MAPPED onto the returned object below — the G10-AC-R
     * §11 lesson in this file is that a declared-but-unmapped face is a 501 and the
     * product is invisible. `acknowledge` is the SC-7 addition: it strict-parses a
     * caller-supplied `PeerMessage` and hands it to the EXISTING federation service,
     * so "processed" is recorded and nothing else changes (ack ≠ agreement).
     */

    const crossProject: CrossProjectApplicationSurface | undefined =
      deps.crossProject === undefined
        ? undefined
        : {
            projects: () => deps.crossProject!.projects(),
            prepareAsk: (request) => deps.crossProject!.prepareAsk(request),
            ask: (request) => deps.crossProject!.ask(request),
            status: (requestId) => deps.crossProject!.status(requestId),
            pending: () => deps.crossProject!.pending(),
            respond: (requestId, answer) => deps.crossProject!.respond(requestId, answer),
            receive: (requestId) => deps.crossProject!.receive(requestId),
            acknowledge: async (message: unknown) => {
              const federation = deps.federation;
              if (federation === undefined) {
                const error = new Error("the federation surface is not configured for this installation");
                (error as { kind?: string }).kind = "surface_absent";
                throw error;
              }
              // Strict: a caller cannot acknowledge a shape the federation service
              // would not have produced.
              return federation.acknowledge({ message: parsePeerMessage(message) });
            },
          };


  return { collaboration, crossProject };
}
