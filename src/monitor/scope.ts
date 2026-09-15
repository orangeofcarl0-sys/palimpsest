/**
 * G10-AC — Campaign monitor scope.
 *
 * Which Campaigns may ONE installed project's monitor driver evaluate?
 *
 *   MonitorScope ≠ Authority      MonitorScope ≠ Campaign ownership
 *
 * One installed project must NOT silently scan every Campaign in a shared store.
 * This module therefore provides only scopes that are explicitly narrowed:
 *
 *   linkedCampaignMonitorScope     canonical Campaigns linked to this project
 *   allowlistCampaignMonitorScope  an explicit operator Campaign allowlist
 *   composedCampaignMonitorScope   the intersection/union the operator named
 *
 * There is deliberately NO "all campaigns" implementation (see §7 and `AC-N15`):
 * a deployment that wants that must say so by composing an allowlist, which is a
 * product decision rather than a default.
 *
 * Project-id matching here is a DEPLOYMENT/PRODUCT binding only. The exact
 * `CampaignProjectRef` revision/digest remains load-bearing for reconciliation.
 */

import { projectLinkedProjects } from "../campaign/project.js";
import type { CampaignEvent, CampaignStore } from "../campaign/store.js";

export interface CampaignMonitorScopePort {
  /** A stable identifier for the configured scope (diagnostics only). */
  readonly scopeId: string;
  /**
   * The Campaign ids THIS project's monitor may evaluate. Deterministic order.
   * An empty result is a legitimate, honest answer - never widened.
   */
  campaignIdsForProject(projectId: string): Promise<readonly string[]>;
}

/** A scope that monitors nothing. The honest default when none is configured. */
export function emptyCampaignMonitorScope(): CampaignMonitorScopePort {
  return Object.freeze({
    scopeId: "monitor-scope:empty",
    async campaignIdsForProject(): Promise<readonly string[]> {
      return Object.freeze([]);
    },
  });
}

/**
 * The first-party scope: the canonical Campaigns whose own records LINK them to
 * this project. It reads every Campaign definition, but it never RETURNS a
 * Campaign that does not name the project, and a Campaign that links no project
 * is excluded rather than defaulted in.
 */
export function linkedCampaignMonitorScope(input: {
  readonly store: CampaignStore;
  readonly scopeId?: string;
}): CampaignMonitorScopePort {
  return Object.freeze({
    scopeId: input.scopeId ?? "monitor-scope:linked",
    async campaignIdsForProject(projectId: string): Promise<readonly string[]> {
      const linked: string[] = [];
      for (const definition of await input.store.campaigns()) {
        const events: readonly CampaignEvent[] = await input.store.replay(definition.campaignId);
        const projection = projectLinkedProjects(events);
        if (projection.status !== "known") continue;
        if (projection.projects.some((entry) => entry.project.projectId === projectId)) {
          linked.push(definition.campaignId);
        }
      }
      return Object.freeze([...linked].sort());
    },
  });
}

/** An explicit operator allowlist: the operator names the exact Campaigns. */
export function allowlistCampaignMonitorScope(input: {
  readonly campaignIds: readonly string[];
  readonly scopeId?: string;
}): CampaignMonitorScopePort {
  const ids = Object.freeze([...new Set(input.campaignIds)].sort());
  return Object.freeze({
    scopeId: input.scopeId ?? "monitor-scope:allowlist",
    async campaignIdsForProject(): Promise<readonly string[]> {
      return ids;
    },
  });
}

/** Compose scopes: the union of what the named sources return. Deterministic. */
export function composedCampaignMonitorScope(input: {
  readonly scopes: readonly CampaignMonitorScopePort[];
  readonly scopeId?: string;
}): CampaignMonitorScopePort {
  return Object.freeze({
    scopeId: input.scopeId ?? `monitor-scope:composed(${input.scopes.length})`,
    async campaignIdsForProject(projectId: string): Promise<readonly string[]> {
      const ids = new Set<string>();
      for (const scope of input.scopes) {
        for (const id of await scope.campaignIdsForProject(projectId)) ids.add(id);
      }
      return Object.freeze([...ids].sort());
    },
  });
}
