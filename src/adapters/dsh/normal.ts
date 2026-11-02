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
const EXPLORATION_MARKER = "<!-- palimpsest-exploration:v1 -->";
const EXPLORATION_STATUSES = ["OPEN", "CLOSED", "NEGATIVE", "CANDIDATE"] as const;

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
interface ExecutionBoundary {
  readonly placement: "in-place" | "worktree";
  readonly liveRepositoryMutable: boolean;
  readonly isolated: boolean;
  readonly preAcceptance: boolean;
  readonly detail: string;
  readonly warning: string | null;
}

function safeStatus(status: unknown, boundary?: ExecutionBoundary): Record<string, unknown> {
  const view = status as {
    revision?: unknown;
    headCommit?: unknown;
    schedulerState?: unknown;
    tasks?: Array<{ task_id?: unknown; state?: unknown }>;
    attempts?: Array<{ state?: unknown }>;
    evidence?: Array<{ status?: unknown }>;
    promotions?: Array<{ state?: unknown }>;
    promotionFence?: Array<{ state?: unknown }>;
    holds?: unknown[];
    nextAction?: {
      kind?: unknown;
      executable?: unknown;
      action?: unknown;
      detail?: unknown;
      taskId?: unknown;
    };
  };
  const tasks = (view.tasks ?? []).map((task) => ({ task_id: String(task.task_id), state: String(task.state) }));
  const attemptStates = (view.attempts ?? []).map((attempt) => String(attempt.state));
  const evidence = view.evidence ?? [];
  const nextAction =
    view.nextAction === undefined
      ? undefined
      : {
          kind: String(view.nextAction.kind),
          executable: view.nextAction.executable === true,
          action: typeof view.nextAction.action === "string" ? view.nextAction.action : null,
          detail: String(view.nextAction.detail ?? ""),
          taskId: typeof view.nextAction.taskId === "string" ? view.nextAction.taskId : null,
        };
  const nextActions =
    nextAction === undefined
      ? [
          ...(attemptStates.includes("RUNNING") ? ["palimpsest_work action=complete"] : []),
          ...(tasks.some((task) => task.state === "VERIFYING") ? ["an operator must review and accept the delivered result"] : []),
          ...(tasks.some((task) => task.state === "READY") ? ["palimpsest_work action=next"] : []),
        ]
      : nextAction.executable && nextAction.action !== null
        ? [nextAction.action]
        : [`${nextAction.kind.startsWith("WAIT_OPERATOR") ? "operator" : "agent"}: ${nextAction.detail}`];
  return {
    revision: view.revision,
    headCommit: view.headCommit,
    schedulerState: view.schedulerState,
    ...(boundary === undefined ? {} : { boundary }),
    holds: (view.holds ?? []).map((taskId) => String(taskId)),
    nextAction,
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
    nextActions,
  };
}

export function defineNormalWorkTool(application: PalimpsestApplicationSurface): DshToolDefinition {
  const work = application.work;
  return tool({
    name: "palimpsest_work",
    description:
      "The NORMAL project work path. Use it for ordinary work on this project: read the state (`status`), revise the plan (`plan`), advance what the product can do mechanically (`next`, `run`), take the next claimable work position (`start`), open a new single governed position (`begin`), close it when done (`complete`), save a follow-up proposal without forcing the current plan (`propose`), or record an exploratory finding (`explore` / `explorations`). `explore` is the EXPLORATORY path: research, comparison, source inspection and tentative analysis are recorded as findings with sources and uncertainty, and create NO Task, Attempt, Evidence, Promotion or ProjectIR change. Use `plan` only for a governed commitment; independent research should not be represented as several formal Work tasks whose first result blocks the others. It never accepts an attempt id, an exit code, an evidence predicate or an approval. `start` is the normal way to enter an EXISTING ready task; `begin` is the direct single-task bootstrap. Every status/begin/complete reply carries the ACTUAL execution boundary: in-place edits change the live repository immediately (completion observes scope but does not prevent an earlier edit), while worktree edits are an isolated candidate until an authorized Promotion. `complete` follows the deployment's real placement: in-place work is finished by the product's own observation; a placed attempt is settled through the same settlement owner. A proposal is NON-AUTHORITATIVE: it records what should be considered next; it does not approve, plan or accept anything.",
    mode: "mutating",
    actions: ["status", "plan", "next", "run", "start", "begin", "complete", "propose", "explore", "explorations"],
    extraProperties: {
      goal: { type: "string", description: "for begin/plan: what the work is, in the user's own words" },
      writePaths: { type: "array", items: { type: "string" }, description: "for begin/propose: the paths this work or proposed action may change" },
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
        description: "for plan/propose: the complete task graph revision; on propose it is adopted as a PLAN_REVISION",
      },
      reason: { type: "string", description: "for plan: why this revision is proposed" },
      maxSteps: { type: "number", description: "for run: a bounded number of mechanical steps" },
      purpose: { type: "string", description: "for propose: what this follow-up would achieve" },
      proposedAction: { type: "string", description: "for propose: the concrete action proposed" },
      sources: { type: "array", items: { type: "string" }, description: "for propose: source refs/digests supporting it" },
      risk: { type: "string", description: "for propose: known risk or uncertainty" },
      requiredAuthority: { type: "string", description: "for propose: who must approve it" },
      expectedArtifact: { type: "string", description: "for propose: the expected output" },
      actionClass: { type: "string", enum: ["INVESTIGATE", "CHANGE", "ACCEPT_SOURCE", "REVISE_PLAN", "OTHER"], description: "for propose: the consequence class; CHANGE/ACCEPT_SOURCE/REVISE_PLAN need sources and a write scope" },
      sourcePath: { type: "string", description: "for propose: an optional candidate source file for an exact-digest SOURCE_INTAKE proposal" },
      targetPath: { type: "string", description: "for propose: the project path the source would occupy" },
      taskId: { type: "string", description: "for propose: the Work task id an approved source intake would create; for explore: an optional related task" },
      objective: { type: "string", description: "for propose: the Work objective for an approved source intake" },
      finding: { type: "string", description: "for explore: what was observed, with the limits of the observation" },
      uncertainty: { type: "string", description: "for explore: what remains uncertain or unverified" },
      artifacts: { type: "array", items: { type: "string" }, description: "for explore: candidate files this finding refers to (not accepted artifacts)" },
      explorationStatus: { type: "string", enum: [...EXPLORATION_STATUSES], description: "for explore: OPEN (default), CLOSED, NEGATIVE or CANDIDATE; this is exploratory standing, never Work acceptance" },
    },
    run: async (action, object) => {
      if (action === "status") return safeStatus(work.status(), work.boundary());
      if (action === "plan") {
        if (object.tasks === undefined) throw new ToolArgsError("tasks is required for plan");
        const tasks = projectTaskInput(object.tasks);
        const reason = requiredString(object, "reason");
        return work.control("plan", [{ tasks, reason }]);
      }
      if (action === "next") {
        const event = work.control("next", []) as { event_type?: unknown } | null;
        return { eventType: event?.event_type ?? null, status: safeStatus(work.status(), work.boundary()) };
      }
      if (action === "run") {
        const maxSteps = object.maxSteps;
        if (maxSteps !== undefined && (typeof maxSteps !== "number" || !Number.isSafeInteger(maxSteps) || maxSteps < 1)) {
          throw new ToolArgsError('argument "maxSteps" must be a positive integer');
        }
        const outcome = await work.control("run", maxSteps === undefined ? [] : [maxSteps]);
        return { outcome, status: safeStatus(work.status(), work.boundary()) };
      }
      if (action === "start") {
        if (work.placement() !== "in-place") {
          return {
            state: "PLACED_WORK",
            detail: "this deployment places work in an isolated world; use the host worker or `palimpsest_work action=run`, then `complete`",
            nextActions: ["palimpsest_work action=run", "palimpsest_work action=status"],
          };
        }
        const already = work.status() as { attempts?: Array<{ state?: string }> };
        if (!(already.attempts ?? []).some((attempt) => attempt.state === "RUNNING")) {
          let claimed = false;
          for (let step = 0; step < 4; step += 1) {
            const event = work.control("next", []) as { event_type?: unknown; entity_id?: unknown } | null;
            if (event?.event_type === "ATTEMPT_CREATED" && typeof event.entity_id === "string") {
              await work.control("claim", [event.entity_id]);
              claimed = true;
              break;
            }
            if (event?.event_type === "ATTEMPT_STARTED") {
              claimed = true;
              break;
            }
          }
          if (!claimed) {
            // A claimable attempt may already exist without a scheduler step; try the selection seam.
            try {
              await work.control("claim", []);
              claimed = true;
            } catch {
              claimed = false;
            }
          }
          if (!claimed) {
            return {
              state: "NO_CLAIMABLE_WORK",
              detail: "no claimable work position was found; inspect the task states before writing anything",
              status: safeStatus(work.status(), work.boundary()),
              nextActions: ["palimpsest_work action=status", "palimpsest_work action=plan"],
            };
          }
        }
        return { state: "READY", status: safeStatus(work.status(), work.boundary()) };
      }
      if (action === "begin") {
        const goal = requiredString(object, "goal");
        const writePaths = stringArray(object.writePaths, "writePaths");
        const requiredArtifacts = object.requiredArtifacts === undefined ? undefined : stringArray(object.requiredArtifacts, "requiredArtifacts");
        const begun = await work.begin({
          goal,
          writePaths,
          ...(requiredArtifacts === undefined ? {} : { requiredArtifacts }),
        });
        return { ...begun, boundary: work.boundary() };
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
            boundary: work.boundary(),
            nextActions: ["an operator must review and accept the delivered result"],
          };
        }
        const result = await work.finish(summary === undefined ? {} : { summary });
        // Move the settled attempt into the canonical VERIFYING state so the operator review is the
        // next legal action, rather than leaving the task ACTIVE until an unrelated scheduler tick.
        work.control("next", []);
        return {
          state: result.state,
          changedFiles: result.changedFiles,
          evidenceRecorded: result.evidenceRecorded,
          nextEvidenceNeeded: result.nextEvidenceNeeded,
          verification: result.verification,
          boundary: work.boundary(),
          nextActions: ["an operator must review and accept the delivered result"],
        };
      }
      if (action === "explore" || action === "explorations") {
        const workspace = application.projectWorkspace;
        if (workspace === undefined) {
          throw new ToolArgsError("this deployment composes no project journal, so exploration cannot be recorded");
        }
        if (action === "explorations") {
          const entries = await workspace.journal();
          const explorations: Array<Record<string, unknown>> = [];
          for (const entry of entries) {
            const at = entry.entry.body.indexOf(EXPLORATION_MARKER);
            if (at < 0) continue;
            try {
              const parsed: unknown = JSON.parse(entry.entry.body.slice(at + EXPLORATION_MARKER.length).trim());
              explorations.push({
                explorationRef: entry.entry.entryId,
                digest: entry.entry.digest,
                ...(typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {}),
              });
            } catch {
              explorations.push({ explorationRef: entry.entry.entryId, parseError: true });
            }
          }
          return { explorations, note: "exploratory standing only; none of these is accepted project truth or Work evidence" };
        }
        const goal = requiredString(object, "goal");
        const finding = object.finding === undefined ? "" : requiredString(object, "finding");
        const uncertainty = object.uncertainty === undefined ? "" : requiredString(object, "uncertainty");
        const sources = object.sources === undefined ? [] : stringArray(object.sources, "sources");
        const artifacts = object.artifacts === undefined ? [] : stringArray(object.artifacts, "artifacts");
        const explorationStatus = object.explorationStatus === undefined ? "OPEN" : requiredString(object, "explorationStatus");
        if (!(EXPLORATION_STATUSES as readonly string[]).includes(explorationStatus)) {
          throw new ToolArgsError(`argument "explorationStatus" must be one of ${EXPLORATION_STATUSES.join(", ")}`);
        }
        const relatedTaskId = object.taskId === undefined ? null : requiredString(object, "taskId");
        const content = {
          schema: "pc1-exploration/v1",
          goal,
          finding,
          sources,
          artifacts,
          uncertainty,
          status: explorationStatus,
          taskId: relatedTaskId,
          standing: "EXPLORATORY",
        };
        const body = [
          "## Exploratory finding (non-authoritative)",
          "",
          goal,
          "",
          `### Finding\n\n${finding === "" ? "(none recorded yet)" : finding}`,
          "",
          `### Sources\n\n${sources.length === 0 ? "- (none stated)" : sources.map((source) => `- ${source}`).join("\n")}`,
          "",
          `### Candidate artifacts\n\n${artifacts.length === 0 ? "- (none stated)" : artifacts.map((path) => `- ${path}`).join("\n")}`,
          "",
          `### Uncertainty\n\n${uncertainty === "" ? "(none stated)" : uncertainty}`,
          "",
          `### Standing\n\n${explorationStatus} — exploratory only; this is not Work, Evidence or acceptance.`,
          "",
          EXPLORATION_MARKER,
          JSON.stringify(content),
        ].join("\n");
        const entry = await workspace.recordJournalEntry({
          kind: explorationStatus === "NEGATIVE" ? "NEGATIVE_RESULT" : "REFERENCE_NOTE",
          title: `Exploration: ${goal}`.slice(0, 120),
          body,
          provenance: sources.length === 0 ? "palimpsest_work explore" : sources.join("; "),
        });
        return {
          status: "RECORDED",
          standing: "EXPLORATORY",
          nonAuthoritative: true,
          explorationRef: entry.entryId,
          digest: entry.digest,
          note: "recorded as an exploratory finding; it creates no Task, Attempt, Evidence, Promotion or ProjectIR change and cannot satisfy a Work gate",
        };
      }
      // propose
      const purpose = requiredString(object, "purpose");
      const actionText = requiredString(object, "proposedAction");
      const sources = object.sources === undefined ? [] : stringArray(object.sources, "sources");
      const risk = object.risk === undefined ? "" : requiredString(object, "risk");
      const requiredAuthority = object.requiredAuthority === undefined ? "operator" : requiredString(object, "requiredAuthority");
      const expectedArtifact = object.expectedArtifact === undefined ? "" : requiredString(object, "expectedArtifact");
      const actionClasses = ["INVESTIGATE", "CHANGE", "ACCEPT_SOURCE", "REVISE_PLAN", "OTHER"] as const;
      const actionClass = object.actionClass === undefined ? "OTHER" : requiredString(object, "actionClass");
      if (!(actionClasses as readonly string[]).includes(actionClass)) {
        throw new ToolArgsError(`argument "actionClass" must be one of ${actionClasses.join(", ")}`);
      }
      const writePaths = object.writePaths === undefined ? [] : stringArray(object.writePaths, "writePaths");
      const tasks = object.tasks === undefined ? undefined : projectTaskInput(object.tasks);
      const sourcePath = object.sourcePath === undefined ? undefined : requiredString(object, "sourcePath");
      const targetPath = object.targetPath === undefined ? undefined : requiredString(object, "targetPath");
      const sourceTaskId = object.taskId === undefined ? undefined : requiredString(object, "taskId");
      const sourceObjective = object.objective === undefined ? undefined : requiredString(object, "objective");
      if ((sourcePath === undefined) !== (targetPath === undefined)) {
        throw new ToolArgsError('arguments "sourcePath" and "targetPath" must be supplied together');
      }
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
        `### Consequence class\n\n${actionClass}`,
        "",
        `### Sources\n\n${sources.length === 0 ? "- (none stated)" : sources.map((source) => `- ${source}`).join("\n")}`,
        "",
        `### Write scope\n\n${writePaths.length === 0 ? "- (none stated)" : writePaths.map((path) => `- ${path}`).join("\n")}`,
        "",
        `### Risk\n\n${risk === "" ? "(none stated)" : risk}`,
        "",
        `### Required authority\n\n${requiredAuthority}`,
        "",
        `### Expected artifact\n\n${expectedArtifact === "" ? "(not stated)" : expectedArtifact}`,
        "",
        PROPOSAL_MARKER,
        JSON.stringify({
          schema: "pc1-proposal/v1",
          proposedBy: "agent:palimpsest_work",
          purpose,
          action: actionText,
          actionClass,
          sources,
          writePaths,
          ...(tasks === undefined ? {} : { tasks }),
          ...(sourcePath === undefined
            ? {}
            : {
                sourcePath,
                targetPath,
                ...(sourceTaskId === undefined ? {} : { taskId: sourceTaskId }),
                ...(sourceObjective === undefined ? {} : { objective: sourceObjective }),
              }),
          risk,
          requiredAuthority,
          expectedArtifact,
        }),
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
        note: "recorded in the project journal; an operator can adopt this exact structured proposal through `palimpsest review list`, and it still does not revise the plan, accept a source or grant authority by itself",
      };
    },
  });
}
