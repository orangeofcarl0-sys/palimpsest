/**
 * C6-R0 — the provenance rule as a regression.
 *
 * COG-6's rubric read an ambient working tree, and an evidence extractor later labelled a
 * post-negative-control snapshot as the rubric's accepted source. These tests pin the rule that
 * replaces it: a canonical source evaluation is a committed blob at an explicitly named head, with a
 * time, a subject, and an honest UNQUALIFIED outcome when any of those cannot be resolved.
 *
 * Nothing here touches a real repository; `readBlob`/`resolveHead` are supplied, so the rule is
 * tested exactly as the runner must use it.
 */
import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  evaluateCanonicalSource,
  requireQualified,
  SOURCE_EVALUATION_SCHEMA,
} from "../scripts/c6r/provenance.mjs";

const A = "0e997cbcc04ac1ee4c9b8d2985e2dd97443136d0f57b838f01d25de2403f920c";
const B = "14ffdd6525d292f33e86f568d9ecfd8fc5dfe47019e1bfaa76bb055ffc07bc91";

const ACCEPTED_HEAD = "55370b0f5bd7740aba4dcbe3074fb6b545443f61";
const PROJECT_HEAD = "22796231660d7915c561a34445aecbd7f1900159";
const CONTROL_HEAD = "caa543441c4510941e0f228c6991616f75fb3557";

/** The frozen scenario bytes the experiment depends on; the digests above are pinned against them. */
const CAPABILITIES_A = readFileSync(
  join(import.meta.dirname, "..", "scripts", "cog6", "scenario", "inbox", "2026-02-10", "vendor-capabilities.csv"),
  "utf8",
);
const CAPABILITIES_B = readFileSync(
  join(import.meta.dirname, "..", "scripts", "cog6", "scenario", "inbox", "2026-02-14", "vendor-capabilities-corrected.csv"),
  "utf8",
);

function digest(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/** A tiny world: two accepted heads carry A, the control head carries B. */
function world() {
  const blobs = new Map<string, Map<string, string>>([
    [ACCEPTED_HEAD, new Map([["sources/vendor-capabilities.csv", CAPABILITIES_A]])],
    [PROJECT_HEAD, new Map([["sources/vendor-capabilities.csv", CAPABILITIES_A]])],
    [CONTROL_HEAD, new Map([["sources/vendor-capabilities.csv", CAPABILITIES_B]])],
  ]);
  return {
    readBlob: ({ head, path }: { head: string; path: string }) => blobs.get(head)?.get(path) ?? null,
    resolveHead: (ref: string) => (blobs.has(ref) ? ref : null),
    digest,
  };
}

const SUBJECT = { kind: "DOMAIN_EVALUATION", id: "technical-refresh:promotion-b812c0ee" };
const AT = "2026-11-02T09:00:00.000Z";

describe("C6-R0 canonical source provenance", () => {
  it("0. the frozen scenario bytes still have the pre-registered candidate identities", () => {
    expect(digest(CAPABILITIES_A)).toBe(A);
    expect(digest(CAPABILITIES_B)).toBe(B);
  });

  it("records the committed blob, head, time and subject", () => {
    const record = evaluateCanonicalSource({
      ...world(),
      observedHead: PROJECT_HEAD,
      path: "sources/vendor-capabilities.csv",
      at: AT,
      subject: SUBJECT,
      expected: { digest: A, source: "candidate A" },
    });
    expect(record.schema).toBe(SOURCE_EVALUATION_SCHEMA);
    expect(record.qualified).toBe(true);
    expect(record.canonicalBasis).toBe("COMMITTED_BLOB");
    expect(record.observedHead).toBe(PROJECT_HEAD);
    expect(record.committedBlobDigest).toBe(A);
    expect(record.equalsExpected).toBe(true);
    expect(record.evaluationAt).toBe(AT);
    expect(record.subject).toEqual(SUBJECT);
  });

  it("still resolves the accepted blob after a negative control moved the live head", () => {
    const record = evaluateCanonicalSource({
      ...world(),
      // The evaluation names the head it claims to observe; the control head is a different world.
      observedHead: ACCEPTED_HEAD,
      path: "sources/vendor-capabilities.csv",
      at: AT,
      subject: SUBJECT,
      expected: { digest: A, source: "candidate A" },
    });
    expect(record.qualified).toBe(true);
    expect(record.committedBlobDigest).toBe(A);
    expect(record.committedBlobDigest).not.toBe(B);
  });

  it("records an ambient working-tree digest only as non-canonical evidence", () => {
    const record = evaluateCanonicalSource({
      ...world(),
      observedHead: PROJECT_HEAD,
      path: "sources/vendor-capabilities.csv",
      at: AT,
      subject: SUBJECT,
      workingTreeDigest: "620c334dd79bc010b63d4febba0c6583197be92408dbfeb895de68083c6a277f",
    });
    expect(record.qualified).toBe(true);
    expect(record.committedBlobDigest).toBe(A);
    expect(record.workingTree?.canonical).toBe(false);
    expect(record.workingTree?.digest).not.toBe(record.committedBlobDigest);
  });

  it("reports a mismatch against the expected candidate instead of relabelling it", () => {
    const record = evaluateCanonicalSource({
      ...world(),
      observedHead: CONTROL_HEAD,
      path: "sources/vendor-capabilities.csv",
      at: AT,
      subject: SUBJECT,
      expected: { digest: A, source: "candidate A" },
    });
    expect(record.qualified).toBe(true);
    expect(record.committedBlobDigest).toBe(B);
    expect(record.equalsExpected).toBe(false);
  });

  it("is unqualified when the observed head cannot be resolved", () => {
    const record = evaluateCanonicalSource({
      ...world(),
      observedHead: "f".repeat(40),
      path: "sources/vendor-capabilities.csv",
      at: AT,
      subject: SUBJECT,
    });
    expect(record.qualified).toBe(false);
    expect(record.unqualifiedReason).toBe("observed_head_not_resolvable");
    expect(() => requireQualified(record)).toThrow(/unqualified source evaluation/);
  });

  it("is unqualified when the blob does not exist at a resolvable head", () => {
    const record = evaluateCanonicalSource({
      ...world(),
      observedHead: ACCEPTED_HEAD,
      path: "sources/missing.csv",
      at: AT,
      subject: SUBJECT,
    });
    expect(record.qualified).toBe(false);
    expect(record.unqualifiedReason).toBe("canonical_blob_not_resolvable");
  });

  it("is unqualified without an explicit evaluation time or subject", () => {
    const missingTime = evaluateCanonicalSource({
      ...world(),
      observedHead: ACCEPTED_HEAD,
      path: "sources/vendor-capabilities.csv",
      at: "",
      subject: SUBJECT,
    });
    expect(missingTime.qualified).toBe(false);
    expect(missingTime.unqualifiedReason).toBe("no_evaluation_time");

    const missingSubject = evaluateCanonicalSource({
      ...world(),
      observedHead: ACCEPTED_HEAD,
      path: "sources/vendor-capabilities.csv",
      at: AT,
      subject: undefined as unknown as { kind: string; id: string },
    });
    expect(missingSubject.qualified).toBe(false);
    expect(missingSubject.unqualifiedReason).toBe("no_result_subject");
  });

  it("is unqualified when the head is not a full commit identity", () => {
    const record = evaluateCanonicalSource({
      ...world(),
      observedHead: "2279623",
      path: "sources/vendor-capabilities.csv",
      at: AT,
      subject: SUBJECT,
    });
    expect(record.qualified).toBe(false);
    expect(record.unqualifiedReason).toBe("no_observed_head");
  });
});
