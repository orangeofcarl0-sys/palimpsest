// palimpsest-dsh-host/session-identity — the FIRST-PARTY WORKER SESSION IDENTITY REPORT.
//
// Trajectory-P2A §6. The worker host already creates a real DSH Agent Session and holds its
// authoritative identity on the returned handle; nothing transported that identity to the Parent,
// so no real Attempt -> Session association was possible. This module is the narrowest correct
// producer: ONE structured message on the IPC channel the Parent already owns.
//
// WHAT IT REPORTS. Exactly the fact the host actually produces: the SessionId of the session
// `agents.create()` really created. Nothing else. No ProjectId, no AttemptId, no HostJobId, no
// Parent InvocationId, no durable binding id, no `verified: true`, no Work outcome, no promotion
// status and no model-execution result — none of those is a Worker Session Creation fact, and the
// message must not be usable to imply any of them.
//
// WHY THE IPC CHANNEL AND NOT STDOUT. The worker's stdout is MODEL-WRITABLE: the worker runs a real
// engineering agent with shell and file tools, so any line on stdout is worker testimony. The Node
// IPC channel is a capability of the PARENT process (the port spawns with `stdio[3] = 'ipc'`) and is
// not reachable by the model, which is what makes this a host observation rather than a claim.
//
// BEST-EFFORT BY CONSTRUCTION (§6.4). A worker host may run with no IPC channel at all, or the
// channel may close before delivery. Absence of the capability must never fail a previously valid
// worker execution, so every failure here is contained and REPORTED rather than thrown. The
// producer never claims a message was observed — only that it attempted to send one.
//
// OBSERVATION, NOT AUTHORITY (§6.6). This module settles nothing, verifies nothing, promotes
// nothing, grants nothing and changes no worker behaviour. It is a report about a session.
//
// PLAIN JAVASCRIPT. `host/**` is scanned by the architecture checker as JavaScript.

/** §6.2: the ONE channel name for the host -> parent identity report. */
export const WORKER_SESSION_IDENTITY_CHANNEL = 'palimpsest-worker-session-identity-v1';

/** §6.2: the ONE message kind. A distinct kind keeps this separable from the context-pull protocol. */
export const WORKER_SESSION_IDENTITY_KIND = 'session-created';

/**
 * §7.1: the EXACT field set the producer emits and the consumer accepts.
 *
 * Kept as data so producer and consumer cannot drift, and so a test can assert the closed shape
 * rather than restating it.
 */
export const WORKER_SESSION_IDENTITY_FIELDS = Object.freeze(['channel', 'kind', 'sessionId']);

/**
 * §7.1: the SessionId syntax this protocol admits.
 *
 * DELIBERATELY MODERATE. DSH's own `SessionId` is an unconstrained branded string (its session
 * schema is `z.string().min(1)`), and the worker host mints `worker-<uuid>`. A rule that demanded
 * the `worker-` prefix would be brittle the moment a resumed or forked session is reported, and a
 * rule that admitted ANY string would let a control character or a path-shaped value through into
 * durable evidence. This admits a non-empty, bounded, non-whitespace, non-control string — which is
 * what a DSH session identity is — and nothing more.
 */
export function isWellFormedSessionId(value) {
  return typeof value === 'string' && value.length >= 1 && value.length <= 200 && !/[\s\u0000-\u001f\u007f]/u.test(value);
}

/**
 * §6.1/§6.3: THE PRODUCER.
 *
 * Called by `runWorker` immediately after `agents.create()` resolves and BEFORE any model turn.
 *
 * The identity is taken from the CREATED HANDLE, never from the candidate string that was passed
 * into `agents.create`. Those are normally equal (DSH publishes the session under the requested
 * id), but only the handle's value is the identity DSH actually created; a host that reported its
 * own candidate would be asserting what it hoped happened rather than what did.
 *
 * @param {{ readonly sessionId: unknown, readonly send?: unknown }} input
 *   `send` is the channel's send function (`process.send`), or undefined when there is none.
 * @returns {{ readonly reported: boolean, readonly outcome: string, readonly detail: string | null }}
 *   A description of what was ATTEMPTED. `reported: true` means a send call was made without a
 *   synchronous failure; it does NOT mean the parent received it.
 */
export function reportWorkerSessionIdentity(input) {
  const sessionId = input?.sessionId;
  if (!isWellFormedSessionId(sessionId)) {
    /**
     * A malformed identity is NOT reported. Sending it would either be dropped by the strict parent
     * parser (harmless) or, worse, invite a lenient one to coerce it. The honest report is that the
     * host could not produce a well-formed identity.
     */
    return Object.freeze({ reported: false, outcome: 'IDENTITY_NOT_WELL_FORMED', detail: null });
  }
  const send = input?.send;
  if (typeof send !== 'function') {
    /**
     * §6.4: no IPC channel. A worker host run by hand, or under a harness that spawns without
     * `ipc`, has no `process.send`. This is a normal configuration, not a failure.
     */
    return Object.freeze({ reported: false, outcome: 'NO_IPC_CHANNEL', detail: null });
  }
  const message = Object.freeze({
    channel: WORKER_SESSION_IDENTITY_CHANNEL,
    kind: WORKER_SESSION_IDENTITY_KIND,
    sessionId,
  });
  try {
    /**
     * §6.4: a synchronous send failure (the channel already closed, the child detached) must not
     * propagate. The second argument is Node's send callback; when the channel reports an
     * asynchronous failure the message simply was not delivered, and nothing here can change that.
     */
    send(message, (error) => {
      if (error !== null && error !== undefined) {
        process.stderr.write(`palimpsest-runner: worker session identity report was not delivered: ${error?.message ?? String(error)}\n`);
      }
    });
    return Object.freeze({ reported: true, outcome: 'REPORT_ATTEMPTED', detail: null });
  } catch (error) {
    return Object.freeze({ reported: false, outcome: 'IPC_SEND_FAILED', detail: error?.message ?? String(error) });
  }
}
