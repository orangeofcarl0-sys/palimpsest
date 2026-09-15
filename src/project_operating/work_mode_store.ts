/**
 * G10-AB — the operator's Work Mode preference store.
 *
 * Deployment-local, project-scoped operator preference, exactly like the
 * management involvement profile. It is NOT ProjectIR canonical truth, NOT an
 * OrganizationDefinition, NOT Work EventStore truth and NOT RecipeStore truth.
 * It may share a physical database with the management preference store while
 * logical ownership stays separate (its own tables, its own port).
 *
 * Safe fallback (§4/§38): absent, lost, unreadable or malformed state degrades
 * to FOCUS + no modifiers, and the result SAYS it is a default. Autonomy is
 * never silently widened.
 */

import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

/**
 * The deployment-local operating store path. The orchestrator's own default state
 * path lives in the same directory, so the runtime and the operator CLI resolve
 * the SAME file - a preference written by the operator is the one the runtime reads.
 */
export function defaultOperatingStorePath(): string {
  const configured = process.env.DSH_HOME?.trim();
  const dshHome = configured === undefined || configured.length === 0 ? join(homedir(), ".dsh") : configured;
  return join(dshHome, "palimpsest", "project_operating.sqlite");
}

import {
  buildProjectWorkModePreference,
  defaultWorkModePreference,
  isWorkModeBaseMode,
  isWorkModeModifier,
  normalizeModifiers,
  type EffectiveWorkModePreference,
  type ProjectWorkModePreference,
  type UserWorkModeControlPort,
  type WorkModeBaseMode,
  type WorkModeHistoryEntry,
  type WorkModeModifier,
} from "./work_mode_profile.js";

interface PreferenceRow {
  readonly project_id: string;
  readonly preference_json: string;
  readonly updated_at: string;
}

interface HistoryRow {
  readonly project_id: string;
  readonly seq: number;
  readonly from_base_mode: string;
  readonly to_base_mode: string;
  readonly from_modifiers: string;
  readonly to_modifiers: string;
  readonly updated_by: string;
  readonly at: string;
}

function isoNow(): string {
  return new Date().toISOString();
}

function encodeModifiers(modifiers: readonly WorkModeModifier[]): string {
  return JSON.stringify(normalizeModifiers(modifiers));
}

function decodeModifiers(
  raw: string,
  what: string,
): readonly WorkModeModifier[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`${what} is not JSON`);
  }
  if (!Array.isArray(parsed) || parsed.some((entry) => !isWorkModeModifier(entry))) {
    throw new Error(`${what} is not a modifier list`);
  }
  return normalizeModifiers(parsed as WorkModeModifier[]);
}

export class SqliteWorkModePreferenceStore implements UserWorkModeControlPort {
  readonly #database: DatabaseSync;
  readonly #clock: () => string;

  constructor(databasePath: string, options?: { readonly clock?: (() => string) | undefined }) {
    if (databasePath !== ":memory:") mkdirSync(dirname(databasePath), { recursive: true });
    this.#database = new DatabaseSync(databasePath === ":memory:" ? ":memory:" : join(databasePath));
    this.#database.exec(
      "CREATE TABLE IF NOT EXISTS work_mode_preferences (" +
        "project_id TEXT PRIMARY KEY, " +
        "preference_json TEXT NOT NULL, " +
        "updated_at TEXT NOT NULL)",
    );
    this.#database.exec(
      "CREATE TABLE IF NOT EXISTS work_mode_history (" +
        "project_id TEXT NOT NULL, " +
        "seq INTEGER NOT NULL, " +
        "from_base_mode TEXT NOT NULL, " +
        "to_base_mode TEXT NOT NULL, " +
        "from_modifiers TEXT NOT NULL, " +
        "to_modifiers TEXT NOT NULL, " +
        "updated_by TEXT NOT NULL, " +
        "at TEXT NOT NULL, " +
        "PRIMARY KEY (project_id, seq))",
    );
    this.#clock = options?.clock ?? isoNow;
  }

  close(): void {
    this.#database.close();
  }

  /**
   * The stored preference, or an explicit safe default. A malformed or
   * unsupported stored value degrades instead of throwing, and reports why.
   */
  async get(projectId: string): Promise<EffectiveWorkModePreference> {
    const row = this.#database
      .prepare("SELECT project_id, preference_json, updated_at FROM work_mode_preferences WHERE project_id = ?")
      .get(projectId) as PreferenceRow | undefined;
    if (row !== undefined) {
      try {
        const parsed = JSON.parse(row.preference_json) as Record<string, unknown>;
        if (!isWorkModeBaseMode(parsed.baseMode)) {
          throw new Error(`unsupported baseMode ${String(parsed.baseMode)}`);
        }
        if (!Array.isArray(parsed.modifiers) || parsed.modifiers.some((m) => !isWorkModeModifier(m))) {
          throw new Error("unsupported modifiers");
        }
        return Object.freeze({
          preference: buildProjectWorkModePreference({
            projectId,
            baseMode: parsed.baseMode,
            modifiers: parsed.modifiers as WorkModeModifier[],
            updatedAt: String(parsed.updatedAt ?? row.updated_at),
            updatedBy: String(parsed.updatedBy ?? "operator:unknown"),
          }),
          source: "stored" as const,
        });
      } catch (error) {
        return Object.freeze({
          preference: defaultWorkModePreference(projectId),
          source: "safe_default" as const,
          degradedReason: `the stored Work Mode preference is unusable: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    }
    return Object.freeze({
      preference: defaultWorkModePreference(projectId),
      source: "safe_default" as const,
    });
  }

  async set(input: {
    readonly projectId: string;
    readonly baseMode: WorkModeBaseMode;
    readonly modifiers: readonly WorkModeModifier[];
    readonly updatedBy: string;
  }): Promise<ProjectWorkModePreference> {
    const current = await this.get(input.projectId);
    const at = this.#clock();
    const next = buildProjectWorkModePreference({
      projectId: input.projectId,
      baseMode: input.baseMode,
      modifiers: input.modifiers,
      updatedAt: at,
      updatedBy: input.updatedBy,
    });
    const seqRow = this.#database
      .prepare("SELECT MAX(seq) AS max_seq FROM work_mode_history WHERE project_id = ?")
      .get(input.projectId) as { max_seq: number | null } | undefined;
    const seq = (seqRow?.max_seq ?? 0) + 1;
    this.#database.exec("BEGIN IMMEDIATE");
    try {
      this.#database
        .prepare(
          "INSERT INTO work_mode_preferences (project_id, preference_json, updated_at) VALUES (?, ?, ?) " +
            "ON CONFLICT (project_id) DO UPDATE SET preference_json = excluded.preference_json, updated_at = excluded.updated_at",
        )
        .run(
          input.projectId,
          JSON.stringify({
            schemaVersion: 1,
            projectId: next.projectId,
            baseMode: next.baseMode,
            modifiers: [...next.modifiers],
            updatedAt: next.updatedAt,
            updatedBy: next.updatedBy,
          }),
          at,
        );
      this.#database
        .prepare(
          "INSERT INTO work_mode_history (project_id, seq, from_base_mode, to_base_mode, from_modifiers, to_modifiers, updated_by, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .run(
          input.projectId,
          seq,
          current.preference.baseMode,
          next.baseMode,
          encodeModifiers(current.preference.modifiers),
          encodeModifiers(next.modifiers),
          next.updatedBy,
          at,
        );
      this.#database.exec("COMMIT");
    } catch (error) {
      this.#database.exec("ROLLBACK");
      throw error;
    }
    return next;
  }

  async history(projectId: string): Promise<readonly WorkModeHistoryEntry[]> {
    const rows = this.#database
      .prepare(
        "SELECT project_id, seq, from_base_mode, to_base_mode, from_modifiers, to_modifiers, updated_by, at FROM work_mode_history WHERE project_id = ? ORDER BY seq",
      )
      .all(projectId) as unknown as HistoryRow[];
    return Object.freeze(
      rows.map((row) =>
        Object.freeze({
          projectId: row.project_id,
          seq: Number(row.seq),
          fromBaseMode: row.from_base_mode as WorkModeBaseMode,
          toBaseMode: row.to_base_mode as WorkModeBaseMode,
          fromModifiers: Object.freeze(decodeModifiers(row.from_modifiers, "from_modifiers")),
          toModifiers: Object.freeze(decodeModifiers(row.to_modifiers, "to_modifiers")),
          updatedBy: row.updated_by,
          at: row.at,
        }),
      ),
    );
  }
}
