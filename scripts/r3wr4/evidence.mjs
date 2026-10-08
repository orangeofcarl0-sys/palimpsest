/**
 * R3-WR4 — EVIDENCE RECORD GENERATOR.
 *
 * Runs every Gate A and Gate B harness and writes `research-evidence/r3-wr4/stage-result.json` from the FROZEN
 * contract plus the measured results, so the record is REGENERABLE rather than hand-maintained.
 *
 * PLAIN JAVASCRIPT (`.mjs`). No LLM, no network.
 */
import { worldIdentityFalsifiers, gitAdministrativeAudit } from './falsifiers.mjs';
import { crossOperationArm, concurrencyArm } from './effect-identity.mjs';
import { mutationResistance } from './mutations.mjs';
import { unobservableFailure, terminalVocabularyAudit, policyRequirement, continuation } from './terminal.mjs';
import { buildStageRecord, writeStageRecord, REGRESSION, NL } from './contract.mjs';

export async function generate() {
  const falsifiers = await worldIdentityFalsifiers();
  const adminAudit = await gitAdministrativeAudit();
  const crossOperation = await crossOperationArm();
  const concurrency = await concurrencyArm();
  const mutations = await mutationResistance();
  const unobservable = await unobservableFailure();
  const vocabulary = await terminalVocabularyAudit();
  const policy = policyRequirement();
  const cont = await continuation();

  const record = buildStageRecord({
    baseline: '8c39c2191f7120f5f24f0a318296a9161c25635d',
    branch: 'r3-wr4-effect-identity-terminal-closure',
    commits: ['1e8542b', '0f66d88', '5c14379', 'PENDING'],
    gitAdminAudit: Object.freeze({
      falsifiers,
      audit: adminAudit,
    }),
    effectDispatch: Object.freeze({
      concurrency,
    }),
    crossOperationWitnesses: Object.freeze({
      crossOperation,
    }),
    candidatePreservation: Object.freeze({
      WRONG_ANCESTOR_BASIS_ACCEPTED_BY_BASELINE: falsifiers.WRONG_ANCESTOR_BASIS_ACCEPTED_BY_BASELINE,
      WRONG_ANCESTOR_BASIS_REFUSED_AFTER_REPAIR: falsifiers.WRONG_ANCESTOR_BASIS_REFUSED_AFTER_REPAIR,
      REFUSAL_LEFT_WORLD_IN_PLACE: falsifiers.REFUSAL_LEFT_WORLD_IN_PLACE,
      REFUSAL_LEFT_CANONICAL_IDENTICAL: falsifiers.REFUSAL_LEFT_CANONICAL_IDENTICAL,
      LEGITIMATE_BASIS_STILL_ACCEPTED: falsifiers.LEGITIMATE_BASIS_STILL_ACCEPTED,
      CANDIDATE_PROGRESS_PRESERVED: falsifiers.CANDIDATE_PROGRESS_PRESERVED,
    }),
    unobservableFailure: Object.freeze({
      measurement: unobservable,
      vocabulary,
    }),
    continuation: Object.freeze({
      measurement: cont,
    }),
    mutationWitnesses: Object.freeze({
      witnessesSatisfied: mutations.witnessesSatisfied,
      witnessesTotal: mutations.witnessesTotal,
      allSatisfied: mutations.allSatisfied,
      priorRegressionsPreserved: mutations.priorRegressionsPreserved,
      witnesses: mutations.witnesses.map((entry) => Object.freeze({
        id: entry.id,
        baselinePort: entry.baselinePortLabel,
        baselineViolated: entry.baselineViolated,
        currentViolated: entry.currentViolated,
        satisfied: entry.satisfied,
      })),
      regressions: mutations.regressions,
    }),
    policyRequirement: policy,
    regression: REGRESSION,
  });

  return record;
}

function main() {
  generate().then((record) => {
    const path = writeStageRecord(record);
    process.stdout.write(`${NL}R3-WR4 evidence written: ${path}${NL}`);
    process.stdout.write(`  verdicts: ${JSON.stringify(record.verdicts, null, 2).split(NL).join(NL + '  ')}${NL}`);
  }).catch((error) => {
    process.stderr.write(`evidence generation failed: ${String(error?.stack ?? error)}${NL}`);
    process.exitCode = 1;
  });
}

if (process.argv[1] !== undefined) main();
