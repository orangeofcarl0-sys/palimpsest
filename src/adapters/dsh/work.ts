/**
 * SR-1 R3A — the work tool cluster.
 *
 * palimpsest_surfaces, kept together because they read the
 * same application face(s). Adapter only: tool metadata, its own argument parsing and a call to
 * the application façade. It reaches no durable store and no semantic service directly (§12).
 */

import type { PalimpsestApplicationSurface } from "../../application/surface.js";
import type { DshToolDefinition } from "../../tools/dsh_types.js";
import { tool } from "./common.js";

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
  return tools;
}
