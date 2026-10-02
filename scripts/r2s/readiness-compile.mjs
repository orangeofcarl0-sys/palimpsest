#!/usr/bin/env node
/**
 * R2-S §19/§25 — THE DETERMINISTIC CANDIDATE-SET READINESS PROOF (NO WORKER).
 *
 * §19 forbids a stochastic C/D pilot and permits "deterministic/dummy readiness tests only". The riskiest
 * new machinery in R2-S is NOT the worker — it is the SIX-ITEM candidate set: three target items and three
 * distractor items installed through the real owners, associated through the real public API, and selected
 * together, so that the compile resolves exactly six handles and the harness's role map covers every one of
 * them. If any of that were wrong, a 20-trial matrix would burn twenty stochastic runs discovering it.
 *
 * So this script does the whole installation and compile DETERMINISTICALLY and asserts the facts the matrix
 * depends on:
 *
 *   · six items install (2 per kind: one target, one distractor) and all six associate with the project;
 *   · the compile resolves EXACTLY six handles, with no refusal;
 *   · the harness's handle→role map covers EVERY compiled handle, with three TARGET and three DISTRACTOR;
 *   · no handle carries a relevance-encoding name (§11);
 *   · the distractor bodies differ from the target bodies (the items are genuinely distinct);
 *   · the compiled ORDER is a pure function of the candidate set, so the S0/S1 pair within a block receives
 *     the same order.
 *
 * It runs for one representative block per scenario and never launches a model.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { candidateSetFor, bundleCapital } from './candidates.mjs';
import { CANDIDATE_SET_SIZE, KINDS, TARGET_COUNT, DISTRACTOR_COUNT, distractorSchedule } from './design.mjs';
import { SCENARIOS } from '../r2u/scenarios.mjs';

const REPO_ROOT = new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/u, '$1');
const RIG = join(homedir(), '.palimpsest-r2s', 'readiness-compile');
const NL = String.fromCharCode(10);

const results = [];
const check = (id, statement, pass, detail) => {
  results.push({ id, statement, pass, detail });
  process.stdout.write(`${pass ? 'PASS' : 'FAIL'}  ${id}  ${statement} — ${detail}${NL}`);
};

const proofModule = await import(pathToFileURL(`${REPO_ROOT}/dist/src/proof_asset/index.js`).href);
const reasoningModule = await import(pathToFileURL(`${REPO_ROOT}/dist/src/reasoning_cell/index.js`).href);
const workspaceModule = await import(pathToFileURL(`${REPO_ROOT}/dist/src/project_workspace/index.js`).href);
const proceduresModule = await import(pathToFileURL(`${REPO_ROOT}/dist/src/procedures/index.js`).href);
const memoryModule = await import(pathToFileURL(`${REPO_ROOT}/dist/src/organization_memory/index.js`).href);
const experimentModule = await import(pathToFileURL(`${REPO_ROOT}/dist/src/experiment/index.js`).href);
const advanced = await import(pathToFileURL(`${REPO_ROOT}/dist/src/advanced.js`).href);

const policyRef = (policyId) => ({ policyId, version: 'v1' });
const proofVerification = () => ({ policyRef: policyRef('r2s-verification'), async verify({ candidate }) { const supporting = candidate.supportingEvidence.map((entry) => entry.evidenceId); return { standing: supporting.length > 0 ? 'SUPPORTED' : 'INCONCLUSIVE', supportingEvidenceIds: supporting, contradictingEvidenceIds: [] }; } });
const proofAdmission = () => ({ policyRef: policyRef('r2s-publication'), async decide({ verification }) { return { decision: verification.standing === 'SUPPORTED' ? 'PUBLISH' : 'UNRESOLVED', provenanceDigest: verification.provenanceDigest }; } });
const reasoningVerification = () => ({
  async verify({ definition, candidate, frontierBasis }) { const base = { schemaVersion: 1, cell: candidate.cell, candidateDigest: candidate.candidateDigest, frontierBasis, verificationPolicyRef: definition.verificationPolicyRef, standing: 'SUPPORTED', supportingEvidenceIds: ['ev-1'], contradictingEvidenceIds: [], provenanceDigest: 'a'.repeat(64) }; return { ...base, digest: reasoningModule.reasoningVerificationDigestOf(base) }; },
  async verifyInvalidation({ definition, request, frontierBasis }) { const base = { schemaVersion: 1, cell: request.cell, candidateDigest: request.targetClaimId, frontierBasis, verificationPolicyRef: definition.verificationPolicyRef, standing: 'SUPPORTED', evidenceIds: ['ev-9'], provenanceDigest: 'b'.repeat(64) }; return { ...base, digest: reasoningModule.invalidationVerificationDigestOf(base) }; },
});
const reasoningAdmission = () => ({
  async admit({ definition, candidate, verification, frontierBasis }) { const base = { schemaVersion: 1, cell: candidate.cell, candidateDigest: candidate.candidateDigest, verificationResultDigest: verification.digest, frontierBasis, admissionPolicyRef: definition.admissionPolicyRef, decision: 'ADMIT', provenanceDigest: 'c'.repeat(64) }; return { ...base, digest: reasoningModule.reasoningAdmissionDigestOf(base) }; },
  async admitInvalidation({ definition, request, verification, frontierBasis }) { const base = { schemaVersion: 1, cell: request.cell, targetClaimId: request.targetClaimId, requestDigest: request.requestDigest, verificationResultDigest: verification.digest, frontierBasis, admissionPolicyRef: definition.admissionPolicyRef, decision: 'INVALIDATE', provenanceDigest: 'd'.repeat(64) }; return { ...base, digest: reasoningModule.invalidationAdmissionDigestOf(base) }; },
});

async function readinessFor(scenarioId, runLabel = 'a') {
  const scenario = SCENARIOS[scenarioId];
  const dir = join(RIG, `${scenarioId}-${runLabel}`);
  const PROJECT = join(dir, 'repo');
  const STATE = join(dir, 'state');
  /**
   * A UNIQUE DIRECTORY PER RUN, and deliberately no delete of a previous one: a prepared world carries a
   * DSH workspace write grant that sets an ACL this process cannot remove (measured: EPERM on `rmSync`,
   * which aborted the second readiness install). A fresh directory is also the honest fix — the second run
   * exists precisely to show the compile is reproducible from a clean state.
   */
  mkdirSync(join(PROJECT, 'src'), { recursive: true });
  mkdirSync(join(PROJECT, 'test'), { recursive: true });
  mkdirSync(STATE, { recursive: true });
  const { writeFileSync } = await import('node:fs');
  writeFileSync(join(PROJECT, 'src', 'x.js'), 'export const x = 1;\n', 'utf8');
  writeFileSync(join(PROJECT, 'test', 'check.js'), 'process.stdout.write("ok" + String.fromCharCode(10));\n', 'utf8');
  /**
   * §25: the fixture must be a REAL git repository with a commit, because the work-preparation path reads
   * the canonical mutation basis from `git status` — a bare directory makes preparation fail for a reason
   * that has nothing to do with the candidate set this script exists to check.
   */
  const { execFileSync } = await import('node:child_process');
  execFileSync('git', ['init', '-q'], { cwd: PROJECT });
  execFileSync('git', ['add', '-A'], { cwd: PROJECT });
  execFileSync('git', ['-c', 'user.email=t@t.t', '-c', 'user.name=t', 'commit', '-qm', 'H0'], { cwd: PROJECT });
  const headCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: PROJECT, encoding: 'utf8' }).trim();

  const distractorSet = distractorSchedule(scenarioId, 1)[0].set;
  const candidateSet = candidateSetFor(scenarioId, distractorSet);
  const bundlesToInstall = [...new Set([candidateSet.targetBundleId, ...candidateSet.distractorBundles])];

  const paths = {
    proof: join(STATE, 'proof.sqlite'), blobs: join(STATE, 'proof-blobs'), cells: join(STATE, 'cells.sqlite'),
    assoc: join(STATE, 'assoc.sqlite'), memory: join(STATE, 'memory.sqlite'), procedures: join(STATE, 'procedures.sqlite'),
    orchestration: join(STATE, 'orchestration.sqlite'), ordarium: join(STATE, 'ordarium.sqlite'),
  };
  const proofStore = new proofModule.SqliteProofEvidenceStore(paths.proof);
  const reasoningStore = new reasoningModule.SqliteReasoningCellStore(paths.cells);
  const assocStore = new workspaceModule.SqliteProjectAssetAssociationStore(paths.assoc);
  const memoryStore = new memoryModule.SqliteOrganizationMemoryStore(paths.memory);
  const procedureStore = new proceduresModule.SqliteProcedureStore(paths.procedures);

  const installed = advanced.installPalimpsest({ tools: { register: () => () => undefined } }, {
    projectId: scenario.projectId,
    databasePath: paths.orchestration,
    ordariumDatabasePath: paths.ordarium,
    repository: PROJECT,
    execution: 'worktree',
    standard: { statement: 'the acceptance oracle passes', clauses: [{ kind: 'scope_respected' }], derivedFrom: ['r2-s readiness'], confirmed: true, notes: [] },
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
    procedureAuthoring: {
      origin: 'r2u-teacher-exploration',
      async propose(input) {
        const objective = String(input?.projectContext?.objective ?? '');
        const bundleId = objective.startsWith('bundle:') ? objective.slice('bundle:'.length) : scenarioId;
        const bundle = bundleCapital(bundleId);
        return { outcome: 'proposal', content: { schemaVersion: 1, title: `${bundleId} method`, purpose: `apply the recorded method for ${bundle.domain}`, applicability: [bundle.domain], preconditions: ['the implementation and the oracle are readable'], steps: bundle.procedureClauses.map((clause) => ({ instruction: clause.instruction })), checks: [`the ${bundleId} ladder's failures are avoided`], expectedOutputs: ['the oracle reports PASS'], limitations: ['advisory guidance only; it cannot widen write scope or allowed commands'], capabilityHints: [], recommendedRecipeRefs: [] } };
      },
    },
    procedureAdmission: { policyRef: policyRef('r2s-admission'), async decide({ candidateDigest, validation }) { return { decision: 'PUBLISH', candidateDigest, rationale: `admitted (groundsResolved=${String(validation.groundsResolved)})`, policyRef: policyRef('r2s-admission') }; } },
  });

  installed.controller.start({ projectId: scenario.projectId, goal: scenario.projectGoal, headCommit, tasks: [{ task_id: 't1', objective: scenario.taskObjective, depends_on: [], write_paths: [scenario.sourceFile], required_artifacts: [] }] });

  const scenarioRef = memoryModule.materializeScenario({ scenarioId: 's1', scenarioRevision: 0, kind: 'S1_LOW_COUPLING', classification: 'SCRIPTED_MECHANICAL', task: scenario.taskObjective, successCriteria: ['PASS'], bounds: { maxWallClockMs: 1000, maxModelCalls: 0, maxRunsPerVariant: 2 } });
  const variantRef = memoryModule.materializeVariant({ variantId: 'v1', kind: 'SINGLE_LOCUS', description: 'ordering-first' });
  const experiment = memoryModule.materializeExperiment({ experimentId: 'exp-1', revision: 0, objective: 'ordering', scenarioRefs: [{ scenarioId: scenarioRef.scenarioId, scenarioRevision: 0, digest: scenarioRef.digest }], variantRefs: [{ variantId: variantRef.variantId, digest: variantRef.digest }], measurementPlan: { metricIds: ['quality'], primaryValidatorRef: 'v', objectives: ['quality'], objectiveNote: 'decision_aid_not_truth' }, runPolicy: { minRunsPerVariantPerScenario: 1, maxRuns: 2, maxWallClockMs: 1000, maxModelCalls: 0, maxAttemptsPerRun: 1, randomizeOrder: false, seed: 1 } });
  await installed.organizationMemory.recordExperiment(experiment);
  await installed.organizationMemory.recordScenario(experiment.experimentId, scenarioRef);
  await installed.organizationMemory.recordVariant(experiment.experimentId, variantRef);
  const run = experimentModule.buildRunResult({ spec: { experiment, scenario: scenarioRef, variant: variantRef, seed: 1, orderIndex: 1, warmup: false, attempt: 1 }, provenance: { provider: 'r2-s', model: 'deterministic', hostVersion: 'h', palimpsestSha: 's', ordariumVersion: 'o', profileDigest: 'p', repoShas: [], unknowns: [] }, execution: { outcome: 'PASS', failureClassification: 'NONE', measurements: [memoryModule.materializeMetric({ metricId: 'quality', unit: 'ratio', measurementClass: 'DIRECTLY_OBSERVED', state: 'known', value: 1, provenance: 'r2-s' })], validatorResults: [] }, startedAt: '2026-01-01T00:00:00.000Z', endedAt: '2026-01-01T00:00:01.000Z' });
  await installed.organizationMemory.recordRun(experiment.experimentId, run);
  const evaluation = experimentModule.evaluate({ experiment, scenarios: [scenarioRef], variants: [variantRef], runs: [run], corrections: [], annotations: [] });
  await installed.organizationMemory.recordEvaluation(experiment.experimentId, evaluation);

  const byBundle = {};
  for (const bundleId of bundlesToInstall) {
    const bundle = bundleCapital(bundleId);
    const proof = installed.proof;
    const imported = await proof.importSource({ bytes: new TextEncoder().encode(bundle.proof.statement), mediaType: 'text/plain', label: `${bundleId}-proof`, provenance: 'LOCAL_IMPORT', sourceId: `${bundleId}-proof` });
    const revRef = proofModule.materializeProofSourceRevisionRef({ sourceId: `${bundleId}-proof`, revision: imported.revision.revision, contentDigest: imported.revision.contentDigest });
    const evidence = await proof.recordEvidence({ sourceRevision: revRef, selector: { kind: 'WHOLE_SOURCE' } });
    const candidate = await proof.prepareCandidate({ claimType: proofModule.PROOF_STATEMENT_TYPE, content: { statement: bundle.proof.statement }, supportingEvidenceIds: [evidence.evidenceId], origin: 'MANUAL' });
    await proof.verify({ candidateId: candidate.candidateId });
    const published = await proof.decidePublication({ candidateId: candidate.candidateId });

    const cellId = `cell-${bundleId.toLowerCase()}`;
    const cells = installed.reasoningCells;
    await cells.service.openCell({ cellId, objective: bundle.reasoning.branchQuestion, verificationPolicyRef: policyRef('r2s-rv'), admissionPolicyRef: policyRef('r2s-ra') });
    const branch = await cells.service.openBranch({ cellId, question: bundle.reasoning.branchQuestion });
    const submitted = await cells.service.submitCandidate({ cellId, branchId: branch.branch.ref.branchId, type: reasoningModule.REASONING_STATEMENT_TYPE, content: { statement: bundle.reasoning.statement } });
    await cells.service.evaluateCandidate({ cellId, candidateDigest: submitted.candidate.candidateDigest });
    const frontier = await cells.service.frontier({ cellId });

    const prepared = await installed.procedures.prepare({ grounds: [{ kind: 'ORGANIZATION_EVALUATION', ref: evaluation.evaluationRef }], projectContext: { projectId: scenario.projectId, projectRevision: 1, projectDigest: '4'.repeat(64), objective: `bundle:${bundleId}` } });
    const procPub = await installed.procedures.publish({ procedureId: prepared.procedureId, candidate: prepared.candidate });
    if (procPub.status !== 'published') throw new Error(`publish for ${bundleId} answered ${procPub.status}`);

    const ws = installed.projectWorkspace;
    await ws.associateAsset({ projectId: scenario.projectId, assetKind: 'PROOF_CLAIM', canonicalRef: { kind: 'PROOF_CLAIM', id: published.claimId }, associationKind: 'MANUAL', provenance: 'r2-s' });
    await ws.associateAsset({ projectId: scenario.projectId, assetKind: 'REASONING_CELL', canonicalRef: { kind: 'REASONING_CELL', id: cellId }, associationKind: 'MANUAL', provenance: 'r2-s' });
    await ws.associateAsset({ projectId: scenario.projectId, assetKind: 'PROCEDURE', canonicalRef: { kind: 'PROCEDURE', id: `${procPub.ref.procedureId}@${procPub.ref.revision}`, digest: procPub.revision.digest }, associationKind: 'MANUAL', provenance: 'r2-s' });

    byBundle[bundleId] = { bundleId, proofClaimId: published.claimId, cellId, reasoningClaimId: frontier.claims[0]?.ref.claimId, procedureId: procPub.ref.procedureId, procedureRevision: procPub.ref.revision, proofStatement: bundle.proof.statement, reasoningStatement: bundle.reasoning.statement };
  }

  /** §10: the SAME selection both arms use, built exactly as the trial builds it. */
  const selection = {
    proof: candidateSet.items.filter((item) => item.kind === 'proof').map((item) => ({ claimId: byBundle[item.bundleId].proofClaimId })),
    reasoning: candidateSet.items.filter((item) => item.kind === 'reasoning').map((item) => ({ cellId: byBundle[item.bundleId].cellId, claimId: byBundle[item.bundleId].reasoningClaimId })),
    procedure: candidateSet.items.filter((item) => item.kind === 'procedure').map((item) => ({ procedureId: byBundle[item.bundleId].procedureId, revision: byBundle[item.bundleId].procedureRevision, reason: 'explicitly selected for this attempt' })),
  };

  const prepared = await installed.controller.prepareMutatingWork({ expectedTaskId: 't1' });
  const context = await installed.controller.workWorkerAttemptContext(prepared.attemptId, { knowledge: selection });
  const handles = (context?.compiled?.handles ?? []).map((entry) => entry.handle);

  await installed.dispose().catch(() => undefined);
  procedureStore.close();

  return { scenarioId, candidateSet, byBundle, handles, selection, prepared };
}

async function main() {
  rmSync(RIG, { recursive: true, force: true });
  mkdirSync(RIG, { recursive: true });
  for (const scenarioId of ['C', 'D']) {
    process.stdout.write(`${NL}--- scenario ${scenarioId}: the six-item install and compile ---${NL}`);
    const run = await readinessFor(scenarioId);

    check(`SC-01${scenarioId}`, `§6 the ${scenarioId} compile resolves EXACTLY ${String(CANDIDATE_SET_SIZE)} handles`, run.handles.length === CANDIDATE_SET_SIZE, `${String(run.handles.length)} handle(s): ${run.handles.join(', ')}`);

    /** §6: the role map the trial uses, reconstructed exactly as the trial reconstructs it. */
    const target = run.byBundle[run.candidateSet.targetBundleId];
    const roleByCanonical = {
      [`@ctx/proof/${target.proofClaimId}`]: 'TARGET',
      [`@ctx/reasoning/${target.cellId}/${target.reasoningClaimId}`]: 'TARGET',
      [`@ctx/procedure/${target.procedureId}/${String(target.procedureRevision)}`]: 'TARGET',
    };
    for (const bundleId of run.candidateSet.distractorBundles) {
      const bundle = run.byBundle[bundleId];
      roleByCanonical[`@ctx/proof/${bundle.proofClaimId}`] = 'DISTRACTOR';
      roleByCanonical[`@ctx/reasoning/${bundle.cellId}/${bundle.reasoningClaimId}`] = 'DISTRACTOR';
      roleByCanonical[`@ctx/procedure/${bundle.procedureId}/${String(bundle.procedureRevision)}`] = 'DISTRACTOR';
    }
    const roles = run.handles.map((handle) => roleByCanonical[handle] ?? 'UNKNOWN');
    check(`SC-02${scenarioId}`, `§6 the role map covers EVERY ${scenarioId} compiled handle`, roles.every((role) => role !== 'UNKNOWN'), roles.map((role, index) => `${String(index + 1)}:${role}`).join(' '));
    check(`SC-03${scenarioId}`, `§6 the ${scenarioId} candidate set is ${String(TARGET_COUNT)} TARGET + ${String(DISTRACTOR_COUNT)} DISTRACTOR in the compiled order`, roles.filter((role) => role === 'TARGET').length === TARGET_COUNT && roles.filter((role) => role === 'DISTRACTOR').length === DISTRACTOR_COUNT, `target at ${roles.map((role, index) => (role === 'TARGET' ? String(index + 1) : null)).filter(Boolean).join(',')}; distractor at ${roles.map((role, index) => (role === 'DISTRACTOR' ? String(index + 1) : null)).filter(Boolean).join(',')}`);

    /** §11: no handle may encode relevance in its NAME — the role must come from minted identity only. */
    const encoding = run.handles.filter((handle) => /(target|distract|relevant|important|useful)/iu.test(handle));
    check(`SC-04${scenarioId}`, `§11 no ${scenarioId} handle name encodes relevance`, encoding.length === 0, encoding.length === 0 ? 'every handle is an opaque canonical identity' : encoding.join(', '));

    /** §6: the distractor bodies really differ from the target's — the items are distinct content. */
    const targetStatements = [target.proofStatement, target.reasoningStatement];
    const distractorStatements = run.candidateSet.distractorBundles.flatMap((bundleId) => [run.byBundle[bundleId].proofStatement, run.byBundle[bundleId].reasoningStatement]);
    check(`SC-05${scenarioId}`, `§6 every ${scenarioId} distractor body differs from every target body`, distractorStatements.every((statement) => !targetStatements.includes(statement)), `${String(distractorStatements.length)} distractor statements vs ${String(targetStatements.length)} target statements`);

    /** §11: the compiled order is a pure function of the candidate set, so the S0/S1 pair matches. */
    const prepared2 = await (async () => {
      const again = await readinessFor(scenarioId, 'b');
      return again.handles;
    })();
    check(`SC-06${scenarioId}`, `§11 the ${scenarioId} compiled order is DETERMINISTIC for the same candidate set`, run.handles.join('|') === prepared2.join('|'), run.handles.join('|') === prepared2.join('|') ? 'identical across two independent installs' : `DIFFERS: ${run.handles.join(',')} vs ${prepared2.join(',')}`);
  }

  const failed = results.filter((entry) => !entry.pass);
  const { writeFileSync } = await import('node:fs');
  writeFileSync(join(RIG, 'compile-readiness.json'), `${JSON.stringify({ schemaVersion: 1, stage: 'R2-S', gate: 'compile-readiness', deterministicOnly: true, results }, null, 2)}${NL}`, 'utf8');
  process.stdout.write(`${NL}§R2-S COMPILE READINESS: ${failed.length === 0 ? 'GREEN' : 'RED'} — ${String(results.length - failed.length)}/${String(results.length)}${NL}`);
  process.exit(failed.length === 0 ? 0 : 1);
}

await main();
