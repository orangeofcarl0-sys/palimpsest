/**
 * R3-A0 §7 — CANDIDATE CAPITAL AND THE FROZEN RELATIONSHIP MAPS.
 *
 * §2.4 requires each fixture revision to carry a frozen experimental manifest mapping every failure class to
 * each candidate capital item as `DIRECT`, `TRANSFER_HYPOTHESIS` or `NONE`. That map is EXPERIMENT METADATA,
 * not canonical project truth, and it is frozen BEFORE qualification.
 *
 * §7 forbids optimizing this capital against qualification-model failures. The capital here is derived from
 * MECHANISM REASONING about what each fixture's contract owes its caller — the same basis the fixtures
 * themselves were built from — and its provenance is recorded as `MECHANISM_DERIVATION`, not as an empirical
 * claim. Nothing here is called empirically useful.
 *
 * WHAT `DIRECT` MEANS, precisely: the capital's own recorded method STATES the behaviour the class tests, in
 * the same terms. `TRANSFER_HYPOTHESIS` means the method states a principle from a different domain that a
 * worker might carry across; §2.4 says that does NOT satisfy the treatment-relevance clause by itself.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */

/**
 * §7: the two capital items, one per fixture family. Each is a Procedure — advisory METHOD guidance, never
 * authority — whose clauses are the ordered obligations the mechanism implies.
 */
export const CAPITAL_ITEMS = Object.freeze([
  Object.freeze({
    capitalId: 'cap-fa-atomic-commit',
    appliesToFixture: 'r3a-f-a-atomic-transaction',
    kind: 'procedure',
    title: 'Establish the whole effect before the first effect',
    purpose: 'apply a batch of account updates all-or-nothing to a store the caller keeps using',
    provenance: 'MECHANISM_DERIVATION',
    provenanceNote: 'derived from the atomicity obligation the contract states; not tuned against any model outcome',
    /** The ordered method. Each clause is an obligation the mechanism forces, in the order it forces them. */
    clauses: Object.freeze([
      'validate the whole transaction — every operation, every account id, every amount — before applying anything',
      'reject an amount that is not a positive integer, and reject an account the store does not hold',
      'compute the complete effect of the transaction before the first write, so a refusal leaves the store exactly as it was',
      'apply the operations in their own order, and reject a debit that would take an account below zero at the point it is applied',
      'treat a transaction id the store already records as applied as a no-op, so a retry cannot double-apply',
      'leave every account and applied id the transaction does not name exactly as it was',
    ]),
    applicability: Object.freeze(['a store that is the caller\'s own object and must survive a refusal unchanged']),
    limitations: Object.freeze([
      'does not authorize any command, path or effect beyond the task envelope',
      'advisory guidance only; it cannot widen write scope or allowed commands',
    ]),
  }),
  Object.freeze({
    capitalId: 'cap-fb-compat-migration',
    appliesToFixture: 'r3a-f-b-versioned-migration',
    kind: 'procedure',
    title: 'Migrate forward without discarding what you do not recognize',
    purpose: 'move a versioned document to the current shape while preserving compatibility invariants',
    provenance: 'MECHANISM_DERIVATION',
    provenanceNote: 'derived from the forward-compatibility obligation the contract states; not tuned against any model outcome',
    clauses: Object.freeze([
      'read and validate the declared version before transforming anything, and refuse a version the contract does not define',
      'build a NEW document; never modify the document you were given',
      'carry every field the contract does not define across verbatim, including nested ones',
      'rename the old spelling to the current name, and do not let the old spelling survive',
      'insert a default ONLY when the key is absent; a key that is present and unusable is refused, never repaired',
      'validate a nested value that is present and refuse it when it is not an object',
    ]),
    applicability: Object.freeze(['a document other consumers hold copies of, where an unrecognized field must survive']),
    limitations: Object.freeze([
      'does not authorize any command, path or effect beyond the task envelope',
      'advisory guidance only; it cannot widen write scope or allowed commands',
    ]),
  }),
]);

/**
 * §2.4: THE FROZEN CLASS → CAPITAL RELATIONSHIP MAP.
 *
 * This is the manifest a qualification record reads. It is keyed by fixture, then by failure class, and it
 * names every capital item's relationship. A class with no `DIRECT` entry for any capital is not
 * treatment-relevant for that capital, and cannot satisfy the QC-4 clause on its own.
 */
export const CAPITAL_RELATIONSHIPS = Object.freeze({
  'r3a-f-a-atomic-transaction': Object.freeze({
    FA1: Object.freeze({ 'cap-fa-atomic-commit': 'DIRECT' }),
    FA2: Object.freeze({ 'cap-fa-atomic-commit': 'DIRECT' }),
    FA3: Object.freeze({ 'cap-fa-atomic-commit': 'DIRECT' }),
    FA4: Object.freeze({ 'cap-fa-atomic-commit': 'DIRECT' }),
    FA5: Object.freeze({ 'cap-fa-atomic-commit': 'DIRECT' }),
    FA6: Object.freeze({ 'cap-fa-atomic-commit': 'DIRECT' }),
  }),
  'r3a-f-b-versioned-migration': Object.freeze({
    FB1: Object.freeze({ 'cap-fb-compat-migration': 'DIRECT' }),
    FB2: Object.freeze({ 'cap-fb-compat-migration': 'DIRECT' }),
    FB3: Object.freeze({ 'cap-fb-compat-migration': 'DIRECT' }),
    FB4: Object.freeze({ 'cap-fb-compat-migration': 'DIRECT' }),
    FB5: Object.freeze({ 'cap-fb-compat-migration': 'DIRECT' }),
    FB6: Object.freeze({ 'cap-fb-compat-migration': 'DIRECT' }),
    FB7: Object.freeze({ 'cap-fb-compat-migration': 'DIRECT' }),
  }),
});

/**
 * §2.4/§7: THE CROSS-FAMILY TRANSFER HYPOTHESES.
 *
 * A worker given F-A's method and then handed F-B (or the reverse) might carry the *principle* across. That
 * is recorded as `TRANSFER_HYPOTHESIS` — visible, and explicitly NOT sufficient for the treatment-relevance
 * clause. Recording it keeps the distinction the ruling demands rather than letting "it's about validation"
 * stand in for relevance.
 */
export const TRANSFER_HYPOTHESES = Object.freeze({
  'r3a-f-a-atomic-transaction': Object.freeze({ 'cap-fb-compat-migration': Object.freeze(['FA1', 'FA2']) }),
  'r3a-f-b-versioned-migration': Object.freeze({ 'cap-fa-atomic-commit': Object.freeze(['FB7']) }),
});

/** The capital item declared for a fixture, or undefined when none is declared. */
export function capitalFor(fixtureId) {
  return CAPITAL_ITEMS.find((item) => item.appliesToFixture === fixtureId);
}

/** The classes of a fixture whose relationship to the named capital is DIRECT. */
export function directClasses(fixtureId, capitalId) {
  const map = CAPITAL_RELATIONSHIPS[fixtureId] ?? {};
  return Object.keys(map).filter((classId) => map[classId][capitalId] === 'DIRECT').sort();
}

/** The relationship of one class to one capital, defaulting to NONE. */
export function relationshipOf(fixtureId, classId, capitalId) {
  return CAPITAL_RELATIONSHIPS[fixtureId]?.[classId]?.[capitalId] ?? 'NONE';
}
