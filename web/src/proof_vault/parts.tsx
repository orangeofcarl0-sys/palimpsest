/**
 * G10-U Proof Vault — small shared presentational primitives.
 *
 * These are dumb building blocks only: no fetch, no state, no authority. The
 * Proof Vault reaches canonical state exclusively through the typed helpers in
 * `../api` (see ProofVaultView). Nothing here reads a store, blob, or file.
 */

import type { CSSProperties, ReactNode } from "react";

export const COLORS = {
  bg: "#020617",
  panel: "#0b1222",
  border: "#1e293b",
  input: "#0f172a",
  text: "#e2e8f0",
  muted: "#94a3b8",
  faint: "#475569",
  warn: "#fbbf24",
  danger: "#f87171",
  ok: "#22c55e",
  accent: "#1d4ed8",
} as const;

/** The mandatory, verbatim source-import disclosure shown on the empty state. */
export const IMPORT_LOCAL_ONLY_NOTICE =
  "Importing stores the source locally and does not send it to a model. Analysis is a separate explicit action.";

/** The server accepts the import body as base64; keep the client bound honest and visible. */
export const MAX_IMPORT_BASE64_BYTES = 750 * 1024;

export function Section(props: { readonly title: string; readonly children: ReactNode; readonly testId?: string }): React.ReactElement {
  return (
    <section style={{ display: "grid", gap: 6, borderTop: `1px solid ${COLORS.border}`, paddingTop: 8 }} data-testid={props.testId}>
      <h3 style={{ margin: 0, fontSize: 12, color: COLORS.muted, textTransform: "uppercase", letterSpacing: 0.4 }}>{props.title}</h3>
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
}): React.ReactElement {
  return (
    <button
      type="button"
      aria-label={props.ariaLabel}
      data-testid={props.testId}
      disabled={props.disabled === true}
      onClick={props.onClick}
      style={{
        padding: "5px 10px",
        borderRadius: 8,
        border: `1px solid ${COLORS.border}`,
        background: props.disabled === true ? "#1e293b" : props.primary === true ? COLORS.accent : "#1e293b",
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

export const inputStyle: CSSProperties = {
  padding: "4px 8px",
  borderRadius: 6,
  border: `1px solid ${COLORS.border}`,
  background: COLORS.input,
  color: COLORS.text,
  fontSize: 12,
};

export function TextInput(props: {
  readonly value: string;
  readonly onChange: (next: string) => void;
  readonly ariaLabel: string;
  readonly placeholder?: string;
  readonly width?: number | string;
  readonly testId?: string;
}): React.ReactElement {
  return (
    <input
      aria-label={props.ariaLabel}
      data-testid={props.testId}
      placeholder={props.placeholder}
      value={props.value}
      onChange={(event) => props.onChange(event.target.value)}
      style={{ ...inputStyle, width: props.width ?? 220 }}
    />
  );
}

export function NumberInput(props: {
  readonly value: string;
  readonly onChange: (next: string) => void;
  readonly ariaLabel: string;
  readonly width?: number;
}): React.ReactElement {
  return (
    <input
      aria-label={props.ariaLabel}
      inputMode="numeric"
      value={props.value}
      onChange={(event) => props.onChange(event.target.value.replace(/[^0-9]/gu, ""))}
      style={{ ...inputStyle, width: props.width ?? 90 }}
    />
  );
}

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
      style={{ ...inputStyle, cursor: "pointer" }}
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
 * Pure helpers (no canonical semantics; display + transport only)
 * ------------------------------------------------------------------ */

export function isTextualMediaType(mediaType: string): boolean {
  const normalized = mediaType.split(";")[0]!.trim().toLowerCase();
  return normalized.startsWith("text/") || normalized === "application/json" || normalized.endsWith("+json") || normalized === "application/x-ndjson";
}

/** Opaque = no OCR and no textual selector; the only honest selector is WHOLE_SOURCE. */
export function isOpaqueMediaType(mediaType: string): boolean {
  return !isTextualMediaType(mediaType);
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

export function base64ToText(base64: string): string {
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function selectorLabel(selector: { readonly kind: string; readonly start?: number; readonly end?: number; readonly pointer?: string }): string {
  if (selector.kind === "WHOLE_SOURCE") return "WHOLE_SOURCE";
  if (selector.kind === "TEXT_RANGE") return `TEXT_RANGE [${selector.start ?? "?"}, ${selector.end ?? "?"})`;
  return `JSON_POINTER ${JSON.stringify(selector.pointer ?? "")}`;
}

export function summarizeContent(content: unknown): string {
  if (typeof content === "object" && content !== null && !Array.isArray(content)) {
    const record = content as Record<string, unknown>;
    if (typeof record.statement === "string" && record.statement.trim() !== "") return record.statement;
    if (typeof record.attribute === "string") return `${record.attribute} = ${JSON.stringify(record.value)}`;
  }
  try {
    const text = JSON.stringify(content);
    return typeof text === "string" ? text : String(content);
  } catch {
    return String(content);
  }
}

/** A stable, filesystem-safe source id derived from a label (never a canonical identity). */
export function slugifySourceId(label: string): string {
  const slug = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
  return slug === "" ? "source" : slug.slice(0, 64);
}
