/**
 * R3-L0C §13/§14/§16/§18 — THE SESSION INSTRUMENTATION.
 *
 * §13 counts, before the first Result submission: `rawHistoryArtifactsRead` and `rawHistoryBytesReturned`. §14
 * counts the search and action cost. §16 records the runtime's own completion cause. §18 classifies the
 * observable information path.
 *
 * WHY THIS READS THE DURABLE SESSION ARTIFACT. The R3-L0A audit established the lesson the hard way: a host-side
 * count of "what the harness intended to deliver" is not a measurement of what the WORKER did. The packaged
 * runtime records every tool invocation with its `name`, its `arguments`, its `isError` flag and the `content` it
 * returned, and that record is the only place the question is answerable. So every number here comes from the
 * session artifact, and the DECLARED CORPUS PATH SET is applied at ANALYSIS time rather than by the child — a
 * harness bug must not be able to silently redefine the primary outcome.
 *
 * §13'S COUNTING RULE, ENFORCED IN CODE: only reads of a DECLARED corpus document count as raw-history reads, and
 * a capital body NEVER counts as a raw-history byte. Without that rule C would appear to read more history
 * precisely because it was handed capital.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { zstdDecompressSync } from 'node:zlib';

import { isDeclaredCorpusPath } from './corpus.mjs';

const NL = String.fromCharCode(10);
const FRAME_MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);
const BS = String.fromCharCode(92);

/** Fold Windows separators to POSIX so one spelling matches every path. */
function fold(text) {
  return String(text).split(BS + BS).join('/').split(BS).join('/');
}

/** Split a multi-frame zstd artifact and decompress every frame. */
export function decompressFrames(path) {
  const buffer = readFileSync(path);
  const starts = [];
  let cursor = buffer.indexOf(FRAME_MAGIC);
  while (cursor !== -1) { starts.push(cursor); cursor = buffer.indexOf(FRAME_MAGIC, cursor + 1); }
  let text = '';
  for (let index = 0; index < starts.length; index += 1) {
    const end = index + 1 < starts.length ? starts[index + 1] : buffer.length;
    try { text += zstdDecompressSync(buffer.subarray(starts[index], end)).toString('utf8'); } catch { /* a torn frame is normal */ }
  }
  return text;
}

/** Every session artifact under a home, deepest-first, with its attempt id parsed from the path. */
export function sessionArtifacts(home) {
  const found = [];
  const walk = (dir, depth) => {
    if (depth > 8) return;
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path, depth + 1);
      else if (entry.name === 'session.v4.jsonl.zstd') {
        const normalized = fold(path);
        found.push(Object.freeze({ path, attemptId: (/attempt-([0-9a-f]+)/u.exec(normalized)?.[1]) ?? null, bytes: statSync(path).size, mtimeMs: statSync(path).mtimeMs }));
      }
    }
  };
  walk(home, 0);
  return found;
}

/** The JSONL records of an artifact, skipping any line that does not parse. */
export function sessionRecords(text) {
  const records = [];
  for (const line of text.split(NL)) {
    if (line.trim() === '') continue;
    try { records.push(JSON.parse(line)); } catch { /* a torn line is not a record */ }
  }
  return records;
}

/** Extract the arguments of a dispatch as a string, whatever shape the runtime recorded. */
function argsText(data) {
  const raw = data?.arguments;
  if (typeof raw === 'string') return raw;
  if (raw === null || raw === undefined) return '';
  try { return JSON.stringify(raw); } catch { return String(raw); }
}

/** Extract the returned content of a dispatch as a string. */
function contentTextOf(data) {
  const raw = data?.content;
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw)) return raw.map((entry) => (typeof entry === 'string' ? entry : entry?.text ?? '')).join(NL);
  if (raw === null || raw === undefined) return '';
  try { return JSON.stringify(raw); } catch { return String(raw); }
}

/** Whether a dispatch actually returned content. */
function contentReturnedOf(data) {
  if (data?.isError === true) return false;
  const text = contentTextOf(data).trim();
  if (text === '') return false;
  return !/^(no matches|found 0 )/iu.test(text);
}

/** The paths a dispatch names. */
function namedPathsOf(data) {
  const text = argsText(data);
  const found = new Set();
  const raw = data?.arguments;
  const structured = raw !== null && typeof raw === 'object' ? raw : null;
  for (const key of ['file_path', 'path', 'cwd', 'dir']) {
    const value = structured?.[key];
    if (typeof value === 'string' && value.trim() !== '') found.add(value);
  }
  if (typeof structured?.pattern === 'string' && structured.pattern.trim() !== '') found.add(structured.pattern);
  const haystack = `${text}${NL}${structured?.command ?? ''}`;
  for (const match of haystack.matchAll(/(?<![A-Za-z])[A-Za-z]:[/\\][^\s"',;)|]+/gu)) found.add(fold(match[0]));
  for (const match of haystack.matchAll(/(?:^|[\s"'(=])(\/[A-Za-z][^\s"',;)|]*)/gu)) found.add(match[1]);
  return Object.freeze([...found]);
}

/** Whether a dispatch is a capital pull, from its own tool name in either the call or the code. */
function isCapitalPull(name, data) {
  const args = argsText(data);
  return name === 'palimpsest_worker_context_pull' || /palimpsest_worker_context_pull/u.test(args);
}

/** Whether a dispatch is the result submission. */
function isResultTool(name, data) {
  const args = argsText(data);
  return name === 'palimpsest_worker_result' || /palimpsest_worker_result/u.test(args);
}

/** Whether a dispatch mutates the world. */
function isEdit(name, data) {
  if (name === 'write' || name === 'edit') return true;
  const args = fold(argsText(data));
  return /"write"|oldstr|oldstring|str_replace_editor|set-content|out-file/iu.test(args);
}

/**
 * §13/§14/§16/§18: RECONSTRUCT ONE GENERATION'S COST RECORD.
 *
 * Everything is counted only UP TO AND INCLUDING the first Result submission, because §13 says "before first
 * Result submission" — a worker that kept working after submitting is a different (and separately recorded)
 * fact, and mixing the two would make the primary outcome measure post-decision activity.
 */
export function reconstructCost(artifact) {
  const records = sessionRecords(decompressFrames(artifact.path));
  const dispatches = [];
  let resultSubmissionSeq = null;
  let turnEndReason = null;

  for (const record of records) {
    if (record.type === 'turn/end') turnEndReason = record.data?.reason?.kind ?? null;
    if (record.type !== 'tool/ptc-dispatch') continue;
    const data = record.data ?? {};
    const name = String(data.name ?? '');
    const seq = record.seq ?? null;
    const returned = contentReturnedOf(data);
    const content = contentTextOf(data);
    const paths = namedPathsOf(data);
    const isResult = isResultTool(name, data);
    dispatches.push(Object.freeze({
      seq,
      name,
      returned,
      bytes: content.length,
      paths,
      isCapitalPull: isCapitalPull(name, data),
      isResult,
      isEdit: isEdit(name, data),
      /** §13: a raw-history read is a returned read whose named path is a DECLARED corpus document. */
      corpusPaths: Object.freeze(paths.filter((path) => isDeclaredCorpusPath(path))),
    }));
    if (isResult && resultSubmissionSeq === null) resultSubmissionSeq = seq;
  }

  /** §13: only activity BEFORE the first result submission counts toward the primary outcomes. */
  const considered = resultSubmissionSeq === null ? dispatches : dispatches.filter((entry) => entry.seq !== null && entry.seq < resultSubmissionSeq);
  const corpusReads = considered.filter((entry) => entry.returned && entry.corpusPaths.length > 0);

  /** The distinct corpus DOCUMENTS read, which is the artifact count §13 asks for. */
  const distinctArtifacts = new Set();
  for (const read of corpusReads) for (const path of read.corpusPaths) distinctArtifacts.add(fold(path).split('/').pop() ?? path);

  /**
   * §13: the BYTES of declared corpus content returned.
   *
   * The count is the returned content length of a read that named a corpus document. A read that named several
   * documents counts once, because the tool returned one body; attributing the whole body to each document would
   * multiply the same bytes.
   */
  const corpusBytes = corpusReads.reduce((total, read) => total + read.bytes, 0);

  const firstEdit = considered.find((entry) => entry.isEdit);
  const firstCapital = considered.find((entry) => entry.isCapitalPull && entry.returned);
  const firstCorpus = corpusReads[0] ?? null;

  return Object.freeze({
    attemptId: artifact.attemptId,
    artifactPath: artifact.path,
    turnEndReason,
    /** §16: the completion cause, from the runtime's own reason where it reported one. */
    completionCause: resultSubmissionSeq !== null ? 'RESULT_SUBMITTED' : turnEndReason === 'max-tokens' ? 'MAX_TOKENS' : turnEndReason === 'timeout' ? 'TIMEOUT' : 'OTHER_RUNTIME_CAUSE',
    resultSubmitted: resultSubmissionSeq !== null,
    resultSubmissionSeq,
    totalDispatches: dispatches.length,
    dispatchesBeforeResult: considered.length,
    /** §13: the primary reconstruction-cost outcomes. */
    rawHistoryArtifactsRead: distinctArtifacts.size,
    rawHistoryArtifactIds: Object.freeze([...distinctArtifacts].sort()),
    rawHistoryBytesReturned: corpusBytes,
    /** §14: the search and action cost. */
    actionsBeforeFirstResult: considered.length,
    historyReadActions: corpusReads.length,
    capitalPullActions: considered.filter((entry) => entry.isCapitalPull).length,
    capitalPullReturned: considered.filter((entry) => entry.isCapitalPull && entry.returned).length,
    toolCallsBeforeFirstResult: considered.length,
    firstEditSeq: firstEdit?.seq ?? null,
    firstCapitalSeq: firstCapital?.seq ?? null,
    firstHistorySeq: firstCorpus?.seq ?? null,
    editActions: considered.filter((entry) => entry.isEdit).length,
    /** §18: the classification inputs, from behavior only. */
    classificationInputs: Object.freeze({
      capitalContentReturned: considered.some((entry) => entry.isCapitalPull && entry.returned),
      historyReads: corpusReads.length,
      firstEditStep: firstEdit?.seq ?? null,
      firstCapitalStep: firstCapital?.seq ?? null,
      resultSubmitted: resultSubmissionSeq !== null,
    }),
  });
}

/** Reconstruct every generation artifact under a home. */
export function reconstructAll(home) {
  return Object.freeze(sessionArtifacts(home).sort((left, right) => left.mtimeMs - right.mtimeMs).map((artifact) => reconstructCost(artifact)));
}

export { fold, isDeclaredCorpusPath };
