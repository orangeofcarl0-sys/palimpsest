/**
 * G10-V graduated project-management autonomy — the deterministic action policy.
 *
 *   Mode ≠ Authority            EffectivePermission = Authority ∩ Policy ∩ Capability
 *   No self-escalation          Downgrade is immediate
 *
 * This file owns the ONLY interpretation of the involvement levels. It is a pure
 * table lookup plus a pure evaluator: it mints no authority, opens no store and
 * performs no effect. The four authority-shaped action classes can never be
 * permitted by a mode alone — they require pre-existing semantic authority /
 * governance, which this layer can only observe, never grant.
 */

import type {
  ManagementActionClass,
  ManagementAutonomyProfile,
  ManagementInvolvement,
} from "./profile.js";

/* ------------------------------------------------------------------ *
 * Policy cells
 * ------------------------------------------------------------------ */

export const MANAGEMENT_POLICY_CELLS = [
  "explicit",
  "yes",
  "suggest",
  "no",
  "confirmation",
  "within_envelope",
  "existing_plan",
  "semantic_authority",
  "governed",
] as const;
export type ManagementPolicyCell = (typeof MANAGEMENT_POLICY_CELLS)[number];

export type ManagementActionPolicyTable = Readonly<
  Record<ManagementActionClass, Readonly<Record<ManagementInvolvement, ManagementPolicyCell>>>
>;

/**
 * The action classes that can never be permitted on mode alone.
 *
 * `CREATE_EXTERNAL_COMMITMENT`, `APPROVE_DISCLOSURE`, `EVOLVE_ORGANIZATION` and
 * `IRREVERSIBLE_EFFECT` all require an existing authority or a governance act
 * that lives OUTSIDE this layer. The evaluator refuses them unless the caller
 * attests `hasSemanticAuthority`, and the service never attests it.
 */
export const AUTHORITY_REQUIRED_ACTIONS: readonly ManagementActionClass[] = Object.freeze([
  "CREATE_EXTERNAL_COMMITMENT",
  "APPROVE_DISCLOSURE",
  "EVOLVE_ORGANIZATION",
  "IRREVERSIBLE_EFFECT",
]);

/* ------------------------------------------------------------------ *
 * The §27 policy matrix
 * ------------------------------------------------------------------ */

export const DEFAULT_ACTION_POLICY: ManagementActionPolicyTable = Object.freeze({
  OBSERVE: Object.freeze({ DIRECT: "explicit", ASSIST: "yes", MANAGE: "yes", DELEGATE: "yes" }),
  RECOMMEND: Object.freeze({ DIRECT: "explicit", ASSIST: "yes", MANAGE: "yes", DELEGATE: "yes" }),
  PREPARE: Object.freeze({ DIRECT: "explicit", ASSIST: "yes", MANAGE: "yes", DELEGATE: "yes" }),

  ADVANCE_MECHANICAL_WORK: Object.freeze({ DIRECT: "explicit", ASSIST: "no", MANAGE: "yes", DELEGATE: "yes" }),
  START_LOCAL_RECIPE: Object.freeze({ DIRECT: "explicit", ASSIST: "no", MANAGE: "yes", DELEGATE: "yes" }),
  RUN_LOCAL_VERIFY: Object.freeze({ DIRECT: "explicit", ASSIST: "no", MANAGE: "yes", DELEGATE: "yes" }),

  APPLY_LOCAL_PLAN_REVISION: Object.freeze({ DIRECT: "explicit", ASSIST: "no", MANAGE: "confirmation", DELEGATE: "within_envelope" }),
  DISPATCH_LOCAL_WORK: Object.freeze({ DIRECT: "explicit", ASSIST: "no", MANAGE: "existing_plan", DELEGATE: "yes" }),

  SEND_PEER_REQUEST: Object.freeze({ DIRECT: "explicit", ASSIST: "suggest", MANAGE: "confirmation", DELEGATE: "confirmation" }),

  CREATE_EXTERNAL_COMMITMENT: Object.freeze({ DIRECT: "semantic_authority", ASSIST: "no", MANAGE: "no", DELEGATE: "no" }),
  // DIRECT is "explicit": even an explicit operator confirmation is only a
  // boundary, the authority itself still has to exist (see the authority gate).
  APPROVE_DISCLOSURE: Object.freeze({ DIRECT: "explicit", ASSIST: "no", MANAGE: "no", DELEGATE: "no" }),

  EVOLVE_ORGANIZATION: Object.freeze({ DIRECT: "governed", ASSIST: "governed", MANAGE: "governed", DELEGATE: "governed" }),
  IRREVERSIBLE_EFFECT: Object.freeze({ DIRECT: "semantic_authority", ASSIST: "semantic_authority", MANAGE: "semantic_authority", DELEGATE: "semantic_authority" }),
});

/* ------------------------------------------------------------------ *
 * Invariant notes (asserted by tests and surfaced to operators)
 * ------------------------------------------------------------------ */

export const MANAGEMENT_POLICY_NOTES: readonly string[] = Object.freeze([
  "management mode is not authority: an involvement level never grants semantic authority",
  "effective permission is the intersection of existing semantic authority, the management policy, and capability availability",
  "an agent can never escalate its own management involvement; only the operator control port can apply a change",
  "a downgrade is immediate: proactive behaviour stops on the next policy evaluation with no grace budget",
  "the work mode (FOCUS/EXPLORE/COORDINATE plus VERIFY/MONITOR) is orthogonal to the management involvement",
  "no single autonomy score exists: permission is per action class, and the authority-shaped classes always need an existing authority",
]);

/* ------------------------------------------------------------------ *
 * Evaluator
 * ------------------------------------------------------------------ */

export interface EvaluateManagementActionInput {
  readonly profile: ManagementAutonomyProfile;
  readonly actionClass: ManagementActionClass;
  readonly hasSemanticAuthority: boolean;
  readonly capabilityAvailable: boolean;
  readonly isWithinEnvelope?: boolean | undefined;
  readonly confirmed?: boolean | undefined;
}

export interface ManagementActionEvaluation {
  readonly permitted: boolean;
  readonly requiredConfirmation: boolean;
  readonly reason: string;
}

function evaluation(permitted: boolean, requiredConfirmation: boolean, reason: string): ManagementActionEvaluation {
  return Object.freeze({ permitted, requiredConfirmation, reason });
}

/**
 * Evaluate one action class against the operator profile. Pure and total.
 *
 * Order of gates (each is a hard intersection term):
 *   1. the operator's allowed-action-class set;
 *   2. existing semantic authority for the authority-shaped classes;
 *   3. capability availability in this deployment;
 *   4. the matrix cell for (action class, involvement), with the confirmation
 *      boundary applied on top.
 */
export function evaluateManagementAction(input: EvaluateManagementActionInput): ManagementActionEvaluation {
  const { profile, actionClass } = input;
  const involvement = profile.involvement;
  const cell = DEFAULT_ACTION_POLICY[actionClass][involvement];

  if (!profile.allowedActionClasses.includes(actionClass)) {
    return evaluation(false, false, `${actionClass} is outside the operator's allowed action classes for "${profile.projectId}"`);
  }

  if (AUTHORITY_REQUIRED_ACTIONS.includes(actionClass) && !input.hasSemanticAuthority) {
    return evaluation(
      false,
      false,
      `${actionClass} requires existing semantic authority or a governance act; a management mode can never grant it, and confirmation cannot substitute`,
    );
  }

  if (!input.capabilityAvailable) {
    return evaluation(false, false, `${actionClass} requires a capability that is not available in this deployment`);
  }

  if (cell === "no") {
    return evaluation(false, false, `involvement ${involvement} never permits ${actionClass} by mode alone`);
  }
  if (cell === "suggest") {
    return evaluation(false, false, `${actionClass} is only a suggestion at ${involvement}; this layer never executes it`);
  }
  if ((cell === "within_envelope" || cell === "existing_plan") && input.isWithinEnvelope !== true) {
    return evaluation(false, false, `${actionClass} is permitted at ${involvement} only within the existing plan/envelope, and this candidate is outside it`);
  }

  const cellRequiresConfirmation = cell === "explicit" || cell === "confirmation" || cell === "governed";
  const withinBoundary = profile.confirmationBoundaries.includes(actionClass);
  const requiredConfirmation = cellRequiresConfirmation || withinBoundary;

  if (requiredConfirmation && input.confirmed !== true) {
    const why = cell === "governed" ? "requires a governance act plus explicit confirmation" : "requires an explicit confirmation";
    return evaluation(false, true, `${actionClass} at ${involvement} ${why}`);
  }

  return evaluation(true, requiredConfirmation, `${actionClass} is permitted at ${involvement} (${cell})`);
}
