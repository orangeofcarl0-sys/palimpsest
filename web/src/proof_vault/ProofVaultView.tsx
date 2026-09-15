/**
 * G10-U Proof Vault — the product-facing proof vertical.
 *
 *   UI state ≠ canonical truth        UI action ≠ authority grant
 *   Published claim ≠ truth           Freshness ≠ truth
 *   Preview ≠ export                  Exported ≠ received
 *   Analysis ≠ publication            Extraction ≠ admission
 *
 * This surface is presentation-only over the typed HTTP helpers in `../api`.
 * There is NO direct store/blob/SQLite access, no bearer-token-as-authority,
 * no encryption or legal claim, and no sharing/delivery verb anywhere. Raw
 * source content is reached only through the explicit `read_explicit` action.
 */

import { useCallback, useEffect, useState } from "react";

import {
  ApiError,
  disclosureApproveExport,
  disclosureHistory,
  disclosurePreview,
  proofAnalyze,
  proofClaimWhy,
  proofClaims,
  proofEvaluatePublication,
  proofEvidenceCreate,
  proofImportSource,
  proofPreparePublication,
  proofReassess,
  proofReadExplicit,
  proofSourceInspect,
  proofSourceRevisions,
  proofSources,
  proofSurfaces,
  type AnalyzeEvidenceOutcome,
  type ClaimAssessmentRevision,
  type DisclosureExportOutcome,
  type DisclosureExportReceipt,
  type DisclosurePreview,
  type EvidenceItem,
  type EvidenceSelector,
  type ProofClaimStanding,
  type ProofPreparePublicationResult,
  type ProofPublicationResult,
  type ProofReadExplicitResult,
  type ProofSourceRevision,
  type ProofSourceSummary,
  type ProofSurfaceAvailability,
  type ProofWhy,
  type PublishedProofClaim,
} from "../api";
import {
  Btn,
  COLORS,
  ErrorText,
  IMPORT_LOCAL_ONLY_NOTICE,
  MAX_IMPORT_BASE64_BYTES,
  Mono,
  Muted,
  Notice,
  NumberInput,
  Section,
  SelectInput,
  TextInput,
  base64ToText,
  bytesToBase64,
  isOpaqueMediaType,
  isTextualMediaType,
  selectorLabel,
  slugifySourceId,
  summarizeContent,
} from "./parts";

type Tab = "sources" | "evidence" | "assets" | "disclosure" | "analyze";

const TABS: readonly { readonly id: Tab; readonly label: string }[] = [
  { id: "sources", label: "Sources" },
  { id: "evidence", label: "Evidence" },
  { id: "assets", label: "Proof Assets" },
  { id: "disclosure", label: "Disclosure" },
  { id: "analyze", label: "Analyze with Explore" },
];

const MEDIA_TYPES = [
  "text/plain",
  "text/markdown",
  "application/json",
  "application/pdf",
  "image/png",
  "image/jpeg",
] as const;

const PROVENANCES = ["LOCAL_IMPORT", "EXTERNAL_REFERENCE", "GENERATED_ARTIFACT"] as const;

function errText(error: unknown): string {
  if (error instanceof ApiError) return `${error.status}: ${error.message}`;
  return error instanceof Error ? error.message : String(error);
}

function mediaTypeForFile(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".json")) return "application/json";
  if (lower.endsWith(".md") || lower.endsWith(".markdown")) return "text/markdown";
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  return "text/plain";
}

/* ================================================================== *
 * Sources
 * ================================================================== */

interface SourceDraft {
  readonly fileName: string;
  readonly base64: string;
  readonly byteLength: number;
}

function SourcePanel(props: {
  readonly sources: readonly ProofSourceSummary[];
  readonly refreshSources: () => Promise<void>;
  readonly knownEvidence: readonly EvidenceItem[];
  readonly whyById: Readonly<Record<string, ProofWhy>>;
  readonly onMessage: (text: string) => void;
}): React.ReactElement {
  const [draft, setDraft] = useState<SourceDraft | null>(null);
  const [label, setLabel] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [mediaType, setMediaType] = useState<string>("text/plain");
  const [provenance, setProvenance] = useState<string>("LOCAL_IMPORT");
  const [confirmed, setConfirmed] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [sizeError, setSizeError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [revisions, setRevisions] = useState<readonly ProofSourceRevision[]>([]);
  const [selectedRevision, setSelectedRevision] = useState<number | null>(null);
  const [inspected, setInspected] = useState<ProofSourceRevision | null>(null);
  const [preview, setPreview] = useState<ProofReadExplicitResult | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);

  const loadRevisions = useCallback(
    async (id: string) => {
      try {
        const list = await proofSourceRevisions(id);
        setRevisions(list);
        setSelectedRevision(list.length === 0 ? null : list[list.length - 1]!.revision);
        setInspected(null);
        setPreview(null);
      } catch (error) {
        props.onMessage(`revision query failed: ${errText(error)}`);
      }
    },
    [props],
  );

  useEffect(() => {
    if (selectedSourceId === null) {
      setRevisions([]);
      setSelectedRevision(null);
      return;
    }
    void loadRevisions(selectedSourceId);
  }, [selectedSourceId, loadRevisions]);

  useEffect(() => {
    if (selectedSourceId === null || selectedRevision === null) {
      setInspected(null);
      return;
    }
    void (async () => {
      try {
        setInspected(await proofSourceInspect({ sourceId: selectedSourceId, revision: selectedRevision }));
      } catch (error) {
        props.onMessage(`revision inspect failed: ${errText(error)}`);
      }
    })();
  }, [selectedSourceId, selectedRevision, props]);

  const acceptFile = (file: File): void => {
    setImportError(null);
    setSizeError(null);
    void (async () => {
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const base64 = bytesToBase64(bytes);
        setLabel((current) => (current === "" ? file.name : current));
        setSourceId((current) => (current === "" ? slugifySourceId(file.name) : current));
        setMediaType(mediaTypeForFile(file.name));
        setDraft({ fileName: file.name, base64, byteLength: bytes.length });
        if (base64.length > MAX_IMPORT_BASE64_BYTES) {
          setSizeError(
            `This file encodes to ${base64.length} base64 bytes, above the client limit of ${MAX_IMPORT_BASE64_BYTES} (about ${Math.floor((MAX_IMPORT_BASE64_BYTES * 3) / 4 / 1024)} KB of source). The source was not imported.`,
          );
        }
      } catch (error) {
        setImportError(`could not read file: ${error instanceof Error ? error.message : String(error)}`);
      }
    })();
  };

  const doImport = (): void => {
    if (draft === null) return;
    if (draft.base64.length > MAX_IMPORT_BASE64_BYTES) {
      setSizeError("over the base64 limit — import refused (no partial write)");
      return;
    }
    if (!confirmed) {
      setImportError("explicit confirmation is required before import");
      return;
    }
    void (async () => {
      setImporting(true);
      setImportError(null);
      try {
        await proofImportSource({
          sourceId,
          label,
          mediaType,
          provenance: provenance as (typeof PROVENANCES)[number],
          contentBase64: draft.base64,
        });
        setDraft(null);
        setConfirmed(false);
        setImportError(null);
        props.onMessage(`source "${sourceId}" imported (revision recorded locally)`);
        await props.refreshSources();
        setSelectedSourceId(sourceId);
      } catch (error) {
        // Errors are surfaced as typed text; raw content is NEVER echoed back.
        setImportError(errText(error));
      } finally {
        setImporting(false);
      }
    })();
  };

  const evidenceForRevision = (sourceIdValue: string, revision: number): readonly EvidenceItem[] => {
    const byId = new Map<string, EvidenceItem>();
    for (const item of props.knownEvidence) byId.set(item.evidenceId, item);
    for (const view of Object.values(props.whyById)) {
      for (const item of view.evidence) byId.set(item.evidenceId, item);
    }
    return [...byId.values()].filter(
      (item) => item.sourceRevision.sourceId === sourceIdValue && item.sourceRevision.revision === revision,
    );
  };

  const previewContent = (revision: ProofSourceRevision): void => {
    void (async () => {
      setPreviewBusy(true);
      setPreview(null);
      try {
        setPreview(
          await proofReadExplicit({ sourceId: revision.sourceId, revision: revision.revision, contentDigest: revision.contentDigest }),
        );
      } catch (error) {
        props.onMessage(`explicit content read failed: ${errText(error)}`);
      } finally {
        setPreviewBusy(false);
      }
    })();
  };

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <Section title="Import a source">
        {props.sources.length === 0 ? (
          <p data-testid="sources-empty-state" style={{ color: COLORS.muted, fontSize: 12, margin: 0 }}>
            {IMPORT_LOCAL_ONLY_NOTICE}
          </p>
        ) : null}
        <div
          data-testid="source-dropzone"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            const file = event.dataTransfer.files?.[0];
            if (file !== undefined) acceptFile(file);
          }}
          style={{ border: `1px dashed ${COLORS.border}`, borderRadius: 8, padding: 12, color: COLORS.muted, fontSize: 12, display: "grid", gap: 6 }}
        >
          <div>Drop a file here, or choose one. The file is read locally in this browser and sent to the local server as base64.</div>
          <label style={{ color: COLORS.text, fontSize: 12 }}>
            Choose file
            <input
              type="file"
              aria-label="source file"
              data-testid="source-file"
              style={{ display: "block", marginTop: 4, fontSize: 12 }}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file !== undefined) acceptFile(file);
                event.target.value = "";
              }}
            />
          </label>
          <Muted>
            Honest limit: at most {MAX_IMPORT_BASE64_BYTES} base64 bytes per import (about {Math.floor((MAX_IMPORT_BASE64_BYTES * 3) / 4 / 1024)} KB of
            source). No partial writes.
          </Muted>
          {draft !== null ? (
            <div style={{ display: "grid", gap: 6 }}>
              <Muted>
                selected: {draft.fileName} · {draft.byteLength} bytes · {draft.base64.length} base64 bytes
              </Muted>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <label style={{ display: "grid", gap: 2 }}>
                  <Muted>sourceId</Muted>
                  <TextInput ariaLabel="source id" value={sourceId} onChange={setSourceId} testId="import-source-id" />
                </label>
                <label style={{ display: "grid", gap: 2 }}>
                  <Muted>label</Muted>
                  <TextInput ariaLabel="source label" value={label} onChange={setLabel} testId="import-label" />
                </label>
                <label style={{ display: "grid", gap: 2 }}>
                  <Muted>media type (explicit)</Muted>
                  <SelectInput
                    ariaLabel="source media type"
                    testId="import-media-type"
                    value={mediaType}
                    onChange={setMediaType}
                    options={MEDIA_TYPES.map((entry) => ({ value: entry, label: entry }))}
                  />
                </label>
                <label style={{ display: "grid", gap: 2 }}>
                  <Muted>provenance</Muted>
                  <SelectInput
                    ariaLabel="source provenance"
                    value={provenance}
                    onChange={setProvenance}
                    options={PROVENANCES.map((entry) => ({ value: entry, label: entry }))}
                  />
                </label>
              </div>
              <label style={{ display: "flex", gap: 6, alignItems: "center", color: COLORS.text, fontSize: 12 }}>
                <input type="checkbox" aria-label="confirm local import" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
                I confirm this import: the source is stored locally and is not sent to a model by importing.
              </label>
              <div>
                <Btn primary disabled={importing || sizeError !== null} onClick={doImport} testId="import-source">
                  {importing ? "Importing…" : "Import source"}
                </Btn>
              </div>
            </div>
          ) : null}
          {sizeError !== null ? <ErrorText testId="import-size-error">{sizeError}</ErrorText> : null}
          {importError !== null ? <ErrorText testId="import-error">{importError}</ErrorText> : null}
        </div>
      </Section>

      <Section title="Sources (metadata only)">
        {props.sources.length === 0 ? (
          <Muted>No sources recorded.</Muted>
        ) : (
          <div style={{ display: "grid", gap: 6 }}>
            {props.sources.map((source) => (
              <button
                key={source.sourceId}
                type="button"
                data-testid="source-row"
                onClick={() => setSelectedSourceId(source.sourceId)}
                style={{
                  textAlign: "left",
                  padding: 8,
                  borderRadius: 8,
                  border: `1px solid ${selectedSourceId === source.sourceId ? COLORS.accent : COLORS.border}`,
                  background: COLORS.input,
                  color: COLORS.text,
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                <div>
                  <b>{source.sourceId}</b> · {source.latestLabel}
                </div>
                <Muted>
                  media {source.latestMediaType} · provenance {source.provenance} · {source.revisionCount} revision(s) · latest digest{" "}
                  {source.latestContentDigest.slice(0, 12)}…
                </Muted>
              </button>
            ))}
          </div>
        )}
      </Section>

      {selectedSourceId !== null ? (
        <Section title={`Source detail — ${selectedSourceId}`} testId="source-detail">
          <div style={{ display: "grid", gap: 6 }}>
            {revisions.map((revision) => (
              <div key={revision.revision} style={{ display: "grid", gap: 4 }}>
                <button
                  type="button"
                  onClick={() => setSelectedRevision(revision.revision)}
                  style={{
                    textAlign: "left",
                    padding: 6,
                    borderRadius: 6,
                    border: `1px solid ${selectedRevision === revision.revision ? COLORS.accent : COLORS.border}`,
                    background: COLORS.input,
                    color: COLORS.text,
                    fontSize: 12,
                    cursor: "pointer",
                  }}
                >
                  revision {revision.revision} · {revision.label} · {revision.mediaType} · digest {revision.contentDigest.slice(0, 12)}…
                </button>
                {selectedRevision === revision.revision ? (
                  <div style={{ display: "grid", gap: 4, paddingLeft: 10, fontSize: 12 }}>
                    <div>
                      sourceId <Mono>{revision.sourceId}</Mono>
                    </div>
                    <div>
                      revision <Mono>{String(revision.revision)}</Mono> · mediaType <Mono>{revision.mediaType}</Mono>
                    </div>
                    <div>
                      contentDigest <Mono testId="revision-digest">{revision.contentDigest}</Mono>
                    </div>
                    <div>
                      provenance <Mono>{revision.provenance}</Mono>
                    </div>
                    <div>
                      metadata <Mono>{JSON.stringify(revision.metadata)}</Mono>
                    </div>
                    <Muted>model / provider: unknown (this installation exposes no model binding for sources)</Muted>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <Btn onClick={() => previewContent(revision)} disabled={previewBusy} testId="preview-content">
                        Preview content (explicit)
                      </Btn>
                      <Muted>Only this explicit action reads source bytes.</Muted>
                    </div>
                    {preview !== null ? (
                      <div data-testid="source-content-preview" style={{ background: COLORS.input, borderRadius: 6, padding: 6 }}>
                        {preview.state === "unavailable" ? (
                          <Muted>content unavailable through the explicit read port</Muted>
                        ) : isTextualMediaType(revision.mediaType) ? (
                          <pre style={{ margin: 0, whiteSpace: "pre-wrap", fontSize: 11, maxHeight: 180, overflow: "auto" }}>
                            {base64ToText(preview.content)}
                          </pre>
                        ) : (
                          <Muted>
                            opaque {revision.mediaType} source — content is not rendered, no OCR is performed, and only WHOLE_SOURCE evidence is
                            permitted.
                          </Muted>
                        )}
                      </div>
                    ) : null}
                    <div>
                      <Muted>Evidence items on this revision:</Muted>
                      {evidenceForRevision(revision.sourceId, revision.revision).length === 0 ? (
                        <Muted> none recorded yet.</Muted>
                      ) : (
                        <ul style={{ margin: "4px 0 0 0", paddingLeft: 18 }}>
                          {evidenceForRevision(revision.sourceId, revision.revision).map((item) => (
                            <li key={item.evidenceId}>
                              <Mono>{item.evidenceId}</Mono> · {selectorLabel(item.selector)} · selection {item.selectionDigest.slice(0, 10)}…
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </Section>
      ) : null}
    </div>
  );
}

/* ================================================================== *
 * Evidence creation
 * ================================================================== */

function EvidencePanel(props: {
  readonly sources: readonly ProofSourceSummary[];
  readonly onRecorded: (item: EvidenceItem) => void;
  readonly onMessage: (text: string) => void;
}): React.ReactElement {
  const [sourceId, setSourceId] = useState<string>("");
  const [revisions, setRevisions] = useState<readonly ProofSourceRevision[]>([]);
  const [revision, setRevision] = useState<string>("");
  const [kind, setKind] = useState<"WHOLE_SOURCE" | "TEXT_RANGE" | "JSON_POINTER">("WHOLE_SOURCE");
  const [start, setStart] = useState("0");
  const [end, setEnd] = useState("16");
  const [pointer, setPointer] = useState("/");
  const [result, setResult] = useState<EvidenceItem | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (props.sources.length > 0 && sourceId === "") setSourceId(props.sources[0]!.sourceId);
  }, [props.sources, sourceId]);

  useEffect(() => {
    if (sourceId === "") {
      setRevisions([]);
      return;
    }
    void (async () => {
      try {
        const list = await proofSourceRevisions(sourceId);
        setRevisions(list);
        setRevision(list.length === 0 ? "" : String(list[list.length - 1]!.revision));
      } catch (error) {
        setError(errText(error));
      }
    })();
  }, [sourceId]);

  const currentRevision = revisions.find((entry) => String(entry.revision) === revision) ?? null;
  const opaque = currentRevision !== null && isOpaqueMediaType(currentRevision.mediaType);
  const effectiveKind: "WHOLE_SOURCE" | "TEXT_RANGE" | "JSON_POINTER" = opaque ? "WHOLE_SOURCE" : kind;

  const create = (): void => {
    if (currentRevision === null) {
      setError("select a source revision first");
      return;
    }
    let selector: EvidenceSelector;
    if (effectiveKind === "WHOLE_SOURCE") selector = { kind: "WHOLE_SOURCE" };
    else if (effectiveKind === "TEXT_RANGE") selector = { kind: "TEXT_RANGE", start: Number(start), end: Number(end) };
    else selector = { kind: "JSON_POINTER", pointer };
    void (async () => {
      setError(null);
      setResult(null);
      try {
        const item = await proofEvidenceCreate({
          sourceId: currentRevision.sourceId,
          revision: currentRevision.revision,
          contentDigest: currentRevision.contentDigest,
          selector,
        });
        setResult(item);
        props.onRecorded(item);
        props.onMessage(`evidence recorded: ${item.evidenceId}`);
      } catch (caught) {
        // A blocked/invalid selector is a typed server error, shown as text.
        setError(errText(caught));
      }
    })();
  };

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <Section title="Create an EvidenceItem (a selection over an immutable revision)">
        {props.sources.length === 0 ? (
          <Muted>Import a source first.</Muted>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end" }}>
              <label style={{ display: "grid", gap: 2 }}>
                <Muted>source</Muted>
                <SelectInput
                  ariaLabel="evidence source"
                  testId="evidence-source"
                  value={sourceId}
                  onChange={setSourceId}
                  options={props.sources.map((entry) => ({ value: entry.sourceId, label: entry.sourceId }))}
                />
              </label>
              <label style={{ display: "grid", gap: 2 }}>
                <Muted>revision</Muted>
                <SelectInput
                  ariaLabel="evidence revision"
                  testId="evidence-revision"
                  value={revision}
                  onChange={setRevision}
                  options={revisions.map((entry) => ({ value: String(entry.revision), label: `rev ${entry.revision} · ${entry.mediaType}` }))}
                />
              </label>
              <label style={{ display: "grid", gap: 2 }}>
                <Muted>selector</Muted>
                <SelectInput
                  ariaLabel="evidence selector kind"
                  testId="evidence-selector-kind"
                  value={effectiveKind}
                  onChange={(next) => setKind(next)}
                  options={
                    opaque
                      ? [{ value: "WHOLE_SOURCE" as const, label: "WHOLE_SOURCE (opaque source)" }]
                      : [
                          { value: "WHOLE_SOURCE" as const, label: "WHOLE_SOURCE" },
                          { value: "TEXT_RANGE" as const, label: "TEXT_RANGE" },
                          { value: "JSON_POINTER" as const, label: "JSON_POINTER" },
                        ]
                  }
                />
              </label>
              {effectiveKind === "TEXT_RANGE" ? (
                <>
                  <label style={{ display: "grid", gap: 2 }}>
                    <Muted>start</Muted>
                    <NumberInput ariaLabel="text range start" value={start} onChange={setStart} />
                  </label>
                  <label style={{ display: "grid", gap: 2 }}>
                    <Muted>end</Muted>
                    <NumberInput ariaLabel="text range end" value={end} onChange={setEnd} />
                  </label>
                </>
              ) : null}
              {effectiveKind === "JSON_POINTER" ? (
                <label style={{ display: "grid", gap: 2 }}>
                  <Muted>pointer</Muted>
                  <TextInput ariaLabel="json pointer" value={pointer} onChange={setPointer} testId="evidence-pointer" />
                </label>
              ) : null}
              <Btn primary onClick={create} testId="create-evidence">
                Create evidence
              </Btn>
            </div>
            <Muted>
              The selection digest is recomputed by the server from the resolved bytes. Opaque sources allow only WHOLE_SOURCE; no OCR.
            </Muted>
            {opaque ? (
              <Notice>This source is opaque ({currentRevision?.mediaType}). Only WHOLE_SOURCE evidence is permitted.</Notice>
            ) : null}
            {error !== null ? <ErrorText testId="evidence-error">{error}</ErrorText> : null}
            {result !== null ? (
              <div data-testid="evidence-result" style={{ background: COLORS.input, borderRadius: 6, padding: 8, display: "grid", gap: 4, fontSize: 12 }}>
                <div>
                  evidenceId <Mono testId="last-evidence-id">{result.evidenceId}</Mono>
                </div>
                <div>selector {selectorLabel(result.selector)}</div>
                <div>
                  selectionDigest <Mono>{result.selectionDigest}</Mono>
                </div>
                <div>
                  sourceRevision <Mono>{`${result.sourceRevision.sourceId}@${result.sourceRevision.revision}`}</Mono>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </Section>
    </div>
  );
}

/* ================================================================== *
 * Proof Assets
 * ================================================================== */

function standingColor(standing: ProofClaimStanding): string {
  if (standing === "SUPPORTED") return COLORS.ok;
  if (standing === "PARTIALLY_SUPPORTED") return COLORS.warn;
  if (standing === "CONTRADICTED") return COLORS.danger;
  return COLORS.muted;
}

function AssetsPanel(props: {
  readonly claims: readonly PublishedProofClaim[];
  readonly whyById: Readonly<Record<string, ProofWhy>>;
  readonly refreshClaims: () => Promise<void>;
  readonly onMessage: (text: string) => void;
}): React.ReactElement {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [cellId, setCellId] = useState("");
  const [reasoningClaimId, setReasoningClaimId] = useState("");
  const [prepared, setPrepared] = useState<ProofPreparePublicationResult | null>(null);
  const [published, setPublished] = useState<ProofPublicationResult | null>(null);
  const [pubError, setPubError] = useState<string | null>(null);
  const [reassessed, setReassessed] = useState<ClaimAssessmentRevision | null>(null);
  const [busy, setBusy] = useState(false);

  const reassess = (claimId: string): void => {
    void (async () => {
      setBusy(true);
      setReassessed(null);
      try {
        setReassessed(await proofReassess({ claimId }));
        await props.refreshClaims();
        props.onMessage(`assessment recorded for ${claimId}`);
      } catch (error) {
        props.onMessage(`reassess failed: ${errText(error)}`);
      } finally {
        setBusy(false);
      }
    })();
  };

  const preparePublication = (): void => {
    void (async () => {
      setPrepared(null);
      setPublished(null);
      setPubError(null);
      try {
        setPrepared(await proofPreparePublication({ cellId, claimId: reasoningClaimId }));
      } catch (error) {
        setPubError(errText(error));
      }
    })();
  };

  const evaluatePublication = (candidateId: string): void => {
    void (async () => {
      setPubError(null);
      try {
        setPublished(await proofEvaluatePublication({ candidateId }));
        await props.refreshClaims();
      } catch (error) {
        setPubError(errText(error));
      }
    })();
  };

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <Section title="Published proof assets">
        {props.claims.length === 0 ? (
          <Muted>No published proof claims. A claim becomes an asset only after a separate verification and publication admission.</Muted>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {props.claims.map((claim) => {
              const view = props.whyById[claim.claimRef.claimId];
              const open = expanded[claim.claimRef.claimId] === true;
              return (
                <div key={claim.claimRef.claimId} style={{ border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: 8, display: "grid", gap: 4 }}>
                  <div data-testid="asset-row" data-claim-id={claim.claimRef.claimId} style={{ display: "grid", gap: 4 }}>
                    <div style={{ color: COLORS.text, fontSize: 12 }}>
                      <b>{summarizeContent(claim.content)}</b>
                    </div>
                    <Muted>
                      claim <Mono>{claim.claimRef.claimId}</Mono> · type {claim.claimType.typeId}@{claim.claimType.version}
                    </Muted>
                    <div style={{ fontSize: 12 }}>
                      base standing:{" "}
                      <span style={{ color: standingColor(view?.baseStanding ?? "INCONCLUSIVE") }}>{view?.baseStanding ?? "—"}</span>{" "}
                      · effective standing:{" "}
                      <span data-testid="asset-standing" style={{ color: standingColor(view?.effectiveStanding ?? "INCONCLUSIVE") }}>
                        {view?.effectiveStanding ?? "—"}
                      </span>{" "}
                      · freshness: <span data-testid="asset-freshness">{view?.freshness ?? "—"}</span> · evidence count:{" "}
                      {view?.evidence.length ?? 0}
                    </div>
                    {view !== undefined && view.freshness !== "fresh" ? (
                      <div data-testid="asset-stale-explanation" style={{ color: COLORS.warn, fontSize: 12 }}>
                        {view.freshnessExplanation}
                      </div>
                    ) : null}
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <Btn onClick={() => setExpanded((current) => ({ ...current, [claim.claimRef.claimId]: !open }))} testId="asset-why">
                      Why?
                    </Btn>
                    <Btn onClick={() => reassess(claim.claimRef.claimId)} disabled={busy} testId="asset-reassess">
                      Reassess
                    </Btn>
                  </div>
                  {open && view !== undefined ? (
                    <div data-testid="asset-why-detail" style={{ display: "grid", gap: 6, paddingLeft: 10, fontSize: 12 }}>
                      <div>
                        verification policy: <Mono>{view.policyRef === null ? "none recorded" : `${view.policyRef.policyId}@${view.policyRef.version}`}</Mono>
                      </div>
                      <div>
                        verification standing: <Mono>{view.verification?.standing ?? "none"}</Mono>
                      </div>
                      <div>
                        <Muted>evidence items (exact selections):</Muted>
                        <ul style={{ margin: "4px 0 0 0", paddingLeft: 18 }}>
                          {view.evidence.map((item) => (
                            <li key={item.evidenceId}>
                              <Mono>{item.evidenceId}</Mono> · {selectorLabel(item.selector)} · source{" "}
                              <Mono>{`${item.sourceRevision.sourceId}@${item.sourceRevision.revision}`}</Mono>
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <Muted>source revisions:</Muted>
                        <ul style={{ margin: "4px 0 0 0", paddingLeft: 18 }}>
                          {view.sourceRevisions.map((ref) => (
                            <li key={`${ref.sourceId}@${ref.revision}`}>
                              <Mono>{`${ref.sourceId}@${ref.revision}`}</Mono> · digest {ref.contentDigest.slice(0, 12)}…
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        origin / provenance: <Mono>{JSON.stringify(view.provenance)}</Mono>
                      </div>
                      <div>
                        dependencies:{" "}
                        {view.dependencies.length === 0 ? (
                          <Muted>none</Muted>
                        ) : (
                          <ul style={{ margin: "4px 0 0 0", paddingLeft: 18 }}>
                            {view.dependencies.map((dependency) => (
                              <li key={dependency.claimId}>
                                <Mono>{dependency.claimId}</Mono> · effective {dependency.effectiveStanding}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                      <div>
                        freshness: <Mono>{view.freshness}</Mono> — {view.freshnessExplanation}
                      </div>
                      {view.assessments.length > 0 ? (
                        <div>
                          <Muted>append-only assessments:</Muted>
                          <ul style={{ margin: "4px 0 0 0", paddingLeft: 18 }}>
                            {view.assessments.map((assessment) => (
                              <li key={assessment.assessmentId}>
                                <Mono>{assessment.standing}</Mono> at {assessment.assessedAt} (policy{" "}
                                {assessment.policyRef.policyId}@{assessment.policyRef.version})
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </Section>

      <Section title="Publication (advanced; verification and admission are separate policy steps)">
        <Muted>
          Prepare materializes a candidate from an ACTIVE admitted reasoning claim (read-only). Evaluate runs verification and then a SEPARATE
          publication admission. Preparing never publishes; evaluating may not publish.
        </Muted>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end" }}>
          <label style={{ display: "grid", gap: 2 }}>
            <Muted>cellId</Muted>
            <TextInput ariaLabel="publication cell id" value={cellId} onChange={setCellId} />
          </label>
          <label style={{ display: "grid", gap: 2 }}>
            <Muted>reasoning claimId</Muted>
            <TextInput ariaLabel="publication claim id" value={reasoningClaimId} onChange={setReasoningClaimId} />
          </label>
          <Btn onClick={preparePublication} testId="prepare-publication">
            Prepare
          </Btn>
        </div>
        {prepared !== null ? (
          <div data-testid="prepare-result" style={{ fontSize: 12 }}>
            {prepared.status === "prepared" ? (
              <>
                <div>
                  candidate <Mono>{prepared.candidate.candidateId}</Mono> · origin {prepared.candidate.origin}
                </div>
                <div>
                  supporting evidence:{" "}
                  {prepared.candidate.supportingEvidence.length === 0 ? (
                    <Muted>none</Muted>
                  ) : (
                    <Mono>{prepared.candidate.supportingEvidence.map((entry) => entry.evidenceId).join(", ")}</Mono>
                  )}
                </div>
                <div style={{ marginTop: 4 }}>
                  <Btn onClick={() => evaluatePublication(prepared.candidate.candidateId)} testId="evaluate-publication">
                    Evaluate (verify + admission)
                  </Btn>
                </div>
              </>
            ) : (
              <ErrorText>blocked: {prepared.reason}</ErrorText>
            )}
          </div>
        ) : null}
        {published !== null ? (
          <div data-testid="publication-result" style={{ fontSize: 12 }}>
            decision <Mono>{published.decision}</Mono> · verification <Mono>{published.verification.standing}</Mono>
            {published.claimId === undefined ? null : (
              <>
                {" "}
                · claim <Mono>{published.claimId}</Mono>
              </>
            )}
          </div>
        ) : null}
        {pubError !== null ? <ErrorText testId="publication-error">{pubError}</ErrorText> : null}
        {reassessed !== null ? (
          <div data-testid="reassess-result" style={{ fontSize: 12 }}>
            assessment <Mono>{reassessed.assessmentId}</Mono> · standing <Mono>{reassessed.standing}</Mono>
          </div>
        ) : null}
      </Section>
    </div>
  );
}

/* ================================================================== *
 * Disclosure
 * ================================================================== */

function DisclosurePanel(props: {
  readonly claims: readonly PublishedProofClaim[];
  readonly whyById: Readonly<Record<string, ProofWhy>>;
  readonly refreshClaims: () => Promise<void>;
  readonly onMessage: (text: string) => void;
}): React.ReactElement {
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [purpose, setPurpose] = useState("");
  const [audienceLabel, setAudienceLabel] = useState("");
  const [preview, setPreview] = useState<DisclosurePreview | null>(null);
  const [outcome, setOutcome] = useState<DisclosureExportOutcome | null>(null);
  const [history, setHistory] = useState<readonly DisclosureExportReceipt[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refreshHistory = useCallback(async () => {
    try {
      setHistory(await disclosureHistory());
    } catch (caught) {
      props.onMessage(`disclosure history failed: ${errText(caught)}`);
    }
  }, [props]);

  useEffect(() => {
    void refreshHistory();
  }, [refreshHistory]);

  const requested = Object.keys(selected).filter((claimId) => selected[claimId] === true);

  const doPreview = (): void => {
    void (async () => {
      setBusy(true);
      setError(null);
      setPreview(null);
      setOutcome(null);
      try {
        setPreview(await disclosurePreview({ purpose, audienceLabel, requestedClaimIds: requested }));
      } catch (caught) {
        setError(errText(caught));
      } finally {
        setBusy(false);
      }
    })();
  };

  const doExport = (): void => {
    if (preview === null) return;
    void (async () => {
      setBusy(true);
      setError(null);
      try {
        const result = await disclosureApproveExport({ previewId: preview.previewId });
        setOutcome(result);
        await refreshHistory();
      } catch (caught) {
        setError(errText(caught));
      } finally {
        setBusy(false);
      }
    })();
  };

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <Section title="Select proof assets">
        {props.claims.length === 0 ? (
          <Muted>No published proof claims to select.</Muted>
        ) : (
          <div style={{ display: "grid", gap: 4 }}>
            {props.claims.map((claim) => {
              const view = props.whyById[claim.claimRef.claimId];
              return (
                <label key={claim.claimRef.claimId} style={{ display: "flex", gap: 6, alignItems: "flex-start", color: COLORS.text, fontSize: 12 }}>
                  <input
                    type="checkbox"
                    aria-label={`select claim ${claim.claimRef.claimId}`}
                    checked={selected[claim.claimRef.claimId] === true}
                    onChange={(event) => setSelected((current) => ({ ...current, [claim.claimRef.claimId]: event.target.checked }))}
                  />
                  <span>
                    <b>{summarizeContent(claim.content)}</b> · {claim.claimRef.claimId} · {view?.effectiveStanding ?? "—"}
                  </span>
                </label>
              );
            })}
          </div>
        )}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end" }}>
          <label style={{ display: "grid", gap: 2 }}>
            <Muted>purpose</Muted>
            <TextInput ariaLabel="disclosure purpose" value={purpose} onChange={setPurpose} testId="disclosure-purpose" />
          </label>
          <label style={{ display: "grid", gap: 2 }}>
            <Muted>audience label</Muted>
            <TextInput ariaLabel="disclosure audience" value={audienceLabel} onChange={setAudienceLabel} testId="disclosure-audience" />
          </label>
          <Btn primary onClick={doPreview} disabled={busy || requested.length === 0} testId="disclosure-preview">
            Preview
          </Btn>
        </div>
        <Muted>A preview only describes what would be disclosed. It grants no authority and writes no bytes.</Muted>
        {error !== null ? <ErrorText testId="disclosure-error">{error}</ErrorText> : null}
      </Section>

      {preview !== null ? (
        <Section title="Preview — exactly what would be exported" testId="disclosure-preview-result">
          <div style={{ display: "grid", gap: 6, fontSize: 12 }}>
            <div>
              preview <Mono>{preview.previewId}</Mono> · purpose {preview.purpose} · audience {preview.audienceLabel}
            </div>
            {preview.wholeSourceWarnings.map((warning) => (
              <Notice key={warning} testId="disclosure-whole-source-warning">
                {warning}
              </Notice>
            ))}
            {preview.warnings.map((warning) => (
              <Notice key={warning}>{warning}</Notice>
            ))}
            <div>
              claims included: <Mono>{preview.claims.map((claim) => claim.claimRef.claimId).join(", ") || "none"}</Mono>
            </div>
            {preview.excludedBySelection.length > 0 ? (
              <div>
                excluded by selection: <Mono>{preview.excludedBySelection.join(", ")}</Mono>
              </div>
            ) : null}
            <div>
              <Muted>files / excerpts (materialized by selector):</Muted>
              <ul style={{ margin: "4px 0 0 0", paddingLeft: 18 }}>
                {preview.materials.map((material) => (
                  <li key={material.evidenceId} data-testid="disclosure-material">
                    <Mono testId="disclosure-material-file">{material.fileName}</Mono> · {material.materializationKind} ·{" "}
                    {selectorLabel(material.selector)} · {material.mediaType} · digest {material.contentDigest.slice(0, 12)}…
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <Btn primary onClick={doExport} disabled={busy} testId="disclosure-export">
                Approve &amp; Export (separate explicit action)
              </Btn>
            </div>
          </div>
        </Section>
      ) : null}

      {outcome !== null ? (
        <Section title="Export outcome" testId="disclosure-outcome">
          {outcome.status === "exported" ? (
            <div style={{ fontSize: 12, display: "grid", gap: 4 }}>
              <div data-testid="disclosure-receipt">
                EXPORTED · bundle <Mono>{outcome.receipt.bundleDigest}</Mono>
              </div>
              <Muted>
                This is a LOCAL write acknowledgement only. It asserts no recipient receipt, no authentication, and no acceptance.
              </Muted>
            </div>
          ) : outcome.status === "blocked" ? (
            <ErrorText>blocked: {outcome.reason}</ErrorText>
          ) : (
            <Notice>capability required: {outcome.capability}</Notice>
          )}
        </Section>
      ) : null}

      <Section title="Export history">
        {history.length === 0 ? (
          <Muted>No exports recorded.</Muted>
        ) : (
          <div style={{ display: "grid", gap: 4 }}>
            {history.map((receipt) => (
              <div key={receipt.digest} data-testid="disclosure-history-row" style={{ fontSize: 12, border: `1px solid ${COLORS.border}`, borderRadius: 6, padding: 6 }}>
                <b>EXPORTED</b> · purpose {receipt.purpose} · audience {receipt.audienceLabel} · at {receipt.exportedAt} · bundle{" "}
                <Mono>{receipt.bundleDigest}</Mono> · exporter <Mono>{receipt.exporterId}</Mono>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

/* ================================================================== *
 * Analyze with Explore
 * ================================================================== */

function AnalyzePanel(props: {
  readonly evidence: readonly EvidenceItem[];
  readonly whyById: Readonly<Record<string, ProofWhy>>;
  readonly onMessage: (text: string) => void;
}): React.ReactElement {
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [objective, setObjective] = useState("");
  const [branchCount, setBranchCount] = useState("2");
  const [outcome, setOutcome] = useState<AnalyzeEvidenceOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const byId = new Map<string, EvidenceItem>();
  for (const item of props.evidence) byId.set(item.evidenceId, item);
  for (const view of Object.values(props.whyById)) for (const item of view.evidence) byId.set(item.evidenceId, item);
  const allEvidence = [...byId.values()].sort((a, b) => (a.evidenceId < b.evidenceId ? -1 : 1));
  const chosen = allEvidence.filter((item) => selected[item.evidenceId] === true);

  const run = (): void => {
    void (async () => {
      setBusy(true);
      setError(null);
      setOutcome(null);
      try {
        setOutcome(
          await proofAnalyze({
            evidenceIds: chosen.map((item) => item.evidenceId),
            objective,
            branchCount: Number(branchCount) >= 1 ? Number(branchCount) : undefined,
          }),
        );
      } catch (caught) {
        setError(errText(caught));
      } finally {
        setBusy(false);
      }
    })();
  };

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <Section title="Choose evidence to analyze">
        {allEvidence.length === 0 ? (
          <Muted>No evidence items are recorded yet.</Muted>
        ) : (
          <div style={{ display: "grid", gap: 4 }}>
            {allEvidence.map((item) => (
              <label key={item.evidenceId} style={{ display: "flex", gap: 6, alignItems: "flex-start", color: COLORS.text, fontSize: 12 }}>
                <input
                  type="checkbox"
                  aria-label={`analyze evidence ${item.evidenceId}`}
                  checked={selected[item.evidenceId] === true}
                  onChange={(event) => setSelected((current) => ({ ...current, [item.evidenceId]: event.target.checked }))}
                />
                <span>
                  <Mono>{item.evidenceId}</Mono> · {selectorLabel(item.selector)} · source{" "}
                  <Mono>{`${item.sourceRevision.sourceId}@${item.sourceRevision.revision}`}</Mono>
                </span>
              </label>
            ))}
          </div>
        )}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end" }}>
          <label style={{ display: "grid", gap: 2 }}>
            <Muted>objective</Muted>
            <TextInput ariaLabel="analyze objective" value={objective} onChange={setObjective} width={280} testId="analyze-objective" />
          </label>
          <label style={{ display: "grid", gap: 2 }}>
            <Muted>branches</Muted>
            <NumberInput ariaLabel="analyze branch count" value={branchCount} onChange={setBranchCount} />
          </label>
          <Btn primary onClick={run} disabled={busy || chosen.length === 0} testId="analyze-run">
            Analyze
          </Btn>
        </div>
      </Section>

      <Section title="Exposure — what would go to the model, before running" testId="analyze-exposure">
        {chosen.length === 0 ? (
          <Muted>Select evidence to see exactly which selections would be sent to the configured model or provider.</Muted>
        ) : (
          <div style={{ display: "grid", gap: 6, fontSize: 12 }}>
            {chosen.map((item) => (
              <div key={item.evidenceId} style={{ border: `1px solid ${COLORS.border}`, borderRadius: 6, padding: 6 }}>
                <Mono>{item.evidenceId}</Mono> · selector {selectorLabel(item.selector)} · source{" "}
                <Mono>{`${item.sourceRevision.sourceId}@${item.sourceRevision.revision}`}</Mono> · media{" "}
                <Mono>{item.sourceRevision.contentDigest.slice(0, 10)}…</Mono>
                <div>
                  <Muted>model / provider: unknown (this installation exposes no model binding for analysis)</Muted>
                </div>
              </div>
            ))}
          </div>
        )}
        <Muted>Analysis is a separate explicit action; it never publishes a proof claim and never approves disclosure.</Muted>
      </Section>

      {error !== null ? <ErrorText testId="analyze-error">{error}</ErrorText> : null}
      {outcome !== null ? (
        <Section title="Analysis outcome" testId="analyze-outcome">
          <div style={{ fontSize: 12, display: "grid", gap: 4 }}>
            <div>
              status <Mono>{outcome.status}</Mono>
              {outcome.cellId === undefined ? null : (
                <>
                  {" "}
                  · cell <Mono>{outcome.cellId}</Mono>
                </>
              )}
              {outcome.branchCount === undefined ? null : <> · branches {outcome.branchCount}</>}
            </div>
            {outcome.admittedClaimIds === undefined ? null : (
              <div>
                admitted claims: <Mono>{outcome.admittedClaimIds.join(", ") || "none"}</Mono>
              </div>
            )}
            {outcome.candidateDigests === undefined ? null : (
              <div>
                candidates: <Mono>{outcome.candidateDigests.map((digest) => digest.slice(0, 12)).join(", ") || "none"}</Mono>
              </div>
            )}
            {outcome.detail === undefined ? null : <Muted>{outcome.detail}</Muted>}
            <Muted>This outcome does not publish or approve anything.</Muted>
          </div>
        </Section>
      ) : null}
    </div>
  );
}

/* ================================================================== *
 * Main view
 * ================================================================== */

export function ProofVaultView({ onExit }: { readonly onExit: () => void }): React.ReactElement {
  const [tab, setTab] = useState<Tab>("sources");
  const [surfaces, setSurfaces] = useState<ProofSurfaceAvailability | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [sources, setSources] = useState<readonly ProofSourceSummary[]>([]);
  const [claims, setClaims] = useState<readonly PublishedProofClaim[]>([]);
  const [whyById, setWhyById] = useState<Record<string, ProofWhy>>({});
  const [evidence, setEvidence] = useState<readonly EvidenceItem[]>([]);

  const refreshSources = useCallback(async () => {
    try {
      setSources(await proofSources());
    } catch (error) {
      setMessage(`sources query failed: ${errText(error)}`);
    }
  }, []);

  const refreshClaims = useCallback(async () => {
    try {
      const list = await proofClaims();
      setClaims(list);
      const entries = await Promise.all(
        list.map(async (claim) => {
          try {
            return [claim.claimRef.claimId, await proofClaimWhy(claim.claimRef.claimId)] as const;
          } catch {
            return null;
          }
        }),
      );
      const next: Record<string, ProofWhy> = {};
      for (const entry of entries) if (entry !== null) next[entry[0]] = entry[1];
      setWhyById(next);
    } catch (error) {
      setMessage(`claims query failed: ${errText(error)}`);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        setSurfaces(await proofSurfaces());
      } catch (error) {
        setMessage(`surface query failed: ${errText(error)}`);
      }
    })();
    void refreshSources();
    void refreshClaims();
  }, [refreshSources, refreshClaims]);

  const addEvidence = useCallback((item: EvidenceItem) => {
    setEvidence((current) => (current.some((entry) => entry.evidenceId === item.evidenceId) ? current : [...current, item]));
  }, []);

  return (
    <div style={{ display: "grid", gridTemplateRows: "auto auto 1fr", gap: 10, height: "100vh", boxSizing: "border-box", padding: 12, background: COLORS.bg, color: COLORS.text }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <b>palimpsest Proof Vault</b>
        <Muted>local, evidence-governed proof assets; no truth, health, or legal assertion</Muted>
        <span style={{ flex: 1 }} />
        <Btn onClick={() => void refreshSources()} testId="proof-refresh-sources">
          Refresh sources
        </Btn>
        <Btn onClick={() => void refreshClaims()} testId="proof-refresh-claims">
          Refresh assets
        </Btn>
        <Btn onClick={onExit} testId="proof-exit">
          Back to Work
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
        {surfaces !== null && surfaces.proof !== true ? (
          <Notice data-testid="proof-surface-absent">
            The proof surface is not configured for this installation. No Proof Vault state is fabricated.
          </Notice>
        ) : (
          <>
            {tab === "sources" ? (
              <SourcePanel sources={sources} refreshSources={refreshSources} knownEvidence={evidence} whyById={whyById} onMessage={setMessage} />
            ) : null}
            {tab === "evidence" ? <EvidencePanel sources={sources} onRecorded={addEvidence} onMessage={setMessage} /> : null}
            {tab === "assets" ? (
              <AssetsPanel claims={claims} whyById={whyById} refreshClaims={refreshClaims} onMessage={setMessage} />
            ) : null}
            {tab === "disclosure" ? (
              <DisclosurePanel claims={claims} whyById={whyById} refreshClaims={refreshClaims} onMessage={setMessage} />
            ) : null}
            {tab === "analyze" ? <AnalyzePanel evidence={evidence} whyById={whyById} onMessage={setMessage} /> : null}
          </>
        )}
      </div>

      <div data-testid="proof-message" style={{ color: COLORS.muted, fontSize: 12, minHeight: 18 }}>
        {message}
      </div>
    </div>
  );
}
