#!/usr/bin/env node
/**
 * UX-C §38/§39/§40/§41 — PACKAGED DSH CROSS-PROJECT DOGFOOD.
 *
 *   node scripts/interaction/uxc-dsh-cross-project-dogfood.mjs
 *
 * TWO first-party deployments launched from typed profiles with `projectDirectory`
 * and the packaged `reasoning: {}` bundle — no hand-composed `installPalimpsest`
 * rig. A asks B; B's shipped deployment pump ingests the durable request and the
 * PRODUCT cross-project attention text activates B; B answers (once by composing its
 * own packaged PARALLEL Explore, once with FOCUS); A ingests the answer and is
 * activated. No manual mailbox polling (the deployment lifecycle owns pump → drain →
 * activate → mark), no commitment, no foreign workspace read.
 *
 * Plus the COLD-RESUME proof (§40): `get() → undefined`, `resume()` called,
 * `followup` queued, and the signal marked delivered ONLY after successful
 * activation — with the honest §41 boundary that this is an in-host resume of a
 * persisted session, NOT an operating-system daemon resurrection.
 *
 * Prints a final `pass=true|false` line; exits non-zero on failure; cleans temp dirs
 * in a `finally`.
 */

import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = join(import.meta.dirname, '..', '..');
const DIST = pathToFileURL(join(REPO, 'dist', 'src')).href;
const DSH_HOME = process.env.DSH_HOME?.trim() || 'C:/Users/66494/.dsh';
const DSH_BIN = process.env.DSH_BIN?.trim() || 'C:/Users/66494/AppData/Roaming/npm/node_modules/@deepseek-ai/dsh/lib/bin.js';
const PROFILES = join(DSH_HOME, 'profiles').replace(/\\/g, '/');
const HOST_BUNDLE = join(PROFILES, 'node_modules', 'palimpsest-dsh-host').replace(/\\/g, '/');
const ADVANCED = join(REPO, 'dist', 'src', 'advanced.js').replace(/\\/g, '/');
const PROFILE_NAME = 'palimpsest-uxc-cross';
const BRANCH_TIMEOUT_MS = Number(process.env.BRANCH_TIMEOUT_MS ?? 300_000);

const PROJECT_A = 'project-alpha';
const PROJECT_B = 'project-beta';
const PEER_A = 'peer-alpha';
const PEER_B = 'peer-beta';
const EXPLORE_TASK =
  'Explore independent approaches to the caching layer; separately evaluate each component and verify the trade-offs with tests.';

const { launchDeployment } = await import(`${DIST}/deployment/index.js`);
const { dshSubprocessBranchExecutionPort } = await import(`${DIST}/reasoning_cell/index.js`);
const { crossProjectAttentionText, CROSS_PROJECT_INBOUND_REQUEST_TEXT } = await import(`${DIST}/interaction/index.js`);
const { dshAgentsAttentionAdapter } = await import(`${DIST}/attention/index.js`);
const { materializePeerMessage, materializePeerRef, materializeThreadRef } = await import(`${DIST}/federation/index.js`);

const evidence = {};
const failures = [];
function check(name, ok, detail) {
  evidence[name] = { ok: Boolean(ok), detail: typeof detail === 'string' ? detail : JSON.stringify(detail) };
  if (!ok) failures.push(`${name}: ${evidence[name].detail}`);
  return Boolean(ok);
}

const root = join(tmpdir(), `palimpsest-uxc-cross-${process.pid}-${Date.now()}`);
const state = join(root, 'state');
const startedAt = Date.now();
const deployments = [];

function setupProfile() {
  mkdirSync(state, { recursive: true });
  rmSync(HOST_BUNDLE, { recursive: true, force: true });
  cpSync(join(REPO, 'host', 'dsh'), HOST_BUNDLE, { recursive: true });
  const deploymentPath = join(root, 'branch-profile.json');
  writeFileSync(
    deploymentPath,
    JSON.stringify(
      {
        schemaVersion: 1,
        profileId: 'uxc-cross-branch',
        projectId: PROJECT_B,
        localPeer: PEER_B,
        transport: { namespace: 'uxc-cross', databasePath: join(state, 'transport.sqlite') },
        databases: {
          orchestration: join(state, 'branch-orchestration.sqlite'),
          ordarium: join(state, 'branch-ordarium.sqlite'),
          coordination: join(state, 'branch-coordination.sqlite'),
          transportCursors: join(state, 'branch-cursors.sqlite'),
        },
        reasoning: {},
      },
      null,
      2,
    ),
  );
  const profileDir = join(PROFILES, PROFILE_NAME);
  mkdirSync(profileDir, { recursive: true });
  writeFileSync(
    join(profileDir, 'package.json'),
    JSON.stringify(
      { name: `dsh-profile-${PROFILE_NAME}`, private: true, dependencies: {}, dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', 'palimpsest-dsh-host'], patchReload: 'startup' } } },
      null,
      2,
    ),
  );
  writeFileSync(
    join(profileDir, 'cordis.patch.yml'),
    `- id: palimpsest-tools\n  config:\n    palimpsestEntry: '${ADVANCED}'\n    deploymentProfile: '${deploymentPath}'\n    serve: false\n`,
  );
}

function deploymentProfile(who, projectId, peerId, dir, transportPath) {
  return {
    schemaVersion: 1,
    profileId: `uxc-cross-${who}`,
    projectId,
    localPeer: peerId,
    persistentPoint: `pp-${who}`,
    transport: { namespace: 'uxc-cross', databasePath: transportPath },
    databases: {
      orchestration: join(dir, 'orchestration.sqlite'),
      ordarium: join(dir, 'ordarium.sqlite'),
      coordination: join(dir, 'coordination.sqlite'),
      transportCursors: join(dir, 'cursors.sqlite'),
      attentionMarks: join(dir, 'attention.sqlite'),
      projectAssociations: join(dir, 'associations.sqlite'),
      projectJournal: join(dir, 'journal.sqlite'),
    },
    directory: [{ peerId: PEER_A, competenceTags: ['alpha'] }, { peerId: PEER_B, competenceTags: ['beta'] }],
    projectDirectory: [
      { projectId: PROJECT_A, displayName: 'the alpha project', aliases: ['alpha'], peerId: PEER_A, competenceTags: ['alpha'] },
      { projectId: PROJECT_B, displayName: 'the beta project', aliases: ['beta'], peerId: PEER_B, competenceTags: ['beta'] },
    ],
    // Late-bound DSH activation (no sessionId): the host binds the persisted session.
    attention: { policyId: 'uxc-cross-attention-v1', cooldownMs: 0, activation: 'dsh' },
    reasoning: {},
  };
}

/** A recording activation adapter that formats with the PRODUCT formatter. */
function recordingActivation(id) {
  const activated = [];
  return {
    activated,
    port: {
      adapterId: id,
      activate: async (signal) => {
        const text = signal.kind === 'inbound_peer_message' ? crossProjectAttentionText(signal, 'either') : '[palimpsest attention]';
        activated.push({ signalId: signal.signalId, kind: signal.kind, text });
        return { activated: true, detail: `${id} recorded ${signal.signalId}` };
      },
    },
  };
}

function launchWithBranches(profileObject, branchRuns) {
  const realPort = dshSubprocessBranchExecutionPort({ dshBin: DSH_BIN, profile: PROFILE_NAME, workDir: state, timeoutMs: BRANCH_TIMEOUT_MS, nodeExecPath: process.execPath });
  const port = {
    adapterId: realPort.adapterId,
    run: async (input) => {
      const outcome = await realPort.run(input);
      branchRuns.push(outcome);
      return outcome;
    },
  };
  const deployment = launchDeployment(profileObject, { host: { branchExecution: port } });
  deployments.push(deployment);
  const controller = deployment.installed.controller;
  if (!controller.isProjectInitialized()) {
    controller.start({
      projectId: profileObject.projectId,
      goal: 'uxc cross dogfood',
      requirements: [{ requirement_id: 'req-1', statement: 'collaborate', priority: 'normal', acceptance_refs: [] }],
      decisions: [],
      tasks: [],
      committedAt: '2026-09-17T00:00:00Z',
    });
  }
  return deployment;
}

async function main() {
  setupProfile();
  const transportPath = join(state, 'transport.sqlite');
  const branchRuns = [];
  const a = launchWithBranches(deploymentProfile('a', PROJECT_A, PEER_A, join(root, 'a'), transportPath), []);
  const b = launchWithBranches(deploymentProfile('b', PROJECT_B, PEER_B, join(root, 'b'), transportPath), branchRuns);
  const crossA = a.installed.application.crossProject;
  const crossB = b.installed.application.crossProject;
  check('both_packaged_deployments_compose_the_cross_project_face', crossA !== undefined && crossB !== undefined, 'no hand-composed install rig');
  check(
    'both_packaged_deployments_have_the_local_collaboration_bundle',
    a.reasoning.storeConfigured === true && b.reasoning.storeConfigured === true && b.reasoning.branchAdapter !== undefined,
    JSON.stringify({ a: a.reasoning, b: b.reasoning }),
  );

  // Product-formatted attention activation on BOTH sides.
  const aActivation = recordingActivation('uxc-dogfood-recording-a');
  const bActivation = recordingActivation('uxc-dogfood-recording-b');
  a.bindAttentionActivation(aActivation.port);
  b.bindAttentionActivation(bActivation.port);

  /* ---- §38: A asks B; B's shipped pump ingests and activates ----------------- */
  const asked = await crossA.ask({ target: 'the beta project', task: EXPLORE_TASK, requestedBy: 'uxc-dogfood:user' });
  check('ask_is_sent_as_an_ordinary_peer_message', ['RESOLVED', 'SENT', 'WAITING'].includes(asked.status), `${asked.status}: ${asked.summary}`);

  const bReport = await b.pumpAndActivate();
  const bPending = await crossB.pending();
  check('b_shipped_pump_ingests_the_request_without_manual_polling', bReport.pump.ingested >= 1 && bPending.length === 1, JSON.stringify({ ingested: bReport.pump.ingested, pending: bPending.length }));
  check(
    'b_attention_uses_the_product_cross_project_text',
    bActivation.activated.some((entry) => entry.kind === 'inbound_peer_message' && entry.text.includes(CROSS_PROJECT_INBOUND_REQUEST_TEXT)),
    JSON.stringify(bActivation.activated.map((entry) => entry.kind)),
  );

  /* ---- §39: B answers with its OWN packaged PARALLEL Explore ----------------- */
  const branchesBefore = branchRuns.length;
  const composedExplore = await crossB.respond(bPending[0].requestId, { compose: { task: EXPLORE_TASK, intent: 'PARALLEL' } });
  const branchRunsForAnswer = branchRuns.slice(branchesBefore);
  check(
    'b_packaged_local_explore_answered_the_ask',
    composedExplore.status === 'ANSWERED' &&
      branchRunsForAnswer.filter((run) => run?.status === 'completed').length >= 2 &&
      composedExplore.answer.includes('exploratory cell-local findings'),
    `${composedExplore.status} branches=${branchRunsForAnswer.length} answer=${String(composedExplore.answer).slice(0, 160)}`,
  );
  check(
    'b_execution_remains_the_sole_candidate_owner',
    branchRunsForAnswer.every((run) => run?.candidateDigest === undefined),
    JSON.stringify(branchRunsForAnswer.map((run) => ({ status: run?.status, candidateDigest: run?.candidateDigest ?? null }))),
  );

  /* ---- A receives and is activated ------------------------------------------- */
  const aReport = await a.pumpAndActivate();
  const aStatus = await crossA.status(asked.details.requestId);
  check('a_packaged_pump_consumed_the_answer', aReport.pump.ingested >= 1 && aStatus.status === 'ANSWERED', `${aStatus.status}`);
  check(
    'a_attention_uses_the_product_cross_project_text',
    aActivation.activated.some((entry) => entry.kind === 'inbound_peer_message' && /project you asked has replied/iu.test(entry.text)),
    JSON.stringify(aActivation.activated.map((entry) => entry.kind)),
  );

  /* ---- §39b: a second Ask answered with FOCUS (no branches) ------------------ */
  await crossA.ask({ target: 'the beta project', task: 'Summarise what this project knows about caching.', requestedBy: 'uxc-dogfood:user' });
  await b.pumpAndActivate();
  const bPending2 = await crossB.pending();
  const branchesBeforeFocus = branchRuns.length;
  const composedFocus = await crossB.respond(bPending2[0].requestId, { compose: { task: 'Summarise what you know about caching.', intent: 'FOCUS' } });
  check(
    'b_packaged_focus_answered_without_branches',
    composedFocus.status === 'ANSWERED' && branchRuns.length === branchesBeforeFocus,
    `${composedFocus.status} newBranches=${branchRuns.length - branchesBeforeFocus}`,
  );

  /* ---- no commitment / no foreign workspace read ----------------------------- */
  check(
    'cross_project_ask_and_answer_create_zero_commitment',
    (await a.installed.federation.commitments()).length === 0 && (await b.installed.federation.commitments()).length === 0,
    'no commitment exists on either side',
  );
  const foreign = await b.installed.projectWorkspace
    .journal(PROJECT_A)
    .then(() => 'answered', (error) => `${error?.kind ?? error?.name}`);
  check('foreign_workspace_read_fails_closed', foreign === 'invalid_registration', foreign);

  /* ---- §40: cold-resume proves resume()+followup and pending-on-failure ------ */
  const coldDir = join(root, 'cold');
  mkdirSync(coldDir, { recursive: true });
  const cold = launchWithBranches(deploymentProfile('cold', PROJECT_A, PEER_A, coldDir, join(coldDir, 'transport.sqlite')), []);
  const inbound = (suffix) => ({
    transportMessageId: `tm-${suffix}`,
    authenticatedPeer: materializePeerRef({ peerId: PEER_B }),
    message: materializePeerMessage({
      messageId: `msg-${suffix}`,
      thread: materializeThreadRef({ threadId: `thread-${suffix}` }),
      from: materializePeerRef({ peerId: PEER_B }),
      to: materializePeerRef({ peerId: PEER_A }),
      body: JSON.stringify({ task: 'a cross-project question' }),
    }),
  });
  await cold.installed.federation.recordInboundMessage(inbound('cold-1'));
  const coldCalls = [];
  const coldAdapter = dshAgentsAttentionAdapter({
    agents: {
      get: () => undefined,
      resume: async ({ resumeSessionId }) => {
        coldCalls.push(`resume:${resumeSessionId}`);
        return { agent: { followup: (text) => coldCalls.push(`followup:${String(text).slice(0, 40)}`) } };
      },
    },
    resumeSessionId: 'persisted-principal-session-1',
    format: (signal) => (signal.kind === 'inbound_peer_message' ? crossProjectAttentionText(signal, 'either') : '[palimpsest attention]'),
  });
  cold.bindAttentionActivation(coldAdapter);
  const coldReport = await cold.pumpAndActivate();
  const coldActivated = coldReport.activations.some((entry) => entry.outcome.activated === true);
  check('cold_resume_get_undefined_resume_called_followup_queued', coldActivated && coldCalls[0] === 'resume:persisted-principal-session-1' && coldCalls.some((call) => call.startsWith('followup:')), JSON.stringify(coldCalls));
  const coldSecond = await cold.pumpAndActivate();
  check('successful_activation_marks_the_signal_delivered', !coldSecond.signals.some((signal) => signal.kind === 'inbound_peer_message'), JSON.stringify(coldSecond.signals.map((s) => s.kind)));

  await cold.installed.federation.recordInboundMessage(inbound('cold-2'));
  const failing = dshAgentsAttentionAdapter({
    agents: { get: () => undefined, resume: async () => { throw new Error('resume refused'); } },
    resumeSessionId: 'persisted-principal-session-2',
  });
  cold.bindAttentionActivation(failing);
  const failingReport = await cold.pumpAndActivate();
  const stillPending = await cold.attention.pending();
  check(
    'failed_activation_leaves_the_signal_pending',
    failingReport.activations.every((entry) => entry.outcome.activated === false) && failingReport.signals.some((signal) => signal.kind === 'inbound_peer_message') && stillPending.some((signal) => signal.kind === 'inbound_peer_message'),
    JSON.stringify({ activations: failingReport.activations.length, signals: failingReport.signals.map((s) => s.kind), pending: stillPending.map((s) => s.kind) }),
  );

  return { elapsedMs: Date.now() - startedAt, branches: branchRuns.length };
}

let outcome;
try {
  outcome = await main();
} catch (error) {
  failures.push(`unhandled: ${error?.stack ?? String(error)}`);
} finally {
  for (const deployment of deployments.splice(0)) {
    try {
      await deployment.close();
    } catch {
      /* already closed */
    }
  }
  try {
    rmSync(root, { recursive: true, force: true });
  } catch {
    /* windows may hold a handle briefly */
  }
}

const honestNotes = {
  daemon_resurrection:
    'UX-C proves COLD-RESUME of a PERSISTED AGENT SESSION INSIDE A RUNNING HOST (get() → undefined, resume() called, followup queued). It does NOT claim to restart a dead operating-system process or an OS service: OS-level daemon/autostart remains future packaging work (§41).',
  polling:
    'The script drives the DEPLOYMENT lifecycle (pumpAndActivate), which is what the shipped DSH runner schedules on a timer. No user mailbox polling happens: the cursor advances only after ingest, and the runner’s timer is mechanical scheduling, not semantic truth.',
};

const summary = {
  campaign: 'UX-C packaged DSH cross-project collaboration',
  evidence,
  honestNotes,
  failures,
  ...(outcome === undefined ? {} : { elapsedMs: outcome.elapsedMs, branchExecutions: outcome.branches }),
  pass: failures.length === 0,
};
console.log(JSON.stringify(summary, null, 2));
console.log(`pass=${failures.length === 0}`);
process.exit(failures.length === 0 ? 0 : 1);
