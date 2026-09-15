/**
 * G10-AB — Project Operating Posture (derived view).
 *
 *   WorkModePreference ⟂ ManagementInvolvement
 *   OperatingPosture ≠ Authority, ≠ RecipePlan, ≠ Execution, ≠ OrganizationDefinition
 *
 * Two orthogonal axes, never collapsed into one scalar autonomy level. This view
 * owns no truth: it derives the work-mode half from the stored operator
 * preference plus the current RecipeRegistry and configured capabilities, and the
 * management half from the existing management profile and action policy.
 *
 * Crucial distinction (§7): the PREFERRED posture is not the same as the
 * currently AVAILABLE/EFFECTIVE capabilities. A preference is never silently
 * removed, and an unavailable capability is never presented as active.
 */

import { DEFAULT_ACTION_POLICY } from "../project_management/policy.js";
import {
  MANAGEMENT_ACTION_CLASSES,
  type ManagementActionClass,
  type ManagementAutonomyProfile,
  type ManagementInvolvement,
} from "../project_management/profile.js";
import type { RecipeDefinition, RecipeReadiness } from "../recipes/index.js";
import {
  isWorkModeModifier,
  type EffectiveWorkModePreference,
  type MonitorRuntimeCapabilityView,
  type WorkModeBaseMode,
  type WorkModeCapabilityInputs,
  type WorkModeModifier,
} from "./work_mode_profile.js";

/** The five builtin recipes, by the mode each expresses. */
export const WORK_MODE_RECIPE_IDS: Readonly<Record<WorkModeBaseMode | WorkModeModifier, string>> =
  Object.freeze({
    FOCUS: "focus.v1",
    EXPLORE: "explore.v1",
    COORDINATE: "coordinate.v1",
    VERIFY: "verify.v1",
    MONITOR: "monitor.v1",
  });

export type WorkModeCapabilityRole = "base" | "modifier";

export interface EffectiveModeStatus {
  readonly capability: WorkModeBaseMode | WorkModeModifier;
  readonly role: WorkModeCapabilityRole;
  /** Whether the operator's stored preference selects this capability. */
  readonly preferred: boolean;
  readonly readiness: RecipeReadiness;
  /** AVAILABLE means the stored preference can actually take effect today. */
  readonly availability: "AVAILABLE" | "CONDITIONAL" | "PREVIEW_ONLY" | "UNAVAILABLE";
  readonly reason: string;
}

export interface PostureHistorySummary {
  readonly changes: number;
  readonly lastChange: {
    readonly at: string;
    readonly updatedBy: string;
    readonly from: string;
    readonly to: string;
  } | null;
}

export interface ProjectOperatingPostureView {
  readonly projectId: string;
  readonly workMode: {
    readonly preferred: {
      readonly baseMode: WorkModeBaseMode;
      readonly modifiers: readonly WorkModeModifier[];
      readonly updatedAt: string;
      readonly updatedBy: string;
      readonly digest: string;
      /** `safe_default` means NO stored preference was usable - say so (§38). */
      readonly source: "stored" | "safe_default";
      readonly degradedReason?: string | undefined;
    };
    readonly effectiveStatus: readonly EffectiveModeStatus[];
    readonly capabilityWarnings: readonly string[];
    readonly historySummary: PostureHistorySummary;
  };
  readonly management: {
    readonly profile: ManagementAutonomyProfile;
    readonly involvement: ManagementInvolvement;
    /** Action classes this involvement may perform WITHOUT a confirmation. */
    readonly automaticActionClasses: readonly ManagementActionClass[];
    /** Action classes this involvement must have confirmed. */
    readonly confirmationBoundaries: readonly ManagementActionClass[];
    readonly historySummary: PostureHistorySummary;
  };
}

/** Readiness of the recipe expressing a mode, or UNAVAILABLE when none exists. */
function readinessOf(
  registry: { get(recipeId: string): RecipeDefinition | undefined },
  capability: WorkModeBaseMode | WorkModeModifier,
): RecipeReadiness {
  const definition = registry.get(WORK_MODE_RECIPE_IDS[capability]);
  return definition === undefined ? "UNAVAILABLE" : definition.readiness;
}

/**
 * G10-AC-R §5: the ONE availability table for a monitor runtime, over the
 * STRUCTURAL capability view.
 *
 * This lives here (not in `src/monitor/driver.ts`) and the driver imports it:
 * `project_operating` must never import the monitor driver (the driver imports
 * the work-mode port), while the driver already depends on `project_operating`.
 * This direction is the only one that avoids a
 * `project_operating -> monitor -> project_operating` cycle, and it guarantees
 * the driver and the posture can never disagree.
 *
 * Branches (in order):
 *  - no capability composed            → PREVIEW_ONLY (no runtime exists)
 *  - startState FAILED                 → UNAVAILABLE, with the start error
 *  - tick + activation, RUNNING        → AVAILABLE
 *  - tick + activation, not RUNNING    → CONDITIONAL, naming the current state
 *  - exactly one of tick/activation    → CONDITIONAL, naming precisely what is
 *                                        missing (a tick with no real host wake
 *                                        adapter, or an adapter with no tick)
 *  - scope only (neither)              → UNAVAILABLE ("scope only")
 */
export function monitorAvailabilityOf(capability: MonitorRuntimeCapabilityView | undefined): {
  readonly availability: EffectiveModeStatus["availability"];
  readonly reason: string;
} {
  if (capability === undefined) {
    return Object.freeze({
      availability: "PREVIEW_ONLY" as const,
      reason: "no monitor runtime is composed; the preference is retained and no scheduler is started",
    });
  }
  if (capability.startState === "FAILED") {
    return Object.freeze({
      availability: "UNAVAILABLE" as const,
      reason: `the monitor tick source failed to start: ${
        capability.startError ?? "unknown error"
      }; automatic monitoring is not running`,
    });
  }
  if (capability.tickSourceConfigured && capability.activationConfigured) {
    if (capability.startState === "RUNNING") {
      return Object.freeze({
        availability: "AVAILABLE" as const,
        reason:
          "the Campaign monitor runtime is composed and running: a driver with an explicit tick source and a real host wake activation adapter",
      });
    }
    return Object.freeze({
      availability: "CONDITIONAL" as const,
      reason: `the Campaign monitor runtime is fully wired but its start state is ${capability.startState}; it becomes available once the tick source is RUNNING`,
    });
  }
  if (capability.tickSourceConfigured) {
    return Object.freeze({
      availability: "CONDITIONAL" as const,
      reason:
        "a monitor tick source is configured but no real host wake activation adapter is bound (the null/pull adapter only records signals); no host can be autonomously woken",
    });
  }
  if (capability.activationConfigured) {
    return Object.freeze({
      availability: "CONDITIONAL" as const,
      reason: `a host wake activation adapter is bound but no monitor tick source is configured (start state ${capability.startState}); only manual/debug ticks can evaluate watches`,
    });
  }
  return Object.freeze({
    availability: "UNAVAILABLE" as const,
    reason: "scope only: a manual/debug driver at most; no autonomous monitoring",
  });
}

/** The preferred-but-not-available warnings for one effective-status list. */
function capabilityWarningsOf(
  effectiveStatus: readonly EffectiveModeStatus[],
): readonly string[] {
  return Object.freeze(
    effectiveStatus
      .filter((row) => row.preferred && row.availability !== "AVAILABLE")
      .map(
        (row) =>
          `${row.capability} is preferred but ${row.availability === "PREVIEW_ONLY" ? "preview-only" : row.availability === "CONDITIONAL" ? "only conditionally available" : "unavailable"}: ${row.reason}`,
      ),
  );
}

/**
 * G10-AC-R §5: apply a LIVE runtime capability to an already-derived posture view.
 *
 * The install composes the monitor AFTER the management service, and
 * `makeProjectManagementService`'s capability resolver forwards only a fixed set
 * of declared fields, so the live capability cannot ride through that seam. This
 * wrapper lets the install replace the MONITOR row on the derived view with the
 * honest value from the same table - no other row or field moves.
 */
export function withMonitorRuntimeCapability(
  view: ProjectOperatingPostureView,
  capability: MonitorRuntimeCapabilityView | undefined,
): ProjectOperatingPostureView {
  if (capability === undefined) return view;
  const mapped = monitorAvailabilityOf(capability);
  const effectiveStatus = Object.freeze(
    view.workMode.effectiveStatus.map((row) =>
      row.capability === "MONITOR"
        ? Object.freeze({ ...row, availability: mapped.availability, reason: mapped.reason })
        : row,
    ),
  );
  return Object.freeze({
    ...view,
    workMode: Object.freeze({
      ...view.workMode,
      effectiveStatus,
      capabilityWarnings: capabilityWarningsOf(effectiveStatus),
    }),
  });
}

/**
 * The EFFECTIVE status of one preferred capability. Readiness alone is not
 * availability: EXPLORE needs reasoning branches to exist, VERIFY needs a
 * genuine independent verifier (same-model same-context is not verification),
 * COORDINATE needs a real already-independent peer, MONITOR needs a production
 * condition source.
 */
export function deriveEffectiveModeStatus(input: {
  readonly preference: EffectiveWorkModePreference;
  readonly registry: { get(recipeId: string): RecipeDefinition | undefined };
  readonly capabilities: WorkModeCapabilityInputs;
}): readonly EffectiveModeStatus[] {
  const preferredBase = input.preference.preference.baseMode;
  const preferredModifiers = new Set(input.preference.preference.modifiers);
  const rows: EffectiveModeStatus[] = [];

  const push = (
    capability: WorkModeBaseMode | WorkModeModifier,
    role: WorkModeCapabilityRole,
    preferred: boolean,
    availability: EffectiveModeStatus["availability"],
    reason: string,
  ): void => {
    rows.push(
      Object.freeze({
        capability,
        role,
        preferred,
        readiness: readinessOf(input.registry, capability),
        availability,
        reason,
      }),
    );
  };

  // FOCUS is always available: it is the conventional single-agent anchor.
  push(
    "FOCUS",
    "base",
    preferredBase === "FOCUS",
    "AVAILABLE",
    "the conventional single-agent path; always available",
  );

  push(
    "EXPLORE",
    "base",
    preferredBase === "EXPLORE",
    input.capabilities.reasoningBranches
      ? readinessOf(input.registry, "EXPLORE") === "PRODUCTION_READY"
        ? "AVAILABLE"
        : "CONDITIONAL"
      : "UNAVAILABLE",
    input.capabilities.reasoningBranches
      ? "local cognitive branching is available"
      : "no reasoning-branch execution port is configured",
  );

  push(
    "COORDINATE",
    "base",
    preferredBase === "COORDINATE",
    input.capabilities.independentPeer ? "AVAILABLE" : "UNAVAILABLE",
    input.capabilities.independentPeer
      ? "an already-independent sovereign peer is available"
      : "no genuine independent peer exists; the preference is retained but currently ineligible",
  );

  push(
    "VERIFY",
    "modifier",
    preferredModifiers.has("VERIFY"),
    input.capabilities.independentVerifier ? "AVAILABLE" : "UNAVAILABLE",
    input.capabilities.independentVerifier
      ? "an independent verification capability is configured"
      : "no independent verifier is configured; same-model same-context is not verification",
  );

  // G10-AC §34 + AC-R §5: MONITOR availability is derived from REAL runtime
  // wiring. A LIVE capability (when present) is AUTHORITATIVE and is mapped
  // through the ONE shared table. The older declared fields remain as fallbacks,
  // but a bare `monitorRuntime: true` is NO LONGER a claim of availability: a
  // declaration without tick/activation detail is only CONDITIONAL.
  const monitorCapability = input.capabilities.monitorRuntimeCapability;
  let monitorAvailability: EffectiveModeStatus["availability"];
  let monitorReason: string;
  if (monitorCapability !== undefined) {
    const mapped = monitorAvailabilityOf(monitorCapability);
    monitorAvailability = mapped.availability;
    monitorReason = mapped.reason;
  } else if (input.capabilities.monitorRuntime === true) {
    monitorAvailability = "CONDITIONAL";
    monitorReason =
      "a monitor runtime is declared without tick/activation detail; a bare declaration cannot prove an autonomous runtime";
  } else if (input.capabilities.monitorConditionSource) {
    monitorAvailability = "AVAILABLE";
    monitorReason =
      "a production condition source is declared, as an explicit equivalence claim for an external monitor implementation";
  } else if (readinessOf(input.registry, "MONITOR") === "PREVIEW_ONLY") {
    monitorAvailability = "PREVIEW_ONLY";
    monitorReason = "no monitor runtime is composed; the preference is retained and no scheduler is started";
  } else {
    monitorAvailability = "UNAVAILABLE";
    monitorReason = "no monitor runtime is composed; the preference is retained and no scheduler is started";
  }
  push("MONITOR", "modifier", preferredModifiers.has("MONITOR"), monitorAvailability, monitorReason);

  return Object.freeze(rows);
}

/** Action classes the involvement may perform without confirmation. */
export function automaticActionClassesOf(
  involvement: ManagementInvolvement,
): readonly ManagementActionClass[] {
  return Object.freeze(
    MANAGEMENT_ACTION_CLASSES.filter(
      (actionClass) => DEFAULT_ACTION_POLICY[actionClass][involvement] === "yes",
    ),
  );
}

/** Action classes the involvement must have confirmed. */
export function confirmationBoundariesOf(
  involvement: ManagementInvolvement,
): readonly ManagementActionClass[] {
  return Object.freeze(
    MANAGEMENT_ACTION_CLASSES.filter((actionClass) =>
      ["confirmation", "within_envelope", "explicit", "semantic_authority", "existing_plan", "governed", "suggest"].includes(
        DEFAULT_ACTION_POLICY[actionClass][involvement],
      ),
    ),
  );
}

function historySummaryOf(
  entries: readonly {
    readonly at: string;
    readonly updatedBy: string;
    readonly fromBaseMode?: string | undefined;
    readonly toBaseMode?: string | undefined;
    readonly fromInvolvement?: string | undefined;
    readonly toInvolvement?: string | undefined;
  }[],
): PostureHistorySummary {
  const sorted = [...entries].sort((left, right) => (left.at < right.at ? -1 : left.at > right.at ? 1 : 0));
  const last = sorted.at(-1);
  return Object.freeze({
    changes: entries.length,
    lastChange:
      last === undefined
        ? null
        : Object.freeze({
            at: last.at,
            updatedBy: last.updatedBy,
            from: String(last.fromBaseMode ?? last.fromInvolvement ?? ""),
            to: String(last.toBaseMode ?? last.toInvolvement ?? ""),
          }),
  });
}

export function buildProjectOperatingPostureView(input: {
  readonly projectId: string;
  readonly preference: EffectiveWorkModePreference;
  readonly registry: { get(recipeId: string): RecipeDefinition | undefined };
  readonly capabilities: WorkModeCapabilityInputs;
  readonly profile: ManagementAutonomyProfile;
  readonly workModeHistory: readonly {
    readonly at: string;
    readonly updatedBy: string;
    readonly fromBaseMode: string;
    readonly toBaseMode: string;
  }[];
  readonly managementHistory: readonly {
    readonly at: string;
    readonly updatedBy: string;
    readonly fromInvolvement: string;
    readonly toInvolvement: string;
  }[];
}): ProjectOperatingPostureView {
  const effectiveStatus = deriveEffectiveModeStatus({
    preference: input.preference,
    registry: input.registry,
    capabilities: input.capabilities,
  });
  const capabilityWarnings = capabilityWarningsOf(effectiveStatus);
  const { preference } = input.preference;
  return Object.freeze({
    projectId: input.projectId,
    workMode: Object.freeze({
      preferred: Object.freeze({
        baseMode: preference.baseMode,
        modifiers: Object.freeze([...preference.modifiers]),
        updatedAt: preference.updatedAt,
        updatedBy: preference.updatedBy,
        digest: preference.digest,
        source: input.preference.source,
        ...(input.preference.degradedReason === undefined
          ? {}
          : { degradedReason: input.preference.degradedReason }),
      }),
      effectiveStatus,
      capabilityWarnings,
      historySummary: historySummaryOf(input.workModeHistory),
    }),
    management: Object.freeze({
      profile: input.profile,
      involvement: input.profile.involvement,
      automaticActionClasses: automaticActionClassesOf(input.profile.involvement),
      confirmationBoundaries: confirmationBoundariesOf(input.profile.involvement),
      historySummary: historySummaryOf(input.managementHistory),
    }),
  });
}

/** Convenience: is this modifier both preferred and effectively available? */
export function modifierIsEffectivelyActive(
  view: ProjectOperatingPostureView,
  modifier: WorkModeModifier,
): boolean {
  if (!isWorkModeModifier(modifier)) return false;
  const row = view.workMode.effectiveStatus.find((entry) => entry.capability === modifier);
  return row !== undefined && row.preferred && row.availability === "AVAILABLE";
}
