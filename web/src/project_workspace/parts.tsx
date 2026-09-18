/**
 * G10-V Project Workspace — small presentational primitives.
 *
 * Dumb building blocks only: no fetch, no state, no authority. The workspace
 * surface reaches project state exclusively through the typed helpers in
 * `../api`; nothing here reads a store, a file, or a canonical row.
 */

import type { CSSProperties, ReactNode } from "react";

export const COLORS = {
  bg: "#020617",
  panel: "#0b1222",
  card: "#0f172a",
  border: "#1e293b",
  text: "#e2e8f0",
  muted: "#94a3b8",
  faint: "#475569",
  warn: "#fbbf24",
  danger: "#f87171",
  ok: "#22c55e",
  accent: "#1d4ed8",
} as const;

/** The one sentence the two axes must never be collapsed into. */
export const TWO_AXIS_SENTENCE =
  "Work Mode = how work is executed; Management = how proactively Palimpsest manages the project";

/** The honest statement of what the management layer can and cannot reach. */
export const MANAGEMENT_MODE_NOTES: readonly string[] = Object.freeze([
  "an involvement level is a project preference, never an authority grant",
  "a step is executed only through the existing governed services; a mode grants no authority",
  "an agent can never apply an involvement change: it can only request one, and the request is not a change",
]);

/**
 * A heading glyph, keyed by the section title.
 *
 * The rule for these: an icon may only REPEAT what the title already says. It must never add a
 * claim — in particular there is deliberately no ✅/❌ for a verification verdict and no 🔒 for an
 * approval, because the product's own copy promises it "never shows a generic verified badge" and
 * that "confirming never substitutes for semantic authority". A green tick beside a verdict would
 * be exactly that badge. A title with no entry simply renders without one.
 */
const SECTION_ICONS: Readonly<Record<string, string>> = Object.freeze({
  Project: "📌",
  Requirements: "📋",
  "Current decisions": "⚖️",
  "Decision supersession": "🔁",
  "Scheduler / work state": "⏱️",
  Resume: "⏯️",
  Tasks: "🧩",
  Attempts: "🏃",
  "Attempt outcomes": "🏁",
  Blockers: "🚧",
  "Gate evidence": "🚪",
  "Management mode": "🎛️",
  "Work Mode": "⚙️",
  Management: "🎛️",
  "Next attention item": "👀",
  "Knowledge warnings": "🩺",
  Runtime: "🧰",
  "Tick source": "⏱️",
  "Monitor preference": "👁️",
  "What would Monitor do now?": "🔍",
  "What Palimpsest may do automatically": "🤖",
  "What always requires confirmation": "🛡️",
  "Derived management actions": "🧭",
  "Pending confirmations": "✋",
  "Request a mode change": "🙋",
  "Management activity": "🧾",
  "Current project head": "📍",
  "Run history": "🗂️",
  Publication: "🚀",
  "Published proof assets": "🏷️",
  Sources: "📚",
  "Import a source": "📥",
  "Export history": "📤",
  Preview: "👁️",
  Exposure: "👁️",
  "Journal knowledge": "📓",
  "Artifacts and associations": "🔗",
  "Referenced assets in this project": "📎",
  Providers: "🔌",
  "Search the external library": "🔎",
  "Analysis outcome": "🧪",
  "Scoped Campaigns": "🗺️",
  "Last observed activity": "🕒",
  "ProjectIR revisions": "🧬",
  "Proof standing changes": "📈",
  Actions: "🎬",
});

function iconFor(title: string): string | null {
  const direct = SECTION_ICONS[title];
  if (direct !== undefined) return direct;
  // Titles carrying a qualifier — "Requirements (0)", "Publication (advanced; …)" — match their base.
  const base = title.split(" (")[0] ?? title;
  return SECTION_ICONS[base] ?? null;
}

/**
 * Identifiers and digests, one click away instead of on the first screen.
 *
 * These values are load-bearing for an expert and meaningless to everyone else, and the previous
 * form served neither: a 16-character truncation is too short to read and too short to copy. Closed
 * by default, and the full value is shown inside so it can be copied.
 */
export function TechnicalDetails(props: { readonly summary: string; readonly children: ReactNode }): React.ReactElement {
  return (
    <details style={{ marginTop: 2 }} data-testid="technical-details">
      <summary style={{ cursor: "pointer", color: COLORS.muted, fontSize: 11 }}>{props.summary}</summary>
      <div style={{ display: "grid", gap: 6, paddingTop: 6 }}>{props.children}</div>
    </details>
  );
}

export function Section(props: { readonly title: string; readonly children: ReactNode; readonly testId?: string }): React.ReactElement {
  const icon = iconFor(props.title);
  return (
    <section
      data-testid={props.testId}
      style={{ display: "grid", gap: 6, borderTop: `1px solid ${COLORS.border}`, paddingTop: 8 }}
    >
      <h3 style={{ margin: 0, fontSize: 12, color: COLORS.muted, textTransform: "uppercase", letterSpacing: 0.4 }}>
        {icon === null ? null : (
          <span aria-hidden="true" data-section-icon={props.title}>
            {icon}{" "}
          </span>
        )}
        {props.title}
      </h3>
      {props.children}
    </section>
  );
}

export function Btn(props: {
  readonly children: ReactNode;
  readonly onClick: () => void;
  readonly disabled?: boolean;
  readonly primary?: boolean;
  readonly testId?: string;
  readonly ariaLabel?: string;
  readonly title?: string;
}): React.ReactElement {
  return (
    <button
      type="button"
      aria-label={props.ariaLabel}
      title={props.title}
      data-testid={props.testId}
      disabled={props.disabled === true}
      onClick={props.onClick}
      style={{
        padding: "5px 10px",
        borderRadius: 8,
        border: `1px solid ${COLORS.border}`,
        background: props.disabled === true ? COLORS.border : props.primary === true ? COLORS.accent : "#1e293b",
        color: props.disabled === true ? COLORS.faint : COLORS.text,
        fontSize: 12,
        cursor: props.disabled === true ? "not-allowed" : "pointer",
      }}
    >
      {props.children}
    </button>
  );
}

export function Mono(props: { readonly children: ReactNode; readonly testId?: string }): React.ReactElement {
  return (
    <code data-testid={props.testId} style={{ fontFamily: "ui-monospace, monospace", fontSize: 11, color: "#cbd5e1", wordBreak: "break-all" }}>
      {props.children}
    </code>
  );
}

export function Muted(props: { readonly children: ReactNode }): React.ReactElement {
  return <span style={{ color: COLORS.muted, fontSize: 12 }}>{props.children}</span>;
}

export function ErrorText(props: { readonly children: ReactNode; readonly testId?: string }): React.ReactElement {
  return (
    <div data-testid={props.testId} style={{ color: COLORS.danger, fontSize: 12 }}>
      {props.children}
    </div>
  );
}

export function Notice(props: { readonly children: ReactNode; readonly testId?: string }): React.ReactElement {
  return (
    <div data-testid={props.testId} style={{ color: COLORS.warn, fontSize: 12 }}>
      {props.children}
    </div>
  );
}

export function Card(props: { readonly children: ReactNode; readonly testId?: string }): React.ReactElement {
  return (
    <div
      data-testid={props.testId}
      style={{ border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: 8, display: "grid", gap: 3, fontSize: 12, background: COLORS.card }}
    >
      {props.children}
    </div>
  );
}

export function Field(props: { readonly label: string; readonly children: ReactNode; readonly testId?: string }): React.ReactElement {
  return (
    <div data-testid={props.testId} style={{ fontSize: 12 }}>
      <span style={{ color: COLORS.muted }}>{props.label}: </span>
      {props.children}
    </div>
  );
}

export function Tag(props: { readonly children: ReactNode; readonly tone?: "muted" | "ok" | "warn" | "danger" }): React.ReactElement {
  const tone = props.tone ?? "muted";
  const color = tone === "ok" ? COLORS.ok : tone === "warn" ? COLORS.warn : tone === "danger" ? COLORS.danger : COLORS.muted;
  return (
    <span style={{ border: `1px solid ${COLORS.border}`, borderRadius: 999, padding: "1px 8px", fontSize: 11, color }}>{props.children}</span>
  );
}

export const selectStyle: CSSProperties = {
  padding: "4px 8px",
  borderRadius: 6,
  border: `1px solid ${COLORS.border}`,
  background: COLORS.card,
  color: COLORS.text,
  fontSize: 12,
};

export function SelectInput<T extends string>(props: {
  readonly value: T;
  readonly options: readonly { readonly value: T; readonly label: string }[];
  readonly onChange: (next: T) => void;
  readonly ariaLabel: string;
  readonly testId?: string;
}): React.ReactElement {
  return (
    <select
      aria-label={props.ariaLabel}
      data-testid={props.testId}
      value={props.value}
      onChange={(event) => props.onChange(event.target.value as T)}
      style={{ ...selectStyle, cursor: "pointer" }}
    >
      {props.options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

/* ------------------------------------------------------------------ *
 * Display-only derivations (no canonical semantics)
 * ------------------------------------------------------------------ */

/**
 * The canonical subsystem that OWNS an asset of this kind. An association is
 * only a link; ownership never moves to the project workspace.
 */
export function canonicalOwnerOf(assetKind: string): string {
  switch (assetKind) {
    case "DECISION":
      return "Work / ProjectIR (decision lineage)";
    case "PRODUCED_ARTIFACT":
      return "Work (controller evidence/artifacts)";
    case "PROOF_CLAIM":
      return "Proof / Evidence plane";
    case "EXPERIMENT":
      return "Organization memory (empirical history)";
    case "JOURNAL_ENTRY":
      return "Project journal (this layer records it)";
    case "CAMPAIGN":
      return "Campaign service";
    case "REASONING_CELL":
      return "Reasoning cell service";
    default:
      return "unknown canonical owner";
  }
}

/** Shorten an opaque digest for display without pretending it is content. */
export function shortDigest(digest: string): string {
  return digest.length <= 16 ? digest : `${digest.slice(0, 16)}…`;
}
