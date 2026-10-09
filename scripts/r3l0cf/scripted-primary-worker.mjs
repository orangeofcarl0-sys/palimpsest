/**
 * R3-L0C-I Gate 3 — THE SCRIPTED PRIMARY WORKER (the zero-LLM tee).
 *
 * WHAT THIS IS. A stand-in for the real DSH worker process that speaks the SHIPPED port's protocol EXACTLY. The
 * child spawns `node <dshBin> --profile P --work <contextFile>` and the port reads back one
 * `PALIMPSEST_WORK_RESULT ` line; this program is what `dshBin` points at, so the port, the context payload, the
 * governed pull channel and the result parsing are all the REAL ones. Only the model is replaced.
 *
 * WHY IT IS NOT A STUB. A stub that returned a canned outcome would prove nothing about whether the primary path
 * works — it would prove only that the runner accepts a canned outcome. This program therefore:
 *
 *   · reads the REAL context payload the port wrote, so the handles it sees are the ones the consumer boundary
 *     actually compiled;
 *   · performs the governed pull over the REAL `stdio[3]` IPC channel, so the delivery path is exercised and the
 *     canonical body comes back through the shipped resolver;
 *   · writes and commits a real file in the world, so the attempt settles through the ordinary path;
 *   · reports through the REAL `PALIMPSEST_WORK_RESULT` line, so the strict parser on the host side is what
 *     judges it.
 *
 * THE CANONICAL SCRIPTED FORM, from R3-S0: "if visible handle X exists -> call governed pull(X)". It never
 * searches the filesystem for a body. A worker that went looking on disk would make a delivery defect invisible,
 * which is the R1-L/R2-U historical failure this project has already been bitten by.
 *
 * THE FAULT SEAMS ARE NAMED AND NARROW, read from the environment so no product file changes:
 *
 *   R3L0CI_FAULT=REPORT_MISSING          exit without a result line (the harness sees no report)
 *   R3L0CI_FAULT=NO_COMMIT               do the work but never commit, so the attempt stays RUNNING
 *   R3L0CI_FAULT=DECLINE_PULL            see the handles and pull none of them
 *   R3L0CI_FAULT=NEEDS_ESCALATION        report an escalation rather than a settlement
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const NL = String.fromCharCode(10);
const RESULT_PREFIX = 'PALIMPSEST_WORK_RESULT ';
const CONTEXT_CHANNEL = 'palimpsest-worker-context-v1';
const fault = process.env.R3L0CI_FAULT ?? 'NONE';

/** The argv contract: `node <this> --profile P --work <contextFile>`. */
const workIndex = process.argv.indexOf('--work');
const contextPath = workIndex === -1 ? null : process.argv[workIndex + 1];
if (contextPath === null || !existsSync(contextPath)) {
  process.stderr.write(`r3l0ci-scripted-worker: no --work context file (argv: ${process.argv.slice(2).join(' ')})${NL}`);
  process.exit(2);
}

/**
 * The context payload, as the port wrote it.
 *
 * THE SHAPE IS THE PORT'S, and getting it wrong is silent: `workWorkerEnvironmentPayload` wraps the attempt
 * context under `context`, so the compiled handles live at `payload.context.compiled.handles` — NOT at
 * `payload.compiled.handles`. Measured: reading the wrong path made the worker see ZERO handles while the payload
 * recorded 2 and 4, so it pulled nothing and the delivery evidence disappeared. Both shapes are accepted here
 * because a worker must not be able to lose its context to a nesting mistake, and the primary path is preferred.
 */
const payload = JSON.parse(readFileSync(contextPath, 'utf8'));
const attemptContext = payload?.context ?? payload;
const visibleHandles = (attemptContext?.compiled?.handles ?? []).map((entry) => entry.handle);
const allowedHandles = Array.isArray(payload?.allowedPullHandles)
  ? payload.allowedPullHandles
  : (Array.isArray(attemptContext?.allowedPullHandles) ? attemptContext.allowedPullHandles : visibleHandles);

/** The one result line the port parses. Written exactly once, at the end, on stdout. */
function report(payload) {
  process.stdout.write(`${RESULT_PREFIX}${JSON.stringify(payload)}${NL}`);
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

/** The telemetry line the port reads for the handles actually pulled. */
function pullTelemetry(handles) {
  process.stdout.write(`PALIMPSEST_WORKER_PULL ${JSON.stringify({ handles })}${NL}`);
}

/**
 * Gate 3 fault: NO REPORT AT ALL. The harness sees a missing report, which is the infrastructure case — and the
 * point is that it is produced by the WORKER, so the harness's handling is exercised rather than assumed.
 */
if (fault === 'REPORT_MISSING') {
  process.stderr.write('r3l0ci-scripted-worker: exiting without a result line (REPORT_MISSING)');
  process.exit(1);
}

const workDir = process.cwd();
const pulls = [];
/**
 * THE SCRIPTED PULL. Unless the fault says to decline, every visible handle is pulled through the governed channel.
 * A declined pull is a REAL experimental outcome (Gate 2 admits it), not a harness failure, which is why it is a
 * fault seam rather than an error path.
 */
if (fault !== 'DECLINE_PULL') {
  for (const handle of visibleHandles) {
    if (!allowedHandles.includes(handle)) continue;
    const response = await governedPull(handle);
    pulls.push({ handle, status: response.status, value: response.value ?? null });
  }
  pullTelemetry(pulls.filter((pull) => pull.status === 'resolved').map((pull) => pull.handle));
}

/** The work: write a real change and commit it, so the attempt settles through the ordinary path. */
try {
  /**
   * THE WORK IS DERIVED FROM THE REQUIREMENT THE WORKER WAS HANDED, which is what a real worker does.
   *
   * This is not cosmetic. A worker that wrote the SAME bytes in both generations would stage nothing on G2 —
   * measured: `git commit` then fails with "nothing to commit", the attempt stays RUNNING, and the next generation
   * is blocked. That failure looks like a project blockage but is an artifact of a worker that ignores its own
   * context. So the script reads the requirements from the context it was given and implements what they name,
   * which makes G2's output genuinely different from G1's.
   */
  const requirements = (attemptContext?.work?.requirements ?? []).map((entry) => String(entry?.statement ?? entry ?? '')).join(' ');
  const exports = ['resolveEntitlement'];
  if (/revokeEntitlement/u.test(requirements)) exports.push('revokeEntitlement');
  const body = exports.map((name) => `export function ${name}() { return "ALLOW"; }`);
  writeFileSync(join(workDir, 'src', 'entitlements.mjs'), [
    '/** The resolver. */',
    `export const CAPABILITIES = ["ledger.view", "ledger.edit", "ledger.approve", "ledger.operate", "ledger.export"];`,
    ...body,
    '',
  ].join(NL), 'utf8');
} catch (error) {
  process.stderr.write(`r3l0ci-scripted-worker: could not write the work file: ${String(error?.message ?? error)}${NL}`);
}

/**
 * Gate 3 fault: NO COMMIT. The worker does the work and does not commit it, so the attempt stays RUNNING and the
 * next generation cannot legally start. That is the CENSORED case, and it is produced by the worker rather than
 * simulated by the harness.
 */
if (fault !== 'NO_COMMIT') {
  try {
    execFileSync('git', ['add', '-A'], { cwd: workDir, stdio: 'ignore' });
    execFileSync('git', ['-c', 'user.email=t@t.t', '-c', 'user.name=t', 'commit', '-qm', 'scripted primary work'], { cwd: workDir, stdio: 'ignore' });
  } catch (error) {
    process.stderr.write(`r3l0ci-scripted-worker: commit failed: ${String(error?.message ?? error).slice(0, 200)}${NL}`);
  }
}

/** The result, through the strict parser's vocabulary. */
if (fault === 'NEEDS_ESCALATION') {
  report({ kind: 'NEEDS_ESCALATION', summary: 'the scripted worker reports an escalation', reason: 'R3L0CI_FAULT=NEEDS_ESCALATION' });
} else {
  report({ kind: 'READY_FOR_SETTLEMENT', summary: `the scripted primary worker pulled ${String(pulls.filter((pull) => pull.status === 'resolved').length)} handle(s) and committed its work` });
}
process.exit(0);
