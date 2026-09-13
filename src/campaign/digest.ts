/**
 * G10-GC2 shared canonical-digest shape validation.
 *
 * Every digest that crosses a durable Campaign boundary is a lowercase
 * SHA-256 hex string (`canonicalDigest`, §5). A durable parser must never
 * accept `String(value)` or an arbitrary non-empty string as provenance:
 * a placeholder like `"previous"` or `""` is not a digest and must fail
 * closed at the persistence boundary (§§33/§40/§41).
 */

import { CampaignStoreError } from "./store.js";

export const CANONICAL_DIGEST_RE = /^[0-9a-f]{64}$/u;

export function isCanonicalDigest(value: unknown): value is string {
  return typeof value === "string" && CANONICAL_DIGEST_RE.test(value);
}

export function requireCanonicalDigest(value: unknown, what: string): string {
  if (!isCanonicalDigest(value)) {
    throw new CampaignStoreError(
      "malformed_record",
      `${what} must be a 64-character lowercase hex SHA-256 digest`,
    );
  }
  return value;
}
