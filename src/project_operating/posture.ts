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

  // G10-AC §34: MONITOR availability is derived from REAL runtime wiring. A
  // composed first-party driver (or an embedder's explicit truthful equivalence
  // declaration) makes it AVAILABLE; a bare boolean with no runtime does not.
  const monitorRuntime = input.capabilities.monitorRuntime === true;
  const monitorProvenance = input.capabilities.monitorRuntimeProvenance ?? "declared_external";
  push(
    "MONITOR",
    "modifier",
    preferredModifiers.has("MONITOR"),
    monitorRuntime
      ? "AVAILABLE"
      : input.capabilities.monitorConditionSource
        ? "AVAILABLE"
        : readinessOf(input.registry, "MONITOR") === "PREVIEW_ONLY"
          ? "PREVIEW_ONLY"
          : "UNAVAILABLE",
    monitorRuntime
      ? monitorProvenance === "first_party"
        ? "the Campaign monitor runtime is composed: a driver with an explicit tick source and a wake activation port"
        : "an equivalent external monitor runtime is declared"
      : input.capabilities.monitorConditionSource
        ? "a production condition source is declared, but no monitor driver wiring is composed for this installation"
        : "no monitor runtime is composed; the preference is retained and no scheduler is started",
  );

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
  const capabilityWarnings = Object.freeze(
    effectiveStatus
      .filter((row) => row.preferred && row.availability !== "AVAILABLE")
      .map(
        (row) =>
          `${row.capability} is preferred but ${row.availability === "PREVIEW_ONLY" ? "preview-only" : row.availability === "CONDITIONAL" ? "only conditionally available" : "unavailable"}: ${row.reason}`,
      ),
  );
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
