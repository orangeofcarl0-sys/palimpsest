/**
 * G10-T Proof/Evidence plane — the ONE canonical append-only proof history.
 *
 *   Source ≠ Evidence   Evidence ≠ Claim   Claim ≠ Truth
 *   Verification ≠ PublicationAdmission   PublishedClaim ≠ Authority
 *
 * A single global chain (`scopeId = "proof"`) records proof-plane facts. Its
 * FIRST event MUST be the definition `PROOF_PLANE_OPENED` with payload
 * `{ planeId: "proof" }`. Every append is CAS-guarded against
 * `{scopeId, throughSeq, chainDigest}`, is content-addressed by eventId, and is
 * replay-idempotent. The store owns persistence/ordering/idempotency ONLY; the
 * artifact shapes live in the sibling modules.
 *
 * The store imports NO Organization/RuntimeScope/Boundary/Commitment/effect
 * authority and exposes no mutator for them.
 */

import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { canonicalDigest } from "../schema/canonical.js";
import {
  parseClaimAssessmentRevision,
  parseProofClaimCandidate,
  parseProofDependencyRecord,
  parseProofPublicationDecisionRecord,
  parseProofVerificationResult,
  parsePublishedProofClaim,
} from "./claims.js";
import { parseDisclosureExportReceipt, parseDisclosurePreview } from "./disclosure.js";
import { parseEvidenceItem } from "./evidence.js";
import { parseProofSourceRevision } from "./sources.js";
import {
  proofFail,
  proofKeys,
  proofObject,
  proofSingleKeyParser,
} from "./refs.js";

export const PROOF_SCOPE_ID = "proof";
export const PROOF_CHAIN_DOMAIN = "palimpsest.proof.event.v1";
export const PROOF_EVENT_ID_DOMAIN = "palimpsest.proof-event.v1";

export type ProofEventType =
  | "PROOF_PLANE_OPENED"
  | "SOURCE_REVISION_RECORDED"
  | "EVIDENCE_RECORDED"
  | "CANDIDATE_RECORDED"
  | "VERIFICATION_RECORDED"
  | "PUBLICATION_DECIDED"
  | "CLAIM_PUBLISHED"
  | "ASSESSMENT_RECORDED"
  | "DEPENDENCY_RECORDED"
  | "DISCLOSURE_PREPARED"
  | "DISCLOSURE_RECEIPT_RECORDED";

export type ProofStoreErrorKind =
  | "event_conflict"
  | "recovery_required"
  | "basis_mismatch"
  | "malformed_record"
  | "invalid_registration"
  | "database_busy";

export class ProofStoreError extends Error {
  constructor(
    readonly kind: ProofStoreErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "ProofStoreError";
  }
}

function storeFail(kind: ProofStoreErrorKind, message: string): never {
  throw new ProofStoreError(kind, message);
}

export interface ProofPlaneOpenedPayload {
  readonly planeId: "proof";
}

/** The canonical definition payload; the planeId is not caller-choosable. */
export function proofPlaneOpenedPayload(): ProofPlaneOpenedPayload {
  return Object.freeze({ planeId: "proof" as const });
}

export function parseProofPlaneOpened(raw: unknown, what = "PROOF_PLANE_OPENED"): ProofPlaneOpenedPayload {
  const object = proofObject(raw, what);
  proofKeys(object, ["planeId"], ["planeId"], what);
  if (object.planeId !== "proof") proofFail("invalid_value", `${what}.planeId must be "proof"`);
  return proofPlaneOpenedPayload();
}

export interface ProofEventDraft {
  readonly eventId: string;
  readonly type: ProofEventType;
  readonly payload: unknown;
}

export interface ProofEvent<T extends ProofEventType = ProofEventType> {
  readonly eventId: string;
  readonly seq: number;
  readonly scopeId: string;
  readonly type: T;
  readonly payload: unknown;
  readonly chainDigest: string;
}

/** The full append-only proof history basis — the CAS guard for `appendAtomic`. */
export interface ProofBasis {
  readonly scopeId: string;
  readonly throughSeq: number;
  readonly chainDigest: string;
}

export type ProofEventPayloadParser = (payload: unknown) => unknown;
export type ProofEventParsers = Readonly<Record<string, ProofEventPayloadParser>>;

export const PROOF_EVENT_PARSERS: ProofEventParsers = Object.freeze({
  PROOF_PLANE_OPENED: proofSingleKeyParser("planeId", (raw: unknown) => {
    if (raw !== "proof") proofFail("invalid_value", 'PROOF_PLANE_OPENED planeId must be "proof"');
    return "proof";
  }),
  SOURCE_REVISION_RECORDED: proofSingleKeyParser("revision", parseProofSourceRevision),
  EVIDENCE_RECORDED: proofSingleKeyParser("evidence", parseEvidenceItem),
  CANDIDATE_RECORDED: proofSingleKeyParser("candidate", parseProofClaimCandidate),
  VERIFICATION_RECORDED: proofSingleKeyParser("verification", parseProofVerificationResult),
  PUBLICATION_DECIDED: proofSingleKeyParser("publication", parseProofPublicationDecisionRecord),
  CLAIM_PUBLISHED: proofSingleKeyParser("claim", parsePublishedProofClaim),
  ASSESSMENT_RECORDED: proofSingleKeyParser("assessment", parseClaimAssessmentRevision),
  DEPENDENCY_RECORDED: proofSingleKeyParser("dependency", parseProofDependencyRecord),
  DISCLOSURE_PREPARED: proofSingleKeyParser("preview", parseDisclosurePreview),
  DISCLOSURE_RECEIPT_RECORDED: proofSingleKeyParser("receipt", parseDisclosureExportReceipt),
});

export function proofChainDigest(input: {
  readonly scopeId: string;
  readonly seq: number;
  readonly eventId: string;
  readonly type: string;
  readonly payload: unknown;
  readonly previousChainDigest: string | null;
}): string {
  return canonicalDigest({
    domain: PROOF_CHAIN_DOMAIN,
    scopeId: input.scopeId,
    seq: input.seq,
    eventId: input.eventId,
    type: input.type,
    payload: input.payload,
    previous: input.previousChainDigest,
  });
}

/** Deterministic content-addressed event id — replays are naturally idempotent. */
export function proofEventIdOf(type: ProofEventType, scopeId: string, payload: unknown): string {
  return `pev-${canonicalDigest({ domain: PROOF_EVENT_ID_DOMAIN, type, scopeId, payload }).slice(0, 32)}`;
}

export interface ProofEvidenceStore {
  appendAtomic(input: {
    readonly expectedBasis: ProofBasis;
    readonly events: readonly ProofEventDraft[];
  }): Promise<readonly ProofEvent[]>;
  basis(): Promise<ProofBasis | undefined>;
  replay(): Promise<readonly ProofEvent[]>;
  close(): void;
}

type Statement = ReturnType<DatabaseSync["prepare"]>;

interface EventRow {
  scope_id: string;
  seq: number;
  event_id: string;
  type: string;
  payload_json: string;
  chain_digest: string;
}

interface PreparedEntry {
  readonly eventId: string;
  readonly type: ProofEventType;
  readonly payload: unknown;
}

function isBusyError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /SQLITE_BUSY|SQLITE_LOCKED|database is locked|database table is locked/i.test(message);
}

function payloadKey(type: string, payload: unknown): string {
  return canonicalDigest({ domain: PROOF_EVENT_ID_DOMAIN, type, payload });
}

export class SqliteProofEvidenceStore implements ProofEvidenceStore {
  readonly #database: DatabaseSync;
  readonly #selectEvents: Statement;
  readonly #insertEvent: Statement;
  readonly #parsers: ProofEventParsers;

  constructor(databasePath: string, options?: { readonly busyTimeoutMs?: number }) {
    if (databasePath !== ":memory:") mkdirSync(dirname(databasePath), { recursive: true });
    this.#database = new DatabaseSync(databasePath === ":memory:" ? ":memory:" : join(databasePath));
    this.#database.exec(`PRAGMA busy_timeout = ${options?.busyTimeoutMs ?? 5000}`);
    this.#database.exec(
      "CREATE TABLE IF NOT EXISTS proof_events (" +
        "scope_id TEXT NOT NULL, seq INTEGER NOT NULL, event_id TEXT NOT NULL UNIQUE, type TEXT NOT NULL, " +
        "payload_json TEXT NOT NULL, chain_digest TEXT NOT NULL, PRIMARY KEY (scope_id, seq))",
    );
    this.#selectEvents = this.#database.prepare(
      "SELECT scope_id, seq, event_id, type, payload_json, chain_digest FROM proof_events WHERE scope_id = ? ORDER BY seq",
    );
    this.#insertEvent = this.#database.prepare(
      "INSERT INTO proof_events (scope_id, seq, event_id, type, payload_json, chain_digest) VALUES (?, ?, ?, ?, ?, ?)",
    );
    this.#parsers = PROOF_EVENT_PARSERS;
  }

  #parse(row: EventRow, previous: ProofEvent | undefined): ProofEvent {
    const parser = this.#parsers[row.type];
    if (parser === undefined) storeFail("malformed_record", `proof event "${row.event_id}" has unknown type "${row.type}"`);
    let payload: unknown;
    try {
      payload = parser(JSON.parse(row.payload_json));
    } catch (error) {
      storeFail("malformed_record", `proof event "${row.event_id}" payload is malformed: ${error instanceof Error ? error.message : String(error)}`);
    }
    const expected = proofChainDigest({
      scopeId: row.scope_id,
      seq: row.seq,
      eventId: row.event_id,
      type: row.type,
      payload,
      previousChainDigest: previous?.chainDigest ?? null,
    });
    if (expected !== row.chain_digest) {
      storeFail("malformed_record", `proof chain is corrupt at seq ${row.seq}`);
    }
    return Object.freeze({ eventId: row.event_id, seq: row.seq, scopeId: row.scope_id, type: row.type as ProofEventType, payload, chainDigest: row.chain_digest });
  }

  #readAll(scopeId: string): ProofEvent[] {
    const rows = this.#selectEvents.all(scopeId) as unknown as EventRow[];
    const events: ProofEvent[] = [];
    let previous: ProofEvent | undefined;
    let expectedSeq = 1;
    for (const row of rows) {
      if (row.seq !== expectedSeq) storeFail("malformed_record", `proof chain has a sequence gap at ${row.seq}`);
      const event = this.#parse(row, previous);
      events.push(event);
      previous = event;
      expectedSeq += 1;
    }
    return events;
  }

  #classify(error: unknown): never {
    if (error instanceof ProofStoreError) throw error;
    if (isBusyError(error)) {
      throw new ProofStoreError("database_busy", `proof store write contention (bounded wait exhausted): ${error instanceof Error ? error.message : String(error)}`);
    }
    throw new ProofStoreError("invalid_registration", `proof store write failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  #transactional<T>(work: () => T): T {
    try {
      this.#database.exec("BEGIN IMMEDIATE");
      const result = work();
      this.#database.exec("COMMIT");
      return result;
    } catch (error) {
      try {
        this.#database.exec("ROLLBACK");
      } catch {
        // no active transaction
      }
      this.#classify(error);
    }
  }

  async appendAtomic(input: {
    readonly expectedBasis: ProofBasis;
    readonly events: readonly ProofEventDraft[];
  }): Promise<readonly ProofEvent[]> {
    const scopeId = input.expectedBasis.scopeId;
    if (scopeId !== PROOF_SCOPE_ID) storeFail("invalid_registration", `the proof plane is the single scope "${PROOF_SCOPE_ID}"`);
    if (input.events.length === 0) storeFail("invalid_registration", "appendAtomic requires at least one event");
    const prepared: PreparedEntry[] = input.events.map((event) => {
      const parser = this.#parsers[event.type];
      if (parser === undefined) storeFail("invalid_registration", `unknown proof event type "${event.type}"`);
      let payload: unknown;
      try {
        payload = parser(event.payload);
      } catch (error) {
        storeFail("invalid_registration", `proof event "${event.eventId}" payload is invalid: ${error instanceof Error ? error.message : String(error)}`);
      }
      return { eventId: event.eventId, type: event.type, payload };
    });
    const seen = new Set<string>();
    for (const entry of prepared) {
      if (seen.has(entry.eventId)) storeFail("event_conflict", `duplicate eventId "${entry.eventId}"`);
      seen.add(entry.eventId);
    }
    return this.#transactional(() => {
      const stored = this.#readAll(scopeId);
      const byId = new Map(stored.map((event) => [event.eventId, event]));
      let present = 0;
      let conflicting = false;
      for (const entry of prepared) {
        const row = byId.get(entry.eventId);
        if (row === undefined) continue;
        present += 1;
        if (row.type !== entry.type || payloadKey(row.type, row.payload) !== payloadKey(entry.type, entry.payload)) conflicting = true;
      }
      if (conflicting) storeFail("event_conflict", "a requested eventId already exists with different content");
      if (present === prepared.length) return Object.freeze(prepared.map((entry) => byId.get(entry.eventId)!));
      if (present > 0) storeFail("recovery_required", "proof atomic batch is partially present");
      const tail = stored[stored.length - 1];
      if ((tail?.seq ?? 0) !== input.expectedBasis.throughSeq || (tail?.chainDigest ?? "") !== input.expectedBasis.chainDigest) {
        storeFail("basis_mismatch", `proof basis is seq ${tail?.seq ?? 0}, expected ${input.expectedBasis.throughSeq}`);
      }

      // Registration: the plane definition must be the FIRST event of the empty chain.
      const first = prepared[0]!;
      let startIndex = 0;
      if (stored.length === 0) {
        if (first.type !== "PROOF_PLANE_OPENED") storeFail("invalid_registration", 'the proof plane must be opened by a PROOF_PLANE_OPENED definition event');
        startIndex = 1;
      } else if (first.type === "PROOF_PLANE_OPENED") {
        storeFail("invalid_registration", "PROOF_PLANE_OPENED may only be the first event of the empty proof chain");
      }
      for (let index = startIndex; index < prepared.length; index += 1) {
        if (prepared[index]!.type === "PROOF_PLANE_OPENED") {
          storeFail("invalid_registration", "PROOF_PLANE_OPENED may only be the first event of the empty proof chain");
        }
      }

      // Revision immutability: (sourceId, revision) is binding. Re-recording the
      // same content is idempotent (same eventId, handled above); different content
      // for an already-recorded (sourceId, revision) fails closed. A newer revision
      // never deletes older ones.
      const revisionContentByKey = new Map<string, string>();
      for (const event of stored) {
        if (event.type !== "SOURCE_REVISION_RECORDED") continue;
        const revision = (event.payload as { readonly revision: { readonly sourceId: string; readonly revision: number; readonly contentDigest: string } }).revision;
        revisionContentByKey.set(`${revision.sourceId}\u0000${revision.revision}`, revision.contentDigest);
      }
      for (const entry of prepared) {
        if (entry.type !== "SOURCE_REVISION_RECORDED") continue;
        const revision = (entry.payload as { readonly revision: { readonly sourceId: string; readonly revision: number; readonly contentDigest: string } }).revision;
        const existing = revisionContentByKey.get(`${revision.sourceId}\u0000${revision.revision}`);
        if (existing !== undefined && existing !== revision.contentDigest) {
          storeFail("event_conflict", `source revision "${revision.sourceId}@${revision.revision}" is immutable and already recorded with different content`);
        }
      }

      const appended: ProofEvent[] = [];
      let seq = input.expectedBasis.throughSeq;
      let previous = tail?.chainDigest ?? null;
      for (const entry of prepared) {
        seq += 1;
        const chainDigest = proofChainDigest({ scopeId, seq, eventId: entry.eventId, type: entry.type, payload: entry.payload, previousChainDigest: previous });
        this.#insertEvent.run(scopeId, seq, entry.eventId, entry.type, JSON.stringify(entry.payload), chainDigest);
        previous = chainDigest;
        appended.push(Object.freeze({ eventId: entry.eventId, seq, scopeId, type: entry.type, payload: entry.payload, chainDigest }));
      }
      return Object.freeze(appended);
    });
  }

  async basis(): Promise<ProofBasis | undefined> {
    const events = this.#readAll(PROOF_SCOPE_ID);
    const tail = events[events.length - 1];
    if (tail === undefined) return undefined;
    return Object.freeze({ scopeId: PROOF_SCOPE_ID, throughSeq: tail.seq, chainDigest: tail.chainDigest });
  }

  async replay(): Promise<readonly ProofEvent[]> {
    return Object.freeze(this.#readAll(PROOF_SCOPE_ID));
  }

  close(): void {
    this.#database.close();
  }
}

/** The canonical default proof store path: $DSH_HOME/palimpsest/proof-vault/proof.sqlite. */
export function defaultProofStorePath(): string {
  const configured = process.env.DSH_HOME?.trim();
  const dshHome = configured === undefined || configured.length === 0 ? join(homedir(), ".dsh") : configured;
  return join(dshHome, "palimpsest", "proof-vault", "proof.sqlite");
}
