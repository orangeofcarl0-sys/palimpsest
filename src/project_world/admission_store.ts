/**
 * PLMP-LEAN-1 §D3-R2 + §D5-0 — the DURABLE ADMISSION RECORD, and the binding that makes an effect's target a
 * fact rather than a caller's assertion.
 *
 * An audit of D3-d found the effect's entry point still accepted a bag of caller-assembled facts:
 *
 *     rematerialize({ presented, resultManifestDigest, originBasisDigest, targetBasisDigest, targetBasisRevision, ... })
 *
 * Two of those — the digest the certificate is checked against and the REVISION the world is actually built
 * at — were independent inputs. So nothing in the code proved:
 *
 *     targetBasisRevision ∈ the same authoritative observation whose digest is targetBasisDigest
 *
 * and a caller could pass `digest(B1)` with revision `H2`: admission would pass on the digest and the effect
 * would run at H2. That is precisely the "effect's only input is an admission identity" property D3-d
 * claimed and had not reached.
 *
 * THE FIX IS TO MAKE THE TARGET A RECORD. An admission is written once, it holds the OBSERVATION it was made
 * against, and the effect takes the admission ref and nothing else:
 *
 *     CrossBasisAdmissionRecord
 *     ├── admissionRef
 *     ├── issuanceRef            (which certificate)
 *     ├── resultSubjectRef       (WHICH result — §D5-0)
 *     ├── result / origin basis
 *     └── targetObservation
 *         ├── targetObservationDigest
 *         └── targetBasisRevision      ← the SAME record, so they cannot be mixed
 *
 * The effect then recalls the record and reads the revision FROM IT, so a mismatch is not a check that can
 * be forgotten — it is not expressible.
 *
 * §D5-0 CLOSED THE SECOND HALF. The target became a fact, but the RESULT was still whatever the caller
 * said it was: `originSource`, `projectId`, `taskId` and `producedAssetRefs` all arrived as arguments. So
 * a caller could name a genuine admission and hand it a different delta — the admission proved "an effect
 * is authorized", never "the effect is about the result this admission was issued for". `resultSubjectRef`
 * is that missing identity, and the effect now resolves the result FROM IT and cross-checks the resolved
 * manifest digest against this record. See `result_resolution.ts`.
 *
 * DURABLE FOR THE SAME REASON THE ISSUANCE IS. `Facts persist; authorities expire` means an authority
 * expires because the world moved, never because the host restarted.
 *
 * Layer: L2 (`src/project_world/`). Not re-exported from the domain barrel.
 */
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

import { canonicalDigest } from "../schema/canonical.js";
import type { ResultSubjectRef } from "../result/subject.js";

/**
 * The observed target an admission is bound to.
 *
 * The digest and the revision are ONE record by construction, which is what removes the possibility of
 * admitting against one world and effecting in another.
 */
export interface TargetObservationRecord {
  /** The digest the compatibility certificate was checked against. */
  readonly targetObservationDigest: string;
  /** The revision the execution world must be built at — from the SAME observation. */
  readonly targetBasisRevision: string;
  readonly detail: string;
}

export interface CrossBasisAdmissionRecord {
  readonly schemaVersion: 1;
  readonly admissionRef: string;
  readonly issuanceRef: string;
  /**
   * §D5-0: WHICH result this admission is about.
   *
   * The effect resolves this and requires the resolved manifest digest to equal `resultManifestDigest`
   * below, so an admission cannot be pointed at a different result than the one it was issued for.
   */
  readonly resultSubjectRef: ResultSubjectRef;
  readonly resultManifestDigest: string;
  readonly originBasisDigest: string;
  readonly targetObservation: TargetObservationRecord;
  /** The decision, kept so a refusal can name its reason without re-deriving anything. */
  readonly state: string;
  readonly admitted: boolean;
  readonly detail: string;
  readonly recordedAt: string;
}

export interface CrossBasisAdmissionStore {
  /** Record a decision. Append-once: the ref IS the identity, so a replay keeps the first. */
  record(record: CrossBasisAdmissionRecord): CrossBasisAdmissionRecord;
  recall(admissionRef: string): CrossBasisAdmissionRecord | null;
  close(): void;
}

const ADMISSION_REF_DOMAIN = "palimpsest.cross-basis-admission.v1";

/**
 * The admission's identity.
 *
 * §D5-0 added `resultSubjectRef`: the ref must name WHICH result the decision is about, because the effect
 * now resolves the result from this record and refuses if the resolved identity disagrees. Without it the
 * ref would identify "a decision about the target" but not "a decision about this result", and two
 * decisions that differ only in their result would be the same identity.
 */
export function crossBasisAdmissionRefOf(input: {
  readonly issuanceRef: string;
  readonly targetObservationDigest: string;
  readonly resultSubjectRef: ResultSubjectRef;
}): string {
  return `admission-${canonicalDigest({
    domain: ADMISSION_REF_DOMAIN,
    issuanceRef: input.issuanceRef,
    targetObservationDigest: input.targetObservationDigest,
    resultSubject: input.resultSubjectRef,
  }).slice(0, 32)}`;
}

export function makeCrossBasisAdmissionStore(input: {
  readonly databasePath: string;
}): CrossBasisAdmissionStore {
  if (input.databasePath !== ":memory:") mkdirSync(dirname(input.databasePath), { recursive: true });
  const database = new DatabaseSync(input.databasePath === ":memory:" ? ":memory:" : join(input.databasePath));
  database.exec(
    "CREATE TABLE IF NOT EXISTS cross_basis_admission (" +
      "admission_ref TEXT NOT NULL, " +
      "issuance_ref TEXT NOT NULL, " +
      "state TEXT NOT NULL, " +
      "record_json BLOB NOT NULL, " +
      "recorded_at TEXT NOT NULL, " +
      "PRIMARY KEY (admission_ref))",
  );
  const read = database.prepare("SELECT record_json FROM cross_basis_admission WHERE admission_ref = ?");
  const insert = database.prepare(
    "INSERT INTO cross_basis_admission (admission_ref, issuance_ref, state, record_json, recorded_at) VALUES (?, ?, ?, ?, ?)",
  );

  function recall(admissionRef: string): CrossBasisAdmissionRecord | null {
    const row = read.get(admissionRef) as unknown as { record_json: Uint8Array } | undefined;
    if (row === undefined) return null;
    return JSON.parse(new TextDecoder().decode(row.record_json)) as CrossBasisAdmissionRecord;
  }

  return Object.freeze({
    record(entry: CrossBasisAdmissionRecord): CrossBasisAdmissionRecord {
      try {
        insert.run(
          entry.admissionRef,
          entry.issuanceRef,
          entry.state,
          new TextEncoder().encode(JSON.stringify(entry)),
          entry.recordedAt,
        );
      } catch {
        if (recall(entry.admissionRef) === null) throw new Error(`admission ${entry.admissionRef} could not be recorded`);
      }
      return entry;
    },
    recall,
    close: () => database.close(),
  });
}
