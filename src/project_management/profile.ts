/**
 * G10-V graduated project-management autonomy — the OPERATOR preference profile.
 *
 *   ManagementInvolvement ≠ SemanticAuthority       Mode ≠ Authority
 *   ManagementMode orthogonal to the work mode (FOCUS/EXPLORE/COORDINATE ± VERIFY/MONITOR)
 *   OperatorPreference ≠ CanonicalTruth            LostProfile degrades to DIRECT
 *
 * Involvement is a user/project preference, NOT an authority grant: it can only
 * restrict or permit *proactive* behaviour of the management cognition. The
 * effective permission is always
 *   existing semantic authority ∩ management policy ∩ capability availability
 * (see `policy.ts`). Nothing in this file mints, widens, or transfers authority.
 *
 * The profile is deployment-local operator preference (the tiny
 * `AttentionMarkStore` KV idiom grown one table): it is stored next to the
 * attention/transport deployment state and is explicitly NON-authoritative. If
 * the database is lost or unreadable, the deployment degrades to `DIRECT`
 * (observation/recommendation only, everything else explicitly confirmed).
 */

import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { canonicalDigest } from "../schema/canonical.js";
import { canonicalDatetime } from "../schema/datetime.js";

import { AUTHORITY_REQUIRED_ACTIONS, DEFAULT_ACTION_POLICY } from "./policy.js";

/* ------------------------------------------------------------------ *
 * Involvements and action classes
 * ------------------------------------------------------------------ */

export const MANAGEMENT_INVOLVEMENTS = ["DIRECT", "ASSIST", "MANAGE", "DELEGATE"] as const;
export type ManagementInvolvement = (typeof MANAGEMENT_INVOLVEMENTS)[number];

export const MANAGEMENT_ACTION_CLASSES = [
  "OBSERVE",
  "RECOMMEND",
  "PREPARE",
  "ADVANCE_MECHANICAL_WORK",
  "START_LOCAL_RECIPE",
  "RUN_LOCAL_VERIFY",
  "APPLY_LOCAL_PLAN_REVISION",
  "RECONCILE_PROJECT_HEAD",
  "DISPATCH_LOCAL_WORK",
  "SEND_PEER_REQUEST",
  "CREATE_EXTERNAL_COMMITMENT",
  "APPROVE_DISCLOSURE",
  "EVOLVE_ORGANIZATION",
  "IRREVERSIBLE_EFFECT",
] as const;
export type ManagementActionClass = (typeof MANAGEMENT_ACTION_CLASSES)[number];

/** The four authority-shaped action classes a mode can never grant on its own. */
export const AUTHORITY_SHAPED_ACTIONS: readonly ManagementActionClass[] = AUTHORITY_REQUIRED_ACTIONS;

/* ------------------------------------------------------------------ *
 * Errors and strict helpers
 * ------------------------------------------------------------------ */

export type ManagementErrorKind =
  | "malformed_artifact"
  | "unknown_field"
  | "invalid_value"
  | "unknown_kind"
  | "unknown_schema_version"
  | "invalid_registration"
  | "database_busy";

export class ManagementError extends Error {
  constructor(
    readonly kind: ManagementErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "ManagementError";
  }
}

export function managementFail(kind: ManagementErrorKind, message: string): never {
  throw new ManagementError(kind, message);
}

function mgmtObject(raw: unknown, what: string): Record<string, unknown> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    managementFail("malformed_artifact", `${what} must be an object`);
  }
  return raw as Record<string, unknown>;
}

function mgmtKeys(object: Record<string, unknown>, allowed: readonly string[], required: readonly string[], what: string): void {
  for (const key of Object.keys(object)) {
    if (!allowed.includes(key)) managementFail("unknown_field", `${what}: unknown field "${key}"`);
  }
  for (const key of required) {
    if (!Object.hasOwn(object, key) || object[key] === undefined) {
      managementFail("malformed_artifact", `${what}: missing required field "${key}"`);
    }
  }
}

function mgmtString(value: unknown, what: string): string {
  if (typeof value !== "string" || value.length === 0) managementFail("invalid_value", `${what} must be a non-empty string`);
  return value;
}

function mgmtEnum<T extends string>(value: unknown, allowed: readonly T[], what: string): T {
  if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) {
    managementFail("unknown_kind", `${what} must be one of ${allowed.join(", ")}`);
  }
  return value as T;
}

function mgmtDigest(value: unknown, what: string): string {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/u.test(value)) {
    managementFail("invalid_value", `${what} must be a canonical sha256 digest`);
  }
  return value;
}

function mgmtTimestamp(value: unknown, what: string): string {
  const text = mgmtString(value, what);
  try {
    return canonicalDatetime(text);
  } catch (error) {
    return managementFail("invalid_value", `${what} must be an ISO-8601 datetime: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function mgmtPositiveInt(value: unknown, what: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    managementFail("invalid_value", `${what} must be a positive integer`);
  }
  return value;
}

function mgmtClassList(value: unknown, what: string): readonly ManagementActionClass[] {
  if (!Array.isArray(value)) managementFail("malformed_artifact", `${what} must be an array`);
  const seen = new Set<ManagementActionClass>();
  for (const [index, entry] of (value as unknown[]).entries()) {
    seen.add(mgmtEnum(entry, MANAGEMENT_ACTION_CLASSES, `${what}[${index}]`));
  }
  // Canonical order (declaration order) so an equivalent list is byte-identical.
  return Object.freeze(MANAGEMENT_ACTION_CLASSES.filter((actionClass) => seen.has(actionClass)));
}

/* ------------------------------------------------------------------ *
 * The profile artifact
 * ------------------------------------------------------------------ */

export const MANAGEMENT_PROFILE_SCHEMA_VERSION = 1 as const;
export const MANAGEMENT_PROFILE_DOMAIN = "palimpsest.project-management.profile.v1";
export const MANAGEMENT_PROFILE_REF_PREFIX = "mpf";
export const DEFAULT_MAX_STEPS_PER_RUN = 5;
/** A deterministic epoch timestamp for a profile that was never explicitly set. */
export const MANAGEMENT_PROFILE_EPOCH = "1970-01-01T00:00:00.000Z";

export interface ManagementBudgets {
  readonly maxStepsPerRun: number;
  readonly maxWallClockMs?: number | undefined;
}

export interface ManagementAutonomyProfile {
  readonly schemaVersion: 1;
  readonly projectId: string;
  readonly involvement: ManagementInvolvement;
  readonly budgets: ManagementBudgets;
  readonly allowedActionClasses: readonly ManagementActionClass[];
  readonly confirmationBoundaries: readonly ManagementActionClass[];
  readonly updatedAt: string;
  readonly updatedBy: string;
  readonly digest: string;
}

export interface MaterializeManagementProfileInput {
  readonly projectId: string;
  readonly involvement: ManagementInvolvement;
  readonly budgets: ManagementBudgets;
  readonly allowedActionClasses: readonly ManagementActionClass[];
  readonly confirmationBoundaries: readonly ManagementActionClass[];
  readonly updatedAt: string;
  readonly updatedBy: string;
}

export function managementProfileDigestOf(input: Omit<ManagementAutonomyProfile, "digest">): string {
  return canonicalDigest({ domain: MANAGEMENT_PROFILE_DOMAIN, profile: input });
}

/** Content-derived reference helper (`mpf-<32 hex>`) for logs/telemetry. */
export function managementProfileRefOf(profile: { readonly digest: string }): string {
  return `${MANAGEMENT_PROFILE_REF_PREFIX}-${profile.digest.slice(0, 32)}`;
}

function materializeBudgets(input: ManagementBudgets): ManagementBudgets {
  const maxStepsPerRun = mgmtPositiveInt(input.maxStepsPerRun, "budgets.maxStepsPerRun");
  if (input.maxWallClockMs === undefined) return Object.freeze({ maxStepsPerRun });
  return Object.freeze({ maxStepsPerRun, maxWallClockMs: mgmtPositiveInt(input.maxWallClockMs, "budgets.maxWallClockMs") });
}

export function materializeManagementProfile(input: MaterializeManagementProfileInput): ManagementAutonomyProfile {
  const body: Omit<ManagementAutonomyProfile, "digest"> = {
    schemaVersion: MANAGEMENT_PROFILE_SCHEMA_VERSION,
    projectId: mgmtString(input.projectId, "projectId"),
    involvement: mgmtEnum(input.involvement, MANAGEMENT_INVOLVEMENTS, "involvement"),
    budgets: materializeBudgets(input.budgets),
    allowedActionClasses: mgmtClassList(input.allowedActionClasses, "allowedActionClasses"),
    confirmationBoundaries: mgmtClassList(input.confirmationBoundaries, "confirmationBoundaries"),
    updatedAt: mgmtTimestamp(input.updatedAt, "updatedAt"),
    updatedBy: mgmtString(input.updatedBy, "updatedBy"),
  };
  return Object.freeze({ ...body, digest: managementProfileDigestOf(body) });
}

const MANAGEMENT_PROFILE_KEYS = [
  "schemaVersion",
  "projectId",
  "involvement",
  "budgets",
  "allowedActionClasses",
  "confirmationBoundaries",
  "updatedAt",
  "updatedBy",
  "digest",
] as const;

function parseBudgets(raw: unknown, what: string): ManagementBudgets {
  const object = mgmtObject(raw, what);
  mgmtKeys(object, ["maxStepsPerRun", "maxWallClockMs"], ["maxStepsPerRun"], what);
  return materializeBudgets({
    maxStepsPerRun: mgmtPositiveInt(object.maxStepsPerRun, `${what}.maxStepsPerRun`),
    ...(object.maxWallClockMs === undefined ? {} : { maxWallClockMs: mgmtPositiveInt(object.maxWallClockMs, `${what}.maxWallClockMs`) }),
  });
}

export function parseManagementAutonomyProfile(raw: unknown, what = "ManagementAutonomyProfile"): ManagementAutonomyProfile {
  const object = mgmtObject(raw, what);
  mgmtKeys(object, MANAGEMENT_PROFILE_KEYS, MANAGEMENT_PROFILE_KEYS, what);
  if (object.schemaVersion !== MANAGEMENT_PROFILE_SCHEMA_VERSION) {
    managementFail("unknown_schema_version", `${what}.schemaVersion must be ${MANAGEMENT_PROFILE_SCHEMA_VERSION}`);
  }
  const body: Omit<ManagementAutonomyProfile, "digest"> = {
    schemaVersion: MANAGEMENT_PROFILE_SCHEMA_VERSION,
    projectId: mgmtString(object.projectId, `${what}.projectId`),
    involvement: mgmtEnum(object.involvement, MANAGEMENT_INVOLVEMENTS, `${what}.involvement`),
    budgets: parseBudgets(object.budgets, `${what}.budgets`),
    allowedActionClasses: mgmtClassList(object.allowedActionClasses, `${what}.allowedActionClasses`),
    confirmationBoundaries: mgmtClassList(object.confirmationBoundaries, `${what}.confirmationBoundaries`),
    updatedAt: mgmtTimestamp(object.updatedAt, `${what}.updatedAt`),
    updatedBy: mgmtString(object.updatedBy, `${what}.updatedBy`),
  };
  const digest = mgmtDigest(object.digest, `${what}.digest`);
  if (managementProfileDigestOf(body) !== digest) managementFail("invalid_value", `${what}.digest does not match its content`);
  return Object.freeze({ ...body, digest });
}

/* ------------------------------------------------------------------ *
 * The operator control port (the ONLY escalation path)
 * ------------------------------------------------------------------ */

export interface UserManagementControlPort {
  get(projectId: string): Promise<ManagementAutonomyProfile>;
  /**
   * G10-AB (additive, optional): the existing append-only involvement history.
   * The operating-posture view reads it; it is not duplicated anywhere.
   */
  history?(projectId: string): Promise<readonly ManagementPreferenceHistoryEntry[]>;
  set(input: {
    readonly projectId: string;
    readonly involvement: ManagementInvolvement;
    readonly updatedBy: string;
    readonly allowedActionClasses?: readonly ManagementActionClass[] | undefined;
    readonly confirmationBoundaries?: readonly ManagementActionClass[] | undefined;
  }): Promise<ManagementAutonomyProfile>;
}

/* ------------------------------------------------------------------ *
 * Defaults derived from the policy matrix
 * ------------------------------------------------------------------ */

/**
 * The classes the matrix does not outright forbid at this involvement. A class
 * whose cell is `"no"` is never in the default allowed set.
 */
export function defaultAllowedActionClasses(involvement: ManagementInvolvement): readonly ManagementActionClass[] {
  return Object.freeze(MANAGEMENT_ACTION_CLASSES.filter((actionClass) => DEFAULT_ACTION_POLICY[actionClass][involvement] !== "no"));
}

/**
 * The classes that need an explicit confirmation boundary at this involvement:
 * every `confirmation`/`governed` cell plus the four authority-shaped classes
 * (which a mode can never grant on its own).
 */
export function defaultConfirmationBoundaries(involvement: ManagementInvolvement): readonly ManagementActionClass[] {
  return Object.freeze(
    MANAGEMENT_ACTION_CLASSES.filter((actionClass) => {
      if (AUTHORITY_REQUIRED_ACTIONS.includes(actionClass)) return true;
      const cell = DEFAULT_ACTION_POLICY[actionClass][involvement];
      return cell === "confirmation" || cell === "governed";
    }),
  );
}

/**
 * The safe default: involvement `DIRECT`, the matrix-derived allowed and
 * confirmation sets, a deterministic epoch `updatedAt`. Losing the preference
 * database yields exactly this profile.
 */
export function defaultManagementProfile(projectId: string, updatedBy: string): ManagementAutonomyProfile {
  return materializeManagementProfile({
    projectId: mgmtString(projectId, "projectId"),
    involvement: "DIRECT",
    budgets: { maxStepsPerRun: DEFAULT_MAX_STEPS_PER_RUN },
    allowedActionClasses: defaultAllowedActionClasses("DIRECT"),
    confirmationBoundaries: defaultConfirmationBoundaries("DIRECT"),
    updatedAt: MANAGEMENT_PROFILE_EPOCH,
    updatedBy: mgmtString(updatedBy, "updatedBy"),
  });
}

/* ------------------------------------------------------------------ *
 * Deployment-local, NON-authoritative preference store
 * ------------------------------------------------------------------ */

export interface ManagementPreferenceHistoryEntry {
  readonly projectId: string;
  readonly seq: number;
  readonly fromInvolvement: ManagementInvolvement;
  readonly toInvolvement: ManagementInvolvement;
  readonly updatedBy: string;
  readonly at: string;
}

interface ProfileRow {
  project_id: string;
  profile_json: string;
  updated_at: string;
}

interface HistoryRow {
  project_id: string;
  seq: number;
  from_involvement: string;
  to_involvement: string;
  updated_by: string;
  at: string;
}

function isBusyError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /SQLITE_BUSY|SQLITE_LOCKED|database is locked|database table is locked/i.test(message);
}

/**
 * A deployment-local operator-preference store. It implements the
 * `UserManagementControlPort` and is the ONLY writer of an involvement change.
 * It stores no canonical truth, holds no authority, and losing it degrades to
 * `defaultManagementProfile(...)` (DIRECT) — never to a wider mode.
 */
export class SqliteManagementPreferenceStore implements UserManagementControlPort {
  readonly #database: DatabaseSync;
  readonly #selectProfile: ReturnType<DatabaseSync["prepare"]>;
  readonly #upsertProfile: ReturnType<DatabaseSync["prepare"]>;
  readonly #selectHistory: ReturnType<DatabaseSync["prepare"]>;
  readonly #maxSeq: ReturnType<DatabaseSync["prepare"]>;
  readonly #insertHistory: ReturnType<DatabaseSync["prepare"]>;
  readonly #clock: () => string;

  constructor(databasePath: string, options?: { readonly clock?: (() => string) | undefined }) {
    if (databasePath !== ":memory:") mkdirSync(dirname(databasePath), { recursive: true });
    this.#database = new DatabaseSync(databasePath === ":memory:" ? ":memory:" : join(databasePath));
    this.#database.exec(
      "CREATE TABLE IF NOT EXISTS management_profiles (" +
        "project_id TEXT PRIMARY KEY, " +
        "profile_json TEXT NOT NULL, " +
        "updated_at TEXT NOT NULL)",
    );
    this.#database.exec(
      "CREATE TABLE IF NOT EXISTS management_mode_history (" +
        "project_id TEXT NOT NULL, " +
        "seq INTEGER NOT NULL, " +
        "from_involvement TEXT NOT NULL, " +
        "to_involvement TEXT NOT NULL, " +
        "updated_by TEXT NOT NULL, " +
        "at TEXT NOT NULL, " +
        "PRIMARY KEY (project_id, seq))",
    );
    this.#selectProfile = this.#database.prepare("SELECT project_id, profile_json, updated_at FROM management_profiles WHERE project_id = ?");
    this.#upsertProfile = this.#database.prepare(
      "INSERT INTO management_profiles (project_id, profile_json, updated_at) VALUES (?, ?, ?) " +
        "ON CONFLICT (project_id) DO UPDATE SET profile_json = excluded.profile_json, updated_at = excluded.updated_at",
    );
    this.#selectHistory = this.#database.prepare(
      "SELECT project_id, seq, from_involvement, to_involvement, updated_by, at FROM management_mode_history WHERE project_id = ? ORDER BY seq",
    );
    this.#maxSeq = this.#database.prepare("SELECT MAX(seq) AS max_seq FROM management_mode_history WHERE project_id = ?");
    this.#insertHistory = this.#database.prepare(
      "INSERT INTO management_mode_history (project_id, seq, from_involvement, to_involvement, updated_by, at) VALUES (?, ?, ?, ?, ?, ?)",
    );
    this.#clock = options?.clock ?? (() => new Date().toISOString());
  }

  #read(projectId: string): ManagementAutonomyProfile | undefined {
    const row = this.#selectProfile.get(projectId) as ProfileRow | undefined;
    if (row === undefined) return undefined;
    let parsed: unknown;
    try {
      parsed = JSON.parse(row.profile_json);
    } catch (error) {
      return managementFail("malformed_artifact", `stored management profile for "${projectId}" is not JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
    return parseManagementAutonomyProfile(parsed, `stored management profile for "${projectId}"`);
  }

  async get(projectId: string): Promise<ManagementAutonomyProfile> {
    const id = mgmtString(projectId, "projectId");
    return this.#read(id) ?? defaultManagementProfile(id, "operator:unset");
  }

  async set(input: {
    readonly projectId: string;
    readonly involvement: ManagementInvolvement;
    readonly updatedBy: string;
    readonly allowedActionClasses?: readonly ManagementActionClass[] | undefined;
    readonly confirmationBoundaries?: readonly ManagementActionClass[] | undefined;
  }): Promise<ManagementAutonomyProfile> {
    const projectId = mgmtString(input.projectId, "projectId");
    const involvement = mgmtEnum(input.involvement, MANAGEMENT_INVOLVEMENTS, "involvement");
    const updatedBy = mgmtString(input.updatedBy, "updatedBy");
    const existing = this.#read(projectId);
    const profile = materializeManagementProfile({
      projectId,
      involvement,
      budgets: existing?.budgets ?? { maxStepsPerRun: DEFAULT_MAX_STEPS_PER_RUN },
      allowedActionClasses: input.allowedActionClasses ?? defaultAllowedActionClasses(involvement),
      confirmationBoundaries: input.confirmationBoundaries ?? defaultConfirmationBoundaries(involvement),
      updatedAt: this.#clock(),
      updatedBy,
    });
    const fromInvolvement: ManagementInvolvement = existing?.involvement ?? "DIRECT";
    try {
      this.#database.exec("BEGIN IMMEDIATE");
      this.#upsertProfile.run(projectId, JSON.stringify(profile), profile.updatedAt);
      if (fromInvolvement !== involvement) {
        const row = this.#maxSeq.get(projectId) as { max_seq: number | null } | undefined;
        const seq = (row?.max_seq ?? 0) + 1;
        this.#insertHistory.run(projectId, seq, fromInvolvement, involvement, updatedBy, profile.updatedAt);
      }
      this.#database.exec("COMMIT");
    } catch (error) {
      try {
        this.#database.exec("ROLLBACK");
      } catch {
        // no active transaction
      }
      if (error instanceof ManagementError) throw error;
      if (isBusyError(error)) {
        managementFail("database_busy", `management preference store write contention (bounded wait exhausted): ${error instanceof Error ? error.message : String(error)}`);
      }
      managementFail("invalid_registration", `management preference store write failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    return profile;
  }

  async history(projectId: string): Promise<readonly ManagementPreferenceHistoryEntry[]> {
    const id = mgmtString(projectId, "projectId");
    const rows = this.#selectHistory.all(id) as unknown as HistoryRow[];
    return Object.freeze(
      rows.map((row) =>
        Object.freeze({
          projectId: row.project_id,
          seq: row.seq,
          fromInvolvement: mgmtEnum(row.from_involvement, MANAGEMENT_INVOLVEMENTS, "from_involvement"),
          toInvolvement: mgmtEnum(row.to_involvement, MANAGEMENT_INVOLVEMENTS, "to_involvement"),
          updatedBy: row.updated_by,
          at: row.at,
        }),
      ),
    );
  }

  close(): void {
    this.#database.close();
  }
}

/** The canonical deployment-local management preference path. */
export function defaultManagementProfilePath(): string {
  const configured = process.env.DSH_HOME?.trim();
  const dshHome = configured === undefined || configured.length === 0 ? join(homedir(), ".dsh") : configured;
  return join(dshHome, "palimpsest", "management.sqlite");
}
