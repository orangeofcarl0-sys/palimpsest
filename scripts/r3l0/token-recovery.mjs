#!/usr/bin/env node
/**
 * R3-L0 §20 — POST-HOC TOKEN RECOVERY FROM THE DURABLE SESSION ARTIFACTS.
 *
 * §20 asks for input/output/cached tokens "where available". The primary matrix captured everything else, but
 * the token fields were not wired into the in-trial record before the run. They ARE available: every generation
 * left a durable session artifact under its own DSH home, and the provider-reported usage is inside it.
 *
 * WHAT THIS DOES, AND WHAT IT DELIBERATELY DOES NOT DO.
 *
 *   · It READS the artifacts the matrix already produced. It re-runs nothing.
 *   · It adds token counts to the recorded sessions. It does NOT touch any primary outcome: PERR, the diagnostic
 *     vectors, promotion, the witnesses and the verdicts are all left exactly as recorded.
 *   · It records the fact that the field was recovered post hoc rather than captured in trial, so the record
 *     does not imply the harness captured it live.
 *
 * This is a SECONDARY outcome enrichment, not a load-bearing correction, so it does not engage §26's
 * stop-and-adjudicate rule: no primary result depends on it, and a session whose artifact cannot be read is
 * recorded as unreadable rather than as zero.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { zstdDecompressSync } from 'node:zlib';

import { REPO_ROOT, STAGE_EVIDENCE_PATH } from './envelope.mjs';
import { PRIMARY_EXECUTOR } from './plan.mjs';

const NL = String.fromCharCode(10);

/** Every session artifact under the rig root. A directory that cannot be read contributes nothing. */
function sessionArtifacts(runDir) {
  const found = [];
  const walk = (dir, depth) => {
    if (depth > 8 || !existsSync(dir)) return;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path, depth + 1);
      else if (entry.name === 'session.v4.jsonl.zstd') found.push(path);
    }
  };
  walk(runDir, 0);
  return found;
}

/**
 * The ZSTD frame magic. A DSH session artifact is MULTI-FRAME, so it must be split on the magic; a single
 * decompress call would read only the first frame and silently lose the rest.
 */
const FRAME_MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);

/** §20: read the provider-reported usage out of a DSH home's session artifacts. */
function readUsageFromHome(home) {
  const artifacts = sessionArtifacts(home);
  if (artifacts.length === 0) return { usage: null, note: 'no session artifact was found under this home' };
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheReadTokens = 0;
  let cacheWriteTokens = 0;
  let runningTotal = 0;
  let records = 0;
  for (const artifact of artifacts) {
    const buffer = readFileSync(artifact);
    const starts = [];
    let cursor = buffer.indexOf(FRAME_MAGIC);
    while (cursor !== -1) { starts.push(cursor); cursor = buffer.indexOf(FRAME_MAGIC, cursor + 1); }
    let text = '';
    for (let index = 0; index < starts.length; index += 1) {
      const end = index + 1 < starts.length ? starts[index + 1] : buffer.length;
      try { text += zstdDecompressSync(buffer.subarray(starts[index], end)).toString('utf8'); } catch { /* a torn frame is normal */ }
    }
    for (const line of text.split(String.fromCharCode(10))) {
      if (line.trim() === '') continue;
      let parsed;
      try { parsed = JSON.parse(line); } catch { continue; }
      const usage = parsed?.data?.usage;
      if (usage === undefined || usage === null) continue;
      inputTokens += Number(usage.inputTokens ?? 0);
      outputTokens += Number(usage.outputTokens ?? 0);
      cacheReadTokens += Number(usage.cacheReadTokens ?? 0);
      cacheWriteTokens += Number(usage.cacheWriteTokens ?? 0);
      /** The provider's `totalTokens` is a RUNNING TOTAL, so the last one is the session figure. */
      runningTotal = Math.max(runningTotal, Number(usage.totalTokens ?? 0));
      records += 1;
    }
  }
  if (records === 0) return { usage: null, note: 'the session artifact carried no usage record' };
  return {
    usage: { inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, totalTokens: runningTotal, usageRecords: records, billedTokens: inputTokens + outputTokens },
    note: `provider-reported usage from ${String(artifacts.length)} durable session artifact(s); no monetary cost, because the route declares no price`,
  };
}

async function main() {
  const matrixPath = join(REPO_ROOT, STAGE_EVIDENCE_PATH, 'matrix.json');
  if (!existsSync(matrixPath)) throw new Error('no matrix to enrich; run scripts/r3l0/matrix.mjs first');
  const matrix = JSON.parse(readFileSync(matrixPath, 'utf8'));


  const runDir = matrix.runDir;
  const artifacts = sessionArtifacts(runDir);
  const byGeneration = new Map();
  for (const artifact of artifacts) {
    /** The artifact path names the trajectory directory, which names the block and arm. */
    const normalized = artifact.replace(/\\/gu, '/');
    const match = /(b\d-[HC])(?:\/|\\\\)/u.exec(normalized);
    if (match === null) continue;
    const trajectoryId = match[1];
    if (!byGeneration.has(trajectoryId)) byGeneration.set(trajectoryId, []);
    byGeneration.get(trajectoryId).push(artifact);
  }

  let recovered = 0;
  let unreadable = 0;
  const sessions = matrix.sessions.map((session) => {
    const home = join(runDir, session.trajectoryId, 'home');
    let usage = null;
    let note = null;
    try {
      const read = readUsageFromHome(home);
      usage = read.usage;
      note = read.note;
    } catch (error) {
      note = `unreadable: ${String(error?.message ?? error).slice(0, 140)}`;
    }
    if (usage === null) unreadable += 1; else recovered += 1;
    return Object.freeze({ ...session, usage, cost: null, usageNote: note });
  });

  const enriched = Object.freeze({
    ...matrix,
    /** §20: recorded as RECOVERED, so the record does not claim the harness captured it in trial. */
    tokenAccounting: Object.freeze({
      method: 'POST_HOC_RECOVERY_FROM_DURABLE_SESSION_ARTIFACTS',
      note: 'the token fields were not wired into the in-trial record before the matrix ran; they were recovered afterwards from the durable session artifacts the run left behind. No primary outcome depends on them, and no primary outcome was altered.',
      artifactsFound: artifacts.length,
      sessionsRecovered: recovered,
      sessionsUnreadable: unreadable,
    }),
    sessions,
  });
  writeFileSync(matrixPath, `${JSON.stringify(enriched, null, 2)}${NL}`, 'utf8');

  process.stdout.write(`token recovery: ${String(recovered)}/${String(sessions.length)} sessions enriched from ${String(artifacts.length)} durable artifact(s)${NL}`);
  if (unreadable > 0) process.stdout.write(`  ${String(unreadable)} session(s) had no readable artifact, recorded as null rather than zero${NL}`);
  const totals = sessions.reduce((acc, entry) => ({
    input: acc.input + (entry.usage?.inputTokens ?? 0),
    output: acc.output + (entry.usage?.outputTokens ?? 0),
    cached: acc.cached + (entry.usage?.cacheReadTokens ?? 0),
  }), { input: 0, output: 0, cached: 0 });
  process.stdout.write(`  input=${String(totals.input)} output=${String(totals.output)} cached=${String(totals.cached)}${NL}`);
}

if (process.argv[1] !== undefined && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/gu, '/')}`).href) {
  await main();
}
