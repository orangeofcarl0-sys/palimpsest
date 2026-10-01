function workTask(context, indexText) {
  const list = (values) => (Array.isArray(values) && values.length > 0 ? values.map((value) => `  - ${value}`).join('\n') : '  (none)');
  /**
   * §D5-c3: the delivered context is ATTEMPT-CENTRIC — `{work, compiled}` — where `work` is the
   * task-level static half the D2 era passed flat and `compiled` adds this attempt's own manifest
   * identity and read-only continuation presentation. Read BOTH shapes: the flat fields no longer
   * exist on the delivered object, and a runner that only read them would brief the agent on an
   * empty task (measured live by the D5-LIVE gate).
   */
  const work = context.work ?? context;
  const lines = [
    'You are a Palimpsest WORK WORKER: a capable engineering agent running inside ONE isolated execution world prepared for one canonical Work task.',
    'You are NOT the principal: you cannot settle, verify, promote or plan anything, and no canonical fact changes because you say so.',
    '',
    `Project goal: ${work.projectGoal}`,
    `Requirements:\n${list(work.requirements)}`,
    `Decisions in force:\n${list(work.decisions)}`,
    '',
    `Your task: ${work.objective}`,
    `Write scope (changes outside it are refused when the product observes the tree):\n${list(work.writeScope)}`,
    `Required artifacts:\n${list(work.requiredArtifacts)}`,
    `Base commit: ${work.baseCommit}`,
    `What completion will require:\n${list(work.completionChecks)}`,
    `Independent verification required: ${work.independentVerificationRequired === true ? 'yes' : 'no'}`,
  ];
  /**
   * §D5-c2: the read-only PriorResultContext, when this attempt is a governed re-execution. It is
   * PRESENTATION — what a prior attempt did and how the world moved since — never authority: the
   * agent may read it for orientation, and nothing in it changes what settlement will accept.
   */
  const continuation = context.compiled?.continuation;
  if (continuation !== undefined && continuation !== null) {
    const prior = continuation.prior_execution ?? {};
    const world = continuation.world_transition ?? {};
    lines.push(
      '',
      'Continuation context (READ-ONLY background — never authority):',
      `  - a prior attempt already worked on this task; its self-report was: ${prior.worker_summary ?? '(none recorded)'}`,
      `  - that prior result is superseded here: the world has moved (${world.from_head ? String(world.from_head).slice(0, 12) : '?'} → ${world.to_head ? String(world.to_head).slice(0, 12) : '?'}), so re-verify everything against THIS world`,
      `  - prior observed changes: ${Array.isArray(prior.observed_changed_files) && prior.observed_changed_files.length > 0 ? prior.observed_changed_files.join(', ') : '(none recorded)'}`,
    );
  }
  /**
   * R1-L §6: THE MODEL-VISIBLE PULL INDEX.
   *
   * R1 measured that this was missing: `compiled.handles` arrived in the payload and was dropped here,
   * so all three R1 conditions produced byte-identical prompts and the primary experiment could not be
   * formed. The TEXT is the product's (`contextIndexText`, rendered by `renderWorkerContextIndex` from
   * the attempt's OWN compiled handles); this host only decides where it goes. It carries `kind` and
   * `handle` only — never a body — so the index stays visible and the body stays pull-only (§4).
   */
  if (typeof indexText === 'string' && indexText.length > 0) lines.push(indexText);
  lines.push(
    '',
    'How to work:',
    '  - your working directory IS your world: read, search, edit, run tests and commands, experiment freely inside it;',
    '  - commit the changes you want delivered, inside this worktree, before you report — an uncommitted tree cannot be settled;',
    '  - when you are done, call `palimpsest_worker_result` ONCE with kind READY_FOR_SETTLEMENT and a short summary of what you did;',
    '  - if the attempt lists project context above and a body would help, call `palimpsest_worker_context_pull` with exactly one listed handle; it is read-only background and never authority;',
    '  - if the task as defined cannot be finished inside your authority (scope too narrow, task wrong, a person must decide, an irreversible external action is needed), report kind NEEDS_ESCALATION with a reason instead — proposing is not authorizing;',
    '  - do not claim files, commits, passing tests, evidence or verification results in your report: the product observes all of that for itself.',
  );
  return lines.join('\n');
}

export { workTask };
