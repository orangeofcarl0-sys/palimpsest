/**
 * G10-S TaskProfile — the nine task features with value + provenance.
 *
 *   TaskProfile ≠ TaskTruth        Profiler ≠ Chooser
 *   Untrusted profiler ≤ suggestion, never authority
 *
 * A TaskProfile is a DISCLOSED description of a task along nine categorical
 * features. Every value carries where it came from (`source`), and an UNKNOWN
 * value is first-class: it is never silently treated as LOW/NO/a tie. A
 * `TaskProfilerPort` may PROPOSE a profile, but its output is UNTRUSTED, is
 * strict-parsed, and NEVER selects a recipe — only the advisor (and the user)
 * may turn a profile into a recommendation.
 */

import type {
  TaskFeatureEntry,
  TaskFeatureName,
  TaskFeatureValue,
  TaskProfileSnapshot,
} from "../organization_memory/artifacts.js";
import {
  TASK_FEATURE_ALLOWED_VALUES,
  TASK_FEATURE_NAMES,
  materializeTaskProfileSnapshot,
  parseTaskProfileSnapshot,
} from "../organization_memory/artifacts.js";
import { advisorEnum, advisorFail, advisorKeys, advisorObject } from "./strict.js";

/** Same shape as the OrganizationMemory snapshot; the advisor's canonical task description. */
export type TaskProfile = TaskProfileSnapshot;

export interface MaterializeTaskProfileInput {
  readonly features: readonly TaskFeatureEntry[];
}

/** Build a profile from all nine feature entries (validated, canonical order). */
export function materializeTaskProfile(input: MaterializeTaskProfileInput): TaskProfile {
  return materializeTaskProfileSnapshot({ features: input.features });
}

/** Strictly parse a TaskProfile (exactly one entry per feature, canonical order). */
export function parseTaskProfile(raw: unknown, what = "TaskProfile"): TaskProfile {
  return parseTaskProfileSnapshot(raw, what);
}

/** Convenience builder: partial values default to UNKNOWN with the given source. */
export function taskProfileFromValues(
  values: Partial<Record<TaskFeatureName, TaskFeatureValue>>,
  source: TaskFeatureEntry["source"] = "USER_DECLARED",
): TaskProfile {
  const features = TASK_FEATURE_NAMES.map((feature) => ({
    feature,
    value: values[feature] ?? "UNKNOWN",
    source,
  }));
  return materializeTaskProfile({ features });
}

/** Every feature UNKNOWN/UNKNOWN — the honest "nothing known" profile. */
export function unknownTaskProfile(): TaskProfile {
  const features = TASK_FEATURE_NAMES.map((feature) => ({
    feature,
    value: "UNKNOWN" as const,
    source: "UNKNOWN" as const,
  }));
  return materializeTaskProfile({ features });
}

/** Canonical lookup: an absent feature is UNKNOWN, never a default LOW/NO. */
export function taskFeatureValue(profile: TaskProfile, feature: TaskFeatureName): TaskFeatureValue {
  const entry = profile.features.find((candidate) => candidate.feature === feature);
  return entry === undefined ? "UNKNOWN" : entry.value;
}

/**
 * A host-supplied profiler. `profile` returns an UNTRUSTED proposal; this port
 * NEVER selects a recipe and its output is never used without strict parsing.
 */
export interface TaskProfilerPort {
  readonly profilerId: string;
  profile(input: { readonly task: string; readonly contextRefs?: readonly string[] }): Promise<unknown>;
}

export const TASK_PROFILER_OUTPUT_KEYS = ["features"] as const;

interface ProfilerFeatureEntry {
  readonly feature: TaskFeatureName;
  readonly value: TaskFeatureValue;
}

/**
 * Strict-parse UNTRUSTED profiler output into a partial feature map. Any source
 * field the profiler attempts to declare is rejected (provenance is assigned by
 * the advisor, never by the untrusted producer).
 */
export function parseProfilerOutput(raw: unknown, what = "TaskProfilerOutput"): ReadonlyMap<TaskFeatureName, TaskFeatureValue> {
  const object = advisorObject(raw, what);
  advisorKeys(object, TASK_PROFILER_OUTPUT_KEYS, TASK_PROFILER_OUTPUT_KEYS, what);
  if (!Array.isArray(object.features)) advisorFail("malformed_artifact", `${what}.features must be an array`);
  const entries: ProfilerFeatureEntry[] = [];
  const seen = new Set<TaskFeatureName>();
  (object.features as unknown[]).forEach((entry, index) => {
    const item = advisorObject(entry, `${what}.features[${index}]`);
    advisorKeys(item, ["feature", "value"], ["feature", "value"], `${what}.features[${index}]`);
    const feature = advisorEnum(item.feature, TASK_FEATURE_NAMES, `${what}.features[${index}].feature`);
    if (seen.has(feature)) advisorFail("invalid_value", `${what}.features: duplicate feature "${feature}"`);
    seen.add(feature);
    const value = advisorEnum(item.value, TASK_FEATURE_ALLOWED_VALUES[feature], `${what}.features[${index}].value`);
    entries.push({ feature, value });
  });
  const map = new Map<TaskFeatureName, TaskFeatureValue>();
  for (const entry of entries) map.set(entry.feature, entry.value);
  return map;
}

/**
 * Overlay strict-parsed UNTRUSTED profiler output onto a profile. Every feature
 * the profiler supplied is re-sourced as UNTRUSTED_PROFILER; features it omitted
 * keep their existing value/source. The caller/user may then override any value.
 */
export function applyProfilerOutput(profile: TaskProfile, raw: unknown): TaskProfile {
  const proposed = parseProfilerOutput(raw);
  const features = TASK_FEATURE_NAMES.map((feature) => {
    const entry = profile.features.find((candidate) => candidate.feature === feature);
    const proposedValue = proposed.get(feature);
    if (proposedValue === undefined) {
      if (entry === undefined) advisorFail("malformed_artifact", `TaskProfile is missing feature "${feature}"`);
      return { feature, value: entry.value, source: entry.source };
    }
    return { feature, value: proposedValue, source: "UNTRUSTED_PROFILER" as const };
  });
  return materializeTaskProfile({ features });
}

/** Override one feature (e.g. a user correction of an untrusted proposal). */
export function withTaskFeature(
  profile: TaskProfile,
  feature: TaskFeatureName,
  value: TaskFeatureValue,
  source: TaskFeatureEntry["source"] = "USER_DECLARED",
): TaskProfile {
  if (!TASK_FEATURE_NAMES.includes(feature)) advisorFail("invalid_value", `unknown task feature "${String(feature)}"`);
  if (!TASK_FEATURE_ALLOWED_VALUES[feature].includes(value)) {
    advisorFail("invalid_value", `value "${value}" is not allowed for feature "${feature}"`);
  }
  const features = TASK_FEATURE_NAMES.map((name) => {
    const entry = profile.features.find((candidate) => candidate.feature === name);
    if (name !== feature) {
      if (entry === undefined) advisorFail("malformed_artifact", `TaskProfile is missing feature "${name}"`);
      return { feature: name, value: entry.value, source: entry.source };
    }
    return { feature: name, value, source };
  });
  return materializeTaskProfile({ features });
}
