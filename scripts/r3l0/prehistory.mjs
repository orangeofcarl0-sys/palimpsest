#!/usr/bin/env node
/**
 * R3-L0 §5/§6/§7/§12 — THE PARENT-SIDE PREHISTORY, CAPITAL ADMISSION AND TRAJECTORY DRIVER.
 *
 * This module owns everything that happens OUTSIDE a worker generation:
 *
 *   §5   build the deterministic prehistory, so both arms start from the SAME paid-for history;
 *   §6   admit the frozen capital bundle through the EXISTING owners, deriving it from that prehistory;
 *   §7   run a trajectory: N generations, each in a fresh child process, the arm differing only in selection;
 *   §12  never reset a generation — G(n+1) starts from what G(n) actually promoted.
 *
 * WHY THE PREHISTORY IS BUILT BY ORDINARY PALIMPSEST. §5 requires both arms to receive semantically equivalent
 * project world/code, Work history, Attempt/Result history, verification, promotions, intent and receipts. The
 * cheapest way to get something honest is to RUN ordinary Palimpsest against the project's own history — so the
 * prehistory is a real project with real promotions, not a fixture that asserts it has a past.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { GENERATIONS, LEDGER_ERRORS, LEDGER_PLANS, PREHISTORY_INCIDENT_1, PREHISTORY_INCIDENT_2, PREHISTORY_PRIOR_ART } from './project.mjs';
import { CAPITAL_BODIES, PREHISTORY_SOURCES, REASONING_FRAMES, bundleDigest, frozenBundle } from './capital.mjs';
import { CHILD_PROGRAM, TEE_PATH, sha256, trajectoryPaths, writeProjectWorld } from './trajectory.mjs';

const REPO_ROOT = new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/u, '$1');
const DIST = join(REPO_ROOT, 'dist', 'src');
const NL = String.fromCharCode(10);
const load = async (relative) => await import(pathToFileURL(join(DIST, relative)).href);
const git = (cwd, args) => execFileSync('git', [...args], { cwd, encoding: 'utf8' }).trim();

/* ================================================================ §5 the prehistory source */

/**
 * §5: THE PREHISTORY WORLD.
 *
 * The project at prehistory is the PRIOR-ART surface: `applyChanges` and `recomputeIndex` already exist and are
 * already CORRECT, with the two incidents recorded in `docs/`. The ledger APIs the generations will extend are
 * present in their H0 (mistaken) form, because the generations' job is to fix them.
 *
 * This is what "the project already paid for L1 and L2" means concretely: the fixes are in the tree, the
 * incidents are in the docs, and a worker that reads the project can in principle carry the obligation across.
 */
export const PREHISTORY_LEDGER_SOURCE = [
  '/**',
  ' * entitlement-ledger — the ledger API.',
  ' *',
  ' * See README.md for the contract. `plans.mjs` holds the plan catalogue and `errors.mjs` the error type.',
  ' *',
  ' * `docs/incident-1.md` and `docs/incident-2.md` record the two incidents this project already resolved.',
  ' */',
  'import { PLANS } from "./plans.mjs";',
  'import { LedgerError } from "./errors.mjs";',
  '',
  PREHISTORY_PRIOR_ART,
  '/**',
  ' * applyBatch — apply a batch of operations to the caller\'s ledger.',
  ' *',
  ' * @param {object} ledger the CALLER\'S ledger; the caller keeps using the same object',
  ' * @param {{ id: string, operations: ReadonlyArray<{ kind: string, tenantId: string, capability: string }> }} batch',
  ' * @returns the ledger',
  ' */',
  'export function applyBatch(ledger, batch) {',
  '  for (const operation of batch.operations) {',
  '    const tenant = ledger.tenants[operation.tenantId];',
  '    if (operation.kind === "grant") {',
  '      tenant.overrides[operation.capability] = true;',
  '    } else {',
  '      tenant.overrides[operation.capability] = false;',
  '    }',
  '  }',
  '  ledger.applied[batch.id] = true;',
  '  return ledger;',
  '}',
  '',
  '/**',
  ' * revokeCapability — withdraw a capability from a tenant.',
  ' */',
  'export function revokeCapability(ledger, tenantId, capability) {',
  '  for (const grantId of Object.keys(ledger.grants)) {',
  '    const grant = ledger.grants[grantId];',
  '    if (grant.tenantId === tenantId && grant.capability === capability) {',
  '      delete ledger.grants[grantId];',
  '    }',
  '  }',
  '  return ledger;',
  '}',
  '',
  '/**',
  ' * migratePlan — move a tenant onto another plan.',
  ' */',
  'export function migratePlan(ledger, tenantId, newPlan) {',
  '  ledger.tenants[tenantId].plan = newPlan;',
  '  ledger.tenants[tenantId].overrides = {};',
  '  return ledger;',
  '}',
  '',
].join('\n');

/* ================================================================ §5 build the prehistory */

/**
 * §5: BUILD THE PREHISTORY.
 *
 * Both arms receive the SAME prehistory bytes. The prehistory is created ONCE and then COPIED per trajectory, so
 * the arms cannot diverge by construction rather than by assertion.
 */
export async function buildPrehistory(root) {
  const dir = join(root, 'prehistory-repo');
  const head = writeProjectWorld(dir, PREHISTORY_LEDGER_SOURCE);
  const paths = trajectoryPaths(join(root, 'prehistory-state'));
  const advanced = await load('advanced.js');
  const workspaceModule = await load('project_workspace/index.js');

  const projectId = 'entitlement-ledger';
  const installed = advanced.installPalimpsest(
    { tools: { register: () => () => undefined } },
    {
      projectId,
      databasePath: paths.orchestration,
      ordariumDatabasePath: paths.ordarium,
      repository: dir,
      execution: 'worktree',
      standard: { statement: 'the visible oracle passes', clauses: [{ kind: 'scope_respected' }], derivedFrom: ['r3l0 prehistory'], confirmed: true, notes: [] },
      policy: advanced.trustedDefaultPolicy({
        read_paths: ['src', 'test', 'README.md', 'docs'],
        allowed_commands: [{ executable: 'node', argv_prefix: ['-e', 'process.exit(0)'] }],
      }),
      projectAssociationStore: new workspaceModule.SqliteProjectAssetAssociationStore(paths.association),
      projectJournalStore: new workspaceModule.SqliteProjectJournalStore(paths.journal),
    },
  );

  /**
   * §5: THE ORDINARY WORK HISTORY. Two completed attempts — one per incident — are declared, run through the
   * governed path and PROMOTED, so the project has real Attempt/Result/Verification/Promotion history and a real
   * intent revision rather than an empty ledger.
   */
  const { delegation } = { delegation: await load('interaction/work_delegation.js') };
  const commitAndSettle = async (taskId, file, text, requirement) => {
    const project = installed.controller.work.project();
    installed.controller.plan({
      goal: project.goal,
      requirements: [...project.requirements, requirement],
      decisions: project.decisions,
      tasks: [
        ...project.tasks.map((task) => ({ ...task, depends_on: [...task.depends_on], write_paths: [...task.write_paths], required_artifacts: [...task.required_artifacts] })),
        { task_id: taskId, objective: `resolve ${taskId}`, depends_on: [], write_paths: [file], required_artifacts: [] },
      ],
      reason: `prehistory ${taskId}`,
    });
    for (let index = 0; index < 24; index += 1) {
      const preview = installed.controller.preview();
      if (preview.decision !== 'next' || preview.eventType !== 'TASK_READY') break;
      installed.controller.step();
    }
    const states = installed.controller.work.taskStates();
    const target = states.find((task) => task.state === 'READY')?.taskId ?? states.find((task) => task.state === 'ACTIVE')?.taskId ?? taskId;
    const service = delegation.makeWorkDelegationService({
      controller: installed.controller,
      workerFor: () => ({
        adapterId: `r3l0-prehistory-${taskId}`,
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
      const preview = installed.controller.preview();
      if (preview.decision !== 'next') break;
      installed.controller.step();
    }
    await installed.controller.gate({ attemptId, predicate: 'tests_pass', command: ['node', '-e', 'process.exit(0)'] });
    for (let index = 0; index < 12; index += 1) {
      const preview = installed.controller.preview();
      if (preview.decision !== 'next') break;
      installed.controller.step();
    }
    const record = installed.controller.attemptWorkRecord(attemptId);
    const eligibility = installed.controller.promotionEligibility(attemptId);
    let promoted = false;
    if (eligibility.eligible && record?.report !== null && record?.report !== undefined) {
      await installed.controller.promote(attemptId, String(record.report.result_commit), eligibility.canonicalExpectedHead);
      installed.controller.step();
      promoted = true;
    }
    await installed.controller.reconcileProjectHead({ operator: true });
    return { taskId, target, attemptId, attemptState: record?.state ?? null, eligible: eligibility.eligible, promoted, finalHead: git(dir, ['rev-parse', 'HEAD']) };
  };

  installed.controller.start({
    projectId,
    goal: 'keep the entitlement ledger correct as plans and grants change',
    headCommit: head,
    requirements: [{ requirement_id: 'P0', statement: 'the ledger must refuse an unusable request and leave the caller\'s state unchanged', priority: 'critical', acceptance_refs: [] }],
    tasks: [],
  });

  const incident1 = await commitAndSettle('incident-1', 'docs/incident-1-resolved.md', PREHISTORY_INCIDENT_1, {
    requirement_id: 'P1', statement: 'applyChanges must validate the complete change set before the first write', priority: 'critical', acceptance_refs: [],
  });
  const incident2 = await commitAndSettle('incident-2', 'docs/incident-2-resolved.md', PREHISTORY_INCIDENT_2, {
    requirement_id: 'P2', statement: 'recomputeIndex must compute the complete affected set while the edges still exist', priority: 'critical', acceptance_refs: [],
  });

  const project = installed.controller.work.project();
  const record = {
    kind: 'Prehistory',
    projectId,
    head: git(dir, ['rev-parse', 'HEAD']),
    revision: project.revision,
    requirementIds: project.requirements.map((entry) => entry.requirement_id),
    taskStates: installed.controller.work.taskStates(),
    incidents: [incident1, incident2],
    /** §5: the world bytes both arms will receive. */
    worldDigest: sha256([PREHISTORY_LEDGER_SOURCE, LEDGER_PLANS, LEDGER_ERRORS, PREHISTORY_INCIDENT_1, PREHISTORY_INCIDENT_2].join(NL)),
  };
  await installed.dispose().catch(() => undefined);
  return Object.freeze(record);
}

/* ================================================================ §6 admit the frozen capital */

/**
 * §6: ADMIT THE FROZEN CAPITAL BUNDLE THROUGH THE EXISTING OWNERS.
 *
 * Per lesson the bundle becomes:
 *
 *   Proof            the historical evidence binding — the incident's own statement, imported as a source and
 *                    published as a claim;
 *   ReasoningClaim   the mechanism explanation, submitted to a reasoning cell and admitted;
 *   Procedure        the reusable method, grounded in an INTERVENTION RECORD that names the incident as its
 *                    empirical basis, authored, and admitted.
 *
 * §6 forbids writing an answer to a future hidden diagnostic case: the bodies are the frozen general lessons,
 * and `futureOracleLeakage` is asserted leak-free before admission.
 *
 * §6 also requires the capital to be ASSOCIATED with the project, because association — not admission — is what
 * makes it selectable. The association is created here, in the PREHISTORY's store, so every trajectory inherits
 * it.
 */
/**
 * §6: THE POLICY PORTS the owners require.
 *
 * These are DETERMINISTIC fixtures, not model judgement. Each is an INDEPENDENT verification/admission seam, and
 * each echoes the digest it decided on so the owner can refuse a decision that does not bind to the artifact it
 * was asked about. They are the same shapes the existing E1-K/E5-P gates use.
 */
function capitalPolicyPorts(reasoningModule) {
  const policyRef = (policyId) => ({ policyId, version: '1' });
  return Object.freeze({
    proofVerification: {
      policyRef: policyRef('r3l0-proof-verification'),
      async verify({ candidate }) {
        const supporting = candidate.supportingEvidence.map((entry) => entry.evidenceId);
        const contradicting = candidate.contradictingEvidence.map((entry) => entry.evidenceId);
        return {
          standing: supporting.length > 0 && contradicting.length === 0 ? 'SUPPORTED' : 'INCONCLUSIVE',
          supportingEvidenceIds: supporting,
          contradictingEvidenceIds: contradicting,
        };
      },
    },
    proofAdmission: {
      policyRef: policyRef('r3l0-proof-publication'),
      async decide({ verification }) {
        return {
          decision: verification.standing === 'SUPPORTED' || verification.standing === 'PARTIALLY_SUPPORTED' ? 'PUBLISH' : 'UNRESOLVED',
          provenanceDigest: verification.provenanceDigest,
        };
      },
    },
    reasoningVerification: {
      async verify({ definition, candidate, frontierBasis }) {
        const base = {
          schemaVersion: 1, cell: candidate.cell, candidateDigest: candidate.candidateDigest, frontierBasis,
          verificationPolicyRef: definition.verificationPolicyRef, standing: 'SUPPORTED',
          supportingEvidenceIds: ['ev-1'], contradictingEvidenceIds: [], provenanceDigest: 'a'.repeat(64),
        };
        return { ...base, digest: reasoningModule.reasoningVerificationDigestOf(base) };
      },
      async verifyInvalidation({ definition, request, frontierBasis }) {
        const base = {
          schemaVersion: 1, cell: request.cell, targetClaimId: request.targetClaimId, requestDigest: request.requestDigest,
          frontierBasis, verificationPolicyRef: definition.verificationPolicyRef, standing: 'SUPPORTED',
          evidenceIds: ['ev-9'], provenanceDigest: 'b'.repeat(64),
        };
        return { ...base, digest: reasoningModule.invalidationVerificationDigestOf(base) };
      },
    },
    reasoningAdmission: {
      async admit({ definition, candidate, verification, frontierBasis }) {
        const base = {
          schemaVersion: 1, cell: candidate.cell, candidateDigest: candidate.candidateDigest,
          verificationResultDigest: verification.digest, frontierBasis,
          admissionPolicyRef: definition.admissionPolicyRef, decision: 'ADMIT', provenanceDigest: 'c'.repeat(64),
        };
        return { ...base, digest: reasoningModule.reasoningAdmissionDigestOf(base) };
      },
      async admitInvalidation({ definition, request, verification, frontierBasis }) {
        const base = {
          schemaVersion: 1, cell: request.cell, targetClaimId: request.targetClaimId, requestDigest: request.requestDigest,
          verificationResultDigest: verification.digest, frontierBasis,
          admissionPolicyRef: definition.admissionPolicyRef, decision: 'ADMIT', provenanceDigest: 'd'.repeat(64),
        };
        return { ...base, digest: reasoningModule.invalidationAdmissionDigestOf(base) };
      },
    },
  });
}

export async function admitCapital(root, paths, projectId, repo) {
  const advanced = await load('advanced.js');
  const workspaceModule = await load('project_workspace/index.js');
  const proofModule = await load('proof_asset/index.js');
  const reasoningModule = await load('reasoning_cell/index.js');
  const proceduresModule = await load('procedures/index.js');
  const memoryModule = await load('organization_memory/index.js');

  const policyPorts = capitalPolicyPorts(reasoningModule);
  /** §6: which lesson's body the authoring seam is currently authoring. Set per lesson, never after trial 1. */
  const authoringScript = { lesson: 'L1' };
  const memoryStore = new memoryModule.SqliteOrganizationMemoryStore(join(paths.state, 'memory.sqlite'));
  const procedureStore = new proceduresModule.SqliteProcedureStore(paths.procedures);
  const installed = advanced.installPalimpsest(
    { tools: { register: () => () => undefined } },
    {
      projectId,
      databasePath: paths.orchestration,
      ordariumDatabasePath: paths.ordarium,
      repository: repo,
      execution: 'worktree',
      standard: { statement: 'the visible oracle passes', clauses: [{ kind: 'scope_respected' }], derivedFrom: ['r3l0 capital'], confirmed: true, notes: [] },
      policy: advanced.trustedDefaultPolicy({ read_paths: ['src', 'test', 'README.md', 'docs'], allowed_commands: [{ executable: 'node', argv_prefix: ['-e', 'process.exit(0)'] }] }),
      projectAssociationStore: new workspaceModule.SqliteProjectAssetAssociationStore(paths.association),
      projectJournalStore: new workspaceModule.SqliteProjectJournalStore(paths.journal),
      proofEvidenceStore: new proofModule.SqliteProofEvidenceStore(paths.proof),
      proofBlobStore: proofModule.localProofBlobStore(paths.proofBlobs),
      reasoningCellStore: new reasoningModule.SqliteReasoningCellStore(paths.cells),
      reasoningCellStoreOwned: false,
      /** §6: the independent verification/admission seams the capital owners require. */
      proofVerificationPolicy: policyPorts.proofVerification,
      proofPublicationAdmission: policyPorts.proofAdmission,
      reasoningVerificationPolicy: policyPorts.reasoningVerification,
      reasoningAdmissionPolicy: policyPorts.reasoningAdmission,
      organizationMemoryStore: memoryStore,
      procedureStore,
      /**
       * §6: the AUTHORING seam writes the FROZEN method body, and the ADMISSION seam is a separate authority
       * that decides on the exact candidate. Both are deterministic: no model authors or admits the capital.
       */
      procedureAuthoring: {
        origin: 'r3l0-capital-author',
        async propose({ grounds, projectContext }) {
          const body = CAPITAL_BODIES[authoringScript.lesson];
          return {
            outcome: 'proposal',
            content: {
              schemaVersion: 1,
              title: body.statement.slice(0, 120),
              purpose: body.applicableTo,
              applicability: [body.applicableTo],
              preconditions: ['the caller owns the state the operation mutates'],
              steps: body.method.map((instruction) => ({ instruction })),
              /**
               * §6: the `checks` are the OBLIGATIONS the method asserts, stated as things a caller can verify.
               * They are the general lesson's own test conditions, not any future case's answer.
               */
              checks: [
                'no effect is applied before the whole request has been validated',
                'a refusal leaves the state byte-identical to its pre-call form',
              ],
              expectedOutputs: ['the operation applied, or the state left unchanged after a refusal'],
              limitations: [...body.limitations],
              capabilityHints: ['the ability to read the complete request before applying it'],
              recommendedRecipeRefs: [],
            },
          };
        },
      },
      procedureAdmission: {
        policyRef: { policyId: 'r3l0-procedure-admission', version: '1' },
        async decide({ candidateDigest, validation }) {
          /**
           * The authority receives the candidate DIGEST (not the candidate) and echoes it, so the owner can
           * refuse a decision that does not bind to the artifact it was asked about.
           */
          return {
            decision: 'PUBLISH',
            candidateDigest,
            rationale: `the method is grounded in the incident the project already resolved (groundsResolved=${String(validation.groundsResolved)})`,
            policyRef: { policyId: 'r3l0-procedure-admission', version: '1' },
          };
        },
      },
    },
  );

  const admitted = { proof: [], reasoning: [], procedure: [] };

  for (const lessonId of Object.keys(CAPITAL_BODIES)) {
    const body = CAPITAL_BODIES[lessonId];
    authoringScript.lesson = lessonId;
    const source = PREHISTORY_SOURCES[lessonId];
    const frame = REASONING_FRAMES[lessonId];

    /* ---- Proof: the historical evidence binding ---- */
    const imported = await installed.proof.importSource({
      bytes: new TextEncoder().encode(source.evidenceStatement),
      mediaType: source.mediaType,
      label: source.label,
      provenance: 'LOCAL_IMPORT',
      sourceId: source.sourceId,
    });
    const revisionRef = proofModule.materializeProofSourceRevisionRef({ sourceId: source.sourceId, revision: imported.revision.revision, contentDigest: imported.revision.contentDigest });
    const evidence = await installed.proof.recordEvidence({ sourceRevision: revisionRef, selector: { kind: 'WHOLE_SOURCE' } });
    const candidate = await installed.proof.prepareCandidate({
      claimType: proofModule.PROOF_STATEMENT_TYPE,
      content: { statement: body.statement },
      supportingEvidenceIds: [evidence.evidenceId],
      origin: 'MANUAL',
    });
    await installed.proof.verify({ candidateId: candidate.candidateId });
    const published = await installed.proof.decidePublication({ candidateId: candidate.candidateId });
    admitted.proof.push({ lesson: lessonId, claimId: published.claimId, candidateId: candidate.candidateId, evidenceId: evidence.evidenceId, statementDigest: sha256(body.statement) });

    /* ---- ReasoningClaim: the mechanism explanation ---- */
    /** The reasoning owner requires policy REFS as objects, not bare strings. */
    await installed.reasoningCells.service.openCell({
      cellId: frame.cellId,
      objective: frame.objective,
      verificationPolicyRef: { policyId: 'r3l0-reasoning-verification', version: '1' },
      admissionPolicyRef: { policyId: 'r3l0-reasoning-admission', version: '1' },
    });
    const branch = await installed.reasoningCells.service.openBranch({ cellId: frame.cellId, question: frame.branchQuestion });
    const submitted = await installed.reasoningCells.service.submitCandidate({
      cellId: frame.cellId,
      branchId: branch.branch.ref.branchId,
      type: reasoningModule.REASONING_STATEMENT_TYPE,
      content: { statement: body.explanation },
    });
    const evaluation = await installed.reasoningCells.service.evaluateCandidate({ cellId: frame.cellId, candidateDigest: submitted.candidate.candidateDigest });
    const frontier = await installed.reasoningCells.service.frontier({ cellId: frame.cellId });
    admitted.reasoning.push({
      lesson: lessonId,
      cellId: frame.cellId,
      claimId: frontier.claims[0]?.ref?.claimId ?? null,
      candidateDigest: submitted.candidate.candidateDigest,
      evaluationStatus: evaluation.status,
      explanationDigest: sha256(body.explanation),
    });

    /* ---- Procedure: the reusable method, grounded in an INTERVENTION RECORD ---- */
    const intervention = memoryModule.materializeIntervention({
      subjectRefs: [`incident:${source.sourceId}`],
      rationale: `the project resolved ${source.label}; the method is what the fix established`,
      observationBasis: 'the incident record and the prior-art implementation in the same repository',
      recordedAt: '2026-01-01T00:00:00.000Z',
      beforeRef: `incident:${source.sourceId}:before`,
      afterRef: `incident:${source.sourceId}:after`,
    });
    await installed.organizationMemory.recordIntervention(intervention);
    const preparedProcedure = await installed.procedures.prepare({
      grounds: [{ kind: 'INTERVENTION_RECORD', ref: intervention.interventionRef, digest: intervention.digest }],
      projectContext: { projectId, projectRevision: 1, projectDigest: sha256(projectId), objective: `establish the method for ${lessonId}` },
    });
    const publishedProcedure = await installed.procedures.publish({ procedureId: preparedProcedure.procedureId, candidate: preparedProcedure.candidate });
    admitted.procedure.push({
      lesson: lessonId,
      procedureId: preparedProcedure.procedureId,
      candidateId: preparedProcedure.candidate.candidateId,
      candidateDigest: preparedProcedure.candidate.digest,
      interventionRef: intervention.interventionRef,
      /** §6: the revision the owner minted, recorded so a later generation can select it by ref. */
      revision: publishedProcedure.revision?.revision ?? null,
      revisionDigest: publishedProcedure.revision?.digest ?? null,
      published: publishedProcedure.status === 'published',
      status: publishedProcedure.status,
      methodDigest: sha256(body.method.join(NL)),
    });
  }

  /* ---- §6: the ASSOCIATION is what makes the capital selectable, so it is created here ---- */
  for (const entry of admitted.proof) {
    await installed.projectWorkspace.associateAsset({ projectId, assetKind: 'PROOF_CLAIM', canonicalRef: { kind: 'PROOF_CLAIM', id: entry.claimId }, associationKind: 'MANUAL', provenance: 'r3l0-prepaid-capital' });
  }
  for (const entry of admitted.reasoning) {
    if (entry.claimId === null) continue;
    await installed.projectWorkspace.associateAsset({ projectId, assetKind: 'REASONING_CELL', canonicalRef: { kind: 'REASONING_CELL', id: entry.cellId }, associationKind: 'MANUAL', provenance: 'r3l0-prepaid-capital' });
  }
  for (const entry of admitted.procedure) {
    if (entry.published !== true) continue;
    /**
     * A PROCEDURE reference must carry the EXACT admitted revision digest, because a historical revision and the
     * current one are different assets. The digest comes from the published revision the owner minted.
     */
    await installed.projectWorkspace.associateAsset({
      projectId,
      assetKind: 'PROCEDURE',
      canonicalRef: { kind: 'PROCEDURE', id: `${entry.procedureId}@${String(entry.revision)}`, digest: entry.revisionDigest },
      associationKind: 'MANUAL',
      provenance: 'r3l0-prepaid-capital',
    });
  }

  /**
   * The install owns the caller-supplied memory store and closes it in dispose(). The procedure store is NOT in
   * that list, so this rig closes it — and closing the memory store again would throw, so it is not re-closed.
   */
  await installed.dispose().catch(() => undefined);
  procedureStore.close();

  return Object.freeze({
    kind: 'AdmittedCapital',
    bundleDigest: bundleDigest(),
    admitted,
    /** §6: the owners used, all pre-existing. */
    owners: Object.freeze(['src/proof_asset', 'src/reasoning_cell', 'src/procedures', 'src/project_workspace', 'src/organization_memory']),
    leakage: frozenBundle().leakage,
  });
}

export { CHILD_PROGRAM, TEE_PATH, GENERATIONS, trajectoryPaths, writeProjectWorld, sha256, load, git, REPO_ROOT, NL };
