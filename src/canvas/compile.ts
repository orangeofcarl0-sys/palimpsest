/**
 * PLMP-CANVAS-1 §1.2 + PLMP-CANVAS-6 + PLMP-GRAPH-1 §1.3: compilation is a
 * single path - CanvasDoc v2 lifts into the AgentGraph IR (node keys become
 * data edges; the subflow boundary is editorial), and the IR's capability-
 * gated compiler produces the ProjectProposal. Inside the doc, dependencies
 * reference NODE KEYS (the stable graph identity - renaming a title never
 * breaks an edge); titles stay the proposal's dependency vocabulary, so the
 * vocabulary switch happens exactly once, in the IR compile. Groups are
 * transparent and annotations are dropped.
 */

import { compileAgentGraph } from "../graph/index.js";
import type { ProjectProposal } from "../architecture/index.js";
import { ROOT_Z, type CanvasDoc, type CanvasNode } from "./doc.js";
import { liftToAgentGraph } from "./lift.js";

export function canvasCompile(
  doc: CanvasDoc,
  options?: { readonly goal?: string; readonly changeClass?: ProjectProposal["changeClass"] },
): ProjectProposal {
  return compileAgentGraph(liftToAgentGraph(doc), options);
}

/**
 * Proposal → fragment nodes on a simple vertical stack (presentation
 * seeding). Keys are freshly generated and the proposal's title dependencies
 * are remapped onto them, so the fragment round-trips through compile
 * byte-identically.
 */
export function proposalFragment(
  proposal: ProjectProposal,
  at: { readonly x: number; readonly y: number } = { x: 80, y: 80 },
): CanvasNode[] {
  let next = 0;
  return fragmentNodes(proposal, at, () => `f${(next += 1)}`);
}

function fragmentNodes(
  proposal: ProjectProposal,
  anchor: { readonly x: number; readonly y: number },
  freshKey: () => string,
): CanvasNode[] {
  const keys = proposal.tasks.map(() => freshKey());
  const keyByTitle = new Map(proposal.tasks.map((task, index) => [task.title, keys[index]!]));
  return proposal.tasks.map((task, index) => ({
    key: keys[index]!,
    type: "task" as const,
    title: task.title,
    x: anchor.x,
    y: anchor.y + index * 120,
    z: ROOT_Z,
    task: {
      // Unmapped titles cannot happen in a validated proposal; keeping the
      // raw string lets the parser refuse it loudly instead of dropping it.
      dependsOn: task.dependsOn.map((title) => keyByTitle.get(title) ?? title),
      ...(task.writePaths === undefined ? {} : { writePaths: [...task.writePaths] }),
      ...(task.requiredArtifacts === undefined ? {} : { requiredArtifacts: [...task.requiredArtifacts] }),
      ...(task.gateId === undefined ? {} : { gateId: task.gateId }),
      ...(task.role === undefined ? {} : { role: task.role }),
      ...(task.suggestedSkills === undefined ? {} : { suggestedSkills: [...task.suggestedSkills] }),
    },
  }));
}

/**
 * Insert a proposal as an editable fragment: keys are regenerated against
 * the doc (no collisions) with dependencies remapped onto them, nodes land
 * at `at` (default: right of the existing bounds), and an empty doc goal
 * adopts the proposal's.
 */
export function canvasInsertFragment(
  doc: CanvasDoc,
  proposal: ProjectProposal,
  at?: { readonly x: number; readonly y: number },
): CanvasDoc {
  const usedKeys = new Set(doc.nodes.map((node) => node.key));
  let next = 1;
  const freshKey = (): string => {
    while (usedKeys.has(`n${next}`)) next += 1;
    const key = `n${next}`;
    usedKeys.add(key);
    return key;
  };
  const maxX = doc.nodes.reduce((acc, node) => Math.max(acc, node.x), 0);
  const anchor = at ?? { x: maxX + 300, y: 80 };
  const nodes: CanvasNode[] = [...doc.nodes, ...fragmentNodes(proposal, anchor, freshKey)];
  return {
    version: 2,
    goal: doc.goal.trim() === "" ? proposal.goal : doc.goal,
    nodes,
    groups: [...doc.groups],
  };
}
