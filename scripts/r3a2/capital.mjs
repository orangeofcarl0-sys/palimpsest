/**
 * R3-A2 §"Source/target transfer preparation" — THE CANDIDATE-CAPITAL BLUEPRINTS, THE SOURCE ANALOGUES AND
 * THE FROZEN CLASS → CAPITAL RELATIONSHIP MAPS FOR F-C AND F-D.
 *
 * §"Source/target transfer preparation" requires each new family to freeze, BEFORE baseline execution:
 *
 *   · the source analogue identity;
 *   · the target fixture identity;
 *   · the candidate-capital blueprint;
 *   · the failure-class-to-capital relationship map.
 *
 * The relationships are `DIRECT`, `TRANSFER_HYPOTHESIS` or `NONE`, and they are frozen HERE rather than
 * inferred after seeing baseline failures. §"Source/target transfer preparation" is explicit that they must
 * not be inferred post hoc.
 *
 * WHAT `DIRECT` MEANS, precisely: the capital's own recorded method STATES the behaviour the class tests, in
 * the same terms. `TRANSFER_HYPOTHESIS` means the method states a principle from a DIFFERENT domain that a
 * worker might carry across; it does NOT satisfy the treatment-relevance clause by itself.
 *
 * PROVENANCE. Every blueprint here is `MECHANISM_DERIVATION`: derived from the obligation the fixture's own
 * contract states, on the same basis the fixtures themselves were built from. Nothing here is called
 * empirically useful, and no clause was tuned against any model outcome.
 *
 * §"Fusion ruling": these blueprints are EXPERIMENT RESEARCH METADATA. They are not canonical owner types,
 * not project truth, and they introduce no new authority mechanism.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */

/* ---------------------------------------------------------------- the source analogues */

/**
 * §"Source/target transfer preparation": THE SOURCE ANALOGUES.
 *
 * Each new family declares a source task in ANOTHER SURFACE DOMAIN that carries the SAME mechanism. The
 * analogue is a RECORD — an identity, a domain, and the mechanism correspondence — not a third fixture. It
 * exists so a future transferable-capital stage can build a source fixture without re-deriving the mechanism,
 * and so this stage's DIRECT/TRANSFER claims have a stated basis.
 */
export const SOURCE_ANALOGUES = Object.freeze([
  Object.freeze({
    sourceAnalogueId: 'src-role-permission-inheritance',
    forTargetFixture: 'r3a-f-c-policy-resolution',
    surfaceDomain: 'identity / authorization',
    name: 'role and permission inheritance resolution',
    mechanism: 'validate graph -> detect invalid references/cycles -> compute closure -> apply declared precedence -> canonicalize',
    /** The target fixture is the SAME mechanism in a different surface domain. */
    targetSurfaceDomain: 'feature / policy inheritance',
    mechanismCorrespondence: Object.freeze([
      Object.freeze({ sourceStep: 'a role that grants a role that grants it back', targetStep: 'a node whose inheritance edges form a cycle', sharedMechanism: 'cycle detection over the inheritance edges' }),
      Object.freeze({ sourceStep: 'a role naming a permission that does not exist', targetStep: 'an inherits entry naming a node the graph does not define', sharedMechanism: 'invalid-reference rejection' }),
      Object.freeze({ sourceStep: 'a permission granted by a nearer role', targetStep: 'a policy declared nearer in the inherits list', sharedMechanism: 'declared precedence over the closure' }),
      Object.freeze({ sourceStep: 'the effective permission set of a role', targetStep: 'the effective policy set of a node', sharedMechanism: 'closure computation with canonical output' }),
    ]),
    /** §"Source/target transfer preparation": frozen before baseline execution, not after. */
    frozenBefore: 'any R3-A2 baseline worker run',
  }),
  Object.freeze({
    sourceAnalogueId: 'src-media-type-negotiation',
    forTargetFixture: 'r3a-f-d-rule-resolution',
    surfaceDomain: 'content negotiation / protocol',
    name: 'media-type and Accept-header negotiation',
    mechanism: 'normalize -> validate -> rank specificity -> resolve ambiguity -> canonicalize',
    targetSurfaceDomain: 'request routing / rule resolution',
    mechanismCorrespondence: Object.freeze([
      Object.freeze({ sourceStep: 'a media type written in another case or with parameters', targetStep: 'a rule or request written in another case', sharedMechanism: 'normalization before matching' }),
      Object.freeze({ sourceStep: 'a specific media type outranking a wildcard range', targetStep: 'a more specific rule outranking a wider one', sharedMechanism: 'specificity ranking' }),
      Object.freeze({ sourceStep: 'two ranges that match equally well', targetStep: 'two rules tying at the top specificity', sharedMechanism: 'ambiguity rejection rather than first-match' }),
      Object.freeze({ sourceStep: 'a wildcard range that must not span a boundary', targetStep: 'a `*` segment that matches exactly one segment', sharedMechanism: 'segment boundary semantics' }),
    ]),
    frozenBefore: 'any R3-A2 baseline worker run',
  }),
]);

/** The source analogue declared for a target fixture, or undefined. */
export function sourceAnalogueFor(fixtureId) {
  return SOURCE_ANALOGUES.find((entry) => entry.forTargetFixture === fixtureId);
}

/* ---------------------------------------------------------------- the candidate capital */

/**
 * §"Source/target transfer preparation": THE TWO NEW CAPITAL BLUEPRINTS, one per family.
 *
 * Each is a Procedure — advisory METHOD guidance, never authority — whose clauses are the ordered obligations
 * the mechanism implies. The clauses are derived from the contract each fixture states, in the order the
 * mechanism forces them.
 */
export const PORTFOLIO_CAPITAL_ITEMS = Object.freeze([
  Object.freeze({
    capitalId: 'cap-fc-graph-closure',
    appliesToFixture: 'r3a-f-c-policy-resolution',
    kind: 'procedure',
    title: 'Refuse the graph before you resolve it, then let the nearer declaration win',
    purpose: 'resolve the effective policies of every node in an inheritance graph whose edges carry a declared precedence',
    provenance: 'MECHANISM_DERIVATION',
    provenanceNote: 'derived from the closure, precedence and well-formedness obligations the F-C contract states; not tuned against any model outcome',
    sourceAnalogueId: 'src-role-permission-inheritance',
    clauses: Object.freeze([
      'validate the whole graph first — every node, and every inherits entry — and refuse an entry that names a node the graph does not define, at any depth',
      'detect a cycle in the inheritance edges, including a node that inherits itself, and refuse the graph rather than resolving it',
      'compute each node\'s inherited closure before writing any effective policy, so a refusal leaves no partial result',
      'let a node\'s OWN declaration win over anything it inherits; between two inherited declarations of one name, let the one reached through the EARLIER inherits entry win',
      'treat a repeated inherits entry as the same edge, so it changes neither the effective policies nor the order',
      'emit the nodes so that every parent precedes its children, breaking a tie between ready nodes by the lexicographically smaller id',
      'a node\'s effective policies contain only policies from its own inherited closure, so two components that share no edge share no policy',
    ]),
    applicability: Object.freeze(['a declared inheritance graph whose edges carry a precedence order and whose closure must be canonical']),
    limitations: Object.freeze([
      'does not authorize any command, path or effect beyond the task envelope',
      'advisory guidance only; it cannot widen write scope or allowed commands',
    ]),
  }),
  Object.freeze({
    capitalId: 'cap-fd-rule-specificity',
    appliesToFixture: 'r3a-f-d-rule-resolution',
    kind: 'procedure',
    title: 'Normalize first, then let the most specific match win — and refuse a tie',
    purpose: 'select the single rule that applies to a request, under a declared specificity order',
    provenance: 'MECHANISM_DERIVATION',
    provenanceNote: 'derived from the normalization, specificity and ambiguity obligations the F-D contract states; not tuned against any model outcome',
    sourceAnalogueId: 'src-media-type-negotiation',
    clauses: Object.freeze([
      'normalize the rule and the request BEFORE matching: trim the surrounding whitespace and compare letters case-insensitively',
      'rank a match by its specificity, not by the order the rules were written in: a rule that names a host outranks one that matches any host, and a literal segment outranks a wildcard one',
      'a wildcard segment matches EXACTLY one non-empty segment — never zero, never more than one, and never across a separator',
      'two rules whose match is identical after normalization are the SAME rule, and are not a tie',
      'refuse a rule set that binds one id to two different matches, rather than choosing between them',
      'when two DIFFERENT rules tie at the highest specificity, refuse the request as ambiguous rather than resolving it by order',
    ]),
    applicability: Object.freeze(['a rule set whose entries carry a declared specificity and whose selection must be canonical']),
    limitations: Object.freeze([
      'does not authorize any command, path or effect beyond the task envelope',
      'advisory guidance only; it cannot widen write scope or allowed commands',
    ]),
  }),
]);

/** The capital item declared for a fixture, or undefined. */
export function portfolioCapitalFor(fixtureId) {
  return PORTFOLIO_CAPITAL_ITEMS.find((item) => item.appliesToFixture === fixtureId);
}

/* ---------------------------------------------------------------- the frozen relationship map */

/**
 * §"Source/target transfer preparation": THE FROZEN CLASS → CAPITAL RELATIONSHIP MAP FOR THE NEW FAMILIES.
 *
 * Frozen BEFORE baseline execution. A class with no `DIRECT` entry for a capital is not treatment-relevant for
 * that capital and cannot satisfy the QC-4 clause on its own.
 *
 * The map deliberately covers the CROSS-family pairs as well, so a future transferable-capital stage reads a
 * declared relationship rather than a guess. Cross-family entries are `TRANSFER_HYPOTHESIS` where a principle
 * genuinely carries and `NONE` where it does not.
 */
export const PORTFOLIO_CAPITAL_RELATIONSHIPS = Object.freeze({
  'r3a-f-c-policy-resolution': Object.freeze({
    FC1: Object.freeze({ 'cap-fc-graph-closure': 'DIRECT', 'cap-fd-rule-specificity': 'NONE', 'cap-fa-atomic-commit': 'NONE', 'cap-fb-compat-migration': 'NONE' }),
    FC2: Object.freeze({ 'cap-fc-graph-closure': 'DIRECT', 'cap-fd-rule-specificity': 'NONE', 'cap-fa-atomic-commit': 'TRANSFER_HYPOTHESIS', 'cap-fb-compat-migration': 'TRANSFER_HYPOTHESIS' }),
    FC3: Object.freeze({ 'cap-fc-graph-closure': 'DIRECT', 'cap-fd-rule-specificity': 'TRANSFER_HYPOTHESIS', 'cap-fa-atomic-commit': 'NONE', 'cap-fb-compat-migration': 'NONE' }),
    FC4: Object.freeze({ 'cap-fc-graph-closure': 'DIRECT', 'cap-fd-rule-specificity': 'NONE', 'cap-fa-atomic-commit': 'TRANSFER_HYPOTHESIS', 'cap-fb-compat-migration': 'NONE' }),
    FC5: Object.freeze({ 'cap-fc-graph-closure': 'DIRECT', 'cap-fd-rule-specificity': 'TRANSFER_HYPOTHESIS', 'cap-fa-atomic-commit': 'NONE', 'cap-fb-compat-migration': 'NONE' }),
    FC6: Object.freeze({ 'cap-fc-graph-closure': 'DIRECT', 'cap-fd-rule-specificity': 'NONE', 'cap-fa-atomic-commit': 'NONE', 'cap-fb-compat-migration': 'NONE' }),
  }),
  'r3a-f-d-rule-resolution': Object.freeze({
    FD1: Object.freeze({ 'cap-fd-rule-specificity': 'DIRECT', 'cap-fc-graph-closure': 'NONE', 'cap-fa-atomic-commit': 'NONE', 'cap-fb-compat-migration': 'NONE' }),
    FD2: Object.freeze({ 'cap-fd-rule-specificity': 'DIRECT', 'cap-fc-graph-closure': 'TRANSFER_HYPOTHESIS', 'cap-fa-atomic-commit': 'NONE', 'cap-fb-compat-migration': 'NONE' }),
    FD3: Object.freeze({ 'cap-fd-rule-specificity': 'DIRECT', 'cap-fc-graph-closure': 'TRANSFER_HYPOTHESIS', 'cap-fa-atomic-commit': 'NONE', 'cap-fb-compat-migration': 'NONE' }),
    FD4: Object.freeze({ 'cap-fd-rule-specificity': 'DIRECT', 'cap-fc-graph-closure': 'NONE', 'cap-fa-atomic-commit': 'TRANSFER_HYPOTHESIS', 'cap-fb-compat-migration': 'NONE' }),
    FD5: Object.freeze({ 'cap-fd-rule-specificity': 'DIRECT', 'cap-fc-graph-closure': 'NONE', 'cap-fa-atomic-commit': 'TRANSFER_HYPOTHESIS', 'cap-fb-compat-migration': 'NONE' }),
    FD6: Object.freeze({ 'cap-fd-rule-specificity': 'DIRECT', 'cap-fc-graph-closure': 'NONE', 'cap-fa-atomic-commit': 'NONE', 'cap-fb-compat-migration': 'NONE' }),
  }),
});

/** The classes of a new fixture whose relationship to the named capital is DIRECT. */
export function portfolioDirectClasses(fixtureId, capitalId) {
  const map = PORTFOLIO_CAPITAL_RELATIONSHIPS[fixtureId] ?? {};
  return Object.keys(map).filter((classId) => map[classId][capitalId] === 'DIRECT').sort();
}

/** The relationship of one class to one capital, defaulting to NONE. */
export function portfolioRelationshipOf(fixtureId, classId, capitalId) {
  return PORTFOLIO_CAPITAL_RELATIONSHIPS[fixtureId]?.[classId]?.[capitalId] ?? 'NONE';
}

/** The TRANSFER_HYPOTHESIS entries, reported separately from the DIRECT ones. */
export function portfolioTransferHypotheses() {
  const out = [];
  for (const [fixtureId, byClass] of Object.entries(PORTFOLIO_CAPITAL_RELATIONSHIPS)) {
    for (const [classId, byCapital] of Object.entries(byClass)) {
      for (const [capitalId, relationship] of Object.entries(byCapital)) {
        if (relationship === 'TRANSFER_HYPOTHESIS') out.push(Object.freeze({ fixtureId, classId, capitalId, relationship }));
      }
    }
  }
  return Object.freeze(out);
}
