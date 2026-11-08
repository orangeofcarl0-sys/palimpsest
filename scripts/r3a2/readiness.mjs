/**
 * R3-A2 §"Readiness decomposition" — THE FOUR PROSPECTIVE READINESS STATES.
 *
 * §"Readiness decomposition" replaces nothing: the historical A→B RED result stands, computed by the frozen
 * R3-AE engine over the R3-A0 pairs. This module adds FOUR states that describe the portfolio the sentinel
 * stage actually built, and §"Readiness decomposition" forbids collapsing them into one GREEN/RED value.
 *
 *   TASK_READY        at least one model stack is qualified on at least two structurally distinct task families.
 *   MODEL_READY       at least one frozen fixture family is qualified on BOTH sentinel model families.
 *   LOCAL_PAIR_READY  both sentinel model families have at least one qualified fixture, AND at least two task
 *                     families are represented overall. §"Readiness decomposition": this supports pair-local
 *                     mechanism replication only — model/task effects remain CONFOUNDED if the graph is
 *                     disconnected.
 *   BRIDGE_READY      WITHIN ONE CONNECTED qualified component: at least one model spans >=2 task families,
 *                     AND at least one task family spans >=2 model families. This is the strong L-shaped
 *                     condition.
 *
 * §"Readiness decomposition" says the distinction between LOCAL_PAIR_READY and BRIDGE_READY is the CONNECTED
 * COMPONENT: a graph can have a model on two families and a family on two models without either fact living
 * in the same component, and that graph is pair-local, not bridged. So the component is computed rather than
 * assumed.
 *
 * §"Qualification analysis": ONLY `COMPLIANT + QUALIFIED` pairs become graph edges.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { PAIR_VERDICTS } from '../r3a/qualification.mjs';
import { ANTI_OVERFIT_PROCESSES } from '../r3a/fixture-manifest.mjs';

/** §"Readiness decomposition": the four prospective states, as frozen names. */
export const READINESS_STATES = Object.freeze({
  TASK_READY: 'TASK_READY',
  MODEL_READY: 'MODEL_READY',
  LOCAL_PAIR_READY: 'LOCAL_PAIR_READY',
  BRIDGE_READY: 'BRIDGE_READY',
});

/**
 * §"Qualification analysis": the graph edges — pairs that are BOTH `QUALIFIED` and `COMPLIANT`.
 *
 * A `COMPLIANT` fixture that did not qualify is not an edge; a `NON_COMPLIANT` fixture that qualified is
 * excluded rather than admitted, so this function fails closed exactly as the frozen gate does.
 */
export function graphEdges(pairs) {
  return pairs
    .filter((pair) => pair.verdict === PAIR_VERDICTS.QUALIFIED && pair.antiOverfitProcess === ANTI_OVERFIT_PROCESSES.COMPLIANT)
    .map((pair) => Object.freeze({ fixtureId: pair.fixtureId, taskFamily: pair.taskFamily, modelId: pair.modelId, modelFamily: pair.modelFamily }));
}

/**
 * §"Readiness decomposition": THE CONNECTED COMPONENTS of the qualified bipartite graph.
 *
 * Nodes are `task:<family>` and `model:<family>`; each qualified pair is an edge. Two task families are in the
 * same component when a chain of qualified pairs joins them, which is exactly the condition that makes a
 * model/task effect separable rather than confounded.
 */
export function connectedComponents(edges) {
  const adjacency = new Map();
  const link = (a, b) => {
    if (!adjacency.has(a)) adjacency.set(a, new Set());
    if (!adjacency.has(b)) adjacency.set(b, new Set());
    adjacency.get(a).add(b);
    adjacency.get(b).add(a);
  };
  for (const edge of edges) {
    link(`task:${edge.taskFamily}`, `model:${edge.modelFamily}`);
  }
  const seen = new Set();
  const components = [];
  for (const node of [...adjacency.keys()].sort()) {
    if (seen.has(node)) continue;
    const stack = [node];
    const members = [];
    seen.add(node);
    while (stack.length > 0) {
      const current = stack.pop();
      members.push(current);
      for (const next of adjacency.get(current) ?? []) {
        if (seen.has(next)) continue;
        seen.add(next);
        stack.push(next);
      }
    }
    components.push(Object.freeze({
      nodes: Object.freeze(members.slice().sort()),
      taskFamilies: Object.freeze(members.filter((member) => member.startsWith('task:')).map((member) => member.slice(5)).sort()),
      modelFamilies: Object.freeze(members.filter((member) => member.startsWith('model:')).map((member) => member.slice(6)).sort()),
    }));
  }
  return Object.freeze(components);
}

/**
 * §"Readiness decomposition": compute the four states, plus the full-cross check §"Stage outcome" asks for.
 *
 * @param {readonly { fixtureId: string, taskFamily: string, modelId: string, modelFamily: string, verdict: string, antiOverfitProcess?: string }[]} pairs
 * @param {readonly string[]} sentinelFamilies the two sentinel model families this stage is scoped to
 */
export function readiness(pairs, sentinelFamilies) {
  const edges = graphEdges(pairs);
  const components = connectedComponents(edges);

  const taskFamilies = [...new Set(edges.map((edge) => edge.taskFamily))].sort();
  const modelFamilies = [...new Set(edges.map((edge) => edge.modelFamily))].sort();

  /* -- TASK_READY: one model stack on >=2 structurally distinct task families -- */
  const modelsOnTwoTaskFamilies = [...new Set(edges.map((edge) => edge.modelFamily))]
    .map((modelFamily) => ({ modelFamily, taskFamilies: [...new Set(edges.filter((edge) => edge.modelFamily === modelFamily).map((edge) => edge.taskFamily))].sort() }))
    .filter((entry) => entry.taskFamilies.length >= 2);
  const taskReady = modelsOnTwoTaskFamilies.length > 0;

  /* -- MODEL_READY: one fixture family on BOTH sentinel model families -- */
  const fixtureModelFamilies = [...new Set(edges.map((edge) => edge.fixtureId))].map((fixtureId) => ({
    fixtureId,
    taskFamily: edges.find((edge) => edge.fixtureId === fixtureId).taskFamily,
    modelFamilies: [...new Set(edges.filter((edge) => edge.fixtureId === fixtureId).map((edge) => edge.modelFamily))].sort(),
  }));
  const fixturesOnBothSentinels = fixtureModelFamilies.filter((entry) => sentinelFamilies.every((family) => entry.modelFamilies.includes(family)));
  const modelReady = fixturesOnBothSentinels.length > 0;

  /* -- LOCAL_PAIR_READY: both sentinels have a qualified fixture AND >=2 task families exist overall -- */
  const sentinelsWithAQualifiedFixture = sentinelFamilies.filter((family) => edges.some((edge) => edge.modelFamily === family));
  const localPairReady = sentinelsWithAQualifiedFixture.length === sentinelFamilies.length && taskFamilies.length >= 2;

  /* -- BRIDGE_READY: the L-shape, WITHIN ONE CONNECTED COMPONENT -- */
  const bridgedComponents = components.map((component) => {
    const members = edges.filter((edge) => component.taskFamilies.includes(edge.taskFamily) && component.modelFamilies.includes(edge.modelFamily));
    const modelOnTwoTasks = component.modelFamilies.filter((family) => new Set(members.filter((edge) => edge.modelFamily === family).map((edge) => edge.taskFamily)).size >= 2);
    const taskOnTwoModels = component.taskFamilies.filter((family) => new Set(members.filter((edge) => edge.taskFamily === family).map((edge) => edge.modelFamily)).size >= 2);
    return Object.freeze({
      taskFamilies: component.taskFamilies,
      modelFamilies: component.modelFamilies,
      modelsOnTwoTaskFamilies: Object.freeze(modelOnTwoTasks),
      taskFamiliesOnTwoModelFamilies: Object.freeze(taskOnTwoModels),
      lShaped: modelOnTwoTasks.length >= 1 && taskOnTwoModels.length >= 1,
    });
  });
  const bridgeReady = bridgedComponents.some((component) => component.lShaped);

  /**
   * §"Stage outcome": whether a FULL 2x2 qualified cross exists ANYWHERE — two task families x two model
   * families, all four cells qualified. This is stronger than BRIDGE_READY and is reported separately.
   */
  const fullCrosses = [];
  for (const left of taskFamilies) {
    for (const right of taskFamilies) {
      if (left >= right) continue;
      const models = modelFamilies.filter((model) => edges.some((edge) => edge.taskFamily === left && edge.modelFamily === model) && edges.some((edge) => edge.taskFamily === right && edge.modelFamily === model));
      if (models.length >= 2) fullCrosses.push(Object.freeze({ taskFamilies: Object.freeze([left, right]), modelFamilies: Object.freeze(models.slice(0, 2).sort()) }));
    }
  }

  return Object.freeze({
    TASK_READY: taskReady,
    MODEL_READY: modelReady,
    LOCAL_PAIR_READY: localPairReady,
    BRIDGE_READY: bridgeReady,
    fullTwoByTwoCrossExists: fullCrosses.length > 0,
    fullCrosses: Object.freeze(fullCrosses),
    qualifiedEdgeCount: edges.length,
    taskFamilies: Object.freeze(taskFamilies),
    modelFamilies: Object.freeze(modelFamilies),
    modelsOnTwoTaskFamilies: Object.freeze(modelsOnTwoTaskFamilies.map((entry) => `${entry.modelFamily}:${entry.taskFamilies.join('+')}`)),
    fixturesOnBothSentinelFamilies: Object.freeze(fixturesOnBothSentinels.map((entry) => `${entry.taskFamily}(${entry.fixtureId})`)),
    sentinelFamiliesWithAQualifiedFixture: Object.freeze(sentinelsWithAQualifiedFixture),
    sentinelFamiliesWithoutAQualifiedFixture: Object.freeze(sentinelFamilies.filter((family) => !sentinelsWithAQualifiedFixture.includes(family))),
    components: bridgedComponents,
    /** §"Readiness decomposition": the confound, stated whenever the graph is disconnected. */
    confoundNote: bridgeReady
      ? 'at least one connected component carries the L-shape, so a bridged claim is available for that component'
      : 'no connected component carries the L-shape, so any cross-model claim remains TASK-CONFOUNDED',
    edges: Object.freeze(edges),
  });
}

/**
 * §"Continuation ruling": the next stage this portfolio licenses. The ruling's order is explicit and this
 * function implements it rather than leaving the choice to prose.
 */
export function continuation(readinessReport) {
  if (readinessReport.BRIDGE_READY === true) {
    return Object.freeze({ next: 'R3-BX', reason: 'BRIDGE_READY: a bridged task/model replication stage is licensed', allowed: true });
  }
  if (readinessReport.LOCAL_PAIR_READY === true) {
    return Object.freeze({ next: 'R3-BL', reason: 'LOCAL_PAIR_READY but not BRIDGE_READY: only pair-local mechanism replication is licensed, and any cross-model claim remains task-confounded', allowed: true });
  }
  return Object.freeze({ next: 'ARCHITECTURAL REVIEW', reason: 'neither LOCAL_PAIR_READY nor BRIDGE_READY holds, so the stage stops and returns for architectural adjudication', allowed: false });
}
