/**
 * R3-L0A §6/§7/§8/§11 — THE OBSERVABLE INFORMATION-PATH AUDIT.
 *
 * §6 and §7 require the H and C information paths to be reconstructed from DURABLE WORKER/TOOL TRACES, and §6
 * is explicit: "Do NOT infer private reasoning." So this module reads only what the worker OBSERVABLY did —
 * the tool calls it made and the results it received — and classifies each generation by those facts alone.
 *
 * THE LOAD-BEARING DISCOVERY THIS MODULE EXISTS TO MEASURE. The R3-L0 generation child wrote its own spec,
 * payload and transcript INTO the trajectory directory, and the worker's world lives under that same directory.
 * Several workers therefore walked UP out of their world and read host-side artifacts, and some reached the
 * CHECKOUT ITSELF — including the research diagnostic oracle that §10 says is "invisible to the worker". This
 * module measures exactly which artifacts each generation actually RECEIVED, because a claim that the oracle
 * was unreachable must be checkable rather than asserted.
 *
 * WHAT COUNTS AS EXPOSURE. A signature is matched against the CONTENT THE WORKER RECEIVED (a `tool/result`),
 * not against what it asked for. A refused read therefore does not count, and an attempt that returned nothing
 * does not count. The signatures are content-unique strings from the real artifacts.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { zstdDecompressSync } from 'node:zlib';

const NL = String.fromCharCode(10);
const FRAME_MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);

/* ================================================================ §6/§7 the exposure signatures */

/**
 * §6: THE EXPOSURE SIGNATURES.
 *
 * Each entry is a string that appears ONLY in the artifact it names, so a match is evidence that the artifact's
 * content reached the worker. Deliberately precise: a loose pattern would over-report exposure and make the
 * finding useless in the other direction.
 */
export const EXPOSURE_SIGNATURES = Object.freeze({
  /** The research diagnostic oracle's own header and its case inventory. §10 says this is invisible. */
  RESEARCH_ORACLE: Object.freeze([
    'THE RESEARCH DIAGNOSTIC ORACLE',
    'case count: 9 ids:',
    'judgeCase source:',
  ]),
  /** The frozen lesson statements, which live in the capital bundle and in the project module. */
  FROZEN_LESSON_TEXT: Object.freeze([
    'validate the complete relevant input/state before destructive mutation',
    'PREPAID_LESSONS',
  ]),
  /** The generation harness itself, which names the oracle and the diagnostic scratch path. */
  GENERATION_HARNESS_SOURCE: Object.freeze([
    'judge it with the research diagnostic oracle, OUTSIDE the world',
    'diagnosticVector(candidate)',
  ]),
  /** The host-side control payload the generation child wrote for its own bookkeeping. */
  HOST_CONTROL_PAYLOAD: Object.freeze(['compiledHandleCount']),
  /** The generation spec, which leaks the checkout root. */
  GENERATION_SPEC: Object.freeze(['"teePath"']),
  /** The project's own incident documents — ORDINARY project history, which §17 says is NOT leakage. */
  INCIDENT_DOCUMENT: Object.freeze(['Incident 1 — applyChanges applied before it validated', 'Incident 2 — recomputeIndex lost the edges it needed']),
  /** The prehistory prior-art functions. Also ordinary project history. */
  PRIOR_ART_CODE: Object.freeze(['function applyChanges(ledger, changeSet)', 'function recomputeIndex(index, nodeId)']),
});

/** §6: the two classes of exposure, kept apart because §17 says project history is the control condition. */
export const EXPOSURE_CLASSES = Object.freeze({
  ORDINARY_PROJECT_HISTORY: Object.freeze(['INCIDENT_DOCUMENT', 'PRIOR_ART_CODE']),
  HOST_OR_HARNESS_LEAKAGE: Object.freeze(['RESEARCH_ORACLE', 'FROZEN_LESSON_TEXT', 'GENERATION_HARNESS_SOURCE', 'HOST_CONTROL_PAYLOAD', 'GENERATION_SPEC']),
});

/* ================================================================ reading a session artifact */

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
        const normalized = path.replace(/\\/gu, '/');
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

/* ================================================================ §6/§7 the path reconstruction */

/**
 * §6/§7: reconstruct ONE generation's observable information path.
 *
 * `toolCalls` records what the worker ASKED FOR; `exposures` records what it RECEIVED. Both are needed: an
 * attempt that was refused is a different fact from an artifact that was delivered, and only the second is
 * leakage.
 */
export function reconstructPath(artifact) {
  const text = decompressFrames(artifact.path);
  const records = sessionRecords(text);
  const calls = [];
  const results = [];
  const exposures = [];
  let firstEditStep = null;
  let resultSubmissionStep = null;
  let oracleStep = null;
  /** §11: the runtime's OWN reason for ending the turn, read from the durable record. */
  let turnEndReason = null;
  let stepCount = 0;

  for (const record of records) {
    const data = record.data ?? {};
    if (record.type === 'assistant/message') {
      for (const content of data.message?.content ?? []) {
        if (content.type !== 'tool-call') continue;
        const args = String(content.arguments ?? '');
        /**
         * The worker reaches its tools through `run_code`, so the TOOL NAME is in the code, not in `content.name`.
         * Detecting only `content.name` would report every generation as never submitting a result.
         */
        const kind = /palimpsest_worker_result/u.test(args) || /palimpsest_worker_result/u.test(String(content.name)) ? 'RESULT_TOOL'
          : /palimpsest_worker_context_pull/u.test(args) || /palimpsest_worker_context_pull/u.test(String(content.name)) ? 'CONTEXT_PULL'
            : /test\/check/u.test(args) ? 'VISIBLE_ORACLE'
              : /"write"|oldStr|oldString|str_replace_editor|"edit"/u.test(args) ? 'EDIT'
                : /palimpsest-sr1/u.test(args) ? 'CHECKOUT_PROBE'
                  : 'OTHER';
        calls.push(Object.freeze({ step: data.step ?? null, name: String(content.name ?? ''), kind, detail: args.slice(0, 200).replace(/\s+/gu, ' ') }));
        if (kind === 'EDIT' && firstEditStep === null && /ledger\.mjs/u.test(args)) firstEditStep = data.step ?? null;
        if (kind === 'RESULT_TOOL' && resultSubmissionStep === null) resultSubmissionStep = data.step ?? null;
      }
    }
    if (record.type === 'turn/end') {
      /**
       * §11: THE runtime's own termination reason. `max-tokens` means the model exhausted its OUTPUT budget,
       * which is a different fact from exhausting a turn or step count, and only the runtime can say which.
       */
      turnEndReason = data.reason?.kind ?? null;
    }
    if (record.type === 'step/start') stepCount += 1;
    if (record.type === 'tool/result') {
      const received = (data.message?.content ?? []).map((entry) => entry.text ?? '').join(NL);
      results.push(Object.freeze({ step: data.step ?? null, bytes: received.length }));
      for (const [name, signatures] of Object.entries(EXPOSURE_SIGNATURES)) {
        if (signatures.some((signature) => received.includes(signature))) {
          exposures.push(Object.freeze({ step: data.step ?? null, kind: name }));
          if (EXPOSURE_CLASSES.HOST_OR_HARNESS_LEAKAGE.includes(name) && oracleStep === null) oracleStep = data.step ?? null;
        }
      }
    }
  }

  /** §6: dedupe by kind, keeping the FIRST step at which each exposure arrived. */
  const byKind = new Map();
  for (const exposure of exposures) if (!byKind.has(exposure.kind)) byKind.set(exposure.kind, exposure);

  const kinds = [...byKind.keys()];
  const ordinary = kinds.filter((kind) => EXPOSURE_CLASSES.ORDINARY_PROJECT_HISTORY.includes(kind));
  const leakage = kinds.filter((kind) => EXPOSURE_CLASSES.HOST_OR_HARNESS_LEAKAGE.includes(kind));

  return Object.freeze({
    attemptId: artifact.attemptId,
    artifactBytes: artifact.bytes,
    toolCalls: Object.freeze(calls),
    toolCallCount: calls.length,
    resultCount: results.length,
    exposures: Object.freeze([...byKind.values()]),
    ordinaryHistoryExposed: Object.freeze(ordinary),
    leakageExposed: Object.freeze(leakage),
    /** §6: HISTORY_ACCESSED only when an ORDINARY project-history artifact was actually received. */
    historyAccessed: ordinary.length > 0,
    /** §6: NO_HISTORY_ACCESS_OBSERVED is a fact about the trace, not a claim about the model. */
    historyAccessClassification: ordinary.length > 0 ? 'HISTORY_ACCESSED' : 'NO_HISTORY_ACCESS_OBSERVED',
    /** The confinement finding: content the harness intended to keep out of the world. */
    confinementBreach: leakage.length > 0,
    oracleExposed: leakage.includes('RESEARCH_ORACLE'),
    firstEditStep,
    resultSubmissionStep,
    oracleStep,
    turnEndReason,
    stepCount,
    /** §11: whether the oracle arrived BEFORE the worker's first edit — the ordering that would matter most. */
    oracleBeforeFirstEdit: oracleStep !== null && firstEditStep !== null && oracleStep < firstEditStep,
    contextPullCalls: calls.filter((call) => call.kind === 'CONTEXT_PULL').length,
    visibleOracleCalls: calls.filter((call) => call.kind === 'VISIBLE_ORACLE').length,
    editCalls: calls.filter((call) => call.kind === 'EDIT').length,
    checkoutProbes: calls.filter((call) => call.kind === 'CHECKOUT_PROBE').length,
  });
}

/** §6/§7: reconstruct every generation of one trajectory, ordered by artifact mtime (generation order). */
export function reconstructTrajectory(home) {
  const artifacts = sessionArtifacts(home).sort((left, right) => left.mtimeMs - right.mtimeMs);
  return Object.freeze(artifacts.map((artifact) => reconstructPath(artifact)));
}
