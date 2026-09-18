/**
 * SR-1D R2 §7/§8/§9 — the organization application-surface cluster.
 *
 * Owns BOTH the façade interfaces (RuntimeApplicationSurface, OrganizationApplicationSurface, CampaignApplicationSurface, DynamicsApplicationSurface, EvolutionApplicationSurface) and the constructor that
 * implements them, from a NARROW input: this module can only see the 9 dependencies it
 * actually reads (campaign, campaignStore, dynamics, dynamicsPolicy, institution, organizationEvolution, organizations, runtimeEvolution, runtimeScopes). Behaviour is unchanged.
 */

import type { OrganizationDynamicsService, DynamicsPolicy, OrganizationDynamicsProposal } from "../../organization_dynamics/index.js";
import type { OrganizationEvolutionService, EvolutionOutcome } from "../../organization_evolution/index.js";
import type { RuntimeEvolutionService, RuntimeEvolutionOutcome } from "../../runtime_evolution/index.js";
import type { RuntimeScopeService, RuntimeScopeStore, RuntimeScopeState, HolonView } from "../../runtime_scope/index.js";
import type { CampaignService } from "../../campaign/index.js";
import type { CampaignStore } from "../../campaign/store.js";
import type { OrganizationStore } from "../../organization/index.js";
import type { InstitutionService, InstitutionStore } from "../../institution/index.js";

/** Exactly the dependencies this cluster reads — nothing else is visible to it (§9). */
export interface OrganizationSurfaceDeps {
  readonly campaign?: CampaignService | undefined;
  readonly campaignStore?: CampaignStore | undefined;
  readonly dynamics?: OrganizationDynamicsService | undefined;
  readonly dynamicsPolicy?: DynamicsPolicy | undefined;
  readonly institution?: { readonly store: InstitutionStore; readonly service: InstitutionService } | undefined;
  readonly organizationEvolution?: OrganizationEvolutionService | undefined;
  readonly organizations?: OrganizationStore | undefined;
  readonly runtimeEvolution?: RuntimeEvolutionService | undefined;
  readonly runtimeScopes?: { readonly store: RuntimeScopeStore; readonly service: RuntimeScopeService } | undefined;
}

export interface RuntimeApplicationSurface {
  list(): Promise<readonly { readonly scopeId: string }[]>;
  view(scopeId: string): Promise<RuntimeScopeState>;
  holon(scopeId: string): Promise<HolonView>;
}

export interface OrganizationApplicationSurface {
  view(organizationDefinitionId: string): Promise<unknown>;
  retirements(): Promise<unknown>;
  institutions(): Promise<readonly string[]>;
  institutionView(institutionId: string): Promise<unknown>;
}

export interface CampaignApplicationSurface {
  view(campaignId: string): Promise<unknown>;
}

export interface DynamicsApplicationSurface {
  observe(subject: unknown): Promise<unknown>;
  diagnose(subject: unknown): Promise<unknown>;
  propose(input: { readonly subject: unknown; readonly advisor?: unknown }): Promise<unknown>;
  proposalImpact(input: { readonly proposal: unknown; readonly subject: unknown }): Promise<unknown>;
  freshness(proposal: unknown): Promise<unknown>;
  readonly policy: DynamicsPolicy;
}

export interface EvolutionApplicationSurface {
  inspectOrganization(caseRef: string): Promise<unknown>;
  prepareOrganization(proposal: OrganizationDynamicsProposal): Promise<EvolutionOutcome>;
  advanceOrganization(proposal: OrganizationDynamicsProposal): Promise<EvolutionOutcome>;
  inspectRuntime(caseRef: string): Promise<unknown>;
  advanceRuntime(proposal: OrganizationDynamicsProposal): Promise<RuntimeEvolutionOutcome>;
  readonly policy: DynamicsPolicy;
}

export function makeOrganizationSurfaces(deps: OrganizationSurfaceDeps): { readonly runtime: RuntimeApplicationSurface | undefined; readonly organization: OrganizationApplicationSurface | undefined; readonly campaign: CampaignApplicationSurface | undefined; readonly dynamics: DynamicsApplicationSurface | undefined; readonly evolution: EvolutionApplicationSurface | undefined } {
    const runtime: RuntimeApplicationSurface | undefined =
      deps.runtimeScopes === undefined
        ? undefined
        : {
            list: async () => (await deps.runtimeScopes!.service.listScopes()).map((ref) => ({ scopeId: ref.scopeId })),
            view: (scopeId) => deps.runtimeScopes!.service.scopeState(scopeId),
            holon: (scopeId) => deps.runtimeScopes!.service.holonView(scopeId),
          };


    const organization: OrganizationApplicationSurface | undefined =
      deps.organizations === undefined
        ? undefined
        : (() => {
            const store = deps.organizations!;
            return {
              view: async (organizationDefinitionId: string) => {
                const head = await store.head(organizationDefinitionId);
                const lifecycle = await store.lifecycle(organizationDefinitionId);
                if (head === undefined && lifecycle === undefined) {
                  const error = new Error(`organization "${organizationDefinitionId}" does not exist`);
                  (error as { kind?: string }).kind = "unknown_organization";
                  throw error;
                }
                const current = await store.current(organizationDefinitionId);
                return { organizationDefinitionId, head: head ?? null, lifecycle: lifecycle ?? null, current: current ?? null, revisionCount: (await store.lineage(organizationDefinitionId)).length };
              },
              retirements: () => store.retirements(),
              institutions: async () => (deps.institution === undefined ? [] : await deps.institution.store.institutions()),
              institutionView: async (institutionId: string) => {
                if (deps.institution === undefined) return { institutionId, known: false };
                const head = await deps.institution.store.head(institutionId);
                const epoch = await deps.institution.store.currentEpoch(institutionId);
                return { institutionId, known: head !== undefined, head: head ?? null, epoch: epoch ?? null };
              },
            };
          })();


    const campaign: CampaignApplicationSurface | undefined =
      deps.campaign === undefined || deps.campaignStore === undefined
        ? undefined
        : (() => {
            const service = deps.campaign!;
            const store = deps.campaignStore!;
            return {
              view: async (campaignId: string) => {
                const definition = await service.definition(campaignId);
                if (definition === undefined) return { campaignId, known: false };
                const events = await store.replay(campaignId);
                const basis = await service.basis(campaignId);
                const commitments = await service.commitmentStates(campaignId);
                const hypotheses = await service.hypotheses(campaignId);
                let lifecycle = "ACTIVE";
                for (const event of events) {
                  if (event.type === "CAMPAIGN_TERMINATED") lifecycle = "TERMINATED";
                  else if (event.type === "CAMPAIGN_DORMANT") lifecycle = "DORMANT";
                  else if (event.type === "WAKE_STARTED") lifecycle = "WAKING";
                  else if (event.type === "RECONCILIATION_COMMITTED") lifecycle = "RECONCILING";
                  else if (event.type === "WAKE_CYCLE_COMPLETED" || event.type === "WAKE_COMPLETED") lifecycle = "ACTIVE";
                }
                return { campaignId, known: true, definition, lifecycle, basis: basis ?? null, commitments, hypotheses, semanticEventCount: events.length };
              },
            };
          })();


    const dynamics: DynamicsApplicationSurface | undefined =
      deps.dynamics === undefined || deps.dynamicsPolicy === undefined
        ? undefined
        : (() => {
            const service = deps.dynamics!;
            const policy = deps.dynamicsPolicy!;
            return {
              policy,
              observe: (subject) => service.observe(subject as never, policy),
              diagnose: (subject) => service.diagnose(subject as never, policy),
              propose: (input) => service.propose({ subject: input.subject as never, policy, advisor: input.advisor as never }),
              proposalImpact: async (input) => {
                const observed = await service.observe(input.subject as never, policy);
                if (observed.status !== "observed") return observed;
                return service.proposalImpact(input.proposal as never, observed.snapshot);
              },
              freshness: (proposal) => service.evaluateProposal(proposal as never),
            };
          })();


    const evolution: EvolutionApplicationSurface | undefined =
      deps.dynamicsPolicy === undefined ||
      (deps.organizationEvolution === undefined && deps.runtimeEvolution === undefined)
        ? undefined
        : {
            policy: deps.dynamicsPolicy!,
            inspectOrganization: async (caseRef) => {
              if (deps.organizationEvolution === undefined) throw new Error("organization evolution is not configured");
              return deps.organizationEvolution.inspectEvolution(caseRef);
            },
            prepareOrganization: async (proposal) => {
              if (deps.organizationEvolution === undefined) throw new Error("organization evolution is not configured");
              return deps.organizationEvolution.prepareEvolution({ proposal, policy: deps.dynamicsPolicy! });
            },
            advanceOrganization: async (proposal) => {
              if (deps.organizationEvolution === undefined) throw new Error("organization evolution is not configured");
              return deps.organizationEvolution.advanceEvolution({ proposal, policy: deps.dynamicsPolicy! });
            },
            inspectRuntime: async (caseRef) => {
              if (deps.runtimeEvolution === undefined) throw new Error("runtime evolution is not configured");
              return deps.runtimeEvolution.inspectRuntimeEvolution(caseRef);
            },
            advanceRuntime: async (proposal) => {
              if (deps.runtimeEvolution === undefined) throw new Error("runtime evolution is not configured");
              return deps.runtimeEvolution.advanceRuntimeEvolution({ proposal, policy: deps.dynamicsPolicy! });
            },
          };


  return { runtime, organization, campaign, dynamics, evolution };
}
