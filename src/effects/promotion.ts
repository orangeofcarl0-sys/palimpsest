/**
 * PromotionManager: turn an accepted attempt into a real promotion.
 *
 * The Python baseline treated PROMOTION_COMMITTED as an injected fact. P1
 * elevates it to a real flow: the manager appends a durable PREPARED intent,
 * executes the git.promote Safe Action on the shared Ordarium ledger, and
 * only then records PROMOTION_COMMITTED with the *action's* resulting head
 * commit. Runtime crash windows are recovered by Ordarium's reconcilable
 * semantics:
 *
 *   - Crash A (before the merge): reconcile sees head unchanged → absent,
 *     retrySafe → the operation re-dispatches and the promotion lands once.
 *   - Crash B (merge landed, ledger write lost): reconcile sees the source
 *     applied → succeeded → PROMOTION_COMMITTED is recorded, and git.promote
 *     is never executed a second time.
 *
 * Idempotency keys are deterministic per promotion, so replay after a crash
 * never double-commits.
 */

import { OperationBusyError, UncertainOperationError } from "@ordarium/core";

import { actionKey, stableEntityId } from "../domain/index.js";
import { parseNewEvent, type SchedulerEvent } from "../schema/index.js";
import type { EventStore } from "../state/index.js";
import { DomainValidationError } from "../domain/errors.js";
import type { PalimpsestEffectsRuntime } from "./runtime.js";

export interface PromoteOptions {
  attemptId: string;
  sourceCommit: string;
  expectedHeadCommit: string;
  reason?: string | undefined;
}

export interface PromoteResult {
  promotionId: string;
  committed: SchedulerEvent;
  resultingHeadCommit: string;
}

export function promotionIdFor(projectId: string, attemptId: string): string {
  return stableEntityId(
    "promotion",
    actionKey("promotion-v1", { project_id: projectId, attempt_id: attemptId }),
  );
}

export class PromotionManager {
  readonly #store: EventStore;
  readonly #effects: PalimpsestEffectsRuntime;
  readonly projectId: string;

  constructor(store: EventStore, effects: PalimpsestEffectsRuntime, projectId: string) {
    this.#store = store;
    this.#effects = effects;
    this.projectId = projectId;
  }

  projectRevision(): number {
    const row = this.#store.connection
      .prepare("SELECT revision FROM projects WHERE project_id=?")
      .get(this.projectId) as { revision: number } | undefined;
    if (row === undefined) {
      throw new DomainValidationError("project does not exist");
    }
    return row.revision;
  }

  async promote(options: PromoteOptions): Promise<PromoteResult> {
    const promotionId = promotionIdFor(this.projectId, options.attemptId);
    const existing = this.#terminal(promotionId);
    if (existing !== undefined) {
      if (existing.event_type !== "PROMOTION_COMMITTED") {
        throw new DomainValidationError(`promotion ${promotionId} already failed`);
      }
      const payload = existing.payload;
      return {
        promotionId,
        committed: existing,
        resultingHeadCommit: String(payload.resulting_head_commit),
      };
    }

    this.#appendPrepared(promotionId, options);
    const revision = this.projectRevision();

    try {
      const outcome = await this.#effects.invoke(
        this.#effects.actions.gitPromote,
        {
          promotionId,
          sourceCommit: options.sourceCommit,
          expectedHeadCommit: options.expectedHeadCommit,
        },
        { scope: this.projectId, callId: `promote:${promotionId}` },
      );
      return {
        promotionId,
        committed: this.#appendCommitted({
          promotionId,
          attemptId: options.attemptId,
          sourceCommit: options.sourceCommit,
          expectedHeadCommit: options.expectedHeadCommit,
          resultingHeadCommit: outcome.resultingHeadCommit,
          reason: options.reason ?? "promoted via Ordarium git.promote",
        }),
        resultingHeadCommit: outcome.resultingHeadCommit,
      };
    } catch (error) {
      // Crash windows and uncertain outcomes must NOT terminalize the
      // promotion: a restart reclaims the operation and reconciles. Only a
      // deterministic failure records PROMOTION_FAILED.
      const transient =
        error instanceof UncertainOperationError ||
        error instanceof OperationBusyError ||
        (typeof error === "object" &&
          error !== null &&
          (error as { name?: string }).name === "SimulatedProcessCrash");
      if (!transient) {
        this.#appendFailed({
          promotionId,
          attemptId: options.attemptId,
          sourceCommit: options.sourceCommit,
          expectedHeadCommit: options.expectedHeadCommit,
          reason: (error as Error).message,
        });
      }
      throw error;
    }
  }

  #terminal(promotionId: string): SchedulerEvent | undefined {
    const existing = this.#store.connection
      .prepare(
        "SELECT event_id FROM events WHERE project_id=? AND event_type IN ('PROMOTION_COMMITTED','PROMOTION_FAILED') AND entity_id=?",
      )
      .get(this.projectId, promotionId) as { event_id: number } | undefined;
    if (existing === undefined) return undefined;
    const event = this.#store.getEvent(existing.event_id);
    if (event === undefined) {
      throw new DomainValidationError("terminal promotion Event is missing");
    }
    return event;
  }

  #appendPrepared(
    promotionId: string,
    options: PromoteOptions,
  ): SchedulerEvent {
    const revision = this.projectRevision();
    return this.#store.append(
      parseNewEvent({
        schema_version: 1,
        project_id: this.projectId,
        event_type: "PROMOTION_PREPARED",
        payload_version: 1,
        entity_type: "promotion",
        entity_id: promotionId,
        payload: {
          promotion_id: promotionId,
          attempt_id: options.attemptId,
          source_commit: options.sourceCommit,
          expected_head_commit: options.expectedHeadCommit,
          resulting_head_commit: null,
          reason: "promotion intent recorded before git.promote",
        },
        causation_id: null,
        correlation_id: `promotion:${promotionId}`,
        idempotency_key: actionKey("promotion-prepare-v1", {
          project_id: this.projectId,
          promotion_id: promotionId,
        }),
        expected_project_revision: revision,
      }),
    );
  }

  #appendCommitted(arg: {
    promotionId: string;
    attemptId: string;
    sourceCommit: string;
    expectedHeadCommit: string;
    resultingHeadCommit: string;
    reason: string;
  }): SchedulerEvent {
    return this.#store.append(
      parseNewEvent({
        schema_version: 1,
        project_id: this.projectId,
        event_type: "PROMOTION_COMMITTED",
        payload_version: 1,
        entity_type: "promotion",
        entity_id: arg.promotionId,
        payload: {
          promotion_id: arg.promotionId,
          attempt_id: arg.attemptId,
          source_commit: arg.sourceCommit,
          expected_head_commit: arg.expectedHeadCommit,
          resulting_head_commit: arg.resultingHeadCommit,
          reason: arg.reason,
        },
        causation_id: null,
        correlation_id: `promotion:${arg.promotionId}`,
        idempotency_key: actionKey("promotion-committed-v1", {
          project_id: this.projectId,
          promotion_id: arg.promotionId,
        }),
        expected_project_revision: this.projectRevision(),
      }),
    );
  }

  #appendFailed(arg: {
    promotionId: string;
    attemptId: string;
    sourceCommit: string;
    expectedHeadCommit: string;
    reason: string;
  }): SchedulerEvent {
    const revision = this.projectRevision();
    return this.#store.append(
      parseNewEvent({
        schema_version: 1,
        project_id: this.projectId,
        event_type: "PROMOTION_FAILED",
        payload_version: 1,
        entity_type: "promotion",
        entity_id: arg.promotionId,
        payload: {
          promotion_id: arg.promotionId,
          attempt_id: arg.attemptId,
          source_commit: arg.sourceCommit,
          expected_head_commit: arg.expectedHeadCommit,
          resulting_head_commit: null,
          reason: arg.reason,
        },
        causation_id: null,
        correlation_id: `promotion:${arg.promotionId}`,
        idempotency_key: actionKey("promotion-failed-v1", {
          project_id: this.projectId,
          promotion_id: arg.promotionId,
        }),
        expected_project_revision: revision,
      }),
    );
  }
}
