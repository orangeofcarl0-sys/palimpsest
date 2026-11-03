#!/usr/bin/env node
/**
 * R2-U §17 — TIME-TO-FIRST-PULL AND TOOL ACTIONS BEFORE FIRST PULL, FROM THE DURABLE SESSION ARTIFACT.
 *
 * §17 asks for two secondary outcomes the trial record cannot compute at run time: the elapsed time from the
 * worker receiving its task to its first governed pull, and how many tool actions it took before that pull.
 * Both live in the DSH session artifact, which the host writes durably and which this script reads
 * AFTERWARDS.
 *
 * WHY POST-HOC RATHER THAN IN THE TRIAL. The runner reads the session while the worker is still alive, so the
 * artifact is not yet complete; and a trial that pulled needs the ORDERING of dispatch events, which the
 * runner's first-use log deliberately does not carry (it records names, not timestamps, so that no argument
 * or result text can leak into telemetry). Reading the finished artifact is the only way to get a real
 * elapsed time rather than a wall-clock guess.
 *
 * THE ARTIFACT IS THE SAME DURABLE EVIDENCE A REVIEWER CAN READ, not a second measurement channel: the
 * timestamps come from the session's own event records, and the pull is identified by the host's own
 * `tool/ptc-dispatch` events naming `palimpsest_worker_context_pull`.
 *
 * The result is MERGED into `normalized-results.json` as a clearly-labelled post-hoc field, so a reader can
 * tell it apart from what the trial recorded live.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { zstdDecompressSync } from 'node:zlib';

const REPO_ROOT = new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/u, '$1');
const RIG = join(homedir(), '.palimpsest-r2u', 'matrix');
const EVIDENCE = join(REPO_ROOT, 'research-evidence', 'r2-u');
const PULL_TOOL = 'palimpsest_worker_context_pull';

const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.replace(/^--/u, '').split('=');
  return [key, rest.join('=')];
}));
const runsDir = args.get('runs') ?? (() => {
  const planPath = join(RIG, 'plan.json');
  return existsSync(planPath) ? JSON.parse(readFileSync(planPath, 'utf8')).runsDir : join(RIG, 'runs');
})();

/**
 * Read one trial's session events.
 *
 * The artifact is a MULTI-FRAME zstd stream — one frame per append — so it is decompressed frame by frame
 * rather than with a single `zstdDecompressSync` call, which stops at the first frame and silently returns a
 * 281-byte header. That mistake was made and caught here: the first attempt reported a session with exactly
 * one event for every trial.
 *
 * The directory nesting is NOT assumed: the host lays a session out as
 * `sessions/<workspace-slug>/<session-id>/session.v4.jsonl.zstd`, and a stage that hard-coded two levels
 * found no `.zstd` file at all and reported zero pulls rather than failing. The walk is therefore recursive
 * and bounded, so a layout change degrades to "no artifact found" instead of to a wrong answer.
 */
function sessionEvents(homeDir) {
  const sessionsDir = join(homeDir, 'sessions');
  if (!existsSync(sessionsDir)) return [];
  const found = [];
  const walk = (dir, depth) => {
    if (depth > 4) return;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) walk(join(dir, entry.name), depth + 1);
      else if (entry.name.endsWith('.zstd')) found.push(join(dir, entry.name));
    }
  };
  walk(sessionsDir, 0);
  if (found.length === 0) return [];
  /**
   * A trial's home holds SEVERAL sessions: the worker's own, plus auxiliary ones the host opens (a title
   * generator, for instance). Only the worker's carries the brief this script keys on, so the worker session
   * is preferred by name and the others are used only if no worker session exists. Without this, a trial
   * whose auxiliary session happened to be found first was reported as having no timing at all.
   */
  const workerSession = found.find((path) => path.split(/[\\/]/u).some((part) => part.startsWith('worker-')));
  const chosen = workerSession ?? found[0];

  const buf = readFileSync(chosen);
  const starts = [];
  for (let index = 0; index < buf.length - 3; index += 1) {
    if (buf[index] === 0x28 && buf[index + 1] === 0xb5 && buf[index + 2] === 0x2f && buf[index + 3] === 0xfd) starts.push(index);
  }
  let text = '';
  for (let index = 0; index < starts.length; index += 1) {
    const end = index + 1 < starts.length ? starts[index + 1] : buf.length;
    try {
      text += zstdDecompressSync(buf.subarray(starts[index], end)).toString('utf8');
    } catch {
      /* a truncated final frame is not evidence; skip it */
    }
  }
  return text
    .split(String.fromCharCode(10))
    .filter((line) => line.trim() !== '')
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter((event) => event !== null);
}

/**
 * Derive the §17 timing facts for one trial.
 *
 * The clock starts at the `user/message` carrying the WORKER BRIEF — not at process start — because the
 * question §17 asks is how long the worker worked before consulting the capital, and process start includes
 * the host's own composition. The brief is identified by its first line, which is the product's own wording.
 */
function timingFor(events) {
  const brief = events.find(
    (event) => event.type === 'user/message' && JSON.stringify(event.data ?? '').includes('You are a Palimpsest WORK WORKER'),
  );
  if (brief === undefined) return null;
  const startedAt = brief.time;
  const dispatches = events.filter((event) => typeof event.type === 'string' && event.type === 'tool/ptc-dispatch-start');
  const pullIndex = dispatches.findIndex((event) => event.data?.name === PULL_TOOL);
  if (pullIndex === -1) return { startedAt, pulled: false, timeToFirstPullMs: null, toolActionsBeforeFirstPull: null };
  return {
    startedAt,
    pulled: true,
    timeToFirstPullMs: dispatches[pullIndex].time - startedAt,
    /** Every PTC dispatch before the first pull is one tool action the worker took first. */
    toolActionsBeforeFirstPull: pullIndex,
    pullsInSession: dispatches.filter((event) => event.data?.name === PULL_TOOL).length,
  };
}

const out = (line) => process.stdout.write(`${line}\n`);
const normalizedPath = join(EVIDENCE, 'normalized-results.json');
if (!existsSync(normalizedPath)) throw new Error(`no normalized results at ${normalizedPath}; run \`pnpm r2u:analyse\` first`);
const normalized = JSON.parse(readFileSync(normalizedPath, 'utf8'));

let enriched = 0;
let pulled = 0;
for (const trial of normalized.trials) {
  const home = join(runsDir, trial.trialId, 'home');
  if (!existsSync(home)) continue;
  const timing = timingFor(sessionEvents(home));
  if (timing === null) continue;
  trial.postHocTiming = {
    source: 'durable DSH session artifact (host-written); extracted after the matrix, not at run time',
    startedAt: timing.startedAt,
    pulled: timing.pulled,
    timeToFirstPullMs: timing.timeToFirstPullMs,
    toolActionsBeforeFirstPull: timing.toolActionsBeforeFirstPull,
    pullsInSession: timing.pullsInSession ?? 0,
  };
  enriched += 1;
  if (timing.pulled) pulled += 1;
}

writeFileSync(normalizedPath, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
out(`R2-U §17 pull timing — ${String(enriched)} trial(s) read from durable session artifacts; ${String(pulled)} recorded a pull`);
out(`merged into ${normalizedPath.replace(REPO_ROOT, '<repo>')}`);
