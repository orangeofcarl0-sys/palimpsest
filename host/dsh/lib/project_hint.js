// palimpsest-dsh-host/project_hint — ONE sentence of project context at principal launch.
//
// MEASURED FAILURE (COG-2): with a populated project journal and a neutral task, a cold principal
// made ZERO Palimpsest calls and never discovered the recorded work; a separate cold round of the
// same project did the same. With one sentence saying earlier work may be inspected, the same model
// read the journal and used it. The capability was present; it was not visible at the moment of use.
//
// APS-A extends the same presentation-only seam: when the composed workspace exposes the derived
// pulse, the hint names that ONE read. It does not inline the pulse, a goal, an asset, a finding or a
// decision, and it does not tell the principal what to conclude. The product still owns the read; the
// principal still decides whether the project state bears on the task.
//
// An absent workspace, a project that has not started, or a failed read composes the original message
// BYTE-IDENTICAL, so a project with no recorded work and a broken store both behave as before.

/**
 * @param {{
 *   journal?: () => Promise<readonly unknown[]>,
 *   view?: () => Promise<unknown>,
 *   pulse?: () => Promise<unknown>,
 * } | undefined | null} workspace
 * @returns {Promise<string | null>} one sentence, or null when there is nothing to say
 */
export async function projectContextHint(workspace) {
  if (workspace === undefined || workspace === null) return null;

  let entries;
  let hasProject = false;
  if (typeof workspace.view === 'function') {
    try {
      const view = await workspace.view();
      const goal = view?.project?.goal;
      hasProject = typeof goal === 'string' && goal.length > 0;
    } catch {
      hasProject = false;
    }
  }
  if (typeof workspace.journal === 'function') {
    try {
      const listed = await workspace.journal();
      if (Array.isArray(listed)) entries = listed;
    } catch {
      // Keep the hint truthful: an unreadable journal is simply not counted.
    }
  }

  if (typeof workspace.pulse === 'function' && (hasProject || (Array.isArray(entries) && entries.length > 0))) {
    return 'This is an ongoing project: earlier work, current commitments and any unconsumed contributions are recorded. Call palimpsest_continuity action=pulse before deciding what to do next; it is a derived read, not an instruction.';
  }

  if (!Array.isArray(entries) || entries.length === 0) return null;
  const noun = entries.length === 1 ? 'entry' : 'entries';
  return `This is an ongoing project: earlier work is recorded in the project workspace (${entries.length} journal ${noun}) and may be inspected if it bears on this task.`;
}

/**
 * @param {{
 *   journal?: () => Promise<readonly unknown[]>,
 *   view?: () => Promise<unknown>,
 *   pulse?: () => Promise<unknown>,
 * } | undefined | null} workspace
 * @param {string} message
 * @returns {Promise<string>} the launch message, unchanged unless there is a hint
 */
export async function composeLaunchMessage(workspace, message) {
  const hint = await projectContextHint(workspace);
  if (hint === null || typeof message !== 'string' || message.trim() === '') return message;
  return `${hint}\n\n${message}`;
}
