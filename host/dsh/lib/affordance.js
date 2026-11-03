// palimpsest-dsh-host/affordance — THE R2-U EXPERIMENTAL PRESENTATION SEAM.
//
// WHAT THIS IS. R2-U measures whether a stochastic worker CHOOSES to consume inherited capital, and
// whether an explicit pre-work instruction changes that choice. The instruction is HOST PRESENTATION: it
// adds a sentence to the prompt the host composes. It is NOT a ProjectIR change, NOT a task-objective
// change and NOT a canonical event, store or setting.
//
// WHY IT LIVES IN ITS OWN MODULE. The wording has to be FROZEN before trials and checkable byte-for-byte
// afterwards, and `runner.js` imports DSH host packages at module scope, which only resolve inside an
// installed DSH. Keeping the wording here — with no imports at all — means the deterministic tests can
// assert the exact bytes, and that the DEFAULT path is byte-identical to production, without standing up
// a DSH runtime.
//
// THE TWO MODES.
//
//   ABSENT / 'off'  the default. `applyAffordance` returns the text UNCHANGED, so the prompt a worker
//                   receives in a normal deployment is byte-for-byte what it was before this module
//                   existed. Nothing about production behaviour depends on this file.
//
//   'explicit-review'  appends exactly ONE frozen clause. Nothing else changes: not the task text, not
//                   the capability catalogue, not the index. The clause asks the worker to look at the
//                   inherited context when it is relevant, and says nothing about what the bodies
//                   contain. It is an AFFORDANCE, not forced compliance — the worker may still ignore it,
//                   and the experiment measures what it actually does.
//
// THE CLAUSE MUST NOT LEAK THE ANSWER. It says "inspect those handles", never "the Procedure contains the
// method", and it does not name a handle kind. A worker in K0A1 receives the same sentence and finds an
// empty section, which is what makes K0A1 the placebo cell.
//
// PLAIN JAVASCRIPT. `host/**` is scanned by the architecture checker as JavaScript.

/**
 * The ONE frozen clause. §6 of the ruling fixes the semantic intent; this is its single rendering, and the
 * trial harness records its digest so a mid-run edit is detectable rather than silent.
 *
 * Deliberately three sentences and no more:
 *   · the FIRST names the section, so the instruction has a referent;
 *   · the SECOND states the conditional affordance and routes it through the GOVERNED capability by name,
 *     so a worker cannot read "inspect" as "read the file";
 *   · the THIRD covers the empty/irrelevant case, which is the whole placebo control.
 */
export const UPTAKE_CLAUSE =
  'Before implementation, review the inherited project-context section. If it contains handles relevant to this task, inspect those handles through the governed context-pull capability before deciding on the implementation. If the section is empty or not relevant, proceed normally.';

/** The affordance modes. `OFF` is the default and must leave the prompt byte-identical. */
export const AFFORDANCE_MODES = Object.freeze({ OFF: 'off', EXPLICIT_REVIEW: 'explicit-review' });

/** The environment variable that selects the mode. Absent or unrecognized ⇒ OFF (never a silent A1). */
export const AFFORDANCE_ENV = 'PALIMPSEST_R2U_AFFORDANCE';

/**
 * Resolve the mode from an environment value.
 *
 * FAIL-SAFE TOWARD PRODUCTION: an unset, empty or unrecognized value yields `off`, because the experiment
 * must never be switched on by accident and a typo must not turn every ordinary deployment into a trial
 * arm. Only the exact frozen token enables the clause.
 *
 * @param {string | undefined} value
 * @returns {string} one of AFFORDANCE_MODES
 */
export function resolveAffordanceMode(value) {
  return value === AFFORDANCE_MODES.EXPLICIT_REVIEW ? AFFORDANCE_MODES.EXPLICIT_REVIEW : AFFORDANCE_MODES.OFF;
}

/**
 * Apply the affordance to a composed prompt.
 *
 * THE CONTRACT IS ADDITIVE: for every mode other than `explicit-review` this returns `text` itself (same
 * string, not a copy), so byte-identity with production is a property of the code path rather than of a
 * careful re-rendering.
 *
 * @param {string} text the prompt the host composed
 * @param {string} mode from `resolveAffordanceMode`
 * @returns {string}
 */
export function applyAffordance(text, mode) {
  if (mode !== AFFORDANCE_MODES.EXPLICIT_REVIEW) return text;
  // One blank line, then the clause. No heading: a heading would be a second difference, and the ruling
  // permits exactly one added clause.
  return `${text}\n\n${UPTAKE_CLAUSE}`;
}

/** A stable digest of the clause, recorded per trial so the wording can be shown to have been frozen. */
export async function uptakeClauseDigest() {
  const { createHash } = await import('node:crypto');
  return createHash('sha256').update(UPTAKE_CLAUSE, 'utf8').digest('hex');
}
