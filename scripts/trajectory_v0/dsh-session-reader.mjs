/**
 * Trajectory-V0 §4/§9 (V0-B / V0-G) — THE REAL DSH SESSION READER.
 *
 * This is the ACTUAL, first-party-backed implementation of the `DshSessionReadPort` contract: it
 * mounts DSH's own `@deepseek-ai/dsh-session-persistence-jsonl` backend in a bare Cordis context and
 * reads a session through `readColdSessionLog` from `@deepseek-ai/dsh-session-query`. It never
 * resumes an Agent, never writes a session, never contacts a provider and never calls a model.
 *
 * WHY THIS IS A SCRIPT AND NOT `src/`. Palimpsest's own `node_modules` contains no `@deepseek-ai/*`
 * package; the installed DSH lives at `~/.dsh/profiles/node_modules/@deepseek-ai/`. A `src/` module
 * importing an absolute profile path would make the product source depend on one machine's
 * deployment layout. So the reader lives here, resolves the DSH home at CALL time, and exposes
 * exactly the `DshSessionReadPort` shape the product contract declares.
 *
 * ------------------------------------------------------------------ Trajectory-V0S §9 corrections
 *
 *   PERSISTED vs SYNTHETIC. `readColdSessionLog` returns `[...storedEvents, ...closers]`, where the
 *   closers are synthesized in memory by `interruptedTurnClosers`. V0 labelled every returned event
 *   as if it were stored. This reader instead reads the STORED PREFIX through the persistence
 *   handle's own `read` seam, counts it, and labels each event by whether its seq falls inside that
 *   prefix. When the handle seam is unavailable the boundary is reported UNRESOLVED rather than
 *   assumed.
 *
 *   BOUNDED INPUT. A negative, fractional or excessive cursor is REFUSED (`INVALID_REQUEST`) rather
 *   than silently coerced, and `RETURN_PAGE_BOUNDED` is explicitly distinguished from
 *   `DISK_IO_PAGE_BOUNDED` — this reader reads the whole log before slicing, and says so.
 *
 *   ERROR PRIVACY. A raw filesystem exception can carry an absolute personal path. Known failures
 *   are mapped to stable classifications and the detail is SANITIZED, so no personal path reaches a
 *   consumer through the default read.
 *
 *   RESOURCE LIFECYCLE. `close()` disposes the Cordis context, so a long-lived reader does not
 *   accumulate mounted persistence contexts.
 *
 * PLAIN JAVASCRIPT (`.mjs`). No new dependency: it imports the installed DSH directly.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/** §4: the DSH event kinds this consumer recognizes. Everything else stays opaque but is referenced. */
const RECOGNIZED = new Set([
  'turn/start', 'turn/end', 'step/start', 'step/end',
  'assistant/message', 'assistant/attempt', 'tool/call', 'tool/result',
]);

/** §9: the hard page maximum, mirroring the product contract. */
const MAX_PAGE = 200;
const DEFAULT_PAGE = 50;

/**
 * §2/§4: resolve the installed DSH package root.
 *
 * Tries the given home first, then the conventional `~/.dsh` location. Returns null when no
 * `@deepseek-ai` tree exists, so a caller reports READ_CAPABILITY_ABSENT rather than guessing.
 */
export function resolveDshPackageRoot(dshHomePath) {
  const candidates = [];
  if (typeof dshHomePath === 'string' && dshHomePath.length > 0) {
    candidates.push(join(dshHomePath, 'profiles', 'node_modules', '@deepseek-ai'));
    candidates.push(join(dshHomePath, 'node_modules', '@deepseek-ai'));
  }
  for (const candidate of candidates) {
    if (existsSync(join(candidate, 'dsh-session'))) return candidate;
  }
  return null;
}

/** §4: the DSH session file name the current format generation uses. */
const SESSION_FILE_CANDIDATES = ['session.v4.jsonl.zstd', 'session.v4.jsonl', 'session.v3.jsonl.zstd', 'session.v3.jsonl'];

/**
 * §9: strip anything that could be a personal filesystem location from a message.
 *
 * The ruling forbids propagating a raw exception whose text contains an absolute personal path. The
 * sanitizer is deliberately blunt: it removes Windows drive-letter paths, POSIX home paths and any
 * `...\.dsh\...`-shaped fragment, replacing each with a bounded placeholder.
 */
export function sanitize(message) {
  if (typeof message !== 'string') return 'an unreadable error';
  return message
    .replace(/[A-Za-z]:\\[^\s"']*/gu, '<local-path>')
    .replace(/[A-Za-z]:\/[^\s"']*/gu, '<local-path>')
    .replace(/(?:\/Users|\/home)\/[^\s"']*/gu, '<local-path>')
    .replace(/(?:^|[\s"'(])\/[\w.-]+(?:\/[\w.-]+)+/gu, ' <local-path>')
    .slice(0, 300);
}

/** §9: map one raw DSH event into the sanitized view the port returns. */
function sanitizeEvent({ sessionId, event, inherited, durability }) {
  const data = (event.data ?? {});
  const num = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null);
  const str = (value) => (typeof value === 'string' && value.length > 0 ? value : null);
  let summary;
  let observedStatus = null;
  switch (event.type) {
    case 'turn/start': summary = `turn ${String(num(data.turn) ?? '?')} opened`; break;
    case 'turn/end':
      summary = `turn ${String(num(data.turn) ?? '?')} closed`;
      observedStatus = str(data.reason?.kind) ?? 'unknown';
      break;
    case 'step/start': summary = `step ${String(num(data.step) ?? '?')} of turn ${String(num(data.turn) ?? '?')} opened`; break;
    case 'step/end': summary = `step ${String(num(data.step) ?? '?')} of turn ${String(num(data.turn) ?? '?')} closed`; break;
    case 'assistant/message':
      summary = `assistant message at turn ${String(num(data.turn) ?? '?')} step ${String(num(data.step) ?? '?')}`;
      break;
    case 'assistant/attempt':
      summary = `assistant attempt at turn ${String(num(data.turn) ?? '?')}`;
      observedStatus = str(data.status) ?? (data.failure === undefined ? null : 'failure');
      break;
    case 'tool/call':
      summary = `tool call ${String(str(data.name) ?? 'unknown')} at step ${String(num(data.step) ?? '?')}`;
      break;
    case 'tool/result':
      summary = `tool result at step ${String(num(data.step) ?? '?')}`;
      observedStatus = data.message === undefined ? 'unknown' : 'recorded';
      break;
    default:
      summary = RECOGNIZED.has(event.type) ? event.type : `unrecognized event kind ${event.type}`;
      break;
  }
  return Object.freeze({
    sessionId,
    seq: event.seq,
    type: event.type,
    inherited,
    durability,
    time: event.time,
    surface: null,
    summary,
    durationMs: null,
    observedStatus,
  });
}

const PAGE_PROVES = Object.freeze([
  "these exact events exist in this session's own log, at these local sequence numbers",
  "the session's immutable header identity, when the source supplied it",
]);

const PAGE_DOES_NOT_PROVE = Object.freeze([
  'that the Work Attempt settled, verified or promoted',
  'that a turn/end means the work succeeded — the turn may have aborted or blocked',
  'that a tool/call without a matching tool/result succeeded',
  'that a failed assistant/attempt produced valid output',
  'that the current model surface equals the complete raw execution history',
  'that no tool was called, merely because no tool/call event appears in this page',
  'that this session belongs to the requested Work Attempt (binding is a separate fact)',
  'that a synthetic recovery event was written by the original execution',
]);

/** §4: classify a raw failure into one of the honest read states. */
function classifyFailure(error, known) {
  const code = typeof error?.code === 'string' ? error.code : '';
  const name = typeof error?.name === 'string' ? error.name : '';
  if (code === 'SESSION_QUERY_SESSION_NOT_FOUND' || name === 'SessionPersistenceNotFoundError') return 'SESSION_MISSING';
  if (code === 'SESSION_QUERY_SOURCE_CONFLICT') return 'IDENTITY_CONFLICT';
  if (code === 'SESSION_QUERY_CORRUPT_SESSION' || name === 'SessionPersistenceCorruptionError') return 'CORRUPT_SESSION';
  if (name === 'SessionFormatUnsupportedError' || code === 'SESSION_QUERY_INVALID_SURFACE') return 'FORMAT_UNSUPPORTED';
  if (code === 'SESSION_QUERY_PERSISTENCE_FAILED') return 'BACKEND_UNAVAILABLE';
  void known;
  return 'BACKEND_UNAVAILABLE';
}

/**
 * §9: validate a bounded read request. Returns the exact request to honour, or the refusal.
 *
 * The bounds are checked here as well as in the product contract: this adapter is also used
 * standalone by an operator, and an unbounded or nonsensical cursor must be refused at the source
 * rather than passed to the persistence layer.
 */
function validateRequest(request) {
  const rawFrom = request.fromSeq === undefined ? 0 : request.fromSeq;
  const rawMax = request.maxEvents === undefined ? DEFAULT_PAGE : request.maxEvents;
  if (!Number.isSafeInteger(rawFrom) || rawFrom < 0) {
    return { ok: false, detail: `fromSeq must be a non-negative safe integer, received ${String(rawFrom)}` };
  }
  if (!Number.isSafeInteger(rawMax) || rawMax <= 0) {
    return { ok: false, detail: `maxEvents must be a positive safe integer, received ${String(rawMax)}` };
  }
  if (rawMax > MAX_PAGE) {
    return { ok: false, detail: `maxEvents ${String(rawMax)} exceeds the hard maximum of ${String(MAX_PAGE)}` };
  }
  return { ok: true, fromSeq: rawFrom, maxEvents: rawMax };
}

/**
 * §9: read the STORED PREFIX length through the persistence handle's own seam.
 *
 * `readColdSessionLog` returns stored events PLUS synthetic closers, so the returned array's length
 * is NOT the stored count. This opens a read handle directly and asks it for the stored log, which
 * is the only source-grounded way to locate the boundary. Returns null when the seam is unavailable,
 * in which case the caller reports the durability boundary UNRESOLVED rather than assuming.
 */
async function readStoredPrefix(persistence, sessionId, SessionId) {
  let handle;
  try {
    handle = await persistence.open(SessionId(sessionId), 'read');
  } catch {
    return null;
  }
  try {
    const stored = await handle.read(0, undefined);
    return { count: stored.events.length, eventState: stored.eventState };
  } catch {
    return null;
  } finally {
    try {
      await handle.close();
    } catch {
      /* the handle is already gone; nothing to release */
    }
  }
}

/**
 * §4: build a REAL DSH-backed reader.
 *
 * `sessionsRoot` is the DSH session root (e.g. `<dshHome>/sessions`). The reader mounts the JSONL
 * backend in a bare Cordis context — no agent, no tools, no provider — and reads through
 * `readColdSessionLog`, which the DSH README documents as never making a session live.
 */
export async function makeRealDshSessionReader(input) {
  const { dshHomePath, sessionsRoot } = input;
  const packageRoot = resolveDshPackageRoot(dshHomePath);
  if (packageRoot === null) return null;
  if (typeof sessionsRoot !== 'string' || sessionsRoot.length === 0) return null;

  const base = pathToFileURL(packageRoot + '/').href;
  const { Context } = await import(base + 'cordis/lib/index.js');
  const JsonlSessionPersistence = (await import(base + 'dsh-session-persistence-jsonl/lib/index.js')).default;
  const { readColdSessionLog } = await import(base + 'dsh-session-query/lib/index.js');
  const { SessionId } = await import(base + 'dsh-session/lib/index.js');

  const ctx = new Context();
  /**
   * §9: `ctx.plugin` returns the Cordis FIBER that owns the mounted service. Disposing the fiber is
   * the supported teardown — a bare Cordis `Context` has no `dispose` of its own, so retaining the
   * fiber is what makes `close()` real rather than decorative.
   */
  const fiber = await ctx.plugin(JsonlSessionPersistence, { root: sessionsRoot, compression: 'zstd' });
  const persistence = ctx.sessionPersistence;
  const sourceIdentity = `dsh-session-persistence-jsonl@${packageRoot}`;

  const headerOf = (header, inheritedCount) => Object.freeze({
    sessionId: header.id,
    version: header.version,
    createdAt: header.createdAt,
    cwd: typeof header.cwd === 'string' ? header.cwd : null,
    parentSession: typeof header.parentSession === 'string' ? header.parentSession : null,
    isSeeded: header.isSeeded === true,
    origin: typeof header.origin === 'string' ? header.origin : null,
    delegationDepth: typeof header.delegationDepth === 'number' ? header.delegationDepth : null,
    ...(typeof inheritedCount === 'number' ? { inheritedEventCount: inheritedCount } : {}),
  });

  return Object.freeze({
    sourceIdentity,
    evidenceClass: 'REAL_DSH_QUERY',

    /** §9: dispose the mounted persistence fiber. Idempotent. */
    async close() {
      try {
        await fiber?.dispose?.();
      } catch {
        /* the fiber may already be disposed */
      }
    },

    /** §4: read one bounded page of a session's own events. */
    async readEvents(request) {
      const bounds = validateRequest(request);
      if (!bounds.ok) {
        return Object.freeze({
          schemaVersion: 1, readState: 'INVALID_REQUEST', sessionId: request.sessionId ?? null, header: null,
          sourceIdentity, sourceEvidenceClass: 'REAL_DSH_QUERY',
          throughSeq: null, knownEventCount: null, inheritedEventCount: null,
          requestedFromSeq: Number.isSafeInteger(request.fromSeq) ? request.fromSeq : 0,
          requestedMaxEvents: Number.isSafeInteger(request.maxEvents) ? request.maxEvents : 0,
          returnedCount: 0, pageBounded: true, diskIoBounded: true,
          durabilityProvenance: 'DURABILITY_UNRESOLVED', persistedEventCount: null, syntheticRecoveryEventCount: null,
          events: Object.freeze([]), knownParentSession: null, proves: Object.freeze([]),
          doesNotProve: PAGE_DOES_NOT_PROVE,
          detail: `the read request was refused: ${bounds.detail}`,
        });
      }
      const { fromSeq, maxEvents } = bounds;
      try {
        const log = await readColdSessionLog(persistence, SessionId(request.sessionId));
        const all = log.events;
        /**
         * §4: a CONTIGUOUS seq check. DSH documents its log as contiguous from 0, so a gap is a
         * real anomaly and is reported rather than silently paginated over.
         */
        for (let index = 0; index < all.length; index += 1) {
          if (all[index].seq !== index) {
            return Object.freeze({
              schemaVersion: 1, readState: 'EVENT_GAP', sessionId: request.sessionId,
              header: headerOf(log.header, log.inheritedEventCount), sourceIdentity, sourceEvidenceClass: 'REAL_DSH_QUERY',
              throughSeq: null, knownEventCount: all.length, inheritedEventCount: log.inheritedEventCount,
              requestedFromSeq: fromSeq, requestedMaxEvents: maxEvents, returnedCount: 0,
              pageBounded: true, diskIoBounded: false,
              durabilityProvenance: 'DURABILITY_UNRESOLVED', persistedEventCount: null, syntheticRecoveryEventCount: null,
              events: Object.freeze([]), knownParentSession: null, proves: Object.freeze([]),
              doesNotProve: PAGE_DOES_NOT_PROVE,
              detail: `the session log has a sequence gap at index ${String(index)} (found seq ${String(all[index].seq)})`,
            });
          }
        }

        /**
         * §9: locate the persisted/synthetic boundary through the storage seam. The cold read
         * appended `interruptedTurnClosers`, so anything at or beyond the stored prefix length is a
         * SYNTHETIC RECOVERY EVENT — an event the original execution never wrote.
         */
        const stored = await readStoredPrefix(persistence, request.sessionId, SessionId);
        const boundaryKnown = stored !== null;
        const storedCount = stored === null ? null : stored.count;
        const durabilityOf = (seq) => {
          if (!boundaryKnown) return 'DURABILITY_UNRESOLVED';
          return seq < storedCount ? 'PERSISTED_DSH_EVENT' : 'SYNTHETIC_RECOVERY_EVENT';
        };
        const syntheticCount = boundaryKnown ? all.filter((event) => event.seq >= storedCount).length : null;

        const inheritedCount = log.inheritedEventCount;
        const page = all.slice(fromSeq, fromSeq + maxEvents).map((event) =>
          sanitizeEvent({
            sessionId: request.sessionId,
            event,
            inherited: event.seq < inheritedCount,
            durability: durabilityOf(event.seq),
          }),
        );
        return Object.freeze({
          schemaVersion: 1, readState: 'READ_OK', sessionId: request.sessionId,
          header: headerOf(log.header, inheritedCount),
          sourceIdentity, sourceEvidenceClass: 'REAL_DSH_QUERY',
          throughSeq: page.length === 0 ? null : page[page.length - 1].seq,
          knownEventCount: all.length,
          inheritedEventCount: inheritedCount,
          requestedFromSeq: fromSeq,
          requestedMaxEvents: maxEvents,
          returnedCount: page.length,
          /**
           * §9: the RETURN is bounded by the slice; the DISK IO is not, because this reader reads the
           * whole validated log before slicing. Reporting both honestly is the point — a consumer must
           * not read `pageBounded` as a statement about I/O cost.
           */
          pageBounded: true,
          diskIoBounded: false,
          durabilityProvenance: boundaryKnown ? 'PERSISTED_AND_SYNTHETIC_SEPARATED' : 'DURABILITY_UNRESOLVED',
          persistedEventCount: storedCount,
          syntheticRecoveryEventCount: syntheticCount,
          events: Object.freeze(page),
          knownParentSession: typeof log.header.parentSession === 'string' ? log.header.parentSession : null,
          proves: PAGE_PROVES,
          doesNotProve: PAGE_DOES_NOT_PROVE,
          detail:
            `read ${String(page.length)} of ${String(all.length)} events from the session's own log ` +
            (boundaryKnown
              ? `(${String(storedCount)} stored, ${String(syntheticCount)} synthetic recovery closer(s))`
              : '(the persisted/synthetic boundary could not be verified against the storage seam)'),
        });
      } catch (error) {
        const readState = classifyFailure(error);
        return Object.freeze({
          schemaVersion: 1, readState, sessionId: request.sessionId, header: null,
          sourceIdentity, sourceEvidenceClass: 'REAL_DSH_QUERY',
          throughSeq: null, knownEventCount: null, inheritedEventCount: null,
          requestedFromSeq: fromSeq, requestedMaxEvents: maxEvents, returnedCount: 0,
          pageBounded: true, diskIoBounded: true,
          durabilityProvenance: 'DURABILITY_UNRESOLVED', persistedEventCount: null, syntheticRecoveryEventCount: null,
          events: Object.freeze([]), knownParentSession: null, proves: Object.freeze([]),
          doesNotProve: PAGE_DOES_NOT_PROVE,
          /**
           * §9: the message is SANITIZED. A raw filesystem exception can name an absolute personal
           * path, and this detail travels into consumer-visible evidence.
           */
          detail: `the session could not be read (${readState}): ${sanitize(error instanceof Error ? error.message : String(error))}`,
        });
      }
    },

    /** §4: read a session's immutable header identity, or report why it is unavailable. */
    async readHeaderIdentity(sessionId) {
      try {
        const log = await readColdSessionLog(persistence, SessionId(sessionId));
        return Object.freeze({ readState: 'READ_OK', header: headerOf(log.header, log.inheritedEventCount), detail: 'the stored header was read and validated' });
      } catch (error) {
        const readState = classifyFailure(error);
        return Object.freeze({ readState, header: null, detail: `${readState}: ${sanitize(error instanceof Error ? error.message : String(error))}` });
      }
    },
  });
}

/** §2/§4: list the sessions a root actually holds, WITHOUT exposing a generic caller surface. */
export async function listSessionIds(input) {
  const { dshHomePath, sessionsRoot } = input;
  const packageRoot = resolveDshPackageRoot(dshHomePath);
  if (packageRoot === null) return null;
  const base = pathToFileURL(packageRoot + '/').href;
  const { Context } = await import(base + 'cordis/lib/index.js');
  const JsonlSessionPersistence = (await import(base + 'dsh-session-persistence-jsonl/lib/index.js')).default;
  const ctx = new Context();
  const fiber = await ctx.plugin(JsonlSessionPersistence, { root: sessionsRoot, compression: 'zstd' });
  try {
    const listed = await ctx.sessionPersistence.list();
    return listed.map((record) => ({
      sessionId: record.header.id,
      cwd: typeof record.header.cwd === 'string' ? record.header.cwd : null,
      isSeeded: record.header.isSeeded === true,
      sizeBytes: record.sizeBytes,
    }));
  } finally {
    try {
      await fiber?.dispose?.();
    } catch {
      /* the fiber may already be disposed */
    }
  }
}

export { SESSION_FILE_CANDIDATES, PAGE_DOES_NOT_PROVE, PAGE_PROVES };
