import { canonicalDigest } from "../schema/canonical.js";
import type { ProjectSummary } from "../project_continuity/index.js";
import type { ProjectJournalViewEntry } from "../project_workspace/index.js";
import {
  CONTRIBUTION_DECISION_MARKER,
  CONTRIBUTION_MARKER,
  DELEGATION_START_MARKER,
  delegationStartEntries,
  type ContributionChainEntry,
  type DelegationPulseEntry,
} from "../project_contribution/index.js";

import type { ProjectPulse, PulseDecisionItem } from "./types.js";

export interface PulseDelegationPort {
  status(input: { readonly delegationRef: string }): Promise<{
    readonly state: string;
    readonly basisCommit: string | null;
    readonly detail: string;
  }>;
}

export interface ProjectPulseDeps {
  readonly projectId: string;
  readonly continuity: { summary(): Promise<ProjectSummary> };
  readonly contributions: { list(): Promise<readonly ContributionChainEntry[]> };
  readonly workspace: { journal(projectId?: string | undefined): Promise<readonly ProjectJournalViewEntry[]> };
  readonly delegation?: PulseDelegationPort | undefined;
  readonly clock?: (() => string) | undefined;
}

export interface ProjectPulseService {
  pulse(): Promise<ProjectPulse>;
}

function terminal(state: string): boolean {
  return state === "COMPLETED" || state === "FAILED";
}

export function makeProjectPulseService(deps: ProjectPulseDeps): ProjectPulseService {
  async function pulse(): Promise<ProjectPulse> {
    const summary = await deps.continuity.summary();
    const contributions = await deps.contributions.list();
    const entries = await deps.workspace.journal(deps.projectId);
    const starts = delegationStartEntries(entries);

    const contributionBySourceRef = new Map(
      contributions
        .filter((entry) => entry.record.sourceKind === "DELEGATION")
        .map((entry) => [entry.record.sourceRef, entry]),
    );

    /**
     * The contribution/decision/delegation notes are STRUCTURED project records. The continuity
     * summary sees every unresolved REFERENCE_NOTE as an open question; these are not open questions,
     * they are the contribution chain (already projected below). Naming them here keeps one fact out
     * of two buckets without teaching the continuity owner about another module's markers.
     */
    const structuredJournalIds = new Set<string>();
    for (const entry of entries) {
      if (
        entry.entry.body.includes(CONTRIBUTION_MARKER) ||
        entry.entry.body.includes(CONTRIBUTION_DECISION_MARKER) ||
        entry.entry.body.includes(DELEGATION_START_MARKER) ||
        entry.entry.body.includes("<!-- pc1-consumption:v1 -->")
      ) {
        structuredJournalIds.add(`journal:${entry.entry.entryId}`);
      }
    }
    const openQuestions = summary.openQuestions.filter((item) => !structuredJournalIds.has(item.id));

    const delegations: DelegationPulseEntry[] = [];
    for (const start of starts) {
      const ref = start.record.delegationRef;
      let state = "UNKNOWN";
      let basisCommit: string | null = start.record.basisCommit;
      let detail = "this deployment composes no delegation runtime, so the live state cannot be read";
      if (deps.delegation !== undefined) {
        try {
          const status = await deps.delegation.status({ delegationRef: ref });
          state = status.state;
          basisCommit = status.basisCommit ?? start.record.basisCommit;
          detail = status.detail;
        } catch (error) {
          state = "UNKNOWN";
          detail = `the delegation state could not be read: ${error instanceof Error ? error.message : String(error)}`;
        }
      }
      const contribution = contributionBySourceRef.get(ref);
      const basisState: DelegationPulseEntry["basisState"] =
        basisCommit === null
          ? "UNKNOWN"
          : basisCommit === summary.basis.headCommit
            ? "CURRENT"
            : "STALE";
      delegations.push(
        Object.freeze({
          delegationRef: ref,
          task: start.record.task,
          state,
          basisCommit,
          basisState,
          consumed: contribution !== undefined,
          assessed: contribution !== undefined && contribution.decisions.length > 0,
          contributionId: contribution?.record.contributionId ?? null,
          detail,
        }),
      );
    }
    delegations.sort((left, right) => left.delegationRef.localeCompare(right.delegationRef));

    const decisionQueue: PulseDecisionItem[] = [];
    const seen = new Set<string>();
    const queue = (item: PulseDecisionItem): void => {
      const key = `${item.kind}\u0000${item.ref}`;
      if (seen.has(key)) return;
      seen.add(key);
      decisionQueue.push(Object.freeze(item));
    };

    for (const entry of contributions) {
      if (entry.status !== "UNASSESSED") continue;
      queue({
        kind: entry.basisState === "STALE" ? "STALE_CONTRIBUTION" : "CONTRIBUTION_ASSESSMENT",
        ref: entry.record.contributionId,
        detail:
          entry.basisState === "STALE"
            ? `contribution from ${entry.record.sourceKind} was recorded at revision ${String(entry.record.basis.projectRevision)}; the project has moved, so re-read the current basis before relying on it`
            : `contribution from ${entry.record.sourceKind} is recorded and has no principal decision yet`,
        who: "AGENT",
        advisory: true,
      });
    }
    for (const delegation of delegations) {
      if (delegation.state === "INTERRUPTED") {
        queue({
          kind: "INTERRUPTED_DELEGATION",
          ref: delegation.delegationRef,
          detail:
            "the research branch is still open but no worker exists in this process; it is not running. Re-issue the same task on the current basis, or abandon it.",
          who: "AGENT",
          advisory: true,
        });
      } else if (terminal(delegation.state) && !delegation.consumed) {
        queue({
          kind: "TERMINAL_DELEGATION",
          ref: delegation.delegationRef,
          detail: `${delegation.state}: the terminal result is not yet recorded as a contribution`,
          who: "AGENT",
          advisory: true,
        });
      }
    }
    for (const task of summary.pendingWork) {
      if (task.state === "VERIFYING") {
        queue({
          kind: "OPERATOR_ACCEPTANCE",
          ref: `task:${task.taskId}`,
          detail: `delivered work for ${task.taskId} awaits an operator acceptance decision`,
          who: "OPERATOR",
          advisory: true,
        });
      }
    }
    for (const blocked of summary.blocked) {
      queue({
        kind: "BLOCKED_EFFECT",
        ref: blocked.id,
        detail: blocked.detail,
        who: "OPERATOR",
        advisory: true,
      });
    }
    for (const question of openQuestions) {
      queue({
        kind: "OPEN_QUESTION",
        ref: question.id,
        detail: `${question.title}: ${question.detail}`,
        who: "AGENT",
        advisory: true,
      });
    }
    decisionQueue.sort((left, right) => {
      const kind = left.kind.localeCompare(right.kind);
      return kind !== 0 ? kind : left.ref.localeCompare(right.ref);
    });

    const decisionRelevant = decisionQueue.map(
      (item) => `${item.who === "OPERATOR" ? "operator" : "agent"}: ${item.detail}`,
    );
    if (decisionRelevant.length === 0) {
      decisionRelevant.push(
        "agent: no decision is pending; read the recent changes and propose the next bounded step if the goal is not yet met",
      );
    }

    const sources = new Set<string>();
    for (const item of [
      ...summary.requirements,
      ...summary.decisions,
      ...summary.acceptedResults,
      ...summary.candidates,
      ...summary.negativeFindings,
      ...openQuestions,
      ...summary.blocked,
    ]) {
      for (const ref of item.sourceRefs) sources.add(ref);
    }
    for (const entry of contributions) {
      sources.add(`journal:${entry.journalEntryId}`);
      for (const decision of entry.decisions) sources.add(`journal:${decision.journalEntryId}`);
    }
    for (const delegation of delegations) sources.add(`delegation:${delegation.delegationRef}`);

    const unavailable = [...summary.coverage.unavailable];
    if (deps.delegation === undefined) unavailable.push("delegation runtime (not composed)");
    const sourceIndex = [...sources]
      .sort()
      .map((ref) => ({
        ref,
        digest: ref.startsWith("commit:") ? ref.slice("commit:".length) : null,
      }));

    const body = {
      schema: "pc1-project-pulse/v1" as const,
      projectId: summary.projectId,
      goal: summary.goal,
      basis: summary.basis,
      requirements: summary.requirements,
      acceptedAssets: summary.acceptedResults,
      candidates: summary.candidates,
      negativeFindings: summary.negativeFindings,
      openQuestions,
      recentChanges: summary.recentChanges ?? [],
      pendingWork: summary.pendingWork,
      blocked: summary.blocked,
      contributions,
      delegations: Object.freeze(delegations),
      decisionQueue: Object.freeze(decisionQueue),
      nextActions: Object.freeze({
        mechanical: Object.freeze([...summary.nextActions]),
        decisionRelevant: Object.freeze(decisionRelevant),
        distinction:
          "mechanical actions are what the scheduler/product can legally execute next; decisionRelevant items are advisory judgements about what may advance the project, not authority, acceptance or a promise of value",
      }),
      authorityBoundaries: summary.authorizationBoundaries,
      sources: Object.freeze(sourceIndex),
      coverage: Object.freeze({
        complete: unavailable.length === 0,
        unavailable: Object.freeze(unavailable),
        omitted: Object.freeze([]),
      }),
    };
    return Object.freeze({ ...body, digest: canonicalDigest(body) });
  }

  return Object.freeze({ pulse });
}
