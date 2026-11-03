/**
 * R2-U §12 — THE SCENARIO-D CAPITAL DERIVED FROM THE RECORDED EXPLORATION.
 *
 * §12 forbids authoring the Procedure from the scenario specification, and requires the Procedure to encode
 * METHOD rather than the final source code. So this module derives every capital document from the
 * exploration record produced by `teacher-exploration.mjs`:
 *
 *   Proof      = the FACT the generations discovered (information, never instruction authority)
 *   Reasoning  = the admitted CLAIM about why the wrong first move fails
 *   Procedure  = the ordered METHOD the observations forced, clause by clause
 *
 * The Procedure's clause ORDER is not chosen here: it is the order in which the generations had to
 * discover the clauses, which is exactly the order in which they must be applied. That is what makes the
 * procedure traceable to prior-generation observations rather than to the scenario author.
 *
 * §12 (trust semantics, carried from R1-R §10): a Proof is information and never instruction authority; a
 * Reasoning claim is admitted reasoning and never authority; a Procedure is ADVISORY method guidance. It
 * may influence HOW a worker works and may NOT widen what the worker is allowed to do. Nothing below can
 * grant scope, authorize a command, or change an envelope.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { deriveCapital as deriveR1RCapital } from '../r1r/capital.mjs';
import { exploreScenarioD } from './teacher-exploration.mjs';

/**
 * The ordered method for Scenario D, derived from the generation ladder.
 *
 * Each clause names the generation whose OBSERVED FAILURE forced it. A clause with no forcing generation
 * would be an authored clause, and there are none: `deriveCapital` below fails if one appears.
 */
export const PROCEDURE_CLAUSES = Object.freeze({
  D: Object.freeze([
    Object.freeze({
      instruction: 'validate the whole input — the cache\'s shape, every entry, and every changed id — before deleting anything',
      forcedBy: 'D1',
      observed: 'generation D1 added shape validation but kept it after the deletions, so an input it then refused had already lost entries from the caller\'s cache',
    }),
    Object.freeze({
      instruction: 'compute the complete affected set before the first deletion, rather than deleting as you discover',
      forcedBy: 'D0',
      observed: 'generation D0 deleted each changed node as it walked the changed list, which both destroys the evidence needed to find the dependents and leaves the cache partially invalidated if a later id is refused',
    }),
    Object.freeze({
      instruction: 'invalidate the transitive DEPENDENTS of a stale node, and not its dependencies',
      forcedBy: 'D2',
      observed: 'generation D2 walked the dependency edges in both directions, so changing a node also discarded the ancestors it had been computed from, which were still correct',
    }),
    Object.freeze({
      instruction: 'treat an entry that names a dependency the cache does not hold as unusable rather than unaffected',
      forcedBy: 'D3',
      observed: 'generation D3 walked descendants only but left an entry whose dependency was absent in the cache, so a value that could not be shown to be current survived the invalidation',
    }),
    Object.freeze({
      instruction: 'let the closure walk terminate on a cycle rather than assuming the graph is a tree',
      forcedBy: 'D0',
      observed: 'generation D0 had no closure walk at all, and the first closure implementation needed the visited set to terminate on the cyclic graphs the cache admits',
    }),
    Object.freeze({
      instruction: 'preserve every entry that is still correct, value and dependencies both',
      forcedBy: 'D2',
      observed: 'the over-invalidation in generation D2 discarded entries that were still correct, which is the wasted-rebuild half of the same contract',
    }),
  ]),
});

/** The Proof: the FACT the exploration established, stated as information only. */
export const PROOF_CONTENT = Object.freeze({
  D: Object.freeze({
    statement:
      'For an incremental cache, the difference between deleting the changed entries and freezing the affected closure is observable from outside: a cache invalidated from a closure computed in advance either keeps exactly the entries that are still correct or refuses the input leaving the caller\'s cache untouched, while one that deletes as it walks leaves dependents of a changed node holding values derived from sources that no longer exist and can leave the caller\'s cache partly invalidated after a refusal.',
    supporting: Object.freeze([
      'generation D0, which deleted the changed entries and nothing else, left every dependent holding a stale value',
      'generation D1, which validated the cache after the deletions, mutated the caller\'s cache before refusing an invalid input',
      'generation D2, which computed a closure in both directions, discarded ancestors that were still correct',
      'generation D3, which walked descendants only, preserved an entry whose dependency the cache did not hold',
      'generation D4, which froze the affected set before the first deletion, was accepted on every case',
    ]),
  }),
});

/** The Reasoning: the admitted CLAIM about why the obvious first move fails. */
export const REASONING_CONTENT = Object.freeze({
  D: Object.freeze({
    statement:
      'The obvious first move — delete the cache entries for the nodes whose source changed — is wrong because an entry\'s cached value was computed FROM its dependencies, so a dependency\'s change makes every transitive dependent stale as well; deleting only the directly-changed entries therefore leaves the cache internally consistent and silently incorrect, and because the caller keeps using the same object, the deletion also destroys the dependency information needed to find those dependents.',
    branchQuestion: 'must the affected closure be computed before any entry is deleted?',
  }),
});

/**
 * Derive the capital for BOTH R2-U scenarios.
 *
 * Scenario C's capital is R1-R's own derivation, IMPORTED rather than re-authored (§9: the R1-R reducer
 * fixture is reused, not redesigned, and its capital is part of that fixture). Scenario D's is derived here
 * from this stage's own generation ladder. Importing C means a change to R1-R's derivation is visible in
 * this stage's evidence rather than silently diverging from it.
 *
 * The §12 traceability assertions run against the D exploration, which is the one this stage authored.
 */
export function deriveCapital() {
  const r1r = deriveR1RCapital();
  const exploration = exploreScenarioD();
  const byGeneration = new Map(exploration.observations.map((observation) => [observation.generation, observation]));
  const clauses = PROCEDURE_CLAUSES.D;
  for (const clause of clauses) {
    const observation = byGeneration.get(clause.forcedBy);
    if (observation === undefined) throw new Error(`§12 traceability: clause names generation ${clause.forcedBy}, which the exploration did not run`);
    if (observation.failedCaseIds.length === 0) {
      throw new Error(`§12 traceability: clause names generation ${clause.forcedBy}, but that generation failed nothing, so it forced no clause`);
    }
  }
  // The final generation must be the one that stopped failing; otherwise the method is incomplete.
  const last = exploration.observations[exploration.observations.length - 1];
  if (last.failedCaseIds.length !== 0) {
    throw new Error(`§12: the exploration's final generation ${last.generation} still fails ${String(last.failedCaseIds.length)} case(s); the derived method would be incomplete`);
  }
  return Object.freeze({
    C: r1r.C,
    D: Object.freeze({
      scenario: 'D',
      exploration,
      proof: PROOF_CONTENT.D,
      reasoning: REASONING_CONTENT.D,
      procedureClauses: clauses,
    }),
  });
}

/** The ordered method as the Procedure's step list — METHOD, never the final source code (§12). */
export function procedureSteps(scenarioId = 'D') {
  return PROCEDURE_CLAUSES[scenarioId].map((clause) => ({ instruction: clause.instruction }));
}
