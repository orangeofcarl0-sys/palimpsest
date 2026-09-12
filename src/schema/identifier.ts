/**
 * Semantically neutral stable-identifier grammar (G10-C0 Stage 0 review, §10).
 *
 * Extracted by value from the canonical contract models so non-Work artifacts
 * (Architecture/Agent definition identity, observation snapshot identity) can
 * share the exact same grammar without importing Work semantics. The grammar:
 * NFC-normalized ASCII, 1–128 characters, starts with an alphanumeric, then
 * `[A-Za-z0-9._:-]` — no leading/trailing whitespace, no control characters,
 * no embedded newlines, no path separators (no path-like ambiguity), no
 * Unicode beyond NFC-safe ASCII.
 */

export const STABLE_IDENTIFIER_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;

export function normalizeStableIdentifier(value: string): string {
  return value.normalize("NFC");
}

export function isStableIdentifier(value: string): boolean {
  return STABLE_IDENTIFIER_RE.test(normalizeStableIdentifier(value));
}
