/**
 * SR-1 R3B — the work/installation route cluster.
 *
 * One route: the surface discovery list. It reads no face (it reports which faces exist), so it is
 * the only descriptor whose `face` is null.
 */

import { route, type ApplicationRouteDescriptor } from "./common.js";

export const WORK_ROUTES: readonly ApplicationRouteDescriptor[] = [
  route({
    path: "/api/application/surfaces",
    methods: ["GET"],
    face: null,
    handle: async ({ application, ok, requireGet }) => {
      requireGet();
      return ok({
        work: true,
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
        proof: application.proof !== undefined,
        disclosure: application.disclosure !== undefined,
        projectWorkspace: application.projectWorkspace !== undefined,
        projectManagement: application.projectManagement !== undefined,
        // G10-AC-R §11: the read-only monitor face. It was declared on the surface
        // and wired by the install, but this discovery list omitted it, so a client
        // could not see whether a monitor runtime was observable at all.
        monitor: application.monitor !== undefined,
        // G10-AD §23: the project-head verification face (status/history/run).
        verification: application.verification !== undefined,
        // G10-AE §28: the external asset library bridge face. A false here is the
        // truthful "this deployment has no external library" — never an empty list.
        externalAssets: application.externalAssets !== undefined,
        projections: application.projections !== undefined,
        // UX-A: the one-request collaboration face. Same lesson as the monitor entry
        // above — a composed surface this discovery list omits is invisible to a
        // client, so the entry ships WITH the surface rather than after it.
        collaboration: application.collaboration !== undefined,
        // UX-B §28/§67: the cross-project face. Same rule again — a composed surface
        // this discovery list omits is invisible to a client, so a false here is the
        // truthful "this deployment has no project directory", never an empty list.
        crossProject: application.crossProject !== undefined,
      });
    },
  }),
];
