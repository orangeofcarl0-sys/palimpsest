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
import { safeStatus, tool, ToolArgsError, requiredString, stringArray } from "./common.js";
import { EPISODE_INTENTS, EXPLORATION_STATUSES, makeNormalWorkActions, projectTaskInput } from "../../application/normal_work.js";

export function defineNormalWorkTool(application: PalimpsestApplicationSurface): DshToolDefinition {
  const work = application.work;
  const args = {
    fail: (message: string): never => {
      throw new ToolArgsError(message);
    },
    requiredString,
    stringArray,
    safeStatus,
  };
  const normal = makeNormalWorkActions({ work, workspace: application.projectWorkspace, args });
  return tool({
    name: "palimpsest_work",
    description:
      "The NORMAL project work path. DIRECT WORK IS A FIRST-CLASS PATH: a formal Task is not required for every edit, and a project may hold a direct Git outcome without inventing Work. If the work was already committed outside a governed attempt, do NOT create a task to reproduce it — record an episode conclusion (`conclude`); a zero-delta attempt cannot be `complete`d, and a redundant formal task is retired by a typed plan revision (`plan` with changeClass/changedIds), not by faking settlement. Use it for ordinary work on this project: read the state (`status`), revise the plan (`plan`), advance what the product can do mechanically (`next`, `run`), start a REAL worker in its own execution world (`delegate`), observe who is actually running (`workers`), request a stop without pretending it happened (`stop`), inspect a delivered result and choose a safe continuation route (`results`, `continue`), take the next claimable work position (`start`), open a new single governed position (`begin`), close it when done (`complete`), record the EPISODE-LEVEL conclusion when the current work episode should stop (`conclude`), save a follow-up proposal without forcing the current plan (`propose`), or record an exploratory finding (`explore` / `explorations`). `delegate` executes an EXISTING canonical task; it does not invent work, and the worker may only report; the product observes the world and settles. `workers` distinguishes canonical attempt state from host-local job observation: a RUNNING attempt with no job in this host is NOT proven alive. `stop` is a REQUEST. `results` reports the packaged continuation assessment for the latest COMPLETED result, including path-level reuse facts (unaffected / conflicted / already-present) that a NEW governed task may use without accepting the old result, and `continue` carries the inspection digest into rematerialization or governed rework; neither accepts or promotes anything. `relay` continues an attempt whose worker is no longer running: `takeover` keeps the SAME attempt and world after an observed worker exit (or your explicit `declareExecutorAbandoned` declaration) and records PRINCIPAL_RECOVERY; `successor` closes an attempt this host cannot prove quiescent, keeps its world, and returns path-level reuse facts so a NEW attempt continues the still-valid work in a new world at the same basis. Every settlement reports the execution window the product OBSERVED (`ORIGINAL_WORKER_OBSERVED` / `SUBSEQUENT_WORKER_OBSERVED` / `PRINCIPAL_RECOVERY` / `MULTI_EXECUTOR` / `UNATTRIBUTED`); your own writing is never reported as worker production, and a principal takeover is not independent verification. `conclude` records YOUR judgement about the episode (DELIVER / WAIT_FOR_OPERATOR / WAIT_FOR_EXTERNAL_EVENT / REPLAN / CONTINUE / CHECKPOINT) and the product checks it against real facts: open tasks, live attempts, pending operator acceptance, blocked effects, artifact existence and artifact Git provenance. A refused conclusion names the contradiction; a recorded one is still NOT acceptance or promotion. Provenance warnings (an artifact untracked or uncommitted) are reported in the result and in the pulse; they do not by themselves refuse DELIVER. `readiness` reports the CURRENT outcome facts from the owners (attempt/world/commit/uncommitted/current inputs/completion) and classifies the next step as CONTINUE_WORK, SEMANTIC_JUDGEMENT or MECHANICAL_FINALIZATION; it is a read, not a permission. When it returns MECHANICAL_FINALIZATION, `finalize` with its `observationDigest` performs the bounded mechanical chain (fresh observation, existing completion evaluation, canonical settlement, existing scheduler progress) and stops before operator acceptance; a stale digest is refused, and a candidate that still needs a semantic judgement is refused rather than settled. After a recorded conclusion with `session.mayEnd=true`, reply to the user and stop calling tools unless something contradicts it. `explore` is the EXPLORATORY path: research, comparison, source inspection and tentative analysis are recorded as findings with sources and uncertainty, and create NO Task, Attempt, Evidence, Promotion or ProjectIR change. Use `plan` only for a governed commitment; independent research should not be represented as several formal Work tasks whose first result blocks the others. It never accepts an attempt id, an exit code, an evidence predicate or an approval. Every status/begin/complete reply carries the ACTUAL execution boundary: in-place edits change the live repository immediately, while worktree edits are an isolated candidate until an authorized Promotion. A proposal is NON-AUTHORITATIVE.",
    mode: "mutating",
    actions: [
      "status",
      "plan",
      "next",
      "run",
      "start",
      "begin",
      "complete",
      "conclude",
      "delegate",
      "workers",
      "stop",
      "results",
      "continue",
      "relay",
      "readiness",
      "finalize",
      "propose",
      "explore",
      "explorations",
    ],
    extraProperties: {
      goal: { type: "string", description: "for start/begin/plan: what the work is, in the user's own words; on start it also lets the product bootstrap a direct position when the plan has no claimable one" },
      writePaths: { type: "array", items: { type: "string" }, description: "for begin/propose: the paths this work or proposed action may change" },
      requiredArtifacts: { type: "array", items: { type: "string" }, description: "for begin: paths the work must leave in place" },
      summary: { type: "string", description: "for complete: what you consider done, in your own words" },
      intent: {
        type: "string",
        enum: [...EPISODE_INTENTS],
        description:
          "for conclude: DELIVER (the goal is handled, including a well-founded negative conclusion), WAIT_FOR_OPERATOR (delivered work needs acceptance), WAIT_FOR_EXTERNAL_EVENT (a measured input or async result is pending), REPLAN (the plan is invalid), CONTINUE (clear work remains), or CHECKPOINT (resources/context are ending; preserve the next step)",
      },
      statement: { type: "string", description: "for conclude: why this is the honest state of the episode, in your own words" },
      waitingOn: { type: "string", description: "for conclude: the external fact, acceptance or event the next episode depends on" },
      nextStep: { type: "string", description: "for conclude: the concrete next action for CONTINUE/REPLAN/CHECKPOINT" },
      evidenceRefs: { type: "array", items: { type: "string" }, description: "for conclude: journal/commit/result refs supporting the judgement; a negative DELIVER must cite a recorded negative finding" },
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
      changeClass: {
        type: "string",
        enum: ["metadata_only", "backward_compatible", "behavior_change", "contract_breaking"],
        description:
          "for plan: the typed invalidation class. Together with changedIds it settles EXACTLY those tasks inside the same revision batch (a structural retirement), so an already-redundant formal task can be retired without pretending its attempt completed. Without it a structural revision requires quiescence",
      },
      changedIds: {
        type: "array",
        items: { type: "string" },
        description:
          "for plan: the logical task ids this revision invalidates or retires. Requires changeClass; only the named tasks stop blocking quiescence, and any other in-flight work still refuses. A task with an observed active worker must be stopped and observed exited first",
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
      taskId: { type: "string", description: "the Work task: for delegate/stop/continue (required there), for results/complete (optional; complete then settles THAT task rather than guessing the single RUNNING attempt), for propose an approved source intake, or for explore an optional related task" },
      route: { type: "string", enum: ["rematerialize", "rework"], description: "for continue: carry a compatible result onto the current world, or reopen the task for governed rework" },
      relayRoute: { type: "string", enum: ["takeover", "successor"], description: "for relay: takeover closes the SAME attempt after an observed worker exit (or an explicit abandonment declaration) and records principal recovery; successor closes an attempt this host cannot prove quiescent and returns the retained world's reuse facts so a NEW attempt continues in a new world" },
      declareExecutorAbandoned: { type: "boolean", description: "for relay route=takeover: your explicit declaration that the previous executor is abandoned when this host observed no confirmed exit. It is recorded as DECLARED, never as observed" },
      acknowledgeInputs: { type: "boolean", description: "for complete/relay: your confirmation that you re-read project inputs that arrived after the attempt's base. The product lists such paths and refuses a principal settlement until you acknowledge them" },
      expectedAssessmentDigest: { type: "string", description: "for continue: the assessment digest returned by `results`; a stale digest is refused rather than applied to a moved world" },
      expectedObservationDigest: { type: "string", description: "for finalize: the observationDigest returned by `readiness`. A moved world, a moved input or a new settlement makes it stale and the finalization is refused" },
      objective: { type: "string", description: "for propose: the Work objective for an approved source intake" },
      finding: { type: "string", description: "for explore: what was observed, with the limits of the observation" },
      uncertainty: { type: "string", description: "for explore: what remains uncertain or unverified" },
      artifacts: { type: "array", items: { type: "string" }, description: "for explore: candidate files this finding refers to (not accepted artifacts); for conclude: delivered artifact paths for DELIVER, each of which the product checks for existence" },
      explorationStatus: { type: "string", enum: [...EXPLORATION_STATUSES], description: "for explore: OPEN (default), CLOSED, NEGATIVE or CANDIDATE; this is exploratory standing, never Work acceptance" },
    },
    run: async (action, object) => {
      if (action === "status") return safeStatus(work.status(), work.boundary());
      if (action === "plan") {
        if (object.tasks === undefined) throw new ToolArgsError("tasks is required for plan");
        const tasks = projectTaskInput(object.tasks, args);
        const reason = requiredString(object, "reason");
        const changeClass = object.changeClass;
        if (
          changeClass !== undefined &&
          !["metadata_only", "backward_compatible", "behavior_change", "contract_breaking"].includes(String(changeClass))
        ) {
          throw new ToolArgsError(
            'argument "changeClass" must be one of metadata_only, backward_compatible, behavior_change, contract_breaking',
          );
        }
        const changedIds = object.changedIds === undefined ? undefined : stringArray(object.changedIds, "changedIds");
        if (changedIds !== undefined && changeClass === undefined) {
          throw new ToolArgsError('argument "changedIds" requires "changeClass"');
        }
        /**
         * PNWF-D: typed invalidation settles exactly the named tasks by staling them in the revision
         * batch. That bypass must not retire a live worker's position: the host's own job observation
         * is checked first, and an active job refuses the revision.
         */
        if (changeClass !== undefined) {
          const affected = new Set(changedIds ?? tasks.map((task) => String(task.task_id)));
          const workers = (await work.workers()) as {
            readonly jobs?: readonly { readonly taskId?: unknown; readonly phase?: unknown }[];
            readonly attempts?: readonly {
              readonly taskId?: unknown;
              readonly state?: unknown;
              readonly worldPath?: unknown;
              readonly hostObserved?: unknown;
            }[];
          };
          const active = (workers.jobs ?? []).find(
            (job) => affected.has(String(job.taskId)) && (job.phase === "RUNNING" || job.phase === "QUEUED"),
          );
          if (active !== undefined) {
            throw new ToolArgsError(
              `cannot retire task ${String(active.taskId)}: this host still observes its worker job ${String(active.phase)}; stop it and wait for the host to observe the exit before a structural revision`,
            );
          }
          const unproven = (workers.attempts ?? []).find(
            (attempt) =>
              affected.has(String(attempt.taskId)) &&
              attempt.state === "RUNNING" &&
              typeof attempt.worldPath === "string" &&
              attempt.worldPath !== "" &&
              attempt.hostObserved !== true,
          );
          if (unproven !== undefined) {
            throw new ToolArgsError(
              `cannot retire task ${String(unproven.taskId)}: a RUNNING attempt has an execution world this host has not observed finish. Relay it as a successor (or wait for the observed exit) before a structural revision; retiring the task would abandon a world that may still have a writer`,
            );
          }
        }
        return work.control("plan", [
          {
            tasks,
            reason,
            ...(changeClass === undefined ? {} : { changeClass }),
            ...(changedIds === undefined ? {} : { changedIds }),
          },
        ]);
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
      if (action === "delegate") {
        const taskId = object.taskId;
        if (taskId !== undefined && typeof taskId !== "string") throw new ToolArgsError('argument "taskId" must be a string when given');
        const started = await work.startWorker(taskId === undefined ? {} : { taskId });
        return { ...started, workers: await work.workers() };
      }
      if (action === "workers") return await work.workers();
      if (action === "stop") {
        const taskId = requiredString(object, "taskId");
        return await work.stopWorker({ taskId });
      }
      if (action === "results") {
        const taskId = object.taskId;
        if (taskId !== undefined && typeof taskId !== "string") throw new ToolArgsError('argument "taskId" must be a string when given');
        return await work.results(taskId === undefined ? {} : { taskId });
      }
      if (action === "continue") {
        const taskId = requiredString(object, "taskId");
        const route = requiredString(object, "route");
        if (route !== "rematerialize" && route !== "rework") {
          throw new ToolArgsError('argument "route" must be "rematerialize" or "rework"');
        }
        const expectedAssessmentDigest = requiredString(object, "expectedAssessmentDigest");
        return await work.continueResult({ taskId, route, expectedAssessmentDigest });
      }
      if (action === "relay") {
        const taskId = requiredString(object, "taskId");
        const relayRoute = requiredString(object, "relayRoute");
        if (relayRoute !== "takeover" && relayRoute !== "successor") {
          throw new ToolArgsError('argument "relayRoute" must be "takeover" or "successor"');
        }
        const declareExecutorAbandoned = object.declareExecutorAbandoned;
        if (declareExecutorAbandoned !== undefined && typeof declareExecutorAbandoned !== "boolean") {
          throw new ToolArgsError('argument "declareExecutorAbandoned" must be a boolean when given');
        }
        const acknowledgeInputs = object.acknowledgeInputs;
        if (acknowledgeInputs !== undefined && typeof acknowledgeInputs !== "boolean") {
          throw new ToolArgsError('argument "acknowledgeInputs" must be a boolean when given');
        }
        const summary = object.summary;
        if (summary !== undefined && typeof summary !== "string") throw new ToolArgsError('argument "summary" must be a string when given');
        return await work.relay({
          taskId,
          route: relayRoute,
          ...(declareExecutorAbandoned === undefined ? {} : { declareExecutorAbandoned }),
          ...(acknowledgeInputs === undefined ? {} : { acknowledgeInputs }),
          ...(summary === undefined ? {} : { summary }),
        });
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
        const acknowledgeInputs = object.acknowledgeInputs;
        if (acknowledgeInputs !== undefined && typeof acknowledgeInputs !== "boolean") {
          throw new ToolArgsError('argument "acknowledgeInputs" must be a boolean when given');
        }
        if (work.placement() !== "in-place") {
          const taskId = object.taskId;
          if (taskId !== undefined && typeof taskId !== "string") throw new ToolArgsError('argument "taskId" must be a string when given');
          if (taskId !== undefined) {
            const result = await work.completeTask({
              taskId,
              ...(summary === undefined ? {} : { summary }),
              ...(acknowledgeInputs === undefined ? {} : { acknowledgeInputs }),
            });
            return {
              ...result,
              boundary: work.boundary(),
              nextActions:
                result.state === "SETTLED"
                  ? ["palimpsest_work action=results", "an operator must review and accept the delivered result"]
                  : result.state === "WORKER_ACTIVE"
                    ? [
                        "palimpsest_work action=workers",
                        "palimpsest_work action=stop (a request; wait for the observed exit)",
                        "session: palimpsest_work action=conclude intent=CHECKPOINT — records the active worker; it does not stop it",
                      ]
                    : result.state === "NO_RUNNING_ATTEMPT"
                      ? [
                          "if the work is already committed at the basis: palimpsest_work action=conclude intent=CHECKPOINT",
                          "if the formal task is redundant: palimpsest_work action=plan changeClass=behavior_change changedIds=[taskId]",
                          "otherwise: palimpsest_work action=delegate to run the existing position",
                          "palimpsest_work action=status",
                        ]
                      : /no observable change|NO_WORK/u.test(result.detail)
                        ? [
                            "do not retry complete: the attempt's world has no delta",
                            "palimpsest_work action=conclude intent=CHECKPOINT",
                            "palimpsest_work action=plan changeClass=behavior_change changedIds=[taskId] (retire a formal task with no independent goal)",
                          ]
                        : ["palimpsest_work action=workers", "palimpsest_work action=status"],
            };
          }
          let result: Awaited<ReturnType<typeof work.completePlaced>>;
          try {
            result = await work.completePlaced({
              ...(summary === undefined ? {} : { summary }),
              ...(acknowledgeInputs === undefined ? {} : { acknowledgeInputs }),
            });
          } catch (error) {
            const detail = error instanceof Error ? error.message : String(error);
            if (!/NOT_READY|no observable change|WORKER_ACTIVE|EXECUTOR_LIVENESS_UNCONFIRMED/iu.test(detail)) throw error;
            return {
              state: "NOT_READY",
              taskId: null,
              detail,
              resultCommit: null,
              changedFiles: [],
              boundary: work.boundary(),
              nextActions: [
                "do not retry complete: the product has not observed a settleable delta",
                "palimpsest_work action=conclude intent=CHECKPOINT",
                "palimpsest_work action=plan changeClass=behavior_change changedIds=[taskId] (retire a formal task with no independent goal)",
                "palimpsest_work action=workers",
              ],
            };
          }
          return {
            state: result.state,
            resultCommit: result.resultCommit,
            changedFiles: result.changedFiles,
            evidenceRecorded: result.evidenceRecorded,
            nextEvidenceNeeded: result.nextEvidenceNeeded,
            attribution: result.attribution,
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
      if (action === "readiness") return await normal.readiness(object);
      if (action === "finalize") return await normal.finalize(object);
      if (action === "start") return await normal.start(object);
      if (action === "conclude") return await normal.conclude(object);
      if (action === "explore" || action === "explorations") return await normal.explore(action, object);
      return await normal.propose(object);
    },
  });
}
