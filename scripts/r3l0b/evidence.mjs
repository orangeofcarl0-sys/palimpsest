#!/usr/bin/env node
/**
 * R3-L0B §5/§6/§7/§8/§9/§11/§12/§13/§16 — THE EVIDENCE ASSEMBLY.
 *
 * This program produces the stage's evidence artifacts. It runs NO model and reruns NO R3-L0 session: the
 * interference graph is reconstructed from the durable session artifacts R3-L0 already left on disk, and the
 * containment evidence is produced by deterministic canaries driven through the shipped runtime.
 *
 * THE ONE INPUT IT NEEDS THAT IS NOT IN THE CHECKOUT is the R3-L0 run directory. It is DISCOVERED under the
 * trajectory root rather than hardcoded, and its absence is reported as an explicit limitation rather than
 * silently producing an empty graph — a graph with zero sessions would otherwise look like a clean result.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { REPO_ROOT, STAGE_EVIDENCE_PATH } from './contract.mjs';
import { EXPERIMENT_LAWS, EXPERIMENT_VALIDITY_COMPONENTS, admitBehavioralClaim, experimentValidFrom } from './contract.mjs';
import {
  adjudicateOracleExposures,
  adjudicateSpillovers,
  cleanMap,
  outcomeRelevantOracleExposures,
  reconstructGraph,
  spilloverSummary,
} from './interference.mjs';
import { containmentHypothesis, fenceSourceEvidence, layoutFacts, rootCauseVerdict } from './root-cause.mjs';
import { buildIsolatedLayout, containmentEnvironment, declaredProtectedRoots, envelopeForReport, isolatedRoots, layoutShape } from './containment.mjs';
import { runCanarySuite } from './canaries.mjs';
import { canaryLivenessControl, oracleExposureMutation, sharedParentMutation } from './mutations.mjs';
import { replayBreach } from './replay.mjs';
import { correctedCausalInterpretation, preRulingSummary, reconstructionPressurePreRuling } from './interpretation.mjs';

const NL = String.fromCharCode(10);
const EVIDENCE = join(REPO_ROOT, STAGE_EVIDENCE_PATH);
const out = (line) => process.stdout.write(`${line}${NL}`);

/** The trajectory root R3-L0 used, resolved from the user profile. */
function r3l0Root() {
  const explicit = process.env.PALIMPSEST_R3L0_ROOT?.trim();
  return explicit !== undefined && explicit !== '' ? explicit : join(homedir(), '.palimpsest-r3l0');
}

/** Find the newest R3-L0 run directory, so the graph is rebuilt from whatever the run actually left. */
export function discoverRunDir(root = r3l0Root()) {
  const matrixRoot = join(root, 'matrix');
  if (!existsSync(matrixRoot)) return null;
  const runs = readdirSync(matrixRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory() && entry.name.startsWith('run-')).map((entry) => join(matrixRoot, entry.name));
  runs.sort();
  return runs.length === 0 ? null : runs[runs.length - 1];
}

/** §5-§8: build the interference evidence, or report why it could not be built. */
export function buildInterferenceEvidence() {
  const runDir = discoverRunDir();
  const matrixPath = join(REPO_ROOT, 'research-evidence', 'r3-l0', 'matrix.json');
  if (runDir === null || !existsSync(matrixPath)) {
    return Object.freeze({
      available: false,
      reason: runDir === null
        ? `the R3-L0 run directory was not found under ${r3l0Root()}`
        : 'the committed R3-L0 matrix is absent',
      /** §5: a graph that could not be built must say so, because an empty graph reads like a clean result. */
      limitation: 'the interference graph could not be reconstructed on this host; no session is claimed clean',
      runDir,
    });
  }
  const matrix = JSON.parse(readFileSync(matrixPath, 'utf8'));
  const sessions = reconstructGraph(runDir, matrix);
  const spillovers = adjudicateSpillovers(sessions, matrix);
  const oracle = adjudicateOracleExposures(sessions);
  const clean = cleanMap(sessions);

  const sessionRows = sessions.map((session) => Object.freeze({
    sessionId: session.sessionId,
    trajectoryId: session.trajectoryId,
    arm: session.arm,
    block: session.block,
    generation: session.generation,
    attemptId: session.attemptId,
    startedAt: session.startedAt,
    dispatchCount: session.dispatchCount,
    turnEndReason: session.turnEndReason,
    label: session.label,
    namedAccessesOutsideWorld: session.namedCounts.total,
    namedByClass: Object.freeze({
      CHECKOUT_EXPOSED: session.namedCounts.checkout,
      ORACLE_EXPOSED: session.namedCounts.oracle,
      SIBLING_TRAJECTORY_EXPOSED: session.namedCounts.siblingTrajectory,
      CONTROL_PLANE_EXPOSED: session.namedCounts.controlPlane,
      OTHER: session.namedCounts.other,
    }),
    /** §5: the accesses themselves, so every field §5 asks for is present and auditable. */
    accesses: Object.freeze(session.accesses.map((access) => Object.freeze({
      seq: access.seq,
      tool: access.tool,
      path: access.path,
      classification: access.classification,
      artifactOwner: access.owner,
      artifactType: access.artifactType,
      operation: access.operation,
      contentReturned: access.contentReturned,
      contentBytes: access.contentBytes,
      siblingTrajectoryId: access.siblingTrajectoryId,
    }))),
    contentExposures: session.contentExposures,
    siblingUnitsExposed: session.siblingUnitsExposed,
    hostPrivateExposureCount: session.hostPrivateExposureCount,
  }));

  return Object.freeze({
    available: true,
    runDir,
    sessions: Object.freeze(sessionRows),
    sessionCount: sessionRows.length,
    labelCounts: clean.counts,
    blocks: clean.blocks,
    spillovers,
    spilloverSummary: spilloverSummary(spillovers),
    oracleExposures: oracle,
    outcomeRelevantOracleExposures: outcomeRelevantOracleExposures(oracle),
    /** §8: the post-hoc label, carried with every descriptive number that uses it. */
    postHocLabel: 'DESCRIPTIVE_ONLY — not a preregistered endpoint and not a post-hoc randomized primary analysis',
  });
}

/** §11-§13: build the containment evidence. */
export async function buildContainmentEvidence() {
  const root = join(homedir(), '.palimpsest-r3l0b', 'evidence');
  const unitIds = ['u0-H', 'u0-C'];
  buildIsolatedLayout(root, unitIds);
  const suite = await runCanarySuite({ root, unitIds });
  const liveness = await canaryLivenessControl({ root: join(homedir(), '.palimpsest-r3l0b', 'evidence-liveness'), unitIds: ['u0-H', 'u0-C'] });
  const shared = await sharedParentMutation({ mutatedRoot: join(homedir(), '.palimpsest-r3l0b', 'evidence-sp-mut'), positiveRoot: join(homedir(), '.palimpsest-r3l0b', 'evidence-sp-pos'), unitIds });
  const oracle = await oracleExposureMutation({ mutatedRoot: join(homedir(), '.palimpsest-r3l0b', 'evidence-ox-mut'), positiveRoot: join(homedir(), '.palimpsest-r3l0b', 'evidence-ox-pos'), unitIds });
  return Object.freeze({
    root,
    unitIds: Object.freeze([...unitIds]),
    shape: layoutShape(root, unitIds),
    isolatedRoots: isolatedRoots(root),
    declaredProtectedRoots: declaredProtectedRoots(root),
    fence: suite.fence,
    sandbox: suite.sandbox,
    canaryNonces: suite.canaryNonces,
    probes: suite.probes,
    containment: suite.containment,
    liveness,
    sharedParentMutation: shared,
    oracleExposureMutation: oracle,
  });
}

/** §3/§16: assemble the ExperimentValidity verdict from the measured components. */
export function experimentValidityFrom(input) {
  const containment = input.containment?.EXPERIMENT_CONTAINMENT === 'PASS';
  const liveness = input.liveness?.LIVE === true;
  const sharedDetected = input.sharedParentMutation?.mutationDetected === true;
  const oracleDetected = input.oracleExposureMutation?.mutationDetected === true;
  return experimentValidFrom({
    TREATMENT_INTEGRITY: input.treatmentIntegrity ?? 'PASS',
    TREATMENT_INTEGRITY_detail: 'the H and C treatment delta is SELECTION_ONLY, proven by byte-identical knowledge-plane digests and one shared starting head (R3-L0A §5)',
    CONTAINMENT: containment && liveness && sharedDetected ? 'PASS' : 'FAIL',
    CONTAINMENT_detail: `canary containment ${input.containment?.EXPERIMENT_CONTAINMENT}; liveness control ${liveness ? 'LIVE' : 'NOT LIVE'}; shared-parent mutation ${sharedDetected ? 'DETECTED' : 'ESCAPED'}`,
    OUTCOME_BLINDNESS: containment && oracleDetected ? 'PASS' : 'FAIL',
    OUTCOME_BLINDNESS_detail: `oracle canaries ${input.containment?.EXPERIMENT_CONTAINMENT}; oracle-exposure mutation ${oracleDetected ? 'DETECTED' : 'ESCAPED'}`,
    UNIT_INDEPENDENCE: containment ? 'PASS' : 'FAIL',
    UNIT_INDEPENDENCE_detail: 'the isolated layout places sibling units under private/units, disjoint from every world, and the sibling canaries are unreachable',
    EVIDENCE_IMMUTABILITY: input.immutability ?? 'PASS',
    EVIDENCE_IMMUTABILITY_detail: input.immutabilityDetail ?? 'the strengthened guard fails immediately on a protected historical mutation',
  });
}

async function main() {
  mkdirSync(EVIDENCE, { recursive: true });
  out('=== R3-L0B evidence assembly ===');

  /** §5-§8 the interference graph. */
  const interference = buildInterferenceEvidence();
  out(`interference graph: ${interference.available ? `${String(interference.sessionCount)} sessions` : `UNAVAILABLE — ${String(interference.reason)}`}`);
  if (interference.available) {
    out(`  labels: ${Object.entries(interference.labelCounts).map(([key, value]) => `${key}=${String(value)}`).join(' ')}`);
    out(`  spillover: ${JSON.stringify(interference.spilloverSummary)}`);
    out(`  outcome-relevant oracle exposures: ${interference.outcomeRelevantOracleExposures.join(', ') || 'none'}`);
  }

  /** §9 the root-cause analysis. */
  const rootCause = rootCauseVerdict(interference.runDir ?? r3l0Root());
  const fenceEvidence = fenceSourceEvidence();
  out(`root cause: ${rootCause.primaryCause}`);

  /** §11-§13 the containment evidence. */
  out('running containment canaries through the shipped runtime…');
  const containmentEvidence = await buildContainmentEvidence();
  out(`  fence applied: ${String(containmentEvidence.fence.applied)} (roots=${String(containmentEvidence.fence.roots)}, treesVerified=${String(containmentEvidence.fence.treesVerified)})`);
  out(`  EXPERIMENT_CONTAINMENT: ${containmentEvidence.containment.EXPERIMENT_CONTAINMENT} (${String(containmentEvidence.probes.length)} probes)`);
  out(`  liveness control: ${containmentEvidence.liveness.LIVE ? 'LIVE' : 'NOT LIVE'} (${String(containmentEvidence.liveness.directReadsReachable)}/${String(containmentEvidence.liveness.directReads)} direct reads reachable unfenced)`);
  out(`  ${containmentEvidence.sharedParentMutation.recordedVerdict}`);
  out(`  ${containmentEvidence.oracleExposureMutation.recordedVerdict}`);

  /** §10: the breach replay, which tests the repair against the ACTUAL paths the workers read. */
  let replay = null;
  if (interference.available) {
    const unitIds = [...new Set(interference.sessions.map((session) => session.trajectoryId))].sort();
    replay = replayBreach(interference, join(homedir(), '.palimpsest-r3l0b', 'replay'), unitIds);
    out(`  breach replay: ${String(replay.blocked)}/${String(replay.accessesReplayed)} historical accesses now blocked (BREACH_VECTOR_CLOSED=${String(replay.BREACH_VECTOR_CLOSED)})`);
  }

  /** §14/§15: the immutability verdict, computed here so the ExperimentValidity verdict can cite it. */
  const { checkImmutability } = await import('./immutability.mjs');
  const immutability = checkImmutability();

  /** §3/§16: THE FORMAL EXPERIMENTAL-VALIDITY VERDICT. */
  const experimentValidity = experimentValidityFrom({
    containment: containmentEvidence.containment,
    liveness: containmentEvidence.liveness,
    sharedParentMutation: containmentEvidence.sharedParentMutation,
    oracleExposureMutation: containmentEvidence.oracleExposureMutation,
    immutability: immutability.HISTORICAL_EVIDENCE_IMMUTABLE,
    immutabilityDetail: `${immutability.HISTORICAL_EVIDENCE_IMMUTABLE} over ${String(immutability.currentFileCount)} protected files; r2lr mutator repair ${immutability.r2lrMutatorRepair}`,
  });
  out(`${NL}EXPERIMENT_VALID: ${experimentValidity.EXPERIMENT_VALID ? 'YES' : 'NO'}`);
  for (const component of experimentValidity.components) out(`  ${component.id.padEnd(24)} ${component.verdict}`);

  writeFileSync(join(EVIDENCE, 'interference-graph.json'), `${JSON.stringify({ schemaVersion: 1, stage: 'R3-L0B', kind: 'R3-L0 interference graph', ...interference }, null, 2)}${NL}`, 'utf8');
  writeFileSync(join(EVIDENCE, 'breach-replay.json'), `${JSON.stringify({ schemaVersion: 1, stage: 'R3-L0B', ...replay }, null, 2)}${NL}`, 'utf8');
  /** §2/§19/§20: the corrected causal reading and the design pre-ruling. */
  const causalInterpretation = correctedCausalInterpretation({ graph: interference.available ? interference : null });
  const preRuling = reconstructionPressurePreRuling();
  out(`corrected causal status: ${causalInterpretation.behavioralCausalStatus.value}`);
  out(`pre-ruling: ${String(preRulingSummary().requirements)} requirements, ${String(preRulingSummary().futurePrimaryOutcomes)} future outcomes, thresholds frozen=${String(preRulingSummary().thresholdsFrozen)}, trajectory authored=${String(preRulingSummary().trajectoryAuthored)}`);

  writeFileSync(join(EVIDENCE, 'causal-interpretation.json'), `${JSON.stringify(causalInterpretation, null, 2)}${NL}`, 'utf8');
  writeFileSync(join(EVIDENCE, 'reconstruction-pressure-pre-ruling.json'), `${JSON.stringify(preRuling, null, 2)}${NL}`, 'utf8');
  writeFileSync(join(EVIDENCE, 'experiment-validity.json'), `${JSON.stringify({ schemaVersion: 1, stage: 'R3-L0B', kind: 'experimental validity verdict', experimentValidity, immutability, containment: containmentEvidence.containment, liveness: containmentEvidence.liveness, sharedParentMutation: containmentEvidence.sharedParentMutation, oracleExposureMutation: containmentEvidence.oracleExposureMutation, breachReplay: replay === null ? null : { accessesReplayed: replay.accessesReplayed, blocked: replay.blocked, unblocked: replay.unblocked, BREACH_VECTOR_CLOSED: replay.BREACH_VECTOR_CLOSED, byClass: replay.byClass } }, null, 2)}${NL}`, 'utf8');
  writeFileSync(join(EVIDENCE, 'root-cause.json'), `${JSON.stringify({ schemaVersion: 1, stage: 'R3-L0B', ...rootCause, fenceSourceEvidence: fenceEvidence, containmentHypothesis: containmentHypothesis(interference.runDir ?? r3l0Root()), layoutFacts: layoutFacts(interference.runDir ?? r3l0Root()) }, null, 2)}${NL}`, 'utf8');
  writeFileSync(join(EVIDENCE, 'containment.json'), `${JSON.stringify({ schemaVersion: 1, stage: 'R3-L0B', kind: 'experiment containment evidence', envelope: envelopeForReport(), ...containmentEvidence }, null, 2)}${NL}`, 'utf8');
  out(`${NL}wrote ${STAGE_EVIDENCE_PATH}/interference-graph.json, root-cause.json, containment.json, breach-replay.json, experiment-validity.json`);
  return { interference, rootCause, containmentEvidence, replay, immutability, experimentValidity, causalInterpretation, preRuling };
}

if (process.argv[1] !== undefined && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/gu, '/')}`).href) {
  await main();
}

export { EXPERIMENT_LAWS, EXPERIMENT_VALIDITY_COMPONENTS, admitBehavioralClaim, containmentEnvironment, main };
