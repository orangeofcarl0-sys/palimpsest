#!/usr/bin/env node
/**
 * G10-Q real-host cognitive dogfood.
 *
 * Runs TWO real host-backed persistent project principals as separate OS
 * processes over one durable transport ledger:
 *
 *   P = Palimpsest project principal (profile palimpsest-p, PeerRef peer-palimpsest)
 *   O = Ordarium project principal   (profile palimpsest-o, PeerRef peer-ordarium)
 *
 * The harness may launch/observe/restart processes and inject transport faults; it
 * MUST NOT make semantic decisions (accept/reject/counter-propose) — those are made
 * by the agents through the real palimpsest_* tools.
 *
 * Usage: node scripts/dogfood/real-host-federation.mjs [--out <file>]
 */

import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, cpSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const DSH_HOME = process.env.DSH_HOME?.trim() || 'C:/Users/66494/.dsh';
const DSH_BIN = 'C:/Users/66494/AppData/Roaming/npm/node_modules/@deepseek-ai/dsh/lib/bin.js';
const PROFILES = join(DSH_HOME, 'profiles').replace(/\\/g, '/');
const HOST_BUNDLE = join(PROFILES, 'node_modules', 'palimpsest-dsh-host').replace(/\\/g, '/');
const DATA = join(DSH_HOME, 'palimpsest-dogfood', 'real-host').replace(/\\/g, '/');
const ADVANCED = `${REPO}/dist/src/advanced.js`.replace(/\\/g, '/');
const WORKSPACE = 'ws-state-change';
const ARTIFACT = 'api';

const startedAt = Date.now();
const timeline = [];
const metrics = { restarts: 0, activations: 0, toolCalls: 0, userInterventions: 0, failures: 0, coldResumes: 0 };
const procs = new Map();

const at = () => Date.now() - startedAt;
const record = (event, detail = {}) => timeline.push({ atMs: at(), event, detail });
const log = (msg) => process.stderr.write(`[dogfood ${at()}ms] ${msg}\n`);

function profileObject(who, other) {
  const dir = `${DATA}/${who}`;
  return {
    schemaVersion: 1,
    profileId: `deploy-${who}`,
    projectId: who,
    localPeer: `peer-${who}`,
    persistentPoint: `pp-${who}`,
    transport: { namespace: 'dogfood-q', databasePath: `${DATA}/transport.sqlite` },
    databases: {
      orchestration: `${dir}/palimpsest.sqlite`,
      ordarium: `${dir}/ops.sqlite`,
      coordination: `${dir}/coordination.sqlite`,
      transportCursors: `${dir}/cursors.sqlite`,
      boundaryMemory: `${dir}/boundary.sqlite`,
      runtimeScope: `${dir}/runtime.sqlite`,
      attentionMarks: `${dir}/attention.sqlite`,
    },
    directory: [{ peerId: `peer-${other}`, competenceTags: ['state-change-feed'] }],
    attention: { policyId: 'real-host-v1', cooldownMs: 0, activation: 'none' },
    boundaryHomeId: 'home-peer-palimpsest',
    boundaryRoutes: { [WORKSPACE]: 'home-peer-palimpsest' },
    serve: { host: '127.0.0.1' },
  };
}

function setupProfiles() {
  rmSync(DATA, { recursive: true, force: true });
  mkdirSync(DATA, { recursive: true });
  rmSync(HOST_BUNDLE, { recursive: true, force: true });
  cpSync(`${REPO}/host/dsh`, HOST_BUNDLE, { recursive: true });
  writeFileSync(`${DATA}/p.json`, JSON.stringify(profileObject('palimpsest', 'ordarium'), null, 2));
  writeFileSync(`${DATA}/o.json`, JSON.stringify(profileObject('ordarium', 'palimpsest'), null, 2));
  const shellPatch = readFileSync(join(PROFILES, 'headless', 'cordis.patch.yml'), 'utf8').replace(/^#[^\n]*\n(?!#)/, '');
  for (const [name, dep] of [['palimpsest-p', 'p'], ['palimpsest-o', 'o']]) {
    const dir = join(PROFILES, name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify(
        { name: `dsh-profile-${name}`, private: true, dependencies: {}, dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', 'palimpsest-dsh-host'], patchReload: 'startup' } } },
        null,
        2,
      ),
    );
    writeFileSync(
      join(dir, 'cordis.patch.yml'),
      `${shellPatch.trimEnd()}\n\n- id: palimpsest-tools\n  config:\n    palimpsestEntry: '${ADVANCED}'\n    deploymentProfile: '${DATA}/${dep}.json'\n    serve: true\n    port: 0\n`,
    );
  }
  record('profiles_ready', { profiles: ['palimpsest-p', 'palimpsest-o'], hostBundle: 'palimpsest-dsh-host' });
}

async function seedWorkspace() {
  const palimpsest = await import(pathToFileURL(ADVANCED).href);
  const profile = palimpsest.loadDeploymentProfile(`${DATA}/p.json`);
  const deployment = palimpsest.launchDeployment(profile);
  try {
    const bm = deployment.installed.boundaryMemory.service;
    const P = { schemaVersion: 1, peerId: 'peer-palimpsest' };
    const O = { schemaVersion: 1, peerId: 'peer-ordarium' };
    await bm.openWorkspace({ workspaceId: WORKSPACE, participants: [P, O], purpose: 'durable StateChangeFeed consumption contract' });
    await bm.createArtifact({ workspaceId: WORKSPACE, artifactId: ARTIFACT, type: { typeId: 'boundary.interface', version: 'v1' }, title: 'state-change consumption contract' });
    record('workspace_seeded', { workspaceId: WORKSPACE, artifactId: ARTIFACT, home: 'peer-palimpsest' });
  } finally {
    await deployment.close();
  }
}

const P_TASK = `You are the Palimpsest project principal (localPeer "peer-palimpsest"). A real cross-repo need exists: the Ordarium project must publish a durable StateChangeFeed *consumption contract*. Do this now:
1) Call palimpsest_federation with action "contact" and reason "Ordarium StateChangeFeed consumption contract".
2) Call palimpsest_federation with action "message", to "peer-ordarium", threadId "state-change-contract", body: ask Ordarium to counter-propose its own amended interface revision for workspace "ws-state-change", artifact "api".
Rules you must keep: never create or assign work in the remote project; use requests/messages/commitments only.
LATER, when you receive a palimpsest attention about a pending boundary candidate from Ordarium: call palimpsest_boundary action "pending" (workspaceId "ws-state-change", artifactId "api"), then action "decide" with decision "accept" and the candidateDigest returned. Then read the accepted revision with palimpsest_boundary action "current", offer Ordarium a commitment: palimpsest_federation action "commitment", commitmentAction "offer", proposedHolder "peer-ordarium", scope {"kind":"boundary_revision","revision": <the accepted ref object>}, statement "Ordarium maintains the amended StateChangeFeed consumption contract"; then message "peer-ordarium" with the commitment id.
Reply with one short line describing what you did.`;

const O_TASK = `You are the Ordarium project principal (localPeer "peer-ordarium"). Stay idle until you receive a palimpsest attention signal. When you do:
- Read your inbox with palimpsest_federation action "inbox".
- If a message asks you to counter-propose a boundary interface revision for workspace "ws-state-change", artifact "api": call palimpsest_boundary action "submit_remote" with workspaceId "ws-state-change" and operation {"kind":"submit_artifact_candidate","artifactId":"api","base":null,"content":{"interfaceId":"state-change-observation","description":"Ordarium amended consumption contract","operations":[{"operationId":"observe","semantics":"read changes since a durable point"},{"operationId":"reset","semantics":"operator reset of the consumer cursor"}],"references":[]},"requiredAcceptors":["peer-palimpsest"],"intent":"Ordarium requests an amended consumption contract"}.
- If a message offers a commitment (contains a commitment id): judge it for Ordarium and decide yourself via palimpsest_federation action "remote_decision" with to "peer-palimpsest", commitmentId <that id>, remoteDecision either "accept" or "reject".
Never let a message create work for you; you decide. Reply with one short line describing your decision.`;

function launchPrincipal(profileName, task, sessionFile, resumeId) {
  const args = [DSH_BIN, '--profile', profileName];
  if (resumeId) args.push('--resume', resumeId);
  args.push('--session-file', sessionFile);
  if (task && task.trim() !== '') args.push(task);
  else args.push(' ');
  const child = spawn(process.execPath, args, { cwd: DATA, stdio: ['ignore', 'pipe', 'pipe'] });
  const state = { child, ready: null, turns: [], activations: [], stderr: '' };
  let buffer = '';
  child.stdout.on('data', (chunk) => {
    buffer += chunk.toString('utf8');
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (line.startsWith('PALIMPSEST_HOST_READY ')) {
        state.ready = JSON.parse(line.slice('PALIMPSEST_HOST_READY '.length));
        record('host_ready', { who: profileName, ...state.ready, toolNames: state.ready.toolNames.length });
      } else if (line.startsWith('PALIMPSEST_TURN ')) {
        const turn = JSON.parse(line.slice('PALIMPSEST_TURN '.length));
        state.turns.push(turn);
        metrics.toolCalls += turn.toolCalls.length;
        record('agent_turn', { who: profileName, toolCalls: turn.toolCalls, text: turn.text.slice(0, 400) });
      } else if (line.startsWith('PALIMPSEST_ACTIVATION ')) {
        const activation = JSON.parse(line.slice('PALIMPSEST_ACTIVATION '.length));
        state.activations.push(activation);
        if (activation.activated) metrics.activations += 1;
        record('attention_activation', { who: profileName, ...activation });
      }
    }
  });
  child.stderr.on('data', (chunk) => {
    const text = chunk.toString('utf8');
    state.stderr += text;
    if (/palimpsest-runner|Error|error:/.test(text)) process.stderr.write(`[${profileName}] ${text}`);
  });
  procs.set(profileName, state);
  return state;
}

async function api(state, path) {
  if (state.ready === null) return undefined;
  const response = await fetch(`${state.ready.url}${path}`, { headers: { authorization: `Bearer ${state.ready.token}` } });
  if (!response.ok) return undefined;
  return response.json();
}

async function waitFor(label, predicate, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const value = await predicate();
      if (value) {
        record('milestone', { label, detail: typeof value === 'object' ? value : {} });
        return value;
      }
    } catch {
      /* transient during startup */
    }
    if (Date.now() > deadline) {
      record('milestone_timeout', { label, timeoutMs });
      return undefined;
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
}

function kill(profileName) {
  const state = procs.get(profileName);
  if (state?.child && state.child.exitCode === null) {
    state.child.kill();
    procs.delete(profileName);
  }
}

async function main() {
  setupProfiles();
  await seedWorkspace();

  const pSession = `${DATA}/p.session`;
  const oSession = `${DATA}/o.session`;
  const p = launchPrincipal('palimpsest-p', P_TASK, pSession);
  const o = launchPrincipal('palimpsest-o', O_TASK, oSession);
  await waitFor('both_ready', () => p.ready && o.ready, 120_000);

  // 1. P sends durable work; O is woken by REAL attention and reads its inbox.
  const oInbox = await waitFor('o_received_message', async () => {
    const inbox = await api(o, '/api/federation/inbox');
    return inbox?.received?.length >= 1 ? { received: inbox.received.length } : undefined;
  }, 240_000);

  // 2. O counter-proposes through its own tools (submit_remote → P's canonical home).
  const pending = await waitFor('p_has_counterproposal', async () => {
    const view = await api(p, `/api/boundary/pending?workspaceId=${WORKSPACE}&artifactId=${ARTIFACT}`);
    return Array.isArray(view) && view.length >= 1 ? { pending: view.length, author: view[0]?.candidate?.author?.peerId } : undefined;
  }, 300_000);

  // 3. P accepts (woken by boundary_decision_required).
  const accepted = await waitFor('p_accepted_revision', async () => {
    const current = await api(p, `/api/boundary/current?workspaceId=${WORKSPACE}&artifactId=${ARTIFACT}`);
    return current?.ref ? { revision: current.ref.revision, candidateDigest: current.ref.candidateDigest } : undefined;
  }, 300_000);

  // 4. P offers a commitment; O decides it autonomously.
  const offered = await waitFor('commitment_offered', async () => {
    const list = await api(p, '/api/federation/commitments');
    return Array.isArray(list) && list.length >= 1 ? { commitments: list.map((c) => `${c.commitmentId}:${c.state}`) } : undefined;
  }, 300_000);
  const decided = await waitFor('commitment_decided_by_o', async () => {
    const list = await api(p, '/api/federation/commitments');
    const changed = (list ?? []).find((c) => c.state === 'ACTIVE' || c.state === 'REJECTED');
    return changed ? { commitmentId: changed.commitmentId, state: changed.state } : undefined;
  }, 300_000);

  // 5. Sovereignty: a message must not have created remote Work in O.
  const oWork = await api(o, '/api/application/projections/work').catch(() => undefined);
  const oTaskNodes = (oWork?.nodes ?? []).filter((node) => node.kind === 'task').length;

  // 6. Restart / cold-resume P.
  const pSessionId = p.ready?.sessionId;
  kill('palimpsest-p');
  metrics.restarts += 1;
  await new Promise((r) => setTimeout(r, 2500));
  const p2 = launchPrincipal('palimpsest-p', '', pSession, pSessionId);
  await waitFor('p_cold_resume_ready', () => p2.ready, 120_000);
  if (p2.ready?.mode === 'resume') metrics.coldResumes += 1;
  const reconstructed = await waitFor('state_reconstructed_after_restart', async () => {
    const list = await api(p2, '/api/federation/commitments');
    const current = await api(p2, `/api/boundary/current?workspaceId=${WORKSPACE}&artifactId=${ARTIFACT}`);
    return list !== undefined && current !== undefined ? { commitments: list.length, acceptedRevision: current?.ref?.revision ?? null } : undefined;
  }, 120_000);

  const result =
    oInbox && pending && accepted && offered && decided && reconstructed && oTaskNodes === 0 ? 'PASS' : 'PARTIAL';

  return {
    result,
    host: { dsh: '0.1.5-rc.2', profile: 'headless-style custom bundle palimpsest-dsh-host' },
    peers: { p: p.ready ?? null, o: o.ready ?? null },
    milestones: { oReceived: oInbox ?? null, pPending: pending ?? null, pAccepted: accepted ?? null, offered: offered ?? null, decidedByO: decided ?? null, reconstructed: reconstructed ?? null, oRemoteWorkTasks: oTaskNodes },
    metrics: { ...metrics, elapsedMs: at() },
    timeline,
    note: 'Cognitive decisions (counter-proposal, acceptance, commitment decision) are made by the LLM agents through palimpsest_* tools; the harness only launches, observes, restarts and injects faults. No chain-of-thought is captured.',
  };
}

const outIndex = process.argv.indexOf('--out');
let evidence;
try {
  evidence = await main();
} catch (error) {
  metrics.failures += 1;
  record('run_failed', { error: error?.stack ?? String(error) });
  evidence = { result: 'PARTIAL', metrics, timeline, error: String(error) };
} finally {
  for (const name of [...procs.keys()]) kill(name);
  await new Promise((r) => setTimeout(r, 500));
}
const json = JSON.stringify(evidence, null, 2);
if (outIndex >= 0 && process.argv[outIndex + 1]) writeFileSync(process.argv[outIndex + 1], json, 'utf8');
process.stdout.write(json + '\n');
process.exit(evidence.result === 'PASS' ? 0 : 2);
