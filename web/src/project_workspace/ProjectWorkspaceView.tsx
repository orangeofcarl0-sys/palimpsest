/**
 * G10-V Project Workspace — the product-facing project OS vertical.
 *
 *   ProjectWorkspaceView ≠ CanonicalStore     OpenLoop ≠ WorkTask
 *   Association ≠ AssetContent                View ≠ Truth
 *   Recommendation ≠ Mutation                 Request ≠ Change
 *   Mode ≠ Authority                          Work Mode ⊥ Management
 *
 * This surface is presentation-only over the typed HTTP helpers in `../api`.
 * The workspace view is DERIVED server-side from the canonical owner matrix
 * plus the two narrowly-owned append-only histories; the browser reaches no
 * store, no second history, and no authority port. An association is a link to
 * an asset whose canonical owner stays the canonical owner.
 *
 * The management tab shows TWO axes and never collapses them: Work Mode (how
 * work is executed) and Management (how proactively Palimpsest manages). There
 * is no autonomy score, no escalation control, and no mode setter: the only
 * mode-shaped action REQUESTs a change and renders the returned `requested`.
 */

import { useCallback, useEffect, useState } from "react";

import {
  ApiError,
  manageRequestModeChange,
  manageRun,
  manageStatus,
  manageStep,
  projectAssets,
  managementActivity,
  operatingPosture,
  projectHistory,
  projectJournal,
  projectOpenLoops,
  projectWorkspace,
  type ApplicationSurfaceAvailability,
  type ManagementActivityRecord,
  type ManagementAssessment,
  type ManagementBoundedRun,
  type ManagementInvolvement,
  type ManagementStepResult,
  type OpenLoop,
  type ProjectAssetAssociation,
  type ProjectJournalViewEntry,
  type ProjectOperatingPostureView,
  type ProjectWorkspaceView as ProjectWorkspaceReadModel,
  type WorkspaceHistoryEntry,
} from "../api";
import {
  Btn,
  Card,
  COLORS,
  ErrorText,
  Field,
  MANAGEMENT_MODE_NOTES,
  Mono,
  Muted,
  Notice,
  Section,
  SelectInput,
  TWO_AXIS_SENTENCE,
  Tag,
  canonicalOwnerOf,
  shortDigest,
} from "./parts";

export type ProjectSurfaceTarget = "project" | "work" | "multigraph" | "proof";

type Tab = "overview" | "work" | "assets" | "loops" | "history" | "management";

const TABS: readonly { readonly id: Tab; readonly label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "work", label: "Work" },
  { id: "assets", label: "Assets" },
  { id: "loops", label: "Open Loops" },
  { id: "history", label: "History" },
  { id: "management", label: "Management" },
];

const INVOLVEMENTS: readonly ManagementInvolvement[] = ["DIRECT", "ASSIST", "MANAGE", "DELEGATE"];

const ASSET_GROUPS: readonly { readonly kind: string; readonly label: string }[] = [
  { kind: "DECISION", label: "Decisions" },
  { kind: "PRODUCED_ARTIFACT", label: "Produced Artifacts" },
  { kind: "PROOF_CLAIM", label: "Proof / Evidence" },
  { kind: "EXPERIMENT", label: "Experiments" },
  { kind: "JOURNAL_ENTRY", label: "Journal" },
];

function errText(error: unknown): string {
  if (error instanceof ApiError) return `${error.status}: ${error.message}`;
  return error instanceof Error ? error.message : String(error);
}

/* ------------------------------------------------------------------ *
 * Display-only state derivation (no canonical semantics invented)
 * ------------------------------------------------------------------ */

function decisionStateOf(decisionId: string, decisions: readonly { readonly decision_id: string; readonly supersedes: string | null }[]): string {
  const declared = decisions.some((decision) => decision.decision_id === decisionId);
  if (!declared) return "not declared by the current ProjectIR revision";
  const successor = decisions.find((decision) => decision.supersedes === decisionId);
  if (successor !== undefined) return `superseded by ${successor.decision_id}`;
  return "current (no successor recorded)";
}

function associationStateOf(
  association: ProjectAssetAssociation,
  view: ProjectWorkspaceReadModel | null,
  journal: readonly ProjectJournalViewEntry[],
  loops: readonly OpenLoop[],
): string {
  const id = association.canonicalRef.id;
  const warnings = view?.knowledgeWarnings ?? [];
  switch (association.assetKind) {
    case "DECISION":
      return decisionStateOf(id, view?.project.decisions ?? []);
    case "JOURNAL_ENTRY": {
      const entry = journal.find((candidate) => candidate.entry.entryId === id);
      if (entry === undefined) return "not observable in the project journal";
      return entry.resolution === undefined ? "open (no resolution recorded)" : `resolution ${entry.resolution.status}`;
    }
    case "PROOF_CLAIM": {
      if (loops.some((loop) => loop.kind === "STALE_PROOF" && loop.subjectRef?.id === id)) return "stale (STALE_PROOF open loop)";
      if (warnings.some((warning) => warning.includes(`associated proof claim ${id} is not available`))) return "not available on the proof plane";
      return "associated (per-claim standing is not projected into the workspace view)";
    }
    case "REASONING_CELL": {
      if (warnings.some((warning) => warning.includes(`associated reasoning cell ${id} is not available`))) return "not available";
      if (loops.some((loop) => loop.kind === "REASONING_UNRESOLVED" && loop.subjectRef?.id === id)) return "unresolved candidates recorded";
      return "associated (no unresolved candidate observed)";
    }
    case "EXPERIMENT": {
      if (warnings.some((warning) => warning.includes(`associated experiment ${id} has no observable memory`))) return "no observable memory";
      if (warnings.some((warning) => warning.includes(`associated experiment ${id} has no recorded evaluations`))) return "no recorded evaluations";
      return "associated (evaluations observable)";
    }
    default:
      return "associated";
  }
}

function openLoopsOf(view: ProjectWorkspaceReadModel | null, loops: readonly OpenLoop[]): readonly OpenLoop[] {
  return loops.length === 0 ? (view?.openLoops ?? []) : loops;
}

/* ------------------------------------------------------------------ *
 * Overview
 * ------------------------------------------------------------------ */

function OverviewPanel(props: {
  readonly view: ProjectWorkspaceReadModel | null;
  readonly loops: readonly OpenLoop[];
  readonly status: ManagementAssessment | null;
  readonly managementError: string | null;
}): React.ReactElement {
  const { view } = props;
  if (view === null) return <Muted>Loading the derived project workspace view…</Muted>;
  const firstLoop = openLoopsOf(view, props.loops)[0];
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <Section title="Project" testId="overview-project">
        <Field label="goal" testId="overview-goal">
          <b>{view.project.goal}</b>
        </Field>
        <Field label="ProjectIR revision" testId="overview-revision">
          <Mono>{`revision ${view.project.revision}`}</Mono> · digest <Mono>{shortDigest(view.project.digest)}</Mono> · head commit{" "}
          <Mono>{shortDigest(view.project.headCommit)}</Mono>
        </Field>
        <Field label="project id">
          <Mono>{view.projectId}</Mono>
        </Field>
        <Muted>
          This view is derived from the Work ledger (ProjectIR), the controller's scheduling projection, and this layer's two append-only
          histories. It copies no canonical fact.
        </Muted>
      </Section>

      <Section title={`Requirements (${view.project.requirements.length})`} testId="overview-requirements">
        {view.project.requirements.length === 0 ? (
          <Muted>No requirements declared by the ProjectIR.</Muted>
        ) : (
          view.project.requirements.map((requirement) => (
            <Card key={requirement.requirement_id} testId="overview-requirement">
              <div>
                <b>{requirement.statement}</b> <Tag>{requirement.priority}</Tag>
              </div>
              <Muted>
                requirement <Mono>{requirement.requirement_id}</Mono>
                {requirement.acceptance_refs.length === 0 ? null : <> · acceptance {requirement.acceptance_refs.join(", ")}</>}
              </Muted>
            </Card>
          ))
        )}
      </Section>

      <Section title={`Current decisions (${view.project.decisions.length})`} testId="overview-decisions">
        {view.project.decisions.length === 0 ? (
          <Muted>No decisions recorded in the current ProjectIR revision.</Muted>
        ) : (
          view.project.decisions.map((decision) => (
            <Card key={decision.decision_id} testId="overview-decision">
              <div>{decision.statement}</div>
              <Muted>
                <Mono>{decision.decision_id}</Mono> · {decisionStateOf(decision.decision_id, view.project.decisions)}
              </Muted>
            </Card>
          ))
        )}
      </Section>

      <Section title="Scheduler / work state" testId="overview-work-state">
        <Field label="scheduler">
          <Mono>{view.work.schedulerState}</Mono>
        </Field>
        <Field label="tasks">
          <Mono>{String(view.work.tasks.length)}</Mono> declared · <Mono>{String(view.work.attempts.length)}</Mono> attempt(s) ·{" "}
          <Mono>{String(view.work.blockers.length)}</Mono> blocker(s)
        </Field>
        <Field label="resume" testId="overview-resume">
          <Mono>{view.work.resume.action}</Mono> — {view.work.resume.detail}
        </Field>
      </Section>

      <Section title="Management mode" testId="overview-management">
        {props.managementError !== null ? (
          <Notice testId="overview-management-absent">management surface not configured: {props.managementError}</Notice>
        ) : props.status === null ? (
          <Muted>Loading the management assessment…</Muted>
        ) : (
          <Field label="involvement" testId="overview-involvement">
            <b>{props.status.profile.involvement}</b> <Muted>(a project preference, never an authority grant)</Muted>
          </Field>
        )}
      </Section>

      <Section title="Next attention item" testId="overview-next-attention">
        {firstLoop === undefined ? (
          <Muted>No open loop is currently derived.</Muted>
        ) : (
          <Card testId="overview-attention-item">
            <div>
              <Tag tone="warn">{firstLoop.kind}</Tag> {firstLoop.detail}
            </div>
            <Muted>
              open loop <Mono>{firstLoop.id}</Mono> · an open loop is a prompt to look, not a work task
            </Muted>
          </Card>
        )}
      </Section>

      {view.knowledgeWarnings.length === 0 ? null : (
        <Section title="Knowledge warnings (absent planes are reported, never guessed)" testId="overview-warnings">
          {view.knowledgeWarnings.map((warning) => (
            <Notice key={warning}>{warning}</Notice>
          ))}
        </Section>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Work (read-only, derived)
 * ------------------------------------------------------------------ */

function WorkPanel(props: {
  readonly view: ProjectWorkspaceReadModel | null;
  readonly assets: readonly ProjectAssetAssociation[];
}): React.ReactElement {
  const { view } = props;
  if (view === null) return <Muted>Loading the derived work projection…</Muted>;
  const producedArtifacts = props.assets.filter((association) => association.assetKind === "PRODUCED_ARTIFACT");
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <Muted>
        Read-only derivation from the controller's scheduling projection. This surface never claims, gates, promotes, or mutates Work —
        those actions stay in the Work control surface.
      </Muted>

      <Section title="Tasks" testId="work-tasks">
        {view.work.tasks.length === 0 ? (
          <Muted>No tasks declared.</Muted>
        ) : (
          view.work.tasks.map((task) => (
            <div key={task.task_id} data-testid="work-task-row" style={{ fontSize: 12 }}>
              <Mono>{task.task_id}</Mono> · state <b>{task.state}</b>
              {task.role === undefined ? null : <> · role {task.role}</>} · last event {task.last_event_id}
            </div>
          ))
        )}
      </Section>

      <Section title="Attempts" testId="work-attempts">
        {view.work.attempts.length === 0 ? (
          <Muted>No attempt recorded.</Muted>
        ) : (
          view.work.attempts.map((attempt) => (
            <div key={attempt.attempt_id} data-testid="work-attempt-row" style={{ fontSize: 12 }}>
              <Mono>{attempt.attempt_id}</Mono> · task <Mono>{attempt.task_id ?? "none"}</Mono> · state <b>{attempt.state}</b>
              {attempt.attempt_no === null ? null : <> · #{attempt.attempt_no}</>}
            </div>
          ))
        )}
      </Section>

      <Section title="Blockers" testId="work-blockers">
        {view.work.blockers.length === 0 ? (
          <Muted>No blocker is currently derived.</Muted>
        ) : (
          view.work.blockers.map((blocker) => (
            <Notice key={blocker} testId="work-blocker">
              {blocker}
            </Notice>
          ))
        )}
      </Section>

      <Section title="Produced artifacts (associated)" testId="work-artifacts">
        {producedArtifacts.length === 0 ? (
          <Muted>No produced artifact is associated with this project yet.</Muted>
        ) : (
          producedArtifacts.map((association) => (
            <div key={association.associationId} data-testid="work-artifact-row" style={{ fontSize: 12 }}>
              <Mono>{association.canonicalRef.kind}:{association.canonicalRef.id}</Mono> · association {association.associationKind} ·
              provenance {association.provenance}
            </div>
          ))
        )}
      </Section>

      <Section title="Gate evidence" testId="work-evidence">
        {view.work.evidence.length === 0 ? (
          <Muted>No gate evidence recorded.</Muted>
        ) : (
          view.work.evidence.map((entry) => (
            <div key={entry.evidence_id} data-testid="work-evidence-row" style={{ fontSize: 12 }}>
              <Mono>{entry.evidence_id}</Mono> · status <b>{entry.status}</b>
            </div>
          ))
        )}
      </Section>

      <Section title="Resume" testId="work-resume">
        <Field label="action">
          <Mono>{view.work.resume.action}</Mono>
        </Field>
        <div style={{ fontSize: 12 }}>{view.work.resume.detail}</div>
        <Field label="in-flight attempts">
          {view.work.resume.inFlightAttemptIds.length === 0 ? <Muted>none</Muted> : <Mono>{view.work.resume.inFlightAttemptIds.join(", ")}</Mono>}
        </Field>
        <Field label="open tasks">
          {view.work.resume.openTasks.length === 0 ? (
            <Muted>none</Muted>
          ) : (
            <Mono>{view.work.resume.openTasks.map((task) => `${task.task_id}(${task.state})`).join(", ")}</Mono>
          )}
        </Field>
        <Field label="prepared promotions">
          {view.work.resume.preparedPromotions.length === 0 ? <Muted>none</Muted> : <Mono>{view.work.resume.preparedPromotions.join(", ")}</Mono>}
        </Field>
      </Section>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Assets
 * ------------------------------------------------------------------ */

function AssetsPanel(props: {
  readonly assets: readonly ProjectAssetAssociation[];
  readonly view: ProjectWorkspaceReadModel | null;
  readonly journal: readonly ProjectJournalViewEntry[];
  readonly loops: readonly OpenLoop[];
  readonly onNavigate: (target: ProjectSurfaceTarget) => void;
}): React.ReactElement {
  const loops = openLoopsOf(props.view, props.loops);
  const grouped = ASSET_GROUPS.map((group) => ({
    ...group,
    items: props.assets.filter((association) => association.assetKind === group.kind),
  }));
  const other = props.assets.filter((association) => !ASSET_GROUPS.some((group) => group.kind === association.assetKind));

  const renderAssociation = (association: ProjectAssetAssociation): React.ReactElement => (
    <Card key={association.associationId} testId="asset-card">
      <Field label="canonical owner" testId="asset-owner">
        {canonicalOwnerOf(association.assetKind)}
      </Field>
      <Field label="canonical ref" testId="asset-ref">
        <Mono>
          {association.assetKind} → {association.canonicalRef.kind}:{association.canonicalRef.id}
          {association.canonicalRef.digest === undefined ? "" : ` @ ${shortDigest(association.canonicalRef.digest)}`}
        </Mono>
      </Field>
      <Field label="association provenance" testId="asset-provenance">
        {association.associationKind} · {association.provenance} · recorded {association.recordedAt}
      </Field>
      <Field label="current state" testId="asset-state">
        {associationStateOf(association, props.view, props.journal, loops)}
      </Field>
    </Card>
  );

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <Muted>
        An association records only that this project is LINKED to an existing canonical asset. It stores no asset content, moves no
        ownership, and grants no authority: the canonical owner stays the canonical owner.
      </Muted>

      {grouped.map((group) => (
        <Section key={group.kind} title={`${group.label} (${group.items.length})`} testId={`assets-group-${group.kind.toLowerCase()}`}>
          {group.items.length === 0 ? (
            <Muted>No {group.label.toLowerCase()} associated with this project.</Muted>
          ) : (
            group.items.map(renderAssociation)
          )}
          {group.kind === "PROOF_CLAIM" ? (
            <div>
              <Btn onClick={() => props.onNavigate("proof")} testId="assets-open-proof-vault">
                Open the Proof Vault
              </Btn>
              <Muted>
                {" "}
                — the proof plane is the canonical owner of these assets; the workspace only links to it.
              </Muted>
            </div>
          ) : null}
          {group.kind === "JOURNAL_ENTRY" ? (
            <div style={{ display: "grid", gap: 4, marginTop: 4 }}>
              <Muted>Journal entries recorded by this layer:</Muted>
              {props.journal.length === 0 ? (
                <Muted>none recorded.</Muted>
              ) : (
                props.journal.map((entry) => (
                  <div key={entry.entry.entryId} data-testid="journal-entry-row" style={{ fontSize: 12 }}>
                    <Tag>{entry.entry.kind}</Tag> <b>{entry.entry.title}</b> · <Mono>{entry.entry.entryId}</Mono> ·{" "}
                    {entry.resolution === undefined ? "open" : `resolution ${entry.resolution.status}`}
                  </div>
                ))
              )}
            </div>
          ) : null}
        </Section>
      ))}

      {other.length === 0 ? null : (
        <Section title={`Other associations (${other.length})`} testId="assets-group-other">
          {other.map(renderAssociation)}
        </Section>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Open Loops
 * ------------------------------------------------------------------ */

function OpenLoopsPanel(props: {
  readonly loops: readonly OpenLoop[];
  readonly view: ProjectWorkspaceReadModel | null;
}): React.ReactElement {
  const loops = openLoopsOf(props.view, props.loops);
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <Notice testId="loops-not-tasks">
        Open loops are derived prompts to look, reason, or decide. They are explicitly NOT work tasks: they are never claimed, scheduled, or
        executed, and no task is created from one without an explicit promotion.
      </Notice>
      <Section title={`Derived open loops (${loops.length})`} testId="loops-list">
        {loops.length === 0 ? (
          <Muted>No open loop is currently derived.</Muted>
        ) : (
          loops.map((loop) => (
            <Card key={loop.id} testId="loop-row">
              <div>
                <Tag tone="warn">{loop.kind}</Tag> {loop.detail}
              </div>
              <Field label="subject" testId="loop-subject">
                {loop.subjectRef === undefined ? <Muted>none</Muted> : <Mono>{loop.subjectRef.kind}:{loop.subjectRef.id}</Mono>}
              </Field>
              <Muted>
                loop id <Mono>{loop.id}</Mono>
              </Muted>
            </Card>
          ))
        )}
      </Section>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * History
 * ------------------------------------------------------------------ */

function HistoryPanel(props: {
  readonly view: ProjectWorkspaceReadModel | null;
  readonly history: readonly WorkspaceHistoryEntry[];
  readonly status: ManagementAssessment | null;
}): React.ReactElement {
  const { view } = props;
  if (view === null) return <Muted>Loading the derived history…</Muted>;
  const associated = props.history.filter((entry) => entry.kind.startsWith("ASSET_"));
  const journalEntries = props.history.filter((entry) => entry.kind.startsWith("JOURNAL_"));
  const proofHistory = associated.filter((entry) => entry.detail.startsWith("PROOF_CLAIM"));
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <Muted>
        History is a read-only re-arrangement: the append-only association and journal histories plus the ProjectIR revision lineage. No
        entry here is edited or deleted in place.
      </Muted>

      <Section title="ProjectIR revisions" testId="history-revisions">
        <Field label="current revision" testId="history-revision">
          <Mono>{`revision ${view.project.revision}`}</Mono> · digest {shortDigest(view.project.digest)} · head commit{" "}
          {shortDigest(view.project.headCommit)}
        </Field>
        <Muted>
          The exposed routes derive the CURRENT revision; the full ProjectIR revision lineage is not projected into the workspace history.
        </Muted>
      </Section>

      <Section title="Decision supersession" testId="history-decisions">
        {view.project.decisions.length === 0 ? (
          <Muted>No decision recorded.</Muted>
        ) : (
          view.project.decisions.map((decision) => (
            <div key={decision.decision_id} data-testid="history-decision-row" style={{ fontSize: 12 }}>
              <Mono>{decision.decision_id}</Mono> · {decision.statement} ·{" "}
              {decision.supersedes === null ? "supersedes nothing" : `supersedes ${decision.supersedes}`} ·{" "}
              {decisionStateOf(decision.decision_id, view.project.decisions)}
            </div>
          ))
        )}
      </Section>

      <Section title="Attempt outcomes" testId="history-attempts">
        {view.work.attempts.length === 0 ? (
          <Muted>No attempt recorded.</Muted>
        ) : (
          view.work.attempts.map((attempt) => (
            <div key={attempt.attempt_id} data-testid="history-attempt-row" style={{ fontSize: 12 }}>
              <Mono>{attempt.attempt_id}</Mono> · task <Mono>{attempt.task_id ?? "none"}</Mono> · outcome <b>{attempt.state}</b>
            </div>
          ))
        )}
      </Section>

      <Section title="Artifacts and associations" testId="history-associations">
        {associated.length === 0 ? (
          <Muted>No association recorded.</Muted>
        ) : (
          associated.map((entry) => (
            <div key={`${entry.at}:${entry.kind}:${entry.detail}`} data-testid="history-association-row" style={{ fontSize: 12 }}>
              <Mono>{entry.at}</Mono> · {entry.kind} · {entry.detail}
            </div>
          ))
        )}
      </Section>

      <Section title="Proof standing changes" testId="history-proof">
        {proofHistory.length === 0 ? (
          <Muted>No proof asset is associated with this project.</Muted>
        ) : (
          proofHistory.map((entry) => (
            <div key={`${entry.at}:${entry.detail}`} data-testid="history-proof-row" style={{ fontSize: 12 }}>
              <Mono>{entry.at}</Mono> · {entry.detail}
            </div>
          ))
        )}
        <Muted>
          Only association events are projected here. A per-claim standing change is observable through the Proof Vault and through a
          STALE_PROOF open loop, not as a workspace history entry.
        </Muted>
      </Section>

      <Section title="Journal knowledge" testId="history-journal">
        {journalEntries.length === 0 ? (
          <Muted>No journal entry recorded.</Muted>
        ) : (
          journalEntries.map((entry) => (
            <div key={`${entry.at}:${entry.kind}:${entry.detail}`} data-testid="history-journal-row" style={{ fontSize: 12 }}>
              <Mono>{entry.at}</Mono> · {entry.kind} · {entry.detail}
            </div>
          ))
        )}
      </Section>

      <Section title="Management mode" testId="history-management">
        {props.status === null ? (
          <Muted>Management surface not configured for this installation.</Muted>
        ) : (
          <div style={{ fontSize: 12 }}>
            current involvement <b>{props.status.profile.involvement}</b> · set by <Mono>{props.status.profile.updatedBy}</Mono> at{" "}
            <Mono>{props.status.profile.updatedAt}</Mono>
          </div>
        )}
        <Muted>
          The deployment-local management mode history is not exposed over the typed routes; only the current preference is observable here.
        </Muted>
      </Section>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Management (two axes)
 * ------------------------------------------------------------------ */

function ManagementPanel(props: {
  readonly status: ManagementAssessment | null;
  readonly statusError: string | null;
  readonly posture: ProjectOperatingPostureView | null;
  readonly postureError: string | null;
  readonly activity: readonly ManagementActivityRecord[];
  readonly surfaces: ApplicationSurfaceAvailability | null;
  readonly refreshStatus: () => Promise<void>;
  readonly onMessage: (text: string) => void;
}): React.ReactElement {
  const [target, setTarget] = useState<ManagementInvolvement>("MANAGE");
  const [request, setRequest] = useState<{ readonly status: string; readonly detail: string } | null>(null);
  const [stepResult, setStepResult] = useState<ManagementStepResult | null>(null);
  const [runResult, setRunResult] = useState<ManagementBoundedRun | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [actions, setActions] = useState<readonly string[]>([]);
  const [busy, setBusy] = useState(false);

  const note = (text: string): void => {
    setActions((current) => [text, ...current].slice(0, 8));
  };

  if (props.statusError !== null) {
    return (
      <Notice testId="management-absent">
        The management surface is not configured for this installation ({props.statusError}). No management state is fabricated.
      </Notice>
    );
  }
  if (props.status === null) return <Muted>Loading the management assessment…</Muted>;

  const profile = props.status.profile;
  // G10-AB §43: the Work Mode is a REAL persisted preference now. The preferred
  // value and its EFFECTIVE availability are shown separately, and a safe default
  // is labelled as a default rather than presented as a user choice.
  const preferred = props.posture?.workMode.preferred ?? null;
  const effective = props.posture?.workMode.effectiveStatus ?? [];
  const modifierLabel = (modifiers: readonly string[]): string =>
    modifiers.length === 0 ? "" : ` + ${modifiers.join(" + ")}`;
  const workMode = preferred === null
    ? props.postureError === null
      ? "loading the persisted Work Mode preference…"
      : `Work Mode is not readable for this installation (${props.postureError}); the safe default is FOCUS and no preference is fabricated`
    : preferred.source === "safe_default"
      ? `${preferred.baseMode}${modifierLabel(preferred.modifiers)} (safe default — no stored preference is in effect${
          preferred.degradedReason === undefined ? "" : `: ${preferred.degradedReason}`
        })`
      : `${preferred.baseMode}${modifierLabel(preferred.modifiers)} (persisted preference)`;
  const lastModeChange = props.posture?.workMode.historySummary.lastChange ?? null;
  const confirmationCandidates = props.status.candidates.filter((candidate) => candidate.requiredConfirmation);

  const doRecommend = (): void => {
    void (async () => {
      setBusy(true);
      try {
        await props.refreshStatus();
        note("Recommend: re-derived the candidate set from the current workspace view (nothing was executed)");
      } finally {
        setBusy(false);
      }
    })();
  };

  const doStep = (confirmed: boolean): void => {
    void (async () => {
      setBusy(true);
      setStepResult(null);
      setPending(null);
      try {
        const result = await manageStep({ confirmed });
        setStepResult(result);
        if (result.status === "needs_confirmation") setPending(result.detail);
        note(`${confirmed ? "Step (confirm)" : "Preview step"}: status ${result.status}${result.action === undefined ? "" : ` · ${result.action}`}`);
        await props.refreshStatus();
      } catch (error) {
        props.onMessage(`management step failed: ${errText(error)}`);
      } finally {
        setBusy(false);
      }
    })();
  };

  const doRun = (): void => {
    void (async () => {
      setBusy(true);
      setRunResult(null);
      try {
        const result = await manageRun({ maxSteps: 3 });
        setRunResult(result);
        note(`Run bounded: ${result.steps.length} step(s) · stopped=${result.stoppedReason}`);
        await props.refreshStatus();
      } catch (error) {
        props.onMessage(`management run failed: ${errText(error)}`);
      } finally {
        setBusy(false);
      }
    })();
  };

  const doRequest = (): void => {
    void (async () => {
      setBusy(true);
      setRequest(null);
      try {
        const result = await manageRequestModeChange({ to: target });
        setRequest(result);
        note(`Request mode change → ${target}: ${result.status} (never an applied change)`);
      } catch (error) {
        props.onMessage(`mode request failed: ${errText(error)}`);
      } finally {
        setBusy(false);
      }
    })();
  };

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <Notice testId="management-two-axis">{TWO_AXIS_SENTENCE}</Notice>

      <Section title="Work Mode (how work is executed)" testId="management-work-mode-section">
        <Field label="Work Mode" testId="management-work-mode">
          {workMode}
        </Field>
        {lastModeChange === null ? null : (
          <Field label="last changed" testId="management-work-mode-changed">
            <Mono>{lastModeChange.from}</Mono> → <Mono>{lastModeChange.to}</Mono> by{" "}
            <Mono>{lastModeChange.updatedBy}</Mono> at <Mono>{lastModeChange.at}</Mono>
          </Field>
        )}
        <Field label="effective availability" testId="management-work-mode-effective">
          {effective.length === 0 ? (
            <Muted>no capability status is available for this installation</Muted>
          ) : (
            effective.map((entry) => (
              <div key={`${entry.role}:${entry.capability}`} data-testid="management-mode-status">
                <Mono>{entry.capability}</Mono>
                {entry.preferred ? " (preferred)" : ""} · {entry.availability} ·{" "}
                <Muted>{entry.reason}</Muted>
              </div>
            ))
          )}
        </Field>
        {props.posture !== null && props.posture.workMode.capabilityWarnings.length > 0 ? (
          <Notice testId="management-work-mode-warnings">
            {props.posture.workMode.capabilityWarnings.join(" · ")}
            <br />
            The preference is retained: an unavailable capability is never reported as active, and no peer,
            verifier or scheduler is invented to satisfy it.
          </Notice>
        ) : null}
        <Muted>
          Work Mode is orthogonal to management involvement: they are two axes, and neither one determines the other.
          A preference changes how eligible work is organised; it grants no authority and overrides no eligibility.
        </Muted>
      </Section>

      <Section title="Management (how proactively Palimpsest manages)" testId="management-axis-section">
        <Field label="involvement" testId="management-involvement">
          <b>{profile.involvement}</b>
        </Field>
        <Field label="budgets" testId="management-budgets">
          max {profile.budgets.maxStepsPerRun} step(s) per run
          {profile.budgets.maxWallClockMs === undefined ? "" : ` · wall clock ${profile.budgets.maxWallClockMs} ms`}
        </Field>
        <Field label="set by">
          <Mono>{profile.updatedBy}</Mono> at <Mono>{profile.updatedAt}</Mono>
        </Field>
        <Muted>{MANAGEMENT_MODE_NOTES.join(" · ")}</Muted>
      </Section>

      <Section title="What Palimpsest may do automatically" testId="management-allowed-section">
        <div data-testid="management-allowed">
          {profile.allowedActionClasses.length === 0 ? <Muted>none at this involvement</Muted> : profile.allowedActionClasses.join(", ")}
        </div>
        <Muted>
          Every class still intersects with existing semantic authority and capability availability; the authority-shaped classes are never
          permitted by a mode.
        </Muted>
      </Section>

      <Section title="What always requires confirmation" testId="management-confirmation-section">
        <div data-testid="management-confirmation">
          {profile.confirmationBoundaries.length === 0 ? <Muted>none at this involvement</Muted> : profile.confirmationBoundaries.join(", ")}
        </div>
        <Muted>Confirmation is a boundary, not an authority: confirming never substitutes for semantic authority.</Muted>
      </Section>

      <Section title="Derived management actions" testId="management-candidates-section">
        {props.status.candidates.length === 0 ? (
          <Muted>No management action candidate is derivable from the current workspace view.</Muted>
        ) : (
          props.status.candidates.map((candidate) => (
            <Card key={candidate.actionId} testId="management-candidate">
              <div>
                <Tag tone={candidate.requiredConfirmation ? "warn" : "muted"}>{candidate.kind}</Tag> risk {candidate.riskClass}
                {candidate.requiredConfirmation ? " · confirmation boundary" : " · no confirmation boundary"}
              </div>
              <Muted>{candidate.reason}</Muted>
              <Muted>
                capability <Mono>{candidate.capability}</Mono> · {candidate.executable ? "executable binding present" : "no execution binding"}
              </Muted>
            </Card>
          ))
        )}
      </Section>

      <Section title="Pending confirmations" testId="management-pending-section">
        {pending !== null ? (
          <Notice testId="management-pending">{pending}</Notice>
        ) : confirmationCandidates.length === 0 ? (
          <Muted>No candidate currently crosses a confirmation boundary.</Muted>
        ) : (
          confirmationCandidates.map((candidate) => (
            <div key={candidate.actionId} data-testid="management-pending-candidate" style={{ fontSize: 12 }}>
              {candidate.kind} would need an explicit confirmation before it may run
            </div>
          ))
        )}
      </Section>

      <Section title="Actions" testId="management-actions-section">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <Btn onClick={doRecommend} disabled={busy} testId="management-recommend">
            Recommend
          </Btn>
          <Btn onClick={() => doStep(false)} disabled={busy} testId="management-preview">
            Preview step
          </Btn>
          <Btn primary onClick={() => doStep(true)} disabled={busy} testId="management-step">
            Step (confirm)
          </Btn>
          <Btn onClick={doRun} disabled={busy} testId="management-run">
            Run bounded (≤3)
          </Btn>
        </div>
        <Muted>
          This installation exposes ONE step route: an unconfirmed step evaluates the same deterministic policy a confirmed step would and
          acts only where no confirmation boundary applies. Observation-only steps (OBSERVE / RECOMMEND / PREPARE) mutate nothing.
        </Muted>
        {stepResult === null ? null : (
          <div data-testid="management-step-result" style={{ fontSize: 12 }}>
            status <Mono>{stepResult.status}</Mono>
            {stepResult.action === undefined ? null : <> · action <Mono>{stepResult.action}</Mono></>} · {stepResult.detail}
          </div>
        )}
        {runResult === null ? null : (
          <div data-testid="management-run-result" style={{ fontSize: 12 }}>
            {runResult.steps.length} step(s) · stopped <Mono>{runResult.stoppedReason}</Mono>
          </div>
        )}
      </Section>

      <Section title="Request a mode change (a request, never a change)" testId="management-request-section">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <SelectInput
            ariaLabel="requested management involvement"
            testId="management-mode-target"
            value={target}
            onChange={setTarget}
            options={INVOLVEMENTS.map((entry) => ({ value: entry, label: entry }))}
          />
          <Btn onClick={doRequest} disabled={busy} testId="management-request-mode">
            Request mode change
          </Btn>
        </div>
        <Muted>
          The agent-facing path can only request an involvement change. The returned status is always `requested`; only the operator control
          port can apply one, and this surface has no mode setter.
        </Muted>
        {request === null ? null : (
          <div data-testid="management-request-result" style={{ fontSize: 12 }}>
            status <Mono>{request.status}</Mono> · {request.detail}
          </div>
        )}
      </Section>

      <Section title="Management activity (durable, append-only)" testId="management-activity-section">
        {props.activity.length === 0 ? (
          <Muted testId="management-activity-empty">
            No management activity is recorded for this project yet. The activity log is product history, never
            authority: nothing is inferred from its absence.
          </Muted>
        ) : (
          [...props.activity].reverse().map((record) => {
            const unresolved = record.finishedAt === null;
            return (
              <div key={record.recordId} data-testid="management-activity-row" style={{ fontSize: 12 }}>
                <Mono>#{record.sequence}</Mono> <b>{record.actionClass}</b> · {record.decision}
                {record.typedReasonCode === null ? "" : ` (${record.typedReasonCode})`}
                {unresolved ? " · unresolved/interrupted" : ""} · <Mono>{record.startedAt}</Mono>
                <div data-testid="management-activity-reason" style={{ color: COLORS.muted }}>
                  {record.reason}
                </div>
                {record.canonicalOutcomeRefs.length === 0 ? (
                  <Muted>no canonical outcome reference (nothing canonical was mutated)</Muted>
                ) : (
                  <div data-testid="management-activity-refs" style={{ color: COLORS.muted }}>
                    canonical refs:{" "}
                    {record.canonicalOutcomeRefs
                      .map((ref) => `${ref.kind}:${ref.ref}`)
                      .join(", ")}{" "}
                    — the canonical owner remains authoritative
                  </div>
                )}
              </div>
            );
          })
        )}
        <Muted>
          An activity record that says a revision was applied does not prove it; the referenced canonical owner
          does. Records are never rewritten to claim success.
        </Muted>
      </Section>

      <Section title="Actions taken from this surface (this UI session only)" testId="management-log-section">
        {actions.length === 0 ? (
          <Muted>No action was taken from this surface in this session.</Muted>
        ) : (
          actions.map((entry) => (
            <div key={entry} data-testid="management-log-row" style={{ fontSize: 12 }}>
              {entry}
            </div>
          ))
        )}
        <Muted>This list is UI session state only; the durable history is above.</Muted>
      </Section>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Main view
 * ------------------------------------------------------------------ */

export function ProjectWorkspaceView(props: {
  readonly surfaces: ApplicationSurfaceAvailability | null;
  readonly onNavigate: (target: ProjectSurfaceTarget) => void;
}): React.ReactElement {
  const [tab, setTab] = useState<Tab>("overview");
  const [view, setView] = useState<ProjectWorkspaceReadModel | null>(null);
  const [assets, setAssets] = useState<readonly ProjectAssetAssociation[]>([]);
  const [loops, setLoops] = useState<readonly OpenLoop[]>([]);
  const [history, setHistory] = useState<readonly WorkspaceHistoryEntry[]>([]);
  const [journal, setJournal] = useState<readonly ProjectJournalViewEntry[]>([]);
  const [status, setStatus] = useState<ManagementAssessment | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  // G10-AB: the durable posture and activity history (derived + non-authoritative).
  const [posture, setPosture] = useState<ProjectOperatingPostureView | null>(null);
  const [postureError, setPostureError] = useState<string | null>(null);
  const [activity, setActivity] = useState<readonly ManagementActivityRecord[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  const refreshStatus = useCallback(async (): Promise<void> => {
    try {
      setStatus(await manageStatus());
      setStatusError(null);
    } catch (error) {
      setStatus(null);
      setStatusError(errText(error));
    }
    // The posture and the activity history are read from their own durable,
    // non-authoritative stores. A missing store is reported, never fabricated.
    try {
      setPosture(await operatingPosture());
      setPostureError(null);
    } catch (error) {
      setPosture(null);
      setPostureError(errText(error));
    }
    try {
      setActivity(await managementActivity(20));
    } catch {
      setActivity([]);
    }
  }, []);

  const refresh = useCallback(async (): Promise<void> => {
    try {
      setView(await projectWorkspace());
    } catch (error) {
      setMessage(`workspace query failed: ${errText(error)}`);
    }
    try {
      setAssets(await projectAssets());
    } catch (error) {
      setMessage(`asset query failed: ${errText(error)}`);
    }
    try {
      setLoops(await projectOpenLoops());
    } catch (error) {
      setMessage(`open-loop query failed: ${errText(error)}`);
    }
    try {
      setHistory(await projectHistory());
    } catch (error) {
      setMessage(`history query failed: ${errText(error)}`);
    }
    try {
      setJournal(await projectJournal());
    } catch (error) {
      setMessage(`journal query failed: ${errText(error)}`);
    }
    await refreshStatus();
  }, [refreshStatus]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateRows: "auto auto 1fr auto",
        gap: 10,
        height: "100vh",
        boxSizing: "border-box",
        padding: 12,
        background: COLORS.bg,
        color: COLORS.text,
      }}
    >
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <b>palimpsest Project Workspace</b>
        <Muted>the durable project OS: goals, decisions, work, assets, journal knowledge and graduated management</Muted>
        <span style={{ flex: 1 }} />
        <Btn primary onClick={() => props.onNavigate("project")} testId="project-home">
          Project
        </Btn>
        <Btn onClick={() => props.onNavigate("work")} testId="project-work-graph" title="the live Work graph surface">
          Work 图面
        </Btn>
        <Btn onClick={() => props.onNavigate("proof")} testId="project-proof-vault" title="deep capability over this project's proof assets">
          Proof Vault
        </Btn>
        <Btn onClick={() => props.onNavigate("multigraph")} testId="project-multigraph">
          MultiGraph 调试器
        </Btn>
        <Btn onClick={() => void refresh()} testId="project-refresh">
          Refresh
        </Btn>
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            aria-pressed={tab === entry.id}
            onClick={() => setTab(entry.id)}
            style={{
              padding: "5px 10px",
              borderRadius: 8,
              border: `1px solid ${COLORS.border}`,
              background: tab === entry.id ? COLORS.accent : "#1e293b",
              color: COLORS.text,
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            {entry.label}
          </button>
        ))}
      </div>

      <div style={{ overflow: "auto", border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 12, background: COLORS.panel }}>
        {tab === "overview" ? (
          <OverviewPanel view={view} loops={loops} status={status} managementError={statusError} />
        ) : null}
        {tab === "work" ? <WorkPanel view={view} assets={assets} /> : null}
        {tab === "assets" ? (
          <AssetsPanel assets={assets} view={view} journal={journal} loops={loops} onNavigate={props.onNavigate} />
        ) : null}
        {tab === "loops" ? <OpenLoopsPanel loops={loops} view={view} /> : null}
        {tab === "history" ? <HistoryPanel view={view} history={history} status={status} /> : null}
        {tab === "management" ? (
          <ManagementPanel
            status={status}
            statusError={statusError}
            posture={posture}
            postureError={postureError}
            activity={activity}
            surfaces={props.surfaces}
            refreshStatus={refreshStatus}
            onMessage={setMessage}
          />
        ) : null}
      </div>

      <div data-testid="project-message" style={{ color: COLORS.muted, fontSize: 12, minHeight: 18 }}>
        {message === null ? "" : <ErrorText>{message}</ErrorText>}
      </div>
    </div>
  );
}
