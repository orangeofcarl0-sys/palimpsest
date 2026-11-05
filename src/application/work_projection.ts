/**
 * SR-1 §26 / ODPE — the work PROJECTION and control methods.
 *
 * Read-only status, the execution boundary and the existing control surface. This module decides
 * nothing about a task or an attempt; it projects what the owners already hold.
 */
import type { ProjectStandard } from "../domain/standard.js";
import { definePalimpsestControl } from "../tools/control_surface.js";
import type { WorkApplicationSurface, WorkRuntimeDeps } from "./work_contract.js";

export function makeWorkProjectionSurface(
  deps: WorkRuntimeDeps,
): Pick<
  WorkApplicationSurface,
  | "dashboardUrl"
  | "dashboardAuth"
  | "dashboardHandoffFile"
  | "standard"
  | "authorizedCommands"
  | "declaredGateIds"
  | "begin"
  | "completionReadiness"
  | "status"
  | "graph"
  | "preview"
  | "placement"
  | "boundary"
  | "control"
> {
  return {
    dashboardUrl: () => deps.hostFacts?.dashboardUrl() ?? null,
    dashboardAuth: () => deps.hostFacts?.dashboardAuth() ?? null,
    dashboardHandoffFile: () => deps.hostFacts?.dashboardHandoffFile() ?? null,
    standard: () => deps.controller.standard(),
    authorizedCommands: () => deps.controller.authorizedCommands(),
    declaredGateIds: () => deps.controller.declaredGateIds(),
    begin: (input) => deps.controller.begin(input),
    completionReadiness: () => deps.controller.completionReadiness(),
    status: () => deps.controller.status(),
    graph: () => deps.controller.orchestrationGraph(),
    preview: () => deps.controller.preview(),
    placement: () => deps.controller.execution,
    boundary: () =>
      deps.controller.execution === "in-place"
        ? Object.freeze({
            placement: "in-place" as const,
            liveRepositoryMutable: true,
            isolated: false,
            preAcceptance: true,
            detail:
              "DIRECT LOW-RISK EDITING: native file edits and commits change the live repository and its Git HEAD immediately. Work completion observes the changed paths and enforces the declared write scope, but it cannot prevent an earlier edit. The canonical ProjectIR head moves only when an authorized Promotion accepts a result.",
            warning:
              "before your first edit: this is the live project tree, not an isolated candidate. For high-impact governed work, use isolated (worktree) execution so acceptance remains separate.",
          })
        : Object.freeze({
            placement: "worktree" as const,
            liveRepositoryMutable: false,
            isolated: true,
            preAcceptance: true,
            detail:
              "GOVERNED ISOLATED CANDIDATE: work happens in an isolated Git worktree. Edits there do not change the canonical branch or its HEAD; the canonical head moves only when an authorized Promotion accepts the result.",
            warning: null,
          }),
    control: (op, args) => {
      // Reuse the existing Work control surface — Work stays Work-scoped.
      const surface = definePalimpsestControl(deps.controller) as unknown as Record<string, (...a: readonly unknown[]) => unknown>;
      const verb = surface[op];
      if (verb === undefined) throw new Error(`unknown work control verb "${op}"`);
      return verb(...args);
    },
  };
}
