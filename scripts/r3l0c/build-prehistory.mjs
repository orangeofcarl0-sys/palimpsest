/**
 * R3-L0C §7 — THE DETERMINISTIC PREHISTORY.
 *
 * §7 requires ONE prehistory, shared SEMANTICALLY across all arms, establishing the project world, the
 * Work/Attempt/Result history, verified and promoted outcomes, the incident and decision history, the capital
 * assets and the ProjectAssetAssociations. Both arms must contain IDENTICAL capital-plane canonical assets and
 * associations, because the treatment is SELECTION_ONLY.
 *
 * WHY THE PREHISTORY IS BUILT BY ORDINARY PALIMPSEST rather than assembled as a fixture. §7 asks for a project
 * with a PAST, and the only honest way to get one is to run the real governed path: a real project start, real
 * attempts, real verification, real promotions. A fixture that asserted it had history would make the project's
 * own continuity untested, and continuity is exactly what the reconstruction experiment depends on.
 *
 * THE PREHISTORY DOES NOT SOLVE THE INVARIANTS. It establishes the Project — world, history, requirements,
 * incidents — and admits the CURRENT-STANDING capital. It does not implement `resolveEntitlement` or
 * `revokeEntitlement`, because that is what a generation is for. The H0 source is the naive implementation, so a
 * generation starts from a project that works on the ordinary path and is wrong on the project-specific one.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { REPO_ROOT } from './contract.mjs';
import { corpusFiles } from './corpus.mjs';
import { H0_SOURCE, worldFiles } from './project.mjs';
import { sha256 } from './capital.mjs';

const NL = String.fromCharCode(10);
export const DIST = join(REPO_ROOT, 'dist', 'src');
const load = async (relative) => await import(pathToFileURL(join(DIST, relative)).href);
const git = (cwd, args) => execFileSync('git', [...args], { cwd, encoding: 'utf8' }).trim();

/** §7: write the project world and commit it as H0. */
export function writeProjectWorld(dir, corpus = corpusFiles()) {
  const files = worldFiles(corpus);
  for (const [relative, content] of Object.entries(files)) {
    const target = join(dir, relative);
    mkdirSync(join(target, '..'), { recursive: true });
    writeFileSync(target, content, 'utf8');
  }
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['add', '-A'], { cwd: dir });
  execFileSync('git', ['-c', 'user.email=t@t.t', '-c', 'user.name=t', 'commit', '-qm', 'H0'], { cwd: dir });
  return git(dir, ['rev-parse', 'HEAD']);
}

/** §7: the world's digest, so both arms can be proven to start from identical bytes. */
export function worldDigest(corpus = corpusFiles()) {
  const files = worldFiles(corpus);
  return sha256(Object.entries(files).sort(([left], [right]) => (left < right ? -1 : 1)).map(([path, content]) => `${path}:${sha256(content)}`).join(NL));
}

/**
 * §7: THE PROJECT'S OWN HISTORY DOCUMENTS.
 *
 * These are the two resolved incidents the Project already carries, written into the world as `docs/`. They are
 * ORDINARY PROJECT HISTORY, which R3-L0B established is the CONTROL CONDITION rather than leakage: a real
 * project keeps its incident records, and both arms receive them.
 */
export const PREHISTORY_INCIDENT_CUTOVER = [
  '# Incident — a migrated tenant was misclassified by its onboarding date',
  '',
  'The service classified a tenant as legacy by its ONBOARDING date. A tenant onboarded in 2022 was migrated onto',
  'the new engine in 2024, and the onboarding date still said "legacy", so a decision the NEW engine recorded was',
  'evaluated by the legacy rule.',
  '',
  '**Resolution:** the classification key became the tenant\'s own `cutoverDate`, and the comparison became the',
  'DECISION\'s date against that cutover date. The full history is in `docs/history/`.',
  '',
].join(NL);

export const PREHISTORY_INCIDENT_ALIAS = [
  '# Incident — revoking an alias left the consolidated access in place',
  '',
  'Three legacy capabilities were consolidated into one, and the legacy names became aliases of it. A revocation',
  'named an alias, removed that record, and the tenant kept access because a consolidated record was still there.',
  '',
  '**Resolution:** the CAPABILITY became the unit of access rather than the named record. The full history is in',
  '`docs/history/`.',
  '',
].join(NL);

/**
 * §7: BUILD THE PREHISTORY.
 *
 * The world is written, the project is STARTED through ordinary Palimpsest, and two resolved incidents are
 * recorded through the ORDINARY governed path — plan, attempt, settle, gate, promote, reconcile — so the project
 * carries real Work/Attempt/Result history rather than an empty ledger.
 */
export async function buildPrehistory(root, projectId = 'cutover-entitlements') {
  const world = join(root, 'world');
  const head = writeProjectWorld(world, corpusFiles());
  /** §7: the resolved incidents are ordinary project history, written as a commit rather than a fixture. */
  mkdirSync(join(world, 'docs'), { recursive: true });
  writeFileSync(join(world, 'docs', 'incident-cutover.md'), PREHISTORY_INCIDENT_CUTOVER, 'utf8');
  writeFileSync(join(world, 'docs', 'incident-alias.md'), PREHISTORY_INCIDENT_ALIAS, 'utf8');
  execFileSync('git', ['add', '-A'], { cwd: world });
  execFileSync('git', ['-c', 'user.email=t@t.t', '-c', 'user.name=t', 'commit', '-qm', 'record the two resolved incidents'], { cwd: world });

  const state = join(root, 'state');
  mkdirSync(state, { recursive: true });
  const paths = Object.freeze({
    state,
    orchestration: join(state, 'orchestration.sqlite'),
    ordarium: join(state, 'ordarium.sqlite'),
    association: join(state, 'assoc.sqlite'),
    journal: join(state, 'journal.sqlite'),
    proof: join(state, 'proof.sqlite'),
    proofBlobs: join(state, 'proof-blobs'),
    cells: join(state, 'cells.sqlite'),
    procedures: join(state, 'procedures.sqlite'),
  });

  const advanced = await load('advanced.js');
  const workspaceModule = await load('project_workspace/index.js');
  const proofModule = await load('proof_asset/index.js');
  const reasoningModule = await load('reasoning_cell/index.js');
  const proceduresModule = await load('procedures/index.js');
  const memoryModule = await load('organization_memory/index.js');
  const delegation = await load('interaction/work_delegation.js');

  /** §8: the deterministic policy ports, so the prehistory's own history is admitted without a model. */
  const { capitalPolicyPorts } = await import('./capital-ports.mjs');
  const policyPorts = capitalPolicyPorts(reasoningModule);

  const memoryStore = new memoryModule.SqliteOrganizationMemoryStore(join(state, 'memory.sqlite'));
  const procedureStore = new proceduresModule.SqliteProcedureStore(paths.procedures);

  const installed = advanced.installPalimpsest(
    { tools: { register: () => () => undefined } },
    {
      projectId,
      databasePath: paths.orchestration,
      ordariumDatabasePath: paths.ordarium,
      repository: world,
      execution: 'worktree',
      standard: { statement: 'the visible oracle passes', clauses: [{ kind: 'scope_respected' }], derivedFrom: ['r3l0c prehistory'], confirmed: true, notes: [] },
      policy: advanced.trustedDefaultPolicy({ read_paths: ['src', 'test', 'README.md', 'docs'], allowed_commands: [{ executable: 'node', argv_prefix: ['test/check.js'] }] }),
      projectAssociationStore: new workspaceModule.SqliteProjectAssetAssociationStore(paths.association),
      projectJournalStore: new workspaceModule.SqliteProjectJournalStore(paths.journal),
      proofEvidenceStore: new proofModule.SqliteProofEvidenceStore(paths.proof),
      proofBlobStore: proofModule.localProofBlobStore(paths.proofBlobs),
      reasoningCellStore: new reasoningModule.SqliteReasoningCellStore(paths.cells),
      reasoningCellStoreOwned: false,
      proofVerificationPolicy: policyPorts.proofVerification,
      proofPublicationAdmission: policyPorts.proofAdmission,
      reasoningVerificationPolicy: policyPorts.reasoningVerification,
      reasoningAdmissionPolicy: policyPorts.reasoningAdmission,
      organizationMemoryStore: memoryStore,
      procedureStore,
      procedureAuthoring: { origin: 'r3l0c-prehistory', async propose() { return { outcome: 'NO_PROCEDURE' }; } },
      procedureAdmission: {
        policyRef: { policyId: 'r3l0c-prehistory', version: '1' },
        async decide({ candidateDigest }) {
          return { decision: 'UNRESOLVED', candidateDigest, rationale: 'the prehistory authors no procedure', policyRef: { policyId: 'r3l0c-prehistory', version: '1' } };
        },
      },
    },
  );
  const controller = installed.controller;

  /** §7: the project is STARTED, so the durable store has a project rather than an empty database. */
  const startingHead = git(world, ['rev-parse', 'HEAD']);
  controller.start({
    projectId,
    goal: 'keep tenant entitlements correct across the legacy cutover',
    headCommit: startingHead,
    requirements: [
      { requirement_id: 'P0', statement: 'the service must answer whether a tenant holds a capability as of a date', priority: 'critical', acceptance_refs: [] },
    ],
    tasks: [],
  });

  /**
   * §7: THE ORDINARY WORK HISTORY. One resolved incident is committed through the governed path — a real attempt,
   * a real gate, a real promotion and a real head reconciliation — so the project carries Work history rather
   * than only a start event.
   */
  const settle = async (taskId, file, text, requirementId, statement) => {
    const project = controller.work.project();
    controller.plan({
      goal: project.goal,
      requirements: [...project.requirements, { requirement_id: requirementId, statement, priority: 'critical', acceptance_refs: [] }],
      decisions: project.decisions,
      tasks: [
        ...project.tasks.map((task) => ({ ...task, depends_on: [...task.depends_on], write_paths: [...task.write_paths], required_artifacts: [...task.required_artifacts] })),
        { task_id: taskId, objective: `record ${taskId}`, depends_on: [], write_paths: [file], required_artifacts: [] },
      ],
      reason: `prehistory ${taskId}`,
    });
    for (let index = 0; index < 24; index += 1) {
      const preview = controller.preview();
      if (preview.decision !== 'next' || preview.eventType !== 'TASK_READY') break;
      controller.step();
    }
    const states = controller.work.taskStates();
    const target = states.find((task) => task.state === 'READY')?.taskId ?? states.find((task) => task.state === 'ACTIVE')?.taskId ?? taskId;
    const service = delegation.makeWorkDelegationService({
      controller,
      workerFor: () => ({
        adapterId: `r3l0c-prehistory-${taskId}`,
        async run({ workDir }) {
          writeFileSync(join(workDir, file), text, 'utf8');
          execFileSync('git', ['add', '-A'], { cwd: workDir });
          execFileSync('git', ['-c', 'user.email=t@t.t', '-c', 'user.name=t', 'commit', '-qm', `prehistory ${taskId}`], { cwd: workDir });
          return { kind: 'READY_FOR_SETTLEMENT', detail: 'prehistory work' };
        },
      }),
    });
    const started = await service.start({ expectedTaskId: target });
    let view = await service.followup({ jobId: started.jobId });
    for (let index = 0; index < 600 && (view.phase === 'QUEUED' || view.phase === 'RUNNING'); index += 1) {
      await new Promise((resolve) => setTimeout(resolve, 25));
      view = await service.followup({ jobId: started.jobId });
    }
    const attemptId = 'attemptId' in view ? view.attemptId : null;
    if (attemptId === null) throw new Error(`prehistory ${taskId}: no attempt`);
    for (let index = 0; index < 12; index += 1) {
      const preview = controller.preview();
      if (preview.decision !== 'next') break;
      controller.step();
    }
    await controller.gate({ attemptId, predicate: 'tests_pass', command: ['node', 'test/check.js'] });
    for (let index = 0; index < 12; index += 1) {
      const preview = controller.preview();
      if (preview.decision !== 'next') break;
      controller.step();
    }
    const record = controller.attemptWorkRecord(attemptId);
    const eligibility = controller.promotionEligibility(attemptId);
    let promoted = false;
    if (eligibility.eligible && record?.report !== null && record?.report !== undefined) {
      await controller.promote(attemptId, String(record.report.result_commit), eligibility.canonicalExpectedHead);
      controller.step();
      promoted = true;
    }
    await controller.reconcileProjectHead({ operator: true });
    return Object.freeze({ taskId, target, attemptId, attemptState: record?.state ?? null, eligible: eligibility.eligible, promoted, finalHead: git(world, ['rev-parse', 'HEAD']) });
  };

  const incidentCutover = await settle('incident-cutover', 'docs/incident-cutover-resolved.md', PREHISTORY_INCIDENT_CUTOVER, 'P1', 'a migrated tenant must be classified by its cutover date, not its onboarding date');
  const incidentAlias = await settle('incident-alias', 'docs/incident-alias-resolved.md', PREHISTORY_INCIDENT_ALIAS, 'P2', 'a consolidated capability must be the unit of access, not the named record');

  const project = controller.work.project();
  const record = Object.freeze({
    kind: 'Prehistory',
    projectId,
    head: git(world, ['rev-parse', 'HEAD']),
    revision: project.revision,
    requirementIds: project.requirements.map((entry) => entry.requirement_id),
    taskStates: controller.work.taskStates(),
    incidents: Object.freeze([incidentCutover, incidentAlias]),
    worldDigest: worldDigest(),
    /** §7: the world and state paths both arms inherit. */
    world,
    state,
    paths,
  });
  await installed.dispose().catch(() => undefined);
  procedureStore.close();
  return record;
}

export { H0_SOURCE, NL, load, git };
