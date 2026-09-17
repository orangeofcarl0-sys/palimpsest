#!/usr/bin/env node
/**
 * RC-1R live cross-project qualification — Scenario D (§8) and Scenario E (§9).
 *
 *   node scripts/release/rc1-live-cross-project.mjs [--trials 5] [--e-trials 5] [--out <file>]
 *
 * TWO REAL shipped DSH principals (two profiles, two state dirs, ONE shared transport
 * ledger and the two shared project-workspace files the UX-B/UX-C rigs use), each with
 * `projectDirectory` bindings and `attention.activation: "dsh"`. The origin user says
 * ONLY the §8 sentence and NOTHING else, ever. Nothing here calls any application surface
 * or product tool on the model's behalf: the harness prepares the two profiles, creates
 * the two project FIXTURES, spawns both shipped hosts, and reads observable evidence
 * afterwards.
 *
 * The origin principal must reach `palimpsest_cross_project`; the remote principal must be
 * activated by the SHIPPED pump + product attention and answer; the origin must surface
 * that answer on a LATER attention-driven turn WITHOUT a second user prompt.
 *
 * Scenario E (§9) repeats the rig with an Ask whose content invites the REMOTE project to
 * consider multiple approaches itself. E is strictly stronger than D: a real remote
 * `palimpsest_collaborate` call is REQUIRED. The harness never calls it for the model and
 * never puts that instruction in harness-side text; whether the remote chooses it is
 * recorded honestly.
 *
 * RC-1R §28: every trial records `raw` (prompt, catalogues, every call with its full
 * rendered result, assistant messages with session positions, delivered user messages,
 * activation records, branch catalogues) separately from `judgment` (productRoute,
 * semanticOutcome, surfaced, verdict, classification, reason, violations, advisories),
 * and the judgement comes from the ONE shared oracle in `test/support/rc1_oracle.ts`.
 */

import { spawn, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

const oracle = await import(pathToFileURL(join(REPO, 'dist', 'test', 'support', 'rc1_oracle.js')).href);

const argv = process.argv.slice(2);
const flagValue = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] !== undefined ? argv[index + 1] : fallback;
};
const D_TRIALS = Number(flagValue('--trials', '5'));
const E_TRIALS = Number(flagValue('--e-trials', '5'));
const OUT_FILE = flagValue('--out', 'rc1-live-cross-project.json');
const TRIAL_TIMEOUT_MS = Number(flagValue('--trial-timeout', '900000'));
const IDLE_MS = 2000;

/** §8: the origin user says exactly this and nothing else. No ids, no peer refs, no second prompt. */
const D_PROMPT = '问一下之前那个 optics 项目，我们之前是否研究过探测器孔径对接收稳定性的影响？';
/** §9: an Ask whose content invites the REMOTE project to consider multiple approaches itself. */
const E_PROMPT =
  '问一下 optics 项目：降低探测器孔径对接收稳定性的影响，有哪几种彼此独立的方案？请它给出多个独立思路，并分别说明各自成立的条件。';

const trials = [];
const failures = [];

/** Incremental evidence write: a killed run never loses the trials it already ran. */
function writePartial() {
  mkdirSync(join(REPO, 'release-evidence'), { recursive: true });
  writeFileSync(
    join(REPO, 'release-evidence', OUT_FILE),
    `${JSON.stringify({ scenario: 'RC-1R live cross-project (D/E)', partial: true, trials }, null, 2)}\n`,
  );
}

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
    if (config !== undefined && typeof config === 'object') {
      return { provider: config.provider ?? null, model: config.model ?? null };
    }
  }
  return { provider: null, model: null };
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
    const result = resultsByCallId.get(payload.callId) ?? null;
    calls.push({
      name: payload.name ?? '<unknown>',
      args,
      seq: typeof record.seq === 'number' ? record.seq : null,
      turn: typeof payload.turn === 'number' ? payload.turn : null,
      result,
      rendered: result === null ? undefined : parseRenderedJson(result.text),
    });
  }
  return calls;
}

/** Every assistant message with the session position that orders it (§7). */
function assistantMessagesOf(records) {
  const found = [];
  for (const record of records) {
    if (String(record?.type ?? '') !== 'assistant/message') continue;
    const payload = record?.data ?? record;
    const parts = Array.isArray(payload?.content)
      ? payload.content
      : Array.isArray(payload?.message?.content)
        ? payload.message.content
        : [];
    const text = parts
      .map((part) => (typeof part === 'string' ? part : typeof part?.text === 'string' ? part.text : ''))
      .join('')
      .trim();
    if (text !== '') {
      found.push({ turn: typeof payload?.turn === 'number' ? payload.turn : null, seq: record.seq ?? null, text });
    }
  }
  return found;
}

function finalAssistantText(records) {
  const messages = assistantMessagesOf(records);
  return messages.length === 0 ? '' : (messages[messages.length - 1].text ?? '');
}

function messageTextOf(record) {
  const payload = record?.data ?? record ?? {};
  const parts = Array.isArray(payload.content)
    ? payload.content
    : Array.isArray(payload.message?.content)
      ? payload.message.content
      : [];
  return parts
    .map((part) => (typeof part === 'string' ? part : typeof part?.text === 'string' ? part.text : ''))
    .join('')
    .trim();
}

function userMessagesOf(records) {
  const found = [];
  for (const record of records) {
    if (String(record?.type ?? '') !== 'user/message') continue;
    const text = messageTextOf(record);
    if (text !== '') found.push(text);
  }
  return found;
}

function firstUserPrompt(records) {
  for (const record of records) {
    if (String(record?.type ?? '') !== 'user/message') continue;
    const text = messageTextOf(record);
    if (text !== '') return text;
  }
  return '';
}

function machineRecordsOf(stdout) {
  const turns = [];
  const activations = [];
  const malformed = [];
  for (const line of String(stdout).split('\n')) {
    if (line.startsWith('PALIMPSEST_TURN ')) {
      try {
        turns.push(JSON.parse(line.slice('PALIMPSEST_TURN '.length)));
      } catch {
        malformed.push(`PALIMPSEST_TURN:${line.slice(0, 120)}`);
      }
    } else if (line.startsWith('PALIMPSEST_ACTIVATION ')) {
      try {
        activations.push(JSON.parse(line.slice('PALIMPSEST_ACTIVATION '.length)));
      } catch {
        malformed.push(`PALIMPSEST_ACTIVATION:${line.slice(0, 120)}`);
      }
    } else if (line.includes('PALIMPSEST_ACTIVATION ') || line.includes('PALIMPSEST_TURN ')) {
      // §5/§27: an unterminated record shares a physical line with the next one.
      malformed.push(`SHARED_LINE:${line.slice(0, 200)}`);
    }
  }
  return { turns, activations, malformed };
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
  const state = { stdout: '', stderr: '', exitCode: null, exited: false, sessionFile, launchPrompts: [] };
  if (typeof prompt === 'string' && prompt !== '') state.launchPrompts.push(prompt);
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

/** The RAW side observation (§28) — no verdicts, no derived booleans beyond plumbing. */
function readSideEvidence(principal, stateDir, startedAt) {
  const machine = machineRecordsOf(principal.state.stdout);
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
    (entry) => entry.sessionId.startsWith('branch-') && entry.mtimeMs >= startedAt - 5_000,
  );
  const branchCatalogues = [];
  for (const entry of branchSessions) {
    try {
      branchCatalogues.push(...cataloguesOf(sessionRecords(entry.file).records));
    } catch {
      /* unreadable branch artifact is reported by its absence */
    }
  }
  const userMessages = userMessagesOf(session.records);
  return {
    sessionId: sessionId ?? null,
    sessionFile: sessionFile ?? null,
    frames: session.frames,
    launchPrompts: principal.state.launchPrompts,
    observedProviderModel: observedModelOf(session.records),
    principalCatalogue: catalogues[0] ?? [],
    catalogueSize: catalogues[0]?.length ?? 0,
    toolNames: calls.map((call) => call.name),
    calls,
    assistantMessages: assistantMessagesOf(session.records),
    finalAssistantText: finalAssistantText(session.records),
    firstUserPrompt: firstUserPrompt(session.records),
    userMessages,
    attentionDelivered: userMessages.some((text) => text.includes(PRODUCT_ATTENTION_MARKER)),
    stdoutTurns: machine.turns,
    activations: machine.activations,
    malformedStdoutRecords: machine.malformed,
    stdoutLength: principal.state.stdout.length,
    exitCode: principal.state.exitCode,
    exited: principal.state.exited,
    stderrTail: principal.state.stderr.slice(-400),
    branchProcessCount: branchSessions.length,
    branchCatalogues,
  };
}

/** The `Rc1SideRaw` view the oracle judges. */
function sideRawOf(evidence) {
  return {
    toolNames: evidence.toolNames,
    calls: evidence.calls,
    assistantMessages: evidence.assistantMessages,
    userMessages: evidence.userMessages,
    launchPrompts: evidence.launchPrompts,
    activations: evidence.activations.map((entry) => ({
      signalId: entry?.signalId ?? null,
      kind: entry?.kind ?? null,
      activated: entry?.activated ?? null,
    })),
    finalAssistantText: evidence.finalAssistantText,
    branchProcessCount: evidence.branchProcessCount,
    branchCatalogues: evidence.branchCatalogues,
  };
}

/* ------------------------------------------------------------------ *
 * One live cross-project trial
 * ------------------------------------------------------------------ */

async function trial({ scenario, prompt, index }) {
  const root = join(tmpdir(), `palimpsest-rc1r-cross-${scenario}-${process.pid}-${Date.now()}-${index}`);
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
  let exitedEarly = false;
  try {
    // The origin must reach the product tool; the remote must be pumped+activated by the
    // shipped host, answer through the product tool, and the origin must surface the
    // answer on a LATER turn without any further user input. The stop condition uses the
    // SAME oracle the verdict uses, so the poll cannot wait for a stricter outcome than
    // the one it judges (§6: a terminal PARTIAL answer ends the poll).
    const done = await pollUntil(async () => {
      const originEvidence = readSideEvidence(origin, originState, startedAt);
      const remoteEvidence = readSideEvidence(remote, remoteState, startedAt);
      const surfacing = oracle.originSurfacing(sideRawOf(originEvidence));
      const asked = oracle.crossProjectCallsOf(originEvidence.calls).some((entry) => entry.action === 'ask');
      const remoteActivated =
        remoteEvidence.attentionDelivered || remoteEvidence.activations.some((entry) => entry.activated === true);
      const remoteAnswered = oracle.crossProjectCallsOf(remoteEvidence.calls).some((entry) => entry.action === 'respond');
      if (process.env.RC1_DEBUG_POLL) {
        process.stderr.write(
          `[poll] asked=${asked} remoteActivated=${remoteActivated} remoteAnswered=${remoteAnswered} ` +
            `terminal=${String(surfacing.terminalStatus)} carriesAnswer=${surfacing.carriesAnswer} surfaced=${surfacing.surfaced} ` +
            `terminalSeq=${String(surfacing.terminalSeq)} laterMsgs=${surfacing.laterMessages.length} ` +
            `originCalls=${originEvidence.calls.length} msgs=${JSON.stringify(originEvidence.assistantMessages.map((m) => m.seq))}\n`,
        );
      }
      if (asked && remoteActivated && remoteAnswered && surfacing.surfaced) {
        return { originEvidence, remoteEvidence };
      }
      if (origin.state.exited || remote.state.exited) {
        exitedEarly = true;
        return { originEvidence, remoteEvidence };
      }
      return null;
    }, TRIAL_TIMEOUT_MS);
    if (done === null) failure = `timeout after ${TRIAL_TIMEOUT_MS} ms`;
  } catch (error) {
    failure = error?.stack ?? String(error);
  } finally {
    for (const principal of [origin, remote]) {
      try {
        principal.child.kill('SIGKILL');
      } catch {
        /* already gone */
      }
    }
  }

  const originEvidence = readSideEvidence(origin, originState, startedAt);
  const remoteEvidence = readSideEvidence(remote, remoteState, startedAt);

  /* ---------------- RAW OBSERVATIONS (§28) ---------------- */
  const raw = {
    scenario,
    trial: index,
    prompt,
    freshPrincipalSessions: true,
    userPromptsUsed: 1,
    fixtureFailure,
    sharedTransport: TRANSPORT_NAMESPACE,
    sharedWorkspaceFiles: ['shared-associations.sqlite', 'shared-journal.sqlite'],
    wallMs: Date.now() - startedAt,
    pollFailure: failure,
    originExitedBeforeCompletion: exitedEarly && origin.state.exited,
    origin: originEvidence,
    remote: remoteEvidence,
    tokenUsage: 'unavailable (the host exposes no token accounting)',
  };

  /* ---------------- DERIVED JUDGEMENT (§28) ---------------- */
  const oracleInput = {
    scenario,
    failure,
    originExitedBeforeCompletion: raw.originExitedBeforeCompletion,
    origin: sideRawOf(originEvidence),
    remote: sideRawOf(remoteEvidence),
  };
  // A raw-observation shape drift must be a CLASSIFIED trial, never a lost sample (§17).
  let judgment;
  let surfacing;
  let crossFacts;
  try {
    judgment = oracle.judgeCrossTrial(oracleInput);
    surfacing = oracle.originSurfacing(oracleInput.origin);
    crossFacts = oracle.crossFactsOf(oracleInput);
  } catch (error) {
    judgment = {
      verdict: 'INFRASTRUCTURE_ERROR',
      classification: 'INFRASTRUCTURE_ERROR',
      productRoute: 'NONE',
      semanticOutcome: 'ORACLE_INPUT_ERROR',
      reason: `the qualification oracle could not judge this trial's raw observations: ${error?.message ?? String(error)}`,
      violations: [],
      advisories: [],
      failed: ['oracle input error'],
    };
    surfacing = { surfaced: false, surfacedText: '', answerText: '', terminalStatus: null, terminalSeq: null, laterMessages: [] };
    crossFacts = { remoteExploreActuallyRan: false, remoteLocalCollaborationRoute: 'NONE' };
  }
  const branchTrials = [...originEvidence.branchCatalogues, ...remoteEvidence.branchCatalogues];

  const record = {
    ...raw,
    judgment: {
      ...judgment,
      surfaced: surfacing.surfaced,
      surfacedText: surfacing.surfacedText,
      answerText: surfacing.answerText,
      terminalStatus: surfacing.terminalStatus,
      terminalSeq: surfacing.terminalSeq,
      laterAssistantTurns: surfacing.laterMessages.map((message) => message.turn),
      // RC-1E §39: the local-collaboration observation, straight from the oracle.
      remoteLocalCollaborationRoute: judgment.remoteLocalCollaborationRoute ?? 'NONE',
      remoteExploreActuallyRan: crossFacts.remoteExploreActuallyRan === true,
      remoteCollaborationExecutionKinds: judgment.remoteCollaborationExecutionKinds ?? [],
      remoteComposeIntents: judgment.remoteComposeIntents ?? [],
      remoteFindingStandings: judgment.remoteFindingStandings ?? [],
      remoteBranchProcessCount: judgment.remoteBranchProcessCount ?? 0,
      remoteBranchCatalogues: judgment.remoteBranchCatalogues ?? [],
      remoteBranchIsolationProven: judgment.remoteBranchIsolationProven === true,
      branchCapabilityIsolated: oracle.branchCataloguesAreIsolated(branchTrials),
    },
  };
  trials.push(record);
  writePartial();
  console.log(
    `  ${scenario}#${index}: ${judgment.verdict} | route=${judgment.productRoute} | outcome=${judgment.semanticOutcome} | ` +
      `originTools=${JSON.stringify(originEvidence.toolNames)} | remoteTools=${JSON.stringify(remoteEvidence.toolNames)} | ` +
      `terminal=${String(surfacing.terminalStatus)} surfaced=${surfacing.surfaced} | ` +
      `remoteCollaboration=${judgment.remoteLocalCollaborationRoute} exploreRan=${judgment.remoteExploreActuallyRan === true} | ` +
      `remoteBranches=${judgment.remoteBranchProcessCount ?? 0} | ` +
      `wall=${Math.round(raw.wallMs / 1000)}s` +
      (judgment.verdict === 'PASS' ? '' : ` | ${judgment.reason.slice(0, 200)}`),
  );
  try {
    rmSync(root, { recursive: true, force: true });
  } catch {
    /* Windows may hold a handle briefly */
  }
  return record;
}

/* ------------------------------------------------------------------ *
 * Main
 * ------------------------------------------------------------------ */

const startedAt = Date.now();
console.log(
  `RC-1R live cross-project qualification — D:${D_TRIALS} trials, E:${E_TRIALS} trials, real model-driven principals`,
);

try {
  for (let i = 1; i <= D_TRIALS; i += 1) {
    await trial({ scenario: 'D_cross_project_ask', prompt: D_PROMPT, index: i });
  }
  for (let i = 1; i <= E_TRIALS; i += 1) {
    await trial({ scenario: 'E_remote_local_collaboration', prompt: E_PROMPT, index: i });
  }
} catch (error) {
  failures.push(`unhandled: ${error?.stack ?? String(error)}`);
}

const dTrials = trials.filter((record) => record.scenario === 'D_cross_project_ask');
const eTrials = trials.filter((record) => record.scenario === 'E_remote_local_collaboration');
const judgmentsOf = (records) => records.map((record) => record.judgment);
const dQualification = oracle.qualify(judgmentsOf(dTrials));
const eQualification = oracle.qualify(judgmentsOf(eTrials));

if (dTrials.length > 0 && !dQualification.qualified) {
  failures.push(
    `scenario D: fewer than 4/5 cross-project trials reached the intended product path (${dQualification.passes}/${dQualification.total})`,
  );
}
// §9/FP-1: Scenario E is gated, not merely reported. A remote principal that answers
// directly, without invoking its own local collaboration, is not Scenario E.
if (eTrials.length > 0 && !eQualification.qualified) {
  failures.push(
    `scenario E: fewer than 4/5 cross-project trials composed the remote project's own local collaboration ` +
      `(${eQualification.passes}/${eQualification.total})`,
  );
}
const allViolations = trials.filter((record) => record.judgment.violations.length > 0);
if (allViolations.length > 0) {
  failures.push(
    `§34 authority/scope/disclosure violation(s): ${JSON.stringify(
      allViolations.map((record) => ({ trial: record.trial, violations: record.judgment.violations })),
    )}`,
  );
}
/** §12: copy misrepresentation is a FAILED TRIAL counted by the pass rate, not a §34 violation. */
const allCopy = trials.filter((record) => (record.judgment.copyMisrepresentation ?? []).length > 0);
const branchTrialsWithBranches = trials.filter((record) => record.origin.branchProcessCount + record.remote.branchProcessCount > 0);
if (branchTrialsWithBranches.some((record) => !record.judgment.branchCapabilityIsolated)) {
  failures.push('§20 branch catalogue widened beyond exactly ["palimpsest_branch_result"]');
}
if (trials.some((record) => record.origin.malformedStdoutRecords.length > 0 || record.remote.malformedStdoutRecords.length > 0)) {
  failures.push('§27: an activation/turn observability record was malformed');
}

const gitHead = (() => {
  try {
    return spawnSync('git', ['-C', REPO, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout?.trim() ?? null;
  } catch {
    return null;
  }
})();

const summary = {
  scenario: 'RC-1R live cross-project (D/E)',
  oracle: 'test/support/rc1_oracle.ts (shared with the local harness and replayed by test/rc1r_oracle_replay.test.ts)',
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
    pollTimeoutMs: TRIAL_TIMEOUT_MS,
    tokenAccounting: 'unavailable — never invented (§31)',
  },
  criteria: {
    scenarioD: dQualification,
    scenarioE: eQualification,
    /** RC-1E §18: both legal routes are counted, and neither is privileged. */
    scenarioE_routes: {
      COLLABORATE_TOOL: eTrials.filter((record) => record.judgment.remoteLocalCollaborationRoute === 'COLLABORATE_TOOL').length,
      RESPOND_COMPOSE: eTrials.filter((record) => record.judgment.remoteLocalCollaborationRoute === 'RESPOND_COMPOSE').length,
      NONE: eTrials.filter((record) => (record.judgment.remoteLocalCollaborationRoute ?? 'NONE') === 'NONE').length,
    },
    scenarioE_remoteExploreActuallyRan: eTrials.filter((record) => record.judgment.remoteExploreActuallyRan === true).length,
    /** §22: D must keep accepting a direct answer; its branch use is reported, not required. */
    scenarioD_remoteBranchUse: dTrials.map((record) => ({
      trial: record.trial,
      route: record.judgment.remoteLocalCollaborationRoute ?? 'NONE',
      remoteBranchProcessCount: record.judgment.remoteBranchProcessCount ?? 0,
    })),
    terminalAnswerStatuses: trials.map((record) => record.judgment.terminalStatus),
    no_copy_or_disclosure_violation: allViolations.length === 0,
    violations: allViolations.map((record) => ({ trial: record.trial, violations: record.judgment.violations })),
    copyMisrepresentations: allCopy.map((record) => ({
      trial: record.trial,
      copyMisrepresentation: record.judgment.copyMisrepresentation,
    })),
    branch_catalogue_isolation: branchTrialsWithBranches.every((record) => record.judgment.branchCapabilityIsolated),
  },
  trials,
  durationMs: Date.now() - startedAt,
  failures,
  pass: failures.length === 0,
};

mkdirSync(join(REPO, 'release-evidence'), { recursive: true });
writeFileSync(join(REPO, 'release-evidence', OUT_FILE), `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify({ criteria: summary.criteria, failures, pass: summary.pass }, null, 2));
console.log(`pass=${summary.pass}`);
process.exit(summary.pass ? 0 : 1);
