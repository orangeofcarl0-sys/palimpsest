/**
 * UX-B §19/§59/§60 — the user-facing projection of a cross-project Ask.
 *
 *   Result != Evidence   Answer != Truth   Ack != Agreement
 *
 * §59: the user sees a project NAME, a state, an answer and a plain summary. Peer
 * ids, thread ids and message ids live under `details` — they are diagnostics, not
 * primary UX. §60: the copy is what a person would say ("Asked the optics project",
 * "Waiting for its response", "The optics project replied"), never raw federation
 * terminology ("peer", "thread", "federation message", "ack", "transport").
 *
 * This module owns no store and no authority: every field is DERIVED by the caller
 * from the existing federation views (this installation's own outbound thread plus
 * its authenticated inbox). There is deliberately no request store (§18).
 */

/* ------------------------------------------------------------------ *
 * Derived states (§19)
 * ------------------------------------------------------------------ */

/**
 * The ONE status vocabulary, shared by every method of the service so a caller
 * never has to reconcile two enums:
 *
 *  - target resolution (§9): `RESOLVED | TARGET_UNKNOWN | TARGET_AMBIGUOUS |
 *    DIRECTORY_UNKNOWN | DIRECTORY_ERROR`;
 *  - preparation (§26): `PREPARED`;
 *  - a stale project↔peer binding re-checked immediately before sending (§45):
 *    `STALE_TARGET_BINDING`;
 *  - the derived request state (§19), never stored: `SENT | WAITING | ANSWERED |
 *    PARTIAL | DECLINED | REMOTE_ERROR | CONFLICT`.
 *
 * §19: "no response" means `WAITING`, NOT failure.
 */
export const CROSS_PROJECT_STATUSES = [
  "RESOLVED",
  "TARGET_UNKNOWN",
  "TARGET_AMBIGUOUS",
  "DIRECTORY_UNKNOWN",
  "DIRECTORY_ERROR",
  "STALE_TARGET_BINDING",
  "PREPARED",
  "SENT",
  "WAITING",
  "ANSWERED",
  "PARTIAL",
  "DECLINED",
  "REMOTE_ERROR",
  "CONFLICT",
] as const;
export type CrossProjectStatus = (typeof CROSS_PROJECT_STATUSES)[number];

/** §70 UXB-N06…N09/N12…N15: the refusals a caller must be able to branch on. */
export const CROSS_PROJECT_ASK_REFUSALS = [
  "SOURCE_BINDING_MISMATCH",
  "TARGET_BINDING_MISMATCH",
] as const;
export type CrossProjectAskRefusal = (typeof CROSS_PROJECT_ASK_REFUSALS)[number];

/** The terminal states an ANSWER can put a request in. */
export const CROSS_PROJECT_TERMINAL_STATUSES = ["ANSWERED", "PARTIAL", "DECLINED", "REMOTE_ERROR", "CONFLICT"] as const;

export function isTerminalCrossProjectStatus(status: CrossProjectStatus): boolean {
  return (CROSS_PROJECT_TERMINAL_STATUSES as readonly string[]).includes(status);
}

/* ------------------------------------------------------------------ *
 * Result (§59)
 * ------------------------------------------------------------------ */

/** §59: ids and refs, deliberately OUT of the primary UX. */
export interface CrossProjectResultDetails {
  readonly requestId: string;
  /** The other side's `PeerRef` id — a routing detail, never project identity (§11/§12). */
  readonly peerId: string;
  readonly threadId: string;
  /** The durable message ids this state was derived from, sorted and deduped. */
  readonly messageRefs: readonly string[];
}

/**
 * §26: the EXACT outbound packet — every field that will be (or was) put in the
 * `PeerMessage.body`, plus the routing the transport adds. There are no hidden
 * fields: the task and (only when explicitly supplied) the context text are the
 * whole content, so a caller can show the user precisely what leaves the project.
 */
export interface CrossProjectOutboundPacket {
  readonly requestId: string;
  readonly threadId: string;
  readonly targetProjectId: string;
  /** Routing metadata (§11): a detail, never project identity. */
  readonly targetPeerId: string;
  readonly task: string;
  readonly contextText?: string | undefined;
  /** The serialized body, byte for byte. */
  readonly body: string;
}

export interface CrossProjectCollaborationResult {
  /** §59/§60: the OTHER PROJECT's name as the user knows it. */
  readonly targetProject: string;
  readonly status: CrossProjectStatus;
  /** Present only for `ANSWERED`/`PARTIAL`. Ordinary peer communication, never Evidence. */
  readonly answer?: string | undefined;
  /** Who replied, by project name. Empty until an answer was accepted. */
  readonly responder: string;
  readonly summary: string;
  readonly warnings: readonly string[];
  readonly details: CrossProjectResultDetails;
  /** §46: candidate project names for `TARGET_UNKNOWN`/`TARGET_AMBIGUOUS`. */
  readonly candidates?: readonly string[] | undefined;
  /** §26: the exact packet, present for `PREPARED` and for a sent `RESOLVED` ask. */
  readonly outbound?: CrossProjectOutboundPacket | undefined;
  readonly at: string;
}

/* ------------------------------------------------------------------ *
 * Copy (§60)
 * ------------------------------------------------------------------ */

const ARTICLE_SAFE = /^[A-Za-z0-9]/u;

/** "the optics project" — a readable name for a project id/display name. */
/**
 * §60 (review M4): a user-facing phrase for a project name. A `displayName` that is
 * ALREADY a phrase ("the detector project") is used verbatim — appending the article and
 * the noun produced "the the detector project project", which the dogfood printed into a
 * real summary. Only a bare name/id gets wrapped.
 */
export function projectPhrase(name: string): string {
  if (!ARTICLE_SAFE.test(name)) return name;
  if (/(^|\s)(project|team|group|system|library|service|app|platform)$/iu.test(name.trim())) return name;
  return `the ${name} project`;
}

/** §60: the three user-facing sentences. Never federation terminology. */
export const CROSS_PROJECT_COPY = Object.freeze({
  asked: (name: string): string => `Asked ${projectPhrase(name)}.`,
  waiting: (name: string): string => `Waiting for its response from ${projectPhrase(name)}.`,
  replied: (name: string): string => `${projectPhrase(name).charAt(0).toUpperCase()}${projectPhrase(name).slice(1)} replied.`,
  declined: (name: string): string => `${projectPhrase(name).charAt(0).toUpperCase()}${projectPhrase(name).slice(1)} declined to answer.`,
  partial: (name: string): string => `${projectPhrase(name).charAt(0).toUpperCase()}${projectPhrase(name).slice(1)} replied with a partial answer.`,
  remoteError: (name: string): string => `${projectPhrase(name).charAt(0).toUpperCase()}${projectPhrase(name).slice(1)} could not answer.`,
  conflict: (name: string): string =>
    `Conflicting answers arrived from ${projectPhrase(name)}; nothing was chosen for you.`,
  preparing: (name: string): string => `Ready to ask ${projectPhrase(name)}.`,
  unknownTarget: (target: string): string => `No project here is named "${target}".`,
  ambiguousTarget: (target: string): string => `More than one project is named "${target}".`,
  directoryUnknown: (): string => "This deployment's project directory could not be read.",
  directoryError: (): string => "This deployment's project directory failed to answer.",
  stale: (name: string): string => `${projectPhrase(name).charAt(0).toUpperCase()}${projectPhrase(name).slice(1)} is no longer reachable at the address this deployment had on file, so nothing was sent.`,
});

/**
 * §60: the plain-language sentence for a derived state. It is composed from the
 * state ONLY — there is no path here that could echo a raw id into the primary UX.
 */
export function crossProjectSummaryOf(input: {
  readonly status: CrossProjectStatus;
  readonly targetProject: string;
  readonly target?: string | undefined;
}): string {
  const name = input.targetProject;
  switch (input.status) {
    case "RESOLVED":
      return CROSS_PROJECT_COPY.asked(name);
    case "PREPARED":
      return CROSS_PROJECT_COPY.preparing(name);
    case "SENT":
    case "WAITING":
      return CROSS_PROJECT_COPY.waiting(name);
    case "ANSWERED":
      return CROSS_PROJECT_COPY.replied(name);
    case "PARTIAL":
      return CROSS_PROJECT_COPY.partial(name);
    case "DECLINED":
      return CROSS_PROJECT_COPY.declined(name);
    case "REMOTE_ERROR":
      return CROSS_PROJECT_COPY.remoteError(name);
    case "CONFLICT":
      return CROSS_PROJECT_COPY.conflict(name);
    case "TARGET_UNKNOWN":
      return CROSS_PROJECT_COPY.unknownTarget(input.target ?? name);
    case "TARGET_AMBIGUOUS":
      return CROSS_PROJECT_COPY.ambiguousTarget(input.target ?? name);
    case "DIRECTORY_UNKNOWN":
      return CROSS_PROJECT_COPY.directoryUnknown();
    case "DIRECTORY_ERROR":
      return CROSS_PROJECT_COPY.directoryError();
    case "STALE_TARGET_BINDING":
      return CROSS_PROJECT_COPY.stale(name);
  }
}

/**
 * The `projectPhrase(...)` name a result should use for a resolved descriptor that
 * carries no display name: fall back to the project id. `PeerRef` is deliberately
 * NOT a fallback — §11 forbids displaying peer identity as project identity.
 */
export function projectNameOf(descriptor: { readonly displayName?: string | undefined; readonly projectId: string }): string {
  return descriptor.displayName ?? descriptor.projectId;
}

/** Freeze a result; the ids are sorted/deduped here so every caller sees one order. */
export function crossProjectResultOf(input: {
  readonly targetProject: string;
  readonly status: CrossProjectStatus;
  readonly answer?: string | undefined;
  readonly responder?: string | undefined;
  readonly summary?: string | undefined;
  readonly warnings?: readonly string[] | undefined;
  readonly details: {
    readonly requestId: string;
    readonly peerId: string;
    readonly threadId: string;
    readonly messageRefs: readonly string[];
  };
  readonly candidates?: readonly string[] | undefined;
  readonly at: string;
  readonly target?: string | undefined;
  readonly outbound?: CrossProjectOutboundPacket | undefined;
}): CrossProjectCollaborationResult {
  const refs = [...new Set(input.details.messageRefs)].sort();
  return Object.freeze({
    targetProject: input.targetProject,
    status: input.status,
    ...(input.answer === undefined ? {} : { answer: input.answer }),
    responder: input.responder ?? "",
    summary: input.summary ?? crossProjectSummaryOf({ status: input.status, targetProject: input.targetProject, ...(input.target === undefined ? {} : { target: input.target }) }),
    warnings: Object.freeze([...(input.warnings ?? [])]),
    details: Object.freeze({
      requestId: input.details.requestId,
      peerId: input.details.peerId,
      threadId: input.details.threadId,
      messageRefs: Object.freeze(refs),
    }),
    ...(input.candidates === undefined ? {} : { candidates: Object.freeze([...input.candidates]) }),
    ...(input.outbound === undefined ? {} : { outbound: Object.freeze({ ...input.outbound }) }),
    at: input.at,
  });
}
