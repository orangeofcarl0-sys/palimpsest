/**
 * PLMP-CANVAS-2 §2.3: the draft-vs-live diff. Titles are the identity on
 * both sides (live task objectives); set-valued fields compare as sets so
 * ordering never fakes a change. The kernel derives this - the panel only
 * renders it. Live tasks carry task-id dependencies, so the caller maps ids
 * to objectives first (unmapped ids compare as their raw id and surface as
 * a change - honest).
 */

import type { TaskProposal } from "../architecture/index.js";

/** The slice of the VIS projection the diff reads (objective-keyed). */
export interface LiveTaskView {
  readonly objective: string;
  readonly dependsOn: readonly string[];
  readonly writePaths: readonly string[];
  readonly requiredArtifacts: readonly string[];
  readonly role?: string;
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
  if (asSet(draft.dependsOn) !== asSet(live.dependsOn)) fields.push("dependsOn");
  if (asSet(draft.writePaths ?? []) !== asSet(live.writePaths)) fields.push("writePaths");
  if (asSet(draft.requiredArtifacts ?? []) !== asSet(live.requiredArtifacts)) {
    fields.push("requiredArtifacts");
  }
  if ((draft.role ?? "implementer") !== (live.role ?? "implementer")) fields.push("role");
  return fields;
}

export function canvasDiff(
  draftTasks: readonly TaskProposal[],
  liveTasks: readonly LiveTaskView[],
): CanvasDiffResult {
  const liveByTitle = new Map(liveTasks.map((task) => [task.objective, task]));
  const draftTitles = new Set(draftTasks.map((task) => task.title));
  const added = draftTasks
    .filter((task) => !liveByTitle.has(task.title))
    .map((task) => ({ title: task.title }));
  const removed = liveTasks
    .filter((task) => !draftTitles.has(task.objective))
    .map((task) => ({ title: task.objective }));
  const changed = draftTasks.flatMap((task) => {
    const live = liveByTitle.get(task.title);
    if (live === undefined) return [];
    const fields = changedFields(task, live);
    return fields.length === 0 ? [] : [{ title: task.title, fields }];
  });
  return { added, removed, changed };
}
