/**
 * PLMP-LEAN-1 §D3-R1 — the OBSERVATION AUTHORITY: where a premise's authority actually comes from.
 *
 * D3-c established `proof generation ≠ proof validation` and made the ISSUER the authority for an
 * assessment. An audit of that slice found the other half missing, and the gap was real:
 *
 *     observedPremise({ provenance: { observerId: "git-source-change-observer", mechanism: "RUNTIME_OBSERVED" }, selectors: [] })
 *
 * A caller could produce that — I verified it by doing it — and hand it to `issuer.issue({ premises })`. So
 * the issuer could prove "I issued this assessment" but NOT "this premise is what that observer produced".
 * The comment claiming the type prevented forgery was stronger than the code.
 *
 * THE FIX IS A RECORD, NOT A FLAG. A premise's authority comes from being a DURABLE RECORD written through
 * a registration the composition performed:
 *
 *     real observer  →  ObservationAuthorityStore  →  observationRef
 *     issuer         →  recalls the record by ref   →  CompatibilityIssuance
 *
 * so `issue()` consumes REFS and reads the records itself, and there is no parameter through which a
 * caller-supplied premise object can enter.
 *
 * WHAT THIS GUARANTEES, AND WHAT IT DOES NOT — stated precisely, because the previous version of this
 * claim was too strong:
 *
 *   GUARANTEED   every positive premise an issuance rests on is a durable record, written through a
 *                registered observer identity, and the issuer never accepts a premise object;
 *   GUARANTEED   `UNAVAILABLE` records stay freely constructible, because they can never grant positive
 *                authority — they only ever contribute obstacles;
 *   NOT CLAIMED  protection against in-process code that deliberately registers a FRAUDULENT observer
 *                identity. That needs an OS/process boundary between the observer and its consumer, which
 *                is a deployment property this plane cannot create for itself. What the plane does is make
 *                the forgery a deliberate, auditable act against a named registration rather than an
 *                incidental object literal.
 *
 * `registerObserver` is deliberately NOT re-exported from the capability barrel: the composition wires
 * observers at deployment time, and a module that wants to observe must be given a recorder rather than
 * reaching for the registration API.
 *
 * Layer: L2 (`src/project_world/`). Not re-exported from the domain barrel.
 */
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

import { canonicalDigest } from "../schema/canonical.js";
import { canonicallyOrderedSelectors, type ResourceSelector } from "../domain/world_basis.js";
import { covered, provenComplete, type CoverageEvidence, type CoveredFootprint } from "./footprint.js";
import type { ObservationDomain, ObservationProvenance, ObservationScope } from "./observation.js";

const OBSERVATION_RECORD_DOMAIN = "palimpsest.observation-record.v1";

/** One durable observation: what an observer produced, over which scope, by which mechanism. */
export interface RecordedObservation {
  readonly observationRef: string;
  readonly domain: ObservationDomain;
  readonly state: "OBSERVED" | "UNAVAILABLE";
  /** Present only for `OBSERVED`: who observed, by what mechanism, over what scope. */
  readonly provenance: ObservationProvenance | null;
  readonly selectors: readonly ResourceSelector[];
  /** Present only for `OBSERVED`. */
  readonly footprint: CoveredFootprint | null;
  readonly detail: string | null;
  readonly digest: string;
  readonly recordedAt: string;
}

/**
 * What an observer writes through. It carries the observer's OWN identity, so a record cannot be written
 * without naming who wrote it — and the identity is fixed at registration rather than supplied per call.
 */
export interface ObservationRecorder {
  readonly observerId: string;
  readonly observerVersion: string;
  readonly mechanism: CoverageEvidence;
  /** Record what this observer SAW over one scope. Returns the ref an issuance cites. */
  record(input: {
    readonly scope: ObservationScope;
    readonly selectors: readonly ResourceSelector[];
  }): string;
  /** Record that this observer could NOT establish a facet. Never grants positive authority. */
  unavailable(input: { readonly domain: ObservationDomain; readonly detail: string }): string;
}

export interface ObservationAuthority {
  readonly adapterId: string;
  /**
   * Register an observer. Called by the COMPOSITION at wiring time — deliberately not part of the
   * capability barrel, so a module must be handed a recorder rather than reaching for registration.
   */
  registerObserver(input: {
    readonly observerId: string;
    readonly observerVersion: string;
    readonly mechanism: CoverageEvidence;
  }): ObservationRecorder;
  /** Recall a record by ref. `null` for a ref this authority never wrote. */
  recall(observationRef: string): RecordedObservation | null;
  close(): void;
}

function observationRefOf(body: {
  readonly provenance: ObservationProvenance;
  readonly selectors: readonly ResourceSelector[];
}): { readonly ref: string; readonly digest: string } {
  const digest = canonicalDigest({
    domain: OBSERVATION_RECORD_DOMAIN,
    provenance: body.provenance,
    selectors: canonicallyOrderedSelectors(body.selectors),
  });
  return { ref: `obs-${digest.slice(0, 32)}`, digest };
}

export function makeObservationAuthority(input: {
  readonly databasePath: string;
  readonly clock?: (() => string) | undefined;
}): ObservationAuthority {
  const now = (): string => (input.clock ?? (() => new Date().toISOString()))();
  if (input.databasePath !== ":memory:") mkdirSync(dirname(input.databasePath), { recursive: true });
  const database = new DatabaseSync(input.databasePath === ":memory:" ? ":memory:" : join(input.databasePath));
  database.exec(
    "CREATE TABLE IF NOT EXISTS observation_record (" +
      "observation_ref TEXT NOT NULL, " +
      "domain TEXT NOT NULL, " +
      "state TEXT NOT NULL, " +
      "observer_id TEXT NOT NULL, " +
      "mechanism TEXT NOT NULL, " +
      "record_json BLOB NOT NULL, " +
      "recorded_at TEXT NOT NULL, " +
      // APPEND-ONCE: one ref names one observation, and a replay writes the same ref with the same bytes.
      "PRIMARY KEY (observation_ref))",
  );
  const read = database.prepare("SELECT record_json FROM observation_record WHERE observation_ref = ?");
  const insert = database.prepare(
    "INSERT INTO observation_record (observation_ref, domain, state, observer_id, mechanism, record_json, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  );

  const append = (record: RecordedObservation): string => {
    try {
      insert.run(
        record.observationRef,
        record.domain,
        record.state,
        record.provenance?.observerId ?? "(none)",
        record.provenance?.mechanism ?? "(none)",
        new TextEncoder().encode(JSON.stringify(record)),
        record.recordedAt,
      );
    } catch {
      // A replay of the same observation is not an error: the ref IS its identity, so the first record stands.
      if (recall(record.observationRef) === null) throw new Error(`observation ${record.observationRef} could not be recorded`);
    }
    return record.observationRef;
  };

  function recall(observationRef: string): RecordedObservation | null {
    const row = read.get(observationRef) as unknown as { record_json: Uint8Array } | undefined;
    if (row === undefined) return null;
    return JSON.parse(new TextDecoder().decode(row.record_json)) as RecordedObservation;
  }

  return Object.freeze({
    adapterId: "first-party-observation-authority",

    registerObserver(registration: {
      readonly observerId: string;
      readonly observerVersion: string;
      readonly mechanism: CoverageEvidence;
    }): ObservationRecorder {
      return Object.freeze({
        observerId: registration.observerId,
        observerVersion: registration.observerVersion,
        mechanism: registration.mechanism,

        record(recordInput: { readonly scope: ObservationScope; readonly selectors: readonly ResourceSelector[] }): string {
          const provenance: ObservationProvenance = Object.freeze({
            observerId: registration.observerId,
            observerVersion: registration.observerVersion,
            mechanism: registration.mechanism,
            scope: Object.freeze({ ...recordInput.scope }),
          });
          const selectors = canonicallyOrderedSelectors(recordInput.selectors);
          const { ref, digest } = observationRefOf({ provenance, selectors });
          return append(
            Object.freeze({
              observationRef: ref,
              domain: provenance.scope.domain,
              state: "OBSERVED" as const,
              provenance,
              selectors,
              footprint: covered({
                selectors,
                coverage: provenComplete(
                  registration.mechanism,
                  `observed by ${registration.observerId}@${registration.observerVersion} over ${provenance.scope.scopeRef} (${provenance.scope.from}..${provenance.scope.to})`,
                ),
              }),
              detail: null,
              digest,
              recordedAt: now(),
            }),
          );
        },

        unavailable(unavailableInput: { readonly domain: ObservationDomain; readonly detail: string }): string {
          /**
           * An `UNAVAILABLE` record is freely writable BY ANY REGISTERED OBSERVER, because it can never
           * grant positive authority: it contributes no coverage, so an issuance resting on it reports an
           * obstacle. That asymmetry is what keeps the honest "I cannot see this" answer cheap.
           */
          const digest = canonicalDigest({
            domain: OBSERVATION_RECORD_DOMAIN,
            unavailable: { domain: unavailableInput.domain, detail: unavailableInput.detail, observerId: registration.observerId },
          });
          const ref = `obs-unavail-${digest.slice(0, 24)}`;
          return append(
            Object.freeze({
              observationRef: ref,
              domain: unavailableInput.domain,
              state: "UNAVAILABLE" as const,
              provenance: null,
              selectors: Object.freeze([]),
              footprint: null,
              detail: unavailableInput.detail,
              digest,
              recordedAt: now(),
            }),
          );
        },
      });
    },

    recall,
    close: () => database.close(),
  });
}
