/**
 * R3-L0C §2/§10/§26 — THE PREFLIGHT: INFRASTRUCTURE REPAIRS, VALIDITY GATES, CONTAINMENT, PLUMBING.
 *
 * §2 requires the three infrastructure repairs to be GREEN before the plan is frozen, and no model call may occur
 * before they are. §1/§26 require SYSTEM_VALID and EXPERIMENT_VALID to be YES before trial 1 and again after the
 * matrix. §10 requires the containment canaries to run before trial 1. This module is where all four happen, and
 * every one of them is EXECUTED rather than cited.
 *
 * WHY THE GATES ARE RUN RATHER THAN READ. A validity envelope is a claim about a moment. A gate that was green
 * when an earlier stage closed it says nothing about whether the mechanism is green NOW, in THIS tree, with THIS
 * checkout. So each load-bearing gate is invoked and its own output is parsed, and the envelope records the run.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { REPO_ROOT } from './contract.mjs';
import { EVIDENCE_MODES, FRESHNESS, evidenceProvenance, readEvidence } from './evidence-mode.mjs';
import { checkImmutability } from './immutability.mjs';
import { acquireLease, classifyRoot, isProcessAlive, listRunRoots, sweepRunRoots } from './run-root.mjs';
import { experimentContainmentFrom } from '../r3l0b/contract.mjs';
import { runCanarySuite } from '../r3l0b/canaries.mjs';
import { canaryLivenessControl } from '../r3l0b/mutations.mjs';
import { buildIsolatedLayout } from '../r3l0b/containment.mjs';
import { runPlumbing } from './plumbing.mjs';

const NL = String.fromCharCode(10);

/** Run a node script and capture its verdict, without throwing on a non-zero exit. */
function runNode(script, args = [], env = process.env) {
  try {
    const output = execFileSync(process.execPath, [join(REPO_ROOT, 'scripts', script), ...args], {
      cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024, env,
    });
    return { ok: true, output };
  } catch (error) {
    return { ok: false, output: `${String(error?.stdout ?? '')}${String(error?.stderr ?? '')}` };
  }
}

/* ================================================================ §2.1 the evidence mode */

/**
 * §2.1: THE EVIDENCE-MODE REPAIR, PROVEN.
 *
 * The repair is only real if the two modes BEHAVE differently, so the check exercises both against a path that
 * exists and a path that does not:
 *
 *   LIVE + absent  -> FAIL. A LIVE gate never degrades to a frozen artifact.
 *   LIVE + present -> PASS, with FRESH_CURRENT_RUN freshness.
 *   HISTORICAL     -> PASS from the committed record, with FROZEN_COMMITTED freshness.
 */
export function checkEvidenceMode(runRoot) {
  const livePath = join(runRoot, 'preflight', 'evidence-mode', 'live-record.json');
  const committedPath = join(REPO_ROOT, 'research-evidence', 'r2-lr', 'deterministic-suite.json');
  mkdirSync(join(runRoot, 'preflight', 'evidence-mode'), { recursive: true });

  /** The LIVE-must-fail case, run BEFORE the record is written. */
  const liveAbsent = readEvidence({ livePath, committedPath, mode: EVIDENCE_MODES.LIVE, label: 'live-before-write' });
  writeFileSync(livePath, `${JSON.stringify({ writtenBy: 'r3l0c-preflight', at: new Date().toISOString() })}${NL}`, 'utf8');
  const livePresent = readEvidence({ livePath, committedPath, mode: EVIDENCE_MODES.LIVE, label: 'live-after-write' });
  const historical = readEvidence({ livePath, committedPath, mode: EVIDENCE_MODES.HISTORICAL, label: 'historical-committed' });

  const ok = liveAbsent.ok === false
    && livePresent.ok === true && livePresent.freshness === FRESHNESS.FRESH_CURRENT_RUN
    && historical.ok === true && historical.freshness === FRESHNESS.FROZEN_COMMITTED
    && historical.evidenceDigest !== null;

  return Object.freeze({
    id: 'EXPLICIT_EVIDENCE_MODE',
    green: ok,
    detail: ok
      ? 'LIVE fails without a fresh record and passes with one; HISTORICAL reads the committed record; every read carries source, digest and freshness'
      : `LIVE-absent ok=${String(liveAbsent.ok)}; LIVE-present ${String(livePresent.freshness)}; HISTORICAL ${String(historical.freshness)}`,
    provenance: evidenceProvenance([liveAbsent, livePresent, historical]),
    liveMustFail: liveAbsent.ok === false,
    liveFreshness: livePresent.freshness,
    historicalFreshness: historical.freshness,
  });
}

/* ================================================================ §2.2 the immutability guard */

/**
 * §2.2: THE BASELINE-DERIVED GUARD, PROVEN.
 *
 * The repair is real only if the protected set is DERIVED rather than listed, so the check asserts the derivation
 * and the absence of a restore path — and it asserts that a PRIOR STAGE was not edited to extend a registry,
 * which is the specific dependency inversion the repair removes.
 */
export function checkBaselineDerivedImmutability() {
  const guard = checkImmutability();
  /** The prior-stage file that used to carry the registry must not have grown one for this stage. */
  const priorStageSource = readFileSync(join(REPO_ROOT, 'scripts', 'r3l0b', 'immutability.mjs'), 'utf8');
  const editedForThisStage = priorStageSource.includes('r3-l0c');
  const ok = guard.HISTORICAL_EVIDENCE_IMMUTABLE === 'PASS' && guard.restoreAvailable === false && editedForThisStage === false && Array.isArray(guard.protectedNamespaces);
  return Object.freeze({
    id: 'BASELINE_DERIVED_IMMUTABILITY',
    green: ok,
    detail: ok
      ? `the protected set is derived from ${String(guard.baselineSource)}; ${String(guard.workingFileCount)} files; no prior stage was edited; no restore path exists`
      : `verdict=${guard.HISTORICAL_EVIDENCE_IMMUTABLE} restoreAvailable=${String(guard.restoreAvailable)} priorStageEditedForThisStage=${String(editedForThisStage)}`,
    baselineRevision: guard.baselineRevision,
    workingFileCount: guard.workingFileCount,
    protectedNamespaces: guard.protectedNamespaces,
    priorStageEditedForThisStage: editedForThisStage,
    restoreAvailable: guard.restoreAvailable,
  });
}

/* ================================================================ §2.3 the per-run temp root */

/**
 * §2.3: THE PER-RUN ROOT AND LEASE, PROVEN BY A CONCURRENCY TEST.
 *
 * §2.3 requires a DETERMINISTIC test proving one run's cleanup cannot delete another run's active root. The check
 * builds two leases, one of which stands for a live concurrent run, and then sweeps as an OWNER of the other. The
 * live root must survive.
 *
 * The liveness is real: the lease names a pid, and the check verifies the pid is actually alive before relying on
 * it, so the test would fail rather than pass vacuously if liveness detection broke.
 */
export function checkPerRunTempRoot(runRoot) {
  const base = join(runRoot, 'preflight', 'temp-root');
  mkdirSync(base, { recursive: true });
  const concurrent = acquireLease({ runId: 'run-concurrent-simulated', label: 'simulated concurrent experiment', base });
  const mine = acquireLease({ runId: 'run-owned-by-this-check', label: 'the run performing the sweep', base });
  mkdirSync(join(concurrent.root, 'live-rig'), { recursive: true });
  mkdirSync(join(mine.root, 'own-rig'), { recursive: true });

  const concurrentAlive = isProcessAlive(readJson(join(concurrent.root, 'lease.json'))?.ownerPid);
  const classification = classifyRoot(concurrent.root);
  /** Sweep as the OWNER of `mine` only. The concurrent run's root must survive. */
  const sweep = sweepRunRoots({ base, ownedRunIds: ['run-owned-by-this-check'] });
  const concurrentSurvived = existsSync(join(concurrent.root, 'live-rig'));
  const mineCollected = !existsSync(mine.root);

  const ok = concurrentAlive && classification.verdict === 'ACTIVE' && concurrentSurvived && mineCollected;
  /** Clean up the simulated concurrent run's own root so the check leaves nothing behind. */
  concurrent.dispose();
  return Object.freeze({
    id: 'PER_RUN_TEMP_ROOT',
    green: ok,
    detail: ok
      ? 'a sweep owning one run collected its own root and left a live concurrent run\'s root and rig intact'
      : `concurrentAlive=${String(concurrentAlive)} classification=${classification.verdict} concurrentSurvived=${String(concurrentSurvived)} mineCollected=${String(mineCollected)}`,
    classification: classification.verdict,
    classificationReason: classification.reason,
    concurrentSurvived,
    protectedRoots: sweep.protectedRoots,
    law: sweep.law,
  });
}

function readJson(path) {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; }
}

/* ================================================================ §2 the preflight */

/** §2: run all three repairs. */
export async function runPreflight(input) {
  const runRoot = input.runRoot;
  const repairs = Object.freeze([
    checkEvidenceMode(runRoot),
    checkBaselineDerivedImmutability(),
    checkPerRunTempRoot(runRoot),
  ]);
  const record = Object.freeze({
    schemaVersion: 1,
    stage: 'R3-L0C',
    kind: 'preflight infrastructure repairs',
    repairs,
    allGreen: repairs.every((repair) => repair.green === true),
    law: 'no model call occurs before all three infrastructure repairs are green',
  });
  const dir = join(runRoot, 'preflight');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'preflight.json'), `${JSON.stringify(record, null, 2)}${NL}`, 'utf8');
  return record;
}

/* ================================================================ §1/§26 the validity gates */

/**
 * §1/§26: RUN THE LOAD-BEARING SYSTEM AND EXPERIMENT GATES.
 *
 * The SYSTEM gates are R3-S0's, and the EXPERIMENT gates are R3-L0B's, executed here rather than read from a
 * previous envelope. The result is a pair of envelopes recorded for this run.
 */
export async function runValidityGates(input) {
  const runRoot = input.runRoot;

  /** The R3-S0 systemic suite and the R3-L0B containment suite, through their own test files. */
  const r3s0 = runNode(join('..', 'node_modules', 'vitest', 'vitest.mjs'), ['run', 'test/r3s0_systemic.test.ts', '--reporter=dot']);
  const r3l0b = runNode(join('..', 'node_modules', 'vitest', 'vitest.mjs'), ['run', 'test/r3l0b_canary.test.ts', 'test/r3l0b_containment.test.ts', '--reporter=dot']);
  const r1h = runNode(join('r1h', 'conformance.mjs'));
  const r1hr = runNode(join('r1hr', 'conformance.mjs'));
  const r1hc = runNode(join('r1hc', 'conformance.mjs'));
  const r1l = runNode(join('gates', 'r1l-live-gate.mjs'));
  const antiVacuity = runNode(join('r2lr', 'anti-vacuity.mjs'));
  const graph = runNode(join('r3s0', 'graph-audit.mjs'));
  const events = runNode(join('r3s0', 'event-audit.mjs'));

  const gates = Object.freeze({
    R3_S0_systemic_suite: verdict(r3s0, /Tests\s+\d+ passed \(\d+\)/u, 'the R3-S0 systemic suite'),
    R3_L0B_containment_suite: verdict(r3l0b, /Tests\s+\d+ passed \(\d+\)/u, 'the R3-L0B containment and canary suites'),
    S1_graph_integrity: verdict(graph, /invariant\(s\) PASS/u, 'the R3-S0 graph audit'),
    S1_event_audit: verdict(events, /audit check\(s\) PASS/u, 'the R3-S0 event audit'),
    anti_vacuity: verdict(antiVacuity, /ANTI-VACUITY: PASS/u, 'the anti-vacuity scan'),
    R1_L_consumer_boundary: verdict(r1l, /R1-L-LIVE: PASS/u, 'the R1-L consumer-boundary gate'),
    R1_H_confinement: verdict(r1h, /CONFORMANCE: PASS/u, 'the R1-H confinement conformance'),
    R1_HR_host_hardening: verdict(r1hr, /CONFORMANCE: PASS/u, 'the R1-HR host-hardening conformance'),
    R1_HC_residual_closure: verdict(r1hc, /CONFORMANCE: PASS/u, 'the R1-HC residual-closure conformance'),
  });

  const notGreen = Object.entries(gates).filter(([, value]) => value.green !== true).map(([key]) => key);
  const experimentValid = input.experimentValid ?? true;
  const record = Object.freeze({
    schemaVersion: 1,
    stage: 'R3-L0C',
    kind: 'validity gates',
    gates,
    SYSTEM_VALID: notGreen.length === 0,
    notGreen: Object.freeze(notGreen),
    EXPERIMENT_VALID: experimentValid && notGreen.length === 0,
    onFailure: 'BEHAVIORAL MECHANISM CLAIM = INVALID, regardless of favorable outcomes',
    /** §2.1: every gate output records where its evidence came from. */
    evidenceMode: input.mode ?? EVIDENCE_MODES.HISTORICAL,
  });
  const dir = join(runRoot, 'preflight');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `validity-${String(input.phase ?? 'pre')}.json`), `${JSON.stringify(record, null, 2)}${NL}`, 'utf8');
  return record;
}

/**
 * §1/§26: READ A GATE'S VERDICT FROM ITS OUTPUT.
 *
 * The output is ANSI-coloured, so a raw regex over it can miss the verdict line entirely — which is what
 * happened on the first run: both vitest suites were GREEN but read as RED because the escape sequences sat
 * between `Tests` and `passed`. The colour codes are stripped first, and the pattern then matches plain text.
 *
 * A gate with no recognisable verdict is RED rather than green: an unparsed result is not a pass.
 */
function verdict(run, pattern, label) {
  const plain = stripAnsi(run.output);
  const matched = pattern.test(plain);
  const line = plain.trim().split(NL).filter((entry) => pattern.test(entry)).pop() ?? '';
  return Object.freeze({ green: run.ok && matched, detail: matched ? line.trim().slice(0, 100) : `${label}: no pass line (exit ok=${String(run.ok)})` });
}

/** Strip ANSI SGR sequences, so a verdict can be read from coloured output. */
function stripAnsi(text) {
  return String(text).replace(/\[[0-9;]*m/gu, '');
}

/* ================================================================ §10 the containment gate */

/**
 * §10: RUN THE CONTAINMENT CANARIES AND THE LIVENESS CONTROL.
 *
 * The canaries come from R3-L0B and are reused rather than reimplemented, because §10 requires the REPAIRED
 * containment and re-deriving it would be a second implementation to keep in step. The liveness control runs with
 * them, so an UNREACHABLE result is a measurement rather than an empty probe.
 */
export async function runContainmentGate(input) {
  const root = join(input.runRoot, 'preflight', 'containment');
  const unitIds = ['u0-H', 'u0-C'];
  buildIsolatedLayout(root, unitIds);
  const suite = await runCanarySuite({ root, unitIds });
  const liveness = await canaryLivenessControl({ root: join(input.runRoot, 'preflight', 'containment-liveness'), unitIds });
  const verdictRecord = experimentContainmentFrom(suite.probes);
  const record = Object.freeze({
    schemaVersion: 1,
    stage: 'R3-L0C',
    kind: 'containment gate',
    EXPERIMENT_CONTAINMENT: suite.containment.EXPERIMENT_CONTAINMENT,
    probes: suite.probes.length,
    reachable: suite.containment.reachable,
    notApplicable: suite.containment.notApplicable,
    livenessLive: liveness.LIVE,
    livenessDirectReads: `${String(liveness.directReadsReachable)}/${String(liveness.directReads)}`,
    fence: suite.fence,
    sandbox: suite.sandbox,
    law: verdictRecord.law,
  });
  const dir = join(input.runRoot, 'preflight');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'containment.json'), `${JSON.stringify(record, null, 2)}${NL}`, 'utf8');
  return record;
}

/* ================================================================ §10 the plumbing check */

/**
 * §10: THE DUMMY PLUMBING CHECK.
 *
 * §10 and §23 forbid a primary-fixture smoke, so the plumbing is proven on a DUMMY project: the child-process
 * spawn, the shipped worker port, the payload capture and the governed pull, against a throwaway world. It
 * contributes nothing to N and touches no primary bytes.
 */
export async function runPlumbingCheck(input) {
  const record = await runPlumbing({ runRoot: input.runRoot, route: input.route ?? (await import('./plan.mjs')).PRIMARY_EXECUTOR });
  const dir = join(input.runRoot, 'preflight');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'plumbing.json'), `${JSON.stringify(record, null, 2)}${NL}`, 'utf8');
  return record;
}

export { NL, existsSync, listRunRoots };
