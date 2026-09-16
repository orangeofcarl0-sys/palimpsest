/**
 * UX-B §2/§6/§9/§16–§21/§26–§45/§52–§58 — ONE-REQUEST CROSS-PROJECT COLLABORATION.
 *
 *   ProjectId != PeerRef                 ProjectPeerBinding != Authority/Ownership
 *   Ask != Commitment != Assignment      Answer != Evidence != Truth != Decision
 *   Delivery != Receipt != Agreement     Ack != Agreement
 *   CrossProjectRequest != RemoteAuthority
 *   OneRequest != ExactlyOnce            NoResponse != Failure
 *
 * This service is a THIN, STATELESS product composition ABOVE the existing
 * federation. It owns NO store (§18 — no `CrossProjectRequestStore`, no
 * `ProjectMessageStore`, no `RemoteResultStore`), mints NO new coordination event,
 * NO new transport operation kind and NO new agent identity, and schedules nothing.
 * The ONLY thing it puts on the wire is a strict `PROJECT_ASK` / `PROJECT_ANSWER`
 * envelope inside an ordinary `PeerMessage.body`, so federation still sees a plain
 * `peer_message` and the durable transport still owns mechanical delivery.
 *
 * Every piece of request state is DERIVED per call from two EXISTING views
 * (audit Q8/SC-6: neither can contain both directions by construction):
 *
 *   `thread(threadId)`          — THIS installation's own OUTBOUND messages
 *   `inbox(localPeer)`          — the inbound `received` / `unverified` / acks
 *
 * §52/§53 — how the REMOTE principal answers, with no new remote protocol:
 *   - directly, by supplying an authored answer (`respond(requestId, {status, answer})`), or
 *   - by asking the EXISTING `application.collaboration.run(...)` to do the work
 *     (`respond(requestId, {compose: {task, intent}})`), which is the remote
 *     project's own LOCAL multi-agent collaboration. Nothing here re-implements
 *     profiling, planning, execution or verification: the call goes straight to
 *     the composed collaboration service.
 *
 * §31/§44/§57 — HOSTILE FIELDS CANNOT WIDEN SCOPE:
 *   A `PROJECT_ASK` claiming `sourceProjectId = A` never causes this installation
 *   (project B) to touch A's scope. There is no code path in this file that passes
 *   a caller- or peer-supplied project id to `workspace.journal(...)`,
 *   `workspace.assets(...)` or `externalAssets.resolve(...)` — and there could not
 *   be one by accident, because no federation call site in the tree accepts a
 *   project/workspace scope at all (audit SC-17). Every local read this service
 *   performs is bound to `deps.projectId` (this installation's OWN project) or to
 *   `deps.localPeer` (this installation's OWN inbox). Inbound metadata is used ONLY
 *   for the binding checks below: a sender whose authenticated `PeerRef` does not
 *   bind to the claimed source project is `SOURCE_BINDING_MISMATCH` with no
 *   processing, and an envelope whose `targetProjectId` is not this project is
 *   `TARGET_BINDING_MISMATCH` with no local collaboration run.
 *
 * §20/SC-4 — what "authenticated" means here, stated plainly:
 *   An inbound message is "authenticated" only because the LOCAL TRANSPORT ADAPTER
 *   asserted a `PeerRef` for it from its OWN trusted ledger (`InboundPeerEnvelope.
 *   authenticatedPeer`; the durable pump writes `envelope.from`, which the sending
 *   installation wrote into a local trusted ledger). The kernel cannot prove more
 *   than that, and this module never claims cryptography. The REAL defence for an
 *   Ask is the DIRECTORY BINDING implemented here: an answer is accepted only when
 *   the asserted sender is the exact peer the request was addressed to AND the
 *   directory binds that peer to the responder project it names.
 */

import { canonicalDigest } from "../schema/canonical.js";
import { isStableIdentifier } from "../schema/identifier.js";
import type { PeerRef } from "../federation/peer.js";
import type { AckRecordedPayload, PeerMessage } from "../federation/messages.js";
import type { ProjectPeerDescriptor, ProjectPeerDirectoryPort } from "./project_peer_directory.js";
import {
  descriptorForPeer,
  descriptorForProject,
  observeProjectDescriptors,
  resolveProjectTarget,
  type ProjectTarget,
  type ProjectTargetResolution,
} from "./project_peer_directory.js";
import { resolveProjectTargetWithResolver, type ProjectTargetResolverPort } from "./cross_project_host_adapter.js";
import type {
  CrossProjectMessageEnvelope,
  ProjectAnswerEnvelope,
  ProjectAnswerStatus,
  ProjectAskEnvelope,
} from "./cross_project_protocol.js";
import {
  CROSS_PROJECT_MAX_ANSWER_CHARS,
  CROSS_PROJECT_MAX_CONTEXT_TEXT_CHARS,
  CROSS_PROJECT_MAX_DETAIL_CHARS,
  CROSS_PROJECT_MAX_TASK_CHARS,
  PROJECT_ANSWER_STATUSES,
  allocateCrossProjectRequestId,
  materializeProjectAnswerEnvelope,
  materializeProjectAskEnvelope,
  parseCrossProjectBody,
  projectAnswerContentDigest,
  serializeCrossProjectEnvelope,
  threadIdForRequest,
} from "./cross_project_protocol.js";
import type { CrossProjectCollaborationResult, CrossProjectStatus } from "./cross_project_result.js";
import { crossProjectResultOf, projectNameOf } from "./cross_project_result.js";
import { COLLABORATION_INTENTS, type CollaborationIntent } from "./intent.js";

/* ------------------------------------------------------------------ *
 * Typed refusal
 * ------------------------------------------------------------------ */

export const CROSS_PROJECT_ERROR_REASONS = [
  "invalid_request",
  "oversized_body",
  "not_configured",
  "unknown_request",
  "already_answered",
  "unauthenticated_request",
  "source_binding_mismatch",
  "target_binding_mismatch",
  "directory_unavailable",
  "refused_by_domain_gate",
] as const;
export type CrossProjectErrorReason = (typeof CROSS_PROJECT_ERROR_REASONS)[number];

export class CrossProjectError extends Error {
  constructor(
    readonly reason: CrossProjectErrorReason,
    message: string,
  ) {
    super(message);
    this.name = "CrossProjectError";
  }

  /** The name the shared HTTP error mapper reads (`kind`). */
  get kind(): CrossProjectErrorReason {
    return this.reason;
  }
}

function fail(reason: CrossProjectErrorReason, message: string): never {
  throw new CrossProjectError(reason, message);
}

/* ------------------------------------------------------------------ *
 * Request (§6)
 * ------------------------------------------------------------------ */

/**
 * §6: V1 has exactly ONE intent — `ASK_PROJECT`. There is deliberately no
 * DELEGATE/ASSIGN/ACCEPT_REMOTE_WORK/PROJECT_COMMITMENT field, and an attempt to
 * smuggle one is refused as an unknown field rather than ignored (§22/§23: a
 * question must never be inflated into an obligation).
 */
export interface CrossProjectAskRequest {
  /** §7/§9: a project NAME (projectId | displayName | alias), NEVER a `PeerRef`. */
  readonly target: ProjectTarget;
  readonly task: string;
  /** §25: copied EXACTLY when supplied. Never summarized, never auto-filled. */
  readonly contextText?: string | undefined;
  readonly requestedBy: string;
}

const REQUEST_KEYS = ["target", "task", "contextText", "requestedBy"] as const;

export function parseCrossProjectAskRequest(raw: unknown, what = "CrossProjectAskRequest"): CrossProjectAskRequest {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    fail("invalid_request", `${what} must be an object`);
  }
  const prototype: unknown = Object.getPrototypeOf(raw);
  if (prototype !== Object.prototype && prototype !== null) {
    fail("invalid_request", `${what} must be a plain object`);
  }
  const object = raw as Record<string, unknown>;
  for (const key of Object.getOwnPropertyNames(object)) {
    if (!(REQUEST_KEYS as readonly string[]).includes(key)) {
      fail("invalid_request", `${what}: unknown field "${key}"`);
    }
  }
  const target = object.target;
  if (typeof target !== "string" || target.trim() === "") {
    // An object here is the exact `PeerRef`-smuggling attempt §7/§12 forbid.
    fail("invalid_request", `${what}.target must be a non-empty project name (a project id, display name or alias — never a peer reference)`);
  }
  const task = object.task;
  if (typeof task !== "string" || task.trim() === "") {
    fail("invalid_request", `${what}.task must be a non-empty string`);
  }
  if ([...task].length > CROSS_PROJECT_MAX_TASK_CHARS) {
    fail(
      "oversized_body",
      `${what}.task exceeds the ${CROSS_PROJECT_MAX_TASK_CHARS}-character product maximum; it is REFUSED, never truncated`,
    );
  }
  const requestedBy = object.requestedBy;
  if (typeof requestedBy !== "string" || requestedBy.trim() === "") {
    fail("invalid_request", `${what}.requestedBy must be a non-empty string`);
  }
  let contextText: string | undefined;
  if (object.contextText !== undefined) {
    const value = object.contextText;
    if (typeof value !== "string" || value.trim() === "") {
      fail("invalid_request", `${what}.contextText must be a non-empty string when present`);
    }
    if ([...value].length > CROSS_PROJECT_MAX_CONTEXT_TEXT_CHARS) {
      fail(
        "oversized_body",
        `${what}.contextText exceeds the ${CROSS_PROJECT_MAX_CONTEXT_TEXT_CHARS}-character product maximum; it is REFUSED, never truncated`,
      );
    }
    contextText = value;
  }
  return Object.freeze({
    target,
    task,
    ...(contextText === undefined ? {} : { contextText }),
    requestedBy,
  });
}

/* ------------------------------------------------------------------ *
 * Answer draft (§37/§52)
 * ------------------------------------------------------------------ */

/**
 * What the REMOTE principal decided to answer. The caller cannot choose `to`, the
 * thread, or the responder project — those are derived from the authenticated
 * request (§37), so the only freedom here is the CONTENT of the answer.
 */
export interface CrossProjectAnswerDraft {
  /** §15: default `ANSWERED`. Never supplied together with `compose`. */
  readonly status?: ProjectAnswerStatus | undefined;
  readonly answer?: string | undefined;
  readonly detail?: string | undefined;
  /**
   * §52: compose the answer by running THIS project's existing local collaboration
   * (`application.collaboration.run`). The service maps that result to an answer
   * envelope; it never re-implements profiling or planning.
   */
  readonly compose?: { readonly task?: string | undefined; readonly intent?: CollaborationIntent | undefined } | undefined;
}

const DRAFT_KEYS = ["status", "answer", "detail", "compose"] as const;
const COMPOSE_KEYS = ["task", "intent"] as const;

export function parseCrossProjectAnswerDraft(raw: unknown, what = "CrossProjectAnswerDraft"): CrossProjectAnswerDraft {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    fail("invalid_request", `${what} must be an object`);
  }
  const object = raw as Record<string, unknown>;
  for (const key of Object.getOwnPropertyNames(object)) {
    if (!(DRAFT_KEYS as readonly string[]).includes(key)) {
      fail("invalid_request", `${what}: unknown field "${key}"`);
    }
  }
  let status: ProjectAnswerStatus | undefined;
  if (object.status !== undefined) {
    const value = object.status;
    if (typeof value !== "string" || !(PROJECT_ANSWER_STATUSES as readonly string[]).includes(value)) {
      fail("invalid_request", `${what}.status must be one of ${PROJECT_ANSWER_STATUSES.join(", ")}`);
    }
    status = value as ProjectAnswerStatus;
  }
  const bounded = (value: unknown, max: number, label: string): string => {
    if (typeof value !== "string" || value.trim() === "") {
      fail("invalid_request", `${what}.${label} must be a non-empty string`);
    }
    if ([...value].length > max) {
      fail("oversized_body", `${what}.${label} exceeds the ${max}-character product maximum; it is REFUSED, never truncated`);
    }
    return value;
  };
  const answer = object.answer === undefined ? undefined : bounded(object.answer, CROSS_PROJECT_MAX_ANSWER_CHARS, "answer");
  const detail = object.detail === undefined ? undefined : bounded(object.detail, CROSS_PROJECT_MAX_DETAIL_CHARS, "detail");
  let compose: CrossProjectAnswerDraft["compose"];
  if (object.compose !== undefined) {
    if (typeof object.compose !== "object" || object.compose === null || Array.isArray(object.compose)) {
      fail("invalid_request", `${what}.compose must be an object`);
    }
    const inner = object.compose as Record<string, unknown>;
    for (const key of Object.getOwnPropertyNames(inner)) {
      if (!(COMPOSE_KEYS as readonly string[]).includes(key)) {
        fail("invalid_request", `${what}.compose: unknown field "${key}"`);
      }
    }
    let task: string | undefined;
    if (inner.task !== undefined) task = bounded(inner.task, CROSS_PROJECT_MAX_TASK_CHARS, "compose.task");
    let intent: CollaborationIntent | undefined;
    if (inner.intent !== undefined) {
      const value = inner.intent;
      if (typeof value !== "string" || !(COLLABORATION_INTENTS as readonly string[]).includes(value)) {
        fail("invalid_request", `${what}.compose.intent must be one of ${COLLABORATION_INTENTS.join(", ")}`);
      }
      intent = value as CollaborationIntent;
    }
    compose = Object.freeze({ ...(task === undefined ? {} : { task }), ...(intent === undefined ? {} : { intent }) });
  }
  if (compose !== undefined) {
    if (status !== undefined || answer !== undefined) {
      fail("invalid_request", `${what}: "compose" derives the status and the answer text; supply it alone`);
    }
  } else {
    const effective = status ?? "ANSWERED";
    if (effective === "ANSWERED" && answer === undefined) {
      fail("invalid_request", `${what}: an "ANSWERED" draft must carry the answer text`);
    }
    if (effective !== "ANSWERED" && detail === undefined) {
      fail("invalid_request", `${what}: a "${effective}" draft must carry a detail explaining it`);
    }
    if ((effective === "DECLINED" || effective === "ERROR") && answer !== undefined) {
      fail("invalid_request", `${what}: a "${effective}" draft must not carry answer text`);
    }
  }
  return Object.freeze({
    ...(status === undefined ? {} : { status }),
    ...(answer === undefined ? {} : { answer }),
    ...(detail === undefined ? {} : { detail }),
    ...(compose === undefined ? {} : { compose }),
  });
}

/* ------------------------------------------------------------------ *
 * Dependencies + surface (§28)
 * ------------------------------------------------------------------ */

export interface CrossProjectThreadView {
  readonly messages: readonly PeerMessage[];
  readonly deliveredMessageIds: readonly string[];
  readonly ackedMessageIds: readonly string[];
}

export interface CrossProjectInboxView {
  readonly received: readonly PeerMessage[];
  readonly unverified: readonly PeerMessage[];
  readonly acks: readonly AckRecordedPayload[];
}

/**
 * The EXISTING federation service, seen through the four ports UX-B needs. The
 * real `FederationService` satisfies this structurally — nothing is wrapped or
 * re-implemented.
 */
export interface CrossProjectFederationPort {
  sendMessage(input: {
    readonly to: PeerRef;
    readonly threadId: string;
    readonly body: string;
  }): Promise<{ readonly message: PeerMessage; readonly delivered: boolean }>;
  thread(threadId: string): Promise<CrossProjectThreadView>;
  inbox(peer: PeerRef): Promise<CrossProjectInboxView>;
  acknowledge(input: { readonly message: PeerMessage }): Promise<unknown>;
}

export interface CrossProjectDeps {
  /** THIS installation's project (§12/§31 — the only scope any local read uses). */
  readonly projectId: string;
  /** THIS installation's configured local peer (`inbox(localPeer)`). */
  readonly localPeer: PeerRef;
  readonly clock: () => string;
  /** §7/§8: the read-only deployment-owned project↔peer directory. */
  readonly directory: ProjectPeerDirectoryPort;
  readonly federation: CrossProjectFederationPort;
  /**
   * §52: the EXISTING one-request local collaboration service. Absent ⇒ a
   * `compose` answer is refused (`not_configured`) rather than improvised.
   */
  readonly collaboration?: { run(request: unknown): Promise<unknown> } | undefined;
  /** §10: an optional UNTRUSTED host resolver, revalidated against the directory. */
  readonly targetResolver?: ProjectTargetResolverPort | undefined;
  /**
   * An optional deployment gate for ANSWERING a remote Ask. Absent ⇒ this
   * deployment answers whenever the directory binding checks pass. It grants no
   * authority and can only REFUSE; it can never author an answer.
   */
  readonly domainGate?: (() => Promise<{ readonly admitted: boolean; readonly detail: string }>) | undefined;
}

/** §28: exactly the composed product surface. No raw federation store access. */
export interface CrossProjectService {
  projects(): Promise<CrossProjectDirectoryView>;
  /** §26: READ-ONLY preview of the exact outbound packet. Sends nothing. */
  prepareAsk(request: unknown): Promise<CrossProjectCollaborationResult>;
  ask(request: unknown): Promise<CrossProjectCollaborationResult>;
  /** §18/§19: READ-ONLY derived state. Never acknowledges, never sends. */
  status(requestId: string): Promise<CrossProjectCollaborationResult>;
  /** §30: the authenticated inbound asks addressed to THIS project. */
  pending(): Promise<readonly CrossProjectPendingAsk[]>;
  /** §37/§38: answer one pending Ask on its own thread. */
  respond(requestId: string, answer: unknown): Promise<CrossProjectCollaborationResult>;
  /** §39: surface the valid terminal answer and acknowledge THAT message. */
  receive(requestId: string): Promise<CrossProjectCollaborationResult>;
}

/* ------------------------------------------------------------------ *
 * Derived views
 * ------------------------------------------------------------------ */

export interface CrossProjectDirectoryEntry {
  readonly projectId: string;
  readonly displayName?: string | undefined;
  readonly aliases: readonly string[];
  /** Routing metadata (§11): an advanced caller may need it; a user never should. */
  readonly peerId: string;
  readonly competenceTags: readonly string[];
}

/** §8: `state` is part of the contract, so "unknown" can never read as "empty". */
export interface CrossProjectDirectoryView {
  readonly state: "known" | "unknown" | "error";
  readonly detail?: string | undefined;
  readonly projects: readonly CrossProjectDirectoryEntry[];
}

export interface CrossProjectPendingAsk {
  readonly requestId: string;
  readonly sourceProjectId: string;
  readonly sourceProject: string;
  readonly sourcePeerId: string;
  readonly targetProjectId: string;
  readonly task: string;
  readonly contextText?: string | undefined;
  readonly threadId: string;
  readonly messageId: string;
  readonly at: string;
}

/** §57: why an inbound envelope was NOT accepted as a pending request. */
export const INBOUND_ASK_CLASSIFICATIONS = [
  "PENDING",
  "UNAUTHENTICATED",
  "TARGET_BINDING_MISMATCH",
  "SOURCE_BINDING_MISMATCH",
  "ALREADY_ANSWERED",
] as const;
export type InboundAskClassification = (typeof INBOUND_ASK_CLASSIFICATIONS)[number];

export interface InboundAskClassificationResult {
  readonly status: InboundAskClassification;
  readonly detail: string;
}

/**
 * §30/§44/§54/§57 — the PURE classification of one inbound `PROJECT_ASK`.
 *
 * It is exported because "no processing" must be falsifiable: a test can assert the
 * exact classification AND that `pending()` excluded the request, rather than
 * inferring the cause from an empty list.
 */
export function classifyInboundProjectAsk(input: {
  /** TRUE only for `inbox.received`; `unverified` content is never authenticated (§20). */
  readonly authenticated: boolean;
  readonly localProjectId: string;
  readonly envelope: ProjectAskEnvelope;
  readonly message: PeerMessage;
  readonly descriptors: readonly ProjectPeerDescriptor[];
  /** requestIds THIS local peer has already sent a terminal answer for (§36/§54). */
  readonly answeredRequestIds: readonly string[];
}): InboundAskClassificationResult {
  if (!input.authenticated) {
    return Object.freeze({
      status: "UNAUTHENTICATED" as const,
      detail: "the transport adapter could not assert a sender, so this request can never be acted on (§20)",
    });
  }
  if (input.envelope.targetProjectId !== input.localProjectId) {
    return Object.freeze({
      status: "TARGET_BINDING_MISMATCH" as const,
      // §57: the envelope names another project; no local collaboration may run.
      detail: `the request targets project "${input.envelope.targetProjectId}" but this installation is project "${input.localProjectId}"`,
    });
  }
  const sender = descriptorForPeer(input.descriptors, input.message.from);
  if (sender === undefined) {
    return Object.freeze({
      status: "SOURCE_BINDING_MISMATCH" as const,
      detail: `the authenticated sender "${input.message.from.peerId}" is not bound to any project in this deployment's project directory`,
    });
  }
  if (sender.projectId !== input.envelope.sourceProjectId) {
    return Object.freeze({
      status: "SOURCE_BINDING_MISMATCH" as const,
      detail: `the authenticated sender "${input.message.from.peerId}" is bound to project "${sender.projectId}", not to the claimed source project "${input.envelope.sourceProjectId}"`,
    });
  }
  if (input.answeredRequestIds.includes(input.envelope.requestId)) {
    return Object.freeze({
      status: "ALREADY_ANSWERED" as const,
      detail: `this project already sent a terminal answer for request "${input.envelope.requestId}"; a replayed transport request does not force duplicate cognition (§36)`,
    });
  }
  return Object.freeze({ status: "PENDING" as const, detail: "an authenticated cross-project question addressed to this project" });
}

/* ------------------------------------------------------------------ *
 * Service
 * ------------------------------------------------------------------ */

interface OutboundMessage<E> {
  readonly message: PeerMessage;
  readonly envelope: E;
}

type OutboundAsk = OutboundMessage<ProjectAskEnvelope>;
type OutboundAnswer = OutboundMessage<ProjectAnswerEnvelope>;

interface AcceptedAnswer {
  readonly message: PeerMessage;
  readonly envelope: ProjectAnswerEnvelope;
  readonly contentDigest: string;
  /** The project the directory binds to `message.from` (§20). */
  readonly responderProjectId: string;
  readonly responderName: string;
}

interface InboundAskCandidate {
  readonly message: PeerMessage;
  readonly envelope: ProjectAskEnvelope;
  readonly authenticated: boolean;
  readonly classification: InboundAskClassificationResult;
  readonly sourceName: string;
}

interface DerivedView {
  readonly result: CrossProjectCollaborationResult;
  /** The message carrying the surfaced terminal answer, when there is exactly one content. */
  readonly surfaced?: AcceptedAnswer | undefined;
  readonly accepted: readonly AcceptedAnswer[];
  readonly warnings: readonly string[];
}

/**
 * Parse a `PeerMessage.body` into ONE of UX-B's envelopes, or `undefined`.
 *
 * A body that is not JSON, or is JSON of another shape, is simply "not ours". A
 * body that IS ours but malformed (unknown field, bad version, empty text,
 * oversize, an `ANSWERED` with no answer, …) also yields `undefined` here: the
 * strict parser REFUSES it, and a refused packet is never processed — it is not
 * partially read and it never reaches a derivation. `undefined` is therefore the
 * fail-closed outcome at every call site in this module.
 */
function bodyEnvelope(message: PeerMessage): CrossProjectMessageEnvelope | undefined {
  try {
    return parseCrossProjectBody(message.body);
  } catch {
    return undefined;
  }
}

export function makeCrossProjectService(deps: CrossProjectDeps): CrossProjectService {
  if (typeof deps.projectId !== "string" || deps.projectId.trim() === "") {
    fail("not_configured", "a cross-project service requires the project id it acts within");
  }
  if (deps.localPeer === undefined || typeof deps.localPeer.peerId !== "string") {
    fail("not_configured", "a cross-project service requires the configured local peer");
  }
  if (typeof deps.clock !== "function") {
    fail("not_configured", "a cross-project service requires an injected clock");
  }

  /**
   * §16/§45: a MECHANICAL, in-memory id sequence (the same kind of allocator
   * `install.ts` already uses for message ids). It is NOT a store: nothing semantic is
   * kept and nothing survives a restart. It exists so that `prepareAsk` (read-only)
   * and the immediately following `ask` derive the SAME `requestId`, while a repeated
   * Ask inside one process gets a fresh one.
   *
   * HONEST (review M5): because the sequence is in-memory, a RESTART forgets it, so an
   * identical Ask issued after a restart re-derives nonce 0 and therefore the SAME
   * requestId as the pre-restart Ask — the two then correlate as one request. The
   * kernel promises no exactly-once user-request creation (§16), so this is acceptable
   * behaviour and it is NOT a lost request; but the earlier claim that forgetting the
   * map can NEVER merge two requests was false. A caller that must distinguish them
   * supplies distinct task/context text, or a future stage persists a caller nonce.
   */
  const sequenceByContent = new Map<string, number>();

  function contentKeyOf(request: CrossProjectAskRequest, targetProjectId: string): string {
    return canonicalDigest({
      domain: "palimpsest.interaction.cross-project-sequence.v1",
      sourceProjectId: deps.projectId,
      targetProjectId,
      task: request.task,
      contextText: request.contextText ?? null,
      requestedBy: request.requestedBy,
    });
  }

  function nonceFor(contentKey: string): string {
    return String(sequenceByContent.get(contentKey) ?? 0);
  }

  async function observedDirectory(): Promise<
    | { readonly state: "known"; readonly descriptors: readonly ProjectPeerDescriptor[] }
    | { readonly state: "unknown" | "error"; readonly detail: string }
  > {
    const observed = await observeProjectDescriptors(deps.directory);
    if (observed.state === "known") return { state: "known" as const, descriptors: observed.value };
    return { state: observed.state, detail: observed.detail };
  }

  function emptyDetails(): { requestId: string; peerId: string; threadId: string; messageRefs: readonly string[] } {
    // A state that never produced a packet has no ids to report; they are empty
    // strings rather than invented ones.
    return { requestId: "", peerId: "", threadId: "", messageRefs: Object.freeze([] as string[]) };
  }

  async function resolveForRequest(request: CrossProjectAskRequest): Promise<ProjectTargetResolution> {
    const resolver = deps.targetResolver;
    if (resolver !== undefined && resolver.resolverId !== "null") {
      // §10: an untrusted resolver may only PROPOSE; the directory binding decides.
      return resolveProjectTargetWithResolver({ directory: deps.directory, resolver, request: request.target });
    }
    return resolveProjectTarget(deps.directory, request.target);
  }

  function unresolvedResult(resolution: ProjectTargetResolution, request: CrossProjectAskRequest): CrossProjectCollaborationResult {
    const warnings: string[] = [];
    if (resolution.status === "TARGET_UNKNOWN" || resolution.status === "TARGET_AMBIGUOUS") {
      warnings.push(
        resolution.candidates.length === 0
          ? "no candidate project names are available to show"
          : `candidate project names: ${resolution.candidates.join(", ")}`,
      );
    }
    return crossProjectResultOf({
      targetProject: resolution.target,
      target: resolution.target,
      status: resolution.status,
      warnings: [...warnings, resolution.detail],
      details: emptyDetails(),
      ...(resolution.status === "TARGET_UNKNOWN" || resolution.status === "TARGET_AMBIGUOUS"
        ? { candidates: resolution.candidates }
        : {}),
      at: deps.clock(),
    });
  }

  /* ---------------- projects() ---------------- */

  async function projects(): Promise<CrossProjectDirectoryView> {
    // ONE observation, revalidated by the observation helper: a malformed set is an
    // ERROR, never a partially-accepted "known" directory.
    let observed;
    try {
      observed = await observeProjectDescriptors(deps.directory);
    } catch (error) {
      return Object.freeze({
        state: "error" as const,
        detail: error instanceof Error ? error.message : String(error),
        projects: Object.freeze([]),
      });
    }
    if (observed.state !== "known") {
      return Object.freeze({
        state: observed.state,
        detail:
          observed.state === "unknown"
            ? `project directory observation is unknown: ${observed.detail} (unknown is never an empty directory)`
            : observed.detail,
        projects: Object.freeze([]),
      });
    }
    const validated = observed.value;
    return Object.freeze({
      state: "known" as const,
      projects: Object.freeze(
        validated.map((descriptor) =>
          Object.freeze({
            projectId: descriptor.projectId,
            ...(descriptor.displayName === undefined ? {} : { displayName: descriptor.displayName }),
            aliases: descriptor.aliases,
            peerId: descriptor.peer.peerId,
            competenceTags: descriptor.competenceTags,
          }),
        ),
      ),
    });
  }

  /* ---------------- prepareAsk() (§26) ---------------- */

  async function prepareAsk(request: unknown): Promise<CrossProjectCollaborationResult> {
    const parsed = parseCrossProjectAskRequest(request);
    const resolution = await resolveForRequest(parsed);
    if (resolution.status !== "RESOLVED") return unresolvedResult(resolution, parsed);
    const descriptor = resolution.descriptor!;
    const contentKey = contentKeyOf(parsed, descriptor.projectId);
    const requestId = allocateCrossProjectRequestId({
      sourceProjectId: deps.projectId,
      targetProjectId: descriptor.projectId,
      task: parsed.task,
      ...(parsed.contextText === undefined ? {} : { contextText: parsed.contextText }),
      requestedBy: parsed.requestedBy,
      nonce: nonceFor(contentKey),
    });
    const threadId = threadIdForRequest(requestId);
    const envelope = materializeProjectAskEnvelope({
      requestId,
      sourceProjectId: deps.projectId,
      targetProjectId: descriptor.projectId,
      task: parsed.task,
      ...(parsed.contextText === undefined ? {} : { contextText: parsed.contextText }),
    });
    // §63: serializing REFUSES an oversize packet — the preview can never show a
    // packet that would be silently truncated on the wire.
    const body = serializeCrossProjectEnvelope(envelope);
    return crossProjectResultOf({
      targetProject: projectNameOf(descriptor),
      status: "PREPARED",
      responder: "",
      // §26: the EXACT packet as a first-class field — no hidden fields, and nothing
      // a caller would have to parse back out of a warning string.
      outbound: {
        requestId,
        threadId,
        targetProjectId: descriptor.projectId,
        targetPeerId: descriptor.peer.peerId,
        task: parsed.task,
        ...(parsed.contextText === undefined ? {} : { contextText: parsed.contextText }),
        body,
      },
      details: { requestId, peerId: descriptor.peer.peerId, threadId, messageRefs: Object.freeze([] as string[]) },
      at: deps.clock(),
    });
  }

  /* ---------------- ask() (§9/§26/§27/§45) ---------------- */

  async function ask(request: unknown): Promise<CrossProjectCollaborationResult> {
    const parsed = parseCrossProjectAskRequest(request);
    const resolution = await resolveForRequest(parsed);
    if (resolution.status !== "RESOLVED") return unresolvedResult(resolution, parsed);
    const descriptor = resolution.descriptor!;
    const contentKey = contentKeyOf(parsed, descriptor.projectId);
    const requestId = allocateCrossProjectRequestId({
      sourceProjectId: deps.projectId,
      targetProjectId: descriptor.projectId,
      task: parsed.task,
      ...(parsed.contextText === undefined ? {} : { contextText: parsed.contextText }),
      requestedBy: parsed.requestedBy,
      nonce: nonceFor(contentKey),
    });
    const threadId = threadIdForRequest(requestId);
    const envelope = materializeProjectAskEnvelope({
      requestId,
      sourceProjectId: deps.projectId,
      targetProjectId: descriptor.projectId,
      task: parsed.task,
      ...(parsed.contextText === undefined ? {} : { contextText: parsed.contextText }),
    });
    const body = serializeCrossProjectEnvelope(envelope);

    /*
     * §45: re-check the project↔peer binding under a FRESH directory observation
     * IMMEDIATELY before sending. A binding that changed (or vanished) means the
     * address this packet was built for is no longer the directory's answer, so
     * NOTHING is sent.
     */
    const fresh = await observedDirectory();
    if (fresh.state !== "known") {
      return crossProjectResultOf({
        targetProject: projectNameOf(descriptor),
        status: fresh.state === "unknown" ? "DIRECTORY_UNKNOWN" : "DIRECTORY_ERROR",
        warnings: [fresh.detail],
        details: { requestId, peerId: descriptor.peer.peerId, threadId, messageRefs: Object.freeze([] as string[]) },
        at: deps.clock(),
      });
    }
    const rebound = descriptorForProject(fresh.descriptors, descriptor.projectId);
    if (rebound === undefined || rebound.peer.peerId !== descriptor.peer.peerId) {
      return crossProjectResultOf({
        targetProject: projectNameOf(descriptor),
        status: "STALE_TARGET_BINDING",
        warnings: [
          rebound === undefined
            ? `project "${descriptor.projectId}" is no longer bound in this deployment's project directory`
            : `project "${descriptor.projectId}" is now bound to a different peer than the one this request resolved to`,
        ],
        details: { requestId, peerId: descriptor.peer.peerId, threadId, messageRefs: Object.freeze([] as string[]) },
        at: deps.clock(),
      });
    }

    // ONE send (§2: OneRequest != one synchronous round trip — this never waits for
    // an answer, and it never creates a commitment, a task or a boundary).
    const sent = await deps.federation.sendMessage({ to: rebound.peer, threadId, body });
    sequenceByContent.set(contentKey, (sequenceByContent.get(contentKey) ?? 0) + 1);
    return crossProjectResultOf({
      targetProject: projectNameOf(descriptor),
      status: "RESOLVED",
      // §26: what was sent, exactly.
      outbound: {
        requestId,
        threadId,
        targetProjectId: descriptor.projectId,
        targetPeerId: rebound.peer.peerId,
        task: parsed.task,
        ...(parsed.contextText === undefined ? {} : { contextText: parsed.contextText }),
        body,
      },
      warnings: sent.delivered ? [] : ["the durable transport did not confirm delivery; the request may be delivered later (at-least-once)"],
      details: { requestId, peerId: rebound.peer.peerId, threadId, messageRefs: [sent.message.messageId] },
      at: deps.clock(),
    });
  }

  /* ---------------- derivation helpers (§18/§19) ---------------- */

  async function outboundAskFor(requestId: string, threadId: string): Promise<OutboundAsk | undefined> {
    const view = await deps.federation.thread(threadId);
    const matching: OutboundAsk[] = [];
    for (const message of view.messages) {
      if (message.from.peerId !== deps.localPeer.peerId) continue;
      const envelope = bodyEnvelope(message);
      if (envelope === undefined || envelope.kind !== "PROJECT_ASK") continue;
      if (envelope.requestId !== requestId) continue;
      matching.push({ message, envelope });
    }
    matching.sort((a, b) => (a.message.messageId < b.message.messageId ? -1 : 1));
    return matching[0];
  }

  async function outboundAnswersFor(requestId: string, threadId: string): Promise<readonly OutboundAnswer[]> {
    const view = await deps.federation.thread(threadId);
    const answers: OutboundAnswer[] = [];
    for (const message of view.messages) {
      if (message.from.peerId !== deps.localPeer.peerId) continue;
      const envelope = bodyEnvelope(message);
      if (envelope === undefined || envelope.kind !== "PROJECT_ANSWER") continue;
      if (envelope.requestId !== requestId) continue;
      answers.push({ message, envelope });
    }
    answers.sort((a, b) => (a.message.messageId < b.message.messageId ? -1 : 1));
    return Object.freeze(answers);
  }

  /**
   * §20/§56: the answers this installation may act on. An answer is accepted only
   * when ALL of these hold:
   *
   *   - it is in `inbox.received` (authenticated), never `inbox.unverified`;
   *   - `message.from` IS the peer this request was addressed to;
   *   - the thread is the request's derived thread;
   *   - `requestId` matches, and the envelope names THIS project as the asker;
   *   - `responderProjectId` is bound to that peer in the project directory;
   *   - the envelope parses strictly (unknown fields, oversize, empty text fail).
   *
   * "Authenticated" here means the LOCAL TRANSPORT ADAPTER asserted the peer from
   * its own ledger — the kernel cannot prove more (SC-4), which is exactly why the
   * directory binding above is the real defence.
   */
  function acceptAnswers(input: {
    readonly inbox: CrossProjectInboxView;
    readonly threadId: string;
    readonly requestId: string;
    readonly expectedPeer: PeerRef;
    readonly descriptors: readonly ProjectPeerDescriptor[];
    /** §75 (review M1): the project we ASKED — the answer must come from it. */
    readonly targetProjectId: string;
  }): readonly AcceptedAnswer[] {
    const accepted: AcceptedAnswer[] = [];
    const seen = new Set<string>();
    for (const message of input.inbox.received) {
      if (seen.has(message.messageId)) continue;
      if (message.from.peerId !== input.expectedPeer.peerId) continue;
      if (message.thread.threadId !== input.threadId) continue;
      const parsed = bodyEnvelope(message);
      if (parsed === undefined || parsed.kind !== "PROJECT_ANSWER") continue;
      if (parsed.requestId !== input.requestId) continue;
      if (parsed.sourceProjectId !== deps.projectId) continue;
      const bound = descriptorForPeer(input.descriptors, message.from);
      if (bound === undefined || bound.projectId !== parsed.responderProjectId) continue;
      // §75 (review M1): the responder must be the project we ASKED. A directory that
      // binds one peer to two projects (now refused at validation, but defensively here
      // too) could otherwise let a different project answer for the target.
      if (bound.projectId !== input.targetProjectId) continue;
      seen.add(message.messageId);
      accepted.push({
        message,
        envelope: parsed,
        contentDigest: projectAnswerContentDigest(parsed),
        responderProjectId: bound.projectId,
        responderName: projectNameOf(bound),
      });
    }
    accepted.sort((a, b) => (a.message.messageId < b.message.messageId ? -1 : 1));
    return Object.freeze(accepted);
  }

  function statusForAnswer(answer: ProjectAnswerEnvelope): CrossProjectStatus {
    switch (answer.status) {
      case "ANSWERED":
        return "ANSWERED";
      case "PARTIAL":
        return "PARTIAL";
      case "DECLINED":
        return "DECLINED";
      case "ERROR":
        // §19: the REMOTE side reported a fault — the derived state says so without
        // pretending this request failed locally.
        return "REMOTE_ERROR";
    }
  }

  async function deriveView(requestId: string): Promise<DerivedView> {
    if (typeof requestId !== "string" || !isStableIdentifier(requestId)) {
      fail("invalid_request", "a cross-project request id must be a stable identifier");
    }
    const threadId = threadIdForRequest(requestId);
    const warnings: string[] = [];
    const outbound = await outboundAskFor(requestId, threadId);
    if (outbound === undefined) {
      // §19: nothing was ever sent for this correlation id, so `PREPARED` is the
      // honest state. (An unknown id derives the same state: nothing was sent.)
      return {
        result: crossProjectResultOf({
          targetProject: "",
          status: "PREPARED",
          warnings: [
            "no outbound Ask was found for this request id, so nothing has been sent (either it was only prepared, or the id is unknown)",
          ],
          details: { requestId, peerId: "", threadId, messageRefs: Object.freeze([] as string[]) },
          at: deps.clock(),
        }),
        accepted: Object.freeze([]),
        warnings,
      };
    }
    const expectedPeer = outbound.message.to;
    const directory = await observedDirectory();
    const descriptors = directory.state === "known" ? directory.descriptors : Object.freeze([] as ProjectPeerDescriptor[]);
    if (directory.state !== "known") {
      warnings.push(
        `this deployment's project directory could not be read (${directory.state}), so the sender of any answer could not be bound to the target project`,
      );
    }
    const boundTarget = descriptorForProject(descriptors, outbound.envelope.targetProjectId);
    const targetName = boundTarget === undefined ? outbound.envelope.targetProjectId : projectNameOf(boundTarget);
    const thread = await deps.federation.thread(threadId);
    const delivered = thread.deliveredMessageIds.includes(outbound.message.messageId);
    const inbox = await deps.federation.inbox(deps.localPeer);
    const accepted = acceptAnswers({
      inbox,
      threadId,
      requestId,
      expectedPeer,
      descriptors,
      targetProjectId: outbound.envelope.targetProjectId,
    });
    if (accepted.length === 0) {
      const unanswered = inbox.received.filter((message) => {
        const parsed = bodyEnvelope(message);
        return parsed !== undefined && parsed.kind === "PROJECT_ANSWER" && parsed.requestId === requestId;
      });
      if (unanswered.length > 0) {
        warnings.push(
          "an answer for this request exists in this peer's inbox but was NOT accepted: it is unverified, came from a peer other than the one the request was addressed to, named the wrong project, or used a different thread",
        );
      }
      return {
        result: crossProjectResultOf({
          targetProject: targetName,
          status: delivered ? "WAITING" : "SENT",
          responder: "",
          warnings,
          details: { requestId, peerId: expectedPeer.peerId, threadId, messageRefs: [outbound.message.messageId] },
          at: deps.clock(),
        }),
        accepted,
        warnings,
      };
    }
    // §21: identical terminal duplicates collapse; materially different terminal
    // answers are a CONFLICT and are never silently resolved to first/latest.
    const distinct = [...new Set(accepted.map((entry) => entry.contentDigest))];
    if (distinct.length > 1) {
      return {
        result: crossProjectResultOf({
          targetProject: targetName,
          status: "CONFLICT",
          responder: "",
          warnings: [
            ...warnings,
            `${distinct.length} materially different answers arrived for this request from ${targetName}; none of them was chosen for you`,
          ],
          details: {
            requestId,
            peerId: expectedPeer.peerId,
            threadId,
            messageRefs: [outbound.message.messageId, ...accepted.map((entry) => entry.message.messageId)],
          },
          at: deps.clock(),
        }),
        accepted,
        warnings,
      };
    }
    const surfaced = accepted[0]!;
    return {
      result: crossProjectResultOf({
        targetProject: targetName,
        status: statusForAnswer(surfaced.envelope),
        ...(surfaced.envelope.answer === undefined ? {} : { answer: surfaced.envelope.answer }),
        responder: surfaced.responderName,
        warnings: surfaced.envelope.detail === undefined ? warnings : [...warnings, surfaced.envelope.detail],
        details: {
          requestId,
          peerId: expectedPeer.peerId,
          threadId,
          messageRefs: [outbound.message.messageId, ...accepted.map((entry) => entry.message.messageId)],
        },
        at: deps.clock(),
      }),
      surfaced,
      accepted,
      warnings,
    };
  }

  /** §18/§19/N19: a PURE read. It sends nothing, acknowledges nothing, mutates nothing. */
  async function status(requestId: string): Promise<CrossProjectCollaborationResult> {
    return (await deriveView(requestId)).result;
  }

  /* ---------------- inbound derivation (§30/§36/§54/§57) ---------------- */

  async function inboundAskCandidates(): Promise<readonly InboundAskCandidate[]> {
    const directory = await observedDirectory();
    if (directory.state !== "known") {
      // §8: an unverifiable inbox must NOT be reported as "no pending requests",
      // because that is exactly the unknown==empty collapse this discipline forbids.
      fail(
        "directory_unavailable",
        `this deployment's project directory could not be read (${directory.state}: ${directory.detail}), so no inbound request can be source-bound; unknown is never an empty pending list`,
      );
    }
    const inbox = await deps.federation.inbox(deps.localPeer);
    const candidates: InboundAskCandidate[] = [];
    const answeredByThread = new Map<string, readonly string[]>();
    const consider = async (message: PeerMessage, authenticated: boolean): Promise<void> => {
      const envelope = bodyEnvelope(message);
      if (envelope === undefined || envelope.kind !== "PROJECT_ASK") return;
      const threadId = message.thread.threadId;
      let answered = answeredByThread.get(threadId);
      if (answered === undefined) {
        // §36/§54 (SC-12): derive "already answered" from THIS peer's own outbound
        // thread — there is no pending-request table and no answer store.
        const answers = await outboundAnswersFor(envelope.requestId, threadId);
        answered = answers.map((entry) => entry.envelope.requestId);
        answeredByThread.set(threadId, answered);
      }
      const sender = descriptorForPeer(directory.descriptors, message.from);
      candidates.push({
        message,
        envelope,
        authenticated,
        classification: classifyInboundProjectAsk({
          authenticated,
          localProjectId: deps.projectId,
          envelope,
          message,
          descriptors: directory.descriptors,
          answeredRequestIds: answered,
        }),
        sourceName: sender === undefined ? envelope.sourceProjectId : projectNameOf(sender),
      });
    };
    // Deterministic order: `received` first (authenticated), then `unverified`.
    for (const message of inbox.received) await consider(message, true);
    for (const message of inbox.unverified) await consider(message, false);
    return Object.freeze(candidates);
  }

  async function pending(): Promise<readonly CrossProjectPendingAsk[]> {
    const candidates = await inboundAskCandidates();
    const byRequestId = new Map<string, InboundAskCandidate>();
    for (const candidate of candidates) {
      if (candidate.classification.status !== "PENDING") continue;
      const existing = byRequestId.get(candidate.envelope.requestId);
      // §36/§54: a replayed request is ONE logical pending request. Two transport
      // messages carrying the same requestId collapse to the earliest message id.
      if (existing === undefined || candidate.message.messageId < existing.message.messageId) {
        byRequestId.set(candidate.envelope.requestId, candidate);
      }
    }
    const out = [...byRequestId.values()]
      .sort((a, b) => (a.envelope.requestId < b.envelope.requestId ? -1 : 1))
      .map((candidate) =>
        Object.freeze({
          requestId: candidate.envelope.requestId,
          sourceProjectId: candidate.envelope.sourceProjectId,
          sourceProject: candidate.sourceName,
          sourcePeerId: candidate.message.from.peerId,
          targetProjectId: candidate.envelope.targetProjectId,
          task: candidate.envelope.task,
          ...(candidate.envelope.contextText === undefined ? {} : { contextText: candidate.envelope.contextText }),
          threadId: candidate.message.thread.threadId,
          messageId: candidate.message.messageId,
          at: deps.clock(),
        }),
      );
    return Object.freeze(out);
  }

  /* ---------------- respond() (§37/§38/§52/§36) ---------------- */

  function classificationRefusal(classification: InboundAskClassificationResult): never {
    switch (classification.status) {
      case "UNAUTHENTICATED":
        fail("unauthenticated_request", classification.detail);
      case "SOURCE_BINDING_MISMATCH":
        fail("source_binding_mismatch", classification.detail);
      case "TARGET_BINDING_MISMATCH":
        fail("target_binding_mismatch", classification.detail);
      case "ALREADY_ANSWERED":
      case "PENDING":
        // Unreachable through `respond` (see the guard there); kept total so the
        // vocabulary cannot silently acquire a fifth case.
        fail("unknown_request", classification.detail);
    }
  }

  function answerFromCollaboration(raw: unknown): {
    readonly status: ProjectAnswerStatus;
    readonly answer?: string | undefined;
    readonly detail?: string | undefined;
  } {
    const result = (typeof raw === "object" && raw !== null ? raw : {}) as {
      readonly status?: unknown;
      readonly summary?: unknown;
      readonly unresolved?: unknown;
      readonly message?: unknown;
    };
    const status = typeof result.status === "string" ? result.status : "ERROR";
    const summary = typeof result.summary === "string" && result.summary.trim() !== "" ? result.summary : undefined;
    const unresolved = Array.isArray(result.unresolved) ? result.unresolved.filter((entry): entry is string => typeof entry === "string") : [];
    const fallbackDetail =
      typeof result.message === "string" && result.message.trim() !== ""
        ? result.message
        : `this project's local collaboration reported "${status}" and produced no answer text`;
    switch (status) {
      case "COMPLETED":
      case "PRINCIPAL_CONTINUES":
        return summary === undefined
          ? { status: "PARTIAL", detail: fallbackDetail }
          : { status: "ANSWERED", answer: summary };
      case "PARTIAL":
        return {
          status: "PARTIAL",
          ...(summary === undefined ? {} : { answer: summary }),
          detail: unresolved.length === 0 ? (summary === undefined ? fallbackDetail : "this project's local collaboration returned a partial result") : unresolved.join(" "),
        };
      case "CAPABILITY_REQUIRED":
      case "CROSS_PROJECT_REQUIRED":
        return { status: "DECLINED", detail: summary ?? fallbackDetail };
      default:
        return { status: "ERROR", detail: summary ?? fallbackDetail };
    }
  }

  async function respond(requestId: string, answer: unknown): Promise<CrossProjectCollaborationResult> {
    if (typeof requestId !== "string" || !isStableIdentifier(requestId)) {
      fail("invalid_request", "a cross-project request id must be a stable identifier");
    }
    const draft = parseCrossProjectAnswerDraft(answer);
    const candidates = await inboundAskCandidates();
    const match = candidates.find((candidate) => candidate.envelope.requestId === requestId);
    if (match === undefined) {
      fail("unknown_request", `no authenticated cross-project request with id "${requestId}" is addressed to this project`);
    }
    if (match.classification.status !== "PENDING" && match.classification.status !== "ALREADY_ANSWERED") {
      /*
       * A spoofed or unverifiable packet is REFUSED outright (§44/§57). An
       * ALREADY_ANSWERED request is deliberately NOT refused: §36/§54 require a
       * replayed transport request to be a no-op rather than an error, so it falls
       * through to the reuse/idempotency logic below and never re-runs cognition.
       */
      classificationRefusal(match.classification);
    }

    const threadId = match.message.thread.threadId;
    const targetProjectId = match.envelope.sourceProjectId;
    const targetName = match.sourceName;

    // §37: the RESPONSE TARGET is derived from the authenticated request — the
    // caller has no way to choose `to`, the thread, or the responder project.
    const to = match.message.from;

    const prior = await outboundAnswersFor(requestId, threadId);

    let resolved: { status: ProjectAnswerStatus; answer?: string | undefined; detail?: string | undefined };
    let reused = false;
    if (draft.compose !== undefined) {
      if (prior.length > 0) {
        /*
         * §36/§54: this project already sent a terminal answer for this request. A
         * replayed transport request must NOT force duplicate cognition, so the
         * local collaboration is not run again and nothing is re-sent.
         */
        reused = true;
        const existing = prior[0]!.envelope;
        resolved = {
          status: existing.status,
          ...(existing.answer === undefined ? {} : { answer: existing.answer }),
          ...(existing.detail === undefined ? {} : { detail: existing.detail }),
        };
      } else {
        const collaboration = deps.collaboration;
        if (collaboration === undefined) {
          fail(
            "not_configured",
            "answering by composing with this project's local collaboration requires the collaboration service, which is not composed for this installation",
          );
        }
        const runResult = await collaboration.run({
          task: draft.compose.task ?? match.envelope.task,
          intent: draft.compose.intent ?? "AUTO",
          requestedBy: `cross-project:${match.envelope.sourceProjectId}`,
        });
        resolved = answerFromCollaboration(runResult);
      }
    } else {
      const status = draft.status ?? "ANSWERED";
      resolved = {
        status,
        ...(draft.answer === undefined ? {} : { answer: draft.answer }),
        ...(draft.detail === undefined ? {} : { detail: draft.detail }),
      };
    }

    const envelope = materializeProjectAnswerEnvelope({
      requestId,
      sourceProjectId: targetProjectId,
      // §37: the responder project is THIS project — never caller-supplied.
      responderProjectId: deps.projectId,
      status: resolved.status,
      ...(resolved.answer === undefined ? {} : { answer: resolved.answer }),
      ...(resolved.detail === undefined ? {} : { detail: resolved.detail }),
    });

    if (!reused && prior.some((existing) => projectAnswerContentDigest(existing.envelope) === projectAnswerContentDigest(envelope))) {
      // §21: an identical re-answer carries no new information; a deliberate
      // DIFFERENT answer is sent (and honestly becomes a CONFLICT at the origin).
      reused = true;
    }

    const warnings: string[] = [];
    let sentMessageId: string | undefined;
    if (reused) {
      warnings.push(
        "this request already had this exact terminal answer, so no second answer was sent and the local collaboration was not run again",
      );
    } else {
      const gate = deps.domainGate;
      if (gate !== undefined) {
        const decision = await gate();
        if (!decision.admitted) fail("refused_by_domain_gate", decision.detail);
      }
      const body = serializeCrossProjectEnvelope(envelope);
      // §37/§38: ONE ordinary federation message, and the acknowledgement happens
      // ONLY after the send resolved. A failed send must not acknowledge first.
      const sent = await deps.federation.sendMessage({ to, threadId, body });
      sentMessageId = sent.message.messageId;
      await deps.federation.acknowledge({ message: match.message });
      if (!sent.delivered) {
        warnings.push("the durable transport did not confirm delivery; the answer may be delivered later (at-least-once)");
      }
    }

    return crossProjectResultOf({
      targetProject: targetName,
      status: statusForAnswer(envelope),
      ...(envelope.answer === undefined ? {} : { answer: envelope.answer }),
      // §37: the responder is THIS project — it was never caller-supplied.
      responder: deps.projectId,
      warnings: envelope.detail === undefined ? warnings : [...warnings, envelope.detail],
      details: {
        requestId,
        peerId: to.peerId,
        threadId,
        messageRefs: [
          match.message.messageId,
          ...prior.map((entry) => entry.message.messageId),
          ...(sentMessageId === undefined ? [] : [sentMessageId]),
        ],
      },
      at: deps.clock(),
    });
  }

  /* ---------------- receive() (§39) ---------------- */

  async function receive(requestId: string): Promise<CrossProjectCollaborationResult> {
    const view = await deriveView(requestId);
    const surfaced = view.surfaced;
    if (surfaced === undefined) {
      // §39: no valid terminal answer yet (including CONFLICT) — nothing is
      // acknowledged, because nothing was consumed.
      return view.result;
    }
    const inbox = await deps.federation.inbox(deps.localPeer);
    const alreadyAcked = inbox.acks.some((ack) => ack.messageId === surfaced.message.messageId);
    if (!alreadyAcked) {
      // §39/§76/N20: ACK means "this answer was consumed/surfaced by this peer".
      // It is not agreement, not truth and not a commitment — the state derived
      // above is unchanged by acknowledging.
      await deps.federation.acknowledge({ message: surfaced.message });
    }
    return view.result;
  }

  return { projects, prepareAsk, ask, status, pending, respond, receive };
}
