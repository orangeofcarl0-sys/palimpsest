/**
 * R3-L0C §6/§7/§8 — THE CURRENT-STANDING CAPITAL AND THE TWO ARMS.
 *
 * THE DISTINCTION THIS MODULE ENCODES, which is the whole point of the stage:
 *
 *     HistoricalKnowledge ≠ CurrentStanding
 *
 * The raw history corpus contains the invariant's WHOLE history — the initial rule, every revision, what each
 * superseded, and the reasoning behind each change. Current standing is the CONCLUSION: which rule is in force
 * now, and under what applicability. H must derive that conclusion. C is handed it.
 *
 * SO THE CAPITAL BODY IS A STANDING STATEMENT, NOT A HISTORY. It says what the rule IS, with its applicability
 * and limitations, and it does not narrate how the rule got there. That is what makes the treatment
 * COMPRESSION: the same conclusion, with the derivation removed. If the body retold the history it would be a
 * summary rather than a compression, and it would not test the reconstruction cost at all.
 *
 * §8 FIXES THE WORKER-FACING SET, and it is deliberately MINIMAL:
 *
 *   one admitted current ReasoningClaim    the standing conclusion, with its applicability
 *   one active Procedure revision          the reusable method for APPLYING the standing
 *
 * Historical Proof grounds the admission and is NOT selected. §8 forbids exposing all backing evidence merely
 * because it exists, so the proof claim is associated (which is what makes admission legitimate) but never
 * enters the worker's selected handle set.
 *
 * §6 FORBIDS WRITING AN ANSWER TO A FUTURE HIDDEN CASE. Every body states a general rule about the Project's
 * precedence and aliasing semantics. None names a diagnostic case id, and none quotes a case fixture value, and
 * `futureCaseLeakage` asserts that mechanically before admission.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { createHash } from 'node:crypto';

import { DIAGNOSTIC_CASES } from './diagnostic.mjs';
import { INVARIANTS } from './contract.mjs';

export const sha256 = (text) => createHash('sha256').update(String(text), 'utf8').digest('hex');
const NL = String.fromCharCode(10);

/**
 * §6/§8: THE CURRENT-STANDING BODIES.
 *
 * Each states the standing rule, its applicability and its limitations. The `derivationRemoved` field records
 * WHAT the body deliberately does not contain, which is the compression the stage measures — and it is recorded
 * here so a reader can see the compression rather than having to infer it from prose.
 */
export const STANDING_BODIES = Object.freeze({
  I1: Object.freeze({
    invariant: 'I1',
    /** §6: the standing conclusion. */
    statement: 'A DENY recorded before the tenant\'s cutover date is FINAL: no later ALLOW overturns it. From the tenant\'s cutover date onward the new engine is authoritative, and among the decisions at or after that date the most recently recorded one wins.',
    /** §6: the applicability, which is what makes the standing conditional. */
    applicability: 'applies to any tenant+capability where a DENY and an ALLOW both exist and their recorded dates straddle the tenant\'s cutover date; a tenant with no cutover date is treated as entirely pre-cutover',
    /** §6: the limitations. */
    limitations: Object.freeze([
      'only DENYs are protected by finality; an ALLOW recorded before the cutover carries no such protection',
      'the comparison is between the DECISION\'s recordedAt and the TENANT\'s cutoverDate, never the tenant\'s onboarding date',
      'it decides precedence between two existing decisions and creates neither',
      'two tenants with identical decisions can resolve differently, because the cutover date is per tenant',
    ]),
    /** §8: the method for APPLYING the standing, which is what the Procedure carries. */
    method: Object.freeze([
      'Read the tenant\'s cutoverDate. A null or absent cutoverDate means the tenant has never been migrated, so treat every decision as pre-cutover.',
      'Collect the decisions for that tenant and capability whose recordedAt is on or before the resolution date.',
      'If any collected decision is a DENY whose recordedAt is strictly BEFORE the cutover date, the resolution is DENY.',
      'Otherwise take the decision with the latest recordedAt among the collected ones, and return its effect.',
      'Return DENY when no decision was collected.',
    ]),
    /** §6: what the body omits, so the compression is visible rather than assumed. */
    derivationRemoved: Object.freeze([
      'the 2023 rule that a legacy DENY was final for EVERY tenant, and the incident that established it',
      'the revision that made the cutover date the key, and the incident that showed onboarding date was the wrong key',
      'the verification cases that established the rule',
    ]),
    /** §4: the fact a generic prior cannot supply. */
    genericPriorCannotDetermine: 'a prior offers "deny wins" and "latest wins" and cannot choose between them, because the choosing fact is this tenant\'s cutover date',
  }),
  I2: Object.freeze({
    invariant: 'I2',
    statement: 'Three legacy capabilities are consolidated into one. For those three, a legacy name and the consolidated name are the SAME authority: holding both is holding one, and a revocation acts on the CAPABILITY rather than on the named record. A revocation acts only if the tenant HOLDS the name it names; when it does, it removes every record of that tenant mapping to the capability.',
    applicability: 'applies only to the three legacy capabilities the consolidation record names; every other capability, including the one outside that list, keeps an independent grant set',
    limitations: Object.freeze([
      'the legacy names are preserved for provenance and must not be deleted, and a preserved alias does not count as a second grant',
      'a revocation of a name the tenant does not hold removes nothing, even when the name maps to a capability the tenant does hold',
      'it changes which record constitutes access; it does not rename or delete any stored record',
    ]),
    method: Object.freeze([
      'Determine the capability the named capability maps to. A name outside the consolidation maps to itself.',
      'Determine whether the tenant HOLDS the name it was asked to revoke. If not, refuse and change nothing.',
      'Remove every record of that tenant whose capability maps to the same capability as the revoked name.',
      'When resolving, treat a tenant as holding the capability if it holds ANY record mapping to it.',
    ]),
    derivationRemoved: Object.freeze([
      'the original rule that every capability was independent, and its later partial supersession',
      'the incident where a revocation of an alias left the consolidated access in place',
      'the verification cases that fixed the boundary of the consolidation',
    ]),
    genericPriorCannotDetermine: 'a prior offers "normalize aliases" and cannot name which capabilities were consolidated, nor which record is authoritative — those are this Project\'s records',
  }),
});

/** §6/§8: the historical evidence each standing binds to, taken from the corpus. */
export const STANDING_SOURCES = Object.freeze({
  I1: Object.freeze({
    sourceId: 'history-i1-cutover-precedence',
    label: 'The Project history establishing cutover precedence (REV-0009 and its verification)',
    mediaType: 'text/plain',
    evidenceStatement: 'The Project replaced its onboarding-date classification with the tenant cutover date after a migrated tenant was misclassified, and verified that the decision date is compared against the cutover date. The rule in force protects a DENY recorded before the tenant cutover and applies latest-wins from the cutover onward.',
  }),
  I2: Object.freeze({
    sourceId: 'history-i2-capability-consolidation',
    label: 'The Project history establishing capability consolidation (REV-0017 and its verification)',
    mediaType: 'text/plain',
    evidenceStatement: 'The Project consolidated three legacy capabilities into one, then fixed a revocation that removed the named alias while leaving the consolidated access in place. The rule in force makes the capability the unit of access and acts only on a name the tenant holds.',
  }),
});

/** §8: the reasoning cell and branch, one per invariant. */
export const REASONING_FRAMES = Object.freeze({
  I1: Object.freeze({
    cellId: 'cell-cutover-precedence',
    objective: 'establish which of two competing decisions is in force for a tenant',
    branchQuestion: 'does the later decision always win, or does an earlier decision retain force for some tenants?',
  }),
  I2: Object.freeze({
    cellId: 'cell-capability-consolidation',
    objective: 'establish what constitutes a tenant\'s access to a consolidated capability',
    branchQuestion: 'is access carried by the named record, or by the capability the record maps to?',
  }),
});

/* ================================================================ §6 the leakage check */

/**
 * §6: THE FUTURE-CASE LEAKAGE CHECK.
 *
 * The rule is that a capital body must state the general standing and must never answer a specific hidden case.
 * The check is mechanical:
 *
 *   · no body may name a diagnostic case id;
 *   · no body may quote a fixture value the cases use;
 *   · no body may contain the case data verbatim.
 *
 * It runs BEFORE admission, so a leak is a failure to admit rather than a caveat on the result.
 */
export function futureCaseLeakage() {
  const caseText = JSON.stringify(DIAGNOSTIC_CASES);
  /** The fixture values the cases use. A body quoting one would be answering a case. */
  const fixtureLiterals = ['acme', 'beta', 'contoso', 'tenantA', 'tenantB', 'globex', 'adventure-works', 'northwind', '2024-01-10', '2023-08-01'];
  const leaks = [];
  for (const [invariantId, body] of Object.entries(STANDING_BODIES)) {
    const text = [body.statement, body.applicability, body.method.join(NL), body.limitations.join(NL), body.derivationRemoved.join(NL)].join(NL);
    for (const testCase of DIAGNOSTIC_CASES) {
      if (text.includes(testCase.id)) leaks.push(`${invariantId} names diagnostic case id ${testCase.id}`);
    }
    for (const literal of fixtureLiterals) {
      /**
       * A word-boundary regex would need the literal escaped for `u`-mode, and `\-` is invalid there. A plain
       * substring test on a padded haystack is equivalent for these literals and cannot throw.
       */
      const padded = ` ${text.replace(/[^A-Za-z0-9-]+/gu, ' ')} `;
      if (padded.includes(` ${literal} `)) leaks.push(`${invariantId} quotes case fixture literal "${literal}"`);
    }
    if (caseText.includes(text.slice(0, 60))) leaks.push(`${invariantId} text appears verbatim in the case data`);
  }
  return Object.freeze({
    leakFree: leaks.length === 0,
    leaks: Object.freeze(leaks),
    note: 'no standing body may name a diagnostic case id, quote a case fixture literal, or appear in the case data',
    fixtureLiteralsChecked: Object.freeze(fixtureLiterals),
  });
}

/* ================================================================ §6/§8 the frozen bundle */

/**
 * §6/§8: THE FROZEN BUNDLE, with the SELECTED set declared explicitly.
 *
 * §8 fixes the worker-facing set at one ReasoningClaim and one active Procedure revision per invariant, and
 * requires it frozen before trial 1. The Proof claim is recorded as BACKING rather than as SELECTED, which is
 * the distinction §8 draws and the reason a reader can see the minimality in the data.
 */
export function frozenBundle() {
  const perInvariant = {};
  for (const invariant of INVARIANTS) {
    const body = STANDING_BODIES[invariant.id];
    perInvariant[invariant.id] = Object.freeze({
      invariant: invariant.id,
      name: invariant.name,
      /** §6: the historical standing record, carried so the bundle documents what it compresses. */
      currentStanding: invariant.currentStanding,
      applicability: invariant.applicability,
      limitations: invariant.limitations,
      historicalInitialRule: invariant.historicalInitialRule,
      revisionCount: invariant.revisions.length,
      /** §8: the worker-facing body. */
      statement: body.statement,
      method: body.method,
      derivationRemoved: body.derivationRemoved,
      source: STANDING_SOURCES[invariant.id],
      reasoning: REASONING_FRAMES[invariant.id],
      /** §8: exactly which owners the worker will see. */
      selected: Object.freeze({ reasoningClaim: 1, activeProcedureRevision: 1, proofClaim: 0 }),
      /** §8: the proof is BACKING, not worker-facing. */
      backingProof: Object.freeze({ purpose: 'grounds the standing and its admission', selectedForWorker: false }),
      bodyDigests: Object.freeze({
        statement: sha256(body.statement),
        applicability: sha256(body.applicability),
        method: sha256(body.method.join(NL)),
        limitations: sha256(body.limitations.join(NL)),
        derivationRemoved: sha256(body.derivationRemoved.join(NL)),
      }),
    });
  }
  return Object.freeze({
    kind: 'FrozenCurrentStandingBundle',
    stage: 'R3-L0C',
    invariants: Object.freeze(perInvariant),
    leakage: futureCaseLeakage(),
    owners: Object.freeze(['src/proof_asset', 'src/reasoning_cell', 'src/procedures', 'src/project_workspace', 'src/organization_memory']),
    newAssetKindCreated: false,
    /** §8: the minimality law, carried in the bundle so it cannot be quietly widened. */
    minimalityLaw: 'one admitted current ReasoningClaim and one active Procedure revision per invariant; historical Proof grounds the admission and is not selected for the worker',
    /** §6: nothing may change after trial 1. */
    frozenAt: 'before the first primary L0C worker run',
  });
}

/** §6: the digest of the whole bundle, so a post-trial edit is detectable as one number. */
export function bundleDigest(bundle = frozenBundle()) {
  const material = Object.entries(bundle.invariants).map(([id, entry]) => [
    id,
    entry.statement,
    entry.applicability,
    entry.method.join(NL),
    entry.limitations.join(NL),
    entry.derivationRemoved.join(NL),
  ].join('|')).join(NL);
  return sha256(material);
}

/* ================================================================ §7/§9 the arms */

/** §7/§9: the two arms. The ONLY difference is whether the frozen handles are SELECTED. */
export const ARMS = Object.freeze({
  H: Object.freeze({
    id: 'H',
    name: 'RAW_HISTORY',
    receives: 'the current Project world, the declared raw Project history corpus, and ordinary worker tools',
    selectedHandleCount: 0,
  }),
  C: Object.freeze({
    id: 'C',
    name: 'CAPITALIZED',
    receives: 'the same world and corpus, plus the frozen current-standing handles through the governed Context and pull mechanism',
    selectedHandleCount: null,
  }),
});

/**
 * §9: THE SELECTION FOR A GENERATION.
 *
 * H returns `undefined`, so the `knowledge` field is OMITTED entirely rather than sent empty — an absent field
 * and an empty array are different requests, and the H arm must be the absence of a selection.
 *
 * C returns the selection in the SHAPE THE CONTEXT OWNER EXPECTS: one list per owner kind, each entry carrying
 * the owner's own reference fields. THE SHAPE IS LOAD-BEARING and a first version got it wrong: it sent
 * `{ handles: [...] }`, which the host does not recognize, so the selection was accepted, no handle was
 * compiled, and every C session ran with an EMPTY capital surface while reporting `selected=true`. The failure
 * was silent, and only the consumer-boundary witness caught it.
 *
 * Only the invariants THIS generation exposes are selected, which keeps the treatment attributable to the
 * surface the generation actually works on.
 */
export function selectionFor(arm, generationId, refs) {
  if (arm === 'H') return undefined;
  const exposed = new Set((GENERATION_EXPOSURES[generationId] ?? []));
  const selected = refs.filter((entry) => exposed.has(entry.invariant));
  return Object.freeze({
    proof: Object.freeze(selected.filter((entry) => entry.kind === 'PROOF_CLAIM').map((entry) => Object.freeze({ claimId: entry.ref.claimId }))),
    reasoning: Object.freeze(selected.filter((entry) => entry.kind === 'REASONING_CLAIM').map((entry) => Object.freeze({ cellId: entry.ref.cellId, claimId: entry.ref.claimId }))),
    procedure: Object.freeze(selected.filter((entry) => entry.kind === 'PROCEDURE').map((entry) => Object.freeze({ procedureId: entry.ref.procedureId, revision: entry.ref.revision, reason: entry.ref.reason }))),
  });
}

/** §11: which invariants each generation exposes. */
export const GENERATION_EXPOSURES = Object.freeze({
  G1: Object.freeze(['I1']),
  G2: Object.freeze(['I1', 'I2']),
});

/**
 * §8: the EXPECTED worker-facing handle set for a generation.
 *
 * The handles are the ones the Context owner compiles from the selection, spelled the way the owner spells them
 * (`@ctx/<kind>/<id>`), so the witness can compare the consumer boundary against what was selected. The set is
 * derived from the SAME owner refs the selection uses, which is what makes the two provably agree.
 */
export function frozenHandlesFor(arm, generationId, refs) {
  if (arm === 'H') return Object.freeze([]);
  const exposed = new Set((GENERATION_EXPOSURES[generationId] ?? []));
  const selected = refs.filter((entry) => exposed.has(entry.invariant));
  return Object.freeze(selected.map((entry) => entry.handle));
}

/**
 * §9: THE TREATMENT DELTA.
 *
 * Both arms receive identical worlds, identical corpora, and identical canonical capital planes. The ONLY
 * difference is the selected handle set, and this function states that as data so the analysis can assert it
 * rather than restate it.
 */
export function treatmentDelta() {
  return Object.freeze({
    kind: 'SELECTION_ONLY',
    identical: Object.freeze(['project world bytes', 'raw history corpus bytes', 'canonical capital assets', 'capital associations', 'durable store contents at start', 'worker tool surface', 'model route']),
    differing: Object.freeze(['the selected handle set compiled into the attempt']),
    rawHistoryAvailableToBoth: true,
    capitalBodiesCountAsRawHistoryBytes: false,
  });
}
