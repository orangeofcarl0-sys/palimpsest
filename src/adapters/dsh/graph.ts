/**
 * SR-1 R3A — the graph tool cluster.
 *
 * palimpsest_graph, kept together because they read the
 * same application face(s). Adapter only: tool metadata, its own argument parsing and a call to
 * the application façade. It reaches no durable store and no semantic service directly (§12).
 */

import type { PalimpsestApplicationSurface } from "../../application/surface.js";
import type { DshToolDefinition } from "../../tools/dsh_types.js";
import { tool, requiredString } from "./common.js";

export function defineGraphTools(application: PalimpsestApplicationSurface): DshToolDefinition[] {
  const tools: DshToolDefinition[] = [];
if (application.projections !== undefined) {
    const projections = application.projections;    tools.push(
      tool({
        name: "palimpsest_graph",
        description: "Read-only MultiGraph projections: typed nodes/edges per species with canonical refs, per-source bases, and an honest known/unknown/error/stale knowledge state (never a canonical graph)",
        mode: "read-only",
        actions: ["work", "organization", "collaboration", "runtime", "reasoning"],
        extraProperties: { organizationDefinitionId: { type: "string" }, cellId: { type: "string" } },
        run: async (action, object) => {
          if (action === "work") return projections.work();
          if (action === "organization") return projections.organization({ organizationDefinitionId: requiredString(object, "organizationDefinitionId") });
          if (action === "collaboration") return projections.collaboration();
          if (action === "runtime") return projections.runtime();
          return projections.reasoning({ cellId: requiredString(object, "cellId") });
        },
      }),
    );
  }
  return tools;
}
