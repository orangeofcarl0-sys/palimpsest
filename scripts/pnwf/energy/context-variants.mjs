/** Each live T2 treatment changes one part of the model's context. */
import { BULLETIN, WORK_T2_PROMPT, assert } from "./contract.mjs";

export const CONTEXT_VARIANTS = Object.freeze(["receipt", "read-plan", "brief-pulse"]);
const REVIEW_INSTRUCTIONS = "After run, review the revisionReceipt in its result. Use its basis and candidate to expand a specific changed file with palimpsest_revision_review if needed. Review the compact receipt before deciding whether to record WAIT_FOR_OPERATOR.";
export const READ_PLAN = `Start with ${BULLETIN} and the relevant files in sources/. Read each needed baseline file once with a file read. Use the five declared paths to select files and read the retained certificate if its contents affect your decision. Use the Git basis to distinguish old and revised content.`;

export function revisionPrompt(variant) {
  if (variant === "receipt") return `${WORK_T2_PROMPT}\n\n${REVIEW_INSTRUCTIONS}`;
  if (variant === "read-plan") return `${WORK_T2_PROMPT}\n\n${READ_PLAN}`;
  return WORK_T2_PROMPT;
}

export function workerInstructions(variant) {
  if (variant === "receipt") return ["Commit the revision, then call palimpsest_revision_review with no arguments to see the committed verification receipt. Use its basis and candidate to expand a specific changed file only if needed. Report READY_FOR_SETTLEMENT after reviewing the receipt."];
  if (variant === "read-plan") return [READ_PLAN];
  return [];
}

export function briefPulse(pulse) {
  const { digest: sourcePulseDigest, episode, nextActions, ...body } = pulse;
  const omitted = [...pulse.coverage.omitted];
  let episodeView = episode;
  if (episode.state === "REOPENED" && episode.current === false && episode.conclusion) {
    const { conclusionId, intent, basis, recordedAt } = episode.conclusion;
    episodeView = { ...episode, conclusion: { conclusionId, intent, basis, recordedAt } };
    omitted.push("episode.conclusion details");
  }
  const { decisionRelevant, ...mechanical } = nextActions;
  const repeated = pulse.decisionQueue.map(item => `${item.who === "OPERATOR" ? "operator" : "agent"}: ${item.detail}`);
  const mirrored = repeated.length > 0 && JSON.stringify(repeated) === JSON.stringify(decisionRelevant);
  if (mirrored) omitted.push("nextActions.decisionRelevant (already in decisionQueue)");
  return { ...body, presentation: "brief", sourcePulseDigest, episode: episodeView,
    nextActions: mirrored ? mechanical : nextActions,
    coverage: { ...pulse.coverage, complete: pulse.coverage.complete && omitted.length === 0, omitted } };
}

export function briefPulseTool(definition) {
  return {
    ...definition,
    description: `${definition.description} Pulse defaults to a brief view here. Use detail "full" to inspect the complete pulse.`,
    parameters: { ...definition.parameters, properties: { ...definition.parameters.properties,
      detail: { type: "string", enum: ["full"], description: "expand the full pulse" } } },
    async execute(input, context) {
      if (input?.action !== "pulse") return definition.execute(input, context);
      const { detail, ...args } = input;
      assert(detail === undefined || detail === "full", "UNKNOWN_PULSE_DETAIL");
      const pulse = await definition.execute(args, context);
      return detail === "full" ? pulse : briefPulse(pulse);
    },
  };
}
