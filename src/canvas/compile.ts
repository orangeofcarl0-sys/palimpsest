/**
 * PLMP-CANVAS-1 §1.2: compilation. Because dependencies are titles in one
 * global namespace, compiling a CanvasDoc to a ProjectProposal is a flatten
 * across the `z` chain - the subflow boundary is editorial, and its inputs/
 * outputs are just the members an outside task depends on / that outside
 * tasks depend on. Groups are transparent and annotations are dropped.
 *
 * Structural authoring errors fail closed here (before the shared proposal
 * validator runs): duplicate titles would silently corrupt the title-keyed
 * dependency graph downstream, so the compile refuses them outright.
 */

import type { ProjectProposal, TaskProposal } from "../architecture/index.js";
import { ROOT_Z, type CanvasDoc, type CanvasNode } from "./doc.js";

function taskProposalOf(node: CanvasNode): TaskProposal {
  const task = node.task!;
  return {
    title: node.title,
    dependsOn: [...task.dependsOn],
    ...(task.writePaths === undefined ? {} : { writePaths: [...task.writePaths] }),
    ...(task.requiredArtifacts === undefined ? {} : { requiredArtifacts: [...task.requiredArtifacts] }),
    ...(task.gateId === undefined ? {} : { gateId: task.gateId }),
    ...(task.role === undefined ? {} : { role: task.role }),
    ...(task.suggestedSkills === undefined ? {} : { suggestedSkills: [...task.suggestedSkills] }),
  };
}

export function canvasCompile(
  doc: CanvasDoc,
  options?: { readonly goal?: string; readonly changeClass?: ProjectProposal["changeClass"] },
): ProjectProposal {
  const taskNodes = doc.nodes.filter((node) => node.type === "task");
  const titles = taskNodes.map((node) => node.title);
  const seen = new Set<string>();
  for (const title of titles) {
    if (seen.has(title)) failDuplicate(title);
    seen.add(title);
  }
  return {
    goal: options?.goal ?? doc.goal,
    changeClass: options?.changeClass ?? "behavior_change",
    tasks: taskNodes.map(taskProposalOf),
  };
}

function failDuplicate(title: string): never {
  throw new Error(`canvas doc: duplicate task title "${title}" - titles are the dependency key`);
}

/** Proposal → fragment nodes on a simple vertical stack (presentation seeding). */
export function proposalFragment(
  proposal: ProjectProposal,
  at: { readonly x: number; readonly y: number } = { x: 80, y: 80 },
): CanvasNode[] {
  return proposal.tasks.map((task, index) => ({
    key: `f${index + 1}`,
    type: "task" as const,
    title: task.title,
    x: at.x,
    y: at.y + index * 120,
    z: ROOT_Z,
    task: {
      dependsOn: [...task.dependsOn],
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
 * the doc (no collisions), nodes land at `at` (default: right of the
 * existing bounds), and an empty doc goal adopts the proposal's.
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
  const fragment = proposalFragment(proposal, anchor);
  const nodes: CanvasNode[] = [
    ...doc.nodes,
    ...fragment.map((node) => ({ ...node, key: freshKey() })),
  ];
  return {
    version: 1,
    goal: doc.goal.trim() === "" ? proposal.goal : doc.goal,
    nodes,
    groups: [...doc.groups],
  };
}
