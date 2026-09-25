/**
 * PLMP-LEAN-1 §D4-0 — THE AUTHORITY SPLIT.
 *
 *     SpeculativeMutationAuthority  ≠  CanonicalMutationAuthority
 *
 * D2 introduced "exactly one mutating Work line", and the reason it gave was about DIVERGENCE: two writers
 * mutating one tree is corruption. That reasoning is correct for an IN-PLACE lane, where the attempt's tree
 * IS the canonical tree. It is too strong for a PLACED lane, where the attempt owns an isolated
 * `ExecutionWorld` and canonical source is untouched until Promotion authority accepts a result.
 *
 * D2 therefore merged two authorities that are not the same thing:
 *
 *   SPECULATIVE_WORLD    may this attempt own an isolated world?      per-attempt, placement-scoped
 *   CANONICAL_SOURCE     may this result change canonical source?     one at a time, Promotion only
 *
 * A project-wide "one nonterminal attempt" rule conflates them: it uses the canonical-source authority to
 * forbid speculative worlds, which is why the product could not produce two results concurrently even
 * though D3 can now carry two results from one basis into a serializable canonical history.
 *
 * WHAT REPLACES IT. The scheduler's DECLARED task concurrency. How many tasks may be ACTIVE is a property
 * the plan declares (`StageGraphDefinition.concurrency`), and a hardcoded product-wide 1 silently overrode
 * it. So this rule defers to the scheduler's own decision, and concurrency becomes declarative rather than
 * forbidden:
 *
 *     declared concurrency 1  →  one ACTIVE task, and a second is refused BY THE SCHEDULER
 *     declared concurrency N  →  N tasks may hold speculative worlds at once
 *
 * IN-PLACE IS UNCHANGED, and deliberately so: it keeps strict single-writer, because there the speculative
 * world and the canonical source ARE the same tree. That check lives at `claim()`, where it always did.
 *
 * Layer: L1 (domain), beside `world_basis.ts`. NOT re-exported from the domain barrel — the public surface
 * is sealed, so this adds no package name.
 */
import { DomainValidationError } from "./errors.js";

/** The two mutation authorities, named so a rule can say WHICH one it is enforcing. */
export const MUTATION_AUTHORITIES = ["SPECULATIVE_WORLD", "CANONICAL_SOURCE"] as const;
export type MutationAuthority = (typeof MUTATION_AUTHORITIES)[number];

/** One attempt that still holds a work position. */
export interface NonterminalAttempt {
  readonly attemptId: string;
  readonly taskId: string;
  readonly state: string;
}

/** The scheduler's own next decision, as the controller reads it. */
export interface SchedulerDecisionView {
  readonly decision: "idle" | "paused" | "next";
  readonly eventType?: string | undefined;
  readonly entityId?: string | undefined;
}

export interface SpeculativeLaneRequest {
  readonly placement: "in-place" | "worktree";
  /** The caller's ASSERTION about which task it means; never a scheduling command. */
  readonly requestedTaskId: string | undefined;
  readonly nonterminal: readonly NonterminalAttempt[];
  readonly schedulerDecision: SchedulerDecisionView;
}

export type SpeculativeAdmission =
  /** The requested work already holds a position: nothing is re-claimed and no second world is made. */
  | { readonly kind: "RESUME"; readonly taskId: string; readonly attemptId: string }
  /** The scheduler makes this task next, so it may open a speculative world. */
  | { readonly kind: "START"; readonly taskId: string }
  /** Refused, with the code and detail the caller should see. */
  | { readonly kind: "REFUSE"; readonly code: string; readonly detail: string };

/**
 * May this request open (or resume) a SPECULATIVE world?
 *
 * The rule is deliberately small, because the interesting content is the ORDER of its checks: a resume is
 * decided before the scheduler is consulted at all, and the scheduler is the only thing that decides
 * whether a NEW position may open.
 */
export function assessSpeculativeAdmission(request: SpeculativeLaneRequest): SpeculativeAdmission {
  const { placement, requestedTaskId, nonterminal, schedulerDecision } = request;

  /**
   * IN-PLACE keeps the canonical-source authority: the lane and the project tree are one object, so a
   * second writer is corruption rather than concurrency. Reported as a REFUSAL with the canonical-source
   * reason, so a caller can tell WHICH authority refused it.
   */
  if (placement === "in-place") {
    return {
      kind: "REFUSE",
      code: "CANONICAL_SOURCE_IS_THE_LANE",
      detail:
        "this deployment works in the canonical tree (in-place), where the work lane and the canonical source are the SAME object — a second mutating line would be two writers on one tree, so in-place keeps strict single-writer and a placed deployment is what allows speculative worlds",
    };
  }

  // A request that names a task resumes THAT task's position, whatever else is in flight. This is the
  // retry path, and it must not depend on how many other speculative worlds exist.
  if (requestedTaskId !== undefined) {
    const held = nonterminal.filter((attempt) => attempt.taskId === requestedTaskId);
    if (held.length > 1) {
      return {
        kind: "REFUSE",
        code: "MULTIPLE_POSITIONS_FOR_ONE_TASK",
        detail: `task "${requestedTaskId}" holds ${String(held.length)} nonterminal positions (${held.map((attempt) => attempt.attemptId).join(", ")}) — a task with two open positions is a diverged work line, and this refuses rather than picking one`,
      };
    }
    const holder = held[0];
    if (holder !== undefined) return { kind: "RESUME", taskId: holder.taskId, attemptId: holder.attemptId };
  } else if (nonterminal.length === 1) {
    /**
     * EXACTLY ONE position in flight, and the caller named no task: resume it.
     *
     * This is the retry path, and it is why the ambiguity rule below is a threshold rather than a
     * requirement to name a task: a crash between `ATTEMPT_CREATED` and the claim leaves one position that
     * a retry must find, and demanding a name would turn a recoverable retry into a refusal. With one
     * position there is no ambiguity to resolve.
     */
    const only = nonterminal[0]!;
    return { kind: "RESUME", taskId: only.taskId, attemptId: only.attemptId };
  } else if (nonterminal.length > 1) {
    /**
     * Several positions in flight and no name given: no single answer exists, and guessing would be the
     * one thing this must not do. Naming the task is the honest remedy.
     */
    return {
      kind: "REFUSE",
      code: "SPECULATIVE_LANE_AMBIGUOUS",
      detail: `${String(nonterminal.length)} speculative worlds are in flight (${nonterminal.map((attempt) => `${attempt.taskId}@${attempt.state}`).join(", ")}) — name the task with expectedTaskId; a request that names no task has no single position to resume`,
    };
  }

  /**
   * A NEW position is the SCHEDULER's decision, not this rule's. With the declared concurrency exhausted
   * the scheduler reports `idle`, and that is the refusal — which is what makes concurrency a property the
   * PLAN declares rather than a number the product hardcodes.
   */
  if (schedulerDecision.decision !== "next" || schedulerDecision.eventType !== "TASK_STARTED" || schedulerDecision.entityId === undefined) {
    return {
      kind: "REFUSE",
      code: "TASK_NOT_NEXT_SCHEDULABLE",
      detail: `the scheduler's next decision is ${schedulerDecision.decision === "next" ? String(schedulerDecision.eventType) : schedulerDecision.decision} — a mutating delegation bootstraps the task the project itself makes next, and it never reorders, holds or skips work to reach another one`,
    };
  }

  const taskId = schedulerDecision.entityId;
  if (requestedTaskId !== undefined && taskId !== requestedTaskId) {
    return {
      kind: "REFUSE",
      code: "TASK_NOT_NEXT_SCHEDULABLE",
      detail: `the scheduler's next task is "${taskId}", not the requested "${requestedTaskId}" — expectedTaskId is an assertion, not a scheduling command`,
    };
  }
  return { kind: "START", taskId };
}

/** The typed refusal, so both controller entrances report the same code and detail. */
export function speculativeAdmissionRefusal(admission: Extract<SpeculativeAdmission, { kind: "REFUSE" }>): DomainValidationError {
  return new DomainValidationError(`${admission.code}: ${admission.detail}`);
}
