/** Request admission, outside the principal. Persist each request BEFORE any upstream byte.
 * Bounded Mock runs reserve tokens; explicit usage-only runs record pending requests without a token bound.
 * Unknown/incomplete usage keeps the request unresolved and closes the cohort.
 * SQLite serializes reservations across processes; the config is immutable and the DB is never
 * recreated on read failure. This ledger owns experiment spend only, never canonical product Work.
 */
import { DatabaseSync } from "node:sqlite";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, openSync, closeSync } from "node:fs";

export class BudgetRefusal extends Error {
  constructor(code, detail = code) { super(detail); this.code = code; }
}
const refuse = (code, detail) => { throw new BudgetRefusal(code, detail); };
export function tokens(value, name, allowZero = true) {
  if (!Number.isSafeInteger(value) || value < (allowZero ? 0 : 1)) refuse("INVALID_BUDGET", `${name} must be a safe non-negative integer`);
  return value;
}
export const USAGE_ONLY_SCHEMA = "pnwf-request-metering/v1";
export const USAGE_FIELDS = ["input_tokens", "cache_read_input_tokens", "cache_creation_input_tokens", "output_tokens"];
export function usageBreakdown(usage) {
  if (!usage || !Object.hasOwn(usage, "input_tokens") || !Object.hasOwn(usage, "output_tokens")) refuse("UNOBSERVABLE_USAGE");
  return Object.fromEntries(USAGE_FIELDS.map(key => [key, tokens(Object.hasOwn(usage, key) ? usage[key] : 0, key)]));
}
export function usageTotal(parts) {
  return tokens(USAGE_FIELDS.reduce((sum, key) => sum + parts[key], 0), "total usage");
}
function configuration(value) {
  const metered = value?.schema === USAGE_ONLY_SCHEMA;
  if ((!metered && value?.schema !== "pnwf-request-budget/v1") || !/^[\w.-]+$/u.test(value.cohortId ?? "")) refuse("INVALID_BUDGET");
  if (!Array.isArray(value.sessions) || !value.sessions.length) refuse("INVALID_BUDGET");
  const sessions = value.sessions.map(s => {
    if (!/^[\w.-]+$/u.test(s.id ?? "")) refuse("INVALID_BUDGET");
    if (metered) {
      if (s.ceiling !== null || s.softCeiling !== null) refuse("INVALID_BUDGET");
      return { id: s.id, ceiling: null, softCeiling: null, maxRequests: tokens(s.maxRequests, "session requests", false) };
    }
    const ceiling = tokens(s.ceiling, "session ceiling", false);
    const softCeiling = tokens(s.softCeiling, "soft ceiling", false);
    if (softCeiling > ceiling) refuse("INVALID_BUDGET");
    return { id: s.id, ceiling, softCeiling };
  });
  if (new Set(sessions.map(s => s.id)).size !== sessions.length) refuse("INVALID_BUDGET");
  if (metered && value.aggregateCeiling !== null) refuse("INVALID_BUDGET");
  return { schema: value.schema, cohortId: value.cohortId, aggregateCeiling: metered ? null : tokens(value.aggregateCeiling, "aggregate ceiling", false), sessions };
}

export class ExecutionBudget {
  static initialize(path, config) {
    const parsed = configuration(config);
    // Exclusive creation: a missing or damaged old ledger can never silently become a fresh budget.
    closeSync(openSync(path, "wx", 0o600));
    const db = new DatabaseSync(path);
    try {
      db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; BEGIN IMMEDIATE");
      db.exec(`CREATE TABLE config (json TEXT NOT NULL, state TEXT NOT NULL, reason TEXT);
        CREATE TABLE sessions (id TEXT PRIMARY KEY, ordinal INTEGER NOT NULL, state TEXT NOT NULL);
        CREATE TABLE refusals (observation TEXT NOT NULL);
        CREATE TABLE requests (id TEXT PRIMARY KEY, session TEXT NOT NULL REFERENCES sessions(id),
          digest TEXT NOT NULL, reserved INTEGER${parsed.schema === USAGE_ONLY_SCHEMA ? "" : " NOT NULL"},
          actual INTEGER, state TEXT NOT NULL, reason TEXT${parsed.schema === USAGE_ONLY_SCHEMA ? ", usage TEXT" : ""});`);
      db.prepare("INSERT INTO config VALUES (?, 'OPEN', NULL)").run(JSON.stringify(parsed));
      parsed.sessions.forEach((s, i) => db.prepare("INSERT INTO sessions VALUES (?, ?, 'NOT_STARTED')").run(s.id, i));
      db.exec("COMMIT");
    } finally { db.close(); }
    return new ExecutionBudget(path);
  }

  constructor(path) {
    if (!existsSync(path)) refuse("UNOBSERVABLE_USAGE", "the spend ledger is missing; initialize only a genuinely new cohort");
    try {
      this.db = new DatabaseSync(path);
      this.db.exec("PRAGMA busy_timeout=5000; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON");
      const rows = this.db.prepare("SELECT * FROM config").all();
      if (rows.length !== 1) throw new Error("invalid config");
      this.config = configuration(JSON.parse(rows[0].json));
      this.digest = createHash("sha256").update(rows[0].json).digest("hex");
      this.snapshot();
    } catch (error) {
      this.db?.close();
      refuse("UNOBSERVABLE_USAGE", `the spend ledger is unreadable: ${error.message}`);
    }
  }
  close() { this.db.close(); }
  get usageOnly() { return this.config.schema === USAGE_ONLY_SCHEMA; }
  get pendingState() { return this.usageOnly ? "PENDING" : "RESERVED"; }
  transaction(fn) {
    this.db.exec("BEGIN IMMEDIATE");
    try { const result = fn(); this.db.exec("COMMIT"); return result; }
    catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }
  snapshot() {
    const configurations = this.db.prepare("SELECT * FROM config").all();
    const persisted = configurations[0];
    if (configurations.length !== 1 || createHash("sha256").update(persisted.json).digest("hex") !== this.digest || !["OPEN", "STOPPED"].includes(persisted.state)) refuse("UNOBSERVABLE_USAGE");
    const config = { state: persisted.state, reason: persisted.reason };
    const requests = this.db.prepare("SELECT * FROM requests ORDER BY rowid").all();
    const sessionRows = this.db.prepare("SELECT * FROM sessions ORDER BY ordinal").all();
    if (sessionRows.length !== this.config.sessions.length || sessionRows.some((s, i) => s.id !== this.config.sessions[i].id || s.ordinal !== i || !["NOT_STARTED", "RUNNING", "ENDED", "STOPPED"].includes(s.state))) refuse("UNOBSERVABLE_USAGE");
    const sessions = sessionRows.map(s => {
      const rows = requests.filter(r => r.session === s.id);
      const unresolved = rows.filter(r => r.state === this.pendingState || r.state === "UNKNOWN");
      return { ...s, ...this.config.sessions.find(c => c.id === s.id),
        requestCount: rows.length, unresolvedRequests: unresolved.length,
        confirmed: rows.reduce((n, r) => n + (r.actual ?? 0), 0),
        reserved: this.usageOnly ? null : unresolved.reduce((n, r) => n + r.reserved, 0) };
    });
    for (const r of requests) {
      if (this.usageOnly) {
        if (r.reserved !== null || r.state === "VIOLATION" || (r.actual === null) !== (r.usage === null)) refuse("UNOBSERVABLE_USAGE");
        if (r.usage !== null) {
          r.usage = usageBreakdown(JSON.parse(r.usage));
          if (usageTotal(r.usage) !== r.actual) refuse("UNOBSERVABLE_USAGE");
        }
      } else tokens(r.reserved, "persisted reservation", false);
      if (r.actual !== null) tokens(r.actual, "persisted usage");
      if (![this.pendingState, "SETTLED", "UNKNOWN", "VIOLATION"].includes(r.state)) refuse("UNOBSERVABLE_USAGE");
      if ((r.state === "SETTLED" || r.state === "VIOLATION") !== (r.actual !== null)) refuse("UNOBSERVABLE_USAGE");
      if (!this.config.sessions.some(s => s.id === r.session)) refuse("UNOBSERVABLE_USAGE");
    }
    for (const s of sessions) {
      tokens(s.confirmed, "confirmed total");
      if (!this.usageOnly) tokens(s.reserved, "reservation total");
      if (s.state === "NOT_STARTED" && requests.some(r => r.session === s.id)) refuse("UNOBSERVABLE_USAGE");
      if (s.state === "ENDED" && s.unresolvedRequests !== 0) refuse("UNOBSERVABLE_USAGE");
    }
    return { schema: this.usageOnly ? "pnwf-usage-snapshot/v1" : "pnwf-spend-snapshot/v1", cohortId: this.config.cohortId, configDigest: this.digest, ...config,
      confirmed: tokens(sessions.reduce((n, s) => n + s.confirmed, 0), "confirmed cohort usage"),
      reserved: this.usageOnly ? null : sessions.reduce((n, s) => n + s.reserved, 0),
      unresolvedRequests: sessions.reduce((n, s) => n + s.unresolvedRequests, 0),
      aggregateCeiling: this.config.aggregateCeiling, sessions, requests,
      refusals: this.db.prepare("SELECT observation FROM refusals ORDER BY rowid").all().map(row => JSON.parse(row.observation)) };
  }
  startSession(id) {
    this.transaction(() => {
      const snapshot = this.snapshot();
      const session = snapshot.sessions.find(s => s.id === id);
      if (snapshot.state !== "OPEN") refuse("COHORT_STOPPED");
      if (!session || session.state !== "NOT_STARTED") refuse("SESSION_ALREADY_STARTED");
      if (snapshot.sessions.some(s => s.ordinal < session.ordinal && s.state !== "ENDED")) refuse("PRIOR_SESSION_UNRESOLVED");
      if (snapshot.unresolvedRequests !== 0) refuse("UNOBSERVABLE_USAGE");
      this.db.prepare("UPDATE sessions SET state='RUNNING' WHERE id=?").run(id);
    });
  }
  stop(reason) {
    this.transaction(() => this.db.prepare("UPDATE config SET state='STOPPED', reason=COALESCE(reason, ?)").run(reason));
  }
  endSession(id, successful) {
    this.transaction(() => {
      const snapshot = this.snapshot();
      const s = snapshot.sessions.find(s => s.id === id);
      if (!s || s.state !== "RUNNING") refuse("SESSION_NOT_RUNNING");
      const ended = successful && s.unresolvedRequests === 0 && snapshot.state === "OPEN";
      this.db.prepare("UPDATE sessions SET state=? WHERE id=?").run(ended ? "ENDED" : "STOPPED", id);
      if (!ended) this.db.prepare("UPDATE config SET state='STOPPED', reason=COALESCE(reason, 'SESSION_FAILED')").run();
    });
  }
  reserve(sessionId, bound, digest) {
    if (this.usageOnly) {
      if (bound !== null) refuse("UNEXPECTED_TOKEN_BOUND");
    } else tokens(bound, "request bound", false);
    const result = this.transaction(() => {
      const state = this.snapshot();
      const session = state.sessions.find(s => s.id === sessionId);
      if (state.state !== "OPEN") refuse("COHORT_STOPPED");
      if (!session || session.state !== "RUNNING") refuse("SESSION_NOT_RUNNING");
      if (this.usageOnly && session.requestCount >= session.maxRequests) {
        this.db.prepare("INSERT INTO refusals VALUES (?)").run(JSON.stringify({ sessionId, requestCount: session.requestCount, maxRequests: session.maxRequests, reason: "REQUEST_LIMIT" }));
        this.db.prepare("UPDATE config SET state='STOPPED', reason='REQUEST_LIMIT'").run();
        return null;
      }
      if (!this.usageOnly && (state.confirmed + state.reserved + bound > state.aggregateCeiling || session.confirmed + session.reserved + bound > session.softCeiling)) {
        this.db.prepare("INSERT INTO refusals VALUES (?)").run(JSON.stringify({ sessionId, bound,
          cohortConfirmed: state.confirmed, cohortReserved: state.reserved, aggregateCeiling: state.aggregateCeiling,
          sessionConfirmed: session.confirmed, sessionReserved: session.reserved, softCeiling: session.softCeiling }));
        this.db.prepare("UPDATE config SET state='STOPPED', reason='BUDGET_EXHAUSTED'").run();
        return null;
      }
      const id = randomUUID();
      this.db.prepare("INSERT INTO requests (id, session, digest, reserved, state) VALUES (?, ?, ?, ?, ?)").run(id, sessionId, digest, bound, this.pendingState);
      return id;
    });
    if (result === null) refuse(this.usageOnly ? "REQUEST_LIMIT" : "BUDGET_EXHAUSTED");
    return result;
  }
  settle(id, actual, usage) {
    tokens(actual, "final usage");
    const valid = this.transaction(() => {
      const row = this.db.prepare("SELECT * FROM requests WHERE id=?").get(id);
      if (!row || row.state !== this.pendingState) refuse("RESERVATION_NOT_OPEN");
      if (this.usageOnly) {
        const parts = usageBreakdown(usage);
        if (usageTotal(parts) !== actual) refuse("UNOBSERVABLE_USAGE");
        this.db.prepare("UPDATE requests SET actual=?, state='SETTLED', usage=? WHERE id=?").run(actual, JSON.stringify(parts), id);
        return true;
      }
      const valid = actual <= row.reserved;
      this.db.prepare("UPDATE requests SET actual=?, state=? WHERE id=?").run(actual, valid ? "SETTLED" : "VIOLATION", id);
      if (!valid) this.db.prepare("UPDATE config SET state='STOPPED', reason='PROVIDER_BOUND_VIOLATION'").run();
      return valid;
    });
    if (!valid) refuse("PROVIDER_BOUND_VIOLATION");
  }
  unknown(id, reason) {
    this.transaction(() => {
      this.db.prepare("UPDATE requests SET state='UNKNOWN', reason=? WHERE id=? AND state=?").run(reason, id, this.pendingState);
      this.db.prepare("UPDATE config SET state='STOPPED', reason=COALESCE(reason, ?)").run(reason);
    });
  }
}
