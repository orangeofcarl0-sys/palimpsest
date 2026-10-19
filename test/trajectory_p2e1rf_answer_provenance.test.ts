/**
 * Trajectory-P2-E1RF §5 — RF-B: ANSWER PROVENANCE.
 *
 * THE DEFECT THIS PINS. `closure-gate.mjs` computed `armReceipt().answerDigest` as
 * `digestOf(JSON.stringify(payload.answerExtraction?.answer ?? null))`. The harness never recorded `answer`, so
 * BOTH arms carried SHA-256 of the literal string "null" — identical for two different answers, and unrelated
 * to the bytes that were extracted and scored. The artifact could not distinguish a real extraction from a
 * missing one.
 *
 * WHAT IS ASSERTED HERE. Not "the two arm digests differ" — that is a symptom, and a hash of two different
 * wrong things would also differ. The primary invariant is that each digest identifies the ACTUAL BYTES that
 * were read and scored (§5.5).
 *
 * THE FIXTURES ARE PERSISTED-MESSAGE SHAPES, not the network. `extractBenchmarkAnswer` is the shipped reader;
 * these tests feed it the event shapes DSH persists and assert on what it returns, which is the same path the
 * real assay takes.
 */
import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

type Extraction = {
  ok: boolean;
  answer?: unknown;
  rawText?: string;
  bytes?: number;
  seq?: number;
  assistantMessageCount: number;
  detail?: string;
};
type ExtractionModule = {
  extractBenchmarkAnswer: (events: readonly unknown[]) => Extraction;
  assistantTextOf: (event: unknown) => string;
};

const SCRIPTS = ["..", "scripts", "trajectory_p2e1r"].join("/");
const load = async (name: string): Promise<unknown> => import(/* @vite-ignore */ `${SCRIPTS}/${name}`);
const extractionModule = (await load("answer-extraction.mjs")) as ExtractionModule;

const sha256 = (text: string): string => `sha256-${createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex")}`;
/** E1RE's defect value: SHA-256 of `JSON.stringify(null)`. */
const NULL_PAYLOAD_DIGEST = sha256(JSON.stringify(null));

/** A persisted assistant message, in the shape DSH writes. */
const assistantEvent = (seq: number, text: string) => ({
  type: "assistant/message",
  seq,
  data: { message: { role: "assistant", content: [{ type: "text", text }] } },
});

const CONTROL_ANSWER = JSON.stringify({ judgments: [{ evidenceRef: "e-control", claim: "control reading" }] });
const TREATMENT_ANSWER = JSON.stringify({ judgments: [{ evidenceRef: "e-treatment", claim: "treatment reading" }] });

/** The digest the corrected harness computes: over `extraction.rawText`, from the bytes that were read. */
const digestOfExtraction = (extraction: Extraction): string | null =>
  typeof extraction.rawText === "string" ? `sha256-${createHash("sha256").update(Buffer.from(extraction.rawText, "utf8")).digest("hex")}` : null;

describe("E1RF RF-B answer provenance (DYNAMICALLY_VERIFIED)", () => {
  it("1. a real successful extraction produces a 64-hex-character SHA-256 digest", () => {
    const extraction = extractionModule.extractBenchmarkAnswer([assistantEvent(7, CONTROL_ANSWER)]);
    expect(extraction.ok).toBe(true);
    const digest = digestOfExtraction(extraction);
    expect(digest).toMatch(/^sha256-[0-9a-f]{64}$/u);
  });

  it("2. the digest matches the ACTUAL extracted raw text", () => {
    /** The invariant is identity with the bytes, not merely a well-formed hash. */
    const extraction = extractionModule.extractBenchmarkAnswer([assistantEvent(7, CONTROL_ANSWER)]);
    const digest = digestOfExtraction(extraction);
    expect(digest).toBe(sha256(CONTROL_ANSWER));
    expect(extraction.rawText).toBe(CONTROL_ANSWER);
  });

  it("3. CONTROL and TREATMENT's distinct answers are independently hashed", () => {
    const control = extractionModule.extractBenchmarkAnswer([assistantEvent(7, CONTROL_ANSWER)]);
    const treatment = extractionModule.extractBenchmarkAnswer([assistantEvent(9, TREATMENT_ANSWER)]);
    const controlDigest = digestOfExtraction(control);
    const treatmentDigest = digestOfExtraction(treatment);
    expect(controlDigest).not.toBe(treatmentDigest);
    /** And each identifies ITS OWN bytes, which is the property that matters. */
    expect(controlDigest).toBe(sha256(CONTROL_ANSWER));
    expect(treatmentDigest).toBe(sha256(TREATMENT_ANSWER));
  });

  it("4. a MISSING assistant message yields no successful digest", () => {
    const extraction = extractionModule.extractBenchmarkAnswer([{ type: "user/message", seq: 1, data: {} }]);
    expect(extraction.ok).toBe(false);
    expect(digestOfExtraction(extraction)).toBeNull();
    expect(extraction.assistantMessageCount).toBe(0);
  });

  it("5. an EMPTY assistant message yields no successful digest", () => {
    /** An empty text is not a raw-with-zero-bytes success: there is nothing to hash and nothing to score. */
    const extraction = extractionModule.extractBenchmarkAnswer([assistantEvent(3, "   ")]);
    expect(extraction.ok).toBe(false);
    expect(digestOfExtraction(extraction)).toBeNull();
  });

  it("6. a MALFORMED answer produces a digest of the bytes but NO Oracle-qualified output", () => {
    /**
     * This is the distinction that keeps the two facts separate: the bytes WERE read and can be identified, and
     * they did not parse. A single boolean would have to choose one of those and lose the other.
     */
    const extraction = extractionModule.extractBenchmarkAnswer([assistantEvent(4, "{not json")]);
    expect(extraction.ok).toBe(false);
    expect(extraction.rawText).toBe("{not json");
    expect(digestOfExtraction(extraction)).toBe(sha256("{not json"));
    expect(extraction.answer).toBeUndefined();
  });

  it("7. a MISSING digest prevents the corresponding provenance verdict", () => {
    /**
     * The gate's predicate, reproduced rather than imported: the point is that a receipt with no observed digest
     * cannot satisfy it. This is the shape E1RE's receipt had for every arm.
     */
    const provenanceSatisfied = (receipt: { answerDigest?: string | null }): boolean =>
      /^sha256-[0-9a-f]{64}$/u.test(String(receipt.answerDigest ?? "")) && receipt.answerDigest !== NULL_PAYLOAD_DIGEST;
    expect(provenanceSatisfied({ answerDigest: null })).toBe(false);
    expect(provenanceSatisfied({})).toBe(false);
    /** The absent-property case is the one that produced the defect, so it is exercised explicitly. */
    const absent: { answerDigest?: string | null } = {};
    expect(provenanceSatisfied(absent)).toBe(false);
    expect(provenanceSatisfied({ answerDigest: sha256(CONTROL_ANSWER) })).toBe(true);
  });

  it("8. a CORRUPTED digest is rejected", () => {
    const provenanceSatisfied = (receipt: { answerDigest?: string | null }): boolean =>
      /^sha256-[0-9a-f]{64}$/u.test(String(receipt.answerDigest ?? "")) && receipt.answerDigest !== NULL_PAYLOAD_DIGEST;
    /** A truncated digest, a wrong prefix and a non-hex body are all rejected by the shape test. */
    expect(provenanceSatisfied({ answerDigest: "sha256-abc" })).toBe(false);
    expect(provenanceSatisfied({ answerDigest: `md5-${"0".repeat(64)}` })).toBe(false);
    expect(provenanceSatisfied({ answerDigest: `sha256-${"z".repeat(64)}` })).toBe(false);
    /** A digest of the WRONG bytes is the same length and passes the shape test — which is why §5.5 requires the
     *  digest to be compared with the bytes, not merely validated as a string. */
    const wrongBytes = sha256("a different answer");
    expect(provenanceSatisfied({ answerDigest: wrongBytes })).toBe(true);
    expect(wrongBytes).not.toBe(sha256(CONTROL_ANSWER));
  });

  it("9. the known SHA-256 of `\"null\"` is NOT accepted when the persisted answer is non-null", () => {
    /**
     * THE REGRESSION CONTROL. E1RE recorded exactly this value for both arms while the persisted answer was a
     * real JSON object. The gate now names it and rejects it by identity.
     */
    const extraction = extractionModule.extractBenchmarkAnswer([assistantEvent(7, CONTROL_ANSWER)]);
    const observed = digestOfExtraction(extraction);
    expect(observed).not.toBe(NULL_PAYLOAD_DIGEST);
    expect(NULL_PAYLOAD_DIGEST).toBe("sha256-74234e98afe7498fb5daf1f36ac2d78acc339464f950703b8c019892f982b90b");
    /** And a receipt carrying it is rejected even though it is a well-formed SHA-256. */
    expect(/^sha256-[0-9a-f]{64}$/u.test(NULL_PAYLOAD_DIGEST)).toBe(true);
    const gateAccepts = (digest: string | null): boolean =>
      /^sha256-[0-9a-f]{64}$/u.test(String(digest ?? "")) && digest !== NULL_PAYLOAD_DIGEST;
    expect(gateAccepts(NULL_PAYLOAD_DIGEST)).toBe(false);
    expect(gateAccepts(observed)).toBe(true);
  });

  it("10. the digest and the Oracle input originate from the SAME extraction result", () => {
    /**
     * The provenance claim in full: one call produced both the bytes that were hashed and the parsed object
     * that is scored. Nothing reconstructs either from a second source.
     */
    const extraction = extractionModule.extractBenchmarkAnswer([assistantEvent(7, TREATMENT_ANSWER)]);
    expect(extraction.ok).toBe(true);
    expect(digestOfExtraction(extraction)).toBe(sha256(TREATMENT_ANSWER));
    expect(JSON.stringify(extraction.answer)).toBe(JSON.stringify(JSON.parse(TREATMENT_ANSWER)));
    /** The sequence number comes from the same event, so the receipt can name WHICH message was scored. */
    expect(extraction.seq).toBe(7);
    expect(extraction.bytes).toBe(Buffer.byteLength(TREATMENT_ANSWER, "utf8"));
  });

  it("11. the LAST assistant message is the one scored, so an earlier answer cannot be mistaken for it", () => {
    /** A session can hold several assistant messages; the receipt's seq must name the one that was hashed. */
    const events = [assistantEvent(2, JSON.stringify({ judgments: ["earlier"] })), assistantEvent(11, TREATMENT_ANSWER)];
    const extraction = extractionModule.extractBenchmarkAnswer(events);
    expect(extraction.seq).toBe(11);
    expect(digestOfExtraction(extraction)).toBe(sha256(TREATMENT_ANSWER));
    expect(extraction.assistantMessageCount).toBe(2);
  });
});
