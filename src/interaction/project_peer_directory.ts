/**
 * UX-B §7/§8/§9/§10/§42/§43 — the READ-ONLY project↔peer deployment directory.
 *
 *   ProjectId != PeerRef              ProjectName != PeerIdentity
 *   ProjectPeerBinding != Authority   ProjectPeerBinding != Ownership
 *   Descriptor != ProjectContent      Descriptor != CanonicalTruth
 *
 * §7: a user says "the previous optics project", never `peer-17`. Something must
 * therefore bind a human project NAME to an ADDRESSABLE `PeerRef`, and the audit
 * (UX-B0, SC-10) found that nothing in the tree does: `PeerDirectoryPort` and
 * `DeploymentDirectoryEntry` carry peer identity ONLY, and the only `displayName`
 * fields in `src/**` belong to external-asset providers. This port is therefore
 * genuinely NEW, and it is deliberately NOT a canonical store:
 *
 *  - it is READ-ONLY (`observeProjects()`), so nothing here can be written back;
 *  - it reuses the EXISTING D4 knowledge discipline (`ObservationKnowledge`'s
 *    `known | unknown | error`, `src/runtime/observation.ts`), so "the directory
 *    could not be observed" can never be read as "there are no other projects";
 *  - a descriptor carries ROUTING METADATA ONLY (§43): a project id, an optional
 *    display name, aliases, the bound `PeerRef` and optional competence tags. It
 *    carries no project content, no authority, no ownership and no scope;
 *  - §12: `ProjectId == PeerId` is NEVER assumed. The binding is the descriptor,
 *    and a binding is not an identity.
 *
 * It lives in `src/interaction/` and not in `src/federation/` (SC-22): the name
 * `PeerDirectoryPort` is already owned by `src/federation/directory.ts`, and
 * putting a second, differently-shaped directory beside it would muddy §4's
 * "reuse the existing federation" claim.
 */

import type { ObservationKnowledge } from "../runtime/index.js";
import { isStableIdentifier } from "../schema/identifier.js";
import type { PeerRef } from "../federation/peer.js";
import { parsePeerRef } from "../federation/peer.js";

/* ------------------------------------------------------------------ *
 * Typed refusal
 * ------------------------------------------------------------------ */

export const PROJECT_PEER_DIRECTORY_ERROR_REASONS = ["malformed_descriptor", "invalid_target"] as const;
export type ProjectPeerDirectoryErrorReason = (typeof PROJECT_PEER_DIRECTORY_ERROR_REASONS)[number];

export class ProjectPeerDirectoryError extends Error {
  constructor(
    readonly reason: ProjectPeerDirectoryErrorReason,
    message: string,
  ) {
    super(message);
    this.name = "ProjectPeerDirectoryError";
  }
}

function fail(reason: ProjectPeerDirectoryErrorReason, message: string): never {
  throw new ProjectPeerDirectoryError(reason, message);
}

/* ------------------------------------------------------------------ *
 * Descriptor (§7/§43)
 * ------------------------------------------------------------------ */

/**
 * §7: deployment routing metadata. NOT canonical truth, NOT authority and NOT
 * ownership — the field set is exactly the audit's, and `competenceTags` is
 * carried over from the existing `PeerAdvertisement` vocabulary.
 */
export interface ProjectPeerDescriptor {
  readonly projectId: string;
  readonly displayName?: string | undefined;
  readonly aliases: readonly string[];
  readonly peer: PeerRef;
  readonly competenceTags: readonly string[];
}

const DESCRIPTOR_KEYS = ["projectId", "displayName", "aliases", "peer", "competenceTags"] as const;

function plainObject(raw: unknown, what: string): Record<string, unknown> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    fail("malformed_descriptor", `${what} must be an object`);
  }
  const prototype: unknown = Object.getPrototypeOf(raw);
  if (prototype !== Object.prototype && prototype !== null) {
    // A prototype-carried field must never stand in for a declared one, so a class
    // instance is refused exactly as an unknown key would be.
    fail("malformed_descriptor", `${what} must be a plain object`);
  }
  return raw as Record<string, unknown>;
}

function nonEmptyString(value: unknown, what: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    fail("malformed_descriptor", `${what} must be a non-empty string`);
  }
  return value;
}

function stringList(value: unknown, what: string): readonly string[] {
  if (!Array.isArray(value)) fail("malformed_descriptor", `${what} must be an array`);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    const item = nonEmptyString(entry, `${what}[]`);
    if (seen.has(item)) fail("malformed_descriptor", `${what}: duplicate value "${item}" (semantic set)`);
    seen.add(item);
    out.push(item);
  }
  return Object.freeze([...out].sort());
}

/**
 * Strict materializer. Fails closed on: an unknown field, a missing required
 * field, a non-stable project id, an empty display name/alias, a duplicate
 * alias, a malformed `PeerRef`, or an empty competence tag.
 */
export function materializeProjectPeerDescriptor(raw: unknown, what = "ProjectPeerDescriptor"): ProjectPeerDescriptor {
  const object = plainObject(raw, what);
  for (const key of Object.getOwnPropertyNames(object)) {
    if (!(DESCRIPTOR_KEYS as readonly string[]).includes(key)) {
      fail("malformed_descriptor", `${what}: unknown field "${key}"`);
    }
  }
  for (const key of ["projectId", "aliases", "peer", "competenceTags"] as const) {
    if (!Object.hasOwn(object, key)) fail("malformed_descriptor", `${what}: missing required field "${key}"`);
  }
  const projectId = object.projectId;
  if (typeof projectId !== "string" || !isStableIdentifier(projectId)) {
    fail(
      "malformed_descriptor",
      `${what}.projectId must be a stable identifier (1-128 ASCII characters starting with an alphanumeric)`,
    );
  }
  const displayName =
    object.displayName === undefined ? undefined : nonEmptyString(object.displayName, `${what}.displayName`);
  const aliases = stringList(object.aliases, `${what}.aliases`);
  if (displayName !== undefined && aliases.includes(displayName)) {
    // An alias identical to the descriptor's own display name is a duplicate name
    // within ONE project, which makes the set ambiguous about itself.
    fail("malformed_descriptor", `${what}: alias "${displayName}" duplicates this descriptor's own displayName`);
  }
  const peer = parsePeerRef(object.peer);
  const competenceTags = stringList(object.competenceTags, `${what}.competenceTags`);
  return Object.freeze({
    projectId,
    ...(displayName === undefined ? {} : { displayName }),
    aliases,
    peer,
    competenceTags,
  });
}

/**
 * Validate a WHOLE observed set. §7 + SC-10: a malformed set fails CLOSED — it is
 * never partially accepted, because a half-read directory would make target
 * resolution depend on which half happened to parse.
 *
 * Duplicate `projectId` and duplicate `alias` are malformed (they are the same
 * project or the same name twice, i.e. a broken deployment binding). A duplicate
 * `displayName` across two DIFFERENT descriptors is deliberately NOT malformed:
 * two projects may honestly share a human name, and that is exactly what
 * `TARGET_AMBIGUOUS` exists for.
 */
export function validateProjectPeerDescriptors(raw: unknown, what = "ProjectPeerDescriptor[]"): readonly ProjectPeerDescriptor[] {
  if (!Array.isArray(raw)) fail("malformed_descriptor", `${what} must be an array`);
  const descriptors: ProjectPeerDescriptor[] = [];
  const projectIds = new Set<string>();
  const aliases = new Set<string>();
  const peers = new Set<string>();
  for (const entry of raw) {
    const descriptor = materializeProjectPeerDescriptor(entry, `${what}[]`);
    if (projectIds.has(descriptor.projectId)) {
      fail("malformed_descriptor", `${what}: duplicate projectId "${descriptor.projectId}"`);
    }
    projectIds.add(descriptor.projectId);
    // Review M1: a peer bound to two projects makes "which project answered" ambiguous,
    // so the binding must be one-to-one. (Project identity is never derived from a peer;
    // this only refuses an ambiguous routing table.)
    if (peers.has(descriptor.peer.peerId)) {
      fail("malformed_descriptor", `${what}: peer "${descriptor.peer.peerId}" is bound to more than one project`);
    }
    peers.add(descriptor.peer.peerId);
    for (const alias of descriptor.aliases) {
      if (aliases.has(alias)) {
        fail("malformed_descriptor", `${what}: alias "${alias}" is bound to more than one project`);
      }
      aliases.add(alias);
    }
    descriptors.push(descriptor);
  }
  return Object.freeze(descriptors);
}

/* ------------------------------------------------------------------ *
 * The read-only port (§8)
 * ------------------------------------------------------------------ */

/** §8: the EXISTING observation discipline. Unknown is never an empty directory. */
export interface ProjectPeerDirectoryPort {
  observeProjects(): Promise<ObservationKnowledge<readonly ProjectPeerDescriptor[]>>;
}

/** §42: the deployment/test adapter. The descriptor set is validated eagerly. */
export function staticProjectPeerDirectory(
  descriptors: readonly unknown[],
  options: { readonly directoryId?: string | undefined } = {},
): ProjectPeerDirectoryPort & { readonly directoryId: string } {
  const validated = validateProjectPeerDescriptors(descriptors);
  return Object.freeze({
    directoryId: options.directoryId ?? "static-project-peer-directory",
    observeProjects: async (): Promise<ObservationKnowledge<readonly ProjectPeerDescriptor[]>> =>
      Object.freeze({ state: "known" as const, value: validated }),
  });
}

/**
 * §8/N03: the explicit UNKNOWN directory. A deployment that has not configured a
 * directory says so — it never pretends the set is empty.
 */
export function unknownProjectPeerDirectory(detail: string): ProjectPeerDirectoryPort & { readonly directoryId: string } {
  return Object.freeze({
    directoryId: "unknown-project-peer-directory",
    observeProjects: async (): Promise<ObservationKnowledge<readonly ProjectPeerDescriptor[]>> =>
      Object.freeze({ state: "unknown" as const, detail }),
  });
}

/**
 * Observe through the port WITHOUT letting a fault escape as an exception: a
 * throwing directory is an `error` observation, which the resolution below maps
 * to `DIRECTORY_ERROR`. It is never downgraded to "no projects".
 */
export async function observeProjectDescriptors(
  directory: ProjectPeerDirectoryPort,
): Promise<ObservationKnowledge<readonly ProjectPeerDescriptor[]>> {
  try {
    const observed = await directory.observeProjects();
    if (observed.state !== "known") return observed;
    // Revalidate on every observation: a host adapter may hand back a set that
    // violates the binding discipline, and a malformed set fails closed.
    return Object.freeze({ state: "known" as const, value: validateProjectPeerDescriptors(observed.value) });
  } catch (error) {
    return Object.freeze({
      state: "error" as const,
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}

/* ------------------------------------------------------------------ *
 * Deterministic resolution (§9/SC-11)
 * ------------------------------------------------------------------ */

/**
 * §9/SC-11: the five outcomes MIRROR the existing `discovered |
 * directory_unknown | directory_error` pair — they are NOT new kernel statuses,
 * and "unknown is never an empty directory" survives end to end.
 */
export const PROJECT_RESOLUTION_OUTCOMES = [
  "RESOLVED",
  "TARGET_UNKNOWN",
  "TARGET_AMBIGUOUS",
  "DIRECTORY_UNKNOWN",
  "DIRECTORY_ERROR",
] as const;
export type ProjectResolutionOutcome = (typeof PROJECT_RESOLUTION_OUTCOMES)[number];

/** A user-facing project reference: an exact projectId, displayName or alias. */
export type ProjectTarget = string;

export interface ProjectTargetResolution {
  readonly status: ProjectResolutionOutcome;
  readonly target: ProjectTarget;
  /** Present iff `status === "RESOLVED"`. */
  readonly descriptor?: ProjectPeerDescriptor | undefined;
  /** §46: the CANDIDATE project names to show. Never a silent pick. */
  readonly candidates: readonly string[];
  readonly detail: string;
}

function candidateNames(descriptors: readonly ProjectPeerDescriptor[]): readonly string[] {
  return Object.freeze(
    [...new Set(descriptors.map((descriptor) => descriptor.displayName ?? descriptor.projectId))].sort(),
  );
}

/**
 * §9: PURE, EXACT, deterministic matching against `projectId`, `displayName` and
 * `alias`. No fuzzy matching, no embeddings, no ranking, no model. Several
 * distinct descriptors matching the SAME string is `TARGET_AMBIGUOUS`.
 */
export function resolveProjectTargetIn(
  descriptors: readonly ProjectPeerDescriptor[],
  target: unknown,
  options: { readonly detail?: string | undefined } = {},
): ProjectTargetResolution {
  if (typeof target !== "string" || target.trim() === "") {
    fail("invalid_target", "a project target must be a non-empty project name");
  }
  const wanted = target;
  const matched = descriptors.filter(
    (descriptor) =>
      descriptor.projectId === wanted ||
      descriptor.displayName === wanted ||
      descriptor.aliases.includes(wanted),
  );
  if (matched.length === 0) {
    return Object.freeze({
      status: "TARGET_UNKNOWN" as const,
      target: wanted,
      candidates: candidateNames(descriptors),
      detail: options.detail ?? `no project is bound to "${wanted}" in this deployment's project directory`,
    });
  }
  if (matched.length > 1) {
    return Object.freeze({
      status: "TARGET_AMBIGUOUS" as const,
      target: wanted,
      candidates: candidateNames(matched),
      detail:
        options.detail ??
        `"${wanted}" matches ${matched.length} projects (${candidateNames(matched).join(", ")}); nothing was sent — name the project by its id`,
    });
  }
  const descriptor = matched[0]!;
  return Object.freeze({
    status: "RESOLVED" as const,
    target: wanted,
    descriptor,
    candidates: Object.freeze([descriptor.displayName ?? descriptor.projectId]),
    detail: `"${wanted}" resolves to project "${descriptor.projectId}"`,
  });
}

/**
 * §9/§45: resolve under a FRESH directory observation. The five outcomes are
 * returned; `unknown` and `error` never degrade into "no candidates".
 */
export async function resolveProjectTarget(
  directory: ProjectPeerDirectoryPort,
  target: unknown,
): Promise<ProjectTargetResolution> {
  if (typeof target !== "string" || target.trim() === "") {
    fail("invalid_target", "a project target must be a non-empty project name");
  }
  const observed = await observeProjectDescriptors(directory);
  if (observed.state === "unknown") {
    return Object.freeze({
      status: "DIRECTORY_UNKNOWN" as const,
      target,
      candidates: Object.freeze([] as string[]),
      detail: `project directory observation is unknown: ${observed.detail} (unknown is never an empty directory)`,
    });
  }
  if (observed.state === "error") {
    return Object.freeze({
      status: "DIRECTORY_ERROR" as const,
      target,
      candidates: Object.freeze([] as string[]),
      detail: observed.detail,
    });
  }
  return resolveProjectTargetIn(observed.value, target);
}

/** The descriptor bound to a `PeerRef`, when the directory binds one (§44/§45/§56). */
export function descriptorForPeer(
  descriptors: readonly ProjectPeerDescriptor[],
  peer: PeerRef,
): ProjectPeerDescriptor | undefined {
  return descriptors.find((descriptor) => descriptor.peer.peerId === peer.peerId);
}

/** The descriptor bound to a project id, when the directory binds one (§12/§45). */
export function descriptorForProject(
  descriptors: readonly ProjectPeerDescriptor[],
  projectId: string,
): ProjectPeerDescriptor | undefined {
  return descriptors.find((descriptor) => descriptor.projectId === projectId);
}
