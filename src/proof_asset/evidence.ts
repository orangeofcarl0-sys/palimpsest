/**
 * G10-T Proof/Evidence plane — Evidence items.
 *
 *   Source ≠ Evidence        Evidence ≠ Claim
 *
 * An `EvidenceItem` is a *selection* over an immutable source revision: it binds
 * a `ProofSourceRevisionRef` to a typed `EvidenceSelector` and the digest of the
 * actually-resolved selection bytes. `evidenceId` is content-addressed from
 * (sourceRevision, selector, selectionDigest).
 *
 * FIREWALL: `selectionDigest` is ALWAYS derived by the service from resolved
 * content — a caller-supplied selection digest that does not match the resolved
 * bytes is rejected (`selection_digest_mismatch`). The materialize helper accepts
 * a digest so the service can record its own computed value; it never lets a
 * caller assert content.
 */

import { canonicalDigest } from "../schema/canonical.js";
import {
  proofDigestHex,
  proofFail,
  proofKeys,
  proofNonNegInt,
  proofObject,
  proofRefDigest,
  proofString,
} from "./refs.js";
import type { ProofSourceRevisionRef } from "./refs.js";
import { materializeProofSourceRevisionRef, parseProofSourceRevisionRef } from "./refs.js";

export const PROOF_EVIDENCE_ITEM_DOMAIN = "palimpsest.proof.evidence-item.v1";
export const PROOF_EVIDENCE_ITEM_ID_DOMAIN = "palimpsest.proof.evidence-item-id.v1";
export const PROOF_EVIDENCE_PROVENANCE_DOMAIN = "palimpsest.proof.evidence-provenance.v1";

export type EvidenceSelector =
  | { readonly kind: "WHOLE_SOURCE" }
  | { readonly kind: "TEXT_RANGE"; readonly start: number; readonly end: number }
  | { readonly kind: "JSON_POINTER"; readonly pointer: string };

export const EVIDENCE_SELECTOR_KINDS = ["WHOLE_SOURCE", "TEXT_RANGE", "JSON_POINTER"] as const;

export function materializeEvidenceSelector(input: EvidenceSelector): EvidenceSelector {
  switch (input.kind) {
    case "WHOLE_SOURCE":
      return Object.freeze({ kind: "WHOLE_SOURCE" as const });
    case "TEXT_RANGE": {
      const start = proofNonNegInt(input.start, "selector.start");
      const end = proofNonNegInt(input.end, "selector.end");
      if (start > end) proofFail("invalid_value", "selector.start must be <= selector.end");
      return Object.freeze({ kind: "TEXT_RANGE" as const, start, end });
    }
    case "JSON_POINTER":
      return Object.freeze({ kind: "JSON_POINTER" as const, pointer: validateJsonPointer(input.pointer) });
    default: {
      const exhausted: never = input;
      return exhausted;
    }
  }
}

export function parseEvidenceSelector(raw: unknown, what = "EvidenceSelector"): EvidenceSelector {
  const object = proofObject(raw, what);
  const kind = object.kind;
  switch (kind) {
    case "WHOLE_SOURCE":
      proofKeys(object, ["kind"], ["kind"], what);
      return materializeEvidenceSelector({ kind: "WHOLE_SOURCE" });
    case "TEXT_RANGE":
      proofKeys(object, ["kind", "start", "end"], ["kind", "start", "end"], what);
      return materializeEvidenceSelector({ kind: "TEXT_RANGE", start: proofNonNegInt(object.start, `${what}.start`), end: proofNonNegInt(object.end, `${what}.end`) });
    case "JSON_POINTER":
      proofKeys(object, ["kind", "pointer"], ["kind", "pointer"], what);
      return materializeEvidenceSelector({ kind: "JSON_POINTER", pointer: proofString(object.pointer, `${what}.pointer`) });
    default:
      proofFail("unknown_kind", `${what}.kind must be one of ${EVIDENCE_SELECTOR_KINDS.join(", ")}`);
  }
}

/** RFC 6901 pointer grammar: "" (whole document) or a sequence of `/`-prefixed segments. */
function validateJsonPointer(pointer: string): string {
  if (pointer === "") return pointer;
  if (!pointer.startsWith("/")) proofFail("invalid_value", "selector.pointer must be empty or start with \"/\"");
  for (const segment of pointer.slice(1).split("/")) {
    for (let index = 0; index < segment.length; index += 1) {
      if (segment[index] !== "~") continue;
      const next = segment[index + 1];
      if (next !== "0" && next !== "1") proofFail("invalid_value", "selector.pointer has an invalid JSON Pointer escape (~ must be ~0 or ~1)");
      index += 1;
    }
  }
  return pointer;
}

export interface EvidenceItem {
  readonly schemaVersion: 1;
  readonly evidenceId: string;
  readonly sourceRevision: ProofSourceRevisionRef;
  readonly selector: EvidenceSelector;
  readonly selectionDigest: string;
  readonly provenanceDigest: string;
  readonly digest: string;
}

export function proofEvidenceItemDigestOf(input: Omit<EvidenceItem, "digest">): string {
  return canonicalDigest({
    domain: PROOF_EVIDENCE_ITEM_DOMAIN,
    evidenceId: input.evidenceId,
    sourceRevision: input.sourceRevision,
    selector: input.selector,
    selectionDigest: input.selectionDigest,
    provenanceDigest: input.provenanceDigest,
  });
}

export function proofEvidenceProvenanceDigestOf(input: {
  readonly sourceRevision: ProofSourceRevisionRef;
  readonly selector: EvidenceSelector;
  readonly selectionDigest: string;
}): string {
  return canonicalDigest({
    domain: PROOF_EVIDENCE_PROVENANCE_DOMAIN,
    sourceRevision: input.sourceRevision,
    selector: input.selector,
    selectionDigest: input.selectionDigest,
  });
}

export function proofEvidenceIdOf(input: {
  readonly sourceRevision: ProofSourceRevisionRef;
  readonly selector: EvidenceSelector;
  readonly selectionDigest: string;
}): string {
  return proofRefDigest(
    PROOF_EVIDENCE_ITEM_ID_DOMAIN,
    canonicalDigest({
      domain: PROOF_EVIDENCE_ITEM_ID_DOMAIN,
      sourceRevision: input.sourceRevision,
      selector: input.selector,
      selectionDigest: input.selectionDigest,
    }),
    "pev",
  );
}

export interface MaterializeEvidenceItemInput {
  readonly sourceRevision: ProofSourceRevisionRef;
  readonly selector: EvidenceSelector;
  /** MUST be the digest of content the service actually resolved. */
  readonly selectionDigest: string;
}

export function materializeEvidenceItem(input: MaterializeEvidenceItemInput): EvidenceItem {
  const sourceRevision = materializeProofSourceRevisionRef({
    sourceId: input.sourceRevision.sourceId,
    revision: input.sourceRevision.revision,
    contentDigest: input.sourceRevision.contentDigest,
  });
  const selector = materializeEvidenceSelector(input.selector);
  const selectionDigest = proofDigestHex(input.selectionDigest, "selectionDigest");
  const provenanceDigest = proofEvidenceProvenanceDigestOf({ sourceRevision, selector, selectionDigest });
  const evidenceId = proofEvidenceIdOf({ sourceRevision, selector, selectionDigest });
  const base: Omit<EvidenceItem, "digest"> = { schemaVersion: 1 as const, evidenceId, sourceRevision, selector, selectionDigest, provenanceDigest };
  return Object.freeze({ ...base, digest: proofEvidenceItemDigestOf(base) });
}

export function parseEvidenceItem(raw: unknown, what = "EvidenceItem"): EvidenceItem {
  const object = proofObject(raw, what);
  proofKeys(
    object,
    ["schemaVersion", "evidenceId", "sourceRevision", "selector", "selectionDigest", "provenanceDigest", "digest"],
    ["schemaVersion", "evidenceId", "sourceRevision", "selector", "selectionDigest", "provenanceDigest", "digest"],
    what,
  );
  if (object.schemaVersion !== 1) proofFail("unknown_schema_version", `${what}.schemaVersion must be 1`);
  const sourceRevision = parseProofSourceRevisionRef(object.sourceRevision, `${what}.sourceRevision`);
  const selector = parseEvidenceSelector(object.selector, `${what}.selector`);
  const selectionDigest = proofDigestHex(object.selectionDigest, `${what}.selectionDigest`);
  const provenanceDigest = proofDigestHex(object.provenanceDigest, `${what}.provenanceDigest`);
  const expectedProvenance = proofEvidenceProvenanceDigestOf({ sourceRevision, selector, selectionDigest });
  if (provenanceDigest !== expectedProvenance) proofFail("invalid_value", `${what}.provenanceDigest does not match its content`);
  const evidenceId = proofString(object.evidenceId, `${what}.evidenceId`);
  if (evidenceId !== proofEvidenceIdOf({ sourceRevision, selector, selectionDigest })) {
    proofFail("invalid_value", `${what}.evidenceId must be derived from (sourceRevision, selector, selectionDigest)`);
  }
  const base: Omit<EvidenceItem, "digest"> = { schemaVersion: 1 as const, evidenceId, sourceRevision, selector, selectionDigest, provenanceDigest };
  const digest = proofDigestHex(object.digest, `${what}.digest`);
  if (proofEvidenceItemDigestOf(base) !== digest) proofFail("invalid_value", `${what}.digest does not match its content`);
  return Object.freeze({ ...base, digest });
}
