/**
 * PLMP-CANVAS-1 §1.2 + PLMP-CANVAS-6 (23 号规格): compilation. Inside the
 * doc, task dependencies reference NODE KEYS (the stable graph identity -
 * renaming a title never breaks an edge). Compiling to a ProjectProposal
 * maps key→title: titles stay the proposal's dependency vocabulary, so the
 * flatten across the `z` chain is where the vocabulary switch happens - the
 * subflow boundary is editorial, and its inputs/outputs are just the members
 * an outside task depends on / that outside tasks depend on. Groups are
 * transparent and annotations are dropped.
 *
 * Structural authoring errors fail closed here (before the shared proposal
 * validator runs): duplicate titles would silently corrupt the title-keyed
 * dependency graph downstream, so the compile refuses them outright; a
 * dependency key that survived without parsing cannot be resolved and is
 * refused too.
 */

import type { ProjectProposal, TaskProposal } from "../architecture/index.js";
import { ROOT_Z, type CanvasDoc, type CanvasNode } from "./doc.js";

function taskProposalOf(node: CanvasNode, titleByKey: Map<string, string>): TaskProposal {
  const task = node.task!;
  return {
    title: node.title,
    dependsOn: task.dependsOn.map((key) => {
      const title = titleByKey.get(key);
      if (title === undefined) failUnresolvable(node.key, key);
      return title;
    }),
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
  const titleByKey = new Map(taskNodes.map((node) => [node.key, node.title]));
  const seen = new Set<string>();
  for (const title of taskNodes.map((node) => node.title)) {
    if (seen.has(title)) failDuplicate(title);
    seen.add(title);
  }
  return {
    goal: options?.goal ?? doc.goal,
    changeClass: options?.changeClass ?? "behavior_change",
    tasks: taskNodes.map((node) => taskProposalOf(node, titleByKey)),
  };
}

function failDuplicate(title: string): never {
  throw new Error(`canvas doc: duplicate task title "${title}" - titles are the dependency key in the compiled proposal`);
}

function failUnresolvable(key: string, dependency: string): never {
  throw new Error(`canvas doc: node "${key}" depends on unresolvable key "${dependency}"`);
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
