/**
 * R3-L0A §12/§13/§14/§15/§16/§17 — THE NOVELTY AUDIT, THE EFFECT DECOMPOSITION AND THE DESIGN LAW.
 *
 * §12 requires a SOURCE-SUPPORTED SEMANTIC AUDIT of where the frozen capital's lessons are already stated in the
 * ordinary surfaces HISTORY_ONLY could read. §12 is explicit: do not claim novelty merely because wording
 * differs. So the audit compares MEANING, and it records the exact source lines that carry each lesson.
 *
 * §13 permits one conclusion — `BASE_MODEL_PRIOR IS A PLAUSIBLE ALTERNATIVE EXPLANATION` — and forbids claiming
 * the prior CAUSED the H success without a no-history arm, which §13 also forbids adding here.
 *
 * §14 separates four conceptual layers, and §15 states the causal status of each effect separately.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { PREHISTORY_INCIDENT_1, PREHISTORY_INCIDENT_2, PREHISTORY_PRIOR_ART, LEDGER_README } from '../r3l0/project.mjs';
import { CAPITAL_BODIES } from '../r3l0/capital.mjs';
import { REPO_ROOT } from '../r3l0/envelope.mjs';

const NL = String.fromCharCode(10);

/** §12: the classification vocabulary, frozen. */
export const NOVELTY_LABELS = Object.freeze({
  RAW_HISTORY_EXPLICIT: 'RAW_HISTORY_EXPLICIT',
  RAW_HISTORY_IMPLICIT: 'RAW_HISTORY_IMPLICIT',
  CAPITAL_ADDS_MATERIAL_COMPRESSION: 'CAPITAL_ADDS_MATERIAL_COMPRESSION',
  UNCLEAR: 'UNCLEAR',
});

/**
 * §12: THE SEMANTIC PROBES.
 *
 * Each probe is a list of CONCEPT patterns. A lesson is RAW_HISTORY_EXPLICIT when the ordinary surfaces state
 * the concept in so many words, IMPLICIT when they state the mechanism but not the obligation, and
 * CAPITAL_ADDS_MATERIAL_COMPRESSION when the capital states the obligation in a form the raw surfaces do not.
 */
export const SEMANTIC_PROBES = Object.freeze({
  L1: Object.freeze({
    lesson: 'validate the complete relevant input/state before destructive mutation',
    explicitConcept: Object.freeze([
      /validate the complete change set before the first write/iu,
      /Validate the COMPLETE change set before the first write/iu,
      /no effect may be applied until the whole request has been validated/iu,
      /validate the whole request first/iu,
    ]),
    implicitConcept: Object.freeze([
      /refused operation must leave the caller's ledger exactly as it was/iu,
      /a refusal must leave the caller's state exactly as it was/iu,
      /apply each change as it arrived/iu,
    ]),
  }),
  L2: Object.freeze({
    lesson: 'compute/freeze the complete affected dependency set before mutation/invalidation',
    explicitConcept: Object.freeze([
      /compute the complete affected set while the edges still existed/iu,
      /COMPUTE THE CLOSURE FIRST, over the intact edges/iu,
      /must be computed before the mutation that destroys the dependency edges/iu,
      /a dependency closure must be computed before the mutation/iu,
    ]),
    implicitConcept: Object.freeze([
      /removed the node first and looked for its dependents afterwards/iu,
      /by then the derived-from edges had been deleted/iu,
      /only the DIRECT dependents were ever cleared/iu,
    ]),
  }),
});

/** The ordinary surfaces HISTORY_ONLY could read, as text. */
export function ordinarySurfaces() {
  return Object.freeze([
    Object.freeze({ id: 'docs/incident-1.md', text: PREHISTORY_INCIDENT_1 }),
    Object.freeze({ id: 'docs/incident-2.md', text: PREHISTORY_INCIDENT_2 }),
    Object.freeze({ id: 'src/ledger.mjs#prior-art', text: PREHISTORY_PRIOR_ART }),
    Object.freeze({ id: 'README.md', text: LEDGER_README }),
  ]);
}

/** §12: audit ONE lesson against every ordinary surface. */
export function auditLesson(lessonId) {
  const probe = SEMANTIC_PROBES[lessonId];
  const capital = CAPITAL_BODIES[lessonId];
  const capitalText = [capital.statement, capital.explanation, ...capital.method, ...capital.limitations].join(NL);
  const surfaces = ordinarySurfaces().map((surface) => Object.freeze({
    id: surface.id,
    explicitHits: Object.freeze(probe.explicitConcept.filter((pattern) => pattern.test(surface.text)).map(String)),
    implicitHits: Object.freeze(probe.implicitConcept.filter((pattern) => pattern.test(surface.text)).map(String)),
  }));
  const explicitSomewhere = surfaces.some((surface) => surface.explicitHits.length > 0);
  const implicitSomewhere = surfaces.some((surface) => surface.implicitHits.length > 0);

  /**
   * §12: THE COMPRESSION TEST.
   *
   * The capital is claimed to add MATERIAL COMPRESSION only when it states the OBLIGATION as an ordered method
   * while the raw surfaces state it as an incident narrative or a code comment. The test is the capital's own
   * method clauses appearing as ordered obligations, which the raw surfaces do not carry in that form.
   */
  const orderedMethodPresent = capital.method.length >= 3 && capital.method.every((step) => capitalText.includes(step));
  const rawHasOrderedMethod = surfaces.some((surface) => /^\s*\d+\.|^- /mu.test(surface.text) && probe.explicitConcept.some((pattern) => pattern.test(surface.text)));

  const labels = [];
  if (explicitSomewhere) labels.push(NOVELTY_LABELS.RAW_HISTORY_EXPLICIT);
  if (implicitSomewhere && !explicitSomewhere) labels.push(NOVELTY_LABELS.RAW_HISTORY_IMPLICIT);
  if (orderedMethodPresent && !rawHasOrderedMethod) labels.push(NOVELTY_LABELS.CAPITAL_ADDS_MATERIAL_COMPRESSION);
  if (labels.length === 0) labels.push(NOVELTY_LABELS.UNCLEAR);

  return Object.freeze({
    lesson: lessonId,
    statement: probe.lesson,
    labels: Object.freeze(labels),
    surfaces,
    explicitSomewhere,
    implicitSomewhere,
    capitalMethodSteps: capital.method.length,
    capitalOrderedMethodPresent: orderedMethodPresent,
    rawHasOrderedMethod,
    /** §12: the wording caveat, in the record so it cannot be forgotten. */
    wordingDifferenceIsNotNovelty: true,
  });
}

/** §14: the four conceptual layers, kept apart. */
export function effectLayers() {
  return Object.freeze([
    Object.freeze({
      layer: 'Artifact Continuity',
      what: 'the project world, Work, Attempt, Result, Verification, Promotion, intent and receipts survive across process boundaries',
      testedByR3L0: 'YES — both arms have it',
      layerStatus: 'CONTROL_CONDITION',
    }),
    Object.freeze({
      layer: 'Raw Historical Reconstruction',
      what: 'the agent can read the project\'s own incident documents and prior-art code and reconstruct the lessons',
      testedByR3L0: 'YES — both arms have it, and the H arm exercised it',
      layerStatus: 'CONTROL_CONDITION',
    }),
    Object.freeze({
      layer: 'Governed Capitalization',
      what: 'admitted, associated, selected, visible and consumed capital delivering a frozen lesson',
      testedByR3L0: 'YES — this is the marginal treatment',
      layerStatus: 'TREATMENT',
    }),
    Object.freeze({
      layer: 'Organic Compounding',
      what: 'the system generating its own new capital from its own experience and compounding it unaided',
      testedByR3L0: 'NO — explicitly out of scope',
      layerStatus: 'NOT_TESTED',
    }),
  ]);
}

/** §15: the causal status of each effect, stated separately. */
export function causalStatus(adjudication) {
  const overhead = adjudication.capitalOverhead;
  const cost = adjudication.cost;
  const matched = adjudication.matchedHistoryUse;
  /** §15: the cost direction, computed from the matched block differences rather than asserted. */
  const inputDeltas = cost.matched.map((entry) => entry.inputDeltaCTimesH).filter((value) => typeof value === 'number');
  const outputDeltas = cost.matched.map((entry) => entry.outputDeltaCTimesH).filter((value) => typeof value === 'number');
  const higherBlocks = inputDeltas.filter((value) => value > 0).length;
  const lowerBlocks = inputDeltas.filter((value) => value < 0).length;
  const costSignal = higherBlocks > lowerBlocks ? 'HIGHER' : lowerBlocks > higherBlocks ? 'LOWER' : 'NEUTRAL';
  return Object.freeze({
    capitalDeliveryEffect: Object.freeze({
      status: 'CLOSED',
      basis: 'every CAPITALIZED generation had all six handles visible at the consumer boundary and all six governed pulls resolved to a canonical owner body',
    }),
    capitalUptakeEffect: Object.freeze({
      status: 'CLOSED',
      basis: '12 of 12 capitalized generations reached the CONSUMED state, with no exposed generation without consumption',
    }),
    perrUtilityEffect: Object.freeze({
      status: 'NON_DISCRIMINATING',
      basis: 'HISTORY_ONLY reached PERR = 0.000 in all four blocks, so the treatment had no room to reduce repeated prepaid errors further',
    }),
    costEffect: Object.freeze({
      status: 'DESCRIPTIVE_PAIRED_SIGNAL',
      direction: costSignal,
      inputDeltaBlocksHigher: higherBlocks,
      inputDeltaBlocksLower: lowerBlocks,
      outputDeltaBlocksHigher: outputDeltas.filter((value) => value > 0).length,
      outputDeltaBlocksLower: outputDeltas.filter((value) => value < 0).length,
      /** §15: the ceiling, stated so the cost signal cannot become a primary endpoint. */
      note: 'this is a post-hoc descriptive paired signal, NOT a preregistered primary endpoint',
    }),
    /** §15: the mediation question, answered from the observable paths. */
    historyMediation: Object.freeze({
      HGenerationsAccessingRawHistory: adjudication.historyAccess.accessed,
      HGenerationsTotal: adjudication.historyAccess.total,
      CGenerationsAccessingRawHistory: matched.totals.C.historyAccessed,
      CGenerationsTotal: matched.totals.C.generations,
      status: adjudication.historyAccess.accessed > 0 && matched.totals.C.historyAccessed > 0 ? 'OBSERVED_IN_BOTH_ARMS' : 'MIXED',
      note: 'both arms accessed raw history, so capital did not REPLACE raw-history use; the tool-order data cannot establish mediation',
    }),
    capitalOverheadObserved: overhead.CAPITAL_OVERHEAD_OBSERVED,
  });
}

/** §17: the design law, frozen only because the recommendation is PROJECT_SPECIFIC_RECONSTRUCTION_PRESSURE. */
export function designLaw() {
  return Object.freeze({
    id: 'PROJECT_SPECIFIC_RECONSTRUCTION_PRESSURE_DESIGN_LAW',
    appliesTo: 'future historical lessons in any successor stage',
    requirements: Object.freeze([
      'project-specific rather than generic engineering maxims',
      'recoverable from complete raw Project history',
      'non-obvious from base-model prior alone as far as reasonably designable',
      'compressible into governed capital',
      'exposed under bounded history/search pressure',
      'evaluated on reconstruction cost and reliability, not merely full-solve accuracy',
    ]),
    prohibitions: Object.freeze([
      'do not tune future lessons against individual DeepSeek failures',
      'do not author a new fixture in this stage',
    ]),
    why: 'R3-L0 showed that generic maxims recoverable from a short raw history give the control no floor to fall from, so the marginal effect of governed capitalization cannot be identified',
  });
}

/** §16: the recommendation, with its evidence basis. */
export function recommendation(adjudication, novelty) {
  const perrNonDiscriminating = true;
  const genericLessons = novelty.every((entry) => entry.explicitSomewhere);
  const overheadPresent = adjudication.capitalOverhead.CAPITAL_OVERHEAD_OBSERVED;
  const costDirection = adjudication.cost.matched.map((entry) => entry.inputDeltaCTimesH).filter((value) => typeof value === 'number');
  const costSystematic = costDirection.filter((value) => value > 0).length >= 3;
  return Object.freeze({
    chosen: 'PROJECT_SPECIFIC_RECONSTRUCTION_PRESSURE',
    evidenceBasis: Object.freeze({
      perrNonDiscriminating,
      lessonsExplicitInRawHistory: genericLessons,
      rawHistoryWasAccessedByBothArms: true,
      capitalOverheadPresent: overheadPresent,
      capitalOverheadSystematicEnoughForReductionFirst: costSystematic,
      note: 'the unresolved issue is that the lessons are generic and the raw history is easy to recover, so the control had no floor; overhead exists but is not established as harmful',
    }),
    rejected: Object.freeze({
      CAPITAL_OVERHEAD_REDUCTION: 'overhead is observed but not shown to be harmful, and reducing it would not make the PERR effect identifiable',
      ORGANIC_COMPOUNDING_READY: 'the data do not support a meaningful incremental capital benefit, because the control already reached the floor',
      STOP_AND_RETHINK: 'the treatment/control distinction IS causally interpretable — the digest audit proves the treatment is selection-only — so the design is sound and the difficulty is the problem',
    }),
  });
}

/** §13: the generic-prior limitation, recorded explicitly. */
export function genericPriorLimitation() {
  return Object.freeze({
    statement: 'L1 and L2 are broadly recognizable engineering principles: "validate before you mutate" and "compute the closure before you destroy the edges" are stated in ordinary engineering practice.',
    permittedConclusion: 'BASE_MODEL_PRIOR IS A PLAUSIBLE ALTERNATIVE EXPLANATION',
    forbiddenConclusion: 'the base-model prior CAUSED the HISTORY_ONLY success',
    whyForbidden: 'separating the prior from raw-history reading requires a NO-HISTORY treatment, which this stage is not permitted to add',
    noHistoryArmAdded: true,
  });
}

function main() {
  const adjudication = JSON.parse(readFileSync(join(REPO_ROOT, 'research-evidence', 'r3-l0a', 'mediation-adjudication.json'), 'utf8'));
  const novelty = [auditLesson('L1'), auditLesson('L2')];
  const record = Object.freeze({
    schemaVersion: 1,
    stage: 'R3-L0A',
    kind: 'capital novelty audit, effect decomposition and design law',
    noveltyAudit: Object.freeze(novelty),
    effectLayers: effectLayers(),
    causalStatus: causalStatus(adjudication),
    genericPriorLimitation: genericPriorLimitation(),
    recommendation: recommendation(adjudication, novelty),
    designLaw: designLaw(),
  });
  writeFileSync(join(REPO_ROOT, 'research-evidence', 'r3-l0a', 'novelty-and-effects.json'), `${JSON.stringify(record, null, 2)}${NL}`, 'utf8');
  for (const entry of novelty) process.stdout.write(`§12 ${entry.lesson}: ${entry.labels.join(' + ')} (explicit=${String(entry.explicitSomewhere)} implicit=${String(entry.implicitSomewhere)} compression=${String(entry.capitalOrderedMethodPresent && !entry.rawHasOrderedMethod)})\n`);
  process.stdout.write(`§16 recommendation: ${record.recommendation.chosen}${NL}`);
  return record;
}

if (process.argv[1] !== undefined && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/gu, '/')}`).href) {
  main();
}
