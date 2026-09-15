/**
 * G10-AB §26 — Work Mode influences SELECTION as a preference only.
 *
 * Ordering is conceptually:
 *
 *   hard eligibility
 *     → task/candidate need
 *     → user Work Mode preference
 *     → empirical advisor evidence
 *
 * There is no hidden scalar score, and a preference can NEVER override hard
 * ineligibility. This module is pure: it orders candidates that the caller has
 * ALREADY filtered for eligibility, and it explains what it did - including when
 * the preference had to yield to eligibility.
 *
 *   AdvisorRecommendation  ≠ PreferenceMutation
 *   AgentRecommendation    ≠ OperatorPreferenceChange
 */

import type { EffectiveWorkModePreference, WorkModeBaseMode } from "./work_mode_profile.js";

/** The minimum a candidate must expose for preference ordering. */
export interface WorkModeOrderableCandidate {
  readonly actionId: string;
  /** The mode this candidate expresses, when it names one. */
  readonly baseMode?: string | undefined;
}

export interface WorkModePreferenceExplanation {
  readonly preferredBaseMode: WorkModeBaseMode;
  /** The candidates that express the preferred mode AND are eligible. */
  readonly preferredCandidateIds: readonly string[];
  /**
   * True when the preference selected nothing because no eligible candidate
   * expressed it. The ordering then falls through to the caller's own order -
   * eligibility is never bent to honour a preference.
   */
  readonly blockedByEligibility: boolean;
  readonly detail: string;
}

/**
 * Reorder eligible candidates so the operator's preferred mode comes first.
 *
 * It is a STABLE partition, not a score: candidates expressing the preferred mode
 * keep their relative order, everything else keeps its relative order after them.
 * A candidate with no declared mode is never promoted.
 */
export function orderCandidatesByWorkModePreference<T extends WorkModeOrderableCandidate>(
  candidates: readonly T[],
  preference: EffectiveWorkModePreference | null,
): { readonly ordered: readonly T[]; readonly explanation: WorkModePreferenceExplanation | null } {
  if (preference === null) {
    return Object.freeze({ ordered: Object.freeze([...candidates]), explanation: null });
  }
  const preferred = preference.preference.baseMode;
  const matching = candidates.filter((candidate) => candidate.baseMode === preferred);
  const rest = candidates.filter((candidate) => candidate.baseMode !== preferred);
  const ordered = Object.freeze([...matching, ...rest]);
  const explanation: WorkModePreferenceExplanation = Object.freeze({
    preferredBaseMode: preferred,
    preferredCandidateIds: Object.freeze(matching.map((candidate) => candidate.actionId)),
    blockedByEligibility: matching.length === 0 && rest.length > 0,
    detail:
      matching.length === 0
        ? rest.length > 0
          ? `the user prefers ${preferred}, but no eligible candidate expresses it; eligibility is not bent to honour a preference`
          : `the user prefers ${preferred} and no candidate is currently eligible`
        : `the user prefers ${preferred}: ${matching.length} eligible candidate(s) express it and are ordered first`,
  });
  return Object.freeze({ ordered, explanation });
}

/**
 * Whether a mode preference may be used to expose the work-mode-aware
 * explanation to an agent/advisor. This is a READ; it never persists anything.
 */
export interface WorkModePreferenceContext {
  readonly declaredPreference: WorkModeBaseMode;
  readonly declaredModifiers: readonly string[];
  readonly source: "stored" | "safe_default";
}
