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
        // PLMP-LEAN-1 §C.14: the RESEARCH delegation face. The same rule a third time — a composed
        // surface this discovery list omits is invisible to a client, so the entry ships WITH the
        // surface. A false here is the truthful "no reasoning store, no repository or no async branch
        // host", never "nothing to research".
        delegation: application.delegation !== undefined,
        // PLMP-LEAN-1 §1/§4: the project's governance, in one place. A client that shows a gate or
        // promotion control reads it from here, so it can offer only commands this deployment
        // authorizes and only gates that exist — instead of asking a person for machine vocabulary.
        governance: {
          standard: application.work.standard() ?? null,
          authorizedCommands: application.work.authorizedCommands(),
          declaredGateIds: application.work.declaredGateIds(),
          // PLMP-LEAN-1 §5 / 2A-Q: readiness in two layers, so a client can name WHAT IS MISSING
          // before the work starts rather than after it dead-ends. The deployment layer is always
          // answerable; the task layer is null until a task exists.
          completionReadiness: application.work.completionReadiness(),
        },
      });
    },
  }),
];
