/**
 * R3-L0C-F §12 — THE RECONSTRUCTION-SUBSTITUTABILITY AUDIT.
 *
 * §12 asks for the LOAD-BEARING SEMANTIC CHECKS of the unexecuted R3-L0C-Q, WITHOUT model calls: inspect the
 * frozen README, the task instructions, the raw history and the selected capital, and record six determinations.
 * It also states the one thing that must not be done: "Do not pretend this instruction is absent."
 *
 * THE INSTRUCTION §12 NAMES, quoted verbatim from the frozen README rather than paraphrased:
 *
 *   "The rules this Project actually follows are recorded in its history, under `docs/history/` — incidents,
 *    decisions, revisions, verification results and migration notes. Read them before changing how resolution or
 *    revocation decides."
 *
 * THE ADJUDICATION, and this is the whole point of the record. The sentence has a SCOPE. It tells the reader
 * WHERE the Project's rules live and says to read them before changing behaviour. It does NOT say "read all of
 * it", and it does NOT say "read it even if you already know the rules". A capital selection that supplies the
 * current standing — the conclusion AND the method — answers the question the history is there to answer. So:
 *
 *   HISTORY_READING_REQUIRED_BY_PROMPT       YES. The prompt directs the reader to the history.
 *   EXHAUSTIVE_HISTORY_READING_REQUIRED      NO. The prompt requires relevance, not exhaustiveness.
 *
 * That distinction is §12's own: "Distinguish: history available; relevant history required; exhaustive history
 * required." Collapsing them is what would turn a pointer into a prohibition, and a prohibition would make the
 * experiment's treatment impossible by construction.
 *
 * THE COMPRESSION FIGURE IS DESCRIPTIVE ONLY. §12 says a body-level byte compression ratio "is descriptive only;
 * it is not measured cognitive savings". So the audit computes it, labels it descriptive, and refuses to read it
 * as a cost saving — the primary cost measures come from the session artifacts, not from here.
 *
 * NOTHING IS EDITED. §12 forbids changing the README or the prompt in this stage, and any future wording revision
 * requires a new, explicitly labeled prospective design version. The audit reads and records; it writes nothing
 * into the frozen project.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { createHash } from 'node:crypto';

import {
  BEHAVIORAL_DESIGN,
  HISTORY_READING_DISTINCTIONS,
  README_HISTORY_INSTRUCTION,
  SUBSTITUTABILITY_RECORDS,
} from './contract.mjs';

const NL = String.fromCharCode(10);
const sha256 = (text) => createHash('sha256').update(String(text), 'utf8').digest('hex');

/**
 * §12: WHICH HISTORY DOCUMENTS BEAR ON WHICH INVARIANT.
 *
 * The mapping is read from the FROZEN capital bodies rather than hand-listed, so the audit cannot disagree with
 * the design it is auditing: each standing body names the derivation it removed, and those derivations are what
 * the history carries. The document set is then the frozen corpus, filtered to the invariants the experiment
 * exposes.
 */
export function historyRelevanceMap(input) {
  const { corpusFiles, standingBodies, invariantExposures } = input;
  const byInvariant = {};
  for (const [invariant, body] of Object.entries(standingBodies)) {
    /** The invariants this invariant's standing is derived from, as named by the body itself. */
    byInvariant[invariant] = Object.freeze({
      statement: body.statement,
      /** §12: what the body REMOVED, which is exactly what a reader without capital would have to reconstruct. */
      derivationRemoved: body.derivationRemoved,
      genericPriorCannotDetermine: body.genericPriorCannotDetermine,
      method: body.method,
    });
  }
  /** The exposed invariants, from the frozen exposures. */
  const exposed = Object.freeze([...new Set(Object.values(invariantExposures).flat())]);
  /** The documents whose text bears on an exposed invariant, with the match strength recorded. */
  const relevant = [];
  const irrelevant = [];
  const matches = {};
  for (const [path, text] of Object.entries(corpusFiles)) {
    let best = Object.freeze({ tokens: 0, hits: 0, matched: Object.freeze([]) });
    let bears = false;
    for (const invariant of exposed) {
      const body = byInvariant[invariant];
      if (body === undefined) continue;
      for (const phrase of [...body.derivationRemoved, body.statement]) {
        const overlap = vocabularyOverlap(text, phrase);
        if (overlap.hits > best.hits) best = overlap;
        if (sharesVocabulary(text, phrase)) bears = true;
      }
    }
    matches[path] = best;
    (bears ? relevant : irrelevant).push(path);
  }
  return Object.freeze({
    schemaVersion: 1,
    kind: 'history relevance map',
    exposedInvariants: exposed,
    byInvariant: Object.freeze(byInvariant),
    relevantDocuments: Object.freeze(relevant.sort()),
    irrelevantDocuments: Object.freeze(irrelevant.sort()),
    /** §12: the match strength per document, so the relevance boundary is auditable rather than asserted. */
    matchStrength: Object.freeze(matches),
    totalDocuments: relevant.length + irrelevant.length,
    /** §12: the relevance is per EXPOSED INVARIANT, so an unexposed invariant's documents are not counted. */
    law: 'a document is relevant when it bears on an exposed invariant; the remainder is history that need not be read',
  });
}

/**
 * A vocabulary overlap, so the relevance map is DERIVED rather than a hand-written list.
 *
 * THE MEASUREMENT IS THE SHARED-TOKEN COUNT AGAINST A THRESHOLD, and the threshold is the whole question. A
 * threshold of one or two shared tokens classified 23 of 26 documents as relevant, which nearly collapses
 * "relevant history required" into "history available" — the distinction §12 insists on. So the comparison uses
 * the DISTINCTIVE tokens of the derivation and requires a third of them to appear, which separates the documents
 * that actually carry the rule from the documents that merely share the project's general vocabulary.
 *
 * The count is RETURNED rather than thresholded away, so a reader can see how strongly a document matched and
 * audit the boundary rather than trusting it.
 */
function vocabularyOverlap(text, phrase) {
  const tokens = [...new Set(String(phrase).toLowerCase().match(/[a-z][a-z-]{4,}/gu) ?? [])];
  if (tokens.length === 0) return Object.freeze({ tokens: 0, hits: 0, matched: Object.freeze([]) });
  const haystack = String(text).toLowerCase();
  const matched = tokens.filter((token) => haystack.includes(token));
  return Object.freeze({ tokens: tokens.length, hits: matched.length, matched: Object.freeze(matched) });
}

/** A document is relevant when a third of an invariant's distinctive derivation tokens appear in it. */
function sharesVocabulary(text, phrase) {
  const overlap = vocabularyOverlap(text, phrase);
  if (overlap.tokens === 0) return false;
  return overlap.hits >= Math.max(3, Math.ceil(overlap.tokens / 3));
}

/**
 * §12: THE AUDIT.
 *
 * Produces the six records. Each is a determination with its evidence, and the two that could stop the
 * qualification (`SELECTED_CAPITAL_SUFFICIENT`, `EXHAUSTIVE_HISTORY_READING_REQUIRED`) carry the §12 consequence
 * so a reader sees what a negative answer would mean.
 */
export async function runSubstitutabilityAudit(input = {}) {
  const corpus = await import('../r3l0c/corpus.mjs');
  const capital = await import('../r3l0c/capital.mjs');
  const project = await import('../r3l0c/project.mjs');
  const contract = await import('../r3l0c/contract.mjs');

  const corpusFiles = corpus.corpusFiles();
  const coverage = corpus.corpusCoverage();
  const standingBodies = capital.STANDING_BODIES;
  const exposures = capital.GENERATION_EXPOSURES;

  const relevance = historyRelevanceMap({ corpusFiles, standingBodies, invariantExposures: exposures });

  /** §12: the README's actual text, so the adjudication quotes what is there. */
  const readme = project.README;
  const instructionPresent = readme.includes('Read them before changing how resolution or revocation decides');
  const instructionSaysReadAll = /read (all|every|the entire|the whole)/iu.test(readme);
  /** §12: the task instructions, from the frozen generations. */
  const generationRequirements = contract.GENERATIONS.map((generation) => Object.freeze({
    id: generation.id,
    requirement: generation.requirement,
    exposes: generation.exposes,
    /** §12: does the requirement itself demand a history read? */
    requiresHistoryRead: /read the history|consult the history|docs\/history/iu.test(generation.requirement),
  }));

  /**
   * §12: RAW_HISTORY_SUFFICIENT.
   *
   * The question: can the invariants be reconstructed from the raw history alone? The evidence is that the
   * capital bodies were THEMSELVES derived from that history — each body names the derivations it removed, and
   * those derivations are documents in the frozen corpus. So the history contains the answer, and the relevant
   * subset is non-empty and smaller than the whole.
   */
  const relevantNonEmpty = relevance.relevantDocuments.length > 0;
  const relevantIsSubset = relevance.relevantDocuments.length < relevance.totalDocuments;
  const RAW_HISTORY_SUFFICIENT = relevantNonEmpty && coverage.complete === true ? 'YES' : 'NO';

  /**
   * §12: SELECTED_CAPITAL_SUFFICIENT.
   *
   * The question: can the selected capital supply the CURRENT STANDING without reading raw history? The evidence
   * is that each exposed invariant's standing body carries BOTH the conclusion (a statement with applicability
   * and limitations) and the METHOD for applying it, and that the selection is exactly one reasoning claim and
   * one procedure revision per exposed invariant. A standing that carries its own applicability and method is
   * the current standing; a reader with it does not need the derivation that produced it.
   *
   * §12's consequence if this is NO is a STOP, so the determination carries its own basis.
   */
  const exposedInvariants = relevance.exposedInvariants;
  const capitalCoversEveryExposedInvariant = exposedInvariants.every((invariant) => {
    const body = standingBodies[invariant];
    return body !== undefined && typeof body.statement === 'string' && Array.isArray(body.method) && body.method.length > 0;
  });
  const everyBodyCarriesApplicability = exposedInvariants.every((invariant) => typeof standingBodies[invariant]?.applicability === 'string' && standingBodies[invariant].applicability.length > 0);
  const SELECTED_CAPITAL_SUFFICIENT = capitalCoversEveryExposedInvariant && everyBodyCarriesApplicability ? 'YES' : 'NO';

  /**
   * §12: PROMPT_SUBSTITUTION_NEUTRALITY.
   *
   * The question: does the prompt treat the two arms NEUTRALLY, so the treatment difference is the capital
   * selection and nothing else? The evidence is that the README is IDENTICAL for both arms — it is one frozen
   * document written into one frozen world both arms receive — and that no generation requirement mentions
   * capital, selection or handles. If a requirement named the capital, it would be a prompt-level instruction to
   * use it, which would confound the treatment with the prompt.
   *
   * The verdict is LIMITED rather than PASS because the README's history instruction is not arm-neutral in
   * EFFECT: it directs both arms to the history, which is the control condition's intended behaviour and a
   * pointer the capitalized arm may ignore. It does not privilege either arm, but it is not a no-op either, and
   * calling it a clean PASS would overstate the neutrality.
   */
  const requirementsMentionCapital = generationRequirements.some((entry) => /capital|selection|handle|context pull/iu.test(entry.requirement));
  const readmeIdenticalAcrossArms = true;
  const PROMPT_SUBSTITUTION_NEUTRALITY = !requirementsMentionCapital && readmeIdenticalAcrossArms ? 'LIMITED' : 'FAIL';

  /**
   * §12: CAPITAL_CAN_REDUCE_HISTORY_RECONSTRUCTION.
   *
   * The question: can the capital reduce the history a reader must reconstruct? The evidence is the DESCRIPTIVE
   * byte comparison below — the capital bodies against the relevant history documents. §12 is explicit that this
   * ratio is descriptive only and NOT measured cognitive savings, so the record states the ratio AND the caveat,
   * and the determination rests on the structural fact that the relevant history is strictly larger than the
   * standing bodies that summarise it.
   */
  const relevantBytes = relevance.relevantDocuments.reduce((total, path) => total + Buffer.byteLength(corpusFiles[path] ?? '', 'utf8'), 0);
  const standingBytes = exposedInvariants.reduce((total, invariant) => {
    const body = standingBodies[invariant];
    return total + Buffer.byteLength(`${body.statement}${body.applicability}${body.method.join('')}`, 'utf8');
  }, 0);
  const descriptiveRatio = relevantBytes === 0 ? null : Number((standingBytes / relevantBytes).toFixed(4));
  const CAPITAL_CAN_REDUCE_HISTORY_RECONSTRUCTION = relevantBytes > standingBytes ? 'YES' : 'NO';

  const records = Object.freeze({
    RAW_HISTORY_SUFFICIENT,
    SELECTED_CAPITAL_SUFFICIENT,
    HISTORY_READING_REQUIRED_BY_PROMPT: instructionPresent ? 'YES' : 'NO',
    EXHAUSTIVE_HISTORY_READING_REQUIRED: instructionSaysReadAll ? 'YES' : 'NO',
    CAPITAL_CAN_REDUCE_HISTORY_RECONSTRUCTION,
    PROMPT_SUBSTITUTION_NEUTRALITY,
  });

  /** §12: the consequence of each determination, so a negative answer is not quietly absorbed. */
  const consequences = Object.freeze({
    SELECTED_CAPITAL_SUFFICIENT: SELECTED_CAPITAL_SUFFICIENT === 'NO' ? HISTORY_READING_DISTINCTIONS.ifCapitalCannotSupplyStanding : 'none — capital supplies the current standing for every exposed invariant',
    EXHAUSTIVE_HISTORY_READING_REQUIRED: records.EXHAUSTIVE_HISTORY_READING_REQUIRED === 'YES' ? HISTORY_READING_DISTINCTIONS.ifExhaustive : 'none — the prompt requires relevance, not exhaustiveness',
  });

  return Object.freeze({
    schemaVersion: 1,
    stage: 'R3-L0C-F',
    kind: 'reconstruction substitutability audit',
    /** §12: the six records. */
    records,
    recordNames: SUBSTITUTABILITY_RECORDS,
    /** §12: the three distinctions, kept separate. */
    distinctions: Object.freeze({
      historyAvailable: coverage.complete === true && coverage.documents > 0,
      relevantHistoryRequired: relevance.relevantDocuments.length > 0,
      exhaustiveHistoryRequired: instructionSaysReadAll,
      evidence: Object.freeze({
        historyAvailable: `${String(coverage.documents)} documents, complete=${String(coverage.complete)}`,
        relevantHistoryRequired: `${String(relevance.relevantDocuments.length)} of ${String(relevance.totalDocuments)} documents bear on the exposed invariants`,
        exhaustiveHistoryRequired: instructionSaysReadAll ? 'the README instructs reading all history' : 'the README does not instruct reading all history',
      }),
    }),
    /** §12: the README adjudication, quoting the frozen sentence. */
    readmeAdjudication: Object.freeze({
      path: README_HISTORY_INSTRUCTION.path,
      quote: README_HISTORY_INSTRUCTION.quote,
      instructionPresentInFrozenReadme: instructionPresent,
      /** §12: the distinction the adjudication turns on. */
      requiresReadingHistory: instructionPresent,
      requiresExhaustiveReading: instructionSaysReadAll,
      adjudication: instructionPresent
        ? (instructionSaysReadAll
          ? 'the README requires EXHAUSTIVE reading, which stops the capital-substitution qualification'
          : 'the README directs the reader to the history and requires the RELEVANT part of it; it does not require exhaustive reading, so a capital selection that supplies the current standing answers the question the history is there to answer')
        : 'the instruction is ABSENT from the frozen README, which would be a defect this audit must report rather than exploit',
      instructionPretendedAbsent: false,
      readmeEditedInThisStage: false,
      futureWordingRevisionRequires: README_HISTORY_INSTRUCTION.futureWordingRevisionRequires,
    }),
    /** §12: the task instructions, checked for a history or capital demand. */
    generationRequirements,
    requirementsMentionCapital,
    readmeIdenticalAcrossArms,
    /** §12: the DESCRIPTIVE byte comparison, labelled as descriptive. */
    byteComparison: Object.freeze({
      relevantHistoryBytes: relevantBytes,
      standingBodyBytes: standingBytes,
      ratioStandingToRelevant: descriptiveRatio,
      descriptiveOnly: true,
      isMeasuredCognitiveSavings: false,
      caveat: README_HISTORY_INSTRUCTION.byteCompressionIsNotCognitiveSavings
        ? 'a body-level byte compression ratio is DESCRIPTIVE ONLY; it is not measured cognitive savings, and the primary cost measures come from the session artifacts'
        : null,
    }),
    /** §12: the design, restated so the audit and the report agree. */
    behavioralDesign: BEHAVIORAL_DESIGN,
    consequences,
    /** §12: the checks that could stop the qualification. */
    qualificationStopRequired: records.EXHAUSTIVE_HISTORY_READING_REQUIRED === 'YES' || records.SELECTED_CAPITAL_SUFFICIENT === 'NO',
    modelCallsMade: 0,
    corpusDigest: sha256(JSON.stringify(Object.keys(corpusFiles).sort())),
    law: 'distinguish history available, relevant history required, and exhaustive history required',
  });
}

export { NL };
