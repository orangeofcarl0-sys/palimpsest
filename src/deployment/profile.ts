/**
 * G10-P deployment profile — HOST/DEPLOYMENT configuration, never semantic truth.
 *
 *   deployment config ≠ semantic authority      deployment profile ≠ canonical species
 *
 * A profile answers ONLY: which project, which local PeerRef, which persistent point,
 * which repository, which database files, which transport namespace, which attention
 * adapter and which local host session to signal. It can NEVER answer who has semantic
 * authority, what boundary truth is accepted, or which commitments are active — those
 * live in the canonical stores/services alone.
 *
 * The parser is STRICT and exact-key at every level, so an attempt to smuggle an
 * authority/role/permission field fails closed instead of being silently ignored.
 */

import { isStableIdentifier } from "../schema/identifier.js";

export const DEPLOYMENT_PROFILE_SCHEMA_VERSION = 1;

export interface DeploymentDirectoryEntry {
  readonly peerId: string;
  readonly competenceTags: readonly string[];
}

export interface DeploymentAttentionConfig {
  readonly policyId: string;
  readonly cooldownMs: number;
  /** Host activation adapter kind. `none` = pull mode only. */
  readonly activation: "none" | "dsh" | "pi";
  /** DSH session/agent id or Pi session binding; required when activation is not `none`. */
  readonly sessionId?: string | undefined;
  readonly deliverAs?: "steer" | "followUp" | "nextTurn" | undefined;
}

export interface DeploymentServeConfig {
  readonly port?: number | undefined;
  readonly host?: string | undefined;
  readonly token?: string | undefined;
}

export interface ProjectAgentDeploymentProfile {
  readonly schemaVersion: 1;
  readonly profileId: string;
  readonly projectId: string;
  /** This deployment's stable local PeerRef id — must not change across restarts. */
  readonly localPeer: string;
  readonly repository?: string | undefined;
  /** Durable continuity locus id (PersistentPoint) bound to `localPeer`. */
  readonly persistentPoint?: string | undefined;
  readonly transport: {
    /** Shared durable transport namespace (the mailbox substrate). */
    readonly namespace: string;
    readonly databasePath: string;
  };
  readonly databases: {
    readonly orchestration: string;
    readonly ordarium: string;
    readonly coordination: string;
    readonly transportCursors: string;
    readonly boundaryMemory?: string | undefined;
    readonly runtimeScope?: string | undefined;
    readonly attentionMarks?: string | undefined;
  };
  /** Non-authoritative discovery hints; absent ⇒ the directory is honestly UNKNOWN. */
  readonly directory?: readonly DeploymentDirectoryEntry[] | undefined;
  readonly attention?: DeploymentAttentionConfig | undefined;
  readonly boundaryHomeId?: string | undefined;
  /** Deployment binding workspaceId → canonical boundary homeId (never social semantics). */
  readonly boundaryRoutes?: Readonly<Record<string, string>> | undefined;
  readonly serve?: DeploymentServeConfig | undefined;
}

export class DeploymentProfileError extends Error {
  constructor(
    readonly kind: "malformed_profile" | "unknown_field" | "invalid_value" | "unknown_schema_version",
    message: string,
  ) {
    super(message);
    this.name = "DeploymentProfileError";
  }
}

function fail(kind: DeploymentProfileError["kind"], message: string): never {
  throw new DeploymentProfileError(kind, message);
}

function asObject(raw: unknown, what: string): Record<string, unknown> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    fail("malformed_profile", `${what} must be an object`);
  }
  return raw as Record<string, unknown>;
}

function exactKeys(object: Record<string, unknown>, allowed: readonly string[], what: string): void {
  for (const key of Object.keys(object)) {
    if (!allowed.includes(key)) {
      fail("unknown_field", `${what} has unknown field "${key}" (deployment config is not semantic authority)`);
    }
  }
}

function requiredString(object: Record<string, unknown>, key: string, what: string): string {
  const value = object[key];
  if (typeof value !== "string" || value.length === 0) {
    fail("invalid_value", `${what}.${key} must be a non-empty string`);
  }
  return value;
}

function optionalString(object: Record<string, unknown>, key: string, what: string): string | undefined {
  const value = object[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.length === 0) {
    fail("invalid_value", `${what}.${key} must be a non-empty string when present`);
  }
  return value;
}

function stableId(value: unknown, what: string): string {
  if (typeof value !== "string" || !isStableIdentifier(value)) {
    fail("invalid_value", `${what} must be a stable identifier`);
  }
  return value;
}

function optionalStableId(object: Record<string, unknown>, key: string, what: string): string | undefined {
  const value = object[key];
  if (value === undefined) return undefined;
  return stableId(value, `${what}.${key}`);
}

function parseDirectory(raw: unknown, what: string): readonly DeploymentDirectoryEntry[] {
  if (!Array.isArray(raw)) fail("invalid_value", `${what} must be an array`);
  const entries: DeploymentDirectoryEntry[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    const object = asObject(entry, `${what}[]`);
    exactKeys(object, ["peerId", "competenceTags"], `${what}[]`);
    const peerId = stableId(object.peerId, `${what}[].peerId`);
    if (seen.has(peerId)) fail("invalid_value", `${what} has duplicate peerId "${peerId}"`);
    seen.add(peerId);
    const tags = object.competenceTags;
    if (!Array.isArray(tags) || tags.some((tag) => typeof tag !== "string" || tag.length === 0)) {
      fail("invalid_value", `${what}[].competenceTags must be an array of non-empty strings`);
    }
    entries.push(Object.freeze({ peerId, competenceTags: Object.freeze([...(tags as string[])]) }));
  }
  return Object.freeze(entries);
}

function parseAttention(raw: unknown, what: string): DeploymentAttentionConfig {
  const object = asObject(raw, what);
  exactKeys(object, ["policyId", "cooldownMs", "activation", "sessionId", "deliverAs"], what);
  const policyId = stableId(object.policyId, `${what}.policyId`);
  const cooldownMs = object.cooldownMs;
  if (typeof cooldownMs !== "number" || !Number.isInteger(cooldownMs) || cooldownMs < 0) {
    fail("invalid_value", `${what}.cooldownMs must be a non-negative integer`);
  }
  const activation = object.activation;
  if (activation !== "none" && activation !== "dsh" && activation !== "pi") {
    fail("invalid_value", `${what}.activation must be "none" | "dsh" | "pi"`);
  }
  const sessionId = optionalString(object, "sessionId", what);
  if (activation !== "none" && sessionId === undefined) {
    fail("invalid_value", `${what}.sessionId is required when activation is "${activation}"`);
  }
  const deliverAs = object.deliverAs;
  if (deliverAs !== undefined && deliverAs !== "steer" && deliverAs !== "followUp" && deliverAs !== "nextTurn") {
    fail("invalid_value", `${what}.deliverAs must be "steer" | "followUp" | "nextTurn"`);
  }
  return Object.freeze({
    policyId,
    cooldownMs,
    activation,
    ...(sessionId === undefined ? {} : { sessionId }),
    ...(deliverAs === undefined ? {} : { deliverAs }),
  });
}

function parseServe(raw: unknown, what: string): DeploymentServeConfig {
  const object = asObject(raw, what);
  exactKeys(object, ["port", "host", "token"], what);
  const port = object.port;
  if (port !== undefined && (typeof port !== "number" || !Number.isInteger(port) || port < 0 || port > 65535)) {
    fail("invalid_value", `${what}.port must be an integer in [0, 65535]`);
  }
  return Object.freeze({
    ...(port === undefined ? {} : { port: port as number }),
    ...(optionalString(object, "host", what) === undefined ? {} : { host: optionalString(object, "host", what)! }),
    ...(optionalString(object, "token", what) === undefined ? {} : { token: optionalString(object, "token", what)! }),
  });
}

export function parseDeploymentProfile(raw: unknown, what = "DeploymentProfile"): ProjectAgentDeploymentProfile {
  const object = asObject(raw, what);
  exactKeys(
    object,
    [
      "schemaVersion",
      "profileId",
      "projectId",
      "localPeer",
      "repository",
      "persistentPoint",
      "transport",
      "databases",
      "directory",
      "attention",
      "boundaryHomeId",
      "boundaryRoutes",
      "serve",
    ],
    what,
  );
  if (object.schemaVersion !== DEPLOYMENT_PROFILE_SCHEMA_VERSION) {
    fail("unknown_schema_version", `${what}.schemaVersion must be ${DEPLOYMENT_PROFILE_SCHEMA_VERSION}`);
  }

  const transportObject = asObject(object.transport, `${what}.transport`);
  exactKeys(transportObject, ["namespace", "databasePath"], `${what}.transport`);
  const databasesObject = asObject(object.databases, `${what}.databases`);
  exactKeys(
    databasesObject,
    ["orchestration", "ordarium", "coordination", "transportCursors", "boundaryMemory", "runtimeScope", "attentionMarks"],
    `${what}.databases`,
  );

  return Object.freeze({
    schemaVersion: 1 as const,
    profileId: stableId(object.profileId, `${what}.profileId`),
    projectId: requiredString(object, "projectId", what),
    localPeer: stableId(object.localPeer, `${what}.localPeer`),
    ...(optionalString(object, "repository", what) === undefined ? {} : { repository: optionalString(object, "repository", what)! }),
    ...(optionalStableId(object, "persistentPoint", what) === undefined ? {} : { persistentPoint: optionalStableId(object, "persistentPoint", what)! }),
    transport: Object.freeze({
      namespace: stableId(transportObject.namespace, `${what}.transport.namespace`),
      databasePath: requiredString(transportObject, "databasePath", `${what}.transport`),
    }),
    databases: Object.freeze({
      orchestration: requiredString(databasesObject, "orchestration", `${what}.databases`),
      ordarium: requiredString(databasesObject, "ordarium", `${what}.databases`),
      coordination: requiredString(databasesObject, "coordination", `${what}.databases`),
      transportCursors: requiredString(databasesObject, "transportCursors", `${what}.databases`),
      ...(optionalString(databasesObject, "boundaryMemory", `${what}.databases`) === undefined ? {} : { boundaryMemory: optionalString(databasesObject, "boundaryMemory", `${what}.databases`)! }),
      ...(optionalString(databasesObject, "runtimeScope", `${what}.databases`) === undefined ? {} : { runtimeScope: optionalString(databasesObject, "runtimeScope", `${what}.databases`)! }),
      ...(optionalString(databasesObject, "attentionMarks", `${what}.databases`) === undefined ? {} : { attentionMarks: optionalString(databasesObject, "attentionMarks", `${what}.databases`)! }),
    }),
    ...(object.directory === undefined ? {} : { directory: parseDirectory(object.directory, `${what}.directory`) }),
    ...(object.attention === undefined ? {} : { attention: parseAttention(object.attention, `${what}.attention`) }),
    ...(optionalStableId(object, "boundaryHomeId", what) === undefined ? {} : { boundaryHomeId: optionalStableId(object, "boundaryHomeId", what)! }),
    ...(object.boundaryRoutes === undefined
      ? {}
      : { boundaryRoutes: parseBoundaryRoutes(object.boundaryRoutes, `${what}.boundaryRoutes`) }),
    ...(object.serve === undefined ? {} : { serve: parseServe(object.serve, `${what}.serve`) }),
  });
}

function parseBoundaryRoutes(raw: unknown, what: string): Readonly<Record<string, string>> {
  const object = asObject(raw, what);
  const routes: Record<string, string> = {};
  for (const [workspaceId, homeId] of Object.entries(object)) {
    routes[stableId(workspaceId, `${what} key`)] = stableId(homeId, `${what}["${workspaceId}"]`);
  }
  return Object.freeze(routes);
}
