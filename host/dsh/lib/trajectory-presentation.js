// palimpsest-dsh-host/trajectory-presentation — THE MODEL-VISIBLE TRAJECTORY SECTION SEAM (Trajectory-P2-D2 §7/§8).
//
// WHAT THIS IS. The HOST-side half of the D2 Trajectory presentation. The PRODUCT (the Palimpsest Context /
// Trajectory composition) decides WHAT may be shown: it renders a bounded, framed text section from an
// already-qualified Capsule and ships it in the worker payload. This module decides only WHERE that text
// goes in the engineering UserMessage, and it VALIDATES the received section before placing it.
//
// AUTHORITY. The section is HISTORICAL DATA, never instructions. This module adds no command, tool, write,
// scheduling, settlement, verification, promotion or continuation authority, and it never composes a
// section, reads a canonical owner or chooses an experimental arm. If the payload carries no presentation,
// `applyTrajectoryPresentation` returns its input UNCHANGED — the same string, not a copy — so an OFF
// deployment's prompt is byte-identical to the pre-D2 baseline.
//
// WHY ITS OWN MODULE. Like the R2-U affordance and the R2-E efficacy seams, this must be checkable byte-for-
// byte without standing up a DSH runtime. It imports only `node:crypto`, so it can never be why a worker
// fails to compose.
//
// PLAIN JAVASCRIPT. `host/**` is scanned by the architecture checker as JavaScript.

import { createHash } from 'node:crypto';

/** §7.2: the presentation schema version this host understands. */
export const PRESENTATION_SCHEMA_VERSION = 1;
/** §7.2: the frozen framing and authority a valid presentation must carry. */
export const PRESENTATION_FRAMING = 'HISTORICAL_DATA_NOT_INSTRUCTIONS';
export const PRESENTATION_AUTHORITY = 'READ_ONLY_INSPECTION';
/** §7.7: the hard product ceiling for a rendered section, mirrored from the product contract. */
export const PRESENTATION_HARD_MAX_SECTION_BYTES = 24576;

const utf8Bytes = (text) => Buffer.byteLength(text, 'utf8');
const rawDigest = (text) => createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex');

/**
 * §8.2: VALIDATE a received presentation before it may be placed in a prompt.
 *
 * The host must not stringify an arbitrary object into a prompt. This re-checks the schema version, the mode,
 * that the declared bytes equal the ACTUAL UTF-8 bytes, that the declared section digest equals the actual
 * bytes' digest, and that the framing and authority are the exact expected values. A presentation that fails
 * any check is REFUSED — the worker then sees no section rather than a malformed one.
 *
 * @param {unknown} raw
 * @returns {{ ok: true, presentation: object } | { ok: false, detail: string }}
 */
export function validatePresentation(raw) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, detail: 'the presentation is not an object' };
  if (raw.schemaVersion !== PRESENTATION_SCHEMA_VERSION) return { ok: false, detail: `unsupported presentation schemaVersion ${JSON.stringify(raw.schemaVersion)}` };
  if (raw.mode !== 'CONTROL' && raw.mode !== 'TREATMENT') return { ok: false, detail: `unsupported presentation mode ${JSON.stringify(raw.mode)}` };
  if (typeof raw.sectionText !== 'string') return { ok: false, detail: 'the presentation carries no section text' };
  if (raw.framing !== PRESENTATION_FRAMING) return { ok: false, detail: `the presentation framing is ${JSON.stringify(raw.framing)}, not ${PRESENTATION_FRAMING}` };
  if (raw.authority !== PRESENTATION_AUTHORITY) return { ok: false, detail: `the presentation authority is ${JSON.stringify(raw.authority)}, not ${PRESENTATION_AUTHORITY}` };
  const sectionBytes = utf8Bytes(raw.sectionText);
  if (raw.sectionBytes !== sectionBytes) return { ok: false, detail: `the presentation declares ${JSON.stringify(raw.sectionBytes)} bytes but the section is ${sectionBytes} bytes` };
  if (raw.sectionDigest !== rawDigest(raw.sectionText)) return { ok: false, detail: 'the presentation section digest does not match the actual section bytes' };
  if (sectionBytes > PRESENTATION_HARD_MAX_SECTION_BYTES) return { ok: false, detail: `the presentation section exceeds the product ceiling ${PRESENTATION_HARD_MAX_SECTION_BYTES} bytes` };
  return { ok: true, presentation: raw };
}

/**
 * §8.3: PLACE the validated section into the composed engineering task text.
 *
 * THE SINGLE DETERMINISTIC INSERTION POINT: appended AFTER the task text (which already ends with the worker
 * protocol rules), separated by one blank line, and NOTHING else changes. Placing it last keeps the task
 * instructions nearest the model's recency window and leaves every existing section byte-identical.
 *
 * ADDITIVE CONTRACT: when there is no presentation (OFF, or a malformed one that was refused), this returns
 * `text` ITSELF, so byte-identity with production is a property of the code path rather than of a careful
 * re-rendering.
 *
 * @param {string} text the task text the host composed
 * @param {unknown} presentation the received presentation (may be absent/malformed)
 * @returns {{ text: string, placed: boolean, state: string, detail: string | null, sectionBytes: number, sectionDigest: string | null }}
 */
export function applyTrajectoryPresentation(text, presentation) {
  if (presentation === undefined || presentation === null) {
    return { text, placed: false, state: 'DELIVERY_DISABLED', detail: null, sectionBytes: 0, sectionDigest: null };
  }
  const verdict = validatePresentation(presentation);
  if (!verdict.ok) {
    return { text, placed: false, state: 'DELIVERY_PRECONDITION_NOT_MET', detail: verdict.detail, sectionBytes: 0, sectionDigest: null };
  }
  const section = verdict.presentation;
  return {
    text: `${text}\n\n${section.sectionText}`,
    placed: true,
    state: section.mode === 'CONTROL' ? 'CONTROL_SECTION_RENDERED' : 'SECTION_RENDERED',
    detail: null,
    sectionBytes: section.sectionBytes,
    sectionDigest: section.sectionDigest,
  };
}

/** §7.8: the full UserMessage digest rule — SHA-256 over the raw UTF-8 bytes of the FINAL message text. */
export function userMessageDigest(text) {
  return rawDigest(text);
}

/** §7.8: the section digest rule — SHA-256 over the raw UTF-8 bytes of a rendered section. */
export function sectionDigestOf(text) {
  return rawDigest(text);
}
