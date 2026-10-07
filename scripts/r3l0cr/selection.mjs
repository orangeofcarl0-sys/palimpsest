/**
 * R3-L0C-R §4/§5/§6 — THE CANONICAL SELECTION BUILDER.
 *
 * §4 determined the case: `HARNESS_BYPASSED_TYPED_API`. The boundary is a typed in-process contract whose type
 * REJECTS the escaped shape (`TS2353`), and the harness bypassed it by being plain JavaScript. §4 therefore says
 * explicitly NOT to change product behaviour, and to make the harness use a canonical builder instead.
 *
 * THIS BUILDER IS THAT CANONICAL PATH, and it is FAIL-CLOSED in the three ways §4 and §5 require:
 *
 *   · it REJECTS an unknown key, rather than ignoring it;
 *   · it REJECTS a malformed value shape, rather than coercing it;
 *   · it NEVER converts a malformed non-empty selection into an empty selection.
 *
 * WHY FAIL-CLOSED IS THE WHOLE POINT. The escaped defect was not that the harness sent the wrong field — it is
 * that the wrong field was INDISTINGUISHABLE FROM NO FIELD. `knowledgeRequestIsEmpty({handles:[...]})` returns
 * `true`, so a request that intended to select two handles compiled none and reported success. A validator that
 * refused the shape would have stopped the run before trial 1.
 *
 * IT IS A HARNESS MODULE, NOT A PRODUCT ONE. It imports nothing from `src/**`, registers nothing, creates no
 * canonical owner, and changes no product semantics. The product's own type remains the authority; this module
 * is the harness's way of obeying it.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */

const NL = String.fromCharCode(10);

/** §4: the three supported owner kinds. A selection carrying anything else is refused. */
export const SUPPORTED_KINDS = Object.freeze(['proof', 'reasoning', 'procedure']);

/** §4: the exact field shape each kind requires. */
export const KIND_FIELDS = Object.freeze({
  proof: Object.freeze(['claimId']),
  reasoning: Object.freeze(['cellId', 'claimId']),
  procedure: Object.freeze(['procedureId', 'revision', 'reason']),
});

/** §5: the refusal codes. */
export const SELECTION_REFUSALS = Object.freeze({
  UNKNOWN_KEY: 'INVALID_SELECTION_SHAPE',
  MALFORMED_ITEM: 'INVALID_SELECTION_ITEM',
  UNSUPPORTED_KIND: 'UNSUPPORTED_SELECTION_KIND',
  NOT_AN_OBJECT: 'INVALID_SELECTION_TYPE',
  EMPTY_AFTER_VALIDATION: 'EMPTY_SELECTION_WITH_INTENT',
});

/**
 * §4/§5: THE REFUSAL.
 *
 * It carries the offending key or field so a failure names what was wrong, rather than only that something was.
 */
export class SelectionContractRefusal extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = 'SelectionContractRefusal';
    this.code = code;
    this.detail = detail;
  }
}

function refuse(code, detail) {
  throw new SelectionContractRefusal(code, detail);
}

/**
 * §4: VALIDATE A SELECTION REQUEST, FAIL-CLOSED.
 *
 * Returns the request unchanged when it is valid, so a caller can use the result directly. `undefined` and an
 * object with no items are BOTH valid, because §7.4 of the product contract makes an absent selection a
 * legitimate state — the H arm depends on it.
 */
export function validateSelection(request) {
  if (request === undefined || request === null) return undefined;
  if (typeof request !== 'object' || Array.isArray(request)) {
    refuse(SELECTION_REFUSALS.NOT_AN_OBJECT, `a selection must be a plain object or undefined, received ${Array.isArray(request) ? 'an array' : typeof request}`);
  }
  /**
   * §4: AN UNKNOWN KEY IS REFUSED.
   *
   * This is the exact check the escaped defect needed. `handles` is not a supported kind, and the product would
   * have silently ignored it; the builder refuses it instead.
   */
  const unknown = Object.keys(request).filter((key) => !SUPPORTED_KINDS.includes(key));
  if (unknown.length > 0) {
    refuse(
      SELECTION_REFUSALS.UNKNOWN_KEY,
      `the selection carries unsupported key(s) [${unknown.join(', ')}]; the supported kinds are [${SUPPORTED_KINDS.join(', ')}]. An unsupported key is REFUSED rather than ignored, because the product would treat the request as empty and the caller would see a successful selection that compiled nothing.`,
    );
  }
  for (const kind of SUPPORTED_KINDS) {
    const items = request[kind];
    if (items === undefined) continue;
    if (!Array.isArray(items)) {
      refuse(SELECTION_REFUSALS.MALFORMED_ITEM, `"${kind}" must be an array, received ${typeof items}`);
    }
    for (const [index, item] of items.entries()) {
      if (item === null || typeof item !== 'object' || Array.isArray(item)) {
        refuse(SELECTION_REFUSALS.MALFORMED_ITEM, `"${kind}[${String(index)}]" must be an object, received ${item === null ? 'null' : Array.isArray(item) ? 'an array' : typeof item}`);
      }
      const required = KIND_FIELDS[kind];
      const extra = Object.keys(item).filter((key) => !required.includes(key));
      if (extra.length > 0) {
        refuse(SELECTION_REFUSALS.MALFORMED_ITEM, `"${kind}[${String(index)}]" carries unsupported field(s) [${extra.join(', ')}]; it must carry exactly [${required.join(', ')}]`);
      }
      for (const field of required) {
        if (!(field in item)) {
          refuse(SELECTION_REFUSALS.MALFORMED_ITEM, `"${kind}[${String(index)}]" is missing required field "${field}"`);
        }
      }
      if (kind === 'procedure' && typeof item.revision !== 'number') {
        refuse(SELECTION_REFUSALS.MALFORMED_ITEM, `"procedure[${String(index)}].revision" must be a number, received ${typeof item.revision}`);
      }
      for (const field of required.filter((name) => name !== 'revision')) {
        if (typeof item[field] !== 'string' || item[field] === '') {
          refuse(SELECTION_REFUSALS.MALFORMED_ITEM, `"${kind}[${String(index)}].${field}" must be a non-empty string`);
        }
      }
    }
  }
  return request;
}

/** §4: whether a validated request carries no items at all, which is the legitimate absent state. */
export function selectionIsEmpty(request) {
  if (request === undefined || request === null) return true;
  return SUPPORTED_KINDS.every((kind) => (request[kind]?.length ?? 0) === 0);
}

/** §4: the total item count of a validated request. */
export function selectionItemCount(request) {
  if (request === undefined || request === null) return 0;
  return SUPPORTED_KINDS.reduce((total, kind) => total + (request[kind]?.length ?? 0), 0);
}

/**
 * §6: BUILD A SELECTION FROM OWNER REFS.
 *
 * The harness's ONLY way to construct a selection. It takes the admitted refs and the generation's declared
 * exposures and produces the owner-kind shape, then VALIDATES it — so the harness cannot emit a shape the
 * product would silently ignore.
 */
export function buildSelection(input) {
  const { arm, generationId, admittedRefs, generationExposures } = input;
  /** §6/§9: the H arm is the ABSENCE of a selection, and that is not the same as an empty one. */
  if (arm === 'H') return undefined;
  const exposed = new Set(generationExposures[generationId] ?? []);
  const selected = admittedRefs.filter((entry) => exposed.has(entry.invariant));
  const request = {
    proof: selected.filter((entry) => entry.kind === 'PROOF_CLAIM').map((entry) => ({ claimId: entry.ref.claimId })),
    reasoning: selected.filter((entry) => entry.kind === 'REASONING_CLAIM').map((entry) => ({ cellId: entry.ref.cellId, claimId: entry.ref.claimId })),
    procedure: selected.filter((entry) => entry.kind === 'PROCEDURE').map((entry) => ({ procedureId: entry.ref.procedureId, revision: entry.ref.revision, reason: entry.ref.reason })),
  };
  /**
   * §5: AN EMPTY RESULT FOR A GENERATION THAT EXPOSES INVARIANTS IS REFUSED.
   *
   * This is the check that would have caught Run 1 from the harness side: if the refs do not match the
   * generation's exposures, the builder produces zero items, and a C generation with zero items is a harness
   * wiring failure rather than a legitimate absent selection.
   */
  if (selectionIsEmpty(request) && exposed.size > 0) {
    refuse(SELECTION_REFUSALS.EMPTY_AFTER_VALIDATION, `the ${arm} selection for ${generationId} is empty although the generation exposes [${[...exposed].join(', ')}]; a C generation with no items is a harness wiring failure`);
  }
  return validateSelection(request);
}

/** §4: the number of real-model launches a refusal is allowed to permit. Always zero. */
export const REAL_MODEL_LAUNCHES_ON_REFUSAL = 0;

/**
 * §5: RUN A SELECTION THROUGH THE BUILDER AND REPORT THE OUTCOME WITHOUT THROWING.
 *
 * The mutation test needs to observe a refusal as a VALUE, so this wrapper converts the refusal into a result.
 * The launch count is part of the result, because §5 requires the mutation to prove that zero real-model launches
 * occurred.
 */
export function attemptSelection(build) {
  try {
    const request = build();
    return Object.freeze({
      ok: true,
      request,
      refusal: null,
      realModelLaunchCount: 0,
      TREATMENT_REALIZATION_GATE: 'PASS',
      items: selectionItemCount(request),
    });
  } catch (error) {
    const refusal = error instanceof SelectionContractRefusal ? error.code : 'UNEXPECTED_ERROR';
    return Object.freeze({
      ok: false,
      request: null,
      refusal,
      detail: String(error?.detail ?? error?.message ?? error).slice(0, 300),
      realModelLaunchCount: REAL_MODEL_LAUNCHES_ON_REFUSAL,
      TREATMENT_REALIZATION_GATE: 'FAIL',
      items: 0,
    });
  }
}

export { NL };
