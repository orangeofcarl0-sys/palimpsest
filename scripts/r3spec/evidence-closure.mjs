#!/usr/bin/env node
/**
 * R3-SPEC §1 — THE R2-VR EVIDENCE-CHAIN CLOSURE.
 *
 * R2-VR re-judged 20 stored final candidates against all 14 hidden cases and reported the result, but it did
 * not record, per source, the digests that would let a later reader reproduce the re-judgement from the SAME
 * bytes. §1 closes that chain: for every one of the 20 sources it records
 *
 *   trialId
 *   finalSourceSha256        the exact bytes that were re-judged
 *   acceptanceModuleSha256   the exact acceptance module those bytes were judged against
 *   perCaseVectorDigest      a digest of the 14-case pass/fail vector
 *   recordedTotal            the total the R2-V trial record reported
 *   rejudgedTotal            the total this re-judgement produces
 *
 * and REQUIRES `recordedTotal == rejudgedTotal` for all 20. A mismatch is a hard failure, because it would
 * mean the stored bytes are not the bytes the R2-V matrix judged.
 *
 * §1 ALSO REQUIRES HONESTY ABOUT LIMITS. If an original final source cannot still be located, this script
 * REPORTS that limitation. It does NOT reconstruct the source from the outcome — a reconstructed source
 * would make the closure circular, since the reconstruction would be built from the very totals it is meant
 * to check.
 *
 * PLAIN JAVASCRIPT (`.mjs`). No worker runs; no R2-V record is modified.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { judgeHidden, SCENARIOS } from '../r2u/scenarios.mjs';

const REPO_ROOT = new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/u, '$1');
const EVIDENCE = join(REPO_ROOT, 'research-evidence', 'r3-spec');
const R2V_RIG = join(homedir(), '.palimpsest-r2v', 'matrix');
const SCRATCH = join(homedir(), '.palimpsest-r3spec', 'rejudge');
const NL = String.fromCharCode(10);

const sha256 = (value) => createHash('sha256').update(value).digest('hex');

/** The most recent R2-V run directory, or null when none is present. */
function latestRunDir() {
  if (!existsSync(R2V_RIG)) return null;
  const runs = readdirSync(R2V_RIG, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('runs-'))
    .map((entry) => join(R2V_RIG, entry.name))
    .sort();
  return runs[runs.length - 1] ?? null;
}

/**
 * §1: build the closure for every trial whose stored source is present.
 *
 * The per-case vector is the 14 booleans in CASE ORDER, so the digest is stable across a JSON key-order
 * change and two vectors that agree case-by-case hash the same.
 */
export async function buildClosure(options = {}) {
  const runDir = options.runDir ?? latestRunDir();
  const acceptancePath = SCENARIOS.D.acceptanceModule;
  const acceptanceModuleSha256 = sha256(readFileSync(acceptancePath));
  if (runDir === null) {
    return Object.freeze({
      schemaVersion: 1,
      stage: 'R3-SPEC',
      kind: 'R2-VR evidence-chain closure',
      limitation: 'the R2-V run directory could not be located, so no source could be re-judged; the sources are NOT reconstructed from the outcome',
      runDir: null,
      acceptanceModuleSha256,
      sources: Object.freeze([]),
      allTotalsMatch: false,
    });
  }

  const dirs = readdirSync(runDir, { withFileTypes: true }).filter((entry) => entry.isDirectory() && entry.name.startsWith('D-')).map((entry) => entry.name).sort();
  const sources = [];
  const missing = [];
  for (const trialId of dirs) {
    const recordPath = join(runDir, trialId, 'out', 'trial.json');
    const sourcePath = join(runDir, trialId, 'out', 'final-source.txt');
    if (!existsSync(recordPath)) continue;
    if (!existsSync(sourcePath)) {
      /** §1: report the limitation rather than reconstructing the bytes from the outcome. */
      missing.push(trialId);
      continue;
    }
    const record = JSON.parse(readFileSync(recordPath, 'utf8'));
    const sourceBytes = readFileSync(sourcePath);
    const sourceText = sourceBytes.toString('utf8');
    const judgement = await judgeHidden(SCENARIOS.D, sourceText, join(SCRATCH, trialId));
    const caseOrder = judgement.results.map((result) => result.id);
    const vector = judgement.results.map((result) => (result.pass ? 1 : 0));
    const recordedTotal = record.finalAcceptance?.passed ?? null;
    sources.push(Object.freeze({
      trialId,
      condition: record.condition,
      finalSourceSha256: sha256(sourceBytes),
      acceptanceModuleSha256,
      perCaseVectorDigest: sha256(`${caseOrder.join(',')}|${vector.join('')}`),
      perCaseVector: Object.freeze(caseOrder.map((id, index) => ({ caseId: id, pass: vector[index] === 1 }))),
      recordedTotal,
      rejudgedTotal: judgement.passed,
      totalCases: judgement.total,
      match: recordedTotal === judgement.passed,
    }));
  }

  return Object.freeze({
    schemaVersion: 1,
    stage: 'R3-SPEC',
    kind: 'R2-VR evidence-chain closure',
    method: 'the stored final candidates re-judged against the stored acceptance module; no worker ran and no R2-V or R2-VR record was modified',
    runDir,
    acceptanceModulePath: acceptancePath,
    acceptanceModuleSha256,
    sourcesRejudged: sources.length,
    sourcesMissing: Object.freeze(missing),
    limitation: missing.length === 0 ? null : `${String(missing.length)} final source(s) could not be located and were NOT reconstructed from the outcome: ${missing.join(', ')}`,
    sources: Object.freeze(sources),
    allTotalsMatch: sources.length > 0 && sources.every((source) => source.match),
  });
}

async function main() {
  mkdirSync(SCRATCH, { recursive: true });
  const closure = await buildClosure();
  mkdirSync(EVIDENCE, { recursive: true });
  writeFileSync(join(EVIDENCE, 'r2vr-source-closure.json'), `${JSON.stringify(closure, null, 2)}${NL}`, 'utf8');

  process.stdout.write(`R3-SPEC §1 EVIDENCE-CHAIN CLOSURE — ${String(closure.sourcesRejudged)} source(s) re-judged${NL}`);
  process.stdout.write(`  acceptance module sha256: ${closure.acceptanceModuleSha256.slice(0, 16)}…${NL}`);
  for (const source of closure.sources) {
    process.stdout.write(`  ${source.trialId.padEnd(14)} source ${source.finalSourceSha256.slice(0, 12)}…  vector ${source.perCaseVectorDigest.slice(0, 12)}…  recorded ${String(source.recordedTotal)} == rejudged ${String(source.rejudgedTotal)}  ${source.match ? 'OK' : 'MISMATCH'}${NL}`);
  }
  if (closure.limitation !== null) process.stdout.write(`  LIMITATION: ${closure.limitation}${NL}`);
  process.stdout.write(`${NL}ALL TOTALS MATCH: ${closure.allTotalsMatch ? 'YES' : 'NO'}${NL}`);
  process.exit(closure.allTotalsMatch ? 0 : 1);
}

if (process.argv[1] !== undefined && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/gu, '/')}`).href) {
  await main();
}
