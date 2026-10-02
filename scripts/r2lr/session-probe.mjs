#!/usr/bin/env node
/**
 * R2-LR §6/§7/§21 — THE REAL MODEL-VISIBLE SESSION BOUNDARY.
 *
 * WHY THIS EXISTS. Every prior gate proved INTENDED bytes: it rendered what the host was about to send, or
 * read the host's own telemetry, and then asserted on that. R1-L did exactly this and reported the index
 * as delivered — while the index was in fact never forwarded to the runner, so no worker ever saw it. The
 * lesson is that a presentation claim must be checked at the boundary where the MODEL receives it, which
 * is the durable DSH session artifact, not a host-side reconstruction of it.
 *
 * WHAT IT DOES. Given a DSH home and a worker session, it:
 *
 *   1. finds the durable session artifact under `<home>/sessions/**`;
 *   2. decompresses it (the artifact is multi-frame zstd, so it must be split on the frame magic rather
 *      than decompressed in one call — a single-frame read returns only the header);
 *   3. extracts the USER MESSAGE(s) the model was actually given;
 *   4. returns them plus a digest, so a caller can assert on real bytes.
 *
 * WHAT IT IS NOT. It is not a product component and it reads no canonical owner. It is acceptance
 * evidence tooling, and it is deliberately strict: if it cannot find a session it says so rather than
 * returning an empty string that a caller might mistake for "the message was empty".
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { zstdDecompressSync } from 'node:zlib';

/** The zstd frame magic. A multi-frame artifact must be split on this, not decompressed in one call. */
const ZSTD_MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);

/**
 * Decompress a multi-frame zstd buffer.
 *
 * `zstdDecompressSync` on the whole buffer returns ONLY the first frame — measured, and it is why an
 * earlier attempt at this read reported a 281-byte "session". Splitting on the magic and decompressing
 * each frame is what actually recovers the transcript.
 */
export function decompressFrames(buffer) {
  const starts = [];
  for (let index = 0; index <= buffer.length - 4; index += 1) {
    if (buffer[index] === ZSTD_MAGIC[0] && buffer[index + 1] === ZSTD_MAGIC[1] && buffer[index + 2] === ZSTD_MAGIC[2] && buffer[index + 3] === ZSTD_MAGIC[3]) {
      starts.push(index);
    }
  }
  if (starts.length === 0) return '';
  let text = '';
  for (let index = 0; index < starts.length; index += 1) {
    const end = index + 1 < starts.length ? starts[index + 1] : buffer.length;
    try {
      text += zstdDecompressSync(buffer.subarray(starts[index], end)).toString('utf8');
    } catch {
      /* a frame that will not decompress contributes nothing rather than aborting the read */
    }
  }
  return text;
}

/** Every durable session artifact under a DSH home, newest last. */
export function findSessionArtifacts(home) {
  const root = join(home, 'sessions');
  if (!existsSync(root)) return [];
  const found = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith('.jsonl.zstd')) found.push(path);
    }
  };
  walk(root);
  return found;
}

/**
 * The text of the user messages in a decompressed session transcript.
 *
 * The transcript is JSONL of DSH session events. A user message is identified by its `type`, and the text
 * lives under `data.message.content[*].text` — the same shape the runner composes with `createUserMessage`.
 * The walk is deliberately structural rather than a regex over the raw text, so a message body containing
 * JSON punctuation cannot be mistaken for an event.
 */
export function userMessages(transcriptText) {
  const messages = [];
  for (const line of transcriptText.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed[0] !== '{') continue;
    let event;
    try {
      event = JSON.parse(trimmed);
    } catch {
      continue;
    }
    const type = event?.type;
    if (type !== 'user/message' && type !== 'message/user' && type !== 'user') continue;
    const content = event?.data?.message?.content ?? event?.data?.content ?? event?.message?.content;
    if (!Array.isArray(content)) continue;
    const text = content
      .filter((part) => part !== null && typeof part === 'object' && part.type === 'text' && typeof part.text === 'string')
      .map((part) => part.text)
      .join('');
    if (text.length > 0) messages.push(text);
  }
  return messages;
}

/**
 * Read the model-visible user message(s) for a worker session.
 *
 * @param {{ home: string, workerSessionHint?: string }} input `workerSessionHint` prefers a session whose
 *   path contains that segment, so a rig holding several sessions (an auxiliary one plus the worker's)
 *   resolves to the WORKER's rather than whichever the directory walk happened to reach first.
 * @returns {{ found: boolean, path: string | null, messages: readonly string[], promptText: string, promptDigest: string, artifactDigest: string, note: string }}
 */
export function readModelVisiblePrompt(input) {
  const artifacts = findSessionArtifacts(input.home);
  if (artifacts.length === 0) {
    return Object.freeze({ found: false, path: null, messages: Object.freeze([]), promptText: '', promptDigest: '', artifactDigest: '', note: `no session artifact under ${input.home}/sessions` });
  }
  const hint = typeof input.workerSessionHint === 'string' && input.workerSessionHint.length > 0 ? input.workerSessionHint : null;
  const preferred = hint === null ? [] : artifacts.filter((path) => path.includes(hint));
  /**
   * Preference order: an explicitly hinted session, then one whose path contains a `worker-` segment
   * (the runner brands worker sessions that way), then the newest artifact. Each step is a rule, not a
   * guess, and the chosen path is returned so a caller can record which one it read.
   */
  const ordered = [
    ...preferred,
    ...artifacts.filter((path) => path.includes('worker-') && !preferred.includes(path)),
    ...artifacts.filter((path) => !path.includes('worker-') && !preferred.includes(path)).reverse(),
  ];
  for (const path of ordered) {
    const bytes = readFileSync(path);
    const transcript = decompressFrames(bytes);
    const messages = userMessages(transcript);
    if (messages.length === 0) continue;
    const promptText = messages.join('\n');
    return Object.freeze({
      found: true,
      path,
      messages: Object.freeze(messages),
      promptText,
      promptDigest: createHash('sha256').update(promptText, 'utf8').digest('hex'),
      artifactDigest: createHash('sha256').update(bytes).digest('hex'),
      note: `${String(messages.length)} user message(s)`,
    });
  }
  return Object.freeze({ found: false, path: null, messages: Object.freeze([]), promptText: '', promptDigest: '', artifactDigest: '', note: `no artifact under ${input.home}/sessions carried a user message` });
}

/**
 * The index section of a model-visible prompt, or null when the section is absent.
 *
 * The section is delimited by its own content, not by a blank-line heuristic: it begins at the heading and
 * ends after the product's last instruction line, which is the fixed literal
 * `Do not invent handles: a handle that is not listed above will be refused.` Everything the host appends
 * afterwards ("How to work:", runtime context, skill catalog) belongs to other layers and must not be
 * attributed to the index — an earlier version of this function ran to the end of the prompt and thereby
 * compared the index against the whole rest of the message.
 */
export const INDEX_SECTION_TERMINATOR = 'Do not invent handles: a handle that is not listed above will be refused.';

export function indexSectionOf(promptText, heading = 'Project context available to this attempt') {
  const start = promptText.indexOf(heading);
  if (start === -1) return null;
  const rest = promptText.slice(start);
  const end = rest.indexOf(INDEX_SECTION_TERMINATOR);
  if (end === -1) return rest.trimEnd();
  return rest.slice(0, end + INDEX_SECTION_TERMINATOR.length);
}

/** The `@ctx/...` handles that appear in a model-visible prompt, in first-appearance order. */
export function handlesInPrompt(promptText) {
  const seen = [];
  for (const match of promptText.matchAll(/@ctx\/[a-z]+\/[^\s"'`,)]+/gu)) {
    if (!seen.includes(match[0])) seen.push(match[0]);
  }
  return seen;
}
