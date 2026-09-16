/**
 * UX-A §6/§9/§11/§24/§26 — the NON-canonical collaboration interaction input.
 *
 *   CollaborationIntent  != WorkModePreference     (a request is not a default)
 *   CollaborationIntent  != Authority              (an intent grants nothing)
 *   CollaborationIntent  != RecipePlan             (the advisor still selects)
 *   CollaborationIntent  != AgentDefinition        (no durable agent is created)
 *   CollaborationRequest != anything canonical     (never persisted as project truth)
 *
 * This module owns NO store, NO canonical artifact and NO policy. It defines one
 * flat, strict-parsed request shape, the closed plan-view vocabulary, and a typed
 * refusal. Everything a caller may NOT supply is rejected as an unknown field
 * rather than ignored: a raw recipe id, a plan object, an agent id, a command, an
 * authority flag, a caller-supplied `PeerRef` or a caller-supplied
 * `VerificationResult` can never ride in through this seam (§9, UXA-N01).
 *
 * The only import from the semantic owners is the CLOSED task-feature vocabulary
 * (`TASK_FEATURE_NAMES` / `TASK_FEATURE_ALLOWED_VALUES`) — reading the owner's own
 * allowed-value table instead of copying it is what keeps an override honest.
 */

import type { TaskFeatureName, TaskFeatureValue } from "../organization_memory/artifacts.js";
import { TASK_FEATURE_ALLOWED_VALUES, TASK_FEATURE_NAMES } from "../organization_memory/artifacts.js";
import type { RecipeBaseMode, RecipeModifier } from "../recipes/artifacts.js";

/* ------------------------------------------------------------------ *
 * Intents
 * ------------------------------------------------------------------ */

export const COLLABORATION_INTENTS = ["AUTO", "FOCUS", "PARALLEL", "CHECK", "PARALLEL_AND_CHECK"] as const;
export type CollaborationIntent = (typeof COLLABORATION_INTENTS)[number];

/**
 * §7: an ABSENT intent is AUTO. It is never inferred from the task text here —
 * natural-language classification is a HOST concern (§10/§22).
 */
export const DEFAULT_COLLABORATION_INTENT: CollaborationIntent = "AUTO";

/* ------------------------------------------------------------------ *
 * Bounded fan-out (§26)
 * ------------------------------------------------------------------ */

/**
 * §26: reuse the existing compiler bound where one exists and refuse anything
 * outside the range the product is willing to pay for. `MIN_BRANCH_HINT` is the
 * compiler's OWN minimum (`src/recipes/compiler.ts`: a safe integer >= 2) and
 * `MAX_BRANCH_HINT` is UX-A's explicit ceiling, because the compiler has NO
 * maximum today (see the UX-A gap assessment §8.4). An out-of-range hint is
 * REFUSED with a typed error — it is never clamped, and there is no default
 * fan-out above the compiler minimum.
 */
export const MIN_BRANCH_HINT = 2;
export const MAX_BRANCH_HINT = 8;
/** The branch count a plan uses when the request carries no hint. */
export const DEFAULT_BRANCH_COUNT = MIN_BRANCH_HINT;

/* ------------------------------------------------------------------ *
 * Typed refusal
 * ------------------------------------------------------------------ */

/**
 * The CLOSED set of interaction refusals. A refusal is a statement about the
 * REQUEST or about this installation's configuration — never a semantic result
 * (§28): a request that cannot be parsed never becomes a `CAPABILITY_REQUIRED`
 * or `PARTIAL` outcome, and it never silently degrades.
 */
export const COLLABORATION_ERROR_REASONS = [
  "invalid_request",
  "invalid_branch_count",
  "invalid_intent",
  "not_configured",
] as const;
export type CollaborationErrorReason = (typeof COLLABORATION_ERROR_REASONS)[number];

export class CollaborationError extends Error {
  constructor(
    readonly reason: CollaborationErrorReason,
    message: string,
  ) {
    super(message);
    this.name = "CollaborationError";
  }

  /**
   * The SAME value as `reason`, under the name the shared HTTP error mapper reads
   * (`applicationErrorStatus` switches on `kind`). Without it a malformed request
   * was answered 500 — a server fault — when the fault is the caller's, so the
   * route's own "refused (400)" contract did not hold. `not_configured` keeps no
   * `invalid_` prefix and therefore still maps to 500: an unconfigured deployment
   * IS a server-side condition.
   */
  get kind(): CollaborationErrorReason {
    return this.reason;
  }
}

/* ------------------------------------------------------------------ *
 * CollaborationRequest (§9)
 * ------------------------------------------------------------------ */

export interface CollaborationRequest {
  /** The task in the user's words. Used as the objective/branch question. */
  readonly task: string;
  /** §6/§7: absent ⇒ `DEFAULT_COLLABORATION_INTENT` (AUTO). Never persisted. */
  readonly intent: CollaborationIntent;
  /**
   * §9: caller/user-declared feature values. Provenance is `USER_DECLARED` and an
   * explicit value WINS over an untrusted profiler proposal — but a profile is
   * still only a suggestion the advisor reads, never a chooser.
   */
  readonly taskProfileOverrides?: Readonly<Partial<Record<TaskFeatureName, TaskFeatureValue>>> | undefined;
  /** §25/§26: an ADVANCED, BOUNDED hint. Never a primary "agents: 1..20" control. */
  readonly branchCountHint?: number | undefined;
  /**
   * §9/§20: the REGISTERED verifier ref a CHECK may bind. It selects a registered
   * protocol; it can never supply a verdict, a command or an independence class.
   */
  readonly verifierRef?: string | undefined;
  readonly requestedBy: string;
}

const REQUEST_KEYS = [
  "task",
  "intent",
  "taskProfileOverrides",
  "branchCountHint",
  "verifierRef",
  "requestedBy",
] as const;

function nonEmptyString(value: unknown, what: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new CollaborationError("invalid_request", `${what} must be a non-empty string`);
  }
  return value;
}

function parseOverrides(raw: unknown, what: string): Readonly<Partial<Record<TaskFeatureName, TaskFeatureValue>>> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new CollaborationError("invalid_request", `${what} must be an object`);
  }
  const overrides: Partial<Record<TaskFeatureName, TaskFeatureValue>> = {};
  for (const [feature, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!(TASK_FEATURE_NAMES as readonly string[]).includes(feature)) {
      throw new CollaborationError("invalid_request", `${what}: unknown task feature "${feature}"`);
    }
    const name = feature as TaskFeatureName;
    if (typeof value !== "string" || !(TASK_FEATURE_ALLOWED_VALUES[name] as readonly string[]).includes(value)) {
      throw new CollaborationError(
        "invalid_request",
        `${what}.${feature} must be one of ${TASK_FEATURE_ALLOWED_VALUES[name].join(", ")}`,
      );
    }
    overrides[name] = value as TaskFeatureValue;
  }
  return Object.freeze(overrides);
}

/**
 * Strict parse. Fails closed on an unknown field, an empty task, an empty
 * `requestedBy`, a non-integer or out-of-range `branchCountHint`, an unknown
 * intent, an unknown feature name, or a disallowed feature value.
 */
export function parseCollaborationRequest(raw: unknown, what = "CollaborationRequest"): CollaborationRequest {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new CollaborationError("invalid_request", `${what} must be an object`);
  }
  // MAJOR-review MINOR-6: the refusal is TOTAL, not merely own-enumerable. A
  // prototype-carried or non-enumerable key would otherwise be read (inherited
  // `task`/`intent` were accepted and USED) or silently ignored, so the input must
  // be a plain object and EVERY own key — enumerable or not — must be known.
  const prototype: unknown = Object.getPrototypeOf(raw);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new CollaborationError(
      "invalid_request",
      `${what} must be a plain object; an instance with a prototype is refused so an inherited field can never stand in for a declared one`,
    );
  }
  const object = raw as Record<string, unknown>;
  for (const key of Object.getOwnPropertyNames(object)) {
    if (!(REQUEST_KEYS as readonly string[]).includes(key)) {
      throw new CollaborationError("invalid_request", `${what}: unknown field "${key}"`);
    }
  }
  const task = nonEmptyString(object.task, `${what}.task`);
  const requestedBy = nonEmptyString(object.requestedBy, `${what}.requestedBy`);

  let intent: CollaborationIntent = DEFAULT_COLLABORATION_INTENT;
  if (object.intent !== undefined) {
    if (typeof object.intent !== "string" || !(COLLABORATION_INTENTS as readonly string[]).includes(object.intent)) {
      throw new CollaborationError("invalid_intent", `${what}.intent must be one of ${COLLABORATION_INTENTS.join(", ")}`);
    }
    intent = object.intent as CollaborationIntent;
  }

  let branchCountHint: number | undefined;
  if (object.branchCountHint !== undefined) {
    const value = object.branchCountHint;
    if (
      typeof value !== "number" ||
      !Number.isSafeInteger(value) ||
      value < MIN_BRANCH_HINT ||
      value > MAX_BRANCH_HINT
    ) {
      throw new CollaborationError(
        "invalid_branch_count",
        `${what}.branchCountHint must be a safe integer between ${MIN_BRANCH_HINT} and ${MAX_BRANCH_HINT}; ` +
          `"${String(value)}" is refused rather than clamped`,
      );
    }
    branchCountHint = value;
  }

  let verifierRef: string | undefined;
  if (object.verifierRef !== undefined) {
    verifierRef = nonEmptyString(object.verifierRef, `${what}.verifierRef`);
  }

  const overrides = object.taskProfileOverrides === undefined
    ? undefined
    : parseOverrides(object.taskProfileOverrides, `${what}.taskProfileOverrides`);

  return Object.freeze({
    task,
    intent,
    ...(overrides === undefined ? {} : { taskProfileOverrides: overrides }),
    ...(branchCountHint === undefined ? {} : { branchCountHint }),
    ...(verifierRef === undefined ? {} : { verifierRef }),
    requestedBy,
  });
}

/* ------------------------------------------------------------------ *
 * CollaborationPlanView (§11) + user-visible verbs (§24)
 * ------------------------------------------------------------------ */

export const COLLABORATION_EXECUTION_KINDS = [
  "PRINCIPAL_CONTINUES",
  "LOCAL_EXPLORE",
  "LOCAL_VERIFY",
  "LOCAL_EXPLORE_AND_VERIFY",
  "CROSS_PROJECT_REQUIRED",
  "CAPABILITY_REQUIRED",
  /**
   * §28: an INFRASTRUCTURE failure. It is a member of this vocabulary only so an
   * error envelope cannot be mistaken for a structural verdict — it is never a
   * plan, and `plan()` never returns it (a read that cannot be derived rejects
   * instead of inventing a structure).
   */
  "ERROR",
] as const;
export type CollaborationExecutionKind = (typeof COLLABORATION_EXECUTION_KINDS)[number];

/**
 * §24: the primary copy is what a user would say, not the internal mode name.
 * These are labels for the SAME structure — they neither add nor remove authority.
 */
export const COLLABORATION_VERBS: Readonly<Record<CollaborationExecutionKind, string>> = Object.freeze({
  PRINCIPAL_CONTINUES: "Do it",
  LOCAL_EXPLORE: "Explore alternatives",
  // UX-C §14/SC-10: CHECK verifies the EXACT CURRENT PROJECT HEAD, never the Explore
  // findings. The verb says so instead of implying an independent check of findings.
  LOCAL_VERIFY: "Verify current project head",
  LOCAL_EXPLORE_AND_VERIFY: "Explore alternatives locally, then verify the current project head",
  CROSS_PROJECT_REQUIRED: "Needs another project (not available here yet)",
  CAPABILITY_REQUIRED: "Not available in this deployment",
  ERROR: "Could not be started",
});

/**
 * §11: a concise, READ-ONLY derivation. `effectiveBaseMode` and `modifiers` are
 * the existing recipe vocabulary (FOCUS/EXPLORE/COORDINATE and VERIFY/MONITOR) —
 * UX-A introduces NO new mode taxonomy and NO new RecipePlan truth.
 */
export interface CollaborationPlanView {
  readonly task: string;
  readonly requestedIntent: CollaborationIntent;
  readonly effectiveBaseMode: RecipeBaseMode;
  readonly modifiers: readonly RecipeModifier[];
  /** Plain-language statements of what was consulted and what it said. */
  readonly reason: readonly string[];
  /** Only present when a capability the plan needs is NOT usable here. */
  readonly capabilityWarnings: readonly string[];
  readonly executionKind: CollaborationExecutionKind;
  /** §24: the user-visible verb for this plan. */
  readonly verb: string;
  /**
   * §14: the EXISTING peers this plan would have to reach, present only for
   * `CROSS_PROJECT_REQUIRED`. They come from the advisor's own recommendation
   * (`existingSubjectRefs`) — UX-A names them so the read-only plan is actionable as
   * the UX-B handoff seam, and it contacts none of them.
   */
  readonly peers?: readonly string[] | undefined;
}

/**
 * §5 of the UX-A audit: the recipe `readiness` literal is hand-written, so the
 * DERIVED truth is the posture's `availability` row. This is the ONE rendering of
 * that pair, so a plan cannot claim a mode is ready when the deployment has no
 * runtime — and it always NAMES the capability.
 */
export function capabilityAvailabilityWarning(capability: string, availability: string, reason: string): string {
  return `capability "${capability}" is ${availability} in this deployment: ${reason}`;
}
