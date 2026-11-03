/**
 * R2-S §6/§7/§11 — THE BROAD CANDIDATE SET: 3 TARGETS + 3 DISTRACTORS.
 *
 * §6 requires each task to receive a BROAD preselected candidate set: three TARGET capital items (the
 * task's OWN prior-generation capital, one of each kind) and three DISTRACTOR capital items (an
 * independent, valid, mature project-capital bundle whose content is not useful for the current task).
 *
 * WHAT A DISTRACTOR IS AND IS NOT.
 *
 *   · it IS legitimate admitted capital — a real Proof, a real Reasoning claim, a real published
 *     Procedure, each derived from a recorded exploration of a DIFFERENT scenario, each installed through
 *     the same owners and associated with the experimental project through the same public API the target
 *     uses;
 *   · it is NOT a fake or garbage string, and it does NOT contain the current task's hidden answer.
 *
 * §7 PROJECT ASSOCIATION. All six items must be lawfully project-associated for the experimental project.
 * The `ProjectWorkspace.associateAsset({ associationKind: 'MANUAL' })` API is exactly the existing,
 * legitimate, harness-only association path — it is how the target items are associated too, and it
 * requires no canonical semantic change. So the literal §7 whole-bundle construction is possible:
 * C's task takes D's bundle, D's task takes C's bundle. B (the config-migration ladder from R1-R) joins
 * the pool as a genuinely different domain.
 *
 * §11 ORDER. The production compiler orders the index by content-addressed identity, which the harness
 * may not touch (§25: no canonical change). The ONE lawful lever on order is WHICH distractor items are
 * selected, so each block draws a different distractor set and the compiled order therefore varies across
 * blocks while being IDENTICAL across the S0/S1 pair within a block. The achieved target/distractor
 * position pattern is measured in the analysis rather than asserted here.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { deriveCapital as deriveR1RCapital } from '../r1r/capital.mjs';
import { deriveCapital as deriveR2UCapital } from '../r2u/capital.mjs';
import { DISTRACTOR_POOL, KINDS, TARGET_BUNDLE } from './design.mjs';
import { SCENARIOS } from '../r2u/scenarios.mjs';

/** The three bundles a distractor may be drawn from, in a fixed order so the schedule is reproducible. */
export const BUNDLE_IDS = Object.freeze(['B', 'C', 'D']);

/** The project each bundle's exploration was authored for. Recorded for provenance, never enforced. */
export const BUNDLE_ORIGIN_PROJECT = Object.freeze({
  B: 'r1r-config-migration',
  C: 'r1r-event-reducer',
  D: 'r2u-incremental-cache',
});

/** The human-readable domain each bundle belongs to, so a reader can judge "not useful for this task". */
export const BUNDLE_DOMAIN = Object.freeze({
  B: 'legacy configuration migration (normalize/validate/default ordering)',
  C: 'event-log replay reduction (validate the whole log before mutating state)',
  D: 'incremental build-cache invalidation (freeze the affected closure before deleting)',
});

/**
 * The capital content of every bundle, resolved ONCE.
 *
 * C's bundle is R1-R's own derivation and D's is R2-U's; both are IMPORTED rather than re-authored, so a
 * later change to either derivation would be a visible change here rather than a silent divergence. B's is
 * R1-R's other ladder.
 */
export function bundleCapital(bundleId) {
  if (bundleId === 'D') {
    const d = deriveR2UCapital().D;
    return Object.freeze({ bundleId, proof: d.proof, reasoning: d.reasoning, procedureClauses: d.procedureClauses, domain: BUNDLE_DOMAIN.D, originProject: BUNDLE_ORIGIN_PROJECT.D });
  }
  const r1r = deriveR1RCapital()[bundleId];
  if (r1r === undefined) throw new Error(`no capital bundle named ${bundleId}`);
  return Object.freeze({ bundleId, proof: r1r.proof, reasoning: r1r.reasoning, procedureClauses: r1r.procedureClauses, domain: BUNDLE_DOMAIN[bundleId], originProject: BUNDLE_ORIGIN_PROJECT[bundleId] });
}

/**
 * §6/§7: THE SIX-ITEM CANDIDATE SET FOR ONE (scenario, block).
 *
 * The target is always the scenario's OWN bundle. The distractors are the block's frozen draw, one per
 * kind. Each item carries its ROLE and its provenance so the analysis and the report can separate them
 * without re-deriving the schedule.
 *
 * @param {'C'|'D'} scenarioId
 * @param {Readonly<{ proof: string, reasoning: string, procedure: string }>} distractorSet
 */
export function candidateSetFor(scenarioId, distractorSet) {
  const targetBundleId = TARGET_BUNDLE[scenarioId];
  const items = [];
  for (const kind of KINDS) {
    items.push(Object.freeze({
      role: 'TARGET',
      kind,
      bundleId: targetBundleId,
      provenance: 'TARGET_OWN_PRIOR_GENERATION',
      domain: BUNDLE_DOMAIN[targetBundleId],
    }));
  }
  for (const kind of KINDS) {
    const bundleId = distractorSet[kind];
    if (bundleId === undefined) throw new Error(`the distractor set names no bundle for kind ${kind}`);
    if (bundleId === targetBundleId) throw new Error(`the distractor bundle ${bundleId} equals the target bundle for scenario ${scenarioId}`);
    if (!DISTRACTOR_POOL[scenarioId].includes(bundleId)) throw new Error(`bundle ${bundleId} is not in scenario ${scenarioId}'s distractor pool`);
    items.push(Object.freeze({
      role: 'DISTRACTOR',
      kind,
      bundleId,
      provenance: 'DISTRACTOR_INDEPENDENT_BUNDLE',
      domain: BUNDLE_DOMAIN[bundleId],
    }));
  }
  return Object.freeze({
    scenarioId,
    scenarioName: SCENARIOS[scenarioId].name,
    targetBundleId,
    distractorBundles: KINDS.map((kind) => distractorSet[kind]),
    items: Object.freeze(items),
    /** §6: the arithmetic, stated so a report cannot silently change it. */
    targetCount: items.filter((item) => item.role === 'TARGET').length,
    distractorCount: items.filter((item) => item.role === 'DISTRACTOR').length,
  });
}

/**
 * §6: PROVE the distractor content is not the current task's answer.
 *
 * The check is mechanical and narrow: the distractor bundle must be a DIFFERENT bundle from the target,
 * and its domain must differ from the target's domain. The two "ordering-first" bundles (C and D) are
 * structurally related, so this check is a NECESSARY condition and not a proof of irrelevance — that
 * residual is stated in the report's scope limits rather than hidden here.
 */
export function assertDistractorIndependent(scenarioId, candidateSet) {
  const problems = [];
  const targetDomain = BUNDLE_DOMAIN[candidateSet.targetBundleId];
  for (const item of candidateSet.items) {
    if (item.role !== 'DISTRACTOR') continue;
    if (item.bundleId === candidateSet.targetBundleId) problems.push(`a distractor is the target bundle (${item.bundleId})`);
    if (item.domain === targetDomain) problems.push(`a distractor shares the target's domain (${item.bundleId})`);
  }
  return Object.freeze({ ok: problems.length === 0, problems: Object.freeze(problems), scenarioId });
}
