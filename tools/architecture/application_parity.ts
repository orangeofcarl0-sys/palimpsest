/**
 * SR-1C §21 — the golden structural parity capture.
 *
 * ONE implementation, used by `scripts/audit/application-parity.mjs` (to capture the fixture
 * from the canonical baseline) and by `test/architecture/application_parity.test.ts` (to compare
 * the refactored tree against it). Capturing it twice would let the fixture and its checker drift.
 *
 * What it records, for TWO equivalent installations:
 *
 *   packagedInstallation  the packaged deployment path with the first-party collaboration bundle
 *                         (`launchDeployment` over a normal profile) — the shape every harness and
 *                         dogfood uses. No model, no network: composing only.
 *   minimalInstallation   `installPalimpsest` with only the required options, which is where the
 *                         ABSENCE behaviour is visible: a capability that was not configured is
 *                         not a stub, it is not a key.
 *
 * Per installation: the installed capability keys, the aggregate application surface keys, the
 * DSH tool catalogue with its action sets, and the faces present at runtime. All indices are
 * sorted, so the capture is deterministic; no timestamps, absolute paths or random ids are stored.
 */

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export interface ParityToolEntry {
  readonly name: string;
  readonly mode: string;
  readonly actions: readonly string[];
}

export interface ParityInstallation {
  readonly installedCapabilityKeys: readonly string[];
  readonly applicationSurfaceKeys: readonly string[];
  readonly dshTools: readonly ParityToolEntry[];
  readonly applicationFacesPresent: readonly string[];
}

export interface ParityCapture {
  readonly packagedInstallation: ParityInstallation;
  readonly minimalInstallation: ParityInstallation & {
    readonly present: readonly string[];
    readonly absent: readonly string[];
  };
  /** §11: the HTTP route contract, probed per method against each installation. */
  readonly packagedRoutes: readonly ParityRouteEntry[];
  readonly minimalRoutes: readonly ParityRouteEntry[];
  /** §13: readiness top-level keys, or null when the surface exposes none. */
  readonly readiness: readonly string[] | null;
  readonly lifecycle: ParityLifecycleObservation;
}

type AnyRecord = Record<string, unknown>;

const toolEntries = (tools: readonly { readonly name: string; readonly mode?: string; readonly parameters?: unknown }[]): ParityToolEntry[] =>
  tools
    .map((tool) => ({
      name: tool.name,
      mode: typeof tool.mode === "string" ? tool.mode : "unknown",
      actions: [
        ...(((tool.parameters as { readonly properties?: { readonly action?: { readonly enum?: readonly string[] } } })
          ?.properties?.action?.enum ?? []) as readonly string[]),
      ],
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

/**
 * Capture one installation. `distRoot` is the BUILT tree to load from, so the same code can
 * capture a baseline worktree and the branch's own build.
 */
export async function captureApplicationParity(distRoot: string): Promise<ParityCapture> {
  const dist = (relative: string): string => pathToFileURL(join(distRoot, "dist", "src", relative)).href;
  const { installPalimpsest } = (await import(dist("install.js"))) as {
    readonly installPalimpsest: (context: unknown, options: AnyRecord) => AnyRecord & { readonly dispose?: () => Promise<void> };
  };
  const { launchDeployment, parseDeploymentProfile } = (await import(dist("deployment/index.js"))) as {
    readonly launchDeployment: (profile: unknown) => { readonly installed: AnyRecord; readonly close: () => Promise<void> };
    readonly parseDeploymentProfile: (raw: unknown) => unknown;
  };
  const { handleApplicationRequest, applicationErrorStatus } = (await import(dist("application/http.js"))) as {
    readonly handleApplicationRequest: (input: AnyRecord) => Promise<AnyRecord | undefined>;
    readonly applicationErrorStatus: (error: unknown) => number;
  };
  const { defineApplicationTools } = (await import(dist("tools/application_tools.js"))) as {
    readonly defineApplicationTools: (application: unknown) => readonly { readonly name: string; readonly mode?: string; readonly parameters?: unknown }[];
  };

  const tmp = mkdtempSync(join(tmpdir(), "palimpsest-parity-"));
  const registered: unknown[] = [];
  const context = { tools: { register: (definition: unknown) => (registered.push(definition), () => {}) } };

  const installed = installPalimpsest(context, {
    projectId: "parity-project",
    repository: distRoot,
    databasePath: join(tmp, "orchestration.sqlite"),
    ordariumDatabasePath: join(tmp, "ordarium.sqlite"),
  });
  const installedKeys = Object.keys(installed).sort();
  const minimalApplication = installed.application as AnyRecord;
  const minimal: ParityInstallation & { present: readonly string[]; absent: readonly string[] } = {
    installedCapabilityKeys: installedKeys,
    applicationSurfaceKeys: Object.keys(minimalApplication).sort(),
    dshTools: toolEntries(defineApplicationTools(minimalApplication)),
    applicationFacesPresent: Object.keys(minimalApplication).filter((key) => minimalApplication[key] !== undefined),
    present: installedKeys.filter((key) => installed[key] !== undefined),
    absent: installedKeys.filter((key) => installed[key] === undefined),
  };
  await installed.dispose?.();

  const profile = parseDeploymentProfile({
    schemaVersion: 1,
    profileId: "parity-packaged",
    projectId: "parity-packaged-project",
    localPeer: "parity-peer",
    persistentPoint: "pp-parity",
    repository: distRoot,
    transport: { namespace: "parity", databasePath: join(tmp, "transport.sqlite") },
    databases: {
      orchestration: join(tmp, "p-orchestration.sqlite"),
      ordarium: join(tmp, "p-ordarium.sqlite"),
      coordination: join(tmp, "p-coordination.sqlite"),
      transportCursors: join(tmp, "p-cursors.sqlite"),
      attentionMarks: join(tmp, "p-attention.sqlite"),
    },
    directory: [{ peerId: "parity-peer", competenceTags: ["parity"] }],
    projectDirectory: [
      {
        projectId: "parity-packaged-project",
        displayName: "the parity project",
        aliases: ["parity"],
        peerId: "parity-peer",
        competenceTags: ["parity"],
      },
    ],
    reasoning: {},
    attention: { policyId: "parity-attention", cooldownMs: 0, activation: "none" },
  });
  const deployment = launchDeployment(profile);
  const packagedInstalled = deployment.installed as AnyRecord;
  const packagedApplication = packagedInstalled.application as AnyRecord;
  const packagedKeys = Object.keys(packagedInstalled).sort();
  const packaged: ParityInstallation = {
    installedCapabilityKeys: packagedKeys,
    applicationSurfaceKeys: Object.keys(packagedApplication).sort(),
    dshTools: toolEntries(defineApplicationTools(packagedApplication)),
    applicationFacesPresent: Object.keys(packagedApplication).filter((key) => packagedApplication[key] !== undefined),
  };
  await deployment.close();

  /* §11: the route contract, probed against the PACKAGED installation (faces present) and the */
  /* MINIMAL one (most faces absent), so surface-absent behaviour is recorded behaviourally.  */
  const packagedRoutes = await probeRoutes(handleApplicationRequest, applicationErrorStatus, packagedApplication);
  const minimalRoutes = await probeRoutes(handleApplicationRequest, applicationErrorStatus, installed.application);

  /* §13: deterministic readiness and lifecycle observations. */
  const readiness = (() => {
    const read = (deployment as { readonly collaborationReadiness?: () => unknown }).collaborationReadiness;
    if (typeof read !== "function") return null;
    const value = read();
    return value === null || typeof value !== "object" ? null : Object.keys(value as AnyRecord).sort();
  })();
  const lifecycle: ParityLifecycleObservation = {
    disposeIsIdempotent: await (async () => {
      const fresh = installPalimpsest(context, {
        projectId: "parity-lifecycle",
        repository: distRoot,
        databasePath: join(tmp, "l-orchestration.sqlite"),
        ordariumDatabasePath: join(tmp, "l-ordarium.sqlite"),
      });
      await fresh.dispose?.();
      try {
        await fresh.dispose?.();
        return true;
      } catch {
        return false;
      }
    })(),
  };

  return {
    packagedInstallation: packaged,
    minimalInstallation: minimal,
    packagedRoutes,
    minimalRoutes,
    readiness,
    lifecycle,
  };
}

export interface ParityBaselineFile {
  readonly note: string;
  readonly capture: { readonly packagedInstallation: ParityInstallation; readonly minimalInstallation: ParityInstallation };
}

export interface ParityDifference {
  readonly where: string;
  readonly detail: string;
}


/**
 * §11 — the HTTP route contract inventory, read off the CANONICAL adapter before any split.
 * Each path is probed with both methods; the recorded value is a coarse outcome class.
 */
const ROUTE_PATHS: readonly string[] = [
"/api/advisor/recommend",
  "/api/application/surfaces",
  "/api/attention",
  "/api/boundary/current",
  "/api/boundary/decide",
  "/api/boundary/membership",
  "/api/boundary/observation",
  "/api/boundary/pending",
  "/api/boundary/propose",
  "/api/boundary/submit_remote",
  "/api/boundary/workspace",
  "/api/campaign/view",
  "/api/collaboration/plan",
  "/api/collaboration/run",
  "/api/cross-project/acknowledge",
  "/api/cross-project/ask",
  "/api/cross-project/pending",
  "/api/cross-project/prepare",
  "/api/cross-project/projects",
  "/api/cross-project/receive",
  "/api/cross-project/respond",
  "/api/cross-project/status",
  "/api/dynamics/diagnose",
  "/api/dynamics/freshness",
  "/api/dynamics/impact",
  "/api/dynamics/observe",
  "/api/dynamics/propose",
  "/api/evolution/advance",
  "/api/evolution/advance_runtime",
  "/api/evolution/inspect",
  "/api/evolution/inspect_runtime",
  "/api/evolution/prepare",
  "/api/experiments",
  "/api/experiments/corrections",
  "/api/experiments/evaluations",
  "/api/experiments/experiment",
  "/api/experiments/run",
  "/api/experiments/runs",
  "/api/experiments/scenarios",
  "/api/experiments/variants",
  "/api/external-assets/commit-import",
  "/api/external-assets/commit-reference",
  "/api/external-assets/inspect",
  "/api/external-assets/prepare-import",
  "/api/external-assets/prepare-publication",
  "/api/external-assets/prepare-reference",
  "/api/external-assets/providers",
  "/api/external-assets/search",
  "/api/federation/commitment",
  "/api/federation/commitments",
  "/api/federation/contact",
  "/api/federation/inbox",
  "/api/federation/message",
  "/api/federation/remote_decision",
  "/api/federation/thread",
  "/api/manage/activity",
  "/api/manage/preview",
  "/api/manage/recommend",
  "/api/manage/request_mode_change",
  "/api/manage/request_work_mode_change",
  "/api/manage/run",
  "/api/manage/status",
  "/api/manage/step",
  "/api/memory/interventions",
  "/api/memory/similar_runs",
  "/api/memory/structural_history",
  "/api/monitor/preview",
  "/api/monitor/status",
  "/api/organization/institution",
  "/api/organization/institutions",
  "/api/organization/retirements",
  "/api/organization/view",
  "/api/project/assets",
  "/api/project/association",
  "/api/project/decision",
  "/api/project/history",
  "/api/project/journal",
  "/api/project/journal/resolve",
  "/api/project/open_loops",
  "/api/project/operating-history",
  "/api/project/operating-posture",
  "/api/project/opportunity/promote",
  "/api/project/reconcile_head",
  "/api/project/workspace",
  "/api/projection/collaboration",
  "/api/projection/organization",
  "/api/projection/reasoning",
  "/api/projection/runtime",
  "/api/projection/work",
  "/api/proof/analyze",
  "/api/proof/claims",
  "/api/proof/claims/inspect",
  "/api/proof/claims/reassess",
  "/api/proof/claims/why",
  "/api/proof/disclosure/approve_export",
  "/api/proof/disclosure/history",
  "/api/proof/disclosure/preview",
  "/api/proof/evidence",
  "/api/proof/publication/evaluate",
  "/api/proof/publication/prepare",
  "/api/proof/sources",
  "/api/proof/sources/import",
  "/api/proof/sources/inspect",
  "/api/proof/sources/read_explicit",
  "/api/proof/sources/revisions",
  "/api/reasoning/branch",
  "/api/reasoning/brief",
  "/api/reasoning/candidate",
  "/api/reasoning/evaluate",
  "/api/reasoning/frontier",
  "/api/reasoning/graph",
  "/api/reasoning/invalidate",
  "/api/reasoning/view",
  "/api/recipes",
  "/api/recipes/compile",
  "/api/recipes/execute",
  "/api/recipes/readiness",
  "/api/recipes/recipe",
  "/api/runtime/holon",
  "/api/runtime/scope",
  "/api/runtime/scopes",
  "/api/verification/history",
  "/api/verification/status",
  "/api/verification/verify_current_head",
  "/api/",
  "/api/evolution/",
  "/api/manage/activity/",
];

export interface ParityRouteEntry {
  readonly path: string;
  readonly get: string;
  readonly post: string;
}

async function probeRoutes(handle: (input: AnyRecord) => Promise<AnyRecord | undefined>, statusOf: (error: unknown) => number, application: unknown): Promise<ParityRouteEntry[]> {
  const probe = async (method: string, pathname: string): Promise<string> => {
    try {
      const result = await handle({ application, method, pathname, query: new URLSearchParams(), body: {} });
      return result === undefined ? "unrouted" : `ok:${String(result.status)}`;
    } catch (error) {
      return `error:${String(statusOf(error))}`;
    }
  };
  const out: ParityRouteEntry[] = [];
  for (const pathname of ROUTE_PATHS) {
    out.push({ path: pathname, get: await probe("GET", pathname), post: await probe("POST", pathname) });
  }
  return out;
}

/**
 * §13 — lifecycle observations. Every field here is COMPUTED; there are no placeholders, because
 * a golden fixture carrying an assumed value would pass for the wrong reason. Resource-closure
 * ORDER (which resource closes, in what sequence, and which caller-supplied store is retained) is
 * pinned separately and exhaustively by `test/composition/lifecycle_ownership.test.ts`.
 */
export interface ParityLifecycleObservation {
  /** A second `dispose()` is a no-op rather than an error. */
  readonly disposeIsIdempotent: boolean;
}
/** Compare a live capture against the recorded baseline: every key and every action set. */
export function compareParity(baseline: ParityCapture, live: ParityCapture): readonly ParityDifference[] {
  const differences: ParityDifference[] = [];
  const compareList = (where: string, expected: readonly string[], actual: readonly string[]): void => {
    const missing = expected.filter((entry) => !actual.includes(entry));
    if (missing.length > 0) differences.push({ where, detail: `missing: ${missing.join(", ")}` });
  };
  const compareInstallation = (label: string, expected: ParityInstallation, actual: ParityInstallation): void => {
    compareList(`${label}.installedCapabilityKeys`, expected.installedCapabilityKeys, actual.installedCapabilityKeys);
    compareList(`${label}.applicationSurfaceKeys`, expected.applicationSurfaceKeys, actual.applicationSurfaceKeys);
    compareList(`${label}.applicationFacesPresent`, expected.applicationFacesPresent, actual.applicationFacesPresent);
    compareList(
      `${label}.dshTools`,
      expected.dshTools.map((tool) => tool.name),
      actual.dshTools.map((tool) => tool.name),
    );
    for (const tool of expected.dshTools) {
      const found = actual.dshTools.find((candidate) => candidate.name === tool.name);
      if (found === undefined) continue;
      if (found.mode !== tool.mode) differences.push({ where: `${label}.${tool.name}.mode`, detail: `${tool.mode} → ${found.mode}` });
      compareList(`${label}.${tool.name}.actions`, tool.actions, found.actions);
    }
  };
  compareInstallation("packagedInstallation", baseline.packagedInstallation, live.packagedInstallation);
  compareInstallation("minimalInstallation", baseline.minimalInstallation, live.minimalInstallation);

  /* §11/§37: the HTTP route contract, path by path and method by method. */
  const routeKey = (entry: ParityRouteEntry): string => entry.path;
  const baselineRoutes = new Map(baseline.packagedRoutes.map((entry) => [routeKey(entry), entry]));
  const minimalRoutes = new Map(baseline.minimalRoutes.map((entry) => [routeKey(entry), entry]));
  const compareRoutes = (label: string, expected: Map<string, ParityRouteEntry>, actual: readonly ParityRouteEntry[]): void => {
    const actualByPath = new Map(actual.map((entry) => [routeKey(entry), entry]));
    for (const [path, entry] of expected) {
      const found = actualByPath.get(path);
      if (found === undefined) {
        differences.push({ where: `${label}.routes`, detail: `missing route ${path}` });
        continue;
      }
      if (found.get !== entry.get) differences.push({ where: `${label}.${path}.GET`, detail: `${entry.get} → ${found.get}` });
      if (found.post !== entry.post) differences.push({ where: `${label}.${path}.POST`, detail: `${entry.post} → ${found.post}` });
    }
  };
  compareRoutes("packagedRoutes", baselineRoutes, live.packagedRoutes);
  compareRoutes("minimalRoutes", minimalRoutes, live.minimalRoutes);

  /* §13: readiness keys and lifecycle observations. */
  if (baseline.readiness !== null) {
    compareList("readiness", baseline.readiness, live.readiness ?? []);
  }
  if (baseline.lifecycle.disposeIsIdempotent !== live.lifecycle.disposeIsIdempotent) {
    differences.push({ where: "lifecycle.disposeIsIdempotent", detail: `${String(baseline.lifecycle.disposeIsIdempotent)} → ${String(live.lifecycle.disposeIsIdempotent)}` });
  }
  return differences;
}
