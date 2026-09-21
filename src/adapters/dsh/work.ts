/**
 * SR-1 R3A — the work tool cluster.
 *
 * palimpsest_surfaces, kept together because they read the
 * same application face(s). Adapter only: tool metadata, its own argument parsing and a call to
 * the application façade. It reaches no durable store and no semantic service directly (§12).
 */

import type { PalimpsestApplicationSurface } from "../../application/surface.js";
import type { DshToolDefinition } from "../../tools/dsh_types.js";
import { tool, ToolArgsError } from "./common.js";

export function defineWorkTools(application: PalimpsestApplicationSurface): DshToolDefinition[] {
  const tools: DshToolDefinition[] = [];
tools.push(
    tool({
      name: "palimpsest_surfaces",
      description: "Report which advanced Palimpsest surfaces are configured for this installation (a missing surface is never an empty known state). The result also tells you how to send a human to the dashboard: `dashboardUrl` is THIS deployment's address (never infer it from source or a default port), and `dashboardAuth` says what opening it requires — \"fence\" means the address alone works from a browser on this machine, so that one sentence is the whole answer; \"token\" means the person needs the handoff link, which is in the file named by `dashboardHandoffFile` (never quote a token into this conversation; the file is the delivery path). Null values mean no dashboard is served.",
      mode: "read-only",
      actions: ["list"],
      run: async () => ({
        work: true,
        // Where a human can watch this project, and what opening it requires. Null when no
        // dashboard is served — reported as null rather than omitted, so "there is none" and
        // "nobody told me" stay distinguishable only by the host, never guessed here.
        dashboardUrl: application.work.dashboardUrl(),
        dashboardAuth: application.work.dashboardAuth(),
        dashboardHandoffFile: application.work.dashboardHandoffFile(),
        federation: application.federation !== undefined,
        boundary: application.boundary !== undefined,
        runtime: application.runtime !== undefined,
        organization: application.organization !== undefined,
        campaign: application.campaign !== undefined,
        dynamics: application.dynamics !== undefined,
        evolution: application.evolution !== undefined,
        reasoning: application.reasoning !== undefined,
        attention: application.attention !== undefined,
        experiments: application.empirical !== undefined,
        recipes: application.recipes !== undefined,
        advisor: application.advisor !== undefined,
        recipeExecution: application.recipeExecution !== undefined,
        collaboration: application.collaboration !== undefined,
        // UX-B §28: the cross-project face (a missing one is never an empty directory).
        crossProject: application.crossProject !== undefined,
        proof: application.proof !== undefined,
        disclosure: application.disclosure !== undefined,
        projectWorkspace: application.projectWorkspace !== undefined,
        projectManagement: application.projectManagement !== undefined,
        // G10-AD §23: the project-head verification face (status/history/request).
        verification: application.verification !== undefined,
        // G10-AE §28: the external asset library bridge (read/prepare face only).
        externalAssets: application.externalAssets !== undefined,
        projections: application.projections !== undefined,
      }),
    }),
  );

  tools.push(
    tool({
      name: "palimpsest_finish",
      description:
        "STATE DONE-NESS ONCE, IN YOUR OWN WORDS (PLMP-LEAN-1 appendix A). Call this when the work of the currently running attempt is finished — you have made the changes and you believe the project's completion standard is met. Say only what you believe: this tool derives everything mechanical from the operator's confirmed completion standard and the attempt's own envelope — which commands to run, what the write scope actually was, whether the declared artifacts exist — and the PRODUCT runs and observes them. Do NOT supply an attempt id, a predicate, a command, an exit code, a gate id or a changed-file list; those are not arguments here and the product never trusts a caller's word for them (mechanical facts are observed, never reported). Every refusal leaves the attempt RUNNING so you can still fix it: a failing command returns the exact failure and remedy, a change outside the envelope's write scope names the offending paths, and an attempt with no observable work is refused (a task that only needed analysis belongs to a reasoning branch, a verification or a cross-project ask, not to a work attempt). On success the attempt is settled COMPLETED and the reply names the evidence recorded and any evidence still needed before promotion. The operator alone accepts or returns the result afterwards — this tool never promotes.",
      mode: "mutating",
      actions: ["run"],
      extraProperties: {
        summary: {
          type: "string",
          description:
            "optional: what you consider done, in your own words (e.g. “去重改成 Set，测试通过”). Omit it and the product states what it observed instead.",
        },
      },
      run: async (_action, object) => {
        const summary = object.summary;
        if (summary !== undefined && (typeof summary !== "string" || summary.length === 0)) {
          throw new ToolArgsError('argument "summary" must be a non-empty string when given');
        }
        const result = await application.work.finish(summary === undefined ? {} : { summary });
        // `INV-4`: the attempt id is orchestration state, and the principal context must not carry it.
        // The application result keeps it — an operator surface may legitimately want it — but this
        // projection is what the MODEL sees, and "which attempt" is never a decision the agent makes.
        return {
          state: result.state,
          changedFiles: result.changedFiles,
          evidenceRecorded: result.evidenceRecorded,
          nextEvidenceNeeded: result.nextEvidenceNeeded,
        };
      },
    }),
  );

  tools.push(
    tool({
      name: "palimpsest_begin",
      description:
        "START MANAGED WORK ON THIS PROJECT, ONCE, IN YOUR OWN WORDS (PLMP-LEAN-1 appendix E). Call this when you are about to change the project and you want the work governed — normally right after reading enough to know what you intend to touch, and BEFORE your first edit. You state only two things: the goal, and the write scope you intend to touch. Palimpsest does the rest mechanically — it creates the project if there is none, registers the single task, advances the scheduler and claims the attempt — so you never touch the scheduler, never claim anything and never see an attempt id. Read-only reconnaissance BEFORE calling this is expected; changing files before calling it is not, because then the product cannot tell which changes belong to this task. It refuses, writing nothing, when: the deployment is not in-place, the write scope is empty, no completion standard has been confirmed, the working tree already holds changes belonging to no attempt, HEAD has moved away from the project's canonical head, the project already has a DIFFERENT plan (a direct bootstrap never silently rewrites an existing plan), or the task would require independent verification this deployment cannot yet perform. On success the reply says what scope you may change and what completion will require; when the work is done, commit it and call palimpsest_finish.",
      mode: "mutating",
      actions: ["run"],
      extraProperties: {
        goal: {
          type: "string",
          description:
            "what the work is, in your own words (e.g. “把 dedupe 改成 Set 实现”). This is your compilation of the user's intent, not a quotation of them.",
        },
        writePaths: {
          type: "array",
          items: { type: "string" },
          description:
            "the paths you intend to change, relative to the project root. This bounds what counts as a legal change for this work; it does not widen policy or filesystem authority. Must be non-empty.",
        },
        requiredArtifacts: {
          type: "array",
          items: { type: "string" },
          description: "optional: paths this work must leave in place (they must already be declared, never inferred from what changed)",
        },
      },
      run: async (_action, object) => {
        const goal = object.goal;
        if (typeof goal !== "string" || goal.length === 0) {
          throw new ToolArgsError('argument "goal" must be a non-empty string');
        }
        const writePaths = object.writePaths;
        if (!Array.isArray(writePaths) || !writePaths.every((entry) => typeof entry === "string" && entry.length > 0)) {
          throw new ToolArgsError('argument "writePaths" must be a non-empty array of non-empty strings');
        }
        const requiredArtifacts = object.requiredArtifacts;
        if (
          requiredArtifacts !== undefined &&
          (!Array.isArray(requiredArtifacts) || !requiredArtifacts.every((entry) => typeof entry === "string" && entry.length > 0))
        ) {
          throw new ToolArgsError('argument "requiredArtifacts" must be an array of non-empty strings when given');
        }
        return application.work.begin({
          goal,
          writePaths: writePaths as string[],
          ...(requiredArtifacts === undefined ? {} : { requiredArtifacts: requiredArtifacts as string[] }),
        });
      },
    }),
  );

  return tools;
}
