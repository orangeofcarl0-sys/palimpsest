/**
 * G10-AC — deployment-local monitor delivery marks.
 *
 *   DeliveryMark ≠ Campaign truth      DeliveryMark ≠ Authority
 *   DeliveryMark ≠ Activation success  DeliveryMark ≠ Wake completion
 *
 * Duplicate suppression and backoff ONLY. It exists because host delivery is
 * explicitly AT-LEAST-ONCE: a crash after a successful enqueue but before the
 * local mark can duplicate a delivery, and semantic correctness must tolerate it
 * (the Campaign admission is idempotent, and the signal identity is derived from
 * the wake cycle rather than from the attempt).
 *
 * It never suppresses forever: while the same wake cycle remains incomplete,
 * redelivery after the configured cooldown is allowed. Once the wake cycle is
 * COMPLETE the driver stops delivering at all, which is a semantic fact the mark
 * store does not need to know.
 */

import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

export interface MonitorDeliveryMark {
  readonly signalId: string;
  readonly projectId: string;
  readonly campaignId: string;
  readonly attemptCount: number;
  readonly lastAttemptAt: string;
  readonly lastSuccessfulActivationAt: string | null;
}

interface MarkRow {
  readonly signal_id: string;
  readonly project_id: string;
  readonly campaign_id: string;
  readonly attempt_count: number;
  readonly last_attempt_at: string;
  readonly last_successful_activation_at: string | null;
}

export class SqliteMonitorDeliveryMarkStore {
  readonly #database: DatabaseSync;
  readonly #selectOne: ReturnType<DatabaseSync["prepare"]>;
  readonly #selectProject: ReturnType<DatabaseSync["prepare"]>;
  readonly #upsertAttempt: ReturnType<DatabaseSync["prepare"]>;
  readonly #markSuccess: ReturnType<DatabaseSync["prepare"]>;

  constructor(databasePath: string) {
    if (databasePath !== ":memory:") mkdirSync(dirname(databasePath), { recursive: true });
    this.#database = new DatabaseSync(databasePath === ":memory:" ? ":memory:" : join(databasePath));
    this.#database.exec(
      "CREATE TABLE IF NOT EXISTS monitor_delivery_marks (" +
        "signal_id TEXT PRIMARY KEY, " +
        "project_id TEXT NOT NULL, " +
        "campaign_id TEXT NOT NULL, " +
        "attempt_count INTEGER NOT NULL, " +
        "last_attempt_at TEXT NOT NULL, " +
        "last_successful_activation_at TEXT)",
    );
    this.#selectOne = this.#database.prepare(
      "SELECT signal_id, project_id, campaign_id, attempt_count, last_attempt_at, last_successful_activation_at FROM monitor_delivery_marks WHERE signal_id = ?",
    );
    this.#selectProject = this.#database.prepare(
      "SELECT signal_id, project_id, campaign_id, attempt_count, last_attempt_at, last_successful_activation_at FROM monitor_delivery_marks WHERE project_id = ? ORDER BY last_attempt_at DESC, signal_id",
    );
    this.#upsertAttempt = this.#database.prepare(
      "INSERT INTO monitor_delivery_marks (signal_id, project_id, campaign_id, attempt_count, last_attempt_at, last_successful_activation_at) VALUES (?, ?, ?, 1, ?, NULL) " +
        "ON CONFLICT (signal_id) DO UPDATE SET attempt_count = attempt_count + 1, last_attempt_at = excluded.last_attempt_at",
    );
    this.#markSuccess = this.#database.prepare(
      "UPDATE monitor_delivery_marks SET last_successful_activation_at = ? WHERE signal_id = ?",
    );
  }

  close(): void {
    this.#database.close();
  }

  #decode(row: MarkRow): MonitorDeliveryMark {
    return Object.freeze({
      signalId: String(row.signal_id),
      projectId: String(row.project_id),
      campaignId: String(row.campaign_id),
      attemptCount: Number(row.attempt_count),
      lastAttemptAt: String(row.last_attempt_at),
      lastSuccessfulActivationAt:
        row.last_successful_activation_at === null ? null : String(row.last_successful_activation_at),
    });
  }

  get(signalId: string): MonitorDeliveryMark | undefined {
    const row = this.#selectOne.get(signalId) as MarkRow | undefined;
    return row === undefined ? undefined : this.#decode(row);
  }

  list(projectId: string): readonly MonitorDeliveryMark[] {
    return Object.freeze(
      (this.#selectProject.all(projectId) as unknown as MarkRow[]).map((row) => this.#decode(row)),
    );
  }

  /** Count one delivery ATTEMPT. A mark is never evidence of success. */
  recordAttempt(input: {
    readonly signalId: string;
    readonly projectId: string;
    readonly campaignId: string;
    readonly at: string;
  }): MonitorDeliveryMark {
    this.#upsertAttempt.run(input.signalId, input.projectId, input.campaignId, input.at);
    const mark = this.get(input.signalId);
    if (mark === undefined) throw new Error(`delivery mark ${input.signalId} vanished after an attempt`);
    return mark;
  }

  /** Record that the host accepted the wake. This is NOT wake completion. */
  recordSuccess(input: { readonly signalId: string; readonly at: string }): MonitorDeliveryMark | undefined {
    this.#markSuccess.run(input.at, input.signalId);
    return this.get(input.signalId);
  }
}

/**
 * Should this signal be (re)delivered now?
 *
 *   - never delivered before            → yes
 *   - delivered, and inside the cooldown→ no (backoff, not suppression forever)
 *   - delivered, cooldown elapsed       → yes (this is the at-least-once retry)
 */
export function shouldDeliver(input: {
  readonly mark: MonitorDeliveryMark | undefined;
  readonly now: string;
  readonly redeliveryAfterMs: number;
}): { readonly deliver: boolean; readonly reason: string } {
  if (input.mark === undefined) return Object.freeze({ deliver: true, reason: "never delivered" });
  const last = Date.parse(input.mark.lastAttemptAt);
  const now = Date.parse(input.now);
  if (!Number.isFinite(last) || !Number.isFinite(now)) {
    return Object.freeze({ deliver: true, reason: "the previous attempt has no usable timestamp" });
  }
  const elapsed = now - last;
  if (elapsed < input.redeliveryAfterMs) {
    return Object.freeze({
      deliver: false,
      reason: `delivered ${String(elapsed)}ms ago; the ${String(input.redeliveryAfterMs)}ms cooldown has not elapsed`,
    });
  }
  return Object.freeze({ deliver: true, reason: "the cooldown elapsed while the wake cycle is still incomplete" });
}
