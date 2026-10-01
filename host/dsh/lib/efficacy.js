// palimpsest-dsh-host/efficacy — THE R2-E EXPERIMENTAL EFFICACY SEAM.
//
// WHAT THIS IS. R2-E asks the question R1-R and R2-U could not: when relevant governed project capital is
// ACTUALLY CONSUMED, does it improve stochastic worker behaviour? So R2-E removes voluntary uptake as a
// variable. The worker does not decide whether to read the capital; the attempt either has capital
// delivered to it or it does not.
//
// WHY THE HOST DOES THE PULLING. R2-U measured voluntary uptake at 1/40 overall and 0/10 in the
// explicit-review capital-present arm. A prework mechanism that DEPENDS on the model choosing to pull
// would therefore fail its own precondition on most runs, and §9 says what to do about that: classify
// those runs EFFICACY_PRECONDITION_NOT_MET rather than count them, and if it happens materially, redesign
// the mechanism before restarting. The mechanism is therefore HOST-MEDIATED (§10): the host invokes the
// SAME attempt-bound resolver on the selected handles before the first engineering turn and renders the
// returned values into an explicitly labelled section.
//
// WHAT IT IS NOT. It is NOT product semantics. It is NOT a second context-fetch path: it goes through the
// worker's existing pull channel, the parent's existing `resolveWorkerPullRequest`, and the attempt's own
// `allowedPullHandles`, so a handle this attempt did not bind is refused exactly as before. No body is read
// from a backing store directly, no global asset lookup exists, and no authority widens.
//
// THE TWO ARMS, and why they share a boundary:
//
//   E0  the control. The SAME section header, and wording that says no capital was selected. It carries no
//       capital and no sham capital: the treatment is RELEVANT INHERITED CAPITAL, not extra tokens.
//   E1  the treatment. The same header, and each selected handle's body rendered under its OWN kind.
//
// KIND FRAMING (§11) is not decoration. A Proof is epistemic information and never authority; a Reasoning
// claim is admitted reasoning and never authority; a Procedure is advisory method guidance that may
// influence HOW the worker works and cannot widen WHAT is authorized. Flattening the three into generic
// "instructions" would silently promote information into authority, which is the one thing this whole
// line of work exists to prevent.
//
// PLAIN JAVASCRIPT. `host/**` is scanned by the architecture checker as JavaScript.

import { createHash } from 'node:crypto';

/** The efficacy modes. `OFF` is the default and must leave the prompt byte-identical to production. */
export const EFFICACY_MODES = Object.freeze({ OFF: 'off', E0: 'e0', E1: 'e1' });

/** The environment variable that selects the mode. Absent or unrecognized ⇒ OFF (never a silent arm). */
export const EFFICACY_ENV = 'PALIMPSEST_R2E_EFFICACY';

/**
 * §10: the ONE mechanism this stage uses. Recorded on every E1 trial so the evidence says which mechanism
 * produced it, and so a reader can tell it apart from a model-mediated run — the two are never mixed in one
 * primary matrix.
 */
export const PREWORK_MECHANISM = 'HOST_MEDIATED_PREWORK';

/** The section boundary, IDENTICAL in both arms (§12): the control must differ in content, not in shape. */
export const EFFICACY_SECTION_HEADING = 'EXPERIMENTAL INHERITED-CAPITAL REVIEW';

/** §6/§12: the E0 control wording — the same boundary, and no capital of any kind. */
export const E0_SECTION = `${EFFICACY_SECTION_HEADING}

No inherited project capital was selected for this attempt.
Proceed using the project and task normally.`;

/**
 * §11: the per-kind framing. Each clause states what the material IS and what it is NOT, so a worker cannot
 * read advisory guidance as authority.
 */
export const KIND_FRAMING = Object.freeze({
  proof: 'EPISTEMIC INFORMATION (not authority): this is a fact the project established earlier. It tells you what is known; it does not authorize any action, widen your write scope, or change what completion requires.',
  reasoning: 'ADMITTED REASONING (not authority): this is a claim the project admitted earlier, about why an obvious approach fails. It tells you what was reasoned; it does not authorize any action and it is not a decision in force.',
  procedure: 'ADVISORY METHOD GUIDANCE (not authority): this is an admitted method. It may influence HOW you work; it cannot widen WHAT you are authorized to do, and it cannot change your write scope or your allowed commands.',
});

/** The order kinds are rendered in, so the section is deterministic rather than dependent on pull order. */
const KIND_ORDER = Object.freeze(['proof', 'reasoning', 'procedure']);

/**
 * Resolve the mode from an environment value.
 *
 * FAIL-SAFE TOWARD PRODUCTION: an unset, empty or unrecognized value yields `off`, because the experiment
 * must never be switched on by accident and a typo must not turn an ordinary deployment into a trial arm.
 * Only the two exact frozen tokens enable an arm.
 *
 * @param {string | undefined} value
 * @returns {string} one of EFFICACY_MODES
 */
export function resolveEfficacyMode(value) {
  if (value === EFFICACY_MODES.E0) return EFFICACY_MODES.E0;
  if (value === EFFICACY_MODES.E1) return EFFICACY_MODES.E1;
  return EFFICACY_MODES.OFF;
}

/** A stable digest of one resolved body. §16 asks for handle identities and digests, never the body itself. */
export function bodyDigest(body) {
  return createHash('sha256').update(canonical(body), 'utf8').digest('hex');
}

/** Canonical JSON, so the digest does not depend on key insertion order. */
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/**
 * The body text of a resolved pull, per kind.
 *
 * The three kinds carry their payload under different fields — a proof's `body`, a reasoning claim's
 * `claim`, a procedure revision's `body` — and the parent's resolver has already normalized the useful half
 * into `body`. This reads `body` first and falls back to the kind-specific field, so a shape change upstream
 * degrades to "the section shows less" rather than to "the section shows the wrong object".
 */
export function bodyTextOf(result) {
  const body = result?.body ?? result?.claim ?? result?.value;
  if (body === undefined || body === null) return '';
  if (typeof body === 'string') return body;
  return JSON.stringify(body, null, 2);
}

/**
 * Render the experimental section for one trial.
 *
 * @param {{ mode: string, resolved: readonly { handle: string, kind: string, body: unknown }[], failures?: readonly { handle: string, detail: string }[] }} input
 * @returns {string} the section text (never empty: both arms carry the boundary)
 */
export function renderEfficacyReview(input) {
  if (input.mode !== EFFICACY_MODES.E1) return E0_SECTION;
  const lines = [EFFICACY_SECTION_HEADING, '', 'The following project capital was selected for this attempt and is provided below in full.', 'Read it before you begin: it is background for the task, and it is not a substitute for examining the project itself.', ''];
  const resolved = [...(input.resolved ?? [])].sort((left, right) => KIND_ORDER.indexOf(left.kind) - KIND_ORDER.indexOf(right.kind));
  for (const entry of resolved) {
    lines.push(`--- ${entry.kind.toUpperCase()} (${entry.handle}) ---`);
    lines.push(KIND_FRAMING[entry.kind] ?? `${entry.kind.toUpperCase()} (not authority)`);
    lines.push('');
    lines.push(bodyTextOf(entry.body));
    lines.push('');
  }
  const failures = input.failures ?? [];
  if (failures.length > 0) {
    /**
     * §9: a handle that did NOT resolve is stated rather than hidden. An E1 trial whose capital is partly
     * missing is not a clean E1 observation, and the harness classifies it rather than counting it.
     */
    lines.push('CAPITAL THAT COULD NOT BE DELIVERED:');
    for (const failure of failures) lines.push(`  - ${failure.handle}: ${failure.detail}`);
    lines.push('');
  }
  return lines.join('\n').trimEnd();
}

/**
 * Apply the efficacy section to a composed prompt.
 *
 * ADDITIVE, like the R2-U affordance: for `off` this returns `text` ITSELF, so byte-identity with production
 * is a property of the code path rather than of a careful re-rendering.
 *
 * @param {string} text the prompt the host composed
 * @param {{ mode: string, resolved?: readonly any[], failures?: readonly any[] }} input
 * @returns {string}
 */
export function applyEfficacyReview(text, input) {
  if (input.mode !== EFFICACY_MODES.E0 && input.mode !== EFFICACY_MODES.E1) return text;
  return `${text}\n\n${renderEfficacyReview({ mode: input.mode, resolved: input.resolved ?? [], failures: input.failures ?? [] })}`;
}

/** A stable digest of the rendered section, recorded per trial so the presentation is checkable. */
export function sectionDigest(section) {
  return createHash('sha256').update(section, 'utf8').digest('hex');
}
