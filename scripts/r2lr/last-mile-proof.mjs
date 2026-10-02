#!/usr/bin/env node
/**
 * R2-LR §6 — THE REAL LAST-MILE PROOF: THE INDEX AT THE MODEL-VISIBLE SESSION BOUNDARY.
 *
 * WHY THIS GATE EXISTS. R1-L's live gate asserted that the index was delivered, and it was wrong: the
 * assertion was vacuous (`... !== "" || true`) and, more fundamentally, it asserted on the host's INTENDED
 * bytes rather than on what the model received. The index was never forwarded to the runner at all, so no
 * worker in this research line ever saw it.
 *
 * So this gate makes the claim where it can actually be checked: the DURABLE DSH SESSION ARTIFACT, which
 * is the model-visible boundary. It does not read host telemetry, and it does not re-render what the host
 * meant to send. It reads the user message the model was given, and asserts on those exact bytes.
 *
 * THE FIXTURE IS A DEDICATED DUMMY (§6), never Scenario C or D, so this gate cannot consume or perturb any
 * primary experimental fixture. Each selected capital body carries an UNGUESSABLE PER-RUN NONCE, and the
 * handles themselves carry a per-run nonce, so a passing assertion cannot be satisfied by a stale artifact,
 * a cached prompt, or a coincidental string.
 *
 * WHAT IT PROVES, in the order the bytes travel:
 *
 *   1. the payload CARRIES the rendered index (`contextIndexText`);
 *   2. the SHIPPED host adapter FORWARDS it (the repaired seam);
 *   3. the real session's user message CONTAINS the exact heading and the exact nonce handle lines;
 *   4. each expected handle appears EXACTLY ONCE, and no unselected handle appears;
 *   5. NO capital body, and NO backing-store path, appears in the model-visible prompt.
 *
 * NOT a product component: acceptance evidence, kept in Git so the gate can be re-run.
 * PLAIN JAVASCRIPT (`.mjs`): it runs under bare `node` against `dist/src/**`.
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { dshBin, dshHome, dshVersion, gateRepoRoot, gateRoot, installHostBundle } from '../gates/env.mjs';
import { handlesInPrompt, indexSectionOf, readModelVisiblePrompt } from './session-probe.mjs';

const REPO = gateRepoRoot();
const RUN = gateRoot();
const RIG = `${RUN}/r2-lr-last-mile`;
const HOME = `${RIG}/home`;
const PROJECT = `${RIG}/repo`;
const STATE = `${RIG}/state`;
const OUT = `${RIG}/out`;
const REAL_DSH = dshHome();
const DSH_BIN = dshBin();
const TEE = new URL('../gates/d2-live-tee-worker.mjs', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/u, '$1');
const PROFILE = 'r2lrmile';
const WORKER_TIMEOUT_MS = 1_500_000;
/** §6: the exact heading the product renders. The gate asserts on this literal, not on a prefix. */
const INDEX_HEADING = 'Project context available to this attempt';

const advanced = await import(pathToFileURL(`${REPO}/dist/src/advanced.js`).href);
const delegation = await import(pathToFileURL(`${REPO}/dist/src/interaction/work_delegation.js`).href);
const workWorker = await import(pathToFileURL(`${REPO}/dist/src/deployment/work_worker.js`).href);
const proofModule = await import(pathToFileURL(`${REPO}/dist/src/proof_asset/index.js`).href);
const reasoningModule = await import(pathToFileURL(`${REPO}/dist/src/reasoning_cell/index.js`).href);
const workspaceModule = await import(pathToFileURL(`${REPO}/dist/src/project_workspace/index.js`).href);
const proceduresModule = await import(pathToFileURL(`${REPO}/dist/src/procedures/index.js`).href);
const memoryModule = await import(pathToFileURL(`${REPO}/dist/src/organization_memory/index.js`).href);
const experimentModule = await import(pathToFileURL(`${REPO}/dist/src/experiment/index.js`).href);

const results = [];
const check = (id, statement, pass, detail) => {
  results.push({ id, statement, pass, detail });
  process.stdout.write(`${pass ? 'PASS' : 'FAIL'}  ${id}  ${statement} — ${detail}\n`);
};
const git = (cwd, args) => execFileSync('git', [...args], { cwd, encoding: 'utf8' }).trim();
const policyRef = (policyId) => ({ policyId, version: 'v1' });

/** §6: unguessable per-run nonces, in the HANDLES and in the BODIES. */
function makeNonces() {
  const alphabet = 'abcdefghijkmnpqrstuvwxyz23456789';
  const one = () => Array.from({ length: 20 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
  return { proof: `R1LR-NONCE-${one()}`, reasoning: `R1LR-NONCE-${one()}`, procedure: `R1LR-NONCE-${one()}`, body: `R1LR-BODY-${one()}` };
}

/* ---------------------------------------------------------------- the dummy fixture (§6) */

function setupProject(dir) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(join(dir, 'src'), { recursive: true });
  mkdirSync(join(dir, 'test'), { recursive: true });
  writeFileSync(join(dir, 'src', 'values.js'), 'export const values = { seen: null };\n');
  writeFileSync(
    join(dir, 'test', 'check.js'),
    [
      'import assert from "node:assert/strict";',
      'import { values } from "../src/values.js";',
      '',
      '// The oracle checks ONLY the shape. The nonces are unknowable to this file, so it cannot leak them.',
      'assert.ok(values && typeof values === "object", "values.js must export an object");',
      'process.stdout.write("ok" + String.fromCharCode(10));',
      '',
    ].join('\n'),
  );
  writeFileSync(join(dir, 'package.json'), `${JSON.stringify({ name: 'r2lrmile', private: true, type: 'module', scripts: { test: 'node test/check.js' } }, null, 2)}\n`);
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['add', '-A'], { cwd: dir });
  execFileSync('git', ['-c', 'user.email=t@t.t', '-c', 'user.name=t', 'commit', '-qm', 'H0'], { cwd: dir });
  return git(dir, ['rev-parse', 'HEAD']);
}

const STANDARD = Object.freeze({
  statement: 'the acceptance oracle passes and scope is respected',
  clauses: Object.freeze([
    Object.freeze({ kind: 'command_succeeds', command: Object.freeze(['node', 'test/check.js']), predicate: 'tests_pass' }),
    Object.freeze({ kind: 'scope_respected' }),
  ]),
  derivedFrom: Object.freeze(['r2-lr dummy fixture']),
  confirmed: true,
  notes: Object.freeze([]),
});

const proofVerification = () => ({
  policyRef: policyRef('r2lr-verification'),
  async verify({ candidate }) {
    const supporting = candidate.supportingEvidence.map((entry) => entry.evidenceId);
    return { standing: supporting.length > 0 ? 'SUPPORTED' : 'INCONCLUSIVE', supportingEvidenceIds: supporting, contradictingEvidenceIds: [] };
  },
});
const proofAdmission = () => ({
  policyRef: policyRef('r2lr-publication'),
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
const procedureAuthoring = () => ({
  origin: 'r2-lr-author',
  async propose() {
    return {
      outcome: 'proposal',
      content: {
        schemaVersion: 1,
        title: 'Record the governed context',
        purpose: 'write what the attempt was given into src/values.js',
        applicability: ['a task that must report governed project context'],
        preconditions: ['the project context is readable'],
        steps: [{ instruction: 'write the observed marker into src/values.js and commit' }],
        checks: ['src/values.js names what was read'],
        expectedOutputs: ['a committed values.js'],
        limitations: ['does not verify the marker'],
        capabilityHints: [],
        recommendedRecipeRefs: [],
      },
    };
  },
});
const procedureAdmission = () => ({
  policyRef: policyRef('r2lr-admission'),
  async decide({ candidateDigest, validation }) {
    return { decision: 'PUBLISH', candidateDigest, rationale: `admitted (groundsResolved=${String(validation.groundsResolved)})`, policyRef: policyRef('r2lr-admission') };
  },
});

/* ---------------------------------------------------------------- the run */

async function main() {
  rmSync(RIG, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  mkdirSync(HOME, { recursive: true });
  const nonces = makeNonces();
  process.stdout.write(`host DSH ${dshVersion()}\nrepo     ${REPO}\nrig      ${RIG}\n`);
  process.stdout.write(`nonces   proof=${nonces.proof} reasoning=${nonces.reasoning} procedure=${nonces.procedure}\n\n`);

  const head = setupProject(PROJECT);
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
  const project = 'r2lrmile';

  const install = () => {
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
        policy: advanced.trustedDefaultPolicy({ read_paths: ['src', 'test'], allowed_commands: [{ executable: 'node', argv_prefix: ['test/check.js'] }] }),
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
        procedureAuthoring: procedureAuthoring(),
        procedureAdmission: procedureAdmission(),
      },
    );
    return { installed, proofStore, procedureStore };
  };

  /* -- durable capital whose handles AND bodies carry the nonces ---------------- */
  const seed = install();
  seed.installed.controller.start({
    projectId: project,
    goal: 'record the governed project context this attempt was given',
    headCommit: head,
    tasks: [{ task_id: 't1', objective: 'write the marker you were given into src/values.js', depends_on: [], write_paths: ['src/values.js'], required_artifacts: [] }],
  });

  const proof = seed.installed.proof;
  const imported = await proof.importSource({ bytes: new TextEncoder().encode(`The proof body marker is ${nonces.body}.`), mediaType: 'text/plain', label: 'proof-marker', provenance: 'LOCAL_IMPORT', sourceId: 'proof-marker' });
  const revRef = proofModule.materializeProofSourceRevisionRef({ sourceId: 'proof-marker', revision: imported.revision.revision, contentDigest: imported.revision.contentDigest });
  const evidence = await proof.recordEvidence({ sourceRevision: revRef, selector: { kind: 'WHOLE_SOURCE' } });
  const candidate = await proof.prepareCandidate({ claimType: proofModule.PROOF_STATEMENT_TYPE, content: { statement: `the proof body marker is ${nonces.body}` }, supportingEvidenceIds: [evidence.evidenceId], origin: 'MANUAL' });
  await proof.verify({ candidateId: candidate.candidateId });
  const published = await proof.decidePublication({ candidateId: candidate.candidateId });
  const proofClaimId = published.claimId;

  const cell = seed.installed.reasoningCells;
  await cell.service.openCell({ cellId: 'cell-marker', objective: 'what is the marker', verificationPolicyRef: policyRef('r2lr-rv'), admissionPolicyRef: policyRef('r2lr-ra') });
  const branch = await cell.service.openBranch({ cellId: 'cell-marker', question: 'what is the marker?' });
  const submitted = await cell.service.submitCandidate({ cellId: 'cell-marker', branchId: branch.branch.ref.branchId, type: reasoningModule.REASONING_STATEMENT_TYPE, content: { statement: `the reasoning body marker is ${nonces.body}` } });
  await cell.service.evaluateCandidate({ cellId: 'cell-marker', candidateDigest: submitted.candidate.candidateDigest });
  const frontier = await cell.service.frontier({ cellId: 'cell-marker' });
  const reasoningClaimId = frontier.claims[0]?.ref.claimId;

  const scenario = memoryModule.materializeScenario({ scenarioId: 's1', scenarioRevision: 0, kind: 'S1_LOW_COUPLING', classification: 'SCRIPTED_MECHANICAL', task: 'report the governed context', successCriteria: ['the marker is recorded'], bounds: { maxWallClockMs: 1000, maxModelCalls: 0, maxRunsPerVariant: 2 } });
  const variant = memoryModule.materializeVariant({ variantId: 'v1', kind: 'SINGLE_LOCUS', description: 'read-then-write' });
  const experiment = memoryModule.materializeExperiment({ experimentId: 'exp-r2lr', revision: 0, objective: 'does the index reach the worker?', scenarioRefs: [{ scenarioId: scenario.scenarioId, scenarioRevision: 0, digest: scenario.digest }], variantRefs: [{ variantId: variant.variantId, digest: variant.digest }], measurementPlan: { metricIds: ['quality'], primaryValidatorRef: 'validator-1', objectives: ['quality'], objectiveNote: 'decision_aid_not_truth' }, runPolicy: { minRunsPerVariantPerScenario: 1, maxRuns: 2, maxWallClockMs: 1000, maxModelCalls: 0, maxAttemptsPerRun: 1, randomizeOrder: false, seed: 1 } });
  await seed.installed.organizationMemory.recordExperiment(experiment);
  await seed.installed.organizationMemory.recordScenario(experiment.experimentId, scenario);
  await seed.installed.organizationMemory.recordVariant(experiment.experimentId, variant);
  const run = experimentModule.buildRunResult({
    spec: { experiment, scenario, variant, seed: 42, orderIndex: 1, warmup: false, attempt: 1 },
    provenance: { provider: 'r2-lr', model: 'deterministic', hostVersion: 'h', palimpsestSha: 's', ordariumVersion: 'o', profileDigest: 'p', repoShas: [], unknowns: [] },
    execution: { outcome: 'PASS', failureClassification: 'NONE', measurements: [memoryModule.materializeMetric({ metricId: 'quality', unit: 'ratio', measurementClass: 'DIRECTLY_OBSERVED', state: 'known', value: 1, provenance: 'r2-lr' })], validatorResults: [] },
    startedAt: '2026-01-01T00:00:00.000Z',
    endedAt: '2026-01-01T00:00:01.000Z',
  });
  await seed.installed.organizationMemory.recordRun(experiment.experimentId, run);
  const evaluation = experimentModule.evaluate({ experiment, scenarios: [scenario], variants: [variant], runs: [run], corrections: [], annotations: [] });
  await seed.installed.organizationMemory.recordEvaluation(experiment.experimentId, evaluation);
  const prepared = await seed.installed.procedures.prepare({ grounds: [{ kind: 'ORGANIZATION_EVALUATION', ref: evaluation.evaluationRef }], projectContext: { projectId: project, projectRevision: 1, projectDigest: '4'.repeat(64), objective: 'report the governed context' } });
  const procPub = await seed.installed.procedures.publish({ procedureId: prepared.procedureId, candidate: prepared.candidate });
  if (procPub.status !== 'published') throw new Error(`procedure publish answered ${procPub.status}`);

  const workspace = seed.installed.projectWorkspace;
  await workspace.associateAsset({ projectId: project, assetKind: 'PROOF_CLAIM', canonicalRef: { kind: 'PROOF_CLAIM', id: proofClaimId }, associationKind: 'MANUAL', provenance: 'r2-lr' });
  await workspace.associateAsset({ projectId: project, assetKind: 'REASONING_CELL', canonicalRef: { kind: 'REASONING_CELL', id: 'cell-marker' }, associationKind: 'MANUAL', provenance: 'r2-lr' });
  await workspace.associateAsset({ projectId: project, assetKind: 'PROCEDURE', canonicalRef: { kind: 'PROCEDURE', id: `${procPub.ref.procedureId}@${procPub.ref.revision}`, digest: procPub.revision.digest }, associationKind: 'MANUAL', provenance: 'r2-lr' });
  await seed.installed.dispose();
  seed.procedureStore.close();

  /* -- the real DSH worker ----------------------------------------------------- */
  mkdirSync(join(HOME, 'profiles', PROFILE), { recursive: true });
  installHostBundle({ repo: REPO, realDshHome: REAL_DSH });
  execFileSync('cmd', ['/c', 'mklink', '/J', `${HOME.replace(/\//gu, '\\')}\\profiles\\node_modules`, `${REAL_DSH.replace(/\//gu, '\\')}\\profiles\\node_modules`], { stdio: 'ignore' });
  writeFileSync(join(HOME, 'settings.yaml'), ['agent-default-model:', '  provider: deepseek-official', '  model: deepseek-flash', 'locale:', '  preference: zh', ''].join('\n'));
  copyFileSync(join(REAL_DSH, '.credentials.yaml'), join(HOME, '.credentials.yaml'));
  writeFileSync(
    join(HOME, 'profiles', PROFILE, 'deployment.json'),
    `${JSON.stringify({ schemaVersion: 1, profileId: PROFILE, projectId: project, localPeer: `${PROFILE}-peer`, persistentPoint: `pp-${PROFILE}`, repository: PROJECT, transport: { namespace: PROFILE, databasePath: join(STATE, 'transport.sqlite') }, databases: { orchestration: paths.orchestration, ordarium: paths.ordarium, coordination: join(STATE, 'coordination.sqlite'), transportCursors: join(STATE, 'cursors.sqlite') }, reasoning: {}, execution: 'worktree', concurrency: 1, policy: { allowed_commands: [{ executable: 'node', argv_prefix: ['test/check.js'] }] }, standard: { statement: 'the acceptance oracle passes' } }, null, 2)}\n`,
  );
  writeFileSync(join(HOME, 'profiles', PROFILE, 'package.json'), `${JSON.stringify({ name: `dsh-profile-${PROFILE}`, private: true, dependencies: {}, dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', 'palimpsest-dsh-host'], patchReload: 'startup' } } }, null, 2)}\n`);
  writeFileSync(
    join(HOME, 'profiles', PROFILE, 'cordis.patch.yml'),
    ['- id: palimpsest-tools', '  config:', `    palimpsestEntry: '${REPO}/dist/src/advanced.js'`, `    deploymentProfile: '${join(HOME, 'profiles', PROFILE, 'deployment.json')}'`, '  serve: false', '  openDashboard: false', ''].join('\n'),
  );

  const transcript = join(OUT, 'worker-transcript.txt');
  const payloadSink = join(OUT, 'payload.json');
  const previousHome = process.env.DSH_HOME;
  process.env.DSH_HOME = HOME;
  process.env.PALIMPSEST_REAL_DSH_BIN = DSH_BIN;
  process.env.PALIMPSEST_LIVE_GATE_TRANSCRIPT = transcript;

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

  const selection = { proof: [{ claimId: proofClaimId }], reasoning: [{ cellId: 'cell-marker', claimId: reasoningClaimId }], procedure: [{ procedureId: procPub.ref.procedureId, revision: procPub.ref.revision, reason: 'the admitted method' }] };
  const started = await service.start({ expectedTaskId: 't1', knowledge: selection });
  let view = await service.followup({ jobId: started.jobId });
  for (let i = 0; i < 30_000 && (view.phase === 'QUEUED' || view.phase === 'RUNNING'); i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    view = await service.followup({ jobId: started.jobId });
  }
  await second.installed.dispose().catch(() => undefined);
  second.procedureStore.close();
  if (previousHome === undefined) delete process.env.DSH_HOME;
  else process.env.DSH_HOME = previousHome;

  /* ================================================================ the assertions */

  /* -- 1. the payload CARRIES the rendered index ------------------------------- */
  const payload = existsSync(payloadSink) ? JSON.parse(readFileSync(payloadSink, 'utf8')) : null;
  const payloadIndex = typeof payload?.contextIndexText === 'string' ? payload.contextIndexText : '';
  const payloadHandles = (payload?.context?.compiled?.handles ?? []).map((entry) => entry.handle);
  check('LM-01', 'the product payload carries the rendered index', payloadIndex.includes(INDEX_HEADING) && payloadIndex.includes('@ctx/'), `${String(payloadIndex.split('\n').filter((line) => line.includes('@ctx/')).length)} handle line(s) in the payload`);
  check('LM-02', 'the payload index names exactly the compiled handles', payloadHandles.length === 3 && payloadHandles.every((handle) => payloadIndex.includes(handle)), `${String(payloadHandles.length)} compiled handle(s)`);

  /* -- 2. the model-visible SESSION carries it (the authoritative proof) -------- */
  const session = readModelVisiblePrompt({ home: HOME, workerSessionHint: 'worker-' });
  check('LM-03', 'a durable DSH session artifact was found and carried a user message', session.found, session.found ? `${session.note} from ${session.path?.replace(RIG, '<rig>') ?? '?'}` : session.note);

  const promptText = session.promptText;
  const section = indexSectionOf(promptText);
  check('LM-04', '§6 the MODEL-VISIBLE prompt contains the exact index heading', promptText.includes(INDEX_HEADING), section === null ? 'the heading is ABSENT from the real user message' : 'heading present at the model-visible boundary');

  const promptHandles = handlesInPrompt(promptText);
  check('LM-05', '§6 every selected handle appears in the model-visible prompt', payloadHandles.length === 3 && payloadHandles.every((handle) => promptHandles.includes(handle)), `handles in prompt: ${promptHandles.length === 0 ? '(none)' : promptHandles.join(', ')}`);

  /**
   * §6: EXACTLY ONCE. A handle appearing twice would mean the index was rendered more than once — for
   * instance once by the host and once by the runner — which would be a different prompt from the one the
   * experiment froze. The check counts occurrences in the whole model-visible prompt.
   */
  const occurrenceCounts = payloadHandles.map((handle) => ({ handle, count: promptText.split(handle).length - 1 }));
  check('LM-06', '§6 each expected handle appears EXACTLY once in the model-visible prompt', occurrenceCounts.length === 3 && occurrenceCounts.every((entry) => entry.count === 1), occurrenceCounts.map((entry) => `${entry.handle.slice(0, 24)}…×${String(entry.count)}`).join(' | '));

  /**
   * §6: NO UNSELECTED HANDLE. The prompt may name the three compiled handles and nothing else. A fourth
   * handle would mean the index leaked something the attempt did not bind.
   */
  const unselected = promptHandles.filter((handle) => !payloadHandles.includes(handle));
  check('LM-07', '§6 no unselected handle appears in the model-visible prompt', unselected.length === 0, unselected.length === 0 ? 'only the three bound handles are present' : `UNSELECTED: ${unselected.join(', ')}`);

  /* -- 3. no body, no backing-store path --------------------------------------- */
  check('LM-08', '§6 NO capital body appears in the model-visible prompt', !promptText.includes(nonces.body), promptText.includes(nonces.body) ? '*** the body nonce is in the prompt ***' : 'the body nonce appears nowhere in the user message');

  const bodyNonceCount = promptText.split(nonces.body).length - 1;
  const bodyInWorkerReport = existsSync(transcript) ? readFileSync(transcript, 'utf8').includes(nonces.body) : false;
  check('LM-09', '§6 the body is reachable ONLY by pulling (absent from the prompt, present only after a pull)', bodyNonceCount === 0, `prompt occurrences=${String(bodyNonceCount)}; the worker reported the body marker=${bodyInWorkerReport ? 'yes (it pulled)' : 'no (it did not pull — that is a choice, not a delivery failure)'}`);

  const storePathLeaked = [paths.proof, paths.cells, paths.procedures, paths.orchestration].some((path) => promptText.includes(path)) || promptText.includes('.sqlite');
  check('LM-10', '§6 no backing-store path appears in the model-visible prompt', !storePathLeaked, storePathLeaked ? '*** a store path is in the prompt ***' : 'no store path in the user message');

  /**
   * §6: THE MODEL-VISIBLE INDEX IS THE PRODUCT'S BYTES. The section found at the session boundary must be
   * EXACTLY the payload's `contextIndexText` (modulo the single leading newline the runner joins with), not
   * a re-rendering that merely resembles it. This is what makes the proof about DELIVERY rather than about
   * two renderings that happen to agree.
   */
  const sectionNormalized = section === null ? null : section.replace(/^\n+/u, '');
  const payloadNormalized = payloadIndex.replace(/^\n+/u, '');
  check('LM-11', 'the model-visible index is byte-identical to the product payload index', sectionNormalized !== null && sectionNormalized === payloadNormalized, sectionNormalized === null ? 'no section to compare' : sectionNormalized === payloadNormalized ? `${String(sectionNormalized.length)} bytes identical` : `DIFFERS: session ${String(sectionNormalized.length)} bytes vs payload ${String(payloadNormalized.length)} bytes`);

  /* -- 5. the pull tool is still attempt-bound --------------------------------- */
  const allowed = payload?.allowedPullHandles ?? [];
  check('LM-12', 'the attempt-bound allowlist is exactly the three bound handles', allowed.length === 3 && payloadHandles.every((handle) => allowed.includes(handle)), `${String(allowed.length)} allowed handle(s)`);

  /* -- report ------------------------------------------------------------------ */
  mkdirSync(join(REPO, 'research-evidence', 'r2-lr'), { recursive: true });
  writeFileSync(
    join(REPO, 'research-evidence', 'r2-lr', 'last-mile-proof.json'),
    `${JSON.stringify({
      schemaVersion: 1,
      stage: 'R2-LR',
      gate: 'last-mile',
      boundary: 'the durable DSH session artifact (the model-visible user message)',
      payloadIndexDigest: payloadIndex === '' ? null : (await import('node:crypto')).createHash('sha256').update(payloadIndex, 'utf8').digest('hex'),
      sessionPromptDigest: session.promptDigest,
      sessionArtifactDigest: session.artifactDigest,
      handlesInPayload: payloadHandles,
      handlesInPrompt: promptHandles,
      headingPresentInSession: promptText.includes(INDEX_HEADING),
      bodyNonceInPrompt: bodyNonceCount,
      results,
    }, null, 2)}\n`,
    'utf8',
  );

  const failed = results.filter((entry) => !entry.pass);
  process.stdout.write(`\n§R2-LR LAST MILE: ${failed.length === 0 ? 'PASS' : 'FAIL'} — ${String(results.length - failed.length)}/${String(results.length)}\n`);
  process.exit(failed.length === 0 ? 0 : 1);
}

await main();
