// palimpsest-dsh-host/index-metadata — THE R2-M EXPERIMENTAL DECISION-RELEVANCE SEAM.
//
// WHAT THIS IS. R2-M asks the question R2-U left open and R2-E deliberately removed: does giving a worker
// DECISION-RELEVANT, owner-grounded metadata about ALREADY-SELECTED capital increase VOLUNTARY use of the
// governed pull channel? R2-U measured a prose affordance and found NOT_IMPROVED (1/40 governed pulls;
// 0/10 in the explicit-review capital-present arm). R2-E then guaranteed consumption host-side and found
// the capital works when consumed. R2-M is the third question: can the worker be given enough information
// to decide FOR ITSELF that a pull is worth its cost?
//
// WHAT IT IS NOT. It is NOT product semantics. It changes NOTHING about what is selected, what a body is,
// how a pull resolves, or what a handle authorizes. It changes only the BYTES OF THE INDEX the worker sees
// before it decides. In `off` and `m0` this module is inert and the prompt is byte-identical to production.
//
// THE TWO ARMS:
//
//   M0  exactly the current production presentation: `[kind] handle`, nothing else.
//   M1  the same selected capital, the same handles, the same bodies, plus owner-grounded decision
//       metadata: the compile-time standing/freshness/activity the owner already recorded, the neutral
//       fact that the item was selected for this attempt, and a BOUNDED DETERMINISTIC projection of one
//       existing canonical human-readable content field.
//
// WHAT M1 MAY NOT CONTAIN (this is the whole experiment's validity):
//
//   · no relevance / priority / salience score — no owner exists for one (§12 of the constitution);
//   · no `why-this-attempt` inference — the only owner fact is the constant `explicit_request`;
//   · no new prose review clause and no rewritten tool description — R2-U already measured prose, and
//     re-introducing it would confound the metadata treatment with the one already found ineffective;
//   · no LLM summary, no keyword extraction, no clause ranking, no sentence reordering.
//
// THE PROJECTION IS A TRUNCATION AND NOTHING ELSE. One canonical human-readable field per kind, CRLF
// normalised, outer whitespace trimmed, first N Unicode code points retained, one fixed marker appended if
// it was cut. The algorithm is frozen in the protocol before any worker runs and is identical for every
// item of the same kind.
//
// WHY PROCEDURE IS DIFFERENT (§8 of the ruling). Proof and Reasoning expose a HOST-PROJECTED preview of a
// body the host had to fetch. Procedure exposes OWNER-DECLARED fields — `applicability` and `limitations`
// are first-class required ProcedureContent fields. But they live INSIDE `revision.content`, so they too
// require a governed body fetch before they can be shown. Both provenances are therefore recorded
// separately for every rendered field: `semantic_provenance` (who decided the meaning) and
// `materialization_provenance` (how the bytes were obtained).
//
// PLAIN JAVASCRIPT. `host/**` is scanned by the architecture checker as JavaScript.

import { createHash } from 'node:crypto';

/** The index-metadata modes. `off` is the default and must leave the prompt byte-identical to production. */
export const INDEX_METADATA_MODES = Object.freeze({ OFF: 'off', M0: 'm0', M1: 'm1' });

/** The environment variable that selects the mode. Absent or unrecognized ⇒ OFF (never a silent arm). */
export const INDEX_METADATA_ENV = 'PALIMPSEST_R2M_INDEX';

/** §5: the one label for how M1 material was produced. Not product semantics. */
export const PREVIEW_MECHANISM = 'EXPERIMENTAL_HOST_DERIVED_PREVIEW';

/**
 * §11: the Procedure presentation ruling, chosen ONCE during GATE A from semantic consistency and
 * information budget — never from stochastic uptake.
 *
 *   P-A  Procedure shows applicability + limitations only (its own declared decision surface)
 *   P-B  Procedure additionally receives a bounded method-body preview like Proof/Reasoning
 *
 * P-A is chosen. `applicability` and `limitations` are fields the Procedure OWNER declares and requires to
 * be non-empty; they are the method's own stated scope. Adding a host-projected truncation of the method
 * body would mix a host-projected surface into an owner-declared one and blur exactly the provenance
 * distinction §8 requires the analysis to keep visible.
 */
export const PROCEDURE_RULING = 'P-A';

/**
 * §13: the per-field content budget, in Unicode code points. Frozen before primary trials and never
 * increased after seeing worker behaviour.
 */
export const PREVIEW_BUDGET = Object.freeze({
  proof: 160,
  reasoning: 160,
  procedureApplicability: 120,
  procedureLimitations: 120,
});

/** §12: the one fixed truncation marker, appended only when content was actually cut. */
export const TRUNCATION_MARKER = '\u2026';

/** §8: semantic provenance — who decided what the field MEANS. */
export const SEMANTIC_PROVENANCE = Object.freeze({
  PROOF: 'HOST_PROJECTED_FROM_OWNER_CONTENT',
  REASONING: 'HOST_PROJECTED_FROM_OWNER_CONTENT',
  PROCEDURE: 'OWNER_DECLARED',
});

/** §8: materialization provenance — how the bytes were obtained. Identical for all three kinds. */
export const MATERIALIZATION_PROVENANCE = 'GOVERNED_BODY_FETCH';

/** §9/§10/§11: the ONE canonical human-readable content field each kind projects from. */
export const PREVIEW_FIELD = Object.freeze({ proof: 'statement', reasoning: 'statement', procedure: 'applicability+limitations' });

/**
 * Resolve the mode from an environment value.
 *
 * FAIL-SAFE TOWARD PRODUCTION: an unset, empty or unrecognized value yields `off`, because the experiment
 * must never be switched on by accident and a typo must not turn an ordinary deployment into a trial arm.
 *
 * @param {string | undefined} value
 * @returns {string} one of INDEX_METADATA_MODES
 */
export function resolveIndexMetadataMode(value) {
  if (value === INDEX_METADATA_MODES.M0) return INDEX_METADATA_MODES.M0;
  if (value === INDEX_METADATA_MODES.M1) return INDEX_METADATA_MODES.M1;
  return INDEX_METADATA_MODES.OFF;
}

/**
 * §12: THE FROZEN PROJECTION ALGORITHM.
 *
 *   1. take the existing canonical human-readable content field
 *   2. normalise CRLF → LF
 *   3. trim outer whitespace only
 *   4. retain the first N Unicode code points
 *   5. if truncated, append one fixed truncation marker
 *
 * Nothing else. No summary, no extraction, no ranking, no reordering, no keyword selection.
 *
 * @param {unknown} value the owner field
 * @param {number} maxCodePoints the frozen per-field bound
 * @returns {{ text: string, truncated: boolean, contentCodePoints: number, renderedCodePoints: number }}
 */
export function boundedText(value, maxCodePoints) {
  const source = value === undefined || value === null ? '' : String(value);
  const normalized = source.replace(/\r\n/gu, '\n').trim();
  const codePoints = [...normalized];
  /** A digest of the SOURCE field, pre-truncation. A digest is not the body, so it is safe to record. */
  const sourceDigest = textDigest(normalized);
  if (codePoints.length <= maxCodePoints) {
    return Object.freeze({ text: normalized, truncated: false, contentCodePoints: codePoints.length, renderedCodePoints: codePoints.length, sourceDigest });
  }
  const kept = codePoints.slice(0, maxCodePoints).join('');
  const text = `${kept}${TRUNCATION_MARKER}`;
  return Object.freeze({ text, truncated: true, contentCodePoints: codePoints.length, renderedCodePoints: maxCodePoints + TRUNCATION_MARKER.length, sourceDigest });
}

/** A stable digest of any string, used for source and preview digests. */
export function textDigest(text) {
  return createHash('sha256').update(String(text), 'utf8').digest('hex');
}

/** The body of one governed pull, read from the resolver's own result shape. */
function bodyOf(value) {
  if (value === undefined || value === null) return undefined;
  return value.body ?? value.claim ?? undefined;
}

/**
 * Build ONE M1 entry from a resolved governed pull.
 *
 * The `binding` half carries the compile-time owner facts the manifest already froze; the `body` half
 * carries the owner content the governed resolver just materialized. Nothing is invented, and nothing is
 * read outside the attempt-bound route that produced `value`.
 *
 * @param {{ handle: string, kind: string }} selected
 * @param {unknown} value the resolver's result for this handle
 * @returns {object} the entry, with bodies excluded
 */
export function deriveIndexEntry(selected, value) {
  const binding = (value && typeof value === 'object' && value.binding !== undefined && value.binding !== null ? value.binding : {}) ?? {};
  const body = bodyOf(value);
  const handle = selected.handle;
  const kind = selected.kind;

  if (kind === 'proof') {
    const raw = body !== undefined && body !== null && typeof body === 'object' ? body.statement : undefined;
    const preview = boundedText(raw, PREVIEW_BUDGET.proof);
    return Object.freeze({
      handle,
      kind,
      status: Object.freeze({ standingAtCompile: String(binding.standing_at_compile ?? 'UNKNOWN'), freshnessAtCompile: String(binding.freshness_at_compile ?? 'UNKNOWN') }),
      fields: Object.freeze([
        Object.freeze({ name: 'Preview', semanticProvenance: SEMANTIC_PROVENANCE.PROOF, materializationProvenance: MATERIALIZATION_PROVENANCE, sourceField: PREVIEW_FIELD.proof, ...preview }),
      ]),
      derived: true,
    });
  }

  if (kind === 'reasoning') {
    const raw = body !== undefined && body !== null && typeof body === 'object' ? body.statement : undefined;
    const preview = boundedText(raw, PREVIEW_BUDGET.reasoning);
    return Object.freeze({
      handle,
      kind,
      status: Object.freeze({ activeAtCompile: binding.active_at_compile === true ? 'true' : String(binding.active_at_compile ?? 'UNKNOWN') }),
      fields: Object.freeze([
        Object.freeze({ name: 'Preview', semanticProvenance: SEMANTIC_PROVENANCE.REASONING, materializationProvenance: MATERIALIZATION_PROVENANCE, sourceField: PREVIEW_FIELD.reasoning, ...preview }),
      ]),
      derived: true,
    });
  }

  if (kind === 'procedure') {
    const applicability = body !== undefined && body !== null && Array.isArray(body.applicability) ? body.applicability.join('; ') : undefined;
    const limitations = body !== undefined && body !== null && Array.isArray(body.limitations) ? body.limitations.join('; ') : undefined;
    const applicabilityPreview = boundedText(applicability, PREVIEW_BUDGET.procedureApplicability);
    const limitationsPreview = boundedText(limitations, PREVIEW_BUDGET.procedureLimitations);
    return Object.freeze({
      handle,
      kind,
      status: Object.freeze({
        standingAtCompile: String(binding.standing_at_compile ?? 'UNKNOWN'),
        revision: binding.procedure_revision === undefined ? 'UNKNOWN' : String(binding.procedure_revision),
      }),
      fields: Object.freeze([
        Object.freeze({ name: 'Applicability', semanticProvenance: SEMANTIC_PROVENANCE.PROCEDURE, materializationProvenance: MATERIALIZATION_PROVENANCE, sourceField: 'applicability', ...applicabilityPreview }),
        Object.freeze({ name: 'Limitations', semanticProvenance: SEMANTIC_PROVENANCE.PROCEDURE, materializationProvenance: MATERIALIZATION_PROVENANCE, sourceField: 'limitations', ...limitationsPreview }),
      ]),
      derived: true,
    });
  }

  return Object.freeze({ handle, kind, status: Object.freeze({}), fields: Object.freeze([]), derived: false });
}

/** The status lines of one entry, in a fixed order per kind so the bytes are deterministic. */
function statusLines(entry) {
  const lines = [];
  if (entry.kind === 'proof') {
    lines.push(`    Standing at compile: ${entry.status.standingAtCompile}`);
    lines.push(`    Freshness: ${entry.status.freshnessAtCompile}`);
  } else if (entry.kind === 'reasoning') {
    lines.push(`    Active at compile: ${entry.status.activeAtCompile}`);
  } else if (entry.kind === 'procedure') {
    lines.push(`    Standing at compile: ${entry.status.standingAtCompile}`);
    lines.push(`    Revision: ${entry.status.revision}`);
  }
  return lines;
}

/** Render ONE entry as its M1 block. Deterministic: no sorting, no filtering, no per-kind variation. */
export function renderIndexEntry(entry) {
  const lines = [`  [${entry.kind}] ${entry.handle}`];
  lines.push(...statusLines(entry));
  lines.push('    Selected for this attempt: true');
  for (const field of entry.fields) lines.push(`    ${field.name}: ${field.text}`);
  lines.push(`    Handle: ${entry.handle}`);
  return lines;
}

/**
 * §6: replace ONLY the entry lines of the production index with the M1 entries.
 *
 * The heading, the empty-case line and the two trailing instruction lines are left byte-identical, so the
 * difference between M0 and M1 is exactly the per-entry presentation and nothing else. An index with no
 * entries is returned unchanged.
 *
 * @param {string} productionIndexText the production section the host already composed
 * @param {readonly object[]} entries the derived M1 entries, in compiled order
 * @returns {string} the M1 index section
 */
export function renderIndexMetadata(productionIndexText, entries) {
  /**
   * §6/§19: NO ENTRIES ⇒ NO CHANGE. This is the identity case, and it must be the IDENTITY rather than a
   * re-render: an index with no entries has no entry lines to replace, and returning a reconstructed string
   * would make the M0 arm's "byte-identical to production" property depend on the re-render being faithful
   * instead of on nothing having happened.
   */
  if (!Array.isArray(entries) || entries.length === 0) return productionIndexText;
  const lines = String(productionIndexText ?? '').split('\n');
  const firstEntry = lines.findIndex((line) => /^ {2}\[/u.test(line));
  if (firstEntry === -1) return productionIndexText;
  let lastEntry = firstEntry;
  while (lastEntry + 1 < lines.length && /^ {2}\[/u.test(lines[lastEntry + 1])) lastEntry += 1;
  const rendered = entries.flatMap((entry) => renderIndexEntry(entry));
  return [...lines.slice(0, firstEntry), ...rendered, ...lines.slice(lastEntry + 1)].join('\n');
}

/** A stable digest of the rendered index section, recorded per trial so the presentation is checkable. */
export function indexSectionDigest(section) {
  return textDigest(section);
}

/**
 * §14: THE PREVIEW MANIFEST ENTRY for one rendered field. It carries what a reviewer needs to prove the
 * preview is bounded and traceable WITHOUT carrying the body: the handle, the kind, both provenances, the
 * source digest, the rendered digest, the rendered length and whether it was truncated.
 */
export function manifestEntry(entry) {
  return entry.fields.map((field) => Object.freeze({
    handle: entry.handle,
    kind: entry.kind,
    field: field.name,
    semanticProvenance: field.semanticProvenance,
    materializationProvenance: field.materializationProvenance,
    sourceField: field.sourceField,
    sourceDigest: field.sourceDigest,
    renderedPreviewDigest: textDigest(field.text),
    renderedCodePoints: field.renderedCodePoints,
    contentCodePoints: field.contentCodePoints,
    truncated: field.truncated,
  }));
}
