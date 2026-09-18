/**
 * SR-1D R2 §7/§8/§9 — the work application-surface cluster.
 *
 * Owns BOTH the façade interfaces (WorkApplicationSurface) and the constructor that
 * implements them, from a NARROW input: this module can only see the 1 dependencies it
 * actually reads (controller). Behaviour is unchanged.
 */

import type { ProjectController } from "../../tools/controller.js";
import type { HostDeploymentFactsPort } from "../common.js";
import { definePalimpsestControl } from "../../tools/control_surface.js";

/** Exactly the dependencies this cluster reads — nothing else is visible to it (§9). */
export interface WorkSurfaceDeps {
  readonly controller: ProjectController;
  /** Host facts about the running deployment; absent means no dashboard is known of. */
  readonly hostFacts?: HostDeploymentFactsPort | undefined;
}

export interface WorkApplicationSurface {
  /**
   * Where a human can watch this project, or null when no dashboard is known.
   *
   * The agent is the primary surface, so the person it is talking to needs the way to the dashboard.
   * Only the host can answer this, and only once it has served; the adapter reports null rather than
   * inventing a url.
   */
  dashboardUrl(): string | null;
  /**
   * How the dashboard is guarded, or null when none is served. This is what makes the agent's answer
   * complete: fence ⇒ the address alone opens it; token ⇒ the person needs the handoff link, which
   * is at {@link dashboardHandoffFile} — never in this conversation.
   */
  dashboardAuth(): "fence" | "token" | null;
  /** Token mode only: the file holding the person's handoff link. Null otherwise. */
  dashboardHandoffFile(): string | null;
  status(): unknown;
  graph(): unknown;
  preview(): unknown;
  /** Work control verbs (pause/resume/next/run/claim/gate/report/plan/promote/holdSet/holdClear). */
  control(op: string, args: readonly unknown[]): unknown;
}

export function makeWorkSurfaces(deps: WorkSurfaceDeps): { readonly work: WorkApplicationSurface } {
    const work: WorkApplicationSurface = {
      dashboardUrl: () => deps.hostFacts?.dashboardUrl() ?? null,
      dashboardAuth: () => deps.hostFacts?.dashboardAuth() ?? null,
      dashboardHandoffFile: () => deps.hostFacts?.dashboardHandoffFile() ?? null,
      status: () => deps.controller.status(),
      graph: () => deps.controller.orchestrationGraph(),
      preview: () => deps.controller.preview(),
      control: (op, args) => {
        // Reuse the existing Work control surface — Work stays Work-scoped.
        const surface = definePalimpsestControl(deps.controller) as unknown as Record<string, (...a: readonly unknown[]) => unknown>;
        const verb = surface[op];
        if (verb === undefined) throw new Error(`unknown work control verb "${op}"`);
        return verb(...args);
      },
    };


  return { work };
}
