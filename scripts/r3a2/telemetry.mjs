/**
 * R3-A2 §"Primary qualification evidence"/§"Experiment economics" — THE PROVIDER TELEMETRY READER.
 *
 * §"Primary qualification evidence" asks for input tokens, output tokens, cached tokens and a provider-reported
 * monetary cost "where providers expose them". §"Experiment economics" adds "Do not invent unavailable cost
 * values."
 *
 * WHERE THE NUMBERS COME FROM. A DSH worker writes a durable session artifact under its home, at
 * `sessions/<world-slug>/worker-<id>/session.v4.jsonl.zstd`. The file is ZSTD in MULTIPLE FRAMES, so it is
 * split on the frame magic before decompression; a single `zstdDecompressSync` over the whole file reads only
 * the first frame and silently loses the rest. Each `assistant/message` record carries a provider-reported
 * `usage` object with `inputTokens`, `outputTokens`, `cacheReadTokens`, `cacheWriteTokens` and `totalTokens`.
 *
 * WHAT THIS MODULE REFUSES TO DO. It does not sum the per-step `totalTokens` — that field is a RUNNING TOTAL,
 * so summing it multiplies the real cost by roughly the number of steps. It sums the per-step increments
 * (`inputTokens`, `outputTokens`, cache reads and writes) and reports `totalTokens` as the LAST observed
 * running total, which is the provider's own figure for the session.
 *
 * A COST IS COMPUTED ONLY WHEN BOTH SIDES EXIST: a declared price for the route AND the token counts it
 * applies to. Otherwise `cost` is `null` and the reason is recorded.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { zstdDecompressSync } from 'node:zlib';

import { DECLARED_PRICES } from './models.mjs';

/** The ZSTD frame magic. A multi-frame artifact must be split here or every frame after the first is lost. */
const FRAME_MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);

/** Recursively list files under a directory, tolerating a directory that does not exist. */
function walkFiles(root, out = []) {
  let entries;
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) walkFiles(path, out);
    else out.push(path);
  }
  return out;
}

/**
 * Decompress a MULTI-FRAME zstd artifact.
 *
 * Each frame is decompressed independently; a frame that fails to decompress is counted and skipped rather
 * than aborting the read, because a torn final frame is normal for a session that was still being written.
 */
export function decompressFrames(path) {
  const buffer = readFileSync(path);
  const starts = [];
  let cursor = 0;
  while (cursor !== -1) {
    cursor = buffer.indexOf(FRAME_MAGIC, cursor);
    if (cursor !== -1) {
      starts.push(cursor);
      cursor += 1;
    }
  }
  let text = '';
  let failedFrames = 0;
  for (let index = 0; index < starts.length; index += 1) {
    const end = index + 1 < starts.length ? starts[index + 1] : buffer.length;
    try {
      text += zstdDecompressSync(buffer.subarray(starts[index], end)).toString('utf8');
    } catch {
      failedFrames += 1;
    }
  }
  return Object.freeze({ text, frames: starts.length, failedFrames });
}

/** Parse the JSONL records of a decompressed session artifact, skipping any line that does not parse. */
export function sessionRecords(text) {
  const records = [];
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue;
    try {
      records.push(JSON.parse(line));
    } catch {
      /* a torn line is not a record */
    }
  }
  return records;
}

/** Locate the worker session artifacts under a DSH home. */
export function findSessionArtifacts(home) {
  return walkFiles(join(home, 'sessions')).filter((path) => path.endsWith('session.v4.jsonl.zstd'));
}

/**
 * §"Primary qualification evidence": read the provider-reported usage from a DSH home.
 *
 * @param {string} home the trial's DSH home
 * @param {{ modelId: string }} route the route the trial ran
 */
export function readSessionTelemetry(home, route) {
  const artifacts = findSessionArtifacts(home);
  if (artifacts.length === 0) {
    return Object.freeze({
      usage: null,
      cost: null,
      note: 'no session artifact was found, so the provider reported no token usage for this trial',
      artifacts: Object.freeze([]),
    });
  }

  /** A session may be sharded across artifacts; the sums are over every usage record in every artifact. */
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheReadTokens = 0;
  let cacheWriteTokens = 0;
  let runningTotalTokens = 0;
  let usageRecords = 0;
  const digests = [];
  const perArtifact = [];

  for (const path of artifacts) {
    const { text, frames, failedFrames } = decompressFrames(path);
    let seen = 0;
    for (const record of sessionRecords(text)) {
      const usage = record?.data?.usage;
      if (usage === undefined || usage === null) continue;
      inputTokens += Number(usage.inputTokens ?? 0);
      outputTokens += Number(usage.outputTokens ?? 0);
      cacheReadTokens += Number(usage.cacheReadTokens ?? 0);
      cacheWriteTokens += Number(usage.cacheWriteTokens ?? 0);
      /** The provider's `totalTokens` is a RUNNING TOTAL; the last one seen is the session's figure. */
      runningTotalTokens = Math.max(runningTotalTokens, Number(usage.totalTokens ?? 0));
      seen += 1;
    }
    usageRecords += seen;
    perArtifact.push({ bytes: statSync(path).size, frames, failedFrames, usageRecords: seen });
    digests.push(path.replace(/\\/gu, '/').split('/sessions/').pop() ?? path);
  }

  const usage = Object.freeze({
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    /** The provider's own running total, NOT the sum of the running totals. */
    totalTokens: runningTotalTokens,
    usageRecords,
    /** The sum of the per-step increments, which is the number a price would apply to. */
    billedTokens: inputTokens + outputTokens,
    artifacts: Object.freeze(perArtifact),
  });

  const price = DECLARED_PRICES[route.modelId] ?? null;
  const priced = price !== null
    && typeof price.usdPerMillionInputTokens === 'number'
    && typeof price.usdPerMillionOutputTokens === 'number';
  const cost = priced
    ? Object.freeze({
      usd: (inputTokens / 1_000_000) * price.usdPerMillionInputTokens + (outputTokens / 1_000_000) * price.usdPerMillionOutputTokens,
      basis: 'declared price x provider-reported token counts',
      source: price.source,
    })
    : null;

  return Object.freeze({
    usage,
    cost,
    note: priced
      ? 'cost computed from the route\'s declared price and the provider-reported token counts'
      : `no monetary cost is recorded: ${price?.reason ?? 'the route declares no price'}`,
    artifacts: Object.freeze(digests),
  });
}
