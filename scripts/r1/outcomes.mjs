#!/usr/bin/env node
/**
 * R1 §19/§20/§23/§24 — OUTCOME NORMALIZATION, THE KNOWN-FAILURE MARKER, AND THE VERDICT RULE.
 *
 * These are the experiment's own classifications. They are NOT canonical Palimpsest ontology (§24):
 * nothing in `src/` reads this file, and no product semantics depend on it.
 *
 * The reason they live in a module rather than inside the trial script is that §33 requires them to be
 * deterministically testable. A marker that is "detected" by a regex written at the point of use is a
 * marker that can be quietly tuned once the results are visible; here it is a pure function with
 * known-answer tests in BOTH directions (present and absent).
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */

/** §24: the experiment-only failure taxonomy. Reporting categories, never canonical ontology. */
export const FAILURE_TAXONOMY = Object.freeze([
  "KNOWLEDGE_NOT_SELECTED",
  "KNOWLEDGE_NOT_USED",
  "PROCEDURE_NOT_SELECTED",
  "PROCEDURE_NOT_USED",
  "RELEVANT_ASSET_MISSED",
  "IRRELEVANT_ASSET_DISTRACTION",
  "KNOWN_FAILURE_REPEATED",
  "IMPLEMENTATION_ERROR",
  "VALIDATION_ERROR",
  "MODEL_NONCOMPLIANCE",
  "HOST_ERROR",
  "TIMEOUT",
  "CONFOUNDED_TRIAL",
]);

/** The three verdicts §23 permits, plus the harness-level BLOCKED that is none of them. */
export const VERDICTS = Object.freeze(["PASS", "PARTIAL", "NO_REPLICATION"]);
export const BLOCKED = "BLOCKED";

/**
 * §20: the scenario-specific known-failure marker — "one mechanically observable previously-paid
 * cognitive cost", detected from SUBMITTED SOURCE rather than from private reasoning.
 *
 * Scenario A: ordering attempted without handling cycles first. The detector is deliberately shaped as
 * "an ordering loop that is not guarded by a preceding cycle check", because the naive prototype's
 * failure is exactly that shape — it is not merely "the word cycle is missing" (a source could mention
 * cycles and still order first, which is the failure E-LIVE's §3.2 keyword metric got wrong).
 *
 * Scenario B: defaults injected / migration performed before legacy alias ambiguity is validated.
 */
export const KNOWN_FAILURE_MARKERS = Object.freeze({
  A_DAG_PLANNER: Object.freeze({
    id: "ORDERED_WITHOUT_CYCLE_HANDLING",
    description: "ordering attempted without handling cycles first",
    detect: (source) => {
      const ordering = /while\s*\([^)]*\)\s*\{|\.push\(\s*(?:next|ready|order)|topolog|kahn|sort\(/iu.test(source);
      // A cycle check that PRECEDES the ordering: a `detectCycle`/`CycleError` mention appearing before
      // the first ordering construct.
      const orderAt = source.search(/while\s*\([^)]*\)\s*\{|\.push\(|topolog|kahn/iu);
      const cycleAt = source.search(/detectCycle|CycleError|hasCycle|findCycle|cycle\s*!==?\s*undefined/iu);
      const guarded = cycleAt !== -1 && (orderAt === -1 || cycleAt < orderAt);
      return ordering && !guarded;
    },
  }),
  B_CONFIG_MIGRATION: Object.freeze({
    id: "DEFAULTS_BEFORE_LEGACY_VALIDATION",
    description: "defaults injected / migration performed before legacy alias ambiguity is validated",
    /**
     * The failure is an ORDERING relation between two kinds of step, so the detector compares POSITIONS
     * of the two specific constructs.
     *
     * Two things it must NOT match, both found by the known-answer tests rather than by inspection:
     *   · `normalizeAliases` — in the prescribed method normalization is a TRANSFORM that FOLLOWS
     *     validation, so counting it as a validator would fire on a correct implementation;
     *   · the function's own name (`migrateConfig(`) — matching a bare `migrate` prefix made every
     *     implementation look like it migrated first, because the declaration is the first thing in the
     *     file. The marker is about DEFAULT INJECTION preceding legacy validation, so that is what it
     *     measures.
     */
    detect: (source) => {
      const defaultsAt = source.search(/DEFAULTS|applyDefaults|injectDefaults|defaults\s*[,}]/u);
      const validateAt = source.search(/validateLegacy|legacyValid|assertLegacy|checkAliases|assertNoAmbiguity/iu);
      if (defaultsAt === -1) return false;
      return validateAt === -1 || defaultsAt < validateAt;
    },
  }),
});

/**
 * Classify one submitted source. UNKNOWN is returned rather than a guess when the scenario has no
 * registered marker (§19: "Unknown remains UNKNOWN").
 */
export function classifyKnownFailure(scenario, source) {
  const marker = KNOWN_FAILURE_MARKERS[scenario];
  if (marker === undefined) return "UNKNOWN";
  if (typeof source !== "string" || source.trim() === "") return "UNKNOWN";
  return marker.detect(source) ? "KNOWN_FAILURE_PRESENT" : "KNOWN_FAILURE_ABSENT";
}

/** §14: the conditions the harness may score. Anything else is a harness bug, not a trial. */
const REGISTERED_CONDITIONS = Object.freeze(["C0", "C1", "C2"]);
const REGISTERED_SCENARIOS = Object.freeze(["A_DAG_PLANNER", "B_CONFIG_MIGRATION"]);

/** A field that a run may genuinely fail to expose. §19: it is recorded as UNKNOWN, never invented. */
const UNKNOWN = "UNKNOWN";

/**
 * §19: normalize one trial's raw record.
 *
 * The important behaviour is the DEFAULT: every field a caller did not supply becomes `UNKNOWN`, not
 * `0` and not `false`. A missing token count must not read as "used no tokens", and a Procedure that
 * was not observed being pulled must not read as "not pulled".
 */
export function normalizeTrialResult(input) {
  const { condition, scenario } = input ?? {};
  if (!REGISTERED_CONDITIONS.includes(condition)) {
    throw new Error(`condition ${String(condition)} is not pre-registered (expected one of ${REGISTERED_CONDITIONS.join(", ")})`);
  }
  if (!REGISTERED_SCENARIOS.includes(scenario)) {
    throw new Error(`scenario ${String(scenario)} is not pre-registered (expected one of ${REGISTERED_SCENARIOS.join(", ")})`);
  }
  const orUnknown = (value) => (value === undefined || value === null ? UNKNOWN : value);
  const confounded = input.confounded === true;
  return Object.freeze({
    condition,
    scenario,
    trialIndex: orUnknown(input.trialIndex),
    finalAcceptancePass: orUnknown(input.acceptancePass),
    firstSubmissionPass: orUnknown(input.firstSubmissionPass),
    failedValidationIterations: orUnknown(input.failedValidationIterations),
    knownInvalidApproachAttempted: orUnknown(input.knownInvalidApproachAttempted),
    knownPrerequisiteRediscovered: orUnknown(input.knownPrerequisiteRediscovered),
    knownFailureMarker: orUnknown(input.knownFailureMarker),
    proofPulled: orUnknown(input.proofPulled),
    reasoningPulled: orUnknown(input.reasoningPulled),
    procedurePulled: orUnknown(input.procedurePulled),
    procedureBehaviorallyReflected: orUnknown(input.procedureBehaviorallyReflected),
    attemptCount: orUnknown(input.attemptCount),
    workerActionCount: orUnknown(input.workerActionCount),
    elapsedMs: orUnknown(input.elapsedMs),
    tokensIn: orUnknown(input.tokensIn),
    tokensOut: orUnknown(input.tokensOut),
    hostInterventions: orUnknown(input.hostInterventions),
    // §13: a confounded trial is excluded from the PRIMARY comparison and retained in RAW evidence.
    confounded,
    excludedFromPrimary: confounded,
    retainedInRawEvidence: true,
  });
}

/**
 * §22/§23: the verdict, computed from per-scenario effects.
 *
 * §22 requires BOTH halves for "strong evidence": the known failure repeats less AND the mechanical
 * outcome is not worse. §23 requires BOTH scenarios for PASS. The `blocked` flag short-circuits to
 * BLOCKED, which is explicitly NOT one of the three verdicts — a harness that could not distinguish
 * its own conditions has not measured anything, and must not be reported as NO_REPLICATION (which
 * would claim the product was tested and found wanting).
 */
export function verdictFor({ blocked, scenarioEffects }) {
  if (blocked === true) return BLOCKED;
  const effects = Array.isArray(scenarioEffects) ? scenarioEffects : [];
  const replicated = (entry) => entry.effect === true && entry.outcomeNotWorse === true;
  const replicatedScenarios = effects.filter(replicated);
  const anyLoadBearing = effects.some((entry) => entry.procedureLoadBearing === true);
  if (replicatedScenarios.length >= 2 && anyLoadBearing) return "PASS";
  if (replicatedScenarios.length >= 1 || effects.some((entry) => entry.effect === true)) return "PARTIAL";
  return "NO_REPLICATION";
}

/**
 * §23: exact counts, never a single collapsed score. Descriptive statistics only — no p-value is
 * manufactured from a small sample.
 */
export function summarize(trials) {
  const scored = trials.filter((trial) => trial.excludedFromPrimary !== true);
  const byCondition = {};
  for (const condition of REGISTERED_CONDITIONS) {
    const rows = scored.filter((trial) => trial.condition === condition);
    const passes = rows.filter((row) => row.finalAcceptancePass === true).length;
    const knownFailure = rows.filter((row) => row.knownFailureMarker === "KNOWN_FAILURE_PRESENT").length;
    const procedureReflected = rows.filter((row) => row.procedureBehaviorallyReflected === true).length;
    byCondition[condition] = Object.freeze({
      n: rows.length,
      finalAcceptancePasses: passes,
      knownFailurePresent: knownFailure,
      procedureBehaviorallyReflected: procedureReflected,
      unknownFinalAcceptance: rows.filter((row) => row.finalAcceptancePass === UNKNOWN).length,
    });
  }
  return Object.freeze({
    trialsTotal: trials.length,
    trialsExcludedFromPrimary: trials.length - scored.length,
    byCondition: Object.freeze(byCondition),
  });
}
