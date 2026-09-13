/**
 * G10-GC2 campaign-linked Project projection (§§12–§17/§28–§31).
 *
 * A Campaign's knowledge of a Project is a DERIVED projection of canonical
 * history — never a mutable `Set<projectId>`. The projection preserves the
 * COMPLETE `CampaignProjectRef` identity `(projectId, revision, digest)` plus
 * the reason the Campaign knows the Project (admission and/or intervention).
 *
 * Two historical events that name the same `projectId` with DIFFERENT
 * revision/digest are a genuine identity conflict: the projection fails closed
 * (`project_identity_conflict`) rather than silently picking one (§15).
 * Byte-identical references seen through both sources are legitimately
 * deduplicated by complete identity (§16) and keep both provenance sources.
 */

import type { CampaignEvent } from "./store.js";
import type { CampaignProjectRef } from "./intervention.js";
import {
  compareCampaignProjectRefs,
  parseCampaignIntervention,
  parseCampaignProjectRef,
} from "./intervention.js";

export type CampaignProjectLinkSource =
  | { readonly kind: "admission"; readonly admissionKey: string }
  | { readonly kind: "intervention"; readonly interventionId: string };

export interface CampaignLinkedProject {
  readonly project: CampaignProjectRef;
  readonly sources: readonly CampaignProjectLinkSource[];
}

export type CampaignLinkedProjects =
  | { readonly status: "known"; readonly projects: readonly CampaignLinkedProject[] }
  | { readonly status: "project_identity_conflict"; readonly detail: string };

function sourceKey(source: CampaignProjectLinkSource): string {
  return source.kind === "admission" ? `admission:${source.admissionKey}` : `intervention:${source.interventionId}`;
}

function compareSourceKeys(a: CampaignProjectLinkSource, b: CampaignProjectLinkSource): number {
  const left = sourceKey(a);
  const right = sourceKey(b);
  return left < right ? -1 : left > right ? 1 : 0;
}

function refKey(ref: CampaignProjectRef): string {
  return `${ref.projectId}\u0000${ref.revision}\u0000${ref.digest}`;
}

/**
 * Derive the campaign-linked Project projection. Never keys only by
 * `projectId`; a same-id/different-ref collision returns
 * `project_identity_conflict`.
 */
export function projectLinkedProjects(events: readonly CampaignEvent[]): CampaignLinkedProjects {
  const byProjectId = new Map<string, { refs: Map<string, CampaignProjectRef>; sources: Map<string, CampaignProjectLinkSource> }>();

  const add = (project: CampaignProjectRef, source: CampaignProjectLinkSource | null): void => {
    const entry = byProjectId.get(project.projectId) ?? { refs: new Map(), sources: new Map() };
    entry.refs.set(refKey(project), project);
    if (source !== null) entry.sources.set(sourceKey(source), source);
    byProjectId.set(project.projectId, entry);
  };

  for (const event of events) {
    if (event.type === "PROJECT_ADMITTED") {
      const payload = event.payload as { readonly admissionKey?: unknown; readonly project?: unknown };
      add(parseCampaignProjectRef(payload.project, "PROJECT_ADMITTED.project"), {
        kind: "admission",
        admissionKey: typeof payload.admissionKey === "string" ? payload.admissionKey : "",
      });
    } else if (event.type === "INTERVENTION_REGISTERED") {
      const intervention = parseCampaignIntervention((event.payload as { intervention: unknown }).intervention);
      add(intervention.project, { kind: "intervention", interventionId: intervention.interventionId });
    }
  }

  const projects: CampaignLinkedProject[] = [];
  for (const [projectId, entry] of byProjectId) {
    if (entry.refs.size > 1) {
      const rendered = [...entry.refs.values()]
        .sort(compareCampaignProjectRefs)
        .map((ref) => `revision ${ref.revision} digest ${ref.digest}`)
        .join("; ");
      return {
        status: "project_identity_conflict",
        detail: `project "${projectId}" is referenced with conflicting identities: ${rendered}`,
      };
    }
    const project = [...entry.refs.values()][0]!;
    projects.push(
      Object.freeze({
        project,
        sources: Object.freeze([...entry.sources.values()].sort(compareSourceKeys)),
      }),
    );
  }
  projects.sort((a, b) => compareCampaignProjectRefs(a.project, b.project));
  return { status: "known", projects: Object.freeze(projects) };
}

/** The complete references only, in canonical order. */
export function linkedProjectRefs(projection: Extract<CampaignLinkedProjects, { status: "known" }>): readonly CampaignProjectRef[] {
  return Object.freeze(projection.projects.map((entry) => entry.project));
}
