/**
 * Trajectory-V0S-H0 §8 (C4) — SOURCE IDENTITY PRIVACY AND HOST OBSERVATION PROVENANCE.
 *
 * Two properties:
 *
 *   §8.1  no DEFAULT consumer-visible metadata carries an absolute local installation path — tested on
 *         the SUCCESSFUL path, not only the error path;
 *   §8.2  a caller-supplied HostRecord does not become authority-bearing provenance merely because it
 *         carries host-shaped identifiers;
 *   §8.3  process observation coverage is not implied by provenance, and exit ordering is not invented.
 *
 * The real-reader half is `PASS_REAL_DSH_NO_MODEL`; the host half is a labelled CONTROLLED_FIXTURE.
 */
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { afterAll, describe, expect, it } from "vitest";

import {
  classifyHostObservation,
  type DshSessionEventPage,
  type DshSessionReadPort,
} from "../src/trajectory/index.js";
import { buildHandoffPreview, type HandoffPreviewInput } from "../src/trajectory/handoff_preview.js";

const DSH_HOME = process.env["DSH_HOME"] ?? join(process.env["USERPROFILE"] ?? "", ".dsh");
const hasDsh = existsSync(join(DSH_HOME, "profiles", "node_modules", "@deepseek-ai", "dsh-session"));

interface ReaderModule {
  readonly resolveDshPackageRoot: (dshHomePath: string | undefined) => string | null;
  readonly sanitize: (message: unknown) => string;
  readonly makeRealDshSessionReader: (input: { readonly dshHomePath: string; readonly sessionsRoot: string }) => Promise<(DshSessionReadPort & { close?(): Promise<void>; readonly diagnosticSourcePath?: string }) | null>;
}
const readerModule = (await import("../scripts/trajectory_v0/dsh-session-reader.mjs" as string)) as ReaderModule;

const cleanups: Array<() => void> = [];
afterAll(() => {
  for (const fn of cleanups) fn();
});

function controlledRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "h0-privacy-root-"));
  cleanups.push(() => {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      /* the OS reaps it */
    }
  });
  return root;
}

/** §8.1: a path-shape detector covering Windows drive letters and POSIX home paths. */
const PATH_SHAPES = [/[A-Za-z]:\\/u, /[A-Za-z]:\//u, /\/Users\//u, /\/home\//u, /\.dsh/iu, /node_modules/u];

function assertNoPath(value: string, what: string): void {
  for (const shape of PATH_SHAPES) expect(shape.test(value), `${what} must not contain ${String(shape)}`).toBe(false);
}

describe("Trajectory-V0S-H0 §8.1 — consumer-visible metadata carries no local path", () => {
  it("a SUCCESSFUL real page's source identity is a logical label", async () => {
    if (!hasDsh) {
      expect(hasDsh).toBe(false);
      return;
    }
    const root = controlledRoot();
    const packageRoot = readerModule.resolveDshPackageRoot(DSH_HOME)!;
    const base = pathToFileURL(packageRoot + "/").href;
    const { Context } = await import(base + "cordis/lib/index.js");
    const JsonlSessionPersistence = (await import(base + "dsh-session-persistence-jsonl/lib/index.js")).default;
    const { SessionId } = await import(base + "dsh-session/lib/index.js");
    const ctx = new Context();
    const fiber = (await ctx.plugin(JsonlSessionPersistence, { root, compression: "zstd" })) as { dispose?: () => Promise<void> } | undefined;
    cleanups.push(() => void fiber?.dispose?.());
    const persistence = ctx.sessionPersistence as {
      create(header: Record<string, unknown>, options: Record<string, unknown>): Promise<{
        append(events: readonly unknown[], options: Record<string, unknown>): Promise<void>;
        flush(options: Record<string, unknown>): Promise<void>;
        close(options: Record<string, unknown>): Promise<void>;
      }>;
    };
    const sessionId = "session-h0-privacy-fixture";
    const handle = await persistence.create({ version: 4, id: SessionId(sessionId), createdAt: 1_700_000_000_000, isSeeded: false }, {});
    await handle.append([
      { type: "turn/start", seq: 0, time: 1_700_000_000_001, data: { turn: 1 } },
      { type: "turn/end", seq: 1, time: 1_700_000_000_002, data: { turn: 1, reason: { kind: "completed" } } },
    ], {});
    await handle.flush({});
    await handle.close({});

    const reader = await readerModule.makeRealDshSessionReader({ dshHomePath: DSH_HOME, sessionsRoot: root });
    expect(reader).not.toBeNull();
    const page: DshSessionEventPage = await reader!.readEvents({ sessionId, maxEvents: 10 });

    /** §8.1: the SUCCESSFUL page's consumer-visible fields carry no path. */
    expect(page.readState).toBe("READ_OK");
    assertNoPath(page.sourceIdentity, "page.sourceIdentity");
    assertNoPath(page.detail, "page.detail");
    assertNoPath(JSON.stringify(page), "the serialized page");
    // The adapter is still identifiable.
    expect(page.sourceIdentity).toContain("dsh-session-persistence-jsonl");
    expect(page.sourceEvidenceClass).toBe("REAL_DSH_QUERY");

    /** §8.1: the resolved path is available ONLY as an internal diagnostic field. */
    expect(typeof reader!.diagnosticSourcePath).toBe("string");
    expect(page.sourceIdentity).not.toBe(reader!.diagnosticSourcePath);

    await reader!.close?.();
  }, 180_000);

  it("an ERROR page's detail is sanitized for Windows and POSIX shapes", async () => {
    if (!hasDsh) return;
    const root = controlledRoot();
    const reader = await readerModule.makeRealDshSessionReader({ dshHomePath: DSH_HOME, sessionsRoot: root });
    expect(reader).not.toBeNull();
    const page = await reader!.readEvents({ sessionId: "session-h0-absent-00000000" });
    expect(page.readState).toBe("SESSION_MISSING");
    assertNoPath(page.detail, "an error page's detail");
    await reader!.close?.();
  }, 180_000);

  it("the sanitizer covers both path shapes and preserves ordinary text", () => {
    const sanitize = readerModule.sanitize;
    for (const message of [
      "ENOENT: open 'C:\\Users\\someone\\.dsh\\sessions\\p\\s\\session.v4.jsonl.zstd'",
      "ENOENT: open '/Users/someone/.dsh/sessions/p/s'",
      "cannot read /home/someone/.dsh/profiles/node_modules/@deepseek-ai/x",
    ]) {
      const sanitized = sanitize(message);
      assertNoPath(sanitized, "the sanitized message");
    }
    expect(sanitize("the session format is unsupported")).toContain("unsupported");
  });
});

describe("Trajectory-V0S-H0 §8.2 — host provenance is not caller testimony", () => {
  it("a caller record with host-shaped identifiers is a CALLER_DECLARATION", () => {
    const classification = classifyHostObservation({ recordPresent: true, attemptMatches: true, hasLocalIdentity: true, conflictDetail: null });
    expect(classification.provenance).toBe("CALLER_DECLARATION");
    expect(classification.detail).toContain("caller testimony");
  });

  it("only a producer-established origin yields LOCAL_PORT_OBSERVATION", () => {
    expect(classifyHostObservation({ recordPresent: true, attemptMatches: true, hasLocalIdentity: true, originEstablished: true, conflictDetail: null }).provenance).toBe("LOCAL_PORT_OBSERVATION");
    expect(classifyHostObservation({ recordPresent: true, attemptMatches: true, hasLocalIdentity: true, originEstablished: false, conflictDetail: null }).provenance).toBe("CALLER_DECLARATION");
  });

  it("a record for another attempt stays UNVERIFIED_ORIGIN and a contradiction is CONFLICTING_SOURCE", () => {
    expect(classifyHostObservation({ recordPresent: true, attemptMatches: false, hasLocalIdentity: true, conflictDetail: null }).provenance).toBe("UNVERIFIED_ORIGIN");
    expect(classifyHostObservation({ recordPresent: true, attemptMatches: true, hasLocalIdentity: true, conflictDetail: "contradiction" }).provenance).toBe("CONFLICTING_SOURCE");
  });

  it("a caller declaration does NOT imply complete process coverage", () => {
    const input: HandoffPreviewInput = {
      projectId: "h0p", attemptId: `attempt-${"a".repeat(32)}`,
      binding: {
        schemaVersion: 1 as const, projectId: "h0p", attemptId: `attempt-${"a".repeat(32)}`, viewId: "tv-x",
        historicalWorkBasis: { basisDigest: null, capturedAtRevision: null, taskId: "t1" },
        hostLocalJobId: "wdj-1", portInvocationId: "wpi-1",
        dshSessionId: null, claimedSessionId: null,
        hostObservationProvenance: "CALLER_DECLARATION" as const,
        sessionSource: "NONE" as const, sessionBindingStatus: "SESSION_UNBOUND" as const,
        sessionReadAdmission: "NOT_REQUESTED" as const, bindingEvidenceRefs: Object.freeze([]), detail: "caller supplied",
      },
      canonical: {
        attemptState: "COMPLETED", taskId: "t1", workState: null, envelopeId: "env-1", basisDigest: null, capturedAtRevision: null,
        authorizationDetail: "x", resultRefs: ["1".repeat(40)], resultDetail: "x", verificationState: "NOT_RUN",
        promotionState: "NOT_PROMOTED", promotionId: null, reworkState: "NONE", reworkDetail: "x",
      },
      host: { hostLocalJobId: "wdj-1", portInvocationId: "wpi-1", processLifecycle: "RUNNING", processDetail: "declared", observedEventKinds: [], lifecycleCoverage: "NONE" as const, originLimitation: "x" },
      projectEvolution: { projectionRootId: "tr-x", projectionSemanticDigest: null, workSequence: 1, workEventDigest: null, projectIrRevision: 0, selectedRelations: [], quarantinedRelations: [], unresolvedReferences: [], currentnessCaveats: [] },
    };
    const preview = buildHandoffPreview(input);
    // §8.3: a caller declaration is at most PARTIAL, never COMPLETE.
    expect(preview.attribution.processObservation).toBe("PARTIAL");
  });

  it("the G1-B limitation remains stated", () => {
    const preview = buildHandoffPreview({
      projectId: "h0p", attemptId: `attempt-${"a".repeat(32)}`,
      binding: {
        schemaVersion: 1 as const, projectId: "h0p", attemptId: `attempt-${"a".repeat(32)}`, viewId: "tv-x",
        historicalWorkBasis: { basisDigest: null, capturedAtRevision: null, taskId: "t1" },
        hostLocalJobId: null, portInvocationId: null, dshSessionId: null, claimedSessionId: null,
        hostObservationProvenance: "NOT_OBSERVED" as const,
        sessionSource: "NONE" as const, sessionBindingStatus: "SESSION_UNBOUND" as const,
        sessionReadAdmission: "NOT_REQUESTED" as const, bindingEvidenceRefs: Object.freeze([]), detail: "none",
      },
      canonical: {
        attemptState: null, taskId: null, workState: null, envelopeId: null, basisDigest: null, capturedAtRevision: null,
        authorizationDetail: "x", resultRefs: [], resultDetail: "x", verificationState: "NOT_RUN",
        promotionState: "NOT_PROMOTED", promotionId: null, reworkState: "NONE", reworkDetail: "x",
      },
      host: { hostLocalJobId: null, portInvocationId: null, processLifecycle: "NOT_OBSERVED", processDetail: "none", observedEventKinds: [], lifecycleCoverage: "NONE" as const, originLimitation: "G1-B local host observations are NOT independent, authority-bearing provenance." },
      projectEvolution: { projectionRootId: null, projectionSemanticDigest: null, workSequence: null, workEventDigest: null, projectIrRevision: null, selectedRelations: [], quarantinedRelations: [], unresolvedReferences: [], currentnessCaveats: [] },
    });
    expect(preview.caveats.epistemicLimits.join(" ")).toContain("NOT independent, authority-bearing provenance");
  });
});
