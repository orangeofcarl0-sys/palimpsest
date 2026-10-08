/**
 * R3-WR5 — EVIDENCE RECORD GENERATOR.
 *
 * Runs every Gate A and Gate B harness and writes `research-evidence/r3-wr5/stage-result.json` from the FROZEN
 * contract plus the measured results, so the record is REGENERABLE rather than hand-maintained.
 *
 * PLAIN JAVASCRIPT (`.mjs`). No LLM, no network.
 */
import { callPathInventory, untrustedWorkerWitness, attemptAuthorizationWitness, provenanceWitnesses, baseDivergenceWitness } from './reachability.mjs';
import { effectReplaySuite, concurrencySuite } from './effect-replay.mjs';
import { workerFencingAudit, hostFailureEvidenceAudit, policyAdmissibilityAudit, policyRequirement, brokenWorldScenario, negativeControlsAndPredicates } from './failure-disposition.mjs';
import { buildStageRecord, writeStageRecord, REGRESSION, NL } from './contract.mjs';

export async function generate() {
  const inventory = callPathInventory();
  const worker = untrustedWorkerWitness();
  const authorization = await attemptAuthorizationWitness();
  const provenance = await provenanceWitnesses();
  const divergence = await baseDivergenceWitness();
  const replay = await effectReplaySuite();
  const concurrency = await concurrencySuite();
  const fencing = workerFencingAudit();
  const hostEvidence = await hostFailureEvidenceAudit();
  const policyAudit = policyAdmissibilityAudit();
  const policy = policyRequirement();
  const broken = await brokenWorldScenario();
  const controls = await negativeControlsAndPredicates();

  const record = buildStageRecord({
    baseline: '0052cc1e9393c2788f1eef7d0f3fe9f77a03e0ba',
    branch: 'r3-wr5-authorized-recovery',
    commits: ['58326a7', 'ceb0a64', 'f5271cb', 'PENDING'],
    reachabilityWitnesses: Object.freeze({ inventory, worker, authorization, divergence }),
    provenanceWitnesses: provenance,
    effectReplay: Object.freeze({ replay, concurrency }),
    brokenWorld: broken,
    predicates: Object.freeze({
      controls: controls.controls,
      controlsSatisfied: controls.controlsSatisfied,
      controlsTotal: controls.controlsTotal,
      measured: controls.predicates,
      predicatesMet: controls.predicatesMet,
      predicatesNotMet: controls.predicatesNotMet,
      BROAD_PRIOR_CLAIM_CARRIED_FORWARD: controls.BROAD_PRIOR_CLAIM_CARRIED_FORWARD,
      finalAttemptState: controls.finalAttemptState,
    }),
    mutationWitnesses: Object.freeze({
      fencing,
      hostEvidence,
      policyAdmissibility: policyAudit,
    }),
    policyRequirement: policy,
    regression: REGRESSION,
  });

  return record;
}

function main() {
  generate().then((record) => {
    const path = writeStageRecord(record);
    process.stdout.write(`${NL}R3-WR5 evidence written: ${path}${NL}`);
    process.stdout.write(`  verdicts: ${JSON.stringify(record.verdicts, null, 2).split(NL).join(NL + '  ')}${NL}`);
  }).catch((error) => {
    process.stderr.write(`evidence generation failed: ${String(error?.stack ?? error)}${NL}`);
    process.exitCode = 1;
  });
}

if (process.argv[1] !== undefined) main();
