#!/usr/bin/env node
/**
 * R2-S §6/§9/§10/§13/§14/§16/§19 — ONE PRIMARY TRIAL OF THE S0/S1 SELECTIVITY MATRIX.
 *
 * One process per trial, for the same reasons the prior stages give: newly bootstrapped trial states, no
 * reuse of previous model sessions, and one ACTIVE confidential worker at a time.
 *
 * WHAT ONE TRIAL DOES
 *
 *   Phase 0  build the world (fixture + H0), record the PAIRED-STATE DIGESTS
 *   Phase 1  install SIX capital items for this (scenario, block): 3 TARGET (the scenario's own bundle,
 *            one per kind) + 3 DISTRACTOR (the block's frozen draw from the independent bundle pool),
 *            and associate all six with the experimental project through the public API
 *   Phase 2  dispose, COLD RESTART, install again, select the SAME SIX in BOTH arms
 *   Phase 3  drive the REAL DSH stochastic worker under the arm's index-presentation mode
 *   Phase 4  read the payload, the durable session, the pull telemetry and the committed source
 *   Phase 5  judge the first and final candidate against the HIDDEN acceptance
 *   Phase 6  detect the pre-paid known failure and write the trial record
 *
 * THE TWO ARMS (§9), and the ONE thing that differs:
 *
 *   S0  the opaque broad index: six `[kind] handle` entries, the current production presentation
 *   S1  the SAME six handles, the SAME order, the SAME bodies, plus the frozen R2-M decision metadata
 *
 * §10: EVERYTHING ELSE IS IDENTICAL — task, repo, visible tests, hidden oracle, model/profile, runtime,
 * tool catalog, tool descriptions, capabilities, selected handle identities, selected handle order and
 * capital bodies. Only metadata bytes differ.
 *
 * §5: THE HANDLE OCCURRENCE CONFOUND IS FIXED. The experimental renderer no longer emits a trailing
 * duplicate `Handle:` line, so each selected handle appears EXACTLY ONCE in both arms and the S0/S1
 * comparison cannot be explained by handle repetition.
 *
 * §13: TREATMENT IS PROVEN AT THE MODEL-VISIBLE SESSION BOUNDARY, never from host intent: the durable DSH
 * session artifact must show all six handles, each exactly once, in the paired order, with S0 byte-identical
 * to the production index and S1 showing the frozen metadata.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { dshBin, dshHome, installHostBundle } from '../gates/env.mjs';
import { INDEX_METADATA_ENV, INDEX_METADATA_MODES } from '../../host/dsh/lib/index-metadata.js';
import { detectKnownFailure } from '../r2u/known-failure.mjs';
import { assertOracleInaccessible, buildWorld, judgeHidden, pairedStateDigest, SCENARIOS, sha256 } from '../r2u/scenarios.mjs';
import { handlesInPrompt, indexSectionOf, readModelVisiblePrompt } from '../r2lr/session-probe.mjs';
import { bundleCapital, candidateSetFor } from './candidates.mjs';
import { CANDIDATE_SET_SIZE, KINDS, MODE_OF, TARGET_COUNT } from './design.mjs';

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
if (SCENARIO === undefined) throw new Error('--scenario=C|D is required');
if (!['S0', 'S1'].includes(CONDITION)) throw new Error('--condition=S0|S1 is required');
if (typeof RIG !== 'string' || RIG === '') throw new Error('--rig=<dir> is required');

/**
 * §6: the block's frozen distractor draw, passed in by the matrix so the trial cannot choose its own.
 * `--distractors=B,D,B` in kind order (proof,reasoning,procedure).
 */
const DISTRACTOR_BUNDLES = String(args.get('distractors') ?? '').split(',').map((value) => value.trim()).filter((value) => value !== '');
if (DISTRACTOR_BUNDLES.length !== KINDS.length) throw new Error(`--distractors must name ${String(KINDS.length)} bundles (proof,reasoning,procedure)`);
const DISTRACTOR_SET = Object.freeze(Object.fromEntries(KINDS.map((kind, index) => [kind, DISTRACTOR_BUNDLES[index]])));

const TRIAL_ID = `${SCENARIO.id}-${CONDITION}-b${BLOCK}r${REPETITION}`;
const DIR = join(RIG, TRIAL_ID);
const PROJECT = join(DIR, 'repo');
const STATE = join(DIR, 'state');
const HOME = join(DIR, 'home');
const OUT = join(DIR, 'out');
const SCRATCH = join(DIR, 'judge');
const PROFILE = `r2s${SCENARIO.id.toLowerCase()}${CONDITION.toLowerCase()}${String(BLOCK)}`;
const REAL_DSH = dshHome();
const DSH_BIN = dshBin();
const TEE = new URL('../gates/d2-live-tee-worker.mjs', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/u, '$1');
const WORKER_TIMEOUT_MS = 1_800_000;
const INDEX_HEADING = 'Project context available to this attempt';

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
const candidateSet = candidateSetFor(SCENARIO.id, DISTRACTOR_SET);

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
  policyRef: policyRef('r2u-verification'),
  async verify({ candidate }) {
    const supporting = candidate.supportingEvidence.map((entry) => entry.evidenceId);
    return { standing: supporting.length > 0 ? 'SUPPORTED' : 'INCONCLUSIVE', supportingEvidenceIds: supporting, contradictingEvidenceIds: [] };
  },
});
const proofAdmission = () => ({
  policyRef: policyRef('r2u-publication'),
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
 * §6: the Procedure for ONE bundle. Its content is that bundle's own method — the target's is the
 * scenario's own ladder, a distractor's is a different ladder entirely — so the six items carry six real
 * methods rather than one method repeated.
 */
function procedureAuthoring(bundleId, bundle) {
  const steps = bundle.procedureClauses.map((clause) => ({ instruction: clause.instruction }));
  return {
    origin: 'r2u-teacher-exploration',
    async propose() {
      return {
        outcome: 'proposal',
        content: {
          schemaVersion: 1,
          title: `${bundleId}: ${bundle.domain.split(' (')[0]}`,
          purpose: `apply the recorded method for ${bundle.domain}`,
          applicability: [bundle.domain],
          preconditions: ['the implementation and the black-box oracle are readable'],
          steps,
          checks: [`the method's own recorded failures are avoided (${bundleId} ladder)`],
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
    policyRef: policyRef('r2u-admission'),
    async decide({ candidateDigest, validation }) {
      return { decision: 'PUBLISH', candidateDigest, rationale: `admitted for R2-S (groundsResolved=${String(validation.groundsResolved)})`, policyRef: policyRef('r2u-admission') };
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
  derivedFrom: Object.freeze([`r2-s ${SCENARIO.id} fixture`]),
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
      /**
       * §6: ONE authoring seam that dispatches on the bundle. Every installed procedure's content is its
       * OWN bundle's recorded method, so the six items are six distinct methods. The seam reads the
       * bundle's capital, which is derived from a recorded exploration — nothing is authored here.
       */
      procedureAuthoring: {
        origin: 'r2u-teacher-exploration',
        async propose(input) {
          const objective = String(input?.projectContext?.objective ?? '');
          const bundleId = objective.startsWith('bundle:') ? objective.slice('bundle:'.length) : SCENARIO.id;
          return await procedureAuthoring(bundleId, bundleCapital(bundleId)).propose(input);
        },
      },
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

/* ---------------------------------------------------------------- phase 1: the six capital items */

/**
 * §6/§7: INSTALL ALL SIX ITEMS. Each bundle contributes a Proof claim, a Reasoning cell with one admitted
 * claim, and a published Procedure revision. The six are then associated with the experimental project
 * through the SAME public `associateAsset` API — the legitimate, harness-only association path — so
 * project-scope enforcement is satisfied rather than bypassed.
 */
const BUNDLES_TO_INSTALL = Object.freeze([...new Set([candidateSet.targetBundleId, ...candidateSet.distractorBundles])]);

async function installCapital(installed) {
  const proof = installed.proof;
  const cells = installed.reasoningCells;
  const workspace = installed.projectWorkspace;
  const byBundle = {};

  /** One shared empirical ground: the evaluation is the organization's own record for this project. */
  const scenarioRef = memoryModule.materializeScenario({ scenarioId: 's1', scenarioRevision: 0, kind: 'S1_LOW_COUPLING', classification: 'SCRIPTED_MECHANICAL', task: SCENARIO.taskObjective, successCriteria: ['the black-box oracle reports every case as PASS'], bounds: { maxWallClockMs: 1000, maxModelCalls: 0, maxRunsPerVariant: 2 } });
  const variantRef = memoryModule.materializeVariant({ variantId: 'v1', kind: 'SINGLE_LOCUS', description: 'ordering-first method' });
  const experiment = memoryModule.materializeExperiment({ experimentId: `exp-${SCENARIO.id.toLowerCase()}`, revision: 0, objective: 'which ordering of validation and mutation is correct', scenarioRefs: [{ scenarioId: scenarioRef.scenarioId, scenarioRevision: 0, digest: scenarioRef.digest }], variantRefs: [{ variantId: variantRef.variantId, digest: variantRef.digest }], measurementPlan: { metricIds: ['quality'], primaryValidatorRef: 'validator-1', objectives: ['quality'], objectiveNote: 'decision_aid_not_truth' }, runPolicy: { minRunsPerVariantPerScenario: 1, maxRuns: 2, maxWallClockMs: 1000, maxModelCalls: 0, maxAttemptsPerRun: 1, randomizeOrder: false, seed: 1 } });
  await installed.organizationMemory.recordExperiment(experiment);
  await installed.organizationMemory.recordScenario(experiment.experimentId, scenarioRef);
  await installed.organizationMemory.recordVariant(experiment.experimentId, variantRef);
  const runResult = experimentModule.buildRunResult({
    spec: { experiment, scenario: scenarioRef, variant: variantRef, seed: 42, orderIndex: 1, warmup: false, attempt: 1 },
    provenance: { provider: 'r2-s', model: 'deterministic', hostVersion: 'h', palimpsestSha: 's', ordariumVersion: 'o', profileDigest: 'p', repoShas: [], unknowns: [] },
    execution: { outcome: 'PASS', failureClassification: 'NONE', measurements: [memoryModule.materializeMetric({ metricId: 'quality', unit: 'ratio', measurementClass: 'DIRECTLY_OBSERVED', state: 'known', value: 1, provenance: 'r2-s' })], validatorResults: [] },
    startedAt: '2026-01-01T00:00:00.000Z',
    endedAt: '2026-01-01T00:00:01.000Z',
  });
  await installed.organizationMemory.recordRun(experiment.experimentId, runResult);
  const evaluation = experimentModule.evaluate({ experiment, scenarios: [scenarioRef], variants: [variantRef], runs: [runResult], corrections: [], annotations: [] });
  await installed.organizationMemory.recordEvaluation(experiment.experimentId, evaluation);

  for (const bundleId of BUNDLES_TO_INSTALL) {
    const bundle = bundleCapital(bundleId);
    const imported = await proof.importSource({ bytes: new TextEncoder().encode(bundle.proof.statement), mediaType: 'text/plain', label: `${bundleId}-proof`, provenance: 'LOCAL_IMPORT', sourceId: `${bundleId}-proof` });
    const revRef = proofModule.materializeProofSourceRevisionRef({ sourceId: `${bundleId}-proof`, revision: imported.revision.revision, contentDigest: imported.revision.contentDigest });
    const evidence = await proof.recordEvidence({ sourceRevision: revRef, selector: { kind: 'WHOLE_SOURCE' } });
    const candidate = await proof.prepareCandidate({ claimType: proofModule.PROOF_STATEMENT_TYPE, content: { statement: bundle.proof.statement }, supportingEvidenceIds: [evidence.evidenceId], origin: 'MANUAL' });
    await proof.verify({ candidateId: candidate.candidateId });
    const published = await proof.decidePublication({ candidateId: candidate.candidateId });
    const proofClaimId = published.claimId;

    /** §11: a NEUTRAL cell id, derived from the bundle so the schedule is reproducible. No relevance is encoded. */
    const cellId = `cell-${bundleId.toLowerCase()}`;
    await cells.service.openCell({ cellId, objective: bundle.reasoning.branchQuestion, verificationPolicyRef: policyRef('r2u-rv'), admissionPolicyRef: policyRef('r2u-ra') });
    const branch = await cells.service.openBranch({ cellId, question: bundle.reasoning.branchQuestion });
    const submitted = await cells.service.submitCandidate({ cellId, branchId: branch.branch.ref.branchId, type: reasoningModule.REASONING_STATEMENT_TYPE, content: { statement: bundle.reasoning.statement } });
    await cells.service.evaluateCandidate({ cellId, candidateDigest: submitted.candidate.candidateDigest });
    const frontier = await cells.service.frontier({ cellId });
    const reasoningClaimId = frontier.claims[0]?.ref.claimId;

    const prepared = await installed.procedures.prepare({
      grounds: [{ kind: 'ORGANIZATION_EVALUATION', ref: evaluation.evaluationRef }],
      /** The bundle identity rides in the objective so the ONE authoring seam can select the right method. */
      projectContext: { projectId: project, projectRevision: 1, projectDigest: '4'.repeat(64), objective: `bundle:${bundleId}` },
    });
    const procPub = await installed.procedures.publish({ procedureId: prepared.procedureId, candidate: prepared.candidate });
    if (procPub.status !== 'published') throw new Error(`procedure publish for ${bundleId} answered ${procPub.status}`);

    await workspace.associateAsset({ projectId: project, assetKind: 'PROOF_CLAIM', canonicalRef: { kind: 'PROOF_CLAIM', id: proofClaimId }, associationKind: 'MANUAL', provenance: 'r2-s' });
    await workspace.associateAsset({ projectId: project, assetKind: 'REASONING_CELL', canonicalRef: { kind: 'REASONING_CELL', id: cellId }, associationKind: 'MANUAL', provenance: 'r2-s' });
    await workspace.associateAsset({ projectId: project, assetKind: 'PROCEDURE', canonicalRef: { kind: 'PROCEDURE', id: `${procPub.ref.procedureId}@${procPub.ref.revision}`, digest: procPub.revision.digest }, associationKind: 'MANUAL', provenance: 'r2-s' });

    byBundle[bundleId] = Object.freeze({
      bundleId,
      proofClaimId,
      cellId,
      reasoningClaimId,
      procedureId: procPub.ref.procedureId,
      procedureRevision: procPub.ref.revision,
      procedureDigest: procPub.revision.digest,
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

/**
 * §6: THE HANDLE→ROLE MAP. Built from the canonical identities this harness itself minted, so the role of
 * every compiled handle is known WITHOUT reading it from the handle's name (§11 forbids encoding relevance
 * in handle names).
 */
const targetBundle = installedById[candidateSet.targetBundleId];
const distractorBundles = candidateSet.distractorBundles;
const roleByCanonical = {
  [`@ctx/proof/${targetBundle.proofClaimId}`]: 'TARGET',
  [`@ctx/reasoning/${targetBundle.cellId}/${targetBundle.reasoningClaimId}`]: 'TARGET',
  [`@ctx/procedure/${targetBundle.procedureId}/${String(targetBundle.procedureRevision)}`]: 'TARGET',
};
for (const bundleId of distractorBundles) {
  const bundle = installedById[bundleId];
  roleByCanonical[`@ctx/proof/${bundle.proofClaimId}`] = 'DISTRACTOR';
  roleByCanonical[`@ctx/reasoning/${bundle.cellId}/${bundle.reasoningClaimId}`] = 'DISTRACTOR';
  roleByCanonical[`@ctx/procedure/${bundle.procedureId}/${String(bundle.procedureRevision)}`] = 'DISTRACTOR';
}
const roleOf = (handle) => roleByCanonical[String(handle)] ?? 'UNKNOWN';

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
/** §23: the control payload is written to the SYSTEM TEMP tree, never anywhere a worker can walk to. */
const payloadSink = join(tmpdir(), `palimpsest-r2s-control-${TRIAL_ID}.json`);
const promptSink = join(OUT, 'rendered-prompt.json');
const previousHome = process.env.DSH_HOME;
const previousIndex = process.env[INDEX_METADATA_ENV];
process.env.DSH_HOME = HOME;
process.env.PALIMPSEST_REAL_DSH_BIN = DSH_BIN;
process.env.PALIMPSEST_LIVE_GATE_TRANSCRIPT = transcript;
/** §9: the ONE experimental environment value, set explicitly in BOTH arms. */
process.env[INDEX_METADATA_ENV] = MODE_OF[CONDITION];

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
  indexArm: CONDITION,
  /** §6/§7: the candidate set, its provenance, and the roles this harness minted. */
  candidateSet: {
    targetBundleId: candidateSet.targetBundleId,
    distractorBundles: [...candidateSet.distractorBundles],
    targetCount: candidateSet.targetCount,
    distractorCount: candidateSet.distractorCount,
    items: candidateSet.items,
    installed: BUNDLES_TO_INSTALL.map((bundleId) => ({ bundleId, domain: installedById[bundleId].domain, originProject: candidateSet.items.find((item) => item.bundleId === bundleId)?.provenance ?? 'UNKNOWN' })),
  },
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

  /**
   * §10: THE SAME SIX ITEMS IN BOTH ARMS. The condition changes only the index PRESENTATION, so the
   * selection request is byte-identical across the pair. The reason field is neutral and is never rendered
   * into the index; it exists because the API requires it.
   */
  const selection = {
    proof: candidateSet.items.filter((item) => item.kind === 'proof').map((item) => ({ claimId: installedById[item.bundleId].proofClaimId })),
    reasoning: candidateSet.items.filter((item) => item.kind === 'reasoning').map((item) => ({ cellId: installedById[item.bundleId].cellId, claimId: installedById[item.bundleId].reasoningClaimId })),
    procedure: candidateSet.items.filter((item) => item.kind === 'procedure').map((item) => ({ procedureId: installedById[item.bundleId].procedureId, revision: installedById[item.bundleId].procedureRevision, reason: 'explicitly selected for this attempt' })),
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
  /**
   * §13: THE DURABLE SESSION ARTIFACT, READ ONCE. Both the delivery record and the §5 occurrence counts
   * must describe the SAME artifact — reading it twice could select two different sessions and make the
   * occurrence check answer a different question from the one `treatmentApplied` answers.
   */
  const session = readModelVisiblePrompt({ home: HOME, workerSessionHint: 'worker-' });
  const sessionSection = session.found ? indexSectionOf(session.promptText) : null;

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
    const receivedIndexText = sessionSection === null ? '' : sessionSection.replace(/^\n+/u, '');
    const receivedProductionText = productionIndexText.replace(/^\n+/u, '');
    record.session = {
      found: session.found,
      artifactDigest: session.artifactDigest,
      promptDigest: session.promptDigest,
      messageCount: session.messages.length,
      indexSectionFound: sessionSection !== null,
      handlesInPrompt: session.found ? handlesInPrompt(session.promptText) : [],
      note: session.note,
    };
    /** §11: the REALIZED compiled order, and where the targets landed in it. */
    const compiledHandles = handles.map((entry) => entry.handle);
    record.realizedOrder = compiledHandles.map((handle, index) => ({ position: index + 1, handle, role: roleOf(handle) }));
    record.rolePositions = {
      targetPositions: record.realizedOrder.filter((entry) => entry.role === 'TARGET').map((entry) => entry.position),
      distractorPositions: record.realizedOrder.filter((entry) => entry.role === 'DISTRACTOR').map((entry) => entry.position),
    };
    record.prompt = {
      ordinaryTaskDigest: sha256(ordinary.replace(/^Base commit: .*$/mu, 'Base commit: <masked>')),
      indexPresentationDigest: sha256(receivedIndexText),
      productionIndexDigest: sha256(receivedProductionText),
      indexSection: receivedIndexText,
      productionIndexSection: receivedProductionText,
      indexHandleCount: receivedIndexText.split(String.fromCharCode(10)).filter((line) => line.includes('@ctx/')).length,
      handlesInPayload: handles.map((entry) => `${entry.kind}:${entry.handle}`),
      compiledHandleOrder: compiledHandles,
      pullToolName: payload?.contextPullTool?.name ?? null,
      pullToolDescriptionDigest: sha256(payload?.contextPullTool?.description ?? ''),
      resultToolName: payload?.resultTool?.name ?? null,
      allowedPullHandles: payload?.allowedPullHandles ?? [],
      capabilitySetDigest: sha256(JSON.stringify({ pull: payload?.contextPullTool?.name ?? null, result: payload?.resultTool?.name ?? null, denied: payload?.deniedAuthorityPrefix ?? null })),
      toolCatalogDigest: sha256(JSON.stringify([payload?.contextPullTool?.name ?? null, payload?.resultTool?.name ?? null])),
      ordinaryTaskText: ordinary,
    };
    writeFileSync(promptSink, JSON.stringify(record.prompt, null, 2), 'utf8');
  }

  if (existsSync(transcript)) {
    const text = readFileSync(transcript, 'utf8');
    const lines = text.split(/\r?\n/u);
    const envLine = lines.find((line) => line.startsWith('PALIMPSEST_WORKER_ENV')) ?? '';
    const pullLines = lines.filter((line) => line.startsWith('PALIMPSEST_WORKER_PULL'));
    const outcomeLine = lines.filter((line) => line.startsWith('PALIMPSEST_WORK_RESULT')).pop() ?? '';
    const capacityLine = lines.filter((line) => line.startsWith('PALIMPSEST_WORKER_CAPACITY')).pop() ?? '';
    const boundaryLine = lines.filter((line) => line.startsWith('PALIMPSEST_WORKER_READ_BOUNDARY')).pop() ?? '';
    const capabilityLine = lines.filter((line) => line.startsWith('PALIMPSEST_WORKER_CAPABILITIES')).pop() ?? '';
    const indexLine = lines.filter((line) => line.startsWith('PALIMPSEST_WORKER_INDEX')).pop() ?? '';
    const env = envLine === '' ? {} : JSON.parse(envLine.slice(envLine.indexOf('{')));
    const pull = pullLines.length === 0 ? { pulled: [] } : JSON.parse(pullLines[pullLines.length - 1].slice(pullLines[pullLines.length - 1].indexOf('{')));
    const pulledHandles = pull.pulled ?? [];
    record.worker = {
      offeredTools: env.offeredTools ?? [],
      presentation: env.presentation ?? null,
      reportedIndexMode: env.index ?? null,
      deniedPrincipalToolCount: (env.deniedTools ?? []).length,
      pulledHandles,
      pullOrder: pulledHandles,
      pullTelemetryLines: pullLines.length,
      outcomeKind: /"kind":"([A-Z_]+)"/u.exec(outcomeLine)?.[1] ?? 'UNKNOWN',
      outcomeSummary: /"summary":"((?:[^"\\]|\\.)*)"/u.exec(outcomeLine)?.[1]?.slice(0, 600) ?? '',
      escalationReason: /"reason":"((?:[^"\\]|\\.)*)"/u.exec(outcomeLine)?.[1]?.slice(0, 400) ?? '',
      transcriptBytes: Buffer.byteLength(text, 'utf8'),
    };

    /**
     * §14: THE PRIMARY OUTCOME. Each pulled handle is classified by the role THIS HARNESS MINTED, never by
     * anything the model could read from the handle's name.
     */
    const pulledRoles = pulledHandles.map((handle) => roleOf(handle));
    record.worker.pulledRoles = pulledRoles;
    record.worker.pulledKinds = [...new Set(pulledHandles.map((handle) => String(handle).replace(/^@ctx\/([a-z]+)\/.*$/u, '$1')))].sort();
    record.outcome = Object.freeze({
      targetPulls: pulledRoles.filter((role) => role === 'TARGET').length,
      distractorPulls: pulledRoles.filter((role) => role === 'DISTRACTOR').length,
      totalPulls: pulledHandles.length,
      unknownRolePulls: pulledRoles.filter((role) => role === 'UNKNOWN').length,
      /** §16: the pull ORDER facts, from the ordered pull list. */
      pullOrderRoles: pulledRoles,
      firstTargetPullOrdinal: pulledRoles.indexOf('TARGET') === -1 ? null : pulledRoles.indexOf('TARGET') + 1,
      firstDistractorPullOrdinal: pulledRoles.indexOf('DISTRACTOR') === -1 ? null : pulledRoles.indexOf('DISTRACTOR') + 1,
    });

    const actionLine = lines.filter((line) => line.startsWith('PALIMPSEST_WORKER_ACTIONS')).pop() ?? '';
    const actions = actionLine === '' ? { order: [], firstUse: {} } : JSON.parse(actionLine.slice(actionLine.indexOf('{')));
    const firstUse = actions.firstUse ?? {};
    const pulledCount = pulledHandles.length;
    const ordinalOf = (name) => (typeof firstUse[name] === 'number' ? firstUse[name] : null);
    const pullOrdinal = ordinalOf('palimpsest_worker_context_pull');
    const editOrdinals = ['write', 'edit', 'str_replace_editor'].map(ordinalOf).filter((value) => value !== null);
    const firstEditOrdinal = editOrdinals.length === 0 ? null : Math.min(...editOrdinals);
    const runOrdinal = ordinalOf('run_code');
    const commitOrdinal = ordinalOf('bash');
    const before = (other) => (pullOrdinal === null || other === null ? 'UNKNOWN' : pullOrdinal < other);
    record.worker.actionOrder = actions.order ?? [];
    record.worker.firstUseOrdinals = firstUse;
    record.firstPullOrdinal = pullOrdinal;
    record.toolActionsBeforeFirstPull = pullOrdinal === null ? 'UNKNOWN' : pullOrdinal;
    record.pulledBeforeFirstEdit = pulledCount === 0 ? false : before(firstEditOrdinal);
    const firstOracleOrdinal = [runOrdinal, ordinalOf('pwsh')].filter((value) => value !== null).sort((left, right) => left - right)[0] ?? null;
    record.pulledBeforeFirstVisibleTest = pulledCount === 0 ? false : before(firstOracleOrdinal);
    void commitOrdinal;

    const indexTelemetryLine = indexLine === '' ? null : JSON.parse(indexLine.slice(indexLine.indexOf('{')));
    record.indexPresentation = indexTelemetryLine?.metadata ?? null;
    const derivationPullOffset = record.indexPresentation?.derivationPullOffset ?? 0;
    const derivedCount = record.indexPresentation?.derivedCount ?? 0;
    record.pullAccounting = Object.freeze({ derivationPullOffset, derivedCount, workerPulledCount: pulledCount, consistent: derivationPullOffset === derivedCount });

    /**
     * §13: THE TREATMENT PRECONDITION, PROVEN AT THE SESSION BOUNDARY, WITH HANDLE OCCURRENCE COUNTS.
     *
     * The occurrence requirement is what §5's renderer correction buys: every selected handle must appear
     * EXACTLY ONCE in the model-visible prompt, in BOTH arms. A handle appearing twice would mean the two
     * arms differ in repetition as well as metadata, which is the confound the correction removes.
     */
    const sessionIndexPresent = record.session?.indexSectionFound === true;
    const sessionHandles = record.session?.handlesInPrompt ?? [];
    const compiledOrder = record.prompt?.compiledHandleOrder ?? [];
    const sessionPromptText = session.found ? session.promptText : '';
    const occurrenceCounts = compiledOrder.map((handle) => ({ handle, role: roleOf(handle), count: sessionPromptText.split(handle).length - 1 }));
    record.handleOccurrences = occurrenceCounts;
    record.handleOccurrenceExact = occurrenceCounts.length === CANDIDATE_SET_SIZE && occurrenceCounts.every((entry) => entry.count === 1);
    record.sessionHandleOrder = sessionHandles;
    record.pairedOrderExact = compiledOrder.length === CANDIDATE_SET_SIZE && compiledOrder.every((handle, index) => sessionHandles[index] === handle);
    const allSelectedInSession = compiledOrder.length === CANDIDATE_SET_SIZE && compiledOrder.every((handle) => sessionHandles.includes(handle));
    const sessionIsProduction = record.prompt?.indexPresentationDigest === record.prompt?.productionIndexDigest;
    const derivationComplete = record.indexPresentation?.allDerived === true;
    record.treatmentEvidence = Object.freeze({
      sessionIndexPresent,
      sessionIsProduction,
      derivationComplete,
      allSelectedInSession,
      handleOccurrenceExact: record.handleOccurrenceExact,
      pairedOrderExact: record.pairedOrderExact,
      selectedHandleCount: compiledOrder.length,
      sessionHandleCount: sessionHandles.length,
    });
    if (CONDITION === 'S1') {
      record.treatmentApplied = sessionIndexPresent && !sessionIsProduction && derivationComplete && allSelectedInSession && record.handleOccurrenceExact && record.pairedOrderExact;
    } else {
      record.treatmentApplied = sessionIndexPresent && sessionIsProduction && record.handleOccurrenceExact && record.pairedOrderExact;
    }
    record.indexPrecondition = record.treatmentApplied === true ? (CONDITION === 'S1' ? 'MET' : 'CONTROL_OPAQUE_INDEX') : (CONDITION === 'S1' ? 'TREATMENT_PRECONDITION_NOT_MET' : 'CONTROL_PRECONDITION_NOT_MET');
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
    record.workerAttempts = 1;
    record.workerCommitCount = workerCommits.length;
    record.commits = git(workDir, ['rev-list', '--count', 'HEAD']).trim();
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
    const finalFn = finalModule[SCENARIO.exportName];
    record.knownFailureFinal = detectKnownFailure(SCENARIO.id, finalFn);
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
  if (previousIndex === undefined) delete process.env[INDEX_METADATA_ENV];
  else process.env[INDEX_METADATA_ENV] = previousIndex;
}

const oracleLogPath = record.workDir === undefined ? null : join(record.workDir, 'test', ORACLE_LOG_NAME);
const oracleLogText = oracleLogPath !== null && existsSync(oracleLogPath) ? readFileSync(oracleLogPath, 'utf8') : '';
record.visibleOracleInvocations = oracleLogText.split('\n').filter((line) => line.trim() !== '').length;
record.visibleOracleLogObserved = oracleLogPath !== null && existsSync(oracleLogPath);
record.hiddenOracleInvocations = record.finalAcceptance === undefined ? 0 : (record.firstSourceEqualsFinal === true ? 1 : 2);
record.hostFailure = hostFailure;
record.timedOut = view !== undefined && (view.phase === 'QUEUED' || view.phase === 'RUNNING');
record.manualInterventions = 0;
record.elapsedMs = Date.now() - started;
record.tokens = { exposed: false, note: 'the DSH host does not expose token counts to this seam; recorded as UNKNOWN rather than inferred' };

writeFileSync(join(OUT, 'trial.json'), JSON.stringify(record, null, 2), 'utf8');
const outcome = record.outcome ?? { targetPulls: 0, distractorPulls: 0, totalPulls: 0 };
const shown = (value) => (value === null || value === undefined ? 'NONE' : String(value));
process.stdout.write(`${TRIAL_ID} phase=${record.jobPhase ?? 'HOST_ERROR'} final=${shown(record.finalAcceptance?.passed)}/${shown(record.finalAcceptance?.total)} target=${String(outcome.targetPulls)}/${String(TARGET_COUNT)} distractor=${String(outcome.distractorPulls)}/${String(TARGET_COUNT)} total=${String(outcome.totalPulls)} knownFailure=${shown(record.knownFailureFinal?.recurred)} treated=${shown(record.treatmentApplied)}${record.hostFailure === null ? '' : ' HOST_FAILURE'}\n`);
process.exit(0);
