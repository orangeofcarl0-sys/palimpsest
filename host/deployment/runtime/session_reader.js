/**
 * Trajectory-P2-C §7.6 — THE OFFICIAL DSH SESSION READER (shipped host implementation).
 *
 * Originally written for Trajectory-H1 §6 (C2) under `scripts/trajectory_v0/dsh-session-reader.mjs`. P2-C
 * moved the IMPLEMENTATION here, into the shipped host package (`palimpsest-host-deployment`), so the
 * product composition and the research gates share ONE reader; the script path is now a thin re-export.
 * There is deliberately no second event sanitizer and no second recovery implementation.
 *
 * THE PERSISTED/SYNTHETIC BOUNDARY IS DERIVED FROM ONE OFFICIAL READ.
 *
 * V0S located the boundary with a SECOND, independent read (`readStoredPrefix`) and compared its
 * count against the cold read's total. That comparison was unsound for two reasons, both measured at
 * the H0 baseline:
 *
 *   F1  the cold read's total ALREADY CONTAINS the synthetic closers, so `stored.count <= total` is
 *       satisfied by a stored count that is larger than the true boundary. An event that the FIRST
 *       read synthesized could then be classified as persisted.
 *   H1  DSH documents that "reads concurrent with a mutation carry no ordering promise beyond the
 *       valid contiguous prefix", so the two reads need not observe one snapshot at all.
 *
 * The corrected derivation needs no second read. The official `SessionHandle` exposes exactly the
 * seam this requires, and `readColdSessionLog` itself is built on it:
 *
 *     handle = await persistence.open(sessionId, 'read')
 *     read   = await handle.read(0, undefined)     // ONE validated contiguous stored prefix
 *     stored = read.events                         // the boundary is this array's own length
 *     closers = interruptedTurnClosers(stored)     // the official recovery helper, over THOSE events
 *     observed = [...stored, ...closers]
 *
 * Every event at an index below `stored.length` was read from storage. Every event produced by the
 * helper is synthetic. The two groups are distinguished by their POSITION IN ONE ARRAY, never by a
 * later storage count. The §4 audit (`scripts/trajectory_h1/dsh-source-audit.mjs`) measured this
 * derivation to be byte-identical to `readColdSessionLog` in length, sequence, type and turn-end
 * reason, on both a balanced and an interrupted session.
 *
 * The reader remains READ-ONLY: it opens a read handle, never appends, never flushes, never resumes
 * an Agent, never starts a model and never writes to DSH storage.
 *
 * ------------------------------------------------------------------ Trajectory-V0S §9 corrections
 *
 *   BOUNDED INPUT. A negative, fractional or excessive cursor is REFUSED (`INVALID_REQUEST`) rather
 *   than silently coerced, and `RETURN_PAGE_BOUNDED` is explicitly distinguished from
 *   `DISK_IO_PAGE_BOUNDED` — this reader reads the whole log before slicing, and says so.
 *
 *   ERROR PRIVACY. A raw filesystem exception can carry an absolute personal path. Known failures
 *   are mapped to stable classifications and the detail is SANITIZED, so no personal path reaches a
 *   consumer through the default read.
 *
 *   RESOURCE LIFECYCLE. `close()` disposes the Cordis context, and each read closes its own handle,
 *   so a long-lived reader does not accumulate mounted persistence contexts or leaked handles.
 *
 * PLAIN JAVASCRIPT (`.js`, ESM). No new dependency: it imports the installed DSH directly.
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
 * Trajectory-H1 §6.1 (C2): ONE official read produces both the stored prefix and the observed view.
 *
 * This is the whole correction. It opens an official READ handle, takes ONE validated contiguous
 * stored prefix from it, and derives the synthetic closers from THAT array with DSH's own recovery
 * helper. There is no second read and therefore no cross-snapshot boundary: the classification is a
 * property of one array's own shape.
 *
 * The handle's own `read` already resolves exactly one physical generation and returns a slice of
 * it (`JsonlSessionHandle.read -> readCurrent -> resolveCurrentLog` once, then `readStoredLog` once),
 * and the handle refuses to observe a log that shrank below a previously observed prefix. So the
 * prefix this function returns is a valid contiguous prefix of the log as of this one read.
 *
 * Returns a discriminated result so a failure is reported rather than turned into an empty success.
 */
async function readStoredPrefix(persistence, sessionId, SessionId, interruptedTurnClosers) {
  let handle;
  try {
    handle = await persistence.open(SessionId(sessionId), 'read');
  } catch (error) {
    return { ok: false, error };
  }
  try {
    /** ONE read. `length` is omitted so the handle returns the rest of the valid contiguous log. */
    const read = await handle.read(0, undefined);
    const stored = read.events;
    /**
     * §6.1: the synthetic closers are derived from the SAME array, using the official helper. A
     * balanced log yields none. The helper does not mutate its input (measured in the §4 audit).
     */
    const closers = interruptedTurnClosers(stored);
    return {
      ok: true,
      stored,
      closers,
      eventState: read.eventState,
      header: handle.header,
      inheritedEventCount: handle.inheritedEventCount,
    };
  } catch (error) {
    return { ok: false, error };
  } finally {
    try {
      await handle.close();
    } catch {
      /* §12: close is idempotent; a close failure must not discard the read result above */
    }
  }
}

/**
 * E4-C1 — RESOLVE THE PERSISTENCE PLUGIN ACROSS rc.2 AND rc.3.
 *
 * rc.2's `dsh-session-persistence-jsonl` exported the plugin as `default`. rc.3 exports `apply`, `name` and `Config`
 * as NAMED exports and has NO `default`, so the previous `.default` access produced `undefined` and Cordis refused it
 * with `invalid plugin, expect function or object with an "apply" method, received undefined`.
 *
 * THAT FAILURE IS WHY THE PIN MOVE MATTERED. It appeared only AFTER the drift refusal was resolved: the gate got past
 * pre-create, reached the session measurement, and crashed on a real API change. A stage that had merely flipped the
 * version string without running the path would never have found it.
 *
 * Cordis accepts a function or an object carrying `apply`, so the namespace object is a valid plugin. `default` is
 * still preferred when it exists, so the reader keeps working against rc.2 sessions — a reader that understood only
 * the newest shape would make the historical record unreadable.
 */
async function resolvePersistencePlugin(base) {
  const module = await import(base + 'dsh-session-persistence-jsonl/lib/index.js');
  const candidate = module.default;
  if (typeof candidate === 'function' || (candidate !== null && typeof candidate === 'object' && typeof candidate.apply === 'function')) return candidate;
  return module;
}

/**
 * §4: build a REAL runtime-backed reader.
 *
 * `sessionsRoot` is the runtime session root (e.g. `<dshHome>/sessions`). The reader mounts the JSONL
 * backend in a bare Cordis context — no agent, no tools, no provider — and reads through
 * an official read handle, which runtime documents as never making a session live.
 */
export async function makeRealDshSessionReader(input) {
  const { dshHomePath, sessionsRoot } = input;
  const packageRoot = resolveDshPackageRoot(dshHomePath);
  if (packageRoot === null) return null;
  if (typeof sessionsRoot !== 'string' || sessionsRoot.length === 0) return null;

  const base = pathToFileURL(packageRoot + '/').href;
  const { Context } = await import(base + 'cordis/lib/index.js');
  const JsonlSessionPersistence = await resolvePersistencePlugin(base);
  /**
   * H1 §6.1: `interruptedTurnClosers` is DSH's OWN recovery helper, exported by `@deepseek-ai/dsh-session`
   * and used by `readColdSessionLog` itself. Reusing it — rather than reimplementing the recovery state
   * machine — is what keeps this reader a supported derivation rather than a second implementation.
   */
  const { SessionId, interruptedTurnClosers } = await import(base + 'dsh-session/lib/index.js');

  const ctx = new Context();
  /**
   * §9: `ctx.plugin` returns the Cordis FIBER that owns the mounted service. Disposing the fiber is
   * the supported teardown — a bare Cordis `Context` has no `dispose` of its own, so retaining the
   * fiber is what makes `close()` real rather than decorative.
   */
  const fiber = await ctx.plugin(JsonlSessionPersistence, { root: sessionsRoot, compression: 'zstd' });
  const persistence = ctx.sessionPersistence;
  /**
   * H0 §8.1: the CONSUMER-VISIBLE source identity is a stable LOGICAL label. It names the adapter and
   * its evidence class and carries NO absolute local installation path, because this string travels
   * into a consumer-visible page. The resolved package root stays internal, in `diagnosticSourcePath`,
   * for operator diagnostics only.
   */
  const sourceIdentity = 'dsh-session-persistence-jsonl';
  const diagnosticSourcePath = packageRoot;

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
    /**
     * H0 §8.1: INTERNAL diagnostic information. Deliberately NOT part of the consumer-visible page:
     * a caller that needs the resolved installation path for operator diagnostics reads it here, and
     * no default consumer-visible field carries it.
     */
    diagnosticSourcePath,

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
        /**
         * H1 §6.1: ONE read produces the stored prefix AND the observed view. The returned `all`
         * array is `[...stored, ...closers]`, and the persisted/synthetic boundary is the stored
         * array's own length — a property of this ONE array, not of a later storage count.
         */
        const observed = await readStoredPrefix(persistence, request.sessionId, SessionId, interruptedTurnClosers);
        if (!observed.ok) throw observed.error;
        const { stored, closers } = observed;
        const all = [...stored, ...closers];
        const storedCount = stored.length;
        /**
         * H1 §6.1: every event at an index below the stored count came from storage; every event the
         * helper produced is synthetic. The classification is positional, so it can never be revised
         * by a later append: it is fixed by the shape of the array this read produced.
         */
        const durabilityOf = (index) => (index < storedCount ? 'PERSISTED_DSH_EVENT' : 'SYNTHETIC_RECOVERY_EVENT');
        const syntheticCount = closers.length;

        /**
         * §4: a CONTIGUOUS seq check. DSH documents its log as contiguous from 0, so a gap is a
         * real anomaly and is reported rather than silently paginated over.
         */
        for (let index = 0; index < all.length; index += 1) {
          if (all[index].seq !== index) {
            return Object.freeze({
              schemaVersion: 1, readState: 'EVENT_GAP', sessionId: request.sessionId,
              header: headerOf(observed.header, observed.inheritedEventCount), sourceIdentity, sourceEvidenceClass: 'REAL_DSH_QUERY',
              throughSeq: null, knownEventCount: all.length, inheritedEventCount: observed.inheritedEventCount,
              requestedFromSeq: fromSeq, requestedMaxEvents: maxEvents, returnedCount: 0,
              pageBounded: true, diskIoBounded: false,
              durabilityProvenance: 'DURABILITY_UNRESOLVED', persistedEventCount: null, syntheticRecoveryEventCount: null,
              events: Object.freeze([]), knownParentSession: null, proves: Object.freeze([]),
              doesNotProve: PAGE_DOES_NOT_PROVE,
              detail: `the session log has a sequence gap at index ${String(index)} (found seq ${String(all[index].seq)})`,
            });
          }
        }

        const boundaryDetail = `(${String(storedCount)} stored, ${String(syntheticCount)} synthetic recovery closer(s))`;
        const inheritedCount = observed.inheritedEventCount;
        const page = all.slice(fromSeq, fromSeq + maxEvents).map((event, offset) =>
          sanitizeEvent({
            sessionId: request.sessionId,
            event,
            inherited: event.seq < inheritedCount,
            durability: durabilityOf(fromSeq + offset),
          }),
        );
        return Object.freeze({
          schemaVersion: 1, readState: 'READ_OK', sessionId: request.sessionId,
          header: headerOf(observed.header, inheritedCount),
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
          /**
           * H1 §6.3: the boundary is ALWAYS separated now, because it is derived from the one read
           * that produced this page. There is no unresolved case for a successful read.
           */
          durabilityProvenance: 'PERSISTED_AND_SYNTHETIC_SEPARATED',
          persistedEventCount: storedCount,
          syntheticRecoveryEventCount: syntheticCount,
          events: Object.freeze(page),
          knownParentSession: typeof observed.header.parentSession === 'string' ? observed.header.parentSession : null,
          proves: PAGE_PROVES,
          doesNotProve: PAGE_DOES_NOT_PROVE,
          detail: `read ${String(page.length)} of ${String(all.length)} events from the session's own log ${boundaryDetail}`,
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
        /**
         * H1 §6.1: the header comes from the SAME official read-handle path as the events, so a
         * header is never paired with a body read from a different snapshot. Only the header is
         * returned; no event array is produced or classified here.
         */
        const observed = await readStoredPrefix(persistence, sessionId, SessionId, interruptedTurnClosers);
        if (!observed.ok) throw observed.error;
        return Object.freeze({
          readState: 'READ_OK',
          header: headerOf(observed.header, observed.inheritedEventCount),
          detail: 'the stored header was read and validated',
        });
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
  const JsonlSessionPersistence = await resolvePersistencePlugin(base);
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
