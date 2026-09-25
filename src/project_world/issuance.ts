/**
 * PLMP-LEAN-1 §D3-c2 + §D3-R1/R2 — IMMUTABLE, DURABLE ISSUANCE: the authority a certificate carries.
 *
 *     Proof generation  ≠  Proof validation
 *
 * D3-b is the GENERATOR. It is a pure function over premises, and a pure function must accept whatever it
 * is handed — so a caller can construct premises that yield a logically valid `COMPATIBLE`. That conclusion
 * is sound and carries NO AUTHORITY:
 *
 *     a logically valid conclusion from untrusted premises  ⇏  system authority
 *
 * This module is the boundary that makes the difference, and it has TWO jobs that an audit found only
 * half-done in the first version:
 *
 *   §D3-R1  the PREMISES must be authority-bearing. `issue()` takes observation REFS and recalls the
 *           records itself, so there is no parameter through which a caller-supplied premise object can
 *           enter. The previous version accepted a `PremiseSet`, which meant a caller could name the real
 *           observer in a hand-built literal — verified by doing it — while the issuer could only ever
 *           prove "I issued this", never "this is what that observer produced".
 *
 *   §D3-R2  the RECORD must be DURABLE. `Facts persist; authorities expire` means an authority expires
 *           because the WORLD moved, never because the host restarted. An in-memory map lost every
 *           certificate on restart while bases, candidates and verifications survived — so the authority
 *           history was the one durable-looking thing that was not durable.
 *
 * WHY A REGISTRY RATHER THAN A SIGNATURE FIELD. A boolean or token inside the assessment would be
 * constructible by whoever constructs the assessment. The registry is the opposite: the assessment is
 * worthless for admission unless a durable record exists of THIS authority having issued it from THESE
 * observation refs, and nothing outside this module can create that record.
 *
 * Layer: L2 (`src/project_world/`). Not re-exported from the domain barrel.
 */
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

import { canonicalDigest } from "../schema/canonical.js";

import { assessCompatibility, type CompatibilityAssessment } from "./compatibility.js";
import { materializeWorldChangeFootprint, type CoveredFootprint, type WorldChangeFootprint } from "./footprint.js";
import type { ObservationAuthority, RecordedObservation } from "./observation_authority.js";

const ISSUANCE_DIGEST_DOMAIN = "palimpsest.compatibility-issuance.v1";

/**
 * The observation REFS a certificate rests on — one per premise slot.
 *
 * A `null` slot means "no observation was made for this facet", which contributes an UNPROVEN footprint and
 * therefore an obstacle. It can never contribute positive coverage, so an unobserved facet is honest rather
 * than permissive.
 */
export interface PremiseReferences {
  readonly projectSemantic: string | null;
  readonly source: string | null;
  readonly assets: string | null;
  readonly environment: string | null;
  readonly resultReads: string | null;
  readonly resultWrites: string | null;
}

/** A certificate: D3-b's assessment, plus the exact observation refs it was issued from. */
export interface IssuedCompatibilityAssessment {
  readonly schemaVersion: 1;
  readonly issuerId: string;
  readonly assessment: CompatibilityAssessment;
  readonly premiseRefs: PremiseReferences;
  /** The premise set's own identity, so a re-issue from different observations is visibly different. */
  readonly premiseSetDigest: string;
  readonly issuanceDigest: string;
}

export interface CompatibilityIssuer {
  readonly issuerId: string;
  /**
   * Run D3-b over the OBSERVED premises and record the result.
   *
   * Note what is NOT a parameter: an assessment, or a premise object. A caller supplies observation REFS
   * and receives a certificate; it cannot supply a conclusion for the system to bless, and it cannot
   * supply the premises either — those are recalled from the observation authority by ref.
   */
  issue(input: {
    readonly resultManifestDigest: string;
    readonly originBasisDigest: string;
    readonly targetObservationDigest: string;
    readonly exactlyCurrent: boolean;
    readonly observationRefs: PremiseReferences;
    readonly unobservedFacets?: readonly string[] | undefined;
  }): IssuedCompatibilityAssessment;
  /**
   * Recall a certificate by identity.
   *
   * A structurally perfect assessment that was never issued returns `null`, and so does one issued by a
   * DIFFERENT process whose records this authority does not hold. That is the point: authority is a record.
   */
  recall(issuanceDigest: string): IssuedCompatibilityAssessment | null;
  /** How many certificates this authority has issued. Diagnostics, never an authority. */
  issuedCount(): number;
  close(): void;
}

/** The footprint a recalled observation contributes; an unobserved slot contributes an UNPROVEN empty set. */
function footprintOf(record: RecordedObservation | null, detail: string): CoveredFootprint {
  if (record === null || record.footprint === null) {
    return Object.freeze({
      selectors: Object.freeze([]),
      coverage: Object.freeze({
        status: "UNPROVEN" as const,
        detail: record === null ? detail : (record.detail ?? detail),
      }),
    });
  }
  return record.footprint;
}

function premiseSetDigestOf(refs: PremiseReferences): string {
  return canonicalDigest({ domain: "palimpsest.premise-set.v1", refs });
}

export function makeCompatibilityIssuer(input: {
  readonly issuerId: string;
  /** §D3-R1: where premises come from. The issuer READS it; it never receives premises as data. */
  readonly observations: ObservationAuthority;
  /** §D3-R2: where issued certificates are recorded, so they survive a restart. */
  readonly databasePath: string;
  readonly clock?: (() => string) | undefined;
}): CompatibilityIssuer {
  const now = (): string => (input.clock ?? (() => new Date().toISOString()))();
  if (input.databasePath !== ":memory:") mkdirSync(dirname(input.databasePath), { recursive: true });
  const database = new DatabaseSync(input.databasePath === ":memory:" ? ":memory:" : join(input.databasePath));
  database.exec(
    "CREATE TABLE IF NOT EXISTS compatibility_issuance (" +
      "issuance_digest TEXT NOT NULL, " +
      "issuer_id TEXT NOT NULL, " +
      "result_manifest_digest TEXT NOT NULL, " +
      "outcome TEXT NOT NULL, " +
      "record_json BLOB NOT NULL, " +
      "issued_at TEXT NOT NULL, " +
      // APPEND-ONCE: one digest names one certificate, and a replay writes the same digest with the same
      // bytes — which is what makes replay converge instead of accumulating identities.
      "PRIMARY KEY (issuance_digest))",
  );
  const read = database.prepare("SELECT record_json FROM compatibility_issuance WHERE issuance_digest = ?");
  const insert = database.prepare(
    "INSERT INTO compatibility_issuance (issuance_digest, issuer_id, result_manifest_digest, outcome, record_json, issued_at) VALUES (?, ?, ?, ?, ?, ?)",
  );
  const count = database.prepare("SELECT COUNT(*) AS c FROM compatibility_issuance");

  function recall(issuanceDigest: string): IssuedCompatibilityAssessment | null {
    const row = read.get(issuanceDigest) as unknown as { record_json: Uint8Array } | undefined;
    if (row === undefined) return null;
    return JSON.parse(new TextDecoder().decode(row.record_json)) as IssuedCompatibilityAssessment;
  }

  return Object.freeze({
    issuerId: input.issuerId,

    issue(issueInput: {
      readonly resultManifestDigest: string;
      readonly originBasisDigest: string;
      readonly targetObservationDigest: string;
      readonly exactlyCurrent: boolean;
      readonly observationRefs: PremiseReferences;
      readonly unobservedFacets?: readonly string[] | undefined;
    }): IssuedCompatibilityAssessment {
      const refs = issueInput.observationRefs;
      /**
       * RECALL EVERY PREMISE BY REF. A ref this authority does not hold is treated as an unobserved slot
       * with a detail naming it, so a caller citing a fabricated ref gets an obstacle rather than a pass —
       * the failure is honest rather than silent.
       */
      const recalled = {
        projectSemantic: input.observations.recall(refs.projectSemantic ?? ""),
        source: input.observations.recall(refs.source ?? ""),
        assets: input.observations.recall(refs.assets ?? ""),
        environment: input.observations.recall(refs.environment ?? ""),
        resultReads: input.observations.recall(refs.resultReads ?? ""),
        resultWrites: input.observations.recall(refs.resultWrites ?? ""),
      };
      const unheld = Object.entries(refs)
        .filter(([slot, ref]) => ref !== null && recalled[slot as keyof typeof recalled] === null)
        .map(([slot, ref]) => `${slot}=${String(ref)}`);

      const change: WorldChangeFootprint = materializeWorldChangeFootprint({
        projectSemantic: footprintOf(recalled.projectSemantic, "no observation was made for the project semantic facet"),
        source: footprintOf(recalled.source, "no observation was made for the source facet"),
        assets: footprintOf(recalled.assets, "no observation was made for the asset facet"),
        environment: footprintOf(recalled.environment, "no observation was made for the environment facet"),
      });

      const assessment = assessCompatibility({
        resultManifestDigest: issueInput.resultManifestDigest,
        originBasisDigest: issueInput.originBasisDigest,
        targetObservationDigest: issueInput.targetObservationDigest,
        exactlyCurrent: issueInput.exactlyCurrent,
        change,
        reads: footprintOf(recalled.resultReads, "no observation was made for the result's read footprint"),
        writes: footprintOf(recalled.resultWrites, "no observation was made for the result's write footprint"),
        ...(issueInput.unobservedFacets === undefined ? {} : { unobservedFacets: issueInput.unobservedFacets }),
        // A ref this authority never wrote is an explicit obstacle, named so a reader sees the citation
        // rather than a silent gap.
        ...(unheld.length === 0
          ? {}
          : { unobservedFacets: [...(issueInput.unobservedFacets ?? []), `unheld observation refs: ${unheld.join(", ")}`] }),
      });

      const premiseSetDigest = premiseSetDigestOf(refs);
      const issuanceDigest = canonicalDigest({
        domain: ISSUANCE_DIGEST_DOMAIN,
        issuerId: input.issuerId,
        assessmentDigest: assessment.assessmentDigest,
        premiseRefs: refs,
        premiseSetDigest,
      });
      const record: IssuedCompatibilityAssessment = Object.freeze({
        schemaVersion: 1 as const,
        issuerId: input.issuerId,
        assessment,
        premiseRefs: refs,
        premiseSetDigest,
        issuanceDigest,
      });
      try {
        insert.run(
          issuanceDigest,
          input.issuerId,
          issueInput.resultManifestDigest,
          assessment.outcome,
          new TextEncoder().encode(JSON.stringify(record)),
          now(),
        );
      } catch {
        // A replay of the same issuance is not an error: the digest IS its identity, so the first stands.
        if (recall(issuanceDigest) === null) throw new Error(`issuance ${issuanceDigest} could not be recorded`);
      }
      return record;
    },

    recall,
    issuedCount: () => (count.get() as unknown as { c: number }).c,
    close: () => database.close(),
  });
}
