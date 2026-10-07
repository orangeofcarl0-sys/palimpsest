#!/usr/bin/env node
/**
 * R3-S0 §"Gate structure" — THE SYSTEMIC CONFORMANCE RUNNER: GATES S2, S3 AND S4.
 *
 * §"Gate structure" defines four gates. S1 (structural graph) is `graph-audit.mjs`. This runner produces S2
 * (loop/runtime conformance), S3 (mutation resistance) and S4 (system validity).
 *
 *   S2 requires deterministic Work, Knowledge, Collaboration, Evolution and cross-loop conformance green for
 *   all load-bearing exercised paths, and requires a load-bearing `NOT_EXERCISED` to be CALLED OUT.
 *   S3 requires all preregistered load-bearing mutations detected.
 *   S4 sets `SYSTEM_VALID = true` only if S1–S3 are green AND no known prohibited bypass remains open inside
 *   the currently supported runtime profile.
 *
 * §"Historical-defect regression" is answered here too: for each historical defect class, the runner shows
 * WHICH systemic invariant catches it, by actually running the detector and reporting its verdict.
 *
 * §"Evidence correctness": every scenario's digest closure is collected, and a scenario with an incomplete
 * closure is reported rather than passed.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  CROSS_LOOP_SCENARIOS,
  HISTORICAL_DEFECTS,
  LINEAGES,
  MATRIX_CELLS,
  MUTATION_VERDICTS,
  SYSTEMIC_CONTRACT,
  systemValid,
} from './contract.mjs';
import { makeEvidenceClosure, makeProjectBehaviorTrace, traceCoverage } from './trace.mjs';
import { collaborationLoopScenario, evolutionLoopScenario, knowledgeLoopScenario, workLoopScenario } from './loops.mjs';
import { evolutionToFutureWorkClosure, forbiddenBypassWitness, runtimeConformance, workToKnowledgeToFutureWorkClosure } from './closures.mjs';
import { mutationSuite } from './mutations.mjs';
import { REPO_ROOT } from './rig.mjs';

const NL = String.fromCharCode(10);
const sha256 = (text) => createHash('sha256').update(String(text), 'utf8').digest('hex');
const out = (line) => process.stdout.write(`${line}${NL}`);

/** §"Evidence correctness": the tested source bytes, so a run records WHAT it tested. */
function testedSourceDigest() {
  const files = [
    'scripts/r3s0/contract.mjs',
    'scripts/r3s0/trace.mjs',
    'scripts/r3s0/actors.mjs',
    'scripts/r3s0/rig.mjs',
    'scripts/r3s0/loops.mjs',
    'scripts/r3s0/closures.mjs',
    'scripts/r3s0/mutations.mjs',
    'scripts/r3s0/graph-audit.mjs',
    'scripts/r3s0/event-audit.mjs',
  ];
  const parts = files.map((relative) => {
    const path = join(REPO_ROOT, relative);
    return `${relative}:${existsSync(path) ? sha256(readFileSync(path, 'utf8')) : 'MISSING'}`;
  });
  return sha256(parts.join('\n'));
}

async function main() {
  const runDir = join(REPO_ROOT, 'research-evidence', 'r3-s0');
  mkdirSync(runDir, { recursive: true });
  const started = Date.now();

  /* ================================================================ S1 */

  out('=== GATE S1 — STRUCTURAL GRAPH ===');
  let s1 = { green: false, detail: 'not run' };
  try {
    const output = execFileSync(process.execPath, [join(REPO_ROOT, 'scripts', 'r3s0', 'graph-audit.mjs')], { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
    const match = /(\d+)\/(\d+) invariant\(s\) PASS/u.exec(output);
    s1 = { green: /^FAIL/mu.test(output) === false && match !== null && match[1] === match[2], detail: `${String(match?.[1])}/${String(match?.[2])} invariants PASS`, output };
  } catch (error) {
    s1 = { green: false, detail: `the audit exited non-zero: ${String(error?.message ?? error).slice(0, 160)}`, output: String(error?.stdout ?? '') };
  }
  out(`S1: ${s1.green ? 'GREEN' : 'RED'} — ${s1.detail}${NL}`);

  /* ================================================================ S2 */

  out('=== GATE S2 — LOOP AND RUNTIME CONFORMANCE ===');
  const scenarios = [];
  const loopResults = [];
  for (const scenario of [workLoopScenario, knowledgeLoopScenario, collaborationLoopScenario, evolutionLoopScenario]) {
    const result = await scenario();
    loopResults.push(result);
    scenarios.push({ id: result.loopId, matrix: result.matrix, evidence: result.evidence });
    out(`${result.loopId.padEnd(14)} ${result.matrix.green ? 'GREEN' : 'RED'}`);
    for (const row of result.matrix.rows) out(`   ${row.path.padEnd(15)} ${row.verdict.padEnd(15)} ${row.detail.slice(0, 130)}`);
  }
  out('');

  const closures = [];
  for (const closure of [workToKnowledgeToFutureWorkClosure, evolutionToFutureWorkClosure]) {
    const result = await closure();
    closures.push(result);
    scenarios.push({ id: result.id, matrix: { green: result.cell.verdict === MATRIX_CELLS.PASS, rows: [result.cell], loadBearingFailures: result.cell.verdict === MATRIX_CELLS.PASS ? [] : [result.cell.detail], loadBearingNotExercised: [] }, evidence: result.evidence });
    out(`CLOSURE ${result.id.padEnd(34)} ${result.cell.verdict}`);
    out(`   ${result.cell.detail.slice(0, 170)}`);
  }

  /**
   * §"Cross-loop closure scenarios": the COLLABORATION -> LOCAL WORK seam is proven INSIDE the Collaboration
   * loop scenario (its `nextGeneration` path), so it is recorded here by reference rather than re-run. Saying
   * that plainly is the point: the seam is covered, and by which scenario is stated.
   */
  const collaborationLoop = loopResults.find((result) => result.loopId === 'COLLABORATION');
  const collaborationNextGen = collaborationLoop?.cells.find((row) => row.path === 'nextGeneration');
  const collaborationToLocalWork = Object.freeze({
    id: 'COLLABORATION_TO_LOCAL_WORK',
    cell: Object.freeze({ path: 'COLLABORATION->LOCAL_WORK', verdict: collaborationNextGen?.verdict ?? MATRIX_CELLS.NOT_EXERCISED, detail: `proven inside the Collaboration loop's nextGeneration path: ${String(collaborationNextGen?.detail ?? 'not driven').slice(0, 200)}` }),
  });
  out(`CLOSURE COLLABORATION->LOCAL_WORK          ${collaborationToLocalWork.cell.verdict}`);
  out(`   ${collaborationToLocalWork.cell.detail.slice(0, 170)}${NL}`);

  const runtime = await runtimeConformance();
  out(`RUNTIME CONFORMANCE ${runtime.cell.verdict} — ${runtime.cell.detail.slice(0, 170)}`);
  for (const row of runtime.rows) out(`   ${row.check.padEnd(34)} ${row.pass ? 'PASS' : 'FAIL'} ${row.detail.slice(0, 80)}`);
  out('');

  const allMatrixRows = [...loopResults.flatMap((result) => result.matrix.rows), ...closures.map((result) => result.cell), collaborationToLocalWork.cell, runtime.cell];
  const loadBearingFailures = allMatrixRows.filter((row) => row.verdict === MATRIX_CELLS.FAIL);
  const loadBearingNotExercised = allMatrixRows.filter((row) => row.verdict === MATRIX_CELLS.NOT_EXERCISED);
  const s2 = {
    green: loadBearingFailures.length === 0 && runtime.cell.verdict === MATRIX_CELLS.PASS,
    detail: `${String(allMatrixRows.length)} cells; ${String(loadBearingFailures.length)} load-bearing FAIL; ${String(loadBearingNotExercised.length)} load-bearing NOT_EXERCISED; runtime ${runtime.cell.verdict}`,
    loadBearingFailures: loadBearingFailures.map((row) => `${row.path}: ${row.detail.slice(0, 160)}`),
    loadBearingNotExercised: loadBearingNotExercised.map((row) => row.path),
  };
  out(`S2: ${s2.green ? 'GREEN' : 'RED'} — ${s2.detail}${NL}`);

  /* ================================================================ S3 */

  out('=== GATE S3 — MUTATION RESISTANCE ===');
  const mutations = await mutationSuite();
  for (const result of mutations.results) {
    out(`${result.verdict === MUTATION_VERDICTS.DETECTED ? 'DETECTED' : 'ESCAPED '}  ${result.id.padEnd(38)} control=${String(result.controlGreen).padEnd(5)} ${result.detail.slice(0, 110)}`);
  }
  const bypass = await forbiddenBypassWitness();
  out('');
  out(`BYPASS WITNESS ${bypass.witness.claim} — blocked ${String(bypass.witness.blocked.length)}/${String(bypass.witness.results.length)}; open: ${bypass.witness.open.join(', ') || 'none'}`);
  for (const result of bypass.witness.results) out(`   ${result.id.padEnd(46)} ${result.blocked ? 'BLOCKED' : 'OPEN'} ${result.detail.slice(0, 100)}`);

  const s3 = {
    green: mutations.green && bypass.witness.open.length === 0,
    detail: `${String(mutations.results.length - mutations.escaped.length)}/${String(mutations.results.length)} mutations DETECTED; bypasses open ${String(bypass.witness.open.length)}`,
    escaped: mutations.escaped,
    openBypasses: bypass.witness.open,
  };
  out(`${NL}S3: ${s3.green ? 'GREEN' : 'RED'} — ${s3.detail}${NL}`);

  /* ================================================================ §Historical-defect regression */

  out('=== §Historical-defect regression — WHICH invariant catches each defect ===');
  const historical = [];
  for (const defect of HISTORICAL_DEFECTS) {
    let caught = false;
    let evidence = '';
    if (defect.id === 'R1L_R2U_MISSING_INDEX_FORWARDING') {
      /** The M1 mutation IS this defect: the index is dropped and the consumer-boundary gate goes red. */
      const m1 = mutations.results.find((result) => result.id === 'M1_DROP_CONTEXT_INDEX');
      caught = m1?.verdict === MUTATION_VERDICTS.DETECTED;
      evidence = m1?.detail ?? 'the M1 runner did not report';
    } else if (defect.id === 'VACUOUS_CONDITION_OR_TRUE_GATE') {
      /** The anti-vacuity scanner forbids the literal unconditional form in gate code. */
      try {
        const output = execFileSync(process.execPath, [join(REPO_ROOT, 'scripts', 'r2lr', 'anti-vacuity.mjs')], { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
        caught = /ANTI-VACUITY: PASS/u.test(output);
        evidence = (output.trim().split(NL).filter((line) => line.includes('ANTI-VACUITY')).pop() ?? '').slice(0, 140);
      } catch (error) {
        evidence = `the scanner failed: ${String(error?.message ?? error).slice(0, 120)}`;
      }
    } else if (defect.id === 'R3A_NESTED_CLASSPASS_INTEGRATION') {
      /** The R3-AE engine tests drive the engine with REAL nested records and assert the grouping. */
      try {
        const output = execFileSync(process.execPath, [join(REPO_ROOT, 'node_modules', 'vitest', 'vitest.mjs'), 'run', 'test/r3ae_engine.test.ts', 'test/r3a2_result.test.ts'], { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
        /** vitest colourises its summary, so the digits are wrapped in escape codes: strip them before matching. */
        const plain = output.replace(/\[[0-9;]*m/gu, '');
        const passed = /Tests\s+(\d+) passed/u.exec(plain);
        const failed = /(\d+) failed/u.exec(plain);
        caught = passed !== null && failed === null;
        evidence = caught
          ? `${passed[1]} engine/analysis tests pass, driving the engine with REAL nested classPass records`
          : `the suite reported failures: ${(failed?.[0] ?? 'unknown').slice(0, 60)}`;
      } catch (error) {
        const raw = String(error?.stdout ?? error?.message ?? error).replace(/\[[0-9;]*m/gu, '');
        evidence = `the R3-AE suite failed: ${raw.slice(-160)}`;
      }
    }
    historical.push(Object.freeze({ id: defect.id, caughtBy: defect.caughtBy, caught, evidence: String(evidence).slice(0, 240) }));
    out(`${caught ? 'CAUGHT  ' : 'MISSED  '} ${defect.id.padEnd(38)} <- ${defect.caughtBy}`);
    out(`   ${String(evidence).slice(0, 170)}`);
  }
  const historicalGreen = historical.every((entry) => entry.caught);
  out('');

  /* ================================================================ §Evidence correctness */

  const testedBytes = testedSourceDigest();
  const closures_ = scenarios.map((scenario) => {
    const digests = {
      testedSourceBytes: testedBytes,
      canonicalState: sha256(JSON.stringify(scenario.evidence)),
      runtimeSessionBytes: sha256(JSON.stringify({ scenario: scenario.id, note: 'no model session is involved in a deterministic scenario' })),
      acceptanceModule: sha256(JSON.stringify({ scenario: scenario.id, note: 'the acceptance criterion is the scenario own canonical assertion, recorded in the cell detail' })),
      producedTrace: sha256(JSON.stringify(scenario.matrix)),
    };
    return Object.freeze({ scenario: scenario.id, closure: makeEvidenceClosure({ scenario: scenario.id, digests }) });
  });
  const incompleteClosures = closures_.filter((entry) => entry.closure.complete === false);
  out('=== §Evidence correctness — digest closure ===');
  for (const entry of closures_) out(`${entry.closure.complete ? 'COMPLETE' : 'INCOMPLETE'}  ${entry.scenario.padEnd(34)} testedBytes=${entry.closure.digests.testedSourceBytes.slice(0, 12)}…`);
  out('');

  /* ================================================================ S4 */

  const s4 = systemValid({
    graph_integrity: s1.green,
    loop_conformance: s2.green,
    runtime_conformance: runtime.cell.verdict === MATRIX_CELLS.PASS,
    authority_checks: s1.green,
    evidence_chain_checks: incompleteClosures.length === 0,
    forbidden_bypass_checks: s3.green,
  });

  const trace = makeProjectBehaviorTrace({
    projectId: 'r3s0-systemic',
    workIds: loopResults.flatMap((result) => result.cells.map((row) => row.path)),
    attemptIds: [],
    canonicalNodeRefs: Object.values(LINEAGES).flatMap((lineage) => lineage.nodes.map((node) => `${lineage.id}:${node.node}`)),
    canonicalEdgeWitnesses: Object.values(LINEAGES).map((lineage) => `${lineage.id}:${lineage.nodes.map((node) => node.node).join('>')}`),
    authorityDecisions: Object.values(LINEAGES).flatMap((lineage) => lineage.nodes.filter((node) => node.requiredAuthority !== null).map((node) => `${lineage.id}:${node.node}`)),
    runtimeBindingDigests: [sha256(JSON.stringify(runtime.rows))],
    consumerVisibleDigests: [sha256(JSON.stringify(closures.map((entry) => entry.cell)))],
    toolSurfaceDigest: sha256(JSON.stringify(runtime.rows.filter((row) => row.check.includes('TOOL')))),
    toolInvocations: bypass.attempts.map((attempt) => attempt.attempt),
    ownerReads: ['controller.work.project', 'controller.fetchContext', 'installed.proof.proofAssetView'],
    durableMutations: ['PROMOTION_COMMITTED', 'PROJECT_REVISED', 'ASSET_ASSOCIATED', 'CONTACT_NEED_DECLARED', 'COMMITMENT_ACCEPTED', 'FULFILLMENT_DECIDED'],
    verificationPromotionReceipts: [sha256(JSON.stringify(loopResults.find((result) => result.loopId === 'WORK')?.cells ?? []))],
    restartBoundaries: loopResults.flatMap((result) => result.cells.filter((row) => row.path === 'coldRestart').map((row) => row.detail.slice(0, 120))),
    forbiddenBypassChecks: bypass.witness.results.map((result) => `${result.id}:${result.blocked ? 'BLOCKED' : 'OPEN'}`),
  });

  const record = Object.freeze({
    schemaVersion: 1,
    stage: 'R3-S0',
    kind: 'systemic behavior closure conformance run',
    elapsedMs: Date.now() - started,
    contractDigest: sha256(JSON.stringify(SYSTEMIC_CONTRACT)),
    testedSourceDigest: testedBytes,
    gates: Object.freeze({
      S1: Object.freeze({ green: s1.green, detail: s1.detail }),
      S2: Object.freeze(s2),
      S3: Object.freeze(s3),
      S4: Object.freeze({ SYSTEM_VALID: s4.SYSTEM_VALID, notGreen: s4.notGreen, categories: s4.categories }),
    }),
    loopMatrices: Object.freeze(loopResults.map((result) => result.matrix)),
    closures: Object.freeze([...closures.map((result) => result.cell), collaborationToLocalWork.cell]),
    runtimeConformance: Object.freeze({ cell: runtime.cell, rows: runtime.rows }),
    mutations: Object.freeze(mutations.results),
    bypass: bypass.witness,
    historicalDefects: Object.freeze(historical),
    evidenceClosures: Object.freeze(closures_.map((entry) => entry.closure)),
    behaviorTrace: trace,
    traceCoverage: traceCoverage(trace),
    loadBearingNotExercised: Object.freeze(s2.loadBearingNotExercised),
  });

  writeFileSync(join(runDir, 'conformance-run.json'), `${JSON.stringify(record, null, 2)}${NL}`, 'utf8');

  /* ================================================================ report */

  out('=== GATE S4 — SYSTEM VALIDITY ===');
  for (const category of s4.categories) out(`  ${category.green ? 'GREEN' : 'RED  '}  [${category.gate}] ${category.id}`);
  out('');
  out(`SYSTEMIC GRAPH:      ${s1.green ? 'CLOSED' : 'OPEN'}`);
  out(`PRIMARY LOOPS:       ${s2.green ? 'CLOSED' : 'OPEN'}`);
  out(`RUNTIME CONFORMANCE: ${runtime.cell.verdict === MATRIX_CELLS.PASS ? 'CLOSED' : 'OPEN'}`);
  out(`MUTATION RESISTANCE: ${s3.green ? 'CLOSED' : 'OPEN'}`);
  out(`HISTORICAL DEFECTS:  ${historicalGreen ? 'ALL CAUGHT' : 'GAPS'}`);
  out(`SYSTEM_VALID:        ${s4.SYSTEM_VALID ? 'YES' : 'NO'}`);
  out(`R3 BEHAVIORAL EXPERIMENTS: ${s4.SYSTEM_VALID ? 'AUTHORIZED' : 'BLOCKED'}`);
  if (s2.loadBearingNotExercised.length > 0) out(`LOAD-BEARING NOT_EXERCISED: ${s2.loadBearingNotExercised.join(', ')}`);
  out(`record: ${join(runDir, 'conformance-run.json')}`);

  process.exit(s4.SYSTEM_VALID ? 0 : 1);
}

if (process.argv[1] !== undefined && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/gu, '/')}`).href) {
  await main();
}
