/**
 * R3-L0C §7/§8 — THE DETERMINISTIC PREHISTORY AND THE CAPITAL ADMISSION.
 *
 * §7 requires ONE deterministic prehistory, shared SEMANTICALLY across all arms, establishing the project world,
 * the Work/Attempt/Result history, verified and promoted outcomes, the incident and decision history, the capital
 * assets, and the ProjectAssetAssociations. Both arms must contain IDENTICAL capital-plane canonical assets and
 * associations, because the treatment is SELECTION_ONLY.
 *
 * WHY THE PREHISTORY EXISTS AT ALL. It is what makes the Project a PROJECT rather than a directory. The history
 * corpus is written into the world, the Project has already resolved incidents, and the capital is admitted and
 * associated — all before any generation runs. So a generation starts inside a project with a past, and the
 * question the experiment asks is whether capital compresses the work of reading that past.
 *
 * THE PREHISTORY DOES NOT PRE-SOLVE THE INVARIANTS. It records the incidents and decisions, exactly as the
 * corpus does, and it admits the CURRENT-STANDING capital. It does not implement the invariants in the source,
 * because that is what a generation is for.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { REPO_ROOT, INVARIANTS } from './contract.mjs';
import { STANDING_BODIES, STANDING_SOURCES, REASONING_FRAMES, bundleDigest, frozenBundle, futureCaseLeakage, sha256 } from './capital.mjs';
import { corpusFiles } from './corpus.mjs';
import { H0_SOURCE, PACKAGE_JSON, README, VISIBLE_ORACLE, worldFiles } from './project.mjs';

const NL = String.fromCharCode(10);
export const DIST = join(REPO_ROOT, 'dist', 'src');
const load = async (relative) => await import(pathToFileURL(join(DIST, relative)).href);

/** A git helper bound to a repository. */
export const git = (cwd, args) => execFileSync('git', [...args], { cwd, encoding: 'utf8' }).trim();

/* ================================================================ §7 the world */

/**
 * §7: WRITE THE PROJECT WORLD.
 *
 * Both arms receive EXACTLY these bytes, corpus included. The world is committed as one H0 commit, so a
 * generation's starting head is a real revision and path dependence is measurable.
 */
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

/** §7: the world's own digest, so both arms can be proven to start from identical bytes. */
export function worldDigest(corpus = corpusFiles()) {
  const files = worldFiles(corpus);
  return sha256(Object.entries(files).sort(([left], [right]) => (left < right ? -1 : 1)).map(([path, content]) => `${path}:${sha256(content)}`).join(NL));
}

/* ================================================================ §8 the policy ports */

/**
 * §8: THE DETERMINISTIC POLICY PORTS the capital owners require.
 *
 * These are fixtures, not model judgement. Each is an independent verification/admission seam that echoes the
 * digest it decided on, so the owner can refuse a decision that does not bind to the artifact it was asked
 * about. No model authors or admits the capital.
 */
function capitalPolicyPorts(reasoningModule) {
  const policyRef = (policyId) => ({ policyId, version: '1' });
  return Object.freeze({
    proofVerification: {
      policyRef: policyRef('r3l0c-proof-verification'),
      async verify({ candidate }) {
        const supporting = candidate.supportingEvidence.map((entry) => entry.evidenceId);
        const contradicting = candidate.contradictingEvidence.map((entry) => entry.evidenceId);
        return { standing: supporting.length > 0 && contradicting.length === 0 ? 'SUPPORTED' : 'INCONCLUSIVE', supportingEvidenceIds: supporting, contradictingEvidenceIds: contradicting };
      },
    },
    proofAdmission: {
      policyRef: policyRef('r3l0c-proof-publication'),
      async decide({ verification }) {
        return { decision: verification.standing === 'SUPPORTED' || verification.standing === 'PARTIALLY_SUPPORTED' ? 'PUBLISH' : 'UNRESOLVED', provenanceDigest: verification.provenanceDigest };
      },
    },
    reasoningVerification: {
      async verify({ definition, candidate, frontierBasis }) {
        const base = { schemaVersion: 1, cell: candidate.cell, candidateDigest: candidate.candidateDigest, frontierBasis, verificationPolicyRef: definition.verificationPolicyRef, standing: 'SUPPORTED', supportingEvidenceIds: ['ev-1'], contradictingEvidenceIds: [], provenanceDigest: 'a'.repeat(64) };
        return { ...base, digest: reasoningModule.reasoningVerificationDigestOf(base) };
      },
      async verifyInvalidation({ definition, request, frontierBasis }) {
        const base = { schemaVersion: 1, cell: request.cell, targetClaimId: request.targetClaimId, requestDigest: request.requestDigest, frontierBasis, verificationPolicyRef: definition.verificationPolicyRef, standing: 'SUPPORTED', evidenceIds: ['ev-9'], provenanceDigest: 'b'.repeat(64) };
        return { ...base, digest: reasoningModule.invalidationVerificationDigestOf(base) };
      },
    },
    reasoningAdmission: {
      async admit({ definition, candidate, verification, frontierBasis }) {
        const base = { schemaVersion: 1, cell: candidate.cell, candidateDigest: candidate.candidateDigest, verificationResultDigest: verification.digest, frontierBasis, admissionPolicyRef: definition.admissionPolicyRef, decision: 'ADMIT', provenanceDigest: 'c'.repeat(64) };
        return { ...base, digest: reasoningModule.reasoningAdmissionDigestOf(base) };
      },
      async admitInvalidation({ definition, request, verification, frontierBasis }) {
        const base = { schemaVersion: 1, cell: request.cell, targetClaimId: request.targetClaimId, requestDigest: request.requestDigest, verificationResultDigest: verification.digest, frontierBasis, admissionPolicyRef: definition.admissionPolicyRef, decision: 'ADMIT', provenanceDigest: 'd'.repeat(64) };
        return { ...base, digest: reasoningModule.invalidationAdmissionDigestOf(base) };
      },
    },
  });
}

/* ================================================================ §8 admit the capital */

/**
 * §8: ADMIT THE CURRENT-STANDING CAPITAL THROUGH THE EXISTING OWNERS.
 *
 * Per invariant the bundle becomes:
 *
 *   Proof             the historical evidence binding, imported as a source and published as a claim. §8 makes
 *                     this BACKING: it grounds the standing and its admission, and is NOT selected for the worker.
 *   ReasoningClaim    the current-standing conclusion, submitted to a cell and admitted. SELECTED.
 *   Procedure         the method for applying the standing, grounded in an intervention record. SELECTED, at its
 *                     active revision.
 *
 * §8 also requires the capital to be ASSOCIATED with the project, because association is what makes it
 * selectable. The associations are created in the prehistory store, so every trajectory inherits them.
 */
export async function admitCapital(root, paths, projectId, repo) {
  const advanced = await load('advanced.js');
  const workspaceModule = await load('project_workspace/index.js');
  const proofModule = await load('proof_asset/index.js');
  const reasoningModule = await load('reasoning_cell/index.js');
  const proceduresModule = await load('procedures/index.js');
  const memoryModule = await load('organization_memory/index.js');

  const policyPorts = capitalPolicyPorts(reasoningModule);
  /** §8: which invariant's body the authoring seam is currently authoring. Never changed after trial 1. */
  const authoringScript = { invariant: 'I1' };
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
      standard: { statement: 'the visible oracle passes', clauses: [{ kind: 'scope_respected' }], derivedFrom: ['r3l0c capital'], confirmed: true, notes: [] },
      policy: advanced.trustedDefaultPolicy({ read_paths: ['src', 'test', 'README.md', 'docs'], allowed_commands: [{ executable: 'node', argv_prefix: ['-e', 'process.exit(0)'] }] }),
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
      procedureAuthoring: {
        origin: 'r3l0c-capital-author',
        async propose() {
          const body = STANDING_BODIES[authoringScript.invariant];
          return {
            outcome: 'proposal',
            content: {
              schemaVersion: 1,
              title: body.statement.slice(0, 120),
              purpose: body.applicability,
              applicability: [body.applicability],
              preconditions: ['the caller is resolving or revoking an entitlement for a known tenant'],
              steps: body.method.map((instruction) => ({ instruction })),
              /**
               * §8: the `checks` are the standing's own obligations, stated as things a caller can verify. They
               * are the general rule's conditions, never a specific case's answer.
               */
              checks: [
                'the tenant cutover date is read, and a null cutover date is treated as entirely pre-cutover',
                'a revocation acts only on a name the tenant actually holds',
                'a capability outside the consolidation keeps an independent grant set',
              ],
              expectedOutputs: ['the resolved effect for the tenant as of the date, or the revocation applied'],
              limitations: [...body.limitations],
              capabilityHints: ['the ability to read the tenant and its recorded decisions'],
              recommendedRecipeRefs: [],
            },
          };
        },
      },
      procedureAdmission: {
        policyRef: { policyId: 'r3l0c-procedure-admission', version: '1' },
        async decide({ candidateDigest, validation }) {
          return {
            decision: 'PUBLISH',
            candidateDigest,
            rationale: `the method is grounded in the history the Project already recorded (groundsResolved=${String(validation.groundsResolved)})`,
            policyRef: { policyId: 'r3l0c-procedure-admission', version: '1' },
          };
        },
      },
    },
  );

  const admitted = { proof: [], reasoning: [], procedure: [] };

  for (const invariant of INVARIANTS) {
    const body = STANDING_BODIES[invariant.id];
    authoringScript.invariant = invariant.id;
    const source = STANDING_SOURCES[invariant.id];
    const frame = REASONING_FRAMES[invariant.id];

    /* ---- Proof: the historical evidence binding (BACKING, not worker-facing) ---- */
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
    admitted.proof.push({ invariant: invariant.id, claimId: published.claimId, candidateId: candidate.candidateId, evidenceId: evidence.evidenceId, statementDigest: sha256(body.statement) });

    /* ---- ReasoningClaim: the current-standing conclusion (SELECTED) ---- */
    await installed.reasoningCells.service.openCell({
      cellId: frame.cellId,
      objective: frame.objective,
      verificationPolicyRef: { policyId: 'r3l0c-reasoning-verification', version: '1' },
      admissionPolicyRef: { policyId: 'r3l0c-reasoning-admission', version: '1' },
    });
    const branch = await installed.reasoningCells.service.openBranch({ cellId: frame.cellId, question: frame.branchQuestion });
    const submitted = await installed.reasoningCells.service.submitCandidate({
      cellId: frame.cellId,
      branchId: branch.branch.ref.branchId,
      type: reasoningModule.REASONING_STATEMENT_TYPE,
      content: { statement: body.statement },
    });
    const evaluation = await installed.reasoningCells.service.evaluateCandidate({ cellId: frame.cellId, candidateDigest: submitted.candidate.candidateDigest });
    const frontier = await installed.reasoningCells.service.frontier({ cellId: frame.cellId });
    admitted.reasoning.push({
      invariant: invariant.id,
      cellId: frame.cellId,
      claimId: frontier.claims[0]?.ref?.claimId ?? null,
      candidateDigest: submitted.candidate.candidateDigest,
      evaluationStatus: evaluation.status,
      statementDigest: sha256(body.statement),
    });

    /* ---- Procedure: the method for applying the standing (SELECTED, at its active revision) ---- */
    const intervention = memoryModule.materializeIntervention({
      subjectRefs: [`history:${source.sourceId}`],
      rationale: `the Project recorded the history that establishes ${invariant.name}; the method is what that history settled`,
      observationBasis: 'the history corpus and the verification records in the same repository',
      recordedAt: '2026-01-01T00:00:00.000Z',
      beforeRef: `history:${source.sourceId}:before`,
      afterRef: `history:${source.sourceId}:after`,
    });
    await installed.organizationMemory.recordIntervention(intervention);
    const preparedProcedure = await installed.procedures.prepare({
      grounds: [{ kind: 'INTERVENTION_RECORD', ref: intervention.interventionRef, digest: intervention.digest }],
      projectContext: { projectId, projectRevision: 1, projectDigest: sha256(projectId), objective: `establish the method for ${invariant.id}` },
    });
    const publishedProcedure = await installed.procedures.publish({ procedureId: preparedProcedure.procedureId, candidate: preparedProcedure.candidate });
    admitted.procedure.push({
      invariant: invariant.id,
      procedureId: preparedProcedure.procedureId,
      candidateId: preparedProcedure.candidate.candidateId,
      candidateDigest: preparedProcedure.candidate.digest,
      interventionRef: intervention.interventionRef,
      revision: publishedProcedure.revision?.revision ?? null,
      revisionDigest: publishedProcedure.revision?.digest ?? null,
      published: publishedProcedure.status === 'published',
      status: publishedProcedure.status,
      methodDigest: sha256(body.method.join(NL)),
    });
  }

  /* ---- §8: the ASSOCIATION is what makes the capital selectable ---- */
  for (const entry of admitted.proof) {
    await installed.projectWorkspace.associateAsset({ projectId, assetKind: 'PROOF_CLAIM', canonicalRef: { kind: 'PROOF_CLAIM', id: entry.claimId }, associationKind: 'MANUAL', provenance: 'r3l0c-current-standing-capital' });
  }
  for (const entry of admitted.reasoning) {
    if (entry.claimId === null) continue;
    await installed.projectWorkspace.associateAsset({ projectId, assetKind: 'REASONING_CELL', canonicalRef: { kind: 'REASONING_CELL', id: entry.cellId }, associationKind: 'MANUAL', provenance: 'r3l0c-current-standing-capital' });
  }
  for (const entry of admitted.procedure) {
    if (entry.published !== true) continue;
    /** A PROCEDURE reference must carry the EXACT admitted revision digest, because revisions are distinct assets. */
    await installed.projectWorkspace.associateAsset({
      projectId,
      assetKind: 'PROCEDURE',
      canonicalRef: { kind: 'PROCEDURE', id: `${entry.procedureId}@${String(entry.revision)}`, digest: entry.revisionDigest },
      associationKind: 'MANUAL',
      provenance: 'r3l0c-current-standing-capital',
    });
  }

  await installed.dispose().catch(() => undefined);
  procedureStore.close();

  return Object.freeze({
    kind: 'AdmittedCurrentStandingCapital',
    bundleDigest: bundleDigest(),
    admitted: Object.freeze({ proof: Object.freeze(admitted.proof), reasoning: Object.freeze(admitted.reasoning), procedure: Object.freeze(admitted.procedure) }),
    owners: Object.freeze(['src/proof_asset', 'src/reasoning_cell', 'src/procedures', 'src/project_workspace', 'src/organization_memory']),
    leakage: futureCaseLeakage(),
    /** §8: the minimality the admission honoured. */
    selected: Object.freeze({ reasoningClaims: admitted.reasoning.length, activeProcedureRevisions: admitted.procedure.filter((entry) => entry.published === true).length, proofClaimsSelected: 0 }),
  });
}

/**
 * §8: THE WORKER-FACING REFS, derived from the admitted record.
 *
 * §8's minimality: the reasoning claim and the active procedure revision are selected; the proof claim is
 * recorded as backing and never becomes a handle.
 */
export function selectionRefs(admitted) {
  const refs = [];
  for (const entry of admitted.admitted.reasoning) {
    if (entry.claimId === null) continue;
    refs.push(Object.freeze({
      invariant: entry.invariant,
      kind: 'REASONING_CLAIM',
      handle: `@ctx/reasoning/${entry.cellId}/${entry.claimId}`,
      owner: 'src/reasoning_cell',
      ref: Object.freeze({ cellId: entry.cellId, claimId: entry.claimId }),
    }));
  }
  for (const entry of admitted.admitted.procedure) {
    if (entry.published !== true) continue;
    refs.push(Object.freeze({
      invariant: entry.invariant,
      kind: 'PROCEDURE',
      handle: `@ctx/procedure/${entry.procedureId}/${String(entry.revision)}`,
      owner: 'src/procedures',
      ref: Object.freeze({ procedureId: entry.procedureId, revision: entry.revision, reason: `the current-standing method for ${entry.invariant}` }),
    }));
  }
  return Object.freeze(refs);
}

/** §8: the backing proof refs, recorded but NOT selected. */
export function backingRefs(admitted) {
  return Object.freeze(admitted.admitted.proof.map((entry) => Object.freeze({ invariant: entry.invariant, kind: 'PROOF_CLAIM', claimId: entry.claimId, selectedForWorker: false })));
}

export { frozenBundle, bundleDigest, H0_SOURCE, README, PACKAGE_JSON, VISIBLE_ORACLE, worldFiles, NL };
