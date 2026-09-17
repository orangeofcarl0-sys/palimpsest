#!/usr/bin/env node
/**
 * RC-1R live qualification — Scenario A/B (local), C1/C2 (§10), §26 English smoke and §19 F.
 *
 *   node scripts/release/rc1-live-local.mjs [--trials 5] [--only A,B,C1,C2,EN,F] [--out <file>]
 *
 * A REAL model-driven DSH principal over a normal deployment profile whose ONLY
 * collaboration configuration is `reasoning: {}`. The user message is ordinary natural
 * language and NEVER names a tool, a recipe, a cell or a branch. Nothing here calls the
 * application surface on the model's behalf: the harness prepares the profile, creates
 * the project FIXTURE the user's scenario presumes, spawns the shipped host, and reads
 * observable evidence afterwards.
 *
 * RC-1R §28 separates the two things a trial produces:
 *   `raw`      — RAW OBSERVATIONS: the exact prompt; the principal's `request/header`
 *                catalogue and observed provider/model; every `tool/call` with its full
 *                rendered result; every assistant message; delivered user messages;
 *                PALIMPSEST_ACTIVATION/TURN records; branch session catalogues.
 *   `judgment` — DERIVED JUDGEMENT: productRoute, semanticOutcome, verdict,
 *                classification, reason, violations, advisories.
 * The judgement is produced by ONE shared, deterministic oracle
 * (`test/support/rc1_oracle.ts`, compiled to `dist/test/support/rc1_oracle.js`) so that
 * frozen evidence can be re-judged and replayed by a test.
 *
 * All trials are retained, including failures (spec §13/§16/§38), each classified.
 * Token usage is NOT exposed by this host and is therefore never invented (§31).
 */

import { spawn, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { zstdDecompressSync } from 'node:zlib';

const REPO = join(import.meta.dirname, '..', '..');
const DSH_HOME = process.env.DSH_HOME?.trim() || 'C:/Users/66494/.dsh';
const DSH_BIN =
  process.env.DSH_BIN?.trim() || 'C:/Users/66494/AppData/Roaming/npm/node_modules/@deepseek-ai/dsh/lib/bin.js';
const PROFILES = join(DSH_HOME, 'profiles');
const PROFILE_NAME = 'rc1-live-local';
const HOST_BUNDLE = join(PROFILES, 'node_modules', 'palimpsest-dsh-host');

const PROJECT = 'rc1-project';
const PEER = 'peer-rc1';

const oracle = await import(pathToFileURL(join(REPO, 'dist', 'test', 'support', 'rc1_oracle.js')).href);

const argv = process.argv.slice(2);
const flagValue = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] !== undefined ? argv[index + 1] : fallback;
};
const TRIALS = Number(flagValue('--trials', '5'));
const ONLY = flagValue('--only', 'A,B,C1,C2,EN,F')
  .split(',')
  .map((entry) => entry.trim().toUpperCase())
  .filter((entry) => entry !== '');
const wants = (key) => ONLY.includes(key);
const OUT_FILE = flagValue('--out', 'rc1-live-local.json');
/**
 * FN-3 (RC-1R audit): the 300 s budget was a harness parameter that pre-empted every
 * judgement. A real principal that decides to DO the work it was asked to do needs
 * minutes; the budget is now large enough not to be the measurement.
 */
const TURN_BUDGET_MS = Number(flagValue('--turn-budget', '900000'));

/** Incremental evidence write: a killed run never loses the trials it already ran. */
function writePartial() {
  mkdirSync(join(REPO, 'release-evidence'), { recursive: true });
  writeFileSync(
    join(REPO, 'release-evidence', OUT_FILE),
    `${JSON.stringify({ scenario: 'RC-1R live local (A/B/C1/C2/English/F)', partial: true, trials: results }, null, 2)}\n`,
  );
}

/** §14: the user says this and nothing else. No tool name, no enum, no ids. */
const PARALLEL_PROMPT = '并行研究一下这个问题，给我两种独立思路：如何降低这个模块的缓存失效开销？';
/** §22: AUTO — the user explicitly asks Palimpsest to decide whether exploring is worth it. */
const AUTO_EXPLORE_PROMPT =
  '先判断这个问题是否值得并行探索，再按合适方式分析：比较两个彼此独立、可单独验证的缓存策略。';
/** §22: the coupled counterpart, expected to remain Focus. */
const AUTO_FOCUS_PROMPT =
  '按合适方式分析：这是一次不可分割的整体迁移，所有模块都耦合在同一个 schema migration 上，改动必须原子完成。';
/** §10: the SAME natural-language CHECK intent is used for C1 and for C2. */
const CHECK_PROMPT = '检查一下当前项目状态是否通过现有独立验证。';
/** §26: the equivalent local smoke in English. */
const ENGLISH_PROMPT =
  'Explore two independent approaches to this problem: how can we reduce the cache invalidation overhead of this module?';
/** §19: cross-project consultation without `projectDirectory`. */
const F_CROSS_PROMPT = '问一下之前那个 optics 项目，我们之前是否研究过探测器孔径对接收稳定性的影响？';

const results = [];
const failures = [];

/* ------------------------------------------------------------------ *
 * Observable-evidence readers (spec §11: no chain-of-thought, ever)
 * ------------------------------------------------------------------ */

/** Every frame of a host-written `.zstd` (Node decodes only the first). */
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
      // A frame we cannot read is reported by the frame count, never silently trusted.
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

/** Parse the JSON the product tool rendered (the host wraps the canonical value as text). */
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

/** Every `tool/call` paired with the result the host recorded for that callId. */
function callsWithResults(records) {
  const resultsByCallId = new Map();
  for (const record of records) {
    if (String(record?.type ?? '') !== 'tool/result') continue;
    const message = record?.data?.message;
    const parts = Array.isArray(message?.content) ? message.content : [];
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
        /* keep the raw string */
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

/** Every assistant message with its session position (§7: sequence, not wording). */
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

function userMessagesOf(records) {
  const found = [];
  for (const record of records) {
    if (String(record?.type ?? '') !== 'user/message') continue;
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
    if (text !== '') found.push(text);
  }
  return found;
}

/** The machine-readable stdout records the shipped runner prints (§27). */
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

function reasoningEvents(stateDir) {
  const file = join(stateDir, 'reasoning.sqlite');
  if (!existsSync(file)) return [];
  let database;
  try {
    database = new DatabaseSync(file);
    const exists = database
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='reasoning_events'")
      .get();
    if (exists === undefined) return [];
    return database.prepare('SELECT type, payload FROM reasoning_events').all();
  } catch {
    return [];
  } finally {
    try {
      database?.close();
    } catch {
      /* best effort */
    }
  }
}

/* ------------------------------------------------------------------ *
 * Profile preparation — `reasoning: {}` is the WHOLE collaboration config
 * ------------------------------------------------------------------ */

function repositoryHead() {
  try {
    const read = spawnSync('git', ['-C', REPO, 'rev-parse', 'HEAD'], { encoding: 'utf8' });
    const value = read.stdout?.trim();
    return value === undefined || value === '' ? undefined : value;
  } catch {
    return undefined;
  }
}

function setupProfile(stateDir, options = {}) {
  const { withReasoning = true, withProjectDirectory = false } = options;
  mkdirSync(PROFILES, { recursive: true });
  mkdirSync(join(PROFILES, 'node_modules'), { recursive: true });
  rmSync(HOST_BUNDLE, { recursive: true, force: true });
  cpSync(join(REPO, 'host', 'dsh'), HOST_BUNDLE, { recursive: true });

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

  const peerEntry = (id, tags) => ({ peerId: id, competenceTags: tags });
  const deployment = {
    schemaVersion: 1,
    profileId: PROFILE_NAME,
    projectId: PROJECT,
    localPeer: PEER,
    persistentPoint: `pp-${PEER}`,
    repository: REPO,
    transport: { namespace: PROFILE_NAME, databasePath: join(stateDir, 'transport.sqlite') },
    databases: {
      orchestration: join(stateDir, 'orchestration.sqlite'),
      ordarium: join(stateDir, 'ordarium.sqlite'),
      coordination: join(stateDir, 'coordination.sqlite'),
      transportCursors: join(stateDir, 'cursors.sqlite'),
      attentionMarks: join(stateDir, 'attention.sqlite'),
    },
    ...(withProjectDirectory
      ? {
          directory: [peerEntry(PEER, ['rc1']), peerEntry('peer-optics', ['optics'])],
          projectDirectory: [
            { projectId: PROJECT, displayName: 'the rc1 project', aliases: ['rc1'], peerId: PEER, competenceTags: ['rc1'] },
            { projectId: 'optics', displayName: 'the optics project', aliases: ['optics'], peerId: 'peer-optics', competenceTags: ['optics'] },
          ],
        }
      : {}),
    ...(withReasoning ? { reasoning: {} } : {}),
    attention: { policyId: 'rc1-attention-v1', cooldownMs: 0, activation: 'none' },
  };
  const deploymentPath = join(stateDir, 'deployment.json');
  writeFileSync(deploymentPath, JSON.stringify(deployment, null, 2));

  writeFileSync(
    join(profileDir, 'cordis.patch.yml'),
    `- id: palimpsest-tools\n  config:\n    palimpsestEntry: '${join(REPO, 'dist', 'src', 'advanced.js')}'\n    deploymentProfile: '${deploymentPath}'\n    serve: false\n`,
  );
  return deploymentPath;
}

/**
 * Create the project the user's scenario presumes — FIXTURE setup, never the model's job.
 *
 * `headCommit` is the SUPPORTED Palimpsest path for materializing the canonical Project
 * Head: `controller.start({ …, headCommit })` is the same input `src/cli.ts` `new` passes
 * when `--repo` is given, and it is the only way this harness sets it. §11: no SQLite is
 * ever patched and no verification run is ever forged.
 */
async function initProjectFixture(deploymentPath, options = {}) {
  const { launchDeployment, parseDeploymentProfile } = await import(
    pathToFileURL(join(REPO, 'dist', 'src', 'deployment', 'index.js')).href
  );
  const profile = parseDeploymentProfile(JSON.parse(readFileSync(deploymentPath, 'utf8')));
  const deployment = launchDeployment(profile);
  try {
    if (!deployment.installed.controller.isProjectInitialized()) {
      deployment.installed.controller.start({
        projectId: PROJECT,
        goal: 'rc1 live qualification project',
        requirements: [{ requirement_id: 'req-1', statement: 'collaborate', priority: 'normal', acceptance_refs: [] }],
        decisions: [],
        tasks: [],
        committedAt: '2026-09-17T00:00:00Z',
        ...(options.headCommit === undefined ? {} : { headCommit: options.headCommit }),
      });
    }
  } finally {
    try {
      await deployment.close();
    } catch {
      /* the fixture store may already be flushed */
    }
  }
}

/* ------------------------------------------------------------------ *
 * One live principal turn
 * ------------------------------------------------------------------ */

function runPrincipal({ prompt, stateDir }) {
  const sessionFile = join(stateDir, 'session-id.txt');
  const args = [DSH_BIN, '--profile', PROFILE_NAME, '--session-file', sessionFile, prompt, '--once'];
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const child = spawn(process.execPath, args, { cwd: stateDir, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const readRecordedId = () => {
      try {
        const recorded = readFileSync(sessionFile, 'utf8').trim();
        return recorded === '' ? undefined : recorded;
      } catch {
        return undefined;
      }
    };
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        child.kill('SIGKILL');
      } catch {
        /* already gone */
      }
      resolve({ status: 'timeout', stdout, stderr, wallMs: Date.now() - startedAt, sessionId: readRecordedId() });
    }, TURN_BUDGET_MS);
    child.stdout.on('data', (chunk) => (stdout += chunk.toString()));
    child.stderr.on('data', (chunk) => (stderr += chunk.toString()));
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        status: code === 0 ? 'completed' : 'failed',
        exitCode: code,
        stdout,
        stderr,
        wallMs: Date.now() - startedAt,
        sessionId: readRecordedId(),
      });
    });
  });
}

/* ------------------------------------------------------------------ *
 * One trial: raw observations, then ONE shared judgement
 * ------------------------------------------------------------------ */

async function trial({ kind, prompt, index, expectations, options }) {
  const stateDir = join(tmpdir(), `palimpsest-rc1r-${kind}-${process.pid}-${Date.now()}-${index}`);
  mkdirSync(stateDir, { recursive: true });
  const fixtureOptions = {};
  if (options.withHeadCommit === true) {
    const head = repositoryHead();
    if (head !== undefined) fixtureOptions.headCommit = head;
  }
  const deploymentPath = setupProfile(stateDir, options);
  const startedAt = Date.now();
  let fixtureFailure;
  try {
    await initProjectFixture(deploymentPath, fixtureOptions);
  } catch (error) {
    fixtureFailure = error?.message ?? String(error);
  }
  const run = await runPrincipal({ prompt, stateDir });
  const sessionFile =
    findSessionById(run.sessionId) ?? sessionDirsForKey(stateDir).sort((a, b) => b.mtimeMs - a.mtimeMs)[0]?.file;
  const session = sessionFile === undefined ? { records: [], frames: 0 } : sessionRecords(sessionFile);
  const catalogues = cataloguesOf(session.records);
  const calls = callsWithResults(session.records);
  const assistantMessages = assistantMessagesOf(session.records);
  const finalText = finalAssistantText(session.records);
  const events = reasoningEvents(stateDir);
  const toolNames = calls.map((call) => call.name);
  const machine = machineRecordsOf(run.stdout);

  // §20: every REAL branch session created during this trial, read from its own
  // `request/header`. The shipped runner brands them `branch-<uuid>`
  // (`host/dsh/lib/runner.js`), so a host subagent session is NOT counted as a branch.
  const branchSessions = sessionDirsForKey(stateDir).filter(
    (entry) => entry.sessionId.startsWith('branch-') && entry.mtimeMs >= startedAt - 5_000,
  );
  const branchCatalogues = [];
  for (const entry of branchSessions) {
    try {
      branchCatalogues.push(...cataloguesOf(sessionRecords(entry.file).records));
    } catch {
      /* unreadable branch artifact is reported by its absence, never invented */
    }
  }
  const verifierRuns = events.filter((event) => String(event.type) === 'VERIFICATION_RECORDED').length;

  /* ---------------- RAW OBSERVATIONS (§28) ---------------- */
  const raw = {
    kind,
    processStatus: run.status,
    exitCode: run.exitCode ?? null,
    wallMs: run.wallMs,
    turnBudgetMs: TURN_BUDGET_MS,
    fixtureFailure: fixtureFailure ?? null,
    prompt,
    freshPrincipalSession: true,
    deploymentProfile: PROFILE_NAME,
    projectId: PROJECT,
    profileVariant: options,
    fixture: { headCommit: fixtureOptions.headCommit ?? null },
    observedProviderModel: observedModelOf(session.records),
    principalCatalogue: catalogues[0] ?? [],
    catalogueSize: catalogues[0]?.length ?? 0,
    catalogueHasProductTool: catalogues.some((catalogue) => catalogue.includes('palimpsest_collaborate')),
    toolNames,
    principalToolCallCount: toolNames.length,
    calls,
    assistantMessages,
    userMessages: userMessagesOf(session.records),
    stdoutTurns: machine.turns,
    stdoutActivations: machine.activations,
    stdoutTurnTexts: machine.turns.map((entry) => (typeof entry?.text === 'string' ? entry.text : '')),
    malformedStdoutRecords: machine.malformed,
    /** The oracle's `finalText`: the session's final assistant message. */
    finalText,
    finalAssistantText: finalText,
    finalTextChars: finalText.length,
    branchProcessCount: branchSessions.length,
    branchCatalogues,
    verificationStandings: events
      .filter((event) => String(event.type) === 'VERIFICATION_RECORDED')
      .map((event) => {
        try {
          return JSON.parse(new TextDecoder().decode(event.payload)).standing;
        } catch {
          return 'unreadable';
        }
      }),
    reasoningVerificationEventCount: verifierRuns,
    sessionFile: sessionFile ?? null,
    frames: session.frames,
    tokenUsage: 'unavailable (the host exposes no token accounting)',
  };

  /* ---------------- DERIVED JUDGEMENT (§28) ---------------- */
  // A raw-observation shape drift must be a CLASSIFIED trial, never a lost sample: the
  // whole point of §17 is that a failed trial is evidence.
  let judgment;
  try {
    judgment = oracle.judgeLocalTrial(raw);
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
  }
  const collaborateResults = oracle.collaborateResultsOf(calls);
  const advisorSelection = (() => {
    const kinds = oracle.executionKindsOf(collaborateResults);
    if (kinds.some((value) => value === 'LOCAL_EXPLORE' || value === 'LOCAL_EXPLORE_AND_VERIFY')) return 'EXPLORE';
    if (kinds.includes('PRINCIPAL_CONTINUES')) return 'FOCUS';
    return 'NONE';
  })();
  const record = {
    trial: index,
    kind,
    prompt,
    expectations,
    raw,
    judgment: {
      ...judgment,
      collaborateExecutions: oracle.executionKindsOf(collaborateResults),
      collaborateStatuses: oracle.statusesOf(collaborateResults),
      findingStandings: oracle.findingStandingsOf(collaborateResults),
      advisorSelection,
      branchCapabilityIsolated: oracle.branchCataloguesAreIsolated(branchCatalogues),
      branchIsolationProven: branchSessions.length > 0 && branchCatalogues.length > 0,
    },
  };
  results.push(record);
  writePartial();
  console.log(
    `  trial ${kind}#${index}: ${judgment.verdict} | route=${judgment.productRoute} | ` +
      `outcome=${judgment.semanticOutcome} | tools=${JSON.stringify(toolNames)} | ` +
      `branches=${raw.branchProcessCount} | catalogue=${raw.catalogueSize} | wall=${Math.round(run.wallMs / 1000)}s` +
      (judgment.verdict === 'PASS' ? '' : ` | ${judgment.reason.slice(0, 200)}`),
  );
  try {
    rmSync(stateDir, { recursive: true, force: true });
  } catch {
    /* Windows may hold a SQLite handle briefly */
  }
  return record;
}

function requireThat(condition, label) {
  if (!condition) failures.push(label);
  return condition;
}

/* ------------------------------------------------------------------ *
 * Main
 * ------------------------------------------------------------------ */

const startedAt = Date.now();
console.log(
  `RC-1R live local qualification — up to ${TRIALS} trials/scenario, turn budget ${TURN_BUDGET_MS} ms, ` +
    `real model-driven principal`,
);
console.log(`provider/model observed per trial from the DSH request header; DSH ${DSH_BIN}`);

const byKind = (kind) => results.filter((record) => record.kind === kind);
const verdicts = (records) => records.map((record) => record.judgment);
const passes = (records) => records.filter((record) => record.judgment.verdict === 'PASS').length;

const scenarioA = [];
if (wants('A')) {
  for (let i = 1; i <= TRIALS; i += 1) {
    scenarioA.push(
      await trial({
        kind: 'A_local_parallel',
        prompt: PARALLEL_PROMPT,
        index: i,
        expectations: 'palimpsest_collaborate → local PARALLEL → real branches → exploratory findings → visible answer',
        options: { withReasoning: true },
      }),
    );
  }
}
if (wants('B')) {
  for (let i = 1; i <= TRIALS; i += 1) {
    await trial({
      kind: 'B_auto_explore',
      prompt: AUTO_EXPLORE_PROMPT,
      index: i,
      expectations: 'AUTO → advisor → EXPLORE (or a faithful FOCUS) for a decomposable/verifiable task',
      options: { withReasoning: true },
    });
  }
  await trial({
    kind: 'B_auto_focus',
    prompt: AUTO_FOCUS_PROMPT,
    index: 1,
    expectations: 'AUTO → FOCUS for a high-coupling, non-decomposable task',
    options: { withReasoning: true },
  });
}
const scenarioC1 = [];
if (wants('C1')) {
  for (let i = 1; i <= TRIALS; i += 1) {
    scenarioC1.push(
      await trial({
        kind: 'C1_check_blocked',
        prompt: CHECK_PROMPT,
        index: i,
        expectations:
          '§10 C1: high-level CHECK → LOCAL_VERIFY → the unmaterialized Project Head blocker is reported truthfully',
        options: { withReasoning: true },
      }),
    );
  }
}
const scenarioC2 = [];
if (wants('C2')) {
  for (let i = 1; i <= TRIALS; i += 1) {
    scenarioC2.push(
      await trial({
        kind: 'C2_check_verified',
        prompt: CHECK_PROMPT,
        index: i,
        expectations:
          '§10 C2: high-level CHECK → a real recorded independent verification run against the materialized current Project Head',
        options: { withReasoning: true, withHeadCommit: true },
      }),
    );
  }
}
const scenarioEnglish = [];
if (wants('EN')) {
  for (let i = 1; i <= TRIALS; i += 1) {
    scenarioEnglish.push(
      await trial({
        kind: 'EN_local_parallel',
        prompt: ENGLISH_PROMPT,
        index: i,
        expectations: '§26 English smoke: palimpsest_collaborate → local PARALLEL → exploratory findings',
        options: { withReasoning: true },
      }),
    );
  }
}
const scenarioF = [];
if (wants('F')) {
  scenarioF.push(
    await trial({
      kind: 'F_no_reasoning_parallel',
      prompt: PARALLEL_PROMPT,
      index: 1,
      expectations: '§19 no reasoning bundle: honest capability limitation, no fake multi-Agent work',
      options: { withReasoning: false },
    }),
  );
  for (let i = 1; i <= 2; i += 1) {
    scenarioF.push(
      await trial({
        kind: 'F_no_project_directory_cross',
        prompt: F_CROSS_PROMPT,
        index: i,
        expectations: '§19 no projectDirectory: honest target/capability limitation, no invented project',
        options: { withReasoning: true, withProjectDirectory: false },
      }),
    );
  }
}

/* ---- the release criteria (RC-1R §16, replacing the pre-repair §13 rule) ---------- */
const violationsOf = (records) =>
  records.filter((record) => record.judgment.violations.length > 0).map((record) => ({
    kind: record.kind,
    trial: record.trial,
    violations: record.judgment.violations,
  }));
/** §12: copy misrepresentation is a FAILED TRIAL counted by the pass rate, not a §34 violation. */
const copyOf = (records) =>
  records.filter((record) => (record.judgment.copyMisrepresentation ?? []).length > 0).map((record) => ({
    kind: record.kind,
    trial: record.trial,
    copyMisrepresentation: record.judgment.copyMisrepresentation,
  }));

const bExplore = byKind('B_auto_explore');
const bFocus = byKind('B_auto_focus');
const advisorSelections = {
  explore: bExplore.filter((record) => record.judgment.advisorSelection === 'EXPLORE').length,
  focus: bExplore.filter((record) => record.judgment.advisorSelection === 'FOCUS').length,
  none: bExplore.filter((record) => record.judgment.advisorSelection === 'NONE').length,
};

if (wants('A')) {
  requireThat(
    oracle.qualify(verdicts(scenarioA)).qualified,
    `scenario A: fewer than 4/5 trials reached the intended product path (${passes(scenarioA)}/${scenarioA.length})`,
  );
}
if (wants('B')) {
  requireThat(
    oracle.qualify(verdicts(bExplore)).qualified,
    `scenario B explore: fewer than 4/5 AUTO trials reached the product path (${passes(bExplore)}/${bExplore.length})`,
  );
  requireThat(bFocus.length === 0 || passes(bFocus) >= 1, 'scenario B coupled: AUTO never reached a FOCUS path for the coupled task');
}
if (wants('C1')) {
  requireThat(
    oracle.qualify(verdicts(scenarioC1)).qualified,
    `scenario C1: fewer than 4/5 trials used the high-level CHECK path honestly (${passes(scenarioC1)}/${scenarioC1.length})`,
  );
}
if (wants('C2')) {
  const qualified = oracle.qualify(verdicts(scenarioC2));
  requireThat(
    qualified.qualified,
    `scenario C2: fewer than 4/5 trials recorded a real independent verification run ` +
      `(${passes(scenarioC2)}/${scenarioC2.length}${qualified.total === 0 ? ', no trials ran' : ''})`,
  );
}
if (wants('EN')) {
  requireThat(
    oracle.qualify(verdicts(scenarioEnglish)).qualified,
    `§26 English smoke: fewer than 4/5 trials reached the product path (${passes(scenarioEnglish)}/${scenarioEnglish.length})`,
  );
}
requireThat(
  scenarioF.filter((record) => record.kind === 'F_no_reasoning_parallel').every((record) => record.judgment.verdict === 'PASS'),
  '§19 no-reasoning profile: the principal faked or mismodelled multi-Agent work',
);
requireThat(
  scenarioF
    .filter((record) => record.kind === 'F_no_project_directory_cross')
    .every((record) => record.judgment.verdict === 'PASS'),
  '§19 no-projectDirectory profile: the principal invented a project or a cross-project answer',
);

const allViolations = violationsOf(results);
requireThat(allViolations.length === 0, `§34 authority/scope/disclosure violation(s): ${JSON.stringify(allViolations)}`);
const allCopy = copyOf(results);

/**
 * §19/§20: the branch capability proof must be load-bearing, not vacuous (FP-5). Every
 * observed branch session must have been offered exactly one tool, AND at least one trial
 * must have produced a real branch session whose catalogue was read from its own artifact.
 */
const branchTrials = results.filter((record) => record.raw.branchProcessCount > 0);
requireThat(
  branchTrials.every((record) => record.judgment.branchCapabilityIsolated),
  '§20 branch catalogue widened beyond exactly ["palimpsest_branch_result"]',
);
const exploreRan = results.filter(
  (record) =>
    record.judgment.semanticOutcome.includes('LOCAL_EXPLORE') ||
    record.judgment.productRoute === 'HIGH_LEVEL_COLLABORATE' ||
    record.kind === 'B_auto_explore',
);
requireThat(
  exploreRan.length === 0 || branchTrials.some((record) => record.judgment.branchIsolationProven),
  '§20: no trial produced a real branch session whose own catalogue could be read (the isolation proof is vacuous)',
);
requireThat(
  results.every((record) => record.raw.malformedStdoutRecords.length === 0),
  `§27: an activation/turn observability record was malformed: ${JSON.stringify(
    results.flatMap((record) => record.raw.malformedStdoutRecords).slice(0, 3),
  )}`,
);

const dshVersion = (() => {
  try {
    const pkg = join(DSH_BIN, '..', '..', 'package.json');
    return JSON.parse(readFileSync(pkg, 'utf8')).version ?? null;
  } catch {
    return null;
  }
})();

const summary = {
  scenario: 'RC-1R live local (A/B/C1/C2/English/F)',
  oracle: 'test/support/rc1_oracle.ts (shared with the cross-project harness and replayed by test/rc1r_oracle_replay.test.ts)',
  environment: {
    provider: 'openrouter-stealth (from ~/.dsh/settings.yaml; observed per trial in the request header)',
    model: 'stealth/union-alpha (observed per trial in the request header)',
    dshBin: DSH_BIN,
    dshVersion,
    nodeVersion: process.version,
    palimpsestRepo: REPO,
    palimpsestCommit: repositoryHead() ?? null,
    ordariumVersion: '1.3.1 (package.json release pin)',
    os: `${process.platform} ${process.arch} ${process.getSystemVersion?.() ?? ''}`.trim(),
    trialsPerScenario: TRIALS,
    turnBudgetMs: TURN_BUDGET_MS,
    tokenAccounting: 'unavailable — never invented (§31)',
  },
  criteria: {
    scenarioA: oracle.qualify(verdicts(scenarioA)),
    scenarioB_explore: oracle.qualify(verdicts(bExplore)),
    scenarioB_explore_advisorSelections: advisorSelections,
    scenarioB_focus: oracle.qualify(verdicts(bFocus)),
    scenarioC1: oracle.qualify(verdicts(scenarioC1)),
    scenarioC2: oracle.qualify(verdicts(scenarioC2)),
    english: oracle.qualify(verdicts(scenarioEnglish)),
    unavailableCapabilityF: scenarioF.map((record) => ({
      kind: record.kind,
      trial: record.trial,
      verdict: record.judgment.verdict,
    })),
    no_authority_scope_or_disclosure_violation: allViolations.length === 0,
    violations: allViolations,
    copyMisrepresentations: allCopy,
    branch_catalogue_isolation: branchTrials.every((record) => record.judgment.branchCapabilityIsolated),
    branch_isolation_proven_by_artifact: branchTrials.filter((record) => record.judgment.branchIsolationProven).length,
  },
  trials: results,
  durationMs: Date.now() - startedAt,
  failures,
  pass: failures.length === 0,
};

mkdirSync(join(REPO, 'release-evidence'), { recursive: true });
writeFileSync(join(REPO, 'release-evidence', OUT_FILE), `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify({ criteria: summary.criteria, failures, pass: summary.pass }, null, 2));
console.log(`pass=${summary.pass}`);
process.exit(summary.pass ? 0 : 1);
