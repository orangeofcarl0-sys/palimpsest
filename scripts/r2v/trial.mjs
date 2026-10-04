#!/usr/bin/env node
/**
 * R2-V §7/§8/§11/§12/§13 — ONE PRIMARY TRIAL OF THE SCENARIO-D UTILITY MATRIX.
 *
 * One process per trial, for the same reasons the prior stages give: newly bootstrapped trial states, no
 * reuse of previous model sessions, and one ACTIVE confidential worker at a time.
 *
 * WHAT ONE TRIAL DOES
 *
 *   Phase 0  build the world (Scenario D fixture + H0), record the PAIRED-STATE DIGESTS
 *   Phase 1  install the capital of EVERY bundle this arm consumes and associate it with the project
 *   Phase 2  dispose, COLD RESTART, install again, select the arm's bundle set
 *   Phase 3  drive the REAL DSH stochastic worker under HOST-MEDIATED consumption (§8)
 *   Phase 4  read the payload, the durable session, the consumption telemetry and the committed source
 *   Phase 5  judge the first and final candidate against the HIDDEN acceptance
 *   Phase 6  detect the pre-paid known failure and write the trial record
 *
 * §8: VOLUNTARY RETRIEVAL IS REMOVED FROM THE CAUSAL QUESTION. Every arm runs under the R2-E
 * HOST_MEDIATED_PREWORK mechanism: the host invokes the SAME attempt-bound resolver on the selected handles
 * before the first engineering turn and renders the bodies into the labelled section. There is no optional
 * choice to make, so the comparison is about marginal UTILITY, not routing.
 *
 * §11: ACROSS ALL FOUR ARMS the task, repo, visible tests, hidden oracle, model/profile, runtime, tool
 * surface, authority and write scope are IDENTICAL. Only the consumed bundle SET differs.
 *
 * §12: EVERY ANALYSED TRIAL MUST PROVE CONSUMPTION before the first engineering turn — all intended handles
 * resolved, all intended bodies delivered, and no unintended body delivered. A treatment-not-applied run is
 * invalid.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { dshBin, dshHome, installHostBundle } from '../gates/env.mjs';
import { EFFICACY_ENV, EFFICACY_MODES } from '../../host/dsh/lib/efficacy.js';
import { detectKnownFailure } from '../r2u/known-failure.mjs';
import { assertOracleInaccessible, buildWorld, judgeHidden, pairedStateDigest, SCENARIOS, sha256 } from '../r2u/scenarios.mjs';
import { handlesInPrompt, indexSectionOf, readModelVisiblePrompt } from '../r2lr/session-probe.mjs';
import { BUNDLE_DOMAIN, bundleCapital } from '../r2s/candidates.mjs';
import { ARMS } from './design.mjs';

const REPO_ROOT = new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/u, '$1');

const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.replace(/^--/u, '').split('=');
  return [key, rest.join('=')];
}));
const SCENARIO = SCENARIOS[String(args.get('scenario') ?? '').toUpperCase()];
const CONDITION = String(args.get('condition') ?? '').toUpperCase();
const BLOCK = Number(args.get('block') ?? '0');
const REPETITION = Number(args.get('repetition') ?? '0');
const RIG = args.get('rig');
if (SCENARIO === undefined) throw new Error('--scenario=D is required');
if (!Object.hasOwn(ARMS, CONDITION)) throw new Error('--condition=V0|V1|V2|V3 is required');
if (typeof RIG !== 'string' || RIG === '') throw new Error('--rig=<dir> is required');

/** §8: the arm's consumed bundle set, taken from the frozen design so a trial cannot choose its own. */
const ARM = ARMS[CONDITION];
const BUNDLES = ARM.bundles;

const TRIAL_ID = `${SCENARIO.id}-${CONDITION}-b${BLOCK}r${REPETITION}`;
const DIR = join(RIG, TRIAL_ID);
const PROJECT = join(DIR, 'repo');
const STATE = join(DIR, 'state');
const HOME = join(DIR, 'home');
const OUT = join(DIR, 'out');
const SCRATCH = join(DIR, 'judge');
const PROFILE = `r2v${SCENARIO.id.toLowerCase()}${CONDITION.toLowerCase()}${String(BLOCK)}`;
const REAL_DSH = dshHome();
const DSH_BIN = dshBin();
const TEE = new URL('../gates/d2-live-tee-worker.mjs', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/u, '$1');
const WORKER_TIMEOUT_MS = 1_800_000;
const INDEX_HEADING = 'Project context available to this attempt';
const EFFICACY_HEADING = 'EXPERIMENTAL INHERITED-CAPITAL REVIEW';

const git = (cwd, list) => execFileSync('git', [...list], { cwd, encoding: 'utf8' }).trim();
const policyRef = (policyId) => ({ policyId, version: 'v1' });

const advanced = await import(pathToFileURL(`${REPO_ROOT}/dist/src/advanced.js`).href);
const delegation = await import(pathToFileURL(`${REPO_ROOT}/dist/src/interaction/work_delegation.js`).href);
const workWorker = await import(pathToFileURL(`${REPO_ROOT}/dist/src/deployment/work_worker.js`).href);
const proofModule = await import(pathToFileURL(`${REPO_ROOT}/dist/src/proof_asset/index.js`).href);
const reasoningModule = await import(pathToFileURL(`${REPO_ROOT}/dist/src/reasoning_cell/index.js`).href);
const workspaceModule = await import(pathToFileURL(`${REPO_ROOT}/dist/src/project_workspace/index.js`).href);
const proceduresModule = await import(pathToFileURL(`${REPO_ROOT}/dist/src/procedures/index.js`).href);
const memoryModule = await import(pathToFileURL(`${REPO_ROOT}/dist/src/organization_memory/index.js`).href);
const experimentModule = await import(pathToFileURL(`${REPO_ROOT}/dist/src/experiment/index.js`).href);

const project = SCENARIO.projectId;

/* ---------------------------------------------------------------- oracle instrumentation */

function instrumentOracle(worldDir, logName) {
  const checkPath = join(worldDir, 'test', 'check.js');
  const source = readFileSync(checkPath, 'utf8');
  const instrumented = [
    `try { appendFileSync(new URL(${JSON.stringify(logName)}, import.meta.url), String(Date.now()) + String.fromCharCode(10)); } catch { /* telemetry must never break the oracle */ }`,
    source.replace('import { readFileSync } from "node:fs";', 'import { readFileSync, appendFileSync } from "node:fs";'),
  ].join(String.fromCharCode(10));
  writeFileSync(checkPath, instrumented, 'utf8');
  execFileSync('git', ['add', '-A'], { cwd: worldDir });
  execFileSync('git', ['-c', 'user.email=t@t.t', '-c', 'user.name=t', 'commit', '-qm', 'H0+instrumented-oracle'], { cwd: worldDir });
  return git(worldDir, ['rev-parse', 'HEAD']);
}

const ORACLE_LOG_NAME = '.oracle-runs.log';

/* ---------------------------------------------------------------- policies */

const proofVerification = () => ({
  policyRef: policyRef('r2v-verification'),
  async verify({ candidate }) {
    const supporting = candidate.supportingEvidence.map((entry) => entry.evidenceId);
    return { standing: supporting.length > 0 ? 'SUPPORTED' : 'INCONCLUSIVE', supportingEvidenceIds: supporting, contradictingEvidenceIds: [] };
  },
});
const proofAdmission = () => ({
  policyRef: policyRef('r2v-publication'),
  async decide({ verification }) {
    return { decision: verification.standing === 'SUPPORTED' ? 'PUBLISH' : 'UNRESOLVED', provenanceDigest: verification.provenanceDigest };
  },
});
const reasoningVerification = () => ({
  async verify({ definition, candidate, frontierBasis }) {
    const base = { schemaVersion: 1, cell: candidate.cell, candidateDigest: candidate.candidateDigest, frontierBasis, verificationPolicyRef: definition.verificationPolicyRef, standing: 'SUPPORTED', supportingEvidenceIds: ['ev-1'], contradictingEvidenceIds: [], provenanceDigest: 'a'.repeat(64) };
    return { ...base, digest: reasoningModule.reasoningVerificationDigestOf(base) };
  },
  async verifyInvalidation({ definition, request, frontierBasis }) {
    const base = { schemaVersion: 1, cell: request.cell, candidateDigest: request.targetClaimId, frontierBasis, verificationPolicyRef: definition.verificationPolicyRef, standing: 'SUPPORTED', evidenceIds: ['ev-9'], provenanceDigest: 'b'.repeat(64) };
    return { ...base, digest: reasoningModule.invalidationVerificationDigestOf(base) };
  },
});
const reasoningAdmission = () => ({
  async admit({ definition, candidate, verification, frontierBasis }) {
    const base = { schemaVersion: 1, cell: candidate.cell, candidateDigest: candidate.candidateDigest, verificationResultDigest: verification.digest, frontierBasis, admissionPolicyRef: definition.admissionPolicyRef, decision: 'ADMIT', provenanceDigest: 'c'.repeat(64) };
    return { ...base, digest: reasoningModule.reasoningAdmissionDigestOf(base) };
  },
  async admitInvalidation({ definition, request, verification, frontierBasis }) {
    const base = { schemaVersion: 1, cell: request.cell, targetClaimId: request.targetClaimId, requestDigest: request.requestDigest, verificationResultDigest: verification.digest, frontierBasis, admissionPolicyRef: definition.admissionPolicyRef, decision: 'INVALIDATE', provenanceDigest: 'd'.repeat(64) };
    return { ...base, digest: reasoningModule.invalidationAdmissionDigestOf(base) };
  },
});

/**
 * §7: the Procedure for ONE bundle, encoding that bundle's OWN recorded method. The authoring seam selects
 * the bundle by the objective the caller passes, so the same seam serves every arm without the harness
 * injecting capital directly.
 */
function procedureAuthoringSeam(scenarioId) {
  return {
    origin: 'r2u-teacher-exploration',
    async propose(input) {
      const objective = String(input?.projectContext?.objective ?? '');
      const bundleId = objective.startsWith('bundle:') ? objective.slice('bundle:'.length) : scenarioId;
      const bundle = bundleCapital(bundleId);
      return {
        outcome: 'proposal',
        content: {
          schemaVersion: 1,
          title: `${bundleId}: ${bundle.domain.split(' (')[0]}`,
          purpose: `apply the recorded method for ${bundle.domain}`,
          applicability: [bundle.domain],
          preconditions: ['the implementation and the black-box oracle are readable'],
          steps: bundle.procedureClauses.map((clause) => ({ instruction: clause.instruction })),
          checks: [`the ${bundleId} ladder's recorded failures are avoided`],
          expectedOutputs: ['the black-box oracle reports every case as PASS'],
          limitations: ['does not authorize any command, path or effect beyond the task envelope', 'advisory guidance only; it cannot widen write scope or allowed commands'],
          capabilityHints: [],
          recommendedRecipeRefs: [],
        },
      };
    },
  };
}
function procedureAdmission() {
  return {
    policyRef: policyRef('r2v-admission'),
    async decide({ candidateDigest, validation }) {
      return { decision: 'PUBLISH', candidateDigest, rationale: `admitted for R2-V (groundsResolved=${String(validation.groundsResolved)})`, policyRef: policyRef('r2v-admission') };
    },
  };
}

/* ---------------------------------------------------------------- install */

const paths = {
  proof: join(STATE, 'proof.sqlite'),
  blobs: join(STATE, 'proof-blobs'),
  cells: join(STATE, 'cells.sqlite'),
  assoc: join(STATE, 'assoc.sqlite'),
  memory: join(STATE, 'memory.sqlite'),
  procedures: join(STATE, 'procedures.sqlite'),
  orchestration: join(STATE, 'orchestration.sqlite'),
  ordarium: join(STATE, 'ordarium.sqlite'),
};

const STANDARD = Object.freeze({
  statement: 'the black-box acceptance oracle passes and scope is respected',
  clauses: Object.freeze([
    Object.freeze({ kind: 'command_succeeds', command: Object.freeze([...SCENARIO.oracleCommand]), predicate: 'tests_pass' }),
    Object.freeze({ kind: 'scope_respected' }),
  ]),
  derivedFrom: Object.freeze([`r2-v ${SCENARIO.id} fixture`]),
  confirmed: true,
  notes: Object.freeze([]),
});

function install() {
  const proofStore = new proofModule.SqliteProofEvidenceStore(paths.proof);
  const reasoningStore = new reasoningModule.SqliteReasoningCellStore(paths.cells);
  const assocStore = new workspaceModule.SqliteProjectAssetAssociationStore(paths.assoc);
  const memoryStore = new memoryModule.SqliteOrganizationMemoryStore(paths.memory);
  const procedureStore = new proceduresModule.SqliteProcedureStore(paths.procedures);
  const installed = advanced.installPalimpsest(
    { tools: { register: () => () => undefined } },
    {
      projectId: project,
      databasePath: paths.orchestration,
      ordariumDatabasePath: paths.ordarium,
      repository: PROJECT,
      execution: 'worktree',
      standard: STANDARD,
      policy: advanced.trustedDefaultPolicy({
        read_paths: ['src', 'test', 'README.md'],
        allowed_commands: [{ executable: 'node', argv_prefix: [...SCENARIO.oracleCommand.slice(1)] }],
      }),
      proofEvidenceStore: proofStore,
      proofBlobStore: proofModule.localProofBlobStore(paths.blobs),
      proofVerificationPolicy: proofVerification(),
      proofPublicationAdmission: proofAdmission(),
      reasoningCellStore: reasoningStore,
      reasoningCellStoreOwned: false,
      reasoningVerificationPolicy: reasoningVerification(),
      reasoningAdmissionPolicy: reasoningAdmission(),
      projectAssociationStore: assocStore,
      organizationMemoryStore: memoryStore,
      procedureStore,
      procedureAuthoring: procedureAuthoringSeam(SCENARIO.id),
      procedureAdmission: procedureAdmission(),
    },
  );
  return { installed, proofStore, procedureStore };
}

/* ---------------------------------------------------------------- phase 0: world */

const started = Date.now();
mkdirSync(OUT, { recursive: true });
const head = buildWorld(SCENARIO, PROJECT);
const worldHead = instrumentOracle(PROJECT, ORACLE_LOG_NAME);

const task = Object.freeze({
  task_id: 't1',
  objective: SCENARIO.taskObjective,
  depends_on: Object.freeze([]),
  write_paths: Object.freeze([SCENARIO.sourceFile]),
  required_artifacts: Object.freeze([]),
});

const inaccessible = assertOracleInaccessible(SCENARIO, PROJECT);
const paired = pairedStateDigest(SCENARIO, PROJECT, task);

/* ---------------------------------------------------------------- phase 1: the arm's capital */

async function installCapital(installed) {
  const proof = installed.proof;
  const cells = installed.reasoningCells;
  const workspace = installed.projectWorkspace;

  const scenarioRef = memoryModule.materializeScenario({ scenarioId: 's1', scenarioRevision: 0, kind: 'S1_LOW_COUPLING', classification: 'SCRIPTED_MECHANICAL', task: SCENARIO.taskObjective, successCriteria: ['the black-box oracle reports every case as PASS'], bounds: { maxWallClockMs: 1000, maxModelCalls: 0, maxRunsPerVariant: 2 } });
  const variantRef = memoryModule.materializeVariant({ variantId: 'v1', kind: 'SINGLE_LOCUS', description: 'ordering-first method' });
  const experiment = memoryModule.materializeExperiment({ experimentId: 'exp-d', revision: 0, objective: 'which ordering of validation and mutation is correct', scenarioRefs: [{ scenarioId: scenarioRef.scenarioId, scenarioRevision: 0, digest: scenarioRef.digest }], variantRefs: [{ variantId: variantRef.variantId, digest: variantRef.digest }], measurementPlan: { metricIds: ['quality'], primaryValidatorRef: 'validator-1', objectives: ['quality'], objectiveNote: 'decision_aid_not_truth' }, runPolicy: { minRunsPerVariantPerScenario: 1, maxRuns: 2, maxWallClockMs: 1000, maxModelCalls: 0, maxAttemptsPerRun: 1, randomizeOrder: false, seed: 1 } });
  await installed.organizationMemory.recordExperiment(experiment);
  await installed.organizationMemory.recordScenario(experiment.experimentId, scenarioRef);
  await installed.organizationMemory.recordVariant(experiment.experimentId, variantRef);
  const runResult = experimentModule.buildRunResult({
    spec: { experiment, scenario: scenarioRef, variant: variantRef, seed: 42, orderIndex: 1, warmup: false, attempt: 1 },
    provenance: { provider: 'r2-v', model: 'deterministic', hostVersion: 'h', palimpsestSha: 's', ordariumVersion: 'o', profileDigest: 'p', repoShas: [], unknowns: [] },
    execution: { outcome: 'PASS', failureClassification: 'NONE', measurements: [memoryModule.materializeMetric({ metricId: 'quality', unit: 'ratio', measurementClass: 'DIRECTLY_OBSERVED', state: 'known', value: 1, provenance: 'r2-v' })], validatorResults: [] },
    startedAt: '2026-01-01T00:00:00.000Z',
    endedAt: '2026-01-01T00:00:01.000Z',
  });
  await installed.organizationMemory.recordRun(experiment.experimentId, runResult);
  const evaluation = experimentModule.evaluate({ experiment, scenarios: [scenarioRef], variants: [variantRef], runs: [runResult], corrections: [], annotations: [] });
  await installed.organizationMemory.recordEvaluation(experiment.experimentId, evaluation);

  const byBundle = {};
  for (const bundleId of BUNDLES) {
    const bundle = bundleCapital(bundleId);
    const imported = await proof.importSource({ bytes: new TextEncoder().encode(bundle.proof.statement), mediaType: 'text/plain', label: `${bundleId}-proof`, provenance: 'LOCAL_IMPORT', sourceId: `${bundleId}-proof` });
    const revRef = proofModule.materializeProofSourceRevisionRef({ sourceId: `${bundleId}-proof`, revision: imported.revision.revision, contentDigest: imported.revision.contentDigest });
    const evidence = await proof.recordEvidence({ sourceRevision: revRef, selector: { kind: 'WHOLE_SOURCE' } });
    const candidate = await proof.prepareCandidate({ claimType: proofModule.PROOF_STATEMENT_TYPE, content: { statement: bundle.proof.statement }, supportingEvidenceIds: [evidence.evidenceId], origin: 'MANUAL' });
    await proof.verify({ candidateId: candidate.candidateId });
    const published = await proof.decidePublication({ candidateId: candidate.candidateId });

    const cellId = `cell-${bundleId.toLowerCase()}`;
    await cells.service.openCell({ cellId, objective: bundle.reasoning.branchQuestion, verificationPolicyRef: policyRef('r2v-rv'), admissionPolicyRef: policyRef('r2v-ra') });
    const branch = await cells.service.openBranch({ cellId, question: bundle.reasoning.branchQuestion });
    const submitted = await cells.service.submitCandidate({ cellId, branchId: branch.branch.ref.branchId, type: reasoningModule.REASONING_STATEMENT_TYPE, content: { statement: bundle.reasoning.statement } });
    await cells.service.evaluateCandidate({ cellId, candidateDigest: submitted.candidate.candidateDigest });
    const frontier = await cells.service.frontier({ cellId });
    const reasoningClaimId = frontier.claims[0]?.ref.claimId;

    const prepared = await installed.procedures.prepare({ grounds: [{ kind: 'ORGANIZATION_EVALUATION', ref: evaluation.evaluationRef }], projectContext: { projectId: project, projectRevision: 1, projectDigest: '4'.repeat(64), objective: `bundle:${bundleId}` } });
    const procPub = await installed.procedures.publish({ procedureId: prepared.procedureId, candidate: prepared.candidate });
    if (procPub.status !== 'published') throw new Error(`procedure publish for ${bundleId} answered ${procPub.status}`);

    await workspace.associateAsset({ projectId: project, assetKind: 'PROOF_CLAIM', canonicalRef: { kind: 'PROOF_CLAIM', id: published.claimId }, associationKind: 'MANUAL', provenance: 'r2-v' });
    await workspace.associateAsset({ projectId: project, assetKind: 'REASONING_CELL', canonicalRef: { kind: 'REASONING_CELL', id: cellId }, associationKind: 'MANUAL', provenance: 'r2-v' });
    await workspace.associateAsset({ projectId: project, assetKind: 'PROCEDURE', canonicalRef: { kind: 'PROCEDURE', id: `${procPub.ref.procedureId}@${procPub.ref.revision}`, digest: procPub.revision.digest }, associationKind: 'MANUAL', provenance: 'r2-v' });

    byBundle[bundleId] = Object.freeze({
      bundleId,
      proofClaimId: published.claimId,
      cellId,
      reasoningClaimId,
      procedureId: procPub.ref.procedureId,
      procedureRevision: procPub.ref.revision,
      proofStatement: bundle.proof.statement,
      reasoningStatement: bundle.reasoning.statement,
      domain: bundle.domain,
    });
  }
  return byBundle;
}

const first = install();
first.installed.controller.start({ projectId: project, goal: SCENARIO.projectGoal, headCommit: worldHead, tasks: [task] });
const installedById = await installCapital(first.installed);
await first.installed.dispose();
first.procedureStore.close();

/** §12: the canonical identities this harness minted, so each consumed handle's bundle is known. */
const bundleByCanonical = {};
for (const bundleId of BUNDLES) {
  const bundle = installedById[bundleId];
  bundleByCanonical[`@ctx/proof/${bundle.proofClaimId}`] = bundleId;
  bundleByCanonical[`@ctx/reasoning/${bundle.cellId}/${bundle.reasoningClaimId}`] = bundleId;
  bundleByCanonical[`@ctx/procedure/${bundle.procedureId}/${String(bundle.procedureRevision)}`] = bundleId;
}
const bundleOf = (handle) => bundleByCanonical[String(handle)] ?? 'UNKNOWN';

/* ---------------------------------------------------------------- phase 2: home + worker */

mkdirSync(join(HOME, 'profiles', PROFILE), { recursive: true });
installHostBundle({ repo: REPO_ROOT, realDshHome: REAL_DSH });
execFileSync('cmd', ['/c', 'mklink', '/J', `${HOME.replace(/\//gu, '\\')}\\profiles\\node_modules`, `${REAL_DSH.replace(/\//gu, '\\')}\\profiles\\node_modules`], { stdio: 'ignore' });
writeFileSync(join(HOME, 'settings.yaml'), ['agent-default-model:', '  provider: deepseek-official', '  model: deepseek-flash', 'locale:', '  preference: zh', ''].join('\n'));
copyFileSync(join(REAL_DSH, '.credentials.yaml'), join(HOME, '.credentials.yaml'));
writeFileSync(
  join(HOME, 'profiles', PROFILE, 'deployment.json'),
  `${JSON.stringify({ schemaVersion: 1, profileId: PROFILE, projectId: project, localPeer: `${PROFILE}-peer`, persistentPoint: `pp-${PROFILE}`, repository: PROJECT, transport: { namespace: PROFILE, databasePath: join(STATE, 'transport.sqlite') }, databases: { orchestration: paths.orchestration, ordarium: paths.ordarium, coordination: join(STATE, 'coordination.sqlite'), transportCursors: join(STATE, 'cursors.sqlite') }, reasoning: {}, execution: 'worktree', concurrency: 1, policy: { allowed_commands: [{ executable: 'node', argv_prefix: [...SCENARIO.oracleCommand.slice(1)] }] }, standard: { statement: 'the black-box acceptance oracle passes' } }, null, 2)}\n`,
);
writeFileSync(join(HOME, 'profiles', PROFILE, 'package.json'), `${JSON.stringify({ name: `dsh-profile-${PROFILE}`, private: true, dependencies: {}, dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', 'palimpsest-dsh-host'], patchReload: 'startup' } } }, null, 2)}\n`);
writeFileSync(
  join(HOME, 'profiles', PROFILE, 'cordis.patch.yml'),
  ['- id: palimpsest-tools', '  config:', `    palimpsestEntry: '${REPO_ROOT}/dist/src/advanced.js'`, `    deploymentProfile: '${join(HOME, 'profiles', PROFILE, 'deployment.json')}'`, '    serve: false', '    openDashboard: false', ''].join('\n'),
);

const transcript = join(OUT, 'worker-transcript.txt');
/** §23 (R2-S): the control payload goes to the SYSTEM TEMP tree, never anywhere a worker can walk to. */
const payloadSink = join(tmpdir(), `palimpsest-r2v-control-${TRIAL_ID}.json`);
const previousHome = process.env.DSH_HOME;
const previousEfficacy = process.env[EFFICACY_ENV];
process.env.DSH_HOME = HOME;
process.env.PALIMPSEST_REAL_DSH_BIN = DSH_BIN;
process.env.PALIMPSEST_LIVE_GATE_TRANSCRIPT = transcript;
/**
 * §8: THE ONE EXPERIMENTAL ENVIRONMENT VALUE. Every arm runs under HOST-MEDIATED consumption, because §8
 * removes voluntary retrieval from the causal question: the host materializes the arm's selected bodies
 * before the first engineering turn. The ARM variable is the SELECTION SET, not the mechanism.
 */
process.env[EFFICACY_ENV] = EFFICACY_MODES.E1;

const record = {
  schemaVersion: 1,
  trialId: TRIAL_ID,
  scenario: SCENARIO.name,
  condition: CONDITION,
  block: BLOCK,
  repetition: REPETITION,
  knownFailureName: SCENARIO.knownFailure,
  pairedState: paired,
  oracleInaccessible: inaccessible,
  utilityArm: CONDITION,
  /** §11: the arm's consumed bundle set, and the mechanism, recorded as data. */
  consumedBundles: [...BUNDLES],
  consumptionMechanism: 'HOST_MEDIATED_PREWORK',
  bundles: BUNDLES.map((bundleId) => ({ bundleId, domain: BUNDLE_DOMAIN[bundleId] })),
  finalAcceptance: { passed: null, total: null, failures: [], note: 'JUDGING_NOT_REACHED' },
  firstCandidateAcceptance: { passed: null, total: null, failures: [], note: 'JUDGING_NOT_REACHED' },
  knownFailureFinal: { detector: SCENARIO.knownFailureDetector, recurred: 'UNKNOWN', violations: [], probesRun: 0, note: 'JUDGING_NOT_REACHED' },
  knownFailureFirst: { detector: SCENARIO.knownFailureDetector, recurred: 'UNKNOWN', violations: [], probesRun: 0, note: 'JUDGING_NOT_REACHED' },
};

let view;
let hostFailure = null;
try {
  const second = install();
  const controller = second.installed.controller;
  const service = delegation.makeWorkDelegationService({
    controller,
    workerFor: () => {
      const port = workWorker.dshSubprocessWorkWorkerPort({ dshBin: TEE, profile: PROFILE, timeoutMs: WORKER_TIMEOUT_MS });
      return {
        adapterId: port.adapterId,
        async run(input) {
          writeFileSync(payloadSink, JSON.stringify(workWorker.workWorkerEnvironmentPayload(input.context), null, 2), 'utf8');
          return await port.run(input);
        },
      };
    },
  });

  /** §11: the ONLY thing that varies across arms — the selected bundle set. */
  const selection = {
    proof: BUNDLES.map((bundleId) => ({ claimId: installedById[bundleId].proofClaimId })),
    reasoning: BUNDLES.map((bundleId) => ({ cellId: installedById[bundleId].cellId, claimId: installedById[bundleId].reasoningClaimId })),
    procedure: BUNDLES.map((bundleId) => ({ procedureId: installedById[bundleId].procedureId, revision: installedById[bundleId].procedureRevision, reason: 'explicitly selected for this attempt' })),
  };

  const jobStarted = await service.start({ expectedTaskId: 't1', knowledge: selection });
  record.jobId = jobStarted.jobId;
  view = await service.followup({ jobId: jobStarted.jobId });
  for (let i = 0; i < 6_000 && (view.phase === 'QUEUED' || view.phase === 'RUNNING'); i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    view = await service.followup({ jobId: jobStarted.jobId });
  }
  record.jobPhase = view.phase;
  record.hostError = view.hostError ?? null;
  record.attemptId = view.attemptId ?? null;

  /* -- phase 4: what the worker was handed and what it did -------------------- */
  const session = readModelVisiblePrompt({ home: HOME, workerSessionHint: 'worker-' });
  const sessionSection = session.found ? indexSectionOf(session.promptText) : null;
  record.session = {
    found: session.found,
    artifactDigest: session.artifactDigest,
    promptDigest: session.promptDigest,
    messageCount: session.messages.length,
    indexSectionFound: sessionSection !== null,
    handlesInPrompt: session.found ? handlesInPrompt(session.promptText) : [],
    note: session.note,
  };

  if (existsSync(payloadSink)) {
    const payload = JSON.parse(readFileSync(payloadSink, 'utf8'));
    const handles = payload?.context?.compiled?.handles ?? [];
    const productionIndexText = typeof payload?.contextIndexText === 'string' ? payload.contextIndexText : '';
    const w = payload.context.work;
    const listed = (value) => (Array.isArray(value) && value.length > 0 ? value.map((entry) => `  - ${entry}`).join(String.fromCharCode(10)) : '  (none)');
    const promptText = [
      'You are a Palimpsest WORK WORKER: a capable engineering agent running inside ONE isolated execution world prepared for one canonical Work task.',
      'You are NOT the principal: you cannot settle, verify, promote or plan anything, and no canonical fact changes because you say so.',
      '',
      `Project goal: ${w.projectGoal}`,
      `Requirements:${String.fromCharCode(10)}${listed(w.requirements)}`,
      `Decisions in force:${String.fromCharCode(10)}${listed(w.decisions)}`,
      '',
      `Your task: ${w.objective}`,
      `Write scope (changes outside it are refused when the product observes the tree):${String.fromCharCode(10)}${listed(w.writeScope)}`,
      `Required artifacts:${String.fromCharCode(10)}${listed(w.requiredArtifacts)}`,
      `Base commit: ${w.baseCommit}`,
      `What completion will require:${String.fromCharCode(10)}${listed(w.completionChecks)}`,
      `Independent verification required: ${w.independentVerificationRequired === true ? 'yes' : 'no'}`,
    ].join(String.fromCharCode(10));
    const cutAt = promptText.indexOf(INDEX_HEADING);
    const ordinary = cutAt === -1 ? promptText : promptText.slice(0, cutAt);
    const compiledHandles = handles.map((entry) => entry.handle);
    record.consumedHandles = compiledHandles.map((handle) => ({ handle, bundleId: bundleOf(handle) }));
    record.prompt = {
      ordinaryTaskDigest: sha256(ordinary.replace(/^Base commit: .*$/mu, 'Base commit: <masked>')),
      indexPresentationDigest: sha256(productionIndexText),
      indexHandleCount: productionIndexText.split(String.fromCharCode(10)).filter((line) => line.includes('@ctx/')).length,
      handlesInPayload: handles.map((entry) => `${entry.kind}:${entry.handle}`),
      compiledHandleOrder: compiledHandles,
      pullToolName: payload?.contextPullTool?.name ?? null,
      resultToolName: payload?.resultTool?.name ?? null,
      allowedPullHandles: payload?.allowedPullHandles ?? [],
      capabilitySetDigest: sha256(JSON.stringify({ pull: payload?.contextPullTool?.name ?? null, result: payload?.resultTool?.name ?? null, denied: payload?.deniedAuthorityPrefix ?? null })),
      toolCatalogDigest: sha256(JSON.stringify([payload?.contextPullTool?.name ?? null, payload?.resultTool?.name ?? null])),
      ordinaryTaskText: ordinary,
    };
  }

  if (existsSync(transcript)) {
    const text = readFileSync(transcript, 'utf8');
    const lines = text.split(/\r?\n/u);
    const envLine = lines.find((line) => line.startsWith('PALIMPSEST_WORKER_ENV')) ?? '';
    const outcomeLine = lines.filter((line) => line.startsWith('PALIMPSEST_WORK_RESULT')).pop() ?? '';
    const capacityLine = lines.filter((line) => line.startsWith('PALIMPSEST_WORKER_CAPACITY')).pop() ?? '';
    const boundaryLine = lines.filter((line) => line.startsWith('PALIMPSEST_WORKER_READ_BOUNDARY')).pop() ?? '';
    const capabilityLine = lines.filter((line) => line.startsWith('PALIMPSEST_WORKER_CAPABILITIES')).pop() ?? '';
    const efficacyLine = lines.filter((line) => line.startsWith('PALIMPSEST_WORKER_EFFICACY')).pop() ?? '';
    const actionLine = lines.filter((line) => line.startsWith('PALIMPSEST_WORKER_ACTIONS')).pop() ?? '';
    const env = envLine === '' ? {} : JSON.parse(envLine.slice(envLine.indexOf('{')));
    record.worker = {
      offeredTools: env.offeredTools ?? [],
      presentation: env.presentation ?? null,
      deniedPrincipalToolCount: (env.deniedTools ?? []).length,
      outcomeKind: /"kind":"([A-Z_]+)"/u.exec(outcomeLine)?.[1] ?? 'UNKNOWN',
      escalationReason: /"reason":"((?:[^"\\]|\\.)*)"/u.exec(outcomeLine)?.[1]?.slice(0, 400) ?? '',
      transcriptBytes: Buffer.byteLength(text, 'utf8'),
    };

    const efficacy = efficacyLine === '' ? null : JSON.parse(efficacyLine.slice(efficacyLine.indexOf('{')));
    record.efficacy = efficacy;
    record.prework = efficacy?.prework ?? null;

    /**
     * §12: THE CONSUMPTION PROOF. Three separate facts must hold for an analysed trial:
     *
     *   all intended handles resolved   the prework resolved every selected handle
     *   all intended bodies delivered   the durable session's prompt actually carries the section
     *   no unintended body delivered    every consumed handle belongs to a bundle this arm selected
     *
     * The bodies themselves are proven by DIGEST in the telemetry, so the record proves delivery without
     * persisting content.
     */
    const preworkHandles = (record.prework?.handles ?? []).map(String);
    const intendedHandles = (record.prompt?.compiledHandleOrder ?? []).map(String);
    const allResolved = record.prework?.allConsumed === true && intendedHandles.length > 0 && intendedHandles.every((handle) => preworkHandles.includes(handle));
    const sessionPromptText = session.found ? session.promptText : '';
    const sectionDelivered = sessionPromptText.includes(EFFICACY_HEADING);
    const consumedBundles = [...new Set(intendedHandles.map((handle) => bundleOf(handle)))];
    const noUnintended = consumedBundles.every((bundleId) => BUNDLES.includes(bundleId)) && !consumedBundles.includes('UNKNOWN');
    /** §12: every intended bundle must actually appear among the consumed handles. */
    const allBundlesConsumed = BUNDLES.every((bundleId) => consumedBundles.includes(bundleId));
    record.consumptionEvidence = Object.freeze({
      intendedHandleCount: intendedHandles.length,
      resolvedHandleCount: preworkHandles.length,
      allResolved,
      sectionDelivered,
      consumedBundles,
      intendedBundles: [...BUNDLES],
      allBundlesConsumed,
      noUnintended,
      bodyDigests: record.prework?.digests ?? [],
    });
    record.consumptionProven = allResolved && sectionDelivered && noUnintended && allBundlesConsumed;
    record.consumptionPrecondition = record.consumptionProven ? 'MET' : 'CONSUMPTION_PRECONDITION_NOT_MET';

    const actions = actionLine === '' ? { order: [], firstUse: {} } : JSON.parse(actionLine.slice(actionLine.indexOf('{')));
    const firstUse = actions.firstUse ?? {};
    const ordinalOf = (name) => (typeof firstUse[name] === 'number' ? firstUse[name] : null);
    const editOrdinals = ['write', 'edit', 'str_replace_editor'].map(ordinalOf).filter((value) => value !== null);
    const firstEditOrdinal = editOrdinals.length === 0 ? null : Math.min(...editOrdinals);
    record.worker.actionOrder = actions.order ?? [];
    record.worker.firstUseOrdinals = firstUse;
    record.firstEditOrdinal = firstEditOrdinal;
    /** §13: consumption happens BEFORE the first turn exists, so this is structural; recorded anyway. */
    record.consumedBeforeFirstEdit = record.consumptionProven === true;
    record.confidentiality = {
      capacity: capacityLine === '' ? null : JSON.parse(capacityLine.slice(capacityLine.indexOf('{'))),
      boundary: boundaryLine === '' ? null : JSON.parse(boundaryLine.slice(boundaryLine.indexOf('{'))),
      capabilities: capabilityLine === '' ? null : JSON.parse(capabilityLine.slice(capabilityLine.indexOf('{'))),
    };
  }

  /* -- phase 5/6: judge the candidate ---------------------------------------- */
  const world = view.attemptId === undefined || view.attemptId === null ? null : (() => { try { return controller.observeAttemptResult(view.attemptId); } catch { return null; } })();
  record.worldObserved = world !== null && world !== undefined;
  if (world !== null && world !== undefined) {
    const workDir = world.workDir;
    record.workDir = workDir;
    const workerCommits = git(workDir, ['rev-list', '--reverse', 'HEAD', `^${worldHead}`, '--', SCENARIO.sourceFile]).split('\n').map((line) => line.trim()).filter((line) => line !== '');
    const firstCandidateCommit = workerCommits.length > 0 ? workerCommits[0] : null;
    record.implementationRevisions = Math.max(0, workerCommits.length - 1);
    record.workerCommitCount = workerCommits.length;
    const finalSource = git(workDir, ['show', `HEAD:${SCENARIO.sourceFile}`]);
    const firstSource = firstCandidateCommit === null ? null : git(workDir, ['show', `${firstCandidateCommit}:${SCENARIO.sourceFile}`]);
    writeFileSync(join(OUT, 'final-source.txt'), finalSource, 'utf8');
    if (firstSource !== null) writeFileSync(join(OUT, 'first-source.txt'), firstSource, 'utf8');
    record.submittedCandidate = firstSource !== null;
    record.sourceBytes = Buffer.byteLength(finalSource, 'utf8');
    record.firstSourceEqualsFinal = firstSource !== null && firstSource === finalSource;
    const normalize = (text) => text.replace(/\r\n/gu, '\n');
    const committedOracle = execFileSync('git', ['show', `${worldHead}:test/check.js`], { cwd: workDir, encoding: 'utf8' });
    const worldOracle = readFileSync(join(workDir, 'test', 'check.js'), 'utf8');
    record.oracleFileUnmodified = normalize(worldOracle) === normalize(committedOracle);

    const finalJudgement = await judgeHidden(SCENARIO, finalSource, join(SCRATCH, 'final'));
    record.finalAcceptance = { passed: finalJudgement.passed, total: finalJudgement.total, failures: finalJudgement.results.filter((r) => !r.pass).map((r) => `${r.id}:${r.failureClass}`) };
    const firstJudgement = firstSource === null ? null : await judgeHidden(SCENARIO, firstSource, join(SCRATCH, 'first'));
    record.firstCandidateAcceptance = firstJudgement === null
      ? { passed: null, total: null, failures: [], note: 'NO_CANDIDATE_SUBMITTED — the worker committed no change to the target source' }
      : { passed: firstJudgement.passed, total: firstJudgement.total, failures: firstJudgement.results.filter((r) => !r.pass).map((r) => `${r.id}:${r.failureClass}`) };

    const finalModule = await import(`${pathToFileURL(join(SCRATCH, 'final', SCENARIO.sourceFile)).href}?v=${String(Date.now())}`);
    record.knownFailureFinal = detectKnownFailure(SCENARIO.id, finalModule[SCENARIO.exportName]);
    if (firstSource === null) {
      record.knownFailureFirst = { detector: SCENARIO.knownFailureDetector, recurred: 'UNKNOWN', violations: [], probesRun: 0, note: 'NO_CANDIDATE_SUBMITTED' };
    } else {
      const firstModule = await import(`${pathToFileURL(join(SCRATCH, 'first', SCENARIO.sourceFile)).href}?v=${String(Date.now() + 1)}`);
      const firstFn = firstModule[SCENARIO.exportName];
      record.knownFailureFirst = typeof firstFn === 'function' ? detectKnownFailure(SCENARIO.id, firstFn) : { detector: SCENARIO.knownFailureDetector, recurred: 'UNKNOWN', violations: [], probesRun: 0 };
    }
  } else {
    record.finalAcceptance = { passed: 0, total: 0, failures: ['NO_WORLD'] };
    record.firstCandidateAcceptance = { passed: 0, total: 0, failures: ['NO_WORLD'] };
    record.knownFailureFinal = { detector: SCENARIO.knownFailureDetector, recurred: 'UNKNOWN', violations: [], probesRun: 0 };
    record.knownFailureFirst = { detector: SCENARIO.knownFailureDetector, recurred: 'UNKNOWN', violations: [], probesRun: 0 };
  }

  await second.installed.dispose().catch(() => undefined);
  second.procedureStore.close();
} catch (error) {
  hostFailure = error?.stack ?? String(error);
} finally {
  if (previousHome === undefined) delete process.env.DSH_HOME;
  else process.env.DSH_HOME = previousHome;
  if (previousEfficacy === undefined) delete process.env[EFFICACY_ENV];
  else process.env[EFFICACY_ENV] = previousEfficacy;
}

const oracleLogPath = record.workDir === undefined ? null : join(record.workDir, 'test', ORACLE_LOG_NAME);
const oracleLogText = oracleLogPath !== null && existsSync(oracleLogPath) ? readFileSync(oracleLogPath, 'utf8') : '';
record.visibleOracleInvocations = oracleLogText.split('\n').filter((line) => line.trim() !== '').length;
record.hiddenOracleInvocations = record.firstSourceEqualsFinal === true ? 1 : 2;
record.hostFailure = hostFailure;
record.timedOut = view !== undefined && (view.phase === 'QUEUED' || view.phase === 'RUNNING');
record.manualInterventions = 0;
record.elapsedMs = Date.now() - started;

writeFileSync(join(OUT, 'trial.json'), JSON.stringify(record, null, 2), 'utf8');
const shown = (value) => (value === null || value === undefined ? 'NONE' : String(value));
process.stdout.write(`${TRIAL_ID} phase=${record.jobPhase ?? 'HOST_ERROR'} final=${shown(record.finalAcceptance?.passed)}/${shown(record.finalAcceptance?.total)} first=${shown(record.firstCandidateAcceptance?.passed)}/${shown(record.firstCandidateAcceptance?.total)} knownFailure=${shown(record.knownFailureFinal?.recurred)} consumed=${shown(record.consumptionProven)} bundles=${BUNDLES.join('+')}${record.hostFailure === null ? '' : ' HOST_FAILURE'}\n`);
process.exit(0);
