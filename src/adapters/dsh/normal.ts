/**
 * PC1 S02 — the NORMAL product work facade.
 *
 * One coherent tool for ordinary project work. It composes the existing owners; it owns no state,
 * no authority and no second scheduler. The legacy chain (`next`/`claim`/`report`/`gate`) and the
 * direct `begin`/`finish` pair remain available under the expert profile, but a normal profile
 * advertises this facade instead of both at once.
 *
 * Two deliberate boundaries:
 *
 *   - `status` projects AWAY attempt ids, evidence ids and promotion ids. Those are host/orchestrator
 *     identities, not decisions a principal makes; an operator surface may still read them.
 *   - `complete` is placement-aware. In-place work uses the existing `finish` route. A placed
 *     (worktree) attempt is NOT silently reported as complete by the principal: the placed worker
 *     and the host settle it, and this tool says so with the legal next action instead of suggesting
 *     a tool that cannot work there.
 */
import type { PalimpsestApplicationSurface } from "../../application/surface.js";
import type { DshToolDefinition } from "../../tools/dsh_types.js";
import { tool, ToolArgsError, requiredString, stringArray } from "./common.js";

const PROPOSAL_MARKER = "<!-- palimpsest-proposal:v1 -->";

function projectTaskInput(raw: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(raw)) throw new ToolArgsError("tasks must be an array");
  return raw.map((entry) => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      throw new ToolArgsError("each task must be an object");
    }
    const task = entry as Record<string, unknown>;
    const taskId = requiredString(task, "task_id");
    const objective = requiredString(task, "objective");
    return {
      task_id: taskId,
      objective,
      depends_on: task.depends_on === undefined ? [] : [...stringArray(task.depends_on, "depends_on")],
      write_paths: task.write_paths === undefined ? [] : [...stringArray(task.write_paths, "write_paths")],
      required_artifacts: task.required_artifacts === undefined ? [] : [...stringArray(task.required_artifacts, "required_artifacts")],
    };
  });
}

/** The principal-safe projection of orchestration status. */
function safeStatus(status: unknown): Record<string, unknown> {
  const view = status as {
    revision?: unknown;
    headCommit?: unknown;
    schedulerState?: unknown;
    tasks?: Array<{ task_id?: unknown; state?: unknown }>;
    attempts?: Array<{ state?: unknown }>;
    evidence?: Array<{ status?: unknown }>;
    promotions?: Array<{ state?: unknown }>;
    promotionFence?: Array<{ state?: unknown }>;
  };
  const tasks = (view.tasks ?? []).map((task) => ({ task_id: String(task.task_id), state: String(task.state) }));
  const attemptStates = (view.attempts ?? []).map((attempt) => String(attempt.state));
  const evidence = view.evidence ?? [];
  return {
    revision: view.revision,
    headCommit: view.headCommit,
    schedulerState: view.schedulerState,
    tasks,
    summary: {
      tasksTotal: tasks.length,
      tasksSatisfied: tasks.filter((task) => task.state === "SATISFIED").length,
      tasksVerifying: tasks.filter((task) => task.state === "VERIFYING").length,
      attemptsRunning: attemptStates.filter((state) => state === "RUNNING").length,
      attemptsCompleted: attemptStates.filter((state) => state === "COMPLETED").length,
      evidenceActive: evidence.filter((atom) => atom.status === "active").length,
      evidenceStale: evidence.filter((atom) => atom.status === "stale").length,
      promotionsPrepared: (view.promotions ?? []).filter((promotion) => promotion.state === "PREPARED").length,
      promotionFencePending: (view.promotionFence ?? []).length,
    },
    nextActions: [
      ...(attemptStates.includes("RUNNING") ? ["palimpsest_work action=complete"] : []),
      ...(tasks.some((task) => task.state === "VERIFYING") ? ["an operator must review and accept the delivered result"] : []),
      ...(tasks.some((task) => task.state === "READY") ? ["palimpsest_work action=next"] : []),
    ],
  };
}

export function defineNormalWorkTool(application: PalimpsestApplicationSurface): DshToolDefinition {
  const work = application.work;
  return tool({
    name: "palimpsest_work",
    description:
      "The NORMAL project work path. Use it for ordinary work on this project: read the state (`status`), revise the plan (`plan`), advance what the product can do mechanically (`next`, `run`), open one governed work position (`begin`), close it when done (`complete`), or save a follow-up proposal without forcing the current plan (`propose`). It never accepts an attempt id, an exit code, an evidence predicate or an approval. `complete` follows the deployment's real placement: in-place work is finished by the product's own observation; a placed worker is settled by its host worker, and this tool says so rather than suggesting a route that cannot work there. A proposal is NON-AUTHORITATIVE: it records what should be considered next; it does not approve, plan or accept anything.",
    mode: "mutating",
    actions: ["status", "plan", "next", "run", "begin", "complete", "propose"],
    extraProperties: {
      goal: { type: "string", description: "for begin/plan: what the work is, in the user's own words" },
      writePaths: { type: "array", items: { type: "string" }, description: "for begin: the paths this work may change" },
      requiredArtifacts: { type: "array", items: { type: "string" }, description: "for begin: paths the work must leave in place" },
      summary: { type: "string", description: "for complete: what you consider done, in your own words" },
      tasks: {
        type: "array",
        items: {
          type: "object",
          properties: {
            task_id: { type: "string" },
            objective: { type: "string" },
            depends_on: { type: "array", items: { type: "string" } },
            write_paths: { type: "array", items: { type: "string" } },
            required_artifacts: { type: "array", items: { type: "string" } },
          },
          required: ["task_id", "objective"],
        },
        description: "for plan: the complete task graph revision",
      },
      reason: { type: "string", description: "for plan: why this revision is proposed" },
      maxSteps: { type: "number", description: "for run: a bounded number of mechanical steps" },
      purpose: { type: "string", description: "for propose: what this follow-up would achieve" },
      proposedAction: { type: "string", description: "for propose: the concrete action proposed" },
      sources: { type: "array", items: { type: "string" }, description: "for propose: source refs/digests supporting it" },
      risk: { type: "string", description: "for propose: known risk or uncertainty" },
      requiredAuthority: { type: "string", description: "for propose: who must approve it" },
      expectedArtifact: { type: "string", description: "for propose: the expected output" },
    },
    run: async (action, object) => {
      if (action === "status") return safeStatus(work.status());
      if (action === "plan") {
        if (object.tasks === undefined) throw new ToolArgsError("tasks is required for plan");
        const tasks = projectTaskInput(object.tasks);
        const reason = requiredString(object, "reason");
        return work.control("plan", [{ tasks, reason }]);
      }
      if (action === "next") {
        const event = work.control("next", []) as { event_type?: unknown } | null;
        return { eventType: event?.event_type ?? null, status: safeStatus(work.status()) };
      }
      if (action === "run") {
        const maxSteps = object.maxSteps;
        if (maxSteps !== undefined && (typeof maxSteps !== "number" || !Number.isSafeInteger(maxSteps) || maxSteps < 1)) {
          throw new ToolArgsError('argument "maxSteps" must be a positive integer');
        }
        const outcome = await work.control("run", maxSteps === undefined ? [] : [maxSteps]);
        return { outcome, status: safeStatus(work.status()) };
      }
      if (action === "begin") {
        const goal = requiredString(object, "goal");
        const writePaths = stringArray(object.writePaths, "writePaths");
        const requiredArtifacts = object.requiredArtifacts === undefined ? undefined : stringArray(object.requiredArtifacts, "requiredArtifacts");
        return work.begin({
          goal,
          writePaths,
          ...(requiredArtifacts === undefined ? {} : { requiredArtifacts }),
        });
      }
      if (action === "complete") {
        const summary = object.summary;
        if (summary !== undefined && typeof summary !== "string") throw new ToolArgsError('argument "summary" must be a string when given');
        if (work.placement() !== "in-place") {
          const result = await work.completePlaced(summary === undefined ? {} : { summary });
          return {
            state: result.state,
            resultCommit: result.resultCommit,
            changedFiles: result.changedFiles,
            evidenceRecorded: result.evidenceRecorded,
            nextEvidenceNeeded: result.nextEvidenceNeeded,
            nextActions: ["an operator must review and accept the delivered result"],
          };
        }
        const result = await work.finish(summary === undefined ? {} : { summary });
        return {
          state: result.state,
          changedFiles: result.changedFiles,
          evidenceRecorded: result.evidenceRecorded,
          nextEvidenceNeeded: result.nextEvidenceNeeded,
          verification: result.verification,
          nextActions: ["an operator must review and accept the delivered result"],
        };
      }
      // propose
      const purpose = requiredString(object, "purpose");
      const actionText = requiredString(object, "proposedAction");
      const sources = object.sources === undefined ? [] : stringArray(object.sources, "sources");
      const risk = object.risk === undefined ? "" : requiredString(object, "risk");
      const requiredAuthority = object.requiredAuthority === undefined ? "operator" : requiredString(object, "requiredAuthority");
      const expectedArtifact = object.expectedArtifact === undefined ? "" : requiredString(object, "expectedArtifact");
      const workspace = application.projectWorkspace;
      if (workspace === undefined) {
        throw new ToolArgsError("this deployment composes no project journal, so a follow-up proposal cannot be recorded — the status is unchanged");
      }
      const body = [
        "## Proposed follow-up (non-authoritative)",
        "",
        purpose,
        "",
        "### Proposed action",
        "",
        actionText,
        "",
        `### Sources\n\n${sources.length === 0 ? "- (none stated)" : sources.map((source) => `- ${source}`).join("\n")}`,
        "",
        `### Risk\n\n${risk === "" ? "(none stated)" : risk}`,
        "",
        `### Required authority\n\n${requiredAuthority}`,
        "",
        `### Expected artifact\n\n${expectedArtifact === "" ? "(not stated)" : expectedArtifact}`,
        "",
        PROPOSAL_MARKER,
        JSON.stringify({ schema: "pc1-proposal/v1", purpose, action: actionText, sources, risk, requiredAuthority, expectedArtifact }),
      ].join("\n");
      const entry = await workspace.recordJournalEntry({
        kind: "IDEA",
        title: purpose.length > 120 ? `${purpose.slice(0, 117)}...` : purpose,
        body,
        provenance: sources.length === 0 ? "palimpsest_work propose" : sources.join("; "),
      });
      return {
        status: "PROPOSED",
        nonAuthoritative: true,
        proposalRef: entry.entryId,
        digest: entry.digest,
        note: "recorded in the project journal; it does not revise the plan, accept a source or grant authority",
      };
    },
  });
}
