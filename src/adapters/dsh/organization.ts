/**
 * SR-1 R3A — the organization tool cluster.
 *
 * palimpsest_runtime_view, palimpsest_organization_view, palimpsest_campaign_view, palimpsest_dynamics, palimpsest_evolution, kept together because they read the
 * same application face(s). Adapter only: tool metadata, its own argument parsing and a call to
 * the application façade. It reaches no durable store and no semantic service directly (§12).
 */

import type { PalimpsestApplicationSurface } from "../../application/surface.js";
import type { DshToolDefinition } from "../../tools/dsh_types.js";
import { tool, required, requiredString } from "./common.js";

export function defineOrganizationTools(application: PalimpsestApplicationSurface): DshToolDefinition[] {
  const tools: DshToolDefinition[] = [];
if (application.runtime !== undefined) {
    const runtime = application.runtime;
    tools.push(
      tool({
        name: "palimpsest_runtime_view",
        description: "Read-only runtime organization: the RuntimeScope list/state and the derived external Holon view (internal structure vs external surface)",
        mode: "read-only",
        actions: ["scopes", "scope", "holon"],
        extraProperties: { scopeId: { type: "string" } },
        run: async (action, object) => {
          if (action === "scopes") return runtime.list();
          if (action === "scope") return runtime.view(requiredString(object, "scopeId"));
          return runtime.holon(requiredString(object, "scopeId"));
        },
      }),
    );
  }

  if (application.organization !== undefined) {
    const organization = application.organization;
    tools.push(
      tool({
        name: "palimpsest_organization_view",
        description: "Read-only organization/institution: definition head, ACTIVE/RETIRED lifecycle, retirements, and institution current bodies",
        mode: "read-only",
        actions: ["view", "retirements", "institutions", "institution"],
        extraProperties: { organizationDefinitionId: { type: "string" }, institutionId: { type: "string" } },
        run: async (action, object) => {
          if (action === "view") return organization.view(requiredString(object, "organizationDefinitionId"));
          if (action === "retirements") return organization.retirements();
          if (action === "institutions") return organization.institutions();
          return organization.institutionView(requiredString(object, "institutionId"));
        },
      }),
    );
  }

  if (application.campaign !== undefined) {
    const campaign = application.campaign;
    tools.push(
      tool({
        name: "palimpsest_campaign_view",
        description: "Read-only campaign: lifecycle, basis, commitment states, and hypotheses",
        mode: "read-only",
        actions: ["view"],
        extraProperties: { campaignId: { type: "string" } },
        run: async (action, object) => campaign.view(requiredString(object, "campaignId")),
      }),
    );
  }

  if (application.dynamics !== undefined) {
    const dynamics = application.dynamics;
    tools.push(
      tool({
        name: "palimpsest_dynamics",
        description: "Read-only organization dynamics: observe/diagnose a subject, produce a non-canonical proposal, inspect its impact, and check proposal freshness (the pressure vector is never a scalar score)",
        mode: "read-only",
        actions: ["observe", "diagnose", "propose", "impact", "freshness"],
        extraProperties: { subject: { type: "object" }, proposal: { type: "object" }, advisor: { type: "object" } },
        run: async (action, object) => {
          if (action === "observe") return dynamics.observe(required(object, "subject"));
          if (action === "diagnose") return dynamics.diagnose(required(object, "subject"));
          if (action === "propose") return dynamics.propose({ subject: required(object, "subject"), ...(object.advisor === undefined ? {} : { advisor: object.advisor }) });
          if (action === "impact") return dynamics.proposalImpact({ proposal: required(object, "proposal"), subject: required(object, "subject") });
          return dynamics.freshness(required(object, "proposal"));
        },
      }),
    );
  }

  if (application.evolution !== undefined) {
    const evolution = application.evolution;
    tools.push(
      tool({
        name: "palimpsest_evolution",
        description: "Governed structural evolution: inspect a case, and prepare/advance an assessed candidate through the EXISTING authority and governance path (a caller can never self-authorize)",
        mode: "mutating",
        actions: ["inspect", "prepare", "advance", "inspect_runtime", "advance_runtime"],
        extraProperties: { caseRef: { type: "string" }, proposal: { type: "object" } },
        run: async (action, object) => {
          if (action === "inspect") return evolution.inspectOrganization(requiredString(object, "caseRef"));
          if (action === "prepare") return evolution.prepareOrganization(required(object, "proposal") as never);
          if (action === "advance") return evolution.advanceOrganization(required(object, "proposal") as never);
          if (action === "inspect_runtime") return evolution.inspectRuntime(requiredString(object, "caseRef"));
          return evolution.advanceRuntime(required(object, "proposal") as never);
        },
      }),
    );
  }
  return tools;
}
