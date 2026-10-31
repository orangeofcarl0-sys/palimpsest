// palimpsest-dsh-host/project_hint — ONE sentence of project context at principal launch.
//
// MEASURED FAILURE (COG-2): with a populated project journal and a neutral task, a cold principal
// made ZERO Palimpsest calls and never discovered the recorded work; a separate cold round of the
// same project did the same. With one sentence saying earlier work may be inspected, the same model
// read the journal and used it. The capability was present; it was not visible at the moment of use.
//
// WHAT THIS IS: presentation, not semantics. It reads the existing project workspace's own journal
// list and states how many entries exist. It injects no title, no body, no kind, no entry id, no
// asset and no instruction to call a specific tool. It creates no store, owner, router or authority.
// An absent workspace, an empty journal or a failed read composes the original message BYTE-IDENTICAL,
// so a project with no recorded work and a broken store both behave exactly as before.
//
// WHAT THIS IS NOT: it is not automatic knowledge injection and not a decision. The principal still
// chooses whether the recorded work bears on the task; the product still owns the read.

/**
 * @param {{ journal?: () => Promise<readonly unknown[]> } | undefined | null} workspace
 * @returns {Promise<string | null>} one sentence, or null when there is nothing to say
 */
export async function projectContextHint(workspace) {
  if (workspace === undefined || workspace === null || typeof workspace.journal !== 'function') return null;
  let entries;
  try {
    entries = await workspace.journal();
  } catch {
    // A store that cannot be read is not a reason to refuse the turn; the principal can still work
    // from the world, exactly as it did before this seam existed.
    return null;
  }
  if (!Array.isArray(entries) || entries.length === 0) return null;
  const noun = entries.length === 1 ? 'entry' : 'entries';
  return `This is an ongoing project: earlier work is recorded in the project workspace (${entries.length} journal ${noun}) and may be inspected if it bears on this task.`;
}

/**
 * @param {{ journal?: () => Promise<readonly unknown[]> } | undefined | null} workspace
 * @param {string} message
 * @returns {Promise<string>} the launch message, unchanged unless there is a hint
 */
export async function composeLaunchMessage(workspace, message) {
  const hint = await projectContextHint(workspace);
  if (hint === null || typeof message !== 'string' || message.trim() === '') return message;
  return `${hint}\n\n${message}`;
}
