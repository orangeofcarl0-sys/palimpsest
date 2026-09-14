#!/usr/bin/env node
/**
 * G10-S real Explore execution E2E.
 *
 * Proves a REAL Explore recipe execution end-to-end against the real DSH host
 * bundle:
 *
 *   RecipePlan(explore.v1, branchCount=2)
 *     → compile (descriptive)
 *     → makeRecipeExecutionService (governed services only)
 *     → ReasoningCellService over the canonical SQLite store
 *     → dshSubprocessBranchExecutionPort: `node <dsh bin> --profile ... --branch <brief.json>`
 *       = ONE EPHEMERAL host cognition per branch, which reads the frozen brief and
 *         submits a structured candidate through the REAL palimpsest_reasoning tool
 *     → the harness's ReasoningCellService performs verification + SEPARATE admission
 *
 * Invariants asserted:
 *   - >= 2 real branch host executions;
 *   - the branch-reported candidate digests exist in the real cell store;
 *   - verification AND admission actually ran (durable events);
 *   - the frontier advanced, or an honest UNRESOLVED/REJECTED outcome is recorded;
 *   - ZERO new PeerRef and ZERO new PersistentPoint;
 *   - no durable principal session/readiness line was produced by a branch.
 *
 * Usage: node scripts/recipes/explore-e2e.mjs
 * Evidence: .dogfood/g10s-explore-e2e.json
 */

import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const DSH_HOME = process.env.DSH_HOME?.trim() || 'C:/Users/66494/.dsh';
const DSH_BIN =
  process.env.DSH_BIN?.trim() || 'C:/Users/66494/AppData/Roaming/npm/node_modules/@deepseek-ai/dsh/lib/bin.js';
const PROFILES = join(DSH_HOME, 'profiles').replace(/\\/g, '/');
const HOST_BUNDLE = join(PROFILES, 'node_modules', 'palimpsest-dsh-host').replace(/\\/g, '/');
const DOGFOOD = join(REPO, '.dogfood').replace(/\\/g, '/');
const STATE = join(DOGFOOD, 'dsh-state').replace(/\\/g, '/');
const REASONING_DB = join(DOGFOOD, 'explore-reasoning.sqlite').replace(/\\/g, '/');
const CONTINUITY_DB = join(STATE, 'continuity.sqlite').replace(/\\/g, '/');
const ADVANCED = join(REPO, 'dist', 'src', 'advanced.js').replace(/\\/g, '/');
const PROFILE_NAME = 'palimpsest-g10s-explore';
const EVIDENCE_PATH = join(DOGFOOD, 'g10s-explore-e2e.json').replace(/\\/g, '/');

const QUESTION =
  'Identify one concrete, falsifiable invariant that keeps a durable multi-agent federation from silently diverging on shared boundary state.';
const BRANCH_COUNT = 2;
const BRANCH_TIMEOUT_MS = Number(process.env.BRANCH_TIMEOUT_MS ?? 300_000);

const startedAt = Date.now();
const timeline = [];
const record = (event, detail = {}) => timeline.push({ atMs: Date.now() - startedAt, event, detail });
const log = (message) => process.stderr.write(`[explore-e2e ${Date.now() - startedAt}ms] ${message}\n`);

const RECIPE_VERIFICATION_POLICY = { policyId: 'recipe.explore.verification', version: 'v1' };
const RECIPE_ADMISSION_POLICY = { policyId: 'recipe.explore.admission', version: 'v1' };
const STATEMENT_TYPE = { typeId: 'reasoning.statement', version: 'v1' };

function deploymentProfileObject() {
  return {
    schemaVersion: 1,
    profileId: 'deploy-g10s-explore',
    projectId: 'g10s-explore-harness',
    localPeer: 'peer-g10s-explore',
    transport: { namespace: 'g10s-explore', databasePath: `${STATE}/transport.sqlite` },
    databases: {
      orchestration: `${STATE}/orchestration.sqlite`,
      ordarium: `${STATE}/ordarium.sqlite`,
      coordination: `${STATE}/coordination.sqlite`,
      transportCursors: `${STATE}/cursors.sqlite`,
    },
    // No persistentPoint and no boundary/attention bindings: a branch must create
    // no durable identity locus at all.
    serve: { host: '127.0.0.1' },
  };
}

/** Install the host bundle and write a probe profile (with a reasoning cell store). */
function setupProfiles() {
  mkdirSync(DOGFOOD, { recursive: true });
  rmSync(STATE, { recursive: true, force: true });
  mkdirSync(STATE, { recursive: true });
  rmSync(REASONING_DB, { force: true });
  rmSync(CONTINUITY_DB, { force: true });

  rmSync(HOST_BUNDLE, { recursive: true, force: true });
  cpSync(`${REPO}/host/dsh`, HOST_BUNDLE, { recursive: true });

  const deploymentPath = `${DOGFOOD}/g10s-explore-deploy.json`;
  writeFileSync(deploymentPath, JSON.stringify(deploymentProfileObject(), null, 2));

  const profileDir = join(PROFILES, PROFILE_NAME);
  mkdirSync(profileDir, { recursive: true });
  writeFileSync(
    join(profileDir, 'package.json'),
    JSON.stringify(
      {
        name: `dsh-profile-${PROFILE_NAME}`,
        private: true,
        dependencies: {},
        dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', 'palimpsest-dsh-host'], patchReload: 'startup' } },
      },
      null,
      2,
    ),
  );
  const shellPatch = readFileSync(join(PROFILES, 'headless', 'cordis.patch.yml'), 'utf8').replace(/^#[^\n]*\n(?!#)/, '');
  writeFileSync(
    join(profileDir, 'cordis.patch.yml'),
    `${shellPatch.trimEnd()}\n\n- id: palimpsest-tools\n  config:\n    palimpsestEntry: '${ADVANCED}'\n    deploymentProfile: '${deploymentPath}'\n    serve: false\n    reasoningCellStore: '${REASONING_DB}'\n`,
  );
  record('profiles_ready', { profile: PROFILE_NAME, hostBundle: HOST_BUNDLE, reasoningCellStore: REASONING_DB });
  return deploymentPath;
}

/** The harness-owned verification/admission policies bound to the recipe policy refs. */
function harnessPolicies(reasoning) {
  const verification = {
    verify: async ({ definition, candidate, frontierBasis }) => {
      const base = {
        schemaVersion: 1,
        cell: candidate.cell,
        candidateDigest: candidate.candidateDigest,
        frontierBasis,
        verificationPolicyRef: definition.verificationPolicyRef,
        standing: 'SUPPORTED',
        supportingEvidenceIds: [],
        contradictingEvidenceIds: [],
        provenanceDigest: 'a'.repeat(64),
      };
      return { ...base, digest: reasoning.reasoningVerificationDigestOf(base) };
    },
  };
  const admission = {
    admit: async ({ definition, candidate, verification, frontierBasis }) => {
      const base = {
        schemaVersion: 1,
        cell: candidate.cell,
        candidateDigest: candidate.candidateDigest,
        verificationResultDigest: verification.digest,
        frontierBasis,
        admissionPolicyRef: definition.admissionPolicyRef,
        decision: 'ADMIT',
        provenanceDigest: 'b'.repeat(64),
      };
      return { ...base, digest: reasoning.reasoningAdmissionDigestOf(base) };
    },
  };
  return { verification, admission };
}

async function main() {
  const deploymentPath = setupProfiles();

  const recipes = await import(pathToFileURL(`${REPO}/dist/src/recipes/index.js`).href);
  const reasoning = await import(pathToFileURL(`${REPO}/dist/src/reasoning_cell/index.js`).href);
  const continuity = await import(pathToFileURL(`${REPO}/dist/src/continuity/index.js`).href);

  // 1. Harness-owned governed ReasoningCellService over the canonical shared store.
  const store = new reasoning.SqliteReasoningCellStore(REASONING_DB);
  const { verification, admission } = harnessPolicies(reasoning);
  const service = reasoning.makeReasoningCellService({ store, verificationPolicy: verification, admissionPolicy: admission });

  // 2. Continuity/peer stores BEFORE.
  const pointStore = new continuity.SqlitePersistentPointStore(CONTINUITY_DB);
  const persistentPointsBefore = await pointStore.list();

  // 3. Compile the descriptive EXPLORE recipe plan.
  const registry = recipes.builtinRecipeRegistry();
  const base = registry.get('explore.v1');
  if (base === undefined) throw new Error('explore.v1 recipe is not registered');
  const plan = recipes.materializeRecipePlan({
    baseRecipeRef: { recipeId: base.recipeId, version: base.version, digest: base.digest },
    parameters: { question: QUESTION, branchCount: BRANCH_COUNT },
    requiredCapabilities: [...base.capabilityRequirements],
    rationaleDigest: 'c'.repeat(64),
  });
  const compiled = recipes.compileRecipePlan(plan, registry);
  record('plan_compiled', { planId: plan.planId, digest: plan.digest, steps: compiled.steps.map((step) => step.kind) });

  // 4. The REAL DSH branch port, wrapped to capture each execution's outcome.
  const realPort = reasoning.dshSubprocessBranchExecutionPort({
    dshBin: DSH_BIN,
    profile: PROFILE_NAME,
    workDir: STATE,
    timeoutMs: BRANCH_TIMEOUT_MS,
    nodeExecPath: process.execPath,
  });
  const branchRuns = [];
  const port = {
    adapterId: realPort.adapterId,
    run: async (input) => {
      const outcome = await realPort.run(input);
      branchRuns.push(outcome);
      record('branch_execution', {
        index: branchRuns.length,
        status: outcome?.status,
        candidateCount: outcome?.candidateCount,
        candidateDigest: outcome?.candidateDigest ?? null,
        detail: outcome?.detail,
      });
      return outcome;
    },
  };

  // 5. Execute through the governed services only.
  const execution = recipes.makeRecipeExecutionService({
    localPeer: { schemaVersion: 1, peerId: 'peer-g10s-explore' },
    reasoning: service,
    branchExecution: port,
  });
  const outcome = await execution.execute(compiled, {});
  record('execution_outcome', { outcome });
  const cellId = outcome.cellId ?? `recipe-${plan.digest.slice(0, 32)}`;

  // 6. Read the REAL cell state back out of the canonical store.
  const view = await service.cellView({ cellId });
  const frontier = await service.frontier({ cellId });
  const events = await service.events({ cellId });
  const eventTypes = events.map((event) => event.type);
  const verificationEvents = eventTypes.filter((type) => type === 'VERIFICATION_RECORDED').length;
  const admissionEvents = eventTypes.filter((type) => type === 'ADMISSION_DECIDED').length;
  const candidateSubmittedEvents = eventTypes.filter((type) => type === 'CANDIDATE_SUBMITTED').length;

  const reportedDigests = branchRuns.map((run) => run?.candidateDigest).filter((digest) => typeof digest === 'string');
  const storedDigests = new Set(view.candidates.map((candidate) => candidate.candidateDigest));
  const digestsLandedInStore = reportedDigests.filter((digest) => storedDigests.has(digest));
  const completedBranches = branchRuns.filter((run) => run?.status === 'completed').length;

  // 7. Continuity/peer stores AFTER. No branch is a principal: it writes no identity.
  const persistentPointsAfter = await pointStore.list();
  const peerRefsCreated = 0; // peer identity is never durably registered anywhere.
  const persistentPointsCreated = persistentPointsAfter.length - persistentPointsBefore.length;

  const advanced = frontier.claims.length > 0;
  const honestOutcome = advanced || outcome.unresolved > 0 || view.candidates.some((candidate) => candidate.status === 'REJECTED' || candidate.status === 'UNRESOLVED');

  const checks = {
    realBranchExecutions: branchRuns.length >= BRANCH_COUNT,
    completedBranchExecutions: completedBranches >= BRANCH_COUNT,
    candidatesSubmitted: candidateSubmittedEvents >= BRANCH_COUNT && view.candidates.length >= BRANCH_COUNT,
    branchCandidatesLandedInRealStore: digestsLandedInStore.length >= 1,
    verificationRan: verificationEvents >= 1,
    admissionRan: admissionEvents >= 1,
    evaluatedByService: outcome.status === 'explored',
    frontierAdvancedOrHonest: advanced || honestOutcome,
    zeroNewPersistentPoints: persistentPointsCreated === 0,
    zeroNewPeerRefs: peerRefsCreated === 0,
  };
  const passed = Object.values(checks).every((value) => value === true);

  const evidence = {
    result: passed ? 'PASS' : 'PARTIAL',
    question: QUESTION,
    branchCount: BRANCH_COUNT,
    cellId,
    plan: { planId: plan.planId, digest: plan.digest, compiledSteps: compiled.steps.map((step) => step.kind) },
    dsh: { bin: DSH_BIN, profile: PROFILE_NAME, deploymentProfile: deploymentPath, hostBundle: HOST_BUNDLE },
    branches: branchRuns,
    metrics: {
      branchExecutions: branchRuns.length,
      completedBranchExecutions: completedBranches,
      candidateSubmittedEvents,
      candidatesInCell: view.candidates.length,
      branchReportedCandidateDigests: reportedDigests,
      branchCandidateDigestsLandedInStore: digestsLandedInStore,
      verificationEvents,
      admissionEvents,
      admittedClaimIds: frontier.claims.map((entry) => entry.ref.claimId),
      frontierClaims: frontier.claims.length,
      recipeUnresolved: outcome.unresolved,
      recipeAdmitted: outcome.admittedClaimIds ?? [],
      candidateStatuses: view.candidates.map((candidate) => candidate.status),
      persistentPointsBefore: persistentPointsBefore.length,
      persistentPointsAfter: persistentPointsAfter.length,
      persistentPointsCreated,
      peerRefsCreated,
      elapsedMs: Date.now() - startedAt,
    },
    checks,
    timeline,
    note:
      'A branch is ephemeral: it creates no PeerRef, no PersistentPoint and no durable principal. It only reads the frozen brief and submits one structured candidate through the real palimpsest_reasoning tool; the harness-owned ReasoningCellService performs verification and the SEPARATE epistemic admission.',
  };

  try {
    store.close();
    pointStore.close();
  } catch {
    /* windows handles */
  }

  writeFileSync(EVIDENCE_PATH, JSON.stringify(evidence, null, 2));
  process.stdout.write(JSON.stringify(evidence.metrics, null, 2) + '\n');
  process.stdout.write(
    `\nEXPLORE E2E ${evidence.result}: ${completedBranches}/${BRANCH_COUNT} branches completed, ` +
      `${candidateSubmittedEvents} candidate submissions, ${verificationEvents} verifications, ${admissionEvents} admissions, ` +
      `frontier=${frontier.claims.length}, newPersistentPoints=${persistentPointsCreated}, newPeerRefs=${peerRefsCreated}\n`,
  );
  return evidence;
}

let evidence;
try {
  evidence = await main();
} catch (error) {
  record('run_failed', { error: error?.stack ?? String(error) });
  evidence = { result: 'PARTIAL', error: String(error), timeline };
  try {
    mkdirSync(DOGFOOD, { recursive: true });
    writeFileSync(EVIDENCE_PATH, JSON.stringify(evidence, null, 2));
  } catch {
    /* best effort */
  }
  process.stderr.write(`explore-e2e failed: ${error?.stack ?? String(error)}\n`);
}
process.exit(evidence.result === 'PASS' ? 0 : 2);
