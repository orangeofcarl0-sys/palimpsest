/**
 * PLMP-CANVAS-1 §1.2 + PLMP-CANVAS-6 + PLMP-GRAPH-1 §1.3: compilation is a
 * single path - CanvasDoc v3 lifts into the AgentGraph IR (`doc.edges[]`
 * with stable ids become the data edges; the subflow boundary is editorial),
 * and the IR's capability-gated compiler produces the ProjectProposal.
 * Inside the doc, dependencies are EDGE records between NODE KEYS (the
 * stable graph identity - renaming a title never breaks an edge); titles
 * stay the proposal's dependency vocabulary, so the vocabulary switch
 * happens exactly once, in the IR compile. Groups are transparent and
 * annotations are dropped.
 */

import { compileAgentGraph } from "../graph/index.js";
import type { ProjectProposal } from "../architecture/index.js";
import {
  allocateCanvasEdgeId,
  allocateCanvasNodeId,
  ROOT_Z,
  type CanvasDoc,
  type CanvasEdge,
  type CanvasNode,
} from "./doc.js";
import { liftToAgentGraph } from "./lift.js";

export function canvasCompile(
  doc: CanvasDoc,
  options?: { readonly goal?: string; readonly changeClass?: ProjectProposal["changeClass"] },
): ProjectProposal {
  return compileAgentGraph(liftToAgentGraph(doc), options);
}

/**
 * Insert a proposal as an editable fragment: node keys come from the doc's
 * monotonic identity family (never a reused key - 32 号), dependencies are
 * remapped from proposal titles onto those keys and materialized as fresh
 * edge records, nodes land at `at` (default: right of the existing bounds),
 * and an empty doc goal adopts the proposal's.
 */
export function canvasInsertFragment(
  doc: CanvasDoc,
  proposal: ProjectProposal,
  at?: { readonly x: number; readonly y: number },
): CanvasDoc {
  let working = doc;
  const keys: string[] = [];
  for (let index = 0; index < proposal.tasks.length; index += 1) {
    const allocated = allocateCanvasNodeId(working);
    working = allocated.doc;
    keys.push(allocated.id);
  }
  const keyByTitle = new Map(proposal.tasks.map((task, index) => [task.title, keys[index]!]));
  const maxX = doc.nodes.reduce((acc, node) => Math.max(acc, node.x), 0);
  const anchor = at ?? { x: maxX + 300, y: 80 };
  const nodes: CanvasNode[] = [
    ...working.nodes,
    ...proposal.tasks.map((task, index): CanvasNode => {
      const key = keys[index]!;
      return {
        key,
        type: "task",
        title: task.title,
        x: anchor.x,
        y: anchor.y + index * 120,
        z: ROOT_Z,
        task: {
          ...(task.writePaths === undefined ? {} : { writePaths: [...task.writePaths] }),
          ...(task.requiredArtifacts === undefined ? {} : { requiredArtifacts: [...task.requiredArtifacts] }),
          ...(task.gateId === undefined ? {} : { gateId: task.gateId }),
          ...(task.role === undefined ? {} : { role: task.role }),
          ...(task.suggestedSkills === undefined ? {} : { suggestedSkills: [...task.suggestedSkills] }),
        },
      };
    }),
  ];
  const edges: CanvasEdge[] = [...working.edges];
  for (let index = 0; index < proposal.tasks.length; index += 1) {
    const task = proposal.tasks[index]!;
    for (const title of task.dependsOn) {
      const source = keyByTitle.get(title);
      // Proposals are validated closed, so the mapping is total; keeping the
      // check loud here preserves that contract without relying on a later
      // parse to catch it.
      if (source === undefined) {
        throw new Error(`canvas doc: proposal depends on "${title}", which is not in the fragment`);
      }
      const allocated = allocateCanvasEdgeId(working);
      working = allocated.doc;
      edges.push({ id: allocated.id, source, target: keys[index]!, kind: "data" });
    }
  }
  return {
    ...working,
    goal: working.goal.trim() === "" ? proposal.goal : working.goal,
    nodes,
    edges,
  };
}
