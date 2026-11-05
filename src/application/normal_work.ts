/**
 * SR-1 §29 / ODPE — the NORMAL work actions, in the application layer.
 *
 * The adapter keeps the host-facing tool contract (name, schema, argument gate). The product
 * semantics of the long actions — direct bootstrap, the episode conclusion, exploratory findings
 * and the non-authoritative proposal — live here, so the DSH adapter stays a translation layer and
 * the work surface stays reviewable. Nothing here owns state or bypasses an existing owner: the
 * work surface and the project workspace are the same ones the adapter received.
 */
import type { WorkApplicationSurface } from "./work_contract.js";
import { EPISODE_INTENTS, type EpisodeIntent } from "../project_continuity/index.js";

/** The canonical episode vocabulary, re-exported so the adapter does not reach below the façade. */
export { EPISODE_INTENTS };

/** The adapter's argument gate, passed in so this module throws the host's own error type. */
export interface NormalWorkArgsPort {
  readonly fail: (message: string) => never;
  readonly requiredString: (object: Record<string, unknown>, name: string) => string;
  readonly stringArray: (value: unknown, what: string) => readonly string[];
  /** The adapter's principal-safe status projection. */
  safeStatus(status: unknown, boundary?: unknown): Record<string, unknown>;
}

/** The project-workspace verbs these actions read; structural so no cluster is imported here. */
export interface NormalWorkWorkspacePort {
  concludeEpisode(input: {
    readonly intent: EpisodeIntent;
    readonly statement: string;
    readonly artifacts: readonly string[];
    readonly evidenceRefs: readonly string[];
    readonly waitingOn: string | null;
    readonly nextStep: string | null;
  }): Promise<unknown>;
  journal(): Promise<
    readonly { readonly entry: { readonly entryId: string; readonly body: string; readonly digest: string } }[]
  >;
  recordJournalEntry(input: {
    readonly kind: "REFERENCE_NOTE" | "NEGATIVE_RESULT" | "IDEA";
    readonly title: string;
    readonly body: string;
    readonly provenance: string;
  }): Promise<{ readonly entryId: string; readonly digest: string }>;
}

export interface NormalWorkActionsPort {
  readonly work: WorkApplicationSurface;
  readonly workspace: NormalWorkWorkspacePort | undefined;
  readonly args: NormalWorkArgsPort;
}

const PROPOSAL_MARKER = "<!-- palimpsest-proposal:v1 -->";
const EXPLORATION_MARKER = "<!-- palimpsest-exploration:v1 -->";
export const EXPLORATION_STATUSES = ["OPEN", "CLOSED", "NEGATIVE", "CANDIDATE"] as const;

export function projectTaskInput(raw: unknown, args: NormalWorkArgsPort): Array<Record<string, unknown>> {
  const fail: (message: string) => never = (message) => args.fail(message);
  if (!Array.isArray(raw)) fail("tasks must be an array");
  return raw.map((entry) => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      fail("each task must be an object");
    }
    const task = entry as Record<string, unknown>;
    const taskId = args.requiredString(task, "task_id");
    const objective = args.requiredString(task, "objective");
    return {
      task_id: taskId,
      objective,
      depends_on: task.depends_on === undefined ? [] : [...args.stringArray(task.depends_on, "depends_on")],
      write_paths: task.write_paths === undefined ? [] : [...args.stringArray(task.write_paths, "write_paths")],
      required_artifacts: task.required_artifacts === undefined ? [] : [...args.stringArray(task.required_artifacts, "required_artifacts")],
    };
  });
}

export function makeNormalWorkActions(port: NormalWorkActionsPort): {
  start(object: Record<string, unknown>): Promise<unknown>;
  conclude(object: Record<string, unknown>): Promise<unknown>;
  explore(action: string, object: Record<string, unknown>): Promise<unknown>;
  propose(object: Record<string, unknown>): Promise<unknown>;
  readiness(object: Record<string, unknown>): Promise<unknown>;
  finalize(object: Record<string, unknown>): Promise<unknown>;
} {
  const work = port.work;
  const args = port.args;
  const fail: (message: string) => never = (message) => port.args.fail(message);
  return {
    async start(object) {
        if (work.placement() !== "in-place") {
          return {
            state: "PLACED_WORK",
            detail: "this deployment places work in an isolated world; start a real worker with `palimpsest_work action=delegate` (or use `run` for the mechanical path), then `complete` after the product observes the world",
            nextActions: ["palimpsest_work action=delegate", "palimpsest_work action=workers", "palimpsest_work action=status"],
          };
        }
        const already = work.status() as {
          attempts?: Array<{ attempt_id?: string; state?: string }>;
          tasks?: unknown[];
        };
        const attempts = already.attempts ?? [];
        if (attempts.some((attempt) => attempt.state === "RUNNING")) {
          return { state: "READY", boundary: work.boundary(), status: args.safeStatus(work.status(), work.boundary()) };
        }
        /**
         * R9 live correction: `next` can create an ATTEMPT_CREATED position in one call, and the
         * principal may only call `start` afterwards (the pilot did exactly that). Claim the exact
         * existing attempt first; asking the scheduler again would return null while the position
         * already exists, and a generic `claim` without an id is not a reliable selector.
         */
        const claimable = attempts.find(
          (attempt) =>
            (attempt.state === "CREATED" || attempt.state === "LEASED") && typeof attempt.attempt_id === "string",
        );
        if (claimable !== undefined) {
          await work.control("claim", [claimable.attempt_id]);
          return { state: "READY", boundary: work.boundary(), status: args.safeStatus(work.status(), work.boundary()) };
        }
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
          const goal = object.goal;
          /**
           * Direct bootstrap is only safe for a project with no plan. With an existing plan it
           * would have to guess or rewrite the plan, so the product refuses instead of creating a
           * second, conflicting work shape.
           */
          if (typeof goal === "string" && goal.trim() !== "" && (already.tasks ?? []).length === 0) {
            const writePaths = object.writePaths === undefined ? [] : args.stringArray(object.writePaths, "writePaths");
            const requiredArtifacts =
              object.requiredArtifacts === undefined ? undefined : args.stringArray(object.requiredArtifacts, "requiredArtifacts");
            const begun = await work.begin({
              goal,
              writePaths,
              ...(requiredArtifacts === undefined ? {} : { requiredArtifacts }),
            });
            return {
              ...begun,
              state: "READY",
              bootstrapped: true,
              boundary: work.boundary(),
              status: args.safeStatus(work.status(), work.boundary()),
            };
          }
          return {
            state: "NO_CLAIMABLE_WORK",
            detail:
              "no claimable work position was found. The project already has a plan, so direct bootstrap will not rewrite it; inspect status, then revise the plan or claim a legal position. Do not inspect private implementation details.",
            status: args.safeStatus(work.status(), work.boundary()),
            nextActions: ["palimpsest_work action=status", "palimpsest_work action=plan"],
          };
        }
      return { state: "READY", boundary: work.boundary(), status: args.safeStatus(work.status(), work.boundary()) };
    },
    async conclude(object) {
        const workspace = port.workspace;
        if (workspace === undefined) {
          fail("this deployment composes no project journal, so an episode conclusion cannot be recorded");
        }
        const intent = args.requiredString(object, "intent");
        if (!(EPISODE_INTENTS as readonly string[]).includes(intent)) {
          fail(`argument "intent" must be one of ${EPISODE_INTENTS.join(", ")}`);
        }
        const statement = args.requiredString(object, "statement");
        const artifacts = object.artifacts === undefined ? [] : args.stringArray(object.artifacts, "artifacts");
        const evidenceRefs = object.evidenceRefs === undefined ? [] : args.stringArray(object.evidenceRefs, "evidenceRefs");
        const waitingOn = object.waitingOn === undefined ? null : args.requiredString(object, "waitingOn");
        const nextStep = object.nextStep === undefined ? null : args.requiredString(object, "nextStep");
        return workspace.concludeEpisode({
          intent: intent as EpisodeIntent,
          statement,
          artifacts,
          evidenceRefs,
          waitingOn,
          nextStep,
        });
    },
    async explore(action, object) {
        const workspace = port.workspace;
        if (workspace === undefined) {
          fail("this deployment composes no project journal, so exploration cannot be recorded");
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
        const goal = args.requiredString(object, "goal");
        const finding = object.finding === undefined ? "" : args.requiredString(object, "finding");
        const uncertainty = object.uncertainty === undefined ? "" : args.requiredString(object, "uncertainty");
        const sources = object.sources === undefined ? [] : args.stringArray(object.sources, "sources");
        const artifacts = object.artifacts === undefined ? [] : args.stringArray(object.artifacts, "artifacts");
        const explorationStatus = object.explorationStatus === undefined ? "OPEN" : args.requiredString(object, "explorationStatus");
        if (!(EXPLORATION_STATUSES as readonly string[]).includes(explorationStatus)) {
          fail(`argument "explorationStatus" must be one of ${EXPLORATION_STATUSES.join(", ")}`);
        }
        const relatedTaskId = object.taskId === undefined ? null : args.requiredString(object, "taskId");
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
    },
    async readiness(object) {
      const taskId = object.taskId;
      if (taskId !== undefined && typeof taskId !== "string") fail('argument "taskId" must be a string when given');
      return await work.outcomeReadiness(taskId === undefined ? {} : { taskId });
    },
    async finalize(object) {
      const taskId = args.requiredString(object, "taskId");
      const expectedObservationDigest = args.requiredString(object, "expectedObservationDigest");
      const acknowledgeInputs = object.acknowledgeInputs;
      if (acknowledgeInputs !== undefined && typeof acknowledgeInputs !== "boolean") {
        fail('argument "acknowledgeInputs" must be a boolean when given');
      }
      const summary = object.summary;
      if (summary !== undefined && typeof summary !== "string") fail('argument "summary" must be a string when given');
      return await work.finalizeOutcome({
        taskId,
        expectedObservationDigest,
        ...(acknowledgeInputs === undefined ? {} : { acknowledgeInputs }),
        ...(summary === undefined ? {} : { summary }),
      });
    },
    async propose(object) {
      const purpose = args.requiredString(object, "purpose");
      const actionText = args.requiredString(object, "proposedAction");
      const sources = object.sources === undefined ? [] : args.stringArray(object.sources, "sources");
      const risk = object.risk === undefined ? "" : args.requiredString(object, "risk");
      const requiredAuthority = object.requiredAuthority === undefined ? "operator" : args.requiredString(object, "requiredAuthority");
      const expectedArtifact = object.expectedArtifact === undefined ? "" : args.requiredString(object, "expectedArtifact");
      const actionClasses = ["INVESTIGATE", "CHANGE", "ACCEPT_SOURCE", "REVISE_PLAN", "OTHER"] as const;
      const actionClass = object.actionClass === undefined ? "OTHER" : args.requiredString(object, "actionClass");
      if (!(actionClasses as readonly string[]).includes(actionClass)) {
        fail(`argument "actionClass" must be one of ${actionClasses.join(", ")}`);
      }
      const writePaths = object.writePaths === undefined ? [] : args.stringArray(object.writePaths, "writePaths");
      const tasks = object.tasks === undefined ? undefined : projectTaskInput(object.tasks, args);
      const sourcePath = object.sourcePath === undefined ? undefined : args.requiredString(object, "sourcePath");
      const targetPath = object.targetPath === undefined ? undefined : args.requiredString(object, "targetPath");
      const sourceTaskId = object.taskId === undefined ? undefined : args.requiredString(object, "taskId");
      const sourceObjective = object.objective === undefined ? undefined : args.requiredString(object, "objective");
      if ((sourcePath === undefined) !== (targetPath === undefined)) {
        fail('arguments "sourcePath" and "targetPath" must be supplied together');
      }
      const workspace = port.workspace;
      if (workspace === undefined) {
        fail("this deployment composes no project journal, so a follow-up proposal cannot be recorded — the status is unchanged");
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
  };
}
