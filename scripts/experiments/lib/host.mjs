#!/usr/bin/env node
/**
 * G10-R experiment host helpers.
 *
 * Thin, reusable wrapper around the REAL DSH host bundle already exercised by
 * `scripts/dogfood/real-host-federation.mjs` and `host/dsh/`. It provides:
 *
 *   - ensureHostBundle()      copy host/dsh into the DSH profile node_modules
 *   - deploymentProfile(...)  build a typed deployment-profile JSON object
 *   - writeHostProfiles(...)  write dsh profile dirs (package.json + patch)
 *   - launchPrincipal(...)    spawn one DSH principal and parse its stdout lines
 *   - awaitReady/killPrincipal/waitFor
 *   - singleLocusRun(...)     ONE principal performing a bounded task (--once)
 *   - federationRun(...)      shell out to scripts/dogfood/real-host-federation.mjs
 *   - readSessionTelemetry()  decompress a DSH session JSONL and fold telemetry
 *
 * Nothing here makes semantic decisions: it launches, observes and kills.
 */

import { execFileSync, spawn } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

/* ------------------------------------------------------------------ *
 * Environment (mirrors the working reference script)
 * ------------------------------------------------------------------ */

const here = new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
export const REPO = here.replace(/[\\/]scripts[\\/]experiments[\\/]lib[\\/]?$/, '');
export const DSH_HOME = process.env.DSH_HOME?.trim() || 'C:/Users/66494/.dsh';
export const DSH_BIN = 'C:/Users/66494/AppData/Roaming/npm/node_modules/@deepseek-ai/dsh/lib/bin.js';
export const PROFILES = join(DSH_HOME, 'profiles').replace(/\\/g, '/');
export const HOST_BUNDLE = join(PROFILES, 'node_modules', 'palimpsest-dsh-host').replace(/\\/g, '/');
export const ADVANCED = `${REPO}/dist/src/advanced.js`.replace(/\\/g, '/');
export const CAMPAIGN_ROOT = join(DSH_HOME, 'palimpsest-g10r-experiments').replace(/\\/g, '/');
export const DOGFOOD_FEDERATION = `${REPO}/scripts/dogfood/real-host-federation.mjs`.replace(/\\/g, '/');

export const EXPERIMENT_PROFILE_P = 'palimpsest-exp-p';
export const EXPERIMENT_PROFILE_O = 'palimpsest-exp-o';

let advancedModule;
export async function loadAdvanced() {
  if (advancedModule === undefined) {
    advancedModule = await import(pathToFileURL(ADVANCED).href);
  }
  return advancedModule;
}

/* ------------------------------------------------------------------ *
 * Host bundle + profiles
 * ------------------------------------------------------------------ */

let hostBundleReady = false;
/** Copy the current host/dsh bundle where the dsh profile loader resolves it (once). */
export function ensureHostBundle() {
  if (hostBundleReady) return;
  rmSync(HOST_BUNDLE, { recursive: true, force: true });
  cpSync(`${REPO}/host/dsh`, HOST_BUNDLE, { recursive: true });
  hostBundleReady = true;
}

/**
 * Build a deployment-profile object for one principal. Mirrors the reference
 * dogfood profile shape exactly; `namespace`/`dataDir` isolate each run.
 */
export function deploymentProfile(input) {
  const dir = `${input.dataDir}/${input.who}`;
  const otherPeer = `peer-${input.other}`;
  return {
    schemaVersion: 1,
    profileId: `g10r-${input.who}-${input.runKey ?? 'run'}`,
    projectId: input.who,
    localPeer: `peer-${input.who}`,
    persistentPoint: `pp-${input.who}-${input.runKey ?? 'run'}`,
    transport: { namespace: input.namespace, databasePath: `${input.dataDir}/transport.sqlite` },
    databases: {
      orchestration: `${dir}/palimpsest.sqlite`,
      ordarium: `${dir}/ops.sqlite`,
      coordination: `${dir}/coordination.sqlite`,
      transportCursors: `${dir}/cursors.sqlite`,
      boundaryMemory: `${dir}/boundary.sqlite`,
      runtimeScope: `${dir}/runtime.sqlite`,
      attentionMarks: `${dir}/attention.sqlite`,
    },
    directory: [{ peerId: otherPeer, competenceTags: [input.competenceTag ?? 'analysis'] }],
    attention: { policyId: 'g10r-experiment-v1', cooldownMs: 0, activation: 'none' },
    boundaryHomeId: 'home-peer-palimpsest',
    boundaryRoutes: {},
    serve: { host: '127.0.0.1' },
  };
}

function shellPatch() {
  return readFileSync(join(PROFILES, 'headless', 'cordis.patch.yml'), 'utf8').replace(/^#[^\n]*\n(?!#)/, '');
}

/**
 * Write (create/overwrite) dsh profile dirs. Each def:
 *   { name, deployment (object), deploymentPath }
 * The written profile registers the palimpsest-dsh-host bundle and points it at
 * the run's deployment profile.
 */
export function writeHostProfiles(defs) {
  ensureHostBundle();
  const base = shellPatch();
  for (const def of defs) {
    mkdirSync(dirname(def.deploymentPath), { recursive: true });
    writeFileSync(def.deploymentPath, JSON.stringify(def.deployment, null, 2));
    const dir = join(PROFILES, def.name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify(
        {
          name: `dsh-profile-${def.name}`,
          private: true,
          dependencies: {},
          dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', 'palimpsest-dsh-host'], patchReload: 'startup' } },
        },
        null,
        2,
      ),
    );
    writeFileSync(
      join(dir, 'cordis.patch.yml'),
      `${base.trimEnd()}\n\n- id: palimpsest-tools\n  config:\n    palimpsestEntry: '${ADVANCED}'\n    deploymentProfile: '${def.deploymentPath.replace(/\\/g, '/')}'\n    serve: true\n    port: 0\n`,
    );
  }
}

/**
 * Seed one boundary workspace using the compiled product (same as the dogfood
 * reference). Only needed for federation-style flows that negotiate artifacts.
 */
export async function seedWorkspace(input) {
  const palimpsest = await loadAdvanced();
  const profile = palimpsest.loadDeploymentProfile(input.deploymentPath);
  const deployment = palimpsest.launchDeployment(profile);
  try {
    const bm = deployment.installed.boundaryMemory.service;
    await bm.openWorkspace({
      workspaceId: input.workspaceId,
      participants: input.participants.map((peerId) => ({ schemaVersion: 1, peerId })),
      purpose: input.purpose ?? 'G10-R experimental workspace',
    });
    await bm.createArtifact({
      workspaceId: input.workspaceId,
      artifactId: input.artifactId,
      type: { typeId: 'boundary.interface', version: 'v1' },
      title: input.title ?? 'experimental interface',
    });
  } finally {
    await deployment.close();
  }
}

/* ------------------------------------------------------------------ *
 * Principal launch / observe
 * ------------------------------------------------------------------ */

function parseLine(handle, line) {
  if (line.startsWith('PALIMPSEST_HOST_READY ')) {
    try {
      handle.ready = JSON.parse(line.slice('PALIMPSEST_HOST_READY '.length));
    } catch {
      /* ignore malformed */
    }
    return;
  }
  if (line.startsWith('PALIMPSEST_TURN ')) {
    try {
      handle.turns.push(JSON.parse(line.slice('PALIMPSEST_TURN '.length)));
    } catch {
      /* ignore malformed */
    }
    return;
  }
  if (line.startsWith('PALIMPSEST_ACTIVATION ')) {
    try {
      handle.activations.push(JSON.parse(line.slice('PALIMPSEST_ACTIVATION '.length)));
    } catch {
      /* ignore malformed */
    }
  }
}

/**
 * Spawn one DSH principal. Returns a live handle; call awaitReady/exitPromise.
 *   { profileName, task, cwd, sessionFile?, resumeId?, once?, idleMs? }
 */
export function launchPrincipal(opts) {
  const args = [DSH_BIN, '--profile', opts.profileName];
  if (opts.resumeId) args.push('--resume', opts.resumeId);
  if (opts.sessionFile) args.push('--session-file', opts.sessionFile);
  if (opts.once === true) args.push('--once');
  if (opts.idleMs !== undefined) args.push('--idle-ms', String(opts.idleMs));
  args.push(opts.task && opts.task.trim() !== '' ? opts.task : ' ');

  const child = spawn(process.execPath, args, { cwd: opts.cwd, stdio: ['ignore', 'pipe', 'pipe'] });
  const handle = {
    profileName: opts.profileName,
    child,
    ready: null,
    turns: [],
    activations: [],
    stdout: '',
    stderr: '',
    exited: false,
    exitCode: null,
    _buffer: '',
  };
  handle.exitPromise = new Promise((resolve) => {
    child.on('exit', (code) => {
      handle.exited = true;
      handle.exitCode = code;
      resolve(code);
    });
  });
  child.stdout.on('data', (chunk) => {
    const text = chunk.toString('utf8');
    handle.stdout += text;
    handle._buffer += text;
    const lines = handle._buffer.split('\n');
    handle._buffer = lines.pop() ?? '';
    for (const line of lines) parseLine(handle, line);
  });
  child.stderr.on('data', (chunk) => {
    handle.stderr += chunk.toString('utf8');
  });
  return handle;
}

/** Resolve when the READY line has been observed; undefined on timeout/exit. */
export async function awaitReady(handle, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (handle.ready !== null) return handle.ready;
    if (handle.exited) return undefined;
    if (Date.now() > deadline) return undefined;
    await sleep(250);
  }
}

/** Wait for the process to exit (or timeout); returns exit code or undefined. */
export async function awaitExit(handle, timeoutMs) {
  if (handle.exited) return handle.exitCode;
  return Promise.race([handle.exitPromise, sleep(timeoutMs).then(() => undefined)]);
}

export function killPrincipal(handle) {
  if (handle?.child && handle.child.exitCode === null) {
    try {
      handle.child.kill();
    } catch {
      /* already gone */
    }
  }
}

export async function waitFor(predicate, timeoutMs, intervalMs = 1000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const value = await predicate();
      if (value) return value;
    } catch {
      /* transient */
    }
    if (Date.now() > deadline) return undefined;
    await sleep(intervalMs);
  }
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/* ------------------------------------------------------------------ *
 * Turn-line derived counts
 * ------------------------------------------------------------------ */

export function countToolCalls(turns) {
  let calls = 0;
  for (const turn of turns ?? []) {
    for (const entry of turn.toolCalls ?? []) {
      if (typeof entry === 'string' && entry.startsWith('tool/call')) calls += 1;
    }
  }
  return calls;
}

export function countActivations(activations) {
  return (activations ?? []).filter((activation) => activation.activated === true).length;
}

export function countFederationCalls(turns) {
  let calls = 0;
  for (const turn of turns ?? []) {
    for (const entry of turn.toolCalls ?? []) {
      if (typeof entry === 'string' && entry.includes('palimpsest_')) calls += 1;
    }
  }
  return calls;
}

/* ------------------------------------------------------------------ *
 * ONE-principal bounded run (variant SINGLE_LOCUS)
 * ------------------------------------------------------------------ */

/**
 * Run ONE DSH principal one-shot on a bounded task. Returns an observation
 * record; never throws for a failed/timed-out run (retained as an observation).
 */
export async function singleLocusRun(input) {
  const startedAt = Date.now();
  const runDir = input.runDir;
  mkdirSync(runDir, { recursive: true });
  const deployment = deploymentProfile({
    who: 'palimpsest',
    other: 'ordarium',
    dataDir: runDir,
    namespace: input.namespace,
    runKey: input.runKey,
  });
  writeHostProfiles([
    { name: input.profileName ?? EXPERIMENT_PROFILE_P, deployment, deploymentPath: `${runDir}/p.json` },
  ]);

  const handle = launchPrincipal({
    profileName: input.profileName ?? EXPERIMENT_PROFILE_P,
    task: input.task,
    cwd: runDir,
    sessionFile: `${runDir}/principal.session`,
    once: true,
  });
  const exitCode = await awaitExit(handle, input.timeoutMs ?? 240000);
  const timedOut = exitCode === undefined;
  if (timedOut) killPrincipal(handle);
  await sleep(300);
  return {
    kind: 'single-locus',
    runDir,
    profileName: input.profileName ?? EXPERIMENT_PROFILE_P,
    sessionId: handle.ready?.sessionId ?? null,
    ready: handle.ready,
    turns: handle.turns,
    activations: handle.activations,
    exitCode: timedOut ? null : exitCode,
    timedOut,
    wallClockMs: Date.now() - startedAt,
    stderr: handle.stderr,
  };
}

/* ------------------------------------------------------------------ *
 * Federation run (variant FEDERATED_PEERS)
 * ------------------------------------------------------------------ */

/**
 * Shell out to the working real-host federation dogfood and parse its JSON
 * evidence. The dogfood owns profile setup; this wrapper owns timing/timeout.
 */
export async function federationRun(input) {
  const startedAt = Date.now();
  const outPath = input.outPath;
  mkdirSync(dirname(outPath), { recursive: true });
  const child = spawn(process.execPath, [DOGFOOD_FEDERATION, '--out', outPath], {
    cwd: input.cwd ?? REPO,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => (stdout += chunk.toString('utf8')));
  child.stderr.on('data', (chunk) => (stderr += chunk.toString('utf8')));
  const exited = new Promise((resolve) => child.on('exit', (code) => resolve(code)));
  const exitCode = await Promise.race([exited, sleep(input.timeoutMs ?? 300000).then(() => undefined)]);
  const timedOut = exitCode === undefined;
  if (timedOut) {
    try {
      child.kill();
    } catch {
      /* already gone */
    }
  }
  await sleep(500);
  let evidence;
  try {
    if (existsSync(outPath)) evidence = JSON.parse(readFileSync(outPath, 'utf8'));
  } catch {
    /* malformed evidence remains undefined */
  }
  if (evidence === undefined) {
    // Fall back to parsing the last JSON object from stdout.
    try {
      const start = stdout.indexOf('{');
      if (start >= 0) evidence = JSON.parse(stdout.slice(start));
    } catch {
      /* leave undefined */
    }
  }
  return {
    kind: 'federated-peers',
    runDir: dirname(outPath),
    outPath,
    evidence: evidence ?? null,
    result: evidence?.result ?? (timedOut ? 'TIMEOUT' : 'NO_EVIDENCE'),
    exitCode: timedOut ? null : exitCode,
    timedOut,
    wallClockMs: Date.now() - startedAt,
    stdout,
    stderr,
  };
}

/* ------------------------------------------------------------------ *
 * Session JSONL telemetry
 * ------------------------------------------------------------------ */

const ZSTD_CANDIDATES = ['zstd', 'D:/ProgramData/anaconda3/Library/bin/zstd.exe', 'C:/ProgramData/anaconda3/Library/bin/zstd.exe'];

function zstdDecompressAll(buffer) {
  for (const bin of ZSTD_CANDIDATES) {
    try {
      return execFileSync(bin, ['-d', '-c'], { input: buffer, maxBuffer: 1 << 28 }).toString('utf8');
    } catch {
      /* try next */
    }
  }
  return undefined;
}

/** Locate a session file by its globally-unique session id (scan, no slug guessing). */
export function findSessionFile(sessionId) {
  const root = join(DSH_HOME, 'sessions');
  if (!existsSync(root) || typeof sessionId !== 'string' || sessionId.length === 0) return undefined;
  for (const dir of readdirSync(root)) {
    const candidate = join(root, dir, sessionId, 'session.v3.jsonl.zstd');
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

function safeJson(line) {
  try {
    return JSON.parse(line);
  } catch {
    return undefined;
  }
}

/**
 * Read + fold one DSH session's telemetry. Returns undefined when the session
 * file cannot be found or decompressed (caller then records tokens UNAVAILABLE).
 */
export async function readSessionTelemetry(sessionId) {
  const file = findSessionFile(sessionId);
  if (file === undefined) return undefined;
  const text = zstdDecompressAll(readFileSync(file));
  if (text === undefined) return undefined;
  const events = text
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map(safeJson)
    .filter((event) => event !== undefined);
  const palimpsest = await loadAdvanced();
  const extracted = palimpsest.extractSessionTelemetry(events);
  let provider;
  let model;
  for (const event of events) {
    const source = event?.data?.message?.source;
    if (source && typeof source.provider === 'string' && typeof source.model === 'string') {
      provider = source.provider;
      model = source.model;
    }
    const header = event?.data?.header?.config;
    if (provider === undefined && header && typeof header.provider === 'string' && typeof header.model === 'string') {
      provider = header.provider;
      model = header.model;
    }
  }
  return { file, events, extracted, provider, model };
}

/**
 * PROXY counts from a session's real tool-call events:
 *   palimpsestCalls      every `palimpsest_*` tool call (coordination overhead proxy)
 *   federationMessages   every `palimpsest_federation` action=message call (cross-peer proxy)
 */
export function sessionToolCallStats(events) {
  let palimpsestCalls = 0;
  let federationMessages = 0;
  for (const event of events ?? []) {
    if (event?.type !== 'tool/call') continue;
    const name = event?.data?.name;
    if (typeof name !== 'string' || !name.startsWith('palimpsest_')) continue;
    palimpsestCalls += 1;
    if (name === 'palimpsest_federation') {
      let action;
      try {
        action = JSON.parse(event.data.arguments ?? '{}')?.action;
      } catch {
        action = undefined;
      }
      if (action === 'message') federationMessages += 1;
    }
  }
  return { palimpsestCalls, federationMessages };
}

/** Sum a numeric token bucket across sessions; undefined when no session reports it. */export function combineTelemetry(telemetryList) {
  const present = telemetryList.filter((entry) => entry !== undefined);
  if (present.length === 0) return undefined;
  const sum = (key) => {
    let total;
    for (const entry of present) {
      const value = entry.extracted.usage[key];
      if (typeof value === 'number' && Number.isFinite(value)) total = (total ?? 0) + value;
    }
    return total;
  };
  const counts = (key) => present.reduce((acc, entry) => acc + (entry.extracted[key] ?? 0), 0);
  let provider;
  let model;
  for (const entry of present) {
    if (provider === undefined && typeof entry.provider === 'string') provider = entry.provider;
    if (model === undefined && typeof entry.model === 'string') model = entry.model;
  }
  return {
    sessionsRead: present.length,
    provider,
    model,
    usage: {
      inputTokens: sum('inputTokens'),
      outputTokens: sum('outputTokens'),
      cacheReadTokens: sum('cacheReadTokens'),
      cacheWriteTokens: sum('cacheWriteTokens'),
      reasoningTokens: sum('reasoningTokens'),
    },
    turns: counts('turns'),
    steps: counts('steps'),
    toolCalls: counts('toolCalls'),
    errors: counts('errors'),
  };
}

/* ------------------------------------------------------------------ *
 * Provenance inputs
 * ------------------------------------------------------------------ */

export function dshVersion() {
  try {
    return JSON.parse(readFileSync('C:/Users/66494/AppData/Roaming/npm/node_modules/@deepseek-ai/dsh/package.json', 'utf8')).version;
  } catch {
    return 'unknown';
  }
}

export function packageVersion(packageJsonPath) {
  try {
    return JSON.parse(readFileSync(packageJsonPath, 'utf8')).version;
  } catch {
    return 'unknown';
  }
}
