/**
 * R3-L0C-I-A §4/§5 — THE STAGE-OWNED SCRIPTED WORKER (the zero-LLM tee).
 *
 * WHAT THIS IS. A stand-in for the real DSH worker process that speaks the SHIPPED port's protocol EXACTLY. The
 * child spawns `node <dshBin> --profile P --work <contextFile>` and the port reads back one
 * `PALIMPSEST_WORK_RESULT ` line; this program is what `dshBin` points at, so the port, the context payload, the
 * governed pull channel and the result parsing are all the REAL ones. Only the model is replaced.
 *
 * WHY IT IS NOT A STUB. A stub returning a canned outcome would prove only that the runner accepts a canned
 * outcome. This program therefore reads the REAL context payload, performs the governed pull over the REAL
 * `stdio[3]` IPC channel, writes and commits a real file in the world, and reports through the REAL
 * `PALIMPSEST_WORK_RESULT` line — so the strict parser on the host side is what judges it.
 *
 * THE TELEMETRY SCHEMA IS THE ONE DEFECT THIS FILE EXISTS TO FIX. R3-L0C-I's mock emitted
 *
 *     PALIMPSEST_WORKER_PULL {"handles":[...]}
 *
 * while the shipped runner emits
 *
 *     PALIMPSEST_WORKER_PULL {"pulled":[...]}
 *
 * The shipped parser reads `parsed.pulled`, so it read the mock's line as ZERO pulls for every session — a mock
 * that silently reports non-uptake everywhere, which is precisely the observation the study measures. This file
 * emits the SHIPPED field, and `test/r3l0cia_gates.test.ts` asserts the parity against the shipped parser.
 *
 * THE FAULT SEAMS ARE NAMED AND NARROW, read from the environment so no product file changes:
 *
 *   R3L0CIA_FAULT=REPORT_MISSING     exit without a result line
 *   R3L0CIA_FAULT=NO_COMMIT          do the work but never commit, so the attempt stays RUNNING
 *   R3L0CIA_FAULT=DECLINE_PULL       see the handles and pull none of them
 *   R3L0CIA_FAULT=NEEDS_ESCALATION   report an escalation rather than a settlement
 *   R3L0CIA_FAULT=SLOW               work, then sleep past the inner budget, for the timeout case
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const NL = String.fromCharCode(10);
const RESULT_PREFIX = 'PALIMPSEST_WORK_RESULT ';
const PULL_PREFIX = 'PALIMPSEST_WORKER_PULL ';
const CONTEXT_CHANNEL = 'palimpsest-worker-context-v1';
const fault = process.env.R3L0CIA_FAULT ?? 'NONE';

/** The argv contract: `node <this> --profile P --work <contextFile>`. */
const workIndex = process.argv.indexOf('--work');
const contextPath = workIndex === -1 ? null : process.argv[workIndex + 1];
if (contextPath === null || !existsSync(contextPath)) {
  process.stderr.write(`r3l0cia-scripted-worker: no --work context file (argv: ${process.argv.slice(2).join(' ')})${NL}`);
  process.exit(2);
}

/**
 * The context payload, as the port wrote it.
 *
 * THE SHAPE IS THE PORT'S: `workWorkerEnvironmentPayload` wraps the attempt context under `context`, so the
 * compiled handles live at `payload.context.compiled.handles` — NOT at `payload.compiled.handles`. Measured:
 * reading the wrong path made the worker see ZERO handles while the payload recorded 2 and 4. Both shapes are
 * accepted here because a worker must not be able to lose its context to a nesting mistake, and the primary path
 * is preferred.
 */
const payload = JSON.parse(readFileSync(contextPath, 'utf8'));
const attemptContext = payload?.context ?? payload;
const visibleHandles = (attemptContext?.compiled?.handles ?? []).map((entry) => entry.handle);
const allowedHandles = Array.isArray(payload?.allowedPullHandles)
  ? payload.allowedPullHandles
  : (Array.isArray(attemptContext?.allowedPullHandles) ? attemptContext.allowedPullHandles : visibleHandles);

/** The one result line the port parses. Written exactly once, at the end, on stdout. */
function report(value) {
  process.stdout.write(`${RESULT_PREFIX}${JSON.stringify(value)}${NL}`);
}

/** A governed pull over the real IPC channel, with a bounded wait. */
function governedPull(handle) {
  return new Promise((resolve) => {
    if (typeof process.send !== 'function') {
      resolve({ status: 'error', detail: 'no IPC channel bound' });
      return;
    }
    const requestId = `req-${Math.random().toString(36).slice(2, 12)}`;
    const timer = setTimeout(() => {
      process.off('message', onMessage);
      resolve({ status: 'error', detail: 'the pull timed out' });
    }, 15_000);
    const onMessage = (message) => {
      if (message?.kind !== 'pull-result' || message?.requestId !== requestId) return;
      clearTimeout(timer);
      process.off('message', onMessage);
      resolve(message);
    };
    process.on('message', onMessage);
    process.send({ channel: CONTEXT_CHANNEL, kind: 'pull', requestId, handle });
  });
}

/**
 * §4: THE TELEMETRY LINE, IN THE SHIPPED SCHEMA.
 *
 * The field is `pulled`, which is what the shipped `parseWorkerPullLine` reads. Emitting `handles` — as the
 * R3-L0C-I mock did — makes the shipped parser report zero pulls for every session, so the study's uptake
 * observation would be silently absent.
 */
function pullTelemetry(handles) {
  process.stdout.write(`${PULL_PREFIX}${JSON.stringify({ pulled: handles })}${NL}`);
}

/** §5 fault: NO REPORT AT ALL. The harness sees a missing report, which is the machinery case. */
if (fault === 'REPORT_MISSING') {
  process.stderr.write('r3l0cia-scripted-worker: exiting without a result line (REPORT_MISSING)');
  process.exit(1);
}

const workDir = process.cwd();
const pulls = [];
/**
 * §4: THE SCRIPTED PULL. Unless the fault says to decline, every visible handle is pulled through the governed
 * channel. A declined pull is a REAL experimental outcome, not a harness failure, which is why it is a fault seam
 * rather than an error path.
 */
if (fault !== 'DECLINE_PULL') {
  for (const handle of visibleHandles) {
    if (!allowedHandles.includes(handle)) continue;
    const response = await governedPull(handle);
    pulls.push({ handle, status: response.status, value: response.value ?? null });
  }
}
/** §4: the telemetry is emitted in BOTH cases, so a declined pull is reported as zero rather than as silence. */
pullTelemetry(pulls.filter((pull) => pull.status === 'resolved').map((pull) => pull.handle));

/**
 * §5 fault: SLOW. The worker works, then sleeps past the inner budget, for the timeout-hierarchy case.
 *
 * THE SLEEP IS INTERRUPTIBLE ON HOST DISCONNECT, and that is not tidiness. Measured: with an unconditional
 * `setTimeout`, killing the tee left this process sleeping as an ORPHAN — the vitest worker kept a live handle
 * for the full remaining sleep, and the whole suite's fork pool timed out terminating it. The case exists to
 * produce an unestablished descendant exit, not to leak a process, so the sleep ends early when the IPC channel
 * to the host closes. The UNCERTAIN classification is unaffected: the outer budget still expires before this
 * worker finishes, and the transcript still carries no result line.
 */
if (fault === 'SLOW') {
  const sleepMs = Number(process.env.R3L0CIA_SLOW_MS ?? '4000');
  process.stderr.write(`r3l0cia-scripted-worker: sleeping ${String(sleepMs)}ms (SLOW)${NL}`);
  await new Promise((resolve) => {
    const done = () => { clearTimeout(timer); resolve(); };
    const timer = setTimeout(done, sleepMs);
    process.once('disconnect', done);
    process.once('SIGTERM', () => process.exit(143));
    process.once('SIGINT', () => process.exit(130));
  });
}

/** The work: write a real change and commit it, so the attempt settles through the ordinary path. */
try {
  /**
   * THE WORK IS DERIVED FROM THE REQUIREMENT THE WORKER WAS HANDED, which is what a real worker does. A worker
   * that wrote the SAME bytes in both generations would stage nothing on G2 — measured: `git commit` then fails
   * with "nothing to commit", the attempt stays RUNNING, and the next generation is blocked. That failure looks
   * like a project blockage but is an artifact of a worker ignoring its own context.
   */
  const requirements = (attemptContext?.work?.requirements ?? []).map((entry) => String(entry?.statement ?? entry ?? '')).join(' ');
  const exports = ['resolveEntitlement'];
  if (/revokeEntitlement/u.test(requirements)) exports.push('revokeEntitlement');
  const body = exports.map((name) => `export function ${name}() { return "ALLOW"; }`);
  writeFileSync(join(workDir, 'src', 'entitlements.mjs'), [
    '/** The resolver. */',
    'export const CAPABILITIES = ["ledger.view", "ledger.edit", "ledger.approve", "ledger.operate", "ledger.export"];',
    ...body,
    '',
  ].join(NL), 'utf8');
} catch (error) {
  process.stderr.write(`r3l0cia-scripted-worker: could not write the work file: ${String(error?.message ?? error)}${NL}`);
}

/** §5 fault: NO COMMIT. The attempt stays RUNNING and the next generation cannot legally start. */
if (fault !== 'NO_COMMIT') {
  try {
    execFileSync('git', ['add', '-A'], { cwd: workDir, stdio: 'ignore' });
    execFileSync('git', ['-c', 'user.email=t@t.t', '-c', 'user.name=t', 'commit', '-qm', 'scripted primary work'], { cwd: workDir, stdio: 'ignore' });
  } catch (error) {
    process.stderr.write(`r3l0cia-scripted-worker: commit failed: ${String(error?.message ?? error).slice(0, 200)}${NL}`);
  }
}

/** The result, through the strict parser's vocabulary. */
if (fault === 'NEEDS_ESCALATION') {
  report({ kind: 'NEEDS_ESCALATION', summary: 'the scripted worker reports an escalation', reason: 'R3L0CIA_FAULT=NEEDS_ESCALATION' });
} else {
  report({ kind: 'READY_FOR_SETTLEMENT', summary: `the scripted primary worker pulled ${String(pulls.filter((pull) => pull.status === 'resolved').length)} handle(s) and committed its work` });
}
process.exit(0);
