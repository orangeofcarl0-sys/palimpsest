import { canonicalDigest } from "../schema/canonical.js";
import {
  EPISODE_MARKER,
  buildPulseEpisode,
  evaluateEpisodeReadiness,
  type EpisodeReadiness,
  type ProjectSummary,
} from "../project_continuity/index.js";
import type { ProjectJournalViewEntry } from "../project_workspace/index.js";
import {
  CONTRIBUTION_DECISION_MARKER,
  CONTRIBUTION_MARKER,
  DELEGATION_START_MARKER,
  delegationStartEntries,
  type ContributionChainEntry,
  type DelegationPulseEntry,
} from "../project_contribution/index.js";
import { EXECUTION_RELAY_MARKER, executionRelayRecords } from "../work/execution_relay.js";

import type { ProjectPulse, PulseDecisionItem, PulseExecutionView } from "./types.js";

export interface PulseExecutionPort {
  view(): Promise<PulseExecutionView>;
}

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
  /** LHAPE-A/B: canonical attempts and THIS host's jobs. Absent ⇒ execution is UNKNOWN, never "idle". */
  readonly execution?: PulseExecutionPort | undefined;
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
        entry.entry.body.includes("<!-- pc1-consumption:v1 -->") ||
        entry.entry.body.includes(EPISODE_MARKER) ||
        entry.entry.body.includes(EXECUTION_RELAY_MARKER)
      ) {
        structuredJournalIds.add(`journal:${entry.entry.entryId}`);
      }
    }
    /**
     * PWRS-C: only BASIS-BEARING records reopen a conclusion.
     *
     * The product cannot judge whether a plain human/agent note is semantically related to a delivery,
     * so it stays conservative and lets such a note reopen the episode — a measured fact arriving as a
     * note is exactly the ALHS scenario. What it no longer does is let its OWN BOOKKEEPING reopen
     * deliveries: an undecided contribution record is routine accounting, not a new project fact. A
     * contribution DECISION, a new delegation, a settlement record and a new episode conclusion are
     * facts and do reopen.
     */
    const basisRelevant = (entry: { readonly body: string }): boolean =>
      !entry.body.includes(CONTRIBUTION_MARKER) ||
      entry.body.includes(CONTRIBUTION_DECISION_MARKER) ||
      entry.body.includes(DELEGATION_START_MARKER);
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

    const execution: PulseExecutionView =
      deps.execution === undefined
        ? {
            placement: "UNKNOWN",
            attempts: [],
            jobs: [],
            detail:
              "this deployment composes no execution observation, so no statement about a running worker is available",
          }
        : await deps.execution.view();
    const activeJobs = execution.jobs.filter((job) => job.phase === "QUEUED" || job.phase === "RUNNING");

    /**
     * ALHS-A: the episode view is derived here, from the same facts the pulse already projects. The
     * conclusion is a journal record; the readiness check is factual. Neither is an acceptance.
     */
    const readiness: EpisodeReadiness = evaluateEpisodeReadiness({
      tasks: summary.tasks,
      attempts: execution.attempts,
      awaitingOperator: summary.pendingWork.filter((task) => task.state === "VERIFYING").map((task) => `task:${task.taskId}`),
      unresolvedQuestions: openQuestions.map((question) => ({ id: question.id, title: question.title })),
      blockedEffects: summary.blocked.map((item) => ({ id: item.id, detail: item.detail })),
      negativeFindingRefs: summary.negativeFindings.map((finding) => finding.id),
      mechanicalActions: summary.nextActions,
    });
    const episode = buildPulseEpisode({
      entries: entries.map((view) => ({
        entryId: view.entry.entryId,
        kind: view.entry.kind,
        title: view.entry.title,
        body: view.entry.body,
      })),
      readiness,
      basis: summary.basis,
      taskStates: new Map(summary.tasks.map((task) => [task.taskId, task.state])),
      basisRelevant,
    });
    /**
     * PWRS-A: the durable settlement attributions, keyed by task. This is what lets a NEW session see
     * that a result was written by the principal (or is unattributed) instead of reading a COMPLETED
     * attempt as worker production.
     */
    const relayByTask = new Map(executionRelayRecords(entries.map((view) => ({ body: view.entry.body }))).map((record) => [record.taskId, record]));
    const executionWithRelay: PulseExecutionView = Object.freeze({
      ...execution,
      attempts: Object.freeze(
        execution.attempts.map((attempt) =>
          Object.freeze({
            ...attempt,
            relay:
              attempt.taskId === null || !relayByTask.has(attempt.taskId)
                ? null
                : (() => {
                    const record = relayByTask.get(attempt.taskId)!;
                    return {
                      attribution: record.attribution.attribution,
                      executor: record.attribution.executor,
                      settledBy: record.attribution.settledBy,
                      resultCommit: record.resultCommit,
                      independenceEligible: record.attribution.independenceEligible,
                      detail: record.attribution.detail,
                    };
                  })(),
          }),
        ),
      ),
    });

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
    for (const job of execution.jobs) {
      if (job.stopRequested && (job.phase === "QUEUED" || job.phase === "RUNNING")) {
        queue({
          kind: "STOP_REQUESTED",
          ref: `worker:${job.taskId}`,
          detail:
            "a stop was requested for this worker; that is not an observation that it stopped, so wait for the host to report the actual process outcome",
          who: "AGENT",
          advisory: true,
        });
      }
    }
    for (const attempt of execution.attempts) {
      if (attempt.orphaned) {
        queue({
          kind: "ORPHANED_EXECUTION",
          ref: `task:${attempt.taskId ?? "unknown"}`,
          detail:
            "the task was retired while an attempt was still open; the attempt cannot be promoted, but its execution world may hold work worth inspecting or continuing",
          who: "AGENT",
          advisory: true,
        });
      }
      const open = attempt.state === "RUNNING" || attempt.state === "LEASED" || attempt.state === "CREATED";
      if (open && !attempt.hostObserved) {
        queue({
          kind: "EXECUTION_UNOBSERVED",
          ref: `task:${attempt.taskId ?? "unknown"}`,
          detail:
            "the canonical attempt is open, but this host holds no job for it. It is NOT proven to be running: inspect the execution world, then choose an explicit relay route — `takeover` to continue the same attempt after an observed exit or an explicit abandonment declaration, or `successor` to close it and continue in a NEW world with the retained reuse facts. Never re-run the task blindly into the same world",
          who: "AGENT",
          advisory: true,
        });
      }
      if (attempt.state === "COMPLETED" && attempt.taskState === "STALE") {
        queue({
          kind: "STALE_RESULT",
          ref: `task:${attempt.taskId ?? "unknown"}`,
          detail:
            "a COMPLETED result exists for a retired task; it is historical, it holds no promotion authority, and it may still be reusable through the continuation routes",
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
    if (episode.state === "REOPENED") {
      queue({
        kind: "EPISODE_REOPENED",
        ref: episode.conclusion?.conclusionId ?? "episode",
        detail: episode.detail,
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
        "agent: no decision is pending; if the goal has been handled, record an episode conclusion (palimpsest_work action=conclude) instead of continuing optional edits — otherwise take the next bounded step",
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
    for (const job of execution.jobs) sources.add(`worker:${job.taskId}:${job.phase}`);
    if (episode.conclusion !== null) sources.add(`episode:${episode.conclusion.conclusionId}`);

    const unavailable = [...summary.coverage.unavailable];
    if (deps.delegation === undefined) unavailable.push("delegation runtime (not composed)");
    if (deps.execution === undefined) unavailable.push("execution observation (not composed)");
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
      execution: executionWithRelay,
      episode,
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
