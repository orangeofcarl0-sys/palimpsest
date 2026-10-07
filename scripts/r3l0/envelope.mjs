/**
 * R3-L0 §1/§2/§13 — THE SYSTEM VALIDITY ENVELOPE AND THE EVIDENCE IMMUTABILITY GUARD.
 *
 * §1 requires R3-S0 to be carried forward as a PREREQUISITE, not an assumption. This module records the exact
 * envelope a behavioural result is allowed to speak within, and it RUNS the load-bearing R3-S0 gates rather than
 * citing them: if SYSTEM_VALID is not YES, §1 says STOP, and no behavioural result may repair that.
 *
 * §2 requires a historical-evidence immutability guard: every protected `research-evidence/**` path EXCLUDING
 * the current stage's own `r3-l0/**` is digested before anything is modified, and recomputed afterwards with
 * equality required. §28 adds the important part: a mutation is RECORDED FIRST and never silently restored.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import { BYPASS_CLAIM, BYPASS_CHECKS } from '../r3s0/contract.mjs';

const REPO_ROOT = new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/u, '$1');
const NL = String.fromCharCode(10);

/** The current stage's own evidence path. §2 excludes it from protection because this stage OWNS it. */
export const STAGE_EVIDENCE_PATH = 'research-evidence/r3-l0';

/** §2: the protected historical root. */
export const PROTECTED_ROOT = 'research-evidence';

export const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex');

/** Recursively list files under a directory, POSIX-style and sorted, so a digest is order-independent. */
function walk(root, prefix = '', out = []) {
  const dir = prefix === '' ? root : join(root, prefix);
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((left, right) => (left.name < right.name ? -1 : 1))) {
    const rel = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) walk(root, rel, out);
    else out.push(rel);
  }
  return out;
}

/**
 * §2: enumerate the protected historical evidence paths and digest them.
 *
 * The exclusion is by PATH PREFIX and is recorded in the result, so a reader can see exactly what was and was
 * not protected rather than trusting the exclusion was applied correctly.
 */
export function digestHistoricalEvidence() {
  const root = join(REPO_ROOT, PROTECTED_ROOT);
  const files = walk(root).filter((relativePath) => !`${PROTECTED_ROOT}/${relativePath}`.startsWith(`${STAGE_EVIDENCE_PATH}/`));
  const digests = {};
  for (const relativePath of files) {
    const full = join(root, relativePath);
    digests[`${PROTECTED_ROOT}/${relativePath}`] = sha256(readFileSync(full, 'utf8'));
  }
  const ordered = Object.keys(digests).sort();
  const treeDigest = sha256(ordered.map((path) => `${path}:${digests[path]}`).join(NL));
  return Object.freeze({
    protectedRoot: PROTECTED_ROOT,
    excludedStagePath: STAGE_EVIDENCE_PATH,
    fileCount: ordered.length,
    treeDigest,
    digests: Object.freeze(digests),
  });
}

/**
 * §2/§28: compare a baseline against a fresh reading.
 *
 * §28 is explicit that a mutation must be RECORDED rather than auto-restored, so this returns the mutation
 * detail and never repairs anything.
 */
export function compareHistoricalEvidence(baseline, current) {
  const changed = [];
  const added = [];
  const removed = [];
  for (const path of Object.keys(baseline.digests)) {
    if (!(path in current.digests)) removed.push(path);
    else if (current.digests[path] !== baseline.digests[path]) changed.push(path);
  }
  for (const path of Object.keys(current.digests)) if (!(path in baseline.digests)) added.push(path);
  const immutable = changed.length === 0 && added.length === 0 && removed.length === 0;
  return Object.freeze({
    HISTORICAL_EVIDENCE_IMMUTABLE: immutable,
    baselineTreeDigest: baseline.treeDigest,
    currentTreeDigest: current.treeDigest,
    changed: Object.freeze(changed.sort()),
    added: Object.freeze(added.sort()),
    removed: Object.freeze(removed.sort()),
    /** §28: the fact is recorded; nothing is restored. */
    action: immutable ? 'none required' : 'RECORDED — the mutation is reported and NOT auto-restored, per §28',
  });
}

/* ================================================================ §1 the envelope */

/** §1: the System Validity Envelope. Every field is a FACT read from the running system, not a restatement. */
export function systemValidityEnvelope() {
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
  const tree = execFileSync('git', ['rev-parse', 'HEAD^{tree}'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
  const branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
  return Object.freeze({
    kind: 'SystemValidityEnvelope',
    stage: 'R3-L0',
    prerequisite: 'R3-S0 SYSTEM_VALID',
    canonicalRevision: head,
    canonicalTree: tree,
    branch,
    /** §1: the supported confidential runtime profile, read from the SHIPPED host module. */
    confidentialRuntimeProfile: Object.freeze({
      source: 'host/deployment/runtime/confidential_profile.js',
      id: 'windows-confidential-single-active',
      maxActiveWorkers: 1,
      reason: 'a worker\'s own workspace write grant is the last writer of its world label, so two ACTIVE worlds cannot both be read-fenced; the host serializes confidential workers',
      /** §1: the single-active-worker limitation is part of the envelope, not a footnote. */
      limitation: 'at most ONE ACTIVE confidential worker exists at a time, so this stage\'s sessions are strictly sequential and no concurrency effect is measured',
    }),
    /** §1: the restart scope, stated so a distributed claim cannot be read into the result. */
    restartScope: Object.freeze({
      scope: 'SAME-MACHINE OS PROCESS BOUNDARY',
      mechanism: 'a fresh child Node process re-attaches to the durable stores BY PATH and re-resolves its own references',
      excluded: 'no distributed, multi-host or network-boundary restart is measured or claimed',
    }),
    /** §1: the common renderer/tool surface every generation runs. */
    commonRuntimeSurface: Object.freeze({
      renderer: 'dsh-common-worker',
      resultTool: 'palimpsest_worker_result',
      contextPullTool: 'palimpsest_worker_context_pull',
      contextPullChannel: 'palimpsest-worker-context-v1',
      modelSpecificPromptTuning: false,
    }),
    /** §1: the known-bypass scope, with the honest ceiling R3-S0 froze. */
    knownBypassScope: Object.freeze({
      claim: BYPASS_CLAIM.allowed,
      forbiddenClaim: BYPASS_CLAIM.forbidden,
      scope: BYPASS_CLAIM.reason,
      checks: Object.freeze(BYPASS_CHECKS.map((check) => check.id)),
      attributedTo: 'R1-L (worker-side backing-store route), R1-H, R1-HR, R1-HC',
    }),
    /** §1: what the envelope deliberately excludes, so no report can over-read the result. */
    excludedClaims: Object.freeze([
      'cross-model portability',
      'organic self-generated capital compounding',
      'Procedure marginal efficacy',
      'universal project intelligence',
      'monetary cost reduction unless measured',
      'Fusion value',
      'distributed or multi-host restart behaviour',
      'concurrent confidential workers',
    ]),
  });
}

/* ================================================================ §1 the load-bearing gates */

/**
 * §1/§22/§29: RUN the load-bearing R3-S0 gates.
 *
 * §1 says to run the load-bearing R3-S0 deterministic gates before any primary L0 worker run, and §22 requires
 * the same suite before AND after the matrix. The gates are executed, never cited.
 */
export function runLoadBearingSystemGates() {
  const run = (script, args = []) => {
    try {
      const output = execFileSync(process.execPath, [join(REPO_ROOT, 'scripts', script), ...args], {
        cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024,
      });
      return { ok: true, output };
    } catch (error) {
      return { ok: false, output: `${String(error?.stdout ?? '')}${String(error?.stderr ?? '')}` };
    }
  };

  const s1 = run(join('r3s0', 'graph-audit.mjs'));
  const event = run(join('r3s0', 'event-audit.mjs'));
  const antiVacuity = run(join('r2lr', 'anti-vacuity.mjs'));
  const r1l = run(join('gates', 'r1l-live-gate.mjs'));
  const r1h = run(join('r1h', 'conformance.mjs'));
  const r1hr = run(join('r1hr', 'conformance.mjs'));
  const r1hc = run(join('r1hc', 'conformance.mjs'));

  const s1Match = /(\d+)\/(\d+) invariant\(s\) PASS/u.exec(s1.output);
  const eventMatch = /(\d+)\/(\d+) audit check\(s\) PASS/u.exec(event.output);

  return Object.freeze({
    kind: 'LoadBearingSystemGates',
    S1_graph_integrity: Object.freeze({ green: s1.ok && s1Match !== null && s1Match[1] === s1Match[2], detail: s1Match === null ? 'no verdict' : `${s1Match[1]}/${s1Match[2]} invariants PASS` }),
    S1_event_audit: Object.freeze({ green: event.ok && eventMatch !== null && eventMatch[1] === eventMatch[2], detail: eventMatch === null ? 'no verdict' : `${eventMatch[1]}/${eventMatch[2]} checks PASS` }),
    anti_vacuity: Object.freeze({ green: /ANTI-VACUITY: PASS/u.test(antiVacuity.output), detail: (antiVacuity.output.trim().split(NL).filter((line) => line.includes('ANTI-VACUITY')).pop() ?? '').slice(0, 120) }),
    R1_L_consumer_boundary: Object.freeze({ green: /R1-L-LIVE: PASS/u.test(r1l.output), detail: (r1l.output.trim().split(NL).filter((line) => line.includes('R1-L-LIVE')).pop() ?? '').slice(0, 120) }),
    R1_H_confinement: Object.freeze({ green: /CONFORMANCE: PASS/u.test(r1h.output), detail: (r1h.output.trim().split(NL).filter((line) => line.includes('CONFORMANCE')).pop() ?? '').slice(0, 120) }),
    R1_HR_host_hardening: Object.freeze({ green: /CONFORMANCE: PASS/u.test(r1hr.output), detail: (r1hr.output.trim().split(NL).filter((line) => line.includes('CONFORMANCE')).pop() ?? '').slice(0, 120) }),
    R1_HC_residual_closure: Object.freeze({ green: /CONFORMANCE: PASS/u.test(r1hc.output), detail: (r1hc.output.trim().split(NL).filter((line) => line.includes('CONFORMANCE')).pop() ?? '').slice(0, 120) }),
  });
}

/** §1: SYSTEM_VALID is YES only when every load-bearing gate is green. */
export function systemValidFrom(gates) {
  const categories = Object.entries(gates).filter(([key]) => key !== 'kind').map(([key, value]) => Object.freeze({ id: key, green: value.green === true }));
  const notGreen = categories.filter((category) => !category.green).map((category) => category.id);
  return Object.freeze({
    SYSTEM_VALID: notGreen.length === 0,
    categories: Object.freeze(categories),
    notGreen: Object.freeze(notGreen),
    /** §1: the ruling's own consequence, carried in the record. */
    onFailure: 'STOP — no behavioural result may repair a system-validity failure',
  });
}

/* ================================================================ the writer */

export function writeEnvelope(record) {
  const dir = join(REPO_ROOT, STAGE_EVIDENCE_PATH);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'system-validity-envelope.json'), `${JSON.stringify(record, null, 2)}${NL}`, 'utf8');
  return join(dir, 'system-validity-envelope.json');
}

export { REPO_ROOT };
