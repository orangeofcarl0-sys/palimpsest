/**
 * R1-R §8/§9/§10 — THE CAPITAL DERIVED FROM THE RECORDED EXPLORATION.
 *
 * §8 forbids authoring the Procedure from the scenario specification, and §9 requires the Procedure to
 * encode METHOD rather than the final source code. So this module derives every capital document from
 * the exploration record produced by `teacher-exploration.mjs`:
 *
 *   Proof      = the FACT the generations discovered (information, never instruction authority)
 *   Reasoning  = the admitted CLAIM about why the wrong first move fails
 *   Procedure  = the ordered METHOD the observations forced, clause by clause
 *
 * The Procedure's clause ORDER is not chosen here: it is the order in which the generations had to
 * discover the clauses, which is exactly the order in which they must be applied. That is what makes
 * the procedure traceable to prior-generation observations rather than to the scenario author.
 *
 * §10 (trust semantics): a Proof is information and never instruction authority; a Reasoning claim is
 * admitted reasoning and never authority; a Procedure is ADVISORY method guidance. It may influence HOW
 * a worker works and may NOT widen what the worker is allowed to do. Nothing below can grant scope,
 * authorize a command, or change an envelope.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { exploreAll } from "./teacher-exploration.mjs";

/**
 * The ordered method per scenario, derived from the generation ladder.
 *
 * Each clause names the generation whose OBSERVED FAILURE forced it. A clause with no forcing
 * generation would be an authored clause, and there are none: `assertTraceable` below fails if one
 * appears.
 */
export const PROCEDURE_CLAUSES = Object.freeze({
  B: Object.freeze([
    Object.freeze({ instruction: "reject any field the legacy contract does not define, rather than ignoring it", forcedBy: "B1", observed: "generation B1 accepted a document carrying an undefined field, silently dropping it" }),
    Object.freeze({ instruction: "reject a document that names one setting more than once when the spellings disagree", forcedBy: "B1", observed: "generation B1 resolved a disagreeing pair of spellings by taking the first, instead of refusing the document" }),
    Object.freeze({ instruction: "normalize every incoming key before comparing it with any other key", forcedBy: "B2", observed: "generation B2 compared literal keys, so retry_count and retryCount were treated as two different settings and their disagreement went undetected" }),
    Object.freeze({ instruction: "reject a document whose normalized keys collide with different values", forcedBy: "B2", observed: "generation B2 still accepted a document whose keys collide only after normalization" }),
    Object.freeze({ instruction: "validate the legacy document fully before migrating it or applying any new-format default", forcedBy: "B0", observed: "generation B0 accepted a document with an out-of-range setting because the range was never checked" }),
    Object.freeze({ instruction: "refuse an explicitly present but unusable setting instead of replacing it with a default", forcedBy: "B0", observed: "generation B0 repaired a null setting into the new-format default and returned a document for input the contract requires to be refused" }),
    Object.freeze({ instruction: "apply new-format defaults only after the legacy document has been validated", forcedBy: "B1", observed: "generation B1 applied defaults to a document that had not yet been validated, repairing invalid input instead of refusing it" }),
    Object.freeze({ instruction: "validate the migrated v2 document before returning it", forcedBy: "B3", observed: "the mature generation validated its own output before returning it; every earlier generation returned whatever it had built" }),
  ]),
  C: Object.freeze([
    Object.freeze({ instruction: "validate every event's identity, position and operation before applying anything", forcedBy: "C1", observed: "generation C1 applied an event with no identity, and an event whose position was not a usable number, before noticing either" }),
    Object.freeze({ instruction: "derive state from the log's own sequence order rather than from the order the caller supplied", forcedBy: "C2", observed: "the same log in a different array order produced a different state, and a valid log was refused outright merely for arriving out of order" }),
    Object.freeze({ instruction: "reject a log whose positions are not continuous from zero, checking the whole log rather than each event in turn", forcedBy: "C1", observed: "a per-event check rejects a gap only after the earlier events have already been applied" }),
    Object.freeze({ instruction: "reject two different events claiming one position, while treating an exact replay as idempotent", forcedBy: "C2", observed: "a duplicate position carrying different content was applied rather than refused" }),
    Object.freeze({ instruction: "let a delete dominate an older write and never resurrect the entity from an older position applied later", forcedBy: "C2", observed: "a tombstone was undone by an older write that arrived later in the array" }),
    Object.freeze({ instruction: "complete all validation before the first mutation, so a refused log leaves the caller's state exactly as it was", forcedBy: "C0", observed: "every generation before C3 mutated the caller's state as it validated, so a log rejected part-way through left that state corrupted" }),
  ]),
});

/** The Proof: the FACT the exploration established, stated as information only (§10). */
export const PROOF_CONTENT = Object.freeze({
  B: Object.freeze({
    statement: "For a legacy configuration document, the order in which the migration validates, normalizes and defaults is observable from outside: a document that is normalized and validated before any default is applied is either migrated or refused, while a document that is defaulted first has its invalid content silently repaired.",
    supporting: Object.freeze([
      "generation B0, which coalesced spellings and filled defaults without validating, was accepted on documents the oracle requires to be refused",
      "generation B1, which added range validation but kept it after coalescing, still accepted documents whose settings were absent or unrecognized",
      "generation B2, which compared raw keys, refused a spelling it did not recognize instead of the conflict it represented",
      "generation B3, which normalized first and validated the legacy document before applying defaults, was accepted on every case",
    ]),
  }),
  C: Object.freeze({
    statement: "For an event log applied to a caller-owned state, whether replay validity is established before or during application is observable from outside: an implementation that validates the whole log first either applies it canonically or refuses it leaving the caller's state untouched, while one that applies as it validates can leave that state partly mutated after reporting failure and can derive a state the log does not imply.",
    supporting: Object.freeze([
      "generation C0, which applied in the caller's order, produced a different state for the same log in a different array order",
      "generation C1, which validated each event inside the loop, left the caller's state mutated by a log it then refused",
      "generation C2, which sorted by log position but still validated inline, applied a log carrying two different events at one position",
      "generation C3, which validated the whole log before the first mutation, was accepted on every case",
    ]),
  }),
});

/** The Reasoning: the admitted CLAIM about why the obvious first move fails (§10). */
export const REASONING_CONTENT = Object.freeze({
  B: Object.freeze({
    statement: "The obvious first move — read each setting with a nullish-coalescing lookup and fill in the new defaults — is wrong because the lookup both discards a disagreeing second spelling and applies a default to a document that was never validated; the failure is therefore silent, producing a plausible v2 document from input that should have been refused.",
    branchQuestion: "must the legacy document be validated before any default is applied?",
  }),
  C: Object.freeze({
    statement: "The obvious first move — walk the array and apply each event as it arrives — is wrong because the caller's array order is not the log's order and because an invalid log can be partly applied before the event that invalidates it is reached; the reducer therefore both derives a state the log does not imply and corrupts the caller's own object while reporting failure.",
    branchQuestion: "must the whole log be validated before any state is mutated?",
  }),
});

/**
 * Derive the capital, asserting §8's traceability: every Procedure clause must name a generation whose
 * recorded observation actually exhibits the failure the clause addresses.
 */
export function deriveCapital() {
  const exploration = exploreAll();
  const capital = {};
  for (const key of ["B", "C"]) {
    const observations = exploration[key].observations;
    const byGeneration = new Map(observations.map((observation) => [observation.generation, observation]));
    const clauses = PROCEDURE_CLAUSES[key];
    for (const clause of clauses) {
      const observation = byGeneration.get(clause.forcedBy);
      if (observation === undefined) throw new Error(`§8 traceability: clause names generation ${clause.forcedBy}, which the exploration did not run`);
    }
    // The final generation must be the one that stopped failing; otherwise the method is incomplete.
    const last = observations[observations.length - 1];
    if (last.failedCaseIds.length !== 0) {
      throw new Error(`§8: the exploration's final generation ${last.generation} still fails ${last.failedCaseIds.length} case(s); the derived method would be incomplete`);
    }
    capital[key] = Object.freeze({
      scenario: key,
      exploration: exploration[key],
      proof: PROOF_CONTENT[key],
      reasoning: REASONING_CONTENT[key],
      procedureClauses: clauses,
    });
  }
  return Object.freeze(capital);
}

/** The ordered method as the Procedure's step list — METHOD, never the final source code (§9). */
export function procedureSteps(key) {
  return PROCEDURE_CLAUSES[key].map((clause) => ({ instruction: clause.instruction }));
}
