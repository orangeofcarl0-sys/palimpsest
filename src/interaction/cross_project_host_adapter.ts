/**
 * UX-B §10/§33/§61/SC-21 — HOST adaptation for cross-project work.
 *
 *   AttentionSignal != MessageContent      Resolver output != Authority
 *   Host text != SemanticInstruction       Candidate != Binding
 *
 * Two host seams live here and neither owns semantics:
 *
 * 1. `crossProjectAttentionText(signal)` formats the EXISTING `AttentionSignal`
 *    for a DSH/Pi host. SC-21 is the whole design constraint: the signal carries
 *    `subjects: [{kind:"peer_message", id}]` and NO message content, so the text
 *    can only tell the principal to go and LOOK at the pending cross-project work
 *    through the product tool. Nothing here can embed an ask body even by accident,
 *    because the signal does not have one.
 *
 * 2. `ProjectTargetResolverPort` (§10) — an UNTRUSTED, optional, model-backed
 *    resolver a host may supply. Its output is a CANDIDATE only and is revalidated
 *    against the `ProjectPeerDirectoryPort` by the caller; it grants no authority,
 *    binds no peer and can never cause a send on its own.
 *
 * This module mirrors the style of `src/attention/host_adapter.ts` (a pure
 * formatter plus a structural host port) WITHOUT modifying that file: the
 * attention layer stays the activation owner (§34/§A16).
 */

import type { AttentionSignal } from "../attention/index.js";
import type {
  ProjectPeerDescriptor,
  ProjectPeerDirectoryPort,
  ProjectTargetResolution,
} from "./project_peer_directory.js";
import { descriptorForProject, observeProjectDescriptors } from "./project_peer_directory.js";

/* ------------------------------------------------------------------ *
 * Host text (§61)
 * ------------------------------------------------------------------ */

/** §61 — the inbound-request instruction. No authority, no content, no identity. */
export const CROSS_PROJECT_INBOUND_REQUEST_TEXT =
  "Another project is asking this project a question. Inspect the pending request and answer it using this project's context.";

/** §61 — the inbound-answer instruction. */
export const CROSS_PROJECT_INBOUND_ANSWER_TEXT =
  "A project you asked has replied. Receive the result and surface it to the user.";

export type CrossProjectAttentionRole = "request" | "answer" | "either";

function instructionFor(role: CrossProjectAttentionRole): string {
  if (role === "request") return CROSS_PROJECT_INBOUND_REQUEST_TEXT;
  if (role === "answer") return CROSS_PROJECT_INBOUND_ANSWER_TEXT;
  // The signal genuinely cannot say which it is (no message content, SC-21), so the
  // honest default tells the principal to inspect BOTH directions.
  return `${CROSS_PROJECT_INBOUND_REQUEST_TEXT} ${CROSS_PROJECT_INBOUND_ANSWER_TEXT}`;
}

/**
 * §33/SC-21: format the EXISTING attention signal for a cross-project host.
 *
 * It reads ONLY the signal's routing metadata (`peer`, `threadId`, `subjects`) and
 * never a message body — there is none on the signal, and this function imports no
 * store, so it could not fetch one. `role` is supplied by the HOST when the host
 * already knows which direction it is handling (e.g. it called `pending()` first);
 * the default covers both directions honestly.
 */
export function crossProjectAttentionText(signal: AttentionSignal, role: CrossProjectAttentionRole = "either"): string {
  const where = signal.threadId === undefined ? "" : ` (thread ${signal.threadId})`;
  const subjects = signal.subjects.map((subject) => subject.id).join(", ");
  return (
    `[palimpsest cross-project] ${instructionFor(role)} ` +
    `Signalled by "${signal.peer.peerId}"${where}${subjects === "" ? "" : ` about ${subjects}`}. ` +
    'Use the palimpsest_cross_project tool: action "pending" for a request addressed to this project, ' +
    'or action "status"/"receive" for an answer to a question this project asked.'
  );
}

/** §61: the two host texts, addressable individually by a host that knows the role. */
export const CROSS_PROJECT_HOST_TEXTS: Readonly<Record<"request" | "answer", string>> = Object.freeze({
  request: CROSS_PROJECT_INBOUND_REQUEST_TEXT,
  answer: CROSS_PROJECT_INBOUND_ANSWER_TEXT,
});

/* ------------------------------------------------------------------ *
 * Optional host target resolver (§10)
 * ------------------------------------------------------------------ */

/**
 * §10: an UNTRUSTED candidate producer. Feed it a user sentence; it MAY propose a
 * project id (and, at most, the peer it believed was bound). It cannot select a
 * peer, cannot bind one, and its proposal is revalidated below against the
 * directory — a resolver that invents a project produces `TARGET_UNKNOWN`, not a
 * send.
 */
export interface ProjectTargetResolverPort {
  readonly resolverId: string;
  resolveTarget(input: {
    readonly request: string;
    readonly candidates: readonly ProjectPeerDescriptor[];
  }): Promise<{ readonly projectId: string; readonly peerId?: string | undefined } | undefined>;
}

/** The honest null object: it never proposes anything. */
export const nullProjectTargetResolver: ProjectTargetResolverPort = Object.freeze({
  resolverId: "null",
  resolveTarget: async () => undefined,
});

/** A candidate revalidated against the directory: the directory's binding wins. */
export interface RevalidatedTargetCandidate {
  readonly descriptor: ProjectPeerDescriptor;
  /** TRUE iff the resolver proposed a peer id that is NOT the directory's binding. */
  readonly proposedPeerDiffers: boolean;
  readonly detail: string;
}

/**
 * §10: revalidate a resolver proposal under a FRESH directory observation. The
 * returned descriptor is ALWAYS the directory's own binding; a resolver-proposed
 * peer id is used only to detect that the resolver's belief is stale, never to
 * address a message.
 */
export async function revalidateTargetCandidate(
  directory: ProjectPeerDirectoryPort,
  proposed: { readonly projectId: string; readonly peerId?: string | undefined },
): Promise<RevalidatedTargetCandidate | undefined> {
  const observed = await observeProjectDescriptors(directory);
  if (observed.state !== "known") return undefined;
  const descriptor = descriptorForProject(observed.value, proposed.projectId);
  if (descriptor === undefined) return undefined;
  const proposedPeerDiffers = proposed.peerId !== undefined && proposed.peerId !== descriptor.peer.peerId;
  return Object.freeze({
    descriptor,
    proposedPeerDiffers,
    detail: proposedPeerDiffers
      ? `the resolver proposed peer "${String(proposed.peerId)}" for project "${descriptor.projectId}", but the directory binds it to "${descriptor.peer.peerId}"`
      : `the resolver's candidate "${descriptor.projectId}" matches this deployment's directory binding`,
  });
}

/**
 * §10: resolve a user sentence through an untrusted resolver and revalidate. The
 * output vocabulary is the SAME five §9 outcomes, so a resolver can never widen
 * what a caller may do.
 */
export async function resolveProjectTargetWithResolver(input: {
  readonly directory: ProjectPeerDirectoryPort;
  readonly resolver: ProjectTargetResolverPort;
  readonly request: string;
}): Promise<ProjectTargetResolution> {
  const directoryObserved = await observeProjectDescriptors(input.directory);
  if (directoryObserved.state === "unknown") {
    return Object.freeze({
      status: "DIRECTORY_UNKNOWN" as const,
      target: input.request,
      candidates: Object.freeze([] as string[]),
      detail: `project directory observation is unknown: ${directoryObserved.detail} (unknown is never an empty directory)`,
    });
  }
  if (directoryObserved.state === "error") {
    return Object.freeze({
      status: "DIRECTORY_ERROR" as const,
      target: input.request,
      candidates: Object.freeze([] as string[]),
      detail: directoryObserved.detail,
    });
  }
  const proposal = await input.resolver.resolveTarget({
    request: input.request,
    candidates: directoryObserved.value,
  });
  if (proposal === undefined) {
    return Object.freeze({
      status: "TARGET_AMBIGUOUS" as const,
      target: input.request,
      candidates: Object.freeze(
        [...new Set(directoryObserved.value.map((descriptor) => descriptor.displayName ?? descriptor.projectId))].sort(),
      ),
      detail:
        "the configured project resolver could not name a project for this request; several projects exist, so nothing was sent (a guess is never a target)",
    });
  }
  const revalidated = await revalidateTargetCandidate(input.directory, proposal);
  if (revalidated === undefined) {
    return Object.freeze({
      status: "TARGET_UNKNOWN" as const,
      target: input.request,
      candidates: Object.freeze([] as string[]),
      detail: `the resolver proposed project "${proposal.projectId}", which this deployment's directory does not bind (resolver output grants no authority)`,
    });
  }
  return Object.freeze({
    status: "RESOLVED" as const,
    target: input.request,
    descriptor: revalidated.descriptor,
    candidates: Object.freeze([revalidated.descriptor.displayName ?? revalidated.descriptor.projectId]),
    detail: revalidated.detail,
  });
}
