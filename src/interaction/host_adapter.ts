/**
 * UX-A §10/§22 — the HOST ADAPTER seam, plus the deterministic local profiler
 * that makes the already-declared profiler port real.
 *
 *   classifier output != semantic authority     adapter output grants no authority
 *   confidence != permission                    profiler output != recipe selection
 *
 * Two separate seams live here, and both are PRODUCT ADAPTATION:
 *
 * 1. `CollaborationIntentAdapter` — maps a host's natural-language request to a
 *    typed `CollaborationIntent`. The core UX-A service consumes the typed intent
 *    only (§10: no magical classifier in the kernel). `nullCollaborationIntentAdapter`
 *    NEVER guesses; `deterministicKeywordCollaborationIntentAdapter` is ONE
 *    documented example that a host may replace with a model-backed adapter.
 *
 * 2. `deterministicTaskProfiler()` — a real, local, no-LLM `TaskProfilerPort`.
 *    The UX-A gap assessment (§8.1) found the port was DECLARED
 *    (`ApplicationSurfaceDeps.taskProfiler`) but never supplied by `install.ts`,
 *    and no implementation existed anywhere, so `advisor.profile({ task })`
 *    returned nine UNKNOWN features and AUTO/PARALLEL could not profile a task
 *    sentence at all. This closes that seam WITHOUT guessing: it emits a value
 *    only for a feature whose text carries an explicit lexical signal, and
 *    otherwise OMITS the feature so the caller keeps UNKNOWN/UNKNOWN.
 *
 * Honesty rules encoded here:
 *   - the profiler's provenance is whatever the port contract assigns; this port
 *     returns raw UNTRUSTED output (`{ features: [...] }`) and the advisor's
 *     `applyProfilerOutput` strict-parses it and re-sources every supplied feature
 *     as `UNTRUSTED_PROFILER` (it may not declare a `source` of its own);
 *   - only values from `TASK_FEATURE_ALLOWED_VALUES` are ever emitted;
 *   - an AMBIGUOUS task (both a "high" and a "low" marker) yields UNKNOWN rather
 *     than a coin flip;
 *   - `existingIndependentPeers` is NEVER inferred from text: whether an
 *     independent peer already exists is a deployment fact, not a lexical one.
 */

import type { TaskFeatureName, TaskFeatureValue } from "../organization_memory/artifacts.js";
import { TASK_FEATURE_ALLOWED_VALUES } from "../organization_memory/artifacts.js";
import type { TaskProfilerPort } from "../advisor/task_profile.js";
import type { CollaborationIntent } from "./intent.js";
import { DEFAULT_COLLABORATION_INTENT } from "./intent.js";

/* ------------------------------------------------------------------ *
 * Intent adapter (§22)
 * ------------------------------------------------------------------ */

export interface DerivedCollaborationIntent {
  /** The task text the core service will use. An adapter never rewrites it. */
  readonly task: string;
  readonly intent: CollaborationIntent;
  /** Optional and deliberately coarse; a confidence is not a permission. */
  readonly confidence?: number | undefined;
}

export interface CollaborationIntentAdapter {
  readonly adapterId: string;
  deriveIntent(userRequest: string): Promise<DerivedCollaborationIntent>;
}

/** The honest null object: it never guesses, and always answers AUTO. */
export const nullCollaborationIntentAdapter: CollaborationIntentAdapter = Object.freeze({
  adapterId: "null",
  deriveIntent: async (userRequest: string): Promise<DerivedCollaborationIntent> =>
    Object.freeze({ task: userRequest, intent: DEFAULT_COLLABORATION_INTENT }),
});

interface IntentRule {
  readonly intent: CollaborationIntent;
  readonly patterns: readonly RegExp[];
}

/**
 * ONE deterministic example adapter. It is deliberately transparent, cheap and
 * replaceable — the pattern list is the whole classifier, and it grants no
 * authority: the core service still decides, and the advisor still selects.
 *
 * Order matters: the most specific (combined) intent is tested first.
 */
export const DETERMINISTIC_INTENT_RULES: readonly IntentRule[] = Object.freeze([
  {
    intent: "PARALLEL_AND_CHECK",
    patterns: [
      /\b(parallel|multi[- ]?agent|multiple agents|several agents|explore|compare|alternatives?)\b[\s\S]{0,120}\b(check|verify|validate|review)\b/iu,
      /\b(check|verify|validate)\b[\s\S]{0,120}\b(parallel|multi[- ]?agent|explore|alternatives?)\b/iu,
    ],
  },
  {
    intent: "CHECK",
    patterns: [/\b(check|verify|validat|audit|independently)\w*\b/iu, /\bdouble[- ]check\b/iu],
  },
  {
    intent: "PARALLEL",
    patterns: [
      /\b(parallel|multi[- ]?agent|multiple agents|several agents)\b/iu,
      /\b(explore|compare|weigh)\b[\s\S]{0,60}\b(approaches?|alternatives?|options?|designs?)\b/iu,
    ],
  },
  {
    intent: "FOCUS",
    patterns: [/\b(just do it|do it|directly|single agent|by yourself|yourself)\b/iu],
  },
]);

/**
 * A deterministic keyword adapter used as the documented EXAMPLE host seam. It
 * returns DEFAULT_COLLABORATION_INTENT (AUTO) when no rule matches — it never
 * forces a structure it did not recognise.
 */
export const deterministicKeywordCollaborationIntentAdapter: CollaborationIntentAdapter = Object.freeze({
  adapterId: "deterministic-keywords",
  deriveIntent: async (userRequest: string): Promise<DerivedCollaborationIntent> => {
    for (const rule of DETERMINISTIC_INTENT_RULES) {
      if (rule.patterns.some((pattern) => pattern.test(userRequest))) {
        return Object.freeze({ task: userRequest, intent: rule.intent, confidence: 0.6 });
      }
    }
    return Object.freeze({ task: userRequest, intent: DEFAULT_COLLABORATION_INTENT, confidence: 0 });
  },
});

/* ------------------------------------------------------------------ *
 * The deterministic task profiler
 * ------------------------------------------------------------------ */

interface FeatureSignalRule {
  readonly feature: TaskFeatureName;
  /** An unambiguous, explicit signal for this value. */
  readonly strong: { readonly value: TaskFeatureValue; readonly patterns: readonly RegExp[] };
  /** The opposite extreme, used only to detect AMBIGUITY (never to guess). */
  readonly opposite: { readonly value: TaskFeatureValue; readonly patterns: readonly RegExp[] };
}

function ruleOfWords(
  feature: TaskFeatureName,
  strongValue: TaskFeatureValue,
  strongWords: readonly string[],
  oppositeValue: TaskFeatureValue,
  oppositeWords: readonly string[],
): FeatureSignalRule {
  const word = (entry: string): RegExp => new RegExp(`\\b${entry}\\b`, "iu");
  return Object.freeze({
    feature,
    strong: Object.freeze({ value: strongValue, patterns: Object.freeze(strongWords.map(word)) }),
    opposite: Object.freeze({ value: oppositeValue, patterns: Object.freeze(oppositeWords.map(word)) }),
  });
}

/**
 * The complete, deterministic signal table. Every pattern is an explicit lexical
 * marker; nothing here is a semantic model, and a feature with no marker is left
 * UNKNOWN.
 */
export const TASK_PROFILER_RULES: readonly FeatureSignalRule[] = Object.freeze([
  ruleOfWords(
    "decomposability",
    "HIGH",
    ["independent", "independently", "separately", "parallel", "decompose", "approaches", "modules", "subtasks"],
    "LOW",
    ["monolithic", "single change", "one atomic change", "inseparable"],
  ),
  ruleOfWords(
    "crossComponentCoupling",
    "HIGH",
    ["coupled", "coupling", "cross-component", "shared state", "every module", "depends on all", "schema migration"],
    "LOW",
    ["isolated", "self-contained", "one module", "one file", "local"],
  ),
  ruleOfWords(
    "verifiability",
    "HIGH",
    ["test", "tests", "tested", "verify", "verifiable", "falsifiable", "invariant", "assert", "assertion", "typecheck", "lint"],
    "LOW",
    ["subjective", "taste", "style preference", "hard to verify", "no clear test"],
  ),
  ruleOfWords(
    "contextLocality",
    "HIGH",
    ["one file", "one module", "locally", "isolated"],
    "LOW",
    ["whole repo", "whole repository", "whole codebase", "entire codebase", "across the project"],
  ),
  ruleOfWords(
    "parallelSearchBenefit",
    "HIGH",
    ["alternatives", "alternative", "options", "approaches", "explore", "compare", "trade-off", "trade-offs", "tradeoff", "tradeoffs"],
    "LOW",
    ["one approach", "no alternatives", "single option"],
  ),
  ruleOfWords(
    "authoritySeparationNeed",
    "YES",
    ["independent review", "independent approval", "separate owner", "separate team", "another team", "sign-off", "signoff", "different team"],
    "NO",
    ["single owner", "no approval", "self-review", "own review"],
  ),
  ruleOfWords("timeHorizon", "LONG", ["long-term", "long term", "roadmap", "months", "quarter", "permanent", "durable"], "SHORT", [
    "quick",
    "minor",
    "today",
    "right now",
    "small change",
  ]),
  ruleOfWords(
    "privacyLocalityNeed",
    "HIGH",
    ["confidential", "private", "secret", "sensitive", "never leaves", "local only"],
    "LOW",
    ["public", "open source", "shareable"],
  ),
  // `existingIndependentPeers` is ABSENT on purpose: whether an already-independent
  // peer exists is a DEPLOYMENT fact (the advisor reads it from the install's
  // capability wiring). Inferring it from a sentence would be the exact
  // "profile claims a peer and conjures one" failure the advisor's tests forbid.
]);

export interface DeterministicTaskProfilerOptions {
  readonly profilerId?: string | undefined;
}

/**
 * The real, deterministic, local, no-LLM profiler. Deterministic: the same task
 * text always produces the same output, with no clock, no I/O and no model call.
 */
export function deterministicTaskProfiler(options: DeterministicTaskProfilerOptions = {}): TaskProfilerPort {
  const profilerId = options.profilerId ?? "uxa.deterministic-lexical.v1";
  return Object.freeze({
    profilerId,
    async profile(input: { readonly task: string; readonly contextRefs?: readonly string[] }): Promise<unknown> {
      const text = input.task;
      const features: { feature: TaskFeatureName; value: TaskFeatureValue }[] = [];
      for (const rule of TASK_PROFILER_RULES) {
        const strong = rule.strong.patterns.some((pattern) => pattern.test(text));
        const opposite = rule.opposite.patterns.some((pattern) => pattern.test(text));
        if (strong && opposite) continue; // ambiguous text is NOT guessed
        if (!strong && !opposite) continue; // no signal ⇒ feature stays UNKNOWN
        const value = strong ? rule.strong.value : rule.opposite.value;
        if (!(TASK_FEATURE_ALLOWED_VALUES[rule.feature] as readonly string[]).includes(value)) continue;
        features.push({ feature: rule.feature, value });
      }
      // The port contract assigns provenance, so this returns NO source field: a
      // `source` here is rejected by `parseProfilerOutput`.
      return Object.freeze({ features: Object.freeze(features) });
    },
  });
}
