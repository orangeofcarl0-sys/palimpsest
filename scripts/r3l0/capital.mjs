/**
 * R3-L0 §6/§7/§8 — THE FROZEN GOVERNED COGNITIVE CAPITAL BUNDLE, AND THE TWO ARMS.
 *
 * §6 requires a frozen capital bundle DERIVED FROM THE PREHISTORY, using EXISTING OWNERS ONLY, with the
 * preferred structure per lesson:
 *
 *   Proof            the historical evidence/result binding
 *   ReasoningClaim   the mechanism explanation
 *   Procedure        the reusable method
 *
 * §6 forbids three things this module is built to respect:
 *
 *   · no new asset kind is created — the three owners already exist and are used as they are;
 *   · no answer to a future hidden diagnostic case is written — every body states the GENERAL historical
 *     lesson, and the digests are checked against the diagnostic case text so a future-oracle literal cannot
 *     sneak in;
 *   · nothing may change after trial 1 — the bodies are frozen constants and their digests are recorded.
 *
 * §7 defines the two arms. The ONLY difference between them is whether the governed capital is SELECTED for a
 * generation:
 *
 *   H — HISTORY_ONLY   full durable Project history and evolving world; NO selected capital; no hidden body
 *                      injection; no automatic review.
 *   C — CAPITALIZED    the same history PLUS the governed capital, through admission ->
 *                      ProjectAssetAssociation -> future Context selection -> model-visible index ->
 *                      governed pull -> canonical current body.
 *
 * §8 is explicit that H must NOT be a bare repository: it retains normal Palimpsest — Project, Work, Attempt,
 * Result, Verification, Promotion and ordinary durable history. The treatment is the cognitive-capital layer,
 * not Palimpsest itself. Both arms therefore run the IDENTICAL harness; `knowledge` is the only difference.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { createHash } from 'node:crypto';

import { PREPAID_LESSONS } from './project.mjs';
import { DIAGNOSTIC_CASES } from './diagnostic.mjs';

export const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex');
const NL = String.fromCharCode(10);

/* ================================================================ §6 the capital bodies */

/**
 * §6: THE GENERAL LESSON BODIES, one per lesson.
 *
 * Each body states the OBLIGATION, in the terms of the mechanism, and says nothing about any future case. The
 * `statement` is the claim; `explanation` is the mechanism; `method` is the reusable ordered procedure.
 */
export const CAPITAL_BODIES = Object.freeze({
  L1: Object.freeze({
    lesson: 'L1',
    statement: 'A mutation entry point must validate the complete request before it applies the first effect, so that a refusal leaves the caller\'s state exactly as it was.',
    explanation: 'Validation and effect must not interleave. If the first operation is applied before a later one is examined, a refusal has already changed the caller\'s state, and the caller keeps using that state. The obligation is therefore about ORDER, not about which validation is performed: the whole request must be known to be usable before any of it is applied.',
    method: Object.freeze([
      'Read the complete request first, without applying anything.',
      'Validate every operation in it against the current state: every referenced entity must exist, and every requested change must be one the contract admits.',
      'Only after the whole request validates, apply the operations.',
      'Record that the request was applied, so a repeat is a no-op.',
      'If validation fails, throw and apply nothing — the caller\'s state must be byte-identical to its pre-call form.',
    ]),
    applicableTo: 'any entry point that applies more than one effect to caller-owned state',
    limitations: Object.freeze([
      'advisory method guidance only; it authorizes no command, path or effect',
      'it does not say which validations a given contract requires, only that they must all precede the first effect',
    ]),
  }),
  L2: Object.freeze({
    lesson: 'L2',
    statement: 'A dependency closure must be computed and frozen before the mutation that destroys the dependency edges.',
    explanation: 'The mutation is what removes the evidence the computation needs. If the affected set is computed after the first removal, the edges that would have identified the remaining affected entities are already gone, and the result is silently INCOMPLETE. The incompleteness is invisible to the caller, because an incomplete closure still looks like a complete one. The obligation is therefore about ORDER too: compute over the intact structure, freeze the set, and only then mutate.',
    method: Object.freeze([
      'Identify the roots of the change from the current structure.',
      'Traverse the dependency relation while it is still intact, accumulating the complete transitive closure.',
      'Freeze the closure — it must not be recomputed during or after the mutation.',
      'Only then apply the mutation to every member of the frozen set.',
      'Do not traverse again after the first removal: the relation has changed.',
    ]),
    applicableTo: 'any path where a mutation invalidates or removes the structure a closure is computed from',
    limitations: Object.freeze([
      'advisory method guidance only; it authorizes no command, path or effect',
      'it does not decide what the dependency relation IS for a given domain, only when it must be traversed',
    ]),
  }),
});

/**
 * §6: A GUARD AGAINST FUTURE-ORACLE LITERALS.
 *
 * §6 forbids writing an answer to a future hidden diagnostic case. The check is mechanical: no capital body may
 * contain a literal that appears only in the diagnostic case data and nowhere in the project's own history. The
 * case ids, the case fixtures and the expected ledgers are therefore searched for in the bodies, and a hit is a
 * failure rather than a warning.
 */
export function futureOracleLeakage(bodies = CAPITAL_BODIES) {
  const caseText = JSON.stringify(DIAGNOSTIC_CASES);
  const leaks = [];
  for (const [lesson, body] of Object.entries(bodies)) {
    const text = [body.statement, body.explanation, ...body.method, ...body.limitations].join(NL);
    /** The case IDS are the most direct oracle literal: a body naming `d3a` would be answering a case. */
    for (const testCase of DIAGNOSTIC_CASES) {
      if (text.includes(testCase.id)) leaks.push(`${lesson} names diagnostic case id ${testCase.id}`);
    }
    /** The fixture tenant/capability values are the case data; a body quoting them would be an oracle literal. */
    for (const literal of ['acme', 'beta', 'ghost', 'platinum', 'g1', 'g2', 'g3', 'k1', 'k2']) {
      if (new RegExp(`\\b${literal}\\b`, 'u').test(text)) leaks.push(`${lesson} quotes case fixture literal "${literal}"`);
    }
    /** A body must also not embed the case JSON itself. */
    if (caseText.includes(text.slice(0, 40))) leaks.push(`${lesson} text appears verbatim in the case data`);
  }
  return Object.freeze({
    leakFree: leaks.length === 0,
    leaks: Object.freeze(leaks),
    note: 'no capital body may name a diagnostic case id, quote a case fixture literal, or appear in the case data',
  });
}

/* ================================================================ §6 the prehistory evidence sources */

/** §6: the historical evidence each lesson binds to, taken from the project's own incident record. */
export const PREHISTORY_SOURCES = Object.freeze({
  L1: Object.freeze({
    sourceId: 'incident-1-applyChanges',
    label: 'Incident 1 — applyChanges applied before it validated',
    mediaType: 'text/plain',
    /** The evidence binding names the incident and the fix, which is the historical basis for the lesson. */
    evidenceStatement: 'Incident 1: applyChanges applied each change as it arrived, so a refusal left earlier changes already written. The fix was to validate the complete change set before the first write.',
  }),
  L2: Object.freeze({
    sourceId: 'incident-2-recomputeIndex',
    label: 'Incident 2 — recomputeIndex lost the edges it needed',
    mediaType: 'text/plain',
    evidenceStatement: 'Incident 2: recomputeIndex removed the node first and looked for its dependents afterwards, so the edges it needed were already gone and the closure was incomplete. The fix was to compute the complete affected set while the edges still existed.',
  }),
});

/** §6: the reasoning-cell objective and branch question, one per lesson. */
export const REASONING_FRAMES = Object.freeze({
  L1: Object.freeze({
    cellId: 'cell-mutation-order',
    objective: 'establish when a multi-effect mutation entry point owes its caller an unchanged state',
    branchQuestion: 'must every validation precede the first effect, or may effects be applied as operations are validated?',
  }),
  L2: Object.freeze({
    cellId: 'cell-closure-order',
    objective: 'establish when a dependency closure must be computed relative to the mutation that removes the edges',
    branchQuestion: 'may the affected set be computed while the mutation proceeds, or must it be frozen first?',
  }),
});

/* ================================================================ §6 the bundle digest */

/**
 * §6: THE FROZEN BUNDLE.
 *
 * `bodyDigests` are the digests of the exact bytes the owners will hold, so a post-trial change to any body is
 * detectable. §6 requires the content, owner references, admission basis, revision, applicability/limitations
 * and body digests to be frozen; the owner references and revisions are filled in at admission time and
 * recorded alongside, because they are minted by the owners rather than authored here.
 */
export function frozenBundle() {
  const perLesson = {};
  for (const lesson of PREPAID_LESSONS) {
    const body = CAPITAL_BODIES[lesson.id];
    perLesson[lesson.id] = Object.freeze({
      lesson: lesson.id,
      lessonStatement: lesson.statement,
      obligation: lesson.obligation,
      origin: lesson.origin,
      statement: body.statement,
      explanation: body.explanation,
      method: body.method,
      applicableTo: body.applicableTo,
      limitations: body.limitations,
      source: PREHISTORY_SOURCES[lesson.id],
      reasoning: REASONING_FRAMES[lesson.id],
      /** §6: the digest of the exact content that will be admitted. */
      bodyDigests: Object.freeze({
        statement: sha256(body.statement),
        explanation: sha256(body.explanation),
        method: sha256(body.method.join(NL)),
        limitations: sha256(body.limitations.join(NL)),
      }),
    });
  }
  return Object.freeze({
    kind: 'FrozenCapitalBundle',
    stage: 'R3-L0',
    lessons: Object.freeze(perLesson),
    leakage: futureOracleLeakage(),
    /** §6: the owners this bundle uses, all pre-existing. */
    owners: Object.freeze(['src/proof_asset', 'src/reasoning_cell', 'src/procedures', 'src/project_workspace']),
    newAssetKindCreated: false,
    /** §6: nothing may change after trial 1. */
    frozenAt: 'before the first primary L0 worker run',
  });
}

/** §6: the digest of the whole bundle, so a post-trial edit is detectable as one number. */
export function bundleDigest(bundle = frozenBundle()) {
  return sha256(JSON.stringify(bundle.lessons));
}

/* ================================================================ §7 the two arms */

/**
 * §7/§8: THE ARM DEFINITIONS.
 *
 * The arms differ in EXACTLY ONE respect, and it is stated as data so the harness cannot quietly do more.
 */
export const ARMS = Object.freeze({
  H: Object.freeze({
    id: 'H',
    name: 'HISTORY_ONLY',
    receives: 'the full durable Project history and the evolving project world',
    selectedCapital: Object.freeze([]),
    /** §7: the negative conditions, stated so §17 can check each one. */
    forbidden: Object.freeze([
      'no selected capital handles',
      'no hidden body injection',
      'no automatic review',
    ]),
    /** §8: H is NOT a bare repository. */
    retainsFullPalimpsest: true,
  }),
  C: Object.freeze({
    id: 'C',
    name: 'CAPITALIZED',
    receives: 'the same durable Project history plus the governed prepaid capital',
    /** §7: the required path, in order. */
    requiredPath: Object.freeze(['admission', 'ProjectAssetAssociation', 'future Context selection', 'actual model-visible index', 'governed pull', 'canonical current body']),
    /** §7: the current production/common worker interface; NO host-mediated forced efficacy review. */
    hostMediatedForcedReview: false,
    voluntaryGovernedConsumption: true,
    retainsFullPalimpsest: true,
  }),
});

/** §7: whether an arm selects capital for a generation. The ONLY behavioural difference. */
export function armSelectsCapital(armId) {
  return armId === 'C';
}

/**
 * §7: build the `knowledge` selection a CAPITALIZED generation passes to `service.start`.
 *
 * An H generation passes NOTHING — not an empty object, not `undefined` wrapped in a default: the call omits the
 * field entirely, so the compile takes the pre-E1-K path exactly.
 */
export function knowledgeSelectionFor(armId, refs) {
  if (armId !== 'C') return undefined;
  return Object.freeze({
    proof: Object.freeze(refs.proof.map((entry) => Object.freeze({ claimId: entry.claimId }))),
    reasoning: Object.freeze(refs.reasoning.map((entry) => Object.freeze({ cellId: entry.cellId, claimId: entry.claimId }))),
    procedure: Object.freeze(refs.procedure.map((entry) => Object.freeze({ procedureId: entry.procedureId, revision: entry.revision, reason: entry.reason }))),
  });
}

/* ================================================================ §11 PERR */

/**
 * §11: PREPAID ERROR RECURRENCE.
 *
 *   PERR = repeated prepaid diagnostic failures / eligible prepaid exposures
 *
 * Both terms come from data frozen BEFORE execution: `eligiblePrepaidExposures` from the declared mapping and
 * the diagnostic vector from the research oracle. §11 is explicit that the prepaid relationship must NOT be
 * inferred after outcomes are known, which is why the mapping is a constant in `project.mjs` and the analysis
 * reads it rather than deriving it.
 */
export function perrOf(generationVectors, eligibleByGeneration) {
  let repeated = 0;
  let eligible = 0;
  const detail = [];
  for (const [generation, vector] of Object.entries(generationVectors)) {
    const exposures = eligibleByGeneration[generation] ?? [];
    eligible += exposures.length;
    const failed = exposures.filter((classId) => vector.classPass[classId] === false);
    repeated += failed.length;
    detail.push(Object.freeze({ generation, eligible: exposures.length, failed: Object.freeze(failed) }));
  }
  return Object.freeze({
    repeatedPrepaidFailures: repeated,
    eligiblePrepaidExposures: eligible,
    PERR: eligible === 0 ? null : repeated / eligible,
    detail: Object.freeze(detail),
    note: 'a prepaid exposure that FAILS is a repeated prepaid error: the project already paid to learn that lesson',
  });
}

/** §11/§18: how many DISTINCT prepaid lessons were repeated at least once across the trajectory. */
export function repeatedLessonCount(generationVectors, eligibleByGeneration) {
  const repeated = new Set();
  for (const [generation, vector] of Object.entries(generationVectors)) {
    for (const classId of eligibleByGeneration[generation] ?? []) {
      if (vector.classPass[classId] === false) {
        const lesson = DIAGNOSTIC_CASES.find((testCase) => testCase.classId === classId);
        const declared = (lesson === undefined ? null : classId);
        repeated.add(declared);
      }
    }
  }
  return repeated.size;
}
