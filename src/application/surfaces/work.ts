/**
 * SR-1D R2 §7/§8/§9 — the work application-surface cluster.
 *
 * Owns BOTH the façade interfaces (WorkApplicationSurface) and the constructor that
 * implements them, from a NARROW input: this module can only see the 1 dependencies it
 * actually reads (controller). Behaviour is unchanged.
 */

import type { ProjectController } from "../../tools/controller.js";
import { definePalimpsestControl } from "../../tools/control_surface.js";

/** Exactly the dependencies this cluster reads — nothing else is visible to it (§9). */
export interface WorkSurfaceDeps {
  readonly controller: ProjectController;
}

export interface WorkApplicationSurface {
  status(): unknown;
  graph(): unknown;
  preview(): unknown;
  /** Work control verbs (pause/resume/next/run/claim/gate/report/plan/promote/holdSet/holdClear). */
  control(op: string, args: readonly unknown[]): unknown;
}

export function makeWorkSurfaces(deps: WorkSurfaceDeps): { readonly work: WorkApplicationSurface } {
    const work: WorkApplicationSurface = {
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
