#!/usr/bin/env node
/**
 * R3-L0C §26/§30 — THE STAGE RESULT.
 *
 * Assembles the final record: the two validity envelopes, the preflight repairs, the containment result, the
 * deviation, and the verdicts. It reports what the stage can support and REFUSES to report a verdict the run
 * cannot support.
 *
 * THE REFUSAL IS THE POINT. §26 makes SYSTEM_VALID and EXPERIMENT_VALID mandatory and makes a favorable outcome
 * unable to repair either. Here the situation is the reverse and equally decisive: the gates are GREEN and the
 * TREATMENT WAS ABSENT, so the reconstruction-compression and net-cost verdicts are not merely uncertain — they
 * are undefined, because the two arms did not differ on the dimension being compared.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { REPO_ROOT, STAGE_EVIDENCE_PATH } from './contract.mjs';
import { DEVIATION, preservedRunRecord } from './deviation.mjs';
import { checkImmutability } from './immutability.mjs';

const NL = String.fromCharCode(10);
const EVIDENCE = join(REPO_ROOT, STAGE_EVIDENCE_PATH);
const read = (name) => (existsSync(join(EVIDENCE, name)) ? JSON.parse(readFileSync(join(EVIDENCE, name), 'utf8')) : null);

/**
 * §30: THE FINAL VERDICTS.
 *
 * `CAPITAL_UPTAKE` is `ABSENT` because no C session consumed capital. The two behavioural verdicts are
 * `NOT_REPORTED` with the reason, because a verdict requires a treatment to have been present.
 */
export function stageResult() {
  const deviation = read('protocol-deviation.json');
  const matrix = read('matrix.json');
  const preflight = read('preflight.json');
  const immutability = checkImmutability();
  const preserved = preservedRunRecord();

  return Object.freeze({
    schemaVersion: 1,
    stage: 'R3-L0C',
    kind: 'project-specific reconstruction stage result',
    status: 'BLOCKED',
    statusReason: 'the CAPITALIZED arm received no capital, so the treatment was absent and no behavioural verdict is defined',

    /** §1/§26: the validity envelopes, both recorded before and after the matrix. */
    validity: Object.freeze({
      SYSTEM_VALID: true,
      EXPERIMENT_VALID: true,
      recordedBeforeTrial1: true,
      recordedAfterMatrix: true,
      source: 'R3-S0 systemic suite, R3-L0B containment suite, R1-H/HR/HC/L confinement, anti-vacuity, graph and event audits',
      onFailure: 'BEHAVIORAL MECHANISM CLAIM = INVALID, regardless of favorable outcomes',
    }),

    /** §2: the infrastructure repairs, with their measured result. */
    preflight: preflight === null ? null : Object.freeze({
      allGreen: preflight.allGreen,
      repairs: (preflight.repairs ?? []).map((repair) => Object.freeze({ id: repair.id, green: repair.green })),
    }),

    /** §3-§6: what was authored and frozen. */
    authored: Object.freeze({
      projectFamily: 'cutover-entitlements (legacy entitlement cutover and precedence)',
      invariants: Object.freeze(['I1 cutover-precedence', 'I2 capability-consolidation']),
      corpusDocuments: 26,
      corpusBytes: 23498,
      corpusComplete: true,
      diagnosticClasses: 8,
      oracleSolvable: true,
      oracleDiscriminating: true,
      capitalSelection: 'one ReasoningClaim and one active Procedure revision per invariant; the Proof claim is backing and never selected',
      treatment: 'SELECTION_ONLY',
      schedule: '4 matched blocks x 2 arms x 2 generations = 16 sessions',
      randomization: 'C/H, H/C, C/H, C/H — asserted non-degenerate',
    }),

    /** §10: the containment result, including the gap found and closed. */
    containment: Object.freeze({
      canaries: '32/32 UNREACHABLE with liveness 10/10',
      siblingWorldGap: Object.freeze({
        found: 'a worker in the matrix layout READS a sibling world source, measured through the shipped runner and kernel label',
        closed: 'each sibling world is declared individually; the units root cannot be declared because it is an ancestor of the world',
        regressionTest: 'test/r3l0c_containment.test.ts asserts the defect as well as the repair',
      }),
    }),

    /** §23/§24: the deviation and the preserved run. */
    deviation: deviation === null ? null : Object.freeze({ id: deviation.deviation.id, mechanism: deviation.deviation.mechanism, planAmended: deviation.deviation.planAmended, planImmutabilityActivated: deviation.deviation.planImmutabilityActivated }),
    preservedRun: preserved,

    /** §25: the immutability result under the baseline-derived guard. */
    immutability: Object.freeze({
      HISTORICAL_EVIDENCE_IMMUTABLE: immutability.HISTORICAL_EVIDENCE_IMMUTABLE,
      protectedFiles: immutability.workingFileCount,
      baselineRevision: immutability.baselineRevision,
      restoreAvailable: immutability.restoreAvailable,
      derivation: 'the protected set is the baseline Git tree minus the current stage namespace; no completed stage was edited to extend a registry',
    }),

    /** §30: THE VERDICTS. */
    verdicts: Object.freeze({
      R3_L0C: 'BLOCKED',
      SYSTEM_VALID: 'YES',
      EXPERIMENT_VALID: 'YES',
      CAPITAL_UPTAKE: 'ABSENT',
      RECONSTRUCTION_COMPRESSION: 'NOT_REPORTED',
      RECONSTRUCTION_COMPRESSION_REASON: 'the treatment was absent from both arms, so a paired reconstruction-cost comparison is undefined rather than negative',
      NET_COGNITIVE_COST: 'NOT_REPORTED',
      NET_COGNITIVE_COST_REASON: 'same as above: no treatment difference existed to measure',
      NEXT: 'STOP',
      NEXT_REASON: 'a load-bearing harness defect was found after behavioral exposure, so the stage stops and preserves the runs rather than enlarging the model set',
    }),

    /** §27: the interpretation scope, carried so no later reader over-reads the stage. */
    interpretationScope: Object.freeze({
      establishes: 'the design, project family, corpus, oracle, containment and infrastructure repairs are built and verified; the capital DELIVERY path is repaired and now permanently tested',
      doesNotEstablish: Object.freeze(['any reconstruction-compression effect', 'any net-cost effect', 'capital effectiveness', 'capital overhead', 'organic capital compounding', 'cross-model portability', 'Fusion value']),
    }),
  });
}

function main() {
  const result = stageResult();
  writeFileSync(join(EVIDENCE, 'stage-result.json'), `${JSON.stringify(result, null, 2)}${NL}`, 'utf8');
  process.stdout.write(`R3-L0C: ${result.verdicts.R3_L0C}${NL}`);
  process.stdout.write(`  SYSTEM_VALID: ${result.verdicts.SYSTEM_VALID}  EXPERIMENT_VALID: ${result.verdicts.EXPERIMENT_VALID}${NL}`);
  process.stdout.write(`  CAPITAL_UPTAKE: ${result.verdicts.CAPITAL_UPTAKE}${NL}`);
  process.stdout.write(`  RECONSTRUCTION_COMPRESSION: ${result.verdicts.RECONSTRUCTION_COMPRESSION}${NL}`);
  process.stdout.write(`  NET_COGNITIVE_COST: ${result.verdicts.NET_COGNITIVE_COST}${NL}`);
  process.stdout.write(`  NEXT: ${result.verdicts.NEXT}${NL}`);
  return result;
}

if (process.argv[1] !== undefined && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/gu, '/')}`).href) {
  main();
}

export { main, DEVIATION };
