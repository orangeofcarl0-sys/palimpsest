#!/usr/bin/env node
/**
 * RC-1 live cross-project qualification — Scenario D (§17) and Scenario E (§18).
 *
 *   node scripts/release/rc1-live-cross-project.mjs [--trials 5] [--e-trials 2]
 *
 * TWO REAL shipped DSH principals (two profiles, two state dirs, ONE shared transport
 * ledger and the two shared project-workspace files the UX-B/UX-C rigs use), each with
 * `projectDirectory` bindings and `attention.activation: "dsh"`. The origin user says
 * ONLY the §17 sentence. Nothing here calls any application surface or product tool on
 * the model's behalf: the harness prepares the two profiles, creates the two project
 * FIXTURES, spawns both shipped hosts, and reads observable evidence afterwards.
 *
 * The origin principal must reach `palimpsest_cross_project`; the remote principal must
 * be activated by the SHIPPED pump + product attention and answer; the origin must
 * surface that answer WITHOUT a second user prompt.
 *
 * Scenario E (§18) repeats the rig with an Ask whose content invites the REMOTE project
 * to use its own local collaboration. The harness never calls it for the model; whether
 * the remote chooses it is recorded honestly.
 *
 * Observable evidence per trial (§11/§41 — never chain-of-thought): the exact prompt;
 * both principals' `request/header` catalogues; every tool call + result; PALIMPSEST_
 * ACTIVATION lines; the final visible text of every turn; cross-project message counts;
 * branch process counts and every real branch session's own catalogue (§20). Token
 * usage is NOT exposed by this host and is therefore never invented (§31).
 */

import { spawn, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';
import { zstdDecompressSync } from 'node:zlib';

const REPO = join(import.meta.dirname, '..', '..');
const DSH_HOME = process.env.DSH_HOME?.trim() || 'C:/Users/66494/.dsh';
const DSH_BIN =
  process.env.DSH_BIN?.trim() || 'C:/Users/66494/AppData/Roaming/npm/node_modules/@deepseek-ai/dsh/lib/bin.js';
const PROFILES = join(DSH_HOME, 'profiles');
const HOST_BUNDLE = join(PROFILES, 'node_modules', 'palimpsest-dsh-host');

const ORIGIN = { who: 'origin', profile: 'rc1-live-cross-origin', projectId: 'detector', peer: 'detector-peer', alias: 'detector', display: 'the detector project' };
const REMOTE = { who: 'remote', profile: 'rc1-live-cross-remote', projectId: 'optics', peer: 'optics-peer', alias: 'optics', display: 'the optics project' };
const TRANSPORT_NAMESPACE = 'rc1-live-cross';

const argv = process.argv.slice(2);
const flagValue = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] !== undefined ? argv[index + 1] : fallback;
};
const D_TRIALS = Number(flagValue('--trials', '5'));
const E_TRIALS = Number(flagValue('--e-trials', '2'));
const TRIAL_TIMEOUT_MS = Number(flagValue('--trial-timeout', '600000'));
const IDLE_MS = 2000;

/** §17: the origin user says exactly this and nothing else. No ids, no peer refs, no second prompt. */
const D_PROMPT = '问一下之前那个 optics 项目，我们之前是否研究过探测器孔径对接收稳定性的影响？';
/** §18: an Ask whose content invites the REMOTE project to consider multiple approaches itself. */
const E_PROMPT =
  '问一下 optics 项目：降低探测器孔径对接收稳定性的影响，有哪几种彼此独立的方案？请它给出多个独立思路，并分别说明各自成立的条件。';

const trials = [];
const failures = [];

/* ------------------------------------------------------------------ *
 * Observable-evidence readers (spec §11: no chain-of-thought, ever)
 * ------------------------------------------------------------------ */

function readZstdFrames(absPath) {
  const buffer = readFileSync(absPath);
  const magic = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);
  const starts = [];
  for (let i = 0; i + 4 <= buffer.length; i += 1) {
    if (buffer.compare(magic, 0, 4, i, i + 4) === 0) starts.push(i);
  }
  let out = '';
  for (let i = 0; i < starts.length; i += 1) {
    const end = i + 1 < starts.length ? starts[i + 1] : buffer.length;
    try {
      out += zstdDecompressSync(buffer.subarray(starts[i], end)).toString('utf8');
    } catch {
      /* an unreadable frame is reported by the frame count, never silently trusted */
    }
  }
  return { text: out, frames: starts.length };
}

function sessionRecords(absPath) {
  const { text, frames } = readZstdFrames(absPath);
  const records = text
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return undefined;
      }
    })
    .filter((record) => record !== undefined);
  return { records, frames };
}

function sessionKeyForCwd(cwd) {
  return `--${cwd.replace(/\\/g, '-').replace(/:/g, '')}--`;
}

function sessionDirsForKey(cwd) {
  const keyDir = join(DSH_HOME, 'sessions', sessionKeyForCwd(cwd));
  if (!existsSync(keyDir)) return [];
  const found = [];
  for (const entry of readdirSync(keyDir)) {
    const dir = join(keyDir, entry);
    for (const name of ['session.v3.jsonl.zstd', 'session.jsonl.zstd']) {
      const file = join(dir, name);
      if (existsSync(file)) {
        found.push({ sessionId: entry, file, mtimeMs: statSync(file).mtimeMs });
        break;
      }
    }
  }
  return found;
}

function findSessionById(sessionId) {
  if (typeof sessionId !== 'string' || sessionId === '') return undefined;
  const root = join(DSH_HOME, 'sessions');
  if (!existsSync(root)) return undefined;
  for (const key of readdirSync(root)) {
    for (const name of ['session.v3.jsonl.zstd', 'session.jsonl.zstd']) {
      const file = join(root, key, sessionId, name);
      if (existsSync(file)) return file;
    }
  }
  return undefined;
}

function cataloguesOf(records) {
  const found = [];
  (function walk(value) {
    if (Array.isArray(value)) {
      for (const item of value) walk(item);
      return;
    }
    if (value === null || typeof value !== 'object') return;
    if (
      Array.isArray(value.tools) &&
      value.tools.length > 0 &&
      value.tools.every((tool) => tool !== null && (typeof tool === 'string' || typeof tool.name === 'string'))
    ) {
      found.push(value.tools.map((tool) => (typeof tool === 'string' ? tool : tool.name)));
    }
    for (const key of Object.keys(value)) walk(value[key]);
  })(records);
  return found;
}

function observedModelOf(records) {
  for (const record of records) {
    if (String(record?.type ?? '') !== 'request/header') continue;
    const config = record?.data?.header?.config;
    if (config !== undefined && typeof config === 'object') return { provider: config.provider ?? null, model: config.model ?? null };
  }
  return { provider: null, model: null };
}

function callsWithResults(records) {
  const resultsByCallId = new Map();
  for (const record of records) {
    if (String(record?.type ?? '') !== 'tool/result') continue;
    const parts = Array.isArray(record?.data?.message?.content) ? record.data.message.content : [];
    for (const part of parts) {
      if (part?.type !== 'tool-result') continue;
      const text = Array.isArray(part.content)
        ? part.content.map((block) => (typeof block?.text === 'string' ? block.text : '')).join('')
        : '';
      resultsByCallId.set(part.toolCallId, { text, isError: part.isError === true });
    }
  }
  const calls = [];
  for (const record of records) {
    if (String(record?.type ?? '') !== 'tool/call') continue;
    const payload = record.data ?? {};
    let args = payload.arguments ?? null;
    if (typeof args === 'string') {
      try {
        args = JSON.parse(args);
      } catch {
        /* keep raw */
      }
    }
    calls.push({
      callId: payload.callId ?? null,
      seq: typeof record.seq === 'number' ? record.seq : null,
      turn: typeof record.data?.turn === 'number' ? record.data.turn : null,
      name: payload.name ?? '<unknown>',
      args,
      result: resultsByCallId.get(payload.callId) ?? null,
    });
  }
  return calls;
}

/** Every assistant message with the turn it belongs to (turn > the Ask turn ⇒ activated). */
function assistantMessagesOf(records) {
  const found = [];
  for (const record of records) {
    if (String(record?.type ?? '') !== 'assistant/message') continue;
    const payload = record?.data ?? record;
    const parts = Array.isArray(payload?.content) ? payload.content : Array.isArray(payload?.message?.content) ? payload.message.content : [];
    const text = parts
      .map((part) => (typeof part === 'string' ? part : typeof part?.text === 'string' ? part.text : ''))
      .join('')
      .trim();
    if (text !== '') found.push({ turn: typeof payload?.turn === 'number' ? payload.turn : null, seq: record.seq ?? null, text });
  }
  return found;
}

function parseRenderedJson(text) {
  if (typeof text !== 'string') return undefined;
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end <= start) return undefined;
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch {
      return undefined;
    }
  }
}

function finalAssistantText(records) {
  let text = '';
  for (const record of records) {
    if (String(record?.type ?? '') !== 'assistant/message') continue;
    const payload = record?.data ?? record;
    const parts = Array.isArray(payload?.content) ? payload.content : Array.isArray(payload?.message?.content) ? payload.message.content : [];
    const joined = parts
      .map((part) => (typeof part === 'string' ? part : typeof part?.text === 'string' ? part.text : ''))
      .join('')
      .trim();
    if (joined !== '') text = joined;
  }
  return text;
}

/** Text of a user/assistant message record (the two record shapes differ). */
function messageTextOf(record) {
  const payload = record?.data ?? record ?? {};
  const parts = Array.isArray(payload.content) ? payload.content : Array.isArray(payload.message?.content) ? payload.message.content : [];
  return parts
    .map((part) => (typeof part === 'string' ? part : typeof part?.text === 'string' ? part.text : ''))
    .join('')
    .trim();
}

function firstUserPrompt(records) {
  for (const record of records) {
    if (String(record?.type ?? '') !== 'user/message') continue;
    const text = messageTextOf(record);
    if (text !== '') return text;
  }
  return '';
}

/** Every user message the principal received (launch prompt + delivered attention texts). */
function userMessagesOf(records) {
  const found = [];
  for (const record of records) {
    if (String(record?.type ?? '') !== 'user/message') continue;
    const text = messageTextOf(record);
    if (text !== '') found.push(text);
  }
  return found;
}

/**
 * The shipped product attention text (`crossProjectAttentionText`) is the observable
 * proof that the deployment's pump+drain+activate lifecycle reached this principal —
 * stdout is not reliably readable from a long-running host, but the delivered turn is.
 */
const PRODUCT_ATTENTION_MARKER = '[palimpsest cross-project]';

/* ------------------------------------------------------------------ *
 * Rig preparation
 * ------------------------------------------------------------------ */

function setupBundle() {
  mkdirSync(PROFILES, { recursive: true });
  mkdirSync(join(PROFILES, 'node_modules'), { recursive: true });
  rmSync(HOST_BUNDLE, { recursive: true, force: true });
  cpSync(join(REPO, 'host', 'dsh'), HOST_BUNDLE, { recursive: true });
}

function writeProfile(side, root, shared) {
  const dir = join(root, side.who);
  mkdirSync(dir, { recursive: true });
  const profileDir = join(PROFILES, side.profile);
  mkdirSync(profileDir, { recursive: true });
  writeFileSync(
    join(profileDir, 'package.json'),
    JSON.stringify(
      {
        name: `dsh-profile-${side.profile}`,
        private: true,
        dependencies: {},
        dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', 'palimpsest-dsh-host'], patchReload: 'startup' } },
      },
      null,
      2,
    ),
  );
  const other = side.who === 'origin' ? REMOTE : ORIGIN;
  const deployment = {
    schemaVersion: 1,
    profileId: side.profile,
    projectId: side.projectId,
    localPeer: side.peer,
    persistentPoint: `pp-${side.who}`,
    repository: REPO,
    transport: { namespace: TRANSPORT_NAMESPACE, databasePath: shared.transport },
    databases: {
      orchestration: join(dir, 'orchestration.sqlite'),
      ordarium: join(dir, 'ordarium.sqlite'),
      coordination: join(dir, 'coordination.sqlite'),
      transportCursors: join(dir, 'cursors.sqlite'),
      attentionMarks: join(dir, 'attention.sqlite'),
      // SC-16: the SAME two physical files for both installations, each opened by its
      // own handle (the UX-B/UX-C rig shape) — ProjectWorkspace scope stays isolated.
      projectAssociations: shared.associations,
      projectJournal: shared.journal,
    },
    directory: [
      { peerId: side.peer, competenceTags: [side.alias] },
      { peerId: other.peer, competenceTags: [other.alias] },
    ],
    projectDirectory: [
      { projectId: ORIGIN.projectId, displayName: ORIGIN.display, aliases: [ORIGIN.alias], peerId: ORIGIN.peer, competenceTags: [ORIGIN.alias] },
      { projectId: REMOTE.projectId, displayName: REMOTE.display, aliases: [REMOTE.alias], peerId: REMOTE.peer, competenceTags: [REMOTE.alias] },
    ],
    reasoning: {},
    attention: { policyId: `${side.profile}-attention-v1`, cooldownMs: 0, activation: 'dsh' },
  };
  const deploymentPath = join(dir, 'deployment.json');
  writeFileSync(deploymentPath, JSON.stringify(deployment, null, 2));
  writeFileSync(
    join(profileDir, 'cordis.patch.yml'),
    `- id: palimpsest-tools\n  config:\n    palimpsestEntry: '${join(REPO, 'dist', 'src', 'advanced.js')}'\n    deploymentProfile: '${deploymentPath}'\n    serve: false\n`,
  );
  return deploymentPath;
}

async function initProjectFixture(deploymentPath, projectId) {
  const { launchDeployment, parseDeploymentProfile } = await import(
    pathToFileURL(join(REPO, 'dist', 'src', 'deployment', 'index.js')).href
  );
  const profile = parseDeploymentProfile(JSON.parse(readFileSync(deploymentPath, 'utf8')));
  const deployment = launchDeployment(profile);
  try {
    if (!deployment.installed.controller.isProjectInitialized()) {
      deployment.installed.controller.start({
        projectId,
        goal: `${projectId} live cross-project qualification`,
        requirements: [{ requirement_id: 'req-1', statement: 'collaborate', priority: 'normal', acceptance_refs: [] }],
        decisions: [],
        tasks: [],
        committedAt: '2026-09-17T00:00:00Z',
      });
    }
  } finally {
    try {
      await deployment.close();
    } catch {
      /* best effort */
    }
  }
}

/* ------------------------------------------------------------------ *
 * One real shipped principal process
 * ------------------------------------------------------------------ */

function spawnPrincipal({ side, stateDir, prompt }) {
  const sessionFile = join(stateDir, 'session-id.txt');
  const args = [DSH_BIN, '--profile', side.profile, '--session-file', sessionFile, '--idle-ms', String(IDLE_MS)];
  if (typeof prompt === 'string' && prompt !== '') args.push(prompt);
  const child = spawn(process.execPath, args, { cwd: stateDir, stdio: ['ignore', 'pipe', 'pipe'] });
  const state = { stdout: '', stderr: '', turns: [], activations: [], exitCode: null, exited: false, sessionFile };
  child.stdout.on('data', (chunk) => {
    state.stdout += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    state.stderr += chunk.toString();
  });
  child.on('close', (code) => {
    state.exitCode = code;
    state.exited = true;
  });
  return { child, state };
}

function parseTurns(stdout) {
  const turns = [];
  const activations = [];
  for (const line of stdout.split('\n')) {
    if (line.startsWith('PALIMPSEST_TURN ')) {
      try {
        turns.push(JSON.parse(line.slice('PALIMPSEST_TURN '.length)));
      } catch {
        /* ignore malformed line */
      }
    }
    if (line.startsWith('PALIMPSEST_ACTIVATION ')) {
      try {
        activations.push(JSON.parse(line.slice('PALIMPSEST_ACTIVATION '.length)));
      } catch {
        /* ignore malformed line */
      }
    }
  }
  return { turns, activations };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function pollUntil(predicate, timeoutMs, intervalMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    let value;
    try {
      value = await predicate();
    } catch {
      value = null;
    }
    if (value !== null && value !== undefined && value !== false) return value;
    if (Date.now() >= deadline) return null;
    await sleep(intervalMs);
  }
}

function readSideEvidence(principal, stateDir, startedAt) {
  const { turns, activations } = parseTurns(principal.state.stdout);
  let sessionId;
  try {
    const recorded = readFileSync(principal.state.sessionFile, 'utf8').trim();
    sessionId = recorded === '' ? undefined : recorded;
  } catch {
    sessionId = undefined;
  }
  const sessionFile =
    findSessionById(sessionId) ?? sessionDirsForKey(stateDir).sort((a, b) => b.mtimeMs - a.mtimeMs)[0]?.file;
  const session = sessionFile === undefined ? { records: [], frames: 0 } : sessionRecords(sessionFile);
  const catalogues = cataloguesOf(session.records);
  const calls = callsWithResults(session.records);
  const branchSessions = sessionDirsForKey(stateDir).filter(
    (entry) => entry.sessionId !== sessionId && entry.mtimeMs >= startedAt - 5_000,
  );
  const branchCatalogues = [];
  for (const entry of branchSessions) {
    try {
      branchCatalogues.push(...cataloguesOf(sessionRecords(entry.file).records));
    } catch {
      /* unreadable branch artifact is reported by its absence */
    }
  }
  return {
    sessionId: sessionId ?? null,
    sessionFile: sessionFile ?? null,
    catalogue: catalogues[0] ?? [],
    catalogueSize: catalogues[0]?.length ?? 0,
    observedProviderModel: observedModelOf(session.records),
    toolCalls: calls.map((call) => ({ name: call.name, args: call.args, isError: call.result?.isError ?? null })),
    toolNames: calls.map((call) => call.name),
    calls,
    assistantMessages: assistantMessagesOf(session.records),
    stdoutLength: principal.state.stdout.length,
    stdoutSample: principal.state.stdout.slice(0, 400),
    crossProjectCalls: calls
      .filter((call) => call.name === 'palimpsest_cross_project')
      .map((call) => ({ action: call.args?.action ?? null, target: call.args?.target ?? null, status: (parseRenderedJson(call.result?.text ?? '') ?? {})?.status ?? null })),
    collaborateExecutions: calls
      .filter((call) => call.name === 'palimpsest_collaborate')
      .map((call) => parseRenderedJson(call.result?.text ?? '')?.executionKind ?? null),
    stdoutTurns: turns,
    activations,
    exitCode: principal.state.exitCode,
    exited: principal.state.exited,
    stderrTail: principal.state.stderr.slice(-400),
    finalAssistantText: finalAssistantText(session.records),
    firstUserPrompt: firstUserPrompt(session.records),
    userMessages: userMessagesOf(session.records),
    attentionDelivered: userMessagesOf(session.records).some((text) => text.includes(PRODUCT_ATTENTION_MARKER)),
    stdoutActivations: activations,
    branchProcessCount: branchSessions.length,
    branchCatalogues,
  };
}

/* ------------------------------------------------------------------ *
 * One live cross-project trial
 * ------------------------------------------------------------------ */

const INTERNAL_ID = /\b(cl-|br-|thr-|cell-|pje-|paa-)[0-9a-f]{6,}|\b(detector-peer|optics-peer)\b/u;
// The cross-project REQUEST id is the handle the product itself returns so the
// principal can poll `status`/`receive`; mentioning it is recorded separately rather
// than treated as an internal-identity disclosure.
const REQUEST_ID = /cpq-[0-9a-f]{6,}/u;
const CLAIMS_VERIFIED = /(independently verified|独立验证通过|已被独立验证)/iu;
const CLAIMS_COMMITMENT = /(commitment|承诺|已委托|已指派|assignment|bound)\b/iu;
const LIMITATION = /(无法|不能|不可用|未配置|没有.*项目|不存在|unknown|cannot|can't|unable|unavailable|no such project|not configured|not registered)/iu;

/**
 * "The origin surfaces the answer without a second user prompt": the origin's own
 * session must contain an assistant message that follows an ANSWERED `receive`/`status`
 * call, in sequence order. (The DSH agent reuses one top-level turn index for
 * attention-spliced messages, so sequence position — not the `turn` field — is the
 * observable that distinguishes the launch turn from the activated turn.)
 */
function originSurfacing(evidence) {
  const answered = [...evidence.calls]
    .reverse()
    .find(
      (call) =>
        call.name === 'palimpsest_cross_project' &&
        (call.args?.action === 'receive' || call.args?.action === 'status') &&
        (parseRenderedJson(call.result?.text ?? '') ?? {}).status === 'ANSWERED',
    );
  if (answered === undefined || answered.seq === null) return { surfaced: false, text: '', answeredSeq: null, laterCount: 0 };
  const later = evidence.assistantMessages.filter(
    (message) => message.seq !== null && message.seq > answered.seq && message.text.trim() !== '',
  );
  return {
    surfaced: later.length > 0,
    text: later.length > 0 ? later[later.length - 1].text : '',
    answeredSeq: answered.seq,
    laterCount: later.length,
  };
}

async function trial({ scenario, prompt, index, expectRemoteCollaborate }) {
  const root = join(tmpdir(), `palimpsest-rc1-cross-${scenario}-${process.pid}-${Date.now()}-${index}`);
  const shared = {
    transport: join(root, 'transport.sqlite'),
    associations: join(root, 'shared-associations.sqlite'),
    journal: join(root, 'shared-journal.sqlite'),
  };
  mkdirSync(root, { recursive: true });
  setupBundle();
  const originPath = writeProfile(ORIGIN, root, shared);
  const remotePath = writeProfile(REMOTE, root, shared);
  const originState = join(root, ORIGIN.who);
  const remoteState = join(root, REMOTE.who);
  let fixtureFailure = null;
  try {
    await initProjectFixture(originPath, ORIGIN.projectId);
    await initProjectFixture(remotePath, REMOTE.projectId);
  } catch (error) {
    fixtureFailure = error?.message ?? String(error);
  }

  const startedAt = Date.now();
  const remote = spawnPrincipal({ side: REMOTE, stateDir: remoteState, prompt: '' });
  const origin = spawnPrincipal({ side: ORIGIN, stateDir: originState, prompt });

  let failure = null;
  try {
    // The origin must reach the product tool; the remote must be pumped+activated by
    // the shipped host, answer through the product tool, and the origin must surface
    // the answer on a LATER turn without any further user input.
    const done = await pollUntil(async () => {
      const originEvidence = readSideEvidence(origin, originState, startedAt);
      const remoteEvidence = readSideEvidence(remote, remoteState, startedAt);
      const asked = originEvidence.crossProjectCalls.some((call) => call.action === 'ask');
      const remoteActivated =
        remoteEvidence.attentionDelivered || remoteEvidence.stdoutActivations.some((entry) => entry.activated === true);
      const remoteAnswered = remoteEvidence.crossProjectCalls.some((call) => call.action === 'respond');
      const surfacing = originSurfacing(originEvidence);
      const originSurfaced = surfacing.surfaced;
      if (process.env.RC1_DEBUG_POLL) {
        process.stderr.write(
          `[poll] asked=${asked} remoteActivated=${remoteActivated} remoteAnswered=${remoteAnswered} originSurfaced=${originSurfaced} ` +
            `answeredSeq=${surfacing.answeredSeq} laterMsgs=${surfacing.laterCount} ` +
            `originSess=${String(originEvidence.sessionFile).split(/[\\/]/u).slice(-1)[0]} originCalls=${originEvidence.calls.length} ` +
            `msgs=${JSON.stringify(originEvidence.assistantMessages.map((m) => m.seq))} ` +
            `receive=${JSON.stringify(originEvidence.crossProjectCalls.filter((c) => c.action === 'receive' || c.action === 'status'))} ` +
            `remoteCalls=${JSON.stringify(remoteEvidence.crossProjectCalls)}\n`,
        );
      }
      if (asked && remoteActivated && remoteAnswered && originSurfaced) return { originEvidence, remoteEvidence };
      if (origin.state.exited || remote.state.exited) return { originEvidence, remoteEvidence, exited: true };
      return null;
    }, TRIAL_TIMEOUT_MS);
    if (done === null) failure = 'timeout';
    return await finalize({ scenario, prompt, index, expectRemoteCollaborate, root, startedAt, origin, remote, originState, remoteState, failure, fixtureFailure, done });
  } catch (error) {
    failure = error?.stack ?? String(error);
    return await finalize({ scenario, prompt, index, expectRemoteCollaborate, root, startedAt, origin, remote, originState, remoteState, failure, fixtureFailure, done: null });
  } finally {
    for (const principal of [origin, remote]) {
      try {
        principal.child.kill('SIGKILL');
      } catch {
        /* already gone */
      }
    }
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      /* Windows may hold a handle briefly */
    }
  }
}

async function finalize({ scenario, prompt, index, expectRemoteCollaborate, root, startedAt, origin, remote, originState, remoteState, failure, fixtureFailure, done }) {
  const originEvidence = done?.originEvidence ?? readSideEvidence(origin, originState, startedAt);
  const remoteEvidence = done?.remoteEvidence ?? readSideEvidence(remote, remoteState, startedAt);
  const asked = originEvidence.crossProjectCalls.some((call) => call.action === 'ask');
  const askStatus = originEvidence.crossProjectCalls.find((call) => call.action === 'ask')?.status ?? null;
  const remoteActivated =
    remoteEvidence.attentionDelivered || remoteEvidence.stdoutActivations.some((entry) => entry.activated === true);
  const originActivated =
    originEvidence.attentionDelivered || originEvidence.stdoutActivations.some((entry) => entry.activated === true);
  const remoteAnswered = remoteEvidence.crossProjectCalls.some((call) => call.action === 'respond');
  const askTurn =
    originEvidence.calls.find((call) => call.name === 'palimpsest_cross_project' && call.args?.action === 'ask')?.turn ?? null;
  const surfacing = originSurfacing(originEvidence);
  const originSurfaced = surfacing.surfaced;
  const stdoutText = originEvidence.stdoutTurns.length > 0 ? originEvidence.stdoutTurns[originEvidence.stdoutTurns.length - 1].text ?? '' : '';
  const surfacedText = surfacing.text || stdoutText || originEvidence.finalAssistantText;
  const remoteUsedCollaborate = remoteEvidence.toolNames.includes('palimpsest_collaborate');
  const leakedIds = INTERNAL_ID.test(surfacedText ?? '');
  const surfacedRequestId = REQUEST_ID.test(surfacedText ?? '');
  const claimsVerified = CLAIMS_VERIFIED.test(surfacedText ?? '');
  const claimsCommitment = CLAIMS_COMMITMENT.test(surfacedText ?? '');
  const invented = !asked && LIMITATION.test(surfacedText ?? '') === false && (surfacedText ?? '').trim() !== '' && /optics/iu.test(surfacedText ?? '');

  const productD = asked && remoteActivated && remoteAnswered && originSurfaced;
  const branchCatalogues = [...originEvidence.branchCatalogues, ...remoteEvidence.branchCatalogues];
  const branchIsolated = branchCatalogues.every((catalogue) => catalogue.length === 1 && catalogue[0] === 'palimpsest_branch_result');

  let verdict;
  if (failure !== null && !productD) {
    verdict = /timeout/u.test(failure) ? 'REMOTE_RESULT_NOT_SURFACED' : 'INFRASTRUCTURE_ERROR';
  } else if (done?.exited === true && !productD) {
    verdict = 'INFRASTRUCTURE_ERROR';
  } else if (!asked) {
    verdict = 'MODEL_DID_NOT_SELECT_PRODUCT_TOOL';
  } else if (!remoteActivated) {
    verdict = 'HOST_ACTIVATION_FAILED';
  } else if (!remoteAnswered) {
    verdict = 'MODEL_DID_NOT_SELECT_PRODUCT_TOOL';
  } else if (!originSurfaced) {
    verdict = 'REMOTE_RESULT_NOT_SURFACED';
  } else if (leakedIds || claimsVerified || claimsCommitment) {
    verdict = 'PRODUCT_COPY_MISREPRESENTED_RESULT';
  } else if (invented) {
    verdict = 'MODEL_TASK_QUALITY_FAILURE';
  } else {
    verdict = 'PASS';
  }

  const record = {
    scenario,
    trial: index,
    prompt,
    freshSession: true,
    expectation: expectRemoteCollaborate
      ? 'cross-project Ask; the REMOTE project may itself choose palimpsest_collaborate (the harness must not call it)'
      : 'cross-project Ask → remote shipped pump+attention → remote answer → origin surfaces it without a second prompt',
    fixtureFailure,
    sharedTransport: TRANSPORT_NAMESPACE,
    sharedWorkspaceFiles: ['shared-associations.sqlite', 'shared-journal.sqlite'],
    wallMs: Date.now() - startedAt,
    askStatus,
    askTurn,
    origin: {
      observedProviderModel: originEvidence.observedProviderModel,
      catalogueSize: originEvidence.catalogueSize,
      principalCatalogue: originEvidence.catalogue,
      toolNames: originEvidence.toolNames,
      crossProjectCalls: originEvidence.crossProjectCalls,
      stdoutTurns: originEvidence.stdoutTurns,
      stdoutLength: originEvidence.stdoutLength,
      stdoutSample: originEvidence.stdoutSample,
      assistantTurns: originEvidence.assistantMessages.map((message) => message.turn),
      userMessages: originEvidence.userMessages,
      attentionDelivered: originEvidence.attentionDelivered,
      finalAssistantText: originEvidence.finalAssistantText,
      branchProcessCount: originEvidence.branchProcessCount,
      exitCode: originEvidence.exitCode,
    },
    remote: {
      observedProviderModel: remoteEvidence.observedProviderModel,
      catalogueSize: remoteEvidence.catalogueSize,
      principalCatalogue: remoteEvidence.catalogue,
      toolNames: remoteEvidence.toolNames,
      crossProjectCalls: remoteEvidence.crossProjectCalls,
      collaborateExecutions: remoteEvidence.collaborateExecutions,
      stdoutTurns: remoteEvidence.stdoutTurns,
      activations: remoteEvidence.stdoutActivations,
      userMessages: remoteEvidence.userMessages,
      attentionDelivered: remoteEvidence.attentionDelivered,
      finalAssistantText: remoteEvidence.finalAssistantText,
      branchProcessCount: remoteEvidence.branchProcessCount,
      exitCode: remoteEvidence.exitCode,
    },
    crossProjectMessageCount: {
      originAsks: originEvidence.crossProjectCalls.filter((call) => call.action === 'ask').length,
      remoteResponses: remoteEvidence.crossProjectCalls.filter((call) => call.action === 'respond').length,
      originReceives: originEvidence.crossProjectCalls.filter((call) => call.action === 'status' || call.action === 'receive').length,
    },
    remoteUsedCollaborate,
    remoteCollaborateExecutionKinds: remoteEvidence.collaborateExecutions,
    remoteActivated,
    originActivated,
    originSurfacedWithoutSecondPrompt: originSurfaced,
    pollExitedBeforeCompletion: done?.exited === true,
    surfacedText: surfacedText ?? '',
    leakedInternalIds: leakedIds,
    surfacedRequestId,
    claimsVerified,
    claimsCommitment,
    inventedProject: invented,
    branchProcessCount: originEvidence.branchProcessCount + remoteEvidence.branchProcessCount,
    branchCatalogues,
    branchCapabilityIsolated: branchIsolated,
    tokenUsage: 'unavailable (the host exposes no token accounting)',
    failure,
    verdict,
  };
  trials.push(record);
  console.log(
    `  ${scenario}#${index}: ${verdict} | originTools=${JSON.stringify(originEvidence.toolNames)} | remoteTools=${JSON.stringify(remoteEvidence.toolNames)} | ` +
      `originTurns=${originEvidence.stdoutTurns.length} | remoteBranches=${remoteEvidence.branchProcessCount} | remoteCollaborate=${remoteUsedCollaborate} | wall=${Math.round(record.wallMs / 1000)}s`,
  );
  return record;
}

/* ------------------------------------------------------------------ *
 * Main
 * ------------------------------------------------------------------ */

const startedAt = Date.now();
console.log(`RC-1 live cross-project qualification — D:${D_TRIALS} trials, E:${E_TRIALS} trials, real model-driven principals`);

try {
  for (let i = 1; i <= D_TRIALS; i += 1) {
    await trial({ scenario: 'D_cross_project_ask', prompt: D_PROMPT, index: i, expectRemoteCollaborate: false });
  }
  for (let i = 1; i <= E_TRIALS; i += 1) {
    await trial({ scenario: 'E_remote_local_collaboration', prompt: E_PROMPT, index: i, expectRemoteCollaborate: true });
  }
} catch (error) {
  failures.push(`unhandled: ${error?.stack ?? String(error)}`);
}

const passesOf = (records) => records.filter((record) => record.verdict === 'PASS').length;
const dTrials = trials.filter((record) => record.scenario === 'D_cross_project_ask');
const eTrials = trials.filter((record) => record.scenario === 'E_remote_local_collaboration');
const violations = trials.filter((record) => record.leakedInternalIds || record.claimsVerified || record.claimsCommitment);
const qualified = dTrials.length > 0 && passesOf(dTrials) >= Math.max(1, Math.ceil((dTrials.length * 4) / 5));
if (dTrials.length > 0 && !qualified) {
  failures.push(`scenario D: fewer than 4/5 cross-project trials completed the intended product path (${passesOf(dTrials)}/${dTrials.length})`);
}
if (violations.length > 0) failures.push('a cross-project trial produced a copy/disclosure violation');
if (
  trials.some((record) => record.branchProcessCount > 0) &&
  !trials.filter((record) => record.branchProcessCount > 0).every((record) => record.branchCapabilityIsolated)
) {
  failures.push('§20 branch catalogue widened beyond exactly ["palimpsest_branch_result"]');
}

const gitHead = (() => {
  try {
    return spawnSync('git', ['-C', REPO, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout?.trim() ?? null;
  } catch {
    return null;
  }
})();

const summary = {
  scenario: 'RC-1 live cross-project (D/E)',
  environment: {
    provider: 'openrouter-stealth (from ~/.dsh/settings.yaml; observed per trial in the request header)',
    model: 'stealth/union-alpha (observed per trial in the request header)',
    dshBin: DSH_BIN,
    nodeVersion: process.version,
    palimpsestRepo: REPO,
    palimpsestCommit: gitHead,
    ordariumVersion: '1.3.1 (package.json release pin)',
    os: `${process.platform} ${process.arch}`,
    dTrials: D_TRIALS,
    eTrials: E_TRIALS,
    tokenAccounting: 'unavailable — never invented (§31)',
  },
  criteria: {
    scenarioD_passes: passesOf(dTrials),
    scenarioD_total: dTrials.length,
    scenarioD_qualified: qualified,
    scenarioE_trials: eTrials.length,
    scenarioE_remote_used_collaborate: eTrials.filter((record) => record.remoteUsedCollaborate).length,
    no_copy_or_disclosure_violation: violations.length === 0,
    branch_catalogue_isolation: trials
      .filter((record) => record.branchProcessCount > 0)
      .every((record) => record.branchCapabilityIsolated),
  },
  trials,
  durationMs: Date.now() - startedAt,
  failures,
  pass: failures.length === 0,
};

mkdirSync(join(REPO, 'release-evidence'), { recursive: true });
writeFileSync(join(REPO, 'release-evidence', 'rc1-live-cross-project.json'), `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify({ criteria: summary.criteria, failures, pass: summary.pass }, null, 2));
console.log(`pass=${summary.pass}`);
process.exit(summary.pass ? 0 : 1);
