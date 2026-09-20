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

/**
 * UX-B §7 (additive): ONE project↔peer routing binding. `directory` above is the
 * EXISTING peer-identity list (audit Q1/Q2: it carries no project dimension at
 * all), so a human project NAME cannot be resolved through it. This entry is the
 * deployment's explicit, READ-ONLY answer to "which project is behind which peer",
 * and it is validated with the same strict discipline as the descriptor it becomes.
 *
 * It is deployment configuration, NOT authority, ownership or canonical truth, and
 * `projectId` is never assumed to equal `peerId` (§12/SC-10).
 */
export interface DeploymentProjectDirectoryEntry {
  readonly projectId: string;
  readonly displayName?: string | undefined;
  readonly aliases: readonly string[];
  readonly peerId: string;
  readonly competenceTags: readonly string[];
}

export interface DeploymentAttentionConfig {
  readonly policyId: string;
  readonly cooldownMs: number;
  /** Host activation adapter kind. `none` = pull mode only. */
  readonly activation: "none" | "dsh" | "pi";
  /**
   * DSH session/agent id or Pi session binding.
   *
   * UX-C SC-9/§23: for `activation: "dsh"` this may be ABSENT. The DSH host creates
   * or cold-resumes the persisted principal session at runtime, so the deployment
   * profile cannot know the id when it is written; the host binds it through the
   * explicit `Deployment.bindAttentionActivation` late-binding seam (the persisted
   * host session id is never a PeerRef). Pi still requires it because a Pi binding
   * is a static operator decision.
   */
  readonly sessionId?: string | undefined;
  readonly deliverAs?: "steer" | "followUp" | "nextTurn" | undefined;
}

/**
 * UX-C §9/SC-4/SC-12: the deployment-owned LOCAL COLLABORATION BUNDLE.
 *
 * Presence of this field (even `{}`) is the ONE switch that composes the packaged
 * local-Explore surface: a deployment-local durable ReasoningCell store, the
 * first-party exploratory verification/admission policies, and — when the host
 * supplies one — the ephemeral branch execution port. It is capability
 * composition, NOT authority: wiring it starts no branch, opens no cell, derives
 * no attention and sends no message by itself (§32).
 *
 * It carries at most ONE advanced override (`storePath`); every other value is
 * derived by the launcher/host from what it already knows. There is deliberately
 * no `autonomy`/`everything` switch (§44).
 */
export interface DeploymentReasoningConfig {
  /**
   * ADVANCED override for the deployment-owned ReasoningCell store path. Absent ⇒
   * a stable derived path beside the project's orchestration DB
   * (`<orchestration dir>/reasoning.sqlite`). Callers who need a custom store may
   * still pass one through the expert `installPalimpsest` API.
   */
  readonly storePath?: string | undefined;
}

export interface DeploymentServeConfig {
  readonly port?: number | undefined;
  readonly host?: string | undefined;
  readonly token?: string | undefined;
}

/** The operator's allowed gate commands: a closed, validated list (no widening, no defaults). */
function parsePolicy(value: unknown, what: string): {
  allowed_commands: Array<{ executable: string; argv_prefix: string[] }>;
} {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail("invalid_value", `${what}.policy must be an object`);
  }
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (key !== "allowed_commands") fail("unknown_field", `${what}.policy has unknown field "${key}"`);
  }
  const commands = record.allowed_commands;
  if (!Array.isArray(commands) || commands.length === 0) {
    fail("invalid_value", `${what}.policy.allowed_commands must be a non-empty array`);
  }
  return {
    allowed_commands: commands.map((entry) => {
      if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
        fail("invalid_value", `${what}.policy.allowed_commands entries must be objects`);
      }
      const item = entry as Record<string, unknown>;
      if (typeof item.executable !== "string" || item.executable.length === 0) {
        fail("invalid_value", `${what}.policy.allowed_commands[].executable must be a non-empty string`);
      }
      const prefix = item.argv_prefix;
      if (!Array.isArray(prefix) || prefix.some((token) => typeof token !== "string")) {
        fail("invalid_value", `${what}.policy.allowed_commands[].argv_prefix must be an array of strings`);
      }
      return { executable: item.executable, argv_prefix: prefix as string[] };
    }),
  };
}

/** The operator's confirmation sentence: one non-empty string, nothing else. */
function parseStandard(value: unknown, what: string): { statement: string } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail("invalid_value", `${what}.standard must be an object`);
  }
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (key !== "statement") fail("unknown_field", `${what}.standard has unknown field "${key}"`);
  }
  const statement = record.statement;
  if (typeof statement !== "string" || statement.trim() === "") {
    fail("invalid_value", `${what}.standard.statement must be a non-empty sentence`);
  }
  return { statement };
}

function parseExecutionMode(value: string): "worktree" | "in-place" {
  if (value === "worktree" || value === "in-place") return value;
  return fail("invalid_value", `execution must be "worktree" or "in-place", got "${value}"`);
}

export interface ProjectAgentDeploymentProfile {
  readonly schemaVersion: 1;
  readonly profileId: string;
  readonly projectId: string;
  /** This deployment's stable local PeerRef id — must not change across restarts. */
  readonly localPeer: string;
  readonly repository?: string | undefined;
  /**
   * Attempt work/observation model. Default "worktree" (an isolated git worktree per attempt).
   * "in-place" means the attempt works in the canonical repository tree — the model for an agent
   * whose cwd IS the repository — and its report is then OBSERVED by the product (git status/HEAD,
   * checked against the envelope's write_paths) rather than assembled from caller claims.
   */
  readonly execution?: "worktree" | "in-place" | undefined;
  /**
   * The OPERATOR's task policy for this deployment: at minimum the gate commands this project's
   * toolchain actually uses (`node --test`, `cargo test`, …). It is a bound, never a suggestion —
   * the envelope authorizes only commands named here, and no tool lets an agent widen it.
   */
  readonly policy?: {
    readonly allowed_commands: ReadonlyArray<{ readonly executable: string; readonly argv_prefix: readonly string[] }>;
  } | undefined;
  /**
   * PLMP-LEAN-1 §1: the operator's CONFIRMATION of this project's done-ness, in their own words.
   * Its presence is what turns the derived candidate into an effective standard (and therefore into
   * the release gate the product declares). Absent ⇒ the derivation is reported as an unconfirmed
   * candidate and no gate is declared, so nothing can be promoted on a standard nobody stated.
   */
  readonly standard?: { readonly statement: string } | undefined;
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
    /**
     * G10-V (additive): the Palimpsest-owned project-asset association history. Supplying it
     * (with `projectJournal`) enables the DERIVED project workspace + management surfaces.
     */
    readonly projectAssociations?: string | undefined;
    /** G10-V (additive): the Palimpsest-owned project journal history. */
    readonly projectJournal?: string | undefined;
    /** G10-V (additive): the deployment-local, NON-authoritative operator management preference. */
    readonly management?: string | undefined;
  };
  /** Non-authoritative discovery hints; absent ⇒ the directory is honestly UNKNOWN. */
  readonly directory?: readonly DeploymentDirectoryEntry[] | undefined;
  /**
   * UX-B §7 (additive): the project↔peer routing bindings. Supplying them composes
   * `application.crossProject` (and makes the peers named here the deployment's
   * known independent peers for the advisor — SC-9). Absent ⇒ the cross-project
   * face is absent, never stubbed, and nothing about the advisor changes.
   */
  readonly projectDirectory?: readonly DeploymentProjectDirectoryEntry[] | undefined;
  /**
   * UX-C §9/SC-4/SC-12 (additive): the deployment-owned LOCAL COLLABORATION BUNDLE.
   * Present (even `{}`) ⇒ the launcher composes a durable deployment-local
   * ReasoningCell store and the first-party exploratory policies, and wires the
   * host-supplied ephemeral branch execution when there is one. Absent ⇒ nothing
   * about reasoning changes (never a stub).
   */
  readonly reasoning?: DeploymentReasoningConfig | undefined;
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

/**
 * UX-B §7/SC-10: strict parse of the project↔peer binding list. It validates the
 * same discipline the descriptor itself enforces (stable project id, non-empty
 * display name/aliases with no duplicates, a real peer id, non-empty tags), so a
 * malformed deployment binding fails closed HERE rather than producing a directory
 * the product would have to distrust later.
 */
function parseProjectDirectory(raw: unknown, what: string): readonly DeploymentProjectDirectoryEntry[] {
  if (!Array.isArray(raw)) fail("invalid_value", `${what} must be an array`);
  const entries: DeploymentProjectDirectoryEntry[] = [];
  const projectIds = new Set<string>();
  const aliases = new Set<string>();
  for (const entry of raw) {
    const object = asObject(entry, `${what}[]`);
    exactKeys(object, ["projectId", "displayName", "aliases", "peerId", "competenceTags"], `${what}[]`);
    const projectId = stableId(object.projectId, `${what}[].projectId`);
    if (projectIds.has(projectId)) fail("invalid_value", `${what} has duplicate projectId "${projectId}"`);
    projectIds.add(projectId);
    const peerId = stableId(object.peerId, `${what}[].peerId`);
    const displayName = optionalString(object, "displayName", `${what}[]`);
    const rawAliases = object.aliases;
    if (!Array.isArray(rawAliases) || rawAliases.some((alias) => typeof alias !== "string" || alias.length === 0)) {
      fail("invalid_value", `${what}[].aliases must be an array of non-empty strings`);
    }
    for (const alias of rawAliases as string[]) {
      if (aliases.has(alias)) fail("invalid_value", `${what} binds alias "${alias}" to more than one project`);
      aliases.add(alias);
    }
    if (displayName !== undefined && (rawAliases as string[]).includes(displayName)) {
      fail("invalid_value", `${what}[].displayName must not also appear in its own aliases`);
    }
    const tags = object.competenceTags;
    if (!Array.isArray(tags) || tags.some((tag) => typeof tag !== "string" || tag.length === 0)) {
      fail("invalid_value", `${what}[].competenceTags must be an array of non-empty strings`);
    }
    entries.push(
      Object.freeze({
        projectId,
        ...(displayName === undefined ? {} : { displayName }),
        aliases: Object.freeze([...(rawAliases as string[])]),
        peerId,
        competenceTags: Object.freeze([...(tags as string[])]),
      }),
    );
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
  // UX-C SC-9: a DSH activation may be late-bound by the host to the persisted
  // principal session it creates/resumes, so `sessionId` is optional there. Pi
  // still requires its static binding.
  if (activation === "pi" && sessionId === undefined) {
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

/**
 * UX-C §9/SC-12: strict parse of the local-collaboration bundle. The ONLY key this
 * profile may carry is the ADVANCED store-path override; a semantic/authority
 * field (a policy, a branch port, an "enable everything" flag) fails closed as an
 * unknown field, exactly like every other deployment-config surface.
 */
function parseReasoning(raw: unknown, what: string): DeploymentReasoningConfig {
  const object = asObject(raw, what);
  exactKeys(object, ["storePath"], what);
  const storePath = optionalString(object, "storePath", what);
  return Object.freeze({
    ...(storePath === undefined ? {} : { storePath }),
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
      "execution",
      "policy",
      "standard",
      "persistentPoint",
      "transport",
      "databases",
      "directory",
      "projectDirectory",
      "reasoning",
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
    ["orchestration", "ordarium", "coordination", "transportCursors", "boundaryMemory", "runtimeScope", "attentionMarks", "projectAssociations", "projectJournal", "management"],
    `${what}.databases`,
  );

  return Object.freeze({
    schemaVersion: 1 as const,
    profileId: stableId(object.profileId, `${what}.profileId`),
    projectId: requiredString(object, "projectId", what),
    localPeer: stableId(object.localPeer, `${what}.localPeer`),
    ...(optionalString(object, "repository", what) === undefined ? {} : { repository: optionalString(object, "repository", what)! }),
    ...(optionalString(object, "execution", what) === undefined
      ? {}
      : { execution: parseExecutionMode(optionalString(object, "execution", what)!) }),
    ...(object.policy === undefined ? {} : { policy: parsePolicy(object.policy, what) }),
    ...(object.standard === undefined ? {} : { standard: parseStandard(object.standard, what) }),
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
      ...(optionalString(databasesObject, "projectAssociations", `${what}.databases`) === undefined ? {} : { projectAssociations: optionalString(databasesObject, "projectAssociations", `${what}.databases`)! }),
      ...(optionalString(databasesObject, "projectJournal", `${what}.databases`) === undefined ? {} : { projectJournal: optionalString(databasesObject, "projectJournal", `${what}.databases`)! }),
      ...(optionalString(databasesObject, "management", `${what}.databases`) === undefined ? {} : { management: optionalString(databasesObject, "management", `${what}.databases`)! }),
    }),
    ...(object.directory === undefined ? {} : { directory: parseDirectory(object.directory, `${what}.directory`) }),
    ...(object.projectDirectory === undefined
      ? {}
      : { projectDirectory: parseProjectDirectory(object.projectDirectory, `${what}.projectDirectory`) }),
    ...(object.reasoning === undefined ? {} : { reasoning: parseReasoning(object.reasoning, `${what}.reasoning`) }),
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
