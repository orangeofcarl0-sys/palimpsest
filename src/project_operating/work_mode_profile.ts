/**
 * G10-AB — Project Work Mode preference.
 *
 * The user's DEFAULT preferred way of organizing eligible work in this project.
 * A preference, never authority:
 *
 *   OperatingPosture   ≠ Authority
 *   OperatingPosture   ≠ RecipePlan
 *   OperatingPosture   ≠ Execution
 *   OperatingPosture   ≠ OrganizationDefinition
 *   WorkModePreference ⟂ ManagementInvolvement
 *
 * It does NOT mean every task must use that topology, that all work executes a
 * recipe, that COORDINATE creates a peer, that EXPLORE always branches, that
 * VERIFY becomes independent, or that MONITOR becomes a background scheduler.
 *
 * Only the SEMANTIC mode is stored; the recipe is resolved through the current
 * registry at execution time, so no permanent CompiledRecipePlan is persisted.
 */

import { canonicalDigest } from "../schema/canonical.js";
import { DomainValidationError } from "../domain/errors.js";

export const WORK_MODE_BASE_MODES = ["FOCUS", "EXPLORE", "COORDINATE"] as const;
export type WorkModeBaseMode = (typeof WORK_MODE_BASE_MODES)[number];

export const WORK_MODE_MODIFIERS = ["VERIFY", "MONITOR"] as const;
export type WorkModeModifier = (typeof WORK_MODE_MODIFIERS)[number];

export const WORK_MODE_PREFERENCE_DIGEST_DOMAIN = "palimpsest.project-work-mode-preference.v1";

/**
 * The safe default (§4): the conventional single-agent compatibility anchor.
 * Used when the preference is absent, lost, unreadable, or malformed.
 */
export const DEFAULT_WORK_MODE_BASE: WorkModeBaseMode = "FOCUS";
export const DEFAULT_WORK_MODE_MODIFIERS: readonly WorkModeModifier[] = Object.freeze([]);

export interface ProjectWorkModePreference {
  readonly schemaVersion: 1;
  readonly projectId: string;
  readonly baseMode: WorkModeBaseMode;
  /** Sorted, deduplicated. Absent modifiers = no modifiers. */
  readonly modifiers: readonly WorkModeModifier[];
  readonly updatedAt: string;
  readonly updatedBy: string;
  readonly digest: string;
}

/**
 * Where a preference came from. `safe_default` is not an error: it is the
 * honest statement that no stored preference was usable, and the UI must say so
 * rather than presenting FOCUS as a user choice (§38).
 */
export type WorkModePreferenceSource = "stored" | "safe_default";

export interface EffectiveWorkModePreference {
  readonly preference: ProjectWorkModePreference;
  readonly source: WorkModePreferenceSource;
  /** Present when the stored preference was unusable and a default was used. */
  readonly degradedReason?: string | undefined;
}

function identifier(value: unknown, what: string): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(value)) {
    throw new DomainValidationError(`${what} must be a stable identifier`);
  }
  return value;
}

function isoTimestamp(value: unknown, what: string): string {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw new DomainValidationError(`${what} must be an ISO timestamp`);
  }
  return value;
}

export function isWorkModeBaseMode(value: unknown): value is WorkModeBaseMode {
  return typeof value === "string" && (WORK_MODE_BASE_MODES as readonly string[]).includes(value);
}

export function isWorkModeModifier(value: unknown): value is WorkModeModifier {
  return typeof value === "string" && (WORK_MODE_MODIFIERS as readonly string[]).includes(value);
}

/** Strict parse: an unknown mode or modifier is a contract error, never dropped. */
export function parseProjectWorkModePreference(
  value: unknown,
  what = "ProjectWorkModePreference",
): ProjectWorkModePreference {
  if (typeof value !== "object" || value === null) {
    throw new DomainValidationError(`${what} must be an object`);
  }
  const raw = value as Record<string, unknown>;
  if (raw.schemaVersion !== 1) {
    throw new DomainValidationError(`${what}.schemaVersion must be 1`);
  }
  if (!isWorkModeBaseMode(raw.baseMode)) {
    throw new DomainValidationError(
      `${what}.baseMode must be one of ${WORK_MODE_BASE_MODES.join(" | ")}`,
    );
  }
  if (!Array.isArray(raw.modifiers)) {
    throw new DomainValidationError(`${what}.modifiers must be an array`);
  }
  for (const modifier of raw.modifiers) {
    if (!isWorkModeModifier(modifier)) {
      throw new DomainValidationError(
        `${what}.modifiers entries must be one of ${WORK_MODE_MODIFIERS.join(" | ")}`,
      );
    }
  }
  return Object.freeze({
    schemaVersion: 1 as const,
    projectId: identifier(raw.projectId, `${what}.projectId`),
    baseMode: raw.baseMode,
    modifiers: Object.freeze(normalizeModifiers(raw.modifiers as WorkModeModifier[])),
    updatedAt: isoTimestamp(raw.updatedAt, `${what}.updatedAt`),
    updatedBy: identifier(raw.updatedBy, `${what}.updatedBy`),
    digest: typeof raw.digest === "string" ? raw.digest : workModePreferenceDigestOf(raw as never),
  });
}

export function normalizeModifiers(
  modifiers: readonly WorkModeModifier[],
): readonly WorkModeModifier[] {
  return [...new Set(modifiers)].sort();
}

/** The content digest: the semantic mode, never a recipe implementation digest. */
export function workModePreferenceDigestOf(input: {
  readonly projectId: string;
  readonly baseMode: WorkModeBaseMode;
  readonly modifiers: readonly WorkModeModifier[];
  readonly updatedAt: string;
  readonly updatedBy: string;
}): string {
  return canonicalDigest({
    domain: WORK_MODE_PREFERENCE_DIGEST_DOMAIN,
    projectId: input.projectId,
    baseMode: input.baseMode,
    modifiers: normalizeModifiers(input.modifiers),
    updatedAt: input.updatedAt,
    updatedBy: input.updatedBy,
  });
}

export function buildProjectWorkModePreference(input: {
  readonly projectId: string;
  readonly baseMode: WorkModeBaseMode;
  readonly modifiers: readonly WorkModeModifier[];
  readonly updatedAt: string;
  readonly updatedBy: string;
}): ProjectWorkModePreference {
  const projectId = identifier(input.projectId, "projectId");
  const updatedBy = identifier(input.updatedBy, "updatedBy");
  const updatedAt = isoTimestamp(input.updatedAt, "updatedAt");
  if (!isWorkModeBaseMode(input.baseMode)) {
    throw new DomainValidationError(`baseMode must be one of ${WORK_MODE_BASE_MODES.join(" | ")}`);
  }
  const modifiers = normalizeModifiers(input.modifiers);
  return Object.freeze({
    schemaVersion: 1 as const,
    projectId,
    baseMode: input.baseMode,
    modifiers: Object.freeze(modifiers),
    updatedAt,
    updatedBy,
    digest: workModePreferenceDigestOf({
      projectId,
      baseMode: input.baseMode,
      modifiers,
      updatedAt,
      updatedBy,
    }),
  });
}

/** The safe default preference for a project, explicitly marked as a default. */
export function defaultWorkModePreference(
  projectId: string,
  updatedBy = "operator:unset",
): ProjectWorkModePreference {
  return buildProjectWorkModePreference({
    projectId,
    baseMode: DEFAULT_WORK_MODE_BASE,
    modifiers: DEFAULT_WORK_MODE_MODIFIERS,
    updatedAt: "1970-01-01T00:00:00.000Z",
    updatedBy,
  });
}

/** A single append-only Work Mode change record (product/audit metadata). */
export interface WorkModeHistoryEntry {
  readonly projectId: string;
  readonly seq: number;
  readonly fromBaseMode: WorkModeBaseMode;
  readonly toBaseMode: WorkModeBaseMode;
  readonly fromModifiers: readonly WorkModeModifier[];
  readonly toModifiers: readonly WorkModeModifier[];
  readonly updatedBy: string;
  readonly at: string;
}

export interface UserWorkModeControlPort {
  get(projectId: string): Promise<EffectiveWorkModePreference>;
  set(input: {
    readonly projectId: string;
    readonly baseMode: WorkModeBaseMode;
    readonly modifiers: readonly WorkModeModifier[];
    readonly updatedBy: string;
  }): Promise<ProjectWorkModePreference>;
  history(projectId: string): Promise<readonly WorkModeHistoryEntry[]>;
}

/**
 * G10-AC-R §5: the STRUCTURAL view of a live monitor runtime capability. Only the
 * fields the availability table needs. `startState` is a plain string here so the
 * monitor module's closed union stays its own concern.
 */
export interface MonitorRuntimeCapabilityView {
  readonly tickSourceConfigured: boolean;
  /** FALSE for the null/pull activation adapter (it only records signals). */
  readonly activationConfigured: boolean;
  readonly startState: string;
  readonly startError: string | null;
}

/**
 * G10-AD §15/§16: the STRUCTURAL view of a real Project Verification runtime.
 *
 *   VerifierRuntimeCapabilityView ≠ a truth channel
 *   it is exactly: "can a registered/versioned verifier protocol EXECUTE here,
 *   and does at least one of them count as independent?"
 *
 * It is declared structurally (rather than imported from
 * `src/project_verification/service.ts`) for the SAME reason
 * `MonitorRuntimeCapabilityView` is: `src/project_verification/**` is a product
 * plane and `project_operating` must not take a dependency on it. The plane's
 * `ProjectVerificationRuntimeFacts` is structurally assignable to this view.
 *
 * `independentVerifierAvailable` may only be TRUE when the runtime EXISTS (`§15`:
 * a runtime AND at least one registered verifier that counts as independent). A
 * SHARED_CONTEXT / DECLARED_SEPARATE / UNKNOWN verifier never counts, and an
 * empty runtime can never claim it.
 */
export interface VerificationRuntimeCapabilityView {
  /** At least one REGISTERED verifier has a real execution binding here. */
  readonly runtimeAvailable: boolean;
  /** §15: runtimeAvailable AND at least one registered verifier counts as independent. */
  readonly independentVerifierAvailable: boolean;
  /** The registered refs that count as independent (never a bare bool/string). */
  readonly independentVerifierRefs: readonly string[];
  /** The ref a caller gets when it does not select one; null when none exists. */
  readonly defaultVerifierRef: string | null;
  /** The honest one-line basis, renderable verbatim. */
  readonly note: string;
}

/**
 * Does this modifier need a capability that may not exist? Used to build the
 * honest effective-status view: a preference is never silently dropped, and an
 * unavailable capability is never reported as active.
 */
export interface WorkModeCapabilityInputs {
  /**
   * DEPRECATED (G10-AD §16). A bare boolean is NO LONGER an availability claim:
   * it cannot distinguish "a registered verifier really executes here and counts
   * as independent" from a descriptive string or a same-model same-context stub.
   * It is still ACCEPTED for compatibility and is reported as CONDITIONAL at
   * best; wire `verificationRuntimeCapability` for a real availability derivation.
   * Retained (`required`) so existing embedders keep compiling unchanged.
   */
  readonly independentVerifier: boolean;
  /**
   * A production Monitor condition source exists. Kept for an embedder that
   * genuinely has an EQUIVALENT external implementation; on its own it is only a
   * declaration, which is why `monitorRuntime` below is preferred.
   */
  readonly monitorConditionSource: boolean;
  /**
   * G10-AC §34: a REAL monitor runtime is composed - a driver with an explicit
   * tick source and an activation port. Availability is derived from this wiring
   * rather than from a bare boolean claim.
   */
  readonly monitorRuntime?: boolean | undefined;
  /**
   * WHERE the runtime comes from. `first_party` is the composed Campaign monitor
   * driver; `declared_external` is an embedder's truthful equivalence claim.
   */
  readonly monitorRuntimeProvenance?: "first_party" | "declared_external" | undefined;
  /**
   * G10-AC-R §5: the LIVE runtime capability the MONITOR row must be derived from
   * when present. It is declared STRUCTURALLY here (not imported from
   * `src/monitor/driver.ts`) because the driver imports this module's work-mode
   * port: importing `MonitorRuntimeCapability` here would create a
   * `project_operating -> monitor -> project_operating` cycle. The driver's
   * `MonitorRuntimeCapability` is structurally assignable to this view.
   */
  readonly monitorRuntimeCapability?: MonitorRuntimeCapabilityView | undefined;
  /**
   * G10-AD §15/§16: the LIVE Project Verification runtime capability the VERIFY
   * row must be derived from when present. Declared STRUCTURALLY (see
   * `VerificationRuntimeCapabilityView`) so `project_operating` does not import
   * `src/project_verification/**`. A `verificationCapabilityRef` string or a bare
   * `independentVerifier: true` is NOT this: only a view built from the real
   * registry + executable providers can make VERIFY AVAILABLE.
   */
  readonly verificationRuntimeCapability?: VerificationRuntimeCapabilityView | undefined;
  /** Reasoning-branch execution is available for EXPLORE. */
  readonly reasoningBranches: boolean;
  /** A genuine already-independent sovereign peer exists for COORDINATE. */
  readonly independentPeer: boolean;
}
