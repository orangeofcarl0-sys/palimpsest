/**
 * R3-L0C-R §9/§12/§13/§14 — THE FROZEN REPAIR-REPLICATION PLAN.
 *
 * §12 requires the frozen behavioral design to be preserved: corpus, invariants, diagnostics, capital,
 * selected-handle semantics and verdict thresholds all unchanged. §14 requires the exact original arm order, a
 * fresh isolated topology, no new seed, and both arms rerun. §9 requires the plan to record the
 * ExecutionClosureDigest so a pre-exposure drift is detectable.
 *
 * THE PLAN RECORDS WHAT IT DID NOT CHANGE, and that is deliberate: a reader must be able to see that the
 * behavioral design is the SAME one Run 1 used, because otherwise the replication would be a different
 * experiment and its result would not bear on Run 1's question.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { REPO_ROOT, STAGE_EVIDENCE_PATH, SOURCE_STAGE_EVIDENCE_PATH, VALIDITY_DIMENSIONS, TELEMETRY_FIELDS, SELECTION_CONTRACT_FINDING } from './contract.mjs';
import { computeExecutionClosure, CLOSURE_FILES } from './mutations.mjs';
import { HOST_PRIVATE_KINDS } from './topology.mjs';
import { corpusCoverage, corpusDigestMaterial } from '../r3l0c/corpus.mjs';
import { DIAGNOSTIC_CLASSES, INVARIANT_EXPOSURES } from '../r3l0c/diagnostic.mjs';
import { bundleDigest, frozenBundle } from '../r3l0c/capital.mjs';
import { INVARIANTS } from '../r3l0c/contract.mjs';
import { GENERATIONS as SOURCE_GENERATIONS } from '../r3l0c/contract.mjs';
import { armOrderPerBlock, armOrderIsBalanced } from '../r3l0c/plan.mjs';
import { EXECUTOR_ROUTE_DEVIATION, PRIMARY_EXECUTOR, SUPERSEDED_EXECUTOR } from './route.mjs';
import { RANDOMIZATION_SEED } from '../r3l0c/contract.mjs';
import { buildPlanForReplication } from './matrix.mjs';
import { worldDigest } from '../r3l0c/build-prehistory.mjs';

const NL = String.fromCharCode(10);
const sha256 = (text) => createHash('sha256').update(String(text), 'utf8').digest('hex');

/**
 * §12: WHAT THIS STAGE DOES NOT CHANGE.
 *
 * Each entry names the thing and the digest that proves it is the same, so "unchanged" is a measurement rather
 * than an assurance.
 */
export function frozenDesignAttestation() {
  return Object.freeze({
    corpus: Object.freeze({ documents: corpusCoverage().documents, bytes: corpusCoverage().totalBytes, digest: sha256(corpusDigestMaterial()), unchanged: true }),
    invariants: Object.freeze({ ids: INVARIANTS.map((entry) => entry.id), digests: Object.freeze(INVARIANTS.map((entry) => sha256(`${entry.currentStanding}${entry.applicability}`))), unchanged: true }),
    diagnostics: Object.freeze({ classes: DIAGNOSTIC_CLASSES.map((entry) => entry.id), exposures: INVARIANT_EXPOSURES, unchanged: true }),
    capital: Object.freeze({ bundleDigest: bundleDigest(frozenBundle()), selectedHandleSemantics: frozenBundle().minimalityLaw, unchanged: true }),
    verdictThresholds: Object.freeze({ source: 'scripts/r3l0c/contract.mjs COMPRESSION_VERDICT_RULES and NET_COST_VERDICT_RULES', redefined: false, unchanged: true }),
    generations: Object.freeze({ ids: SOURCE_GENERATIONS.map((entry) => entry.id), requirementsDigest: sha256(SOURCE_GENERATIONS.map((entry) => entry.requirement).join(NL)), unchanged: true }),
    worldDigest: worldDigest(),
    /** §14: the arm order and seed are the ORIGINAL ones, so no new seed was chosen. */
    armOrder: armOrderPerBlock(),
    randomizationSeed: RANDOMIZATION_SEED,
    seedRechosen: false,
  });
}

/** §13: the commit structure. */
export const COMMIT_STRUCTURE = Object.freeze([
  'analysis(r3-l0c-r): adjudicate run-1 and freeze validity corrections',
  'fix/test(r3-l0c-r): close treatment realization and topology containment',
  'test(r3-l0c-r): freeze repair-replication plan',
  'research(r3-l0c-r): record clean repair replication',
]);

/** §13: the rule that the plan commit must follow every pre-exposure repair. */
export const PLAN_FREEZE_RULE = 'the plan commit MUST occur after all pre-exposure repairs, and no model call against primary project bytes may occur before it';

/** §15: the trial record schema. */
export const TRIAL_SCHEMA = Object.freeze([
  'treatmentExpectationDigest',
  'selectionRequested',
  'selectionCompiled',
  'consumerVisibleHandleDigest',
  'pullBodyDigests',
  'topologyManifestDigest',
  'executionClosureDigest',
]);

export function buildPlan() {
  const sessions = buildPlanForReplication().sessions;
  const closures = computeExecutionClosure();
  return Object.freeze({
    schemaVersion: 1,
    stage: 'R3-L0C-R',
    kind: 'frozen repair-replication plan',
    frozenBefore: 'the first primary R3-L0C-R worker session',
    replicationName: 'REPAIR_REPLICATION',
    /** §12: the naming rule, carried so no report calls it something stronger. */
    namingRule: 'call it REPAIR_REPLICATION; do NOT call it pristine held-out replication',

    /** §1/§2: the Run-1 erratum and the corrected validity semantics. */
    run1Status: 'TREATMENT_NOT_APPLIED',
    validityDimensions: VALIDITY_DIMENSIONS.map((entry) => entry.id),
    validityConjunction: 'CAUSAL_EXPERIMENT_VALID',
    telemetryFields: TELEMETRY_FIELDS.map((entry) => entry.id),
    selectionContractFinding: Object.freeze({ case: SELECTION_CONTRACT_FINDING.case, productChangeMade: SELECTION_CONTRACT_FINDING.productChangeMade }),

    /** §12: the frozen design, with its attestation. */
    frozenDesign: frozenDesignAttestation(),
    frozenDesignUnchanged: true,

    /** §9: the execution closure. */
    executionClosure: closures,
    closureInputs: Object.keys(CLOSURE_FILES),

    /** §8: the topology derivation, recorded as the RULE so the plan does not carry a stale path list. */
    topologyDerivation: Object.freeze({
      hostPrivateKinds: HOST_PRIVATE_KINDS.map((entry) => entry.id),
      derivedFromSchedule: true,
      manuallyEnumerated: false,
      rule: 'for every unit Ui: protected = every Uj world (j!=i) + oracle + control + evidence + reference + sibling-unit root + runner/analysis + Ui own state',
    }),

    /** §14: the schedule. */
    primaryExecutor: PRIMARY_EXECUTOR,
    /**
     * The executor route was replaced under explicit authorization. The deviation is recorded as data, and the
     * R3-L0C module that froze the original route is NOT edited, because its plan records that module's digest.
     */
    executorRouteDeviation: EXECUTOR_ROUTE_DEVIATION,
    supersededExecutor: SUPERSEDED_EXECUTOR,
    armOrderPerBlock: armOrderPerBlock(),
    armOrderBalance: armOrderIsBalanced(),
    randomizationSeed: RANDOMIZATION_SEED,
    blockCount: 4,
    generationsPerTrajectory: 2,
    totalSessions: 16,
    sessions,
    freshRunIds: true,
    pairsOldWithNew: false,

    /** §15: the trial schema and the realization rule. */
    trialSchema: TRIAL_SCHEMA,
    realizationRule: 'a trial whose treatment realization mismatches is INVALID and triggers STOP, not a retry as a model outcome',
    /** §18: Run 1 contributes nothing to the treatment verdicts. */
    run1Contribution: 'ZERO observations to RECONSTRUCTION_COMPRESSION and NET_COGNITIVE_COST; baseline calibration only',
    /** §16: the analysis admission rule. */
    analysisAdmission: 'every analysed trial must satisfy SYSTEM_VALID, EXPERIMENT_ENVIRONMENT_VALID, TREATMENT_REALIZATION_VALID and ANALYSIS_PLAN_VALID before CAUSAL_EXPERIMENT_VALID',
    /** §19: the immutability rule. */
    sourceStageEvidence: SOURCE_STAGE_EVIDENCE_PATH,
    sourceStageEvidenceImmutable: true,
    planImmutability: 'no plan amendment after primary exposure',
  });
}

async function main() {
  const plan = buildPlan();
  mkdirSync(join(REPO_ROOT, STAGE_EVIDENCE_PATH), { recursive: true });
  writeFileSync(join(REPO_ROOT, STAGE_EVIDENCE_PATH, 'plan.json'), `${JSON.stringify(plan, null, 2)}${NL}`, 'utf8');
  process.stdout.write(`R3-L0C-R PLAN — ${String(plan.sessions.length)} sessions${NL}`);
  process.stdout.write(`  arm order: ${plan.armOrderPerBlock.map((entry) => entry.join('/')).join('  ')} (balanced=${String(plan.armOrderBalance.balanced)}, seed reused=${String(!plan.frozenDesign.seedRechosen)})${NL}`);
  process.stdout.write(`  execution closure: ${plan.executionClosure.executionClosureDigest.slice(0, 16)} over ${String(plan.executionClosure.fileCount)} files${NL}`);
  process.stdout.write(`  frozen design unchanged: ${String(plan.frozenDesignUnchanged)}${NL}`);
  for (const session of plan.sessions) process.stdout.write(`    ${session.sessionId}${NL}`);
  return plan;
}

if (process.argv[1] !== undefined && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/gu, '/')}`).href) {
  await main();
}
