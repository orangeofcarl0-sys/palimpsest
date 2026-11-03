/**
 * The task text for ONE ephemeral reasoning branch.
 *
 * Two capability profiles reach this function:
 *
 *   RESULT_ONLY       the branch may call exactly one tool, `palimpsest_branch_result`, and reasons
 *                     only over the frozen brief (and materialized evidence when supplied). This is
 *                     every blocking `palimpsest_collaborate` branch and its wording is unchanged.
 *   PROJECT_READ_ONLY a delegated research branch may ALSO inspect the frozen working directory
 *                     through the host's `read`, `glob` and `grep`. The capability boundary is still
 *                     structural (`composeBranchHostEnvironment` publishes the allowlist and the
 *                     runner restricts to it); this text must not contradict it.
 *
 * The prompt is presentation, never authority: it grants no tool, no write and no settlement.
 */

const READ_ONLY_TOOL_NAMES = ['`read`', '`glob`', '`grep`'];

export function branchTask(payload) {
  const brief = payload.brief;
  const evidenceContext = payload.evidenceContext;
  const allowed = Array.isArray(evidenceContext?.allowedEvidenceRefs)
    ? evidenceContext.allowedEvidenceRefs.map((ref) => (typeof ref === 'string' ? ref : ref?.evidenceId)).filter((id) => typeof id === 'string' && id.length > 0)
    : [];
  const selections = Array.isArray(evidenceContext?.selections) ? evidenceContext.selections : [];
  const hasEvidence = allowed.length > 0 || selections.length > 0;
  const readOnly = payload.capabilityProfile === 'PROJECT_READ_ONLY';

  const lines = [
    readOnly
      ? 'You are an EPHEMERAL reasoning branch of a Palimpsest ReasoningCell. You are NOT a durable principal: you create no peer, no persistent point and no durable session. You may inspect the FROZEN working directory with the host read-only tools ' +
        READ_ONLY_TOOL_NAMES.join(', ') +
        ', and you must not write, edit or run commands. You call `palimpsest_branch_result` exactly ONCE.'
      : 'You are an EPHEMERAL reasoning branch of a Palimpsest ReasoningCell. You are NOT a durable principal: you create no peer, no persistent point and no durable session. You have exactly ONE tool, `palimpsest_branch_result`, and you call it exactly ONCE.',
    '',
    `cellId: ${payload.cellId}`,
    `branchId: ${payload.branchId}`,
    `objective: ${typeof brief.objective === 'string' ? brief.objective : ''}`,
    `question: ${typeof brief.question === 'string' ? brief.question : ''}`,
    `acceptedFrontierBasis: ${JSON.stringify(brief.frontierBasis ?? null)}`,
    `acceptedClaims: ${JSON.stringify(brief.acceptedClaims ?? [])}`,
  ];

  if (hasEvidence) {
    lines.push('', 'ALLOWED EVIDENCE (you may cite ONLY these evidence ids):');
    for (const id of allowed) lines.push(`- ${id}`);
    lines.push('', 'MATERIALIZED EVIDENCE SELECTIONS (the exact selected bytes; this is ALL you may read):');
    for (const selection of selections) {
      lines.push(
        `--- evidenceId: ${String(selection?.evidenceId)} | kind: ${String(selection?.kind)} | mediaType: ${String(selection?.mediaType)} | digest: ${String(selection?.digest)} ---`,
      );
      lines.push(String(selection?.text ?? ''));
    }
    lines.push(
      '',
      'EVIDENCE RULES:',
      '- You may cite ONLY evidence ids from the ALLOWED EVIDENCE list above; never invent, guess or cite any other id.',
      '- You may NOT browse the Vault or read any other source; the materialized selections above are ALL the evidence you may use.',
      '- Your result MUST include `evidenceRefs` set to the evidence ids you actually used (an array of id strings).',
    );
  }

  if (readOnly && !hasEvidence) {
    lines.push(
      '',
      'FROZEN READ BASIS: the current working directory is a detached snapshot of the project at the delegation basis. Use `read`, `glob` and `grep` to inspect whatever bears on the question. Nothing you find there is Evidence, Proof or Project Verification; if the sources do not settle the question, say exactly what is missing.',
      'RESULT SHAPE: when no evidence allowlist was supplied, do not send `evidenceRefs` — file paths are not evidence ids. Name the files you relied on inside the statement instead.',
    );
  }

  lines.push('', 'Do this now:');
  lines.push(
    readOnly && !hasEvidence
      ? '1. Inspect the frozen basis as needed and think briefly about the frozen question.'
      : '1. Think briefly about the frozen question using ONLY the material above.',
  );
  lines.push(
    '2. Call `palimpsest_branch_result` EXACTLY ONCE with {"statement":"<one concise, falsifiable statement that directly answers the question>"' +
      (hasEvidence ? ',"evidenceRefs":["<only evidence ids you actually used from the ALLOWED list>"]' : '') +
      '}. Do not call it again if it succeeds or fails.',
  );
  lines.push('3. Reply with one short line. Do nothing else.');
  return lines.join('\n');
}
