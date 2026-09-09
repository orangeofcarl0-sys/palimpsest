/**
 * PLMP-CANVAS-2 §2.3 + PLMP-CANVAS-7 (32 号 D7): the draft-vs-live diff.
 * IDENTITY RULE (DIFF-INV-1): current work-definition identity dominates
 * title - when the live side exposes definitionIds, draft tasks match live
 * tasks BY definitionId; a renamed task is `changed(title)`, never
 * remove+add, and a same-titled task with a different identity is
 * remove+add, never "unchanged". Title matching is an EXPLICIT legacy
 * fallback used only where identity is genuinely unavailable (spec-first
 * live projects without definition_id, or hand-written draft proposals
 * without definitionId) - identity and title matching are never silently
 * mixed for a pair that has both.
 *
 * UAS-D-INV-3 (red line): this is a Work-definition diff. It is not a
 * future SystemGraph/Architecture diff - G10 gives that its own typed
 * target.
 *
 * Set-valued fields compare as sets so ordering never fakes a change. The
 * kernel derives this - the panel only renders it. Live tasks carry task-id
 * dependencies, so the caller maps ids to objectives first (unmapped ids
 * compare as their raw id and surface as a change - honest).
 */

import type { TaskProposal } from "../architecture/index.js";

/** The slice of the VIS projection the diff reads. definitionId/scopeId are
 * present on canvas-declared projects (PLMP-GRAPH-3/4); absent on
 * spec-first projects, which switches matching to the documented title
 * fallback. suggestedSkills rides TaskSpec since E2 (32 号 §12); gateId is
 * advisory-only (20 号 - it never enters TaskSpec) so there is no live gate
 * field to compare. */
export interface LiveTaskView {
  readonly objective: string;
  readonly dependsOn: readonly string[];
  readonly writePaths: readonly string[];
  readonly requiredArtifacts: readonly string[];
  readonly role?: string;
  readonly suggestedSkills?: readonly string[];
  readonly definitionId?: string;
  readonly scopeId?: string;
}

export interface CanvasDiffEntry {
  readonly title: string;
}

export interface CanvasDiffChanged {
  readonly title: string;
  readonly fields: readonly string[];
}

export interface CanvasDiffResult {
  readonly added: readonly CanvasDiffEntry[];
  readonly removed: readonly CanvasDiffEntry[];
  readonly changed: readonly CanvasDiffChanged[];
}

const asSet = (values: readonly string[]): string => [...values].sort().join("\n");

function changedFields(draft: TaskProposal, live: LiveTaskView): string[] {
  const fields: string[] = [];
  if (draft.title !== live.objective) fields.push("title");
  if (asSet(draft.dependsOn) !== asSet(live.dependsOn)) fields.push("dependsOn");
  if (asSet(draft.writePaths ?? []) !== asSet(live.writePaths)) fields.push("writePaths");
  if (asSet(draft.requiredArtifacts ?? []) !== asSet(live.requiredArtifacts)) {
    fields.push("requiredArtifacts");
  }
  if ((draft.role ?? "implementer") !== (live.role ?? "implementer")) fields.push("role");
  // PLMP-GRAPH-3: runtime-subgraph scope is a Work-definition semantic field;
  // absent on both sides means equal (absent ≡ absent).
  if ((draft.scopeId ?? null) !== (live.scopeId ?? null)) fields.push("scope");
  // 32 号 §12: skill hints are declared Work payload (TaskSpec.suggested_skills
  // since E2). Gate is NOT diffable - proposal gateId is advisory (20 号:
  // gates keep their single declareGate path) and never lands in TaskSpec.
  if (asSet(draft.suggestedSkills ?? []) !== asSet(live.suggestedSkills ?? [])) {
    fields.push("suggestedSkills");
  }
  return fields;
}

export function canvasDiff(
  draftTasks: readonly TaskProposal[],
  liveTasks: readonly LiveTaskView[],
): CanvasDiffResult {
  const liveHasIdentity = liveTasks.some((task) => task.definitionId !== undefined);
  const liveById = new Map<string, LiveTaskView>();
  for (const task of liveTasks) {
    if (task.definitionId !== undefined) liveById.set(task.definitionId, task);
  }
  const liveByTitle = new Map(liveTasks.map((task) => [task.objective, task]));
  const claimedLive = new Set<LiveTaskView>();
  const added: CanvasDiffEntry[] = [];
  const changed: CanvasDiffChanged[] = [];
  for (const task of draftTasks) {
    let live: LiveTaskView | undefined;
    if (task.definitionId !== undefined) {
      live = liveById.get(task.definitionId);
      // Identity dominates: a draft WITH an id never title-matches a live
      // side that exposes ids (same title + different id = remove + add).
      if (live === undefined && liveHasIdentity) {
        added.push({ title: task.title });
        continue;
      }
      // live side has no ids at all (spec-first project): the draft's id is
      // unmatchable - fall through to the documented title fallback.
    }
    if (live === undefined) {
      // Legacy title fallback - only for pairs where identity is genuinely
      // unavailable; and only against live tasks no identity match claimed.
      live = liveByTitle.get(task.title);
      if (live !== undefined && claimedLive.has(live)) live = undefined;
    }
    if (live === undefined) {
      added.push({ title: task.title });
      continue;
    }
    claimedLive.add(live);
    const fields = changedFields(task, live);
    if (fields.length > 0) changed.push({ title: task.title, fields });
  }
  const removed: CanvasDiffEntry[] = liveTasks
    .filter((task) => !claimedLive.has(task))
    .map((task) => ({ title: task.objective }));
  return { added, removed, changed };
}
